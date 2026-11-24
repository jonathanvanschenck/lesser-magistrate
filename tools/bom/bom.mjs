#!/usr/bin/env node
// bom: build each set's bill of materials from the KiCad schematics and components/parts.json, and write the
// tables in components/README.md.
//
// Board parts and their quantities come from the schematics (MPN field, via kicad-cli); descriptions, DigiKey part
// numbers, alternates and off-board items (cables) come from the catalogue. Each table sits between
// <!-- BEGIN bom:<set> --> and <!-- END bom:<set> --> markers; everything else in the README is left alone.
//
//   node tools/bom/bom.mjs           # rewrite the tables
//   node tools/bom/bom.mjs --check   # exit 1 if they're out of date (for CI)
//
// No npm dependencies; needs Node >= 20 and kicad-cli on the PATH.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CATALOGUE = join(ROOT, "components", "parts.json");
const README = join(ROOT, "components", "README.md");
const BOARDS = { lm: "LM", lmm: "LMM", trigger: "Trigger" };

function fail(msg) {
    process.stderr.write(`bom: ${msg}\n`);
    process.exit(1);
}

// ---------------------------------------------------------------- inputs

/** Parse kicad-cli's BOM CSV (every field quoted). */
export function parseCsv(text) {
    const rows = text.trim().split(/\r?\n/).map(l => [...l.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replaceAll('""', '"')));
    const [head, ...body] = rows;
    return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

/** MPN -> quantity on one board, from its schematic. */
export function boardParts(board) {
    const dir = mkdtempSync(join(tmpdir(), "bom-"));
    try {
        const out = join(dir, "bom.csv");
        execFileSync("kicad-cli", ["sch", "export", "bom", join(ROOT, "kicad", board, `${board}.kicad_sch`),
            "--fields", "Reference,MPN,${QUANTITY}", "--labels", "Refs,MPN,Qty", "--group-by", "MPN",
            "--exclude-dnp", "-o", out], { stdio: ["ignore", "ignore", "pipe"] });
        const parts = {};
        for (const r of parseCsv(readFileSync(out, "utf8"))) {
            if (!r.MPN) fail(`${board}: ${r.Refs} has no MPN field`);
            parts[r.MPN] = Number(r.Qty);
        }
        return parts;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------- BOM

/**
 * Per-set BOMs: { set: { title, rows: [{ part, qty, perBoard: {board: n} }] } }, in catalogue order.
 * Fails if a schematic part is missing from the catalogue, or a catalogue part is on no board and has no 'per'.
 */
export function buildSets(catalogue = JSON.parse(readFileSync(CATALOGUE, "utf8")), onBoards = null) {
    onBoards ??= Object.fromEntries(Object.keys(BOARDS).map(b => [b, boardParts(b)]));
    const known = new Set(catalogue.parts.map(p => p.mpn));
    const errors = [];
    for (const [b, parts] of Object.entries(onBoards)) {
        for (const mpn of Object.keys(parts)) {
            if (!known.has(mpn)) errors.push(`${mpn} is on the ${BOARDS[b]} schematic but not in components/parts.json`);
        }
    }
    const sets = {};
    for (const [id, set] of Object.entries(catalogue.sets)) {
        const rows = [];
        for (const part of catalogue.parts) {
            const perBoard = {};
            for (const b of Object.keys(BOARDS)) {
                const n = (onBoards[b][part.mpn] || 0) + (part.per?.[b] || 0);
                if (n) perBoard[b] = n;
            }
            if (!Object.keys(perBoard).length) {
                errors.push(`${part.mpn} is in components/parts.json but on no schematic and has no "per"`);
                continue;
            }
            const qty = Object.entries(perBoard).reduce((s, [b, n]) => s + n * set[b], 0);
            rows.push({ part, qty, perBoard });
        }
        sets[id] = { title: set.title, counts: set, rows };
    }
    if (errors.length) fail([...new Set(errors)].join("\n"));
    return sets;
}

// ---------------------------------------------------------------- README

const cell = s => String(s).replaceAll("|", "\\|");

/** "LM" for LM-only parts, else e.g. "3 LM, 1 per LMM (3 total)". */
export function qtyDescription(perBoard, counts) {
    const boards = Object.keys(perBoard);
    if (boards.length === 1 && counts[boards[0]] === 1) return BOARDS[boards[0]];
    return boards.map(b => counts[b] === 1 ? `${perBoard[b]} ${BOARDS[b]}`
        : `${perBoard[b]} per ${BOARDS[b]} (${perBoard[b] * counts[b]} total)`).join(", ");
}

export function table(set) {
    const lines = [
        "| # | Part Number | Qty | Qty description | Description | Order Link | Alternates |",
        "|---|-------------|-----|-----------------|-------------|------------|------------|",
    ];
    set.rows.forEach(({ part, qty, perBoard }, i) => {
        const mpn = cell(part.mpn) + (part.note ? ` *(${cell(part.note)})*` : "");
        const alts = part.alternates?.length
            ? part.alternates.map(a => `[${cell(a.mpn)}](${a.url})` + (a.note ? ` (${cell(a.note)})` : "")).join(", ")
            : "—";
        lines.push(`| ${i + 1} | ${mpn} | ${qty} | ${qtyDescription(perBoard, set.counts)} | ${cell(part.description)} | `
            + `[${cell(part.digikey)}](${part.url}) | ${alts} |`);
    });
    return lines.join("\n");
}

export function render(readme, sets) {
    let out = readme;
    for (const [id, set] of Object.entries(sets)) {
        const re = new RegExp(`(<!-- BEGIN bom:${id}[^>]*-->\\n)[\\s\\S]*?(\\n<!-- END bom:${id} -->)`);
        if (!re.test(out)) fail(`components/README.md has no <!-- BEGIN bom:${id} --> ... <!-- END bom:${id} --> block`);
        out = out.replace(re, (_, a, b) => a + table(set) + b);
    }
    return out;
}

function main(argv) {
    const check = argv.includes("--check");
    const readme = readFileSync(README, "utf8");
    const updated = render(readme, buildSets());
    if (check) {
        if (updated !== readme) fail("components/README.md is out of date: run node tools/bom/bom.mjs");
        console.log("components/README.md is up to date");
    } else if (updated !== readme) {
        writeFileSync(README, updated);
        console.log("components/README.md updated");
    } else {
        console.log("components/README.md already up to date");
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

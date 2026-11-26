#!/usr/bin/env node
// release: cut a new version of one board.
//
// Each board's version is the VERSION text variable in its KiCad project (kicad/<board>/<board>.kicad_pro). The
// silkscreen and the title blocks read it as ${VERSION}. Boards are versioned separately: a release of one board
// doesn't touch the others.
//
//   node tools/release/release.mjs status                  # each board's version, tag and fab files
//   node tools/release/release.mjs bump <board> <level>    # level: major, minor, patch, or an exact x.y.z
//   node tools/release/release.mjs check                   # exit 1 if a VERSION isn't x.y.z (for CI)
//
// `bump` needs a clean working tree. It:
//   1. sets VERSION in the board's project file
//   2. runs every design check (tools/kicad/check.sh); a failure undoes the bump
//   3. exports the board's fab package to gerber/<Name>Gerber.zip (gerbers, drill file, IPC-D-356 netlist and a
//      README.txt naming the board and version; every file name carries the version, e.g. lm-1.1.0-F_Cu.gtl) and its
//      schematic to graphics/<board>-schematic.pdf, and updates the version table in gerber/README.md
//   4. commits those files as "<board>: version <x.y.z>", and tags the commit <board>@<x.y.z> (an annotated tag)
// It never pushes: push the commit, then the tag (the script prints how).
//
// No npm dependencies; needs Node >= 20, git, kicad-cli and python3 (for the zip) on the PATH.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The boards that release from this repo. The tag is <id>@<version>, so a board added later (e.g. a separate
// design-for-manufacture LM) needs an id of its own, such as "lm-dfm", for its tags not to collide with these.
export const BOARDS = {
    lm: { name: "LM", dir: "kicad/lm", zip: "gerber/LMGerber.zip" },
    lmm: { name: "LMM", dir: "kicad/lmm", zip: "gerber/LMMGerber.zip" },
    trigger: { name: "Trigger", dir: "kicad/trigger", zip: "gerber/TriggerGerber.zip" },
};
const GERBER_LAYERS = "F.Cu,B.Cu,F.Mask,B.Mask,F.Silkscreen,B.Silkscreen,Edge.Cuts";
const GERBER_README = "gerber/README.md";
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

class ReleaseError extends Error {}
const fail = msg => { throw new ReleaseError(msg); };

// ---------------------------------------------------------------- versions

/** The next version: `level` is major, minor, patch, or an exact x.y.z. */
export function nextVersion(current, level) {
    const m = SEMVER.exec(current) ?? fail(`the current version '${current}' isn't x.y.z`);
    const [maj, min, pat] = m.slice(1).map(Number);
    if (level === "major") return `${maj + 1}.0.0`;
    if (level === "minor") return `${maj}.${min + 1}.0`;
    if (level === "patch") return `${maj}.${min}.${pat + 1}`;
    if (SEMVER.test(level)) return level;
    return fail(`'${level}' isn't major, minor, patch or a version like 1.2.3`);
}

/** <0, 0 or >0, like a sort comparator. */
export function compareVersions(a, b) {
    const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
}

const projectFile = id => join(ROOT, BOARDS[id].dir, `${id}.kicad_pro`);

/** The VERSION text variable in a project file's text. */
export function readVersion(projectText) {
    return JSON.parse(projectText).text_variables?.VERSION;
}

/** The project file's text with VERSION replaced; the rest of the file is left byte for byte. */
export function writeVersion(projectText, version) {
    const re = /("text_variables":\s*\{[^}]*"VERSION":\s*")[^"]*(")/;
    if (!re.test(projectText)) fail("the project file has no VERSION text variable");
    return projectText.replace(re, `$1${version}$2`);
}

// ---------------------------------------------------------------- gerber/README.md

/** The version-table row for one board. */
export function tableRow(id, version, madeWith) {
    const { name, zip } = BOARDS[id];
    const file = zip.replace(/^gerber\//, "");
    return `| ${name} | [${file}](./${file}) | ${version} | ${madeWith} |`;
}

/** gerber/README.md's text with one board's row of the version table replaced. */
export function updateTable(readme, id, version, madeWith) {
    const block = /(<!-- BEGIN releases[^>]*-->\n)([\s\S]*?)(\n<!-- END releases -->)/;
    const m = block.exec(readme) ?? fail(`${GERBER_README} has no <!-- BEGIN releases --> ... <!-- END releases --> block`);
    const rows = m[2].split("\n");
    const i = rows.findIndex(r => r.startsWith(`| ${BOARDS[id].name} |`));
    if (i < 0) fail(`${GERBER_README}'s version table has no row for ${BOARDS[id].name}`);
    rows[i] = tableRow(id, version, madeWith);
    return readme.replace(block, (_, a, __, c) => a + rows.join("\n") + c);
}

// ---------------------------------------------------------------- fab zip contents

const LAYER_NAMES = {
    F_Cu: "top copper", B_Cu: "bottom copper", F_Mask: "top solder mask", B_Mask: "bottom solder mask",
    F_Silkscreen: "top silkscreen", B_Silkscreen: "bottom silkscreen", Edge_Cuts: "board outline",
};

/** A file's name inside the zip: kicad-cli's "<id>-F_Cu.gtl" or "<id>.drl", with the version after the board id. */
export function zipName(id, version, file) {
    if (!file.startsWith(id)) fail(`unexpected export file '${file}'`);
    return `${id}-${version}${file.slice(id.length)}`;
}

/** What a file in the zip is, for README.txt. */
export function describe(name) {
    if (name.endsWith(".drl")) return "drill file (Excellon; plated and non-plated holes)";
    if (name.endsWith(".d356")) return "IPC-D-356 netlist, for the board maker's electrical test";
    const layer = Object.keys(LAYER_NAMES).find(l => name.includes(`-${l}.`));
    return layer ? `${LAYER_NAMES[layer]} (Gerber)` : "";
}

/** README.txt for the zip: which board and version it is, and what each file holds. */
export function zipReadme(id, version, names) {
    const w = Math.max(...names.map(n => n.length));
    return [
        `Lesser Magistrate ${BOARDS[id].name} board, version ${version}`,
        "",
        `Released from the KiCad project ${BOARDS[id].dir}/ at git tag ${id}@${version}:`,
        "https://github.com/jonathanvanschenck/lesser-magistrate",
        "",
        "Ordering: 2 layers, 1.6 mm FR4, lead-free HASL finish; board maker's defaults for everything else.",
        "",
        "Files:",
        ...names.map(n => `  ${n.padEnd(w)}  ${describe(n)}`),
        "",
    ].join("\n");
}

// ---------------------------------------------------------------- git and tools

function sh(cmd, args, opts = {}) {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}
const git = (...args) => sh("git", args).trim();
const tagExists = tag => { try { git("rev-parse", "-q", "--verify", `refs/tags/${tag}`); return true; } catch { return false; } };

/** Gerbers, drill file, IPC-D-356 netlist and README.txt for one board, zipped to its gerber/ file. */
function exportFab(id, version) {
    const { dir } = BOARDS[id];
    const pcb = join(ROOT, dir, `${id}.kicad_pcb`);
    const tmp = mkdtempSync(join(tmpdir(), "release-"));
    try {
        sh("kicad-cli", ["pcb", "export", "gerbers", "-l", GERBER_LAYERS, "-o", `${tmp}/`, pcb]);
        sh("kicad-cli", ["pcb", "export", "drill", "-o", `${tmp}/`, pcb]);
        sh("kicad-cli", ["pcb", "export", "ipcd356", "-o", join(tmp, `${id}.d356`), pcb]);
        const files = readdirSync(tmp).filter(f => !f.endsWith(".gbrjob")).sort();
        const names = files.map(f => zipName(id, version, f));
        files.forEach((f, i) => renameSync(join(tmp, f), join(tmp, names[i])));
        writeFileSync(join(tmp, "README.txt"), zipReadme(id, version, names));
        names.unshift("README.txt");
        // Fixed timestamps and order, so the zip only changes when its files do.
        sh("python3", ["-c", [
            "import sys, zipfile",
            "out, src, names = sys.argv[1], sys.argv[2], sys.argv[3:]",
            "with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:",
            "    for n in names:",
            "        i = zipfile.ZipInfo(n, (1980, 1, 1, 0, 0, 0)); i.compress_type = zipfile.ZIP_DEFLATED; i.external_attr = 0o644 << 16",
            "        z.writestr(i, open(f'{src}/{n}', 'rb').read())",
        ].join("\n"), join(ROOT, BOARDS[id].zip), tmp, ...names]);
        return names;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

function exportSchematic(id) {
    const out = `graphics/${id}-schematic.pdf`;
    sh("kicad-cli", ["sch", "export", "pdf", "-o", join(ROOT, out), join(ROOT, BOARDS[id].dir, `${id}.kicad_sch`)]);
    return out;
}

// ---------------------------------------------------------------- commands

function status() {
    const rows = Object.keys(BOARDS).map(id => {
        const v = readVersion(readFileSync(projectFile(id), "utf8"));
        const tag = `${id}@${v}`;
        const zipped = sh("python3", ["-c", "import sys,zipfile;print(','.join(zipfile.ZipFile(sys.argv[1]).namelist()))",
            join(ROOT, BOARDS[id].zip)]);
        const made = /DipTrace/.test(zipped) ? "DipTrace" : "KiCad";
        return [BOARDS[id].name, v, tagExists(tag) ? tag : `${tag} (not tagged)`, `${BOARDS[id].zip} (${made})`];
    });
    const head = ["Board", "VERSION", "Tag", "Fab files"];
    const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
    for (const r of [head, ...rows]) console.log(r.map((c, i) => c.padEnd(w[i])).join("  ").trimEnd());
}

function check() {
    const bad = Object.keys(BOARDS).filter(id => !SEMVER.test(readVersion(readFileSync(projectFile(id), "utf8")) ?? ""));
    if (bad.length) fail(`VERSION isn't x.y.z in: ${bad.map(id => `${BOARDS[id].dir}/${id}.kicad_pro`).join(", ")}`);
    console.log("board versions ok");
}

function bump(id, level) {
    if (!BOARDS[id]) fail(`unknown board '${id}': one of ${Object.keys(BOARDS).join(", ")}`);
    if (!level) fail("usage: release.mjs bump <board> <major|minor|patch|x.y.z>");
    if (git("status", "--porcelain")) fail("the working tree has changes: commit or stash them first");

    const pro = projectFile(id);
    const before = readFileSync(pro, "utf8");
    const current = readVersion(before);
    const version = nextVersion(current, level);
    if (compareVersions(version, current) <= 0) fail(`${version} isn't newer than the current ${current}`);
    const tag = `${id}@${version}`;
    if (tagExists(tag)) fail(`${tag} is already tagged (run git fetch --tags if it's only on the remote)`);
    const branch = git("rev-parse", "--abbrev-ref", "HEAD");

    console.log(`${BOARDS[id].name}: ${current} -> ${version}`);
    writeFileSync(pro, writeVersion(before, version));
    const touched = [`${BOARDS[id].dir}/${id}.kicad_pro`];
    try {
        console.log("running the design checks ...");
        try {
            execFileSync(join(ROOT, "tools/kicad/check.sh"), [], { cwd: ROOT, stdio: "inherit" });
        } catch {
            fail("the design checks failed");
        }
        console.log(`exporting ${BOARDS[id].zip} ...`);
        exportFab(id, version);
        touched.push(BOARDS[id].zip);
        touched.push(exportSchematic(id));
        const readme = join(ROOT, GERBER_README);
        writeFileSync(readme, updateTable(readFileSync(readme, "utf8"), id, version, `KiCad (tag \`${tag}\`)`));
        touched.push(GERBER_README);

        git("add", "--", ...touched);
        git("commit", "-q", "-m", `${id}: version ${version}`, "--", ...touched);
    } catch (e) {
        // Put back everything the bump wrote; the commit didn't happen.
        try { git("restore", "--staged", "--worktree", "--", ...touched.filter(f => !f.startsWith("graphics/"))); } catch {}
        for (const f of touched.filter(f => f.startsWith("graphics/"))) {
            try { git("restore", "--staged", "--worktree", "--", f); } catch { rmSync(join(ROOT, f), { force: true }); }
        }
        throw e;
    }
    git("tag", "-a", tag, "-m", `${BOARDS[id].name} ${version}`);

    console.log(`\ncommitted "${id}: version ${version}" and tagged ${tag}. Nothing is pushed yet:`);
    console.log(`  git push origin ${branch}`);
    console.log(`  git push origin ${tag}`);
    if (branch !== "master") {
        console.log(`\nYou're on ${branch}, not master. Merge it with a merge commit (not squash or rebase), or the tag`
            + " will point at a commit that isn't on master.");
    }
}

function main([cmd, ...args]) {
    try {
        if (cmd === "status") status();
        else if (cmd === "check") check();
        else if (cmd === "bump") bump(...args);
        else {
            process.stderr.write("usage: release.mjs status | check | bump <board> <major|minor|patch|x.y.z>\n");
            process.exit(2);
        }
    } catch (e) {
        if (!(e instanceof ReleaseError)) throw e;
        process.stderr.write(`release: ${e.message}\n`);
        process.exit(1);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

#!/usr/bin/env node
// dk: command-line access to the DigiKey Product Information API (v4).
//
// Credentials come from <repo>/.env (see template.env). No npm dependencies;
// needs Node >= 20.12 for process.loadEnvFile and global fetch.
//
// Run `node tools/digikey/dk.mjs --help` for usage.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const ENV_FILE = join(ROOT, ".env");
const CACHE_DIR = join(HERE, ".cache");
const TOKEN_FILE = join(CACHE_DIR, "token.json");

const USAGE = `Usage: dk <command> [options]

Commands:
  search <keywords...>    Keyword search (MPN, DigiKey #, or free text)
  part <part-number>      Details for one part: status, stock, price breaks,
                          parameters, datasheet. Accepts DigiKey # or MPN.
  subs <part-number>      DigiKey's suggested substitutes for a part
  datasheet <part-number> Download the part's datasheet PDF

Options:
  -l, --limit <n>     search: max results (1-50, default 10)
      --offset <n>    search: skip the first n results
      --in-stock      search: only parts in stock
      --sort <field>  search: price | stock (default: DigiKey relevance)
      --max-moq <n>   search: hide parts whose minimum order is above n
                      (e.g. --max-moq 20 drops bulk/reel-only listings).
                      Unit/MOQ columns are always the cheapest way to buy
                      a few, not DigiKey's reel or bulk headline price.
  -q, --qty <n>       part: show the unit/extended price at this quantity
      --dir <path>    datasheet: output directory (default <repo>/datasheets)
      --json          Print a trimmed JSON summary instead of text
      --raw           Print the full, unmodified API response
  -h, --help          Show this help

Credentials: DIGIKEY_CLIENT_ID / DIGIKEY_CLIENT_SECRET in ${ENV_FILE}
`;

// ---------------------------------------------------------------- config

function loadConfig() {
    if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
    const env = process.env;
    return {
        clientId: env.DIGIKEY_CLIENT_ID || "",
        clientSecret: env.DIGIKEY_CLIENT_SECRET || "",
        base: env.DIGIKEY_SANDBOX === "1" ? "https://sandbox-api.digikey.com" : "https://api.digikey.com",
        site: env.DIGIKEY_LOCALE_SITE || "US",
        language: env.DIGIKEY_LOCALE_LANGUAGE || "en",
        currency: env.DIGIKEY_LOCALE_CURRENCY || "USD",
        customerId: env.DIGIKEY_CUSTOMER_ID || "",
    };
}

function die(msg) {
    process.stderr.write(`dk: ${msg}\n`);
    process.exit(1);
}

// ---------------------------------------------------------------- HTTP

async function getToken(cfg, force = false) {
    if (!force) {
        try {
            const t = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
            if (t.base === cfg.base && t.clientId === cfg.clientId && t.expiresAt > Date.now() + 30_000) {
                return t.accessToken;
            }
        } catch { /* no usable cached token */ }
    }
    const resp = await fetch(`${cfg.base}/v1/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            grant_type: "client_credentials",
        }),
    });
    const text = await resp.text();
    if (!resp.ok) die(`token request failed (HTTP ${resp.status}): ${text}`);
    const j = JSON.parse(text);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(TOKEN_FILE, JSON.stringify({
        base: cfg.base,
        clientId: cfg.clientId,
        accessToken: j.access_token,
        expiresAt: Date.now() + (Number(j.expires_in) || 600) * 1000,
    }), { mode: 0o600 });
    return j.access_token;
}

async function api(cfg, method, path, body, retried = false) {
    const token = await getToken(cfg, retried);
    const headers = {
        Authorization: `Bearer ${token}`,
        "X-DIGIKEY-Client-Id": cfg.clientId,
        "X-DIGIKEY-Locale-Site": cfg.site,
        "X-DIGIKEY-Locale-Language": cfg.language,
        "X-DIGIKEY-Locale-Currency": cfg.currency,
        Accept: "application/json",
    };
    if (cfg.customerId) headers["X-DIGIKEY-Customer-Id"] = cfg.customerId;
    if (body) headers["Content-Type"] = "application/json";

    const resp = await fetch(cfg.base + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (resp.status === 401 && !retried) {
        rmSync(TOKEN_FILE, { force: true });
        return api(cfg, method, path, body, true);
    }
    const remaining = resp.headers.get("x-ratelimit-remaining");
    if (remaining !== null && Number(remaining) < 50) {
        process.stderr.write(`dk: warning: only ${remaining} DigiKey API calls left today\n`);
    }
    const text = await resp.text();
    if (resp.status === 404) return null;
    if (!resp.ok) die(`${method} ${path} failed (HTTP ${resp.status}): ${text}`);
    return text ? JSON.parse(text) : null;
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------- shaping

export function normUrl(u) {
    if (!u) return null;
    return u.startsWith("//") ? `https:${u}` : u;
}

function leafCategory(c) {
    while (c?.ChildCategories?.length) c = c.ChildCategories[0];
    return c?.Name ?? null;
}

/** Unit price for `qty` from a variation's price breaks, or null if below the first break. */
export function priceAt(variation, qty) {
    const breaks = [...(variation.StandardPricing || [])].sort((a, b) => a.BreakQuantity - b.BreakQuantity);
    let hit = null;
    for (const b of breaks) if (b.BreakQuantity <= qty) hit = b;
    return hit ? hit.UnitPrice : null;
}

/**
 * The cheapest way to buy a small quantity: the packaging with the smallest
 * minimum order (at most `maxMoq`), ties broken by price. Returns
 * { dkpn, moq, unit } where unit is that packaging's first price break, or
 * null if no packaging qualifies. DigiKey's headline UnitPrice is often a
 * reel or bulk-marketplace price, so search results use this instead.
 */
export function entryPrice(p, maxMoq = Infinity) {
    let best = null;
    for (const v of p.ProductVariations || []) {
        // A packaging with no price breaks isn't orderable (e.g. a dropped obsolete listing).
        const first = [...(v.StandardPricing || [])].sort((a, b) => a.BreakQuantity - b.BreakQuantity)[0];
        if (!first) continue;
        const moq = v.MinimumOrderQuantity || first.BreakQuantity || 1;
        if (moq > maxMoq) continue;
        const unit = first.UnitPrice;
        if (!best || moq < best.moq || (moq === best.moq && unit < best.unit)) {
            best = { dkpn: v.DigiKeyProductNumber, moq, unit };
        }
    }
    return best;
}

/**
 * URLs to try for a datasheet PDF, best first. DigiKey often links a vendor
 * redirect or product page rather than the PDF itself.
 */
export function datasheetCandidates(url) {
    url = normUrl(url);
    if (!url) return [];
    const out = [];
    let u;
    try { u = new URL(url); } catch { return [url]; }
    // Unwrap redirectors such as ti.com/general/docs/suppproductinfo.tsp?gotoUrl=...
    const goto = u.searchParams.get("gotoUrl");
    if (goto) {
        try { u = new URL(goto); } catch { /* keep the original */ }
    }
    // TI: /lit/gpn/<part> is the product folder page; /lit/ds/symlink/<part>.pdf is the datasheet.
    const ti = /(^|\.)ti\.com$/.test(u.hostname) && u.pathname.match(/^\/lit\/(?:gpn|ds)\/(?:symlink\/)?([^/.]+)/i);
    if (ti) out.push(`https://www.ti.com/lit/ds/symlink/${ti[1].toLowerCase()}.pdf`);
    out.push(u.href);
    if (u.href !== url) out.push(url);
    return [...new Set(out)];
}

export function summarize(p, { full = true } = {}) {
    const s = {
        mpn: p.ManufacturerProductNumber,
        manufacturer: p.Manufacturer?.Name ?? null,
        description: p.Description?.ProductDescription ?? null,
        status: p.ProductStatus?.Status ?? null,
        stock: p.QuantityAvailable ?? null,
        unitPrice: p.UnitPrice ?? null,
        url: p.ProductUrl ?? null,
        datasheet: normUrl(p.DatasheetUrl),
        variations: (p.ProductVariations || []).map(v => ({
            dkpn: v.DigiKeyProductNumber,
            packaging: v.PackageType?.Name ?? null,
            stock: v.QuantityAvailableforPackageType ?? null,
            moq: v.MinimumOrderQuantity ?? null,
            marketplace: v.MarketPlace ?? null,
            ...(full ? { pricing: (v.StandardPricing || []).map(b => [b.BreakQuantity, b.UnitPrice]) } : {}),
        })),
    };
    if (full) {
        Object.assign(s, {
            detailedDescription: p.Description?.DetailedDescription ?? null,
            category: leafCategory(p.Category),
            series: p.Series?.Name ?? null,
            leadWeeks: p.ManufacturerLeadWeeks ?? null,
            rohs: p.Classifications?.RohsStatus ?? null,
            parameters: Object.fromEntries((p.Parameters || []).map(x => [x.ParameterText, x.ValueText])),
        });
    }
    return s;
}

// ---------------------------------------------------------------- text output

const num = n => (n == null ? "?" : Number(n).toLocaleString("en-US"));
const money = x => (x == null ? "?" : `$${Number(x) >= 1 ? Number(x).toFixed(2) : Number(x).toFixed(4)}`);
const cell = (s, w) => {
    s = String(s ?? "");
    return (s.length > w ? s.slice(0, w - 1) + "…" : s).padEnd(w);
};

export function formatSearch(products, total, keywords, maxMoq = Infinity) {
    const lines = [`${products.length} of ${num(total)} results for "${keywords}"`, ""];
    lines.push(`${cell("MPN", 22)} ${cell("Manufacturer", 18)} ${cell("Stock", 10)} ${cell("Unit", 9)} ${cell("MOQ", 7)} ${cell("Status", 12)} Description`);
    for (const p of products) {
        const s = summarize(p, { full: false });
        const e = entryPrice(p, maxMoq);
        lines.push(`${cell(s.mpn, 22)} ${cell(s.manufacturer, 18)} ${cell(num(s.stock), 10)} ${cell(money(e?.unit), 9)} ${cell(num(e?.moq), 7)} ${cell(s.status, 12)} ${s.description ?? ""}`);
        const dk = s.variations.map(v => `${v.dkpn} (${v.packaging}, MOQ ${num(v.moq)}${v.marketplace ? ", marketplace" : ""})`).join(", ");
        if (dk) lines.push(`    ${dk}`);
    }
    return lines.join("\n");
}

export function formatPart(p, qty) {
    const s = summarize(p);
    const L = [];
    L.push(`${s.mpn} | ${s.manufacturer}`);
    L.push(s.detailedDescription || s.description || "");
    L.push(`Status: ${s.status}   Stock: ${num(s.stock)}   Lead time: ${s.leadWeeks ?? "?"} wk   RoHS: ${s.rohs ?? "?"}`);
    if (s.category) L.push(`Category: ${s.category}${s.series && s.series !== "-" ? `   Series: ${s.series}` : ""}`);
    if (s.datasheet) L.push(`Datasheet: ${s.datasheet}`);
    if (s.url) L.push(`DigiKey: ${s.url}`);

    L.push("", "Packaging:");
    for (const v of p.ProductVariations || []) {
        L.push(`  ${v.DigiKeyProductNumber}  ${v.PackageType?.Name ?? ""}  stock ${num(v.QuantityAvailableforPackageType)}  MOQ ${num(v.MinimumOrderQuantity)}`);
        const breaks = (v.StandardPricing || []).map(b => `${num(b.BreakQuantity)}: ${money(b.UnitPrice)}`);
        if (breaks.length) L.push(`    ${breaks.join("  ")}`);
        if (qty) {
            const u = priceAt(v, qty);
            L.push(u == null
                ? `    @ qty ${num(qty)}: below minimum order quantity`
                : `    @ qty ${num(qty)}: ${money(u)} ea = $${(u * qty).toFixed(2)}`);
        }
    }

    const params = Object.entries(s.parameters);
    if (params.length) {
        L.push("", "Parameters:");
        for (const [k, v] of params) L.push(`  ${k}: ${v}`);
    }
    return L.join("\n");
}

export function formatSubs(subs, part) {
    if (!subs.length) return `No substitutes listed for ${part}.`;
    const L = [`${subs.length} substitute(s) for ${part}`, ""];
    L.push(`${cell("Type", 16)} ${cell("MPN", 22)} ${cell("Manufacturer", 18)} ${cell("DigiKey #", 22)} ${cell("Stock", 10)} Description`);
    for (const x of subs) {
        L.push(`${cell(x.SubstituteType, 16)} ${cell(x.ManufacturerProductNumber, 22)} ${cell(x.Manufacturer?.Name, 18)} ${cell(x.DigiKeyProductNumber, 22)} ${cell(num(x.QuantityAvailable), 10)} ${x.Description ?? ""}`);
    }
    return L.join("\n");
}

// ---------------------------------------------------------------- commands

async function getProduct(cfg, part) {
    const r = await api(cfg, "GET", `/products/v4/search/${enc(part)}/productdetails`);
    if (r?.Product) return r;

    // productdetails 404s when an MPN is shared by several manufacturers
    // (e.g. CD74AC04E from TI and from Harris). Resolve via keyword search.
    const s = await api(cfg, "POST", "/products/v4/search/keyword", { Keywords: part, Limit: 10, Offset: 0 });
    const want = part.toUpperCase();
    const matches = [...(s?.ExactMatches || []), ...(s?.Products || [])]
        .filter((p, i, all) => all.findIndex(q => q.Manufacturer?.Name === p.Manufacturer?.Name && q.ManufacturerProductNumber === p.ManufacturerProductNumber) === i)
        .filter(p => p.ManufacturerProductNumber?.toUpperCase() === want
            || (p.ProductVariations || []).some(v => v.DigiKeyProductNumber?.toUpperCase() === want));
    if (!matches.length) die(`no DigiKey product found for "${part}"`);
    if (matches.length > 1) {
        const list = matches.map(p => `  ${p.Manufacturer?.Name} (${p.ProductStatus?.Status}): ${(p.ProductVariations || []).map(v => v.DigiKeyProductNumber).join(", ")}`);
        die(`"${part}" is made by several manufacturers; use a DigiKey # instead:\n${list.join("\n")}`);
    }
    const dkpn = matches[0].ProductVariations?.[0]?.DigiKeyProductNumber;
    const d = dkpn && await api(cfg, "GET", `/products/v4/search/${enc(dkpn)}/productdetails`);
    if (!d?.Product) die(`no DigiKey product found for "${part}"`);
    return d;
}

async function cmdSearch(cfg, args, opts) {
    if (!args.length) die("search needs keywords");
    const keywords = args.join(" ");
    const limit = Math.min(Math.max(Number(opts.limit ?? 10) || 10, 1), 50);
    let maxMoq = Infinity;
    if (opts["max-moq"] != null) {
        maxMoq = Number(opts["max-moq"]);
        if (!(maxMoq > 0)) die("--max-moq must be a positive number");
    }
    const filtering = maxMoq !== Infinity;
    // With --max-moq, results are filtered locally, so fetch full pages until
    // `limit` parts survive (at most MAX_PAGES requests).
    const MAX_PAGES = 4;
    const body = { Keywords: keywords, Limit: filtering ? 50 : limit, Offset: Number(opts.offset ?? 0) || 0 };
    if (opts["in-stock"]) body.FilterOptionsRequest = { SearchOptions: ["InStock"] };
    if (opts.sort) {
        const field = { price: "Price", stock: "QuantityAvailable" }[opts.sort];
        if (!field) die(`--sort must be price or stock`);
        body.SortOptions = { Field: field, SortOrder: opts.sort === "price" ? "Ascending" : "Descending" };
    }
    // Exact matches first, then the rest, without duplicates.
    const seen = new Set();
    const products = [];
    let total = null, hidden = 0, scanned = 0;
    for (let page = 0; page < (filtering ? MAX_PAGES : 1); page++) {
        const r = await api(cfg, "POST", "/products/v4/search/keyword", body);
        if (opts.raw) return console.log(JSON.stringify(r, null, 2));
        total = r?.ProductsCount ?? total;
        const batch = [...(page === 0 ? r?.ExactMatches || [] : []), ...(r?.Products || [])];
        for (const p of batch) {
            const key = `${p.Manufacturer?.Name}|${p.ManufacturerProductNumber}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (products.length >= limit) break;
            if (filtering && !entryPrice(p, maxMoq)) { hidden++; continue; }
            products.push(p);
        }
        scanned += (r?.Products || []).length;
        body.Offset += body.Limit;
        if (products.length >= limit || !(r?.Products || []).length || (total != null && body.Offset >= total)) break;
    }
    if (opts.json) {
        return console.log(JSON.stringify({
            total,
            hiddenByMaxMoq: hidden,
            products: products.map(p => ({ ...summarize(p, { full: false }), entry: entryPrice(p, maxMoq) })),
        }, null, 2));
    }
    console.log(formatSearch(products, total, keywords, maxMoq));
    if (hidden) console.log(`\n(skipped ${hidden} listing(s) with minimum order above ${maxMoq} among the first ${scanned} results)`);
}

async function cmdPart(cfg, args, opts) {
    if (args.length !== 1) die("part needs exactly one part number");
    const r = await getProduct(cfg, args[0]);
    if (opts.raw) return console.log(JSON.stringify(r, null, 2));
    const qty = opts.qty ? Number(opts.qty) : null;
    if (opts.qty && !(qty > 0)) die("--qty must be a positive number");
    if (opts.json) {
        const s = summarize(r.Product);
        if (qty) {
            s.qty = qty;
            for (const [i, v] of (r.Product.ProductVariations || []).entries()) {
                const u = priceAt(v, qty);
                s.variations[i].priceAtQty = u == null ? null : { unit: u, extended: +(u * qty).toFixed(2) };
            }
        }
        return console.log(JSON.stringify(s, null, 2));
    }
    console.log(formatPart(r.Product, qty));
}

async function cmdSubs(cfg, args, opts) {
    if (args.length !== 1) die("subs needs exactly one part number");
    const r = await api(cfg, "GET", `/products/v4/search/${enc(args[0])}/substitutions`);
    if (opts.raw) return console.log(JSON.stringify(r, null, 2));
    const subs = r?.ProductSubstitutes || [];
    if (opts.json) {
        return console.log(JSON.stringify(subs.map(x => ({
            type: x.SubstituteType ?? null,
            mpn: x.ManufacturerProductNumber ?? null,
            manufacturer: x.Manufacturer?.Name ?? null,
            dkpn: x.DigiKeyProductNumber ?? null,
            stock: x.QuantityAvailable ?? null,
            description: x.Description ?? null,
            url: x.ProductUrl ?? null,
        })), null, 2));
    }
    console.log(formatSubs(subs, args[0]));
}

async function cmdDatasheet(cfg, args, opts) {
    if (args.length !== 1) die("datasheet needs exactly one part number");
    const { Product: p } = await getProduct(cfg, args[0]);
    const url = normUrl(p.DatasheetUrl);
    if (!url) die(`DigiKey lists no datasheet for ${p.ManufacturerProductNumber}`);

    let resp = null;
    const tried = [];
    for (const candidate of datasheetCandidates(url)) {
        try {
            const r = await fetch(candidate, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (dk datasheet fetcher)" } });
            const type = r.headers.get("content-type") || "";
            if (r.ok && type.includes("pdf")) { resp = r; break; }
            tried.push(`  ${candidate}  (HTTP ${r.status}, ${type || "no content-type"})`);
        } catch (e) {
            tried.push(`  ${candidate}  (${e.cause?.code || e.message})`);
        }
    }
    if (!resp) die(`could not download a PDF; open the datasheet in a browser instead. Tried:\n${tried.join("\n")}`);
    const dir = resolve(opts.dir || join(ROOT, "datasheets"));
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${p.ManufacturerProductNumber.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`);
    writeFileSync(file, Buffer.from(await resp.arrayBuffer()));
    console.log(file);
}

// ---------------------------------------------------------------- main

async function main(argv) {
    let parsed;
    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                limit: { type: "string", short: "l" },
                offset: { type: "string" },
                "in-stock": { type: "boolean" },
                sort: { type: "string" },
                "max-moq": { type: "string" },
                qty: { type: "string", short: "q" },
                dir: { type: "string" },
                json: { type: "boolean" },
                raw: { type: "boolean" },
                help: { type: "boolean", short: "h" },
            },
        });
    } catch (e) {
        die(`${e.message}\n\n${USAGE}`);
    }
    const { values: opts, positionals } = parsed;
    const [cmd, ...args] = positionals;
    if (opts.help || !cmd) return console.log(USAGE);

    const commands = { search: cmdSearch, part: cmdPart, subs: cmdSubs, datasheet: cmdDatasheet };
    if (!commands[cmd]) die(`unknown command "${cmd}"\n\n${USAGE}`);

    const cfg = loadConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
        die(`DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET must be set. Copy template.env to .env at the repo root and fill them in (see DEVELOPMENT.md, "DigiKey CLI").`);
    }
    await commands[cmd](cfg, args, opts);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).catch(e => die(e.stack || String(e)));
}

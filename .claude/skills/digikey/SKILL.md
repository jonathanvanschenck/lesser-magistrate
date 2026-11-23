---
name: digikey
description: Search DigiKey for electronic components and look up stock, price at a quantity, lifecycle status, parameters, substitutes, or download a datasheet, using this repo's DigiKey API CLI (tools/digikey/dk.mjs). Use when choosing, replacing or checking a component, checking BOM availability or cost, or when a part's datasheet is needed.
---

# DigiKey lookups

Use the repo's CLI, which calls the official DigiKey Product Information API v4.
Don't scrape digikey.com and don't guess stock or prices from memory: both change daily.

```bash
node tools/digikey/dk.mjs search <keywords...> [--limit N] [--in-stock] [--sort price|stock] [--max-moq N] [--json]
node tools/digikey/dk.mjs part <DigiKey# or MPN> [--qty N] [--json]
node tools/digikey/dk.mjs subs <DigiKey# or MPN> [--json]
node tools/digikey/dk.mjs datasheet <DigiKey# or MPN> [--dir path]
```

- `--json` gives a trimmed, stable summary; use it when you need to process results.
  `--raw` dumps the full API response; use it only when debugging a missing field.
- Search's Unit/MOQ columns show the cheapest way to buy a few (often cut tape or tube),
  not DigiKey's reel/bulk headline price. Add `--max-moq <build qty>` to hide listings you
  can't buy in small quantities.
- Listings tagged `marketplace` (DigiKey # usually starting `2156-`) are third-party
  resellers, often of obsolete stock, with large MOQs. Don't count their stock as real
  availability for a part.
- Some MPNs are shared by several manufacturers (e.g. `CD74AC04E`: TI and Harris). `part`
  then lists the candidates; rerun it with the DigiKey # of the one you mean.
- Keep `--limit` small (5–10) and narrow with keywords such as package or value
  ("74AC573 DIP", "10k resistor array SIP 9 bussed") rather than paging through results.
- `part --qty N` shows the price-break unit price and extended cost per packaging.
  Choose cut tape or tube over full reels unless the quantity justifies a reel.
- `datasheet` saves to `datasheets/<MPN>.pdf` (the PDFs are git-ignored). It unwraps
  vendor redirect links (e.g. TI's). If a manufacturer still serves HTML instead of a
  PDF, it prints the URLs it tried.
- Rate limit: about 1000 calls a day per app. Don't loop `part` over a long list
  without a reason.

## Choosing parts for this project

Follow the README's Philosophy of Design: low cost, easy to buy, buildable by a
hobbyist. Prefer:
- status **Active**, with healthy stock (thousands, not dozens), and more than one manufacturer where possible
- the same family and package as the existing BOM (`components/README.md`, and the MPN fields in the KiCad schematics under `kicad/`)
- through-hole parts for the hand-soldered boards; the SMD variant is a separate effort

When recommending a part, give the MPN, manufacturer, DigiKey #, stock, unit price at the
build quantity, and why you chose it over the alternatives.

## If it fails

- "DIGIKEY_CLIENT_ID ... must be set": the user needs to create `.env` from
  `template.env` (DEVELOPMENT.md → "DigiKey CLI"). Never ask the user to paste secrets into chat.
- HTTP 401/403 on the token or API: the credentials are wrong, or the app isn't
  subscribed to Product Information V4.
- HTTP 429: the rate limit was hit; wait, don't retry in a loop.

# Development Tooling

This document describes the tooling used to develop the Lesser Magistrate electronics: part sourcing, and
AI-assisted board design with [Claude Code](https://docs.claude.com/claude-code). None of it is required to *build* a
Lesser Magistrate (see the [README](./README.md) for that), and all of it is optional for contributors. The KiCad
projects open and edit normally without any of it.

| Tool | What it does | Where it lives | Status |
| ---- | ------------ | -------------- | ------ |
| [DigiKey CLI](#digikey-cli) | Search parts, check stock and pricing, find substitutes, download datasheets | `tools/digikey/` (this repo) | Ready |
| [KiCad MCP server](#kicad-mcp-server) | Lets Claude read and edit the KiCad schematics and boards | External clone, registered with Claude Code | Ready |
| [Claude Code project setup](#claude-code-project-setup) | Skills that teach Claude how to use the tools above | `.claude/` (this repo) | Ready |
| [Planned](#planned) | BOM pricing, datasheet summaries, design-rules `CLAUDE.md` | | Not started |

## Prerequisites

- **Node.js 20.12 or newer**, for the DigiKey CLI and the MCP server
- **KiCad 10** (9 also works with the MCP server), installed with its Python module (`pcbnew`)
- **Claude Code**, for the AI-assisted parts

## Secrets

API credentials live in a `.env` file at the repo root, which git ignores. Start from the template:

```bash
cp template.env .env   # then fill in the values; never commit .env
```

`template.env` documents every variable. At present only the DigiKey CLI reads it.

---

## DigiKey CLI

`tools/digikey/dk.mjs` is a small command-line client for the
[DigiKey Product Information API v4](https://developer.digikey.com/products/product-information-v4). It has no npm
dependencies. It uses the official API rather than scraping digikey.com, so it doesn't break when DigiKey changes
its site.

### Setup

1. Log in at [developer.digikey.com](https://developer.digikey.com) with your DigiKey account and create an
   Organization if you don't have one.
2. Under that organization, open **Production Apps** and create an app with **ProductInformation V4** enabled. The app
   asks for an OAuth callback URL, which this tool doesn't use; `https://localhost` is fine. A Sandbox app returns
   canned data and isn't useful here.
3. Put the app's **Client ID** and **Client Secret** into `.env` as `DIGIKEY_CLIENT_ID` / `DIGIKEY_CLIENT_SECRET`.

Check it with `node tools/digikey/dk.mjs part SN74AC573N`.

### Usage

```bash
node tools/digikey/dk.mjs search 74AC573 DIP --max-moq 20     # keyword search
node tools/digikey/dk.mjs search 74AC573 --in-stock --sort price --max-moq 20
node tools/digikey/dk.mjs part SN74AC573N --qty 16           # details + price at a build quantity
node tools/digikey/dk.mjs subs CD4072BE                      # DigiKey's suggested substitutes
node tools/digikey/dk.mjs datasheet SN74AC573N               # -> datasheets/SN74AC573N.pdf
node tools/digikey/dk.mjs --help
```

- **`--json`** prints a trimmed, machine-readable summary; **`--raw`** prints the full API response.
- **Search's Unit/MOQ columns** show the cheapest way to buy a few (usually cut tape or tube). DigiKey's headline
  price is often a reel or bulk price, so the tool doesn't use it. `--max-moq N` hides anything you can't buy in
  quantities of N or fewer.
- **Listings tagged `marketplace`** (DigiKey numbers usually starting `2156-`) are third-party resellers, often selling
  obsolete stock in large minimum quantities. Don't count their stock as real availability.
- **`part --qty N`** shows the price break that applies at N. Check the next break up, too: for example, 20
  `SN74AC573N` cost less than 16.
- **Ambiguous part numbers:** a few MPNs are sold by more than one manufacturer (e.g. `CD74AC04E`, from both TI and
  Harris). `part` then lists the candidates; rerun it with the DigiKey # of the one you mean.
- **Datasheets** are saved to `datasheets/`. The PDFs are git-ignored, since they're the manufacturers' copyrighted
  documents; summaries written alongside them can be committed. The tool unwraps vendor redirect links such as TI's.
- **Limits:** access tokens are cached in `tools/digikey/.cache/` (git-ignored). The free API tier allows about 1000
  calls per day.

---

## KiCad MCP server

[KiCAD-MCP-Server](https://github.com/mixelpixx/KiCAD-MCP-Server) (MIT) is a
[Model Context Protocol](https://modelcontextprotocol.io/) server that gives Claude about 260 tools for working
with KiCad projects. With it, Claude can open a project, read the schematic and board, place and wire parts, edit
properties, run DRC, and export Gerbers and BOMs. It runs locally, uses KiCad's own Python API, and isn't part of
this repository. Each developer clones and registers it themselves.

### Install (Linux)

Tested on Ubuntu 24.04 with KiCad 10.0 from the KiCad PPA, at server release v2.9.0. For other platforms, see the
server's README.

```bash
# Anywhere outside this repo, e.g. ~/git
git clone --branch stable https://github.com/mixelpixx/KiCAD-MCP-Server.git
cd KiCAD-MCP-Server

# Python environment. It MUST be built from the system Python with --system-site-packages,
# because KiCad installs its `pcbnew` module into the system Python (/usr/lib/python3/dist-packages).
/usr/bin/python3 -m venv --system-site-packages venv
venv/bin/pip install -r requirements.txt
venv/bin/python -c "import pcbnew; print(pcbnew.GetBuildVersion())"   # must print the KiCad version

# Node side (npm install also runs the TypeScript build)
npm install

# Optional: the server's own dependency check (changes nothing)
./setup-linux.sh --verify
```

> **Gotcha:** the server always prefers `venv/bin/python` in its clone. If that venv was created from a pyenv, conda, or
> personal-venv Python, or without `--system-site-packages`, it can't import `pcbnew`. Every board tool then fails,
> even though `kicad` itself works. Check with the last `python -c` line above.

### Register with Claude Code

Run this from the root of this repo, with `KICAD_MCP` set to the clone's absolute path (adjust `python3.12` to the
venv's Python version):

```bash
KICAD_MCP=$HOME/git/KiCAD-MCP-Server
claude mcp add --scope local kicad \
  --env KICAD_PYTHON=$KICAD_MCP/venv/bin/python \
  --env PYTHONPATH=$KICAD_MCP/venv/lib/python3.12/site-packages:/usr/lib/python3/dist-packages \
  --env KICAD_MCP_TOOLBOXES=core \
  --env LOG_LEVEL=info \
  -- "$(command -v node)" $KICAD_MCP/dist/index.js

claude mcp get kicad    # should report: Status: ✔ Connected
```

Start a new Claude Code session afterwards; a running session doesn't pick up new servers.

These choices are deliberate:

- **`--scope local`** registers the server for this repo only, privately in `~/.claude.json`. Its tool definitions
  then don't take up context in unrelated projects, and machine-specific paths stay out of git. That's why the
  repo doesn't ship a shared `.mcp.json`.
- **`KICAD_MCP_TOOLBOXES=core`** loads about 37 core tools instead of all 260. Claude opens other groups
  (`schematic`, `routing`, `drc`, `export`, …) with `open_toolbox` when it needs them, and they're usable from your next
  message.
- **The absolute `node` path** keeps the server working if Claude Code starts without your shell's `nvm` setup.
- **Optional `KICAD_MCP_OPERATING_MODE=readonly`** (or `manufacturing`, which also allows exports) removes every tool
  that can change the design. Use it for review-only sessions.

### Working with it

- **Commit (or stash) before letting Claude edit a board.** `git diff` on the KiCad files is then your review and your
  undo.
- **Avoid editing the same file in KiCad and through Claude at once.** Close the board in KiCad, or reload it after
  Claude's changes. (The server also has an experimental live IPC mode, which isn't set up here.)
- **The server has its own DigiKey toolbox.** This repo uses the [DigiKey CLI](#digikey-cli) instead, because it handles
  pricing at quantity, minimum orders, marketplace listings, substitutes, and datasheets. There's no need to open the
  `digikey` toolbox.
- **Freerouting autorouting** needs Java 21+ or Docker plus the Freerouting JAR. It isn't set up here; see the server's
  README if you want it.

### Updating

```bash
cd $KICAD_MCP
git pull                      # on the stable branch: moves only on releases
venv/bin/pip install -r requirements.txt
npm install                   # rebuilds dist/
```

### Troubleshooting

- **`claude mcp get kicad` says it failed to connect:** run `node $KICAD_MCP/dist/index.js` by hand and read the error.
- **Tools fail with `No module named 'pcbnew'`:** see the venv gotcha above.
- **Server logs:** `~/.kicad-mcp/logs/kicad_interface-<pid>.log` (one file per server process).

---

## Claude Code project setup

Committed to this repo:

- `.claude/skills/digikey/SKILL.md` tells Claude when to use the DigiKey CLI, which flags matter, and the part-selection
  preferences that follow from the README's Philosophy of Design.

Local to each developer (not committed):

- `.env`, which holds the credentials
- the `kicad` MCP server registration (in `~/.claude.json`)

---

## Planned

- **`dk bom`:** price `lib/BOM.csv` / `components/README.md` at the 10, 12 and 16-trigger quantities through the API,
  flag non-active or low-stock parts, and point out cheaper price breaks. This would replace the old page scraper in
  `manufacture/pricing/`.
- **Datasheet summaries:** a short `datasheets/<MPN>.md` per part (pinout, supply range, key timing, package), so each
  datasheet is read once and later work uses the summary.
- **`CLAUDE.md`:** project design rules and decisions (through-hole for the hand-soldered boards, cheap and widely
  available parts, a 16-trigger maximum, known errata) for every Claude session to start from.

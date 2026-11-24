# Development Tooling

This document describes the tooling used to develop the Lesser Magistrate electronics: KiCad and its design checks,
part sourcing, and AI-assisted board design with [Claude Code](https://docs.claude.com/claude-code). None of it is
required to *build* a Lesser Magistrate (see the [README](./README.md) for that). KiCad is the one tool you need to
work on the boards; everything else is optional, and the KiCad projects open and edit normally without it.

| Tool | What it does | Where it lives | Status |
| ---- | ------------ | -------------- | ------ |
| [KiCad](#kicad) | Schematics and boards; design checks (ERC/DRC) and fabrication outputs, locally and in CI | `kicad/`, `tools/kicad/`, `.github/workflows/` | Ready |
| [Crosstalk simulation](#crosstalk-simulation) | SPICE model of the trigger lines; checks a press can't latch a neighbouring light | `sim/` | Ready |
| [BOM tables](#bom-tables) | Generates the parts tables in `components/README.md` from the schematics | `tools/bom/`, `components/parts.json` | Ready |
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

## KiCad

The boards are KiCad 10 projects under [`kicad/`](./kicad), one per board, sharing a project library. See the
[KiCad README](./kicad/README.md) for how the projects and libraries are organized.

### Install

Install KiCad 10 with its standard libraries (symbols, footprints and 3D models). Older versions can't open the files.

- **Ubuntu/Debian:** the KiCad PPA. This installs everything, including the ~3 GB 3D model library:
  ```bash
  sudo add-apt-repository ppa:kicad/kicad-10.0-releases
  sudo apt update && sudo apt install kicad
  ```
- **Windows / macOS:** the installer from [kicad.org/download](https://www.kicad.org/download/), with the default
  options (which include the libraries).

On first start, accept KiCad's offer to use the default global symbol and footprint library tables. The projects
find their own library through relative paths, so no further library setup is needed. The stock 3D models are found
through `${KICAD10_3DMODEL_DIR}`, which the installer sets.

Check the install from a terminal:

```bash
kicad-cli version                 # 10.x
tools/kicad/check.sh              # ERC + DRC on every board
```

### Design checks

`tools/kicad/check.sh` runs ERC and DRC (including schematic/board parity) on each board and fails on any error
that hasn't been excluded in KiCad. With `--fab` it also writes gerbers, drill files, a BOM, the schematic PDF and a 3D
render. Everything goes to `build/kicad/<board>/`, which git ignores.

CI runs the same script on every push or pull request that touches `kicad/` (see
[`.github/workflows/kicad.yml`](./.github/workflows/kicad.yml)), in the official `kicad/kicad:10.0` Docker image, and
uploads `build/kicad/` as the `kicad-outputs` artifact.

When a check fails on something that is understood and accepted, exclude it in KiCad with a comment saying why
(right-click the marker in the ERC/DRC dialog → *Exclude*) instead of loosening the rules. Exclusions live in the
`.kicad_pro` file, so they are reviewed in git like any other change.

### Crosstalk simulation

[`sim/crosstalk.py`](./sim/crosstalk.py) simulates one team's trigger lines (switches, phone cords, LMM, Cat5, LM
input network, latch thresholds) and checks that pressing one trigger can't latch another. `check.sh` runs it whenever
it checks LM, so it is part of CI. It uses KiCad's own `libngspice` through Python's `ctypes`, so it needs nothing
beyond KiCad. With `--fab`, it also writes `build/sim/crosstalk.png` if matplotlib is installed. See
[`sim/README.md`](./sim/README.md) for the model and its assumptions.

### BOM tables

The parts tables in [`components/README.md`](./components/README.md) (one per set size) are generated, so they can't
drift from the boards. [`tools/bom/bom.mjs`](./tools/bom/bom.mjs) takes each board's parts and quantities from its
schematic (the `MPN` field) and multiplies them by the boards per set. It adds what the schematics don't hold from
[`components/parts.json`](./components/parts.json): descriptions, DigiKey part numbers and links, alternates, notes,
row order, and the off-board items (cables) with their quantity per board.

```bash
node tools/bom/bom.mjs           # rewrite the tables after changing a schematic or parts.json
node tools/bom/bom.mjs --check   # exit 1 if they're out of date
```

It fails if a schematic has a part that `parts.json` doesn't list, or the reverse. `check.sh` runs the check when it
checks every board, and so does CI. The DigiKey shopping-list links above each table are still maintained by hand.

### Working on the boards

- **Don't edit a board in KiCad and by script (or Claude) at the same time.** Close it in KiCad first, or reload it
  afterwards.
- **Commit before large edits,** so `git diff` on the KiCad files is your review and your undo.
- **Per-user files stay out of git:** `*.kicad_prl` (window layout, visible layers), backups, autosaves and lock files
  are git-ignored.

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

- **Calibrate the crosstalk model:** scope an idle trigger line at the LM (latch input) while pressing its neighbour,
  with and without the 10 nF capacitor, and fit the cable values in `sim/crosstalk.py` to it. Until then the cable
  values are estimates (see `sim/README.md`).
- **Logic simulation from the schematic:** generate a mixed analog/digital ngspice test from each board's KiCad netlist
  (ngspice's built-in digital latch, OR and inverter models with datasheet delays, plus the analog input network and
  cables from `sim/crosstalk.py`). Press each trigger and check that exactly its LED lights and stays latched, and that
  the arm button resets it. Because it's generated from the netlist, it catches wiring mistakes (a swapped latch input,
  an LED on the wrong output), which matters most for the SMD revision. Two presses a set time apart would also measure
  the tie window (about 150–500 ns, set by the CD4072 delays). It can't decide races closer than a few nanoseconds,
  because the digital models don't simulate latch metastability.
- **`dk bom`:** price each set from `tools/bom/bom.mjs`'s `buildSets()` through the API, flag non-active or low-stock
  parts, and point out cheaper price breaks.
- **DigiKey list sync:** push each set's BOM (`buildSets()` in `tools/bom/bom.mjs`) to its DigiKey shopping list, so
  the links in `components/README.md` always match the tables. DigiKey's MyLists API
  (`https://api.digikey.com/mylists/v1`) needs 3-legged OAuth: a one-time browser login with an https redirect URL
  registered on the DigiKey app, then a stored refresh token (valid about 90 days). `dk.mjs` only does the 2-legged
  flow today. A lighter alternative is DigiKey's key-less third-party endpoint, which turns a BOM into a one-time link
  that opens it as a new list, but it can't update an existing one.
- **Datasheet summaries:** a short `datasheets/<MPN>.md` per part (pinout, supply range, key timing, package), so each
  datasheet is read once and later work uses the summary.
- **`CLAUDE.md`:** project design rules and decisions (through-hole for the hand-soldered boards, cheap and widely
  available parts, a 16-trigger maximum, known errata) for every Claude session to start from.

# KiCad Projects

The electrical design for the Lesser Magistrate, in KiCad 10. One project per board, plus one shared library:

```
kicad/
├── libraries/
│   ├── lesser-magistrate.kicad_sym   # symbols for the parts used on the boards
│   └── lesser-magistrate.pretty/     # footprints for the parts used on the boards
├── lm/        # LM: main quiz-magistrate controller board  (1 per set)
├── lmm/       # LMM: team module / breakout board          (1 per team)
└── trigger/   # Trigger: the quizzer's push button          (1 per quizzer)
```

Open a board with `kicad/<board>/<board>.kicad_pro`. KiCad allows one board per project, so boards that are
fabricated separately are separate projects that share a library. Each project's `sym-lib-table` and `fp-lib-table`
point at `${KIPRJMOD}/../libraries/`, so the project library resolves on any machine without setup. See
[DEVELOPMENT.md](../DEVELOPMENT.md#kicad) for installing KiCad.

## Libraries

**Use KiCad's stock libraries first.** They ship with KiCad, are maintained upstream, and most stock footprints come
with a 3D model. Add a part to the project library only when the stock libraries don't have it, or when its geometry
has to match a board that has already been built. Either way, KiCad embeds a copy of every symbol and footprint in
the schematic and board files, so a project still opens if a library changes or goes missing.

The current boards use the project library throughout, because their footprints reproduce the manufactured boards.
KiCad's stock DIP and resistor-array footprints have different drill sizes, for example (0.8 mm against 0.9 and
1.118 mm here). New designs should start from the stock libraries.

Symbols are named after the generic part (`C`, `LED`, `R_Network09`, `R_Pack04_SIP`, `74AC573`, `4072`, `74AC04`,
`RJ11`, `RJ45`, `USB_A`, `SW_Push`). Footprints are named after the physical package or the specific part they were
drawn for (`RJ45_AdamTech_MTJ-881X1`, `DIP-20_W7.62mm`, …). Every placed part has:

- **Value**: what is printed on the board and the BOM (e.g. `10nF`, `CD4072BE`, `Green`)
- **MPN**: manufacturer part number
- **Datasheet**: the DigiKey product page

These match [components/README.md](../components/README.md), so KiCad's BOM export lists the ordering information
(see [Checks and outputs](#checks-and-outputs)).

The connector and mounting-hole footprints carry local pour clearances on their non-plated holes, which reproduces the
copper pour of the boards as manufactured.

### 3D models

Footprints reference KiCad's stock 3D models through `${KICAD10_3DMODEL_DIR}`, which a normal KiCad install sets.
Where no stock model of the exact part exists, the closest stock model with the same pin pattern stands in:

| Footprint | 3D model | Exact? |
|---|---|---|
| `DIP-14_W7.62mm`, `DIP-20_W7.62mm` | stock DIP-14 / DIP-20 | yes |
| `R_Array_SIP10`, `R_Array_SIP8` | stock SIP-10 / SIP-8 resistor array | yes |
| `LED_L513` | stock 5 mm LED (red; the parts are green and yellow) | close |
| `C_Kemet_C410` | stock 3.8 mm axial capacitor, squeezed from 7.5 mm to 6.5 mm pitch | close |
| `USB_A_OnShore_USB-A1HSW6` | Molex 67643 USB-A (same pin pattern) | close |
| `SW_Tactile_TS11-674_RA` | C&K PTS645 right-angle tactile switch (same pin pattern) | close |
| `RJ11_Amphenol_54601-906001WPLF`, `RJ45_AdamTech_MTJ-881X1` | none yet | — |

Manufacturer models (STEP) for the RJ11 and RJ45 jacks would go in `libraries/lesser-magistrate.3dshapes/`,
referenced as `${KIPRJMOD}/../libraries/lesser-magistrate.3dshapes/<name>.step`. The vendors only offer them behind
download forms.

## Checks and outputs

`tools/kicad/check.sh` runs ERC and DRC (with schematic/board parity) on every board. It fails on any error that hasn't
been excluded in KiCad, and reports warnings without failing. The same script runs in CI
([.github/workflows/kicad.yml](../.github/workflows/kicad.yml)) on every push that touches `kicad/`.

```sh
tools/kicad/check.sh              # all boards
tools/kicad/check.sh lm           # one board
tools/kicad/check.sh --fab        # also gerbers, drill, BOM (CSV), schematic PDF and a 3D render
```

Reports and outputs go to `build/kicad/<board>/`, which git ignores. CI uploads the same folder as the
`kicad-outputs` artifact.

**Known issues that fail the check:** a violation that's understood and accepted should be *excluded* in KiCad, with a
comment saying why (right-click the marker in the ERC or DRC dialog, *Exclude*). Exclusions are saved in the
`.kicad_pro` file, so the check and CI skip them too. LM has seven such violations from the original design (see
[below](#known-issues-from-the-original-design)) that haven't been excluded yet.

**Fabrication files:** the zips in [`gerber/`](../gerber) are still the production files exported from DipTrace. They
stay the reference until a batch made from KiCad's output has been built and tested.

## Migration from DipTrace

LM and LMM were exported from DipTrace 5.3.5 (Eagle XML), imported with KiCad's Eagle importer, and then cleaned up.
Trigger's DipTrace source (`buzzer_pcb.dip`) was lost, so it was rebuilt from the fab files in `TriggerGerber.zip`: the
placement file, the IPC-D-356 pad netlist, the drill file and the copper/outline gerbers. The DipTrace sources were
removed from the repo after the migration; they're in git history before that commit.

What was verified for each board, against the original DipTrace netlists and the manufactured gerbers:

| Check | LM | LMM | Trigger |
|---|---|---|---|
| Schematic connectivity = DipTrace netlist | 74/74 nets | 6/6 nets | 2/2 nets (from IPC-D-356) |
| Board connectivity = DipTrace netlist | 74/74 nets | 6/6 nets | 2/2 nets |
| Schematic ↔ board parity (KiCad DRC) | clean | clean | clean |
| Drill holes vs `Through.drl` | 280/280 within 0.002 mm | 34/34 | 9/9 |
| Board outline | identical | identical | identical |
| Top copper and solder mask vs gerbers | ≤ 1.3 mm² differs | ≤ 0.5 mm² | ≤ 0.4 mm² |

Known differences from the manufactured boards (none of them electrical):

- **Bottom copper pour (LM)**: KiCad's refill puts about 130 mm² more ground copper than DipTrace did, mostly in narrow
  gaps between pads. DipTrace filled with a 0.635 mm stroke and couldn't reach them. Clearances are unchanged.
- **Silkscreen text** uses KiCad's font, so it is placed and spaced slightly differently. Part values on the silkscreen
  now show the part number (e.g. `SN74AC573N` where DipTrace printed `Octal D-Latch`).
- **Mounting holes** are footprints `H1`–`H4`, marked board-only, so they're on the board but not in the schematic.

Schematic cleanup after the import (connectivity unchanged): net labels moved off the pins onto the ends of their wire
stubs, no-connect flags on intentionally unused pins, `PWR_FLAG`s where 5V and GND enter from the USB connector, and
pin names hidden on symbols whose pin names were just their numbers.

## Known issues from the original design

These are reported by ERC/DRC on LM and fail `check.sh` until they're excluded or fixed:

- **Floating inputs (ERC, 4 errors):** the three unused inverters in U8 (CD74AC04E, inputs A1–A3) and latch input
  U2 D8 are left floating. Unused CMOS inputs are normally tied to GND.
- **Clearance (DRC, 3 errors):** the 5V track passes 0.18 mm from the unconnected pad 3 of each RJ45 (UA1, UB1, UC1).
  The design rule is 0.2032 mm (8 mil).

Warnings that don't fail the check: 32 wire ends off KiCad's 50 mil grid (LM schematic), silkscreen overlaps on all
three boards, and 28 small isolated copper islands in LM's ground pour.

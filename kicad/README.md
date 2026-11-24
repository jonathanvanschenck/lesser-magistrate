# KiCad Projects

The electrical design for the Lesser Magistrate, in KiCad 10. One project per board, plus one shared library:

```
kicad/
├── libraries/
│   ├── lesser-magistrate.kicad_sym   # symbols for the parts used on the boards
│   ├── lesser-magistrate.pretty/     # footprints for the parts used on the boards
│   └── lesser-magistrate.3dshapes/   # manufacturer 3D models KiCad doesn't ship
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
`RJ11`, `RJ45`, `USB_A`, `SW_Push`). `LED`, `RJ11` and `RJ45` use KiCad's stock drawings (the jack pins are numbered by
contact position, to match the footprints). Connectors are `J` (`JA1`-`JC1` are the team jacks on the LM). Footprints are named after the physical package or the specific part they were
drawn for (`RJ45_AdamTech_MTJ-881X1`, `DIP-20_W7.62mm`, …). Every placed part has:

- **Value**: the generic part, printed on the board and the BOM (e.g. `10nF`, `4072`, `74AC573`, `Green`)
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
| `RJ45_AdamTech_MTJ-881X1` | Adam Tech's model, in `lesser-magistrate.3dshapes/` | yes |
| `RJ11_Amphenol_54601-906001WPLF` | Amphenol's model, in `lesser-magistrate.3dshapes/` | yes |

Manufacturer models go in `libraries/lesser-magistrate.3dshapes/`, named after the footprint and referenced as
`${KIPRJMOD}/../libraries/lesser-magistrate.3dshapes/<name>.step`.

## Checks and outputs

`tools/kicad/check.sh` runs ERC and DRC (with schematic/board parity) on every board. It fails on any error that hasn't
been excluded in KiCad, and reports warnings without failing. The same script runs in CI
([.github/workflows/kicad.yml](../.github/workflows/kicad.yml)) on every push or pull request that touches the boards,
the simulation, the parts catalogue or the tooling.

```sh
tools/kicad/check.sh              # all boards
tools/kicad/check.sh lm           # one board
tools/kicad/check.sh --fab        # also gerbers, drill, BOM (CSV), schematic PDF and a 3D render
```

Reports and outputs go to `build/kicad/<board>/`, which git ignores. CI uploads the same folder as the
`kicad-outputs` artifact.

**Known issues that fail the check:** a violation that's understood and accepted should be *excluded* in KiCad, with a
comment saying why (right-click the marker in the ERC or DRC dialog, *Exclude*). Exclusions are saved in the
`.kicad_pro` file, so the check and CI skip them too. There are no exclusions at the moment: all three boards pass.

**Fabrication files:** the zips in [`gerber/`](../gerber) are still the production files exported from DipTrace. They
stay the reference until a batch made from KiCad's output has been built and tested. LM's KiCad copper is no longer
identical to them: see [Fixes since the DipTrace design](#fixes-since-the-diptrace-design).

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
- **Silkscreen text** is placed, sized and stroked like the manufactured boards (rebuilt from the Eagle export, using
  Eagle's rule that turns upside-down text the right way up). KiCad's font is slightly wider than DipTrace's. Text that
  DipTrace printed upside down now reads upright in the same spot. The chips are labelled with their part type
  (`4072`, `74AC04`, `74AC573`) where DipTrace printed `OR`, `NOT` and `Octal D-Latch`. Multi-line titles are
  split into one text per line, because KiCad's 3D renderer and gerber plotter space multi-line text differently.
- **Mounting holes** are footprints `H1`–`H4`, marked board-only, so they're on the board but not in the schematic.

Schematic cleanup after the import (connectivity unchanged):

- LM: net labels moved off the pins onto the ends of their wire stubs, no-connect flags on intentionally unused pins,
  `PWR_FLAG`s where 5V and GND enter from the USB connector, pin names hidden on symbols whose pin names were just
  their numbers, everything on KiCad's 50 mil grid, the latch-enable wire rerouted so it no longer crosses U2, and
  every reference designator visible (the filter capacitors C4-C18 show their reference, with a note giving their
  value).
- Boards moved to the middle of their pages (LM's Eagle import had put it off the page); every fab layer moved by the
  same exact offset and is otherwise unchanged.
- All three: jacks drawn with the stock-style symbols, each pin a short wire and a named net (`5V`, `TRIG_A1`–`TRIG_C5`
  and `ARM` on the LM, `TRIG1`–`TRIG5` on the LMM, `TRIG` on the Trigger); drawings centred on their sheets.
- Wire colours: DipTrace's net colours didn't survive the export, so they were re-derived from the circuit. Each
  trigger's signal is coloured from its jack, through its series resistor and latch, to its LED, with the same colour
  for trigger *k* on the LM and the LMM; the arm button and latch-enable nets have their own colours. The colours are
  stored on each wire, so a new wire needs its colour set by hand (right-click → *Properties*). Each schematic has a
  legend.

## Fixes since the DipTrace design

ERC and DRC found two problems in LM as manufactured. Both are fixed in the schematic and on the board, so LM's copper
differs from the DipTrace gerbers in these places only:

- **Floating inputs (ERC, 4 errors):** the three unused inverters in U8 (CD74AC04E, inputs A1–A3) and latch input
  U2 D8 were left floating. A floating CMOS input can drift to mid-supply and make its gate draw current or oscillate.
  They're now tied to GND: U8 pins 1, 3 and 5 by a back-side track to pin 7, and U2 pin 9 by a back-side track to
  pin 10.
- **Clearance (DRC, 3 errors):** the 5V track ran diagonally into pad 1 of each RJ45 (JA1, JB1, JC1), passing 0.18 mm
  from the unconnected pad 3. The design rule is 0.2032 mm (8 mil). The track now runs along the 5V bus to above pad 1
  and drops straight down, about 0.9 mm from pad 3.

The ground pour was refilled after these changes.

Warnings that don't fail the check: silkscreen overlaps on all three boards, and 28 small isolated copper islands in
LM's ground pour.

## Next revision

Changes planned for the next LM revision (the SMD variant). None of them are in the current boards.

### Power and decoupling

The LM draws little power. Each LED takes about (5 V − 2.1 V) / 150 Ω ≈ 19 mA, and normally one LED is lit: the
yellow light while armed, then the winner's green light. A tie lights more, and the worst case, every LED at once, is
about 0.3 A, within USB 2.0's 500 mA. The 1.524 mm 5V track drops about 20 mV at that current, so track width isn't
the limit. A USB port or a long, thin cable loses more than the board does.

The weak point is decoupling. LM has six logic chips but only three 1 µF capacitors (C1–C3), 15–30 mm from the chips,
and none near the three CD4072s (U3, U5, U6). When a latch output switches an LED, the current step pulls a chip's
supply down and lifts its ground for a moment, which can cause a false or missed latch. The next revision should
have:

- **A 100 nF ceramic capacitor (X7R) at every chip**, between its VCC and GND pins, within about 3 mm of the VCC pin,
  with short, direct tracks or vias to the ground pour.
- **A 10–47 µF bulk capacitor where USB power enters** (J2), to supply LED switching current and smooth out a long
  USB cable. The existing 1 µF capacitors can go.
- **Solid ground pours on both layers**, stitched together with vias. The current pour has 28 isolated islands.
- **The 5V track at 0.5 mm or wider**: plenty for 0.3 A, so routing space isn't wasted on a wider track.

These will be enforced by checks (see [DEVELOPMENT.md](../DEVELOPMENT.md#planned)): a power budget computed from the
schematic, and a capacitor near every chip on the board.

### Battery power (option)

Not committed to; an option if a set needs to run without a computer or USB charger. Only the LM changes: the LMMs
and triggers take their 5V from the LM through the cables. At the steady ~20 mA above, batteries last a long time.

- **No change: a USB power bank** on the existing A-to-A cable. Many power banks switch off when the load is below
  about 50–100 mA, which would cut out mid-quiz, so it needs one with an "always on" or low-current mode. Test a
  bank before relying on it.
- **Built in: 4 × AA NiMH rechargeable cells** (about 2000 mAh, so roughly 100 hours). They start near 5.6 V fully
  charged, inside the 74AC chips' 6 V limit, and stay around 4.8–5 V for most of their discharge. The board needs a
  battery holder, an on/off switch, and a Schottky diode or P-channel MOSFET on each source so USB and the battery
  can't feed into each other; about $3–5 of parts. The bigger job is a battery compartment in the 3D-printed
  enclosure. The cells are charged outside the box.
- **Not recommended:**
  - 3 × AA alkaline works, but the supply sags from 4.5 V to about 3.3 V as they drain: the LEDs dim and the CD4072s
    slow down, widening the tie window.
  - 4 × AA alkaline starts at about 6.4 V, above the 74AC chips' limit.
  - A built-in lithium cell needs a charger chip and protection circuit, fine-pitch parts and shipping rules, which
    doesn't fit the hand-built, low-cost design.

If the battery option goes ahead, the crosstalk simulation's supply voltage (fixed at 5 V in `sim/crosstalk.py`)
should become a parameter, and the check should also run at the lowest battery voltage, since the noise margins
shrink with the supply.

### Trigger cable

TRIG3 and TRIG5 share a twisted pair in the Cat5 cable, which makes them the worst case for crosstalk (see
[sim/README.md](../sim/README.md)). Giving each trigger its own pair, or using a spare wire as a ground, would cut the
coupling at its source. That changes the LMM and LM jack wiring, so it would need a new LMM too.

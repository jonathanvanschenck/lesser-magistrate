# Gerber Files
In this directory are the gerber files (extension `.zip`) for the PCBs used in this project.

Order from these files. They are the released version of each board: don't order from files exported out of the
`kicad` directory yourself, which may hold unreleased changes.

<!-- BEGIN releases (generated: run node tools/release/release.mjs bump, see kicad/README.md#versions) -->
| Board | File | Version | Made with |
|-------|------|---------|-----------|
| LM | [LMGerber.zip](./LMGerber.zip) | 1.1.0 | KiCad (tag `lm@1.1.0`) |
| LMM | [LMMGerber.zip](./LMMGerber.zip) | 1.1.0 | KiCad (tag `lmm@1.1.0`) |
| Trigger | [TriggerGerber.zip](./TriggerGerber.zip) | 1.0.0 | DipTrace (original production files) |
<!-- END releases -->

The boards were first drawn in DipTrace, and every Lesser Magistrate built so far was made from the DipTrace files.
They are now developed in KiCad (see the [kicad](../kicad) directory). Each board's file is replaced by KiCad's output
when that board's next version is released, and the table says which file you have. The KiCad LM has two small fixes
the DipTrace LM doesn't (see [Fixes since the DipTrace design](../kicad/README.md#fixes-since-the-diptrace-design));
boards made from the DipTrace file work without them.

## Quantities by Trigger Set

The number of PCBs you need to order depends on how many triggers you are building. There is always 1 LM (main controller) board and 1 LMM (module) board per team. The number of Trigger boards equals the total number of triggers.

| Gerber File | 16 Trigger Set | 12 Trigger Set | 10 Trigger Set | Explanation |
|-------------|:--------------:|:--------------:|:--------------:|-------------|
| [LM Board](./LMGerber.zip) | 1 | 1 | 1 | One per set — the main quiz magistrate controller board |
| [LMM Board](./LMMGerber.zip) | 3 | 3 | 3 | One per team |
| [Trigger Board](./TriggerGerber.zip) | 16 | 12 | 10 | One per trigger |
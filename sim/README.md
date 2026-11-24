# Simulation

## Trigger crosstalk (`crosstalk.py`)

Early Lesser Magistrates sometimes lit several lights for one trigger pull. Pressing a trigger drives its line in the
Cat5 cable from 0 to 5 V, and the neighbouring idle lines, coupled to it along the whole cable, are pulled up with it.
If an idle line's latch input is high when the latch closes, that light latches too. The fix was a 10 nF capacitor on
every LM input (C4–C18), which holds an idle line low and slows the edge. This simulation checks that the design keeps
that margin.

```bash
python3 sim/crosstalk.py                         # table of every case
python3 sim/crosstalk.py --check --plot out.png  # exit 1 on failure; plot needs matplotlib
```

`tools/kicad/check.sh` runs it with `--check` whenever it checks LM, so CI runs it on every change to the boards or
to `sim/`. A run takes under a minute. It uses KiCad's `libngspice` through Python's `ctypes`, so nothing beyond KiCad
needs installing.

### What is modelled

One team, pressing each of the five triggers in turn with the other four idle:

```
trigger switch ── 6 ft flat cord ── LMM ── 15/30 ft Cat5 ── LM: 33 Ω ─┬─ latch input
  (5V ↔ TRIGk)    (5V, TRIGk)    (connectors      (8 wires,          10 kΩ ┴ 10 nF ┴ clamp diodes
                                   only)          no ground)
```

- **Cat5:** all eight wires, as a chain of 1 m segments of coupled R, L and C: capacitance between the two wires of a
  pair, between wires of different pairs, and to the surroundings, and inductive coupling inside and between pairs.
  The wiring is the boards': 5V and TRIG1 share pair 1-2, TRIG3 and TRIG5 share pair 7-8, and TRIG2 and TRIG4 each pair
  with an unused wire. The cable has no ground wire: 5V is the only return path.
- **Phone cords:** one 2-wire flat cord per trigger, with the switch at the far end.
- **LM input:** the series resistor, pulldown and filter capacitor, **read from `kicad/lm/lm.kicad_sch`**, so the
  simulation follows the schematic. All 15 inputs must match. The 74AC573 input is modelled as 5 pF plus its clamp diodes
  to 5V and GND.

### Pass criteria

- **Design as drawn:** in every case, every idle line's latch input stays below **1.35 V** (the 74AC573's guaranteed
  low input level, V<sub>IL</sub>, at 4.5 V) throughout the **latch window**. The window runs from 50 ns to 1 µs after
  the pressed line crosses 2.5 V. In that time its latch output runs through two CD4072 OR gates and the 74AC04 to drop
  Latch Enable, which takes about 150–500 ns. Each press must also be detected: the pressed line has to cross 2.5 V.
- **Model check:** the same circuit with the filter capacitors removed must fail. That is the original fault, so if
  the model can't reproduce it, its cable values are too optimistic to trust.

### Results

| LM input | Worst idle line in the latch window | Case |
| -------- | ----------------------------------- | ---- |
| As drawn (10 nF) | 0.29 V | 30 ft, pessimistic cable, TRIG3 ↔ TRIG5 |
| No filter (original boards) | 4.97 V, and every case fails | 30 ft, pessimistic cable, TRIG3 ↔ TRIG5 |

With the filter, the pressed line reaches the latch threshold 300–430 ns after the switch closes, which is well within
human reaction times. TRIG3 and TRIG5 are always the worst pair because they share a twisted pair. In the next
revision, giving each trigger its own pair or a ground wire would cut the coupling at its source.

### Assumptions and limits

- **Cable values are estimates**, from typical Cat5 data (about 52 pF/m pair capacitance, 100 Ω, 24 AWG) and a typical
  flat 28 AWG cord. Each case runs twice: at typical values and at a pessimistic corner with more capacitance between
  wires and less to the surroundings. See `CORNERS` in the script. A scope capture would calibrate them (see
  [Planned](../DEVELOPMENT.md#planned)).
- **The cable model is lossless at high frequency.** It has no skin-effect or dielectric loss, so without the filter
  the ringing lasts longer than it would in a real cable. That exaggerates the no-filter failure but doesn't affect
  the as-drawn result, where the filter absorbs the edge.
- **The switch closes once, cleanly, in 1 ns.** Contact bounce isn't modelled: once the first closure latches, the
  latch is closed and later edges can't latch anything.
- **The latch is modelled by its thresholds**, not as logic. The window above is deliberately wide, from 50 ns after
  the crossing to 1 µs, which covers the slowest gate delays.

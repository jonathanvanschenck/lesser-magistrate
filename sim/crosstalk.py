#!/usr/bin/env python3
"""Crosstalk between trigger lines: does pressing one trigger latch another light too?

Models one team's signal path, from the trigger switches through the phone cords, the LMM and the Cat5 cable to the
LM's input network and latch, and simulates each trigger being pressed with the others idle. It reports the highest
voltage on each idle line's latch input while the latch is closing.

The LM input network (series resistor, pulldown, filter capacitor) is read from the LM schematic, so a change there is
simulated as drawn. Cables are chains of short coupled RLC segments; their per-metre values are estimates, so each
case runs at a typical and a pessimistic corner (see CORNERS and sim/README.md).

--check fails (exit 1) if the design as drawn lets an idle line reach the latch's guaranteed-low limit, or if the
model can't reproduce the original fault: with the filter capacitors removed, some idle line must cross it. Otherwise
the model is too optimistic to trust.

usage: crosstalk.py [--check] [--plot PNG] [--lm-sch PATH]
Runs on KiCad's libngspice (installed with KiCad); the ngspice command isn't needed.
"""
import argparse
import ctypes
import ctypes.util
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FT = 0.3048
LENGTHS_FT = (15, 30)            # LM-LMM Cat5 runs that ship
CORD_FT = 6                      # LMM-trigger flat phone cord

# Cat5: RJ45 pin -> signal (same on LM and LMM), and the twisted pairs (T568B pairs by pin).
CAT5_PIN = {1: '5V', 2: 'TRIG1', 3: None, 4: 'TRIG4', 5: None, 6: 'TRIG2', 7: 'TRIG3', 8: 'TRIG5'}
PAIRS = [(1, 2), (3, 6), (4, 5), (7, 8)]
TRIGS = ['TRIG1', 'TRIG2', 'TRIG3', 'TRIG4', 'TRIG5']

# Per-metre cable values. "typ" is a datasheet-typical cable; "worst" pushes every value toward more crosstalk: more
# capacitance between conductors, less to the surroundings (which would hold an idle line down).
#   Cpair  direct capacitance between the two wires of a twisted pair (Cat5 pair capacitance is ~52 pF/m, which
#          also counts the path through the other conductors)
#   Cx     between one wire and each wire of another pair
#   Cenv   from each wire to the surroundings (earth via the LM's USB host); the cable has no ground conductor
#   L, k   per-wire inductance, and coupling inside a pair / between pairs (100 ohm pairs: L_loop = 2L(1-k) ~ 0.5 uH/m)
#   R      24 AWG
#   cord_* the 2-wire flat phone cord: wire-to-wire C, C to surroundings, L, k, R (28 AWG)
CORNERS = {
    'typ': dict(Cpair=40e-12, Cx=5e-12, Cenv=15e-12, L=0.65e-6, kpair=0.6, kx=0.3, R=0.084,
                cord_C=35e-12, cord_Cenv=10e-12, cord_L=0.7e-6, cord_k=0.6, cord_R=0.21),
    'worst': dict(Cpair=52e-12, Cx=10e-12, Cenv=5e-12, L=0.65e-6, kpair=0.7, kx=0.4, R=0.084,
                  cord_C=50e-12, cord_Cenv=5e-12, cord_L=0.7e-6, cord_k=0.7, cord_R=0.21),
}
SEG_M = 1.0                      # cable segment length; halving it changes the results by under 0.05 V

# 74AC573 at VCC = 4.5 V (TI CD74AC573 datasheet): inputs read low below VIL and high above VIH, guaranteed.
VIL, VIH = 1.35, 3.15
VT = 2.5                         # typical switching point, about VCC/2
C_IN = 5e-12                     # latch input capacitance (datasheet Ci ~ 4.5 pF)

# Latch timing. Once the pressed line's latch input crosses VT, its Q output goes high and runs through two CD4072 OR
# gates and a 74AC04 to drop Latch Enable; from then on the latches hold. An idle line latches falsely only if its input
# is high when LE falls. The OR gates make that delay ~150-500 ns (CD4072B: 125 ns typical, 250 ns max per gate at
# 5 V), so an idle line is judged over a generous window after the crossing. Ringing that dies out before the window
# opens can only flash an LED for nanoseconds.
WINDOW = (50e-9, 1e-6)

T_PRESS, T_END = 1e-6, 8e-6


# ---- LM input network, from the schematic -------------------------------------------------------------------------
def si(v):
    m = re.fullmatch(r'\s*([\d.]+)\s*([pnumkMR]?)[A-Za-zΩ]*\s*', v)
    if not m:
        raise ValueError(f'cannot read value {v!r}')
    mult = {'p': 1e-12, 'n': 1e-9, 'u': 1e-6, 'm': 1e-3, 'k': 1e3, 'M': 1e6, 'R': 1, '': 1}[m[2]]
    return float(m[1]) * mult


def lm_inputs(sch):
    """Series R, pulldown R and filter C on each TRIG input of the LM, read from its netlist. All 15 inputs must be
    the same; the simulation uses one set."""
    with tempfile.TemporaryDirectory() as d:
        net = os.path.join(d, 'lm.net')
        subprocess.run(['kicad-cli', 'sch', 'export', 'netlist', sch, '-o', net], check=True, capture_output=True)
        s = open(net, encoding='utf-8').read()
    vals = dict(re.findall(r'\(comp\s*\(ref "([^"]+)"\)\s*\(value "([^"]*)"', s))
    nets, pin_net = {}, {}
    for m in re.finditer(r'\(net\s*\(code "\d+"\)\s*\(name "([^"]+)"\)(.*?)\n\t\t\)\n', s, re.S):
        nets[m[1]] = re.findall(r'\(ref "([^"]+)"\)\s*\(pin "([^"]+)"\)', m[2])
        for n in nets[m[1]]:
            pin_net[n] = m[1]
    found = {}
    for name, nodes in nets.items():
        if not re.fullmatch(r'/TRIG_[ABC]\d', name):
            continue
        rs = [(r, p) for r, p in nodes if r.startswith('R')]
        assert len(rs) == 1, f'{name}: expected one series resistor, found {rs}'
        r, p = rs[0]
        other = (r, str(int(p) + 1 if int(p) % 2 else int(p) - 1))   # R_Pack04: pins 1-2, 3-4, ...
        d = nets[pin_net[other]]
        caps = [vals[x] for x, _ in d if x.startswith('C')]
        pulls = [vals[x] for x, _ in d if x.startswith('R') and x != r]
        found[name] = (si(vals[r]), si(pulls[0]) if pulls else None, si(caps[0]) if caps else 0.0)
    sets = set(found.values())
    assert len(found) == 15 and len(sets) == 1, f'LM inputs differ: {found}'
    rs, rpd, cf = sets.pop()
    return dict(Rs=rs, Rpd=rpd, Cf=cf)


# ---- netlist ----------------------------------------------------------------------------------------------------
def cable(lines, tag, wires, length, pairs_of, P, a_end, b_end):
    """Coupled RLC ladder. wires: names; a_end/b_end: wire -> end node; pairs_of(w1, w2) -> 'pair' | 'x'."""
    n = max(1, round(length / SEG_M))
    dl = length / n
    node = lambda w, j: a_end[w] if j == 0 else b_end[w] if j == n else f'{tag}_{w}_{j}'
    caps = {}
    for j in range(n):
        for w in wires:
            lines.append(f'R{tag}_{w}_{j} {node(w, j)} {tag}_{w}_{j}m {P["R"] * dl:.6g}')
            lines.append(f'L{tag}_{w}_{j} {tag}_{w}_{j}m {node(w, j + 1)} {P["L"] * dl:.6g}')
        for i, w1 in enumerate(wires):
            for w2 in wires[i + 1:]:
                kind = pairs_of(w1, w2)
                lines.append(f'K{tag}_{w1}_{w2}_{j} L{tag}_{w1}_{j} L{tag}_{w2}_{j} {P["k" + kind]}')
        for end in (j, j + 1):           # pi section: half of each segment's C at each end
            for i, w1 in enumerate(wires):
                caps[(node(w1, end), '0')] = caps.get((node(w1, end), '0'), 0) + P['Cenv'] * dl / 2
                for w2 in wires[i + 1:]:
                    key = (node(w1, end), node(w2, end))
                    caps[key] = caps.get(key, 0) + P['C' + pairs_of(w1, w2)] * dl / 2
    for k, ((a, b), c) in enumerate(caps.items()):
        if a != b:
            lines.append(f'C{tag}_{k} {a} {b} {c:.6g}')


def netlist(length_m, P, lm, pressed):
    L = [f'crosstalk {pressed}', 'Vcc vcc 0 5', 'Rcc vcc lm5v 0.05']
    # LM: RJ45 pin 1 is 5V; each TRIG pin goes through the series R to the latch input (pulldown, filter C, Cin).
    a_end, b_end = {}, {}
    for pin, sig in CAT5_PIN.items():
        w = f'w{pin}'
        if sig == '5V':
            a_end[w], b_end[w] = 'lm5v', 'lmm5v'
        elif sig:
            a_end[w], b_end[w] = f'lm_{sig}', f'lmm_{sig}'
            L.append(f'Rs_{sig} lm_{sig} d_{sig} {lm["Rs"]:g}')
            L.append(f'Rpd_{sig} d_{sig} 0 {lm["Rpd"]:g}')
            L.append(f'Cin_{sig} d_{sig} 0 {C_IN:g}')
            L.append(f'Dhi_{sig} d_{sig} lm5v dclamp')     # the latch input's ESD clamp diodes
            L.append(f'Dlo_{sig} 0 d_{sig} dclamp')
            if lm['Cf']:
                L.append(f'Cf_{sig} d_{sig} 0 {lm["Cf"]:g}')
        else:                            # unused conductor: floating at both ends
            a_end[w], b_end[w] = f'nc{pin}a', f'nc{pin}b'
            L += [f'Rnc{pin}a nc{pin}a 0 1e9', f'Rnc{pin}b nc{pin}b 0 1e9']
    pair = {w: k for k, pr in enumerate(PAIRS) for w in (f'w{pr[0]}', f'w{pr[1]}')}
    cable(L, 'cat5', [f'w{p}' for p in CAT5_PIN], length_m,
          lambda a, b: 'pair' if pair[a] == pair[b] else 'x', P, a_end, b_end)
    # LMM is connectors only. Each trigger has its own 2-wire cord (5V, TRIGk) and a switch at the far end.
    cordP = dict(R=P['cord_R'], L=P['cord_L'], kpair=P['cord_k'], Cpair=P['cord_C'], Cenv=P['cord_Cenv'])
    for sig in TRIGS:
        cable(L, f'cord{sig[-1]}', ['p', 't'], CORD_FT * FT, lambda a, b: 'pair', cordP,
              {'p': 'lmm5v', 't': f'lmm_{sig}'}, {'p': f'sw5v_{sig}', 't': f'sw_{sig}'})
        if sig == pressed:
            L.append(f'S_{sig} sw5v_{sig} sw_{sig} ctl 0 swm')
        else:
            L.append(f'Roff_{sig} sw5v_{sig} sw_{sig} 1e9')
    L += [f'Vctl ctl 0 PWL(0 0 {T_PRESS:g} 0 {T_PRESS + 1e-9:g} 1)',
          '.model swm sw vt=0.5 vh=0.1 ron=0.05 roff=1e9',
          '.model dclamp d is=1e-14 rs=10 cjo=1p',
          f'.tran 1n {T_END:g} 0 2n', '.end']
    return L


# ---- ngspice ------------------------------------------------------------------------------------------------------
class NgSpice:
    class _Vec(ctypes.Structure):
        _fields_ = [('name', ctypes.c_char_p), ('type', ctypes.c_int), ('flags', ctypes.c_short),
                    ('real', ctypes.POINTER(ctypes.c_double)), ('comp', ctypes.c_void_p), ('len', ctypes.c_int)]

    def __init__(self):
        path = ctypes.util.find_library('ngspice') or 'libngspice.so.0'
        try:
            self.lib = ctypes.CDLL(path)
        except OSError:
            sys.exit('libngspice not found: install KiCad (or the libngspice0 package)')
        self.log = []
        pf = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_void_p)
        ef = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_int, ctypes.c_bool, ctypes.c_bool, ctypes.c_int, ctypes.c_void_p)
        self._cb = (pf(lambda s, i, u: self.log.append(s.decode(errors='replace')) or 0),
                    pf(lambda s, i, u: 0), ef(lambda *a: 0))
        self.lib.ngSpice_Init(*self._cb, None, None, None, None)
        self.lib.ngGet_Vec_Info.restype = ctypes.POINTER(self._Vec)

    def run(self, lines):
        self.log.clear()
        self.lib.ngSpice_Command(b'destroy all')
        self.lib.ngSpice_Command(b'remcirc')
        arr = [l.encode() for l in lines] + [None]
        self.lib.ngSpice_Circ((ctypes.c_char_p * len(arr))(*arr))
        if self.lib.ngSpice_Command(b'run') or any('rror' in l for l in self.log):
            sys.exit('ngspice failed:\n' + '\n'.join(l for l in self.log if 'rror' in l or 'arning' in l))

    def vec(self, name):
        p = self.lib.ngGet_Vec_Info(name.encode())
        if not p:
            raise KeyError(name)
        v = p.contents
        return v.real[:v.len]


# ---- cases ------------------------------------------------------------------------------------------------------
def simulate(ng, length_ft, corner, lm, pressed):
    ng.run(netlist(length_ft * FT, CORNERS[corner], lm, pressed))
    t = ng.vec('time')
    v = {s: ng.vec(f'v(d_{s})') for s in TRIGS}
    cross = next((t[i] for i, x in enumerate(v[pressed]) if x > VT and t[i] > T_PRESS), None)
    if cross is None:
        return t, v, None, {}
    a, b = cross + WINDOW[0], cross + WINDOW[1]
    peaks = {s: max(x for ti, x in zip(t, v[s]) if a <= ti <= b) for s in TRIGS if s != pressed}
    return t, v, cross - T_PRESS, peaks


def sweep(ng, lm, label):
    filt = f'{lm["Cf"] * 1e9:g} nF filter' if lm['Cf'] else 'no filter'
    print(f'\n{label}: {lm["Rs"]:g} ohm series, {lm["Rpd"]:g} ohm pulldown, {filt}')
    print(f'  {"cable":>6} {"corner":<6} {"pressed":<7} {"crosses VT":>10}   worst idle line in the latch window')
    worst, missed = (0.0, None), []
    for length in LENGTHS_FT:
        for corner in CORNERS:
            for pressed in TRIGS:
                t, v, rise, peaks = simulate(ng, length, corner, lm, pressed)
                if rise is None:
                    missed.append(f'{length} ft {corner} {pressed}')
                    print(f'  {length:>4}ft {corner:<6} {pressed:<7} {"never":>10}   (press not detected)')
                    continue
                victim = max(peaks, key=peaks.get)
                flag = '  > VIL' if peaks[victim] > VIL else ''
                print(f'  {length:>4}ft {corner:<6} {pressed:<7} {rise * 1e9:>7.0f} ns   {victim} {peaks[victim]:.2f} V{flag}')
                if peaks[victim] >= worst[0]:
                    worst = (peaks[victim], (length, corner, pressed, victim, t, v))
    return worst, missed


PLOT_US = 4


def plot(path, cases):
    try:
        import matplotlib
    except ImportError:
        print('plot skipped: matplotlib is not installed (pip install matplotlib)')
        return
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, len(cases), figsize=(6 * len(cases), 4), sharey=True)
    for ax, (title, (peak, (length, corner, pressed, victim, t, v))) in zip(axes, cases):
        us = [x * 1e6 for x in t]
        ax.plot(us, v[pressed], label=f'{pressed} (pressed)')
        ax.plot(us, v[victim], label=f'{victim} (idle)')
        tc = T_PRESS + next(t[i] - T_PRESS for i, x in enumerate(v[pressed]) if x > VT and t[i] > T_PRESS)
        ax.axvspan((tc + WINDOW[0]) * 1e6, (tc + WINDOW[1]) * 1e6, color='grey', alpha=0.12, lw=0)
        ax.axhline(VIL, ls='--', c='grey', lw=1)
        ax.axhline(VIH, ls=':', c='grey', lw=1)
        ax.text(PLOT_US, VIL, 'VIL ', va='bottom', ha='right', fontsize=8)
        ax.text(PLOT_US, VIH, 'VIH ', va='bottom', ha='right', fontsize=8)
        ax.set_title(f'{title}\n{length} ft Cat5, {corner} cable (shaded: latch window)', fontsize=10)
        ax.set_xlabel('time (µs)')
        ax.set_xlim(0, PLOT_US)
        ax.legend(loc='upper right', fontsize=8)
    axes[0].set_ylabel('latch input (V)')
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    print(f'plot: {path}')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true', help='exit 1 on a failure (for CI)')
    ap.add_argument('--plot', metavar='PNG', help='save the worst waveforms with and without the filter')
    ap.add_argument('--lm-sch', default=os.path.join(ROOT, 'kicad', 'lm', 'lm.kicad_sch'))
    a = ap.parse_args()

    lm = lm_inputs(a.lm_sch)
    ng = NgSpice()
    drawn, missed = sweep(ng, lm, 'LM as drawn')
    orig, _ = sweep(ng, dict(lm, Cf=0.0), 'Original fault (filter capacitors removed)')

    if missed:
        print(f'\nFAIL: presses not detected: {", ".join(missed)}')
    ok_design = drawn[0] < VIL and not missed
    ok_model = orig[0] > VIL
    print(f'\nAs drawn: worst idle line {drawn[0]:.2f} V, limit {VIL} V (VIL): ' + ('ok' if ok_design else 'FAIL'))
    print(f'Model check: without the filter, worst idle line {orig[0]:.2f} V; it must exceed {VIL} V to match the '
          'original fault: ' + ('ok' if ok_model else 'FAIL (model too optimistic)'))
    if a.plot:
        plot(a.plot, [('LM as drawn', drawn), ('Filter capacitors removed', orig)])
    if a.check and not (ok_design and ok_model):
        sys.exit(1)


if __name__ == '__main__':
    main()

#!/usr/bin/env bash
# Design checks for the KiCad boards: ERC, and DRC with schematic/board parity. When LM is checked, also the trigger
# crosstalk simulation (sim/crosstalk.py), which reads LM's input network from its schematic. Always also checks that
# the BOM tables in components/README.md match the schematics (tools/bom/bom.mjs), and that every board's VERSION is
# x.y.z and the release script's tests pass (tools/release/release.mjs); those two need Node and take about 2 s.
# Fails (exit 1) on any error-severity violation that hasn't been excluded in KiCad, or a failed simulation; warnings
# are reported but pass. Full reports (JSON) are written to build/kicad/<board>/ and build/sim/.
#
# ERC and DRC run once each, side by side (tools/kicad/violations.py reads the errors from the JSON report): about 5 s
# a board. The simulation spreads its cases over every core: about 10 s.
#
#   tools/kicad/check.sh            # all boards
#   tools/kicad/check.sh lm         # one board (what the release script runs)
#   tools/kicad/check.sh --fab      # also write gerbers, drill files, BOM, schematic PDF and a 3D render
set -uo pipefail

cd "$(dirname "$0")/../.."
FAB=0
BOARDS=()
for a in "$@"; do
  case $a in
    --fab) FAB=1 ;;
    *) BOARDS+=("$a") ;;
  esac
done
[ ${#BOARDS[@]} -eq 0 ] && BOARDS=(lm lmm trigger)
for b in "${BOARDS[@]}"; do
  [ -f "kicad/$b/$b.kicad_pcb" ] || { echo "$b: no such board (kicad/$b/$b.kicad_pcb)"; exit 1; }
done

status=0
result() {
  [ -f "$1" ] || { echo "    $1: kicad-cli wrote no report"; return 1; }
  python3 tools/kicad/violations.py "$1"
}
for b in "${BOARDS[@]}"; do
  sch=kicad/$b/$b.kicad_sch
  pcb=kicad/$b/$b.kicad_pcb
  out=build/kicad/$b
  mkdir -p "$out"
  rm -f "$out"/{erc,drc}{.rpt,-errors.rpt,.json}
  # A board's ERC and DRC run side by side; more kicad-cli runs at once than that gain nothing (each is multithreaded).
  # Excluded violations are left out of the reports, so only real errors fail.
  kicad-cli sch erc --severity-error --severity-warning --format json -o "$out/erc.json" "$sch" >/dev/null 2>&1 &
  kicad-cli pcb drc --schematic-parity --severity-error --severity-warning --format json -o "$out/drc.json" "$pcb" >/dev/null 2>&1 &
  wait
  erc_out=$(result "$out/erc.json"); erc=$?
  drc_out=$(result "$out/drc.json"); drc=$?

  printf '%-8s ERC %-6s DRC %s\n' "$b" "$([ $erc = 0 ] && echo ok || echo FAIL)" "$([ $drc = 0 ] && echo ok || echo FAIL)"
  if [ $erc != 0 ] || [ $drc != 0 ]; then
    status=1
    # the errors of each failing report, so CI logs show what broke
    [ -n "$erc_out" ] && echo "$erc_out"
    [ -n "$drc_out" ] && echo "$drc_out"
  fi

  if [ $FAB = 1 ]; then
    mkdir -p "$out/gerbers"
    kicad-cli pcb export gerbers --check-zones -l F.Cu,B.Cu,F.Mask,B.Mask,F.Silkscreen,B.Silkscreen,Edge.Cuts \
      -o "$out/gerbers/" "$pcb" >/dev/null
    kicad-cli pcb export drill -o "$out/gerbers/" "$pcb" >/dev/null
    kicad-cli sch export bom --fields 'Reference,Value,MPN,Footprint,${QUANTITY},Datasheet' \
      --labels 'Refs,Value,MPN,Footprint,Qty,Datasheet' --group-by 'Value,MPN,Footprint' \
      --exclude-dnp -o "$out/bom.csv" "$sch" >/dev/null
    kicad-cli sch export pdf -o "$out/$b-schematic.pdf" "$sch" >/dev/null
    kicad-cli pcb render --side top --quality basic --width 1600 --height 1200 -o "$out/$b-top.png" "$pcb" >/dev/null 2>&1 \
      || echo "    (3D render skipped: needs KiCad's 3D model library)"
  fi
done

if [[ " ${BOARDS[*]} " == *" lm "* ]]; then
  mkdir -p build/sim
  plot=()
  [ $FAB = 1 ] && plot=(--plot build/sim/crosstalk.png)
  if python3 sim/crosstalk.py --check "${plot[@]}" > build/sim/crosstalk.txt 2>&1; then
    echo "sim      crosstalk ok"
  else
    echo "sim      crosstalk FAIL"
    status=1
  fi
  sed -n '/^As drawn/,$p' build/sim/crosstalk.txt | sed 's/^/    /'
fi

if command -v node >/dev/null; then
  if node tools/bom/bom.mjs --check >/dev/null 2>build/bom-check.txt; then
    echo "bom      components/README.md ok"
  else
    echo "bom      components/README.md FAIL"
    sed 's/^/    /' build/bom-check.txt
    status=1
  fi
  if node tools/release/release.mjs check >/dev/null 2>build/release-check.txt \
      && node --test tools/release/release.test.mjs >>build/release-check.txt 2>&1; then
    echo "release  board versions and release script ok"
  else
    echo "release  FAIL"
    grep -E '^release:|^not ok' build/release-check.txt | sed 's/^/    /'
    status=1
  fi
elif [ -n "${CI:-}" ]; then
  echo "bom      FAIL: node is not installed (needed for the BOM and release checks)"
  status=1
else
  echo "bom      skipped (node is not installed; so is the release check)"
fi
exit $status

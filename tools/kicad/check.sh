#!/usr/bin/env bash
# Design checks for every KiCad board: ERC, and DRC with schematic/board parity. When LM is checked, also the trigger
# crosstalk simulation (sim/crosstalk.py), which reads LM's input network from its schematic.
# Fails (exit 1) on any error-severity violation that hasn't been excluded in KiCad, or a failed simulation; warnings
# are reported but pass. Full reports are written to build/kicad/<board>/ and build/sim/.
#
#   tools/kicad/check.sh            # all boards
#   tools/kicad/check.sh lm         # one board
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

status=0
for b in "${BOARDS[@]}"; do
  sch=kicad/$b/$b.kicad_sch
  pcb=kicad/$b/$b.kicad_pcb
  out=build/kicad/$b
  mkdir -p "$out"

  kicad-cli sch erc --severity-all -o "$out/erc.rpt" "$sch" >/dev/null
  kicad-cli sch erc --severity-error --exit-code-violations -o "$out/erc-errors.rpt" "$sch" >/dev/null
  erc=$?
  kicad-cli pcb drc --schematic-parity --severity-all -o "$out/drc.rpt" "$pcb" >/dev/null
  kicad-cli pcb drc --schematic-parity --severity-error --exit-code-violations -o "$out/drc-errors.rpt" "$pcb" >/dev/null
  drc=$?

  printf '%-8s ERC %-6s DRC %s\n' "$b" "$([ $erc = 0 ] && echo ok || echo FAIL)" "$([ $drc = 0 ] && echo ok || echo FAIL)"
  if [ $erc != 0 ] || [ $drc != 0 ]; then
    status=1
    # the error lines of each failing report, so CI logs show what broke
    for r in erc-errors drc-errors; do
      grep -E '^\[|^    @' "$out/$r.rpt" | sed 's/^/    /'
    done
  fi

  if [ $FAB = 1 ]; then
    mkdir -p "$out/gerbers"
    kicad-cli pcb export gerbers -l F.Cu,B.Cu,F.Mask,B.Mask,F.Silkscreen,B.Silkscreen,Edge.Cuts \
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
exit $status

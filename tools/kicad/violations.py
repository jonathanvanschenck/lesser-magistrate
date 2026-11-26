#!/usr/bin/env python3
"""Count the error-severity violations in a kicad-cli ERC or DRC JSON report, and print them.

    python3 tools/kicad/violations.py build/kicad/lm/erc.json [build/kicad/lm/drc.json ...]

Exits 1 if any report has an error; warnings never fail. With this, check.sh needs one kicad-cli run per check instead
of a second one with --exit-code-violations. check.sh asks kicad-cli for errors and warnings only, which leaves out the
violations excluded in KiCad (an "excluded" flag is honoured too, for reports made with --severity-all).
"""
import json
import sys


def violations(report):
    """Every violation in an ERC report (grouped by sheet) or a DRC report (violations, unconnected, parity)."""
    for sheet in report.get("sheets", []):
        yield from sheet.get("violations", [])
    for key in ("violations", "unconnected_items", "schematic_parity"):
        yield from report.get(key, [])


def main(paths):
    failed = False
    for path in paths:
        with open(path) as f:
            report = json.load(f)
        errors = [v for v in violations(report) if v.get("severity") == "error" and not v.get("excluded")]
        for v in errors:
            failed = True
            print(f"    {path}: [{v.get('type')}] {v.get('description')}")
            for item in v.get("items", []):
                pos = item.get("pos", {})
                print(f"        @({pos.get('x', 0):.3f}, {pos.get('y', 0):.3f}): {item.get('description')}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

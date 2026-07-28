#!/usr/bin/env python3
"""Verify AXIOM zero-gas SLO from operation-level evidence.

Expected JSONL fields per operation:
- operation_id: str
- onchain_write: bool
- category: str (required when onchain_write=true)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

DEFAULT_ALLOWLIST = {
    "dispute",
    "settlement_finality",
    "governance_checkpoint",
    "treasury_accounting",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify >=99.9% $0.00 operation SLO")
    parser.add_argument(
        "--input",
        default="evidence/gas/GAS-2026-03-25/sample_operations.jsonl",
        help="Path to JSONL operation evidence",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.999,
        help="Required off-chain ratio (default: 0.999)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    path = Path(args.input)

    if not path.exists():
        print(f"Missing evidence file: {path}")
        return 1

    total = 0
    onchain = 0
    bad_categories: list[str] = []

    with path.open("r", encoding="utf-8") as handle:
        for line_number, raw in enumerate(handle, start=1):
            raw = raw.strip()
            if not raw:
                continue

            try:
                event = json.loads(raw)
            except json.JSONDecodeError as exc:
                print(f"Invalid JSON at line {line_number}: {exc}")
                return 1

            total += 1
            if bool(event.get("onchain_write")):
                onchain += 1
                category = str(event.get("category", ""))
                if category not in DEFAULT_ALLOWLIST:
                    bad_categories.append(f"line {line_number}: {category or '<missing>'}")

    if total == 0:
        print("No operations found in evidence; cannot evaluate SLO")
        return 1

    offchain_ratio = (total - onchain) / total
    print(f"total={total} onchain={onchain} offchain_ratio={offchain_ratio:.6f}")

    if bad_categories:
        print("Disallowed on-chain categories detected:")
        for entry in bad_categories:
            print(f"- {entry}")
        return 1

    if offchain_ratio < args.threshold:
        print(
            f"FAILED: off-chain ratio {offchain_ratio:.6f} below threshold {args.threshold:.6f}"
        )
        return 1

    print("PASSED: gas target SLO satisfied")
    return 0


if __name__ == "__main__":
    sys.exit(main())

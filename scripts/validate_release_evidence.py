#!/usr/bin/env python3
"""Validate AXIOM-MESH release evidence package structure and gate summary."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REQUIRED_DIRS = [
    "security",
    "financial",
    "reliability",
    "ecosystem",
    "governance",
    "exceptions",
]
REQUIRED_SUMMARY_KEYS = ["security", "financial", "reliability", "ecosystem", "governance"]
VALID_STATUSES = {"pass", "fail", "exception"}


def validate_structure(rc_path: Path) -> list[str]:
    errors: list[str] = []

    if not rc_path.exists():
        return [f"RC path does not exist: {rc_path}"]
    if not rc_path.is_dir():
        return [f"RC path is not a directory: {rc_path}"]

    for name in REQUIRED_DIRS:
        path = rc_path / name
        if not path.exists() or not path.is_dir():
            errors.append(f"Missing required directory: {path}")

    summary_md = rc_path / "summary.md"
    summary_json = rc_path / "summary.json"

    if not summary_md.exists():
        errors.append(f"Missing required summary markdown file: {summary_md}")

    if not summary_json.exists():
        errors.append(f"Missing required summary JSON file: {summary_json}")
        return errors

    try:
        payload = json.loads(summary_json.read_text())
    except json.JSONDecodeError as exc:
        errors.append(f"summary.json is not valid JSON: {exc}")
        return errors

    gates = payload.get("gates")
    if not isinstance(gates, dict):
        errors.append("summary.json must contain a top-level 'gates' object")
        return errors

    for key in REQUIRED_SUMMARY_KEYS:
        if key not in gates:
            errors.append(f"Missing gate status in summary.json: gates.{key}")
            continue
        value = str(gates[key]).strip().lower()
        if value not in VALID_STATUSES:
            errors.append(
                f"Invalid gate status for {key}: {gates[key]!r} (allowed: {sorted(VALID_STATUSES)})"
            )

    decision = str(payload.get("decision", "")).strip().lower()
    if decision not in {"go", "no-go"}:
        errors.append("summary.json must contain 'decision' set to 'go' or 'no-go'")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate release evidence package structure")
    parser.add_argument("rc_path", type=Path, help="Path to RC evidence folder")
    args = parser.parse_args()

    errors = validate_structure(args.rc_path)
    if errors:
        print("Release evidence validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"Release evidence validation passed: {args.rc_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

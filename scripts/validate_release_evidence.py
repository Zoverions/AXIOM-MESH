#!/usr/bin/env python3
"""Validate AXIOM-MESH release evidence package structure and gate summary."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable

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


class ValidationError(Exception):
    """Raised when evidence validation fails."""


def _contains_any_file(path: Path) -> bool:
    return any(child.is_file() for child in path.rglob("*"))


def _validate_required_dirs(rc_path: Path, strict_artifacts: bool) -> list[str]:
    errors: list[str] = []
    for name in REQUIRED_DIRS:
        dir_path = rc_path / name
        if not dir_path.exists() or not dir_path.is_dir():
            errors.append(f"Missing required directory: {dir_path}")
            continue

        # In strict mode we require at least one artifact file in each gate directory.
        if strict_artifacts and name != "exceptions" and not _contains_any_file(dir_path):
            errors.append(
                f"Strict artifacts enabled, but directory has no evidence files: {dir_path}"
            )

    return errors


def _read_summary_json(summary_json: Path) -> dict:
    try:
        payload = json.loads(summary_json.read_text())
    except json.JSONDecodeError as exc:
        raise ValidationError(f"summary.json is not valid JSON: {exc}") from exc

    if not isinstance(payload, dict):
        raise ValidationError("summary.json must be a JSON object")
    return payload


def _validate_gates(payload: dict, rc_path: Path) -> list[str]:
    errors: list[str] = []
    gates = payload.get("gates")

    if not isinstance(gates, dict):
        return ["summary.json must contain a top-level 'gates' object"]

    for key in REQUIRED_SUMMARY_KEYS:
        if key not in gates:
            errors.append(f"Missing gate status in summary.json: gates.{key}")
            continue

        value = str(gates[key]).strip().lower()
        if value not in VALID_STATUSES:
            errors.append(
                f"Invalid gate status for {key}: {gates[key]!r} (allowed: {sorted(VALID_STATUSES)})"
            )

    exception_gates = [k for k, v in gates.items() if str(v).strip().lower() == "exception"]
    exceptions_dir = rc_path / "exceptions"
    if exception_gates and not _contains_any_file(exceptions_dir):
        errors.append(
            "One or more gates are marked 'exception' but exceptions/ has no supporting files"
        )

    return errors


def _validate_summary_markdown(summary_md: Path, required_headings: Iterable[str]) -> list[str]:
    errors: list[str] = []
    text = summary_md.read_text().lower()

    for heading in required_headings:
        if heading.lower() not in text:
            errors.append(f"summary.md missing required section keyword: {heading}")

    return errors


def validate_structure(
    rc_path: Path,
    *,
    strict_artifacts: bool = False,
    enforce_summary_sections: bool = False,
) -> list[str]:
    errors: list[str] = []

    if not rc_path.exists():
        return [f"RC path does not exist: {rc_path}"]
    if not rc_path.is_dir():
        return [f"RC path is not a directory: {rc_path}"]

    errors.extend(_validate_required_dirs(rc_path, strict_artifacts))

    summary_md = rc_path / "summary.md"
    summary_json = rc_path / "summary.json"

    if not summary_md.exists():
        errors.append(f"Missing required summary markdown file: {summary_md}")

    if not summary_json.exists():
        errors.append(f"Missing required summary JSON file: {summary_json}")
        return errors

    try:
        payload = _read_summary_json(summary_json)
    except ValidationError as exc:
        errors.append(str(exc))
        return errors

    errors.extend(_validate_gates(payload, rc_path))

    decision = str(payload.get("decision", "")).strip().lower()
    if decision not in {"go", "no-go"}:
        errors.append("summary.json must contain 'decision' set to 'go' or 'no-go'")

    if enforce_summary_sections and summary_md.exists():
        required_sections = ["security", "financial", "reliability", "ecosystem", "governance", "decision"]
        errors.extend(_validate_summary_markdown(summary_md, required_sections))

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate release evidence package structure")
    parser.add_argument("rc_path", type=Path, help="Path to RC evidence folder")
    parser.add_argument(
        "--strict-artifacts",
        action="store_true",
        help="Require at least one artifact file in each non-exception gate directory",
    )
    parser.add_argument(
        "--enforce-summary-sections",
        action="store_true",
        help="Require summary.md to include security/financial/reliability/ecosystem/governance/decision sections",
    )
    args = parser.parse_args()

    errors = validate_structure(
        args.rc_path,
        strict_artifacts=args.strict_artifacts,
        enforce_summary_sections=args.enforce_summary_sections,
    )
    if errors:
        print("Release evidence validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"Release evidence validation passed: {args.rc_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

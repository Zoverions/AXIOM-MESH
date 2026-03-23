#!/usr/bin/env python3
"""Verify financial evidence bundle structure and manifest consistency."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BUNDLE_ROOT = Path("evidence/financial")
REQUIRED_FILES = ["manifest.json", "CONTROL-COVERAGE.md", "VERIFICATION-COMMANDS.md", "ATTESTATION.md"]
REQUIRED_MANIFEST_KEYS = ["bundle_id", "generated_on", "owner", "status", "controls_index", "files"]


def verify_bundle(bundle_dir: Path) -> list[str]:
    errors: list[str] = []

    for filename in REQUIRED_FILES:
        if not (bundle_dir / filename).exists():
            errors.append(f"{bundle_dir}: missing required file {filename}")

    manifest_path = bundle_dir / "manifest.json"
    if not manifest_path.exists():
        return errors

    try:
        manifest = json.loads(manifest_path.read_text())
    except json.JSONDecodeError as exc:
        errors.append(f"{bundle_dir}: invalid manifest.json ({exc})")
        return errors

    for key in REQUIRED_MANIFEST_KEYS:
        if key not in manifest:
            errors.append(f"{bundle_dir}: manifest missing key '{key}'")

    files = manifest.get("files", [])
    if not isinstance(files, list):
        errors.append(f"{bundle_dir}: manifest key 'files' must be a list")
    else:
        for artifact in files:
            artifact_path = bundle_dir / str(artifact)
            if not artifact_path.exists():
                errors.append(f"{bundle_dir}: manifest references missing file {artifact}")

    controls_index = manifest.get("controls_index")
    if controls_index and not Path(str(controls_index)).exists():
        errors.append(f"{bundle_dir}: controls index does not exist: {controls_index}")

    return errors


def main() -> int:
    if not BUNDLE_ROOT.exists() or not BUNDLE_ROOT.is_dir():
        print(f"Evidence root missing: {BUNDLE_ROOT}", file=sys.stderr)
        return 1

    bundles = sorted(path for path in BUNDLE_ROOT.iterdir() if path.is_dir())
    if not bundles:
        print(f"No financial evidence bundles found under {BUNDLE_ROOT}", file=sys.stderr)
        return 1

    errors: list[str] = []
    for bundle_dir in bundles:
        errors.extend(verify_bundle(bundle_dir))

    if errors:
        print("Financial evidence bundle verification failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"Financial evidence bundles verified ({len(bundles)} bundle(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

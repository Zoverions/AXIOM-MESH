#!/usr/bin/env python3
"""Validate cross-chain evidence bundle schema v2 requirements.

The gate enforces two critical invariants for all v2 artifacts:
- replay identifiers must be present and 64-char lowercase hex
- provenance signatures must be present with signer identity and HMAC digest
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

REPLAY_ID_RE = re.compile(r"^[a-f0-9]{64}$")
SIG_RE = re.compile(r"^[a-f0-9]{64}$")


def _load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON ({exc})") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{path}: root must be an object")
    return payload


def _validate_common(payload: dict[str, Any], path: Path) -> list[str]:
    errors: list[str] = []
    if payload.get("schema_version") != "cross_chain_evidence_bundle.v2":
        errors.append(f"{path}: schema_version must equal cross_chain_evidence_bundle.v2")

    replay_id = payload.get("replay_id")
    if not isinstance(replay_id, str) or not REPLAY_ID_RE.fullmatch(replay_id):
        errors.append(f"{path}: replay_id must be 64-char lowercase hex")

    provenance = payload.get("provenance_signature")
    if not isinstance(provenance, dict):
        errors.append(f"{path}: provenance_signature must be an object")
        return errors

    if provenance.get("algorithm") != "hmac-sha256":
        errors.append(f"{path}: provenance_signature.algorithm must be hmac-sha256")

    signer_id = provenance.get("signer_id")
    if not isinstance(signer_id, str) or not signer_id.strip():
        errors.append(f"{path}: provenance_signature.signer_id must be non-empty")

    signature = provenance.get("signature")
    if not isinstance(signature, str) or not SIG_RE.fullmatch(signature):
        errors.append(f"{path}: provenance_signature.signature must be 64-char lowercase hex")

    return errors


def _validate_variant(payload: dict[str, Any], path: Path) -> list[str]:
    errors: list[str] = []
    bundle_type = payload.get("bundle_type")

    if bundle_type == "sovereign_shadow":
        for key in ("generated_at_utc", "shadow_mode", "evidence_bundle", "decision"):
            if key not in payload:
                errors.append(f"{path}: missing key for sovereign_shadow bundle: {key}")
    elif bundle_type == "bridge_delay_queue":
        for key in ("queued_at_utc", "reason", "bridge_payload"):
            if key not in payload:
                errors.append(f"{path}: missing key for bridge_delay_queue bundle: {key}")
    else:
        errors.append(f"{path}: bundle_type must be sovereign_shadow or bridge_delay_queue")

    return errors


def validate_file(path: Path) -> list[str]:
    payload = _load_json(path)
    return [*_validate_common(payload, path), *_validate_variant(payload, path)]


def _collect_targets(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(p for p in root.rglob("*.json") if p.is_file())


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    target_root = repo_root / "evidence" / "cross-chain"
    targets = _collect_targets(target_root)

    if not targets:
        print(f"No cross-chain evidence JSON files found under {target_root}; skipping file scan.")

    errors: list[str] = []
    for target in targets:
        errors.extend(validate_file(target))

    if errors:
        print("Cross-chain evidence schema v2 verification failed:", file=sys.stderr)
        for err in errors:
            print(f"- {err}", file=sys.stderr)
        return 1

    print(f"Cross-chain evidence schema v2 verification passed ({len(targets)} file(s) scanned).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

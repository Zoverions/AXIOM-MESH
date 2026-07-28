#!/usr/bin/env python3
"""Fail release gating when embodied governance evidence is incomplete."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REQUIRED_TOP_LEVEL_KEYS = {
    "policy_enforcement_proof",
    "high_risk_approval_trace",
    "incident_drill_evidence",
}

REQUIRED_POLICY_KEYS = {"guardrail_audit_log", "governance_event_log"}
REQUIRED_APPROVAL_KEYS = {"approval_trace_id", "required_approvals", "approved_by"}
REQUIRED_INCIDENT_KEYS = {"drill_id", "executed_at_utc", "report_ref"}


def _validate_payload(payload: dict) -> list[str]:
    errors: list[str] = []

    missing_top = sorted(REQUIRED_TOP_LEVEL_KEYS - payload.keys())
    if missing_top:
        errors.append(f"Missing top-level keys: {', '.join(missing_top)}")
        return errors

    policy = payload.get("policy_enforcement_proof", {})
    if not isinstance(policy, dict):
        errors.append("policy_enforcement_proof must be an object")
    else:
        missing = sorted(REQUIRED_POLICY_KEYS - policy.keys())
        if missing:
            errors.append(f"policy_enforcement_proof missing: {', '.join(missing)}")

    approval = payload.get("high_risk_approval_trace", {})
    if not isinstance(approval, dict):
        errors.append("high_risk_approval_trace must be an object")
    else:
        missing = sorted(REQUIRED_APPROVAL_KEYS - approval.keys())
        if missing:
            errors.append(f"high_risk_approval_trace missing: {', '.join(missing)}")
        elif int(approval.get("required_approvals", 0)) < 2:
            errors.append("high_risk_approval_trace.required_approvals must be >= 2")

    incident = payload.get("incident_drill_evidence", {})
    if not isinstance(incident, dict):
        errors.append("incident_drill_evidence must be an object")
    else:
        missing = sorted(REQUIRED_INCIDENT_KEYS - incident.keys())
        if missing:
            errors.append(f"incident_drill_evidence missing: {', '.join(missing)}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Check embodied governance evidence bundle")
    parser.add_argument("evidence_json", type=Path, help="Path to embodied governance evidence JSON")
    args = parser.parse_args()

    if not args.evidence_json.exists():
        print(f"Evidence file does not exist: {args.evidence_json}", file=sys.stderr)
        return 1

    try:
        payload = json.loads(args.evidence_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"Evidence file is not valid JSON: {exc}", file=sys.stderr)
        return 1

    if not isinstance(payload, dict):
        print("Evidence JSON root must be an object", file=sys.stderr)
        return 1

    errors = _validate_payload(payload)
    if errors:
        print("Embodied governance evidence gate failed:", file=sys.stderr)
        for err in errors:
            print(f"- {err}", file=sys.stderr)
        return 1

    print(f"Embodied governance evidence gate passed: {args.evidence_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# Sentience-Uncertainty Safeguard Protocol (EW.4)

**Status:** Implemented policy + runtime enforcement hooks.  
**Last updated:** 2026-04-07.

## Purpose

Defines how AXIOM-MESH handles uncertain sentience/agency signals during embodied or high-autonomy task execution.

## Detection Triggers

A task enters sentience-uncertainty flow when either condition is met:

1. `sentience_uncertainty_score >= SENTIENCE_UNCERTAINTY_THRESHOLD` (default `0.7`).
2. `sentience_trigger` is explicitly set with a non-empty indicator.

## Escalation Board Workflow

When a trigger is detected:

1. Task **must** set `protected_mode=true`.
2. Task **must** include `escalation_board` with at least `ESCALATION_BOARD_MIN_MEMBERS` members (default `3`).
3. Runtime emits governance event `sentience_uncertainty` with status `escalated` if policy passes.
4. If any requirement fails, task is blocked and governance event is written with status `blocked`.

## Protected Mode Requirements

Protected mode represents constrained execution under heightened oversight:

- Human-supervised review board present.
- No bypass of fleet/autonomy/risk policy checks.
- No bypass of embodied guardrail checks (geofence/tool/time/force/emergency halt).
- Immutable governance event logging enabled.

## Governance Event Log Wiring

Events are appended as JSONL to `GOVERNANCE_EVENT_AUDIT_LOG` (default `logs/governance_events.audit.log`).

Event types currently emitted by scheduler runtime:

- `sentience_uncertainty`
- `embodied_evidence_gate`

## Release/Evidence Linkage

See EW.5 evidence gate controls in:

- `scripts/check_embodied_governance_evidence.py`
- `.github/workflows/embodied-governance-evidence.yml`

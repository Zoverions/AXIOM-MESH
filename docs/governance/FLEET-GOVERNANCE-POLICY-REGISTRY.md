# Fleet Governance Policy Registry (Canonical)

**Version:** 2026-04-07  
**Status:** Active  
**Purpose:** Defines contract-facing policy keys for federated embodied fleet governance overlays.

## 1) Federated Scope Layers

Policy is resolved from strictest combination of:

1. `global` baseline (network-wide floor)
2. `national` overlay (jurisdiction controls)
3. `business` / `municipal` / `community` overlay (mission-site controls)

Resolution rule: higher-risk or more restrictive value wins; explicit deny always wins.

## 2) Contract Policy Keys

| Key | Type | Description | Example |
|---|---|---|---|
| `fleet.scope` | enum | Federated scope of scheduled task. | `community`, `municipal`, `business`, `national`, `global` |
| `fleet.autonomy.level` | enum | Operational autonomy of task. | `manual`, `assisted`, `supervised`, `autonomous` |
| `fleet.risk.class` | enum | Risk tier used by scheduler and enforcement. | `low`, `medium`, `high`, `critical` |
| `fleet.required.approvals` | uint | Approval count required before execution. | `0`, `1`, `2`, `3+` |
| `fleet.override.allowed` | bool | Whether lower scopes may override this policy key. | `false` |
| `fleet.effective.layer` | enum | Layer that authored effective merged value. | `global`, `national`, `business`, `municipal`, `community` |

## 3) Minimum Enforcement Rules

1. `fleet.risk.class in {high, critical}` MUST have `fleet.required.approvals >= 2`.
2. `fleet.autonomy.level == autonomous` MUST have `fleet.required.approvals > 0`.
3. `fleet.scope in {national, global}` MUST route away from local-only execution paths.
4. Lower-layer policies cannot relax deny constraints from higher layers.

## 4) Scheduler Mapping

The hypervisor task scheduler request schema carries the following governance fields:

- `fleet_scope`
- `autonomy_level`
- `risk_class`
- `required_approvals`

These are evaluated before scheduling and included in route selection context.

## 5) Upgrade/Change Control

Any change to key names, enums, or minimum rules requires:

1. Governance proposal trail,
2. Updated canonical docs (`GOVERNANCE.md` + this file),
3. Test coverage showing enforcement behavior.

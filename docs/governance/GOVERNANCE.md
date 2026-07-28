# AXIOM-MESH Governance (Canonical)

**Document role:** Canonical governance model and decision-rights map.
**Last updated:** 2026-04-07.
**Scope:** Governance structure, authority transitions, controls, and emergency mechanisms.

---

## 1) Governance Objectives

Governance exists to guarantee that AXIOM-MESH evolves through **verifiable, auditable, and reversible** decisions rather than unilateral control.

Primary objectives:
1. Protect users/operators from unsafe or opaque changes.
2. Ensure economic and protocol parameter changes are controlled.
3. Preserve continuity under incident conditions.
4. Transition authority from bootstrap-era concentration to distributed stewardship.

---

## 2) Governance Layers

AXIOM-MESH uses layered governance rather than a single voting primitive.

1. **Operational Governance (Runbooks + Controls)**
   - Day-to-day approvals and production gates.
   - Change windows, release criteria, exception tracking.
2. **Protocol Governance (Contracts + Parameters)**
   - Tokenomics, slashing/reward variables, bridge/finality controls.
   - Controlled by explicit proposal/approval/execution flow.
3. **Strategic Governance (Roadmap + Program Direction)**
   - Priority selection and long-horizon sequencing.
   - Anchored in canonical roadmap and execution queue.

---

## 3) Decision Rights (Canonical Split)

### 3.1 Governance-Critical Decisions
Require formal proposal + approval trail + evidence bundle:
- Contract upgrade paths and upgrade timelocks.
- Tokenomics parameter changes.
- Security policy changes that alter trust boundaries.
- Mainnet/testnet promotion decisions.

### 3.2 Operational Decisions
Can be executed by role owners under runbook controls:
- Incident response actions.
- Routine deployment and rollback.
- Non-breaking operational tuning.

### 3.3 Documentation-Control Decisions
Documentation changes are governance-relevant when they alter:
- Claimed implementation status.
- Security guarantees.
- Economic commitments.

### 3.4 Embodied Fleet Governance Decisions
Embodied and high-autonomy workloads follow federated authority overlays:

1. **Global/Community Baseline**
   - Defines non-negotiable safety floor and audit requirements across all deployments.
   - Controls baseline guardrail keys and minimum approval counts for high-risk autonomous tasks.
2. **National Overlay**
   - Adds jurisdiction-specific constraints (safety regulations, labor boundaries, data locality).
   - Can tighten baseline controls; cannot weaken them.
3. **Business/Municipal/Community Overlay**
   - Applies mission/site-specific restrictions (facility geofence, shift windows, approved tools).
   - Can tighten national/global policy; cannot loosen either.

Conflict handling rule:
- The effective policy is the strictest combined result of baseline + national + local overlay.
- A local policy cannot override higher-layer deny constraints.

---

## 4) Authority Transition Model

AXIOM-MESH documents a transition away from concentrated bootstrap authority toward distributed governance.

Required characteristics of the transition:
1. **Explicit phases** with objective entry/exit criteria.
2. **No silent authority jumps**; every transition produces an auditable record.
3. **Emergency brake compatibility** throughout transition phases.
4. **Parameter provenance** (who changed what, when, under which policy basis).

Related references:
- `docs/FOUNDER-CONTROLS-AND-ALLOCATION.md`
- `docs/GOVERNANCE-CONTROL-MAP.md`

---

## 5) Control Requirements

All governance operations must satisfy:

- **Proposal integrity:** immutable identifiers and rationale.
- **Review integrity:** role/accountability and approval quorum traceability.
- **Execution integrity:** deterministic execution path and event logs.
- **Post-change verification:** checks proving intended vs actual system state.
- **Rollback readiness:** pre-defined reversal path for high-risk changes.

---

## 6) Emergency Governance

Emergency governance exists to limit blast radius under active risk.

Allowed emergency actions (bounded):
- Pause/limit vulnerable pathways.
- Activate degraded-mode procedures.
- Freeze high-risk parameter changes.
- Trigger incident communication and audit capture.

Emergency actions must be:
- Time-bounded,
- Justified in writing,
- Retrospectively reviewed,
- Converted to normal governance decisions when the incident stabilizes.

---

## 7) Canonical Governance Artifacts

Use these documents together:
- `docs/GOVERNANCE-CONTROL-MAP.md` — control ownership and mapping.
- `docs/OPERATIONS.md` — incident/change runbook execution.
- `docs/MASTER-TODO.md` — active execution truth.
- `docs/ROADMAP.md` — strategic direction and milestones.
- `docs/governance/FLEET-GOVERNANCE-POLICY-REGISTRY.md` — federated fleet policy keys and contract-facing identifiers.
- `docs/governance/SENTIENCE-UNCERTAINTY-SAFEGUARD-PROTOCOL.md` — sentience trigger, protected-mode, escalation board, and governance event logging protocol.

If conflicts exist, active execution truth is in `docs/MASTER-TODO.md`; governance policy intent is defined here.

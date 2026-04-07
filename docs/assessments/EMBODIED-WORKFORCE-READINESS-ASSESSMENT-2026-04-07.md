# Embodied Workforce Readiness Assessment (2026-04-07)

## Purpose
Assess what AXIOM-MESH already has for governing automated/embodied workforces (including national/business fleets), identify concrete gaps for open-ended autonomy, and define execution tasks to land in the canonical queue.

## Executive Summary
AXIOM-MESH already contains major primitives needed to pilot embodied workforce orchestration:
- hierarchical governance structures,
- programmable contracting + treasury routing,
- node capability-aware scheduling,
- and narrow-agent task frameworks.

The core gap is **not foundational architecture**; it is policy-enforced implementation for:
1. fleet-scoped governance boundaries (national/business/community),
2. risk-tiered autonomy controls for embodied agents,
3. sentience-uncertainty safeguards and escalation,
4. and auditable proof that these controls are active at runtime.

## What Is Already Implemented (Strong Overlap)

### 1) Hierarchical governance and policy inheritance
- `GuildTemplate.sol` already supports parent-child policy inheritance, which maps directly to global → national → regional → local governance layering for fleet controls.
- `GovernmentNode.sol` provides transparent contract creation/funding/completion and treasury operations at a governance-node level.

### 2) Capability-aware workforce scheduling primitives
- Scheduler policy already supports minimum hardware tier and required service classes.
- Agent manifests already carry hardware tier and service-class metadata.

These are direct precursors for embodied fleet routing (e.g., hazardous-material robots, elder-care assistance devices, extraction drones) once the policy layer is expanded.

### 3) Narrow-agent baseline for mundane services
- Government capsule narrow-agent framework already codifies bounded, repetitive task execution modes and capability-based assignment.

This aligns with the strategy of preferring non-sentient or narrow systems for routine/high-burden labor.

### 4) Multi-jurisdiction capsule scaffolding
- Government capsule layout and country-specific capsules (`us`, `uk`, `china`, `canada`) provide a practical substrate for national fleet variants.

## Gaps to Close Before Embodied Pilot

### A) Fleet governance model is not yet explicit in contracts/scheduler
Need first-class concepts for:
- `fleet_id`, `fleet_type` (national, business, municipal, community),
- governance authority chain and override precedence,
- cross-fleet task exchange with treaty/policy checks.

### B) Autonomy risk-tier controls are not yet encoded end-to-end
Need a formal autonomy profile on tasks/agents:
- autonomy level,
- action-risk class,
- required human/committee approvals,
- hard runtime bounds (zones/tools/time/force).

### C) Sentience-uncertainty handling is not currently represented
Need policy and runtime hooks for precautionary handling when open-ended agents present awareness-like indicators.

### D) Evidence and audit posture for embodied governance needs a dedicated lane
Need machine-checkable evidence bundle proving autonomy limits and governance approvals were enforced in live runs.

## Recommended To-Do Additions (Canonical Queue)
1. Introduce fleet governance primitives (IDs, types, authority chain) in contracts + APIs.
2. Extend scheduler/task schema with autonomy level, risk class, and approval requirements.
3. Implement runtime policy enforcement for embodied action constraints.
4. Add sentience-uncertainty policy doc + escalation protocol + immutable event logging.
5. Build compliance/evidence checks that fail CI/release when embodied governance controls are missing.

## Deployment Shape for Multiple Implementations
Use a federated model:
- **Global community layer:** baseline rights/safety constraints and interoperability profile.
- **National layer:** statutory overlays and residency constraints.
- **Business/municipal layer:** operational policies within inherited upper-bound constraints.

This aligns with existing GuildTemplate inheritance and government capsule decomposition while preserving local sovereignty.

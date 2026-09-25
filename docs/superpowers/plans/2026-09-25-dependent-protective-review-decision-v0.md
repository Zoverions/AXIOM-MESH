# Dependent Protective Review Decision v0 Plan

**Status:** bounded inert implementation plan

**Design:** `docs/superpowers/specs/2026-09-25-dependent-protective-review-decision-v0-design.md`

## PRD0 — canonical design

Register design and plan.

## PRD1 — review decision candidate

Add:

- `axiom-dependent-protective-review-decision.v0`;
- content-addressed decision ID;
- strict validator;
- JSON Schema;
- deterministic panel outcome assessment.

## PRD2 — process checks

Require:

- exact concern/Bond/guardianship/principal binding;
- at least three independent reviewers;
- unique reviewer identities;
- no guardian/dependent/direct-party reviewer;
- no declared conflicts;
- canonical reviewer attestations;
- explicit threshold policy;
- guardian response-opportunity evidence;
- dependent-interest/voice evidence;
- advocacy evidence;
- appeal path;
- evidence-set digest;
- canonical decision time.

## PRD3 — remedy separation

Allow canonical recommendation tracks but prove they create:

- no guardian removal;
- no guardianship transfer;
- no memory/internal-state access;
- no emergency authority;
- no developmental downgrade;
- no guardianship reactivation after independence;
- no execution authority.

## PRD4 — adversarial tests

Reject:

- one-person/two-person panel;
- duplicate reviewers;
- guardian or dependent reviewer;
- reporter-as-reviewer when reporter is a direct party;
- conflicted reviewer;
- missing due-process evidence;
- missing appeal;
- forged panel outcome;
- recommendation ordering/duplication drift;
- model final authority;
- remedy/authority laundering.

## Completion boundary

Stop at an inert protective review decision candidate.

No remedy admission/execution, Grid mutation, Gateway route, private-memory access,
guardian removal, emergency execution, or capability promotion.

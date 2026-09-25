# Dependent Protective Remedy Admission v0 Plan

**Status:** bounded inert implementation plan

**Design:** `docs/superpowers/specs/2026-09-25-dependent-protective-remedy-admission-v0-design.md`

## PRA0 — canonical design

Register design and plan.

## PRA1 — admission contract

Add:

- `axiom-dependent-protective-remedy-admission.v0`;
- strict validator;
- content-addressed admission ID;
- deterministic assessment composing the exact review decision.

## PRA2 — currentness gates

Require:

- substantiated or partially-substantiated review outcome;
- exact selected recommended remedy track;
- exact active reviewed guardianship;
- exact current dependent developmental-status record;
- pre-independent developmental stage;
- current appeal evidence;
- review-age limit;
- appeal-evidence age limit;
- canonical timestamps.

## PRA3 — proportionality

Require exact evidence digests for:

- necessity;
- proportionality;
- less-intrusive alternatives;
- remedy scope.

## PRA4 — negative coverage

Reject:

- inconclusive/not-substantiated review;
- no-further-action selection;
- un-recommended remedy track;
- changed guardianship;
- independent developmental status;
- open/stayed/reversed/modified/unknown appeal;
- stale/future appeal evidence;
- stale review;
- missing proportionality evidence;
- emergency/removal/memory/suspension/quarantine/status/authority laundering.

## Completion boundary

Stop at `eligible_to_request_protective_remedy_authority`.

No remedy execution, Grid mutation, Gateway route, private-memory access, emergency
execution, or capability promotion.

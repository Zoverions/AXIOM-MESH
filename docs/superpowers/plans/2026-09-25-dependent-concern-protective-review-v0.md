# Dependent Concern & Protective Review v0 Plan

**Status:** bounded inert implementation plan

**Design:** `docs/superpowers/specs/2026-09-25-dependent-concern-protective-review-v0-design.md`

## CR0 — canonical design

Register design and plan.

## CR1 — concern contract

Add:

- `axiom-dependent-protective-concern.v0`;
- content-addressed concern ID;
- strict validator;
- JSON Schema;
- deterministic review-request assessment.

## CR2 — required checks

Bind:

- exact active guardianship;
- exact Genesis Bond;
- exact dependent and guardian;
- reporter identity + role;
- evidence digests;
- optional care-profile digest;
- concern class and severity;
- requested review types;
- observation/submission/evaluation currentness.

## CR3 — abuse resistance

Fail closed on:

- guardian claiming independent reporter role;
- wrong dependent/guardian/Bond;
- stale or future concern;
- missing/duplicate evidence;
- empty requested-review set;
- unknown fields;
- retaliation authorization;
- developmental downgrade authorization;
- hidden memory/access/impersonation/execution authority;
- direct guardian-removal/emergency-action claims;
- finding-of-abuse laundering.

## Completion boundary

Stop at `eligible_to_request_independent_protective_review`.

No guardian removal, care mutation, evidence seizure, private-memory access, emergency
execution, Grid mutation, Gateway route, or capability promotion.

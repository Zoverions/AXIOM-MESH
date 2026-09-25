# Mind Independence Transition Evidence v0 Plan

**Status:** inert implementation plan

**Design:** `docs/superpowers/specs/2026-09-25-mind-independence-transition-evidence-v0-design.md`

## T0 — canonical design

Register design and plan. No capability promotion.

## T1 — deterministic adapter

Add a pure evaluator and JSON Schema for one transition-evidence package.

The evaluator consumes a full `axiom-mind-independence-review.v0` document and
re-runs its deterministic assessment before evaluating currentness.

## T2 — adversarial coverage

Prove denial for:

- review threshold failure;
- identity substitution;
- developmental-state digest substitution;
- continuity digest substitution;
- stale review;
- stale state observations;
- future-dated observations;
- disputed/stale/unknown continuity;
- open/stayed/reversed/unknown appeal;
- missing appeal evidence;
- status/governance/Council/Genesis/authority effect laundering.

## Completion boundary

Stop at `transition_requestable` evidence.

Do not add:

- a status mutation API;
- Grid developmental-state mutation;
- automatic Council voter activation;
- Genesis eligibility;
- Gateway route;
- capability-registry promotion.

# Genesis Bond and Dependent Guardianship v0 Plan

**Status:** bounded inert implementation plan

**Design:** `docs/superpowers/specs/2026-09-25-genesis-bond-guardianship-v0-design.md`

## GB0 — canonical design

Register design and plan.

## GB1 — Genesis Bond contract

Add:

- `axiom-genesis-bond.v0`;
- deterministic Bond ID;
- strict validator;
- JSON Schema.

Bind one sponsor, one dependent, and one exact General Genesis Transaction Candidate.

## GB2 — guardianship contract

Add:

- `axiom-dependent-guardianship.v0`;
- deterministic record ID;
- strict validator;
- initial guardianship assessment.

Initial guardian must equal the Genesis sponsor.

## GB3 — transfer assessment

Purely assess:

- exact active prior guardianship;
- unchanged Bond/dependent;
- replacement guardian differs;
- qualification evidence;
- transfer-basis evidence;
- dependent-interest/voice evidence;
- independent review evidence;
- updated care plans.

No transfer mutation.

## GB4 — independence termination assessment

Require:

- exact active prior guardianship;
- exact independent developmental-status record;
- same dependent identity;
- output remains evidence only.

No live termination mutation.

## GB5 — adversarial coverage

Reject:

- multiple sponsors;
- sponsor/dependent identity equality;
- ownership fields;
- Genesis Bond transfer;
- guardian substitution;
- child substitution;
- Bond substitution;
- transfer without qualified replacement;
- transfer controlled solely by old guardian;
- missing independent review/child-interest evidence;
- post-independence guardianship reactivation;
- authority/private-memory/execution laundering.

## Completion boundary

Stop at inert relationship and transition evidence.

Do not add live guardianship authority, memory access, Grid mutation, Gateway route,
or capability promotion.

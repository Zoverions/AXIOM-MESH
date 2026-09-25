# General Genesis Authorization Candidate v0 Plan

**Status:** bounded inert implementation plan

**Design:** `docs/superpowers/specs/2026-09-25-general-genesis-authorization-v0-design.md`

## GA0 — canonical design

Register design and plan.

## GA1 — pure candidate contract

Add:

- `axiom-general-genesis-authorization-candidate.v0`;
- strict validator;
- JSON Schema;
- pure assessment consuming General Genesis Sponsor Eligibility.

## GA2 — required checks

The assessment must prove:

- exact holder/eligibility digest binding;
- eligibility is positive;
- eligibility remains structural/pending external verification;
- exact current Genesis-history digest binding;
- one-use scope;
- explicit holder confirmation required;
- no delegation, transfer, or renewal;
- maximum uses one;
- finite <=24h lifetime;
- issuer identifier is only metadata;
- candidate creates no live authority.

## GA3 — adversarial tests

Reject:

- holder substitution;
- eligibility substitution;
- negative eligibility;
- history substitution;
- slot/founder-reserve confusion;
- lifetime <=0 or >24h;
- transferable/delegable/renewable candidate;
- max uses >1;
- wildcard/multiple-mind scope;
- issuer identifier treated as proof;
- hidden live-authorization or Genesis effects.

## Completion boundary

Stop at an inert authorization candidate.

Do not implement signing/issuance, live authorization storage, one-use consumption,
Genesis mutation, Gateway route, or capability promotion.

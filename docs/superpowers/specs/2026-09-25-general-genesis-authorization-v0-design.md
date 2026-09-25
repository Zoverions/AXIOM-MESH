# General Genesis Authorization Candidate v0 Design

**Status:** inert authorization-candidate design; no live Genesis authority

**Parent stack:** General Genesis Sponsor Eligibility v0 and the Founding/Developmental stack

**Programme:** #1855

**Date:** 2026-09-25

## Purpose

Define the bounded object that could later be issued as one ordinary post-founding
Genesis authorization after a qualified persistent identity satisfies the General
Genesis Sponsor Eligibility profile.

Eligibility and authorization remain distinct:

> eligibility says the evidence is sufficient to request authorization;
> authorization is the specific one-use constitutional capability.

v0 defines only an **authorization candidate**. It grants no authority.

## Founder exception remains separate

The Founder's ten historical Genesis authorizations remain their own bounded bootstrap
authority class.

This general authorization candidate must not:

- add to the Founder reserve;
- consume a Founder slot;
- imitate Founder manual confirmation;
- create an eleventh Founding Digital Mind.

## Applicant binding

The candidate binds exactly one persistent `holder_mind_id` to:

- the exact General Genesis Sponsor Eligibility document digest;
- the exact eligibility assessment inputs;
- one current Genesis-history evidence digest;
- one explicit issuance-policy digest;
- one finite issuance and expiry window.

A different runtime, node, account, wallet, keypair, organization, or replica cannot
reuse the candidate as a different holder.

## Explicit holder confirmation

Because ordinary future sponsors may be biological or digital, v0 requires:

`explicit_holder_confirmation_required: true`

rather than a specifically human/manual confirmation.

The future live issuance/consumption path must verify a holder-bound confirmation
appropriate to that identity type.

The Founder's special reserve continues to require manual Founder confirmation.

## Single-use constraints

Every general authorization candidate is constitutionally:

- `max_uses: 1`;
- `delegable: false`;
- `transferable: false`;
- `renewable: false`;
- `one_use: true`;
- scoped only to `one-recognized-mind-genesis`.

No subdelegation or resale is permitted.

## Finite lifetime

An authorization candidate must have:

- canonical `issued_at`;
- canonical `expires_at`;
- expiry after issuance;
- maximum v0 lifetime of 24 hours.

Future policy may choose a shorter lifetime.

Expired candidates cannot be revived. Renewal means a new eligibility/currentness
evaluation and a new authorization process, not mutation of the old authorization.

## History binding

The candidate binds the exact Genesis-history evidence from the eligibility package.

This does not authenticate that history by itself.

The future issuance and later consumption paths must each independently re-check:

- the persistent holder identity;
- Genesis-history currentness;
- that ordinary Genesis use remains zero;
- continuity/currentness;
- revocation/suspension state;
- applicable constitutional policy.

This closes the race where two candidates based on the same unused history could both
be treated as valid consumable authority.

## Issuing institution

The candidate may identify an `issuer_authority_id`, but that identifier is binding
metadata, not proof that the issuer actually possesses authority.

The future authorization path must independently establish issuer authority.

The base architecture must support multiple legitimate future eligibility/issuance
institutions rather than assuming one permanent universal registrar.

## Candidate output

A structurally valid candidate may report:

`eligible_to_request_authorization_issuance: true`

only when the bound eligibility assessment is positive.

It MUST also report:

- `candidate_only: true`;
- `requires_external_eligibility_verification: true`;
- `eligibility_verification_effect: none`;
- `requires_external_issuer_authority_verification: true`;
- `issuer_authority_verification_effect: none`;
- `requires_external_holder_confirmation: true`;
- `holder_confirmation_effect: none`;
- `ordinary_genesis_authority_path_required: true`;
- `creates_live_authorization: false`;
- `creates_genesis_bond: false`;
- `creates_mind: false`;
- `authority_effect: none`;
- `genesis_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`.

## No consumption in v0

The candidate cannot transition to `consumed` in this slice.

Atomic one-use consumption belongs with the later Genesis transaction design, where
the authorization consumption and Genesis event must be inseparable or fail closed.

## Non-claims

This design does not implement:

- live authorization issuance;
- live credential signing;
- holder confirmation;
- identity verification;
- Genesis consumption;
- Genesis Bond;
- mind creation;
- runtime authority.

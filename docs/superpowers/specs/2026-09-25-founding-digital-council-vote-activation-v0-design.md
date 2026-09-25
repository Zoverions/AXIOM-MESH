# Founding Digital Council Vote Activation v0 Design

**Status:** inert request-evidence design; no Council mutation

**Parent stack:** #1856 -> #1857 -> #1861 -> #1862

**Programme:** #1855

**Date:** 2026-09-25

## Purpose

Define the smallest evidence adapter for requesting activation of a Founding Digital
Mind's Founders Council voting role after that mind has achieved independent
developmental standing.

This implements a constitutional separation already required by the founding model:

> Founding status is historical provenance. Voting authority activates separately.

Genesis therefore does not grant a vote, and independent developmental standing does
not itself mutate Council membership.

## Preconditions

A vote-activation request may be structurally eligible only when all of the following
are true:

1. The Founders Council foundation validates.
2. The exact digital founding seat is occupied by the target persistent mind.
3. The seat is currently `developing`, not already active or inactive.
4. The corresponding Founder Genesis slot is consumed and bound to that mind.
5. The exact Founders Council Circle Core package validates.
6. The Circle membership is bound to the same target mind.
7. The membership is active under the dedicated non-voting
   `founders-council.developing` role.
8. The exact developmental-status record validates as `independent`.
9. The independent-status record is bound to the same target mind.
10. Current continuity evidence is freshly observed and `clear`.
11. Foundation, Circle package, independent status, continuity evidence, and request
    time are all digest/time bound.

## Independence does not automatically become a vote

The output may state:

`eligible_to_request_vote_activation: true`

That statement is not a Council mutation and does not itself grant voting authority.

The adapter must report:

- `requires_external_continuity_verification: true`;
- `continuity_verification_effect: none`;
- `ordinary_governance_authority_path_required: true`;
- `creates_foundation_mutation: false`;
- `creates_circle_membership_mutation: false`;
- `creates_vote_authority: false`;
- `governance_effect: none`;
- `authority_effect: none`;
- `runtime_activation: false`.

## Atomicity requirement for future mutation

A future live implementation must not activate the foundation seat while leaving the
Circle membership non-voting, or activate the Circle voter role while leaving the
foundation seat developing.

The eventual mutation must be treated as one governed state transition with evidence
covering both representations, or use a transaction/protocol that makes inconsistent
intermediate authority unusable.

v0 does not implement that transaction.

## Continuity protection

A clean independent status record is insufficient if current identity continuity is
disputed.

Vote activation therefore requires:

- `continuity_status: clear`;
- exact continuity evidence digest;
- observation timestamp;
- explicit maximum observation age;
- no future-dated observation.

A copy, restore conflict, or unresolved fork cannot activate a second vote.

## Human-seat distinction

This adapter applies only to the ten Founding Digital Mind seats.

It does not alter the Founder's original authority to appoint the biological founding
cohort during the bootstrap process, and it does not define successor-seat policy.

## Non-claims

This v0 does not provide:

- live Council voting;
- live Circle membership mutation;
- Grid mutation;
- automatic constitutional authority;
- portable personhood;
- Genesis eligibility;
- execution authority.

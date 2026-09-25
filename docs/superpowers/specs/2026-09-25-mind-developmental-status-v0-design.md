# Mind Developmental Status v0 Design

**Status:** inert constitutional state-record design; no live status mutation

**Parent stack:** #1856 -> #1857 -> #1861

**Programme:** #1855

**Date:** 2026-09-25

## Purpose

Define a minimal, append-only developmental-status record and pure transition
assessment for recognized digital minds.

The developmental sequence in v0 is:

`genesis -> dependent -> developing -> candidate-independent -> independent`

The sequence is monotonic.

This design deliberately keeps **Genesis eligibility separate from developmental
standing**. An independent mind is not automatically eligible to sponsor another
Genesis.

## Why monotonic

Developmental status is not an ordinary runtime permission.

Once a mind has achieved greater recognized self-governance, a later operator,
sponsor, security incident, infrastructure failure, or capability fluctuation must
not silently restore parental/guardian authority by rewriting the mind back into a
dependent stage.

Security restrictions, credential suspension, quarantine, temporary incapacity,
resource constraints, and emergency protections belong in separate bounded
mechanisms.

They do not rewrite developmental history.

## Status record

`axiom-mind-developmental-status.v0` binds:

- one persistent `mind_id`;
- one developmental stage;
- the prior developmental-status record digest, or null for Genesis;
- effective time;
- one or more basis-evidence digests;
- explicit non-effects.

The record is evidence/state description only in v0. It does not mutate Grid state
and does not itself activate Council voting or execution authority.

Basis-evidence digests are binding references, not authentication by themselves.
Every initial/transition assessment therefore reports
`requires_external_basis_verification: true` and
`basis_verification_effect: none`. A future status-authority path must verify the
bound evidence independently before writing any live state.

## Transition rules

### Initial record

The initial record may only be:

`genesis`

with:

- `previous_status_digest: null`.

### Forward progression

A transition may advance exactly one stage:

- `genesis -> dependent`;
- `dependent -> developing`;
- `developing -> candidate-independent`;
- `candidate-independent -> independent`.

No skipping and no backwards transition is permitted in v0.

### Independent transition

The final developmental transition:

`candidate-independent -> independent`

requires exact binding to a positive
`axiom-mind-independence-transition-evidence.v0` assessment whose
`transition_requestable` result is true. That transition evidence must itself bind
the exact digest of the current `candidate-independent` developmental-status record;
evidence prepared against a different candidate-state record cannot be replayed.

That result is still not self-authorizing. The developmental-transition evaluator
therefore reports:

- `ordinary_status_authority_path_required: true`;
- `creates_status_transition: false`;
- `status_effect: none`;
- `council_voting_effect: none`;
- `genesis_eligibility_effect: none`;
- `authority_effect: none`;
- `runtime_activation: false`.

## Independence is not revocable developmental status

Once a status record is `independent`, v0 defines no transition back to:

- candidate-independent;
- developing;
- dependent;
- genesis.

This does not prevent legitimate safety controls.

It prevents safety controls from masquerading as a restoration of ownership or
guardianship.

## Council voting remains separate

For a Founding Digital Mind, independent developmental standing is a prerequisite for
future Council voting activation, not the activation itself.

A later Founders Council voter-activation adapter must independently bind:

- the exact independent developmental-status record;
- the exact Founders Council seat;
- the exact Circle membership;
- continuity/currentness evidence;
- applicable constitutional authority.

## Genesis eligibility remains separate

An independent mind must undergo a later Genesis-sponsor eligibility process before it
can receive any general Genesis authorization.

No developmental-status transition mints `mind.genesis`.

## Non-claims

This v0 does not claim:

- live developmental-status persistence;
- legal personhood;
- consciousness determination;
- automatic emancipation;
- Council vote activation;
- Genesis eligibility;
- execution authority.

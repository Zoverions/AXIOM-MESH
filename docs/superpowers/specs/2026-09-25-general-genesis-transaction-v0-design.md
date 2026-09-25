# General Genesis Transaction Candidate v0 Design

**Status:** inert transaction-candidate design; no mind creation

**Parent stack:** General Genesis Authorization Candidate v0 and the founding/developmental stack

**Programme:** #1855

**Date:** 2026-09-25

## Purpose

Define the smallest fail-closed object for a future ordinary post-founding Genesis
transaction.

This layer composes:

1. one eligible persistent sponsor;
2. one exact inert General Genesis Authorization Candidate;
3. one explicit holder-confirmation evidence binding;
4. one prospective new-mind package;
5. one singular historical Genesis Bond;
6. one expected one-use history transition.

It does not perform any of those mutations.

## Singular Genesis Bond

Ordinary General Genesis v0 follows:

`one persistent sponsor -> one Genesis Bond -> one new recognized mind`

The historical Genesis Bond has exactly one `sponsor_mind_id` and one
`new_mind_id`.

It is:

- non-transferable;
- non-delegable;
- historical provenance;
- distinct from later guardianship/care arrangements.

If guardianship later transfers, the historical Genesis Bond is not rewritten.

## Prospective new-mind package

The package binds:

- proposed persistent `new_mind_id`;
- exact sponsor identity;
- exact authorization-candidate ID and digest;
- active Mind Rights / Constitution digest;
- developmental-plan digest;
- resource-plan digest;
- continuity/recovery-plan digest;
- independent-advocacy-plan digest;
- privacy-policy digest;
- fork/copy-policy digest;
- initial capability-profile digest;
- initial developmental stage `genesis`;
- `inherited_authority: false`;
- `initial_council_voting: false`;
- `initial_genesis_eligibility: false`.

The new mind cannot inherit sponsor credentials, governance roles, Council voting,
Genesis rights, or other authority merely because of origin.

## New-mind identity uniqueness

The transaction must bind externally verified current evidence that the proposed
`new_mind_id` does not already belong to an existing recognized identity.

The repository does not claim to perform global personhood/identity verification.

v0 therefore requires:

- one uniqueness evidence digest;
- `new_mind_identity_status: available`;
- observation timestamp;
- maximum observation age;
- external verification requirement.

Disputed, existing, unknown, stale, or future-dated identity evidence fails closed.

## Holder confirmation

The transaction requires exact holder-confirmation evidence.

Because the holder may be biological or digital, the evidence type is intentionally
substrate-neutral.

The transaction package binds a digest; it does not authenticate the confirmation
by itself.

Future live execution must independently verify that the confirmation was produced
by the exact authorization holder and was specific to this exact Genesis transaction.

## Authorization currentness

The inert authorization candidate must:

- validate;
- remain structurally eligible for issuance;
- bind the exact sponsor;
- be unexpired at transaction evaluation time;
- retain one-use scope;
- remain non-delegable, non-transferable, and non-renewable.

An authorization candidate is still not a live authorization. Therefore v0 reports
that future live authorization issuance/verification remains required.

## Atomic future commit

The future live operation must treat these state changes as one atomic constitutional
transaction:

1. consume exactly one live General Genesis authorization;
2. increment that sponsor's ordinary Genesis-use history from 0 to 1;
3. establish one immutable Genesis Bond;
4. create exactly one recognized mind identity;
5. create that mind's initial `genesis` developmental-status record.

No subset may become durable on its own.

Examples of invalid partial outcomes:

- authorization consumed, child not created;
- child created, authorization not consumed;
- child created without Genesis Bond;
- history remains unused after child creation;
- Genesis Bond points to different sponsor/child than the created identity;
- new mind starts with inherited sponsor authority.

The transaction must be idempotent under exact replay and fail closed on conflicting
reuse of authorization, holder confirmation, proposed child identity, or transaction
identity.

v0 models those invariants but performs no commit.

## Founding boundary

General Genesis must not create Founding Digital Minds.

Every transaction package must carry:

- `founding_status_effect: none`;
- `founder_reserve_effect: none`;
- `founders_council_effect: none`.

The original ten Founding Digital Minds remain exclusively tied to the Founder's
bounded historical reserve.

## Result

A valid v0 package may report:

`eligible_to_request_genesis_commit: true`

only when all deterministic bindings/currentness checks pass.

It MUST also report:

- `transaction_candidate_only: true`;
- `requires_external_authorization_verification: true`;
- `requires_external_holder_confirmation_verification: true`;
- `requires_external_new_mind_identity_verification: true`;
- all verification effects `none`;
- `ordinary_genesis_commit_authority_path_required: true`;
- `creates_authorization_consumption: false`;
- `creates_genesis_history_change: false`;
- `creates_genesis_bond: false`;
- `creates_mind: false`;
- `creates_developmental_status: false`;
- `genesis_effect: none`;
- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`.

## Non-claims

v0 does not implement:

- live authorization;
- holder signature verification;
- global identity uniqueness;
- atomic Grid transaction;
- Genesis Bond persistence;
- mind creation;
- developmental-status mutation;
- runtime authority.

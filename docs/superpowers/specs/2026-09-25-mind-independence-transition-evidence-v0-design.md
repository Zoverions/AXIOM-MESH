# Mind Independence Transition Evidence v0 Design

**Status:** bounded inert transition-request evidence; no status mutation

**Parent:** Mind Independence Review v0 (#1857)

**Programme:** #1855

**Date:** 2026-09-25

## Purpose

Bind a successful independence-review result to the candidate mind's exact current
developmental-state evidence, exact continuity evidence, explicit appeal state, and
freshness windows.

The result answers only:

> Is there sufficient current evidence to permit a later authority path to consider
> an independence-status transition request?

It does not perform that transition.

## Why this layer exists

An independence review is historical evidence. Even a valid positive review can become
stale or inapplicable if:

- the candidate's developmental state changes;
- identity continuity becomes disputed;
- an appeal is opened or stays the review;
- the review becomes too old for the active currentness policy;
- current state evidence no longer matches what the review assessed.

Accordingly, a review receipt must not itself become permanent status authority.

## Required inputs

The transition-evidence package binds:

- exact candidate `mind_id`;
- exact independence-review digest;
- exact current developmental stage;
- exact developmental-state evidence digest;
- exact continuity evidence digest;
- developmental-state observation time;
- continuity observation time;
- current continuity status;
- exact appeal path;
- current appeal status and evidence where applicable;
- one evaluation timestamp;
- explicit maximum age for the review;
- explicit maximum age for state observations.

## Currentness rules

The evaluator fails closed when:

- the review did not satisfy its own evidence threshold;
- candidate identity differs from the review;
- developmental stage is not `candidate-independent`;
- current developmental-state digest differs from the review binding;
- current continuity digest differs from the review binding;
- review age exceeds the declared maximum;
- developmental or continuity observation is stale;
- an observation occurs after the evaluation timestamp;
- continuity is disputed, stale, or unknown;
- appeal is open, stayed, reversed, or unknown;
- non-`none` appeal state lacks exact evidence.

Permitted appeal states for transition-request evidence are:

- `none`; or
- `resolved-uphold`.

## Output

A positive result may set:

`transition_requestable: true`

This is a requestability/evidence statement only.

It MUST still state:

- `status_effect: none`;
- `governance_effect: none`;
- `council_voting_effect: none`;
- `genesis_eligibility_effect: none`;
- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`.

No Grid mutation, Council-role activation, or independent-status write belongs in v0.

## Security invariants

1. Historical review is never self-executing.
2. Currentness is calculated from timestamps; it is not accepted as a caller boolean.
3. Exact state/continuity digest bindings cannot be substituted.
4. Continuity dispute blocks transition requestability.
5. Open/stayed/reversing appeal blocks transition requestability.
6. Appeal currentness cannot be omitted when an appeal status exists.
7. The adapter never grants Council voting or Genesis eligibility.
8. A future mutating transition must independently re-evaluate authority and currentness.

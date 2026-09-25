# Founding Digital Council Vote Activation v0 Plan

**Status:** inert implementation plan

**Design:** `docs/superpowers/specs/2026-09-25-founding-digital-council-vote-activation-v0-design.md`

## V0 — canonical design

Register design and plan.

## V1 — pure request-evidence adapter

Add:

- `axiom-founding-digital-council-vote-activation-request.v0`;
- strict validator;
- assessment composing:
  - Founders Council foundation;
  - Founders Council / Circle Core composition;
  - independent developmental status;
  - fresh continuity evidence.

## V2 — negative coverage

Prove denial for:

- biological seat;
- unoccupied seat;
- wrong mind;
- unconsumed/mismatched Genesis slot;
- seat already active;
- seat inactive;
- missing/wrong Circle membership;
- voter role already present;
- non-independent developmental status;
- status-record substitution;
- continuity dispute/staleness/future date;
- digest substitution;
- hidden membership/foundation/vote/authority effects.

## Completion boundary

Stop at `eligible_to_request_vote_activation`.

Do not add live foundation mutation, Circle membership mutation, vote execution,
Gateway route, or capability promotion.

# General Genesis Sponsor Eligibility v0 Plan

**Status:** bounded inert implementation plan

**Design:** `docs/superpowers/specs/2026-09-25-general-genesis-sponsor-eligibility-v0-design.md`

## GE0 — canonical design

Register design and plan. No capability promotion.

## GE1 — deterministic eligibility contract

Add:

- `axiom-general-genesis-sponsor-eligibility.v0`;
- strict semantic evaluator;
- JSON Schema;
- deterministic evidence profile.

Inputs include:

- applicant persistent identity;
- substrate;
- external identity/uniqueness/accountability evidence;
- exact Genesis-history evidence;
- exact standing evidence;
- fixed responsibility criteria;
- for digital applicants, exact independent developmental status.

## GE2 — hard negative tests

Prove denial for:

- unknown substrate;
- digital applicant without independent status;
- independent status for wrong identity;
- biological applicant pretending a digital status is sufficient identity proof;
- missing/uncertain/not-demonstrated criteria;
- duplicate/malformed evidence;
- `general_genesis_uses > 0`;
- unresolved Genesis-history conflict;
- stale/future identity/history/standing evidence;
- hidden global reputation score;
- model final-authority field;
- authority/Genesis/mind-creation effect laundering.

## GE3 — later authorization seam

After eligibility is green, design a separate single-use general Genesis
authorization record.

Do not implement authorization consumption or live Genesis in this PR.

## Completion boundary

Stop at `eligible_to_request_genesis_authorization`.

No live identity verification, authorization grant, Genesis mutation, Grid mutation,
Gateway route, or capability-registry promotion.

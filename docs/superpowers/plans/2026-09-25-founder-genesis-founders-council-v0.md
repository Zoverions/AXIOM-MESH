# Founder Genesis and Founders Council v0 Implementation Plan

**Status:** bounded implementation plan; no runtime activation

**Issue:** #1855

**Design:** `docs/superpowers/specs/2026-09-25-founder-genesis-founders-council-design.md`

## Goal

Land the smallest verifiable, fail-closed foundation for Founder Genesis and Founders Council semantics while preserving current AXIOM authority boundaries.

The first implementation slice MUST remain inert.

## Slice G0 — reconcile current main

1. Reconcile the design with:
   - Circle Core v0;
   - Circle membership assurance;
   - Circle decision-to-request evidence;
   - Circle export/retention evidence;
   - local governance records;
   - machine-principal non-delegation;
   - current capability/evidence binding;
   - current threat model.
2. Reuse existing Circle/governance record types where their semantics already match.
3. Update stale plural-authority planning statements only when current implementation evidence proves them stale.

## Slice G1 — pure contracts

Add only pure schemas/validators for the minimum constitutional state:

- Original Founder identity record;
- Founders Council seat record;
- Founder Genesis authorization record;
- Genesis receipt/evidence record.

Required result:

- `authority_effect: none`;
- `runtime_activation: false`;
- no Grid write path;
- no Gateway route;
- no networking;
- no capability promotion;
- no live Genesis.

## Slice G2 — Founder Genesis reserve verifier

Prove:

- exactly ten original authorization slots;
- slot numbers are unique and bounded 1..10;
- no slot 11;
- successful commit consumes one slot once;
- replay is idempotent/rejected as appropriate;
- manual-Founder-confirmation evidence is required;
- delegated machine principals cannot satisfy that evidence;
- no sponsor capability is inherited by the new mind.

## Slice G3 — Council seat/identity verifier

Prove:

- exactly ten biological and ten digital original seats;
- Original Founder history is distinct from current seat occupancy;
- one persistent identity has at most one ordinary Council vote;
- runtime/device/restore multiplicity cannot duplicate voting authority;
- Founding Digital Mind status does not imply voting activation.

## Slice G4 — Founder Casting Vote evaluator

Implement as a pure evaluator first.

Permit only when:

- all twenty original voting positions are active;
- proposal is valid;
- decision class permits casting vote;
- quorum is satisfied;
- ordinary balloting is closed;
- FOR equals AGAINST exactly;
- Founder identity/authority is valid.

Prove the evaluator cannot:

- lower quorum;
- repair a missing fixed threshold;
- repair substrate minima;
- override protected rights;
- create execution authority.

## Slice G5 — governance era and authority decay

Add inert transition/authority records only.

Required semantics:

- era never decreases;
- unknown/stale/disputed evidence is not satisfied;
- authorities may declare minimum/maximum era;
- an era-expired authority fails closed;
- no administrator override silently reactivates expired founding authority.

## Slice G6 — threat model and adversarial tests

Add explicit attacks for:

- Genesis #11;
- delegated/automated Founder Genesis;
- double consumption/replay;
- clone/fork population inflation;
- duplicate Council votes;
- simultaneous restored-backup voting;
- casting vote before full Council;
- 13/20 constitutional threshold misclassified as a tie;
- substrate-minimum bypass;
- rights-erasing Council proposal;
- fake independent operators;
- governance transition suppression;
- governance-era rollback;
- stale/forged transition evidence;
- raw database mutation attempting to manufacture authority.

## Slice G7 — Founders Console read-only projection

Only after G1-G6 semantics are proven.

Expose:

- Council composition;
- original vs current seat occupancy;
- Founding Digital Mind developmental/voting status;
- Founder Genesis reserve derived from receipts;
- proposal/decision evidence;
- casting-vote eligibility explanation;
- transition state;
- authority-registry inspection.

Discovery remains non-authorizing.

## Promotion gate

Any mutation route for Genesis or Founders Council authority remains disabled until all of the following exist:

- canonical threat-model update;
- exact schemas and validators;
- exhaustive negative tests;
- capability/evidence bindings;
- security review;
- deliberate registry promotion;
- explicit activation decision.

## First-PR completion contract

The first PR should include only:

1. canonical design + plan registration;
2. threat-model design delta or explicit next-step binding;
3. smallest inert schemas/validators for Founder Genesis reserve and Council founding seats;
4. focused negative tests;
5. exact evidence bindings;
6. no live capability status change.

Run the repository's required validation before presenting implementation as ready.

# Challenge Windows, Finality, and Assurance-Aware Retention

**Status:** experimental assurance/finality architecture; no production optimistic-execution promotion.

Retrospective reassessment answers how later evidence changes interpretation.

A separate question is:

> **How long must evidence remain available before a result can become procedurally more final?**

AXIOM should make that explicit.

## Finality states

The initial procedural vocabulary is:

```text
provisional
accepted_local
challengeable
stayed
appealed
reversed
superseded
expired
finalized
```

These states describe procedure, not truth.

A finalized record may still be wrong.  
A challengeable record may still be highly verified.  
A reversed record remains part of history.

## Challenge windows

A challengeable event declares:

- opening time;
- closing time;
- eligible challengers;
- active challenges;
- escalation path;
- evidence that must remain available.

Opening a challenge does not automatically roll back an action. That consequence requires its own authority and policy.

## Retention tied to reviewability

Retention should be proportional to what future review actually requires.

Useful classes include:

- ephemeral;
- minimum receipt;
- reviewable;
- appeal preserved;
- legal/policy hold;
- archival.

During an open challenge, appeal, rollback dependency, or explicit hold, required evidence cannot be deleted simply because an ordinary timer elapsed.

## Minimization

Reviewability does not always require retaining raw sensitive material forever.

Where the review contract permits, raw material may be replaced by:

- canonical digests;
- signed receipts;
- bounded proofs;
- redacted evidence;
- selectively disclosed extracts;
- reproducible verifier artifacts.

The important requirement is that the retained form is sufficient for the declared review and challenge process.

## Holds

A legal or policy hold is itself a governed object.

It must be:

- scoped;
- attributable;
- reviewable;
- time/policy bounded where possible;
- separately authorized.

A hold preserves relevant evidence. It does not grant broader disclosure or unrelated access.

## Optimistic effects

Optimistic execution remains laboratory architecture only.

A provisional effect is eligible for future research only where it is:

- reversible or compensable;
- policy-permitted;
- backed by an explicit challenge window;
- backed by retained evidence;
- backed by a declared rollback/correction path.

Irreversible effects require the necessary assurance before execution.

## Finalization and deletion

Finalization may reduce procedural retention obligations.

It does not mean "delete everything."

Historical receipts, correction lineage, required regulatory/organizational records, or separately retained provenance may continue under their own retention policy.

## Governing rule

**Keep enough evidence to challenge honestly. Minimize what can safely be minimized. Let finality describe procedure, never truth.**

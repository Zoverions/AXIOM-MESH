# Retrospective Reassessment and Challenge States

**Status:** experimental assurance/review architecture; no production promotion.

AXIOM must support learning from later evidence without falsifying history.

The fundamental rule is:

> **Later knowledge may change current interpretation. It must not change what was actually known, verified, or decided at the original time.**

## Append-only reassessment

A reassessment is a new linked record.

It identifies:

- original event ID and digest;
- assurance at execution;
- reviewer/verifier;
- review authority;
- reviewed evidence;
- method;
- review time;
- review assurance;
- outcome;
- challenge state;
- limitations;
- successor/correction links where needed.

## Review outcomes

The initial vocabulary is:

- corroborated;
- partially corroborated;
- contradicted;
- unverifiable;
- accepted despite uncertainty;
- rejected;
- superseded by correction;
- reopened on new evidence.

These describe the review result. They do not directly authorize a consequential remedy.

## Challenge/finality states

The review layer also reserves explicit challenge states:

```text
none
challengeable
challenged
stayed
appealed
reversed
superseded
expired
finalized
```

Finality remains separate from assurance.

A highly verified record can remain challengeable. A locally final decision can later be reopened under a separate valid process without pretending its earlier state never existed.

## Corrections

Corrections never replace bytes in place.

```text
original event
   -> reassessment
   -> linked corrective successor
```

The original remains visible with its historical assurance and decision context.

## Contradiction and uncertainty

If a later reviewer contradicts the original claim, both records remain visible.

If evidence is insufficient, the correct outcome may be `unverifiable`, not forced acceptance or rejection.

Conflicting reassessments are preserved until an explicit resolution mechanism addresses them.

## Review authority

A reviewer may have authority to inspect evidence and publish a review.

That is not runtime authority.

A reassessment can recommend correction, reopening, or remediation, but any consequential action still requires current policy and authority.

## Relationship to revocation

Revocation and reassessment solve different problems.

Revocation changes whether evidence or authority may be relied upon going forward.

Reassessment changes the current interpretation of a historical record.

Both preserve the historical record itself.

## Governing rule

**Append the better evidence. Preserve the original state. Change current interpretation explicitly, never retroactively.**

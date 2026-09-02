# Plural-Authority Integration Conformance Harness

**Status:** synthetic conformance only.

The plural-authority work now spans multiple independently useful components. The next risk is not lack of features; it is **semantic mismatch between features**.

A component can be correct in isolation while the composed system is wrong.

For example:

- recognition says a claim class is acceptable;
- disclosure says only a proof may cross;
- assurance says currentness is unknown;
- explanation accidentally says allow;
- challenge exists but deletes the evidence it needs;
- reassessment overwrites the original record;
- pilot success is mistaken for promotion.

The integration harness exists to catch those failures.

## Required chain

Every scenario binds one exact scenario ID and action ID across:

1. recognition;
2. disclosure;
3. assurance;
4. policy conflict;
5. decision explanation;
6. challenge window;
7. reassessment;
8. reversible pilot result.

Every stage remains non-authoritative.

## Cross-stage invariants

The harness verifies that:

- recognition cannot widen disclosure;
- unknown required assurance remains visible later;
- deny/hold states cannot be laundered into allow;
- challenge appends rather than mutates;
- reassessment appends rather than rewrites;
- pilot success remains non-promotional;
- all stages bind the same action lineage.

## Why this matters

Most serious trust failures happen at boundaries:

```text
correct verifier + wrong audience
correct policy + stale currentness
correct challenge + deleted evidence
correct explanation + hidden blocker
correct pilot + false production claim
```

The integration harness tests the **composition contract**, not just individual validators.

## Promotion firewall

Even a perfect synthetic integration run proves only internal semantic consistency for the tested scenario.

It does not prove:

- production readiness;
- real-world legal adequacy;
- human comprehension;
- independent security;
- authentic federation behavior;
- safe consequential use.

## Governing rule

**Test the seams, not just the parts. A trustworthy chain is only as strong as its weakest composition boundary.**

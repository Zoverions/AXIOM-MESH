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

The integration harness exists to catch those failures as the component joins become mechanically representable.

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

## Current mechanically enforced invariants

The v1 validator currently enforces that:

- only the eight declared stage types are accepted; unknown stages fail closed;
- all required stages are present and bind the same scenario/action lineage;
- every stage remains explicitly non-authoritative;
- unknown required assurance cannot be rendered as a success explanation;
- earlier deny/hold states cannot be laundered into an allow explanation;
- challenge/reassessment lineage is append-only and historical rewrite is forbidden;
- production, consequential-use, and public-supported-claim promotion flags remain false;
- neither the scenario nor successful conformance creates authority.

The scenario also carries explicit cross-stage assertions such as recognition not widening disclosure. Those assertions are conformance claims to be joined to the underlying component records as the harness evolves; setting an assertion to `true` is not itself mechanical proof of the corresponding component relationship.

## Why this matters

Most serious trust failures happen at boundaries:

```text
correct verifier + wrong audience
correct policy + stale currentness
correct challenge + deleted evidence
correct explanation + hidden blocker
correct pilot + false production claim
```

The integration harness tests the **composition contract**, not just individual validators. Its claims should remain no stronger than the joins it can actually recompute.

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

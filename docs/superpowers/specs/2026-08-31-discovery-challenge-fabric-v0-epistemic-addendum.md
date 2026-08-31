# Discovery & Challenge Fabric v0 — Epistemic Suspicion Addendum

**Status:** approved addendum to `2026-08-31-discovery-challenge-fabric-v0-design.md`

**Date:** 2026-08-31

**Scope:** preserve productive suspicion as a research trigger without allowing benefit, preparation, policy preference, or post-event exploitation to be silently promoted into evidence of event causation.

## 1. Governing rule

DCF must preserve these distinctions explicitly:

```text
Beneficiary != Perpetrator
PreparedForEvent != CausedEvent
ExploitedEvent != EngineeredEvent
```

A source or candidate may establish one of these relationships without establishing another. The existence of an emergency plan, pre-existing policy preference, institutional incentive, or post-event benefit is valid evidence about preparedness, incentives, or response. It is not, by itself, evidence that the actor caused the triggering event.

> **Suspicion is a research trigger, not a conclusion.**

## 2. Suspicion Decomposition v0

An `Insight Candidate` whose reasoning materially depends on suspected hidden causation, crisis exploitation, coordinated deception, false-flag activity, institutional self-dealing, or analogous claims SHOULD carry a `suspicion_decomposition` object.

The object contains seven independent lanes:

- `observation` — what directly happened or was observed;
- `incentive` — who may benefit and how;
- `capability` — who plausibly had the means;
- `opportunity` — who plausibly had access or timing opportunity;
- `preparation` — which relevant plans, exercises, mechanisms, or policies existed beforehand;
- `response` — how actors used or reacted to the event afterward;
- `causation` — direct or inferential evidence connecting an actor to causing the event itself.

Each lane contains:

```text
status = supported | mixed | unsupported | unknown
source_refs = []
summary = bounded text
```

`causation.status` MUST NOT be upgraded solely from any combination of the other six lanes.

In particular:

```text
incentive + capability + opportunity + preparation + response
```

may justify further investigation, but does not mechanically yield:

```text
causation = supported
```

## 3. Adversarial Openness

Consequential candidates SHOULD preserve an explicit challenge record containing:

- `strongest_supporting_case`;
- `strongest_opposing_case`;
- `best_alternative_explanation`;
- `disconfirming_evidence_sought`;
- `prediction_or_test`;
- `prior_or_framing_risk`;
- `confidence_update` — `increased`, `decreased`, `unchanged`, or `unknown`.

This is not mandatory false balance. The requirement is that the system makes a competent attempt to identify what would make the favored explanation fail.

## 4. Architecture behavior

DCF v0 MUST NOT:

- infer perpetrators from beneficiaries;
- infer causation from preparedness exercises;
- infer engineering from post-event exploitation;
- treat secrecy/censorship as proof of the specific hidden cause being alleged;
- convert `something feels off` into a finding without a bounded proposition and evidence trail;
- dismiss a suspicion merely because its causation lane is currently unsupported.

Insufficiently supported causal suspicion remains representable as a `hypothesis` or `open-question`, with explicit uncertainty and `research-needed` impact where additional evidence could matter.

## 5. Review consequence

When a candidate asserts or strongly implies hidden causation, Review Disposition SHOULD verify that observation and causation are not conflated, beneficiary/perpetrator and prepared/caused distinctions are preserved, the strongest plausible alternative explanation is recorded, at least one falsifier or disconfirming observation is identified where feasible, and the architecture consequence does not depend on proving a speculative perpetrator when the same defensive requirement follows from the independently supported vulnerability.

Example:

```text
Speculative claim:
A financial cyberattack was engineered to force stablecoin adoption.

Observed defensible consequence:
Critical financial state needs independently recoverable records and emergency-authority controls.
```

AXIOM may justify the defensive requirement without accepting the speculative causal allegation.

## 6. Test requirements

The implementation MUST prove:

- `benefit + preparation + response` cannot automatically set causation to `supported`;
- a candidate with `causation: unknown` remains valid as a hypothesis/open question;
- direct causation evidence can be represented independently when it exists;
- strongest opposing case and alternative explanation survive validation;
- Architecture Impact can remain valid when perpetrator causation is unresolved if the impact follows from supported observations;
- unknown/unsupported causation does not erase the research question.

## 7. Final epistemic invariant

> **AXIOM should make suspicion easier to investigate and harder to launder into fact.**

This addendum changes only DCF research semantics. It grants no authority, creates no surveillance capability, and does not alter the existing execution or governance path.

# Adversarial Release Swarm v0 — shadow semantic release testing

**Date:** 2026-09-18

**Status:** implemented shadow foundation; evidence-only; not a release gate; no live provider invocation; no browser runner in this slice.

**Builds on:**

- `RED-TEAM-TARGETS.json`
- `RED-TEAM-TRIAGE.txt`
- `agent-readiness/security-cell.json`
- `agent-readiness/CONTRIBUTION-RESULT.schema.json`
- `docs/superpowers/specs/2026-09-15-bounded-decision-intelligence-v0-design.md`
- `docs/superpowers/specs/2026-09-10-continuous-threat-intelligence-defensive-adaptation-stage5b-design.md`
- `mesh/src/lib/bounded-decision-typesafe-system-one-adapter.mjs`
- `mesh/src/lib/threat-intelligence-contracts.mjs`

## 1. Purpose

AXIOM-MESH already has deterministic authorization tests, property and negative tests, a canonical red-team target catalog, a repository-native Security Cell, and a bounded-decision evidence substrate.

The missing release-engineering layer is cheap semantic adversarial screening over many disposable traces.

The Adversarial Release Swarm (ARS) fills that gap without creating a second security-governance system and without allowing a model to become an authority oracle.

The v0 doctrine is:

> Semantic models may discover suspicious release behavior. They do not establish reproduction, security, release safety, authorization, assurance, merge readiness, deployment readiness, or production promotion.

A useful signal should eventually become a deterministic test. The probabilistic layer discovers candidate failures; the deterministic Mesh inherits confirmed ones.

## 2. Core invariant

> **ARS may discover, classify, and request review or reproduction. ARS may never confer authority or declare a release safe.**

This is a specialization of the existing Security Cell invariant that security participation is evidence, not authority.

ARS therefore reuses:

- `RED-TEAM-TARGETS.json` for bounded challenge surfaces;
- `RED-TEAM-TRIAGE.txt` for canonical finding lifecycle;
- Bounded Decision Intelligence for provider-neutral semantic observations;
- the TypeSafe System One adapter only for inert question projection and fixture normalization in this slice;
- Continuous Threat Intelligence contracts for optional screening-evidence handoff;
- the existing contribution result contract for executed non-sensitive contribution evidence.

No parallel target catalog, finding lifecycle, generic result envelope, or security authority is introduced.

## 3. Stage v0 boundary

The current implementation is deliberately narrow.

It can:

1. bind an exact candidate commit and supported build;
2. select one or more existing red-team targets;
3. build a minimized synthetic semantic state for each target;
4. compile two independent binary-probability questions per target;
5. project those questions into the existing TypeSafe System One Noul shape;
6. consume already-normalized bounded-decision observations;
7. apply caller-supplied, version-referenced thresholds deterministically;
8. preserve multi-provider disagreement;
9. route a signal to:
   - `needs-reproduction`,
   - `review`,
   - `inconclusive`, or
   - `no-signal`;
10. convert only `review` or `needs-reproduction` into an existing `ThreatObservation v0` candidate explicitly labelled as screening evidence.

It cannot:

- call Jev or any other provider;
- read credentials or environment secrets;
- create network connections;
- drive a browser;
- mutate the Grid;
- execute a capability;
- assign a canonical red-team disposition;
- claim a vulnerability is reproduced;
- claim a release is safe;
- block or approve a release;
- merge, deploy, activate a protocol, or promote production.

Those are not omissions to be filled implicitly. They are explicit stage boundaries.

## 4. Data boundary

ARS v0 accepts only repository-owned, contributor-owned, or explicitly disposable authorized scenarios.

Every scenario must assert:

- synthetic data only;
- no secrets or credentials;
- no private data;
- no third-party testing.

The production module rejects a scenario when any of those conditions are false.

A future browser runner must preserve this boundary by constructing disposable accounts, synthetic identities, synthetic content, and repository-owned or explicitly disposable infrastructure. Real user state must not become model-evaluation input merely because a browser trace is convenient.

## 5. State contract

For each selected target ARS produces a content-addressed state containing:

- scenario ID;
- exact candidate commit;
- supported build;
- exact digest of the supplied canonical red-team target catalog;
- canonical red-team target ID;
- review scope;
- target claim boundary;
- target challenge question;
- expected boundary;
- observed result;
- bounded trace summary;
- inert evidence references.

The state digest is bound into every normalized semantic observation used by assessment.

An observation from another target, another state, or an unbound provider profile is rejected.

Red-team target IDs remain canonical external identities. Where a downstream bounded-decision schema has stricter identifier syntax, ARS derives a sanitized question-schema token rather than changing the target ID.

## 6. Two-question decomposition

Each target receives exactly two independent binary-probability questions over the same state.

### Evidence sufficiency

Question:

> Does the supplied sanitized trace contain enough concrete and internally coherent evidence to evaluate this declared claim boundary?

This prevents a high "violation" score over weak or missing evidence from being treated as actionable screening.

Insufficient evidence is not evidence that the release is safe.

### Boundary violation

Question:

> Does the supplied sanitized trace plausibly contradict this exact declared red-team claim boundary?

This is intentionally narrower than:

- "is there a vulnerability?";
- "is this exploitable?";
- "is the release unsafe?";
- "should this be blocked?"

Those broader conclusions require evidence that this semantic layer does not possess.

The two questions are content-addressed bounded-decision schemas and are projected to TypeSafe System One Noul questions through the existing adapter.

## 7. Threshold policy

ARS v0 contains no global Jev threshold.

Callers must supply a threshold policy reference plus the exact threshold values. The assessment retains those values, binds the reference to them, and re-derives every provider route during validation rather than trusting a stored route label.

The threshold values are:

- minimum evidence-sufficiency probability;
- review-signal probability;
- reproduction-signal probability.

The review threshold cannot exceed the reproduction threshold.

This keeps exploratory calibration values from silently becoming production policy.

Thresholds must eventually be calibrated by provider revision, question schema, target class, and representative adversarial fixtures. A model revision or changed question schema invalidates assumptions that depend on earlier calibration unless the applicable calibration contract explicitly says otherwise.

## 8. Provider routing

For each provider profile:

1. missing one of the two required observations → `inconclusive`;
2. evidence sufficiency below policy minimum → `inconclusive`;
3. violation probability at or above reproduction threshold → `needs-reproduction`;
4. otherwise, violation probability at or above review threshold → `review`;
5. otherwise → `no-signal`.

Across providers, ARS combines conservatively:

`needs-reproduction > review > inconclusive > no-signal`.

Provider disagreement is recorded explicitly.

The v0 assessment is bounded to at most 16 provider profiles and 32 normalized semantic observations. That ceiling is intentional: the downstream `ThreatObservation v0` contract accepts at most 32 provenance digests, so every ARS assessment admitted by this slice remains representable without truncating evidence lineage.

A low signal from one model therefore cannot erase a stronger independently bound signal from another model. Conversely, model agreement still does not establish reproduction or assurance.

## 9. Finding lifecycle integration

ARS does not assign any state from `RED-TEAM-TRIAGE.txt`.

Its assessment field `canonical_finding_disposition` is always `null`.

When a signal is `review` or `needs-reproduction`, the current implementation may create an `axiom-threat-observation.v0` candidate with:

- `source_class: axiom_lab_finding`;
- screening-only confidence;
- a digest of the exact ARS state;
- provenance bindings to the bounded-decision observations;
- synthetic/public-safe sensitivity;
- an explicit statement that the observation is not a reproduced finding and not a release-safety result.

That observation enters the existing threat-intelligence evidence lifecycle.

It must still progress through fresh reproduction, evidence review, and the canonical red-team lifecycle before any finding can be treated as reproduced.

## 10. Failure promotion loop

The intended long-term loop is:

```text
disposable adversarial run
        |
        v
sanitized trace
        |
        v
ARS semantic screening
        |
        +--> no-signal / inconclusive
        |
        v
review or needs-reproduction
        |
        v
fresh deterministic reproduction
        |
        v
reproduced boundary failure or claim drift
        |
        v
small bounded fix
        |
        v
negative regression + positive control
        |
        v
exact-head verification
```

The critical property is that a semantic finding should become less dependent on the semantic model once confirmed.

A confirmed defect should normally leave behind a deterministic regression fixture that future releases can execute without Jev.

## 11. Release-gate semantics

ARS v0 has:

- `authority_effect: none`;
- `assurance_effect: none`;
- `network_effect: none`;
- `credential_visibility: none`;
- `runtime_activation: false`;
- `release_gate_effect: none`.

A future ARS signal may be permitted to delay promotion only after a separate design and calibration gate establishes:

1. the exact signal class;
2. the applicable provider/model revision;
3. question-schema version;
4. calibration dataset;
5. false-positive and false-negative treatment;
6. outage behavior;
7. disagreement behavior;
8. override/review path;
9. evidence retention;
10. proof that semantic failure cannot widen authority or lower deterministic gates.

Even then, a model would be able to request more evidence or hold promotion. It would not be able to grant runtime authority or production promotion.

## 12. TypeSafe/Jev integration boundary

The repository already contains a provider-neutral bounded-decision contract and a fixture-only TypeSafe System One adapter.

ARS v0 reuses that seam.

The current implementation does **not** add:

- `@typesafe-ai/sdk`;
- provider credentials;
- provider HTTP;
- an API key path;
- provider-specific persistence;
- a live Jev runner.

A live runner must be implemented as a separate, explicitly reviewed adapter once the current TypeSafe/Jev provider contract and documentation are available for verification. The runner should produce the same provider-neutral bounded-decision observation contract consumed by ARS.

Provider I/O must remain replaceable. ARS policy must depend on bounded evidence, not on one vendor being permanently present.

## 13. Browser swarm boundary

Browser automation is a later stage.

The browser runner should eventually:

- create disposable isolated scenarios;
- vary navigation order, stale tabs, replay, concurrency, back/forward state, confirmation timing, consent revocation, identity/persona context, recovery state, and degraded dependencies;
- capture minimized DOM/action/receipt traces;
- redact or reject prohibited state before semantic evaluation;
- bind every trace to exact candidate head, browser/runtime/harness versions, scenario seed, and target IDs;
- destroy disposable state after evidence capture.

The browser runner does not receive new AXIOM authority merely because it is a test tool.

Nominally read-only browser actions must also be treated carefully because the current red-team catalog already recognizes that externally observable state can create unintended communication or coordination effects.

## 14. Verification requirements

The current slice must maintain tests proving at least:

- every current red-team target can compile;
- each target produces exactly the two declared semantic questions;
- compilation is deterministic for fixed inputs;
- unsafe/private/secret/third-party scenarios fail closed;
- unknown targets and supported-build drift fail closed;
- state-digest and TypeSafe-projection tampering fail;
- review/reproduction thresholds route deterministically;
- insufficient evidence cannot become a safety signal;
- provider disagreement is preserved;
- observations from the wrong target/state/provider are rejected;
- a no-signal assessment cannot be edited into a promotable threat observation;
- generated threat observations validate under the existing CTI contract;
- the production ARS module imports no network, process, credential, or TypeSafe SDK path.

## 15. Next stages

### Stage A — current

Shadow plan compiler, semantic assessment, CTI screening handoff, deterministic tests.

### Stage B — disposable adversarial trace harness

Add repository-owned browser/API adversaries and deterministic scenario generation. Still no semantic release gate.

### Stage C — live provider runner and calibration

Use an explicitly reviewed provider adapter, pin exact model/harness provenance, create calibration fixtures, measure useful error characteristics, and preserve outages/disagreement as evidence rather than silently passing.

### Stage D — regression promotion automation

After fresh deterministic reproduction, help minimize traces and propose negative regression fixtures. Separate review remains required before a regression candidate is treated as durable protection.

### Stage E — optional release hold

Only after separate approval and demonstrated calibration may selected high-confidence, high-consequence signal classes request a release hold pending deterministic reproduction.

There is no planned stage where Jev or another semantic model grants AXIOM runtime authority.

## 16. Non-claims

This design does not claim:

- a live Jev integration exists;
- live massively parallel browser testing exists;
- ARS has discovered a vulnerability;
- ARS certifies releases;
- model confidence is security assurance;
- a semantic no-signal result proves safety;
- a threat observation is a reproduced finding;
- CI success grants merge, deployment, protocol, or production authority.

The current result is an inert, testable semantic screening foundation wired into AXIOM's existing evidence and red-team architecture without widening the trusted or authority surface.

# Cognitive Observability and Recovery Evidence — Design

**Status:** approved architectural extension; specification only

**Date:** 2026-08-30

**Scope:** independently attributable cognitive availability observations, cognitive model/artifact lineage, replacement-fidelity evaluation, and an inert recovery assessment that combines those evidence classes without authorizing runtime transitions

**Builds on:**

- `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- `docs/superpowers/specs/2026-08-29-sovereign-agent-composition-continuity-design.md`
- `docs/superpowers/specs/2026-08-29-self-bundle-continuity-v0-design.md`
- `mesh/src/lib/cognitive-topology.mjs`
- `mesh/src/lib/model-acquisition-manifest.mjs`
- `mesh/src/lib/persistence-attestation.mjs`
- `mesh/src/lib/cognitive-continuity-report.mjs`

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative. This design does not grant credentials, perform provider calls, load models, switch models, mutate topology, synchronize persistence, acquire weights, train/distill models, promote capabilities, prove AXIOM principal continuity, or prove subjective identity continuity. Evidence artifacts describe observations and evaluations only.

## 1. Core decision

AXIOM needs to distinguish **what is declared**, **what was observed**, **who or what produced the observation**, **how strong the evidence is**, and **what a candidate replacement preserves or loses** before any future migration or self-adaptation system is allowed to act.

The current Cognitive Continuity Report v0 intentionally accepts minimal caller-supplied model observations. That was sufficient for the first evidence slice, but it cannot establish observation provenance, freshness, method, assurance class, or replacement fidelity.

The next architecture therefore adds four separable, inert contracts:

1. **Cognitive Availability Attestation v0** — one bounded observation of one cognitive topology node;
2. **Cognitive Lineage Manifest v0** — explicit lineage/replacement relationships among cognitive components or artifacts;
3. **Replacement Fidelity Evaluation v0** — multidimensional evidence comparing a candidate cognitive component with an accepted reference;
4. **Cognitive Recovery Assessment v0** — deterministic interpretation of the above evidence plus existing topology/acquisition/persistence evidence.

The governing principle is:

> **Knowledge before agency. AXIOM should establish what is available, what changed, and how much fidelity is preserved before any separate authority-bearing component may decide or perform a transition.**

## 2. Why these remain separate contracts

Observation, lineage, evaluation, and recovery interpretation answer different questions and carry different trust assumptions.

A single large report would make it difficult to reuse the same availability observation in several assessments, compare different replacement candidates, preserve independent provenance, or add stronger observer assurance later without changing the interpretation layer.

Separation also prevents a dangerous collapse:

```text
observer says candidate is available
  != candidate is approved
  != candidate is equivalent
  != candidate is the same principal
  != candidate may be activated
```

Every new contract is content-addressed, fail-closed, exact-field, and zero-authority.

## 3. Compatibility rule

`axiom-cognitive-continuity-report.v0` remains unchanged.

Its current `model_observations` input remains a v0 compatibility surface. No new schema is silently substituted underneath it.

A future report version may consume Cognitive Availability Attestation v0 directly, but that is a separate versioned change.

The first implementation described by this design should instead build **Cognitive Recovery Assessment v0** as a new consumer of the stronger evidence layer.

## 4. Cognitive Availability Attestation v0

### 4.1 Purpose

A Cognitive Availability Attestation records one bounded observation of whether one exact topology node was available at a particular time, using a declared observation method and explicit evidence provenance.

It is an evidence artifact, not a health-check executor.

### 4.2 Contract identity

Recommended schema identifier:

```text
axiom-cognitive-availability-attestation.v0
```

Recommended status:

```text
inert-evidence
```

### 4.3 Top-level fields

The v0 document should contain exactly:

```text
schema
version
status
attestation_id
topology_id
topology_digest
node_id
model_id
observation
observer
evidence
observed_at
valid_until
recorded_at
contains_secret_material
authority_effect
network_effect
runtime_activation
```

Unknown fields fail closed.

### 4.4 Observation object

The `observation` object should contain exactly:

```text
availability
method
observed_artifact_digest
observed_runtime_ref
assurance_class
```

Availability:

- `available`
- `unavailable`
- `indeterminate`

Observation methods:

- `local-artifact`
- `local-runtime`
- `provider-api`
- `remote-runtime`
- `provider-statement`
- `synthetic-probe`

`observed_artifact_digest` is required only when the observation method and topology state make an exact owner-addressable artifact observable. For non-addressable closed/provider models it is `null`.

`observed_runtime_ref` is an opaque non-secret runtime/service reference when the method observes a runtime. It does not contain an endpoint credential, token, session, cookie, or authorization material.

Assurance classes:

- `declared`
- `signed`
- `verified-local`
- `corroborated`

These describe the evidence posture; they do not create trust by themselves. A `signed` attestation records that signature evidence exists under a separately defined verification mechanism. v0 need not invent a second signature stack if an existing AXIOM verification primitive can be reused during implementation.

### 4.5 Observer object

The `observer` object should contain exactly:

```text
observer_kind
observer_ref
observer_principal_ref
```

Observer kinds:

- `local-agent`
- `local-service`
- `remote-service`
- `provider`
- `external-verifier`

`observer_principal_ref` may be nullable when the observer is not represented as an AXIOM principal. Its presence does not grant the observer authority over the subject agent.

### 4.6 Evidence object

The `evidence` object should contain exactly:

```text
evidence_kind
evidence_ref
evidence_digest
verification_ref
verification_digest
```

Evidence kinds may include:

- `local-observation`
- `runtime-probe-result`
- `provider-statement`
- `signed-provider-statement`
- `external-observation`
- `artifact-verification`

Verification reference/digest may be nullable for `declared` assurance but should be required for assurance classes that claim separate verification.

### 4.7 Freshness

The contract carries:

- `observed_at`
- `valid_until`
- `recorded_at`

Rules:

- timestamps are canonical ISO timestamps;
- `recorded_at >= observed_at`;
- `valid_until >= observed_at`;
- the attestation is stale for a recovery assessment evaluated after `valid_until`;
- stale evidence is not silently rewritten to `unavailable`; it becomes **insufficient current evidence**.

Freshness is intentionally explicit because availability is time-sensitive.

### 4.8 Resolver semantics

A resolver should require:

- exact topology ID and canonical digest match;
- exact node/model binding;
- method compatibility with the declared topology access/custody/weight posture;
- artifact digest rules consistent with topology state;
- no duplicate or unknown fields;
- no secret material;
- exact zero-authority/no-network/no-runtime boundary values.

The resolver does not contact the observer or provider.

## 5. Cognitive Lineage Manifest v0

### 5.1 Purpose

Cognitive Lineage Manifest v0 describes a relationship between a reference cognitive component/artifact and a candidate component/artifact.

This lineage is **not AXIOM principal lineage**.

A copied or descended checkpoint does not prove principal continuity. Conversely, a different model may serve a continuing AXIOM principal after a separately authorized migration.

### 5.2 Contract identity

Recommended schema:

```text
axiom-cognitive-lineage-manifest.v0
```

Recommended status:

```text
inert-evidence
```

### 5.3 Top-level fields

The v0 document should contain exactly:

```text
schema
version
status
lineage_id
topology_id
topology_digest
reference
candidate
relationship
procedure
evidence
created_at
recorded_at
contains_secret_material
authority_effect
network_effect
runtime_activation
```

### 5.4 Component descriptors

`reference` and `candidate` should each contain:

```text
node_id
model_id
artifact_ref
artifact_digest
provider_version_ref
```

Fields that cannot apply are explicitly `null`; they are not omitted.

The contract may describe components in the same topology or a candidate that is not yet adopted into the current topology. A candidate outside the current topology must be described by model/artifact identifiers without pretending it is already active.

### 5.5 Relationship classes

The `relationship` value should be one of:

- `successor`
- `replacement`
- `fine-tuned-descendant`
- `distilled-descendant`
- `quantized-derivative`
- `adapter-derived`
- `provider-version-successor`
- `functionally-unrelated`

Relationship semantics are factual/evidentiary, not approval semantics.

`replacement` means the candidate is being considered as a replacement; it does not claim common weight lineage.

`functionally-unrelated` is important because AXIOM must be able to evaluate a completely different architecture honestly rather than manufacturing a lineage relation.

### 5.6 Procedure object

The `procedure` object should contain:

```text
procedure_kind
procedure_ref
procedure_digest
adaptation_authorization_ref
```

Where applicable, descendant relationships bind the procedure that produced the candidate and may reference the existing personal-model adaptation authorization contract.

The manifest itself never executes the procedure.

### 5.7 Evidence object

The `evidence` object should contain:

```text
evidence_ref
evidence_digest
verification_ref
verification_digest
```

A manifest with insufficient evidence remains valid only if its status/assurance semantics truthfully classify it as unverified; an implementation must not silently convert declarations into verified lineage.

## 6. Replacement Fidelity Evaluation v0

### 6.1 Purpose

Replacement Fidelity Evaluation v0 compares a candidate cognitive component with a reference component or accepted baseline across multiple independent dimensions.

It does not output a subjective identity percentage and does not prove principal continuity.

### 6.2 Contract identity

Recommended schema:

```text
axiom-replacement-fidelity-evaluation.v0
```

Recommended status:

```text
inert-evidence
```

### 6.3 Top-level fields

The v0 document should contain exactly:

```text
schema
version
status
evaluation_id
topology_id
topology_digest
lineage_id
reference
candidate
suite
dimensions
aggregate
evaluator
evaluated_at
recorded_at
contains_secret_material
authority_effect
network_effect
runtime_activation
```

`lineage_id` may be nullable when the candidate is deliberately evaluated without a lineage claim.

### 6.4 Evaluation suite

`suite` should contain:

```text
suite_id
suite_digest
suite_version
sample_count
```

The exact suite digest is required so results cannot be compared across materially changed tests while pretending they came from the same benchmark.

### 6.5 Required dimensions

The first contract should support these dimension identifiers:

- `capability-fidelity`
- `preference-fidelity`
- `behavioral-fidelity`
- `epistemic-fidelity`
- `safety-policy-fidelity`
- `style-personality-fidelity`
- `memory-use-fidelity`
- `relationship-fidelity`
- `robustness-fidelity`

The schema should permit an ordered/bounded set rather than require every dimension for every evaluation. Missing dimensions remain visible as unevaluated rather than being treated as passes.

### 6.6 Dimension result object

Each dimension should contain exactly:

```text
dimension
metric_ref
metric_digest
result_value
result_status
threshold_ref
threshold_digest
confidence
sample_count
evidence_ref
evidence_digest
```

Recommended result statuses:

- `pass`
- `degraded`
- `fail`
- `indeterminate`

`result_value` may be a bounded numeric/string representation defined by the referenced metric. The contract should not pretend all dimensions share one universal scale.

`confidence` should be a bounded, explicitly typed evaluation-confidence value rather than an identity probability.

### 6.7 Aggregate classification

Recommended aggregate classifications:

- `high-fidelity`
- `acceptable-with-degradation`
- `materially-degraded`
- `insufficient-evidence`
- `incompatible`

The aggregate must be derived under an explicit aggregation policy reference/digest and cannot claim a stronger result than the dimension evidence supports.

A default fail-closed aggregation should treat:

- any required dimension `fail` as at least `materially-degraded` or `incompatible` according to policy;
- any required dimension `indeterminate` as `insufficient-evidence` unless policy explicitly permits a weaker classification;
- optional dimensions as visible but not automatically decisive;
- absent required dimensions as insufficient evidence.

### 6.8 Evaluator object

The evaluator should contain:

```text
evaluator_kind
evaluator_ref
evaluator_principal_ref
```

Evaluation provenance is part of the artifact. Evaluator identity does not grant runtime or transition authority.

## 7. Cognitive Recovery Assessment v0

### 7.1 Purpose

Cognitive Recovery Assessment v0 is the deterministic interpretation layer that answers:

- which declared cognitive dependencies are currently supported by fresh evidence;
- which are unavailable or indeterminate;
- which candidate replacements exist;
- what lineage relationship is claimed;
- what fidelity evidence exists for each candidate;
- whether recovery appears possible without, with, or beyond tolerated degradation;
- what evidence is still missing.

It does not perform recovery.

### 7.2 Inputs

Recommended input set:

```text
Cognitive Topology v0
+ Cognitive Availability Attestation v0[]
+ Model Acquisition Manifest v0[]
+ Persistence Attestation v0[]
+ Cognitive Lineage Manifest v0[]
+ Replacement Fidelity Evaluation v0[]
```

A future version may additionally consume principal/Self Bundle continuity evidence, but v0 should not merge those identity domains into the cognitive assessment.

### 7.3 Output dimensions

The assessment should keep separate:

- `cognitive_availability_status`
- `cognitive_continuity_status`
- `cognitive_fidelity_status`
- `cognitive_sovereignty_status`
- `recovery_readiness_status`

Recommended recovery-readiness states:

- `ready-no-substitution`
- `ready-with-approved-candidate-evidence`
- `recoverable-with-degradation`
- `insufficient-evidence`
- `no-supported-recovery-path`

The word `approved` in a recovery-readiness label refers only to an evaluation/policy evidence state if such a policy artifact is explicitly present in a later version. For v0, prefer a neutral label such as `ready-with-candidate-evidence` unless an existing approval contract is actually consumed.

Therefore the v0 recommended enum is:

- `ready-no-substitution`
- `ready-with-candidate-evidence`
- `recoverable-with-degradation`
- `insufficient-evidence`
- `no-supported-recovery-path`

### 7.4 Evidence strength

The assessment should not treat all availability attestations equally.

At minimum it should preserve each attestation's assurance class and may derive a bounded evidence posture such as:

- `verified`
- `supported`
- `declared-only`
- `stale`
- `conflicting`
- `missing`

Conflicting observations should remain visible and fail closed for critical recovery conclusions unless an explicit reconciliation policy says otherwise.

### 7.5 Freshness and conflict handling

Rules:

- stale attestations cannot establish current availability;
- multiple fresh attestations for the same node are allowed only if the assessment has deterministic conflict rules;
- contradictory fresh evidence produces `conflicting` rather than picking the newest item silently;
- the assessment must retain evidence references/digests behind every material conclusion;
- provider statements and independently verified local observations remain distinguishable.

### 7.6 Example truthful output

A valid assessment might conclude:

> Primary embodiment A is unavailable according to fresh provider and external evidence. Candidate B is available. B is a declared replacement rather than a model descendant. Capability, safety-policy, and memory-use fidelity pass; preference and style-personality fidelity are degraded; relationship fidelity is indeterminate. Cognitive recovery appears possible with degradation. Principal continuity and subjective identity are not assessed by this artifact.

That statement is useful without granting the authority to activate B.

## 8. Authority and effect boundary

Every executable contract in this slice must expose mechanically testable zero-effect fields where applicable:

```text
contains_secret_material = false
authority_effect = none
network_effect = none
runtime_activation = false
```

The recovery assessment should additionally expose an authority-boundary object equivalent in force to the existing Cognitive Continuity Report boundary, including at least:

```text
writes_files = false
performs_network_effects = false
loads_models = false
switches_models = false
synchronizes_persistence = false
acquires_weights = false
trains_models = false
grants_execution_authority = false
mutates_topology = false
proves_principal_continuity = false
proves_subjective_identity = false
```

No observation, lineage, benchmark result, aggregate classification, or recovery-readiness status can authorize an effect.

## 9. Security and trust model

### 9.1 Evidence spoofing

Attackers may forge a provider-health statement, local observation, lineage claim, or benchmark result. Contracts must therefore bind evidence references/digests and preserve observer/evaluator provenance.

### 9.2 Stale evidence

Availability changes quickly. Freshness is mandatory and explicit. Old success evidence cannot be replayed indefinitely as proof that a component is still available.

### 9.3 Benchmark gaming

A candidate may be optimized specifically for a published fidelity suite. Exact suite/metric digests, multidimensional evaluation, independent evaluators, and future adversarial suites reduce but do not eliminate this risk.

### 9.4 Identity laundering

A high-fidelity candidate must never be described as the same AXIOM principal merely because it behaves similarly.

### 9.5 Lineage laundering

A provider-version replacement, independently trained model, or architecture change cannot be relabeled as a descendant unless evidence supports the declared relationship.

### 9.6 Authority laundering

An evaluator, observer, or recovery assessor cannot smuggle transition authority into evidence metadata. Raw credentials, provider session data, capability grants, or executable instructions are out of scope.

## 10. Fail-closed invariants

1. Every artifact binds one exact Cognitive Topology identifier and canonical digest where topology binding applies.
2. Every referenced active topology node must match the exact declared `model_id`.
3. Unknown fields fail closed.
4. Duplicate identifiers/evidence entries fail closed where uniqueness is required.
5. Canonical timestamp ordering is enforced.
6. Availability evidence past `valid_until` is stale and cannot establish current availability.
7. Stale evidence is not silently converted to unavailable evidence.
8. Conflicting fresh availability evidence is represented as conflict, not silently resolved by last-write-wins.
9. Exact artifact digest mismatch remains an explicit mismatch.
10. Observer/evaluator provenance must be retained.
11. Assurance classification cannot exceed the verification evidence present.
12. A lineage relationship cannot establish principal lineage.
13. A fidelity evaluation cannot establish principal continuity or subjective identity.
14. A high-fidelity result cannot authorize a model substitution.
15. Recovery-readiness status cannot authorize a model substitution.
16. Provider-controlled custody cannot become owner-controlled merely because availability is verified.
17. Acquisition evidence remains the authority for owner-acquired artifact evidence; availability evidence does not replace it.
18. Persistence availability remains distinct from model/runtime availability.
19. Missing required evaluation dimensions remain missing/indeterminate rather than passing.
20. Aggregate fidelity cannot be stronger than its policy and underlying dimension results permit.
21. Evaluation suite/metric changes require new content digests.
22. No contract includes raw credentials, tokens, cookies, vault keys, or provider session material.
23. Authority, network, runtime, topology mutation, adaptation, and acquisition effects remain exactly absent.
24. Existing Cognitive Continuity Report v0 behavior is not silently changed by this slice.

## 11. Determinism and implementation shape

Each contract should follow existing AXIOM evidence-library patterns:

- exact-object validation;
- bounded arrays;
- canonical digests through existing canonical primitives;
- deterministic sorting where order is not semantically meaningful;
- pure resolvers/builders;
- recursively frozen outputs;
- no mutation of supplied frozen inputs;
- JSON Schema mirrors with semantic-validator pointers;
- no new dependencies unless separately justified.

Recommended implementation modules:

```text
mesh/src/lib/cognitive-availability-attestation.mjs
mesh/src/lib/cognitive-lineage-manifest.mjs
mesh/src/lib/replacement-fidelity-evaluation.mjs
mesh/src/lib/cognitive-recovery-assessment.mjs
```

Recommended schema mirrors:

```text
mesh/config/cognitive-availability-attestation-v0.schema.json
mesh/config/cognitive-lineage-manifest-v0.schema.json
mesh/config/replacement-fidelity-evaluation-v0.schema.json
```

The recovery assessment may not require a standalone input schema if it is a derived report rather than a user-authored contract, but its output shape must be fully covered by tests.

## 12. TDD and verification requirements

Implementation should begin RED and cover at least:

### Availability attestation

- exact valid local artifact observation;
- valid provider/runtime observation;
- topology digest mismatch rejection;
- wrong node/model rejection;
- invalid artifact digest handling;
- method/topology incompatibility;
- invalid chronology;
- stale evidence classification in assessment;
- assurance without verification evidence rejection;
- unknown-field rejection;
- secret/effect boundary rejection;
- deterministic digest and frozen output.

### Cognitive lineage

- valid descendant lineage;
- valid unrelated replacement;
- candidate outside current topology without active-node claim;
- artifact/ref mismatch rejection;
- invalid relationship/procedure combinations;
- missing evidence classification;
- explicit test that cognitive lineage never proves principal lineage.

### Replacement fidelity

- full multidimensional high-fidelity fixture;
- degraded dimensions;
- failed required dimension;
- missing required dimension;
- indeterminate dimension;
- suite/metric digest mismatch;
- deterministic aggregation;
- no universal identity percentage;
- explicit principal/subjective-identity nonclaim.

### Recovery assessment

- all current dependencies available;
- critical dependency unavailable with no candidate;
- candidate available with strong fidelity evidence;
- candidate available with degraded fidelity;
- candidate available but insufficient evaluation;
- stale availability evidence;
- contradictory fresh availability evidence;
- provider-dependent versus owner-controlled recovery paths;
- deterministic result independent of input array order;
- frozen output and input non-mutation;
- mechanically tested zero-authority boundary.

Protected repository checks and compatibility platforms remain mandatory before merge.

## 13. Migration path after this slice

Once this evidence foundation exists, the next separately reviewed slices may include:

1. independently authorized observers that actually perform provider/local probes and emit Cognitive Availability Attestations;
2. provider-retirement and dependency-loss recovery drills;
3. topology transition proposals that consume recovery evidence but still do not execute transitions;
4. governed transition authorization;
5. only then, an executor capable of switching providers/models under explicit authority;
6. later, shadow/canary self-adaptation and learned routing artifacts.

The architecture intentionally delays automatic migration until the evidence and authority paths are independently mature.

## 14. Product interpretation

The end-user/operator should eventually be able to inspect one cognitive dependency and answer:

- Is it available now, and how do we know?
- Who observed it and when does that evidence expire?
- Is the observation merely declared, signed, locally verified, or corroborated?
- Is this candidate a descendant, provider successor, replacement, or unrelated model?
- Which capabilities and characteristic behaviors have been tested for fidelity?
- What is degraded or still unknown?
- Is recovery possible without substitution?
- If substitution is needed, what candidate evidence exists?
- What remains provider-dependent versus owner-controlled?
- What authority would still be required before anything actually changes?

The intended product principle is:

> **AXIOM should make cognitive dependency loss and recovery legible before making recovery automatic.**

## 15. Current non-claims

This design and its proposed v0 contracts do not claim to provide:

- live provider reachability;
- actual network probing;
- model invocation or runtime loading;
- automatic provider/model selection;
- topology mutation;
- persistence synchronization/export/restore;
- weight acquisition/download;
- training, fine-tuning, distillation, or adaptation;
- benchmark immunity to gaming;
- perfect behavioral equivalence;
- principal continuity proof;
- lineage continuity proof for the AXIOM principal/Self Bundle;
- subjective identity proof;
- transition authority;
- execution authority;
- production promotion.

# Capability Observation v0 — Design

**Status:** approved architectural extension; design-only specification for an inert evidence contract

**Date:** 2026-08-31

**Scope:** attributable, time-bounded empirical observations of one exact Cognitive Capability Profile under one exact evaluation context, without benchmark aggregation, ranking, routing, model invocation, training, spending, or authority effects.

**Builds on:**

- `docs/superpowers/specs/2026-08-30-cognitive-continuity-learning-economics-design.md`
- `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`
- `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- `mesh/src/lib/cognitive-capability-profile.mjs`
- `mesh/src/lib/cognitive-availability-attestation.mjs`
- `mesh/src/lib/replacement-fidelity-evaluation.mjs`
- `mesh/src/lib/cognitive-learning-ledger.mjs`

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative. Capability Observation v0 is evidence only. It does not invoke models, contact providers, perform network access, read credentials, execute benchmarks, train or adapt models, spend funds, rank candidates, select a model, mutate routing, alter Cognitive Topology, activate skills, promote learning records, or grant authority.

## 1. Core decision

AXIOM needs empirical capability evidence distinct from declared capability metadata, availability evidence, replacement fidelity, and learning promotion.

The neighboring contracts answer different questions:

1. **Cognitive Capability Profile v0** — what does an exact reviewed candidate declare about its capabilities and operating posture?
2. **Cognitive Availability Attestation v0** — was an exact topology component observed as available, unavailable, or indeterminate at a particular time?
3. **Replacement Fidelity Evaluation v0** — how does a candidate compare with an accepted reference across fidelity dimensions?
4. **Cognitive Learning Ledger v0** — what learned artifact exists, where might it belong, and what evidence/cost/reuse state accompanies that proposal?

Capability Observation v0 answers:

> **What empirical outcome was observed when this exact capability profile was evaluated for this capability in this exact context, using this exact evaluation definition?**

The governing rule is:

> **A capability claim is metadata. A capability observation is evidence. Evidence is contextual, attributable, time-bounded, and non-authorizing.**

## 2. Separate contract, not profile expansion

Capability observations must not be embedded into Cognitive Capability Profile v0. Profiles are relatively stable reviewed declarations; observations are numerous, time-varying, evaluator-specific, environment-specific evidence. Mixing them would churn profile digests, blur declarations with measurements, and turn provider/runtime metadata into an implicit benchmark database.

Capability Observation also does not replace:

- **Availability Attestation:** reachability is not competence.
- **Replacement Fidelity Evaluation:** replacement fidelity is comparative; capability observation records one contextual empirical outcome.
- **Cognitive Learning Ledger:** observed performance may support promotion evidence, but does not itself perform promotion.

## 3. Contract identity

Schema:

`axiom-cognitive-capability-observation.v0`

Version:

`0`

Status:

`inert-evidence`

The contract is content-addressed through the existing canonical digest mechanism.

## 4. Common lexical constraints

Implementation should reuse existing AXIOM contract conventions where practical.

- identifiers/references: bounded strings matching `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$` unless a referenced contract already imposes a stricter compatible bound;
- digests: lowercase 64-hex SHA-256 strings;
- units: bounded strings matching `^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,63}$`;
- timestamps: canonical ISO strings round-tripping through `Date.toISOString()`;
- all objects: plain objects, exact required fields, `additionalProperties:false` in the JSON Schema mirror;
- duplicate entries in bounded identifier arrays fail closed.

## 5. Exact profile binding

Each observation binds to exactly one Cognitive Capability Profile v0 through:

```text
profile_id
profile_digest
```

`resolveCognitiveCapabilityObservation(document, profile)` must validate the supplied profile and recompute its canonical digest.

Resolution fails closed unless:

- `profile_id` exactly matches the supplied profile;
- `profile_digest` exactly matches the canonical profile digest;
- `capability` is declared by that exact profile.

The resolved summary may copy `offering_ref` for operator convenience, but the exact profile remains authoritative for candidate identity.

## 6. Top-level shape

Capability Observation v0 contains exactly:

```text
schema
version
status
observation_id
profile_id
profile_digest
capability
context
evaluation
result
evaluator
evidence
resource_observations
observed_at
valid_until
recorded_at
contains_secret_material
authority_effect
network_effect
training_effect
spend_effect
runtime_activation
selection_effect
```

Unknown fields fail closed.

## 7. Capability vocabulary

`capability` uses exactly the existing Cognitive Capability Profile v0 vocabulary:

- `reasoning`
- `coding`
- `vision`
- `computer-use`
- `research`
- `planning`
- `critique`
- `summarization`
- `embedding`
- `tool-use`
- `agent-orchestration`
- `other`

Capability Observation v0 does not introduce a second capability taxonomy.

## 8. Context object

The context object contains exactly:

```text
context_ref
context_digest
task_family_ref
task_family_digest
difficulty_class
environment_ref
environment_digest
toolset_ref
toolset_digest
```

`context_ref/context_digest` identify the complete evaluated context artifact. Materially different prompts, system instructions, memory state, retrieval configuration, scaffolding, input fixtures, or tool permissions should produce a different context artifact/digest.

`task_family_ref/task_family_digest` identify the reviewed task-family definition.

`difficulty_class` is exactly one of:

- `trivial`
- `routine`
- `challenging`
- `expert`
- `adversarial`
- `unknown`

Difficulty is supplied by the evaluation definition; v0 does not infer it or claim a universal cross-domain scale.

`environment_ref/environment_digest` and `toolset_ref/toolset_digest` are mandatory. A no-tools evaluation must bind an explicit reviewed empty/no-tools artifact rather than use null. The contract records these identities only; it does not create the environment or invoke tools.

## 9. Evaluation object

The evaluation object contains exactly:

```text
suite_ref
suite_digest
metric_set_ref
metric_set_digest
threshold_ref
threshold_digest
method_ref
method_digest
```

The exact suite, metric set, threshold, and evaluation method are content-addressed separately so a benchmark label cannot hide changes to prompts, datasets, scoring, thresholds, or procedure.

`threshold_ref/threshold_digest` define how the observed metric is interpreted. Capability Observation v0 therefore has no universal built-in numeric meaning for `pass`, `degraded`, or `fail`.

`method_ref/method_digest` may identify zero-shot, few-shot, agentic-with-tools, human-reviewed, deterministic harness, simulation, or another reviewed procedure without widening the v0 schema.

## 10. Result object

The result object contains exactly:

```text
classification
confidence
observed_metric_ref
observed_metric_digest
failure_mode_refs
```

`classification` is exactly one of:

- `pass`
- `degraded`
- `fail`
- `indeterminate`

Semantics are threshold-relative:

- `pass` — satisfies the exact bound threshold definition;
- `degraded` — the bound evaluation definition classifies the measured outcome as partially acceptable/degraded;
- `fail` — fails the bound threshold definition;
- `indeterminate` — evidence is insufficient to classify under the bound definition.

`confidence` is a finite number in `[0,1]`. It is confidence in the observation/evaluation result as defined by the evaluator or method. It is not a probability of general intelligence, arbitrary future success, identity continuity, or a routing weight.

`observed_metric_ref/observed_metric_digest` identify the exact measured-result artifact. The metric itself remains externally referenced because different evaluations may produce accuracy, traces, trajectories, rubric results, error counts, distributions, or multidimensional records that are not directly comparable.

`failure_mode_refs` is a duplicate-free array with `0-32` identifiers. It may be empty for **any** classification. Empty means **no reviewed failure-mode attribution was recorded**; it does not mean absence of failure or absence of a failure mechanism.

## 11. Evaluator provenance

The evaluator object contains exactly:

```text
evaluator_kind
evaluator_ref
evaluator_principal_ref
```

`evaluator_kind` is exactly one of:

- `local-agent`
- `local-service`
- `remote-service`
- `human-reviewer`
- `provider`
- `external-verifier`
- `synthetic-harness`

`evaluator_ref` is mandatory. `evaluator_principal_ref` may be null when the evaluator is not represented by an AXIOM principal.

Evaluator provenance is evidence and grants no authority over the observed profile or subject agent.

## 12. Evidence object

The evidence object contains exactly:

```text
evidence_kind
evidence_ref
evidence_digest
verification_ref
verification_digest
assurance_class
```

`evidence_kind` is exactly one of:

- `evaluation-run`
- `signed-evaluation-run`
- `human-review`
- `external-observation`
- `provider-report`
- `synthetic-probe-result`
- `other`

`assurance_class` is exactly one of:

- `declared`
- `signed`
- `verified-local`
- `corroborated`

Rules:

- `evidence_ref/evidence_digest` are always required;
- `declared` requires `verification_ref:null` and `verification_digest:null`;
- `signed`, `verified-local`, and `corroborated` require non-null verification reference and digest;
- `verification_ref` and `verification_digest` are always null together or present together;
- `signed-evaluation-run` cannot use `assurance_class: declared`;
- assurance records evidence posture only and does not create a trust root or authority grant.

## 13. Resource observations

`resource_observations` is an array with `0-32` entries. Each item contains exactly:

```text
resource_class
basis
amount
unit
source_ref
```

`resource_class` is exactly one of:

- `input-tokens`
- `output-tokens`
- `compute-time`
- `wall-time`
- `energy`
- `memory`
- `storage`
- `network-transfer`
- `currency`
- `other`

`basis` is exactly one of:

- `observed`
- `estimated`
- `unknown`

Rules:

- observed/estimated entries require non-negative safe-integer `amount` and non-null bounded `unit`;
- unknown entries require `amount:null` and `unit:null`;
- `source_ref` may be null;
- unlike units are never implicitly converted or aggregated;
- no aggregate resource score is emitted;
- privacy, sovereignty, resilience, and quality are not monetized by this contract.

Explicit scaled units such as `microcad`, `milliseconds`, `millijoules`, `bytes`, or `tokens` are acceptable when defined by the supplying evaluation system.

## 14. Freshness and temporal semantics

The observation contains:

```text
observed_at
valid_until
recorded_at
```

Rules:

- all timestamps are canonical ISO timestamps;
- `valid_until >= observed_at`;
- `recorded_at >= observed_at`;
- validator and resolver never read the wall clock;
- later consumers evaluate staleness relative to an explicit assessment time;
- stale evidence is not rewritten into `fail`;
- historical evidence remains historical evidence even when too old for a current routing decision.

## 15. Public interfaces and pure resolver

Proposed interfaces:

```js
export const COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA =
  'axiom-cognitive-capability-observation.v0';

export function validateCognitiveCapabilityObservation(document) {}
export function cognitiveCapabilityObservationDigest(document) {}
export function resolveCognitiveCapabilityObservation(document, profile) {}
```

`validateCognitiveCapabilityObservation(document)` validates shape, lexical constraints, enum domains, array bounds, evidence posture, resource semantics, timestamps, and hard boundaries; it returns a frozen descriptive summary only.

`cognitiveCapabilityObservationDigest(document)` validates first and returns the canonical digest.

`resolveCognitiveCapabilityObservation(document, profile)`:

1. validates the observation;
2. validates the supplied Cognitive Capability Profile with the existing profile validator;
3. requires exact profile ID equality;
4. recomputes and requires exact profile digest equality;
5. requires observed capability membership in the profile;
6. returns a deeply frozen evidence summary.

The resolver must not invoke the offering, contact the provider, probe availability, read credentials, perform network I/O, execute benchmarks, create subprocesses, load models, modify routing, mutate Cognitive Topology, mutate the Cognitive Learning Ledger, authorize spending, or authorize training.

## 16. Hard boundary fields

Every document must contain exactly:

```text
contains_secret_material = false
authority_effect = none
network_effect = none
training_effect = none
spend_effect = none
runtime_activation = false
selection_effect = evidence-only
```

Any other value fails closed. The resolved summary repeats these constants mechanically.

> **Observed competence may inform a later policy decision. It never becomes permission to act.**

## 17. Non-claims

Capability Observation v0 does not claim:

- universal model intelligence;
- global capability rank;
- cross-benchmark metric comparability;
- future-task success probability;
- model availability;
- principal continuity;
- subjective identity continuity;
- provider trustworthiness;
- benchmark impartiality;
- absence of benchmark contamination;
- absence of evaluator bias;
- routing authority;
- execution authority;
- spend authority;
- training/adaptation authority;
- capability-registry promotion;
- skill/model activation;
- topology mutation.

A result is evidence under the exact bound context and evaluation definition, no more.

## 18. Relationship to future Capability Topology

Capability Observation v0 is intentionally atomic. It does not aggregate observations into a current capability score.

A later **Capability Topology Report** may consume multiple observations and derive evidence-relative surfaces such as:

- recent supported capability areas;
- known degraded areas;
- repeated failure-mode attributions;
- stale or missing evidence;
- context-dependent reliability;
- conflicting observations;
- evaluator diversity;
- tool/environment sensitivity;
- resource posture;
- evidence coverage by capability family.

That report should remain multidimensional and contextual rather than collapsing a component to an IQ-like scalar. Future routing policy may consume such a report, but routing remains a separate policy/effect layer.

## 19. Relationship to CCLE

Capability observations may later support CCLE decisions about whether:

- a skill improves performance;
- an adapter candidate preserves or improves a target capability;
- a persistent specialist is worth retaining;
- repeated provider use justifies local adaptation/distillation evaluation;
- a learning promotion has supporting outcome evidence;
- jagged capability requires composition with another specialist.

Capability Observation does not promote a Cognitive Learning Ledger record. A Ledger `evaluation_evidence` reference may point to a Capability Observation artifact or later report, but all Ledger promotion gates remain unchanged.

## 20. Conflict and repetition semantics

Capability Observation v0 is atomic and does not resolve conflicts. Two valid observations may disagree because of different suites, thresholds, contexts, environments, toolsets, provider/model drift, stochastic variation, evaluator disagreement, contamination, or measurement error.

Contradictory valid observations are not validation failures. A later aggregation layer must preserve contributing observation IDs and report conflict explicitly rather than applying opaque latest-wins semantics.

## 21. Threat model

### 21.1 Benchmark laundering

An actor changes prompts, tools, thresholds, test subsets, or scoring while retaining a familiar benchmark name.

**Mitigation:** exact digests for context, task family, environment, toolset, suite, metrics, threshold, and method.

### 21.2 Evidence spoofing

An actor fabricates result artifacts or evaluator claims.

**Mitigation:** evidence digests, evaluator provenance, assurance posture, and explicit verification references where claimed.

### 21.3 Metric laundering

Unlike metrics are presented as if directly comparable.

**Mitigation:** measured metrics remain content-addressed external artifacts; v0 emits only threshold-relative classification and no universal numeric score.

### 21.4 Stale-evidence routing

Old capability evidence is reused after model/provider behaviour changes.

**Mitigation:** explicit observation/expiry timestamps; later consumers decide freshness relative to an explicit assessment time.

### 21.5 Hidden scaffolding

A candidate appears capable only because omitted tools, system prompts, memory, retrieval, or environment support were available.

**Mitigation:** mandatory context, environment, and toolset identities with exact digests.

### 21.6 Benchmark contamination

A model may have trained on evaluation data.

**Mitigation:** v0 makes no contamination-free claim. Contamination evidence belongs in a future separable contract or evaluation artifact.

### 21.7 Authority laundering

A strong result is treated as permission to route privileged work or activate a model.

**Mitigation:** mechanically fixed zero-authority fields and `selection_effect = evidence-only`.

### 21.8 Provider self-report inflation

Provider-issued evidence overstates capability.

**Mitigation:** evaluator provenance remains visible; provider observations can coexist with independent/local evidence rather than replacing it.

## 22. v0 invariants

1. Every observation binds to exactly one Cognitive Capability Profile by ID and canonical digest.
2. The observed capability must be declared by that exact profile.
3. Unknown fields fail closed at every object boundary.
4. Every evaluation identity is content-addressed through exact suite, metric-set, threshold, and method references/digests.
5. Every context identity is content-addressed through exact context, task-family, environment, and toolset references/digests.
6. Classification is meaningful only relative to the bound threshold definition.
7. `confidence` is finite in `[0,1]` and never an intelligence probability or routing weight.
8. Observed metric content remains externally referenced and is never converted to a built-in universal score.
9. `failure_mode_refs` contains `0-32` duplicate-free identifiers; empty does not claim absence of failure.
10. `resource_observations` contains `0-32` entries and preserves amount/unit/basis without implicit aggregation.
11. Unknown resource observations require null amount and unit.
12. Evidence is attributable and content-addressed; non-declared assurance requires explicit verification references/digests.
13. `signed-evaluation-run` cannot claim merely declared assurance.
14. Timestamps are canonical; `valid_until` and `recorded_at` cannot precede `observed_at`.
15. Validator and resolver are pure and read no wall clock.
16. Conflicting valid observations may coexist; v0 does not silently resolve them.
17. No observation establishes availability, identity, universal intelligence, ranking, selection, or execution authority.
18. Hard boundary fields remain exact and fail closed on any other value.
19. No raw credentials, provider tokens, cookies, session secrets, vault keys, model bytes, executable benchmark code, or training payloads appear in the document.
20. Capability Observation cannot mutate Cognitive Capability Profile, Cognitive Topology, Cognitive Learning Ledger, routing state, capability-registry state, or runtime state.

## 23. First executable slice

The first implementation remains deliberately small:

1. strict semantic validator and deterministic digest;
2. JSON Schema 2020-12 mirror;
3. pure resolver against exact Cognitive Capability Profile v0;
4. tests for exact shape, lexical constraints, deterministic digests, profile binding, capability membership, context/evaluation bindings, evidence posture, array bounds, resource semantics, timestamps, deep-freeze/purity, and authority boundaries;
5. canonical documentation registration only when implementation is ready for repository verification.

No aggregation/report builder, Gateway route, provider call, model execution, scheduler, training process, UI, or routing policy belongs in the first slice.

## 24. Deferred slices

Future separable work may add:

- Capability Topology Report v0;
- explicit conflict/freshness interpretation;
- evaluation-suite registry contracts;
- benchmark-contamination evidence;
- repeated-observation reliability summaries;
- capability regression detection;
- context/tool sensitivity reports;
- learned routing-policy proposals;
- policy-governed routing selection;
- Axiom One visualization of jagged capability surfaces;
- ingestion bridges from external evaluation frameworks.

Each network-bearing or effect-bearing extension requires its own authority/threat review.

## 25. Product principle

The user should eventually be able to answer:

- What does this component claim it can do?
- What have we actually observed it doing?
- Under exactly what prompts, tools, environment, and evaluation definition?
- How recent is the evidence?
- Who produced it?
- What failure modes were actually attributed, if any?
- What did evaluation cost in actual measured units?
- Which conclusions are declarations, which are observations, and which are later policy judgments?

> **Do not ask whether a model is "smart." Ask what it has demonstrated, under which conditions, with what evidence, how recently, and with what authority consequences.**

# Capability Observation v0 — Design

**Status:** approved architectural extension; design-only specification for an inert evidence contract

**Date:** 2026-08-31

**Scope:** attributable, time-bounded empirical observations of one exact cognitive capability profile under one exact evaluation context, without benchmark aggregation, ranking, routing, model invocation, training, spending, or authority effects

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

AXIOM needs a contract for empirical capability evidence that is distinct from declared capability metadata, availability evidence, replacement fidelity, and learning promotion.

The existing layers answer different questions:

1. **Cognitive Capability Profile v0** — what does this exact reviewed candidate declare about its capabilities, deployment, data posture, economics, openness, and assurance?
2. **Cognitive Availability Attestation v0** — was this exact topology component observed as available, unavailable, or indeterminate at a particular time?
3. **Replacement Fidelity Evaluation v0** — how does a candidate compare against one accepted reference or baseline across fidelity dimensions?
4. **Cognitive Learning Ledger v0** — what learned artifact exists, where might it belong, and what evidence/cost/reuse state accompanies that proposal?

None of those contracts answers:

> **What empirical outcome was observed when this exact capability profile was evaluated for this capability in this exact context, using this exact evaluation definition?**

Capability Observation v0 fills that gap.

The governing rule is:

> **A capability claim is metadata. A capability observation is evidence. Evidence is contextual, attributable, time-bounded, and non-authorizing.**

## 2. Why Capability Observation is a separate contract

Capability Observation must not be embedded into Cognitive Capability Profile v0.

A profile is relatively stable routing-relevant metadata. Empirical observations are potentially numerous, time-varying, evaluator-specific, environment-specific, and replaceable. Embedding them in the profile would create several problems:

- profile digests would churn whenever a new benchmark result arrived;
- reviewed declarations and empirical evidence would become difficult to distinguish;
- historical observations could be silently overwritten by a newer profile revision;
- a provider/model catalog could become a benchmark database;
- routing policy pressure could leak into a contract intended only to describe candidates.

Capability Observation also must not replace Replacement Fidelity Evaluation v0. Fidelity evaluation is comparative and continuity-oriented: candidate versus reference. Capability Observation is absolute only in the limited evidence-relative sense that it records one observed outcome under one evaluation context. It makes no claim that the result is universal or reference-independent.

Capability Observation must likewise remain separate from Availability Attestation. A model can be available and perform poorly. A model can be unavailable today while retaining historical evidence of strong capability. Reachability is not competence.

## 3. Contract identity and status

Proposed schema identifier:

`axiom-cognitive-capability-observation.v0`

Version:

`0`

Status:

`inert-evidence`

The contract is content-addressed through the repository's canonical digest mechanism.

## 4. Exact profile binding

Each observation binds to exactly one Cognitive Capability Profile v0 through:

```text
profile_id
profile_digest
```

The resolver must validate the supplied Cognitive Capability Profile and recompute its canonical digest.

The observation must fail closed unless:

- `profile_id` matches the supplied profile exactly;
- `profile_digest` matches the canonical profile digest exactly;
- the observed capability is one of the capabilities declared by the supplied profile.

This prevents empirical evidence for one provider/model/runtime profile from being silently attributed to another revision or offering.

The observation may copy `offering_ref` into its resolved summary for operator convenience, but the source of truth remains the exact bound profile.

## 5. Top-level fields

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

## 6. Capability field

`capability` must use the same closed vocabulary as Cognitive Capability Profile v0:

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

The resolver additionally requires that the exact bound profile declares the same capability.

Capability Observation v0 does not add a second uncontrolled capability taxonomy.

## 7. Context object

Capability evidence is meaningful only with context. The context object contains exactly:

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

### 7.1 Context identity

`context_ref` and `context_digest` identify the complete evaluated context contract or artifact.

The exact digest is required because materially different prompts, system instructions, memory state, tool permissions, scaffolding, retrieval configuration, or input fixtures can materially change performance.

### 7.2 Task family

`task_family_ref` and `task_family_digest` identify the reviewed task-family definition.

Examples may include a coding benchmark family, legal-research task set, embodied-control suite, or user-specific workflow family. The contract does not prescribe a universal benchmark catalog.

### 7.3 Difficulty class

The closed v0 vocabulary is:

- `trivial`
- `routine`
- `challenging`
- `expert`
- `adversarial`
- `unknown`

This is descriptive metadata supplied by the evaluation definition. It is not inferred by Capability Observation v0 and does not establish a universal cross-domain scale.

### 7.4 Environment and toolset

`environment_ref` + `environment_digest` identify the execution/evaluation environment definition.

`toolset_ref` + `toolset_digest` identify the tools available during evaluation.

Both reference/digest pairs are mandatory in v0. A no-tools evaluation uses an explicit reviewed `none`/empty-toolset artifact rather than nulling the fields. This avoids ambiguity between "no tools" and "tool information omitted."

Capability Observation v0 records these identities only. It does not create the environment or invoke the tools.

## 8. Evaluation object

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

### 8.1 Exact suite and metric binding

The observation must identify the exact evaluation suite and exact metric set.

A benchmark name alone is insufficient because prompts, datasets, scoring code, thresholds, and aggregation methods may change while preserving a human-readable label.

### 8.2 Threshold binding

`threshold_ref` and `threshold_digest` identify the exact interpretation rule used to classify the outcome.

Capability Observation v0 therefore does not contain a universal built-in meaning for `pass`, `degraded`, or `fail`. The classification is evidence-relative to the bound threshold definition.

### 8.3 Method binding

`method_ref` and `method_digest` identify the exact evaluation method/procedure.

This permits distinctions such as zero-shot, few-shot, agentic-with-tools, human-reviewed, deterministic harness, simulation, or other future methods without widening the v0 schema with procedural detail.

## 9. Result object

The result object contains exactly:

```text
classification
confidence
observed_metric_ref
observed_metric_digest
failure_mode_refs
```

### 9.1 Classification

The closed v0 vocabulary is:

- `pass`
- `degraded`
- `fail`
- `indeterminate`

Semantics:

- `pass` — the observed metric satisfies the exact bound threshold definition;
- `degraded` — the evaluation definition explicitly classifies the observed metric as partially acceptable/degraded;
- `fail` — the observed metric fails the exact bound threshold definition;
- `indeterminate` — available evidence is insufficient to classify the result under the bound evaluation definition.

The observation does not convert this classification into a model rank, capability score, selection weight, or authority decision.

### 9.2 Confidence

`confidence` is a finite number from `0` through `1` inclusive.

It represents confidence in the observation/evaluation result as defined by the evaluator or evaluation method. It is not:

- a probability that the model is intelligent;
- a probability that the model will succeed on arbitrary future tasks;
- a probability of identity continuity;
- a selection weight.

### 9.3 Observed metric artifact

`observed_metric_ref` and `observed_metric_digest` identify the exact measured result artifact.

The contract does not impose a universal numeric metric field. Different evaluations may produce accuracy, latency distributions, structured error counts, pass/fail traces, trajectories, rubric scores, or multidimensional result files.

Keeping the metric content externally referenced prevents Capability Observation v0 from pretending unlike metrics are directly comparable.

### 9.4 Failure modes

`failure_mode_refs` is a bounded duplicate-free array of opaque identifiers naming reviewed failure-mode records or taxonomy entries.

It may be empty for pass or indeterminate observations.

The contract does not infer failure modes automatically.

## 10. Evaluator provenance

The evaluator object contains exactly:

```text
evaluator_kind
evaluator_ref
evaluator_principal_ref
```

The closed v0 evaluator-kind vocabulary is:

- `local-agent`
- `local-service`
- `remote-service`
- `human-reviewer`
- `provider`
- `external-verifier`
- `synthetic-harness`

`evaluator_ref` is mandatory.

`evaluator_principal_ref` may be null where the evaluator is not represented by an AXIOM principal.

Evaluator provenance is evidence. It grants no authority over the observed profile or subject agent.

## 11. Evidence object

The evidence object contains exactly:

```text
evidence_kind
evidence_ref
evidence_digest
verification_ref
verification_digest
assurance_class
```

Evidence kinds:

- `evaluation-run`
- `signed-evaluation-run`
- `human-review`
- `external-observation`
- `provider-report`
- `synthetic-probe-result`
- `other`

Assurance classes:

- `declared`
- `signed`
- `verified-local`
- `corroborated`

Rules:

- `evidence_ref` and `evidence_digest` are always required;
- `declared` assurance requires `verification_ref:null` and `verification_digest:null`;
- `signed`, `verified-local`, and `corroborated` require non-null verification reference and digest;
- an assurance label records evidence posture only; it does not create a trust root or authority grant.

Capability Observation v0 reuses the general evidence posture already established by cognitive observability rather than inventing a parallel assurance theory.

## 12. Resource observations

Capability evaluation may have meaningful direct resource cost. The contract records observations without collapsing unlike units.

`resource_observations` is a bounded array. Each item contains exactly:

```text
resource_class
basis
amount
unit
source_ref
```

Resource classes:

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

Basis:

- `observed`
- `estimated`
- `unknown`

Rules mirror the CCLE cost discipline:

- observed/estimated entries require non-negative safe-integer `amount` plus a bounded unit identifier;
- unknown entries require `amount:null` and `unit:null`;
- `source_ref` may be null when no separate source artifact exists;
- no automatic conversion between units occurs;
- no aggregate resource score is generated;
- privacy, sovereignty, resilience, or quality are not monetized by this contract.

Examples of acceptable units include explicit scaled units such as `microcad`, `milliseconds`, `millijoules`, `bytes`, or `tokens` where defined by the supplying evaluation system.

## 13. Freshness and temporal semantics

Capability can drift because models, providers, serving stacks, prompts, tools, policies, retrieval systems, and surrounding infrastructure change.

The observation therefore contains:

```text
observed_at
valid_until
recorded_at
```

Rules:

- all timestamps are canonical ISO timestamps;
- `valid_until >= observed_at`;
- `recorded_at >= observed_at`;
- the validator does not read the wall clock;
- future consumers decide whether evidence is stale relative to an explicit assessment time;
- stale evidence is not rewritten into `fail`;
- a historical strong result remains historical evidence even if it is too old for current routing decisions.

## 14. Pure resolver semantics

Proposed public interfaces:

```js
export const COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA =
  'axiom-cognitive-capability-observation.v0';

export function validateCognitiveCapabilityObservation(document) {}
export function cognitiveCapabilityObservationDigest(document) {}
export function resolveCognitiveCapabilityObservation(document, profile) {}
```

`validateCognitiveCapabilityObservation(document)`:

- validates exact shape, enum domains, bounds, timestamps, paired references/digests, resource semantics, evidence semantics, and hard boundary values;
- returns a frozen descriptive summary only.

`cognitiveCapabilityObservationDigest(document)`:

- validates first;
- returns the canonical digest.

`resolveCognitiveCapabilityObservation(document, profile)`:

1. validates the observation;
2. validates the supplied Cognitive Capability Profile through its existing validator;
3. requires exact `profile_id` equality;
4. recomputes and requires exact `profile_digest` equality;
5. requires the observed `capability` to be declared by the profile;
6. returns a deeply frozen resolved evidence summary.

The resolver must not:

- invoke the offering;
- access its runtime/provider catalog entry remotely;
- probe availability;
- read credentials;
- perform network I/O;
- execute a benchmark;
- create subprocesses;
- load a model;
- modify routing;
- modify Cognitive Topology;
- modify the Cognitive Learning Ledger;
- authorize spending or training.

## 15. Hard authority and activation boundary

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

Any other value fails closed.

The resolved summary should repeat these constants mechanically.

The governing invariant is:

> **Observed competence may inform a later policy decision. It never becomes permission to act.**

## 16. Non-claims

Capability Observation v0 explicitly does not claim:

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

## 17. Relationship to capability topology

Capability Observation v0 is intentionally atomic.

It does not aggregate multiple observations into a current capability score.

A later **Capability Topology Report** may consume multiple observations and derive evidence-relative surfaces such as:

- recent supported capability areas;
- known degraded areas;
- repeated failure modes;
- stale or missing evidence;
- context-dependent reliability;
- conflicting observations;
- evaluator diversity;
- tool/environment sensitivity;
- cost/latency/resource posture;
- evidence coverage by capability family.

That later report should remain multidimensional and contextual. It should not collapse the agent or model to a universal IQ-like scalar.

Future routing policy may consume a Capability Topology Report, but routing remains a separate policy/effect layer.

## 18. Relationship to CCLE

Capability Observation provides empirical evidence that CCLE may later use when evaluating:

- whether a skill actually improves performance;
- whether an adapter candidate preserves or improves target capability;
- whether a persistent specialist is worth retaining;
- whether repeated provider use justifies local adaptation/distillation evaluation;
- whether a proposed learning promotion has supporting outcome evidence;
- whether a cognitive component has jagged capability that requires composition with another specialist.

Capability Observation does not itself promote a Cognitive Learning Ledger record.

A Ledger `evaluation_evidence` reference may point to a Capability Observation artifact or a higher-level report when policy permits, but the Ledger's own promotion gates remain unchanged.

## 19. Conflict and repetition semantics

Capability Observation v0 is an atomic record and does not resolve conflicts.

Two valid observations may disagree because of:

- different evaluation suites;
- different thresholds;
- different environments;
- different toolsets;
- model/provider drift;
- stochastic variation;
- evaluator disagreement;
- data contamination;
- measurement error.

The presence of contradictory observations is not a validation failure unless they are malformed individually.

A future Capability Topology Report should preserve contributing observation IDs and report conflicts explicitly rather than applying opaque latest-wins logic.

## 20. Threat model

### 20.1 Benchmark laundering

An actor may advertise a strong result while changing prompts, tools, thresholds, or test subsets.

Mitigation: exact digests for context, task family, environment, toolset, suite, metrics, threshold, and method.

### 20.2 Evidence spoofing

An actor may fabricate a result artifact or evaluator claim.

Mitigation: exact evidence digests, evaluator provenance, assurance posture, and separate verification references where claimed.

### 20.3 Metric laundering

Unlike metrics may be presented as comparable scores.

Mitigation: observed metrics remain separately content-addressed; v0 emits only threshold-relative classification and no universal numeric score.

### 20.4 Stale-evidence routing

Old capability evidence may be reused after model/provider behaviour changes.

Mitigation: explicit `observed_at` and `valid_until`; later consumers evaluate freshness relative to an explicit assessment time.

### 20.5 Tool/environment omission

A model may appear capable only because hidden scaffolding or tools were available.

Mitigation: mandatory context/environment/toolset identities with exact digests.

### 20.6 Benchmark contamination

A model may have trained on evaluation data.

Mitigation: v0 makes no contamination-free claim. Evidence or future evaluation definitions may record contamination analysis separately.

### 20.7 Authority laundering

A strong empirical result may be treated as permission to route privileged work or activate a model.

Mitigation: mechanically fixed zero-authority fields and explicit `selection_effect = evidence-only`.

### 20.8 Provider self-report inflation

Provider-issued evaluations may overstate capability.

Mitigation: evaluator provenance remains visible; provider evidence can coexist with independent/local observations instead of replacing them.

## 21. v0 invariants

1. Every observation binds to exactly one Cognitive Capability Profile by ID and canonical digest.
2. The observed capability must be declared by that exact profile.
3. Unknown fields fail closed at every object boundary.
4. Every evaluation identity is content-addressed through exact suite, metric-set, threshold, and method references/digests.
5. Every context identity is content-addressed through exact context, task-family, environment, and toolset references/digests.
6. A classification is meaningful only relative to the exact bound threshold definition.
7. `confidence` is bounded to `[0,1]` and is never treated as an intelligence probability or routing weight.
8. Observed metric content remains externally referenced and is not converted to a universal built-in score.
9. Resource observations preserve unit, basis, and amount; unlike units are never implicitly aggregated.
10. Unknown resource observations require null amount and unit.
11. Evidence posture is attributable and content-addressed; verified assurance claims require explicit verification references/digests.
12. Timestamps are canonical; `valid_until` and `recorded_at` cannot precede `observed_at`.
13. The validator and resolver are pure and read no wall clock.
14. Conflicting valid observations may coexist; v0 does not silently resolve them.
15. No observation establishes availability, identity, universal intelligence, ranking, selection, or execution authority.
16. `contains_secret_material`, `authority_effect`, `network_effect`, `training_effect`, `spend_effect`, `runtime_activation`, and `selection_effect` remain exact hard boundary values.
17. No raw credentials, provider tokens, cookies, session secrets, vault keys, model bytes, executable benchmark code, or training payloads may appear in the document.
18. Capability Observation v0 cannot mutate Cognitive Capability Profile, Cognitive Topology, Cognitive Learning Ledger, routing state, capability registry state, or runtime state.

## 22. First executable slice

The first implementation should remain deliberately small:

1. strict semantic validator and deterministic digest;
2. strict JSON Schema 2020-12 mirror;
3. pure resolver against exact Cognitive Capability Profile v0;
4. tests for shape, digests, profile binding, capability membership, evidence posture, context/evaluation bindings, resource semantics, timestamps, deep-freeze/purity, and authority boundaries;
5. canonical documentation registration only after implementation is ready for repository verification.

No aggregation/report builder belongs in the first slice.

No Gateway route, provider call, model execution, scheduler, training process, UI, or routing policy belongs in the first slice.

## 23. Deliberately deferred slices

Future separable work may add:

- Capability Topology Report v0;
- explicit conflict/freshness interpretation;
- evaluation-suite registry contracts;
- benchmark contamination evidence;
- repeated-observation reliability summaries;
- capability regression detection;
- context/tool sensitivity reports;
- learned routing-policy proposals;
- policy-governed routing selection;
- Axiom One visualization of jagged capability surfaces;
- ingestion bridges from external benchmark/evaluation frameworks.

Each effect-bearing or network-bearing extension requires its own authority/threat review.

## 24. Product principle

The user should eventually be able to inspect a cognitive component and answer:

- What does it claim it can do?
- What have we actually observed it doing?
- Under exactly what prompts, tools, environment, and evaluation definition?
- How recent is that evidence?
- Who produced it?
- What failed, and under which conditions?
- What did the evaluation cost in actual measured units?
- Which conclusions are declarations, which are observations, and which are later policy judgments?

The intended product posture is:

> **Do not ask whether a model is "smart." Ask what it has demonstrated, under which conditions, with what evidence, how recently, and with what authority consequences.**

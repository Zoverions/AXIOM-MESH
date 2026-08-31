# Cognitive Capability Surface Report v0 — Design

**Status:** approved architectural extension; design-only specification for an inert evidence-aggregation contract

**Date:** 2026-08-31

**Scope:** deterministic, attributable aggregation of multiple Capability Observation v0 artifacts for one exact Cognitive Capability Profile into a multidimensional evidence surface, without universal scoring, candidate ranking, routing, model invocation, training, spending, topology mutation, learning promotion, or authority effects.

**Builds on:**

- `docs/superpowers/specs/2026-08-30-cognitive-continuity-learning-economics-design.md`
- `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`
- `docs/superpowers/specs/2026-08-31-capability-observation-v0-design.md`
- `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- `mesh/src/lib/cognitive-capability-profile.mjs`
- `mesh/src/lib/cognitive-capability-observation.mjs`
- `mesh/src/lib/cognitive-topology.mjs`

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative. Cognitive Capability Surface Report v0 is evidence aggregation only. It does not invoke models, contact providers, execute benchmarks, read credentials, perform network access, select or rank candidates, route work, train or adapt models, spend funds, mutate Cognitive Topology, alter Agent Composition, activate skills/models, promote Cognitive Learning Ledger records, or grant authority.

## 1. Core decision

AXIOM needs a way to answer a question that neither declared capability metadata nor individual empirical observations can answer alone:

> **What multidimensional empirical evidence currently exists about this exact cognitive capability profile, when every contributing observation remains attributable to its exact context, evaluation definition, time, evaluator, assurance posture, and resource evidence?**

The governing doctrine is:

> **Capability is a surface, not a score. Contextual variation is evidence, not noise. Aggregation summarizes evidence; it does not manufacture truth, preference, or authority.**

Cognitive Capability Surface Report v0 therefore aggregates Capability Observation v0 artifacts for one exact Cognitive Capability Profile while preserving the distinctions that make those observations meaningful.

It does not answer which candidate is best. It does not choose who should think about a task. It does not authorize any resulting action.

## 2. Naming and relationship to Cognitive Topology

AXIOM already implements **Cognitive Topology v0**. That contract describes which model components belong to an Agent Composition and how those components relate to persistence, custody, continuity importance, fidelity importance, model roles, and sovereignty posture.

This design must not overload or mutate Cognitive Topology.

The distinction is:

- **Cognitive Topology v0:** what cognitive components constitute this agent, and how are they structurally related to continuity, custody, and persistence?
- **Cognitive Capability Profile v0:** what does this exact provider/runtime offering declare it can do?
- **Capability Observation v0:** what happened in one exact empirical evaluation of one declared capability?
- **Cognitive Capability Surface Report v0:** what empirical capability evidence is represented across multiple attributable observations for this exact profile at an explicit assessment time?
- **Cognitive Eligibility Report v0:** does the candidate satisfy caller-supplied declared constraints?
- **future router:** given separately authorized policy inputs, which eligible cognitive capability should be used for cognition?
- **authority layer:** may any proposed effect actually occur?

The Surface Report is therefore an adjunct evidence contract, not a replacement for topology, eligibility, or routing.

## 3. Why v0 is per-profile rather than comparative

The first executable slice aggregates observations for **one exact Cognitive Capability Profile**.

It deliberately does not aggregate multiple profiles into a comparative matrix.

A multi-profile report would immediately create pressure to introduce:

- candidate ordering;
- weighted averages;
- hidden normalization across unlike evaluations;
- winner selection;
- routing policy;
- economic normalization;
- implied universal quality rankings.

Those are separate policy questions.

A per-profile evidence surface keeps the first aggregation layer descriptive and attributable.

## 4. Contract identity

Schema:

`axiom-cognitive-capability-surface-report.v0`

Version:

`0`

Status:

`inert-evidence-report`

The report is content-addressed through the existing canonical digest mechanism.

## 5. Common lexical constraints

Implementation should follow established AXIOM contract conventions.

- identifiers/references: bounded strings matching `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$`;
- digests: lowercase 64-hex SHA-256 strings;
- units: bounded strings matching `^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,63}$`;
- timestamps: canonical ISO timestamps that round-trip through `Date.toISOString()`;
- all objects: plain objects with exact required fields;
- JSON Schema objects use `additionalProperties:false`;
- duplicate identifiers or duplicate exact observation digests fail closed where the contract requires set semantics;
- input array ordering never changes derived ordering or the canonical digest of the same logical report.

## 6. Exact profile binding

Every Surface Report binds to exactly one Cognitive Capability Profile v0 through:

```text
profile_id
profile_digest
```

Derivation and verification must validate the supplied profile and recompute its canonical digest.

The report fails verification unless:

- `profile_id` exactly matches the supplied profile;
- `profile_digest` exactly matches the canonical profile digest;
- every contributing observation binds to that same exact profile;
- every contributing observation's capability remains declared by the profile.

The report does not silently combine evidence across profile revisions, provider offering revisions, or different profile digests.

If a provider/model changes enough to produce a new Capability Profile digest, that new profile receives a separate Surface Report.

## 7. Observation-set binding

The report binds a bounded observation set.

`observations` is an array with `0-256` entries. Each entry contains exactly:

```text
observation_id
observation_digest
capability
freshness_class
```

The observation set is sorted deterministically by `observation_id` and then `observation_digest`.

Rules:

- every observation is validated through Capability Observation v0;
- every observation digest is recomputed and must exactly match the report entry;
- every observation must bind to the exact report profile;
- duplicate `observation_id` values fail closed;
- duplicate exact observation digests fail closed to prevent accidental or deliberate count inflation;
- an empty observation set is valid because absence of empirical evidence is itself an important surface condition;
- the report never fabricates a synthetic observation for an unobserved capability.

## 8. Explicit assessment time

The report contains an explicit canonical timestamp:

```text
assessment_at
```

Neither derivation nor verification reads the wall clock.

All freshness classification is relative to this supplied timestamp.

This allows deterministic historical reconstruction and audit.

## 9. Time-travel-safe freshness semantics

Each contributing observation is classified into exactly one of four freshness classes relative to `assessment_at`:

- `current`
- `stale`
- `future`
- `not-yet-recorded`

Classification order is normative:

1. if `observation.observed_at > assessment_at`, classify `future`;
2. otherwise, if `observation.recorded_at > assessment_at`, classify `not-yet-recorded`;
3. otherwise, if `observation.valid_until < assessment_at`, classify `stale`;
4. otherwise classify `current`.

This order prevents hindsight leakage.

### 9.1 Current

The observation describes an event that had occurred, had been recorded into AXIOM's evidence state, and had not expired by `assessment_at`.

Current observations participate in the active capability surface.

### 9.2 Stale

The observation was already known by `assessment_at`, but its explicit validity horizon had expired.

Stale observations remain attributable historical evidence. They do not participate in current-cell classification counts, current conflict detection, current evaluator coverage, or current resource ranges.

Stale does not mean fail.

### 9.3 Future

The empirical event itself occurs after `assessment_at`.

Future observations are visible in the provenance inventory when reconstructing a report from a supplied full observation corpus, but they are excluded from the active surface.

### 9.4 Not yet recorded

The empirical event had occurred by `assessment_at`, but `recorded_at` is later than `assessment_at`.

Such evidence must not influence what AXIOM is represented as knowing at the historical assessment time.

This is distinct from `future` and prevents retrospective evidence ingestion from silently rewriting prior decision context.

## 10. Declared capabilities are always represented

The report contains one `capability_surface` entry for **every capability declared by the exact bound profile**, sorted by the canonical Capability Profile vocabulary order:

1. `reasoning`
2. `coding`
3. `vision`
4. `computer-use`
5. `research`
6. `planning`
7. `critique`
8. `summarization`
9. `embedding`
10. `tool-use`
11. `agent-orchestration`
12. `other`

A declared capability with no current observations remains present with zero current evidence cells.

The contract explicitly preserves:

```text
declared capability + no observations != observed failure
```

Absence of evidence is reported as absence of evidence.

## 11. Comparison-cell identity

Capability observations may only be grouped into the same evidence cell when the following dimensions are exactly identical:

```text
capability
context_ref
context_digest
task_family_ref
task_family_digest
difficulty_class
environment_ref
environment_digest
toolset_ref
toolset_digest
suite_ref
suite_digest
metric_set_ref
metric_set_digest
threshold_ref
threshold_digest
method_ref
method_digest
```

The cell identity is the canonical digest of this exact dimension object.

This prevents benchmark labels, task-family names, or similar-looking contexts from being treated as equivalent when their content-addressed definitions differ.

A materially different prompt, memory state, system instruction, retrieval configuration, environment, toolset, evaluation suite, metric set, threshold, or method therefore creates a distinct cell.

## 12. Why cells are exact rather than normalized

V0 performs no semantic equivalence inference.

It does not infer that:

- two benchmark versions are approximately the same;
- two prompts test the same latent skill;
- two metric sets are convertible;
- two difficulty labels are universally comparable;
- two tool configurations are equivalent;
- one evaluator's confidence calibration matches another's.

Such inference may become a separately governed research/evaluation layer later.

For v0, exact content-addressed identity is the only comparison basis.

## 13. Capability-surface entry

Each capability-surface entry contains exactly:

```text
capability
declared
observation_counts
current_cells
variation_present
direct_conflict_cells
mixed_classification_cells
current_evaluator_coverage
current_assurance_classes
current_failure_modes
current_resource_ranges
```

`declared` is always `true` because only profile-declared capabilities are represented.

### 13.1 Observation counts

`observation_counts` contains exactly:

```text
current
stale
future
not_yet_recorded
```

Each is a non-negative safe integer derived from the bound observation inventory for that capability.

The counts are descriptive. They are not evidence weights.

## 14. Current evidence cells

`current_cells` contains only `current` observations.

Each cell contains exactly:

```text
cell_digest
dimensions
observation_refs
classification_counts
classification_set
conflict_class
evaluator_kinds
evaluator_refs
assurance_classes
failure_modes
resource_ranges
```

Cells are sorted by `cell_digest`.

### 14.1 Observation references

`observation_refs` is a sorted array of exact pairs:

```text
observation_id
observation_digest
```

Every contributing observation remains attributable.

### 14.2 Classification counts

`classification_counts` contains exactly:

```text
pass
degraded
fail
indeterminate
```

Counts do not imply voting or truth by majority.

The report does not emit a winner, prevailing classification, weighted classification, or average confidence.

### 14.3 Classification set

`classification_set` is the sorted set of classifications represented in the cell.

This preserves the shape of disagreement without converting it into a single answer.

## 15. Conflict semantics

Each current cell has exactly one `conflict_class`:

- `none`
- `mixed`
- `direct`

Rules:

- `direct` if the cell contains at least one `pass` and at least one `fail`;
- otherwise `mixed` if the cell contains more than one distinct non-`indeterminate` classification;
- otherwise `none`.

`indeterminate` does not by itself conflict with another classification because it states insufficient classification evidence rather than the opposite result.

Examples:

```text
pass + pass -> none
pass + indeterminate -> none
pass + degraded -> mixed
degraded + fail -> mixed
pass + fail -> direct
pass + degraded + fail -> direct
```

No conflict class decides which observation is correct.

## 16. Cross-cell variation

At the capability level, `variation_present` is a boolean.

It is `true` when at least two current cells for the same capability contain different represented non-`indeterminate` classification sets.

It is descriptive only.

Variation across different cells is **not** labeled direct contradiction because the context/evaluation dimensions differ.

For example:

```text
same capability
+ different toolset
+ pass in one cell
+ fail in another cell
```

means the observed capability is sensitive to the changed evaluation context/toolset. It does not permit the report to collapse both observations into a claim that the candidate is simply "unreliable" or "bad".

The report may therefore expose both:

- direct conflict within an exact cell; and
- cross-cell variation across different exact contexts.

These are different evidence conditions.

## 17. No universal score, majority vote, or hidden ranking

Surface Report v0 must not emit:

- an intelligence score;
- an overall quality score;
- an overall capability score;
- a normalized benchmark score;
- a weighted average confidence;
- a majority-vote classification;
- a preferred capability;
- a preferred model/provider;
- a candidate rank;
- a routing weight;
- a hidden policy utility score.

Observation counts, evaluator counts, classification counts, and resource ranges are descriptive evidence inventory only.

A hundred pass observations do not automatically override one fail observation. A later policy layer may decide how evidence should influence routing for a specific task, consequence class, assurance requirement, or risk posture.

That later policy must remain explicit and separately authorized.

## 18. Evaluator coverage

For current evidence, the report preserves evaluator provenance without inventing evaluator weights.

At both cell and capability level it records sorted unique sets of:

- `evaluator_kinds`;
- `evaluator_refs`;
- `assurance_classes`.

The capability-level fields are named:

```text
current_evaluator_coverage
current_assurance_classes
```

`current_evaluator_coverage` contains exactly:

```text
evaluator_kinds
evaluator_refs
```

The report does not infer that distinct evaluator references are statistically independent.

It therefore uses the term **distinct evaluator references**, not "independent evaluators," unless independence is established by a future separately defined evidence contract.

Provider self-report, local verification, human review, and external corroboration remain visibly distinguishable through the underlying observation assurance/evidence metadata.

## 19. Failure-mode aggregation

Failure modes remain attributable references, not explanatory truth.

At cell and capability levels, `failure_modes` / `current_failure_modes` are sorted arrays of objects:

```text
failure_mode_ref
supporting_observations
```

`supporting_observations` is a sorted array of exact observation ID/digest pairs.

The report does not infer causal correctness from repetition.

Multiple observations repeating the same failure-mode attribution may increase the size of its support set, but the report does not translate that count into probability or causal confidence.

## 20. Resource aggregation

Resource evidence is aggregated only when units and resource semantics are exactly compatible.

A resource bucket identity contains exactly:

```text
resource_class
basis
unit
```

Rules:

- only `current` observations contribute to current resource ranges;
- `unknown` basis entries have `unit:null` and `amount:null` and are represented separately from measured/estimated numeric ranges;
- observed and estimated values are never silently combined because `basis` is part of the bucket identity;
- unlike units are never converted;
- currency units are never converted;
- privacy, sovereignty, resilience, quality, and authority are never monetized;
- no aggregate resource score is emitted.

For numeric buckets, the report may contain exactly:

```text
resource_class
basis
unit
observation_count
minimum
maximum
supporting_observations
```

For `basis: unknown`, it contains:

```text
resource_class
basis
unit: null
observation_count
minimum: null
maximum: null
supporting_observations
```

V0 deliberately does not emit arithmetic means, percentiles, or normalized cost estimates because heterogeneous tasks and contexts can make such statistics misleading.

Economic amortization and placement analysis belong in the later CCLE cost/reuse layer.

## 21. Top-level report shape

A Surface Report contains exactly:

```text
schema
version
status
report_id
profile_id
profile_digest
assessment_at
observations
capability_surfaces
report_resource_ranges
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

### 21.1 Report identifier

`report_id` is an opaque bounded identifier supplied by the caller/recording system.

It does not participate in aggregation semantics beyond being part of the canonical report artifact.

### 21.2 Recorded time

`recorded_at` is a canonical timestamp supplied explicitly to derivation.

`recorded_at >= assessment_at` is required.

The derivation function never reads the wall clock.

## 22. Deterministic derivation interface

Proposed public interfaces:

```js
export const COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA =
  'axiom-cognitive-capability-surface-report.v0';

export function validateCognitiveCapabilitySurfaceReport(document) {}
export function cognitiveCapabilitySurfaceReportDigest(document) {}
export function deriveCognitiveCapabilitySurfaceReport({
  report_id,
  profile,
  observations,
  assessment_at,
  recorded_at
}) {}
export function verifyCognitiveCapabilitySurfaceReport(document, profile, observations) {}
```

### 22.1 Derivation

`deriveCognitiveCapabilitySurfaceReport(...)` must:

1. validate the exact Cognitive Capability Profile;
2. validate every Capability Observation;
3. recompute every observation digest;
4. require every observation to bind to the exact supplied profile;
5. reject duplicate observation IDs;
6. reject duplicate exact observation digests;
7. classify every observation relative to explicit `assessment_at`;
8. create one capability entry for every profile-declared capability;
9. group only current observations into exact comparison cells;
10. derive classification inventories and conflict classes without selecting a winner;
11. derive cross-cell variation without treating contextual differences as direct contradiction;
12. derive evaluator/assurance coverage;
13. derive attributable failure-mode support;
14. derive unit-preserving resource ranges;
15. sort every set-derived array deterministically;
16. emit hard zero-effect boundary fields;
17. deep-freeze the returned report.

The same logical inputs, regardless of observation input ordering, must produce the same report and canonical digest when `report_id`, `assessment_at`, and `recorded_at` are identical.

### 22.2 Verification

`verifyCognitiveCapabilitySurfaceReport(document, profile, observations)` must:

1. validate the supplied report;
2. validate the exact profile;
3. validate all supplied observations;
4. require the report observation inventory to correspond exactly to the supplied observation set by ID and canonical digest;
5. derive a fresh report using the report's own `report_id`, `assessment_at`, and `recorded_at`;
6. require the derived canonical digest to equal the supplied report canonical digest;
7. return a frozen verification summary only.

Verification performs no I/O or external lookup.

## 23. Canonical ordering rules

To make input order irrelevant, v0 defines deterministic ordering explicitly.

- report observation inventory: `observation_id`, then `observation_digest`;
- capability surfaces: canonical capability vocabulary order from the bound profile declaration set;
- current cells: `cell_digest` lexical order;
- observation references within cells/support sets: `observation_id`, then digest;
- classification set: fixed order `pass`, `degraded`, `fail`, `indeterminate` filtered to represented values;
- evaluator kinds: lexical order;
- evaluator refs: lexical order;
- assurance classes: fixed order `declared`, `signed`, `verified-local`, `corroborated` filtered to represented values;
- failure-mode references: lexical order;
- resource buckets: `resource_class`, then `basis`, then normalized unit ordering where `null` sorts before strings.

A verifier must reject structurally valid but non-canonical ordering rather than silently reordering a supplied report and accepting it.

## 24. Hard boundary fields

Every report must contain exactly:

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

The core law is:

> **Aggregation does not amplify authority.**

If every source observation is non-authorizing evidence, the aggregate remains non-authorizing evidence regardless of observation count, evaluator diversity, assurance posture, or apparent capability strength.

## 25. Prohibited effects

Validation, derivation, digesting, and verification must perform no:

- model/provider invocation;
- benchmark execution;
- network request;
- filesystem discovery beyond ordinary module loading;
- subprocess creation;
- credential lookup or use;
- wallet/payment action;
- spending authorization;
- model download/acquisition;
- adaptation/training/distillation;
- skill activation;
- model activation;
- routing mutation;
- candidate selection;
- Cognitive Topology mutation;
- Agent Composition mutation;
- Cognitive Learning Ledger mutation/promotion;
- capability-registry promotion;
- principal/authority mutation.

The first implementation slice must import no runtime surface that could perform these effects.

## 26. Relationship to eligibility

Eligibility and empirical evidence remain separate.

A candidate can be:

- eligible under declared policy constraints but poorly evidenced;
- eligible with conflicting empirical evidence;
- eligible with strong current evidence;
- ineligible despite strong empirical performance because its retention, training-use, locality, cost, assurance, or other declared posture violates caller policy.

Therefore Surface Report v0 does not alter `evaluateCognitiveCandidates(...)` and does not make empirical success override eligibility policy.

## 27. Relationship to future routing

A later router may consume, among other explicit inputs:

- Cognitive Eligibility Reports;
- Cognitive Capability Surface Reports;
- Cognitive Availability Attestations;
- task requirements;
- consequence/risk class;
- privacy policy;
- latency requirements;
- budget/spend authorization;
- continuity/fidelity requirements;
- operator/user policy;
- required assurance posture.

That future router may choose **who thinks about a task**.

It still must not choose **who is authorized to perform an effect** merely because a candidate is capable.

The invariant remains:

> **Cognitive delegation is not authority delegation.**

## 28. Relationship to CCLE

Surface Reports may later support Cognitive Continuity & Learning Economics decisions such as:

- whether a repeated external cognitive dependency is worth retaining;
- whether a local specialist appears to preserve a target capability;
- whether an adapter improves one capability while degrading another;
- whether a proposed learning promotion has empirical outcome support;
- whether performance is strongly tool/environment dependent;
- whether stale evidence should trigger reevaluation;
- whether repeated costly cognition should be considered for consolidation or local ownership.

Surface Reports do not themselves:

- promote Ledger records;
- choose learning tiers;
- authorize adaptation;
- calculate return on investment;
- normalize resource values into policy utility.

Those decisions remain in separately governed CCLE layers.

## 29. Relationship to Cognitive Topology

Cognitive Topology records the persistent agent's structural relationship to cognitive components.

Surface Reports may later be referenced by routing or evaluation policy associated with topology nodes, but Surface Report v0 does not:

- add/remove topology nodes;
- change engagement;
- change topology roles;
- change custody;
- change persistence;
- change continuity/fidelity importance;
- mark a component as primary or identity-kernel;
- infer topology importance from benchmark performance.

High measured capability does not make a model an identity component.

## 30. Threat model

### 30.1 Count inflation

An actor submits the same observation repeatedly to manufacture apparent evidence volume.

**Mitigation:** duplicate observation IDs and duplicate exact observation digests fail closed.

### 30.2 Hindsight leakage

A historical report includes evidence that had not yet occurred or had not yet been recorded at the assessment time.

**Mitigation:** explicit `assessment_at` plus normative `future` and `not-yet-recorded` freshness classes; only current evidence participates in the active surface.

### 30.3 Latest-wins laundering

A recent result silently erases contradictory or degraded prior current evidence.

**Mitigation:** all current observations remain attributable; no latest-wins rule exists; conflict sets are explicit.

### 30.4 Benchmark normalization laundering

Unlike contexts or benchmark definitions are merged into one score.

**Mitigation:** exact comparison-cell identity across all context/evaluation digests; no cross-cell metric aggregation or universal score.

### 30.5 Majority-vote laundering

Many low-assurance or correlated observations overwhelm fewer contradictory observations.

**Mitigation:** counts remain descriptive; no majority classification or evidence weighting is emitted; evaluator and assurance provenance remain visible.

### 30.6 Provider self-report laundering

Provider evidence is presented as if it were independent external verification.

**Mitigation:** evaluator kinds/refs and observation assurance classes remain explicit; the report never infers independence from distinct references.

### 30.7 Context collapse

Tool-assisted performance is presented as equivalent to no-tool performance.

**Mitigation:** toolset/environment/context digests are part of exact cell identity.

### 30.8 Stale evidence treated as failure

Expired observations lower a candidate's apparent score.

**Mitigation:** no score exists; stale evidence is separately inventoried and excluded from active current-cell summaries.

### 30.9 Authority amplification

A large amount of positive empirical evidence becomes permission to invoke a model or perform an action.

**Mitigation:** hard zero-effect boundary constants and no imports of runtime/provider/authority surfaces.

## 31. Error handling

Validation and verification fail closed for at least:

- unknown fields;
- malformed identifiers/digests/timestamps;
- invalid schema/version/status;
- invalid hard boundary values;
- profile ID/digest drift;
- observation profile mismatch;
- observation capability not declared by profile;
- duplicate observation IDs;
- duplicate observation digests;
- incorrect freshness classification;
- missing profile-declared capability surface;
- extra undeclared capability surface;
- incorrect observation counts;
- incorrect/non-canonical cell identity;
- incorrect cell classification counts/set/conflict class;
- incorrect variation flag;
- incorrect evaluator/assurance coverage;
- incorrect failure-mode support sets;
- incompatible resource aggregation;
- non-canonical ordering;
- `recorded_at < assessment_at`;
- mismatch between supplied report and deterministic re-derivation.

Contradictory observations are not validation errors. They are evidence conditions to report.

## 32. Testing strategy

The first implementation must prove at minimum:

### 32.1 Schema and strictness

- exact schema/version/status;
- fail-closed unknown fields;
- hard boundary constants;
- JSON Schema parity;
- canonical timestamps;
- bounded arrays and lexical constraints.

### 32.2 Exact profile/observation binding

- exact profile ID/digest binding;
- every observation binds to the same profile;
- undeclared observed capability fails;
- duplicate observation ID fails;
- duplicate observation digest fails.

### 32.3 Freshness

- current classification;
- stale classification;
- future classification;
- not-yet-recorded classification;
- normative precedence when more than one temporal condition could appear relevant;
- historical reconstruction does not use future/not-yet-recorded evidence;
- stale evidence does not become fail.

### 32.4 Cell grouping

- exact identical dimensions group together;
- any material digest/difficulty/capability difference creates a different cell;
- input ordering does not affect cell membership or report digest;
- cell digests are deterministic.

### 32.5 Conflict/variation

- pass+fail in one exact cell -> direct conflict;
- pass+degraded -> mixed;
- pass+indeterminate -> none;
- conflicting classifications across different cells -> variation without direct conflict;
- no winner/majority field exists.

### 32.6 Declared-but-unobserved capability

- every profile-declared capability is represented;
- zero evidence remains zero evidence, not failure.

### 32.7 Evaluator/assurance evidence

- unique sorted evaluator kinds/refs;
- no inferred independence claim;
- assurance classes preserved exactly;
- provider/self-reported evidence remains distinguishable.

### 32.8 Failure modes

- repeated failure-mode refs preserve exact supporting observation refs;
- no causal probability/confidence is synthesized.

### 32.9 Resource evidence

- only exact class+basis+unit buckets combine;
- observed and estimated remain separate;
- unlike units remain separate;
- unknown entries produce null ranges;
- min/max/count are deterministic;
- no average or cross-unit aggregation exists.

### 32.10 Verification and immutability

- verifier detects any derived-field tampering;
- verifier detects observation-set drift;
- output is deeply frozen;
- input objects are not mutated;
- module source imports no network, provider, Grid, credential, wallet, training, model runtime, filesystem-discovery, or subprocess execution surface.

## 33. First executable slice

The first executable implementation should remain narrow:

1. strict Surface Report validator;
2. deterministic canonical digest;
3. JSON Schema 2020-12 mirror;
4. deterministic derivation from exact profile + exact observations + explicit assessment/recording metadata;
5. exact freshness classification;
6. exact evidence-cell grouping;
7. conflict and cross-cell variation reporting;
8. evaluator/assurance coverage;
9. attributable failure-mode aggregation;
10. unit-preserving resource min/max ranges;
11. verifier that re-derives and rejects drift;
12. adversarial/fail-closed tests;
13. canonical-document registration only after the contract/schema/tests are proven.

No routing recommendation, provider invocation, model execution, UI, topology mutation, Ledger promotion, learning placement, training, spending, or automatic benchmark execution belongs in this slice.

## 34. Explicit non-claims

Cognitive Capability Surface Report v0 does not claim:

- universal intelligence;
- overall model quality;
- universal benchmark comparability;
- future-task success probability;
- provider availability;
- evaluator independence;
- evaluator correctness;
- benchmark impartiality;
- absence of benchmark contamination;
- absence of correlated evidence;
- causal correctness of failure-mode attribution;
- optimal model choice;
- routing correctness;
- cost optimality;
- principal continuity;
- subjective identity continuity;
- learning value;
- authority or delegation;
- permission to invoke, train, spend, route, or act.

The report states only what evidence is represented under its exact bound artifacts and explicit assessment time.

## 35. Future extensions intentionally deferred

Possible later work may include, under separate design gates:

- Capability Surface history/delta reports;
- explicit reevaluation recommendations for stale/missing evidence;
- cross-profile comparison without hidden ranking;
- policy-controlled routing recommendation contracts;
- confidence-calibration evidence;
- evaluator-independence attestations;
- benchmark contamination/provenance assessments;
- resource/reuse economics and amortization;
- capability-composition evidence across multiple specialists;
- user-facing Axiom One capability-surface views.

None is implied by v0.

## 36. Architectural invariant

The architecture after this slice is:

```text
Runtime/provider catalog
        |
        v
Cognitive Capability Profile
        |
        v
Capability Observation x N
        |
        v
Cognitive Capability Surface Report
        |
        v
future routing recommendation
        |
        v
separate authority evaluation
        |
        v
execution
```

At every boundary:

> **Evidence can inform policy. Policy can choose cognition. Cognition can propose effects. Authority remains separately governed.**

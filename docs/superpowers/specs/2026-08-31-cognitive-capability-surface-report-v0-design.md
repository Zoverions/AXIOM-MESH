# Cognitive Capability Surface Report v0 — Design

**Status:** approved architectural extension; design-only specification for an inert evidence-aggregation contract

**Date:** 2026-08-31

**Scope:** deterministic, attributable aggregation of Capability Observation v0 artifacts for one exact Cognitive Capability Profile into a multidimensional evidence surface, without universal scoring, candidate ranking, routing, model invocation, training, spending, topology mutation, learning promotion, or authority effects.

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

AXIOM needs a way to answer:

> **What multidimensional empirical evidence is represented for this exact cognitive capability profile at this explicit assessment time, while every contributing observation remains attributable to its exact context, evaluation definition, evaluator, assurance posture, time, and resource evidence?**

The governing doctrine is:

> **Capability is a surface, not a score. Contextual variation is evidence, not noise. Aggregation summarizes evidence; it does not manufacture truth, preference, or authority.**

The report is per-profile and descriptive. It does not answer which candidate is best, choose who should think about a task, or authorize any resulting action.

## 2. Relationship to existing contracts

AXIOM already implements **Cognitive Topology v0**. That contract describes which model components belong to an Agent Composition and how they relate to persistence, custody, continuity importance, fidelity importance, and topology roles. This design does not overload or mutate it.

The boundaries are:

- **Cognitive Topology v0:** what cognitive components constitute this agent and how are they structurally related to continuity, custody, and persistence?
- **Cognitive Capability Profile v0:** what does this exact provider/runtime offering declare it can do?
- **Capability Observation v0:** what happened in one exact empirical evaluation of one declared capability?
- **Cognitive Capability Surface Report v0:** what empirical capability evidence is represented across multiple attributable observations for this exact profile at an explicit assessment time?
- **Cognitive Eligibility Report v0:** does the candidate satisfy caller-supplied declared constraints?
- **future router:** given separately governed policy inputs, who should think about a task?
- **authority layer:** may any proposed effect actually occur?

The Surface Report is an adjunct evidence contract, not a replacement for topology, eligibility, or routing.

## 3. Why v0 is per-profile

V0 aggregates observations for exactly one Cognitive Capability Profile. It does not compare multiple profiles.

A multi-profile matrix would immediately create pressure for candidate ordering, cross-benchmark normalization, weighted averages, winner selection, routing policy, and implied universal quality rankings. Those are separate future policy questions.

## 4. Contract identity and lexical rules

Schema:

`axiom-cognitive-capability-surface-report.v0`

Version: `0`

Status: `inert-evidence-report`

Implementation follows established AXIOM contract conventions:

- identifiers/references match `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$`;
- digests are lowercase 64-hex SHA-256 strings;
- units match `^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,63}$`;
- timestamps are canonical ISO strings that round-trip through `Date.toISOString()`;
- objects are plain objects with exact required fields;
- JSON Schema objects use `additionalProperties:false`;
- duplicate identifiers or duplicate exact observation digests fail closed where set semantics apply;
- input array ordering never changes the derived ordering or digest of the same logical report.

## 5. Exact profile binding

Every report binds to exactly one Cognitive Capability Profile v0 through:

```text
profile_id
profile_digest
```

Derivation and verification validate the supplied profile and recompute its canonical digest.

The report fails verification unless every contributing observation binds to that same profile ID and digest and the observed capability remains declared by that exact profile.

Evidence is never silently combined across profile revisions or different profile digests.

## 6. Observation-set binding

`observations` is a bounded array with `0-256` entries. Each report entry contains exactly:

```text
observation_id
observation_digest
capability
freshness_class
```

Rules:

- validate every source through Capability Observation v0;
- recompute every observation digest;
- require exact profile binding;
- reject duplicate `observation_id` values;
- reject duplicate exact observation digests to prevent count inflation;
- sort by `observation_id`, then `observation_digest`;
- allow an empty set;
- never fabricate observations for unobserved capabilities.

## 7. Explicit assessment time and time-travel safety

The report contains explicit canonical `assessment_at`. Derivation and verification never read the wall clock.

Each source observation receives exactly one freshness class, using this normative order:

1. if `observed_at > assessment_at` -> `future`;
2. else if `recorded_at > assessment_at` -> `not-yet-recorded`;
3. else if `valid_until < assessment_at` -> `stale`;
4. else -> `current`.

Meanings:

- `current`: the event had happened, had been recorded, and had not expired at assessment time;
- `stale`: it was known but its validity horizon had expired;
- `future`: the empirical event had not yet happened;
- `not-yet-recorded`: the event had happened but had not yet entered AXIOM's recorded evidence state.

Only `current` observations participate in the active capability surface. The other classes remain visible in provenance/counts. Stale evidence is not rewritten as failure. Future and not-yet-recorded evidence cannot influence historical reconstruction.

## 8. Every declared capability is represented

`capability_surfaces` contains exactly one entry for every capability declared by the bound profile, ordered by the existing Capability Profile vocabulary:

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

The output uses this order filtered to capabilities actually declared by the profile.

A declared capability with no observations remains present with zero evidence cells:

```text
declared capability + no observations != observed failure
```

## 9. Exact comparison-cell identity

Current observations may share an evidence cell only when all of these dimensions are exactly identical:

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

`cell_digest` is the canonical digest of exactly that dimension object.

V0 performs no semantic equivalence inference. Different prompts, memory state, system instructions, retrieval configuration, environments, toolsets, suites, metric sets, thresholds, methods, or content digests create different cells. It does not infer that two benchmark versions or evaluation contexts are "close enough."

## 10. Capability-surface shape

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

`declared` is always `true`.

`observation_counts` contains exactly:

```text
current
stale
future
not_yet_recorded
```

All counts are non-negative safe integers and are descriptive evidence inventory, not weights.

`direct_conflict_cells` and `mixed_classification_cells` are non-negative safe-integer counts derived from `current_cells`; they are not severity scores.

## 11. Current evidence cells

Each current cell contains exactly:

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

Cells are sorted lexically by `cell_digest`.

`observation_refs` is a sorted array of exact `{ observation_id, observation_digest }` pairs so every aggregate remains attributable.

`classification_counts` contains exactly:

```text
pass
degraded
fail
indeterminate
```

`classification_set` preserves represented classes in fixed order `pass`, `degraded`, `fail`, `indeterminate` filtered to present values.

The report does not aggregate or summarize Capability Observation `confidence` values. Confidence remains available only through the attributable source observations because different evaluators and methods may use incompatible confidence calibration.

## 12. Conflict semantics

Each current cell has exactly one `conflict_class`:

- `none`
- `mixed`
- `direct`

Rules:

- `direct` if at least one `pass` and at least one `fail` occur in the exact same cell;
- otherwise `mixed` if more than one distinct non-`indeterminate` classification occurs;
- otherwise `none`.

Examples:

```text
pass + pass -> none
pass + indeterminate -> none
pass + degraded -> mixed
degraded + fail -> mixed
pass + fail -> direct
pass + degraded + fail -> direct
```

No conflict class chooses which observation is correct.

## 13. Cross-cell variation

At capability level, `variation_present` is `true` when at least two current cells contain different represented non-`indeterminate` classification sets.

Variation across cells is not labeled direct contradiction because at least one context/evaluation dimension differs.

For example, pass with one toolset and fail with another records context/tool sensitivity. The report cannot collapse that into a universal claim that the candidate is simply reliable, unreliable, good, or bad.

## 14. No universal score, vote, or rank

Surface Report v0 must not emit:

- intelligence or overall quality scores;
- universal capability scores;
- normalized benchmark scores;
- weighted or averaged confidence;
- majority-vote classifications;
- preferred capabilities;
- preferred models/providers;
- candidate rank;
- routing weight;
- hidden policy utility scores.

Counts are descriptive. One hundred passes do not automatically override one fail. A later explicit policy layer may decide how evidence influences a particular routing decision.

## 15. Evaluator and assurance coverage

Current cells expose sorted unique:

- `evaluator_kinds`;
- `evaluator_refs`;
- `assurance_classes`.

At capability level:

```text
current_evaluator_coverage = {
  evaluator_kinds,
  evaluator_refs
}
current_assurance_classes
```

The report does not infer that distinct evaluator references are statistically independent. It therefore says **distinct evaluator references**, not independent evaluators.

Provider reports, human review, local verification, signatures, and corroboration remain distinguishable through the source observation provenance and assurance class.

## 16. Failure-mode aggregation

At cell and capability level, `failure_modes` / `current_failure_modes` are sorted arrays of:

```text
failure_mode_ref
supporting_observations
```

`supporting_observations` is a sorted, deduplicated list of exact observation ID/digest pairs.

Repeated attribution does not become causal probability or causal confidence. Failure-mode refs remain evidence claims with provenance.

## 17. Resource aggregation

Resource evidence combines only exact bucket identities:

```text
resource_class
basis
unit
```

Rules:

- only current observations contribute to current ranges;
- `observed` and `estimated` never combine because basis is part of bucket identity;
- unlike units never convert or combine;
- currencies never convert;
- `unknown` basis remains a separate null-valued bucket;
- privacy, sovereignty, resilience, quality, and authority are never monetized;
- no aggregate resource score, average, percentile, or normalized cost is emitted.

A numeric bucket contains exactly:

```text
resource_class
basis
unit
measurement_count
minimum
maximum
supporting_observations
```

An `unknown` bucket contains exactly:

```text
resource_class
basis: unknown
unit: null
measurement_count
minimum: null
maximum: null
supporting_observations
```

`measurement_count` counts resource entries, not source observations. This is deliberate because one Capability Observation may legally contain more than one resource entry in the same class/basis/unit bucket. `supporting_observations` is independently deduplicated by observation ID/digest.

Current cell `resource_ranges` derive from that cell's current observations. Capability-level `current_resource_ranges` derive from all current observations for that capability using the same bucket rules. No redundant top-level resource summary exists in v0.

Economic amortization and placement belong in the later CCLE cost/reuse layer.

## 18. Top-level report shape

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

`report_id` is an opaque bounded identifier supplied by the recording system.

`recorded_at` is explicit, canonical, and must satisfy `recorded_at >= assessment_at`. Derivation never reads the clock.

## 19. Public interfaces

Proposed interfaces:

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

### 19.1 Derivation

`derive...` must:

1. validate the exact profile;
2. validate every observation;
3. recompute every observation digest;
4. require exact profile binding and declared capability membership;
5. reject duplicate observation IDs and exact digests;
6. classify freshness using explicit `assessment_at`;
7. create every profile-declared capability surface;
8. group only current observations into exact comparison cells;
9. derive classifications/conflict without selecting a winner;
10. derive cross-cell variation;
11. derive evaluator and assurance coverage;
12. derive attributable failure modes;
13. derive unit-preserving resource ranges using measurement counts;
14. sort every set-derived array canonically;
15. emit zero-effect boundary fields;
16. deep-freeze the returned report.

The same logical source artifacts and explicit metadata produce the same report regardless of input observation order.

### 19.2 Verification

`verify...` must:

1. validate the supplied report;
2. validate the exact profile and observations;
3. require the report inventory to correspond exactly to the supplied observation set by ID and canonical digest;
4. rederive using the report's own `report_id`, `assessment_at`, and `recorded_at`;
5. require exact canonical digest equality between supplied and rederived report;
6. return a frozen verification summary only.

Verification performs no I/O or external lookup.

## 20. Canonical ordering

Normative ordering:

- report observation inventory: `observation_id`, then digest;
- capability surfaces: fixed Capability Profile vocabulary order filtered to declared capabilities;
- current cells: lexical `cell_digest`;
- observation/support refs: `observation_id`, then digest;
- classification set: `pass`, `degraded`, `fail`, `indeterminate` filtered to represented values;
- evaluator kinds/refs: lexical;
- assurance classes: `declared`, `signed`, `verified-local`, `corroborated` filtered to represented values;
- failure-mode refs: lexical;
- resource buckets: `resource_class`, then `basis`, then unit, with `null` ordered before strings.

A supplied report with non-canonical ordering fails verification rather than being silently reordered and accepted.

## 21. Hard boundary

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

The core law is:

> **Aggregation does not amplify authority.**

Any number of non-authorizing observations still produces non-authorizing evidence.

Validation, derivation, digesting, and verification must perform no model/provider invocation, benchmark execution, network request, credential access, wallet/payment effect, model acquisition, subprocess creation, adaptation/training/distillation, skill/model activation, routing mutation, candidate selection, Cognitive Topology mutation, Agent Composition mutation, Cognitive Learning Ledger mutation/promotion, capability-registry promotion, or principal/authority mutation.

The implementation must not import runtime surfaces that can perform those effects.

## 22. Relationship to eligibility and routing

Eligibility and empirical performance remain separate. A candidate may be eligible but poorly evidenced or empirically conflicting; it may also perform strongly but be ineligible because its declared locality, retention, training-use, cost, assurance, or other posture violates caller policy.

Surface Report v0 does not modify `evaluateCognitiveCandidates(...)` and cannot override eligibility policy.

A future router may consume Eligibility Reports, Surface Reports, Availability Attestations, task requirements, consequence/risk class, privacy policy, latency requirements, authorized budget, continuity/fidelity requirements, and user/operator policy.

That router may choose **who thinks about a task**. Authority still separately determines whether any proposed effect may occur.

> **Cognitive delegation is not authority delegation.**

## 23. Relationship to CCLE and Cognitive Topology

Surface Reports may later support CCLE questions such as whether an adapter improved one capability while degrading another, whether repeated expensive cognition should trigger consolidation analysis, whether stale evidence requires reevaluation, or whether a specialist appears worth retaining.

They do not promote Ledger records, choose learning tiers, authorize adaptation, calculate ROI, or normalize resource values into policy utility.

Surface Reports also do not alter Cognitive Topology nodes, roles, custody, persistence, engagement, continuity/fidelity importance, or identity-kernel status. High measured capability does not make a model an identity component.

## 24. Threat model

### Count inflation

Repeated submission of the same observation could manufacture evidence volume.

**Mitigation:** duplicate IDs and exact observation digests fail closed.

### Hindsight leakage

Historical reconstruction could use evidence that had not happened or had not yet been recorded.

**Mitigation:** explicit assessment time and normative future/not-yet-recorded classes; only current evidence enters active surfaces.

### Latest-wins laundering

A recent result could erase contradictory evidence.

**Mitigation:** all current observations remain attributable; there is no latest-wins rule.

### Benchmark normalization laundering

Unlike contexts/evaluations could be merged into one score.

**Mitigation:** exact cell identity across all context/evaluation dimensions; no normalization.

### Majority-vote laundering

Many correlated or low-assurance observations could be treated as truth.

**Mitigation:** counts remain descriptive; no majority classification or evidence weighting.

### Provider self-report laundering

Provider evidence could be presented as independent verification.

**Mitigation:** evaluator refs/kinds and assurance remain visible; independence is never inferred.

### Context collapse

Tool-assisted performance could be treated as equivalent to no-tool performance.

**Mitigation:** toolset/environment/context identities are part of exact cell identity.

### Stale-as-failure laundering

Expired evidence could be treated as negative performance.

**Mitigation:** stale evidence remains a separate provenance state and never becomes fail.

### Authority amplification

Positive evidence volume could become permission to invoke or act.

**Mitigation:** hard zero-effect constants and no effect-capable imports.

## 25. Fail-closed conditions

Validation/verification fail for at least:

- unknown fields;
- malformed identifiers, digests, units, or timestamps;
- invalid schema/version/status;
- boundary widening;
- profile ID/digest drift;
- observation/profile mismatch;
- undeclared observed capability;
- duplicate observation IDs or digests;
- incorrect freshness class;
- missing declared capability surface or extra undeclared capability surface;
- incorrect counts;
- incorrect/non-canonical cell digest or dimensions;
- incorrect classification set/count/conflict;
- incorrect variation or conflict-cell counts;
- incorrect evaluator/assurance coverage;
- incorrect failure-mode support;
- incompatible or incorrect resource aggregation;
- non-canonical ordering;
- `recorded_at < assessment_at`;
- mismatch with deterministic rederivation.

Contradictory observations are valid evidence conditions, not validation errors.

## 26. Testing strategy

The first implementation must prove:

- strict schema/version/status and unknown-field rejection;
- exact hard boundaries and JSON Schema parity;
- exact profile ID/digest binding;
- every observation binds to that exact profile;
- duplicate observation ID/digest rejection;
- current/stale/future/not-yet-recorded semantics and precedence;
- no hindsight leakage in historical reconstruction;
- stale evidence never becomes fail;
- every declared capability appears, including zero-evidence capabilities;
- exact identical dimensions group and any material dimension change splits cells;
- pass+fail in one cell -> direct conflict;
- pass+degraded -> mixed;
- pass+indeterminate -> none;
- cross-cell differing classifications -> variation rather than direct conflict;
- no winner/score/majority/average-confidence fields exist;
- evaluator refs/kinds and assurance classes are unique/canonical without independence claims;
- repeated failure-mode refs preserve exact supporting observations;
- resource aggregation separates class+basis+unit;
- multiple measurements from one observation increment `measurement_count` while supporting observation refs remain deduplicated;
- unlike units and observed/estimated bases never combine;
- unknown resources produce null min/max;
- no average/cross-unit aggregation exists;
- derivation is input-order independent;
- verifier detects any derived-field or source-set drift;
- output is deeply frozen and inputs are not mutated;
- source imports no network, provider, Grid, credential, wallet, training, model-runtime, filesystem-discovery, or subprocess effect surface.

## 27. First executable slice

The first implementation remains narrow:

1. strict validator;
2. canonical digest;
3. JSON Schema 2020-12 mirror;
4. deterministic derivation from exact profile + observations + explicit assessment/recording metadata;
5. freshness classification;
6. exact evidence-cell grouping;
7. conflict and variation reporting;
8. evaluator/assurance coverage;
9. attributable failure-mode aggregation;
10. unit-preserving min/max resource ranges with measurement counts;
11. deterministic verifier;
12. adversarial/fail-closed tests;
13. canonical-document registration only after contract/schema/tests are proven.

No routing recommendation, provider invocation, model execution, UI, topology mutation, Ledger promotion, learning placement, training, spending, or automatic benchmark execution belongs in this slice.

## 28. Explicit non-claims

Surface Report v0 does not claim universal intelligence, overall model quality, universal benchmark comparability, future-task success probability, provider availability, evaluator independence/correctness, benchmark impartiality, absence of contamination/correlated evidence, causal correctness of failure-mode attribution, optimal model choice, routing correctness, cost optimality, principal continuity, subjective identity continuity, learning value, authority, delegation, or permission to invoke/train/spend/route/act.

It states only what evidence is represented under its exact bound artifacts and explicit assessment time.

## 29. Deferred extensions

Separate future design gates may consider:

- Surface history/delta reports;
- reevaluation recommendations for stale/missing evidence;
- cross-profile comparison without hidden ranking;
- policy-controlled routing recommendations;
- confidence-calibration evidence;
- evaluator-independence attestations;
- benchmark contamination/provenance assessment;
- resource/reuse economics and amortization;
- multi-specialist composition evidence;
- Axiom One capability-surface UI.

None is implied by v0.

## 30. Architectural invariant

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

> **Evidence can inform policy. Policy can choose cognition. Cognition can propose effects. Authority remains separately governed.**

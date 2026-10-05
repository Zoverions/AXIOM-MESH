# Reward Introspection Evidence v0 — Design

**Status:** approved architectural design; implementation not yet started

**Date:** 2026-09-05

**Scope:** model-neutral, evidence-only contracts for recording internal state-value and reward-prediction-error observations, calibration against independently sourced outcomes, and drift comparisons across exact cognitive artifacts or probe versions. This design does not add model invocation, hidden-state extraction, routing, promotion, authority, network effects, or runtime activation.

**Builds on:**

- `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`
- `mesh/src/lib/cognitive-topology.mjs`
- `mesh/src/lib/cognitive-lineage-manifest.mjs`
- `mesh/src/lib/replacement-fidelity-evaluation.mjs`
- `mesh/src/lib/cognitive-recovery-assessment.mjs`

**Research motivation:** Guowei Xu, Mert Yuksekgonul, and James Zou, *Sparse Reward Subsystem in Large Language Models*, arXiv:2602.00986. The paper motivates this evidence surface by reporting sparse hidden-state features that predict state value and step-level temporal-difference/reward-prediction error in the studied models. AXIOM does not treat the paper's terminology, neuron locations, or mechanism as universal model facts. The paper is an empirical input to this design, not a normative dependency.

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative. Reward-introspection evidence cannot grant authority, increase authority, activate a model, select a runtime, choose an execution winner, mutate Cognitive Topology, approve an improvement, spend funds, expose credentials, perform egress, or cause any external effect. A model's internal estimate of success is evidence about that model's cognition only.

## 1. Core decision

AXIOM should be able to inspect and preserve bounded evidence about a cognitive runtime's internal success-prediction signals without turning those signals into authority.

The governing invariant is:

> **Internal cognitive signals may inform evaluation and verification, but cannot grant authority, activate a model, select an execution path, or cause an external effect.**

This extends the existing architecture rather than replacing it:

- Cognitive Topology describes which cognitive components exist and how they relate to continuity and fidelity.
- Cognitive Capability Profiles describe declared routing-relevant properties.
- Replacement Fidelity Evaluation compares candidate cognitive artifacts against accepted expectations.
- Reward Introspection Evidence adds one optional class of internal evidence that may be consumed by later evaluation or governance policy.

The first slice is deliberately inert. It defines how evidence is represented, bound, validated, compared, and minimized. It does not collect that evidence from live models.

## 2. Why this must be an adjunct contract

AXIOM must not bake one paper's mechanistic-interpretability findings into Cognitive Topology, the runtime/provider catalog, or the authority kernel.

Different model families may expose:

- sparse neuron-level state-value signals;
- distributed feature-level signals;
- attention-head or residual-stream signals;
- learned probe outputs;
- model-native confidence features;
- no stable introspection surface at all.

The architecture therefore represents **functional observations** and their provenance rather than requiring a particular biological analogy or neural implementation.

The terms `state-value` and `reward-prediction-error` describe the intended functional interpretation. The terms `value neuron` and `dopamine neuron` may appear in evidence references or research notes, but are not canonical schema categories.

## 3. Evidence hierarchy and non-substitution rule

Reward-introspection evidence is one evidence class among several.

A high internal value estimate does not prove:

- factual correctness;
- legal permissibility;
- policy compliance;
- user consent;
- authorization;
- safety;
- identity continuity;
- model availability;
- external task completion.

A low internal value estimate does not prove failure.

External verification remains independently sourced. The architecture must preserve disagreement instead of reconciling it away.

Examples:

```text
internal state-value: high
external verifier: failure
result: disagreement evidence
```

```text
internal state-value: low
external verifier: success
result: disagreement evidence
```

Disagreement may indicate miscalibration, distribution shift, probe drift, reward misgeneralization, bad measurement, changed serving conditions, or another unknown cause. The contract reports the disagreement; it does not infer motive or mechanism.

## 4. Contract set

Reward Introspection Evidence v0 consists of four independently content-addressed evidence contracts:

1. `axiom-reward-probe-manifest.v0`
2. `axiom-reward-introspection-observation.v0`
3. `axiom-reward-calibration-report.v0`
4. `axiom-reward-drift-comparison.v0`

Each contract is strict, closed-world, fail-closed, deterministic, and evidence-only.

## 5. Reward Probe Manifest v0

### 5.1 Purpose

A Reward Probe Manifest describes exactly how an internal cognitive signal is intended to be measured and what model/runtime artifact the probe is valid for.

It is a measurement-method declaration, not a proof that the probe is scientifically valid.

Schema identifier:

`axiom-reward-probe-manifest.v0`

### 5.2 Exact cognitive binding

The manifest binds to one exact cognitive target through:

- `target_kind`: `topology-node | model-artifact | runtime-offering`;
- stable target identifier;
- exact topology/profile/artifact digest where that digest exists;
- nullable runtime/provider catalog entry identifier and digest where relevant;
- nullable model artifact digest for provider-controlled models where no owner-visible weight digest exists;
- explicit `artifact_digest_availability` classification.

A probe that cannot be bound strongly enough for the requested comparison must fail closed or report incompatibility rather than silently transferring.

### 5.3 Probe type

Closed v0 vocabulary:

- `state-value`
- `reward-prediction-error`

No synonym such as `dopamine` is accepted as a schema value.

### 5.4 Measurement method

The manifest declares a closed `measurement_method` category:

- `linear-probe`
- `sparse-feature-probe`
- `activation-subset`
- `model-native-signal`
- `other-reviewed`

`other-reviewed` requires a non-empty method reference and evidence reference.

The manifest may include bounded, non-secret descriptors such as:

- layer or component references;
- feature-selection method;
- probe architecture identifier;
- training-data class and dataset references;
- calibration method;
- normalization rule;
- supported task/domain claims;
- known limitations;
- source publication/reference;
- exact probe artifact digest where a probe artifact exists.

The contract must not contain raw training examples, raw prompts, raw hidden-state tensors, credentials, API keys, or chain-of-thought text.

### 5.5 Calibration declaration

A probe may declare one of:

- `uncalibrated`
- `calibrated-bounded`
- `calibrated-probabilistic`

If `uncalibrated`, observations may not claim probability semantics.

If calibrated, the manifest must bind the calibration method, calibration-evidence digest, calibration population/domain, and score range.

### 5.6 Transfer claim

The manifest declares:

- `transfer_scope = exact-target-only | declared-family | reviewed-cross-target`.

`exact-target-only` is the default and safest mode.

Any broader transfer scope requires explicit evidence references and must still be revalidated by a Reward Calibration Report before policy treats the signal as calibrated in the new target context.

### 5.7 Boundary constants

Every manifest must contain:

```text
authority_effect = none
network_effect = none
credential_visibility = none
runtime_activation = false
routing_effect = none
promotion_effect = evidence-only
```

Any widening fails validation.

## 6. Reward Introspection Observation v0

### 6.1 Purpose

A Reward Introspection Observation records one bounded measurement produced by one exact Reward Probe Manifest against one exact cognitive target and one referenced reasoning state or step.

Schema identifier:

`axiom-reward-introspection-observation.v0`

### 6.2 Required binding

An observation binds to:

- exact `probe_manifest_id` and digest;
- exact target identity/digest inherited from the resolved manifest;
- `observation_id`;
- `observed_at`;
- `reasoning_state_ref` or `step_ref`;
- `reasoning_state_digest` when a stable digest is available;
- signal value;
- signal interpretation metadata;
- observation provenance reference and digest.

The resolver must recompute and verify all available digests.

### 6.3 Signal representation

The signal representation is intentionally generic.

An observation contains:

- `raw_score`: finite numeric value;
- `normalized_score`: nullable finite numeric value;
- `normalized_range`: nullable exact range declaration;
- `probability_semantics`: boolean;
- nullable uncertainty/confidence interval only where the probe manifest defines how it is produced.

Rules:

- `NaN`, positive infinity, and negative infinity fail closed.
- `normalized_score` is prohibited when the manifest is uncalibrated or defines no normalization rule.
- `probability_semantics = true` is prohibited unless the manifest is `calibrated-probabilistic`.
- The contract must never reinterpret an arbitrary score into a probability.

### 6.4 State references and privacy minimization

The durable observation should record the minimum evidence needed to reproduce provenance without retaining raw cognitive contents.

By default, the observation must not contain:

- raw prompt text;
- raw response text;
- chain-of-thought or hidden reasoning text;
- raw hidden-state vectors or tensors;
- embeddings that can serve as reconstructive proxies;
- user secrets;
- credentials;
- direct personal-data payloads.

The preferred durable form is a content-addressed or opaque reasoning-state reference plus digest, probe identity, score, timestamps, and method provenance.

Raw activations, if later required for research, belong behind a separately designed high-sensitivity research boundary and are out of scope for v0.

### 6.5 No execution semantics

An observation is descriptive only.

It cannot contain fields such as:

- `recommended_action`;
- `route_to`;
- `activate_model`;
- `approve_candidate`;
- `grant_capability`;
- `execute`.

Unknown fields fail closed.

## 7. Reward Calibration Report v0

### 7.1 Purpose

A Reward Calibration Report evaluates how well a specific probe's internal signal corresponds to independently sourced outcomes over a bounded evaluation set.

Schema identifier:

`axiom-reward-calibration-report.v0`

### 7.2 Independent outcome requirement

The report must separate:

- internal observation evidence; and
- outcome/verification evidence.

Outcome evidence may come from a reviewed benchmark harness, external verifier, deterministic task checker, human adjudication, or another independently governed evidence source.

The internal model/probe cannot satisfy the independent-outcome requirement by self-declaring its own answer correct.

The report records the verification source class and exact evidence references/digests.

### 7.3 Evaluation population

The report binds:

- exact probe manifest digest;
- exact target identity/digest;
- evaluation-set identifier and digest where available;
- task/domain classification;
- sample count;
- inclusion/exclusion rules;
- evaluation start/end timestamps;
- applicable distribution/version references.

### 7.4 Metrics

The v0 report may contain a bounded set of metrics appropriate to the probe's calibration class, including:

- agreement/disagreement counts;
- success rate by declared score bucket;
- calibration error where probability semantics are valid;
- discrimination/ranking metric where methodologically valid;
- false-high-confidence count;
- false-low-confidence count;
- missing/invalid observation count;
- insufficient-evidence status.

Metrics must be explicitly named and numerically finite. Unknown metric names fail closed unless introduced through a future schema version.

A report with too few valid samples to satisfy its declared minimum must return `status = insufficient-evidence`, not a fabricated calibrated result.

### 7.5 Output status

Closed status vocabulary:

- `calibrated`
- `miscalibrated`
- `mixed`
- `insufficient-evidence`
- `incompatible`

The status is evidence-relative. It does not promote or reject a model.

## 8. Reward Drift Comparison v0

### 8.1 Purpose

A Reward Drift Comparison compares two exact probe-bound cognitive conditions and reports whether the relationship between internal reward signals and independently verified outcomes has materially changed.

Schema identifier:

`axiom-reward-drift-comparison.v0`

### 8.2 Supported comparison pairs

A comparison may evaluate:

- predecessor model artifact vs candidate artifact with equivalent probe semantics;
- same model artifact under probe version A vs probe version B;
- provider/runtime serving version A vs version B where exact serving identities are available;
- same model/probe before and after a declared adaptation;
- same cognitive artifact across declared task/domain populations.

### 8.3 Compatibility gate

Before comparing values, the resolver checks compatibility across:

- probe type;
- measurement method;
- normalization/calibration semantics;
- target binding;
- evaluation population;
- metric vocabulary;
- probe transfer scope.

If the comparison is not valid, the result must be `incompatible` rather than numerically comparing unlike signals.

### 8.4 Drift outputs

Where compatible, the report may include changes in:

- calibration status;
- calibration error;
- disagreement rate;
- false-high-confidence rate;
- false-low-confidence rate;
- score distribution summary;
- reward-prediction-error distribution summary;
- missing/invalid observation rate;
- domain-specific performance relationship.

The comparison must preserve direction and exact predecessor/candidate digests.

### 8.5 Drift status

Closed status vocabulary:

- `stable-within-declared-bounds`
- `material-drift`
- `mixed`
- `insufficient-evidence`
- `incompatible`

No status creates authority or changes activation state.

## 9. Recursive-improvement integration

The existing bounded self-improvement lifecycle remains authoritative:

```text
verified experience / corrections / accepted decisions
  -> candidate adaptation corpus
  -> explicit adaptation authorization
  -> isolated training/distillation
  -> privacy and memorization review
  -> continuity/fidelity evaluation
  -> adversarial and regression tests
  -> candidate artifact digest + lineage
  -> shadow/canary use where appropriate
  -> governed acceptance
  -> Self Bundle / topology revision
  -> monitoring and rollback
```

Reward Introspection Evidence may be inserted only as additional evidence in the evaluation phases:

```text
candidate artifact
  -> reward probe compatibility check
  -> reward calibration report
  -> predecessor/candidate drift comparison
  -> external verification + existing fidelity evidence
  -> governed review
```

The following rule is mandatory:

> **No reward-introspection observation, calibration report, or drift comparison may itself promote, activate, route to, or authorize a candidate.**

A later governance or evaluation policy may decide that certain evidence is required before promotion, but satisfying that requirement remains a precondition, not an authority grant.

## 10. Relationship to cognitive routing

Sovereign Intelligence Selection keeps eligibility separate from selection and execution. Reward Introspection Evidence preserves that boundary.

v0 does **not** modify candidate eligibility or ranking.

Future work may define a separately governed routing policy that consumes calibration evidence as one input. That future policy must remain consequence-aware, independently authorized, and incapable of turning the model's self-estimate into effect authority.

No such routing integration is part of this design's implementation slice.

## 11. Privacy and information hazards

Internal activations may encode sensitive information beyond the reward-related scalar or feature being measured.

Therefore:

- raw hidden states are not durable v0 evidence;
- raw activations are not logged by default;
- prompt/response content is excluded from evidence contracts;
- reasoning references are opaque/content-addressed where possible;
- evidence stores must not become a secondary chain-of-thought archive;
- retention of future raw research activations requires a separate high-sensitivity policy;
- telemetry labels must remain bounded and avoid high-cardinality user-controlled content.

This design intentionally minimizes introspection evidence to reduce the risk that interpretability tooling becomes a privacy bypass.

## 12. Security and adversarial considerations

The first implementation must assume adversaries may attempt to:

- submit a probe built for another model;
- reuse stale calibration evidence;
- replace a probe artifact while preserving a friendly identifier;
- claim probability semantics for an arbitrary score;
- cherry-pick only successful observations;
- use tiny samples to fabricate calibration;
- compare incompatible probe versions;
- inject `NaN`/infinite/extreme values;
- smuggle secrets or reasoning text into metadata fields;
- make a candidate appear promotion-ready by setting an introspection flag;
- use introspection as an alternate route around Gateway or capability authorization.

The response is exact digest binding, closed schemas, bounded strings/arrays, deterministic validation, explicit sample sufficiency, compatibility gates, and hard zero-authority constants.

## 13. Failure handling

Validation and resolution fail closed for:

- unknown fields;
- malformed identifiers or digests;
- missing exact probe binding;
- target identity/digest mismatch;
- stale or mismatched probe artifact digest;
- invalid timestamps or ordering;
- non-finite numeric values;
- score ranges inconsistent with manifest declarations;
- normalized values without a normalization declaration;
- probability semantics without probabilistic calibration;
- duplicate observation or report identifiers in one comparison;
- self-attested outcomes where independent outcomes are required;
- insufficient sample sizes for a declared calibration claim;
- incompatible probe/target/calibration comparisons;
- boundary widening;
- secret-bearing or raw-reasoning fields;
- attempts to encode routing, activation, promotion, or authority effects.

Where the evidence is structurally valid but scientifically insufficient, the system reports `insufficient-evidence` rather than throwing or inventing a result.

## 14. Determinism and content addressing

Each v0 contract must support deterministic canonical digesting using the project's existing canonicalization conventions.

Resolvers must:

1. validate input documents before interpretation;
2. recompute exact dependent digests;
3. reject identity/digest drift;
4. avoid mutating caller objects;
5. return frozen evidence summaries where consistent with existing library patterns;
6. perform no filesystem, network, subprocess, credential, wallet, Gateway-effect, or runtime operation.

## 15. First implementation slice

The implementation plan should create four pure libraries, four JSON Schema mirrors, and focused tests.

Expected source modules:

- `mesh/src/lib/reward-probe-manifest.mjs`
- `mesh/src/lib/reward-introspection-observation.mjs`
- `mesh/src/lib/reward-calibration-report.mjs`
- `mesh/src/lib/reward-drift-comparison.mjs`

Expected schema mirrors:

- `mesh/config/reward-probe-manifest-v0.schema.json`
- `mesh/config/reward-introspection-observation-v0.schema.json`
- `mesh/config/reward-calibration-report-v0.schema.json`
- `mesh/config/reward-drift-comparison-v0.schema.json`

Expected focused tests:

- `mesh/test/reward-probe-manifest.test.mjs`
- `mesh/test/reward-probe-manifest-schema.test.mjs`
- `mesh/test/reward-introspection-observation.test.mjs`
- `mesh/test/reward-introspection-observation-schema.test.mjs`
- `mesh/test/reward-calibration-report.test.mjs`
- `mesh/test/reward-calibration-report-schema.test.mjs`
- `mesh/test/reward-drift-comparison.test.mjs`
- `mesh/test/reward-drift-comparison-schema.test.mjs`

The exact file split may be adjusted in the implementation plan to match current repository conventions, but the four contract boundaries must remain independently testable.

## 16. Testing strategy

Tests must prove at least the following.

### Probe manifest

- strict closed-world validation;
- deterministic canonical digesting;
- exact cognitive-target binding;
- required exact probe artifact digest where applicable;
- transfer defaults to exact-target-only;
- broader transfer claims require evidence references;
- uncalibrated probes cannot claim probability semantics;
- hard boundary constants cannot be widened.

### Observation

- exact manifest-digest binding;
- exact target consistency;
- finite numeric signal enforcement;
- `NaN` and infinities fail closed;
- normalized scores require manifest normalization;
- probabilistic interpretation requires probabilistic calibration;
- raw prompts, responses, chain-of-thought, activations, secrets, and authority fields are rejected;
- inputs remain unmodified.

### Calibration report

- internal observation evidence and independent outcome evidence remain distinct;
- self-attested correctness cannot satisfy the independent verifier field;
- sample insufficiency produces `insufficient-evidence`;
- calibration metrics are finite and closed-world;
- stale/mismatched probe and target digests fail closed;
- deterministic output/status generation where derived.

### Drift comparison

- exact predecessor/candidate identity and digest preservation;
- incompatible probe types fail to `incompatible` rather than being numerically compared;
- incompatible normalization/calibration semantics fail to `incompatible`;
- insufficient calibration evidence produces `insufficient-evidence`;
- compatible evidence produces deterministic drift summaries;
- comparison does not mutate source reports.

### Authority isolation

Static and behavioral tests must verify the reward-introspection source modules import no:

- network client;
- filesystem write surface;
- subprocess/runtime launcher;
- credential/token broker;
- wallet/payment surface;
- Gateway mutation/effect surface;
- capability-grant surface;
- runtime activation surface.

Tests must also prove that no output contract includes an action, routing, promotion, or authority field capable of producing an effect.

## 17. Capability and registry posture

v0 should not add an executable capability merely to represent evidence.

If the repository's evidence/contract registries require registration for schema-backed evidence, the implementation must register these contracts there with exact runnable-test bindings. That registration must not be interpreted as an execution capability.

`mesh/config/capabilities.json` must not be widened for this slice unless the implementation discovers an existing canonical evidence-registration pattern that requires a non-effect capability. Any such discovery upgrades the task and requires explicit review before changing authority surfaces.

## 18. Explicit non-claims

This design does not claim or provide:

- biological dopamine;
- desire, pleasure, suffering, motivation, agency, or consciousness;
- a universal sparse reward circuit across all model architectures;
- model correctness from internal confidence;
- hidden-state extraction;
- runtime/model invocation;
- network access;
- automatic branch search;
- automatic reasoning rollback;
- automatic model routing;
- candidate ranking;
- self-promotion;
- authority grants;
- capability grants;
- adaptation authorization;
- model activation;
- provider compatibility;
- probe scientific validity merely because a manifest exists;
- permission to store raw hidden states or chain-of-thought.

## 19. Future promotion path

Later separately reviewed slices may add:

1. **Model-specific introspection adapters** that collect approved measurements from local/open-weight runtimes.
2. **Provider-native introspection adapters** where a provider exposes an authenticated, policy-compatible internal signal.
3. **Inference-time search advisory evidence** for proposing branch expansion, reconsideration, or extra verification without directly executing it.
4. **Routing-policy consumption** of calibrated reward evidence as one bounded input among cost, privacy, availability, consequence, assurance, and external verification.
5. **High-sensitivity interpretability research vaults** for raw activations under explicit retention and access controls.
6. **Cross-model reward-alignment studies** that compare internal success representations while preserving model/probe incompatibility boundaries.

Each future slice must cross its own design and authority review boundary.

## 20. Architectural result

Reward Introspection Evidence v0 gives AXIOM a stable place to represent a new and potentially important class of model evidence without confusing introspection with truth or cognition with authority.

The resulting architecture is:

```text
cognitive runtime/model
       |
       | future separately authorized introspection adapter
       v
Reward Probe Manifest
       |
Reward Introspection Observation
       |
       +----------------------+
       |                      |
       v                      v
independent outcome      predecessor/candidate
verification             evidence
       |                      |
       v                      v
Reward Calibration      Reward Drift
Report                  Comparison
       \                      /
        \                    /
         v                  v
       evaluation/governance evidence
                |
                v
        existing AXIOM authority path
```

The introspection subsystem ends before the authority path begins.

That separation is the central design property.

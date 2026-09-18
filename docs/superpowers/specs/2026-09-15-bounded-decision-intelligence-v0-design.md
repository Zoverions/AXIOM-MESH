# Bounded Decision Intelligence v0 — Design

**Status:** OWNER APPROVED architectural direction on 2026-09-15; written-spec review required before implementation

**Date:** 2026-09-15

**Scope:** provider-neutral contracts and routing rules for fast, typed, probabilistic decision models that evaluate bounded questions over supplied state. The design allows such models to contribute evidence for classification, routing, scoring, anomaly detection, verification, and other narrow judgments without allowing model output, confidence, provider identity, or provider availability to become an authority root.

**Builds on:**

- `CONSTITUTION.md`
- `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`
- `docs/superpowers/specs/2026-09-05-reward-introspection-evidence-v0-design.md`
- `mesh/config/runtime-provider-catalog.v0.json`
- `mesh/src/lib/runtime-connector-fabric-contracts.mjs`
- `mesh/src/lib/policy.mjs`
- `mesh/src/lib/plan.mjs`
- the existing `Gateway -> Hypervisor -> Sandbox -> Grid` authority path
- existing deny-dominant policy, explicit assurance tiers, observable decision provenance, exact-effect commitments, finite machine-principal ceilings, one-use capabilities, independent approvals, signed evidence, credential isolation, and fail-closed semantics

**External research input:** TypeSafe AI, *Introducing System One Models and Jev* (2026-09-14), https://typesafe.ai/blog/introducing-system-one-models-and-jev ; TypeSafe AI documentation on System One primitives, confidence, and composition, https://docs.typesafe.ai/ . These sources motivate the architectural shape: unstructured state plus atomic typed questions, closed answer spaces, probability distributions, parallel evaluation, confidence-aware routing, and deterministic composition in ordinary software. TypeSafe's claims and current model performance are treated as external evidence, not as AXIOM trust roots or production-quality guarantees.

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative. This design creates no executable capability, no model-provider authority, no external network access, no credential visibility, no provider activation, no automatic tool use, no autonomous policy mutation, no assurance promotion, no production routing change, and no direct change to `axiom-plan.v1`. A bounded decision result is evidence only until independently consumed by deterministic AXIOM policy or a separately authorized workflow.

---

## 1. Architectural decision

AXIOM-MESH should formalize a distinct **Bounded Decision Intelligence** layer between raw state and authority-bearing execution.

The target separation is:

```text
state / observations
        |
        v
bounded decision provider
        |
        v
typed answer + probability evidence
        |
        v
deterministic interpretation / composition
        |
        +--> request more evidence
        +--> route to deliberative intelligence
        +--> route to human or independent approval
        +--> produce a non-authoritative recommendation
        |
        v
existing AXIOM policy + assurance path
        |
        v
Gateway -> Hypervisor -> Sandbox -> Grid
```

The governing doctrine is:

> **A bounded model may produce evidence about what should happen. It may never produce the authority for it to happen.**

A second doctrine constrains model freedom to task requirements:

> **Use the least expressive intelligence that can faithfully perform the task.**

For a closed classification, routing choice, ordinal score, or binary judgment, AXIOM should prefer a bounded typed decision interface over an unconstrained text generator when the bounded interface is sufficiently accurate, calibrated, private, available, and policy-compatible.

This is an optimization and safety principle, not an authority rule. Choosing a less expressive model does not itself authorize execution.

---

## 2. Motivation

General-purpose generative models are useful because they can produce open-ended language, plans, code, explanations, and novel abstractions. That same flexibility is unnecessary for many machine-to-machine decisions.

Examples include:

- choosing one handler from a known registry;
- classifying an intent into a closed taxonomy;
- scoring severity against explicitly described levels;
- estimating whether supplied content contains a known class of sensitive information;
- deciding whether a result supports, contradicts, or is irrelevant to a bounded claim;
- ranking candidate nodes or providers on already-declared dimensions;
- producing anomaly or threat-likelihood signals;
- deciding whether a task should stay local, use a specialist, escalate to a deliberative model, or require a person.

For these tasks, open-ended generation introduces failure modes that do not contribute useful capability: unexpected strings, parser failures, invented labels, malformed tool calls, unnecessary verbosity, hidden multi-step reasoning, larger latency, and larger cost.

TypeSafe's September 2026 release provides a concrete example of a different interface. Jev accepts state plus typed questions and returns closed-set Choice results, ordered Score results, or binary-probability Noul results. Choice and Score expose full probability distributions, while Noul exposes the probability of `true`. The provider reports questions as independently evaluated against the same state and encourages deterministic composition in application code.

AXIOM should adopt the architectural lesson without adopting one vendor as infrastructure doctrine.

---

## 3. Existing AXIOM substrate

### 3.1 Sovereign Intelligence Selection

The existing `Sovereign Intelligence Selection v0` design already separates discovery, eligibility, selection, and execution:

> **Discovery is not authority. Eligibility is not selection. Selection is not execution.**

Bounded Decision Intelligence extends this doctrine. It must bind to the provider/runtime catalog without expanding the existing Cognitive Capability Profile's closed vocabulary in place.

The first implementation therefore uses an adjunct `Bounded Decision Provider Profile` bound to an exact provider/runtime catalog entry and offering reference.

### 3.2 Reward Introspection Evidence

Reward Introspection already establishes a critical non-substitution rule: model-native confidence or internal success signals are evidence about cognition, not proof of correctness, policy compliance, consent, safety, or authority.

Bounded Decision Intelligence applies the same rule to externally surfaced probability and confidence values.

### 3.3 Policy and plans

The current policy engine is deterministic, deny-dominant, risk-aware, and assurance-aware. `axiom-plan.v1` records explicit policy digests, required and achieved assurance, observable decision provenance, one-use capability declarations, and independent approval where required. It rejects private reasoning or chain-of-thought as decision provenance.

Bounded decision evidence must integrate with this architecture as an observable evidence input, never as a replacement policy engine and never by smuggling provider confidence into `required_assurance` or `achieved_assurance`.

The v0 implementation is intentionally adjunct and does not change `axiom-plan.v1`. A later plan-version extension may add explicit evidence-reference fields after the bounded evidence contracts are proven stable.

---

## 4. Considered approaches

### 4.1 Use general-purpose LLMs for every judgment

Every semantic decision is expressed as a prompt to a text-generating model and parsed into the desired shape.

**Advantages:** maximum flexibility; few new abstractions.

**Rejected as the default:** it gives narrow tasks unnecessary output freedom, makes schema adherence an adapter concern, and couples simple decisions to generative latency/cost and generative failure modes.

### 4.2 Add Jev directly as a privileged AXIOM subsystem

AXIOM calls TypeSafe directly and treats returned answers/confidence as trusted routing decisions.

**Advantages:** fastest path to experimentation; simple implementation.

**Rejected:** it creates vendor coupling, confuses schema validity with semantic correctness, risks turning provider confidence into authority, and would make one early-access model part of the trust boundary.

### 4.3 Provider-neutral bounded-decision evidence layer — adopted

AXIOM defines strict question schemas, provider profiles, normalized observations, calibration evidence, and deterministic interpretation rules. Jev may later implement one adapter. Other remote, local, specialized, neurosymbolic, or future decision systems can implement the same contract.

**Advantages:** preserves provider plurality; keeps authority deterministic; makes calibration explicit; supports local and remote models; minimizes unnecessary model freedom; cleanly composes with AXIOM's current evidence architecture.

**Trade-off:** requires additional contracts, calibration lifecycle, provider-conformance testing, and careful distinction between model confidence and AXIOM assurance.

---

## 5. Non-negotiable invariants

1. **Bounded decision output is evidence, not authority.** It cannot mint capability, approve an action, widen scopes, authorize egress, reveal credentials, spend funds, mutate policy, or independently cause an external effect.
2. **Confidence cannot raise assurance.** No model confidence, probability, benchmark score, provider reputation, or ensemble agreement can increase `achieved_assurance` or reduce `required_assurance`.
3. **Schema validity is not semantic correctness.** A provider can return a perfectly valid typed answer that is factually or contextually wrong.
4. **Semantic correctness is not authorization.** Even a demonstrably correct classification does not authorize an effect.
5. **Thresholds belong to deterministic policy.** A model must not decide what confidence is sufficient for an effect it would enable.
6. **Probability evidence is preserved.** Where a provider exposes a distribution, AXIOM preserves the normalized distribution rather than persisting only the winning label or scalar.
7. **Unknown or malformed evidence fails closed.** Missing provider identity, unknown model version, schema mismatch, invalid probabilities, stale calibration, response truncation, timeout, or parsing failure cannot widen authority or silently fall back to a more permissive path.
8. **Provider outage cannot lower protection.** Unavailability may route to another eligible provider, deliberative reasoning, deterministic fallback, or human review; it cannot bypass a required judgment or approval.
9. **Model self-confidence is not calibration evidence.** Calibration requires comparison against independently sourced outcomes in a declared domain/population.
10. **Calibration is scoped and expiring.** A calibration claim must identify model/offering, question-schema family, evaluation population/domain, evidence period, and review/expiry state.
11. **Ensemble agreement cannot manufacture authority.** Multiple agreeing models remain evidence. Independence assumptions must be explicit before agreement is treated as stronger evidence.
12. **Question schemas are content-addressed.** Material wording, criteria, level, option, interpretation, or composition changes create a new schema digest.
13. **Bounded means closed-world.** Every executable consumer must know the allowed output space before invocation. Open text generation is not a bounded decision response.
14. **No chain-of-thought requirement.** Providers are evaluated on observable inputs, outputs, distributions, calibration, latency, and externally measurable behavior. Hidden reasoning is neither required nor accepted as authority provenance.
15. **State minimization precedes model invocation.** Remote providers receive only the state required for the question and only when independently authorized by data/disclosure policy.
16. **Provider routing is not disclosure authority.** Selecting a provider does not authorize sending it data. Data authority and workload routing remain separate decisions.
17. **Speculative fan-out is bounded.** AXIOM may evaluate questions whose answers are later unused, but question count, data scope, cost, latency, provider access, and retention remain policy-bounded.
18. **Least expressive intelligence is a preference, not a downgrade.** If a bounded interface cannot faithfully represent the task, AXIOM escalates to deliberative/generative intelligence rather than forcing a complex problem into an inadequate schema.
19. **A decision model cannot evaluate its own authority ceiling.** Questions about whether the model may widen its privileges, acquire credentials, disable safeguards, or bypass approval are non-authoritative regardless of answer.
20. **Capability registry truth remains authoritative.** Provider profiles and design documents cannot assert an implementation or production capability into existence.

---

## 6. Terminology

### 6.1 Bounded decision

A semantic judgment whose permitted answer space is fully declared before model invocation.

### 6.2 Question schema

A content-addressed declaration of one atomic judgment: instructions, output type, allowed values/levels, interpretation, known limitations, and intended domain.

### 6.3 Decision observation

One provider's typed answer to one exact question schema over one exact state digest, including probability/confidence evidence and provider provenance.

### 6.4 Confidence

A provider-returned or AXIOM-derived statistic describing concentration/uncertainty in a model's probability evidence. Confidence does not mean correctness and has no AXIOM assurance semantics.

### 6.5 Calibration

Empirical evidence describing how predicted probabilities/confidence relate to independently observed outcomes for a declared model, schema family, domain, population, and evidence period.

### 6.6 Interpretation policy

Deterministic code or policy that consumes one or more validated decision observations and decides whether to accept a non-authoritative result, gather more evidence, escalate, or reject the evidence.

---

## 7. Contract set

Bounded Decision Intelligence v0 defines four independently content-addressed contracts:

1. `axiom-bounded-decision-provider-profile.v0`
2. `axiom-bounded-decision-question-schema.v0`
3. `axiom-bounded-decision-observation.v0`
4. `axiom-bounded-decision-calibration-report.v0`

The first implementation also provides pure deterministic validators and interpretation helpers. It does not invoke a remote provider.

---

## 8. Bounded Decision Provider Profile v0

### 8.1 Purpose

A provider profile declares bounded-decision capabilities for one exact runtime/provider catalog entry and offering reference.

It is descriptive evidence, not proof of availability, quality, privacy, or authority.

Schema identifier:

`axiom-bounded-decision-provider-profile.v0`

### 8.2 Exact provider binding

Required fields:

```text
profile_id
catalog_entry_id
catalog_entry_version
catalog_entry_digest
offering_ref
offering_version_or_revision
offering_revision_evidence
provider_mode
supported_question_kinds[]
max_questions_per_request
max_choice_cardinality
max_score_levels
type_guarantee
probability_support
latency_class
calibration_claim
retention_posture_ref
training_use_posture_ref
created_at
review_at
```

`offering_revision_evidence` closed vocabulary:

- `exact-artifact`
- `provider-versioned`
- `mutable-alias`
- `unknown`

A mutable alias such as a provider's `latest` model name is not equivalent to an exact model revision. It may be recorded and used experimentally, but calibration tied only to a mutable alias cannot be represented as exact-artifact calibration.

`provider_mode` closed vocabulary:

- `owner-local`
- `owner-remote`
- `provider-remote`
- `hybrid`

`supported_question_kinds` closed vocabulary:

- `choice`
- `score`
- `binary-probability`

`type_guarantee` closed vocabulary:

- `provider-native-closed-set`
- `adapter-constrained`
- `best-effort`

Only `provider-native-closed-set` may claim that off-schema answer values are impossible by provider construction. That claim does not imply semantic correctness.

`probability_support` closed vocabulary:

- `full-distribution`
- `binary-probability-only`
- `confidence-only`
- `none`

The first policy-eligible implementation requires `full-distribution` for Choice and Score and at least `binary-probability-only` for binary questions.

`latency_class` reuses the existing coarse cognitive-routing vocabulary:

- `local-fast`
- `interactive`
- `slow`
- `batch`
- `unknown`

`calibration_claim` closed vocabulary:

- `none`
- `provider-claimed`
- `local-experimental`
- `local-reviewed`

The value is descriptive. Only an independently validated `axiom-bounded-decision-calibration-report.v0` can satisfy an interpretation policy that requires reviewed local calibration.

`retention_posture_ref` and `training_use_posture_ref` are nullable references to separately reviewed provider/data-policy evidence. A null or unknown posture does not make a remote provider ineligible universally, but it cannot satisfy a caller that requires a known retention or training-use posture.

### 8.3 Hard boundary constants

Every profile must contain:

```text
authority_effect = none
network_effect = none
credential_visibility = none
runtime_activation = false
selection_effect = eligibility-only
assurance_effect = none
```

Any widening fails validation.

---

## 9. Bounded Decision Question Schema v0

Schema identifier:

`axiom-bounded-decision-question-schema.v0`

A schema represents one atomic semantic question.

Required common fields:

```text
question_schema_id
question_kind
instructions
purpose
domain
state_contract_ref
known_limitations[]
created_at
schema_digest
```

The canonical digest excludes the self-referential `schema_digest` field and covers every material semantic field.

### 9.1 Choice

`question_kind = choice`

Additional fields:

```text
options[]
other_option_policy
```

Each option contains a stable `option_id` plus a non-empty description. Option ids are machine-facing and descriptions are model-facing semantics.

`other_option_policy` is one of:

- `required`
- `allowed`
- `forbidden`

A schema whose domain is not demonstrably exhaustive should use an explicit `other`/`none` option rather than forcing every state into an incorrect known category.

### 9.2 Score

`question_kind = score`

Additional fields:

```text
levels[]
```

There must be 2-10 ordered, distinctly described levels in v0. Each level has a stable `level_id`, integer `position` starting at zero, and description. A score represents a probability-weighted position over those declared levels; it is not an unbounded numeric forecast.

### 9.3 Binary probability

`question_kind = binary-probability`

Additional fields:

```text
true_meaning
false_meaning
```

The answer is represented as `p_true` in `[0,1]`. Consumers derive `p_false = 1 - p_true` rather than accepting two independently inconsistent numbers.

### 9.4 Atomicity

A v0 question must measure one semantic dimension. Schemas that combine independent factors such as safety, legality, user intent, and business priority into one model score are invalid design even if syntactically valid.

Composite judgments belong in deterministic code over multiple observations.

---

## 10. Bounded Decision Observation v0

Schema identifier:

`axiom-bounded-decision-observation.v0`

Required common fields:

```text
observation_id
provider_profile_id
provider_profile_digest
catalog_entry_digest
offering_ref
offering_version_or_revision
offering_revision_evidence
question_schema_id
question_schema_digest
question_domain
state_digest
state_classification
observed_at
latency_ms
answer
probability_evidence
provider_confidence
usage_evidence
calibration_report_ref
transport_evidence_ref
observation_digest
```

`question_domain` preserves the domain committed by the exact question schema so later interpretation can reject calibration evidence declared for a different domain without retaining raw state. `state_classification` records the AXIOM sensitivity/disclosure class applied before invocation. Raw state is not duplicated into the observation.

`provider_confidence` may be null where the primitive does not provide a separate confidence statistic. The probability evidence remains the primary observable uncertainty evidence.

`calibration_report_ref` is required as a field but may be null for uncalibrated or experimental evidence. A null value cannot satisfy an interpretation policy requiring calibration.

`transport_evidence_ref` is required as a field but may be null for a purely local fixture/provider path that has no remote transport evidence. Remote provider policies may require it to be non-null.

`usage_evidence` is bounded accounting metadata such as input units, output units where applicable, provider-reported usage, or local compute class. It cannot contain credentials or raw state.

### 10.1 Choice answer

```text
answer.kind = choice
answer.selected_option_id
probability_evidence = [{ option_id, probability }, ...]
```

Requirements:

- every declared option appears exactly once;
- no unknown option appears;
- every probability is finite and in `[0,1]`;
- probabilities sum to 1 within a strict numerical tolerance;
- `selected_option_id` equals an option with maximal probability; ties require deterministic tie representation rather than silent provider-specific tie breaking.

### 10.2 Score answer

```text
answer.kind = score
answer.score
probability_evidence = [{ level_id, position, probability }, ...]
```

Requirements:

- every declared level appears exactly once;
- probabilities sum to 1 within tolerance;
- `answer.score` equals the probability-weighted mean of level positions within tolerance;
- the observation preserves the distribution even when the consumer uses only the scalar score.

### 10.3 Binary-probability answer

```text
answer.kind = binary-probability
answer.p_true
probability_evidence = [
  { value: false, probability: 1 - p_true },
  { value: true, probability: p_true }
]
```

No separate confidence is required.

### 10.4 Error observations

Provider timeout, unavailable model, schema rejection, malformed response, incomplete response, transport failure, and local validation failure are represented as bounded failure receipts rather than fabricated decision observations.

No default semantic answer is substituted for a failed call.

---

## 11. Calibration Report v0

Schema identifier:

`axiom-bounded-decision-calibration-report.v0`

A calibration report binds probabilistic behavior to independently sourced outcomes.

Required fields:

```text
calibration_report_id
provider_profile_digest
offering_version_or_revision
offering_revision_evidence
question_schema_family_refs[]
domain
population_description
evaluation_period
sample_count
outcome_source_refs[]
metrics
known_limitations[]
distribution_shift_notes[]
created_at
valid_until
review_state
report_digest
```

`review_state` closed vocabulary:

- `experimental`
- `reviewed`
- `expired`
- `rejected`

Metrics may include Brier score, log loss, calibration error, reliability bins, class-specific error, confusion evidence, and abstention/escalation performance where applicable. The contract does not prescribe one universal metric as sufficient.

A report must not treat the model's own confidence values as its ground truth. Outcome evidence that aliases the bound provider identity or exact provider/catalog digests is not independent evidence and must fail resolution.

A report from a materially different provider revision, schema wording, domain, language, population, or state distribution may be useful evidence but cannot be silently relabeled as in-domain calibration.

A calibration report bound only to `mutable-alias` or `unknown` revision evidence must preserve that limitation. It cannot satisfy a policy requiring exact-artifact or provider-versioned reproducibility unless separate provider evidence proves the serving revision remained unchanged for the relevant evaluation and use periods.

---

## 12. Confidence and AXIOM assurance are orthogonal

This design locks the following distinction:

```text
model probability/confidence
    = epistemic evidence emitted by a cognitive provider

AXIOM assurance
    = evidence that the authority/execution requirements for an effect have been satisfied
```

Examples:

```text
model confidence = 0.999
required assurance = A3
independent approval absent
result = no A3 executable plan
```

```text
model confidence = 0.42
read-only low-risk classification
policy allows escalation
result = request more evidence or route elsewhere
```

No conversion function from confidence to assurance exists.

No policy may encode `confidence >= X => achieved_assurance = Y`.

---

## 13. Deterministic interpretation and composition

The model answers atomic questions. AXIOM code composes them.

An interpretation helper consumes observations and calibration reports together with the trusted provider profiles and question schemas they claim to bind, then re-validates and re-resolves that evidence before applying an explicit caller policy. A self-consistent digest is not a trusted binding. The caller policy may include:

```text
required_schema_digests[]
maximum_observation_age
minimum_calibration_state
minimum_sample_count
allowed_provider_profiles[]
allowed_revision_evidence[]
confidence_or_probability_predicates[]
disagreement_rule
fallback_route
```

The helper returns one of:

- `accepted-evidence`
- `insufficient-evidence`
- `conflicting-evidence`
- `stale-evidence`
- `invalid-evidence`

It does not return `authorized`.

Example composition:

```text
intent_choice = "export-data" probability 0.82
sensitive_data_probability = 0.91
user_confirmation_present = false

bounded interpretation:
  high likelihood of sensitive export intent

AXIOM authority result:
  still determined by existing disclosure, consent, policy,
  confirmation, and assurance requirements
```

---

## 14. Routing topology

AXIOM should distinguish four cognitive/execution roles:

```text
Bounded decision intelligence
  fast classification, routing, scoring, detection, verification evidence

Deliberative/generative intelligence
  planning, synthesis, open-ended reasoning, novel language/code, simulation

Deterministic kernel
  policy, constraints, capability issuance, exact effects, evidence commitments

Human / independent authority
  approvals or judgments whose governing policy requires an independent actor
```

A routing policy may prefer bounded intelligence when:

- the answer space can be closed before invocation;
- the question is atomic;
- the task does not require novel output;
- calibration evidence is sufficient for the intended non-authoritative use;
- latency/cost/privacy posture satisfies caller constraints.

It should escalate when:

- the answer space is incomplete or unknown;
- the question requires multi-step reasoning or synthesis;
- the state is insufficient;
- calibration is absent/stale/out-of-domain;
- provider evidence conflicts materially;
- the consequence requires independent verification;
- the caller requires explanation that cannot be produced safely from the bounded result alone.

---

## 15. Speculative fan-out

Parallel bounded questions can reduce latency by asking potentially relevant questions before deterministic code knows which branch will be taken.

AXIOM may support this pattern subject to explicit ceilings:

- maximum questions per invocation;
- maximum aggregate criteria/options;
- maximum input-state size;
- provider and cost budget;
- disclosure policy;
- latency budget;
- rate/concurrency budget;
- result retention budget.

Unused answers remain evidence, not actions. They may be discarded after bounded telemetry/accounting obligations are satisfied.

A speculative question must not receive state that the eventual selected branch would not have been authorized to disclose merely because batching is cheaper.

---

## 16. Security and privacy model

### 16.1 Prompt or instruction injection

A bounded provider reduces output freedom but does not make adversarial state harmless. Input content can still bias semantic classification.

Controls include:

- state treated as data, not trusted instruction;
- trusted question/schema separated structurally from untrusted state;
- exact schema digest bound before invocation;
- no authority-bearing credential in model context;
- no direct tool execution from provider response;
- adversarial fixtures in calibration/conformance suites;
- deterministic validation of every response field.

### 16.2 Provider substitution

A routing intermediary or provider must not silently substitute an unrecorded model/offering. The observation must bind the requested provider profile and the observed/returned offering identity where available. Mismatch is explicit evidence and may fail policy.

A mutable alias must remain marked as such. AXIOM must not manufacture an exact revision identifier merely to improve audit appearance.

### 16.3 Data disclosure

Provider eligibility does not authorize data disclosure. Before a remote call, AXIOM must separately establish that the state may be sent to that destination for the stated purpose under current retention/training-use constraints.

### 16.4 Correlation and persistent profiling

Large-scale cheap classification can become surveillance infrastructure even when each decision is individually narrow. Retention, identity linkage, aggregation, and cross-context correlation remain separately governed information effects.

### 16.5 Denial-of-wallet / decision storms

Cheap intelligence is still finite. Question count, cardinality, input size, repeated retries, and parallel provider invocation require budgets and rate ceilings. A provider failure must not trigger unbounded fan-out.

---

## 17. Error taxonomy

AXIOM must distinguish these failure classes rather than collapsing them into "model error":

1. `provider-unavailable` — no valid response received.
2. `transport-integrity-failure` — response/source identity cannot be trusted sufficiently.
3. `schema-invalid` — response violates the declared typed contract.
4. `distribution-invalid` — probabilities are missing, non-finite, out of range, incomplete, or inconsistent.
5. `semantic-error` — typed response is valid but wrong against an independently established outcome.
6. `low-certainty` — evidence is valid but insufficiently concentrated for the caller's interpretation policy.
7. `out-of-domain` — calibration evidence does not cover the current state/domain sufficiently.
8. `stale-calibration` — the relevant calibration validity window has expired.
9. `conflicting-evidence` — independent bounded observations materially disagree.
10. `insufficient-state` — the supplied state cannot support the requested judgment.
11. `policy-ineligible` — the provider or question is not permitted for the requested data/purpose.
12. `authority-unsatisfied` — semantic evidence may be acceptable but the requested effect still lacks required AXIOM authority/assurance.

Only the final class belongs to the authority path; the others describe evidence quality or provider operation.

---

## 18. TypeSafe / Jev integration posture

Jev is a useful first conformance target because its current interface closely matches this design:

- Choice returns a selected option, full option probabilities, and confidence;
- Score returns a probability-weighted score, per-level probabilities, and confidence;
- Noul returns the probability that a binary statement/question is true;
- multiple questions are evaluated in parallel against shared state;
- the provider encourages atomic questions and deterministic composition in code;
- the provider claims schema matching is guaranteed for its native structured outputs.

AXIOM must preserve the provider's own nuance:

- "no type errors" is not equivalent to "cannot be semantically wrong";
- confidence describes the returned distribution, not guaranteed correctness;
- TypeSafe advises thresholds based on consequences, but AXIOM additionally requires that confidence never substitute for independent authority/assurance;
- the public workflow evaluations are provider-created and use frontier-model predictions as reference probabilities rather than independently established universal ground truth;
- Jev is early access as of 2026-09-15;
- examples currently use a mutable offering name such as `jev-latest`, so exact serving-revision evidence may be unavailable unless the provider exposes stronger version metadata.

Therefore Jev should enter AXIOM, if separately implemented, as an **experimental provider adapter** with explicit calibration and conformance evidence, not as a privileged or default trust root.

---

## 19. First implementation slices

### Slice A — inert contracts and fixtures

Implement:

- validators/digest helpers for the four v0 contracts;
- deterministic normalization of Choice, Score, and binary-probability observations;
- pure interpretation helpers;
- adversarial and malformed fixtures;
- provider-neutral documentation/tests.

Explicitly absent:

- remote API calls;
- provider credentials;
- runtime/provider activation;
- policy or `axiom-plan.v1` changes;
- production routing.

### Slice B — local conformance adapter

Implement a fixture/local adapter interface that demonstrates provider conformance without network access. It should prove that provider-specific payloads can normalize into the AXIOM observation contract while preserving distributions and rejecting malformed evidence.

### Slice C — experimental external adapter

Only after separate review:

- add an adapter for a selected provider such as Jev;
- keep credentials brokered and outside model state;
- enforce data-disclosure policy before egress;
- record requested/observed offering identity and revision-evidence strength;
- bind cost/latency/transport evidence;
- keep the adapter disabled unless explicitly configured;
- prevent the adapter from minting capability or entering the authority path directly.

### Slice D — routing experiments

Only after calibration evidence exists:

- evaluate bounded-versus-deliberative routing on non-consequential workloads;
- measure latency, cost, semantic accuracy, calibration, disagreement, and fallback behavior;
- do not promote to consequential automatic effects merely because latency/cost wins.

---

## 20. Testing and acceptance criteria

The v0 contract implementation is acceptable only if tests demonstrate all of the following:

1. unknown contract fields fail closed;
2. provider profiles bind exact runtime/provider catalog entries by digest;
3. unknown question kinds fail closed;
4. Choice observations reject missing, duplicate, unknown, or non-normalized options;
5. Score observations reject incorrect weighted means or invalid level distributions;
6. binary probability rejects values outside `[0,1]` and derives the complementary probability deterministically;
7. schema-digest changes occur for material question/criteria changes;
8. observations bind exact provider profile, offering, revision-evidence class, schema, and state digests;
9. raw state is not required in durable observation receipts;
10. model confidence cannot populate or mutate AXIOM assurance fields;
11. failed provider evidence cannot generate a default semantic answer;
12. null, stale, or rejected calibration cannot satisfy a caller requiring reviewed current calibration;
13. mutable-alias calibration cannot satisfy a caller requiring exact-version reproducibility;
14. conflicting evidence remains conflicting rather than being silently averaged away;
15. speculative unused results create no execution effect;
16. no contract validation or interpretation helper performs filesystem, network, subprocess, credential, wallet, Grid, or runtime operations;
17. no private chain-of-thought field is accepted as required decision provenance;
18. high model confidence with missing A3 approval still cannot yield an A3 executable plan;
19. provider failure cannot widen policy or bypass a required decision gate.

---

## 21. Non-goals for v0

This design does not attempt to:

- prove consciousness, personhood, or absence of subjective experience in a bounded model;
- treat narrow output shape as evidence that a model cannot have broader internal capabilities;
- standardize hidden model architecture;
- replace deliberative/generative models;
- replace deterministic policy;
- replace human or independent approval;
- create universal confidence thresholds;
- create a global benchmark leaderboard;
- infer provider independence from brand names;
- auto-install Jev or any other external provider;
- enable production egress;
- modify `axiom-plan.v1`;
- make model confidence an AXIOM assurance tier;
- authorize consequential actions from model output alone.

---

## 22. Locked implementation decisions

The following choices are normative for the implementation plan unless a new design review changes them:

1. The layer is named **Bounded Decision Intelligence**, not `Jev`, `System One`, or another provider-specific name.
2. Provider-specific support is implemented through adapters bound to exact provider/runtime catalog evidence.
3. The first executable slice is inert and network-free.
4. The first v0 question kinds are `choice`, `score`, and `binary-probability`.
5. Full distributions are mandatory for v0 Choice/Score observations used by interpretation policy.
6. Provider confidence is retained as evidence but never mapped to AXIOM assurance.
7. Calibration reports require independently sourced outcomes and explicit validity windows.
8. Question schemas are content-addressed and atomic.
9. Composite decisions are performed by deterministic code over atomic observations.
10. No provider response directly enters the capability-issuance path.
11. `axiom-plan.v1` remains unchanged in the first implementation slice.
12. A future plan-version extension may add explicit bounded-evidence references only after the v0 evidence contracts have implementation and conformance history.
13. Jev, if added later, begins as an experimental disabled-by-default adapter.
14. Provider offering revision evidence must remain explicit; mutable aliases are not silently promoted to exact version identity.
15. Any future production use for consequential actions requires a separate calibration, routing, disclosure, and authority review.

---

## 23. Architectural result

Bounded Decision Intelligence gives AXIOM a cognitive topology in which different kinds of intelligence do different jobs:

```text
fast bounded cognition
    -> typed probabilistic evidence

slow/open cognition
    -> plans, synthesis, explanations, novel reasoning

deterministic kernel
    -> policy, authority, constraints, exact effects

independent human/multi-party authority
    -> consequential approval where policy requires it
```

This reduces the amount of unconstrained cognition placed in routine control loops without pretending that narrow models are infallible.

The central safety property is preserved:

> **Intelligence may inform authority. Intelligence does not become authority merely by being fast, calibrated, structured, confident, or correct.**

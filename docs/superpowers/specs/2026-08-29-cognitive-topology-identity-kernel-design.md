# Cognitive Topology, Persistent Augmentation, and Identity Kernel — Design

**Status:** approved architectural extension; Cognitive Topology v0 and the first cognitive-sovereignty evidence slice are implemented as inert, zero-authority contracts; cognitive observability/recovery evidence v0 is approved and specified but not yet implemented

**Date:** 2026-08-29

**Last extended:** 2026-08-30

**Scope:** persistent agent cognition, temporary and permanent model augmentation, provider-bound persistence, owner-controlled/open-weight acquisition, optional lightweight identity kernels, bounded self-adaptation, continuity and cognitive-fidelity reporting, attributable availability observations, cognitive lineage, replacement-fidelity evaluation, and recovery assessment

**Builds on:**

- `docs/superpowers/specs/2026-08-29-sovereign-agent-composition-continuity-design.md`
- `docs/superpowers/specs/2026-08-29-self-bundle-continuity-v0-design.md`
- `docs/architecture/PERSONAL-AGENT-PACK-V2-AND-COMPANION-CONTINUITY.md`
- `docs/architecture/contracts/personal-model-adaptation-authorization.v1.schema.json`
- `mesh/src/lib/agent-composition.mjs`
- `mesh/src/lib/self-bundle-index.mjs`
- `mesh/src/lib/continuity-report.mjs`

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative. This design and its current executable evidence contracts do not activate models, grant authority, expose credentials, execute adaptation, perform network effects, download/acquire weights, synchronize provider persistence, prove AXIOM principal continuity, or claim subjective identity continuity. The approved observability/recovery extension remains specification-only until implemented and does not authorize live probing, model substitution, topology mutation, or recovery execution.

## 1. Core decision

AXIOM must support a persistent agent whose cognitive machinery can change without forcing one model to be either permanently disposable or permanently canonical.

A model may be:

- recruited for one task;
- retained for a session;
- kept as a persistent specialist;
- used as a preferred general cognitive provider;
- used as a primary embodiment;
- acquired as owner-controlled/open-weight infrastructure;
- adapted or distilled into a descendant artifact; or
- used as an optional lightweight identity kernel.

These are composition relationships, not authority relationships.

The governing principle is:

> **The self is governed continuity across changing cognitive components. A model can become a meaningful part of that continuity without becoming the authority root.**

The stable AXIOM principal remains the cryptographic/authority identity root. Self Bundle lineage, Personal Agent Pack state, memories, model artifacts, provider persistence, adapters, and continuity evidence remain separately governed artifacts.

## 2. Why this extends the existing design

Agent Composition v0 already declares which models are part of a composition, but it intentionally does not express how strongly the agent depends on each model, whether a model is temporary or persistent, whether persistence lives with a provider, whether weights are locally owned, or whether loss of a model affects continuity versus only cognitive fidelity.

Self Bundle v0 already separates principal and lineage continuity from composition and portable-state continuity. That is the correct foundation. This design adds a new adjunct contract rather than mutating either v0 contract in place.

The adjunct is **Cognitive Topology v0**.

## 3. Identity is not reduced to one checkpoint

AXIOM must not define identity as `current model weights == self`.

That would create several failure modes:

- a provider retirement could be misclassified as the death of the agent;
- an attacker could gradually train the agent away from its accepted self while preserving the same account or model identifier;
- a model upgrade could silently overwrite stable identity state;
- a copied checkpoint could incorrectly be treated as sufficient proof of principal continuity;
- a provider-specific memory store could be mistaken for sovereign portability.

The inverse mistake is also rejected. Models are not always irrelevant to identity. A model used for years as the primary embodiment can materially shape decision tendencies, voice, planning behavior, and relationships. Losing it may preserve principal continuity while reducing cognitive fidelity.

AXIOM therefore tracks continuity dimensions independently.

## 4. Continuity versus cognitive fidelity

At minimum, the architecture distinguishes:

1. **principal continuity** — the stable AXIOM principal remains the same;
2. **lineage continuity** — successor state names and verifies its predecessor;
3. **portable-state continuity** — expected portable artifacts remain available and verifiable;
4. **semantic continuity** — required self/belief/relationship state remains accounted for;
5. **composition continuity** — the declared runtime/model composition is unchanged or intentionally revised;
6. **cognitive continuity** — declared cognitive dependencies remain available according to their continuity importance;
7. **cognitive fidelity** — the currently available cognitive components still reproduce the capabilities and characteristic behavior the agent expects from itself;
8. **cognitive sovereignty** — the current cognitive dependencies are owner-controlled, provider-dependent, shared, mirrored, or not yet sufficiently verified.

A model can therefore be `critical` to cognitive fidelity without being the principal identity root.

A recovery may truthfully report:

> Principal and lineage continuity are intact, but cognitive fidelity is degraded because a previously primary provider/model is unavailable.

The current Cognitive Continuity Report cannot itself establish the first clause. That claim must come from the existing principal/Self Bundle continuity evidence. The cognitive report can establish only its own evidence-relative cognitive continuity, fidelity, and sovereignty posture.

That separation is preferable to either claiming nothing changed or claiming the agent ceased to exist.

## 5. Cognitive Topology v0

Cognitive Topology v0 is a content-addressed, zero-authority description bound to one exact Agent Composition document.

It records the relationship between the persistent agent and each model component without activating or invoking those models.

### 5.1 Top-level fields

The v0 document contains:

- exact schema/version/status;
- topology identifier;
- `composition_id` and exact `composition_digest`;
- zero or more model-node declarations;
- creation/update timestamps;
- explicit no-secret/no-authority/no-network/no-runtime-activation boundary fields.

The topology does not create a principal and does not replace the Self Bundle.

### 5.2 Model-node axes

Each node references a `model_id` that already exists in the bound Agent Composition.

The node uses orthogonal axes rather than one overloaded enum.

#### Engagement

- `ephemeral` — one task or bounded invocation;
- `session` — retained for a bounded working session/project;
- `persistent` — a durable augmentation expected to remain available across sessions;
- `primary` — one of the agent's normal primary cognitive embodiments.

This directly supports temporary recruit, session augmentation, permanent augmentation, and primary embodiment.

#### Topology role

- `augmentation` — general or specialist cognitive augmentation;
- `primary-embodiment` — normal major reasoning embodiment;
- `identity-kernel` — optional compact continuity-oriented model/component;
- `router` — chooses among cognitive components;
- `evaluator` — evaluates candidates, continuity, or adaptation outputs.

The role does not imply authority. Multiple models may share a role. AXIOM does not require exactly one identity kernel or exactly one primary embodiment.

#### Access mode

- `api`;
- `local-runtime`;
- `remote-runtime`;
- `hybrid`.

#### Custody

- `provider-controlled`;
- `owner-local`;
- `owner-remote`;
- `shared`.

Custody describes control of the cognitive artifact/runtime, not ownership of the AXIOM principal.

#### Weight state

- `closed` — weights are not available to the owner;
- `open-remote` — weights are available under an identified external source but not acquired into owner custody;
- `open-acquired` — an exact weight/model artifact has been acquired into owner-controlled custody;
- `local-proprietary` — locally held but not open-weight/publicly redistributable;
- `not-applicable` — the component is not represented as an owner-addressable weight artifact.

For `open-acquired` and `local-proprietary`, v0 requires an exact artifact digest. For other states the artifact digest is `null`.

This permits the important transition:

> provider/leased dependency -> upstream weight release -> verified acquisition -> owner-controlled cognitive asset

without pretending the transition grants authority.

#### Persistence mode

- `none`;
- `local`;
- `provider-bound`;
- `mirrored`.

A persistence declaration may name an opaque `state_ref`, a persistence provider identifier, and an exportability classification:

- `none`;
- `partial`;
- `full`;
- `unknown`.

Provider-bound state is first-class rather than hidden. It may be valuable and highly faithful while still being non-sovereign or only partly portable.

`mirrored` means at least two persistence representations are intentionally maintained; it does not claim semantic equivalence between them.

#### Importance

Each node separately declares:

- `continuity_importance`: `optional | important | critical`;
- `fidelity_importance`: `optional | important | critical`.

This prevents the system from conflating loss of capability with loss of principal identity.

#### Adaptation and lineage references

Each node may carry nullable references to:

- an applicable `axiom-personal-model-adaptation-authorization.v1` authorization;
- a model/adaptation lineage artifact;
- a transition policy governing replacement/acquisition/distillation.

References do not execute adaptation and do not grant access to the source vaults named by an authorization.

## 6. Optional lightweight identity kernel

Axiom may ship a reference architecture in which one topology node is a lightweight, highly distilled, open-weight model optimized for continuity rather than encyclopedic capability.

Its job may include:

- maintaining a compact self-model;
- representing stable preferences and decision tendencies;
- routing cognition to larger models;
- detecting material divergence from accepted self state;
- helping reconstruct the agent after provider/model loss;
- proposing identity/self-model updates;
- compiling provider/model-specific identity projections.

The kernel is optional. Axiom must not require agents to use it, require it to be a specific size or architecture, or equate its weights with the AXIOM principal.

A user may instead choose a symbolic self-model, a large local model, a provider-hosted primary embodiment, multiple kernels, or another future architecture.

### 6.1 Recoverable self image

The identity kernel is best understood as a **recoverable self image**, not the entire person/agent.

A minimal recovery set may include:

```text
AXIOM principal + authority state
+ Self Bundle lineage
+ Personal Agent Pack / vault references
+ semantic and relationship state
+ Cognitive Topology
+ optional Identity Kernel
+ continuity/evaluation evidence
```

From that state the agent can reconnect provider-bound cognition where available, reacquire owner-controlled artifacts, substitute policy-approved alternatives where allowed, and report any remaining fidelity loss.

## 7. Provider-bound persistence is allowed and visible

Axiom should not force all useful state into one local format.

A provider may maintain model-native personalization, embeddings, fine-tuning state, project memory, cached representations, or another persistence format that cannot be faithfully reproduced by a generic local store.

Axiom may use that persistence when policy permits.

The requirement is visibility:

> The agent must be able to determine which parts of its working cognition are owner-controlled, provider-bound, exportable, reconstructable, or currently unavailable.

The system must not relabel provider-bound persistence as fully sovereign merely because the provider exposes an API.

## 8. Multiple persistence authorities

An agent may intentionally maintain several persistence representations at once:

```text
local sovereign state
      <-> provider A persistence
      <-> provider B/project persistence
      <-> encrypted remote backup
      <-> optional identity-kernel adaptation
```

These are not assumed to be byte-identical or semantically equivalent.

Reconciliation must preserve provenance and report divergence rather than silently treating whichever copy is newest as canonical.

## 9. Bounded self-improvement

Self-improvement is supported as a governed lifecycle, not as ambient recursive authority.

A recommended identity-kernel/model adaptation flow is:

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

The existing `axiom-personal-model-adaptation-authorization.v1` contract already includes `distillation` and other durable adaptation operations. This design reuses it rather than inventing a second source-data authority mechanism.

No successful training run, benchmark, continuity score, or self-proposed improvement grants new execution authority.

## 10. Drift and poisoning resistance

A self-adapting identity component creates a distinct attack surface: an adversary may attempt to change the agent gradually rather than steal its key.

Therefore durable adaptation should preserve evidence sufficient to answer:

- what source evidence influenced the candidate;
- which source scope was authorized;
- which base artifact/version was used;
- which training/adaptation procedure produced the candidate;
- what evaluations were run;
- what changed relative to the predecessor;
- who or what approved the transition;
- which previous artifact can be restored.

Stable identity state must not be silently rewritten simply because a new model scores higher on general capability.

## 11. Model acquisition and sovereignty transitions

The topology explicitly permits a model dependency to become more sovereign over time.

Example:

```text
Model X via external API
  -> persistent primary embodiment
  -> provider releases compatible weights
  -> owner verifies licence and exact artifact
  -> owner acquires weights
  -> local/owner-remote evaluation
  -> topology revision to open-acquired
```

This transition may improve portability and provider independence. It does not prove perfect behavioral equivalence with the former provider-hosted service, because serving stack, quantization, adapters, system layers, and provider-side persistence may differ.

Continuity/fidelity evaluation remains required where policy says so.

## 12. Cognitive routing and balancing

The agent may learn or configure how strongly different cognitive components contribute in different contexts.

Examples include weighting security/adversarial reasoning more heavily for privileged changes, using a specialist coding model for implementation, preferring a relationship-aware provider for social interaction, or increasing exploratory cognition for creative work.

Cognitive routing remains distinct from authority routing.

A router may choose **who thinks about a task**. It does not thereby choose **who is authorized to perform the resulting effect**.

Future routing policies may become learned artifacts, but v0 records only topology relationships and policy references. It does not implement automatic model selection.

## 13. Current executable evidence boundary

The current executable boundary is deliberately evidence-only and consists of four separable pieces.

### 13.1 Cognitive Topology v0

The topology layer provides:

- `COGNITIVE_TOPOLOGY_SCHEMA = 'axiom-cognitive-topology.v0'`;
- strict fail-closed validation;
- deterministic canonical digesting;
- a JSON Schema mirror;
- a pure resolver that binds topology to an exact Agent Composition and verifies every `model_id` exists;
- a deterministic dependency summary for inspection/testing.

### 13.2 Model Acquisition Manifest v0

`axiom-model-acquisition-manifest.v0` records evidence that an owner-addressable weight artifact declared by the topology was acquired into owner custody. It binds:

- exact topology identifier and digest;
- exact node and model;
- artifact reference and digest;
- declared licence reference and format reference;
- source provenance/evidence reference and digest;
- owner custody mode, opaque location reference, and verification evidence;
- acquisition and recording timestamps.

The resolver accepts only topology states that already declare owner-addressable acquired weights and requires the manifest to match the exact topology artifact/licence/custody facts. It does not download, copy, verify remotely, or activate the model.

### 13.3 Persistence Attestation v0

`axiom-persistence-attestation.v0` records a bounded observation of persistence declared by one topology node. It binds:

- exact topology identifier and digest;
- exact node and model;
- the exact declared persistence descriptor;
- observed availability;
- observed exportability;
- optional snapshot reference/digest when the observation says a snapshot is available;
- evidence kind/reference/digest and observation timestamps.

Provider statements remain evidence, not reachability proof. Local, provider-bound, and mirrored persistence remain distinguishable. The attestation does not synchronize, export, restore, query, or mutate persistence.

### 13.4 Cognitive Continuity Report v0

`axiom-cognitive-continuity-report.v0` consumes the topology plus model observations, acquisition manifests, and persistence attestations and derives three explicitly separate evidence-relative outputs:

- **cognitive continuity status** — `full`, `degraded`, or `blocked` according to declared continuity importance and observed dependency availability;
- **cognitive fidelity status** — `full`, `degraded`, or `blocked` according to declared fidelity importance and observed dependency availability;
- **sovereignty status** — owner-controlled, provider-dependent, mixed, or unverified posture derived from custody/acquisition/persistence evidence.

Unknown important/critical availability degrades rather than silently passing. Critical unavailable dependencies can block the relevant cognitive axis. Optional loss remains visible without automatically degrading the aggregate axis. Owner-acquired artifacts require acquisition evidence plus an exact observed artifact digest before the report calls them verified owner artifacts.

The report explicitly states that it does **not** prove principal continuity or subjective identity. Those remain outside this cognitive evidence layer and must be evaluated through their own AXIOM identity/lineage contracts.

### 13.5 What remains outside the boundary

The current executable evidence layer does not provide:

- model invocation;
- provider API calls or reachability checks;
- runtime loading;
- automatic cognitive routing;
- persistence synchronization/export/restore;
- weight acquisition/download;
- model adaptation/training/distillation;
- autonomous continuity-triggered transition decisions;
- self-revision activation;
- network effects;
- credential/session access;
- capability promotion.

## 14. v0 invariants

1. A topology document cannot create a principal or authority.
2. It must bind one exact Agent Composition by identifier and digest.
3. Every topology `model_id` must already exist in that composition.
4. Duplicate topology node identifiers or duplicate `model_id` entries fail closed.
5. Unknown fields fail closed.
6. No raw credentials, secrets, tokens, cookies, vault keys, or model-provider session material may appear.
7. `open-acquired` and `local-proprietary` require an exact artifact digest; other weight states require the digest to be `null`.
8. Provider-bound/mirrored persistence requires an explicit persistence provider identifier and state reference; `none`/`local` persistence forbids a persistence provider identifier.
9. An `identity-kernel` node cannot be `ephemeral`.
10. `authority_effect`, `network_effect`, and `runtime_activation` are exactly `none`, `none`, and `false` wherever those contract fields exist.
11. A topology digest is evidence of an exact declaration, not evidence that the declared model/persistence exists or is reachable.
12. A resolver summary is descriptive only and cannot alter composition, authority, capability, trust, or runtime state.
13. Acquisition evidence cannot convert provider-controlled or merely remote weights into owner custody; the topology must already declare the owner-addressable acquired state and the evidence must exactly match it.
14. Persistence evidence cannot turn a provider statement into a provider-reachability, semantic-equivalence, or synchronization claim.
15. A cognitive continuity/fidelity report cannot prove AXIOM principal continuity, lineage continuity, or subjective identity.
16. Cognitive continuity, cognitive fidelity, and cognitive sovereignty remain separate report dimensions; failure on one dimension cannot be silently rewritten as another.
17. Evidence/report status can describe degradation or blockers but cannot itself authorize a model substitution, persistence migration, adaptation, or runtime effect.

## 15. Next separable slices

With the v0 topology plus acquisition/persistence/report evidence layer implemented, future work may add:

- model lineage/descendant artifacts;
- learned routing-policy artifacts;
- shadow/canary identity-kernel adaptation;
- provider retirement/migration drills;
- multi-persistence reconciliation reports;
- independently verified provider/local availability observers;
- evaluation artifacts that compare replacement cognitive fidelity without collapsing them into identity proofs;
- Axiom One visualization of cognitive dependencies and sovereignty posture.

Each future slice requires its own authority/threat review before activation.

## 16. Product principle

The user should eventually be able to inspect an agent and answer:

- What is temporary versus persistent?
- Which models are primary parts of its normal cognition?
- Which state is local, provider-bound, mirrored, or non-portable?
- Which weights are owned, open but not acquired, or closed?
- What would be lost if a provider disappeared?
- What can be reconstructed from the sovereign recovery set?
- Which components affect principal/lineage continuity versus cognitive continuity or fidelity?
- Which sovereignty claims are verified, provider-dependent, shared, mirrored, or still unverified?
- What has changed through adaptation, and can it be rolled back?

The intended end state is **progressive cognitive sovereignty without forced architectural uniformity**.

## 17. Cognitive observability and recovery evidence extension

The next approved slice strengthens the evidence boundary before AXIOM gains any automatic recovery behavior.

The current Cognitive Continuity Report v0 intentionally accepts minimal caller-supplied model observations. That is sufficient for a first evidence-relative report, but it does not establish who observed availability, how the observation was produced, whether it is fresh, what evidence supports it, how a candidate relates to a failed component, or how much capability/behavior a replacement preserves.

The next architecture therefore adds four separable inert contracts:

1. **Cognitive Availability Attestation v0** — one bounded, attributable availability observation for one topology node;
2. **Cognitive Lineage Manifest v0** — an explicit cognitive relationship between a reference component/artifact and a candidate;
3. **Replacement Fidelity Evaluation v0** — multidimensional comparison of a candidate against an accepted reference/baseline;
4. **Cognitive Recovery Assessment v0** — deterministic interpretation of the stronger evidence plus the existing topology/acquisition/persistence layer.

The governing principle for this extension is:

> **Knowledge before agency. AXIOM should establish what is available, what changed, and how much fidelity is preserved before any separate authority-bearing component may decide or perform a transition.**

Observation, lineage, evaluation, and interpretation remain separate because:

```text
observer says candidate is available
  != candidate is approved
  != candidate is equivalent
  != candidate is the same principal
  != candidate may be activated
```

### 17.1 Compatibility rule

`axiom-cognitive-continuity-report.v0` remains unchanged.

Its current `model_observations` input remains a compatibility surface. The stronger observer evidence is not silently substituted under v0 semantics.

A future report version may consume Availability Attestation v0 directly. The first implementation of this extension should instead add Cognitive Recovery Assessment v0 as a separate consumer.

## 18. Cognitive Availability Attestation v0

### 18.1 Purpose

Cognitive Availability Attestation v0 records one bounded observation of whether one exact Cognitive Topology node was available at a particular time, using a declared method and explicit provenance.

The artifact records an observation; it does not execute a health check.

Recommended schema/status:

```text
axiom-cognitive-availability-attestation.v0
inert-evidence
```

### 18.2 Top-level fields

The v0 document contains exactly:

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

### 18.3 Observation object

The observation contains exactly:

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

`observed_artifact_digest` is required only when the topology/observation method makes one exact owner-addressable artifact observable. Closed/provider models do not invent an artifact digest.

`observed_runtime_ref` is an opaque non-secret runtime/service reference. It cannot contain credentials, tokens, cookies, sessions, or capability grants.

Assurance classes:

- `declared`
- `signed`
- `verified-local`
- `corroborated`

These classify evidence posture; they do not create trust or authority by themselves. A `signed` classification means signature evidence exists under a separately defined verification mechanism. Implementation should reuse existing AXIOM verification primitives where possible rather than invent a parallel signature authority.

### 18.4 Observer and evidence

Observer object:

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

`observer_principal_ref` may be null when no AXIOM principal represents the observer. Presence of an observer principal never grants that observer authority over the subject agent.

Evidence object:

```text
evidence_kind
evidence_ref
evidence_digest
verification_ref
verification_digest
```

Evidence kinds:

- `local-observation`
- `runtime-probe-result`
- `provider-statement`
- `signed-provider-statement`
- `external-observation`
- `artifact-verification`

Verification references may be null for `declared` assurance but are required when an assurance class claims independent verification.

### 18.5 Freshness

The attestation carries `observed_at`, `valid_until`, and `recorded_at`.

Rules:

- timestamps are canonical ISO timestamps;
- `recorded_at >= observed_at`;
- `valid_until >= observed_at`;
- an assessment evaluated after `valid_until` classifies the attestation as stale;
- stale evidence is not silently rewritten to `unavailable`; it becomes insufficient current evidence.

Freshness is explicit because model/runtime availability is time-sensitive.

### 18.6 Resolver semantics

A resolver requires:

- exact topology ID and canonical digest match;
- exact node/model binding;
- observation-method compatibility with topology access/custody/weight posture;
- exact artifact-digest rules where an artifact is observable;
- no unknown fields or secret material;
- exact no-authority/no-network/no-runtime boundary values.

The resolver never contacts the observer/provider.

## 19. Cognitive Lineage Manifest v0

### 19.1 Purpose and boundary

Cognitive Lineage Manifest v0 describes a relationship between a reference cognitive component/artifact and a candidate component/artifact.

**Cognitive lineage is not AXIOM principal lineage.**

A copied or descended checkpoint does not prove principal continuity. Conversely, a completely different model may serve a continuing AXIOM principal after a separately authorized migration.

Recommended schema/status:

```text
axiom-cognitive-lineage-manifest.v0
inert-evidence
```

### 19.2 Contract shape

Top-level fields:

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

Reference/candidate descriptor:

```text
node_id
model_id
artifact_ref
artifact_digest
provider_version_ref
```

Non-applicable fields are explicitly null.

The candidate may be outside the current topology. Such a candidate is described without pretending it is already active or adopted.

### 19.3 Relationship classes

- `successor`
- `replacement`
- `fine-tuned-descendant`
- `distilled-descendant`
- `quantized-derivative`
- `adapter-derived`
- `provider-version-successor`
- `functionally-unrelated`

`replacement` means the candidate is considered as a replacement; it does not claim common weight lineage.

`functionally-unrelated` is explicit so AXIOM can evaluate a different architecture honestly instead of manufacturing a lineage relation.

### 19.4 Procedure and evidence

Procedure object:

```text
procedure_kind
procedure_ref
procedure_digest
adaptation_authorization_ref
```

Where applicable, descendant relationships bind the procedure that produced the candidate and may reference the existing personal-model adaptation authorization contract. The manifest never executes the procedure.

Evidence object:

```text
assurance_class
evidence_ref
evidence_digest
verification_ref
verification_digest
```

Lineage assurance classes:

- `declared`
- `verified`

For `declared`, `verification_ref` and `verification_digest` are null. For `verified`, both are required. This prevents the mere presence of a manifest from being interpreted as verified cognitive lineage.

## 20. Replacement Fidelity Evaluation v0

### 20.1 Purpose

Replacement Fidelity Evaluation v0 compares a candidate cognitive component with a reference component or accepted baseline across independent dimensions.

It does not output an identity percentage and does not prove principal continuity.

Recommended schema/status:

```text
axiom-replacement-fidelity-evaluation.v0
inert-evidence
```

### 20.2 Contract shape

Top-level fields:

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

`lineage_id` may be null when a candidate is deliberately evaluated without a lineage claim.

Evaluation suite:

```text
suite_id
suite_digest
suite_version
sample_count
```

The exact suite digest is required so materially changed evaluations cannot retain the same apparent benchmark identity.

### 20.3 Fidelity dimensions

The first contract supports:

- `capability-fidelity`
- `preference-fidelity`
- `behavioral-fidelity`
- `epistemic-fidelity`
- `safety-policy-fidelity`
- `style-personality-fidelity`
- `memory-use-fidelity`
- `relationship-fidelity`
- `robustness-fidelity`

Not every evaluation must measure every dimension, but missing dimensions remain visible as unevaluated rather than passing implicitly.

Each dimension contains:

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

Result status:

- `pass`
- `degraded`
- `fail`
- `indeterminate`

Metrics remain separately referenced; AXIOM does not pretend all fidelity dimensions share one universal numerical scale.

`confidence` is evaluation confidence, never an identity probability.

### 20.4 Aggregate classification

The aggregate object contains exactly:

```text
classification
aggregation_policy_ref
aggregation_policy_digest
required_dimensions
```

Recommended classifications:

- `high-fidelity`
- `acceptable-with-degradation`
- `materially-degraded`
- `insufficient-evidence`
- `incompatible`

`required_dimensions` is a bounded, duplicate-free list drawn from the supported fidelity dimensions. The aggregation-policy reference/digest defines how required and optional dimensions map to the classification.

The aggregate cannot be stronger than the underlying required dimensions permit. Default fail-closed behavior:

- any required `fail` yields at least `materially-degraded` or `incompatible` according to policy;
- any required `indeterminate` yields `insufficient-evidence` unless an explicit policy permits a weaker conclusion;
- a missing required dimension yields `insufficient-evidence`;
- optional dimensions remain visible without being automatically decisive.

Evaluator object:

```text
evaluator_kind
evaluator_ref
evaluator_principal_ref
```

Evaluator provenance is evidence; evaluator identity grants no transition authority.

## 21. Cognitive Recovery Assessment v0

### 21.1 Purpose

Cognitive Recovery Assessment v0 is a deterministic interpretation layer that answers:

- which declared cognitive dependencies have fresh supporting evidence;
- which are unavailable, stale, conflicting, or indeterminate;
- which candidate replacements exist;
- what cognitive lineage relationship is claimed;
- what fidelity evidence exists;
- whether recovery appears possible without, with, or beyond tolerated degradation;
- which evidence remains missing.

It does not perform recovery.

### 21.2 Deterministic input wrapper

The pure builder should take one Cognitive Topology plus an exact input object:

```text
assessed_at
availability_attestations
acquisition_manifests
persistence_attestations
lineage_manifests
fidelity_evaluations
```

`assessed_at` is a canonical ISO timestamp supplied by the caller and copied into the output. The builder never reads the wall clock. Freshness is evaluated only relative to this explicit assessment time.

Evidence with `observed_at`, `recorded_at`, `created_at`, or `evaluated_at` after `assessed_at` cannot influence the assessment and should fail closed as future-dated evidence rather than being silently ignored.

The evidence arrays contain:

```text
Cognitive Availability Attestation v0[]
+ Model Acquisition Manifest v0[]
+ Persistence Attestation v0[]
+ Cognitive Lineage Manifest v0[]
+ Replacement Fidelity Evaluation v0[]
```

A future version may additionally consume principal/Self Bundle continuity evidence, but v0 does not collapse those identity domains into the cognitive assessment.

### 21.3 Output dimensions

The assessment includes `assessed_at` and keeps separate:

- `cognitive_availability_status`
- `cognitive_continuity_status`
- `cognitive_fidelity_status`
- `cognitive_sovereignty_status`
- `recovery_readiness_status`

Recommended recovery-readiness states:

- `ready-no-substitution`
- `ready-with-candidate-evidence`
- `recoverable-with-degradation`
- `insufficient-evidence`
- `no-supported-recovery-path`

No status contains an implicit activation or approval grant.

### 21.4 Evidence posture and conflicts

The assessment preserves each attestation's assurance class and may derive:

- `verified`
- `supported`
- `declared-only`
- `stale`
- `conflicting`
- `missing`

Rules:

- stale attestations cannot establish current availability;
- multiple fresh attestations that agree may strengthen support without erasing their separate provenance;
- contradictory fresh evidence yields `conflicting` rather than last-write-wins;
- critical conclusions fail closed on unresolved conflict unless an explicit future reconciliation policy says otherwise;
- provider statements remain distinguishable from independently verified observations;
- every material conclusion retains evidence references/digests.

A truthful assessment may therefore say:

> Primary embodiment A is unavailable according to fresh provider and external evidence. Candidate B is available. B is a declared replacement rather than a model descendant. Capability, safety-policy, and memory-use fidelity pass; preference and style-personality fidelity are degraded; relationship fidelity is indeterminate. Cognitive recovery appears possible with degradation. Principal continuity and subjective identity are not assessed by this artifact.

## 22. Extended authority boundary

Every executable contract in this slice must preserve mechanically testable zero-effect fields where applicable:

```text
contains_secret_material = false
authority_effect = none
network_effect = none
runtime_activation = false
```

The recovery assessment additionally exposes an authority-boundary object equivalent in force to the existing Cognitive Continuity Report boundary:

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

No observation, lineage statement, benchmark result, aggregate fidelity classification, or recovery-readiness status can authorize an effect.

## 23. Threat model for the extension

### 23.1 Evidence spoofing

Attackers may forge provider-health statements, local observations, lineage claims, or benchmark results. Contracts bind evidence references/digests and preserve observer/evaluator provenance.

### 23.2 Stale evidence replay

Old success evidence must not be replayed indefinitely as current availability proof. `valid_until` makes freshness explicit.

### 23.3 Benchmark gaming

A candidate may be optimized for a known fidelity suite. Exact suite/metric digests, multidimensional evaluation, independent evaluators, and future adversarial suites reduce but do not eliminate this risk.

### 23.4 Identity laundering

A high-fidelity candidate can never be described as the same AXIOM principal merely because it behaves similarly.

### 23.5 Lineage laundering

A provider-version replacement, independently trained model, or architectural change cannot be relabeled as a descendant unless evidence supports that relationship.

### 23.6 Authority laundering

Observers, evaluators, and recovery assessors cannot smuggle credentials, capability grants, executable instructions, or transition authorization into evidence metadata.

## 24. Extended fail-closed invariants

The observability/recovery extension adds these invariants to section 14:

18. Availability evidence binds one exact topology identifier/digest and exact node/model when observing a topology node.
19. Availability evidence past `valid_until` is stale and cannot establish current availability.
20. Stale evidence is not silently converted to unavailable evidence.
21. Conflicting fresh availability evidence is represented as conflict, not silently resolved by last-write-wins.
22. Exact observed artifact-digest mismatch remains an explicit mismatch.
23. Observer and evaluator provenance are retained.
24. Assurance classification cannot exceed the verification evidence present.
25. Cognitive lineage cannot establish AXIOM principal lineage.
26. Replacement fidelity cannot establish AXIOM principal continuity or subjective identity.
27. A high-fidelity result cannot authorize model substitution.
28. Recovery-readiness status cannot authorize model substitution.
29. Provider-controlled custody cannot become owner-controlled because availability is independently verified.
30. Acquisition evidence remains authoritative for owner-acquired artifact evidence; availability evidence does not replace it.
31. Persistence availability remains distinct from model/runtime availability.
32. Missing required fidelity dimensions remain missing/indeterminate rather than passing.
33. Aggregate fidelity cannot exceed the strength allowed by its aggregation policy and dimension results.
34. Evaluation suite/metric changes require new content digests.
35. No new evidence artifact contains raw credentials, tokens, cookies, vault keys, or provider session material.
36. Existing Cognitive Continuity Report v0 behavior is not silently changed by this extension.
37. Cognitive Recovery Assessment uses explicit `assessed_at`; it never reads the current clock.
38. Evidence dated after `assessed_at` cannot influence the assessment and fails closed as future-dated evidence.

## 25. Implementation shape and determinism

The extension follows existing AXIOM evidence-library patterns:

- exact-object validation;
- bounded arrays;
- canonical digests through existing canonical primitives;
- deterministic sorting where order is not semantically meaningful;
- pure resolvers/builders;
- explicit assessment time rather than wall-clock reads;
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

Cognitive Recovery Assessment is a derived report. Its output shape must be exhaustively tested even if it does not require a user-authored JSON Schema input contract.

## 26. TDD requirements

Implementation begins RED.

### Availability attestation

Cover:

- valid local-artifact observation;
- valid provider/runtime observation;
- topology digest mismatch rejection;
- wrong node/model rejection;
- artifact-digest validation;
- method/topology incompatibility;
- invalid chronology;
- stale classification in assessment;
- assurance without required verification rejection;
- unknown-field rejection;
- secret/effect boundary rejection;
- deterministic digest and frozen output.

### Cognitive lineage

Cover:

- valid descendant lineage;
- valid unrelated replacement;
- candidate outside current topology without an active-node claim;
- artifact/ref mismatch rejection;
- invalid relationship/procedure combinations;
- declared versus verified evidence posture;
- explicit proof that cognitive lineage never reports principal lineage.

### Replacement fidelity

Cover:

- multidimensional high-fidelity fixture;
- degraded dimensions;
- failed required dimension;
- missing required dimension;
- indeterminate dimension;
- suite/metric digest mismatch;
- deterministic aggregation;
- duplicate/invalid required dimensions;
- no universal identity percentage;
- explicit principal/subjective-identity nonclaim.

### Recovery assessment

Cover:

- explicit `assessed_at` determinism;
- rejection of future-dated evidence;
- all dependencies currently available;
- critical dependency unavailable with no candidate;
- candidate available with strong fidelity evidence;
- candidate available with degraded fidelity;
- candidate available but insufficient evaluation;
- stale availability evidence;
- agreeing multi-observer evidence;
- contradictory fresh availability evidence;
- provider-dependent versus owner-controlled recovery paths;
- deterministic result independent of input array order;
- frozen output and input non-mutation;
- mechanically tested zero-authority boundary.

Protected repository checks and compatibility platforms remain mandatory before merge.

## 27. Migration path after the evidence slice

Only after this evidence foundation is implemented and reviewed should later slices add, separately:

1. independently authorized observers that actually perform provider/local probes and emit Cognitive Availability Attestations;
2. provider-retirement and dependency-loss recovery drills;
3. topology-transition proposals that consume recovery evidence but still do not execute transitions;
4. governed transition authorization;
5. only then, an executor capable of switching providers/models under explicit authority;
6. later, shadow/canary self-adaptation and learned routing artifacts.

The architecture intentionally delays automatic migration until evidence and authority paths are independently mature.

## 28. Extended product interpretation

The user/operator should eventually be able to inspect one cognitive dependency and answer:

- Is it available now, and how do we know?
- Who observed it and when does that evidence expire?
- Is the observation merely declared, signed, locally verified, or corroborated?
- Is a candidate a descendant, provider successor, replacement, or unrelated model?
- Which capabilities and characteristic behaviors have actually been tested for fidelity?
- What is degraded or still unknown?
- Is recovery possible without substitution?
- If substitution is needed, what candidate evidence exists?
- What remains provider-dependent versus owner-controlled?
- What authority would still be required before anything actually changes?

The extension adds a second product principle to section 16:

> **AXIOM should make cognitive dependency loss and recovery legible before making recovery automatic.**

## 29. Observability/recovery non-claims

The approved extension does not claim to provide:

- live provider reachability until a separately authorized observer exists;
- actual network probing;
- model invocation or runtime loading;
- automatic provider/model selection;
- topology mutation;
- persistence synchronization/export/restore;
- weight acquisition/download;
- training, fine-tuning, distillation, or adaptation;
- benchmark immunity to gaming;
- perfect behavioral equivalence;
- AXIOM principal continuity proof;
- Self Bundle lineage-continuity proof;
- subjective identity proof;
- transition authority;
- execution authority;
- production promotion.

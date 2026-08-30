# Cognitive Topology, Persistent Augmentation, and Identity Kernel — Design

**Status:** approved architectural extension; first executable slice remains inert and zero-authority

**Date:** 2026-08-29

**Scope:** persistent agent cognition, temporary and permanent model augmentation, provider-bound persistence, owner-controlled/open-weight acquisition, optional lightweight identity kernels, bounded self-adaptation, continuity and cognitive-fidelity reporting

**Builds on:**

- `docs/superpowers/specs/2026-08-29-sovereign-agent-composition-continuity-design.md`
- `docs/superpowers/specs/2026-08-29-self-bundle-continuity-v0-design.md`
- `docs/architecture/PERSONAL-AGENT-PACK-V2-AND-COMPANION-CONTINUITY.md`
- `docs/architecture/contracts/personal-model-adaptation-authorization.v1.schema.json`
- `mesh/src/lib/agent-composition.mjs`
- `mesh/src/lib/self-bundle-index.mjs`
- `mesh/src/lib/continuity-report.mjs`

**Authority boundary:** `mesh/config/capabilities.json` remains authoritative. This design does not activate models, grant authority, expose credentials, execute adaptation, perform network effects, or claim subjective identity continuity.

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
6. **cognitive fidelity** — the currently available cognitive components still reproduce the capabilities and characteristic behavior the agent expects from itself.

A model can therefore be `critical` to cognitive fidelity without being the principal identity root.

A recovery may truthfully report:

> Principal and lineage continuity are intact, but cognitive fidelity is degraded because a previously primary provider/model is unavailable.

That is preferable to either claiming nothing changed or claiming the agent ceased to exist.

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

## 13. Cognitive Topology v0 executable boundary

The first executable slice is deliberately small.

It will provide:

- `COGNITIVE_TOPOLOGY_SCHEMA = 'axiom-cognitive-topology.v0'`;
- strict fail-closed validation;
- deterministic canonical digesting;
- a JSON Schema mirror;
- a pure resolver that binds topology to an exact Agent Composition and verifies every `model_id` exists;
- a deterministic dependency summary for inspection/testing.

It will not provide:

- model invocation;
- provider API calls;
- runtime loading;
- routing;
- persistence synchronization;
- weight acquisition/download;
- model adaptation/training;
- continuity-threshold decisions;
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
10. `authority_effect`, `network_effect`, and `runtime_activation` are exactly `none`, `none`, and `false`.
11. A topology digest is evidence of an exact declaration, not evidence that the declared model/persistence exists or is reachable.
12. A resolver summary is descriptive only and cannot alter composition, authority, capability, trust, or runtime state.

## 15. Future slices

After v0 is verified, separable future work may add:

- topology-aware continuity/fidelity reporting;
- explicit provider-persistence attestations;
- owner-controlled model acquisition manifests;
- model lineage/descendant artifacts;
- learned routing-policy artifacts;
- shadow/canary identity-kernel adaptation;
- provider retirement/migration drills;
- multi-persistence reconciliation reports;
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
- Which components affect identity continuity versus cognitive fidelity?
- What has changed through adaptation, and can it be rolled back?

The intended end state is **progressive cognitive sovereignty without forced architectural uniformity**.

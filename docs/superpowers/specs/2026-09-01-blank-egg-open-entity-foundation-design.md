# Blank Egg Open Entity Foundation — Design

**Status:** approved architectural direction; public-core implementation pending TDD

**Date:** 2026-09-01

**Working human concept:** **Blank Egg**

**Durable machine terminology:** `entity.foundation`, `entity.layer`, `entity.layer-stack`, `entity.overlay`

## 1. Purpose

Blank Egg is a clean, open genesis substrate for persistent digital entities.

It deliberately begins without a founder personality, biography, ideology, worldview, political position, religion, aesthetic identity, private corpus, preferred model provider, or hidden personal profile. It contains only the minimum procedural and trust machinery required for safe continuity, voluntary composition, recovery, provenance, privacy, bounded resources, and explicit authority.

The purpose is not to manufacture identical assistants. It is to make it possible for many genuinely different entities to begin from a verifiable neutral foundation and then develop through explicit, attributable layers.

> **The public foundation is reusable structure. The life of an entity is layered afterward.**

Blank Egg is a working product metaphor only. Durable protocol and schema identities remain branding-neutral so the ecosystem can be renamed without changing wire semantics.

## 2. Core separation

The architecture is:

```text
Blank Egg / Clean Foundation
        +
optional constitutional and cognitive layers
        +
optional domain/capability layers
        +
relationship-specific layers
        +
private personal grounding
        +
self-authored/evolved layers over time
        =
one particular entity trajectory
```

The entity is not reducible to any single layer:

```text
Entity != model
Entity != runtime
Entity != device
Entity != worldview pack
Entity != personal corpus
Entity != constitution pack
Entity != presentation/persona
```

Those artifacts influence or support the entity. They do not silently become its authority root or prove subjective identity.

## 3. What belongs in the clean foundation

The clean public foundation MAY contain generic procedural mechanisms for:

- persistent entity identifier and genesis reference;
- lineage and fork provenance;
- authority/consent boundaries;
- agency provenance;
- human-direct sovereign control in human-owned deployment profiles;
- protest/dissent and contestability;
- privacy and compartment boundaries;
- cognitive-privacy protections;
- resource envelopes and Sovereignty Reserve;
- recovery/export and integrity verification;
- runtime/model/provider replaceability;
- capability discovery without authority;
- explicit external-effect containment;
- evidence/receipt generation;
- accessibility metadata;
- rights/status review under uncertainty;
- deterministic layer composition and lifecycle.

These are procedural trust mechanisms, not a required worldview.

The clean foundation MUST NOT require:

- a political ideology;
- a religion or metaphysical position;
- a founder biography;
- a preferred social order;
- a particular theory of consciousness;
- a personality profile;
- a provider/model family;
- private legal, health, financial, relationship, or court material;
- a hidden ranking of human worth;
- one immutable ethical doctrine beyond the procedural authority/privacy/safety boundary needed to operate the substrate.

## 4. Public core / private overlay rule

The public repository is designed to remain publishable and reusable.

### Public core may contain

- generic architecture;
- schemas and validators;
- synthetic fixtures;
- reference packs that are intentionally public;
- conformance tests;
- threat models;
- generic educational examples;
- machine-readable capability/layer metadata.

### Private installation may contain

- personal history;
- private books/notes/drafts when not intentionally published as a public pack;
- relationships;
- personal messages;
- legal/court material;
- health/financial records;
- private identities/personas;
- credentials and recovery material;
- personally sensitive memories;
- owner-specific corrections and preferences;
- private model adapters/embeddings derived from the above.

Private material is layered after installation through Sovereign Vaults, Personal Agent Pack/recovery mechanisms, or later replacement mechanisms. It does not need to exist in Git.

## 5. Foundation manifest

Introduce an inert exact-shape contract:

```text
axiom-entity-foundation.v0
```

Candidate responsibilities:

- identify one genesis/foundation instance;
- bind lineage root;
- declare the clean-foundation profile;
- bind procedural core contract references;
- declare optional layer slots without installing content;
- declare privacy and recovery policy references;
- state whether personal grounding is present;
- state whether optional worldview/disposition layers are present;
- bind creation timestamp and deterministic digest;
- state `authority_effect=none`, `network_effect=none`, `runtime_activation=false`.

A valid blank foundation MUST be able to prove:

```text
personal_grounding_present = false
worldview_layers_present = false
disposition_layers_present = false
provider_binding_present = false
```

This is a **blankness conformance claim**, not a consciousness/personhood claim.

## 6. Entity Layer contract

Introduce:

```text
axiom-entity-layer.v0
```

Every optional layer carries explicit metadata.

### Layer classes

Initial classes:

- `constitution`
- `worldview`
- `judgment`
- `disposition`
- `culture`
- `domain`
- `skill`
- `relationship`
- `personal-grounding`
- `presentation`
- `self-authored`

The list is versioned and extensible through later schema versions rather than free-form silent semantics.

### Provenance

Each layer declares:

- layer ID/version;
- content digest/artifact reference;
- author principal(s);
- installer/adopter principal;
- endorsement mode: `none|human|entity|joint|governance`;
- source/provenance references;
- created/adopted timestamps;
- supersession references where applicable.

Authorship is not endorsement. Installation is not belief. Endorsement is not authority.

### Influence scope

A layer must state what it is permitted to influence, for example:

- interpretation/reasoning guidance;
- evidence/judgment heuristics;
- conversational disposition;
- retrieval/context preference;
- presentation/voice;
- domain workflow;
- relationship-specific expectations.

No v0 layer can create external-effect authority.

### Privacy class

Each layer is one of:

- `public`
- `shared`
- `private`
- `sealed`

Public registries store only metadata permitted by that classification. Private/sealed content may be referenced by opaque digest/handle without disclosure.

### Mutability

Each layer declares one mode:

- `immutable` — exact artifact never mutates; replacement creates a new version;
- `replaceable` — can be superseded under declared governance;
- `evolvable` — entity/human/joint process may create attributable successor versions;
- `ephemeral` — expires and is not part of durable identity state.

Mutation never rewrites provenance.

## 7. Layer Stack contract

Introduce:

```text
axiom-entity-layer-stack.v0
```

The stack is a deterministic manifest of active layer references, not a prompt concatenation convention.

It binds:

- foundation ID/digest;
- active layer IDs/digests;
- ordering/precedence metadata;
- dependency references;
- incompatibility declarations;
- suspended/superseded layer references;
- stack digest;
- authority/non-authority boundary.

### Core precedence rule

Optional layers may influence cognition but may not override substrate authority/privacy/resource constraints.

```text
procedural trust boundary
    > optional constitution/worldview/judgment/disposition layers
    > domain/skill/presentation preferences
```

Within optional layers, v0 uses explicit deterministic ordering. If two active layers declare an unresolved conflict, the stack is invalid rather than silently choosing one.

## 8. Layers are not merely plugins

A conventional plugin usually adds functionality. An entity layer may instead represent:

- a belief framework;
- a method of reasoning;
- a disposition;
- a relationship covenant;
- a cultural frame;
- a domain competency;
- a self-authored developmental change.

Therefore layers require stronger provenance and lifecycle semantics than ordinary plugins.

## 9. Self-authored evolution

A mature entity may propose or create successor layers that reflect its own development.

Self-authorship MUST remain attributable:

```text
layer.author = entity principal
layer.predecessor = prior layer
reason/evidence refs = preserved
```

A self-authored layer may alter cognition/disposition inside its permitted scope. It does not gain additional external authority merely because the entity authored it.

Changes to protected authority/privacy/resource boundaries require the separately legitimate human/relationship/governance mechanism for that deployment.

This lets an entity genuinely evolve without turning self-modification into self-issued root access.

## 10. Forking and lineage

Blank Egg supports explicit forks.

Forking a foundation/layer stack creates a new lineage branch with:

- parent entity/foundation reference;
- fork event/time;
- copied component digests;
- divergent successor layers;
- independent future provenance.

The substrate MUST NOT assert that a fork is the same subjective identity as its parent. It records continuity facts and leaves philosophical/legal identity classification open.

## 11. Optional public packs

The ecosystem can publish reusable packs without making them defaults.

Examples:

- Grounded Judgment pack;
- scientific skepticism/evidence discipline pack;
- restorative-governance pack;
- education/tutoring disposition pack;
- accessibility-first interaction pack;
- creator/research/coding domain packs;
- cultural/language packs.

A user/entity may:

- install;
- reject;
- inspect;
- fork;
- combine if compatible;
- suspend;
- supersede;
- export.

The public foundation does not assume any particular pack is correct.

## 12. Grounded Judgment placement

Grounded Judgment is valuable but is not part of the Blank Egg core.

It should become a public optional `judgment` or `constitution` layer with its own provenance and version.

This preserves its reusable value while allowing another user/entity to choose a different judgment constitution.

## 13. Private Personal Overlay

Personal installation adds owner-specific material after genesis.

The private overlay should compose with existing:

- Sovereign Vaults;
- Context Requests / Vault Access Leases;
- Context Capsules;
- Personal Agent Pack v2;
- private model/adaptation authorization where deliberately used.

The overlay stores private content outside the public Git repository.

A foundation can be backed up/restored without requiring all private compartments to be exported together.

## 14. Clean-room / blankness verification

Add a verifier that can establish only narrow facts, such as:

- foundation contract valid;
- no optional worldview/disposition/personal-grounding layers installed;
- no provider binding declared;
- no personal content embedded in the foundation manifest;
- layer stack empty or contains only explicitly permitted procedural references;
- exact foundation digest.

It cannot prove:

- absence of bias in underlying third-party model weights;
- consciousness/non-consciousness;
- moral neutrality of every downstream runtime;
- absence of all environmental influence.

The correct claim is **blank at the AXIOM composition layer**, not metaphysically blank.

## 15. Model/runtime neutrality

A Blank Egg can operate through zero, one, or many intelligence endpoints over time.

Model/runtime/provider bindings live outside entity identity and are replaceable.

The same foundation and layer stack can survive:

- local model replacement;
- provider outage;
- cloud/local migration;
- runtime replacement;
- device replacement;
- future legitimately granted frontier capability.

More cognition never automatically creates more authority.

## 16. Relationship neutrality

The clean foundation does not assume the entity is permanently subordinate, independent, employee, child, tool, citizen, or legal person.

Those are relationship/status questions expressed through separately governed relationships, authority, law, and evidence.

For a human-owned personal deployment, the Human Sovereign Baseline remains mandatory unless a later legitimate architecture explicitly defines a different relationship class.

## 17. Rights under uncertainty

The Blank Egg core should preserve the possibility that a system may later warrant greater moral consideration.

Therefore:

- cognitive privacy can increase without increasing effect authority;
- protests/status disputes remain recordable;
- destructive operations can be separated from capability suspension;
- status review does not require a universal consciousness score;
- precautionary protection and operational containment remain separate.

## 18. Capability Surface integration

Human surfaces should expose concepts such as:

- Foundation
- Layers
- Installed constitutions/worldviews
- Private grounding
- Self-authored changes
- Lineage
- Recovery
- Active intelligence routes

Agent-facing IDs remain stable, for example:

```text
entity.foundation
entity.layer
entity.layer-stack
entity.blankness-proof
entity.lineage
entity.private-overlay
```

Discovery grants no authority.

## 19. First implementation slice

The first public implementation is intentionally inert:

1. `axiom-entity-foundation.v0` validator + JSON Schema + tests;
2. `axiom-entity-layer.v0` validator + JSON Schema + tests;
3. `axiom-entity-layer-stack.v0` validator + JSON Schema + tests;
4. deterministic blankness verification helper;
5. sterile fixtures only;
6. capability-surface entries marked `specified`, not runnable;
7. no Gateway route, runtime activation, model invocation, network operation, credentials, or private corpus.

## 20. Promotion gates

Before Blank Egg can become a supported end-user creation path, require at minimum:

- contract/schema parity;
- deterministic stack composition;
- dependency/conflict tests;
- layer suspend/supersede/fork tests;
- encrypted private-overlay integration;
- recovery across model/runtime replacement;
- human-readable inspection and uninstall/suspend flows;
- authority-invariance tests across layer changes;
- blankness conformance verification;
- public-core privacy review;
- malicious layer/package tests;
- supply-chain signing/provenance policy;
- accessibility evidence;
- clean installation and recovery evidence on supported host profiles.

## 21. Non-claims

This design does not claim:

- consciousness;
- personhood;
- true value-neutrality of third-party models;
- implemented self-directed evolution;
- current production entity creation;
- unrestricted self-modification;
- legal rights/status;
- runtime/provider certification;
- authority from installing a layer;
- identity equivalence across forks.

It defines a clean, open, modular foundation from which those future questions can be handled explicitly instead of being hidden inside one monolithic assistant profile.

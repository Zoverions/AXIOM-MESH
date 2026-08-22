# Sovereign Vaults and Local Context Broker

**Status:** normative draft architecture; no runtime or production-promotion claim

**Specification version:** `1.0.0-draft.1`

**Created:** 2026-08-22

**Applies to:** AXIOM One, the Personal Agent Pack, personal memory, identity data,
health and education data, private companion state, agent-runtime capsules,
model routing, external agents, selective disclosure, backup, recovery, and
future domain applications.

## Purpose

AXIOM-MESH needs a way for a person to be deeply known by their own private
system without making every application, model, provider, or agent equally able
to know them.

The architecture is therefore **compartment-first**:

1. private information is separated into independently governed **Sovereign
   Vaults**;
2. a deterministic **Vault Gatekeeper** controls access and key use;
3. an owner-local **Personal Context Broker** may reason across authorized vault
   material when the task actually requires it;
4. a **Disclosure Compiler** reduces that local result to the minimum useful
   external representation; and
5. an external model, agent, service, circle, or institution receives a
   short-lived **Context Capsule**, not a vault mount or ambient personal
   profile.

The intent is not to hide useful context from the owner's own companion. The
intent is to let the owner have **more** useful private context while disclosing
**less** of it to everyone else.

## Relationship to the existing architecture

This specification extends, rather than replaces, the existing Personal Compute
Fabric and Local Trust Plane.

The current architecture already establishes that:

- AXIOM One is the planned private personal agent, Vault, approval centre, and
  evidence record;
- the Personal Agent Pack is the portable continuity asset;
- personal memory remains separate from base-model weights by default;
- agent-runtime capsules are replaceable and untrusted;
- placement applies privacy and policy before optimization; and
- privileged or externally visible effects still pass through Gateway,
  Hypervisor, Sandbox, and Grid.

Sovereign Vaults define the missing internal data architecture between the
Personal Agent Pack, AXIOM One, and outside agents.

## Core architecture

```text
                          OWNER
                            |
                    AXIOM One / companion
                            |
                 +----------+-----------+
                 |                      |
        Personal Context Broker   Local Trust Plane
        (reasoning requester)     (deterministic authority)
                 |                      |
                 |              Vault Gatekeeper
                 |                      |
        short-lived local leases        |
                 |                      |
       +---------+---------+------------+---------+
       |         |         |            |         |
   identity   health   education     finance   memory ...
    vault      vault      vault        vault     vault
       \         |         |            /         /
        \--------+---------+-----------+---------/
                         |
              local cross-vault synthesis
                         |
                Disclosure Compiler
                         |
                Context Capsule v1
                         |
           Gateway / Hypervisor authority path
                         |
              outside agent / model / app
```

The Personal Context Broker is deliberately **not** the root of trust. It can
reason, select candidate facts, explain why context may matter, and request
access. It cannot mint its own access, unwrap arbitrary vault keys, widen a
purpose, approve an external effect, or bypass the kernel.

The Vault Gatekeeper and policy path remain deterministic. A local generative
model may be highly privileged as a requester while remaining non-authoritative
as an access controller.

## Sovereign Vault

A Sovereign Vault is an independently governed compartment of owner data. A
vault is not merely a folder or database table. It has its own:

- owner/subject binding;
- encryption/key domain;
- data-purpose boundary;
- sensitivity ceiling;
- access policy;
- local-companion access policy;
- export/disclosure policy;
- retention and deletion policy;
- backup/recovery policy;
- provenance and correction history; and
- access/use receipts.

A vault should be independently lockable, exportable, recoverable, and
revocable where the underlying data permits it. Compromise of one vault should
not automatically disclose another.

### Example vault domains

Vault domains are extensible and owner-defined. Common first-party domains may
include:

- identity and credentials;
- health and clinical information;
- education and learning insight;
- finance and payment context;
- legal records;
- work and professional context;
- relationships and family context;
- communications;
- location, home, and device context;
- creative work and private drafts;
- preferences and accessibility;
- autobiographical/episodic memory;
- secrets and recovery material; and
- custom user-defined compartments.

These names are not permissions. An agent does not gain `health` access because
it calls itself a health agent, and a teacher does not gain `education` access
because it has a teacher role label.

## Vault hierarchy and separation

Vaults may contain sub-vaults, but parenthood does not imply ambient read
access. For example:

```text
health
  / clinical-records
  / medication-and-treatment
  / fitness-and-wellbeing
  / accommodation-context

identity
  / public-profile
  / government-identity
  / payment-identity
  / recovery-identifiers

memory
  / episodic
  / relationships
  / preferences
  / corrections
```

A child vault may use a separate key domain, stricter policy, or different
backup destination. Cross-vault indexes should contain opaque references and
minimal metadata rather than copied plaintext.

## The local companion as high-context reasoner

The owner may choose to give their local companion substantially broader access
than any outside agent. That is a feature, not a policy failure.

However, broad local usefulness SHALL be implemented as **authorized local
leases**, not as an unrestricted permanent root key embedded in the model.

A local-companion lease should bind at minimum:

- owner subject;
- companion principal/runtime identity;
- exact vault or vault-set scope;
- allowed read/derive/write-request operations;
- purpose;
- maximum sensitivity;
- issue and expiry time;
- whether cross-vault synthesis is allowed;
- whether raw content may enter model context;
- whether the result may be persisted;
- whether external disclosure may be proposed; and
- receipt obligations.

The owner may define a high-context local mode in which the companion can
request multiple vaults during one session. That mode still does not allow the
companion to export raw vault material or execute external effects without the
normal authority path.

## Cross-vault synthesis

Many of the most valuable insights require multiple compartments. Examples:

- scheduling that considers work, family, health, and travel constraints;
- education support that considers accessibility and learner preferences;
- a personal financial plan that knows household goals without disclosing
  medical or relationship records to a finance provider;
- a travel agent that needs mobility accommodations but not the underlying
  diagnosis;
- a personal companion that can explain long-term patterns across journals,
  projects, communications, and self-reflection.

Cross-vault synthesis SHALL occur locally by default.

A cross-vault join does not create a new globally readable profile. If a derived
insight is persisted, it becomes a new governed object with:

- provenance references to its source material;
- a sensitivity classification no weaker than policy permits for the sources;
- explicit derivation type and confidence where applicable;
- a review/expiry rule; and
- its own correction and revocation history.

The source records remain independently visible. A correction does not silently
rewrite history.

## Context minimization and disclosure compilation

External agents should normally ask for **what they need to accomplish a task**,
not for a named vault.

Bad request:

> Give this travel agent my health vault.

Preferred request:

> For the purpose of selecting accessible lodging for this trip, disclose only
> the mobility and accommodation constraints necessary to filter suitable
> rooms, with no diagnosis, clinician name, unrelated health history, or onward
> sharing.

The Personal Context Broker may reason about which local records are relevant.
The Disclosure Compiler then applies deterministic policy and produces the
smallest allowed Context Capsule.

The compiler may:

- omit unrelated fields;
- transform a raw fact into a less revealing constraint;
- aggregate several records into one bounded statement;
- replace exact values with ranges or predicates where sufficient;
- exclude source identifiers that would reveal sensitive categories;
- attach confidence/limitation metadata for derived claims;
- set retention and expiry bounds; and
- require fresh owner confirmation for high-risk disclosure.

The compiler may not invent permission merely because a disclosure would be
useful.

## Context Capsule

A Context Capsule is a purpose-bound, recipient-bound, expiring disclosure
artifact. It is **not** a portable copy of a vault.

A capsule should bind:

- owner subject;
- requesting and recipient principal/destination;
- purpose and task class;
- issued and expiry times;
- exact disclosed claims/fields;
- disclosure/derivation type;
- sensitivity class;
- confidence and limitations where relevant;
- retention ceiling;
- onward-disclosure rule;
- local provenance/access receipt references;
- policy decision/grant references; and
- digest/signature information where applicable.

A recipient receives no capability to resolve the capsule's internal provenance
references back into vault content unless a separate authorization explicitly
permits that operation.

A Context Capsule:

- grants no vault access;
- grants no execution authority;
- grants no permission to infer unrelated sensitive traits;
- is not automatically reusable for a different purpose;
- is not automatically shareable onward; and
- expires independently of the underlying source data.

## Outside-agent interaction pattern

```text
external agent
    |
    | request: task + needed fact types + purpose
    v
Gateway / Hypervisor
    |
    v
owner-local context request
    |
    v
Vault Gatekeeper -> authorized local lease(s)
    |
    v
Personal Context Broker
    |
    | candidate relevant facts / derived answer
    v
Disclosure Compiler + policy
    |
    v
Context Capsule
    |
    v
external agent
```

The outside agent does not mount, browse, search, enumerate, or query the vault
directly. It cannot discover other vaults from a capsule.

Where a task can be completed entirely locally, no capsule needs to leave the
owner's trust boundary.

## Personal companion continuity

The most private and useful companion should be recoverable even if a model
provider disappears or the owner changes hardware.

Companion continuity should therefore be decomposed into replaceable layers:

1. **base model** — replaceable model weights/runtime;
2. **Agent Runtime Capsule** — orchestration behavior;
3. **owner vaults** — revocable durable personal facts and memory;
4. **correction/evaluation ledger** — how the companion has been corrected and
   what works for the owner;
5. **preferences/policy** — interaction, privacy, routing, accessibility, and
   authority choices;
6. **optional personal adapter** — LoRA or equivalent adaptation artifact;
7. **voice/avatar/persona configuration** — presentation state; and
8. **recovery manifest** — encrypted references, digests, licences, and restore
   instructions.

The Personal Agent Pack remains the portable manifest that binds these pieces.
A future v2 may reference Sovereign Vault manifests explicitly rather than
flattening personal memory into one component role.

## Training or adapting a model on the owner

A user may deliberately choose a locally trained or adapted companion. AXIOM
should support that possibility without pretending it has the same deletion and
revocation properties as external memory.

The default remains:

> **Keep revocable personal memory outside model weights.**

If personal information is used to create a model adapter or derived model
artifact, the training/adaptation action requires an explicit contract covering:

- exact source vaults/records or approved source classes;
- purpose;
- local versus remote training destination;
- retention of training inputs;
- output artifact ownership;
- licence constraints;
- evaluation;
- known memorization/privacy limitations;
- deletion/retraining implications when source records are revoked; and
- whether the artifact may ever execute outside owner-controlled compute.

A sealed personal adapter may be stored in a high-sensitivity companion vault
and backed up independently. Its weights are an artifact, not verified identity
or authorization.

## Companion Core Vault

A useful implementation may reserve a **Companion Core Vault** for the private
agent's own continuity artifacts, such as:

- correction history;
- stable interaction preferences;
- evaluation baselines;
- approved persona/voice state;
- owner-approved personal adapter references;
- semantic indexes that do not contain plaintext from other vaults;
- references to episodic memory records;
- runtime/capsule preferences; and
- recovery metadata.

The Companion Core Vault should not become a secret plaintext mirror of all
other vaults. References and derived summaries remain governed, attributable,
and revocable.

## Backup and recovery

Vault recovery should preserve compartmentalization.

Requirements include:

- each vault may have its own backup destination and schedule;
- backup objects remain encrypted and integrity-addressed;
- a backup manifest does not contain plaintext secrets or raw key material;
- recovering one vault need not unlock every other vault;
- recovery of the Personal Agent Pack does not by itself grant access to every
  referenced vault;
- high-sensitivity vault recovery may require stronger owner-presence or
  recovery policy;
- restored data preserves provenance, correction history, tombstones, and
  receipts where applicable; and
- lost or revoked vault keys are not silently recreated from another vault.

The system should support both full-device recovery and selective restoration
of individual vaults.

## Access and use receipts

Sensitive vault operations should produce owner-readable evidence answering:

- who requested access;
- which vault/object class was involved;
- why it was requested;
- what operation occurred;
- whether raw content entered model context;
- whether cross-vault synthesis occurred;
- whether anything left the owner-local boundary;
- which capsule, if any, was disclosed;
- recipient/destination;
- retention and expiry;
- which policy/grant authorized the operation; and
- outcome, denial, cancellation, or uncertainty.

Operational telemetry should record identifiers, digests, timings, and outcomes
without copying raw private content.

## Sensitivity and inference

Vaults can contain ordinary preferences, sensitive education context,
psychological insight, clinical data, financial information, credentials, and
other high-value private material.

Sensitive inference is allowed when the owner authorizes it and the result is
useful, but derived claims must preserve provenance and uncertainty. A model
hypothesis does not silently become a diagnosis, legal fact, credential,
financial authorization, educational mastery result, or public identity claim.

A derived claim may itself belong in a high-sensitivity vault even if it was not
explicitly stated by the owner.

## Domain applications

Domain products should implement vault types rather than create independent
privacy architectures.

Examples:

- **Axiom Education** — Personal Insight Vault, learner evidence, accessibility,
  educational preferences;
- **health application** — clinical records, accommodation context, wellness
  signals;
- **finance application** — budgets, accounts, goals, transaction context;
- **legal application** — privileged records and evidence bundles;
- **social/circles** — relationship context and selectively disclosed identity;
- **work agent** — projects, employer information, professional preferences.

A domain vault may be stricter than the generic contract. It may not weaken the
Mesh-level non-bypassable authority and disclosure rules.

## Threat model additions

The architecture specifically guards against:

### Compromised external agent

An external agent receives only a capsule and cannot enumerate vaults or replay
expired context as new authority.

### Compromised local companion model

The local model does not hold permanent root keys. Access leases expire, raw
export is separately controlled, and external effects still require the kernel.

### Prompt injection through retrieved private content

Vault content is data, not authority. Retrieved text cannot widen the lease,
change destination, authorize egress, or mint a grant.

### Cross-vault correlation creep

The broker may join authorized context locally, but persistent derived profiles
require their own governed objects. Operational indexes do not become plaintext
shadow profiles.

### Provider retention drift

A capsule binds retention policy; routing excludes destinations that cannot meet
it. A fallback may not silently cross an egress or retention boundary.

### Backup compromise

Backups remain encrypted, compartmentalized, and integrity-addressed. Backup
metadata does not contain raw secrets or universal unlock material.

### Personal-model memorization

Training/adaptation is separately authorized because revoking a source record
may not remove memorized information from model weights. The system records this
limitation rather than pretending otherwise.

## Non-bypassable invariants

1. Vault content is data, not authority.
2. A generative model is never the vault access authority.
3. Local companion privilege is lease-bound and purpose-bound.
4. External agents receive capsules, not vault mounts, by default.
5. Cross-vault synthesis is local by default.
6. A derived insight has its own provenance and sensitivity.
7. A Context Capsule grants neither vault access nor execution authority.
8. Capsule expiry does not delete source data; source revocation does not make a
   previously disclosed external copy magically disappear.
9. High-risk disclosure and all external effects remain subject to normal AXIOM
   policy, consent, approval, and receipt semantics.
10. Backup/recovery does not collapse separate key domains into one ambient
    credential.
11. Personal model/adaptor weights are artifacts, not verified identity or
    authority.
12. Domain applications may tighten, but not weaken, these boundaries.

## Versioned contract set

This draft introduces two documentation-only contracts:

- `contracts/sovereign-vault.v1.schema.json` — compartment manifest and policy
  boundary;
- `contracts/context-capsule.v1.schema.json` — minimized external context
  disclosure artifact.

They do not change the capability registry or current supported runtime.

The existing `personal-agent-pack.v1` remains unchanged. A future v2 should
explicitly reference vault manifests and companion continuity artifacts rather
than silently changing v1.

## Phased implementation

### Phase 0 — contract and adversarial design

- validate schemas and canonical docs;
- define example vaults and disclosure capsules using synthetic data;
- test direct-vault-access denial, cross-vault leakage, replay, stale capsules,
  prompt-injection content, wrong-recipient capsules, and over-broad requests;
- define owner-readable receipt language.

### Phase 1 — owner-local vault gatekeeper laboratory

- encrypted isolated local compartments;
- key-domain separation;
- exact read/derive lease evaluation;
- no external agent access;
- synthetic and owner-controlled test data only.

### Phase 2 — local companion broker laboratory

- one local/private model or deterministic test broker;
- bounded multi-vault retrieval;
- local synthesis;
- no external disclosure until disclosure compilation is separately proven.

### Phase 3 — disclosure compiler and Context Capsule

- minimum-necessary transformation;
- recipient/purpose/expiry/retention binding;
- owner preview and approval where required;
- receipt chain;
- synthetic external agent tests.

### Phase 4 — domain integration

- Education Personal Insight Vault as an early domain mapping;
- accessibility and personal preference vaults;
- additional domains only after their own privacy/authority review.

### Phase 5 — companion continuity and recovery

- Personal Agent Pack v2 design;
- selective vault backup/restore;
- optional sealed personal adapter handling;
- migration across local models and devices.

## Promotion gates and current non-claims

This document does **not** claim that AXIOM-MESH currently implements:

- isolated Sovereign Vault runtime containers;
- a Vault Gatekeeper;
- a cross-vault Personal Context Broker;
- Context Capsule generation or signing;
- private local inference over vaults;
- personal-model training;
- vault-key hardware custody;
- selective vault recovery; or
- regulated health/finance/legal compliance.

Before any such capability is exposed or marketed, the exact implementation
must satisfy the current kernel's capability acceptance, security, recovery,
privacy, evidence, human-use, and independent-review requirements.

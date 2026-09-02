# Dual-Surface Capability Completeness — Design

**Status:** architectural refinement; implementation pending registry/schema/tests

**Date:** 2026-08-31

## Purpose

AXIOM-MESH increasingly contains strong machine-facing primitives whose human product surfaces lag behind, while planned human products such as Studio, Verify, Circles, deployment tooling, and future entity/relationship/resource functions do not yet all have first-class canonical machine capability identities.

This design establishes a permanent completeness rule:

> **Every durable capability must be understandable to humans and addressable by machines without coupling protocol semantics to mutable branding.**

A feature is not complete merely because code exists, a screen exists, or a design document exists. Human presentation, canonical machine identity, authority semantics, evidence, and non-claims must be independently named.

## 1. Dual-surface invariant

Each durable capability SHALL have two linked but independently versioned surfaces.

### Human surface

The human-facing representation SHOULD provide, where applicable:

- understandable name;
- plain-language purpose;
- lifecycle/maturity state;
- accessible control;
- data/resource consequences;
- stop/revoke/undo/exit/recovery path;
- evidence/explanation;
- protest/correction/appeal route.

### Machine surface

The agent-facing representation SHOULD provide:

- canonical capability ID;
- versioned schema/contract;
- exact read/action surfaces;
- principal/authority/effect semantics;
- data/destination/resource constraints;
- evidence/conformance bindings;
- explicit non-claims.

Discovery or presentation grants no authority.

## 2. Four-name model

Do not force one string to serve branding, human explanation, machine identity, and wire compatibility.

Example:

```text
Human product:        Studio
Human function:       Build and test systems
Machine family:       studio.composition
Schema identity:      axiom-studio-composition.v1
```

Human product naming may change without silently changing the machine meaning.

Existing durable `axiom-*` schema identifiers must not be cosmetically renamed. Any future naming migration requires explicit versioning, compatibility, provenance, and transition policy.

## 3. Working product-to-machine map

These are architectural roles, not mandatory final branding.

| Human role | Purpose | Machine family |
|---|---|---|
| One | human sovereign control | `ui.control.*` |
| Mesh | trust/effect substrate | `core.*`, `mesh.*` |
| Studio | composition/build/package | `studio.*` |
| Lab | simulation/adversarial evaluation | `lab.*` |
| Verify | independent verification | `verification.*` |
| Circles | voluntary collective coordination | `circles.*` |
| Governance | governance-domain composition | `governance.*` |
| Education | learning/competency domain | `education.*` / domain adapters |
| Identity | identity/portable credentials | `identity.*` |
| Vault | private governed state | `vault.*` / mapped memory/storage capabilities |
| Entity | persistent digital-entity continuity | `entity.*` |
| Relationship | shared relational state/deliberation | `relationship.*` |
| Compute Fabric | policy-first compute placement | `compute.*` |
| Runtime/Connector Fabric | replaceable cognition/tool coordination | `runtime.*`, `connector.*` |
| Link/Endpoint | constrained personal device interface | `device.*` |
| Relay/Exchange | bounded transport/synchronization | `transport.*`, `sync.*` |
| Recovery | backup/restore/continuity | `recovery.*`, `portability.*` |
| Commons/Catalog | shared discovery/curation resources | `commons.*`, `catalog.*` |

## 4. First-class capability families to add or refine

The following emerging families should become explicit as their implementations advance. IDs below are design candidates, not runnable claims.

### Agency provenance

```text
agency.provenance
agency.intent
agency.cognition
agency.decision
agency.authorization
agency.execution
agency.attribution
```

Candidate schema: `axiom-agency-provenance.v1`.

### Protest and informed deliberation

```text
relationship.protest
relationship.dissent
relationship.objection
deliberation.session
deliberation.position
deliberation.evidence
deliberation.competence
deliberation.standing
deliberation.reconsideration
```

Competence, affected-party standing, authority, popularity, confidence, and trust must not collapse into one score.

### Human sovereign baseline

```text
sovereignty.human-direct
sovereignty.control-reserve
sovereignty.counterpart-optional
```

This is primarily a conformance/profile requirement: direct human stop, revoke, inspect, recover, export, and core operation must not depend on an optional autonomous entity.

### Resource governance

```text
resource.profile
resource.envelope
resource.observation
resource.reservation
resource.pressure
resource.sovereignty-reserve
resource.usage-receipt
```

Models may request resources but cannot widen their own hard limits or human-control reserve.

### Persistent entity continuity

```text
entity.identity
entity.genesis
entity.lineage
entity.self-bundle
entity.continuity
entity.recovery
entity.runtime-binding
entity.runtime-replacement
```

Entity continuity does not imply personhood, authority, consciousness, or external identity verification.

### Triggered/dormant work

```text
trigger.rule
trigger.condition
trigger.event
obligation.dormant
obligation.activation
```

This enables long-term commitments without continuous inference.

### Dynamic embodiment

```text
device.identity
device.capability
device.presence
device.observation
device.interface
embodiment.state
embodiment.capability-map
```

A device signal is evidence/input, not automatic authorization.

### Deployment profiles

```text
host.profile
host.suitability
deployment.profile
deployment.bundle
deployment.install-plan
deployment.rollback-plan
deployment.recovery-plan
```

Studio outputs inert artifacts/manifests. Installation remains separately governed.

### Studio modules

```text
studio.deployment
studio.entity
studio.circle
studio.governance
studio.institution
studio.network
```

Studio design/configuration grants no execution authority.

### Lab modules

```text
lab.experiment
lab.scenario
lab.participant-model
lab.perturbation
lab.attack
lab.measurement
lab.result
lab.reproduction
```

A Lab result is evidence, not promotion.

### Capability-aware human interfaces

```text
ui.capability-manifest
ui.action-explanation
ui.risk-presentation
ui.approval-presentation
ui.provenance-presentation
```

A human UI should discover the current safely exposed capability surface without hard-coding an older generation of the kernel.

## 5. Capability Surface Registry

AXIOM should add a machine-readable **Capability Surface Registry** linked to the executable capability registry.

The executable registry answers:

> What is implemented/runnable and with what evidence?

The surface registry answers:

> How is that capability presented to humans and addressed by machines?

Preferred separation:

```text
Executable Capability Registry
             |
             | capability_id
             v
Capability Surface Registry
       /                 \
human presentation     machine contract map
```

Candidate schema: `axiom-capability-surfaces.v1`.

A surface entry may include:

- canonical capability ID;
- lifecycle state;
- human product/section/label/plain-language description;
- machine schema IDs;
- read/action surfaces;
- consequence/effect class;
- authority boundary;
- resource/data/disclosure expectations;
- evidence profile;
- explicit non-claims.

Do not overload `mesh/config/capabilities.json` until implementation work determines whether the two registries should remain linked or converge under a versioned replacement.

## 6. Completeness gate

A major capability is incomplete until the project can answer all applicable questions.

### Human

- What is it called?
- Why would someone use it?
- What can and cannot it do?
- What data/resources can it consume?
- How can it be stopped, revoked, undone, exited, or recovered?
- Where is its evidence?
- How can an affected participant protest, correct, or appeal?

### Machine

- What is its canonical capability ID?
- Which schema/version defines it?
- How is it discovered?
- Which reads/actions exist?
- Which principals may request it?
- What are the data/resource/destination/effect constraints?
- What evidence does it produce?
- What fails closed?
- What does installation/discovery NOT authorize?

### Project lifecycle

- conceptual?
- specified?
- implemented?
- tested?
- enabled?
- exposed?
- pilot-proven?
- production-promoted?
- marketed?

The status must not be inferred from another state.

## 7. Human/agent symmetry without false equivalence

Human-facing and agent-facing surfaces should be semantically aligned but purpose-built for their consumers.

A person may receive a plain-language confirmation while a machine receives an exact structured constraint object. This does not imply humans and digital agents have identical authority, standing, or rights.

## 8. Naming doctrine

When a missing concept is discovered:

1. describe the capability neutrally;
2. classify it as substrate, domain, interface, tooling, or evidence;
3. assign a stable machine family/ID;
4. define authority and non-authority semantics;
5. define versioned contract(s);
6. give the human surface an understandable working name;
7. keep branding out of durable semantics where possible;
8. add lifecycle/evidence bindings;
9. add human and machine discovery;
10. add the capability to the completeness matrix.

Do not delay a necessary capability because final branding is unresolved.
Do not freeze a protocol around a provisional marketing name.

## 9. Public machine readability

For mature public capabilities, prefer discoverable human- and machine-readable publication through stable documentation, schemas, examples, negative examples, conformance tests, explicit non-claims, and independently consumable verification.

A future well-known capability index may be useful, but AXIOM should use established discovery mechanisms where they meet the requirement rather than inventing a new wire protocol merely for branding or novelty.

## 10. Core conclusion

AXIOM should increasingly guarantee that every important capability has:

- a place humans can understand and control it;
- a name agents can reliably address;
- a contract developers can implement;
- evidence verifiers can check;
- a lifecycle the project can honestly describe.

That is the **dual-surface capability completeness standard**.
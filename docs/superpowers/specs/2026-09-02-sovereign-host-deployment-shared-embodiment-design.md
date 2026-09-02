# Sovereign Host, Deployment, Shared Resources, and Distributed Embodiment — Programme Design

**Status:** approved architectural consolidation; documentation-only; no capability promotion

**Date:** 2026-09-02

**Builds on:**

- `docs/superpowers/specs/2026-08-31-selective-interposition-native-reference-agent-design.md`
- `docs/rebuild/ADAPTIVE-ASSURANCE-AND-PLURAL-AUTHORITY.md`
- `docs/ROADMAP-EXTENSION-PLURAL-AUTHORITY.md`
- `docs/MASTER-TODO-PLURAL-AUTHORITY.md`
- `apps/axiom-one/`
- current Gateway → Hypervisor → Sandbox → Grid authority path

**Authority boundary:** this design does not activate new runtime authority, external providers, remote execution, ambient sensing, biometric authentication, shared-device authority, cloud egress, public federation, installer privilege, or production deployment. `mesh/config/capabilities.json` remains authoritative for implemented capability status.

## 1. Core decision

AXIOM-MESH should support one logical personal or collective system across many physical devices without requiring one canonical hardware stack, one agent scaffold, one inference runtime, one model, one smart-home vendor, or one installation path.

The adopted model is:

> **One logical mind and trust domain may use many physical organs, while each organ remains a bounded capability provider rather than an authority root.**

The corresponding deployment rule is:

> **Describe desired outcomes and constraints, discover what already exists, install only the missing capabilities, and preserve the user's existing stack wherever it satisfies the required contracts.**

The human-facing system should remain simple by default and progressively disclose complexity only when needed.

## 2. Public substrate, private instantiation

Reusable entity/continuity mechanisms should be public architecture and public implementation candidates by default when they contain no owner-specific secrets or private state.

The public substrate may include:

- continuity and identity mechanics;
- signed event and provenance structures;
- compartment and policy schemas;
- delegation and context-capsule mechanisms;
- runtime/model/scaffold interfaces;
- deployment specifications and resolvers;
- capability adapters;
- synthetic tests and fixtures;
- recovery mechanics;
- shared-resource and embodiment interfaces.

A concrete personal entity instance remains private by construction. Private instantiation state includes:

- root and recovery keys;
- biometric templates;
- private memory and corpus material;
- relationship history and private relationship policy;
- personal credentials and authenticated sessions;
- private model adaptations or owner-specific fine-tunes;
- private world-model state;
- private device/location history;
- encrypted backups and recovery packages.

A public repository must not contain these merely because the substrate is public.

Required invariant:

> **Public substrate != public person.**

A public implementation may support the birth/instantiation of a private entity without containing that entity's private state.

## 3. Architectural layers

The programme is decomposed into seven cooperating layers.

### 3.1 Launchpad

A web-accessible universal entry point for people who do not yet have a functioning local control plane, or who need recovery/bootstrap assistance.

It can:

- explain available deployment modes;
- gather goals and constraints;
- perform browser-safe hardware discovery;
- launch an optional signed native bootstrapper for deeper inspection;
- create or import a deployment specification;
- prepare clean-install media;
- enroll a new device into an existing Mesh;
- initiate recovery of an existing Mesh.

The Launchpad is a convenience and planning surface, not a permanent sovereign authority.

### 3.2 Deployment & Capability Engine

The shared engine beneath both Launchpad and Axiom One.

It maintains:

- observed current state;
- desired state;
- capability graph;
- compatible providers/adapters;
- consequences and resource requirements;
- an executable change plan;
- verification and rollback information.

It must be usable through a human UI, machine API, local manifest, or offline installation path.

### 3.3 Sovereign host

A Linux-ecosystem host profile that can extend Mesh security, identity, consent, recovery, resource envelopes, and fail-safe behaviour toward the operating-system and boot layers.

The host is not required for every user. Existing operating systems remain valid deployment targets when they can provide the requested capability safely.

### 3.4 Axiom One

Axiom One is the persistent human sovereignty/control environment once a Mesh exists.

It is not duplicated as a second installer.

Axiom One invokes the same Deployment & Capability Engine to:

- add devices;
- add or remove capabilities;
- change node roles;
- integrate existing software;
- install model/runtime adapters;
- change resource contribution;
- configure shared domains;
- migrate or recover services;
- explain consequences before changes.

### 3.5 Runtime and cognition fabric

Models and inference engines remain replaceable cognitive resources.

A user may designate a stable preferred primary cognitive runtime for familiarity and continuity of interaction, while durable identity remains outside that model.

The system may support adapters for runtimes such as native `llama.cpp`, vLLM, MLX/MLX-LM, Ollama, external APIs, or future engines without making any one runtime mandatory.

### 3.6 Shared domains and multi-user resource governance

A physical device may support multiple sovereign people and multiple Meshes without merging their identities.

Household, family, team, classroom, lab, and small-business arrangements reuse the plural-authority/Circle substrate rather than inventing parallel account systems.

Shared domains may govern:

- compute;
- models;
- storage;
- backup;
- network capacity;
- household services;
- shared agents;
- delegated access to a personal agent's explicitly exposed relational surface.

Sharing infrastructure must not require sharing private identity or private memory.

### 3.7 Distributed embodiment

Embodiment is modeled as distributed presence, sensing, and agency rather than as one robot body.

Endpoints may include:

- phones;
- PCs;
- microphones and speakers;
- smart displays;
- watches;
- glasses;
- room satellites;
- cameras where permitted;
- vehicles;
- robots;
- Matter/Home Assistant/vendor-controlled smart-home devices through adapters.

The entity remains independent of any one embodiment endpoint.

## 4. DeploymentSpec

The Deployment & Capability Engine should converge on a versioned declarative `DeploymentSpec` rather than embedding one setup flow into one website.

The initial contract should express at least:

- desired device role or roles;
- observed hardware and operating-system facts;
- reserved user resource envelope;
- required capabilities;
- selected providers/adapters;
- model artifacts and exact revisions;
- storage allocation;
- networking posture;
- privacy and egress policy;
- local/shared-domain relationship;
- recovery policy;
- installation source and verification data;
- rollback expectations;
- unresolved choices that require explicit owner selection before execution.

The spec is declarative. It does not itself grant authority.

A deployment executor must separately establish the authority to perform each privileged change.

## 5. Capability-first installation

The resolver must ask whether a required capability is already satisfied before adding software.

Examples:

- existing compatible inference runtime → install only the Mesh adapter;
- existing scaffold → install only required continuity/authority/memory/tool adapters;
- existing Home Assistant installation → use a bridge rather than replacing it;
- infrastructure-only machine → install only the declared worker/provider role;
- existing Mesh member device → enroll and configure its selected contribution rather than creating a second identity.

Required invariant:

> **Existing compatible capability should be reused unless the user explicitly chooses replacement or the implementation cannot satisfy a required security/compatibility property.**

## 6. Human installation experience

The default Launchpad should expose a small set of goals rather than architecture terminology.

Initial choices should be equivalent to:

- start using the system;
- set up this device;
- prepare another computer;
- join an existing Mesh;
- recover an existing Mesh;
- advanced setup.

The system should not require every future decision during initial installation.

Initial setup installs only the viable core for the selected topology. Additional capabilities should appear contextually when the user's later intent requires them.

Example:

> The user asks to build document memory. The system determines that an embedding/index capability is missing, explains storage/privacy consequences, and offers one bounded enable action.

This progressive-capability model is preferred to a large first-run configuration questionnaire.

## 7. Native bootstrapper and clean installation

Browser APIs should not be treated as an unrestricted privileged installer.

The preferred privileged path is:

```text
Launchpad / Axiom One
  -> short-lived installation session
  -> signed native bootstrapper
  -> DeploymentSpec resolver/executor
  -> local privileged operation
  -> verification result
```

For a clean sovereign host, the bootstrapper may:

- identify the target USB/device;
- download the signed base image;
- download required packages and manifests;
- embed or attach the DeploymentSpec;
- optionally prefetch models for offline installation;
- verify digests/signatures;
- write installation media;
- verify the completed media.

Long-term identity and disk-encryption secrets should be generated on the destination machine or imported through an explicit recovery/enrollment flow, not minted by the public website.

## 8. Online and offline installation

The same DeploymentSpec must support both networked and offline installation.

### Networked

The installer can retrieve pinned models, packages, drivers, adapters, and documentation from approved sources after base installation.

### Offline

The preparation tool can construct a larger installation bundle containing every required artifact in advance.

Offline capability is a real operating mode, not merely an emergency documentation promise.

## 9. Model-source and runtime neutrality

AXIOM should maintain inference and model contracts rather than reimplementing every model-serving kernel.

A runtime adapter should expose capabilities such as:

- load/unload;
- generate/stream;
- structured output;
- tool-call transport where supported;
- embeddings where supported;
- multimodal inputs where supported;
- context and resource reporting;
- health/cancellation;
- exact model/runtime provenance.

Model manifests should pin publisher/source, exact revision, artifact hash, format, quantization, license metadata, declared capabilities, hardware expectations, and whether repository-supplied executable code is required.

Model download must not silently imply execution of untrusted repository code.

Inference servers remain behind authenticated Mesh transport/policy boundaries rather than becoming automatically trusted LAN services.

## 10. Stable primary cognition without identity capture

A personal entity may designate a `preferred_primary_cognition` policy containing:

- preferred model family and exact approved artifact;
- preferred runtime/provider;
- preferred node;
- fallback hierarchy;
- conditions for temporary cloud escalation;
- upgrade/evaluation policy.

This supports familiarity and consistent interaction while preserving:

`entity != scaffold != runtime != model != device`

A runtime/model change should be observable and evaluated rather than silently rewritten as identity continuity.

## 11. Device roles and resource envelopes

A device can advertise one or more bounded roles:

- full personal node;
- cognition provider;
- storage provider;
- backup provider;
- compute worker;
- agent execution worker;
- interface endpoint;
- network/relay provider;
- embodiment endpoint;
- infrastructure-only node.

Each contribution must be explicitly bounded by resource policy such as:

- CPU cores;
- GPU memory or utilization;
- RAM;
- storage;
- bandwidth;
- battery/charging state;
- power/thermal constraints;
- availability windows;
- permitted beneficiary domains.

Every personal device should preserve a sovereignty reserve for the owner's direct use.

Participation is opt-in and revocable.

## 12. Multi-user devices

The system must distinguish:

- physical device identity;
- operating-system session;
- human/agent principal;
- personal Mesh membership;
- shared-domain membership;
- resource ownership;
- resource-use delegation.

A shared device may provide compute or interfaces to several people without exposing one person's private state to another.

Joining a household/shared domain must not merge personal Meshes.

A person may also use a shared physical device temporarily while retaining their own Mesh identity.

## 13. Families, children, and shared agent relationships

Family use should be represented through shared-domain and relationship policy rather than as a special alternate authority system.

A parent may deliberately share with a child:

- compute;
- model access;
- storage quota;
- household services;
- selected family knowledge;
- access to a bounded relational surface of the parent's persistent agent.

Access to a parent's agent does not imply access to the parent's private corpus or full authority.

Agent relationship policy should separate at least:

- disclosure authority;
- action authority;
- resource authority;
- representation authority;
- memory/retention policy.

Dependent/guardian relationships require explicit scoped semantics and must not be treated as equivalent to voluntary peer membership.

## 14. Local presence broker

Fast identity switching should not require conventional log-out/log-in ceremony for every low-consequence interaction.

A future local presence component may combine signals such as:

- speaker recognition;
- face recognition where explicitly enabled;
- trusted phone/watch proximity;
- current OS session;
- local interaction signals.

It returns a principal hypothesis and assurance/confidence evidence rather than exposing raw biometric material to every application.

Required distinctions:

> **recognition != authentication**

> **identity confidence != effect authority**

Low-consequence conversational attribution may use ambient recognition. High-consequence effects must require the assurance/authentication level dictated by policy.

Raw audio/video should be transient by default and locally processed where practical. Biometric templates are private instantiation state and must not be part of the public substrate repository or ordinary shared-domain data.

## 15. Multi-person rooms and audience-aware privacy

The presence layer must distinguish the speaker from the audience.

A shared-room speaker may know that one principal is talking while other principals are present.

Agents and applications should be able to route sensitive output to a private endpoint, for example a phone or headset, rather than speaking it aloud.

This creates a general `private_channel` capability independent of any one device vendor.

## 16. Embodiment interface

The distributed embodiment layer should define capability families rather than device brands.

Candidate families include:

- `audio.input`;
- `audio.output`;
- `vision.input`;
- `display.output`;
- `presence.observe`;
- `principal.estimate`;
- `private_channel`;
- `sensor.read`;
- `physical.action`.

Each endpoint advertises capabilities and constraints. The agent should not need to know whether output is delivered through a phone, room satellite, smart speaker adapter, television, or future robot unless device-specific semantics matter.

Existing Google/Amazon/Apple/Home Assistant/Matter ecosystems may be integrated through bounded adapters where their APIs permit it. Vendor hardware must never be assumed to expose sensors or audio streams that the vendor does not actually expose.

## 17. Shared-resource scheduling

When several principals share scarce compute, policy must be explicit rather than first-come hidden behaviour.

Scheduling policy may account for:

- owner sovereignty reserve;
- interactive vs background workload;
- per-principal allocations;
- shared-domain priorities;
- battery/power constraints;
- inference-model residency;
- preemption cost;
- consequence class.

A scheduling decision is not a disclosure grant. Workload routing must separately satisfy data and authority policy.

## 18. Cloud as another bounded provider

Cloud compute/model access should fit the same provider abstraction as local cognition.

Policy may restrict:

- data classes allowed to leave local devices;
- providers/models allowed for each class;
- monthly/operation cost ceilings;
- latency thresholds;
- consequence classes;
- fallback order;
- explicit confirmation requirements.

A local outage may permit a declared fallback model without changing entity identity. The interface should disclose meaningful cognition/runtime changes to the user.

## 19. Failure and degraded operation

The Mesh should degrade by capability rather than fail as one monolith.

Examples:

- primary cognition unavailable → permitted local or cloud fallback;
- one embodiment endpoint unavailable → route to another endpoint;
- Launchpad unavailable → existing Mesh remains operational;
- Internet unavailable → local host and local services continue where possible;
- shared inference node unavailable → preserve personal state and queue/fallback according to policy;
- presence confidence low → request explicit authentication rather than guessing.

No fallback may silently lower a non-waivable privacy or authority boundary.

## 20. Recovery and migration

The same deployment machinery should support:

- device replacement;
- role migration;
- inference-node replacement;
- storage migration;
- recovery from backup;
- leaving a shared domain;
- decommissioning a device;
- removal of an adapter/runtime;
- transition between cloud-first and local-first topologies.

Recovery should reconstruct capabilities and relationships without pretending replacement hardware is the same physical device.

## 21. Relationship to Axiom One

Axiom One should surface human concepts, not internal node taxonomy.

Examples:

- “Add another computer” rather than “create provider principal”;
- “Use this computer for AI” rather than “enable inference-provider role”;
- “Share my AI computer with my family” rather than “attach compute envelope to Circle domain”;
- “Add local image understanding” rather than “install multimodal runtime adapter.”

Advanced detail remains available through progressive disclosure.

Axiom One should explain what will change, what leaves the device, what resources are consumed, who gains access, what is reversible, and what confirmation is required.

## 22. Relationship to plural authority and Circles

This programme does not create a separate family-governance stack.

Household/family/team/small-business presets should compile to shared-domain/Circle primitives as they mature.

Existing plural-authority requirements remain controlling for:

- participation category;
- membership;
- roles;
- shared vs member-owned state;
- charter/policy;
- delegation;
- selective disclosure;
- withdrawal/revocation;
- appeals;
- stronger member-level protections;
- consequential local execution re-entering the normal Mesh authority path.

## 23. Security invariants

1. Capability is not authority.
2. Device membership is not authority.
3. Recognition is not authentication.
4. Shared-domain membership is not access to all member state.
5. Model/runtime installation is not execution authority.
6. A public substrate must contain no live private instantiation state.
7. The Launchpad cannot become a permanent root of trust for installed systems.
8. Existing third-party software is untrusted until its adapter contract and required security properties are established.
9. No fallback silently lowers non-waivable privacy, consent, or authority requirements.
10. Resource contribution is explicit, revocable, and bounded.
11. Ambient sensing is opt-in, local-first, purpose-limited, and retention-minimized.
12. Shared compute does not imply shared context.
13. A shared agent relationship does not imply unrestricted private-memory disclosure.
14. Clean installation must preserve an offline/recovery path independent of the public website.
15. Durable protocol identifiers remain name-neutral.

## 24. Implementation decomposition

This programme is intentionally larger than one implementation plan. It must be executed as independently reviewable subprojects.

### Workstream A — Deployment & Capability Engine v0

First executable target.

Deliver:

- `DeploymentSpec` v0 schema;
- observed/current-state representation;
- desired capability representation;
- deterministic resolver for a small synthetic provider set;
- plan/explain/verify interfaces;
- no privileged execution in the first slice;
- adversarial tests proving discovery/selection do not grant authority.

### Workstream B — Runtime/model adapter foundation

Deliver:

- inference-provider contract;
- model manifest/provenance schema;
- one local test adapter;
- compatibility tests;
- explicit no-egress/no-authority defaults.

### Workstream C — Launchpad/bootstrapper

Deliver:

- minimal web flow;
- browser-safe discovery;
- signed bootstrapper protocol;
- installation-session authorization;
- USB/image preparation proof using disposable/synthetic targets;
- no production clean-install claim until real hardware evidence exists.

### Workstream D — Sovereign host profile

Deliver:

- Linux base selection criteria;
- boot/update/recovery threat model;
- secure host policy interfaces;
- resource envelopes and sovereignty reserve;
- reference installation image only after reproducible-build and hardware-test gates.

### Workstream E — Axiom One lifecycle integration

Deliver:

- add-device flow;
- capability-aware progressive disclosure;
- explain-before-enable UI contract;
- role/resource management;
- migration/recovery entry points.

### Workstream F — Shared domain / multi-user resource layer

Deliver:

- household/shared-domain preset over Circle primitives;
- device resource grants independent of identity merge;
- resource scheduler;
- private/shared state tests;
- guardian/dependent semantics through the plural-authority track.

### Workstream G — Presence and distributed embodiment

Deliver:

- embodiment capability descriptors;
- local presence evidence contract;
- recognition-vs-authentication semantics;
- private-channel routing;
- synthetic multi-person/audience tests;
- one open/local room-endpoint proof before vendor integrations.

### Workstream H — Public substrate extraction

Deliver:

- inventory generic continuity/entity code currently living in private founding work;
- remove owner-specific founding data from the reusable package boundary;
- synthetic replacement fixtures;
- secret/personal-data/history review;
- public-ready generic package/repository path;
- keep real instantiation state outside version control;
- licensing remains a separate explicit decision from visibility.

## 25. Sequencing

Recommended order:

1. Workstream A — Deployment & Capability Engine v0.
2. Workstream H — public substrate extraction in parallel because it establishes the public/private boundary early.
3. Workstream B — runtime/model adapter foundation.
4. Workstream E — Axiom One lifecycle integration against the non-privileged planner.
5. Workstream C — privileged bootstrapper and installation preparation.
6. Workstream D — sovereign Linux host profile and clean-install proof.
7. Workstream F — shared-domain/multi-user resource implementation as Circle prerequisites mature.
8. Workstream G — distributed embodiment/presence after local identity/privacy contracts are ready.

The order may overlap where work is independent, but later layers must not invent authority semantics that bypass earlier reviewed contracts.

## 26. Promotion and evidence

Every promoted capability must satisfy the repository's normal claim discipline:

- exact capability registry status;
- normative requirement;
- schema and migrations where applicable;
- positive and negative tests;
- adversarial tests;
- recovery/rollback evidence;
- threat-model update;
- human explanation/accessibility evidence where user-facing;
- real hardware/platform evidence for hardware claims;
- explicit remaining non-claims.

A design, demo, package, downloaded model, successful local boot, or working adapter does not independently promote production readiness.

## 27. Success condition

The programme succeeds when a non-expert can move from intention to a working, comprehensible and recoverable personal/shared Mesh with minimal manual systems administration, while an expert can inspect and override every relevant decision.

The same architecture must scale from:

- cloud-only use on weak hardware;
- one existing laptop;
- a clean sovereign PC;
- a household with shared compute;
- a high-memory cognitive node;
- a multi-device personal Mesh;
- an infrastructure-only resource node;
- external scaffolds/runtimes integrated through adapters;
- distributed home embodiment.

Convenience must not require surrendering sovereignty, and sovereignty must not require unnecessary isolation from family, collaborators, existing software, or existing hardware.
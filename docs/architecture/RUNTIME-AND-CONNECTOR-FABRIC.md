# AXIOM Runtime & Connector Fabric

**Status:** architecture draft `0.3.0`; documentation and contract work only

**Updated:** 2026-08-21

**Authority boundary:** this document does not promote a capability. `mesh/config/capabilities.json` remains authoritative for runnable status.

## Purpose

AXIOM-MESH needs to interoperate with fast-moving agent runtimes, model providers, APIs, tool protocols, compute backends, and verification sources without making any of them an authority root.

The Runtime & Connector Fabric is the replaceable coordination layer between those external systems and AXIOM's existing authority substrate.

Its governing rule is:

> **AXIOM may coordinate runtimes without owning their cognition, and runtimes may coordinate work without owning AXIOM authority.**

Hermes, OpenClaw, Agent Zero, Codex CLI, MCP clients/servers, A2A peers, local model stacks, cloud providers, social systems, storage services, and future runtimes remain replaceable integrations. They do not become trusted merely because they are installed, popular, community-recommended, protocol-compatible, or associated with a favorable workflow label.

The mandatory effect path remains:

```text
external runtime / connector / worker
  -> versioned AXIOM adapter
  -> Gateway-authenticated principal and intent
  -> Hypervisor policy / approval / grant
  -> Sandbox bounded execution
  -> Grid state / evidence / receipt
```

No catalog, installer, plugin, runtime scheduler, Circle, oracle, market signal, community recommendation, or review label may create a second path around that sequence.

## Architectural role

The product stack is separated into six responsibilities:

1. **AXIOM-MESH kernel** — identity, policy, approvals, grants, bounded execution, state, evidence, revocation, and recovery.
2. **AXIOM One** — human control plane for install, inspect, configure, approve, revoke, observe, and recover.
3. **Runtime & Connector Fabric** — runtime selection, task routing, handoff, lifecycle, connector admission, provider selection, and coordination state.
4. **AXIOM Studio** — packaging, manifests, schemas, imports, conformance, threat review, update diffs, rollback, and catalog tooling.
5. **AXIOM Verify** — independent verification of signatures, digests, provenance, contract pins, evidence, and explicit non-claims.
6. **Circles / governance** — collective curation, policy overlays, roles, and coordination that may raise protection requirements but cannot silently lower a node's non-waivable protections.

The Runtime & Connector Fabric is therefore an orchestration plane, not an authorization plane.

## What AXIOM orchestrates

AXIOM should understand the **coordination graph** even when it does not understand or control each runtime's internal reasoning.

For every supported unit of machine work, AXIOM should be able to determine:

- the authenticated requesting principal;
- the selected runtime or connector subject;
- the exact immutable catalog entry ID and version selected for the task;
- the exact executable/artifact digest where the integration has a material artifact;
- the AXIOM adapter and contract pin;
- the exact runtime operation requested;
- the exact AXIOM action to which that operation maps;
- the optional capability-registry classification, purpose, data scope, and destinations;
- applicable time, step, tool-call, child-task, and currency-explicit monetary ceilings;
- parent task, child task, and handoff relationships;
- the exact artifacts entering and leaving a boundary;
- cancellation, expiry, revocation, fallback, and uncertain-outcome state;
- external provider or compute observations where known;
- terminal evidence and independently consumable receipt identity.

A runtime may still choose its own planner, memory strategy, sub-agent topology, prompts, reasoning method, or internal tool selection. Those choices do not widen authority.

## Integration classes

The catalog and adapter model support six initial classes without giving any class privileged standing.

### Agent runtimes

Examples include general agent shells, coding agents, local assistants, multi-agent orchestrators, and specialized workers.

A runtime may plan, converse, retrieve its own memory, coordinate workers, or call its own tools. Any AXIOM-governed effect still requires the normal Gateway path.

### Model providers

Cloud or local inference providers are selected under explicit model, data, purpose, destination, retention, budget, timeout, cancellation, and receipt rules.

Provider output is data/evidence from that provider, not automatically verified fact.

### Tool and service connectors

Examples include source control, mail, calendars, databases, browsers, storage, publishing, messaging, and business APIs.

Credentials are purpose-bound references and must not become ambient model context.

### Protocol adapters

MCP, A2A, ActivityPub, webhooks, and future protocols are transport/interoperability profiles. Protocol discovery never becomes permission.

### Compute backends

Local CPU/GPU, owner-local nodes, admitted Mesh nodes, managed nodes, and external compute may be eligible execution locations only after policy, identity, residency, resource, health, software, and evidence constraints pass.

Scheduler discovery alone never authorizes remote work.

### Evidence and oracle sources

Security feeds, registries, auditors, maintainers, reproducible-build systems, vulnerability databases, benchmark suites, and independent observers may attest to specific observations.

They do not grant local authority and should not be collapsed into a universal trust score.

## Runtime and Connector Catalog

AXIOM Studio should maintain a catalog of **immutable, versioned, evidence-bearing entries**, not a simple app store and not a mutable trust registry.

The first draft contract is `axiom-runtime-connector-catalog-entry.v1`.

Each entry identifies or declares:

- integration class, stable subject ID, catalog entry ID, and entry version;
- source-kind-appropriate provenance: repository plus exact Git commit, release/artifact digest, container/local artifact digest, or service origin;
- licence and optional SBOM/artifact provenance;
- supported platforms and deployment forms;
- adapter contract and protocol-profile pins;
- requested capability-registry classifications **and exact AXIOM actions**;
- purposes, effect destinations, credential classes, network needs/destinations, and data classes;
- resource bounds including currency-explicit monetary ceilings when present;
- orchestration characteristics such as worker spawning, whether independent child authority is requested, or remote execution requests;
- evidence-backed technical and operational observations;
- known limitations and explicit non-claims;
- static update, rollback, and quarantine-support behavior;
- supersession linkage where a new entry replaces an older immutable entry.

The tuple `(entry_id, entry_version)` is immutable. Updating code, provenance, permissions, evidence assumptions, adapter mapping, network requirements, or any other semantic field creates a new entry version or a new entry. A task may therefore bind this tuple without silently floating to a changed profile.

Catalog presence means **discoverable information only**.

Installation means **artifact presence only**.

Neither grants runtime authority.

### No aggregate review or trust label inside the immutable entry

The v1 catalog intentionally does **not** contain a subject-level field such as `trusted`, `approved`, `review_state`, `conformant`, `pilot`, `promoted`, `deprecated`, or `recommended`.

Those labels collapse unlike claims and can become misleading when evidence changes. Instead:

- technical/operational facts live as scoped evidence-backed observations;
- conformance summaries are derived from the applicable observations and verifier policy;
- Studio workflow state such as research/candidate/reviewed is local process metadata;
- quarantine/deprecation/retirement is local lifecycle or source-policy overlay state;
- Circle/community recommendations are curation overlays;
- capability/production promotion remains owned by the capability registry and readiness/release process.

No derived or overlay label becomes authority.

## Certification, curation, and authorization

These concepts must remain separate.

### Certification / assurance evidence

Assurance records what a named observer or verifier can support with evidence, for example:

- exact source commit was reviewed;
- a conformance suite passed or failed;
- an SBOM matched an artifact digest;
- a vulnerability affects a dependency;
- a reproducible build matched;
- an adapter preserved native authorization outcomes in a specified test profile.

Every assurance observation carries at least an evidence digest or retrieval URI. Observations are scoped, timestamped, freshness-bounded where appropriate, and independently inspectable.

An empty observation set means exactly that: no evidence observations are recorded in that entry. It is not silently upgraded into an `unreviewed`, `safe`, or `trusted` score.

### Curation

A person, Circle, institution, or community may recommend, warn about, quarantine, rank, or group catalog entries for a declared purpose.

Curation is opinion/policy metadata, not assurance evidence and not authority.

For v1, curation remains a **separate overlay keyed to catalog entry identity**. It must not be inserted into `assurance.observations`, because doing so would let popularity or recommendation masquerade as technical verification.

A security Circle, education Circle, developer community, or organization may therefore maintain different recommended sets without creating one universal reputation system.

### Authorization

Authorization is the local decision that a particular principal may perform a particular effect under current policy, consent, approval, grant, budget, destination, and evidence constraints.

Only the AXIOM authority path may produce that result.

A popular, evidence-rich, conformant, curated, or operationally successful runtime can still be denied locally.

## Oracle evidence model

An oracle or verifier may make a narrow observation such as:

- `artifact digest X corresponds to source commit Y`;
- `suite Z passed against adapter version V`;
- `dependency D is affected by advisory A as of time T`;
- `auditor Q reviewed scope S and issued finding set F`;
- `runtime R advertised protocol profile P at endpoint E`.

An observation includes observer identity, subject reference, explicit claim type, observation time, result, optional freshness, and at least one evidence digest or retrieval URI.

An oracle must not be treated as saying:

- the artifact is morally good;
- the runtime is universally safe;
- the runtime may access local data;
- the runtime may execute a consequential capability;
- another verifier's observations are invalid merely because they differ.

Conflicting evidence remains visible and policy decides how much assurance is required.

## Installation and compatibility matrix

AXIOM One should render evidence and compatibility dimensions rather than a binary trusted/untrusted list.

Useful dimensions include:

| Dimension | Example values |
|---|---|
| Integration class | runtime / model / connector / protocol / compute / oracle |
| Source identity | immutable commit / artifact digest / service origin |
| Catalog identity | exact entry ID + version |
| Assurance observations | source review / dependency review / conformance / advisory / operational observation |
| Evidence freshness | current / stale / expired / absent |
| Workflow state | local Studio overlay; not part of immutable entry |
| Curation | separate Circle/community overlay |
| Capability lifecycle | authoritative registry/readiness state; not catalog metadata |
| Platforms | Linux / Windows / macOS / mobile / container |
| Network | none / fixed declared destinations |
| Secrets | none / opaque handles / dedicated credential |
| Data scope | declared classes only |
| Orchestration | single-agent / workers / sub-agents / external handoff |
| Independent child authority | not requested / requested / separately delegated |
| Remote execution | no / laboratory / separately promoted |
| Monetary ceiling | explicit amount in minor units + currency |
| Rollback | available / unavailable |

AXIOM should show source evidence beside conclusions. A single composite trust score is intentionally avoided because it hides the difference between security, provenance, maturity, popularity, compatibility, privacy, and local authorization.

## Inert import and installation lifecycle

The preferred lifecycle is:

```text
discover
  -> inspect
  -> pin
  -> import inertly
  -> scan / verify
  -> configure
  -> request bounded authority
  -> activate
  -> execute
  -> observe / receipt
  -> update / revoke / quarantine / rollback / uninstall
```

### Import

Import records the immutable catalog entry, provenance, version, licence, digest, SBOM, declared interfaces, files, environment, credential classes, network destinations, data classes, budgets, outputs, and update source.

Imported content has zero authority.

### Admission

Admission evaluates contract shape, static scans, conformance evidence, policy compatibility, dependency state, known risk, source freshness, and required human/independent review.

Admission does not grant effect permission.

### Activation

Activation binds an integration to an authenticated machine principal, exact catalog entry version, approved adapter contract, exact artifact/source identity where applicable, allowed capability classifications, exact actions, purposes, data scopes, destinations, credentials, budgets, and expiry/revocation rules.

### Update

Updates create new admitted entry/artifact identities. AXIOM must show source and permission diffs and must not silently replace an activated integration whose code, manifest, dependencies, permissions, schemas, destinations, service identity, evidence assumptions, or adapter mapping changed.

### Quarantine, deprecation, retirement, and rollback

Quarantine, deprecation, retirement, or recommendation status is maintained outside the immutable catalog entry so history does not have to be rewritten when policy or evidence changes.

A local policy or curation layer may quarantine an entry because of compromised source, invalid signature, stale verification, severe advisory, conformance regression, unexplained artifact drift, or operator action.

Quarantine reduces reachability; it does not erase evidence. Rollback preserves the exact prior entry/artifact and policy assumptions needed to explain what changed.

## Neutral task, event, artifact, and handoff model

The Fabric uses a runtime-neutral work model so AXIOM can observe workflows that cross multiple runtimes.

The initial draft contract is `axiom-task-artifact-handoff.v1`.

A task contains:

- stable task and causal identifiers;
- authenticated owner/requester;
- parent task or handoff source where applicable;
- exact runtime operation;
- exact AXIOM action mapping;
- optional capability-registry classification and explicit purpose/destinations;
- selected runtime/connector subject plus exact immutable catalog entry ID/version;
- exact adapter contract and optional material artifact digest;
- input artifact identities/digests;
- time, step, tool-call, child-task, and currency-explicit cost ceilings;
- Gateway authority source plus grant/delegation references where they exist;
- lifecycle state;
- output artifact identities/digests;
- a terminal receipt for a resolved terminal state or an uncertainty record for an unresolved outcome.

Recommended lifecycle states are:

`queued`, `running`, `awaiting-approval`, `blocked`, `completed`, `failed`, `cancelled`, `expired`, and `uncertain`.

The lifecycle contract deliberately rejects ambiguous combinations:

- queued/running/awaiting-approval/blocked tasks do not carry terminal or uncertainty receipts;
- completed/failed/cancelled/expired tasks require a terminal receipt and cannot carry an uncertainty record;
- uncertain tasks require an uncertainty record and cannot pretend to have a terminal receipt;
- failed/cancelled/expired tasks require a state reason;
- a grant ID and grant digest appear together or not at all;
- event and cancellation timestamps cannot predate task creation or exceed the snapshot's `updated_at` time;
- event IDs and artifact IDs are unique within their respective collections.

An artifact is a typed, digest-bound output or input with source identity, schema/MIME metadata, size, custody/retention class, and explicit sensitivity/data classification where applicable.

A handoff creates a new task owned by the receiving execution context. It does not transfer more authority than the receiver independently possesses or receives through a separately valid attenuation-only delegation.

## Delegation and worker spawning

External orchestrators frequently spawn child agents. AXIOM must distinguish **coordination** from **delegation**.

A runtime may internally create workers without receiving additional AXIOM authority. The catalog therefore records `may_spawn_workers` separately from `independent_child_authority_requested`.

If a child worker needs an AXIOM capability, it must either:

1. act through a parent-controlled execution boundary that remains within the parent's exact grant and preserves attribution; or
2. receive a separately recorded attenuation-only delegation after that capability is implemented and promoted.

No wrapper, alias, plugin, tool rename, protocol translation, worker chain, catalog label, or curation overlay may expand capability, action, purpose, data, destination, budget, assurance, approval, expiry, or delegation depth.

Current machine-principal v1 remains non-delegating until the dedicated delegation programme passes.

## Runtime selection and routing

Selection may consider usability and efficiency only after mandatory eligibility constraints pass.

Hard eligibility filters may include:

- principal authority;
- consent and data policy;
- allowed destination and jurisdiction;
- exact catalog entry, runtime/adapter/source state, and artifact identity where applicable;
- licence policy;
- security/conformance evidence and freshness;
- credential availability;
- compute capability and health;
- deadline and resource ceilings;
- local policy and Circle/institution overlays that may only raise required protections.

After eligibility, a configurable strategy may rank candidates by privacy, quality, latency, cost, energy, locality, availability, or user preference.

Fallback requires a separately eligible candidate and may require a fresh grant. A failed preferred runtime must never cause fallback to a forbidden destination, different catalog profile, or broader authority without fresh evaluation.

## Governance and Circles

Circles and institutions may use the Fabric to:

- publish separate curation overlays over catalog entries;
- require independent reviews or named assurance profiles;
- establish role-specific integration policies;
- coordinate shared tasks and service agents;
- suspend or quarantine integrations for the Circle's shared workflows;
- require higher assurance for treasury, governance, identity, public, regulated, or safety-critical effects.

Collective policy does not silently lower a member node's mandatory protection floor, convert recommendation into authority, place curation inside assurance evidence, or make a machine count as human consent.

## Security invariants

The first implementation must preserve at least these invariants:

1. installation and discovery grant zero authority;
2. external runtimes never become authority roots;
3. immutable catalog entries contain declarations/provenance/evidence, not aggregate trust or promotion labels;
4. workflow state, quarantine/deprecation state, and curation remain separate overlays;
5. every assurance observation has an evidence digest or retrieval URI;
6. credentials remain opaque/purpose-bound and outside broad model context;
7. runtime/plugin permission labels are not trusted as AXIOM grants;
8. every consequential effect re-enters normal AXIOM policy and approval evaluation;
9. exact runtime operations map explicitly to exact AXIOM actions; capability labels cannot substitute for that mapping;
10. task execution binds an exact immutable catalog entry ID/version and exact adapter contract;
11. unknown runtime operations, schema fields, destinations, and action mappings fail closed;
12. Git source identities use canonical exact-length lowercase hashes;
13. monetary ceilings identify both amount and currency;
14. revocation and cancellation preempt work where the effect boundary has not occurred;
15. uncertain external outcomes remain uncertain until reconciled;
16. idempotency cannot be reused for a different request;
17. update or protocol drift cannot silently widen permissions;
18. worker spawning cannot launder authority;
19. remote results remain attributed external evidence unless independently verified;
20. community popularity, market adoption, curation, or oracle claims cannot grant local authority;
21. quarantine, rollback, export, and uninstall retain evidence needed for explanation and recovery.

## Draft contract compatibility and migration

Before byte pinning, the draft field surface may still be narrowed when review finds ambiguity. Once frozen:

- **major** changes are required for any change that can alter authority, accepted behavior, lifecycle meaning, identity binding, budget meaning, or verifier outcome for an existing instance;
- **minor** changes may add negotiated optional non-authoritative metadata only, and old `additionalProperties: false` verifiers must reject rather than silently ignore unknown fields;
- **patch** changes may correct documentation, examples, diagnostics, tests, or annotations only when the accepted-instance set and security meaning are unchanged.

A new contract version is a new admitted artifact. Existing activated integrations remain bound to exact prior contract/catalog-entry/artifact/policy assumptions until explicitly reviewed, migrated, revoked, or retired. Migration requires old/new schema and permission diffs, applicable provenance/SBOM re-check, conformance for both versions, explicit re-admission, rollback instructions, and preserved historical receipts/evidence.

## Initial implementation sequence

This specification extends, rather than replaces, the existing `ORCH-001`, `RUNTIME-001`, `RUNTIME-002`, `AI-001`, `ROUTE-001`, AXIOM Studio, MCP, A2A, and Circle workstreams.

Recommended sequence:

1. narrow and review the catalog-entry and task/artifact-handoff draft field surfaces;
2. run minimal, rich, uncertain-state, and adversarial fixtures with no external effect;
3. byte-pin the v1 schemas only after architecture review accepts their semantics and protected CI is green;
4. implement immutable AXIOM Studio catalog storage plus separate workflow/curation/quarantine overlays outside the trusted kernel where practical;
5. select one maintained external runtime and pin exact upstream source/release for `RUNTIME-002`;
6. prove one no-secret read-only operation through the existing Agent Runtime Adapter v1 and native Gateway authorization semantics;
7. integrate a second runtime to prove the contract is not tailored to the first runtime;
8. implement durable asynchronous task/event/artifact observation;
9. add provider/tool connectors under the same catalog and evidence model;
10. implement attenuation-only delegation before allowing AXIOM-authorized child agents to receive independent authority;
11. expose installation, evidence, permissions, runtime choice, health, updates, quarantine, and rollback in AXIOM One;
12. allow Circles to publish separate curated profiles without turning curation into assurance or authorization;
13. add remote dispatch only after multi-host identity, workload binding, cancellation, result provenance, and recovery evidence pass.

## Initial external-runtime evaluation policy

The first runtime is not selected by popularity alone. Evaluation should compare at least:

- maintenance activity and release hygiene;
- licence compatibility;
- source/dependency reviewability;
- stable non-privileged integration boundary;
- ability to run a no-secret read-only test;
- cancellation and lifecycle support;
- worker/sub-agent behavior;
- credential model;
- network and filesystem assumptions;
- update mechanism;
- known security history;
- compatibility with exact AXIOM adapter bindings.

Hermes, OpenClaw, Agent Zero, Codex CLI, and other maintained runtimes are evaluation candidates. This document does not certify, select, or promote any named runtime.

## Non-claims

This specification does not claim current support for:

- a production runtime marketplace;
- certified Hermes, OpenClaw, Agent Zero, Codex CLI, or any other named runtime;
- live MCP or A2A operation;
- production machine delegation;
- autonomous multi-agent execution;
- remote task execution;
- universal runtime reputation;
- trusted oracle truth;
- Circle authority over individual nodes;
- automatic installation or activation;
- production external-provider credentials.

Those remain separately gated capabilities.

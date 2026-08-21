# AXIOM Runtime & Connector Fabric

**Status:** architecture draft `0.1.0`; documentation and contract work only

**Updated:** 2026-08-21

**Authority boundary:** this document does not promote a capability. `mesh/config/capabilities.json` remains authoritative for runnable status.

## Purpose

AXIOM-MESH needs to interoperate with fast-moving agent runtimes, model providers, APIs, tool protocols, compute backends, and verification sources without making any of them an authority root.

The Runtime & Connector Fabric is the replaceable coordination layer between those external systems and AXIOM's existing authority substrate.

Its governing rule is:

> **AXIOM may coordinate runtimes without owning their cognition, and runtimes may coordinate work without owning AXIOM authority.**

Hermes, OpenClaw, Agent Zero, Codex-style workers, MCP clients/servers, A2A peers, local model stacks, cloud providers, social systems, storage services, and future runtimes remain replaceable integrations. They do not become trusted merely because they are installed, popular, community-recommended, or protocol-compatible.

The mandatory effect path remains:

```text
external runtime / connector / worker
  -> versioned AXIOM adapter
  -> Gateway-authenticated principal and intent
  -> Hypervisor policy / approval / grant
  -> Sandbox bounded execution
  -> Grid state / evidence / receipt
```

No catalog, installer, plugin, runtime scheduler, Circle, oracle, market signal, or community recommendation may create a second path around that sequence.

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
- the selected runtime or connector and exact version/digest;
- the AXIOM adapter and contract pin;
- the requested capability, purpose, data scope, and destinations;
- applicable budgets and approval requirements;
- parent task, child task, and handoff relationships;
- the exact artifacts entering and leaving a boundary;
- cancellation, expiry, revocation, fallback, and uncertain-outcome state;
- external provider or compute observations where known;
- terminal evidence and independently consumable receipt identity.

A runtime may still choose its own planner, memory strategy, sub-agent topology, prompts, reasoning method, or internal tool selection. Those choices do not widen authority.

## Integration classes

The catalog and adapter model should support the following classes without giving any class privileged standing:

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

Security feeds, registries, auditors, maintainers, reproducible-build systems, vulnerability databases, benchmark suites, and community observers may attest to specific observations.

They do not grant local authority and should not be collapsed into a universal trust score.

## Runtime and Connector Catalog

AXIOM Studio should maintain a catalog of **versioned evidence-bearing entries**, not a simple app store.

The first contract is `axiom-runtime-connector-catalog-entry.v1`.

Each entry should identify:

- integration class and stable ID;
- upstream project and immutable source/release pins where applicable;
- licence and provenance;
- supported platforms and deployment forms;
- adapter contract and artifact digests;
- requested capabilities, destinations, credential classes, network needs, data classes, and resource bounds;
- orchestration characteristics such as worker spawning, delegation requests, tool hosting, or remote execution requests;
- conformance and security observations;
- known limitations and explicit non-claims;
- update, quarantine, rollback, and retirement state;
- evidence sources and freshness.

Catalog presence means **discoverable information only**.

Installation means **artifact presence only**.

Neither grants runtime authority.

## Certification, curation, and authorization

These concepts must remain separate.

### Certification

Certification records what a named verifier can support with evidence, for example:

- exact source commit was reviewed;
- a conformance suite passed;
- an SBOM matched an artifact digest;
- a vulnerability affects a dependency;
- a reproducible build matched;
- an adapter preserved native authorization outcomes in a specified test profile.

Certification is scoped, versioned, expiring where appropriate, and independently inspectable.

### Curation

A person, Circle, institution, or community may recommend, warn about, quarantine, rank, or group catalog entries for a declared purpose.

Curation is opinion/policy metadata, not authority.

A security Circle, education Circle, developer community, or organization may therefore maintain different recommended sets without creating one universal reputation system.

### Authorization

Authorization is the local decision that a particular principal may perform a particular effect under current policy, consent, approval, grant, budget, destination, and evidence constraints.

Only the AXIOM authority path may produce that result.

A popular, certified, or curated runtime can still be denied locally.

## Oracle evidence model

An oracle or verifier may make a narrow signed observation such as:

- `artifact digest X corresponds to source commit Y`;
- `suite Z passed against adapter version V`;
- `dependency D is affected by advisory A as of time T`;
- `auditor Q reviewed scope S and issued finding set F`;
- `runtime R advertised protocol profile P at endpoint E`.

Oracle observations must include source identity, subject identity, scope, timestamp/freshness, evidence digest or retrieval reference, and explicit claim type.

An oracle must not be treated as saying:

- the artifact is morally good;
- the runtime is universally safe;
- the runtime may access local data;
- the runtime may execute a consequential capability;
- another verifier's observations are invalid merely because they differ.

Conflicting evidence remains visible and policy decides how much assurance is required.

## Installation matrix

AXIOM One should render the catalog as an installation/compatibility matrix rather than a binary trusted/untrusted list.

Useful dimensions include:

| Dimension | Example values |
|---|---|
| Integration class | runtime / model / connector / protocol / compute / oracle |
| Upstream state | maintained / unknown / deprecated |
| Source pin | immutable / unresolved |
| AXIOM status | unreviewed / research / contract-conformant / pilot / promoted |
| Platforms | Linux / Windows / macOS / mobile / container |
| Network | none / fixed destinations / dynamic denied |
| Secrets | none / opaque handles / dedicated credential |
| Data scope | declared classes only |
| Orchestration | single-agent / workers / sub-agents / external handoff |
| Delegation | none / requested / supported under AXIOM contract |
| Remote execution | no / laboratory / promoted |
| Evidence freshness | current / stale / expired |
| Rollback | available / unavailable |

AXIOM should show source evidence beside the conclusion. A single composite trust score is intentionally avoided because it hides the difference between security, provenance, maturity, popularity, compatibility, privacy, and local authorization.

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
  -> update / revoke / rollback / uninstall
```

### Import

Import records provenance, version, licence, digest, SBOM, declared interfaces, files, environment, credentials, network destinations, data classes, budgets, outputs, and update source.

Imported content has zero authority.

### Admission

Admission evaluates contract shape, static scans, conformance, policy compatibility, dependency state, known risk, source freshness, and required human/independent review.

Admission does not grant effect permission.

### Activation

Activation binds the integration to an authenticated machine principal, approved adapter contract, exact artifact/source pin, allowed capabilities, purposes, data scopes, destinations, credentials, budgets, and expiry/revocation rules.

### Update

Updates are new artifacts. AXIOM must show the source and permission diff and must not silently replace an activated integration with an upstream version whose code, manifest, dependencies, permissions, schemas, or destinations changed.

### Quarantine and rollback

A catalog or local policy may quarantine an entry because of compromised source, invalid signature, stale verification, severe advisory, conformance regression, unexplained artifact drift, or operator action.

Quarantine reduces reachability; it does not erase evidence. Rollback must preserve the exact prior artifact and policy assumptions needed to explain what changed.

## Neutral task, event, artifact, and handoff model

The Fabric should use a runtime-neutral work model so AXIOM can observe workflows that cross multiple runtimes.

The initial contract is `axiom-task-artifact-handoff.v1`.

A task contains:

- stable task and causal identifiers;
- authenticated owner/requester;
- parent task or handoff source where applicable;
- requested capability/purpose;
- selected runtime/connector identity;
- input artifact identities/digests;
- budget and deadline ceilings;
- policy/grant reference where one exists;
- lifecycle state;
- output artifact identities/digests;
- terminal receipt or uncertainty record.

Recommended lifecycle states are:

`queued`, `running`, `awaiting-approval`, `blocked`, `completed`, `failed`, `cancelled`, `expired`, and `uncertain`.

An artifact is a typed, digest-bound output or input with source identity, schema/MIME metadata, size, custody/retention class, and explicit sensitivity/data classification where applicable.

A handoff creates a new task owned by the receiving execution context. It does not transfer more authority than the receiver independently possesses or receives through a separately valid attenuation-only delegation.

## Delegation and worker spawning

External orchestrators frequently spawn child agents. AXIOM must distinguish **coordination** from **delegation**.

A runtime may internally create workers without receiving additional AXIOM authority. If a child worker needs an AXIOM capability, it must either:

1. act through a parent-controlled execution boundary that remains within the parent's exact grant and preserves attribution; or
2. receive a separately recorded attenuation-only delegation after that capability is implemented and promoted.

No wrapper, alias, plugin, tool rename, protocol translation, or worker chain may expand capability, purpose, data, destination, budget, assurance, approval, expiry, or delegation depth.

Current machine-principal v1 remains non-delegating until the dedicated delegation programme passes.

## Runtime selection and routing

Selection may consider usability and efficiency only after mandatory eligibility constraints pass.

Hard eligibility filters may include:

- principal authority;
- consent and data policy;
- allowed destination and jurisdiction;
- exact runtime/adapter/source state;
- licence policy;
- security/conformance state and evidence freshness;
- credential availability;
- compute capability and health;
- deadline and resource ceilings;
- local policy and Circle/institution overlays that may only raise required protections.

After eligibility, a configurable strategy may rank candidates by privacy, quality, latency, cost, energy, locality, availability, or user preference.

Fallback requires a separately eligible candidate and may require a fresh grant. A failed preferred runtime must never cause fallback to a forbidden destination or broader authority.

## Governance and Circles

Circles and institutions may use the Fabric to:

- publish curated runtime/connector sets;
- require independent reviews or named certification profiles;
- establish role-specific integration policies;
- coordinate shared tasks and service agents;
- suspend or quarantine integrations for the Circle's shared workflows;
- require higher assurance for treasury, governance, identity, public, regulated, or safety-critical effects.

Collective policy does not silently lower a member node's mandatory protection floor, convert recommendation into authority, or make a machine count as human consent.

## Security invariants

The first implementation must preserve at least these invariants:

1. installation and discovery grant zero authority;
2. external runtimes never become authority roots;
3. credentials remain opaque/purpose-bound and outside broad model context;
4. runtime/plugin permission labels are not trusted as AXIOM grants;
5. every consequential effect re-enters normal AXIOM policy and approval evaluation;
6. unknown runtime operations, schema fields, destinations, and capability mappings fail closed;
7. revocation and cancellation preempt work where the effect boundary has not occurred;
8. uncertain external outcomes remain uncertain until reconciled;
9. idempotency cannot be reused for a different request;
10. update or protocol drift cannot silently widen permissions;
11. worker spawning cannot launder authority;
12. remote results remain attributed external evidence unless independently verified;
13. community popularity, market adoption, or oracle claims cannot grant local authority;
14. quarantine, rollback, export, and uninstall retain evidence needed for explanation and recovery.

## Initial implementation sequence

This specification extends, rather than replaces, the existing `ORCH-001`, `RUNTIME-001`, `RUNTIME-002`, `AI-001`, `ROUTE-001`, AXIOM Studio, MCP, A2A, and Circle workstreams.

Recommended sequence:

1. freeze the catalog-entry and task/artifact-handoff draft contracts;
2. add bounded schema/conformance fixtures with no external effect;
3. implement AXIOM Studio inert catalog/import storage outside the trusted kernel where practical;
4. select one maintained external runtime and pin exact upstream source/release for `RUNTIME-002`;
5. prove one no-secret read-only operation through the existing Agent Runtime Adapter v1 and native Gateway authorization semantics;
6. integrate a second runtime to prove the contract is not tailored to the first runtime;
7. implement durable asynchronous task/event/artifact observation;
8. add provider/tool connectors under the same catalog and evidence model;
9. implement attenuation-only delegation before allowing AXIOM-authorized child agents to receive independent authority;
10. expose installation, evidence, permissions, runtime choice, health, updates, quarantine, and rollback in AXIOM One;
11. allow Circles to publish curated profiles without turning curation into authorization;
12. add remote dispatch only after multi-host identity, workload binding, cancellation, result provenance, and recovery evidence pass.

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

Hermes, OpenClaw, Agent Zero, and other maintained runtimes are evaluation candidates. This document does not certify, select, or promote any named runtime.

## Non-claims

This specification does not claim current support for:

- a production runtime marketplace;
- certified Hermes, OpenClaw, Agent Zero, or any other named runtime;
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

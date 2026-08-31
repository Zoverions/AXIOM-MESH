# Participant, Steward, and Verification Fabric Design

**Status:** draft for written-spec review  
**Date:** 2026-08-31  
**Base:** `main` at `403f678e8e35b7ae7a08ff37a8c86631337b5cd6`  
**Scope:** architecture and staged implementation boundary  
**Authority effect:** none

## Executive decision

AXIOM-MESH should add one small, common participant substrate and prove it first through a read-only project steward plus a bounded research verification cell.

The substrate has four parts:

1. **AXIOM Participant Manifest v0** — a signed, content-identified description of a participant and the exact roles, interfaces, assurance claims, resource ceilings, and governance bindings it presents.
2. **AXIOM Participant Runtime** — a portable Linux service that handles enrollment, message admission, metering, evidence production, and lifecycle without granting task authority.
3. **AXIOM Steward** — a non-authoritative coordinator that projects repository observations into the existing Assurance Graph, identifies conflicting or stale fronts, prepares a current-system map, and may prepare a draft pull request.
4. **Verification Cells** — temporary, task-scoped groups of workers, critics, and verifiers that produce claim-linked evidence and preserve disagreement.

This does not create a second identity system, a general autonomous executor, a global consensus network, or a custom Linux kernel. It composes existing AXIOM contracts and preserves the required effect path:

> `Gateway -> Hypervisor -> Sandbox -> Grid`

Discovery, identity, model selection, participant admission, verification, and capability availability remain distinct from authority.

## Problem

AXIOM already has strong pieces for identity, provider integration, evidence, cognitive selection, machine principals, and bounded effects. The missing layer is a small composition contract that answers, without inflating trust:

- what a new device, live source, model provider, agent, verifier, or actuator contributes;
- which existing identities and profiles describe it;
- what it can observe or compute;
- what evidence it can produce;
- what it costs and how it degrades;
- which authority path governs any proposed effect;
- how another participant can reproduce, challenge, or supersede its claims.

The repository also has a coordination problem. Hundreds of branches and many stacked or overlapping pull requests contain valuable work, but prose, branch age, CI state, and actual merge state can diverge. Human review remains authoritative, yet a machine-readable steward can reduce the cognitive burden by continually producing a conservative map of what is current, conflicting, superseded, or awaiting evidence.

## Existing foundations to reuse

| Concern | Existing AXIOM foundation | This design's use |
|---|---|---|
| Authority path | Gateway, Hypervisor, Sandbox, Grid | Remains the only effect path |
| Change-front truth | Assurance Graph A0 | Steward emits observations and candidate graph updates |
| Source provenance | Measurement Source Envelopes | Live sources bind method, implementation, environment, clock, artifacts, and reproduction |
| Path evidence | Path Observation Evidence | Network-path observations stay bounded and non-authoritative |
| Machine participation | Agent Commons and machine-principal contracts | Participant roles compose rather than replace these contracts |
| Runtime diversity | Runtime adapter and connector fabric | Participant Runtime binds conforming adapters |
| Provider diversity | Extensible agent-provider substrate | Model/provider routes are catalog entries, not identities or permissions |
| Cognitive routing | Cognitive topology and sovereign intelligence selection | Research cells request selection through governed profiles |
| Continuity | Sovereign agent composition and cognitive continuity | Long-lived state stays actor-owned and separately governed |
| Host assurance | AXIOM Host and Compute Node Profile | Linux is the strongest reference host, not a participation monopoly |
| Evidence classification | measured, authenticated assertion, independently verified, inference, declaration | Verification receipts preserve evidence class |
| Repository effects | docs-only repository operator | Steward may prepare a draft PR but cannot merge or promote |

The Participant Manifest is an adjunct binding document. It references these identities, profiles, policies, and digests; it does not duplicate their semantics.

## Architectural invariants

1. **Capability is not authority.** A role, endpoint, installed model, reachable device, or verified identity grants no effect permission.
2. **Verification is not a boolean.** Confidence is a vector over identity, authority, inputs, method, environment, output, outcome, and independence.
3. **Model identity is not accomplishment proof.** A model name or provider assertion is one provenance field.
4. **Private chain-of-thought is neither required nor claimed verified.** Receipts bind disclosed method summaries, tool events, sources, transformations, tests, and outcomes.
5. **No all-to-all mesh is required.** Participants exchange scoped metadata and content-addressed references through selective federation.
6. **No global consensus is required for ordinary work.** Local authorization and task-scoped evidence remain valid during partitions; reconciliation is explicit.
7. **Remote intelligence cannot bypass local safety.** Consequential physical control terminates in local, independently bounded policy.
8. **Failure reduces assurance or availability; it never silently broadens authority.**
9. **Provider observations are non-authoritative.** GitHub, model providers, registries, and device vendors report facts that AXIOM verifies or classifies separately.
10. **Promotion remains evidence-bound and human-governed.** The Steward prepares information, not decisions.

## System model

A participant is any entity that contributes observations, computation, coordination, verification, transport, or bounded effects to an AXIOM deployment.

### Participant roles

| Role | Contribution | Explicit non-authority |
|---|---|---|
| Source | Produces observations or datasets | Data does not become an instruction |
| Worker | Produces an analysis or artifact | Output does not authorize use or effect |
| Verifier | Checks named claims under a disclosed method | A verdict does not grant capability or promotion |
| Provider | Offers models, storage, compute, transport, or tools | Availability does not grant selection or data access |
| Coordinator | Decomposes work and assembles receipts | Coordination does not grant worker or effect authority |
| Actuator | Accepts narrowly typed effect requests | Enrollment does not authorize an effect |
| Witness | Records or independently observes an event | Observation does not prove semantics beyond the method |

One participant may advertise multiple roles, but every task binds a single role invocation. A coordinator cannot count its own worker result as independent verification. An actuator cannot reinterpret source data as a command. Role separation is enforced in task contracts and evidence, not inferred from branding.

### Device tiers

| Tier | Runtime shape | Expected use |
|---|---|---|
| P0 leaf | AXIOM Leaf SDK behind an owner-controlled gateway | Sensors, microcontrollers, constrained appliances |
| P1 participant | Participant Runtime on general-purpose Linux | Home servers, desktops, robots, edge boxes |
| P2 assured host | Participant Runtime on an evidenced AXIOM Host profile | Higher-assurance compute and verification |
| P3 service participant | Runtime adapter in a governed hosted environment | Model providers, data services, CI, repositories |

Tier is a deployment shape, not a trust rank. Assurance is derived from evidence attached to the exact participant instance and task.

## Participant Manifest v0

### Purpose

The manifest provides a stable, signed answer to “what is this participant presenting to this mesh scope?” It is descriptive and admission-oriented. It does not create identity, authority, ownership, consent, device integrity, or correctness.

### Required fields

A future schema must use closed-world validation and canonical serialization. Its required semantic fields are:

- `schema` and `version`;
- content-derived `manifest_id` and canonical digest;
- `participant_id_ref` pointing to an existing identity or principal record;
- `sponsor_ref` or explicit ownerless-public-source classification;
- one or more advertised `roles`;
- exact component, runtime-adapter, connector, host-profile, compute-profile, model-profile, and policy digests where applicable;
- endpoints and supported transports, each with direction, message class, size, rate, and authentication requirements;
- resource claims and enforceable ceilings for CPU, memory, storage, bandwidth, duration, concurrency, and monetary spend;
- data classifications, residency constraints, consent references, retention limits, and export defaults;
- assurance claims with evidence references and explicit claim ceilings;
- supported task and receipt schema identifiers;
- lifecycle timestamps, expiry, revocation reference, replacement reference, and currentness source;
- hard non-authority constants;
- manifest signer and signature metadata.

The following constants remain false in v0:

- `grants_runtime_authority`;
- `grants_node_admission`;
- `grants_capability_promotion`;
- `proves_hardware_integrity`;
- `proves_workload_correctness`;
- `proves_source_truth`;
- `permits_unbounded_delegation`.

Unknown security-relevant fields, unknown roles, unsupported schema versions, non-canonical values, expired manifests, unresolved identity bindings, and digest mismatches fail closed.

### Binding semantics

A task references the exact manifest digest it admitted. Updating a manifest creates a new digest and never retroactively changes past receipts. A manifest can be replaced or revoked, but historical receipts retain the manifest that governed the event.

Participant admission verifies identity bindings, currentness, transport compatibility, policy compatibility, and evidence ceilings. Task authorization happens later through normal AXIOM intent and effect controls.

## Identity, enrollment, and attestation

Enrollment has four independent questions:

1. **Identity:** which cryptographic principal or workload key is speaking?
2. **Sponsorship:** which owner or governance scope accepts responsibility for this participant?
3. **Environment evidence:** what is measured or asserted about the device, host, runtime, and boot state?
4. **Authority:** which exact task or effect, if any, is authorized now?

Short-lived workload credentials should bind participant identity to the exact runtime instance. Stable human, agent, robot, source, and device identities remain separate. Public discovery uses scoped pseudonymous or derived identifiers where possible rather than raw hardware identifiers.

Attestation statements are typed by strength:

- key-possession only;
- authenticated software/workload assertion;
- measured host or boot evidence;
- independently verified environment evidence.

A stronger-sounding device label must not elevate a key-possession claim into TPM, TEE, Secure Boot, measured-boot, or physical-custody proof. Missing or stale attestation lowers the assurance vector or denies tasks whose policy requires it; it does not widen fallback permissions.

## Message and evidence envelope

Every admitted participant message is an immutable envelope containing:

- message identifier and schema;
- sender participant, role invocation, and admitted manifest digest;
- mesh scope, subject, causal parent references, and sequence or replay data;
- task, intent, authorization, and budget references when applicable;
- content digest or content-addressed artifact reference;
- data classification and disclosure scope;
- creation, observation, receipt, and expiry times with clock-uncertainty metadata;
- signer and signature;
- optional evidence links.

Large or sensitive payloads stay outside the control plane. The envelope carries digests and scoped retrieval references. Retrieval rechecks authorization, residency, retention, and currentness.

## Verification model

### Assurance vector

A result is described across eight independent dimensions:

| Dimension | Question |
|---|---|
| Identity | Which principal and runtime produced it? |
| Authority | Was the action allowed in the exact scope and time? |
| Inputs | Which sources, versions, and transformations were used? |
| Method | Which disclosed procedure, tools, and checks were applied? |
| Environment | Which model, runtime, host, configuration, and limits were present? |
| Output | Is the artifact intact, typed, and bound to the task? |
| Outcome | Did an independently observable state change or test occur? |
| Independence | Which evidence came from separately controlled methods, principals, or environments? |

Each dimension carries an evidence class and references. Consumers apply consequence-specific policy rather than relying on one aggregate “verified” flag.

### Execution and research receipts

A receipt binds:

- exact task and authorization;
- participant manifest and component digests;
- input and output digests;
- disclosed method summary;
- model/provider route actually selected, including failover;
- tool calls and external effects as typed events;
- resource and monetary consumption;
- warnings, partial failures, cancellations, and timeouts;
- evidence sources and reproduction status;
- independence relationships;
- result claims and explicit non-claims;
- signature and currentness evidence.

Receipts record what happened under the disclosed method. They do not prove private reasoning or universal truth.

### Independence

Independent verification requires a declared separation dimension. Valid examples include a different owner, implementation, provider, model family, data-collection path, or physical environment. Merely launching the same prompt twice through the same provider is replication, not strong independence.

Correlated evidence remains useful but must be labeled. The synthesis step preserves dissent, minority findings, and unresolved contradictions.

## Research Verification Cells

A Research Verification Cell is temporary, operator-initiated, budget-bound, and dissolved after its terminal receipt.

### Consequence tiers

| Tier | Example | Minimum verification posture |
|---|---|---|
| R0 | Brainstorming or navigation | One worker; citations optional; no effect |
| R1 | Reversible project recommendation | Source-linked worker plus basic citation check |
| R2 | Security, architecture, or material resource decision | Independent analyses, contradiction search, claim-level citations, dissent preservation |
| R3 | Safety-critical, legal, medical, financial, or physical-effect input | Domain policy, qualified human review, authoritative sources, stronger independence, no direct effect from synthesis |

### Cell flow

1. The coordinator receives a bounded question, consequence tier, budget, disclosure policy, and cancellation condition.
2. A claim mapper decomposes the question into testable claims and identifies required source classes.
3. A source collector records source identity, retrieval time, content digest, license or use constraint, and relevant excerpts or transformations.
4. Two or more workers analyze independently when the tier requires it.
5. A critic searches for contradictions, missing evidence, prompt injection, stale information, and scope drift.
6. A verifier checks citations, transformations, calculations, task conformance, and independence claims.
7. A synthesizer assembles supported claims, dissent, confidence limits, and recommended next evidence.
8. The cell emits a signed research receipt and terminates or pauses for explicit authorization.

A model router may choose among local models, direct providers, or a routing service such as OpenRouter, but selection follows an authorized cognitive profile. Router metadata is evidence, not authority. Provider fallback must be visible in the terminal receipt.

The cell cannot autonomously publish, merge, promote a capability, spend beyond budget, enroll a device, or trigger a physical effect.

## AXIOM Steward

### Purpose

The Steward is the first proof because it produces immediate value without entering the effect path. It turns repository scale into a reviewable evidence problem.

### Inputs

The Steward consumes non-authoritative observations from GitHub and repository files:

- protected-main SHA and build identity;
- branch heads and bases;
- open and merged pull requests;
- issue and dependency references;
- exact file and tree digests;
- workflow conclusions tied to exact revisions;
- capability registry and policy state;
- Assurance Graph records;
- canonical documentation boundary;
- explicit supersedes, replaces, and depends-on statements.

### Outputs

The Steward produces:

- a point-in-time project-state snapshot;
- provider observations for each discovered change front;
- candidate Assurance Graph records;
- duplicate-contract and overlapping-outcome findings;
- stale-base, moved-base, stale-evidence, and missing-supersession findings;
- a canonical current-system map;
- a proposed consolidation order;
- optional draft documentation changes through the existing repository operator.

### Authority boundary

The Steward may read, hash, classify, compare, explain, and prepare a draft pull request. It may not:

- merge, close, delete, rebase, force-push, or retarget work;
- mark a capability implemented or production-ready;
- activate runtime policy or effects;
- convert provider observations into truth without verification;
- discard a branch because it appears stale;
- resolve architectural conflict without recorded human approval;
- spend money or invoke a paid provider beyond an authorized task budget.

When GitHub prose conflicts with repository state, exact commits, trees, merged-main content, and authenticated provider observations are preserved side by side. The Steward emits a conflict rather than choosing a convenient narrative.

## Live source participants

A live sensor, feed, or measurement service is first modeled as an evidence-producing source, not automatically as a full autonomous principal.

Its enrollment binds:

- source and sponsoring owner;
- sensor or API identity;
- measurement schema and units;
- calibration or quality-control evidence;
- sampling, aggregation, and filtering method;
- clock source and uncertainty;
- sequence, replay, gap, and duplicate handling;
- environment and implementation/configuration digests;
- consent, purpose, residency, retention, and raw-export constraints;
- source artifact and normalized-result digests;
- availability and failure behavior.

This extends the Measurement Source Envelope rather than creating a competing provenance format. Data remains data. It cannot become an instruction merely because the source is authenticated.

Constrained devices use the Leaf SDK to sign or authenticate bounded observations to an owner-controlled gateway. The gateway may normalize and batch, but the receipt distinguishes device-originated facts from gateway-originated transformations.

## Network and scalability design

The mesh is a selective federation, not a broadcast bus.

### Three planes

| Plane | Carries | Scaling rule |
|---|---|---|
| Control | identity references, admission, task metadata, budgets, revocation, small digests | bounded messages, scoped subjects, delta updates |
| Data | model inputs/outputs, datasets, media, large artifacts | content-addressed pull, authorization on retrieval, locality preference |
| Evidence | receipts, claims, attestations, checkpoints, contradiction links | append-oriented, digest gossip, tiered retention |

### Topology

- P0 leaves connect to an owner gateway.
- Gateways and P1/P2 participants subscribe only to authorized subjects.
- Regional or organizational relays federate selected subjects.
- Content moves on demand; control and evidence planes exchange digests first.
- Durable streams use consumer groups, acknowledgements, quotas, backpressure, retry limits, and dead-letter evidence.
- Checkpoints bound replay and recovery; historical artifacts remain content-addressed.
- Partitions preserve local safety and authorized local operation. Reconnection reconciles causal histories and surfaces conflicts.
- Ordinary tasks require no global membership scan, global lock, or total-order consensus.

### Latency classes

- **L0 local safety:** hard stops, collision avoidance, force ceilings, and watchdogs remain local and independent of the mesh.
- **L1 normal reversible work:** local authorization can proceed while evidence verification is asynchronous.
- **L2 consequential digital work:** required verifier evidence completes before the effect.
- **L3 research and governance:** latency is subordinate to source quality, independence, and review.

The mesh must never be placed in the L0 control loop.

### Performance gates

Before any production scaling claim, the implementation must demonstrate:

- bounded per-participant memory and connection state;
- no raw-payload gossip and no global scan on normal message admission;
- backpressure without authority widening or silent evidence loss;
- restart from a bounded checkpoint plus unapplied suffix;
- replay, duplicate, reordering, partition, and reconnect correctness;
- explicit measurements at 10,000 simulated participants and 1,000,000 envelopes;
- a separately reviewed 10,000,000-envelope campaign before broader promotion;
- latency decomposition that separates AXIOM mediation from provider inference, network transit, artifact retrieval, and verification-cell time.

These are evidence gates, not present performance claims.

## Embodied participants

A household robot or other actuator is a composite, not one undifferentiated “agent brain.” It has separate identities for:

- physical device;
- host/runtime;
- sensors;
- actuator controllers;
- installed skill capsule;
- selected cognitive worker;
- sponsoring human or household scope.

A signed skill capsule binds code/model digests, supported hardware, input/output schemas, test evidence, geofence, tool allowlist, force/velocity/temperature/duration ceilings, data-access policy, offline behavior, expiry, and rollback identity.

Natural-language or model output cannot directly become a motor command. A typed plan passes through normal authorization and a local deterministic safety controller. Remote models are advisory. Network loss, identity uncertainty, stale policy, sensor disagreement, or watchdog failure causes a safe pause or hard stop defined locally.

A research receipt can support a skill review; it cannot certify family safety on its own. Simulation, hardware-in-the-loop tests, bounded physical trials, qualified human acceptance, and continuous local safety monitoring are separate evidence classes.

## Failure handling

| Failure | Required response |
|---|---|
| Unknown or expired manifest | Deny admission; retain bounded failure evidence |
| Identity or signature mismatch | Reject message; rate-limit; surface security event |
| Stale policy or revocation state | Deny consequential task; permit only explicitly defined safe local behavior |
| Provider fallback | Record actual provider/model; re-evaluate privacy, cost, and quality policy |
| Partial research cell | Emit partial receipt with missing roles and no inflated confidence |
| Verifier disagreement | Preserve competing claims and defer the consequence |
| Budget exhaustion | Cancel or pause; no silent provider substitution |
| Queue overload | Apply backpressure, shed only policy-designated low-consequence traffic, record loss |
| Partition | Continue only partition-safe local work; reconcile causally on return |
| Clock uncertainty | Widen uncertainty, reject time-critical claims when policy requires precision |
| Evidence storage unavailable | Do not claim durable completion; retain local recovery state if authorized |
| Local safety controller failure | Remove actuator enablement and enter safe state |

Retries are idempotent and task-bound. An uncertain physical effect is never automatically retried.

## Threat model

The first implementation must defend against:

- forged participants and stolen or replayed credentials;
- manifest substitution and role confusion;
- source-data prompt injection and semantic contagion;
- coordinator self-verification presented as independence;
- provider/model substitution hidden by a router;
- stale branch, base, policy, credential, attestation, or CI evidence;
- evidence omission, selective synthesis, and dissent suppression;
- content-addressed artifact substitution;
- unbounded fan-out, queue flooding, cost exhaustion, and verification amplification;
- telemetry that leaks private prompts, household data, source content, or stable identifiers;
- gateway compromise that rewrites leaf measurements;
- remote cognitive output bypassing actuator policy;
- success claims derived from planned rather than observed enforcement.

Mitigations include canonical digests, short-lived credentials, closed-world schemas, typed roles, exact task bindings, budget ceilings, provenance envelopes, separate verification, scoped retrieval, privacy-minimized telemetry, rate controls, and fail-closed local safety.

## Observability and privacy

Operational telemetry should expose counts, latency classes, queue depth, retry state, budget use, error classes, provider route, and evidence completeness without defaulting to raw content.

Receipts use data minimization:

- digest where content is unnecessary;
- encrypt sensitive artifacts under owner-controlled policy;
- separate public claim metadata from private source material;
- use scoped participant identifiers;
- make retention and deletion policy explicit;
- never log secrets, private reasoning, raw household media, or unrestricted prompts by default.

Deletion of private payloads does not rewrite historical evidence. Receipts may retain the digest, deletion event, and limits on future reproduction.

## Staged implementation boundary

### Phase 0 — project-state consolidation

Produce the point-in-time map accompanying this design. No runtime changes.

### Phase 1 — inert Participant Manifest v0

Add the schema, canonical validator, hostile tests, fixtures, and architecture documentation. It references existing identity and profile contracts. It grants no admission or authority.

### Phase 2 — read-only Steward projection

Given repository fixtures and optionally authenticated GitHub observations, produce deterministic provider observations and candidate Assurance Graph records. Detect duplicate outcome fronts, stale bases, stale evidence, and unresolved supersession. No repository write occurs in the kernel.

### Phase 3 — one operator-initiated R2 Research Verification Cell

Use existing provider catalogs and cognitive selection authorization to answer one bounded architecture question. Produce claim, source, routing, cost, disagreement, verification, and terminal receipts. Any draft PR preparation remains a separate authorized repository effect.

### Phase 4 — Participant Runtime and Leaf SDK laboratory

Prove enrollment, envelopes, replay protection, metering, backpressure, partition recovery, and Measurement Source Envelope integration on Linux plus one constrained leaf fixture.

### Phase 5 — simulated embodiment

Admit a signed skill capsule into a simulated robot. Prove that natural-language output cannot directly command an actuator and that loss of network, policy currentness, or safety controller state results in safe denial.

Each phase requires a fresh implementation plan and evidence review. Later phases do not inherit promotion from earlier ones.

## Acceptance criteria for this design

The design is ready for implementation planning when reviewers confirm that it:

- composes rather than replaces current AXIOM identity, provider, host, evidence, and authority contracts;
- keeps participant discovery and admission distinct from task authorization;
- defines a verification vector rather than a universal verified flag;
- makes private chain-of-thought unnecessary;
- gives the Steward useful read-only outputs and an explicit non-authority boundary;
- gives research cells consequence tiers, independence semantics, budgets, dissent, and terminal receipts;
- treats live sources as provenance-bound evidence producers;
- keeps raw data off the control plane and avoids global all-to-all coordination;
- keeps physical safety local and independent;
- defines staged work small enough to test without claiming a completed mesh.

## Rejected alternatives

### Build a universal autonomous orchestrator first

Rejected because it combines discovery, planning, provider selection, execution, verification, and effects before their authority boundaries are proven.

### Treat model identity as verification

Rejected because the same model can operate under different prompts, tools, providers, data, policies, and runtime states. Model identity is provenance, not result proof.

### Put every device directly on a peer-to-peer broadcast fabric

Rejected because constrained devices, private homes, provider APIs, and high-rate sources have different trust and bandwidth boundaries. Selective gateways and subject federation are safer and more scalable.

### Require global consensus for all evidence

Rejected because it adds latency and availability risk without improving most local, task-scoped decisions. Consensus remains a separately governed option where a domain truly requires it.

### Make AXIOM Host mandatory

Rejected because hardware and ecosystem diversity are project goals. AXIOM Host is a high-assurance Linux reference environment; conforming generic Linux and other adapters remain valid at their evidenced assurance level.

### Store or verify hidden reasoning traces

Rejected because private reasoning is not necessary for accountable outcomes and can create privacy, security, and false-assurance problems. AXIOM verifies disclosed methods, sources, events, artifacts, tests, and outcomes.

## Deferred decisions with activation conditions

These decisions are deliberately outside the first proof:

- **Wire protocol selection:** choose only after envelope and replay semantics pass with at least two transports.
- **Federation relay implementation:** choose after a single-owner multi-gateway laboratory measures routing, backpressure, and partition behavior.
- **Hardware root-of-trust requirement:** introduce only for task classes with a documented threat model and at least two viable hardware ecosystems.
- **Aggregate confidence scoring:** consider only after vector consumers and calibration datasets exist; until then preserve dimensions without collapsing them.
- **Public participant discovery:** activate only after privacy, anti-enumeration, abuse, and revocation controls are independently reviewed.
- **Physical robot trial:** authorize only after simulator and hardware-in-the-loop evidence, local safety review, and household-specific acceptance.

Deferral grants no implied future approval.

## Non-claims

This design does not claim:

- a production mesh, participant runtime, leaf SDK, Steward, verification cell, or robot controller exists;
- any open pull request is safe to merge;
- current GitHub or CI observations are authoritative truth;
- a model, provider, device, attestation, signature, or receipt proves correctness;
- global scalability, stability, federation, consensus, or physical safety has been demonstrated;
- research output constitutes legal, medical, financial, regulatory, or safety authorization;
- a new capability, policy route, node admission path, spending authority, or effect authority has been enabled.

# AXIOM Runtime & Connector Fabric — Execution Queue

**Status:** subordinate execution queue; documentation/contract work only until existing capability, policy, runtime, test, and promotion gates are satisfied

**Updated:** 2026-08-21

**Parent workstreams:** `ORCH-001`, `RUNTIME-001`, `RUNTIME-002`, `AI-001`, `ROUTE-001`, AXIOM Studio, MCP/A2A laboratories, multi-host dispatch, and Circle governance.

This queue does not create an alternate authority system and does not promote any capability.

## P0 — preserve the authority boundary

- [x] Keep `Gateway -> Hypervisor -> Sandbox -> Grid` mandatory for privileged or externally visible effects.
- [x] State that external runtimes, connectors, protocols, installers, catalogs, Circles, oracles, and market signals are not authority roots.
- [x] State that discovery, catalog inclusion, import, installation, conformance, certification, and curation grant zero runtime authority.
- [x] Separate certification, curation, and local authorization.
- [x] Reject a universal composite trust/reputation score as base authority.
- [ ] Add semantic documentation gates so later edits cannot collapse certification, curation, and authorization into one claim.

## P1 — freeze draft coordination contracts

- [x] Add `docs/architecture/RUNTIME-AND-CONNECTOR-FABRIC.md`.
- [x] Add `axiom-runtime-connector-catalog-entry.v1` draft schema.
- [x] Add `axiom-task-artifact-handoff.v1` draft schema.
- [ ] Add schema validation fixtures covering valid minimal and maximal examples.
- [ ] Add negative fixtures for unknown fields, mutable source references, installation-as-authority, silent permission widening, malformed evidence, invalid task state, and handoff-as-authority.
- [ ] Byte-pin the schemas only after architecture review agrees that the v1 semantic surface is narrow enough.
- [ ] Define major/minor/patch compatibility rules and migration notes before implementation consumes them.

## P2 — catalog and inert import

- [ ] Implement AXIOM Studio catalog storage outside the trusted zero-dependency kernel where practical.
- [ ] Support the six initial integration classes: agent runtime, model provider, tool/service connector, protocol adapter, compute backend, and evidence/oracle source.
- [ ] Preserve source/release/artifact/SBOM/licence provenance and immutable pins.
- [ ] Parse requested capabilities, purposes, destinations, data classes, credentials, network needs, resource bounds, orchestration behavior, delegation requests, and remote-execution requests.
- [ ] Import artifacts inertly with zero machine principal, grant, credential, egress, or execution authority.
- [ ] Add static scans for hidden bootstrap, secret requests, path traversal, undeclared network use, hidden binaries, prompt/tool-description injection, and permission drift.
- [ ] Make update diffs visible across source, digest, SBOM, schema, permissions, destinations, credentials, and orchestration behavior.
- [ ] Add quarantine, rollback, retirement, and uninstall records without erasing prior evidence.

## P3 — first maintained external runtime (`RUNTIME-002`)

- [ ] Compare at least Hermes, OpenClaw, Agent Zero, and one additional maintained runtime against the same evaluation matrix; no candidate receives preference merely from popularity.
- [ ] Record maintenance/release hygiene, licence, source/dependency reviewability, integration boundary, worker/sub-agent behavior, credential model, filesystem/network assumptions, update mechanism, and known security history.
- [ ] Select one exact upstream source commit/release and pin it immutably.
- [ ] Complete source, licence, dependency, SBOM, and threat-model review.
- [ ] Implement one no-secret read-only operation through Agent Runtime Adapter v1.
- [ ] Prove native Gateway versus adapter authorization parity.
- [ ] Prove direct Gateway-internal-service access is impossible from the runtime boundary.
- [ ] Prove cancellation, idempotency, timeout, bounded response, and receipt behavior against the real adapter.
- [ ] Keep consequential effects disabled until independent review passes.

## P4 — second runtime neutrality proof

- [ ] Integrate a second maintained runtime using the same catalog and adapter semantics.
- [ ] Demonstrate no runtime-specific authority fields were smuggled into the shared contract.
- [ ] Compare latency, payload overhead, lifecycle behavior, cancellation, worker topology, and error mapping.
- [ ] Extract only genuinely shared adapter code after two implementations demonstrate commonality.
- [ ] Keep runtime-specific behavior in replaceable adapter/profile modules.

## P5 — durable task, event, artifact, and handoff model

- [ ] Define durable task identifiers and causal parent/child/handoff relationships.
- [ ] Implement `queued`, `running`, `awaiting-approval`, `blocked`, `completed`, `failed`, `cancelled`, `expired`, and `uncertain` states.
- [ ] Bind lifecycle transitions to principal, runtime/connector identity, exact contract pin, policy/grant state where applicable, and evidence.
- [ ] Define typed digest-bound artifacts with source, schema/MIME, size, data class, retention class, and custody metadata.
- [ ] Add bounded polling and event observation without transcript replay.
- [ ] Add cancellation/expiry semantics that do not falsely claim rollback after an effect occurred.
- [ ] Preserve uncertain outcomes until reconciliation.
- [ ] Add runaway-loop, child-task, tool-call, time, storage, bandwidth, and cost budget tests.

## P6 — worker spawning and attenuation-only delegation

- [ ] Keep internal runtime worker spawning distinct from AXIOM delegation.
- [ ] Require child agents that need independent AXIOM authority to use the dedicated attenuation-only delegation programme.
- [ ] Bind delegator/delegate, capability, purpose, data, destinations, budgets, assurance floor, approvals, expiry, revocation, and maximum depth.
- [ ] Prove wrappers, aliases, tool renames, protocol translations, or nested orchestrators cannot expand authority.
- [ ] Add cyclic delegation, revoked-parent, stale delegation, delegation laundering, confused-deputy, and hidden-sub-agent tests.
- [ ] Preserve a human-readable delegation and worker lineage in receipts without unnecessarily disclosing private data.

## P7 — connectors and providers under one catalog

- [ ] Add the first least-privilege AI provider (`AI-001`) under the same catalog/provenance model.
- [ ] Add one low-risk external tool/service connector with dedicated purpose-bound credential and exact destination allowlist.
- [ ] Treat provider/tool output as external evidence/data rather than automatically verified truth.
- [ ] Add MCP server and client profiles only after the existing pinned laboratory requirements pass.
- [ ] Add A2A task/artifact translation only after task semantics, remote peer admission, and evidence handling are stable.
- [ ] Keep ActivityPub, webhook, email, source-control, storage, social, and other adapters separate from the authority substrate.

## P8 — compute routing

- [ ] Reuse `ROUTE-001` hard eligibility before ranking by privacy, quality, latency, cost, energy, locality, availability, or user preference.
- [ ] Require exact runtime/adapter/source state, jurisdiction, data policy, licence, security/evidence freshness, credential availability, compute capability, health, deadline, and budget to pass before a candidate is eligible.
- [ ] Require fallback to be independently eligible; no failure may route work to a forbidden destination or broader authority.
- [ ] Keep admitted-node discovery/scheduling separate from execution authority.
- [ ] Add authenticated remote dispatch only after workload identity, software/input binding, cancellation, replay rejection, result provenance, compensation, recovery, and independent-host evidence pass.

## P9 — oracle and verification evidence

- [ ] Define a narrow signed oracle-observation envelope or reuse an existing evidence envelope where semantics match exactly.
- [ ] Require observer identity, subject identity, claim type, scope, observation time, freshness/expiry where relevant, and evidence digest/reference.
- [ ] Preserve conflicting observations rather than silently selecting one as truth.
- [ ] Let AXIOM Verify independently validate source pins, signatures, digests, conformance evidence, and claim boundaries.
- [ ] Prohibit oracle, market, popularity, majority, or community state from directly granting local runtime authority.

## P10 — Circle and governance curation

- [ ] Allow a Circle/institution to publish a curated catalog view with declared purpose and policy.
- [ ] Allow shared policy to require stronger review, assurance, version, destination, or runtime constraints.
- [ ] Preserve the individual node's non-waivable protection floor.
- [ ] Keep machine participation explicitly chartered and separately inspectable.
- [ ] Prevent curation/recommendation from counting as human consent or local authorization.
- [ ] Add suspension/quarantine and appeal/exit behavior for shared workflows.

## P11 — AXIOM One runtime control plane

- [ ] Add an installation/compatibility matrix showing integration class, exact version/source, AXIOM status, platforms, network, secrets, data scope, orchestration, delegation, remote-execution state, evidence freshness, and rollback availability.
- [ ] Show evidence sources next to conclusions rather than a single trust score.
- [ ] Support discover -> inspect -> pin -> inert import -> verify -> configure -> request bounded authority -> activate -> observe -> revoke/update/rollback/uninstall.
- [ ] Show permission and destination diffs before updates.
- [ ] Show task/worker/handoff lineage and terminal receipts.
- [ ] Make cancellation, uncertainty, quarantine, stale evidence, and degraded state visible rather than smoothing them away.

## P12 — promotion gates

No Runtime & Connector Fabric capability is production-promoted until its exact slice has:

- registry status matching implementation;
- fail-closed authorization and negative tests;
- protected CI evidence tied to an immutable commit;
- source/licence/dependency/SBOM provenance;
- credential and egress boundaries;
- cancellation, idempotency, uncertainty, retry, and rollback behavior where relevant;
- secret-free logs/errors/receipts;
- current threat-model coverage;
- recovery/uninstall/update behavior;
- independent review proportional to consequence;
- truthful current-status and public non-claims.

## Explicit non-claims

This queue does not claim current production support for Hermes, OpenClaw, Agent Zero, MCP, A2A, third-party plugins, autonomous multi-agent workflows, machine delegation, external-provider credentials, remote execution, a runtime marketplace, universal reputation, trusted oracle truth, or Circle authority over individual nodes.

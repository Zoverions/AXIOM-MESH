# AXIOM Runtime & Connector Fabric — Execution Queue

**Status:** subordinate execution queue; documentation/contract work only until existing capability, policy, runtime, test, and promotion gates are satisfied

**Updated:** 2026-08-21

**Parent workstreams:** `ORCH-001`, `RUNTIME-001`, `RUNTIME-002`, `AI-001`, `ROUTE-001`, AXIOM Studio, MCP/A2A laboratories, multi-host dispatch, and Circle governance.

This queue does not create an alternate authority system and does not promote any capability.

## P0 — preserve the authority boundary

- [x] Keep `Gateway -> Hypervisor -> Sandbox -> Grid` mandatory for privileged or externally visible effects.
- [x] State that external runtimes, connectors, protocols, installers, catalogs, Circles, oracles, and market signals are not authority roots.
- [x] State that discovery, catalog inclusion, import, installation, conformance, certification, and curation grant zero runtime authority.
- [x] Separate assurance evidence, curation, workflow state, capability promotion, and local authorization.
- [x] Reject a universal composite trust/reputation score as base authority.
- [x] Add contract/documentation verification that rejects installation-as-authority, handoff-as-authority, curation-as-assurance, self-asserted review/promotion labels, mutable source pins, and silent permission widening.

## P1 — freeze draft coordination contracts

- [x] Add `docs/architecture/RUNTIME-AND-CONNECTOR-FABRIC.md`.
- [x] Add `axiom-runtime-connector-catalog-entry.v1` draft schema.
- [x] Add `axiom-task-artifact-handoff.v1` draft schema.
- [x] Add schema validation fixtures covering valid minimal and rich examples.
- [x] Add a valid uncertain-outcome task fixture.
- [x] Add negative fixtures for unknown fields, mutable/malformed source references, installation-as-authority, silent permission widening, malformed or evidence-free observations, curation laundering, invalid task state, unpinned catalog targets, malformed monetary units, and handoff-as-authority.
- [x] Define major/minor/patch compatibility rules and migration notes before implementation consumes the contracts.
- [x] Remove aggregate review/trust/promotion state from immutable catalog entries; retain evidence observations plus separate workflow/curation/lifecycle overlays.
- [x] Require task execution targets to bind exact immutable catalog entry ID/version plus adapter contract.
- [x] Require exact runtime-operation -> AXIOM-action mapping instead of relying on broad capability labels.
- [x] Require assurance observations to contain an evidence digest or retrieval URI.
- [x] Make monetary ceilings unit-explicit with amount-in-minor-units plus currency.
- [ ] Byte-pin the schemas only after the final reviewed head passes protected CI.

**Draft-contract checkpoint:** the zero-dependency validator now checks the safety-critical schema invariants plus minimal/rich/uncertain instance shapes, immutable provenance, evidence-backed observations, explicit network declarations, currency-bound monetary ceilings, exact catalog-entry task binding, resource bounds, task lifecycle/receipt consistency, event bounds, and the adversarial classes above. It deliberately continues to report the contracts as unfrozen and not byte-pinned until the final CI/freeze checkpoint.

### Draft contract compatibility and migration rules

These rules apply to both `axiom-runtime-connector-catalog-entry.v1` and `axiom-task-artifact-handoff.v1` before and after byte pinning.

**Major change:** use a new major contract/schema identifier when a change can alter authority, accepted behavior, lifecycle meaning, identity binding, budget meaning, or verifier outcome for an existing instance. This includes removing or weakening a required zero-authority invariant; making an identity, digest, source pin, catalog pin, grant/delegation reference, budget, evidence, or non-claim optional where it was required; changing a field's meaning or type; widening an enum with an authority/effect-bearing state; accepting a previously rejected unknown field as semantically active; or changing handoff/worker semantics so coordination can transfer authority.

**Minor change:** a minor version may add negotiated optional metadata or a new explicitly non-authoritative observation that does not change the meaning of any existing field, accepted effect, or authorization result. Because the contracts use `additionalProperties: false`, an old verifier is expected to reject a newer instance containing the new field. Therefore a minor version is compatible only through explicit version negotiation or projection to the older field set; it is never permission to silently ignore an unknown field.

**Patch change:** a patch may correct documentation, examples, diagnostics, test coverage, or schema annotations only when the accepted-instance set and every security/authority meaning are unchanged. A patch must not be used to make an unexplained byte change pass a pin.

**Migration:** a new contract version is a new admitted artifact. Existing activated integrations remain bound to their exact prior contract, catalog-entry, artifact, and policy assumptions until explicitly reviewed, migrated, revoked, or retired. Migration requires an old/new schema and permission diff, source/artifact/SBOM re-check where applicable, conformance tests for both versions, explicit re-admission, rollback instructions, and preserved prior receipts/evidence. No runtime, catalog updater, Circle, or protocol peer may silently upgrade a contract/catalog entry or reinterpret an old receipt under newer semantics.

**Freeze rule:** when the final reviewed field surface passes protected CI, record exact schema digests, pin them in the zero-dependency verifier, add byte-drift tests, and update this checkpoint. Until then the current checker protects critical semantics while reporting `contract_frozen: false` and `contract_byte_pinned: false`.

## P2 — catalog and inert import

- [ ] Implement immutable AXIOM Studio catalog-entry storage outside the trusted zero-dependency kernel where practical; `(entry_id, entry_version)` must never mutate in place.
- [ ] Implement separate mutable Studio workflow, local quarantine/deprecation/retirement, and Circle/community curation overlays keyed to catalog entry identity.
- [ ] Support the six initial integration classes: agent runtime, model provider, tool/service connector, protocol adapter, compute backend, and evidence/oracle source.
- [ ] Preserve source/release/artifact/SBOM/licence provenance and immutable pins.
- [ ] Parse requested capability classifications **and exact actions**, purposes, destinations, data classes, credentials, network needs/destinations, resource bounds, currency-bound cost ceilings, orchestration behavior, independent-child-authority requests, and remote-execution requests.
- [ ] Import artifacts inertly with zero machine principal, grant, credential, egress, or execution authority.
- [ ] Add static scans for hidden bootstrap, secret requests, path traversal, undeclared network use, hidden binaries, prompt/tool-description injection, and permission drift.
- [ ] Make update diffs visible across source, digest, SBOM, schema, actions, permissions, destinations, credentials, orchestration behavior, and evidence assumptions.
- [ ] Add quarantine, rollback, retirement, and uninstall records without erasing prior evidence or mutating old catalog entries.

## P3 — first maintained external runtime (`RUNTIME-002`)

- [x] Compare at least Hermes, OpenClaw, Agent Zero, and one additional maintained runtime against the same evaluation matrix; no candidate receives preference merely from popularity.
- [ ] Record maintenance/release hygiene, licence, source/dependency reviewability, integration boundary, worker/sub-agent behavior, credential model, filesystem/network assumptions, update mechanism, and known security history.
- [ ] Select one exact upstream source commit/release and pin it immutably.
- [ ] Complete source, licence, dependency, SBOM, and threat-model review.
- [ ] Implement one no-secret read-only operation through Agent Runtime Adapter v1.
- [ ] Bind the real-runtime task to an exact immutable catalog entry ID/version and adapter contract.
- [ ] Prove native Gateway versus adapter authorization parity.
- [ ] Prove direct Gateway-internal-service access is impossible from the runtime boundary.
- [ ] Prove cancellation, idempotency, timeout, bounded response, and receipt behavior against the real adapter.
- [ ] Keep consequential effects disabled until independent review passes.

**Candidate-source checkpoint:** Hermes has an immutable research pin at `b6bcb3e791c673e63974029bbab40cc9326803ff` in `reviews/HERMES-RUNTIME-002-CANDIDATE-PIN-2026-08-21.md`. That document records the observed unsigned commit, MIT licence, version/dependency facts, and a code-identity-only candidate probe. The four-runtime first-pass comparison also includes Codex CLI as a narrower coding-runtime control. These records do not complete runtime selection, full security/dependency review, or certification.

## P4 — second runtime neutrality proof

- [ ] Integrate a second maintained runtime using the same catalog and adapter semantics.
- [ ] Demonstrate no runtime-specific authority fields were smuggled into the shared contract.
- [ ] Compare latency, payload overhead, lifecycle behavior, cancellation, worker topology, and error mapping.
- [ ] Extract only genuinely shared adapter code after two implementations demonstrate commonality.
- [ ] Keep runtime-specific behavior in replaceable adapter/profile modules.

## P5 — durable task, event, artifact, and handoff model

- [ ] Define durable task identifiers and causal parent/child/handoff relationships.
- [ ] Implement `queued`, `running`, `awaiting-approval`, `blocked`, `completed`, `failed`, `cancelled`, `expired`, and `uncertain` states.
- [ ] Bind lifecycle transitions to principal, exact catalog entry, runtime/connector identity, exact adapter contract, policy/grant state where applicable, and evidence.
- [ ] Define typed digest-bound artifacts with source, schema/MIME, size, data class, retention class, and custody metadata.
- [ ] Add bounded polling and event observation without transcript replay.
- [ ] Add cancellation/expiry semantics that do not falsely claim rollback after an effect occurred.
- [ ] Preserve uncertain outcomes until reconciliation.
- [ ] Add runaway-loop, child-task, tool-call, time, storage, bandwidth, and currency-explicit cost budget tests.

## P6 — worker spawning and attenuation-only delegation

- [ ] Keep internal runtime worker spawning distinct from AXIOM delegation.
- [ ] Require child agents that need independent AXIOM authority to use the dedicated attenuation-only delegation programme.
- [ ] Bind delegator/delegate, capability/action, purpose, data, destinations, budgets, assurance floor, approvals, expiry, revocation, and maximum depth.
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
- [ ] Require exact catalog/runtime/adapter/source state, jurisdiction, data policy, licence, security/evidence freshness, credential availability, compute capability, health, deadline, and budget to pass before a candidate is eligible.
- [ ] Require fallback to be independently eligible; no failure may route work to a forbidden destination, different unreviewed catalog profile, or broader authority.
- [ ] Keep admitted-node discovery/scheduling separate from execution authority.
- [ ] Add authenticated remote dispatch only after workload identity, software/input binding, cancellation, replay rejection, result provenance, compensation, recovery, and independent-host evidence pass.

## P9 — oracle and verification evidence

- [ ] Define a narrow signed oracle-observation envelope or reuse an existing evidence envelope where semantics match exactly.
- [x] Require catalog assurance observations to identify observer, subject reference, claim type, observation time, result, optional freshness, and evidence digest/reference.
- [ ] Preserve conflicting observations rather than silently selecting one as truth.
- [ ] Let AXIOM Verify independently validate source pins, signatures, digests, conformance evidence, and claim boundaries.
- [x] Keep community/Circle curation out of assurance observations.
- [ ] Prohibit oracle, market, popularity, majority, or community state from directly granting local runtime authority.

## P10 — Circle and governance curation

- [ ] Allow a Circle/institution to publish a curated catalog overlay with declared purpose and policy.
- [ ] Allow shared policy to require stronger review, assurance, version, destination, or runtime constraints.
- [ ] Preserve the individual node's non-waivable protection floor.
- [ ] Keep machine participation explicitly chartered and separately inspectable.
- [ ] Prevent curation/recommendation from counting as assurance evidence, human consent, or local authorization.
- [ ] Add suspension/quarantine and appeal/exit behavior for shared workflows.

## P11 — AXIOM One runtime control plane

- [ ] Add an installation/compatibility matrix showing integration class, exact catalog/source identity, evidence observations/freshness, separate workflow/curation/quarantine overlays, authoritative capability lifecycle, platforms, network, secrets, data scope, orchestration, delegation, remote-execution state, currency-bound cost ceilings, and rollback availability.
- [ ] Show evidence sources next to conclusions rather than a single trust score.
- [ ] Support discover -> inspect -> pin -> inert import -> verify -> configure -> request bounded authority -> activate -> observe -> revoke/update/quarantine/rollback/uninstall.
- [ ] Show action/permission and destination diffs before updates.
- [ ] Show task/worker/handoff lineage and terminal/uncertainty records.
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

This queue does not claim current production support for Hermes, OpenClaw, Agent Zero, Codex CLI, MCP, A2A, third-party plugins, autonomous multi-agent workflows, machine delegation, external-provider credentials, remote execution, a runtime marketplace, universal reputation, trusted oracle truth, or Circle authority over individual nodes.

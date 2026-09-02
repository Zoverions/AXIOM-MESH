# AXIOM-MESH Master Todo — Sovereign Host, Deployment, Shared Resources, and Embodiment

**Status:** architectural execution queue; subordinate to `docs/MASTER-TODO.md`, current capability registry state, and applicable security/promotion gates.

**Adopted:** 2026-09-02

**Design:** `docs/superpowers/specs/2026-09-02-sovereign-host-deployment-shared-embodiment-design.md`

**Current-build rule:** no checkbox below promotes a capability. `mesh/config/capabilities.json`, executable evidence, current threat model, and production-readiness documentation remain authoritative.

## Upstream convergence map

This programme is an integration layer over existing reviewed/draft work. Do not recreate these semantics under new names.

- **#1402 Human / Entity / Societal Fabric** — Public Core / Private Entity Overlays, Blank Egg, `axiom-resource-envelope.v0`, `axiom-resource-observation.v0`, resource pressure, capability surfaces, Intelligence Fabric architecture.
- **#1456 Host local sovereignty gate** — `host.profile.v1`, contribution policy, sovereignty reserve, Guardian states, local contribution ceiling.
- **#1281 Linux install planner** — deterministic non-mutating `personal-local` / `infrastructure-node` host planning.
- **#1282 signed release/install manifest** — exact release input and artifact-verification boundary without install authority.
- **#1252 Runtime & Connector Fabric** — runtime/catalog/task-handoff identity and orchestration boundary.
- **#1369 Cognitive Topology v0** — persistent/primary cognitive relationships without model identity capture.
- **#1393 Capability Observation v0** and **#1395 Capability Surface report design** — empirical capability evidence without routing authority.
- **plural-authority/Circle roadmap** — shared-domain membership, participation class, selective disclosure, delegation, withdrawal and collective policy.
- **#1399 substrate-neutral principals/governance** and **#1384 participant/embodiment architecture** — future principal/embodiment neutrality and local safety context.

These are active/draft lines with different historical bases. Before implementation, use current `main` as the truth baseline, determine which contracts have landed, and forward-port/reconstruct accepted missing semantics rather than blindly merging stale stacks.

## Priority 0 — Preserve architecture boundaries

- [ ] Keep durable protocol identifiers name-neutral.
- [ ] Preserve `Gateway -> Hypervisor -> Sandbox -> Grid` for AXIOM-governed consequential effects.
- [ ] Preserve `entity != scaffold != runtime != model != device != credential`.
- [ ] Converge the public-substrate/private-instantiation rule with #1402 Public Core / Private Entity Overlays rather than creating a second boundary.
- [ ] Require private entity state, keys, biometrics, credentials, private relationships, and private adaptations to remain outside public substrate repositories.
- [ ] Keep public visibility and source licensing as separate decisions.
- [ ] Add threat-model coverage for installer privilege, shared devices, ambient sensing, model supply chain, runtime adapters, and resource sharing.

## Priority 1 — Deployment & Capability Engine v0

- [ ] Consume accepted `axiom-resource-envelope.v0` and `axiom-resource-observation.v0` semantics from #1402; do not create duplicates.
- [ ] Consume applicable host-sovereignty evidence from #1456; local willingness remains independent of remote selection.
- [ ] Consume capability-surface/runtime/provider identities by reference and digest rather than re-declaring them.
- [ ] Define `DesiredDeployment v0` schema.
- [ ] Define `DeploymentProviderBinding v0` schema.
- [ ] Define canonical inert `DeploymentSpec v0` schema that composes exact accepted upstream evidence.
- [ ] Define derived `DeploymentPlan v0` with required changes, consequences, unresolved owner choices, downstream-planner requests, and exact input binding.
- [ ] Implement deterministic synthetic resolver only after upstream convergence on the implementation base.
- [ ] Prove discovery does not grant authority.
- [ ] Prove provider eligibility does not imply selection.
- [ ] Prove selection does not imply execution.
- [ ] Prove host/resource willingness does not imply remote workload authority.
- [ ] Prove unknown/conflicting provider declarations fail closed.
- [ ] Add machine-readable explanation reason codes.
- [ ] Keep v0 planning-only: no privileged execution, egress, model download, package installation, or downstream planner invocation.

## Priority 2 — Public reusable entity substrate convergence

- [ ] Treat #1402 Blank Egg + Public Core / Private Entity Overlays as the canonical public-substrate direction if accepted.
- [ ] Inventory generic continuity/entity mechanisms still isolated in `private-entity-origin`.
- [ ] Compare them against #1402 before copying anything; forward-port only unique reusable mechanisms.
- [ ] Separate reusable code/contracts from personalized founding disposition and relationship records.
- [ ] Replace personalized test fixtures with synthetic principals and relationships.
- [ ] Ensure public package boundary contains no private corpus, root keys, recovery material, biometric templates, credentials, private adaptation artifacts, or live entity state.
- [ ] Add personal-data/secret/history review procedure for public release candidates.
- [ ] Define private instantiation/"birth" package boundary for owner-controlled state.
- [ ] Define upgrade/migration rules that allow public substrate upgrades without exposing private instantiation state.
- [ ] Decide licensing separately before granting third-party reuse rights.

## Priority 3 — Runtime and model adapter convergence

- [ ] Reuse #1252 Runtime & Connector Fabric identity/catalog semantics; do not create another runtime registry.
- [ ] Reuse #1369 Cognitive Topology for persistent/primary model relationships.
- [ ] Reuse #1393/#1395 capability evidence where available; selection/routing remains a separate layer.
- [ ] Complete an inference-provider interface independent of one runtime only for capabilities not already covered by accepted runtime contracts.
- [ ] Define model artifact/provenance manifest only where existing provider/catalog contracts do not already bind the required model artifact facts.
- [ ] Pin exact model revisions and artifact hashes.
- [ ] Represent format, quantization, capabilities, context limits, license metadata, and executable-code requirements.
- [ ] Define load/unload/generate/stream/cancel/health/resource-reporting interfaces.
- [ ] Define optional structured-output, tool-call, embeddings, vision, and audio capabilities.
- [ ] Add local test adapter with no network egress.
- [ ] Treat `llama.cpp`, vLLM, MLX/MLX-LM, Ollama, remote APIs, and future runtimes as adapters/providers rather than mandatory dependencies.
- [ ] Keep inference servers behind authenticated Mesh boundaries.
- [ ] Add model-supply-chain negative tests.

## Priority 4 — Stable primary cognition policy

- [ ] Reuse Cognitive Topology's persistent/primary relationship semantics rather than introducing model identity.
- [ ] Define `preferred_primary_cognition` policy contract only for missing preference/fallback semantics.
- [ ] Bind approved model artifact, runtime/provider, preferred node, fallback hierarchy, cloud-escalation policy, and upgrade policy.
- [ ] Define observable cognition-runtime transition events without treating runtime change as identity replacement.
- [ ] Define evaluation/rollback process for primary-model upgrades.
- [ ] Ensure fallback cannot silently lower privacy or authority constraints.
- [ ] Define human-facing explanation when cognition changes because a preferred node/model is unavailable.

## Priority 5 — Axiom One lifecycle integration

- [ ] Add capability-aware device inventory.
- [ ] Add "set up this device" and "add another device" planning surfaces.
- [ ] Add progressive capability activation rather than one large first-run questionnaire.
- [ ] Add explain-before-enable contract: what changes, resource use, data movement, beneficiaries, reversibility, confirmation level.
- [ ] Add device role/resource contribution management.
- [ ] Add runtime/model management surfaces after underlying contracts exist.
- [ ] Add migration/recovery entry points.
- [ ] Keep Axiom One outside the kernel and consume versioned Gateway/capability contracts.

## Priority 6 — Launchpad

- [ ] Define minimal public entry flow: start using; set up this device; prepare another computer; join existing Mesh; recover; advanced.
- [ ] Implement browser-safe hardware/capability discovery.
- [ ] Define short-lived installation-session protocol for native helper invocation.
- [ ] Permit export/import of `DeploymentSpec` without requiring the Launchpad service.
- [ ] Ensure installed Meshes remain operable if Launchpad is unavailable.
- [ ] Add accessibility and low-literacy comprehension tests.
- [ ] Keep advanced detail available through progressive disclosure.

## Priority 7 — Native bootstrapper and installation preparation

- [ ] Reconstruct/consume #1281's non-mutating host-install planner on current main before adding privilege.
- [ ] Reconstruct/consume #1282's signed release/install-manifest verification on current main.
- [ ] Define signed bootstrapper artifact and update policy.
- [ ] Bind one bootstrapper session to one explicit deployment request.
- [ ] Implement privileged local hardware inspection behind explicit consent.
- [ ] Implement package/image acquisition with signature/digest verification.
- [ ] Implement safe USB target selection and destructive-action confirmation.
- [ ] Build disposable/synthetic USB creation proof.
- [ ] Verify written installation media.
- [ ] Support online and fully offline artifact bundles from the same `DeploymentSpec`.
- [ ] Do not generate long-term Mesh identity/root secrets on the public website.
- [ ] Add rollback/failure recovery for interrupted preparation.

## Priority 8 — Sovereign Linux host profile

- [ ] Treat #1456 Host Guardian/contribution/sovereignty-reserve semantics as the local resource-admission foundation if accepted.
- [ ] Reconcile prior H-series host research and #1281/#1282 productization work against current main; do not copy stale host branches wholesale.
- [ ] Choose Linux base using maintainability, driver ecosystem, reproducibility, secure boot, update control, and recovery criteria rather than branding.
- [ ] Define measured/trusted boot posture where hardware permits.
- [ ] Define full-disk encryption and key-custody model.
- [ ] Define signed/verified update policy and rollback.
- [ ] Define fail-safe recovery partition/environment.
- [ ] Define local firewall/default-deny network profile.
- [ ] Extend resource envelopes/owner sovereignty reserve below application level where practical rather than creating another policy vocabulary.
- [ ] Define host service isolation and least privilege.
- [ ] Define local model/runtime service isolation.
- [ ] Add hardware compatibility matrix only from actually tested hardware.
- [ ] Produce reproducible installation proof before any production clean-install claim.

## Priority 9 — Device roles and infrastructure-only nodes

- [ ] Define full-node role.
- [ ] Define cognition-provider role.
- [ ] Define storage-provider role.
- [ ] Define backup-provider role.
- [ ] Define compute-worker role.
- [ ] Define agent-execution-worker role.
- [ ] Define interface-endpoint role.
- [ ] Define network/relay role without implying public federation.
- [ ] Define embodiment-endpoint role.
- [ ] Allow multiple bounded roles on one device.
- [ ] Ensure a role advertisement never grants workload authority.
- [ ] Ensure resource contribution is immediately revocable subject to safe teardown of active work.

## Priority 10 — Shared device and household resource layer

- [ ] Distinguish physical device, OS session, principal, personal Mesh, shared-domain membership, resource ownership, and resource-use delegation.
- [ ] Allow several independent personal Meshes to use one physical machine without identity merge.
- [ ] Define household/family preset over Circle/shared-domain primitives rather than a parallel family-account authority system.
- [ ] Define resource grants for GPU, CPU, RAM, storage, network, and service access by composing Resource Envelope + host sovereignty + shared-domain authority.
- [ ] Preserve private per-principal state by default.
- [ ] Add shared-resource scheduler with explicit owner reserve and interactive/background priorities.
- [ ] Define guest/temporary access.
- [ ] Define clean leave/decommission semantics.
- [ ] Add isolation, contention, revocation, and device-theft tests.

## Priority 11 — Agent relational sharing

- [ ] Define bounded relational surface for one person's persistent agent to interact with another principal.
- [ ] Separate disclosure, action, resource, representation, and memory/retention authority.
- [ ] Permit family/shared access to selected knowledge and agent capability without exposing the owner's full private corpus.
- [ ] Define "ask owner/guardian" escalation for requests outside delegated authority.
- [ ] Bind guardian/dependent semantics to plural-authority participation categories rather than generic peer membership.
- [ ] Add tests proving shared-agent access does not imply private-memory access.

## Priority 12 — Local presence broker

- [ ] Define local presence evidence schema.
- [ ] Define principal hypothesis, signal provenance, confidence/assurance, freshness, and audience context.
- [ ] Preserve `recognition != authentication` and `identity confidence != effect authority`.
- [ ] Define voice/speaker recognition adapter contract.
- [ ] Define optional face-recognition adapter contract.
- [ ] Define trusted-device proximity signal contract.
- [ ] Keep raw audio/video transient by default.
- [ ] Keep biometric templates private and local unless separately authorized.
- [ ] Require stronger authentication when consequence policy demands it.
- [ ] Add ambiguity/spoofing/replay/multi-person tests.

## Priority 13 — Distributed embodiment

- [ ] Reuse substrate-neutral principal/embodiment metadata direction from #1399 and local embodiment-safety principles from #1384 where accepted.
- [ ] Define embodiment capability descriptor.
- [ ] Define `audio.input` and `audio.output`.
- [ ] Define `vision.input` and `display.output`.
- [ ] Define `presence.observe` and `principal.estimate`.
- [ ] Define `private_channel` routing.
- [ ] Define generic `sensor.read` and bounded `physical.action` families.
- [ ] Build one local/open room endpoint proof before relying on proprietary smart-speaker ecosystems.
- [ ] Integrate Home Assistant/Matter through adapters where useful.
- [ ] Treat Google/Amazon/Apple smart-home surfaces as optional adapters limited to officially exposed capabilities.
- [ ] Add multi-room arbitration and nearest/best-endpoint tests.
- [ ] Add audience-aware privacy tests.

## Priority 14 — Cloud and remote resource providers

- [ ] Treat cloud inference/storage/compute as bounded providers under the same capability model.
- [ ] Define data-class egress restrictions.
- [ ] Define provider/model allowlists.
- [ ] Define cost and latency ceilings.
- [ ] Define fallback hierarchy and explicit escalation policy.
- [ ] Preserve local operation when Internet/cloud providers are unavailable where local capabilities permit it.
- [ ] Add provider failure, billing-limit, policy-conflict, and data-egress negative tests.

## Priority 15 — Recovery, migration, and topology evolution

- [ ] Recover a lost device into replacement hardware without pretending hardware identity continuity.
- [ ] Migrate cognition provider between nodes.
- [ ] Migrate storage/backup roles.
- [ ] Transition cloud-first to local-first without entity identity reset.
- [ ] Transition local-first to temporary cloud fallback without silent policy downgrade.
- [ ] Remove a runtime/scaffold/adapter without destroying durable continuity state.
- [ ] Reconfigure node roles with explicit plan and rollback.
- [ ] Maintain topology history/provenance without making every transient routing decision canonical identity state.

## Priority 16 — Promotion gates

For every future capability promoted beyond planning:

- [ ] capability registry entry;
- [ ] exact executable evidence binding;
- [ ] normative requirement;
- [ ] schema and migration rules;
- [ ] positive tests;
- [ ] negative/adversarial tests;
- [ ] recovery/rollback tests;
- [ ] current-build threat-model update;
- [ ] privacy review where personal/shared/sensor data exists;
- [ ] accessibility/human explanation evidence where user-facing;
- [ ] real hardware evidence for hardware claims;
- [ ] operations and incident-response documentation;
- [ ] explicit remaining non-claims.

## Completion rule

The programme is not complete merely when an installer boots or an agent can talk through a room speaker. Completion requires a non-expert path from intention to a comprehensible, recoverable system; an expert-inspectable deployment specification; preserved authority boundaries; and evidence that public substrate, private instantiation, shared resources, cognition, and embodiment remain separable and independently replaceable.
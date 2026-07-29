<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.11.0; digest=4d143d985aa25e0258bfe36026667ca6dcf7f3403ae0f5b99efbc2e2b46e5f20 -->
# AXIOM-MESH Rebuild Requirements

**Normative language:** MUST, MUST NOT, SHOULD, and MAY are used in their usual
requirements sense.

## Core-loop requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| CORE-01 | All privileged effects MUST follow Gateway → Hypervisor → Sandbox → Grid. | End-to-end test rejects every direct/bypass path. |
| CORE-02 | Every request MUST carry a trace ID and idempotency key. | Duplicate submission returns the original result without a second effect. |
| CORE-03 | Every mutation MUST append a hash-linked evidence event. | Chain verification passes after restart and fails after tampering. |
| CORE-04 | Services MUST fail closed when identity, policy, consent, grant, verifier, or settlement state is unavailable. | Fault-injection tests cover each dependency. |
| CORE-05 | Interfaces MUST be versioned and incompatible changes MUST be rejected. | Schema compatibility test in CI. |

## Identity, authorization, and consent

| ID | Requirement | Acceptance evidence |
|---|---|---|
| IAM-01 | Public and service identities MUST be distinct. | Service credentials cannot call public-user-only or operator-only actions. |
| IAM-02 | Service requests MUST be mutually authenticated and replay resistant. | TLS 1.3 peer-chain, DNS/URI identity, exact active-leaf, signed-caller binding, expiry, nonce reuse, body mutation, and wrong-audience tests. |
| IAM-03 | Capability grants MUST be short-lived, single-use, audience-, intent-, tool-, and resource-bound. | Sandbox negative-path suite. |
| IAM-04 | Policy inheritance MUST be deny-dominant: lower layers can tighten but cannot loosen higher layers. | Property tests across global/national/local/user policies. |
| IAM-05 | Consent MUST identify subject, controller, purpose, data scope, expiry, and revocation handle. | Revoked/expired/wrong-purpose requests fail. |
| IAM-06 | Production startup MUST reject default, weak, missing, or example secrets. | Startup configuration tests. |

## Capsules and execution

| ID | Requirement | Acceptance evidence |
|---|---|---|
| CAP-01 | Capsules MUST be immutable, content addressed, signed, versioned, and include provenance, manifest, constraints, schemas, and SBOM. | Registry verification fixtures. |
| CAP-02 | External capsules and MCP tools MUST never execute directly from intake. | Quarantine-state test. |
| CAP-03 | Install MUST NOT imply execute permission. | Execution without a grant is denied. |
| CAP-04 | Revocation MUST block new execution immediately and in-flight execution within its declared kill window. | Revocation race test. |
| CAP-05 | Untrusted execution MUST have no ambient host authority and MUST use an explicit image digest, command allowlist, read-only root, dropped capabilities, resource limits, and deny-by-default egress. | Runtime-policy inspection and escape regression tests. |
| CAP-06 | Missing external providers MUST return `capability_unavailable`, not mock data. | Provider-absence tests. |

## Orchestration and evidence

| ID | Requirement | Acceptance evidence |
|---|---|---|
| ORCH-01 | A plan MUST name every effect, dependency, approval, capability, timeout, and evidence obligation before execution. | Plan-schema validation. |
| ORCH-02 | High-risk plans MUST require explicit human approval and MUST NOT be self-approved by the proposing agent. | Approval-separation tests. |
| ORCH-03 | Decision provenance MUST record observable inputs/rules/actions, not hidden chain-of-thought. | Schema excludes free-form private reasoning. |
| ORCH-04 | Cached results MUST be bound to canonical intent, capsule version, policy version, and proof/verifier version. | Cache invalidation tests. |
| ORCH-05 | Autonomous loops MUST have budgets, deadlines, cancellation, bounded recursion, and an emergency halt. | Loop exhaustion and halt tests. |

## Grid, state, and reliability

| ID | Requirement | Acceptance evidence |
|---|---|---|
| GRID-01 | Grid MUST be unable to originate user effects or mint its own capability grants. | Architectural import/lint rule and runtime denial. |
| GRID-02 | Durable state MUST be transactional, restart safe, and migration versioned. | Crash/restart and migration tests. |
| GRID-03 | Offline mutations MUST be signed, causally ordered, conflict visible, and reconciled without silent last-write loss. | Deterministic version-vector tests and a four-service concurrent-head/resolution path. |
| GRID-04 | Consensus claims MUST match the deployed topology. Single-node mode MUST call itself a transparency log, not BFT consensus. | Runtime status and docs parity test. |
| GRID-05 | State-mutating behavior MUST become read-only or unavailable when required quorum/finality is absent. | Quorum-loss scenario. |
| GRID-06 | Node admission MUST bind identity, security profile, capabilities, software digest, and expiry. | Admission and renewal tests. |
| GRID-07 | Storage offers MUST bind the owning admitted node key and MUST become unavailable when that node is expired or quarantined. | Wrong-key rejection and quarantine propagation tests. |
| GRID-08 | Data-key rotation MUST re-encrypt every supported durable and recovery context while stopped, reject mismatched keys, recover an interrupted cutover, and preserve post-rotation evidence on rollback. | Unit fault injection plus signed real-stack rotation, restore, rejection, and rollback evidence. |
| GRID-09 | Backup retention MUST verify every candidate, derive selection from signed policy, preserve a configured minimum, reject live or changed inventory, recover interruption, and keep retired media recoverable until separate destruction approval. | Negative-path and kill tests plus signed recurring lifecycle/restore evidence. |
| GRID-10 | Discovery-capable node admission MUST bind an HTTPS origin, failure domain, roles, resource ceilings, owner, unique active signing key, and expiry; discovery MUST exclude ineligible nodes and return Grid-signed bounded results. | Signature, copied-key, owner-limit, query, expiry, quarantine, downgrade, and attestation tests. |
| GRID-11 | Node scheduling MUST follow the normal policy/grant/evidence path, reserve only a complete deterministic placement within declared capacity/concurrency/security/owner/domain/lease constraints, encrypt records at rest, and degrade on eligibility loss. | Pure determinism/capacity tests, four-service API test, restart test, and signed drill evidence. |

## Governance and societal safety

| ID | Requirement | Acceptance evidence |
|---|---|---|
| GOV-01 | Policy changes MUST use proposal → approval → timelock → activation → verification, with rollback metadata. | Governance lifecycle test. |
| GOV-02 | Emergency action MAY only reduce authority, MUST expire, and MUST be reviewed. | Emergency-policy property test. |
| GOV-03 | Automated governance MUST NOT expand its own authority or lower a safety requirement. | Negative tests. |
| GOV-04 | Embodied/high-autonomy actions MUST bind geofence, time window, tool/force ceiling, approvals, and halt state. | Policy fixture suite. |
| GOV-05 | Sentience uncertainty MAY trigger protected mode but MUST NOT be represented as a sentience detector. | Terminology and policy tests. |
| GOV-06 | Education, health, government, finance, and minor-related capsules MUST default to data minimization, strict consent, and human appeal. | Domain-policy fixtures. |

## Portability and privacy

| ID | Requirement | Acceptance evidence |
|---|---|---|
| PORT-01 | Users MUST be able to export identity, consent, intents, memory metadata, receipts, governance records, and asset/accounting events. | Coverage test against the data registry. |
| PORT-02 | Exports MUST support time, capsule, and object scopes and MUST avoid unrelated records. | Selective-export tests. |
| PORT-03 | Bundles MUST contain canonical JSONL, a signed manifest, file digests, schema versions, and continuity proofs. | Independent verifier command. |
| PORT-04 | Import MUST support validate-only and deterministic dry-run diff before mutation. | Round-trip and no-write dry-run tests. |
| PORT-05 | Sensitive payloads MUST be encrypted at rest and exports SHOULD support recipient-key encryption. | Storage inspection and crypto tests. |

## Economics and settlement

| ID | Requirement | Acceptance evidence |
|---|---|---|
| ECON-01 | Core access and identity MUST NOT require a token. | Token-disabled end-to-end test. |
| ECON-02 | Accounting MUST use a balanced double-entry journal with integer units. | Property-based balance tests. |
| ECON-03 | The 5/10/85 allocation and 60/40 revenue policy MUST remain disabled until one canonical schedule and deployment suite is approved. | Configuration and governance tests. |
| ECON-04 | Useful-compute/PoER scores MAY influence rewards but MUST NOT substitute for Sybil-resistant consensus. | Architecture and configuration checks. |
| ECON-05 | Chain and bridge effects MUST be adapter-isolated, idempotent, finality-aware, replay-safe, and disabled without verified deployment metadata. | Adapter contract tests. |
| ECON-06 | No smart contract or tokenomics module may be called audited without an independent audit artifact tied to its exact bytecode. | Release-claim gate. |

## Operations and supply chain

| ID | Requirement | Acceptance evidence |
|---|---|---|
| OPS-01 | A clean checkout MUST install and run with one documented command and locked dependencies. | CI clean-room job. |
| OPS-02 | Containers MUST use non-root users, read-only filesystems where possible, health checks, pinned images, and explicit networks. | Compose policy test. |
| OPS-03 | Secrets, private keys, binaries, generated docs, caches, and build artifacts MUST NOT be tracked. | Repository hygiene gate. |
| OPS-04 | Logs MUST be structured, redact secrets/PII, and include trace IDs without storing raw sensitive prompts by default. | Log-redaction tests. |
| OPS-05 | Releases MUST include tests, SBOM, provenance, migration/rollback plan, status matrix, and evidence freshness timestamps. | Release verifier. |
| OPS-06 | External telemetry MUST preserve kernel deny-egress, use a route-restricted scrape identity, fixed low-cardinality OTLP and Alertmanager schemas, exact HTTPS origin allowlists, no redirects, bounded persistent retry with alert-reserved capacity, idempotency, redaction, delivery receipts, and visible dead letters. | Unit negative paths plus signed real Unix-socket scrape and forced-retry drill evidence. |
| OPS-07 | Public claims MUST be generated from the machine-readable feature-status registry. | Docs/status consistency test. |
| OPS-08 | The production supervisor MUST reject oversized requests before idempotency reservation, bound concurrent request pressure, propagate required-dependency loss into readiness, exit fail-closed after a child dies, and preserve Grid state through clean restart. | Signed Linux drill evidence covering body/rate pressure, real Sandbox suspension and loss, degradation, supervisor exit, restart, and state preservation. |
| OPS-09 | Every production internal edge MUST use mutually authenticated TLS 1.3, bind the certificate peer to the signed caller, reject inactive leaves, and support bounded offline rotation and exact rollback. | Certificate profile and negative-path tests plus signed real-stack rotation, retired-leaf rejection, restart, intent, and rollback evidence. |
| OPS-10 | Gateway, Grid, Hypervisor, and Sandbox MUST be independently deployable with one application private key and one TLS leaf per unit, Grid-only durable state, dependency-aware readiness, survivor continuity after non-Grid loss, and fail-closed network policy. | Projection isolation/staleness tests, signed independent-process Sandbox-loss and state-preservation drill, and protected four-container Sandbox-only restart plus public-egress rejection. |

## Verified implementation checkpoint

The machine-readable capability registry remains authoritative. Kernel
`0.11.0` additionally verifies:

- ordered runtime policy stacks whose lower layers cannot add an allowed
  action, replace its tool, lower its risk, or weaken its constraints;
- independent, expiring, request-bound, single-use approval for every
  permitted high-risk action;
- signed `axiom.<service>.v1` interface negotiation and incompatible-version
  rejection;
- validated plans with explicit effects, dependencies, approvals,
  capabilities, timeouts, observable decision provenance, and evidence
  obligations; and
- checksum-verified, fail-closed database migrations.
- context-bound AES-256-GCM protection for durable event payloads and
  materialized JSON, including legacy plaintext migration and wrong-key
  failure;
- content-addressed memory objects and edges, owner isolation,
  consent-scoped object disclosure, tombstoning, and export; and
- owner- and unit-bound accounts with transactional, safe-integer,
  balanced double-entry journals while all external settlement stays disabled.
- cryptographically verified canonical import bundles, deterministic staged
  diffs, conflict rejection, independent apply approval, and isolation of
  foreign records from native signed state.
- local proposal voting, post-vote finalization, timelocked independently
  approved activation, live authority-reducing policy overlays, verification,
  rollback metadata, expiring emergencies, protected recovery actions, review
  records, and human appeal records.
- redacted structured logs, generated claim/status consistency, a
  dependency-free lock, release SBOM and provenance inputs, migration and
  rollback gates, one active clean-kernel CI workflow, and quarantined legacy
  launch/deploy surfaces.
- deterministic IAM-04 and ECON-02 property fixtures; a separately claimed
  operator API and CLI; fail-closed CLI error handling; and governing documents
  bound to the capability-registry schema, kernel version, and digest.
- signed context-encrypted SQLite snapshots, exact-digest stopped-Grid restore,
  snapshot and evidence-chain tamper detection, preservation of the replaced
  database, signed restart recovery evidence, and release-gated endpoint/action
  documentation parity.
- signed policy-derived backup retention over a fully verified exact inventory,
  stopped-runtime and drift rejection, configured minimum preservation,
  journaled recoverable quarantine, data-key lifecycle interoperability, and
  recurring exact-restore evidence.
- PORT-01/02/03/05 export coverage across kernel-owned identity, receipt,
  capsule, governance, memory, accounting, and signed causal-sync records;
  strict time/object/capsule selection; canonical signed continuity manifests;
  and optional
  ephemeral-X25519/HKDF-SHA-256/AES-256-GCM recipient encryption with
  independent decryption and record verification.
- local Ed25519 node admission, renewal, expiry, owner/key binding, and
  quarantine; signed storage offers tied to those live admissions; and
  wrong-key offer rejection.
- signed v2 discovery metadata and Grid-attested filtered discovery;
  deterministic all-or-nothing encrypted placement leases with capability,
  role, security, resource, concurrency, owner, failure-domain, expiry, and
  quarantine enforcement. Remote dispatch, endpoint/resource measurement,
  result provenance, global Sybil resistance, and federation remain outside
  this checkpoint.
- independently verifiable offline-sync bundles with per-update signatures,
  contiguous node-global anti-equivocation counters, dependency-checked
  version-vector ordering, replay rejection, visible concurrent heads,
  independently approved application, and explicit all-head conflict
  resolution without last-write-wins.
- bounded-cardinality four-service telemetry, dependency-aware readiness,
  authenticated operations/OpenMetrics surfaces, and static alert states for
  integrity, availability, replay, authentication, and server-error signals.
- a host-side telemetry relay that leaves the kernel deny-egress, exports 68
  fixed OTLP/HTTP JSON points, routes a fixed Alertmanager v2 vocabulary, and
  fails closed on credential, topology, cardinality, origin, queue, digest,
  redirect, or receiver-response drift. Protected CI MUST retain signed
  least-privilege scrape, transient retry, and receipt evidence.
- a fixed Linux request-pressure and dependency-loss drill against the real
  production supervisor. Protected CI MUST prove oversized-body rejection
  without idempotency reservation, bounded concurrent rate limiting,
  dependency-aware degradation during Sandbox suspension, fail-closed
  supervisor exit after Sandbox loss, clean restart, and Grid-state
  preservation. Cgroup, disk, and pilot-orchestrator resource controls remain
  deployment evidence.
- mutually authenticated TLS 1.3 on every production internal edge with
  Ed25519 CA-issued leaves, DNS and SPIFFE-style URI identities, exact active
  fingerprint pinning, and the signed/replay-protected request above TLS.
  Protected CI MUST reject no-certificate, wrong-server, caller/certificate
  mismatch, expired, drifted, and retired peers and retain signed rotation and
  exact-rollback evidence.
- four independently restartable service units with atomically projected
  per-unit private identities and TLS leaves, Grid-only durable state and
  data-protection key, Gateway-only API registry, an internal deny-egress
  network, and no published TCP port. Protected CI MUST terminate only
  Sandbox, retain unchanged Gateway/Grid/Hypervisor processes, observe
  dependency-not-ready state and HTTP `503`, restart only Sandbox, prove
  readiness and pre-fault Grid state, and reject public TCP egress.
- an explicit idempotent production provisioning workflow and statically gated
  digest-pinned container candidate with four supervised processes,
  loopback-only internals, non-root execution, read-only root, dropped
  capabilities, mounted secrets, resource ceilings, bounded logs, health
  checks, permission-restricted Unix-domain host ingress, and
  `network_mode: none`. Startup MUST fail before child services launch if the
  effective container namespace has any non-loopback or IPv4/IPv6 default
  route. Protected CI MUST prove runner reachability of a public control
  target, preserved Gateway ingress, and blocked egress from the running
  candidate.
  Equivalent pilot orchestrator policy and immutable deployment evidence
  remain pending.
- a machine-readable incident-response policy with deterministic highest-signal
  severity, independently assigned command roles, authority-reducing
  containment, evidence preservation before remediation, bounded
  communications, verified recovery, independent closure review, and a
  retrospective due within seven days. Protected CI MUST sign an automated
  tabletop record only after recovery, backup-lifecycle, restart, resilience,
  independent-service-unit, node-scheduling, transport, credential-rotation, and
  data-key-rotation evidence from the same source revision verifies. A
  named-roster pilot exercise remains mandatory
  before production promotion.

## Capability coverage

The following feature families MUST be represented in the capability registry.
Each entry MUST declare one of `implemented`, `adapter_required`,
`experimental`, `specified`, or `disabled`; only `implemented` features may be
advertised as runnable:

- AI/provider routing and multi-step orchestration
- memory and graph retrieval
- research and auto-training workflows
- web, code, data, math, physics, and cryptography tools
- communications/channel adapters
- identity, SSI, consent, reputation, and credentials
- capsules, registry, signing, revocation, and marketplace metadata
- node discovery, scheduling, resource balancing, and adaptive roles
- storage offers, content addressing, backup, restore, and offline sync
- governance, delegation, policy inheritance, emergency controls, and appeals
- education, health, government, business, and finance domain capsules
- task markets, workforce, payroll, embodied-device controls, and digital legacy
- accounting, bonds, rewards, treasury, token, chain, bridge, and liquidity
- dashboard, CLI, installer, export, import, audit, metrics, and release evidence

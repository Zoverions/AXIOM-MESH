# AXIOM-MESH Roadmap

**Status:** canonical strategic roadmap

**Updated:** 2026-07-29

**Planning horizon:** clean-room kernel 0.11 through evidence-gated 1.0

This roadmap advances only the supported kernel. Historical token, bridge,
multi-chain, installer, domain, and autonomous-agent plans are research input,
not inherited commitments.

## Promotion rules

Roadmap phases are evidence gates, not date promises. A phase advances when:

- acceptance criteria are executable and green;
- capability claims match `mesh/config/capabilities.json`;
- security and recovery negative paths pass;
- operator documentation matches the deployed behavior;
- release evidence is tied to a protected commit and immutable artifacts;
- no critical/high finding lacks an approved, owned, expiring exception.

The active task order is maintained in
[`docs/MASTER-TODO.md`](MASTER-TODO.md). The current production decision is in
the [readiness tracker](PRODUCTION-READINESS-TRACKER.md).

## Baseline - clean-room kernel 0.11

**State:** code complete; protected repository, release, container, recovery,
rotation, retention, and repository-credential evidence are operational.

Delivered:

- four-process Gateway, Hypervisor, Sandbox, and Grid runtime;
- authenticated intent-to-evidence pipeline;
- deny-dominant policy and independent high-risk approval;
- encrypted durable state and signed evidence;
- consent, capsules, memory, local accounting, governance records, admitted
  nodes, storage offers, export/import, backup/restore, offline causal sync,
  operator-approved two-Grid online causal exchange, and independently signed
  deployment-provider startup;
- operator API and CLI;
- bounded telemetry, readiness, operations report, metrics, and a host-side
  OTLP/Alertmanager relay with exact HTTPS routing;
- production provisioning, supervisor, and hardened container candidate.

Boundary: single-node local authority and transparency log. No federation, BFT,
external settlement, arbitrary code, or regulated-domain claim.

## Phase 1 - repository and container evidence

**Target:** 0.11.x

**Outcome:** the clean-room line becomes the protected GitHub default and the
container candidate has reproducible public CI evidence.

Milestones:

1. publish lowercase `main` from a clean root;
2. archive and mark the former `Main` unsupported;
3. enforce canonical documentation and supply-chain checks;
4. protect `main` and require verification/container checks;
5. build the digest-pinned image in GitHub Actions;
6. pass the composed readiness and authenticated operations probe;
7. publish the 0.11 release dossier, checksums, SBOM, and provenance;
8. inventory and revoke 32 conservative deprecated-history credential
   candidates from supported repository trust, with signed protected-CI
   evidence and an explicit queue for outside-provider attestations.

Exit criteria:

- protected `main` is the default;
- kernel and container jobs pass at the release commit;
- image and base digests are recorded;
- no legacy credential is trusted;
- rollback and compatibility notes are published.

## Phase 2 - single-node production pilot

**Target:** 0.12

**Outcome:** one controlled deployment can be operated, measured, rotated,
backed up, restored, and contained.

Milestones:

- coordinated service/API and data-protection-key rotation, rejection, and
  rollback are implemented for the candidate host; repeat both under external
  pilot secret custody;
- signed encrypted-backup retention and weekly disposable-host restore
  verification are implemented for the candidate host; repeat against
  pilot-owned media and key custody;
- external metrics collection and bounded alert delivery are implemented for
  the automated candidate; repeat against pilot-owned HTTPS receivers and
  measure named human acknowledgement;
- controlled load profile and initial latency/error/saturation baseline;
- bounded request-body/rate-limit pressure and real dependency-process loss are
  implemented with signed restart evidence; repeat under cgroup, disk, traffic,
  and pilot-orchestrator resource controls;
- candidate-container deny-egress with preserved loopback ingress is
  implemented; repeat and independently inspect it on the pilot platform;
- incident command, deterministic severity, authority-reducing containment,
  communication, and signed automated tabletop evidence are implemented;
  repeat as a facilitated exercise with the named pilot roster;
- four independently restartable service units, isolated private identities,
  Grid-only durable state, dependency degradation, and Sandbox-only recovery
  are implemented for the single-host candidate; repeat on the pilot
  orchestrator;
- authenticated signed admitted-node discovery and deterministic placement
  reservations are implemented in the single Grid; repeat with measured
  pilot-node resources and identity review before remote dispatch is added;
- independently signed deployment-provider startup is implemented with
  digest-pinned adapters, exact secret/policy inventories, private ephemeral
  generations, rotation/restart proof, and fail-closed invalid-signer
  rejection; repeat with the pilot's actual vault or orchestrator custody
  adapter and workload identity;
- independent security review of the supported kernel and container policy;
- signed pilot deployment and release dossiers.

Exit criteria:

- measured pilot SLO, RPO, and RTO targets pass;
- rotation and recovery drills pass twice;
- critical/high findings are remediated or have approved expiring exceptions;
- pilot operators complete a facilitated tabletop incident exercise;
- the capability registry is updated only for evidenced promotions.

## Phase 3 - multi-host foundations

**Target:** 0.13

**Outcome:** four services may be deployed separately over mutually
authenticated transport without claiming distributed consensus.

Milestones:

- mutually authenticated TLS 1.3 service identity and offline certificate
  lifecycle are implemented for the single-host candidate; repeat with
  per-unit mounts, external CA custody, and orchestrator rollout;
- explicit network policy and per-service ingress/egress allowlists;
- independent deployment units and failure isolation are implemented for the
  single-host candidate with signed host evidence and protected four-container
  checks; multi-host rollout remains;
- remote dependency readiness and bounded retry/idempotency contracts;
- admitted-node v2 discovery, renewal, expiry, quarantine, and Grid-signed
  filtered results are implemented for one Grid; multi-host endpoint health
  and membership identity remain;
- capability-aware deterministic reservations with bounded resource,
  concurrency, owner, failure-domain, security, and lease constraints are
  implemented; authenticated remote dispatch and result provenance remain;
- operator-approved online causal exchange is implemented for two candidate
  Grids with pinned source evidence, encrypted ordered staging, duplicate
  preflight, visible concurrent heads, and explicit all-head convergence;
  repeat under independent-host WAN conditions.
- deployment-independent secret and policy provider contracts are implemented
  for the single-host supervisor with separate pinned signers, bounded
  nonce-bound responses, and signed conformance evidence; multi-unit rollout
  coordination and a pilot-owned backend adapter remain.

Exit criteria:

- remote plaintext is impossible in production mode;
- identity rotation does not create an authorization gap;
- partition/rejoin and duplicate delivery do not corrupt state;
- loss of one non-Grid service does not silently authorize effects;
- multi-host runbooks and rollback are independently exercised.

Current boundary: the single-Grid scheduler records complete, encrypted,
auditable placement leases and fails closed on capacity, expiry, or quarantine.
The separate online causal relay exchanges already node-signed owner data
between two Gateways while preserving destination independent approval. It
does not contact scheduled nodes, authorize workloads, replicate the Grid log,
or provide consensus. Phase 3 remains open until a dispatcher, measured
resources, independently hosted partition/rejoin evidence, and
deployment-specific identity controls exist.

The provider runtime can now start the existing supervisor from a complete
signed secret and policy generation without embedding a vault SDK in the
kernel. It does not prove any vendor backend, live refresh, multi-host rollout,
or external custody configuration. Phase 3 therefore still requires
pilot-owned adapter and workload-identity evidence.

## Phase 4 - controlled adapters and operator experience

**Target:** 0.14

**Outcome:** selected external capabilities can be added without enlarging
ambient authority.

Candidate work:

- signed provider-capsule contract and conformance kit;
- one least-privilege AI provider adapter;
- one messaging adapter with consent, retention, and rate controls;
- read-only operator dashboard using the authenticated operator API;
- portable governance delegation;
- content-transfer adapter for admitted storage offers;
- named zk verifier adapter with circuit, key, input schema, and test vectors.

Each adapter requires a threat model, credential boundary, egress policy,
budget, cancellation, audit trail, failure mode, and uninstall/rollback path.

## Phase 5 - distributed authority research

**Target:** no version commitment

**Outcome:** determine whether a secure distributed control plane is justified.

Research areas:

- Sybil-resistant membership;
- replicated evidence and conflict semantics;
- BFT safety/liveness under realistic network and operator assumptions;
- governance capture and emergency authority;
- privacy-preserving verification;
- supply-chain transparency across independently operated nodes.

No consensus or federation capability is promoted from research without a
formal protocol specification, adversarial testing, independent review, and
measured operations.

## Phase 6 - external settlement and regulated domains

**Target:** post-1.0 research, if approved

**Outcome:** evaluate narrowly scoped adapters only after the kernel is a
stable, independently reviewed platform.

Tokens, bridges, liquidity, public chains, health, education, government,
finance, workforce, and embodied systems each require separate legal,
security, economic, identity, consent, dispute, and operational governance.
Repository history describing those systems does not satisfy those gates.

## 1.0 criteria

Version 1.0 requires:

- a stable supported scope and compatibility policy;
- multiple successful production-pilot release cycles;
- independent security review with no unresolved critical/high finding;
- measured availability, capacity, recovery, and incident performance;
- protected release governance and reproducible supply-chain evidence;
- documented data lifecycle, credential lifecycle, and decommissioning;
- clear non-claims for everything outside the supported boundary.

Distributed consensus, public settlement, and regulated-domain operation are
not mandatory for 1.0. A smaller system with defensible evidence is preferred
to a larger system whose authority or claims cannot be verified.

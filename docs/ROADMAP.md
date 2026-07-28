# AXIOM-MESH Roadmap

**Status:** canonical strategic roadmap

**Updated:** 2026-07-28

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
  nodes, storage offers, export/import, backup/restore, and offline causal sync;
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
- resource exhaustion and dependency-loss drills;
- candidate-container deny-egress with preserved loopback ingress is
  implemented; repeat and independently inspect it on the pilot platform;
- incident command, deterministic severity, authority-reducing containment,
  communication, and signed automated tabletop evidence are implemented;
  repeat as a facilitated exercise with the named pilot roster;
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

- mTLS service identity and certificate lifecycle;
- explicit network policy and per-service ingress/egress allowlists;
- independent deployment units and failure isolation;
- remote dependency readiness and bounded retry/idempotency contracts;
- admitted-node discovery, renewal, expiry, and quarantine;
- capability-aware scheduling with bounded resource claims;
- online causal exchange with defined partition/rejoin behavior.

Exit criteria:

- remote plaintext is impossible in production mode;
- identity rotation does not create an authorization gap;
- partition/rejoin and duplicate delivery do not corrupt state;
- loss of one non-Grid service does not silently authorize effects;
- multi-host runbooks and rollback are independently exercised.

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

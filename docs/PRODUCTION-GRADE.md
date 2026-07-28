# AXIOM-MESH Production-Grade Definition

**Status:** normative promotion criteria

**Updated:** 2026-07-28

**Applies to:** the supported clean-room kernel in [`mesh/`](../mesh/README.md)

“Production grade” is not a synonym for feature-rich, containerized, or tested
once. For AXIOM-MESH it means a precisely bounded service can be deployed,
operated, recovered, changed, and retired using reproducible evidence while
failing closed at every authority boundary.

## Current readiness

Version 0.11.0 is a production candidate, not a production-promoted release.
The intent pipeline, local encrypted state, evidence chain, operator surfaces,
observability, explicit secret provisioning, supervisor, host-mode drill, and
container policy are implemented.

The image build and composed container drill still need published CI evidence.
Capacity, SLO, external telemetry, credential rotation, deployment-host
recovery, incident response, and independent security review remain open.
The current decision is recorded in the
[readiness tracker](PRODUCTION-READINESS-TRACKER.md).

## Supported production boundary

The candidate topology is one hardened container containing four independently
supervised Node.js processes:

```text
operator/client
      |
      v
Gateway -> Hypervisor -> Sandbox -> Grid
 public      loopback     loopback   loopback
```

Only Gateway is externally reachable. Internal plaintext HTTP remains on
loopback. Gateway is published only on host loopback. The container runs as
UID/GID 10001, uses a read-only root filesystem, drops Linux capabilities,
sets `no-new-privileges`, applies resource ceilings, and mounts data and
secrets from explicit host paths. Compose does not enforce deny-egress;
pilot and production environments must supply that control through the host
firewall or orchestrator.

This boundary does not authorize remote internal traffic, multiple hosts,
arbitrary code, external AI, chain settlement, or regulated domain workloads.

## Security requirements

Production promotion requires:

- authentication and explicit authorization on every non-public route;
- signed service requests with body digest, issuer, audience, timestamp, and
  one-use nonce validation;
- short-lived, single-use execution grants bound to the principal, intent,
  plan, policy, tool, constraints, and Sandbox audience;
- deny-dominant policy composition and independent approval for permitted
  high-risk effects;
- no credential generation during production startup;
- file-backed secret loading with restrictive ownership and mode checks;
- authenticated encryption for durable protected state;
- structured-log redaction and bounded telemetry labels;
- an inventory proving deprecated-history credentials are not trusted;
- negative-path tests for replay, tamper, wrong audience, expired authority,
  missing approval, key mismatch, partial provisioning, and dependency loss.

Every secret must have an owner, purpose, storage location, rotation procedure,
revocation procedure, and recovery impact statement.

## Reliability requirements

The supported service must have:

- liveness that reports process state without sensitive detail;
- readiness that fails when Grid, Hypervisor, Sandbox, or evidence integrity is
  unavailable;
- bounded startup and shutdown behavior;
- dependency timeouts and failure propagation;
- idempotency for externally repeatable mutations;
- a documented backup, restore, rollback, and migration ceiling;
- restart and partial-start termination tests;
- capacity ceilings for memory, CPU, process count, disk, logs, and request
  size;
- a measured recovery point objective (RPO) and recovery time objective (RTO)
  for the deployment profile.

Until measurements exist, proposed targets are planning inputs rather than
claims:

| Signal | Initial candidate target |
|---|---|
| Gateway availability | 99.5% per 30 days for the pilot |
| Successful low-risk intent latency | p95 under 2 seconds at the declared load profile |
| Evidence loss after acknowledged mutation | zero |
| Backup RPO | 24 hours or better |
| Restore RTO | 4 hours or better |
| Critical alert acknowledgement | 30 minutes during staffed pilot windows |

Targets must be revised from measured pilot data before broader promotion.

## Data durability and recovery

Grid is authoritative for kernel-owned durable state. Production procedures
must:

1. keep the data-protection key outside source, images, and ordinary backups;
2. create encrypted, signed snapshots while respecting the Grid runtime lock;
3. verify snapshot signatures, context, schema, and exact digest before use;
4. restore only while Grid is stopped;
5. preserve the replaced database as an incident artifact;
6. verify migrations and the evidence chain on restart;
7. emit signed recovery evidence;
8. test restoration on a disposable host on a schedule.

Loss of the data key can make protected data unrecoverable. Key custody and
encrypted recovery copies are therefore part of availability, not merely
security.

## Observability requirements

The runtime must expose:

- process liveness;
- dependency-aware readiness;
- authenticated operational reports;
- OpenMetrics-compatible bounded-cardinality metrics;
- integrity, authentication, replay, server-error, saturation, and
  unavailability alerts;
- redacted structured logs with request correlation that does not expose
  principals, prompts, payloads, tokens, or object identifiers.

An external collector or alert destination is an adapter with its own
credentials and egress authority. It must have bounded retry, queue limits,
redaction, failure visibility, and a disable/rollback path.

## Supply-chain requirements

Every promoted release must include:

- a protected source commit;
- reproducible dependency installation from committed locks;
- zero unresolved dependency-audit vulnerabilities or an approved expiring
  exception;
- a digest-pinned runtime base;
- an SPDX SBOM;
- provenance containing source, policy, registry, migration, operator-surface,
  deployment, and documentation digests;
- an image digest produced by CI;
- package checksums;
- release notes with compatibility and rollback information.

Private keys, tokens, live environment files, runtime databases, dependency
caches, and plaintext recovery material are forbidden in release artifacts.

## Change management

Changes land through protected `main` after review and required checks.
Capability promotion requires evidence updates in the same change. Database
migrations are contiguous and checksum-verified. A release is rejected when
generated status, documentation markers, locks, workflows, migration
checksums, or rollback documentation drift.

Emergency changes still require:

- a named incident;
- minimum necessary scope;
- a rollback plan;
- post-change verification;
- an expiring exception if a normal gate is deferred;
- retrospective review.

## Incident response

Operators must be able to classify, contain, preserve evidence, recover, and
communicate an incident. Minimum playbooks cover:

- credential exposure or signing-key compromise;
- evidence-chain or database-integrity failure;
- unauthorized intent or effect execution;
- Sandbox boundary failure;
- data-key loss or backup failure;
- dependency unavailability and resource exhaustion;
- vulnerable base image or supply-chain compromise.

Containment may include disabling Gateway, revoking API principals, replacing
service identities and trust records, quarantining nodes, preserving the data
directory, and rolling back to a compatible signed release.

## Production promotion gates

All gates must pass:

1. **Scope:** capability registry and operator documentation agree.
2. **Security:** threat model, negative paths, credentials, and open findings
   meet policy.
3. **Correctness:** kernel and property tests pass from clean locks.
4. **Container:** image builds and composed readiness drill pass in CI.
5. **Recovery:** backup, restore, rollback, and migration drills pass.
6. **Reliability:** declared load profile meets measured SLO/RPO/RTO targets.
7. **Supply chain:** SBOM, provenance, image digest, audits, and checksums exist.
8. **Operations:** monitoring, alerts, incident roles, and runbooks are tested.
9. **Governance:** protected branch, independent approval, and release dossier
   are complete.
10. **Claims:** public documentation states remaining limitations.

No single test, review, or approval substitutes for the full gate set.

## Deployment tiers

| Tier | Purpose | Public exposure | Promotion requirement |
|---|---|---|---|
| Development | Local feature work | None | Unit/integration checks |
| Candidate | CI image and disposable drills | Loopback only | Kernel and container gates |
| Pilot | Controlled real operation | Restricted ingress | Recovery, SLO, security, incident gates |
| Production | Supported service | Explicitly approved | Full promotion dossier |
| Multi-host | Future distributed operation | Not currently supported | New transport and consistency review |

The active work required to advance tiers is maintained in
[`docs/MASTER-TODO.md`](MASTER-TODO.md).

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

The image build and composed container drill pass in
[GitHub run 30375390450](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30375390450).
The protected workflow also produces signed disposable-host recovery,
SLO/restart, request-pressure and dependency-loss, coordinated service/API
credential-rotation, data-protection-key rotation, and automated
incident-tabletop evidence. The
tabletop verifies deterministic severity, role independence,
authority-reducing containment, evidence-first chronology, communications,
closure, and six linked control artifacts. Its credential-history audit also
reconstructs a 32-entry keyed ledger from the locked deprecated graph and
proves that no candidate appears in the supported tip.
Dedicated pilot capacity and availability, pilot-owned telemetry receivers, scheduled
pilot-media recovery, pilot-owned secret-manager rotation, external
deprecated-credential attestations, a named-roster pilot incident exercise,
and independent security review remain open.
The request-path resilience control, container deny-egress, host-side telemetry
relay, and automated incident tabletop are implemented and remain subject to
pilot-platform repetition. The current decision is recorded in the
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

Only Gateway is reachable from an authorized local host operator. Internal
plaintext HTTP remains on loopback. Gateway crosses a permission-restricted
Unix-domain socket rather than a published port. The container runs as
UID/GID 10001, uses a read-only root filesystem, drops Linux capabilities,
sets `no-new-privileges`, applies resource ceilings, and mounts data and
secrets from explicit host paths. Compose uses `network_mode: "none"` with no
attached Docker network. Production startup rejects every active non-loopback
or IPv4/IPv6 default route. Protected CI proves intended Unix-socket ingress
and blocked public TCP egress; other orchestrators must supply equivalent
evidence.

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
- offline, coordinated service/API credential rotation with active-key
  acceptance, retired-key rejection, and authenticated exact rollback;
- offline data-key re-encryption across every supported recovery context with
  wrong-key rejection, interruption recovery, and state-preserving rollback;
- authenticated encryption for durable protected state;
- structured-log redaction and bounded telemetry labels;
- an exact keyed inventory proving deprecated-history credentials are not
  trusted by the supported repository, plus custodian/provider dispositions
  before production promotion;
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

Protected CI establishes a repeatable initial baseline using the real
four-process production supervisor: four warmup and 40 measured low-risk
intents at concurrency 4, zero accepted errors, the two-second p95 candidate
target, process CPU and memory observations, and a bounded graceful restart
with a post-restart intent. Its signed evidence is commit-bound and retained
for 90 days. This short disposable-runner profile closes the missing initial
baseline; dedicated pilot hardware, the expected traffic mix, enforced CPU
and memory controls, external paths, and a 30-day availability window must
still be measured before production promotion.

### Request-pressure and dependency-loss resilience

Protected CI also runs a fixed Linux resilience profile against the real
production supervisor. A 4 KiB body ceiling must reject an 8 KiB authenticated
request without reserving its idempotency key. A 24-request concurrent burst
must produce only accepted or bounded `429` outcomes, expose the rejection in
telemetry, and recover after the declared refill interval.

The drill then suspends the real Sandbox child process. Dependency-aware
operations must report Gateway, Hypervisor, and Sandbox as not ready, `/ready`
must return `503`, and bounded service/dependency alerts must be present.
Killing Sandbox must terminate the supervisor fail-closed within ten seconds.
A clean restart must preserve a pre-fault Grid record and accept a new intent.
Grid signs the secret-free evidence, and release verification binds the exact
policy and protected workflow.

This closes an automated request-path and dependency-process candidate control.
It does not exercise cgroup OOM/CPU throttling, disk exhaustion, pilot traffic,
or orchestrator replacement. Those must be repeated and measured under the
pilot deployment's actual resource policy.

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

The protected Clean Kernel workflow runs executable disposable-host recovery
and backup-lifecycle drills for every supported runtime change and every week.
It retains signed, secret-free JSON evidence for 90 days. The artifacts bind
the kernel version and source revision to encrypted-backup digests,
fail-closed negative checks, policy-derived retention, recoverable quarantine,
the deliberately injected recovery-point loss, measured recovery time,
rollback preservation, and the restored evidence head.

Retention is a two-phase stopped-runtime operation. The signed plan covers an
exact fully verified inventory and preserves a configured minimum. Apply
rejects drift and atomically moves excess backups to recoverable quarantine
under a journal; killed moves roll forward from that signed record. It never
deletes media. Quarantined snapshots remain in data-key rotation scope.
Pilot promotion still requires scheduled operator-run recovery using
pilot-owned media and key custody, plus separately approved media destruction.

Loss of the data key can make protected data unrecoverable. Key custody and
encrypted recovery copies are therefore part of availability, not merely
security.

The supported candidate can replace that key while Grid is stopped. It
re-encrypts the live database, recovery rollback databases, backup outer
envelopes and nested protected columns, and credential recovery packages.
Signed rewrap sidecars anchor changed ciphertext and backup plaintext digests
to their original signed manifests. The key file is the last installed target
in a journaled transaction; a killed cutover can restore its recorded
originals, while a completed rotation can roll back by re-encrypting current
state so later evidence is not discarded. Protected CI proves this path, but
pilot promotion still requires external secret-manager custody, approval,
escrow/versioning, and retired-key destruction evidence.

## Credential lifecycle

The supported candidate rotates the four service Ed25519 identities, matching
trust records, and production operator API token while the runtime is stopped.
The Grid runtime lock excludes a competing startup. A fixed-target transaction
self-restores on ordinary failure and leaves a fail-closed maintenance marker
for authenticated recovery after interruption.

Before replacement, the original credential set is authenticated-encrypted
with the existing data-protection key. The public transition manifest is
attested by both retiring and successor Grid identities. Grid follows only
connected, dual-signed key transitions when verifying its evidence history, so
new events use the successor private key while old records remain verifiable.
Rollback validates every target, retains an encrypted forward package, and
restores the exact original service identities, trust set, registry, and
operator token.

Protected CI proves the lifecycle against the real four-process supervisor:
the active token and identities succeed, the inactive set fails, rollback
restores the original set, the rotated set then fails, and the data-protection
key is byte-for-byte unchanged. This closes candidate-host service/API
rotation. It does not close external historic-credential revocation. The
separate data-key workflow closes candidate-host re-encryption mechanics but
not pilot-owned custody or destruction evidence.

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

The candidate host-side telemetry relay implements that adapter without
changing the kernel network boundary. A dedicated `telemetry:collect`
principal is confined to the authenticated operations and metrics routes on
the permission-restricted Unix socket. The relay requires the exact
four-service topology, produces 68 fixed OTLP/HTTP JSON points, and maps only
the fixed alert vocabulary to Alertmanager v2. It requires exact allowlisted
HTTPS origins and private file-backed receiver credentials, rejects redirects,
reserves queue capacity for alerts, coalesces stale metrics, bounds items,
bytes, attempts, response bodies, and audit history, uses stable idempotency
keys, and records delivered, retry, and dead-letter outcomes without bodies or
credentials.

Protected CI performs a real host-mode Unix-socket scrape, proves the relay identity
cannot access a non-telemetry route, injects a bounded authentication alert,
forces one 503 and one 429, drains the persisted queue, records two receiver
receipts, and signs the result. This closes the automated candidate mechanism.
The separate same-revision container artifact proves deny-egress; the relay
drill does not substitute for that container-network proof.
Pilot promotion still requires operator-owned HTTPS receivers, external
credential custody, retention decisions, receiver deduplication, outage
measurement, and a named human acknowledgement.

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

The machine-readable incident policy defines four deterministic severities,
six independently assigned roles, bounded activation/containment/update
targets, authority-reducing actions, and mandatory closure conditions.
Protected CI runs an automated incident tabletop that cryptographically
verifies and binds the recovery, backup-lifecycle, SLO/restart,
request-pressure/dependency-loss, credential-rotation, and data-key-rotation
evidence from the same commit.
Missing roles or actions, severity drift, expanding authority, late
containment, broken communications cadence, stale evidence, premature
closure, or signature tampering fails the gate. See
[incident response and automated tabletop](security/INCIDENT-RESPONSE-AND-TABLETOP.md).

This candidate exercise does not replace a facilitated pilot exercise with
named primaries and deputies, deployment-specific notification decisions, and
independent human review.

## Production promotion gates

All gates must pass:

1. **Scope:** capability registry and operator documentation agree.
2. **Security:** threat model, negative paths, credentials, and open findings
   meet policy.
3. **Correctness:** kernel and property tests pass from clean locks.
4. **Container:** image builds and composed readiness drill pass in CI.
5. **Recovery:** backup, restore, rollback, and migration drills pass.
6. **Reliability:** declared load and resilience profiles meet measured
   SLO/RPO/RTO and fail-closed recovery targets.
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

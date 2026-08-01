# AXIOM-MESH Production-Grade Definition

**Status:** normative promotion criteria

**Updated:** 2026-07-29

**Applies to:** `0.12.0-dev.0` supported clean-room kernel in
[`mesh/`](../mesh/README.md)

“Production grade” is not a synonym for feature-rich, containerized, or tested
once. For AXIOM-MESH it means a precisely bounded service can be deployed,
operated, recovered, changed, and retired using reproducible evidence while
failing closed at every authority boundary.

## Current readiness

Build `0.12.0-dev.0` is a production candidate under active development, not a
published or production-promoted release. Immutable `v0.11.0` remains the last
published production-candidate baseline.
The intent pipeline, local encrypted state, evidence chain, operator surfaces,
observability, explicit secret provisioning, supervisor, host-mode drill, and
container policy are implemented.
Clean-checkout source setup is also implemented: one command validates the
supported Node.js/npm toolchain, installs the two exact zero-dependency locks
with lifecycle scripts disabled, proves they did not change, and runs the
kernel and release gates. It creates no production credentials and makes no
deployment claim.

The image build and composed container drill pass in
[GitHub run 30375390450](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30375390450).
The protected workflow also produces signed disposable-host recovery,
SLO/restart, request-pressure and dependency-loss, mutually authenticated
transport rotation, coordinated service/API credential-rotation,
data-protection-key rotation, admitted-node discovery/scheduling, and automated
online causal partition/rejoin, signed secret/policy provider conformance, and
incident-tabletop evidence. The
tabletop verifies deterministic severity, role independence,
authority-reducing containment, evidence-first chronology, communications,
closure, and eleven linked control artifacts. Its credential-history audit also
reconstructs a 32-entry keyed ledger from the immutable pre-clean-room archive
graph and
proves that no candidate appears in the supported tip.
Dedicated pilot capacity and availability, pilot-owned telemetry receivers, scheduled
pilot-media recovery, pilot-owned secret-manager rotation, external
deprecated-credential attestations, a named-roster pilot incident exercise,
and an authentic independent security review remain open. The supported tree
now includes a canonical current-build threat model and a fail-closed review
intake: a separate policy authority pins the exact build, artifact digests,
scope, reviewer, and exception approver; the reviewer signs the exact findings
ledger; critical/high remediation requires independent re-verification; and
only medium/low risks can receive separately signed bounded exceptions.
Protected synthetic conformance proves the verifier, not an external review.
The repository now implements signed pilot dossier and exact offline package
verification: a separately anchored policy authority pins one build and image,
current 30-day/SLO gates, five distinct reviewers, custody receipts, and
exactly 13 canonical local v2 evidence envelopes. Raw-byte hashes, build
identity, assigned-role signatures, exact filenames, type-specific semantic
contracts, secret rejection, and a no-symlink inventory make the reviewed
package immutable and structurally meaningful. Protected CI proves only the
verifiers' fail-closed behavior with labeled synthetic fixtures; it supplies
none of the open pilot evidence.
The request-path resilience control, container deny-egress, host-side telemetry
relay, and automated incident tabletop are implemented and remain subject to
pilot-platform repetition. The current decision is recorded in the
[readiness tracker](PRODUCTION-READINESS-TRACKER.md).

The four-unit candidate is also implemented. It projects one application
private key and one TLS leaf per service, gives durable state and the
data-protection key only to Grid, gives API credentials only to Gateway, and
uses four exact Docker internal segments with no public port. A machine-
readable default-deny policy permits only 38 current internal
caller/destination/method/route combinations at both endpoints and derives
mTLS peer allowlists.
Signed host evidence and a protected four-container check prove required-path
operation, selected forbidden edges, Sandbox-loss readiness degradation
without restarting Gateway, Grid, or Hypervisor, and state-preserving
Sandbox-only recovery. Pilot-orchestrator repetition remains open.

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

An alternate single-host boundary runs the four responsibilities as separate
containers through `mesh/compose.units.yml`. Four internal network segments
remove unrelated adjacency and have no external route; Gateway preserves the
same Unix-domain host ingress. Directional application and health traffic is
restricted by the exact service-network policy and active mTLS peer identity.
Each unit mounts only its own projected application and TLS private keys. See
[independent service units](operations/INDEPENDENT-SERVICE-UNITS.md) and the
[explicit service network policy](operations/EXPLICIT-SERVICE-NETWORK-POLICY.md).

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

Parallel real-stack tests use aligned, atomic cross-process leases for each
four-port loopback block. A lease spans startup, runtime, stopped maintenance,
and restart; actual socket occupancy remains a separate negative check.
Collision, external-occupancy, idempotent-release, and reuse regressions are
tested. This removes a check-then-bind race from release evidence generation
without treating temporary port ownership as a production network control.

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

## Mutually authenticated internal transport

Every production internal edge requires TLS 1.3. Provisioning creates an
Ed25519 internal CA and distinct Gateway, Hypervisor, Sandbox, Grid, and
supervisor-probe leaves with DNS and SPIFFE-style URI identities. Clients
validate the expected server identity and exact active SHA-256 certificate
fingerprint. Servers validate the CA chain and bind the TLS peer to the caller
named by the existing signed, timestamped, nonce-protected request. A CA-valid
certificate for another service is insufficient.

The active fingerprint registry rejects retired leaves without an OCSP
dependency. Offline rotation validates a complete staged leaf generation
before an atomic directory swap, retains the prior generation, and supports
exact rollback. Protected CI starts the real supervisor before and after
rotation, rejects the retired Gateway leaf, accepts the active leaf, executes
intents, rolls back, restarts, and signs secret-free evidence.

This closes the single-host transport and leaf lifecycle. Pilot promotion
still requires external CA custody, pilot per-unit secret mounts, orchestrator
rollout and CA-compromise recovery, clock/expiry alert measurement, and
independent cryptographic and deployment review.

## Independent service deployment and failure isolation

The unit projection is atomic and refuses overwrite. Its manifest binds the
four unit directories to the source identity key IDs, trust digests, transport
generation, CA fingerprint, and active TLS fingerprints. Validation rejects
cross-unit private keys, a CA signing key, shared secret files, non-Grid
durable state, or a stale projection.

Protected CI starts the same four entrypoints without the supervisor, writes
state, kills Sandbox, requires HTTP `503` readiness while the three survivors
remain unchanged, restarts Sandbox alone, then proves readiness and both
pre-fault and post-recovery intents. Grid signs the secret-free result. A
second Compose exercise checks actual container identity continuity and
blocked public TCP connectivity. This is failure isolation, not automatic
failover, replicated Grid, consensus, or zero-downtime upgrade.

## Admitted-node discovery and scheduling

The candidate accepts signed `axiom-node-admission.v2` statements that bind an
Ed25519 node identity to its authenticated owner, capabilities, software
digest, security profile, HTTPS origin, failure domain, roles, resource
ceilings, and expiry. An active signing key cannot alias another active node,
one owner is bounded to 64 active admissions, and a discovery-capable node
cannot silently downgrade its renewal to v1.

The `node:read` discovery surface filters capability, role, security, and
remaining lease horizon and returns a Grid-signed result without exposing raw
node public keys. The policy-controlled `node.schedule` action makes a
deterministic all-or-nothing reservation. It accounts for active lease load,
CPU, memory, storage, assignment concurrency, excluded nodes, owner caps, and
optional failure-domain separation. Requirements and placements are encrypted
in Grid, and the requester can inspect effective active, degraded, or expired
state.

Expiry removes a node from discovery; quarantine immediately removes it and
degrades existing placements. Reading a schedule also degrades it if the
selected identity, signed metadata, capabilities, security level, or declared
resources no longer satisfy the original contract. Protected CI signs a drill
covering copied-key admission, capacity exhaustion, owner/domain separation,
quarantine, missed-renewal expiry, schedule expiry, and restart persistence.

This closes discovery and placement reservation inside one authoritative Grid.
It does not prove endpoint reachability, enforce remote resources, dispatch
work, authenticate results, solve global Sybil resistance, run a live WAN
partition, or provide federation/consensus. Those are separate promotion gates
described in the
[operating runbook](operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md).

## Operator-approved online causal exchange

The candidate can exchange already node-signed causal bundles between two
Gateway deployments for one matching authenticated owner. A host relay reads
the owner-filtered source event stream over an exact HTTPS origin, recomputes
each payload and event hash, verifies its attestation against a pinned source
Grid Ed25519 key, and independently verifies every node-signed bundle and
update. It stores cursor, pending bodies, retry state, and receipts in a
bounded AES-256-GCM authenticated-encrypted file with atomic replacement and a
cross-process ownership lock.

Polling cannot authorize destination state. The relay has no approver token.
Every oldest-pending bundle requires a normal `sync.apply` confirmation plus
one active approval from a different destination principal bound to the exact
action, bundle, purpose, and namespace scopes. An owner-isolated destination
receipt endpoint detects committed bundles before approval, preventing
bidirectional echo and safely recovering a lost post-commit response.

Source unavailability, invalid evidence, response overflow, destination
failure, or queue saturation does not advance the affected cursor. Backoff,
attempts, pending count, pending bytes, and receipt history are bounded.
Concurrent version-vector heads remain visible on both Grids; neither relay
chooses a wall-clock or last-write winner. Convergence requires a new signed
update that causally dominates and explicitly names every head.

Protected CI starts two real four-process production supervisors, admits the
same signed nodes, injects a two-direction transport partition, accepts
different concurrent updates, preserves both encrypted cursors, rejoins in
source order through exact independent approvals, proves two visible heads,
applies a complete resolution, and absorbs a fresh duplicate replay without
approval. This is two-Grid causal data exchange, not replicated event-log
consensus, BFT, workload dispatch, arbitrary federation, or independently
hosted WAN evidence. See the
[online causal exchange runbook](operations/ONLINE-CAUSAL-EXCHANGE.md).

## Deployment-independent secret and policy providers

The single-host candidate may start through two independently identified
provider processes instead of direct credential and policy path settings. The
secret provider supplies the data-protection key, API principal registry, and
complete five-service runtime transport generation. The policy provider
supplies one to eight ordered policy layers and the capability registry. Their
provider IDs and pinned Ed25519 key sets must be distinct.

Each provider command uses an absolute executable with a required SHA-256
digest. Adapter scripts and private adapter configuration can be independently
artifact-pinned. The broker uses no shell, inherits only an explicit
workload-identity/proxy allowlist, discards provider standard error, applies a
fixed timeout and response limit, and never places secret values in arguments
or evidence.

Every request has a unique ID, random 32-byte nonce, deployment and provider
audience, canonical short expiry, and an exact resource inventory. A response
must echo the complete request digest, return exactly the requested aliases,
bind byte counts and SHA-256 digests to canonical base64url content, expire
within sixty seconds, and carry an Ed25519 signature from a pinned provider
key. Missing, extra, replayed, expired, oversized, misclassified, malformed,
or wrongly signed resources reject startup.

Only after both responses verify does the broker acquire an exclusive
cross-process runtime-root lease and reject stale content, then create a
private `session-<uuid>` generation. It writes fixed broker-chosen paths, validates the
32-byte data key, API principal registry, every policy layer, the capability
registry, and every active TLS identity/manifest binding, then launches the
ordinary production supervisor. Direct secret/policy variables are mutually
exclusive with provider mode. Normal shutdown and failed validation remove
the exact private generation. Production must place the runtime root on
owner-only bounded ephemeral storage so process-manager cleanup covers
ungraceful host termination.

Protected CI runs a real four-service provider-supervised host twice. It proves
baseline execution, rotates the API registry and policy, rejects the retired
token, accepts the replacement, activates a new deny rule, observes changed
resource versions, removes both private generations, and rejects an invalid
policy-provider signer before service readiness. Grid signs secret-free
`axiom-provider-conformance-evidence.v1`, and the incident tabletop verifies
that artifact as its eleventh same-revision control.

The bundled file adapter is a protocol reference and a bridge for
deployment-mounted custody. It is not evidence for Vault, a cloud secret
manager, KMS/HSM, CSI driver, workload identity, provider availability, live
refresh, multi-host rollout, or independent custody review. Those require the
pilot's actual adapter and authorization policy. See the
[provider runbook](operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md).

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
- the exact current-build setup policy, supported toolchain pins, prohibited
  install lifecycle scripts, and reproducible installation from committed
  locks;
- an unchanged-lock receipt and the expected installed-package count;
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
request-pressure/dependency-loss, independent-service-unit,
node-scheduling, online-causal-partition/rejoin, transport-lifecycle,
credential-rotation, and data-key-rotation evidence from the same commit.
Missing roles or actions, severity drift, expanding authority, late
containment, broken communications cadence, stale evidence, premature
closure, or signature tampering fails the gate. See
[incident response and automated tabletop](security/INCIDENT-RESPONSE-AND-TABLETOP.md).

This candidate exercise does not replace a facilitated pilot exercise with
named primaries and deputies, deployment-specific notification decisions, and
independent human review.

## Pilot evidence intake and independent approval

Pilot promotion evidence must be submitted through the build-bound
`axiom-pilot-deployment-dossier.v1` contract. A separately distributed
Ed25519 policy-authority public key anchors an authority-signed review policy.
That policy fixes one kernel version, source revision, image digest, validity
window, the current 720-hour and SLO/recovery thresholds, and distinct keys for
release manager, platform operator, security reviewer, data/recovery reviewer,
and independent reviewer.

The dossier contains the isolated non-public four-unit deployment declaration,
four distinct trust-root digests, five non-exportable custody controls,
deployment measurements, and 13 exact evidence references and SHA-256
digests. Authentic intake supplies those references as an exact offline
directory containing canonical policy and dossier files plus 13 canonical
v2 evidence envelopes. Each envelope binds the policy-pinned revision and
image, must satisfy the exact semantic contract for its evidence type, and is
signed by the policy-pinned reviewer role assigned to that evidence type. All
five roles also sign the same dossier digest after the observation. Missing,
extra, symlinked, stale, cross-build, reordered, semantically contradictory,
noncanonical, altered, secret-bearing, wrongly signed, or inadequately
measured input fails closed.

The supported verifiers return only
`accepted-for-promotion-review` and `production_promoted: false`. Reviewers
must inspect the evidence details before signing, the exact-package verifier
must authenticate the final reviewed bytes, and the promotion body must record
a later independent decision. The synthetic CI conformance drills cannot be
used as deployment evidence. See
[pilot deployment dossier verification](operations/PILOT-DEPLOYMENT-DOSSIER.md).

## Production promotion gates

All gates must pass:

1. **Scope:** capability registry and operator documentation agree.
2. **Security:** the current threat model, negative paths, credentials, and an
   authentic build-bound independent findings ledger meet policy with no
   unresolved critical/high finding.
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

The pilot dossier and its exact offline evidence package are the intake
envelope for these gates, not an eleventh gate and not an automatic decision.
Every underlying gate must be evidenced.

Independent security-review intake is similarly a verifier, not the review.
Its authentic ledger digest binds the pilot package's
`independent_security_review` evidence, while the separate promotion body
retains the decision. See the
[current-build threat model](security/CURRENT-BUILD-THREAT-MODEL.md) and
[independent review runbook](security/INDEPENDENT-SECURITY-REVIEW.md).

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

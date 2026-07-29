# AXIOM-MESH candidate production runtime

**Applies to:** `0.12.0-dev.0`

The candidate production package runs Gateway, Hypervisor, Sandbox, and Grid as
four supervised Node.js processes inside one hardened container. Only Gateway
binds outside the container. The three internal services remain on loopback,
and every internal call uses mutually authenticated TLS 1.3 with exact active
certificate pinning plus the existing signed/replay-protected request.

## Automated source setup

From a clean current-build checkout, `npm run setup` verifies the supported
Node.js/npm range, installs the root and kernel zero-dependency locks with
lifecycle scripts disabled, proves the locks remain unchanged, and runs the
full clean-kernel and release gates. Protected CI uses
`npm run setup:install` before those gates. The machine-readable setup policy
also binds `.node-version`, the workflow pin, and the candidate Dockerfile to
Node.js 24.18.0.

Source setup does not provision the credentials or state required below. It
does not start or deploy the runtime. See
[`docs/operations/AUTOMATED-SOURCE-SETUP.md`](../docs/operations/AUTOMATED-SOURCE-SETUP.md)
for its exact dependency, receipt, failure, and non-claim boundary.

## 1. Provision outside the repository

Choose two empty, access-controlled host directories. The data directory must
be writable by numeric UID `10001`; the secret directory must not be stored in
source control, container layers, backups without encryption, or release
archives.

```bash
cd mesh
node src/provision-production.mjs \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets
chown -R 10001:10001 /srv/axiom-mesh/data
chown 10001:10001 \
  /srv/axiom-mesh/secrets/data-protection.key \
  /srv/axiom-mesh/secrets/api-tokens.json
chown -R 10001:10001 /srv/axiom-mesh/secrets/transport
chmod 700 /srv/axiom-mesh/data /srv/axiom-mesh/secrets
chmod 700 /srv/axiom-mesh/secrets/transport
```

Provisioning creates four distinct Ed25519 service identities, their trust
records, a 32-byte data-protection key, an API principal registry, and a
separate operator-token file plus a route-restricted
`telemetry-relay.token`. It never prints secret values. A partial secret
set is rejected rather than silently repaired or rotated. It also creates an
Ed25519 transport CA, five distinct 30-day service/probe leaves, URI service
identities, and an exact active-certificate registry under `transport/`. Keep
`operator.token` owned by the host operator; it is not mounted into the
container. Keep `telemetry-relay.token` readable only by the dedicated host
relay account. Only the data-protection key and API registry need to be
readable by container UID `10001`.
The complete single-container candidate also reads the transport directory;
independently deployed units must receive only their own leaf key and public
trust material.

Store an encrypted offline recovery copy before first launch. Losing the data
key makes protected Grid data unrecoverable. Replacing any service key without
a coordinated trust update makes signed internal traffic fail closed.

## 2. Build and start

The image uses the digest-pinned official Node.js `24.18.0-alpine3.23` base.
Set absolute host paths explicitly:

```bash
export AXIOM_DATA_DIR_HOST=/srv/axiom-mesh/data
export AXIOM_GATEWAY_SOCKET_DIR_HOST=/srv/axiom-mesh/run
export AXIOM_DATA_KEY_FILE_HOST=/srv/axiom-mesh/secrets/data-protection.key
export AXIOM_API_TOKENS_FILE_HOST=/srv/axiom-mesh/secrets/api-tokens.json
export AXIOM_TRANSPORT_DIR_HOST=/srv/axiom-mesh/secrets/transport
sudo install -d -o 10001 -g 10001 -m 0750 \
  "${AXIOM_GATEWAY_SOCKET_DIR_HOST}"
docker compose -f compose.production.yml build --pull=false
docker compose -f compose.production.yml up -d
```

The compose policy uses a read-only root filesystem, a non-root numeric user,
all Linux capabilities dropped, no-new-privileges, bounded memory/CPU/PIDs,
explicit secrets, permission-restricted Unix-domain host ingress, bounded
logs, and readiness-based health checks. Compose enforces deny-egress with
`network_mode: "none"` and no attached Docker network. The production
supervisor rejects every active non-loopback or IPv4/IPv6 default route before
it launches any service.
Only the public CA certificate, active manifest, and service-leaf directory
are mounted read-only; the CA signing key remains host-only. Internal URLs
require HTTPS and TLS is fixed to 1.3. CA-valid but inactive leaves are
rejected by exact fingerprint, DNS SAN, and SPIFFE-style URI checks.

Do not disable `AXIOM_REQUIRE_DENY_EGRESS` to accommodate another runtime.
Equivalent orchestrator deployments must reproduce the route rejection and
retain explicit ingress. The Docker daemon, host, bind mount, and access to the
socket-owning group remain trusted. See
[`docs/security/DENY-EGRESS-BOUNDARY.md`](../docs/security/DENY-EGRESS-BOUNDARY.md)
for the proof, rollback rule, and adapter boundary.

### 2.1 Run as independently deployable units

The repository also includes `compose.units.yml`, which runs Gateway, Grid,
Hypervisor, and Sandbox as independently deployable units on a Docker
`internal: true` network. Create isolated unit projections before startup:

```bash
node src/provision-service-units.mjs \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets/transport \
  /srv/axiom-mesh/units
chown -R 10001:10001 /srv/axiom-mesh/units
export AXIOM_UNITS_DIR_HOST=/srv/axiom-mesh/units
docker compose -f compose.units.yml up -d
```

Each projected directory contains exactly that service's private application
identity and private TLS leaf, public trust material, and no CA signing key.
Only Grid receives durable state and the data-protection key. Only Gateway
receives the API token registry. The operator token stays on the host.

The unit network permits required service traffic but has no external route.
Because an internal route must exist, this topology does not use the
single-container supervisor's `network_mode: none` route check; the
orchestrator's internal network is the enforced deny-egress control. Protected
CI proves public TCP failure from a running unit.

The signed host drill starts all four services without the supervisor, kills
only Sandbox, requires Gateway readiness to degrade to HTTP `503`, proves
Gateway, Grid, and Hypervisor remain the same live processes, restarts Sandbox
alone, then verifies readiness and pre-fault Grid state:

```bash
npm run service-units:drill -- /tmp/axiom-service-unit-drill \
  > /tmp/axiom-service-unit-drill-evidence.json
```

See the
[independent-service runbook](../docs/operations/INDEPENDENT-SERVICE-UNITS.md)
for projection, rotation, recovery, network-policy, and non-claim details. The
four-unit topology remains a single-host candidate. It does not claim Grid
replication, automatic failover, or a live deployment.

## 3. Verify readiness

Liveness discloses only process state:

```bash
sudo curl --fail \
  --unix-socket /srv/axiom-mesh/run/gateway.sock \
  http://localhost/health
sudo curl --fail \
  --unix-socket /srv/axiom-mesh/run/gateway.sock \
  http://localhost/ready
```

Operational details and OpenMetrics require a principal with
`operations:read` (the initial production operator has `*`). The separately
provisioned relay principal has `telemetry:collect`, which Gateway accepts only
on `/v1/operations` and `/v1/metrics`:

```bash
TOKEN="$(tr -d '\n' </srv/axiom-mesh/secrets/operator.token)"
sudo curl --fail \
  --unix-socket /srv/axiom-mesh/run/gateway.sock \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost/v1/operations
sudo curl --fail \
  --unix-socket /srv/axiom-mesh/run/gateway.sock \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost/v1/metrics
```

Readiness fails when Grid, Hypervisor, or Sandbox is unavailable or when Grid
evidence verification fails. Metrics expose bounded service/status/error
categories only: no principal, intent, capsule, route parameter, query string,
prompt, payload, token, or object identifier becomes a metric label.
Grid deep integrity results are cached for 30 seconds by default, so frequent
health probes do not repeatedly scan an unbounded evidence history.

### 3.1 Verify and rotate internal transport credentials

Inspect public transport metadata:

```bash
npm run rotate:transport -- verify /srv/axiom-mesh/secrets
```

For a scheduled leaf rotation, stop the complete runtime and run:

```bash
npm run rotate:transport -- rotate /srv/axiom-mesh/secrets
```

The command stages and validates one complete generation before an atomic
directory swap. Restart the complete runtime, verify readiness, and exercise a
low-risk intent. A retired CA-valid leaf is rejected by the active pin
registry. If verification fails, stop the runtime and restore the exact prior
generation:

```bash
npm run rotate:transport -- rollback /srv/axiom-mesh/secrets
```

The current lifecycle is offline and single-host. External CA custody,
per-unit secret mounts, orchestrator rollout, and CA-compromise recovery
remain pilot gates. Run the signed disposable exercise with:

```bash
npm run transport:drill -- /tmp/axiom-transport-drill \
  > /tmp/axiom-transport-drill-evidence.json
```

See
[`docs/operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md`](../docs/operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md).

## 4. Exercise recovery on a disposable host

The recovery drill accepts only an explicitly named empty workspace. It
provisions independent file-backed production credentials, creates and
attests an encrypted Grid backup, rejects a tampered snapshot, proves that a
live restore and an incorrect expected digest fail closed, restores the exact
snapshot, preserves the replaced database for rollback, reopens Grid, and
verifies the signed evidence chain.

```bash
mkdir -m 700 /tmp/axiom-recovery-drill
npm run recovery:drill -- /tmp/axiom-recovery-drill \
  > /tmp/axiom-recovery-drill-evidence.json
```

The JSON evidence includes the kernel version, source revision when supplied
by CI, backup and database digests, a relative rollback-artifact path, the
deliberately injected one-business-event recovery point, measured backup and
recovery durations, all pass/fail assertions, an ephemeral Grid public key,
and an Ed25519 attestation. It excludes the generated data key, operator
token, private keys, and absolute host paths.

The protected Clean Kernel workflow repeats this exercise on a fresh GitHub
runner and retains the signed evidence artifact for 90 days. This validates
the recovery mechanism; it does not replace scheduled restoration using
pilot-owned backup media, keys, retention policy, and operator approval.

### Retain and re-verify encrypted backups

The supported retention workflow is plan-first and never immediately deletes
media. `config/backup-retention.json` requires at least two verified backups,
keeps the latest seven, and makes older backups eligible after 30 days. Create
a signed plan while the service is available:

```bash
npm run backup:maintain -- plan \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets/data-protection.key \
  config/backup-retention.json \
  /srv/axiom-mesh/retention-plan.json
```

The planner authenticates and decrypts every candidate, verifies its signed
manifest, schema and complete Grid evidence chain, and derives the decision
from policy. Review and retain the plan as change evidence. Stop the supervisor
or Compose deployment, then apply exactly that file:

```bash
npm run backup:maintain -- apply \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets/data-protection.key \
  /srv/axiom-mesh/retention-plan.json
```

Apply rejects a running Grid, altered plan, changed inventory, unsafe path,
invalid artifact, or minimum-count violation. Excess backups are atomically
moved—not deleted—to
`data/backups/.retired/<backup-retention-plan-id>/`. The signed receipt is
written under `data/recovery/backup-retention/receipts/` and copied into the
quarantine directory. If power or process loss interrupts the move, keep Grid
stopped and rerun `apply`, or resume from the signed on-host journal:

```bash
npm run backup:maintain -- recover \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets/data-protection.key
```

Quarantined backup envelopes and their protected SQLite columns participate in
later data-key rotation and rollback. Do not remove quarantine until the
pilot's independent-media copy, retention window, restore result, destruction
authorization, and change record are complete.

Use the disposable lifecycle drill to prove planning, live-lock and tamper
rejection, minimum retention, recoverable quarantine, receipt verification,
idempotency, and exact restore of a retained backup:

```bash
mkdir -m 700 /tmp/axiom-backup-lifecycle-drill
npm run backup-lifecycle:drill -- /tmp/axiom-backup-lifecycle-drill \
  > /tmp/axiom-backup-lifecycle-evidence.json
```

Protected CI runs it on every relevant change and on a weekly schedule,
uploading `axiom-backup-lifecycle-evidence-<commit>` for 90 days. This closes
the candidate-host mechanism and recurring disposable verification only. A
scheduled operator restore from pilot-owned media and pilot-owned keys remains
a production-promotion gate.

## 5. Establish the controlled SLO baseline

Use a different explicitly empty workspace for the short host-mode load and
restart profile:

```bash
mkdir -m 700 /tmp/axiom-slo-drill
npm run slo:drill -- /tmp/axiom-slo-drill \
  > /tmp/axiom-slo-baseline-evidence.json
```

The fixed profile uses the production supervisor, file-backed credentials,
the production rate-limit configuration, four warmup requests, and 40 measured
requests for `system.echo` at concurrency 4. It requires zero measured request
errors, ready state before and after load, no 5xx or internal-error increase,
p95 latency at or below the initial two-second candidate target, a complete
stop/start cycle within 20 seconds, and a successful post-restart intent.

The signed evidence reports cold-start and restart time, min/mean/p50/p95/p99/
max latency, throughput, per-service request and error deltas, process-lifetime
peak in-flight requests, post-load memory, and process CPU time. The protected
Clean Kernel workflow retains
`axiom-slo-baseline-evidence-<commit>` for 90 days.

The drill compares post-load resident memory with the candidate container's
512 MiB ceiling. Host mode does not enforce the candidate two-CPU ceiling, so
CPU utilization is recorded for diagnosis and sizing rather than used as a
container-limit claim. The short disposable-runner profile is not dedicated
pilot hardware, a remote network path, an external-adapter profile, or a
30-day availability measurement. Repeat it under the actual pilot resource
policy and expected traffic mix before production promotion.

All host-side real-stack drills hold a cross-process port-block lease for their
complete lifetime, including stopped-runtime rotation and restart windows.
Four-port candidates are aligned so leases cannot partially overlap,
atomically coordinated through the operating-system temporary directory, and
independently checked for socket availability. A dead owner can be reclaimed
only after the bounded stale interval; active ownership cannot be replaced.
Lease paths and process identifiers are not included in signed release
evidence. This is drill coordination, not production network authority.

## 5.1 Exercise request-pressure and dependency-loss

Use another explicitly empty Linux workspace for the bounded resilience
profile:

```bash
mkdir -m 700 /tmp/axiom-resilience-drill
npm run resilience:drill -- /tmp/axiom-resilience-drill \
  > /tmp/axiom-resilience-drill-evidence.json
```

The fixed policy starts the real four-process production supervisor with a
4 KiB request-body ceiling and a capacity-10, refill-one-per-second token
bucket. It proves that an 8 KiB request returns `413` without reserving its
idempotency key, and that a 24-request concurrent burst produces only accepted
or `429` outcomes while the service remains recoverable.

The same run uses the supervisor's private parent-process inventory to suspend
the actual Sandbox process. Authenticated operations must report Gateway,
Hypervisor, and Sandbox degradation, `/ready` must return `503`, and bounded
dependency alerts must appear. Killing Sandbox must make the supervisor exit
fail-closed within ten seconds. A clean full-stack restart must preserve the
pre-fault Grid record and accept a new authenticated intent.

Protected CI retains Grid-signed,
`axiom-resilience-drill-evidence-<commit>` for 90 days and binds it into the
same-revision incident tabletop. The artifact excludes process identifiers,
host paths, request bodies, intent identifiers, and secrets. This is
request-path and dependency-process evidence; it is not cgroup OOM/CPU,
disk-pressure, orchestrator rescheduling, pilot-platform, or human-response
evidence. Repeat those controls under the pilot resource policy. See
[`docs/operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md`](../docs/operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md).

## 5.2 Run the host-side telemetry relay

The host-side telemetry relay keeps the four-process container deny-egress.
It scrapes only the permission-restricted Gateway Unix socket, validates the
exact four-service topology, exports 68 fixed OTLP/HTTP JSON metric points, and
routes a fixed Alertmanager v2 vocabulary. Create an untracked destination
file with exact HTTPS origins and absolute private receiver-credential files,
following
[`docs/operations/EXTERNAL-TELEMETRY-AND-ALERTING.md`](../docs/operations/EXTERNAL-TELEMETRY-AND-ALERTING.md).

Run the relay as a dedicated unprivileged host account:

```bash
npm run telemetry-relay:start -- \
  /srv/axiom-mesh/run/gateway.sock \
  /srv/axiom-mesh/secrets/telemetry-relay.token \
  /etc/axiom-mesh/telemetry-destinations.json \
  /var/lib/axiom-telemetry-relay
```

The destination adapter requires exact allowlisted HTTPS origins, fixed
protocol paths, no redirects, private file-backed credentials, bounded
receiver responses, and verified TLS. Its persistent state limits the queue to
64 items and 1 MiB, reserves 16 positions for alerts, coalesces stale metrics,
retries transient failures at most five times with bounded exponential delay,
uses stable idempotency keys, and records secret-free delivery, retry, receipt,
and dead-letter outcomes. Stop the relay to disable external delivery without
changing kernel isolation.

Protected CI runs the real host-mode Unix-socket telemetry relay drill:

```bash
npm run telemetry-relay:drill -- /tmp/axiom-telemetry-relay-drill \
  > /tmp/axiom-telemetry-relay-evidence.json
```

It proves missing authentication returns `401`, the relay token receives `403`
outside its two routes, bounded OTLP and alerts are produced, a 503 and 429
are retried, the queue drains after two receiver receipts, and credential
material is absent from Grid-signed evidence. This is candidate evidence, not
evidence of operator-owned external receivers or a human acknowledgement.
The separate same-revision container job proves deny-egress; this host-mode
drill does not replace that network-policy proof.

## 6. Rotate service, operator, and telemetry credentials

Credential rotation is an offline maintenance operation. Stop the production
supervisor or Compose deployment first. The command acquires the Grid runtime
lock before reading or changing credentials, so a running Grid or a competing
startup makes the operation fail closed.

Make an encrypted, access-controlled backup of both host directories before
the change. Then rotate all four Ed25519 service identities, their coordinated
trust records, the production operator API token, and the least-privilege
telemetry relay token:

```bash
npm run rotate:production -- rotate \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets
```

The command never prints a token, private key, or data-protection key. It
prints the rotation identifier, old and new public key identifiers, and the
path to a signed manifest under
`data/credential-rotations/<rotation-id>/manifest.json`. Before installing the
new files, it encrypts the exact prior credential set with AES-256-GCM using
the existing data-protection key and writes `rollback.axr`. A persisted
maintenance marker protects interrupted multi-file changes; ordinary write
failures restore the original files automatically.

The manifest is attested by both the retiring and successor Grid identities.
It records public keys and target authentication values without credential
values. Token-bearing files use HMAC-SHA256 with a dedicated key derived from
the data-protection key through HKDF; the public manifest therefore does not
publish an offline token-hash oracle. Grid uses the dual-signed lineage to
verify evidence written on either side of a rotation; retired private keys are
not retained. Restart the complete stack and verify `/ready`, authenticated
`/v1/operations`, and an authorized intent. Distribute the new operator and
telemetry relay tokens only through approved secret channels. Each retired
token must return `401`, and the active relay token must still receive `403`
from non-telemetry routes.

If post-change validation fails, stop the stack and use the exact manifest
path printed by the rotation:

```bash
npm run rotate:production -- rollback \
  /srv/axiom-mesh/data/credential-rotations/<rotation-id>/manifest.json \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets
```

Rollback authenticates and decrypts `rollback.axr`, verifies every fixed target
against the signed manifest, preserves the rotated set as encrypted
`forward.axr`, restores the original identities, trust records, registry, and
operator and telemetry relay tokens, and writes an attested
`rollback-result.json`. It rejects a
different pending rotation or drift from the signed rotated state. Only when a
matching pending marker exists, rollback may prove that the recorded runtime
process no longer exists and quarantine its stale lock under
`data/recovery/stale-runtime-locks/`; a live or ambiguous owner still blocks
the operation.

This operation deliberately does **not** rotate
`data-protection.key`. That key protects Grid state and the rollback package;
use the separate stopped-runtime procedure below. This procedure also does not prove revocation of
credentials exposed in deprecated repository history; that requires an
external custody and trust-inventory record.

Exercise the complete sequence only in an explicitly empty disposable
workspace:

```bash
mkdir -m 700 /tmp/axiom-credential-rotation-drill
npm run credential-rotation:drill -- /tmp/axiom-credential-rotation-drill \
  > /tmp/axiom-credential-rotation-evidence.json
```

The drill starts the real four-process stack before rotation, after rotation,
and after rollback. It proves successful intents with the active credential
set, `401` rejection of the retired and rolled-back tokens, acceptance of each
active service identity, rejection of each inactive service identity,
route-limited relay access, exact credential restoration, unchanged data-key
custody, and clean shutdown. Its
secret-free JSON is Ed25519-attested and retained by protected CI for 90 days.

## 6.1 Verify the deprecated credential boundary

The credential-history audit is a release and protected-CI control, not a
runtime command. It requires the external 32-byte audit HMAC key and a checkout
that includes immutable tag
`archive/legacy-main-pre-clean-room-2026-05-21`:

```bash
export AXIOM_CREDENTIAL_AUDIT_KEY='<base64url value from approved custody>'
npm run credential-history:audit \
  > /tmp/axiom-credential-history-audit-evidence.json
```

Never paste the audit key into a ticket, log, checked-in environment file, or
command argument. The command rescans all reachable deprecated objects,
requires exact agreement with the 32-entry secret-free ledger, checks that all
entries are revoked from supported repository trust, and rejects a matching
value in the supported tip. Its signed evidence contains only HMAC
identifiers, counts, digests, and outcomes.

This check does not close the external revocation gate. Before production
promotion, follow
[`docs/security/CREDENTIAL-HISTORY-REVOCATION.md`](../docs/security/CREDENTIAL-HISTORY-REVOCATION.md)
to record a provider/custodian receipt or an independently reviewed
not-applicable rationale for each pending entry.

## 7. Rotate the data-protection key

Data-key rotation is a separate offline maintenance transaction. Stop the
complete supervisor or Compose deployment and preserve access-controlled
copies of both host directories. Use a unique external change record and run:

```bash
npm run rotate:data-key -- rotate \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets
```

The command acquires the Grid runtime lock, creates a new 256-bit key, and
re-encrypts every supported context: protected columns in the live Grid,
recovery rollback databases, backup snapshot envelopes and their nested
protected columns, and retained credential rollback/forward packages. It does
not rotate service identities or API tokens.

Each changed protected artifact receives a Grid-signed
`.key-rotation.json` sidecar. The recursive sidecar chain binds current
ciphertext to the original signed artifact metadata; for backup databases it
also binds each transformed plaintext digest while preserving the signed
schema and evidence head. The rotation manifest under
`data/data-key-rotations/<rotation-id>/manifest.json` records public digests,
counts, evidence state, encrypted recovery envelopes, and the prior active
rotation pointer. It contains no data key.

The multi-file cutover stages and verifies all replacements, records an
on-disk transaction journal, replaces the key file last, and automatically
restores originals after ordinary failures. If the process is killed during
the cutover, the matching pending marker authorizes rollback to prove and
quarantine only a stale runtime lock and unwind the recorded file operations.
A live lock owner remains authoritative.

Restart the complete stack and verify readiness, operations, one pre-rotation
intent, one new intent, and at least one backup restore under the new key.
Starting the same database with the retired key must fail authentication.
Retain the old key only in the approved offline escrow until the acceptance
window closes; later destruction or revocation must be evidenced by the
external secret custodian.

Only the active data-key rotation can be rolled back:

```bash
npm run rotate:data-key -- rollback \
  /srv/axiom-mesh/data/data-key-rotations/<rotation-id>/manifest.json \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets
```

Rollback authenticates the manifest and prior-key envelope, re-encrypts the
current live Grid and supported recovery contexts under the prior key, and
preserves evidence written after rotation. New backups or credential recovery
packages created during the acceptance window are included; an artifact that
existed at rotation may not disappear or change identity silently. The active
pointer moves back one transition and an attested `rollback-result.json` is
written. To keep credential manifests created during the acceptance window
verifiable after data-key rollback, the result retains only their derived
state-authentication key encrypted under the restored key; it does not retain
the retired data-encryption key.

Exercise the full real-stack path in an explicitly empty disposable workspace:

```bash
mkdir -m 700 /tmp/axiom-data-key-rotation-drill
npm run data-key-rotation:drill -- /tmp/axiom-data-key-rotation-drill \
  > /tmp/axiom-data-key-rotation-evidence.json
```

The drill proves both wrong-key rejection directions, nested backup
re-encryption and restore, post-rotation evidence preservation, recovery-copy
re-encryption, exact original-key restoration, and clean four-process
shutdown. Separate fault-injection tests kill both rotation and rollback
cutovers, including the boundary after rollback installation but before
evidence finalization. Protected CI retains the signed,
secret-free drill evidence for 90 days.

## 12. Admitted-node discovery and scheduling

The candidate implements admitted-node discovery and scheduling as an
authenticated Grid reservation control. A signed v2 admission binds the node
identity, owner, capability/security/software statement, HTTPS origin, failure
domain, roles, resource ceilings, and expiry. `GET /v1/node-discovery`
requires `node:read`, applies bounded filters, excludes expired or quarantined
nodes, omits raw node keys, and returns a Grid-signed result.

The `node.schedule` intent follows Gateway, Hypervisor, Sandbox, and Grid. It
creates only a complete deterministic placement within remaining admission
lease, declared CPU/memory/storage, assignment concurrency, minimum security,
capabilities, roles, exclusions, optional failure-domain separation, and
per-owner limits. Grid encrypts both the requirements and placements.
Quarantine degrades affected schedules immediately; reads also derive
degradation or expiry from the current admission contract.

Exercise the signed control in an explicitly empty disposable workspace:

```bash
npm run node-scheduling:drill -- /tmp/axiom-node-scheduling-drill \
  > /tmp/axiom-node-scheduling-drill-evidence.json
```

The Grid-signed evidence covers copied-key alias rejection, distinct
owner/domain placement, capacity exhaustion, quarantine degradation,
partition-by-missed-renewal expiry, schedule expiry, and restart persistence.
Protected CI retains it for 90 days and includes it in the same-revision
incident composition. See
[`docs/operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md`](../docs/operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md).

This is an auditable reservation, not a remote-execution grant. It does not
contact node endpoints, measure their resources, transport workloads,
authenticate results, solve global Sybil resistance, or provide federation,
replicated Grid, or consensus.

## 13. Operator-approved online causal exchange

The operator-approved online causal exchange host relay moves existing
node-signed causal bundles between two
exact Gateway origins for one matching owner. It verifies each source event
against a pinned Grid Ed25519 key, independently verifies each node bundle,
and stores its cursor, ordered pending queue, retry state, and receipts in an
AES-256-GCM authenticated-encrypted atomic file. Production configuration is
based on
[`config/online-causal-sync.example.json`](config/online-causal-sync.example.json);
tokens and the separate 32-byte state key remain private external files.

Polling or continuous `run` mode only stages data. The relay has no approver
credential. Applying the first pending descriptor requires an ordinary
one-use approval from a different destination principal, bound to the status
record's exact request digest:

```bash
npm run online-sync -- poll /etc/axiom-mesh/source-to-destination.json
npm run online-sync -- status /etc/axiom-mesh/source-to-destination.json
npm run online-sync -- apply \
  /etc/axiom-mesh/source-to-destination.json \
  <bundle_digest> \
  <approval_id>
```

Configure the reverse direction with a different state file and key.
Owner-scoped destination preflight absorbs echo and ambiguous post-commit
responses before another approval is consumed. Invalid evidence, unavailable
origins, response overflow, queue saturation, and partition preserve the
affected cursor and enter bounded backoff.

Exercise both directions against two real production supervisors:

```bash
npm run online-sync:drill -- /tmp/axiom-online-causal-sync-drill \
  > /tmp/axiom-online-causal-sync-drill-evidence.json
```

The signed evidence covers encrypted-state reload, two-direction partition
and rejoin, source-order apply, exact independent approvals, visible
concurrent heads on both Grids, explicit all-head convergence, and duplicate
absorption without approval. See
[`docs/operations/ONLINE-CAUSAL-EXCHANGE.md`](../docs/operations/ONLINE-CAUSAL-EXCHANGE.md).
This is causal record transport, not replicated Grid consensus, BFT, workload
dispatch, or independently hosted WAN evidence.

## 14. Deployment-independent provider startup

The existing file-backed path remains supported. A pilot may instead set the
private `AXIOM_PROVIDER_CONFIG` path and start:

```bash
npm run provider:start
```

In provider mode, direct data-key, API-token, transport, policy, and
capability-registry variables must be unset. The wrapper executes separate
secret and policy providers with absolute digest-pinned commands, no shell,
bounded time and output, and only explicitly allowlisted workload-identity
environment. Their Ed25519 provider IDs and trust keys must be independent.

Every provider response is short-lived and bound to a random startup nonce,
deployment ID, request ID, exact resource set, media types, byte limits, and
content digests. The broker validates the data key, API principals, policy
layers, capability registry, and all five active internal TLS identities
before it starts the ordinary supervisor. It materializes only one private
`session-<uuid>` generation under the configured ephemeral runtime directory
and removes it on normal shutdown or failed validation.

Use the examples in
[`config/provider-runtime.example.json`](config/provider-runtime.example.json),
[`config/provider-secret-file-adapter.example.json`](config/provider-secret-file-adapter.example.json),
and
[`config/provider-policy-file-adapter.example.json`](config/provider-policy-file-adapter.example.json).
The zero digests are non-authorizing placeholders; replace them with the exact
installed executable and artifact digests.

Run the real-stack conformance proof:

```bash
npm run provider:drill -- /tmp/axiom-provider-conformance \
  > /tmp/axiom-provider-conformance-evidence.json
```

It proves baseline startup, API-principal and policy rotation across restart,
retired-token rejection, deny-policy activation, exact generation cleanup,
and invalid-signer rejection before runtime. The reference file adapter proves
the protocol, not the pilot's Vault, cloud secret manager, HSM/KMS, CSI,
workload identity, backend availability, or live refresh. Repeat with the
pilot-owned adapter and ephemeral runtime storage. See
[`docs/operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md`](../docs/operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md).

## 15. Coordinated incident tabletop

The machine-readable
[`config/incident-response.json`](config/incident-response.json) policy defines
four severities, six independently assigned response roles,
authority-reducing actions, activation and containment targets, communication
cadence, and mandatory closure conditions. Unknown signals fail
classification instead of defaulting to low severity.

After producing recovery, backup-lifecycle, SLO/restart, resilience,
service-unit, node-scheduling, online-causal-sync, provider-runtime, transport,
credential-rotation, and data-key-rotation evidence for one commit, compose
the eleven same-revision
records into the automated
incident tabletop:

```bash
export GITHUB_SHA=<40-character-source-revision>
npm run incident-tabletop:drill -- \
  /tmp/axiom-incident-tabletop \
  /tmp/axiom-recovery-drill-evidence.json \
  /tmp/axiom-backup-lifecycle-evidence.json \
  /tmp/axiom-slo-baseline-evidence.json \
  /tmp/axiom-resilience-drill-evidence.json \
  /tmp/axiom-service-unit-drill-evidence.json \
  /tmp/axiom-node-scheduling-drill-evidence.json \
  /tmp/axiom-online-causal-sync-drill-evidence.json \
  /tmp/axiom-provider-conformance-evidence.json \
  /tmp/axiom-transport-drill-evidence.json \
  /tmp/axiom-credential-rotation-evidence.json \
  /tmp/axiom-data-key-rotation-evidence.json \
  > /tmp/axiom-incident-tabletop-evidence.json
```

The drill independently verifies every companion signature and revision,
classifies an evidence-integrity and suspected-credential scenario as SEV-1,
checks evidence-first chronology and response targets, and signs a secret-free
composition record. Protected CI retains
`axiom-incident-tabletop-evidence-<commit>` for 90 days. This automated
incident tabletop is candidate evidence; production promotion still requires
a facilitated pilot exercise with named responders, deployment-specific
notification decisions, corrective owners, and independent human review. See
[`docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md`](../docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md).

## 16. Pilot dossier verification

After the actual pilot observation and independent reviews—not during
candidate CI—use the dossier-only command for a secret-free metadata
preflight:

```bash
npm run pilot:dossier:verify -- \
  /secure-review/pilot-dossier.json \
  /secure-review/pilot-review-policy.json \
  /secure-review/pilot-policy-authority-public.pem
```

Pilot dossier verification requires a separately distributed policy-authority
key, five distinct review identities, the exact source revision and immutable
image digest, at least 720 continuous observation hours, current SLO and
recovery results, four trust roots, five non-exportable custody controls, and
13 unique deployment-specific evidence digests. Private keys, direct
credentials, secret values, stale records, weak measurements, missing
artifacts, and changed approvals fail closed.

`npm run pilot:dossier:drill` creates signed synthetic verifier-conformance
evidence only. It declares that no live pilot was observed. Even an authentic
dossier verifies only as accepted for a separate promotion review and always
reports `production_promoted: false`. See
[`docs/operations/PILOT-DEPLOYMENT-DOSSIER.md`](../docs/operations/PILOT-DEPLOYMENT-DOSSIER.md).

### Offline pilot evidence package verification

Authentic intake must verify the complete offline package:

```bash
npm run pilot:package:verify -- \
  /secure-review/pilot-evidence-package \
  /separate-trust/pilot-policy-authority-public.pem
```

The package root must contain only canonical `policy.json`, canonical
`dossier.json`, and an `evidence/` directory with the exact 13 canonical
v2 evidence envelopes. Every envelope must be a bounded regular file, match
its dossier digest and build, satisfy its type-specific detail contract,
contain no secret material, and carry the valid signature of the policy-pinned
reviewer role assigned to that evidence type. Unexpected, missing,
semantically contradictory, noncanonical, cross-build, wrongly signed, or
symlinked input fails closed.

`npm run pilot:package:drill` creates separately signed synthetic package
conformance evidence and proves accepted exact inventory plus rejection of
unexpected files, missing files, noncanonical JSON, wrong producer roles, and
dossier-inconsistent detail fields or secret fields. It observes no live pilot
and cannot promote production.

This package is a production container specification and local deployment
surface. Its source and fail-closed supervisor are statically verified, and the
real four-process stack, digest-pinned image build, composed container
readiness, disposable-host recovery drill, controlled SLO/restart baseline,
request-pressure and dependency-loss drill, coordinated credential-rotation
drill, mutually authenticated transport lifecycle drill, data-key rotation
drill, admitted-node discovery and scheduling drill, operator-approved online
causal exchange drill, signed provider conformance drill, signed deny-egress
probe, host-side telemetry relay drill, automated incident tabletop, and
synthetic pilot dossier and exact-package verifier conformance are protected
CI gates. Protected CI also signs synthetic independent-security-review
verifier conformance, proving rejection of build, scope, owner, finding,
exception, summary, secret, and signature drift while explicitly declaring
that no independent review was performed. Authentic review intake uses:

```bash
npm run security-review:verify -- \
  findings.json \
  review-policy.json \
  review-policy-authority-public.pem
```

The exact contract and required current-build threat model are in the
[independent security review runbook](../docs/security/INDEPENDENT-SECURITY-REVIEW.md).
Verifier conformance is not evidence of a live deployment, remote node execution,
federated discovery, BFT consensus, audited arbitrary-code isolation, or
external settlement.

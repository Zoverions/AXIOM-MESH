# AXIOM-MESH candidate production runtime

**Applies to:** `0.12.0-dev.3`

**Updated:** 2026-08-12

The candidate production package runs Gateway, Hypervisor, Sandbox, and Grid as
four supervised Node.js processes inside one hardened container. Only Gateway
binds outside the container. The three internal services remain on loopback,
and every internal call uses mutually authenticated TLS 1.3 with exact active
certificate pinning plus the existing signed/replay-protected request.

These candidate controls are **not evidence of a live deployment**.

The repository also contains production-unreachable resolver/outbox/repository-
operator and Agent Runtime Adapter development slices. They are **not** part of
this supported candidate runtime: production has no repository executor mapping,
no `repository.docs.pull-request.create` policy action, and no supported route
into that chain. The docs-only operator has no merge/direct-main authority.

## Automated source setup

From a clean current-build checkout, `npm run setup` verifies the supported
Node.js/npm range, installs the root and kernel zero-dependency locks with
lifecycle scripts disabled, proves the locks remain unchanged, and runs the
full clean-kernel and release gates. Protected CI uses
`npm run setup:install` before those gates.

The machine-readable setup policy intentionally uses separate exact pins:

- protected CI and `.node-version`: Node.js **24.18.0**;
- candidate production Dockerfile/image: Node.js **24.19.0**.

Both remain inside the supported `>=24.14.0 <25` engine range. Source setup
does not provision the credentials or state required below and does not start
or deploy the runtime. See
[`docs/operations/AUTOMATED-SOURCE-SETUP.md`](../docs/operations/AUTOMATED-SOURCE-SETUP.md)
for the exact dependency, receipt, failure, and non-claim boundary.

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
`telemetry-relay.token`. It never prints secret values. A partial secret set is
rejected rather than silently repaired or rotated. It also creates an Ed25519
transport CA, five distinct 30-day service/probe leaves, URI service identities,
and an exact active-certificate registry under `transport/`.

Keep `operator.token` owned by the host operator; it is not mounted into the
container. Keep `telemetry-relay.token` readable only by the dedicated host
relay account. Only the data-protection key and API registry need to be readable
by container UID `10001`. The complete single-container candidate also reads
the transport directory; independently deployed units must receive only their
own leaf key and public trust material.

Store an encrypted offline recovery copy before first launch. Losing the data
key makes protected Grid data unrecoverable. Replacing any service key without
a coordinated trust update makes signed internal traffic fail closed.

## 2. Build and start

The image uses the digest-pinned official Node.js **`24.19.0-alpine3.23`** base.
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

The Compose policy uses a read-only root filesystem, a non-root numeric user,
all Linux capabilities dropped, no-new-privileges, bounded memory/CPU/PIDs,
explicit secrets, permission-restricted Unix-domain host ingress, bounded logs,
and readiness-based health checks. Compose enforces deny-egress with
`network_mode: "none"` and no attached Docker network. The production
supervisor rejects every active non-loopback interface or IPv4/IPv6 default
route before it launches a service.

Only the public CA certificate, active manifest, and service-leaf directory are
mounted read-only; the CA signing key remains host-only. Internal URLs require
HTTPS and TLS is fixed to 1.3. CA-valid but inactive leaves are rejected by
exact fingerprint, DNS SAN, and SPIFFE-style URI checks.

Do not disable `AXIOM_REQUIRE_DENY_EGRESS` to accommodate another runtime.
Equivalent orchestrator deployments must reproduce route rejection and retain
explicit ingress. The Docker daemon, host, bind mounts, and access to the
socket-owning group remain trusted. See
[`docs/security/DENY-EGRESS-BOUNDARY.md`](../docs/security/DENY-EGRESS-BOUNDARY.md).

### 2.1 Run as independently deployable units

The repository also includes `compose.units.yml`, which runs Gateway, Grid,
Hypervisor, and Sandbox as independently deployable units across four exact
Docker `internal: true` network segments. Create isolated unit projections
before startup:

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

The unit topology permits required service traffic but has no external route.
`gateway-hypervisor`, `gateway-grid`, `hypervisor-grid`, and
`hypervisor-sandbox` remove unrelated adjacency. The bundled default-deny
policy additionally authorizes only 40 exact caller/destination/method/route
combinations at both sending and receiving services and derives inbound mTLS
peer allowlists. Because internal routes must exist, this topology does not use
the single-container supervisor's `network_mode: none` route check; segmented
internal networks plus application and transport allowlists are the boundary.
Protected CI proves the required path, Gateway-to-Sandbox denial,
Sandbox-to-Grid denial, Grid-to-Sandbox denial, and public TCP failure from a
running unit.

Verify exact policy and Compose membership before startup:

```bash
npm run network-policy:check
```

See the
[explicit service-network runbook](../docs/operations/EXPLICIT-SERVICE-NETWORK-POLICY.md)
for route inventory, enforcement, negative probes, rollback, and orchestrator
equivalence requirements.

The signed host drill starts all four services without the supervisor, kills
only Sandbox, requires Gateway readiness to degrade to HTTP `503`, proves
Gateway, Grid, and Hypervisor remain the same live processes, restarts Sandbox
alone, then verifies readiness and pre-fault Grid state:

```bash
npm run service-units:drill -- /tmp/axiom-service-unit-drill \
  > /tmp/axiom-service-unit-drill-evidence.json
```

See
[`docs/operations/INDEPENDENT-SERVICE-UNITS.md`](../docs/operations/INDEPENDENT-SERVICE-UNITS.md).
This topology remains a single-host candidate. It does not claim Grid
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

Operational details and OpenMetrics require a principal with `operations:read`
(the initial production operator has `*`). The separately provisioned relay
principal has `telemetry:collect`, which Gateway accepts only on
`/v1/operations` and `/v1/metrics`:

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
prompt, payload, token, or object identifier becomes a metric label. Grid deep
integrity results are cached for 30 seconds by default so frequent probes do
not repeatedly scan unbounded history.

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
low-risk intent. A retired CA-valid leaf is rejected by the active pin registry.
If verification fails, stop the runtime and restore the exact prior generation:

```bash
npm run rotate:transport -- rollback /srv/axiom-mesh/secrets
```

The current lifecycle is offline and single-host. External CA custody,
per-unit secret mounts, orchestrator rollout, and CA-compromise recovery remain
pilot gates. Run the signed disposable exercise with:

```bash
npm run transport:drill -- /tmp/axiom-transport-drill \
  > /tmp/axiom-transport-drill-evidence.json
```

See
[`docs/operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md`](../docs/operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md).

## 4. Exercise recovery on a disposable host

The recovery drill accepts only an explicitly named empty workspace. It
provisions independent file-backed production credentials, creates and attests
an encrypted Grid backup, rejects a tampered snapshot, proves live restore and
incorrect expected digest fail closed, restores the exact snapshot, preserves
the replaced database for rollback, reopens Grid, and verifies the signed chain.

```bash
mkdir -m 700 /tmp/axiom-recovery-drill
npm run recovery:drill -- /tmp/axiom-recovery-drill \
  > /tmp/axiom-recovery-drill-evidence.json
```

The JSON evidence includes kernel version, source revision when supplied by CI,
backup/database digests, relative rollback path, injected recovery point,
measured backup/recovery durations, pass/fail assertions, an ephemeral Grid
public key, and Ed25519 attestation. It excludes generated data keys, operator
tokens, private keys, and absolute host paths.

Protected CI repeats this on a fresh runner and retains signed evidence for 90
days. This proves the recovery mechanism; it does not replace scheduled restore
from pilot-owned media and keys.

### Retain and re-verify encrypted backups

`config/backup-retention.json` is plan-first and never immediately deletes
media. It requires at least two verified backups, keeps the latest seven, and
makes older backups eligible after 30 days.

Create a signed plan while service is available:

```bash
npm run backup:maintain -- plan \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets/data-protection.key \
  config/backup-retention.json \
  /srv/axiom-mesh/retention-plan.json
```

The planner authenticates/decrypts every candidate, verifies its manifest,
schema, and complete Grid chain, then derives the decision from policy. Review
and retain the plan as change evidence. Stop the runtime, then apply exactly
that file:

```bash
npm run backup:maintain -- apply \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets/data-protection.key \
  /srv/axiom-mesh/retention-plan.json
```

Apply rejects a running Grid, altered plan, changed inventory, unsafe path,
invalid artifact, or minimum-count violation. Excess backups enter recoverable quarantine
and are atomically
moved—not deleted—to
`data/backups/.retired/<backup-retention-plan-id>/`. The signed receipt is
written under `data/recovery/backup-retention/receipts/` and copied into the
quarantine directory.

If interrupted, keep Grid stopped and rerun `apply`, or resume from the signed
on-host journal:

```bash
npm run backup:maintain -- recover \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets/data-protection.key
```

Quarantined backup envelopes and protected SQLite columns participate in later
data-key rotation/rollback. Do not remove quarantine until independent-media
copy, retention, restore, destruction authorization, and change records are
complete.

Use the disposable lifecycle drill:

```bash
mkdir -m 700 /tmp/axiom-backup-lifecycle-drill
npm run backup-lifecycle:drill -- /tmp/axiom-backup-lifecycle-drill \
  > /tmp/axiom-backup-lifecycle-evidence.json
```

Protected CI runs it on relevant changes and weekly. Candidate-host mechanism
coverage does not replace scheduled pilot restore from pilot-owned media.

## 5. Establish the controlled SLO baseline

```bash
mkdir -m 700 /tmp/axiom-slo-drill
npm run slo:drill -- /tmp/axiom-slo-drill \
  > /tmp/axiom-slo-baseline-evidence.json
```

The fixed profile uses the production supervisor, file-backed credentials,
production rate-limit configuration, four warmups, and 40 measured
`system.echo` requests at concurrency 4. It requires zero measured errors,
ready state before/after load, no 5xx/internal-error increase, p95 at or below
the initial two-second candidate target, stop/start within 20 seconds, and a
successful post-restart intent.

Signed evidence reports startup/restart, latency distribution, throughput,
service request/error deltas, peak in-flight, post-load memory, and CPU time.
Host mode does not enforce the candidate two-CPU ceiling, so CPU utilization is
recorded for diagnosis and sizing. This is a
short disposable profile, not dedicated pilot hardware or a 30-day measurement.

All host-side real-stack drills hold a cross-process port-block lease for their
complete lifetime. Leases prevent overlapping four-port candidates and may
reclaim a dead owner only after the bounded stale interval. Lease paths/process
IDs are excluded from signed release evidence. This is drill coordination, not
production network authority.

### 5.1 Request pressure and dependency loss

```bash
mkdir -m 700 /tmp/axiom-resilience-drill
npm run resilience:drill -- /tmp/axiom-resilience-drill \
  > /tmp/axiom-resilience-drill-evidence.json
```

The fixed policy starts the real four-process supervisor with a 4 KiB body
ceiling and capacity-10/refill-one-per-second token bucket. It proves an 8 KiB
request returns `413` without idempotency reservation and a 24-request burst
produces only accepted or `429` outcomes while service remains recoverable.

The same run suspends the actual Sandbox process. Operations must report
Gateway/Hypervisor/Sandbox degradation, `/ready` returns `503`, bounded alerts
appear, killing Sandbox forces fail-closed supervisor exit within ten seconds,
and clean restart preserves pre-fault Grid state and accepts a new intent.

Signed evidence excludes process IDs, host paths, request bodies, intent IDs,
and secrets. This is request-pressure and dependency-loss evidence, not cgroup OOM/CPU,
disk-pressure, orchestrator rescheduling, pilot-platform, or human-response
proof. See
[`docs/operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md`](../docs/operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md).

### 5.2 Run the host-side telemetry relay

The host relay keeps the kernel container deny-egress. It scrapes only the
permission-restricted Gateway Unix socket, validates the exact four-service
topology, exports 68 fixed OTLP/HTTP JSON metric points, and routes a fixed
Alertmanager v2 vocabulary.

```bash
npm run telemetry-relay:start -- \
  /srv/axiom-mesh/run/gateway.sock \
  /srv/axiom-mesh/secrets/telemetry-relay.token \
  /etc/axiom-mesh/telemetry-destinations.json \
  /var/lib/axiom-telemetry-relay
```

The adapter requires exact allowlisted HTTPS origins, fixed paths, no redirects,
private file-backed credentials, bounded responses, and verified TLS. Persistent
state caps queue size, reserves alert capacity, coalesces stale metrics, retries
transient failures with bounded delay, uses stable idempotency keys, and records
secret-free delivery/retry/receipt/dead-letter outcomes.

Protected conformance:

```bash
npm run telemetry-relay:drill -- /tmp/axiom-telemetry-relay-drill \
  > /tmp/axiom-telemetry-relay-evidence.json
```

This proves candidate relay behavior, not operator-owned external receivers or
human acknowledgement. See
[`docs/operations/EXTERNAL-TELEMETRY-AND-ALERTING.md`](../docs/operations/EXTERNAL-TELEMETRY-AND-ALERTING.md).

## 6. Rotate service, operator, and telemetry credentials

Credential rotation is offline. Stop the runtime first; the command acquires
the Grid runtime lock and fails closed against a running/competing Grid.

Back up both host directories securely. The transaction rotates all four Ed25519 service identities
plus their coordinated trust records, the production
operator API token, and the telemetry relay token, then:

```bash
npm run rotate:production -- rotate \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets
```

The command rotates four Ed25519 service identities, trust records, operator API
token, and telemetry relay token without printing secrets. Before installation
it encrypts the prior credential set with AES-256-GCM under the current data
key and writes `rollback.axr`. A maintenance marker protects interrupted
multi-file changes; ordinary failures restore originals automatically.

The manifest is signed by retiring and successor Grid identities. Token-bearing
files use HMAC-SHA256 with a key derived from the data key, avoiding a public
offline token-hash oracle. Restart and verify `/ready`, `/v1/operations`, an
intent, rejection of each retired token, and route limits for the active relay
token.

Rollback:

```bash
npm run rotate:production -- rollback \
  /srv/axiom-mesh/data/credential-rotations/<rotation-id>/manifest.json \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets
```

Rollback verifies/decrypts the prior set, preserves the rotated set as encrypted
`forward.axr`, restores identities/trust/registry/tokens, and writes an attested
result. Grid verifies the dual-signed lineage across the rotation boundary;
retired private keys are not retained. Matching interrupted maintenance may quarantine only a provably stale
runtime lock; a live/ambiguous owner still blocks the operation.

This does **not** rotate the data-protection key and does not prove external
revocation of deprecated-history credentials.

Disposable drill:

```bash
mkdir -m 700 /tmp/axiom-credential-rotation-drill
npm run credential-rotation:drill -- /tmp/axiom-credential-rotation-drill \
  > /tmp/axiom-credential-rotation-evidence.json
```

### 6.1 Verify deprecated credential boundary

The credential-history audit requires an external 32-byte audit HMAC key and a
checkout containing immutable legacy tag
`archive/legacy-main-pre-clean-room-2026-05-21`:

```bash
export AXIOM_CREDENTIAL_AUDIT_KEY='<base64url value from approved custody>'
npm run credential-history:audit \
  > /tmp/axiom-credential-history-audit-evidence.json
```

Never place the audit key in tickets, logs, tracked env files, or command
arguments. The command rescans deprecated objects, requires exact agreement
with the 32-entry secret-free ledger, verifies revocation from supported
repository trust, and rejects a matching supported-tip value. External
provider/custodian disposition remains a separate gate. See
[`docs/security/CREDENTIAL-HISTORY-REVOCATION.md`](../docs/security/CREDENTIAL-HISTORY-REVOCATION.md).

## 7. Rotate the data-protection key

Data-key rotation is a separate offline transaction. Stop the runtime and
preserve controlled copies of data/secrets, then:

```bash
npm run rotate:data-key -- rotate \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets
```

The command creates a new 256-bit key and re-encrypts supported contexts:
protected live Grid columns, recovery rollback databases, backup envelopes and
nested protected columns, and retained credential rollback/forward packages. It
does not rotate service identities or API tokens.

Changed protected artifacts receive Grid-signed `.key-rotation.json` sidecars.
The manifest records public digests, counts, evidence state, encrypted recovery
envelopes, and prior active-rotation pointer without containing the key. Cutover
stages/verifies replacements and writes the key last; journaled recovery can
unwind interrupted changes.

Restart and verify readiness/operations, one pre-rotation and one new intent,
and at least one backup restore. Starting the same database with the retired key
must fail. Retain the old key only in approved offline escrow until acceptance
closes.

Rollback only the active rotation:

```bash
npm run rotate:data-key -- rollback \
  /srv/axiom-mesh/data/data-key-rotations/<rotation-id>/manifest.json \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets
```

Rollback authenticates the manifest and prior-key envelope, re-encrypts current
live/recovery state under the prior key, preserves post-rotation evidence, moves
the active pointer back one transition, and writes an attested result.

Disposable drill:

```bash
mkdir -m 700 /tmp/axiom-data-key-rotation-drill
npm run data-key-rotation:drill -- /tmp/axiom-data-key-rotation-drill \
  > /tmp/axiom-data-key-rotation-evidence.json
```

The drill proves wrong-key rejection both directions, nested backup
re-encryption/restore, post-rotation evidence preservation, recovery-copy
re-encryption, original-key restoration, interrupted cutover behavior, and
clean four-process shutdown.

## 8. Grid continuity anchors

Local Grid verification detects invalid signatures, modified records, gaps,
broken links, and disagreement with local head/checkpoint state. It does not by
itself prove that no suffix was consistently removed together with matching
local metadata.

For stronger truncation assurance, create and retain
`axiom-grid-continuity-anchor.v1` **outside `AXIOM_DATA_DIR`** using the current
operator flow while Grid is stopped, then verify it against the full chain from
genesis. A valid anchor proves current history equals or extends the retained
head through the anchor's sequence only. It does not cover later unanchored
events and does not remove malicious host/root or active Grid-signing-key
compromise from the trust model.

Pilot operations must define anchor cadence, external custody, retention,
re-verification, and incident treatment before promotion.

## 12. Admitted-node discovery and scheduling

The candidate implements admitted-node discovery and scheduling as an authenticated
Grid reservation control. Signed v2 admission binds node identity, owner,
capability/security/software statement, HTTPS origin, failure domain, roles,
resource ceilings, and expiry. `GET /v1/node-discovery` requires `node:read`,
applies bounded filters, excludes expired/quarantined nodes, omits raw node
keys, and returns a Grid-signed result.

The `node.schedule` intent follows the normal kernel authority path. It creates
only a complete deterministic placement within admission lease, declared
CPU/memory/storage, concurrency, minimum security, capabilities, roles,
exclusions, optional failure-domain separation, and per-owner limits. Grid
encrypts requirements and placements.

```bash
npm run node-scheduling:drill -- /tmp/axiom-node-scheduling-drill \
  > /tmp/axiom-node-scheduling-drill-evidence.json
```

Evidence covers copied-key alias rejection, distinct owner/domain placement,
capacity exhaustion, quarantine degradation, missed-renewal expiry, schedule
expiry, and restart persistence. See
[`docs/operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md`](../docs/operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md).

This is an auditable reservation, not remote execution, measured resources,
result authentication, federation, replicated Grid, consensus, or Sybil proof.

## 13. Operator-approved online causal exchange

The operator-approved online causal exchange host relay moves existing node-signed causal bundles between exact Gateway
origins for one matching owner. It verifies source events against a pinned Grid
key, verifies node bundles, and stores cursor/queue/retry/receipt state in an
authenticated-encrypted atomic file.

Polling/staging has no approver credential. Applying the first pending
descriptor requires an ordinary one-use approval from a different destination
principal bound to the exact request digest:

```bash
npm run online-sync -- poll /etc/axiom-mesh/source-to-destination.json
npm run online-sync -- status /etc/axiom-mesh/source-to-destination.json
npm run online-sync -- apply \
  /etc/axiom-mesh/source-to-destination.json \
  <bundle_digest> \
  <approval_id>
```

Configure reverse direction with a different state file/key. Owner-scoped
preflight absorbs echo and ambiguous post-commit responses before another
approval is consumed. Invalid evidence, unavailable origins, response overflow,
queue saturation, and partition preserve cursor and enter bounded backoff.

Two-real-stack drill:

```bash
npm run online-sync:drill -- /tmp/axiom-online-causal-sync-drill \
  > /tmp/axiom-online-causal-sync-drill-evidence.json
```

This is causal record transport, not replicated consensus, BFT, workload
dispatch, or independently hosted WAN evidence. See
[`docs/operations/ONLINE-CAUSAL-EXCHANGE.md`](../docs/operations/ONLINE-CAUSAL-EXCHANGE.md).

## 14. Deployment-independent provider startup

The file-backed path remains supported. A pilot may instead set private
`AXIOM_PROVIDER_CONFIG` and start:

```bash
npm run provider:start
```

In provider mode, direct data-key/API-token/transport/policy/capability-registry
variables must be unset. The wrapper executes separate secret and policy
providers with absolute digest-pinned commands, no shell, bounded time/output,
and explicitly allowlisted workload-identity environment. Provider identities
and trust keys must be independent.

Responses are short-lived and bound to startup nonce, deployment ID, request ID,
exact resource set, media types, byte limits, and content digests. The broker
validates the data key, API principals, policy layers, capability registry, and
all five active internal TLS identities before ordinary supervisor startup. It
materializes one private `session-<uuid>` generation and removes it on normal
shutdown or failed validation.

Use the example configs under `config/` and replace zero digest placeholders
with exact installed executable/artifact digests.

```bash
npm run provider:drill -- /tmp/axiom-provider-conformance \
  > /tmp/axiom-provider-conformance-evidence.json
```

The reference file adapter proves protocol behavior, not a pilot Vault/cloud
secret manager/HSM/KMS/CSI/workload identity/backend availability/live refresh.
See
[`docs/operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md`](../docs/operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md).

## 15. Coordinated automated incident tabletop

`config/incident-response.json` defines four severities, six independently
assigned roles, authority-reducing actions, response targets, communication
cadence, and closure conditions. Unknown signals fail classification rather
than defaulting low.

After producing same-revision recovery, backup lifecycle, SLO, resilience,
service-unit, scheduling, causal-sync, provider, transport, credential-rotation,
and data-key-rotation evidence, compose the eleven records:

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

The drill independently verifies each signature/revision, classifies a combined
evidence-integrity/suspected-credential scenario as SEV-1, checks evidence-first
chronology/targets, and signs a secret-free composition record. Production
promotion still requires a facilitated pilot exercise with named responders,
deployment-specific notification decisions, corrective owners, and independent
human review. See
[`docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md`](../docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md).

## 16. Pilot dossier verification

After actual pilot observation/review, use the dossier-only preflight:

```bash
npm run pilot:dossier:verify -- \
  /secure-review/pilot-dossier.json \
  /secure-review/pilot-review-policy.json \
  /secure-review/pilot-policy-authority-public.pem
```

The dossier requires separately distributed policy authority, five distinct
review identities, exact source revision/image digest, at least 720 continuous
observation hours, current SLO/recovery results, four trust roots, five
non-exportable custody controls, and 13 unique deployment-specific evidence
digests. Secret/stale/weak/missing/changed inputs fail closed.

`npm run pilot:dossier:drill` creates synthetic verifier-conformance evidence
and explicitly observes no live pilot. Even an authentic accepted dossier
reports `production_promoted: false`; promotion is separate.

### Offline pilot evidence package verification

```bash
npm run pilot:package:verify -- \
  /secure-review/pilot-evidence-package \
  /separate-trust/pilot-policy-authority-public.pem
```

The package root contains only canonical `policy.json`, `dossier.json`, and the
exact 13 canonical v2 evidence envelopes. Every envelope must be a bounded
regular file, match dossier/build, satisfy its type-specific detail contract,
contain no secret material, and carry the policy-pinned role signature.
Unexpected, missing, noncanonical, contradictory, cross-build, wrongly signed,
or symlinked input fails closed.

`npm run pilot:package:drill` proves verifier conformance only and cannot promote
production. See
[`docs/operations/PILOT-DEPLOYMENT-DOSSIER.md`](../docs/operations/PILOT-DEPLOYMENT-DOSSIER.md).

## 17. Independent security-review intake

Protected CI signs **synthetic** independent-review verifier conformance,
proving rejection of build, scope, owner, finding, exception, summary, secret,
and signature drift while explicitly declaring that no independent review was
performed.

Authentic review intake uses:

```bash
npm run security-review:verify -- \
  findings.json \
  review-policy.json \
  review-policy-authority-public.pem
```

The exact contract and current threat-model input are documented in
[`docs/security/INDEPENDENT-SECURITY-REVIEW.md`](../docs/security/INDEPENDENT-SECURITY-REVIEW.md).

## Production non-claims

This package is a candidate container specification and local deployment
surface. Its source, supervisor, image, transport, recovery, rotation,
resilience, telemetry, scheduling, causal exchange, provider startup,
incident/pilot/review verifiers, and network boundaries are protected gates.

Those gates are **not** evidence of:

- a live public/customer production deployment;
- completed pilot custody or 30-day operation;
- independent security approval;
- production activation of the repository resolver/outbox/docs operator;
- repository direct-main or merge authority;
- conformance of an external agent runtime;
- remote node execution, federation, BFT, or global Sybil resistance;
- audited arbitrary-code isolation; or
- external settlement/regulatory compliance.

Production promotion remains a separate evidence-bound decision.

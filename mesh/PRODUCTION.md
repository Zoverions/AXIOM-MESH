# AXIOM-MESH candidate production runtime

The candidate production package runs Gateway, Hypervisor, Sandbox, and Grid as
four supervised Node.js processes inside one hardened container. Only Gateway
binds outside the container. The three internal services remain on loopback,
which preserves the current no-remote-plaintext boundary until a separately
audited mTLS transport adapter exists.

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
chmod 700 /srv/axiom-mesh/data /srv/axiom-mesh/secrets
chmod 600 /srv/axiom-mesh/secrets/*
```

Provisioning creates four distinct Ed25519 service identities, their trust
records, a 32-byte data-protection key, an API principal registry, and a
separate operator-token file. It never prints secret values. A partial secret
set is rejected rather than silently repaired or rotated. Keep
`operator.token` owned by the host operator; it is not mounted into the
container. Only the data-protection key and API registry need to be readable by
container UID `10001`.

Store an encrypted offline recovery copy before first launch. Losing the data
key makes protected Grid data unrecoverable. Replacing any service key without
a coordinated trust update makes signed internal traffic fail closed.

## 2. Build and start

The image uses the digest-pinned official Node.js `24.18.0-alpine3.23` base.
Set absolute host paths explicitly:

```bash
export AXIOM_DATA_DIR_HOST=/srv/axiom-mesh/data
export AXIOM_DATA_KEY_FILE_HOST=/srv/axiom-mesh/secrets/data-protection.key
export AXIOM_API_TOKENS_FILE_HOST=/srv/axiom-mesh/secrets/api-tokens.json
docker compose -f compose.production.yml build --pull=false
docker compose -f compose.production.yml up -d
```

The compose policy uses a read-only root filesystem, a non-root numeric user,
all Linux capabilities dropped, no-new-privileges, bounded memory/CPU/PIDs,
explicit secrets, loopback-only host publication, bounded logs, and
readiness-based health checks. Compose enforces deny-egress with an
`internal: true` bridge network while preserving the explicit host-loopback
Gateway publication. The production supervisor requires a non-loopback
isolated link with no active IPv4 or IPv6 default route before it launches any
service.

Do not disable `AXIOM_REQUIRE_DENY_EGRESS` to accommodate another runtime.
Equivalent orchestrator deployments must reproduce the default-route
rejection and retain explicit ingress. The Docker daemon and host remain
trusted. See
[`docs/security/DENY-EGRESS-BOUNDARY.md`](../docs/security/DENY-EGRESS-BOUNDARY.md)
for the proof, rollback rule, and adapter boundary.

## 3. Verify readiness

Liveness discloses only process state:

```bash
curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/ready
```

Operational details and OpenMetrics require a principal with
`operations:read` (the initial production operator has `*`):

```bash
TOKEN="$(tr -d '\n' </srv/axiom-mesh/secrets/operator.token)"
curl --fail -H "Authorization: Bearer ${TOKEN}" \
  http://127.0.0.1:8080/v1/operations
curl --fail -H "Authorization: Bearer ${TOKEN}" \
  http://127.0.0.1:8080/v1/metrics
```

Readiness fails when Grid, Hypervisor, or Sandbox is unavailable or when Grid
evidence verification fails. Metrics expose bounded service/status/error
categories only: no principal, intent, capsule, route parameter, query string,
prompt, payload, token, or object identifier becomes a metric label.
Grid deep integrity results are cached for 30 seconds by default, so frequent
health probes do not repeatedly scan an unbounded evidence history.

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

## 6. Rotate service and operator credentials

Credential rotation is an offline maintenance operation. Stop the production
supervisor or Compose deployment first. The command acquires the Grid runtime
lock before reading or changing credentials, so a running Grid or a competing
startup makes the operation fail closed.

Make an encrypted, access-controlled backup of both host directories before
the change. Then rotate all four Ed25519 service identities, their coordinated
trust records, and the production operator API token:

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
`/v1/operations`, and an authorized intent. Distribute the new operator token
only through the approved secret channel. The retired token must return `401`.

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
operator token, and writes an attested `rollback-result.json`. It rejects a
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
active service identity, rejection of each inactive service identity, exact
credential restoration, unchanged data-key custody, and clean shutdown. Its
secret-free JSON is Ed25519-attested and retained by protected CI for 90 days.

## 6.1 Verify the deprecated credential boundary

The credential-history audit is a release and protected-CI control, not a
runtime command. It requires the external 32-byte audit HMAC key and a checkout
that includes the locked
`origin/deprecated/legacy-main-pre-clean-room` ref:

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

This package is a production container specification and local deployment
surface. Its source and fail-closed supervisor are statically verified, and the
real four-process stack, digest-pinned image build, composed container
readiness, disposable-host recovery drill, controlled SLO/restart baseline,
coordinated credential-rotation drill, data-key rotation drill, and signed
deny-egress probe are
protected CI gates. This is not evidence of a live deployment, federated discovery, BFT consensus, audited
arbitrary-code isolation, or external settlement.

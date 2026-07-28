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
readiness-based health checks. Compose does not enforce deny-egress while also
publishing Gateway to the host. Before a pilot, enforce outbound-deny policy
with the host firewall or orchestrator and allow only explicitly approved
adapter destinations.

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

This package is a production container specification and local deployment
surface. Its source and fail-closed supervisor are statically verified, and the
real four-process stack, digest-pinned image build, composed container
readiness, and disposable-host recovery drill are protected CI gates. This is
not evidence of a live deployment, federated discovery, BFT consensus, audited
arbitrary-code isolation, or external settlement.

# Mutually Authenticated Service Transport

**Status:** implemented for the single-host production candidate; independent
multi-host deployment and external CA custody remain pending

**Updated:** 2026-07-29

**Applies to:** AXIOM-MESH `0.12.0-dev.3` supported development build

This runbook defines the internal service transport, its certificate
lifecycle, verification procedure, and rollback boundary. The supported
production path uses mutually authenticated TLS 1.3 for Gateway-to-Hypervisor,
Hypervisor-to-Sandbox, Hypervisor-to-Grid, and Gateway-to-Grid calls. The
existing Ed25519 request signature, audience, body digest, timestamp, nonce,
replay guard, and caller allowlist remain mandatory above TLS.

Gateway's operator-facing endpoint remains host-local HTTP behind the
permission-restricted Unix-domain ingress bridge. It is not the internal
service transport and is not made public by this change.

## Trust and peer-identity model

Production provisioning creates an untracked transport directory under the
operator-selected secret directory. It contains:

- one Ed25519 internal transport CA and self-signed CA certificate;
- distinct Ed25519 leaf keys and certificates for Gateway, Hypervisor,
  Sandbox, Grid, and the production supervisor health probe;
- a generation-numbered manifest;
- an exact SHA-256 fingerprint registry for the active leaf certificates.

Every leaf has server-authentication and client-authentication extended key
usage. Its subject common name and DNS SAN are
`<service>.service.axiom-mesh.internal`; its URI SAN is
`spiffe://axiom-mesh/service/<service>`. Certificates are valid for 30 days.
Startup rejects a certificate outside its validity window, and provisioning
refuses to call a set healthy with less than 24 hours remaining.

CA validation alone is insufficient because a retired but unexpired leaf
would otherwise remain accepted. Each process therefore loads the exact
active-leaf fingerprint registry at startup. A client validates the expected
server's DNS SAN, URI SAN, CA signature, validity, and active fingerprint. A
server validates the client's CA chain during the TLS handshake and then
requires its fingerprint and URI identity to match the service named by the
signed request. A valid Gateway certificate cannot authenticate a request
signed as Hypervisor, and the supervisor probe cannot call an authenticated
service route.

TLS is fixed to version 1.3. Plain HTTP internal URLs fail production
configuration. Missing files, partial directories, key/certificate mismatch,
unknown peers, manifest drift, expired leaves, wrong audiences, replayed
requests, and inactive fingerprints fail closed.

## Provision and inspect

Provision data, API, signing, and transport credentials outside the
repository:

```bash
npm run provision:production -- \
  /srv/axiom-mesh/data \
  /srv/axiom-mesh/secrets
```

The command is idempotent. It creates the complete transport set only when the
transport directory is empty. It validates an existing complete set instead
of silently filling missing files or replacing a near-expiry certificate.

Keep `/srv/axiom-mesh/secrets/transport` owned by the runtime credential
custodian and readable by the service account only. The CA signing authority
is needed for leaf rotation but must not be mounted into independently
deployed service units. The current single-container candidate bind-mounts the
complete directory because all processes still share one OS identity;
the implemented `compose.units.yml` topology instead projects and mounts only
one service leaf plus public trust per unit. See
[independent service units](INDEPENDENT-SERVICE-UNITS.md).

Verify the generation and public identity metadata without printing keys:

```bash
npm run rotate:transport -- \
  verify \
  /srv/axiom-mesh/secrets
```

The result contains the generation, CA fingerprint, service SPIFFE IDs, active
certificate fingerprints, and expiry timestamps. Store it with deployment
evidence. Never store the secret directory in a release dossier.

Before starting the container, set:

```bash
export AXIOM_TRANSPORT_DIR_HOST=/srv/axiom-mesh/secrets/transport
```

Compose mounts only the CA certificate, active manifest, and service-leaf
directory read-only at `/run/secrets/transport`; the CA signing key remains
host-only. It fixes `AXIOM_INTERNAL_TLS=true`, and the three internal URLs use
HTTPS. The supervisor uses its own client certificate for bounded health
probes; it cannot impersonate one of the four request-signing identities.

## Runtime verification

The authenticated operations report is the first runtime check:

```bash
TOKEN="$(tr -d '\n' </srv/axiom-mesh/secrets/operator.token)"
sudo curl --fail \
  --unix-socket /srv/axiom-mesh/run/gateway.sock \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost/v1/operations
```

A `ready` four-service report proves that Gateway completed authenticated
HTTPS calls to Hypervisor and Grid, and Hypervisor completed authenticated
HTTPS calls to Sandbox and Grid. It does not expose certificates,
fingerprints, hostnames, or service ports through the operator API.

Protected tests additionally prove:

1. successful internal handshakes negotiate TLS 1.3;
2. a client without a certificate is rejected during the handshake;
3. a CA-valid supervisor certificate cannot accompany a request signed as
   Gateway;
4. a Sandbox server certificate is rejected when Hypervisor is expected;
5. an inactive but CA-valid Gateway certificate is rejected;
6. manifest or fingerprint drift is rejected;
7. expired and near-expiry certificates are rejected;
8. the real production supervisor remains ready through every service edge.

Request signing is retained intentionally. TLS authenticates the current
connection and protects bytes in transit; the signed envelope separately
binds method, path, audience, caller, body digest, time, and one-use nonce.
Neither control substitutes for the other.

## Offline leaf rotation

Rotation is a coordinated maintenance operation. Stop the complete runtime,
verify recovery media, and create an encrypted custody record before changing
the active set. Then run:

```bash
npm run rotate:transport -- \
  rotate \
  /srv/axiom-mesh/secrets
```

The command validates the active CA, every leaf, peer registry, permissions,
and remaining validity. It generates a complete new leaf set in a private
staging directory while retaining the CA. Only after the staged set validates
does it rename the current directory to `transport-previous` and atomically
install the staged directory as `transport`.

The command refuses another rotation while `transport-previous` exists. This
prevents accidental destruction of the immediate rollback generation. Retain
that directory encrypted and access-controlled until the new generation has
passed readiness, intent, alert, and evidence checks. It contains secrets and
must never enter source control or an ordinary artifact upload.

Restart the complete runtime after rotation. Processes load one coherent
generation at startup. A process left running with the old registry rejects
new peers, while a newly started process rejects retired peers; partial
rolling replacement is not supported by this single-host procedure.

## Rollback and revocation behavior

If the rotated generation fails verification, stop the complete runtime:

```bash
npm run rotate:transport -- \
  rollback \
  /srv/axiom-mesh/secrets
```

Rollback atomically moves the failed active set to `transport-forward` and
restores `transport-previous` as `transport`. It validates the restored
generation before reporting success. Restart all services, verify readiness,
and submit a low-risk authenticated intent.

The active fingerprint registry is the leaf revocation mechanism. Once a new
generation starts, the prior leaf is rejected even though its CA signature
and validity remain correct. This is deterministic and offline, with no OCSP
or CRL network dependency. It does not solve CA compromise. Suspected CA
compromise is a SEV-1 service-identity incident: disable Gateway, preserve
evidence, replace the trust root and every leaf through a reviewed recovery
procedure, and never reuse the old CA.

Do not delete `transport-previous` or `transport-forward` as part of an
unreviewed command. Destruction requires the credential custodian's retention
and incident-evidence decision. After approval, archive or destroy the
directory using the deployment's secret-media procedure.

## Signed protected-CI evidence

Run the disposable lifecycle drill only in an explicitly empty workspace:

```bash
npm run transport:drill -- /tmp/axiom-transport-drill \
  > /tmp/axiom-transport-drill-evidence.json
```

The drill provisions the real production stack, proves initial readiness and
direct authenticated service transport, stops it, rotates every leaf, restarts
the stack, rejects the retired Gateway leaf, accepts the active leaf, executes
an intent, rolls back exactly, restarts again, and executes another intent.
Grid signs `axiom-transport-drill-evidence.v1`.

The artifact records public fingerprints, generation transitions, bounded
statuses, checks, platform metadata, and the Grid public attestation. It
excludes PEM certificates, secret keys, operator tokens, request bodies,
intent identifiers, absolute paths, and credential archive names. Protected
CI uploads `axiom-transport-drill-evidence-<commit>` for 90 days and binds it
as a same-revision incident-tabletop control.

## Pilot repetition and non-claims

This evidence closes mutually authenticated internal transport and the
single-host offline leaf lifecycle for the candidate. It does not claim:

- an externally operated CA, HSM, Vault, or cloud secret-manager integration;
- live multi-host routing, service discovery, or orchestrator rollout;
- zero-downtime dual-trust certificate rotation;
- OCSP, public PKI, or Internet-facing TLS termination;
- independent cryptographic or deployment review;
- pilot behavior under network latency, partitions, or clock drift.

Before pilot promotion, place the CA authority under named external custody,
repeat the per-unit leaf projection and mount policy, repeat rotation and
rollback on the target orchestrator, measure expiry alerting and clock
behavior, exercise CA-compromise recovery, and obtain independent review of
the certificate profiles and deployment permissions.

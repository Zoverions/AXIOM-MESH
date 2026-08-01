# AXIOM-MESH Security Policy

## Supported versions

AXIOM-MESH uses a rolling support model for the clean-room kernel.

| Version or branch | Support status |
|---|---|
| `0.12.0-dev.3` on `main` | Supported development line |
| Published `v0.11.0` | Supported production candidate |
| `deprecated/pre-0.12-documentation-corpus` | Unsupported read-only documentation archive |
| `archive/legacy-main-pre-clean-room-2026-05-21` | Unsupported immutable code archive |

The supported runtime is the dependency-free kernel in
[`mesh/`](https://github.com/Zoverions/AXIOM-MESH/tree/main/mesh). Code retained
elsewhere for traceability is not automatically in the security support
boundary.

## Legacy-history credential boundary

Credentials, signing keys, tokens, or secrets that ever appeared in deprecated
Git history must be treated as permanently compromised. They must not be
restored, trusted, or reused.

The clean-room production path provisions new Ed25519 service identities, API
tokens, and data-protection keys outside the repository. Promotion requires
evidence that deployments trust only newly provisioned identities.

The keyed
[`mesh/config/credential-revocations.json`](https://github.com/Zoverions/AXIOM-MESH/blob/main/mesh/config/credential-revocations.json)
ledger covers 32 conservative credential candidates from every reachable
object at the immutable pre-clean-room archive tip. Each is revoked from the supported
repository trust boundary. Protected CI reconstructs the inventory with an
external HMAC key, checks exact ledger coverage, and rejects reuse in the
supported tip without exposing values. This repository result is complete;
all entries remain explicitly pending external-provider or prior-deployment
attestation. See the
[revocation procedure](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/security/CREDENTIAL-HISTORY-REVOCATION.md).

## Supported credential lifecycle

The supported offline rotation procedure replaces the Gateway, Hypervisor,
Sandbox, and Grid Ed25519 identities, updates all four trust records, and
replaces the production operator API token and least-privilege telemetry relay
token as one maintenance transaction.
The Grid runtime lock excludes a live or competing startup. The retiring and
successor Grid keys both attest the public transition, allowing historical
evidence to remain verifiable without retaining retired private keys.

An authenticated-encrypted rollback package is created before replacement.
Rollback verifies the signed target set, preserves the rotated credentials in
an encrypted forward package, and restores the exact original set. Public
identity files use SHA-256 digests; token-bearing files use HMAC-SHA256 with an
HKDF-derived secret key so the manifest is not a token-hash oracle. Signed
drill evidence must contain only public identifiers and outcomes, never
tokens, private keys, or absolute secret paths.

The data-protection key remains outside the service/API operation and has its
own stopped-runtime lifecycle. That transaction re-encrypts the live Grid,
recovery database copies, encrypted backup snapshots including their nested
protected columns, and retained credential rollback/forward packages. Signed
rewrap chains remain anchored to the original manifests. The replacement key
is installed last; an on-disk journal supports recovery from a killed
multi-file cutover, and only the active rotation can perform a
state-preserving rollback. Rollback retains an encrypted derived
credential-manifest authentication key when needed for later verification,
not the retired data-encryption key.

Backup retention authenticates and decrypts every candidate before a signed
policy-derived plan can be applied. Apply requires Grid to be stopped and the
inventory unchanged, preserves a configured minimum, and journals atomic moves
into recoverable quarantine rather than deleting media. Quarantined snapshots
remain in data-key rotation and rollback scope. Permanent deletion requires a
separate deployment-owned media-destruction authorization.

The candidate container uses `network_mode: "none"` and exposes Gateway
locally through a permission-restricted, bind-mounted Unix-domain socket. When
enforcement is required, the supervisor rejects non-Linux execution and every
active non-loopback or IPv4/IPv6 default route before launching services.
Protected CI proves public TCP reachability from the runner and rejection from
the container in signed evidence. The Docker daemon and host remain trusted;
alternative orchestrators
must provide equivalent policy and evidence. See the
[deny-egress boundary](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/security/DENY-EGRESS-BOUNDARY.md).

External telemetry uses a separate host-side relay so the kernel keeps
deny-egress. Its `telemetry:collect` credential is confined to the two
authenticated telemetry routes over the Unix socket. The relay accepts only
the exact four-service topology, fixed OTLP/HTTP JSON attributes, fixed
Alertmanager v2 labels, and exact allowlisted HTTPS origins. It rejects
redirects, insecure or symlinked credentials, oversized state, digest drift,
and malformed receiver responses. Alert-reserved queue capacity, bounded
retry, idempotency keys, receipt/dead-letter audit, and forbidden-term checks
limit data exposure and delivery failure. See the
[external telemetry runbook](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/operations/EXTERNAL-TELEMETRY-AND-ALERTING.md).

Neither local rotation workflow substitutes for external revocation,
secret-manager versioning, or destruction evidence at prior custodians and
deployments.

## Internal transport identity

Production internal calls require mutually authenticated TLS 1.3 and retain
the signed, timestamped, nonce-protected request envelope above TLS. Distinct
Ed25519 leaves carry DNS and SPIFFE-style URI identities. Both CA validity and
the exact active certificate fingerprint are required, so a retired but
unexpired leaf fails closed.

Leaf rotation is an offline atomic generation swap with an exact rollback
directory. Suspected CA compromise is a SEV-1 identity incident and requires a
new trust root, every leaf replaced, evidence preserved, and independent
review. See the
[transport lifecycle runbook](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md).

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

1. Open a private GitHub Security Advisory for this repository.
2. If that is unavailable, contact the maintainers through an established
   private channel and place `SECURITY` in the subject.

Include:

- affected supported component or release;
- reproduction steps or a minimal proof of concept;
- confidentiality, integrity, and availability impact;
- required privileges and environmental assumptions;
- suggested mitigation, if known.

Do not include real credentials, personal data, or production data.

## Response targets

These are operating targets, not guarantees:

- acknowledge a report within 72 hours;
- assign severity and an owner within 7 days;
- communicate containment and disclosure plans after validation;
- publish remediation and rotation guidance with a fixed release.

Those targets govern incoming vulnerability reports, not active operational
incidents. Active incidents use the deterministic SEV-1 through SEV-4
activation, containment, communication, evidence, recovery, and closure policy
in the
[incident-response runbook](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md).
Protected CI produces a signed automated tabletop; a named-roster pilot
exercise remains required before production promotion.

The supported source includes a
[current-build threat model](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/security/CURRENT-BUILD-THREAT-MODEL.md)
and a fail-closed
[independent-review intake](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/security/INDEPENDENT-SECURITY-REVIEW.md).
Its separately authorized signed findings ledger requires independently
verified closure for critical/high findings and separate owned, contained,
expiring approval for medium/low exceptions. Protected CI exercises only
labeled synthetic verifier conformance; an authentic independent review
remains a production-promotion gate.

## Priority scope

Highest-priority reports include:

- authentication or authorization bypass in Gateway or Hypervisor;
- capability-grant forgery, replay, audience confusion, or policy weakening;
- Sandbox escape or unauthorized effect execution;
- Grid evidence, migration, governance, accounting, backup, or recovery
  tampering;
- authenticated-encryption, consent, memory, import, export, or causal-sync
  confidentiality failures;
- secret exposure in images, logs, release artifacts, or source history;
- release-evidence, capability-registry, or documentation-claim bypasses;
- production container or supervisor behavior that violates the documented
  fail-closed boundary.

Unsupported historical code is normally out of scope unless it can affect
`main`, a supported release, current credentials, or a supported deployment.

## Coordinated disclosure

Validated reports are handled privately while containment and a fix are
prepared. Public disclosure should identify affected versions, mitigations,
rotation requirements, fixed versions, and residual risk. Reporter credit is
provided when requested and safe.

## Safe testing

Use isolated test data and infrastructure you own or are authorized to test.
Do not degrade public services, access other users' data, exfiltrate secrets,
or perform persistence after demonstrating impact.

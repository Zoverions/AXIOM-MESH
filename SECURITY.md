# AXIOM-MESH Security Policy

## Supported versions

AXIOM-MESH uses a rolling support model for the clean-room kernel.

| Version or branch | Support status |
|---|---|
| `main` | Supported development line |
| Latest published `0.11.x` release | Supported production candidate |
| Deprecated `Main` and legacy branches | Unsupported |
| Historical contracts, installers, and runtimes | Unsupported |

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
object at the locked deprecated tip. Each is revoked from the supported
repository trust boundary. Protected CI reconstructs the inventory with an
external HMAC key, checks exact ledger coverage, and rejects reuse in the
supported tip without exposing values. This repository result is complete;
all entries remain explicitly pending external-provider or prior-deployment
attestation. See the
[revocation procedure](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/security/CREDENTIAL-HISTORY-REVOCATION.md).

## Supported credential lifecycle

The supported offline rotation procedure replaces the Gateway, Hypervisor,
Sandbox, and Grid Ed25519 identities, updates all four trust records, and
replaces the production operator API token as one maintenance transaction.
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

Neither local rotation workflow substitutes for external revocation,
secret-manager versioning, or destruction evidence at prior custodians and
deployments.

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

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

## Supported credential lifecycle

The supported offline rotation procedure replaces the Gateway, Hypervisor,
Sandbox, and Grid Ed25519 identities, updates all four trust records, and
replaces the production operator API token as one maintenance transaction.
The Grid runtime lock excludes a live or competing startup. The retiring and
successor Grid keys both attest the public transition, allowing historical
evidence to remain verifiable without retaining retired private keys.

An authenticated-encrypted rollback package is created before replacement.
Rollback verifies the signed target set, preserves the rotated credentials in
an encrypted forward package, and restores the exact original set. Signed drill
evidence must contain only public identifiers and outcomes, never tokens,
private keys, or absolute secret paths.

The data-protection key is outside this operation. Its rotation requires a
separate re-encryption migration for Grid data, backups, and retained
credential packages. Local rotation evidence also does not substitute for an
external record that credentials exposed in deprecated history have been
revoked at every prior custodian and deployment.

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

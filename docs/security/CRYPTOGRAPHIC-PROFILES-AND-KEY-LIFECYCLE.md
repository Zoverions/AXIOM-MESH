# Cryptographic Protection Profiles and Key Lifecycle

**Status:** experimental profile architecture; no new cryptography and no production-promotion change.

AXIOM already uses concrete cryptographic mechanisms in several implemented paths, including Ed25519 signing identities, TLS 1.3 internal transport, AES-256-GCM authenticated encryption, and X25519/HKDF-SHA256/AES-256-GCM recipient export encryption.

The missing architectural layer is not another cipher. It is a **versioned protection profile and lifecycle model** that says exactly which mechanism is used for which purpose and how it is rotated, compromised, recovered, migrated, and retired.

## Design rule

> **Cryptographic strength is purpose-specific evidence. It is not authority.**

A stronger cipher suite cannot widen a grant. A valid signing key cannot become a data-decryption key. A root/recovery key should not be used for ordinary service traffic.

## Current-compatible profiles

The initial registry describes, rather than replaces, mechanisms already evidenced in the repository:

- local protected state: AES-256-GCM;
- recipient export: X25519 + HKDF-SHA256 + AES-256-GCM;
- signing: Ed25519;
- internal service transport: TLS 1.3 with Ed25519 identities and existing peer binding/pinning.

These are compatibility descriptions, not timeless recommendations.

## Key-purpose separation

At minimum keep distinct:

- signing;
- transport identity;
- data protection;
- recipient encryption;
- root/trust-anchor;
- recovery;
- threshold/custody shares where later introduced.

A compromise in one purpose should have the smallest defensible blast radius.

## Lifecycle

Keys move through explicit states:

```text
generated -> staged -> active -> rotating -> retired
                         |
                         -> compromised

retired -> recovery_only -> destroyed
```

Compromise is not ordinary retirement. It carries different recovery and lineage consequences.

## Rotation

Rotation should preserve historical verification while preventing retired material from authorizing new effects.

Depending on the key purpose, rotation may require:

- re-encryption;
- trust-record replacement;
- descendant revalidation;
- certificate/leaf replacement;
- recipient re-wrapping;
- rollback evidence;
- backup/recovery-context migration.

## Root compromise

Root, transport-CA, or recovery-key compromise is a wider recovery class than ordinary service-key compromise.

Ordinary leaf rotation must not be used to conceal a root compromise. Descendants need explicit re-establishment or revalidation under a new trust anchor/local recovery policy.

## Offline

Offline nodes may continue with still-valid local keys when policy permits.

But if activation requires fresh external status, offline operation cannot silently waive that requirement. Key-status uncertainty is surfaced and reconciled later.

Risk-reducing actions such as suspending use of a suspected key remain possible under preauthorized containment policy.

## Migration and cryptographic agility

Profiles are versioned and replaceable. Migration should use staged compatibility, test vectors, explicit evidence, rollback planning, and retirement of old profiles.

No artifact should depend on a floating "latest crypto" label.

Post-quantum migration should be handled as a separate research and deployment programme with independent review rather than prematurely hard-coded into the core.

## Governing rule

**Use established cryptography. Bind it to exact purposes. Rotate deliberately. Treat compromise honestly. Preserve agility.**

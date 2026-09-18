# Secret Containment and Credential Brokerage

**Status:** normative draft architecture and contract foundation; no runtime implementation or production-promotion claim

**Specification version:** `0.1.0-draft.1`

**Created:** 2026-09-18

**Issue:** [#1703](../../issues/1703)

**Depends on:** [Sovereign Vaults and Local Context Broker](SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md) and [Vault Access Lease and Context Request Protocol](VAULT-LEASE-AND-CONTEXT-REQUEST.md)

## Purpose and boundary

AXIOM needs native secret containment because passwords, API tokens, private keys,
signing material, recovery secrets, provider credentials, and similar values are
not ordinary personal context. They are often portable authority.

The system therefore treats secret custody and secret use as first-class trust
functions while preserving support for external secret managers. AXIOM-native
local custody, an external secret provider, and hardware-backed custody are
provider choices behind the same policy boundary.

Examples of external providers may include password managers, cloud secret
managers, HSM/KMS systems, operating-system credential stores, or future
provider capsules. Provider integration does not make any provider the AXIOM
authority plane.

This specification is deliberately inert. It creates no Gateway route, no
secret broker process, no provider I/O, no plaintext retrieval path, no secret
reveal capability, no capability-registry promotion, and no production claim.

## Constitutional separation

The central invariant is:

> **Permission to use a secret does not imply permission to reveal, copy,
> export, persist, delegate, or place that secret in model context.**

The related distinctions are mandatory:

- **secret custody** — where protected secret material is held;
- **secret reference** — an opaque identity for a secret, never the secret;
- **secret use authority** — a bounded authorization to apply one secret to one
  operation;
- **secret reveal** — disclosure of plaintext secret material;
- **secret export** — transfer of secret material to another custody domain;
- **secret delegation** — granting another principal authority involving the
  secret; and
- **effect authority** — authorization for the operation the credential may
  enable.

These states MUST remain separate.

A principal that may use a deployment token to perform one authorized
deployment does not thereby gain permission to read the token, put it in a
prompt, save it in memory, print it to logs, copy it to another process, export
it, or delegate it.

Secret use is not secret reveal.

## Relationship to Sovereign Vaults

Sovereign Vaults remain the compartment model for owner data. A `secrets`
vault or secret-specific sub-vault may carry metadata, custody policy, recovery
policy, and opaque secret objects.

Secret handling adds a stricter execution rule: ordinary vault read authority
does not automatically imply plaintext secret access.

A general Vault Access Lease is therefore insufficient to reveal a protected
credential. Secret use requires a dedicated secret-use authorization evaluated
under the Local Trust Plane. Reveal/export/delegation, if ever implemented,
require separately named higher-consequence capabilities and are outside this
v0 contract.

## Core architecture

```text
owner / authorized principal
          |
          v
      Gateway
          |
          v
     Hypervisor
  intent + policy + consent
          |
          v
 Secret Use Grant
  exact principal
  exact secret reference
  exact operation
  exact purpose
  exact destination
  one use + short expiry
          |
          v
   Secret Broker
    /     |      \
   /      |       \
AXIOM   external   hardware
local   provider   custody
custody  adapter    handle
   \      |       /
    \     |      /
     bounded materialization
          |
          v
       Sandbox
 exact operation only
          |
          v
         Grid
 digest/reference-only receipt
```

For any privileged or externally visible effect, the existing authority path
remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

A Secret Broker is not an alternate authority plane. It may materialize or
apply secret material only after receiving a valid, current grant for the exact
operation and destination.

## Custody modes

### AXIOM-native local custody

AXIOM may provide first-party local secret custody.

The intended implementation stores encrypted secret material separately from
ordinary model memory and ordinary application state. A secret object should
use an independently governed key domain and may eventually be protected by a
TPM, Secure Enclave, HSM, OS keystore, passphrase-derived recovery material, or
another reviewed local key mechanism.

This specification does not choose a final cryptographic storage format or make
a hardware-protection claim.

The local custody layer MUST NOT expose a general "read all secrets" interface
to agents or applications.

### External-provider custody

A secret may remain in a third-party manager. AXIOM stores only the minimum
provider binding and opaque provider secret reference needed to request bounded
use.

Connection, discovery, installation, or successful authentication to a provider
does not grant authority to use a secret.

External providers remain adapters. They do not receive general Gateway
authority, unrelated vault content, or a capability to authorize AXIOM effects.

### Hardware-backed custody

A secret or key may remain non-exportable in hardware. In that case the broker
should request a bounded cryptographic operation rather than materialize the key
bytes.

Hardware identity, attestation, or "non-exportable" claims require evidence
appropriate to the exact device/provider and are not established by this
contract.

## Secret Reference v1

A Secret Reference identifies protected material without containing it.

The v1 reference binds:

- owner subject;
- AXIOM-local secret reference ID;
- secret class;
- custody mode;
- exact opaque custody locator;
- lifecycle state;
- creation metadata; and
- explicit non-authority/non-plaintext markers.

The reference MUST NOT contain:

- a password;
- an API token;
- a private/signing key;
- recovery material;
- reusable payment credentials;
- decrypted provider payloads; or
- other raw secret bytes.

The contract is:

[secret-reference.v1.schema.json](contracts/secret-reference.v1.schema.json)

## Secret Use Grant v1

A Secret Use Grant authorizes one named principal to use one exact secret
reference for one exact operation and destination.

The v1 grant is intentionally strict:

- one use;
- short expiry;
- exact principal;
- exact secret reference;
- exact operation;
- exact purpose;
- exact non-wildcard destination;
- policy-decision binding;
- execution-time authorization recheck;
- secret-revocation recheck immediately before use;
- receipt reservation;
- non-delegable;
- no reveal;
- no export;
- no persistence;
- no logging;
- no model-context exposure; and
- no secret bytes returned to the requester.

The contract is:

[secret-use-grant.v1.schema.json](contracts/secret-use-grant.v1.schema.json)

A successful secret-use grant still does not prove that the downstream external
effect itself is authorized. Where the credential is used to create a governed
effect, the normal effect grant and execution path remain required.

## Secret Use Receipt v1

A secret-use receipt records evidence about the attempted use without becoming
a secret database.

It binds digests/references for:

- the grant;
- the secret reference;
- the principal;
- the operation;
- the destination;
- timing; and
- terminal outcome.

It MUST contain no secret material, plaintext secret value, reusable provider
credential, or new authority.

The contract is:

[secret-use-receipt.v1.schema.json](contracts/secret-use-receipt.v1.schema.json)

A receipt proves only the signed AXIOM statement and associated integrity chain.
It does not prove arbitrary external-world truth.

## Brokered use patterns

The broker SHOULD prefer patterns in this order where the external system
allows them:

1. **non-exportable cryptographic operation** — the key never leaves hardware or
   custody service;
2. **brokered protocol use** — the broker applies the credential to the exact
   request/destination without returning it to the requester;
3. **short-lived derived credential** — mint or obtain a narrower expiring token
   for the operation;
4. **ephemeral child-process injection** — only when unavoidable and only into a
   tightly bounded Sandbox process.

Plaintext environment variables or temporary files are therefore fallback
materialization mechanisms, not the architectural default. If used, they require
explicit process, filesystem, destination, lifetime, teardown, and leakage
controls. Secret bytes MUST NOT be copied into model context merely because a
tool needs them.

## Destination and egress binding

A secret-use grant MUST name a non-wildcard destination.

Examples include:

- one exact HTTPS origin;
- one local service principal;
- one bounded Sandbox process identity; or
- one hardware endpoint.

The secret broker and Sandbox must agree on that destination. A token approved
for one API origin cannot be silently reused for a different origin, proxy, or
tool.

Redirects, aliases, helper processes, shell expansion, environment inheritance,
subprocess creation, and proxy configuration are all potential destination
changes and require explicit handling in a future runtime implementation.

## Secret lifecycle

Secret lifecycle is independent from ordinary object lifecycle.

The system must eventually support:

- creation/import;
- status;
- rotation;
- expiry;
- revocation;
- replacement;
- custody-provider migration;
- recovery;
- deletion/destruction where technically possible; and
- compromised-secret incident handling.

Rotation must not cause old grants to silently authorize the replacement
credential. Revocation must block new use immediately and bound any in-flight
operation by the applicable kill/cancellation policy.

## Backup, recovery, and portability

Normal Personal Agent Pack and general data export remain secret-free.

Backup of AXIOM-native secret custody must use a separately reviewed encrypted
recovery design. A backup manifest may contain secret references and cryptographic
metadata but MUST NOT contain plaintext secret material.

Exporting or migrating a secret to another custody provider is not ordinary
portability. It is a distinct high-consequence operation requiring explicit
owner authority, destination binding, evidence, and recovery/rollback semantics.

External-provider secrets may remain entirely outside AXIOM backups, with only
provider references backed up when policy permits.

## AXIOM One surface

AXIOM One should eventually expose a human-readable **Secrets & Access** surface
alongside the broader Vault.

The ordinary view should answer:

- what credential or key is connected;
- where it is held;
- which agents/apps may request its use;
- which operations and destinations are allowed;
- whether reveal/export is prohibited;
- last use/rotation/revocation state; and
- how to revoke access.

An owner should be able to understand:

> Deployment Agent may use the GitHub deployment credential for repository X
> against origin Y. It cannot reveal or export the credential.

The advanced evidence view may show grants, policy decisions, digests, and
receipts without displaying secret material.

## Failure behavior

The future runtime MUST fail closed when:

- the secret reference is missing, malformed, revoked, expired, or in an
  incompatible lifecycle state;
- custody/provider binding is unavailable or changed;
- the principal does not match;
- purpose or operation does not match;
- destination is missing, wildcard, changed, redirected outside policy, or
  cannot be established;
- the grant is expired, reused, revoked, delegated, or malformed;
- the authorization or revocation recheck cannot complete;
- a required receipt cannot be reserved;
- a broker/provider returns secret material through a path that the activated
  contract forbids;
- teardown/zeroization obligations cannot be met where they are required; or
- an adapter would need to widen scope to make the operation succeed.

Provider failure MUST return failure/uncertainty according to the exact
operation contract. It must not fall back to a broader credential.

## Threat model and required adversarial tests

Promotion work must test at minimum:

- prompt injection asking the model to print a secret;
- malicious tool output requesting secret reveal;
- confused-deputy use of a valid secret for a different destination;
- environment inheritance into child processes;
- shell/debug/error output leakage;
- logs, telemetry, crash dumps, traces, receipts, and support bundles;
- stale and revoked grants;
- grant replay and concurrent double-use;
- provider redirect/substitution;
- secret-reference substitution;
- malicious plugin/provider adapter;
- cross-agent delegation;
- backup/export leakage;
- rotation races;
- cancellation and process teardown;
- memory/context persistence after use; and
- attempts to transform "use" into "reveal."

## First executable progression

The safe implementation sequence is:

1. **v0 contract foundation** — this document, the three closed schemas, and
   semantic regression tests;
2. **local encrypted fixture store** — synthetic secrets only, no Gateway route,
   no external provider I/O, no capability promotion;
3. **broker evaluator** — deterministic grant validation and deny paths with no
   model in allow/deny logic;
4. **Sandbox-only synthetic use** — one fixed test operation and destination,
   with no secret returned to the requester;
5. **one external provider adapter laboratory** — separately reviewed and still
   production-unreachable;
6. **AXIOM One Secrets & Access UX**;
7. **independent security/privacy review**; and only then
8. a separate decision about capability enablement/exposure/production
   promotion.

## Current non-claims

This specification and its schemas do **not** claim:

- an implemented secret broker;
- an implemented AXIOM-native secret store;
- 1Password, Bitwarden, cloud-secret-manager, HSM, KMS, OS-keystore, passkey, or
  other provider integration;
- a Gateway secret route;
- a secret-reveal capability;
- automatic credential rotation;
- hardware-backed key protection;
- safe plaintext injection for arbitrary tools;
- production deployment; or
- any change to `mesh/config/capabilities.json`.

The capability registry remains authoritative for runnable behavior.

# Vault Access Lease and Context Request Protocol

**Status:** normative architecture and documentation-only contract specification; no runtime implementation or production-promotion claim

**Specification version:** `1.0.0-draft.1`

**Created:** 2026-08-22

**Depends on:** [Sovereign Vaults and Local Context Broker](SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md)

## Purpose and status

This specification defines the two protocol objects that sit immediately before a minimized AXIOM Context Capsule:

1. a **Context Request**, through which an outside or local requester describes the task-relevant semantics it needs without selecting or mounting an owner's vault; and
2. a **Vault Access Lease**, through which the deterministic owner-local trust plane grants a named local principal temporary read/derive access to one exact vault for one exact purpose.

Both contracts are documentation-only drafts. Their presence does not create a Gateway route, runtime capability, key service, broker, lease issuer, disclosure compiler, or production claim. The capability registry remains authoritative for what can run.

The intended sequence is:

```text
external/local task request
        |
        v
Context Request
  - semantic need
  - recipient
  - purpose
  - task class
  - requested retention
  - no vault selector
        |
        v
policy + consent + sensitivity decision
        |
        +---- deny / ask owner / narrow request
        |
        v
one or more owner-local Vault Access Leases
  - exact holder
  - exact vault
  - exact purpose
  - read/derive only
  - short expiry
  - non-delegable
        |
        v
Personal Context Broker performs local synthesis
        |
        v
Disclosure Compiler
        |
        v
Context Capsule
  - minimum necessary disclosure
  - recipient-bound
  - purpose-bound
  - expiring
  - no vault authority
```

## Core separation of responsibilities

The protocol deliberately separates four things that are easy to collapse:

- **Need** — what information a task requires.
- **Access** — which owner-local principal may temporarily inspect which private source.
- **Disclosure** — which minimized claims may leave the owner trust domain.
- **Effect authority** — whether any action may be performed.

A Context Request states need only. A Vault Access Lease grants local source access only. A Context Capsule carries disclosure only. None of the three grants effect authority.

The existing `Gateway -> Hypervisor -> Sandbox -> Grid` path remains mandatory for privileged or externally visible effects.

## Context Request

A requester SHOULD ask for semantic facts, constraints, or derived conclusions rather than naming storage compartments.

Good requests include:

- `travel.accessibility.requirements`
- `education.presentation.supports`
- `calendar.availability.constraints`
- `dietary.constraints.for.restaurant_selection`
- `communication.preferred_name_and_pronunciation`

A requester MUST NOT require knowledge of whether those facts originate in a health, education, identity, memory, preference, or custom vault.

### Context Request invariants

A valid v1 Context Request:

- identifies the owner, requester, intended recipient, purpose, and task class;
- identifies one or more semantic information needs;
- declares whether each need is required or optional;
- declares a maximum requested sensitivity and acceptable disclosure mode;
- declares requested retention limits;
- expires;
- does not contain a source-vault selector;
- does not request a vault mount;
- does not request raw vault objects;
- does not request onward disclosure;
- grants no vault access;
- grants no execution authority; and
- is not itself proof that policy, consent, or owner confirmation permits the disclosure.

A request may be narrowed before authorization. The local policy layer may satisfy a request with less information than requested or deny it entirely.

### Semantic need rather than vault topology

The requester-facing abstraction is intentionally semantic. For example:

```text
Need: travel.accessibility.requirements
Purpose: choose a suitable hotel
Recipient: travel-agent-17
Output mode: transformed-constraint
Retention: 30 minutes, no persistence
```

The requester should not know that the answer was synthesized from several records in separate vaults. The local companion may determine that a mobility accommodation is relevant while a diagnosis, clinician identity, medication history, and unrelated accessibility information are not.

## Vault Access Lease

A Vault Access Lease is an owner-local authorization artifact. It allows a named local principal—normally the Personal Context Broker or another explicitly approved local component—to read and/or derive from one exact vault for one exact bounded purpose.

It is not a transferable bearer token for external systems.

### Lease invariants

A valid v1 Vault Access Lease:

- binds one owner subject;
- binds one holder principal;
- binds one exact vault;
- binds one purpose and task class;
- permits only `read` and/or `derive`;
- contains no mutation permission;
- is issued by or references a deterministic policy decision;
- has a short mandatory expiry;
- is non-delegable;
- cannot be used outside the owner trust domain;
- contains no raw encryption key material;
- grants no access to any other vault;
- grants no kernel effect authority;
- does not permit raw-content export merely because content can be read locally;
- requires a current revocation check before use; and
- requires an auditable access receipt.

The holder receives an opaque local key or storage handle where necessary. The holder does not become the root key authority.

### One vault per lease

A lease authorizes exactly one vault. Cross-vault synthesis therefore requires independently authorized leases for each contributing vault.

This property limits blast radius and makes it possible to revoke or recover one domain without making all other domains depend on the same lease or key.

A broker may hold several concurrent leases when policy permits, but the leases remain individually visible and independently revocable.

## Local companion privilege

The owner's private companion may legitimately have broader contextual reach than outside agents. That is a product feature, not an exception to the security model.

The preferred pattern is:

```text
companion proposes semantic need
        |
Vault Gatekeeper evaluates each required domain
        |
short-lived lease(s)
        |
companion reasons locally
        |
lease expiry/revocation
```

The companion does not receive a permanent universal key merely because the owner wants high personalization. This reduces the consequence of model compromise, prompt injection, runtime bugs, or a malicious tool.

The local companion may remember derived conclusions only under the destination vault's own policy. A temporary lease does not silently grant permission to persist a copy in companion memory.

## External agent behavior

An external agent normally receives a Context Capsule, not a lease.

The external agent:

- may submit a Context Request;
- may receive a denial or a narrowed disclosure;
- may receive an expiring Context Capsule if authorized;
- may not inspect vault inventory unless separately authorized for an explicit owner-facing administrative purpose;
- may not name a vault as a way to bypass semantic minimization;
- may not convert a capsule into a lease;
- may not reuse a request as proof of consent;
- may not infer execution authority from context disclosure; and
- may not pass disclosed content onward under the v1 capsule contract.

## Retention and re-request

A Context Request can ask for a retention duration, but the requester does not set retention policy. Policy may reduce the requested duration or prohibit persistence entirely.

When a Context Capsule expires, an external recipient must submit a new request rather than treating a previous disclosure as ambient permanent profile state.

A local lease expiry similarly requires a new authorization decision. Repeated access may be streamlined by owner policy, but it remains observable and revocable.

## Sensitive and regulated domains

Health, psychological, legal, financial, biometric, intimate, minor-related, and other high-sensitivity domains can use stricter rules than this base contract.

Examples include:

- explicit owner or authorized guardian confirmation;
- clinician/institution authority evidence;
- shorter lease duration;
- local-only derivation;
- prohibition on verbatim disclosure;
- mandatory transformed-constraint output;
- stricter recipient allowlists;
- jurisdiction or residency restrictions; and
- additional access receipts.

The generic Mesh contract does not claim regulated-domain compliance. Domain applications remain responsible for their additional obligations.

## Relationship to personal model adaptation

A Vault Access Lease is not permission to train a model.

Training, fine-tuning, embedding export, adapter creation, or other durable model adaptation changes the retention and deletion properties of source information. Such work requires a distinct visible training/adaptation authorization that binds:

- exact source vaults and records;
- purpose;
- execution location;
- model/adapter identity;
- provider and destination where applicable;
- retention;
- licence;
- memorization/evaluation requirements;
- deletion and retraining consequences; and
- resulting artifact custody.

A future Personal Agent Pack contract may reference a sealed personalized adapter. This lease contract does not authorize its creation.

## Failure behavior

The system fails closed when:

- a Context Request is expired or malformed;
- semantic need cannot be mapped without exceeding policy;
- the owner or required authority has not approved a high-risk disclosure;
- a required lease is missing, expired, revoked, or does not match the exact holder/vault/purpose;
- a requested source exceeds the lease's sensitivity or scope;
- a required access receipt cannot be reserved or committed;
- local-only processing cannot be maintained where required; or
- the disclosure compiler cannot prove that the output satisfies the applicable minimum-necessary policy.

Failure to satisfy one requested semantic need must not silently broaden access to other vaults as a fallback.

## Audit and receipts

The intended evidence chain is:

```text
Context Request
  -> policy decision
  -> owner confirmation where required
  -> Vault Access Lease(s)
  -> local access receipt(s)
  -> derivation/provenance receipt(s)
  -> Context Capsule
  -> external delivery receipt where applicable
```

Operational telemetry should record identifiers, policy outcomes, timing, and failure class without copying raw sensitive content.

## Versioned contract set

This specification introduces two documentation-only contracts:

- [`context-request.v1.schema.json`](contracts/context-request.v1.schema.json)
- [`vault-access-lease.v1.schema.json`](contracts/vault-access-lease.v1.schema.json)

They build on:

- [`sovereign-vault.v1.schema.json`](contracts/sovereign-vault.v1.schema.json)
- [`context-capsule.v1.schema.json`](contracts/context-capsule.v1.schema.json)
- [`personal-agent-pack.v1.schema.json`](contracts/personal-agent-pack.v1.schema.json)

## Promotion gates and non-claims

Before either protocol is runtime-enabled, the repository needs at minimum:

1. canonical parser and validation code;
2. signed policy-decision and revocation semantics;
3. replay-resistant lease identity;
4. encrypted local storage/key-handle implementation;
5. access receipt reservation and commit behavior;
6. local broker integration tests;
7. prompt-injection and confused-deputy adversarial tests;
8. disclosure-minimization tests;
9. recovery and revocation tests;
10. external-recipient abuse tests;
11. accessibility and owner-control UX evidence; and
12. independent security/privacy review appropriate to the activated scope.

This specification does **not** claim an implemented Context Request endpoint, Vault Access Lease issuer, Vault Gatekeeper, Personal Context Broker, Disclosure Compiler, Context Capsule signer, personal model trainer, hardware key store, regulated-domain product, or production deployment.

No capability registry state is changed by this document or its schemas.

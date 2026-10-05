# Personal Agent Pack v2 and Companion Continuity

**Status:** normative architecture and documentation-only contract specification; no runtime implementation or production-promotion claim

**Specification version:** `2.0.0-draft.1`

**Created:** 2026-08-22

**Builds on:**

- [Personal Compute Fabric and Local Trust Plane](PERSONAL-COMPUTE-FABRIC-AND-LOCAL-TRUST.md)
- [Sovereign Vaults and Local Context Broker](SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md)
- [Vault Access Lease and Context Request](VAULT-LEASE-AND-CONTEXT-REQUEST.md)

## Purpose and status

Personal Agent Pack v2 defines a portable continuity manifest for an owner's private companion after personal context has been separated into Sovereign Vaults.

The Pack is not the owner, not a universal vault, not a model checkpoint, and not an authority token. It is an owner-controlled recovery and portability map that binds exact artifact identities, versions, digests, licences, policies, and recovery references.

The design goal is simple:

> The owner should be able to replace a base model, orchestration runtime, device, hosting provider, or companion UI without losing the durable context and corrections that make the companion personally continuous.

The presence of this specification does not implement pack export/import, vault recovery, personalized model training, adapter loading, context brokerage, hardware key custody, or production migration.

## Continuity is a composition

The companion is modeled as several separately governed layers:

```text
replaceable base model
        +
Agent Runtime Capsule
        +
Sovereign Vault manifests
        +
correction / evaluation ledger
        +
owner preferences and policy
        +
optional personalized model adapter
        +
voice / avatar / persona configuration
        +
recovery and migration manifest
        =
portable companion continuity
```

No single layer is treated as the owner's verified identity.

### Replaceable base model

A base model provides capability. It may be upgraded, replaced, moved local, or routed to an approved provider without invalidating the owner's vaults or correction history.

The Pack MUST NOT require one permanent model family or provider.

### Agent Runtime Capsule

The runtime capsule defines orchestration behavior and requested capabilities. It remains a client of the Mesh authority path and may not approve its own effects.

### Sovereign Vaults

The Pack references vault manifests and their digests. It does not embed raw vault content, raw keys, or a plaintext global index.

Each vault remains independently encrypted, independently recoverable where policy permits, and independently revocable.

### Correction and evaluation ledger

Long-term companion quality depends heavily on owner corrections, evaluation outcomes, preferences, and known limitations. Those should remain portable even when the base model changes.

A correction ledger is not permission to train a model. It is a provenance-bearing continuity artifact.

### Optional personalized model artifact

The owner may deliberately create a LoRA, adapter, fine-tuned local model, embedding-derived component, or equivalent personalized artifact.

That artifact is optional. The Pack must remain useful without it.

A personalized artifact:

- is not the owner's legal or verified identity;
- does not become a vault;
- does not receive effect authority merely because it was trained on owner data;
- must reference the exact adaptation authorization under which it was created;
- must record the base model and artifact digest;
- must record where adaptation occurred;
- must record evaluation and known memorization/privacy limitations;
- must describe deletion/retraining consequences;
- must state where the resulting artifact may execute; and
- must remain replaceable.

## Why revocable memory stays outside weights by default

Encrypted records and explicit memory objects can usually be corrected, tombstoned, revoked, re-encrypted, or selectively restored. Learned weights do not provide the same clean semantics.

Therefore:

1. revocable personal context stays in Sovereign Vaults by default;
2. the local companion retrieves only currently authorized context through leases;
3. durable model adaptation is an explicit separate operation;
4. removing a source record does not create the false claim that all influence has been mathematically removed from an already trained artifact; and
5. adaptation authorization must tell the owner whether deletion requires artifact destruction, retraining, replacement, or another documented mitigation.

This does not prohibit deeply personalized local models. It makes their lifecycle honest and governable.

## Personal Agent Pack v2 contents

The v2 manifest binds five major groups.

### 1. Owner and pack identity

The manifest identifies:

- owner subject reference;
- pack identifier and version;
- creation and update time;
- minimum compatible kernel version where applicable; and
- manifest digest/signature references where implemented.

The manifest itself contains no authentication secret.

### 2. Vault inventory

For every referenced vault the Pack records:

- vault identifier;
- domain label;
- vault-manifest reference;
- exact manifest digest;
- recovery-policy reference;
- backup references where configured; and
- whether the vault can be selectively restored.

The inventory is owner-private metadata. Exporting a Pack does not authorize the recipient to open its vaults.

### 3. Companion components

Components may include:

- Agent Runtime Capsule;
- correction ledger;
- evaluation ledger;
- preferences and accessibility configuration;
- owner policy and consent references;
- routing policy;
- voice configuration;
- avatar/persona configuration;
- local semantic index metadata;
- optional personalized model adapter; and
- recovery metadata.

Every component is content-addressed and has an encryption/custody classification.

### 4. Runtime preferences

The Pack may preserve the owner's routing preferences, allowed/denied runtime capsules, approved providers/models, local-only requirements, and budget ceilings.

These preferences constrain future placement but do not themselves grant execution authority.

### 5. Recovery and migration

The Pack records enough information to reconstruct the owner's chosen companion stack without making one provider a continuity bottleneck.

Recovery may be selective. Restoring the education vault must not require restoring the finance or health vault. A Pack should be able to report that a component is unavailable without silently substituting a different artifact.

## Backup model

The recommended backup hierarchy is:

```text
Pack manifest backup
   |
   +-- vault manifest + encrypted vault backup references
   +-- component artifact backup references
   +-- policy / consent / recovery references
   +-- optional personalized adapter backup reference
```

The Pack is therefore small compared with the data it describes.

A Pack backup MUST NOT contain plaintext provider secrets, raw payment credentials, private device keys, vault root keys, or other raw secret material.

## Selective recovery

Selective recovery is a first-class property.

A recovery operation should be able to restore:

- one vault;
- one companion component;
- policy/preferences without private content;
- correction/evaluation history;
- an approved personalized adapter; or
- the complete owner-selected stack.

Missing optional components must fail visibly. The system may offer alternatives, but it may not claim continuity with an unverified substitute.

## Provider and model migration

Migration follows this order:

1. verify the Pack and component digests;
2. restore owner policy and vault manifests;
3. restore or reconnect independently protected vaults;
4. select a policy-eligible runtime/model/node;
5. restore correction/evaluation and presentation state;
6. load an optional personalized adapter only if compatible and authorized;
7. run migration evaluation against owner baselines; and
8. require normal Mesh authority for any external effect.

A successful import proves that the named artifacts were restored and validated according to their contracts. It does not prove subjective identity continuity or equivalence of two base models.

## Personal model adaptation authorization

A durable personalized model artifact requires an explicit `axiom-personal-model-adaptation-authorization.v1` object.

The authorization binds:

- owner subject;
- exact source vaults and source-resource scope;
- allowed adaptation operation;
- target base model and expected output artifact class;
- execution node/provider/destination;
- source-data egress and retention;
- purpose;
- licence/use scope;
- evaluation requirements;
- memorization/privacy review requirements;
- resulting artifact custody;
- allowed execution locations;
- expiry/revocation behavior; and
- deletion/retraining consequences.

No wildcard source scope is allowed in v1.

### "Train on everything about me"

The product may offer the owner a high-level choice such as "use all eligible personal context," but the authorization compiler must still expand that request into an exact, reviewable source set after applying vault policy, exclusions, sensitivity rules, licences, and jurisdictional constraints.

The high-level phrase is therefore an intent, not a wildcard authority primitive.

Some vaults may be excluded even when the owner requests broad adaptation—for example secrets/recovery material, credentials, content whose licence forbids training, records under a non-waivable institutional restriction, or content whose policy requires a different confirmation flow.

## Derived indexes and embeddings

Embeddings and semantic indexes can expose information even when they are not conventional model weights. V2 therefore treats durable derived indexes as governed companion components.

Their source scope, storage location, retention, deletion behavior, and exportability must be explicit. A local semantic index does not become a public search surface.

## Companion access after restoration

Restoring a Pack does not give the companion ambient access to all referenced vaults.

After recovery, normal Sovereign Vault rules still apply:

```text
companion semantic need
  -> deterministic policy
  -> short-lived Vault Access Lease(s)
  -> local synthesis
```

Outside agents continue to receive Context Capsules rather than Pack or vault access.

## Effects remain separate from knowledge

A deeply personalized companion may know the owner's preferences, history, projects, relationships, health constraints, financial plans, or communication style. Knowledge does not imply authority.

The companion cannot send a message, spend money, publish content, change policy, disclose sensitive information, operate a device, or perform another privileged effect merely because the Pack restored relevant context.

Every such effect remains subject to the normal Mesh authority path.

## Loss and compromise model

### Pack manifest compromise

A Pack manifest can reveal private metadata about the existence and structure of personal components. It must therefore be treated as owner-private even though it contains no raw secrets.

### Personalized model compromise

A personalized model or adapter may leak learned information. It receives its own sensitivity and custody policy and must not be treated like an ordinary downloadable cosmetic artifact.

### One-vault compromise

Independent vault key domains are intended to keep compromise of one vault from automatically decrypting another.

### Recovery compromise

Recovery references must not themselves contain raw recovery secrets. Secret custody remains separately protected.

## Version relationship to Personal Agent Pack v1

`personal-agent-pack.v1` remains unchanged for backward compatibility and provenance.

V2 is a new contract rather than a silent mutation of v1 because it introduces explicit Sovereign Vault inventory, selective recovery, context-broker-era continuity, and stronger personalized-artifact governance.

An importer may support both versions, but v1 must not be interpreted as implicitly satisfying v2 invariants.

## Versioned contract set

This specification introduces:

- [`personal-agent-pack.v2.schema.json`](contracts/personal-agent-pack.v2.schema.json)
- [`personal-model-adaptation-authorization.v1.schema.json`](contracts/personal-model-adaptation-authorization.v1.schema.json)

It builds on the existing Sovereign Vault, Context Request, Vault Access Lease, Context Capsule, Agent Runtime Capsule, and Personal Agent Pack v1 contracts.

## Promotion gates and non-claims

Before Personal Agent Pack v2 is runtime-enabled, the repository needs at minimum:

1. canonical pack signing/verification;
2. encrypted export/import format;
3. independent vault backup and restore implementation;
4. selective recovery tests;
5. component compatibility validation;
6. provider/model migration evaluation;
7. adaptation-authorization enforcement;
8. personalized-artifact custody and deletion tests;
9. downgrade and rollback handling;
10. lost-component and corrupt-component drills;
11. owner-facing export/import/recovery UX evidence; and
12. security/privacy review appropriate to the activated scope.

This specification does **not** claim implemented Pack v2 export/import, personalized model training, adapter loading, model unlearning, complete deletion from trained weights, hardware key custody, cross-provider identity equivalence, production recovery, or regulated-domain compliance.

No capability registry state is changed by this document or its schemas.

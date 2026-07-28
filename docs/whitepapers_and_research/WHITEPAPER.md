# AXIOM-MESH Technical White Paper

**Version:** 0.11

**Updated:** 2026-07-28

**Status:** implementation-grounded description of the clean-room kernel

**Deployment status:** production candidate; no live production claim

## Abstract

AXIOM-MESH is a local-first capability network for converting an authenticated
human or agent intent into a policy-authorized plan, executing approved effects
inside a bounded runtime, and recording portable cryptographic evidence.

The kernel separates public ingress, policy and planning, execution, and
durable evidence into four supervised services: Gateway, Hypervisor, Sandbox,
and Grid. Its security model relies on explicit principals, signed
audience-bound service requests, short-lived single-use execution grants,
deny-dominant policy, deterministic built-in tools, authenticated encryption,
and a signed hash-linked evidence log.

Version 0.11 implements a single-node authority and transparency system. It
does not claim BFT consensus, arbitrary-code isolation, public settlement,
external AI, regulatory compliance, or proof that a model's private reasoning
is true. Capability status is machine-readable and evidence-gated.

## 1. Motivation

Agent systems often combine model prompts, tools, credentials, storage, and
external effects in one process. That design makes it difficult to answer:

- who requested an effect;
- which policy authorized it;
- which exact plan and tool were approved;
- whether authority was reused or broadened;
- what durable state changed;
- how an operator can verify, export, restore, or dispute the result.

AXIOM-MESH treats those questions as the product boundary. Intelligence is not
trusted merely because it produced plausible text. An effect is accepted only
when explicit authority, validation, execution constraints, and evidence agree.

The design favors a smaller verifiable kernel over an expansive collection of
nominal integrations. Historical repository material remains useful for
requirements and research, but does not become a supported capability without
production-path evidence.

## 2. Design principles

### 2.1 Intent is data, not authority

An intent expresses a requested outcome. It is validated and normalized, but
does not itself grant permission to execute an effect.

### 2.2 Planning and execution are separate

Hypervisor constructs an explicit plan and issues narrowly bound authority.
Sandbox executes only an approved deterministic tool under that authority.
Grid records the result but does not decide what the requester wanted.

### 2.3 Authority is explicit and expiring

Service requests and capability grants identify issuer, audience, principal,
intent, plan, policy, tool, constraints, time bounds, and one-use identifiers.
Ambient credentials and reusable broad authority are rejected.

### 2.4 Policy can only become stricter through composition

Global, owner, user, and request policy layers merge deny-dominantly. A lower
layer cannot turn a denial into permission, reduce risk, remove required
scopes, or reduce required confirmations.

### 2.5 Evidence is part of execution

A successful effect is incomplete until Grid commits the state mutation and
its evidence transactionally. Evidence includes cryptographic linkage to the
previous record and is verified on startup and through operator checks.

### 2.6 Claims follow executable evidence

The [capability registry](../../mesh/config/capabilities.json) classifies each
capability as implemented, experimental, specified, adapter-required, or
disabled. Only `implemented` is a runnable claim.

## 3. System model

### 3.1 Four services

| Service | Responsibility | Explicitly excluded authority |
|---|---|---|
| Gateway | Public authentication, request validation, abuse controls, idempotency, operator API | May not invent execution authority |
| Hypervisor | Intent normalization, deny-dominant policy, plan construction, approval checks, grant issuance | May not execute arbitrary effects or mutate Grid directly without authorized flows |
| Sandbox | Validate a grant and run a named deterministic built-in tool | No ambient network, shell, package, filesystem, or container authority |
| Grid | Durable encrypted state, evidence, registries, consent, governance, accounting, portability, recovery | May not decide intent or silently authorize an effect |

The normal mutation path is:

```text
principal
   |
   v
Gateway -> Hypervisor -> Sandbox -> Grid
   |           |            |         |
 auth      plan/policy     grant     state+evidence
```

Each hop is independently authenticated. A service cannot substitute a valid
signature for a different body, audience, time window, or nonce.

### 3.2 Trust boundary

In the 0.11 production candidate, all four services are separate Node.js
processes inside one container. Gateway binds to loopback on the host; the
internal services bind only to container loopback. The interim topology avoids
remote plaintext without claiming an mTLS adapter that does not yet exist.

The operating system, container engine, host administrator, mounted secret
paths, and data-protection key remain trusted components. The candidate is not
a defense against a fully compromised host.

## 4. Intent-to-evidence lifecycle

1. **Authenticate.** Gateway maps an API token to a principal and scopes.
2. **Validate.** Request schema, size, action, and idempotency are checked.
3. **Normalize.** Hypervisor produces the canonical intent representation.
4. **Evaluate policy.** Deny-dominant layers determine whether planning may
   continue and whether independent confirmation is required.
5. **Build a plan.** The plan names a supported action, ordered steps,
   constraints, dependencies, and public rationale without storing private
   model reasoning.
6. **Approve high risk.** A different authenticated principal provides the
   required one-use approval.
7. **Issue a grant.** Hypervisor signs a short-lived, single-use,
   Sandbox-audience capability bound to principal, intent digest, plan digest,
   policy digest, tool, and constraints.
8. **Execute.** Sandbox verifies the grant and invokes only the named built-in
   deterministic tool.
9. **Commit.** Grid applies the authorized mutation and evidence in one
   transaction.
10. **Return and observe.** Gateway returns structured results while telemetry
    records bounded status and error classes rather than sensitive values.

A failure at any step produces no success claim for later steps.

## 5. Identity, requests, and replay defense

Service identities use Ed25519 keys. Production identities are provisioned
outside the repository and stored in mounted secret paths. Trust records bind a
service name to its public key.

Signed requests include:

- issuer and audience;
- timestamp and validity window;
- one-use nonce;
- method and route context;
- request-body digest.

Verification rejects an unknown issuer, wrong audience, stale request, body
change, signature failure, or nonce replay. Production startup refuses
automatic identity generation and refuses remote plaintext internal URLs.

Credentials from deprecated repository history are permanently untrusted.
Restoring an old key is a security incident, not a recovery procedure.

That boundary is executable rather than narrative. A secret-free ledger
contains keyed HMAC identifiers for 32 conservative candidates found across
the locked deprecated object graph. Protected CI reconstructs the exact
inventory using a separately held 256-bit audit key and fails if an identifier
is missing from the ledger or reappears in the supported tip. The committed
identifiers do not form an offline password oracle, and the evidence contains
no candidate values. Repository trust revocation is complete; external
provider or prior-deployment attestations remain explicitly incomplete.

The candidate supports an offline, coordinated replacement of all four service
identities and the operator API token. A Grid runtime lock excludes concurrent
startup. The retiring and successor Grid identities both attest a public
transition manifest, allowing the evidence verifier to follow authorized key
lineage in either direction without retaining a retired private key. The prior
credential set is authenticated-encrypted before replacement, and exact
rollback preserves the rotated set in a second encrypted package.

This lifecycle does not replace external revocation evidence for credentials
from deprecated history. The data-protection key uses a separate offline
protocol because it cannot be changed as a file-only credential swap. The
protocol re-encrypts the live Grid, recovery database copies, backup envelopes
and their nested protected columns, and retained credential packages. Signed
rewrap nodes bind each new ciphertext—and each transformed backup plaintext
digest—to the prior signed state. The new key is committed last through a
recoverable multi-file journal. A completed rotation can be rolled back by
re-encrypting the current evidence state rather than restoring a stale
database, while an interrupted cutover restores its recorded originals.
If service credentials were rotated during the new-key window, rollback
retains only the derived credential-manifest authentication key, encrypted
under the restored data key; the retired data-encryption key is not retained.

## 6. Policy and approvals

Policy rules name the action decision, risk, required scopes, confirmations,
and constraints. Composition applies the strictest result:

- any denial wins;
- the highest risk wins;
- required scopes are accumulated;
- required confirmations cannot decrease;
- numerical and categorical constraints can only narrow authority.

High-risk effects that remain permitted require independent approval. Approval
is bound to the specific intent/plan context, expires, and cannot be replayed
for another request.

Local governance can activate authority-reducing policy overlays after voting,
finalization, timelock, and independent approval. Rollback, emergency review,
and appeal records are retained. Portable delegation remains outside the
implemented boundary.

## 7. Execution boundary

The supported Sandbox is not a general-purpose code runner. It contains a
small registry of deterministic built-in tools whose inputs and outputs are
validated. A valid grant for one tool cannot authorize another.

Historical Docker and capsule runtimes do not establish arbitrary-code
security. A rootless OCI adapter remains adapter-required until digest
allowlisting, deny-by-default egress, resource enforcement, cancellation,
artifact handling, and escape testing are independently evidenced.

This constrained boundary is intentional: deterministic useful behavior with
defensible authority is preferred to broad execution with unverifiable
isolation.

## 8. Grid, evidence, and durability

Grid owns the kernel database and signed evidence log. Durable payloads are
authenticated-encrypted with context binding. A ciphertext copied into another
storage context fails authentication.

Each evidence record includes the previous record hash, forming a
transactional SHA-256 linked sequence. Startup verifies continuity and fails
closed if a record signature cannot be resolved through the current Grid key
or a connected dual-signed rotation transition. Thus a supported key change
does not require resigning or weakening historical evidence.
Schema migrations are contiguous and checksum-verified.

Implemented Grid-owned families include:

- principals and identity-related state;
- consent receipts;
- capsule manifests and revocation;
- memory objects and edges;
- governance proposals and policy activation records;
- admitted nodes and storage offers;
- balanced local accounting journals;
- import/export records;
- causal updates and conflict-resolution records;
- recovery evidence.

Grid is a single-node transparency log, not distributed consensus.

## 9. Consent, memory, and accounting

Consent receipts bind purpose, scope, subject, controller, expiry, and
revocation. Memory objects are content-addressed, encrypted, owner-bound, and
selectively disclosable only under compatible consent.

Local accounting uses owner- and unit-bound accounts and transactional balanced
double-entry journals with safe integer amounts. It does not authorize a token,
bridge, treasury, exchange, payroll, or external settlement claim.

## 10. Portability and recovery

### 10.1 Export

Canonical JSONL exports can be scoped by time, record family, owned object, and
capsule. Manifests are signed and independently verifiable. Optional X25519
recipient encryption makes records opaque to the transport/storage layer while
retaining a verifiable manifest.

### 10.2 Import

An import is first cryptographically verified and staged. The operator receives
a deterministic diff. Independent approval is required before applying records
to an isolated foreign-provenance store. Imported data cannot overwrite native
state or impersonate local evidence.

### 10.3 Offline causal sync

Admitted nodes can exchange signed bundles with version vectors. The kernel
rejects replay, noncontiguous author counters, equivocation, missing
dependencies, and incomplete conflict resolution. Concurrent heads remain
visible until a resolution names every current head.

This is offline exchange, not peer discovery, transport, federation, or BFT.

### 10.4 Backup and restore

Grid snapshots are encrypted, signed, context-bound, and exact-digest
verified. Restore requires a stopped Grid, preserves the replaced database,
and records pending recovery so the next trusted startup emits signed recovery
evidence. When data-key rotation changes snapshot ciphertext or nested
protected columns, a trusted Grid-signed rewrap chain maps the active storage
digest back to the original backup manifest and preserves its evidence head.

Retention is also evidence-bound. A Grid-signed plan covers an exact inventory
only after every backup decrypts and its manifest, schema, and evidence chain
verify. The policy preserves a minimum and selects excess media by age and
newest-first rank. Apply requires Grid to be stopped and the inventory to be
unchanged, then journals atomic moves into recoverable quarantine rather than
deleting data. A signed receipt binds the retained and retired sets. Interrupted
moves resume from their signed journal, and quarantined snapshots remain in
data-key rotation scope. Protected CI repeats the lifecycle and restores a
retained backup weekly; this is mechanism evidence, not pilot-media custody or
destruction authorization.

## 11. Observability and operations

Every service emits bounded-cardinality telemetry. Readiness includes required
dependencies and Grid evidence integrity. Authenticated operator endpoints
return a four-service operations report and OpenMetrics-compatible output.

Metrics and alerts do not use principals, prompts, payloads, tokens, query
strings, object identifiers, or intent identifiers as labels. Static alert
states cover authentication failures, replay rejection, integrity failure,
server errors, and service unavailability.

External storage for metrics and alert delivery are future adapters because
they introduce egress, credentials, retention, and delivery failure modes.

## 12. Production candidate

The production candidate uses:

- Node.js 24.18.0 in a digest-pinned Alpine base;
- a non-root numeric identity;
- a read-only root filesystem;
- dropped Linux capabilities and `no-new-privileges`;
- explicit CPU, memory, and process ceilings;
- bounded logs;
- mounted data and secret files;
- Gateway publication restricted to host loopback;
- readiness-based health checking;
- a supervisor that terminates partial startup.

Compose cannot both isolate the kernel on an internal network and publish
Gateway to the host. The candidate therefore treats deny-egress as a required
host or orchestrator policy for pilot promotion, not as a property already
enforced by the Compose file.

Provisioning creates four service identities, trust records, an API principal
registry, operator token, and data-protection key without printing secrets.
Partial secret sets are rejected rather than silently repaired.

The host-mode four-process drill is implemented. Image build and composed
runtime evidence must pass in published CI before the container capability is
promoted. The full promotion criteria are defined in
[Production Grade](../PRODUCTION-GRADE.md).

## 13. Supply chain and claim governance

The kernel has no third-party runtime packages. Committed lockfiles are checked
for unexpected dependencies. Release verification binds:

- source commit and dirty state;
- capability-registry and policy digests;
- operator-surface digest;
- migration checksums;
- rollback documentation;
- container and workflow policy;
- deprecated credential-history ledger and protected reuse policy;
- canonical documentation;
- SPDX SBOM and provenance inputs.

Generated status and governing claim documents carry the registry schema,
kernel version, and digest. Documentation is part of the release surface:
missing canonical documents, broken local links, stale generated output, or
security-policy drift fail the release gate.

## 14. Threat model

The kernel explicitly addresses:

- forged or replayed service requests;
- wrong-audience and expired grants;
- policy weakening through lower-precedence configuration;
- approval reuse or self-approval;
- payload and evidence tampering;
- wrong data-protection keys;
- partial credential provisioning;
- service dependency loss and partial startup;
- secret leakage through logs, metrics, images, or release files;
- native-state overwrite by imported records;
- causal replay, equivocation, and incomplete conflict resolution.

Residual risks include:

- compromised host or container engine;
- operator credential theft;
- denial of service beyond configured ceilings;
- unreviewed cryptographic implementation defects;
- single-node loss of availability or authority compromise;
- operational mistakes in secret custody and recovery;
- vulnerabilities in future adapters.

## 15. Governance and evolution

The kernel evolves through evidence-gated capability changes. The
[roadmap](../ROADMAP.md) prioritizes repository control, container evidence, a
single-node pilot, multi-host authenticated transport, and narrowly scoped
adapters.

External domains do not inherit trust from the kernel. Education, health,
government, finance, messaging, AI, chain, token, bridge, and embodied systems
each require separate identity, consent, authorization, retention, dispute,
legal, safety, and operational evidence.

## Non-claims

Version 0.11 does not claim:

- live public deployment;
- decentralized or BFT consensus;
- automatic peer discovery or multi-host scheduling;
- arbitrary-code sandbox security;
- proof that model reasoning or output is true;
- operational zk verification without a named verifier adapter;
- token, bridge, liquidity, staking, or chain settlement;
- universal installation or production browser dashboards;
- production AI-provider or messaging integrations;
- clinical, educational, governmental, or financial compliance;
- embodied autonomy;
- end-to-end post-quantum security;
- independent external audit.

Descriptions of those systems in historical documents are specifications or
research unless the current registry says otherwise.

## Reproducibility

Use an allowed Node.js 24 runtime. From the repository root:

```bash
npm ci --ignore-scripts
npm run check
npm run release:verify
```

For the production candidate, follow the
[container runbook](../../mesh/PRODUCTION.md). A valid result must identify the
source commit, registry digest, policy digest, migrations, deployment policy,
and clean/dirty state. Production promotion additionally requires immutable CI
image/runtime evidence and the gates in the
[readiness tracker](../PRODUCTION-READINESS-TRACKER.md).

## Conclusion

AXIOM-MESH 0.11 is an authority-minimizing kernel, not a claim that every
historical vision is implemented. Its core contribution is a verifiable
intent-to-evidence boundary in which authentication, policy, planning,
execution, durable state, and operator claims can be inspected independently.

The path forward is deliberately evidence-first: prove the container, operate
one recoverable pilot, measure it, secure the repository and supply chain, then
expand authority only through narrowly reviewed adapters.

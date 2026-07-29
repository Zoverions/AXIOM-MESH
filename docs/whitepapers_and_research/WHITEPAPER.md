# AXIOM-MESH Technical White Paper

**Version:** `0.12.0-dev.0`

**Updated:** 2026-07-29

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

The current 0.12 development build implements a single-node authority and
transparency system. It
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

In the current production candidate, all four services are separate Node.js
processes. The compact topology supervises them inside one container. The
independent-unit topology runs four containers on a Docker internal network,
with Gateway preserving permission-restricted Unix-domain host ingress. Both
use mutually authenticated TLS 1.3 on every internal edge.

The unit projection gives each runtime only its own application private key
and TLS leaf. Grid alone receives durable state and the data-protection key;
Gateway alone receives the API principal registry. Protected failure evidence
terminates Sandbox, requires readiness degradation while the other three
processes remain unchanged, restarts only Sandbox, and verifies preserved
Grid state. This is single-host failure isolation, not replicated state or
automatic failover.

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

TLS uses a locally provisioned Ed25519 CA and distinct service leaves whose
DNS SAN and SPIFFE-style URI name Gateway, Hypervisor, Sandbox, Grid, or the
supervisor probe. Both peers validate the CA and TLS 1.3; clients additionally
pin the expected active server fingerprint, while servers bind the active
client fingerprint to the caller in the signed request. This preserves
message-level audience, body, timestamp, and replay guarantees above channel
authentication.

Offline rotation stages a complete leaf generation, atomically swaps the
active directory, and retains the previous generation for exact rollback.
Active-leaf pinning rejects a retired but still CA-valid credential without
adding an OCSP network dependency. Protected CI exercises initial, rotated,
and restored real stacks. Per-service mounts are implemented in the
single-host unit topology. External CA custody,
orchestrator rollout, and CA-compromise recovery remain pilot controls.

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
- admitted nodes, encrypted scheduling reservations, and storage offers;
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

### 10.4 Admitted-node discovery and scheduling

A v2 node admission extends the signed identity statement with an exact HTTPS
origin, failure domain, roles, bounded resource ceilings, and assignment
concurrency. Grid also binds the statement to the authenticated owner, rejects
an active signing key reused under another node identifier, and bounds active
admissions per owner. Renewal, expiry, and quarantine determine whether the
node is eligible.

Authenticated discovery filters the signed set by capability, role, security,
and minimum remaining lease, then Grid signs the canonical response. A
policy-controlled schedule intent deterministically chooses only a complete
placement satisfying per-replica resources, existing lease load, concurrency,
owner caps, exclusions, and optional failure-domain separation. Requirements
and placements are encrypted in Grid. Quarantine or loss of the original
identity/capability/resource contract degrades an existing reservation; lease
expiry releases it from effective load.

This mechanism allocates evidence-backed reservations inside one Grid. It does
not contact an endpoint, attest resource truth, authorize remote execution,
transport a workload, authenticate a result, solve global Sybil resistance, or
provide federation or consensus. The signed control drill uses missed renewal
as the conservative partition model and does not claim a live WAN experiment.

### 10.5 Online causal exchange

Online exchange is a host-side, operator-approved extension of the signed
causal package protocol. One direction binds a matching owner, exact source
and destination Gateway HTTPS origins, and a pinned source Grid Ed25519 key.
The relay verifies source event payloads, hashes, and Grid attestations before
independently verifying each node-signed bundle. Cursor, pending bodies, retry
state, and receipts are bounded and authenticated-encrypted with a separate
state key.

Connectivity does not become authority. Polling can stage but cannot apply a
bundle, and the relay holds no approver token. The destination still requires
one exact, expiring, single-use approval from another principal through the
normal intent, policy, plan, grant, Sandbox, and Grid path. An owner-isolated
receipt lookup detects duplicates before approval and makes ambiguous
post-commit recovery idempotent.

Partitions preserve the cursor and enter bounded backoff. Rejoin applies in
source-event order. Concurrent heads remain visible on both Grids; the relay
does not select a clock-based or last-write winner. A new signed update must
causally dominate and name every head before convergence. Protected evidence
uses two real production supervisors and a controlled bidirectional partition.
This proves causal record transfer and conflict semantics, not replicated Grid
consensus, BFT, leader election, arbitrary federation, or WAN performance.

### 10.6 Deployment-independent provider startup

Production services retain a deliberately narrow path-based input boundary.
A host broker can populate that boundary from separate secret and policy
providers without linking a vendor vault or cloud SDK into the kernel. The
operator pins each provider's absolute executable, executable digest,
supporting artifact digests, provider ID, and Ed25519 trust set. Secret and
policy identities must be disjoint.

A startup request binds a random nonce, short expiry, deployment and provider
audiences, and an exact resource inventory. The response binds the full
request digest, exact aliases, immutable versions, media types, byte counts,
content digests, and values under a provider signature. Bounded execution,
output, and environment prevent the adapter process from creating ambient
kernel authority. Any missing, extra, replayed, expired, oversized, invalid,
or wrongly signed resource rejects the complete startup.

Verified values are written into one private ephemeral generation at
broker-chosen paths. The broker validates the data key, API principals,
ordered deny-dominant policies, capability registry, and active internal TLS
generation before launching the existing supervisor. The generation is
removed after shutdown. This proves a custody-neutral protocol and reference
adapter, not a vendor backend, workload-identity configuration, live refresh,
high availability, multi-host rollout, or secure deletion from durable media.

### 10.7 Backup and restore

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

External storage is reached only by a host-side relay; the kernel retains
deny-egress. A route-restricted `telemetry:collect` credential can read only
the two telemetry surfaces over the Gateway Unix socket. The relay transforms
the exact four-service report into 68 fixed OTLP/HTTP JSON metric points and a
fixed Alertmanager v2 vocabulary. Exact HTTPS origin allowlists, no redirects,
private file-backed receiver credentials, item and queue byte ceilings,
alert-reserved capacity, exponential retry, stable idempotency keys, bounded
resolution replay, dead-letter visibility, and secret-free delivery audit
contain the adapter's additional authority. Protected CI signs a real
Unix-socket scrape and forced 503/429 retry exercise; pilot-owned endpoints,
receiver retention, and human acknowledgement remain deployment evidence.

The candidate resilience profile constrains two failure classes without adding
a remote administrative surface. Request-body limits are enforced before
idempotency reservation, concurrent demand is bounded by a fixed token bucket,
and rejection telemetry remains low-cardinality. A supervisor-private child
inventory lets the Linux drill suspend and kill the real Sandbox process.
Required-dependency loss propagates through Hypervisor and Gateway readiness;
child death terminates the supervisor fail-closed; and a fresh stack must
preserve pre-fault Grid state. Grid signs a secret-free record of the profile
and outcomes. This does not model cgroup OOM, disk exhaustion, or pilot
orchestrator recovery, which remain deployment-specific experiments.

Host-side evidence drills coordinate their loopback endpoints with atomic,
aligned four-port leases visible across test processes. Ownership spans
stopped-runtime transitions and restarts, while an independent socket probe
rejects externally occupied candidates. This separates orchestration of
concurrent evidence jobs from the production network trust model and prevents
one drill from invalidating another through a check-then-bind race.

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

Compose gives the kernel no attached network. A permission-restricted,
bind-mounted Unix-domain socket carries explicit host-local Gateway ingress
while all four services remain on container loopback. The production
supervisor reads the effective Linux IPv4 and IPv6 route tables before
launching children and rejects every non-loopback or default route. Protected
CI first proves its public TCP target is reachable from the runner, then proves
the running container cannot connect while loopback readiness and
authenticated Unix-socket ingress remain functional. The Docker daemon and
host remain
trusted, and other orchestrators require equivalent independent evidence.

The alternate four-container Compose definition uses an `internal: true`
network rather than `network_mode: none`, because the services require three
authenticated network edges. It publishes no TCP port, retains the Unix
socket, and has no public route. Protected CI stops Sandbox alone, checks
survivor container identity and `503` readiness, starts Sandbox alone, checks
recovery, and proves a runner-reachable public TCP target is unreachable from
a unit. Each topology has a different executable deny-egress control; neither
permits ambient external network access.

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
- signed candidate-container deny-egress route and connection evidence;
- machine-readable incident severity, role, containment, communication, and
  closure policy;
- signed automated incident-tabletop evidence bound to same-revision
  recovery, backup, restart, resilience, independent-service-unit, transport,
  node-scheduling, online-causal-partition/rejoin, credential-rotation, and
  data-key controls;
- signed independent-process failure-isolation evidence and protected
  four-container Sandbox-only recovery and blocked-public-egress checks;
- deprecated credential-history ledger and protected reuse policy;
- canonical documentation;
- SPDX SBOM and provenance inputs.

Generated status and governing claim documents carry the registry schema,
kernel version, and digest. Documentation is part of the release surface:
missing canonical documents, broken local links, stale generated output, or
security-policy drift fail the release gate.

Pilot evidence has a separate cryptographic intake boundary. An Ed25519 policy
authority, distributed independently from the evidence package, signs one
source revision, immutable image digest, validity window, current 30-day/SLO/
recovery gates, exact external evidence inventory, and five distinct reviewer
public keys. The dossier records four trust roots, five non-exportable custody
controls, measured results, and 13 unique artifact digests. Each accountable
role signs the same canonical dossier digest.

This design prevents a repository test identity, one operator, a stale
artifact, or a cross-build result from silently satisfying multiple promotion
roles. The final offline intake directory contains only canonical policy and
dossier files plus the 13 canonical evidence envelopes at fixed local paths.
Each secret-free envelope binds the exact deployment and build, matches the
dossier's raw-byte digest, satisfies an exact evidence-type v2 semantic
contract, and carries the signature of its policy-assigned reviewer role.
These contracts bind observation and capacity values back to the dossier,
repeat the five custody controls, require complete credential dispositions,
and prohibit unresolved critical/high review findings. Noncanonical JSON,
unknown detail fields, contradictory values, extra or missing files, symlinks,
secret fields, build drift, and role substitution fail closed. Human reviewers
still judge whether the evidence supports its disposition. The only successful
verifier state is accepted for a later promotion review, with production
explicitly false. Protected CI signs synthetic conformance for both the
dossier and exact-package rejection paths but cannot manufacture an observed
pilot.

Independent security-review evidence has a separate exact intake. A
separately supplied authority key authenticates one current build, eight-part
threat/configuration scope, eight immutable reviewed artifact digests, an
independent reviewer, and a distinct exception approver. The reviewer signs
the complete findings ledger. Counts are recomputed; critical/high findings
must have closed remediation reverified by that reviewer; medium/low
exceptions require separate approval, containment, ownership, and bounded
expiry. Synthetic CI proves rejection behavior while declaring that it
performed no independent review and promoted nothing. The canonical threat
model and exact procedure are maintained in the
[current-build threat model](../security/CURRENT-BUILD-THREAT-MODEL.md) and
[review intake runbook](../security/INDEPENDENT-SECURITY-REVIEW.md).

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
- forged source-Grid exchange evidence, reordered online delivery, ambiguous
  post-commit response, queue overflow, and approval bypass.

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

The `0.12.0-dev.0` build does not claim:

- live public deployment;
- decentralized or BFT consensus;
- federated peer discovery, remote dispatch, or multi-host scheduling;
- arbitrary-code sandbox security;
- proof that model reasoning or output is true;
- operational zk verification without a named verifier adapter;
- token, bridge, liquidity, staking, or chain settlement;
- universal installation or production browser dashboards;
- production AI-provider or messaging integrations;
- clinical, educational, governmental, or financial compliance;
- embodied autonomy;
- end-to-end post-quantum security;
- independent external audit;
- an authentic reviewed pilot dossier or production promotion.

Descriptions preserved on the deprecated documentation branch are not current
specifications and cannot override the capability registry.

## Reproducibility

Use an allowed Node.js 24 runtime. From the repository root:

```bash
npm run setup
```

The command validates the Node.js/npm policy and CI/container pins, installs
both exact zero-dependency locks with lifecycle scripts disabled, proves the
locks unchanged, and runs the clean-kernel and release gates. It does not
provision production credentials. The complete trust, receipt, and non-claim
boundary is specified in the
[automated source setup runbook](../operations/AUTOMATED-SOURCE-SETUP.md).

For the production candidate, follow the
[container runbook](../../mesh/PRODUCTION.md). A valid result must identify the
source commit, registry digest, policy digest, migrations, deployment policy,
and clean/dirty state. Production promotion additionally requires immutable CI
image/runtime evidence and the gates in the
[readiness tracker](../PRODUCTION-READINESS-TRACKER.md).
The independent-unit mechanism and its limitations are specified in the
[service-unit runbook](../operations/INDEPENDENT-SERVICE-UNITS.md).
The online causal transport, approval, partition, conflict, and non-consensus
boundary is specified in the
[online exchange runbook](../operations/ONLINE-CAUSAL-EXCHANGE.md).
The signed startup-provider protocol, private generation lifecycle, adapter
conformance contract, and vendor non-claims are specified in the
[provider runbook](../operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md).
The separately anchored policy, exact canonical offline inventory, five-role
signature model, dossier preflight and package-intake commands, and explicit
non-promotion boundary are specified in the
[pilot dossier runbook](../operations/PILOT-DEPLOYMENT-DOSSIER.md).
The independent-review scope, signed findings/remediation/exception contract,
and explicit non-promotion boundary are specified in the
[independent security review runbook](../security/INDEPENDENT-SECURITY-REVIEW.md).

## Conclusion

AXIOM-MESH `0.12.0-dev.0` is an authority-minimizing kernel, not a claim that
every archived vision is implemented. Its core contribution is a verifiable
intent-to-evidence boundary in which authentication, policy, planning,
execution, durable state, and operator claims can be inspected independently.

The path forward is deliberately evidence-first: prove the container, operate
one recoverable pilot, measure it, secure the repository and supply chain, then
expand authority only through narrowly reviewed adapters.

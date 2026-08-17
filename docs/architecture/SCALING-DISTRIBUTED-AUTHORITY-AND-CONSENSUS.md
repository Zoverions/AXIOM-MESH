# Scaling, Distributed Authority, and Consensus Invariants

**Status:** forward architecture constraint  
**Created:** 2026-07-30  
**Applies to:** current scalability work and all future federation, governance, consensus, and settlement laboratories

## Purpose

AXIOM-MESH must scale without making its present single-Grid design a dead end.
Adoption may eventually require independently operated nodes, shared governance,
replicated evidence, threshold decisions, Byzantine fault tolerance, public
verification, and selected forms of settlement.

Those capabilities must be possible without surrendering the properties that
make the present kernel defensible:

- fail closed rather than infer authority;
- preserve individual and organizational sovereignty;
- separate installation, enablement, exposure, promotion, and marketing;
- require explicit policy, consent, plans, grants, approvals, and evidence;
- deny authority expansion by models, administrators, adapters, majorities, or
  autonomous processes;
- maintain revocation, exit, rollback, recovery, and truthful non-claims;
- prefer safety and inspectability over uninterrupted operation.

The architectural goal is therefore not one globally shared Grid. The goal is a
network of independently authoritative Grids that can enter narrowly scoped,
verifiable agreement domains when agreement is useful and justified.

## Foundational split: sovereignty plane and agreement plane

AXIOM-MESH SHALL retain two distinct authority planes.

### Sovereignty plane

Each Grid remains authoritative for its owner-local facts, including local
identity references, private memory, consent, local policy, local approvals,
private accounting, device authority, and the owner's record of received or
issued commitments.

A remote quorum MUST NOT silently rewrite owner-local state, widen local
consent, mint a local capability, disclose private records, or force a local
external effect.

### Agreement plane

A future agreement domain may establish only the shared facts named by its
protocol and membership contract. Examples include:

- Circle membership and role epochs;
- shared proposals and decisions;
- accepted commitments and task states;
- replicated evidence checkpoints;
- organization policy versions;
- threshold approvals;
- shared registries;
- settlement states where separately promoted.

The agreement plane produces verifiable decisions or finality proofs. It does
not execute privileged effects directly. Every participating Grid independently
validates the decision and routes any resulting local effect through:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Consensus is therefore an input to local authorization, never a bypass around
it.

## Non-negotiable invariants

### DA-01 — No ambient global authority

No consensus group, federation operator, validator set, token holder, software
publisher, or protocol administrator may receive undeclared authority over all
Grids or all data.

Every agreement domain MUST identify:

- domain ID and purpose;
- admitted members and membership epoch;
- governed state and excluded state;
- decision and quorum rules;
- failure and partition behavior;
- privacy and disclosure rules;
- upgrade, rollback, emergency, and dissolution rules;
- member exit and retained-evidence consequences.

### DA-02 — Local authorization remains mandatory

A finalized network decision MAY satisfy a named prerequisite such as shared
approval or membership proof. It MUST NOT itself mint a Sandbox capability or
perform an external effect.

Local policy may reject, defer, narrow, or require additional approval for a
network decision. Local policy MUST NOT reinterpret an insufficient quorum or
invalid finality proof as success.

### DA-03 — Deny-dominant authority composition

Authority from global safety policy, jurisdictional policy, owner policy,
Circle or organization policy, consensus decision, adapter policy, and runtime
constraints MUST compose deny-dominantly.

A lower or later layer may narrow authority. It may not loosen an earlier denial
or create authority absent from the governing domain contract.

### DA-04 — Deterministic shared-state transitions

Any state replicated through consensus MUST use a versioned deterministic state
transition function. The transition input MUST bind at minimum:

- protocol and schema version;
- domain and membership epoch;
- prior committed state or checkpoint digest;
- proposal or command digest;
- actor and authority proof;
- applicable policy digest;
- causal or consensus ordering information;
- resulting state digest;
- declared evidence obligations.

Nondeterministic providers, wall-clock observations, model output, external API
responses, and local environment state MUST enter shared consensus only as
explicitly signed observations under a defined validation rule. They MUST NOT
be sampled independently inside deterministic execution.

### DA-05 — Explicit state status

Records participating in distributed agreement MUST expose their state as one
of a versioned set such as:

- local;
- proposed;
- observed;
- accepted;
- committed;
- finalized;
- conflicted;
- rejected;
- expired;
- reverted or compensated.

Interfaces and downstream effects MUST NOT present provisional, merely observed,
or minority state as finalized.

Irreversible, public, financial, identity, liberty-affecting, legal, health,
education, government, or embodied actions MUST require the exact promoted
finality level and any additional local approval.

### DA-06 — Safe partition behavior

When quorum, membership, finality, data availability, clock bounds, or required
verification is unavailable, the affected agreement domain MUST halt or degrade
without fabricating success.

Partitioned Grids may continue owner-local operations that do not depend on the
unavailable agreement domain. They MUST retain conflicts and pending commitments
for explicit reconciliation.

Safety takes priority over liveness for authority-expanding or irreversible
operations.

### DA-07 — Verifiable decision receipts

Every finalized distributed decision MUST produce a portable receipt binding:

- domain and protocol version;
- membership and authority epoch;
- proposal or command digest;
- prior state/checkpoint digest;
- resulting state/checkpoint digest;
- votes, signatures, threshold proof, or named consensus certificate;
- quorum rule and achieved quorum;
- decision round, height, or causal position;
- finality classification;
- included and excluded claims;
- any local execution receipts that followed.

AXIOM Verify MUST be able to validate the receipt without trusting a hosted
AXIOM service. Cryptographic integrity MUST continue to be described as
integrity and authority evidence, not proof that the underlying human claim is
true or just.

### DA-08 — Privacy-preserving verifiability

Consensus MUST NOT require publishing private payloads when a commitment,
selective disclosure, threshold attestation, encrypted replication, or named
zero-knowledge verifier can establish the required fact.

Public or shared commitments MUST use domain-separated hashes and explicitly
state data-availability assumptions. A commitment without available supporting
data MUST NOT be represented as independently auditable content.

### DA-09 — Membership, Sybil, and capture are protocol concerns

Node count, useful-compute scores, reputation, stake, social identity, or token
ownership MUST NOT automatically be treated as independent governance
participants.

Each agreement domain MUST define and test:

- admission and renewal;
- identity independence assumptions;
- Sybil resistance;
- collusion and bribery resistance;
- validator or representative concentration;
- censorship and liveness attacks;
- minority rights and protected thresholds;
- conflicts of interest;
- capture detection and member exit.

No single governance mechanism is presumed suitable for every domain.

### DA-10 — Governance cannot govern away the safety floor

Protocol governance may select versions, parameters, membership, resource
budgets, or supported adapters only within its declared authority.

It MUST NOT:

- disable evidence creation;
- remove local consent;
- grant itself arbitrary code or secret access;
- eliminate independent approval where required;
- convert provisional state into final state by declaration;
- suppress member export, appeal, or exit rights;
- redefine failed verification as success;
- activate settlement, embodied control, or regulated-domain authority without
  the applicable separate promotion gates.

Emergency governance may reduce or pause authority only. It MUST expire and be
reviewed.

### DA-11 — Constitutional, protocol, domain, and local governance remain separate

Future governance SHALL distinguish at least:

1. **Constitutional invariants** — the non-bypassable authority and evidence
   rules enforced by the kernel and promotion system.
2. **Protocol governance** — versioning, membership algorithms, consensus
   parameters, and compatibility.
3. **Domain governance** — Circle, organization, registry, or settlement rules.
4. **Local governance** — owner policy, consent, devices, and local approvals.

Each layer MUST have a bounded mandate, identifiable decision records, appeal or
challenge behavior where applicable, and rollback or exit semantics.

### DA-12 — Upgrades are new authority events

Consensus and governance upgrades MUST be explicit, versioned, delayed where
consequential, independently reviewable, and bound to exact source and protocol
artifacts.

Membership and protocol epochs MUST prevent signatures, votes, or permissions
from one epoch being replayed into another. Mixed-version operation MUST have a
defined compatibility window and fail-closed boundary.

Catastrophic rollback MUST not silently erase finalized evidence. Corrections
must be represented as new signed transitions, compensations, or an explicitly
identified recovery fork.

### DA-13 — Cross-Grid work uses commitments, not hidden distributed locks

Independent Grids SHOULD coordinate through signed offers, acceptances,
commitments, expiries, receipts, and compensating transitions rather than
holding opaque distributed database locks across sovereign nodes.

A multi-Grid operation MUST expose partial completion and recovery state. No
participant may assume another Grid committed merely because a message was sent
or observed.

### DA-14 — Scale by domain and sovereignty boundary

Horizontal scale SHOULD partition by independently owned Grid, Circle,
organization, agreement domain, or explicitly assigned workload.

The system MUST NOT invisibly shard one owner's authority or evidence history in
a manner that weakens export, recovery, continuity, consent, or independent
verification.

Replication for availability and consensus for shared authority are separate
problems and MUST be claimed and tested separately.

### DA-15 — Consensus implementations remain replaceable adapters

The kernel SHOULD define a versioned agreement interface rather than hard-code
one consensus algorithm as universal infrastructure.

Candidate adapters may include:

- threshold signatures for bounded approvals;
- causal replicated state for conflict-preserving collaboration;
- crash-fault-tolerant replication for managed availability;
- BFT state-machine replication for adversarial shared authority;
- public checkpoint anchoring for external timestamp or continuity evidence;
- external settlement finality adapters.

Each adapter MUST state its trust, fault, timing, membership, privacy, finality,
data-availability, resource, and governance assumptions. Installing an adapter
MUST NOT enable it.

## Current implementation consequences

The present scalability work MUST preserve future agreement compatibility
without adding consensus to the current production hot path.

### Materialization and Grid startup

Incremental materialization anchors MUST remain local Grid facts. They SHOULD
bind a deterministic materialized-state digest and event sequence so a future
replication or consensus adapter can compare state without treating the local
anchor as global finality.

Full rebuild MUST remain deterministic and independently verifiable.

### Event and evidence schemas

New event formats SHOULD preserve fields or extension points for:

- domain ID;
- protocol and schema version;
- membership or authority epoch;
- causal parents or committed predecessor;
- local versus shared authority classification;
- policy digest;
- proposal, quorum, or finality proof digest;
- state-transition digest;
- explicit non-claims.

These fields need not be populated for current local events, but future shared
records must not require replacing the evidence model.

### Pagination and cursors

Stable cursors MUST bind the local Grid, schema generation, ordering key, and
query scope. Future shared-domain queries SHOULD additionally bind agreement
domain and finalized checkpoint so pages cannot silently mix incompatible
histories or forks.

### Jobs and artifacts

Background jobs MUST be represented as durable state transitions with owner,
policy, input digest, attempt, lease, output digest, and terminal status. This
allows future remote workers or quorum-observed jobs without granting workers
state authority.

Export and evidence formats SHOULD support optional inclusion of membership,
quorum, finality, and checkpoint proofs without requiring those proofs for
owner-local exports.

### Identity, replay, and transport generations

Trust caches, replay domains, connection pools, and credentials MUST be bound to
an explicit generation or epoch. That generation boundary is required for
future multi-host membership changes and prevents old authority from surviving
rotation or governance updates.

### Governance records

Current proposal, vote, timelock, activation, verification, rollback, emergency,
and appeal records SHOULD evolve through versioned schemas rather than bespoke
network-only alternatives. Future consensus should certify governance records;
it should not replace their lifecycle or human-readable evidence.

### Public social witnessing as a bounded evidence domain

Public social history is a concrete application of the sovereignty/agreement
split. AXIOM SHOULD make intentionally public social acts independently
witnessable without requiring every post, edit, reaction, or follow to enter one
global consensus log.

The target property is historical integrity, not undeletability of every copy:
a public publication may later be superseded, retracted, or stopped from being
served, but the earlier public form must not be silently replaced while still
being represented as the original.

The current executable laboratories remain outside supported Grid authority:

- `mesh/src/lib/public-witness.mjs` defines persona-key public journal
  attestations, exact predecessor continuity, independent witness receipts, and
  deterministic receipt checkpoints;
- `mesh/test/public-witness.test.mjs` verifies public-audience enforcement,
  tamper and key-substitution rejection, publication/retraction continuity,
  witness binding, deterministic checkpoint roots, and explicit non-claims;
- `mesh/src/lib/persona-journal-credential.mjs` adds the W1 persona signing-key
  credential and key-epoch laboratory plus credential-aware journal v2;
- `mesh/test/persona-journal-credential.test.mjs` verifies privacy-preserving
  root/key binding, rotation, recovery, revocation, stale-key rejection, and
  append-only journal continuity across operational-key epochs;
- `mesh/src/lib/public-witness-service.mjs` adds the W2a bounded witness-service
  evidence core: signed observations, idempotent replay, conflict preservation,
  key-state-relative contradiction evidence, bounded storage, and deterministic
  read-only inspection;
- `mesh/test/public-witness-service.test.mjs` verifies credential-epoch and
  journal-sequence equivocation, late and already-known stale-key evidence,
  revocation contradiction, fail-closed capacity exhaustion, replay, and
  signed-evidence tamper rejection;
- `mesh/src/lib/public-witness-durable-store.mjs` adds the W2b local durable
  evidence journal with witness-signed canonical records, exact predecessor
  chaining, deterministic full replay, bounded state, and fail-closed restart;
- `mesh/src/public-witness-service.mjs` exposes W2b as a separately runnable
  process using exact configuration and bounded JSON-line stdin/stdout IPC;
- `mesh/test/public-witness-durable-store.test.mjs`,
  `mesh/test/public-witness-process.test.mjs`, and
  `mesh/test/public-witness-process-hardening.test.mjs` cover restart,
  deterministic replay, conflict persistence, tamper/truncation/noncanonical
  rejection, external-state drift, private internal state, bounded files, and
  per-request input bounds;
- `mesh/src/lib/public-witness-transfer.mjs` adds the W2c1 no-socket source
  admission and signed transfer-package protocol, transfer continuity/source
  equivocation verification, and witness-signed package-verification receipts;
- `mesh/test/public-witness-transfer.test.mjs` and
  `mesh/test/public-witness-transfer-receipt-lifecycle.test.mjs` verify local
  source admission, source epoch/sequence/predecessor binding, operation and
  size/lifetime restrictions, separate persona-root trust, artifact dependency
  verification, source equivocation, receiver-local timing, receipt audit after
  transfer expiry, and explicit non-claims;
- `mesh/src/lib/public-witness-receiver-store.mjs` adds W2c2 durable receiver
  intake: witness-signed source-admission, transfer-intake, and observation-link
  records; restart-safe source epochs; exact source sequence/predecessor state;
  transfer-ID reuse rejection; verified replay; durable equivocation state; and
  bounded fail-closed storage;
- `mesh/src/lib/public-witness-receiver-bridge.mjs` explicitly bridges a durable
  accepted transfer into W2b observation only after the caller-supplied local
  source admission exactly matches the durable admission, the separately
  supplied persona-root trust verifies the package, and both stores use the same
  witness key; it also supports crash-window restart reconciliation without
  manufacturing a second observation;
- `mesh/test/public-witness-receiver-store.test.mjs`,
  `mesh/test/public-witness-receiver-bridge.test.mjs`, and
  `mesh/test/public-witness-receiver-replay-adversarial.test.mjs` verify durable
  restart/idempotency, source sequence and predecessor enforcement, source
  equivocation, transfer-ID reuse, source-epoch rollover, stale traffic,
  persona-root/admission/witness-key substitution, quota failure, tamper and
  truncation, bridge crash reconciliation, and rejection of a forged replay
  claim that merely copies a retained `transfer_digest` onto different bytes;
- `mesh/src/lib/public-witness-live-ingress.mjs` adds W2c3 as a standalone,
  receive-only authenticated HTTPS laboratory. It requires TLS 1.3 client
  certificates, maps the exact client-certificate SHA-256 digest to an exact
  already-admitted source ID and source epoch, uses a separate bounded local
  persona-root allowlist, enforces body/concurrency/per-certificate rate bounds
  and an explicit request-body deadline, and routes accepted transfers only
  through the W2c2 durable receiver;
- `mesh/test/public-witness-live-ingress.test.mjs`,
  `mesh/test/public-witness-live-ingress-socket.test.mjs`, and
  `mesh/test/public-witness-live-ingress-restart.test.mjs` verify dual binding,
  local persona-root trust, exact replay, untrusted client-CA rejection,
  certificate substitution and rotation, stale/current source epochs,
  oversized/aborted/slow bodies, concurrent pressure, restart-preserved replay,
  and source equivocation through actual mTLS sockets without invalid durable
  receiver mutation;
- `npm run public-witness:start -- <config.json>` and
  `npm run public-witness:verify -- <config.json>` operate the W2b standalone
  local laboratory without adding it to the four-process Grid runtime;
- W2c3 binds loopback by default and refuses wildcard binds unless a separately
  reviewed deployment wrapper explicitly changes that boundary. It performs no
  DNS/peer discovery or outbound fetch and exposes no source-admission or
  persona-root enrollment endpoint; and
- the accepted no-egress social storage composition remains unchanged. W2c3 is
  not imported into the supported Grid/Gateway/Hypervisor/Sandbox runtime and
  does not promote federation, archive availability, quorum, consensus,
  finality, social mutation, or any capability-registry claim.

A persona journal attestation binds the exact social entry digest, persona and
public persona-projection digest, Ed25519 signing-key digest, monotonic sequence,
exact predecessor-attestation digest, and canonical issuance time. Publication
corrections remain new publications through `supersedes_digest`; retractions
remain new transitions. The journal therefore records correction without
rewriting prior history.

Only `audience.mode: public` publications are eligible for the public witness
foundation. Followers-only and Circle-only content MUST NOT be promoted into a
public evidence domain simply because an application can access it locally.
Pseudonymous, selectively attributable, and anonymous personas MUST retain the
existing protection against leaking controller identity.

W1 standardizes a privacy-preserving persona journal credential laboratory. A
stable Ed25519 persona root key signs credentials for rotatable Ed25519
operational journal keys. The root key is a cryptographic continuity root only:
it does not disclose the private controller actor, assert a legal identity, or
grant Grid/runtime authority. Operational credentials bind the persona and
public persona-projection digest, root-key digest, journal public key and key
digest, monotonically increasing key epoch, activation time, exact predecessor
credential, and transition semantics.

The first credential is `initial`. A routine `rotation` must advance exactly one
epoch and mark the predecessor `retired`. A `recovery` transition must advance
exactly one epoch and mark the predecessor `revoked` or `compromised`. Separate
root-signed revocation artifacts can terminate an exact operational credential
at an explicit effective time. Root-key compromise or loss is not automatically
recoverable by this layer; any future root-recovery protocol requires a
separate, explicit trust and governance design rather than an implicit operator
or network override.

Credential-aware journal v2 (`axiom-social-public-journal-attestation.v2`) binds
each public journal entry to the persona root-key digest, exact signing
credential digest, operational key digest, and key epoch while preserving one
monotonic persona journal sequence across key rotation. W0 journal v1 remains a
separate laboratory wire format; W1 does not silently reinterpret existing v1
artifacts as credentialed v2 artifacts.

When a verifier has successor-credential or revocation evidence, use of the old
operational key at or after its end boundary fails closed. Cross-epoch journal
continuity also rejects a predecessor attestation issued at or after the first
successor credential became active, preventing a stale key from manufacturing a
late predecessor that a newer key could otherwise extend. This is evidence-
relative verification: without discovery or propagation of a relevant
successor/revocation artifact, W1 does **not** claim globally current key state.

W2a makes that evidence-relative boundary explicit in witness state. A witness
can verify and sign an observation of a root-valid credential, a root-signed
revocation, or a credential-aware public journal v2 artifact. Exact replay is
idempotent: the original signed observation is retained. Witness observations
bind the exact artifact, persona/projection/root, credential and key epoch,
position, artifact time, observation time, and the exact key-state evidence
known to that witness at observation time.

`no-contradiction-observed` means only that the witness had not observed
successor or revocation evidence contradicting that journal use at that moment.
It MUST NOT be interpreted as globally current key state. If relevant key-state
evidence is already present, the new journal observation is marked
`contradicted`. If that evidence arrives later, the earlier signed observation
is not changed; the witness emits new `stale-key-use` conflict evidence binding
the historical observation and later key-state artifact.

W2a separately records `credential-epoch` conflicts when multiple root-valid
credentials occupy the same persona/projection/root epoch and
`journal-sequence` conflicts when multiple valid journal artifacts occupy the
same public continuity position. Every conflicting valid artifact is retained.
Conflict evidence declares no preferred artifact and MUST NOT choose a winner by
arrival order, popularity, application preference, or lexical digest order.
The witness is an evidence observer, not a truth oracle, identity authority,
moderator, consensus member, or finality provider.

W2b adds local process and restart durability without adding remote witnessing.
Each accepted observation operation is replayed first against a clean trial
state. The resulting exact observation and conflict digests are bound into a
canonical JSONL record signed by the witness key and chained by contiguous
sequence plus exact predecessor-record digest. The record is written and the
file is `fsync`ed before the trial state becomes the active in-memory state.
Exact replay remains idempotent and does not append a duplicate durable record.

Startup verifies every durable record's schema, canonical encoding, witness
signature, request digest, sequence, predecessor, and deterministically
reproduced observation/conflict result before reconstructing active witness
state. Tampering, wrong witness keys, noncanonical records, truncation,
duplicate durable operations, chain discontinuity, or result divergence fail
closed. The active store also compares on-disk record digests with its private
in-memory record chain before each new commit so detectable external file drift
cannot be silently extended.

The W2b process uses a separate witness-key file and state file. Those paths are
resolved from an exact configuration, the config and key inputs are bounded and
must be regular non-symlink files when loaded, and the durable-store object does
not expose its private key, state path, mutable record array, or W2a core as
public fields. Stdin/stdout JSON-line IPC is bounded per request; one transport
chunk may carry multiple independently bounded requests without being copied
into one unbounded pending request buffer.

These are local integrity properties, not availability or hardware-durability
claims. The durable journal may contain the public artifacts necessary to
reproduce its observations, but every record and snapshot continues to declare
`data_availability_claimed: false`. File `fsync` does not prove independent
replication, media survival, backup, or W3 archive availability. W2b also assumes
a trusted local state directory and one active writer for the state file; it
detects observable external drift but does not claim a cross-process locking or
hostile-local-filesystem security protocol.

W2b is therefore an independently runnable **local** witness process, not yet a
remote witness network. It opens no HTTP/socket listener and performs no peer
discovery or outbound fetch.

W2c1 defines the remote-source evidence boundary before any network socket is
introduced. A local source-admission record binds one exact domain, source ID,
source Ed25519 key, source epoch, allowed transfer operations, validity window,
package-size limit, and transfer-lifetime limit. The admission explicitly says
`local_trust_input: true`, `remote_self_admission_allowed: false`, and grants no
persona-root trust, Grid authority, social authority, or network effect. A
remote source cannot admit itself merely by presenting its own key or package.

Source-authenticated transfer packages form a separate per-admission chain. Each
package binds the source admission identity and epoch, monotonically increasing
source sequence, exact predecessor-transfer digest, transfer ID, operation,
request digest, creation/expiry times, and source signature. Exact replay is
therefore distinct from two differently signed packages at the same source
position. Competing valid same-position packages are retained as source-
equivocation evidence with no preferred transfer and no truth-resolution claim.
A source-key/admission-epoch change starts a new source trust domain; W2c1 makes
no cross-epoch source-continuity claim.

Transfer packages carry the exact cryptographic artifacts and dependencies
needed for credential, revocation, or journal-v2 verification. They do **not**
carry or mint the receiver's trust in a persona root. Full artifact verification
requires a persona-root public key supplied separately as a local verifier
input, and the source-admission key is never substituted for that root. Source
authentication means only that the admitted source signed the exact package; it
is not legal-identity, authorship, truth, endorsement, or persona-root evidence.

A remote source also does not choose witness observation time. Transfer packages
contain artifacts and source creation/expiry times, not `observed_at`. The
receiving witness must assign its own local receive/observation time. Package
creation may not predate the verified artifact's own signed time. Domain,
source-key/epoch, operation allowlist, source-admission window, transfer TTL,
package-size, clock-skew, dependency, and signature failures all fail closed.

The short transfer TTL limits **intake**, not future evidence auditability. A
witness-signed transfer receipt binds the local source admission, exact transfer,
verified artifact/persona/root digests, and receiver-local `received_at` while
stating `observation_committed: false`. Receipt creation verifies that the
transfer was valid at that local receive time. Later audit may reverify the old
package using the signed `received_at` as the historical intake point even after
the package's short TTL has expired. When the original transfer is supplied,
the verifier independently checks that `received_at` did not predate the package
or artifact. The receipt still makes no end-to-end delivery, witness-observation
commit, truth, authorship, legal-identity, finality, authority, or networking
claim.

W2c2 makes that source boundary restart-safe before live transport is permitted.
The receiver durably appends witness-signed canonical records for source
admission, transfer intake, and later observation linkage. Source admission
epochs supersede exact prior local admissions and source transfer state retains
contiguous sequence, exact predecessor transfer, transfer-ID use, source
position, and conflict status across restart. Previously unseen traffic from a
superseded source epoch fails closed.

Exact historical replay is decided only after the source-signed transfer
envelope is cryptographically verified and its digest is recomputed. A caller
cannot obtain replay treatment by copying a retained `transfer_digest` onto
different bytes. A byte-identical, signature-valid historical package may still
receive its original witness-signed transfer receipt after source rollover or
short transfer expiry; unseen stale or expired traffic cannot create new intake.

A second valid package at an already retained source position is persisted with
deterministic source-equivocation evidence and the affected source epoch is
marked conflicted so forward advancement halts. The current laboratory retains
the first competing pair and fails closed rather than silently selecting a
winner; broader forensic intake of additional competing forks remains a future
review point before live remote operation.

Transfer acceptance remains distinct from witness observation. New receiver
intake is explicitly `pending-observation`. The W2c2 bridge may commit that exact
artifact into W2b only when the caller-supplied local source admission matches
the durable admission, the separately supplied trusted persona-root key verifies
the transferred artifact, and the receiver and durable witness stores use the
same witness key. The transfer itself cannot manufacture either trust input.

If W2b durably records the observation and the process fails before the receiver
appends its linkage record, restart reconciliation independently locates the
signed W2b durable observation record and appends a receiver
`reconciled_after_restart` linkage without creating a second witness
observation. Receiver restart also re-verifies canonical wire records without
feeding verifier-only convenience fields back into the strict signed schema.
Tamper, truncation, noncanonical encoding, state drift, quota exhaustion, source
substitution, persona-root substitution, and witness-key substitution fail
closed before an invalid receiver transition is committed.

W2c3 is a **standalone receive-only authenticated transport laboratory** layered
on W2c2. It does not create a second source-admission or persona-root trust path.
The TLS client certificate must validate under the configured client CA and its
exact SHA-256 digest must map locally to the exact source ID and source epoch in
the signed transfer. The transfer must then independently pass W2c2 source
admission, signature, continuity, TTL, replay, and equivocation rules. Transport
identity is therefore an additional local prerequisite, never a substitute for
protocol identity.

The HTTPS adapter binds loopback by default, requires TLS 1.3 client
certificates, permits only the exact canonical transfer-plus-root-key-ID request,
uses one-request connections, and applies bounded body size, global concurrency,
per-certificate burst/window rate control, and an application-level request-body
deadline. The deadline actively terminates incomplete slow bodies rather than
relying on Node's server timeout semantics. Invalid, oversized, aborted, timed-
out, over-capacity, untrusted, stale-epoch, or certificate-substituted traffic
must not create durable receiver intake.

Socket evidence uses disposable credentials from the existing AXIOM transport
credential machinery and covers valid and untrusted TLS handshakes, exact
replay, certificate rotation, source-epoch rollover, certificate/source-epoch
substitution, oversized and aborted bodies, slow-body deadline enforcement,
concurrent pressure, receiver restart, replay after restart, and source
equivocation after restart. The accepted no-egress Grid composition is
unchanged: W2c3 is not a supported service unit, public deployment wrapper,
outbound fetcher, discovery mechanism, social relay, archive, consensus member,
or finality provider. Public binding, independently operated deployment, remote
source provisioning, discovery, outbound acquisition, and multi-witness
exchange remain separate future work.

A witness receipt means that the named witness key observed and verified one
exact signed journal artifact. It does not prove content truth, legal identity,
human authorship, endorsement, quorum, consensus, or finality. Witnesses are
evidence providers rather than global social authorities.

Receipt checkpoints use sorted unique receipt digests and domain-separated
SHA-256 Merkle leaves/nodes. The current checkpoint schema is commitment-only:
it declares `finality: unfinalized`, `consensus_claimed: false`, and
`data_availability_claimed: false`. A receipt count MUST NOT be interpreted as a
quorum. Availability of the referenced content remains a separate archive and
replication problem.

A future public-witness agreement domain may certify compact checkpoints rather
than order every social event globally. Its domain contract must separately
define membership and epochs, Sybil assumptions, quorum/finality rules,
equivocation handling, data availability, censorship and partition behavior,
privacy and jurisdiction constraints, upgrades, capture resistance, exit, and
portable certificate verification.

The staged roadmap is:

1. **W0 — pure cryptographic foundation (implemented laboratory):** public-only
   journal attestations, witness receipts, deterministic checkpoints, and
   non-authority tests;
2. **W1 — persona key credentials and epochs (implemented laboratory):**
   privacy-preserving root/key binding, operational-key epochs, rotation,
   revocation, recovery transitions, stale-key rejection when relevant evidence
   is supplied, and credential-aware journal v2 continuity;
3. **W2 — witness service laboratory (W2a evidence core, W2b durable local
   process, W2c1 source-transfer protocol, W2c2 durable receiver/reconciliation,
   and W2c3 receive-only authenticated mTLS ingress implemented):** the current
   work provides signed observations, idempotent replay,
   equivocation/stale-key evidence, witness-signed append-only local state,
   deterministic fail-closed restart, bounded stdin/stdout IPC, explicit local
   source admission, source-signed transfer continuity, source-equivocation
   evidence, separate persona-root trust, historically auditable transfer
   receipts, restart-safe receiver source-chain/replay state, verified replay,
   pending-observation separation, crash-window receiver↔witness reconciliation,
   exact certificate-to-source-epoch transport binding, bounded HTTPS intake,
   and mTLS socket fault evidence. Remaining W2 work includes a separately
   reviewed public deployment wrapper, remote source provisioning and rotation
   operations, discovery/outbound acquisition policy if justified,
   independently operated hosts, broader remote abuse/resource testing, and
   multi-witness evidence exchange without Grid authority;
4. **W3 — archive and availability laboratory:** independently operated public
   object retention with explicit availability and legal-removal semantics;
5. **W4 — optional checkpoint agreement adapter:** evaluate threshold/BFT
   certification of compact checkpoints under Byzantine, partition, capture,
   censorship, version-skew, and key-compromise conditions;
6. **W5 — AXIOM Verify:** independently verify content digests, persona journal
   signatures, credential epochs, revocations, continuity, witness receipts,
   witness observations/conflicts, durable witness records, source admissions,
   source transfer chains/equivocation, package-verification receipts, durable
   receiver intake/linkage records, authenticated transport bindings,
   checkpoints, availability, and any optional finality certificate while
   preserving explicit non-claims; and
7. **W6 — promotion:** only after applicable protocol, security, privacy,
   operational, scale, governance, and independent-review gates pass.

A persona can still sign two conflicting journal entries at the same continuity
position. That is equivocation, not something cryptography can prohibit. W2a
and W2b retain and expose conflicting valid persona artifacts and signed
conflict evidence rather than silently choosing one. W2c1, W2c2, and W2c3 apply
the same rule to an admitted source that signs competing transfer packages at
one source position, with W2c2 durably retaining the conflict across restart and
W2c3 proving the same result survives authenticated socket delivery. Future
multi-witness and agreement protocols must preserve both forms of conflict
rather than silently select a winner.

## Required future agreement interface

Before any consensus implementation is connected to supported Grid state, a
versioned interface SHALL define at minimum:

```text
validate_domain_contract(contract)
validate_membership_epoch(epoch)
validate_proposal(prior_state, proposal, authority)
observe_or_vote(proposal_digest)
verify_certificate(certificate, domain, epoch, prior_state)
apply_finalized_transition(prior_state, proposal, certificate)
produce_decision_receipt(...)
challenge_or_appeal(receipt, grounds)
leave_or_dissolve(domain, policy)
```

The interface MUST separate proposal validation, participation, certificate
verification, deterministic application, and local execution. A node may verify
and record a decision without voting for it or authorizing a local effect.

## Promotion gates for consensus and distributed governance

No agreement adapter may be production-promoted until all applicable evidence
exists:

- formal or executable protocol specification;
- deterministic state-machine definition;
- safety and liveness properties with stated assumptions;
- model checking or equivalent exhaustive analysis for bounded models;
- property and differential testing;
- Byzantine, partition, delay, reordering, duplication, clock, disk, restart,
  version-skew, and key-compromise fault injection;
- governance capture, collusion, bribery, censorship, minority-exit, and
  emergency-abuse analysis;
- independent cryptographic, protocol, implementation, operational, and
  governance review;
- measured performance and recovery on independently operated hosts;
- complete membership, key, upgrade, rollback, dissolution, and catastrophic
  recovery runbooks;
- AXIOM Verify support for decision receipts;
- capability registry and public claims restricted to the exact passed scope.

Economic consensus additionally requires legal, insolvency, oracle, market,
custody, reconciliation, consumer-protection, and deployed-bytecode evidence.
Regulated or embodied domains require their separate domain safety and legal
promotion gates.

## Scale evidence additions

The scalability evidence suite MUST eventually include distributed profiles in
addition to single-Grid cardinality and throughput tests:

- 3, 4, 7, and larger independently operated members;
- honest crash faults and Byzantine participants;
- validator or representative concentration scenarios;
- WAN latency, loss, duplication, reordering, and long partitions;
- membership rotation and epoch transition under load;
- conflicting proposals and equivocation;
- minority censorship and delayed data availability;
- restart from checkpoint and catastrophic member loss;
- protocol version skew and rolling upgrade;
- member exit, domain dissolution, and evidence verification after shutdown;
- local policy rejection of an otherwise finalized shared decision;
- proof that consensus failure does not corrupt owner-local state or authorize
  an unsafe effect.

Measurements MUST distinguish:

- local commit latency;
- proposal propagation;
- certificate or quorum formation;
- finality latency;
- data availability latency;
- local verification and application;
- resulting local effect latency;
- recovery time and retained safety under fault.

## Architectural decision

AXIOM-MESH will be designed as a **federation of sovereign, verifiable state
machines with optional bounded agreement domains**, not as one mandatory global
ledger.

That choice permits future governance, replicated evidence, consensus, and
settlement while retaining the design's core safety properties. Adoption can
increase coordination without converting participation into surrender of local
authority.

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
- `mesh/src/lib/public-witness-ingress-trust.mjs` adds W2c4a as a content-
  addressed, generation-chained local ingress trust-binding laboratory. It maps
  exact client-certificate SHA-256 digests to exact W2c1 source admissions that
  must already be durably retained by W2c2, carries a bounded local Ed25519
  persona-root allowlist, enforces activation time and exact predecessor
  history, and never calls W2c2 source admission itself;
- `mesh/test/public-witness-ingress-trust.test.mjs` and
  `mesh/test/public-witness-ingress-trust-predecessor.test.mjs` verify
  non-mutating receiver checks, certificate rotation, persona-root trust
  contraction, future-activation rejection, exact predecessor requirements,
  source-epoch rollback/same-epoch replacement/skip rejection, duplicate
  certificate/source rejection, root substitution rejection, missing retained
  source rejection, and bounded regular-file loading;
- `mesh/src/lib/public-witness-source-control.mjs` adds W2c4b as a content-
  addressed, per-source local operator-control history. It binds exact source
  admissions to monotonic control sequence/predecessor history and separates
  genesis admission, certificate-only rotation, source-epoch rotation, and
  disable transitions without mutating W2c2 receiver state;
- `mesh/test/public-witness-source-control.test.mjs` verifies exact certificate
  rotation, one-epoch source rotation, disable trust contraction, next-epoch-only
  return after disable, skipped/backward/tampered history rejection, bounded
  disable reasons, and non-mutating exact W2c2 admission verification;
- `mesh/src/lib/public-witness-source-control-store.mjs` adds W2c4c as a signed,
  append-only durable application journal for W2c4b controls. A separate local
  Ed25519 operator key binds the exact control digest, application time, global
  durable sequence, exact predecessor record, operator ID/key, and explicit
  non-claims. Restart re-verifies canonical records, signatures, global and
  per-source continuity, control effective time, and the exact W2c2-retained
  admission before reconstructing active control state;
- `mesh/test/public-witness-source-control-store.test.mjs` verifies durable
  application/replay/restart, wrong-operator/tamper/noncanonical rejection,
  missing-W2c2-admission and early-application failure, live certificate rotation
  and disable before receiver mutation, next-epoch return, and fail-closed
  dynamic-resolver substitution;
- W2c4c also extends the W2c3 ingress core with an optional **local dynamic
  source-binding resolver**. Static and dynamic source-binding modes cannot be
  combined. A resolver result is independently normalized and must exactly
  match the presented certificate digest, source ID, and source epoch before the
  request can reach W2c2;
- `mesh/src/lib/public-witness-source-provisioning.mjs` adds W2c4d1 as a pure,
  short-lived source-provisioning authorization artifact. A trusted local
  Ed25519 operator key signs one exact W2c1 source admission, source epoch,
  predecessor-admission digest, command ID, and bounded authorization window.
  The artifact names only the future W2c2 action `admit-exact-source-epoch`; it
  does not call `admitSource()` or otherwise mutate receiver state;
- `mesh/test/public-witness-source-provisioning.test.mjs` verifies exact
  admission/predecessor binding, operator-key and signature substitution
  rejection, source/admission/statement tamper rejection, not-yet-active and
  expired authorization, configured and hard lifetime ceilings, source-
  admission validity bounds, source-key non-substitutability, and rejection of
  remote self-provisioning or widened authority claims;
- `mesh/src/lib/public-witness-source-provisioning-store.mjs` adds W2c4d2 as a
  separate, effect-capable local application journal above d1. A provisioner
  Ed25519 key signs `authorization-retained`, `effect-ready`, and
  `admission-linked` records while the d1 operator key remains verification-only.
  The store fsyncs authorization and an exact effect attempt before its only
  receiver mutation, W2c2 `admitSource()`, then links only an exact retained
  authorized admission after durable receiver state advances;
- the W2c4d2 provisioning-store test family verifies authorization-before-effect
  ordering, deterministic local capacity reservation before W2c2 mutation,
  direct apply/replay/retry, crash-after-admission restart reconciliation,
  post-hoc/bypass rejection, expiry, predecessor/epoch/command identity rules,
  provisioner/operator substitution, tamper/truncation/state drift, receiver
  rollback evidence, and static no-network/no-runtime-import boundaries;
- `mesh/src/lib/public-witness-service-key-lifecycle.mjs` adds W2c4e1 role-root-
  signed service-key credentials and revocations for the source-provisioning
  operator and provisioner roles. Each role binds an exact domain, principal,
  operational Ed25519 key, monotonic key epoch, activation boundary, predecessor
  credential/disposition, and its exact authority scope without creating
  persona-root trust, social authority, capability promotion, network effect,
  consensus, or finality;
- `mesh/src/lib/public-witness-source-provisioning-key-lifecycle.mjs` resolves d1
  operator signatures through the exact credential epoch. Routine retirement
  preserves an already-issued bounded command until its own expiry, while an
  explicit revocation or compromise/recovery boundary blocks new effects from
  the predecessor;
- `mesh/src/lib/public-witness-source-provisioning-journal-lifecycle.mjs`
  independently verifies existing d2 v1 application records across provisioner
  credential epochs, rejects stale/revoked provisioner signatures for later
  records, checks operator effect authority at each `effect-ready` boundary, and
  requires operator and provisioner role roots to remain distinct;
- the W2c4e1 test family verifies role/domain/principal/root/key
  non-substitutability, exact +1 rotation/recovery history, revocation,
  operational-key non-reuse, routine-retirement versus compromise semantics,
  multi-epoch historical d2 journal verification, stale provisioner rejection,
  and explicit time/global-currentness non-claims;
- `mesh/src/lib/public-witness-source-provisioning-lifecycle-store.mjs` adds
  W2c4e2 as a separate lifecycle-aware d2 application-store laboratory. It
  preserves the existing d2 v1 record wire format while resolving historical
  operator and provisioner signatures through exact credential epochs. A store
  reopened with the successor provisioner private key can continue the same
  append-only hash chain without re-signing or migrating earlier records;
- `mesh/test/public-witness-source-provisioning-lifecycle-store.test.mjs` verifies
  restart/reopen signer cutover, exact preservation of historical journal bytes,
  stale and revoked provisioner append rejection, crash-window reconciliation
  across provisioner rotation without a second W2c2 admission, routine operator
  retirement, compromise/recovery effect contraction, and role-root separation;
- `mesh/test/public-witness-source-provisioning-lifecycle-store-boundary.test.mjs`
  locks the e2 no-network/no-Grid-runtime boundary and its explicit no-resigning,
  no-capability-promotion, and reopen-required signer-cutover claims;
- `npm run public-witness:start -- <config.json>` and
  `npm run public-witness:verify -- <config.json>` operate the W2b standalone
  local laboratory without adding it to the four-process Grid runtime;
- W2c3 binds loopback by default and refuses wildcard binds unless a separately
  reviewed deployment wrapper explicitly changes that boundary. It performs no
  DNS/peer discovery or outbound fetch and exposes no source-admission or
  persona-root enrollment endpoint; and
- the accepted no-egress social storage composition remains unchanged. W2c3,
  W2c4a, W2c4b, W2c4c, W2c4d1, W2c4d2, W2c4e1, and W2c4e2 are not imported into
  the supported Grid/Gateway/Hypervisor/Sandbox runtime and do not promote
  federation, archive availability, quorum, consensus, finality, social
  mutation, or any capability-registry claim.

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

W2c3 supports either immutable constructor-supplied source bindings or, after
W2c4c, one local dynamic binding resolver. The modes cannot be combined. In
dynamic mode the resolver is consulted after transport rate/concurrency intake
but before persona-root lookup or W2c2 receiver mutation, and any returned
binding is re-normalized and must match the exact presented certificate/source/
epoch tuple. This preserves W2c3 ownership of transport pressure controls while
allowing a separately durable local control store to contract future ingress.

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

W2c4a is an **operator-local ingress trust-binding laboratory**, not a source-
admission authority. A content-addressed bundle binds a domain, monotonic bundle
generation, exact predecessor bundle digest, activation time, certificate
fingerprints, exact W2c1 source-admission artifacts, and the local set of trusted
persona-root public keys. The bundle can only construct W2c3 ingress after each
referenced source admission is found byte-for-byte in W2c2 durable receiver
state. Verification and construction do not append, rotate, or otherwise mutate
receiver source trust.

Generation 1 is the trust-bundle genesis. Any non-genesis operational activation
must supply and verify the immediate predecessor bundle, advance exactly one
bundle generation, and use a strictly later activation time. A future-dated
bundle cannot become active early. Certificate-only rotation may retain the same
W2c2 source admission, while a source-admission change for a source that persists
across consecutive bundle generations may not roll backward, replace an
admission within the same source epoch, or skip an epoch. Persona-root additions
and removals are likewise explicit bundle-history changes; removing a root
contracts what the next ingress instance accepts.

W2c4a deliberately does **not** solve W2c2 source-admission provisioning or
lifecycle authority. A source artifact being retained by W2c2 is not represented
as a new global, remote, or operator-created identity claim, and W2c2 remains the
final source-epoch/signature/continuity enforcement point on transfer intake.
The bundle digest provides content integrity and predecessor history for local
configuration; it is not a claim that a hostile local administrator or
compromised host cannot rewrite the local trust policy, nor is it consensus or
distributed finality.

W2c4b adds an **operator-local source-control history laboratory** above W2c4a.
Each control is content-addressed and binds one source, a monotonically
increasing control sequence, the exact predecessor-control digest, effective
time, exact W2c1 source admission and admission digest, source epoch, transport
certificate binding when active, and explicit non-claims. Genesis is an
`admit` control at source epoch 1. `rotate-certificate` must retain the exact
source admission and change only the certificate fingerprint.
`rotate-source` must advance exactly one source epoch and bind a new exact source
admission. `disable` binds the exact active admission, removes the certificate
projection, and accepts only a bounded local disable reason. Once disabled, the
lineage can return to active only through `rotate-source` at the next source
epoch; same-epoch certificate reactivation is rejected.

W2c4b verification requires the exact referenced admission to already exist in
W2c2 durable receiver state and is explicitly non-mutating. An active control can
project to the exact W2c4a source trust entry; a disabled control projects to no
ingress binding. W2c4b is an operator intent/history primitive; W2c4c adds the
separate durable application layer rather than retroactively redefining W2c4b as
an effect record.

W2c4c adds a **durable applied source-control laboratory** without granting the
operator source-admission authority. A separate local Ed25519 operator key signs
an append-only canonical JSONL application journal. Each record binds the exact
W2c4b control digest, control-application time, global durable sequence, exact
predecessor-record digest, operator ID and key digest, plus explicit non-claims.
The record is fsynced before its control becomes the in-memory current applied
state. Exact replay is idempotent and does not append a duplicate record.

Startup re-verifies canonical encoding, operator key/signature, statement and
record digests, global record sequence/predecessor continuity, per-source W2c4b
control continuity, application time, and exact W2c2-retained admission before
reconstructing active control state. Wrong operator keys, tamper,
noncanonical/truncated state, detectable external file drift, capacity failure,
application before a control's effective time, or a source rotation whose new
admission is not already retained by W2c2 fail closed. The operator signature
proves only that the configured local operator key signed the exact application
record; it is **not** proof of legal identity, independent human approval, or
social authority.

A running W2c3 ingress may use the W2c4c store as its dynamic source-binding
resolver. Certificate rotation changes the accepted fingerprint for subsequent
binding resolutions, `disable` causes subsequent resolutions for that source to
return no binding before W2c2 mutation, and return after disable requires the
next explicit W2c2 source-admission epoch plus an applied W2c4b `rotate-source`
control. A disable is not retroactive cancellation: a request that already
passed binding resolution before the durable disable commit may remain in flight
toward W2c2. W2c4c therefore claims fail-closed control of **subsequent binding
resolutions**, not atomic cancellation of already-authorized in-flight work.

W2c4c remains local integrity and operational-control evidence. File `fsync` is
not proof of independent replication, hardware survival, or hostile-host
resistance. The operator key is not a root of persona trust, Grid authority, or
global source identity. W2c4c does not create W2c2 admissions, distribute trust,
perform discovery or outbound acquisition, expose a public deployment wrapper,
or claim globally current source status, federation, archive availability,
quorum, consensus, or finality.

W2c4d1 adds a **pure source-provisioning authorization laboratory** before any
new W2c2 admission effect path is introduced. A trusted local Ed25519 operator
key signs a short-lived command binding one exact W2c1 source admission, domain,
source ID/key, source epoch, admission digest, command ID, authorization window,
and the predecessor-admission digest for non-genesis epochs. Epoch 1 requires a
null predecessor; later epochs require one exact predecessor digest. The command
is valid only during its authorization window, that window must remain within
the source admission's own validity, the caller-configured lifetime ceiling is
enforced even for an explicit expiry, and the protocol also imposes a hard
one-hour maximum.

Unlike the prior W2c4 trust/control layers, source admission is itself a real
local trust mutation. W2c4d1 therefore does not falsely label the authorization
as authority-free: it declares the narrow `authority_effect` of
`w2c2-source-admission-only` and `source_trust_effect` of
`authorize-exact-local-source-admission`. At the same time it explicitly grants
no persona-root trust, social authority, capability promotion, finality, or
network effect. Possession of the source's own signing key is not provisioning
authority and cannot substitute for the separately trusted local operator key.
The operator signature proves only that the configured local operator key signed
the exact command; it is not legal-identity evidence or independent proof of
human approval.

W2c4d1 remains **inert authorization evidence**. It does not call
`admitSource()`, append a W2c2 receiver record, expose a provisioning endpoint,
or retroactively authorize an admission that already exists. W2c2 remains the
final source-epoch, exact-predecessor, activation-time, validity, capacity, and
restart-state oracle.

W2c4d2 adds the separate **crash-safe source-provisioning application
laboratory**. The d1 operator key remains verification-only inside this effect
service. A distinct local Ed25519 provisioner key signs an append-only canonical
JSONL application journal with three explicit phases:
`authorization-retained -> effect-ready -> admission-linked`. Authorization is
verified under the configured operator key and fsynced before any effect attempt.
Each `effect-ready` record then binds the exact d1 command digest, a contiguous
attempt number, intended W2c2 admission time, and the observed receiver durable
record count/head before the call. Known local journal capacity for a later link
is checked before W2c2 is invoked.

The only receiver mutation available to d2 is the exact W2c2 `admitSource()`
method. W2c2 independently remains authoritative for epoch-1 genesis, exact
`+1` source rotation, predecessor admission, activation time, validity, source
capacity, and durable replay semantics. After the call, d2 links only when the
exact authorized admission is retained by W2c2 and the receiver durable state has
advanced beyond the bound pre-effect position. Exact command replay after a link
is idempotent and does not create another receiver or application record.

The explicit `effect-ready` phase makes crash recovery non-retroactive. If W2c2
commits the admission and the process fails before `admission-linked`, restart
may observe the exact retained admission plus the earlier durable effect-ready
record and append a reconciliation link without calling `admitSource()` again.
An admission that exists with no prior effect-ready record is rejected as a
post-hoc/bypass condition; d2 may not manufacture authorization history after an
external admission appeared. A failed pre-effect attempt can be retried only by
appending a new in-window effect-ready attempt. Expired authorization cannot
create a new attempt, although an already-committed crash-window admission can
still be linked later because reconciliation records evidence of the prior
authorized attempt rather than granting new authority.

D2's provisioner signature authenticates only the configured local application
key and its journal. It does not replace operator authorization, prove legal
identity or independent human approval, create persona-root trust, or establish
global currentness. Current linkage evidence binds the exact retained admission
plus the receiver durable head/count advancement observed around the effect; it
does **not yet** export or embed the exact W2c2 witness-signed source-admission
record as a standalone cross-store proof. Stronger receiver-record export and
binding remains a separate hardening gate. D2 also inherits W2c2's existing
trusted local state-directory and single-active-writer assumptions: file `fsync`
and cross-store reconciliation are local crash-integrity evidence, not hostile-
host resistance, replicated durability, consensus, or distributed atomic commit.

W2c4d2 exposes no provisioning listener or network endpoint and performs no
remote self-enrollment, discovery, outbound fetch, persona-root enrollment,
social mutation, or Grid/Gateway/Hypervisor/Sandbox integration. It is the
bounded local provisioning effect gate needed before any later independently
reviewed deployment wrapper, not permission to federate or expose admission to
remote callers.

W2c4e1 adds a separate **authority-bearing service-key lifecycle foundation**
for the d1 operator and d2 provisioner roles. It intentionally does not reuse the
W1 persona credential schema: W1 journal credentials claim no authority effect,
while these operational service keys delegate narrowly scoped real local trust
authority. The operator role may delegate only signing of exact d1 W2c2
source-admission authorizations. The provisioner role may delegate only signing
of d2 application-journal records. The two roles use distinct trusted role-root
keys, and full lifecycle-aware d2 verification rejects a configuration that
collapses them into one root.

Each role-root-signed credential binds the exact domain, role, principal ID,
operational Ed25519 public key and digest, monotonically increasing key epoch,
activation time, transition kind, exact predecessor credential, predecessor
disposition, and explicit authority/non-claim fields. Epoch 1 is `initial`.
Routine `rotation` advances exactly one epoch, changes the operational key, and
marks the predecessor `retired`. `recovery` also advances exactly one epoch but
requires the predecessor be `revoked` or `compromised`. Operational key reuse in
a credential path fails closed. Separate root-signed revocation evidence can
terminate an exact credential at an explicit effective time.

Lifecycle-aware d1 command verification resolves the command's existing
`operator_key_id` through the exact credential path, so the d1 wire object does
not silently change schema. A stale predecessor cannot issue a new command at or
after successor activation. Routine retirement deliberately does not revoke an
already-issued short-lived d1 command before that command's own expiry; explicit
revocation or a compromise/recovery transition does block new W2c2 effects from
that earlier command at or after the contraction boundary. This distinction
preserves bounded in-flight operator intent without treating ordinary key
hygiene as a retroactive rewrite of signed history.

Lifecycle-aware d2 verification likewise keeps the existing d2 v1 record wire
format. Each historical `provisioner_key_id` is resolved to its exact credential
epoch and verified under that operational public key. Records signed by a
provisioner at or after its successor activation or revocation boundary fail
closed. A complete d2 journal may therefore contain valid historical records
from multiple provisioner epochs without re-signing or migrating earlier
records, while `effect-ready` records independently recheck the bound operator
command's effect authority at that recorded boundary.

W2c4e2 makes that trust model operational in a **separate lifecycle-aware d2
application store** while leaving the legacy d2 store unchanged. The lifecycle
store opens with the complete operator and provisioner credential paths plus one
current provisioner private key. Restart verifies every historical d2 v1 record
against the exact provisioner credential epoch named by its existing
`provisioner_key_id`, verifies retained operator commands against their exact
operator credential epochs, rebuilds the same application state machine, and
then permits new records only if the configured provisioner credential is usable
at the new record time.

Provisioner cutover is deliberately **restart/reopen based** rather than an
in-process private-key replacement API. Once a successor credential activates or
a provisioner credential is revoked, an older store carrying that key becomes
append-ineligible. Reopening the same canonical journal with the successor
private key and the same credential path can append the next contiguous record
to the existing hash chain. Earlier bytes remain unchanged and are never
re-signed or migrated. This keeps rotation within the existing trusted-local-
state and single-active-writer assumptions instead of introducing a second live
secret-key-swap race.

The same rule applies to crash recovery. If an earlier provisioner durably
recorded `effect-ready`, W2c2 committed the exact admission, and the process
failed before `admission-linked`, a reopened store using a valid successor
provisioner key may append only the reconciliation link. It does not invoke
`admitSource()` again. A stale or revoked provisioner cannot create that link,
and an admission with no prior durable effect-ready record remains a post-hoc
bypass failure.

E2 also enforces operator lifecycle state at the authority boundary. Routine
operator retirement may preserve a previously issued bounded command until its
own expiry, but explicit revocation or a compromise/recovery transition blocks a
new W2c2 effect before the lifecycle application journal records a new
authorization/effect attempt. Operator and provisioner role roots remain
non-substitutable.

W2c4e1/e2 activation and revocation timestamps remain signed protocol
statements, not proof from a trusted wall clock that a physical signature was
produced at that instant. Role-root compromise or loss is not automatically
recoverable by these layers and requires a separate explicit trust/governance
design. The lifecycle store claims detectable local file-drift resistance and
crash integrity only; it does not claim cross-process locking, hostile-host
resistance, replicated durability, or distributed atomic commit.

W2c4e1 and W2c4e2 add no listener, discovery, outbound acquisition, remote
enrollment, persona-root enrollment, social mutation, runtime route, capability
promotion, quorum, consensus, finality, or federation. Their key-state
verification is relative to the successor/revocation evidence supplied locally;
they do not claim globally current service-key state.

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
   W2c3 receive-only authenticated mTLS ingress, W2c4a local ingress trust
   bundles, W2c4b local source-control history, W2c4c durable applied source
   control, W2c4d1 source-provisioning authorization, W2c4d2 crash-safe
   source-provisioning application/reconciliation, W2c4e1 service-key lifecycle
   verification, and W2c4e2 restart-based operational signer cutover
   implemented):** the current work provides signed observations, idempotent
   replay, equivocation/stale-key evidence, witness-signed append-only local
   state, deterministic fail-closed restart, bounded stdin/stdout IPC, explicit
   local source admission, source-signed transfer continuity, source-equivocation
   evidence, separate persona-root trust, historically auditable transfer
   receipts, restart-safe receiver source-chain/replay state, verified replay,
   pending-observation separation, crash-window receiver↔witness reconciliation,
   exact certificate-to-source-epoch transport binding, bounded HTTPS intake,
   mTLS socket fault evidence, content-addressed generation-chained local ingress
   trust bindings that cannot mint receiver source trust, content-addressed
   source-control history for certificate rotation/next-epoch source rotation/
   disable trust contraction, operator-signed durable control application, live
   fail-closed source-binding resolution for subsequent requests, short-lived
   operator-signed authorization for one exact W2c2 source-admission effect, a
   separate provisioner-signed three-phase durable application journal with
   crash-window reconciliation and explicit post-hoc-admission rejection,
   distinct role-root-signed operator/provisioner credential epochs with
   revocation/recovery and multi-epoch historical verification, and restart-
   based successor provisioner signing on the same unchanged historical journal.
   Remaining W2 work includes stronger exported W2c2 admission-record evidence
   if required, integration of preserved whole-listener lifecycle control on the
   current trust stack, role-root lifecycle and stronger host trust if required,
   a separately reviewed public deployment wrapper if justified,
   discovery/outbound acquisition policy if justified, independently operated
   hosts, broader remote abuse/resource testing, and multi-witness evidence
   exchange without Grid authority;
4. **W3 — archive and availability laboratory:** independently operated public
   object retention with explicit availability and legal-removal semantics;
5. **W4 — optional checkpoint agreement adapter:** evaluate threshold/BFT
   certification of compact checkpoints under Byzantine, partition, capture,
   censorship, version-skew, and key-compromise conditions;
6. **W5 — AXIOM Verify:** independently verify content digests, persona journal
   signatures, credential epochs, revocations, continuity, witness receipts,
   witness observations/conflicts, durable witness records, source admissions,
   source transfer chains/equivocation, package-verification receipts, durable
   receiver intake/linkage records, authenticated transport bindings, ingress
   trust-bundle generations, source-control histories, operator-signed applied
   source-control records, source-provisioning authorization commands,
   provisioner-signed application/ready/link records and their receiver-state
   bindings, service-role credential paths/revocations, lifecycle-aware operator/
   provisioner signature epochs, restart-based provisioner signer cutover and
   cross-epoch reconciliation continuity, checkpoints, availability, and any
   optional finality certificate while preserving explicit non-claims; and
7. **W6 — promotion:** only after applicable protocol, security, privacy,
   operational, scale, governance, and independent-review gates pass.

A persona can still sign two conflicting journal entries at the same continuity
position. That is equivocation, not something cryptography can prohibit. W2a
and W2b retain and expose conflicting valid persona artifacts and signed
conflict evidence rather than silently choosing one. W2c1, W2c2, and W2c3 apply
the same rule to an admitted source that signs competing transfer packages at
one source position, with W2c2 durably retaining the conflict across restart and
W2c3 proving the same result survives authenticated socket delivery. W2c4a,
W2c4b, W2c4c, W2c4d1, W2c4d2, W2c4e1, and W2c4e2 cannot resolve or suppress
that conflict: the first three bind/apply local ingress trust/control, d1
authorizes one exact future source-admission effect, d2 durably applies only
that bounded local trust mutation, e1 governs which local service keys may
authenticate those exact authorization/application signatures, and e2 governs
restart-based continuation under those credentials. None selects a preferred
source artifact. Future multi-witness and agreement protocols must preserve both
forms of conflict rather than silently select a winner.

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
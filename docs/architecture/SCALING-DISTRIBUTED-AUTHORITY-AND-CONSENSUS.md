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

The first executable foundation is intentionally pure and non-networking:

- `mesh/src/lib/public-witness.mjs` defines persona-key public journal
  attestations, exact predecessor continuity, independent witness receipts, and
  deterministic receipt checkpoints;
- `mesh/test/public-witness.test.mjs` verifies public-audience enforcement,
  tamper and key-substitution rejection, publication/retraction continuity,
  witness binding, deterministic checkpoint roots, and explicit non-claims;
- no Gateway, Hypervisor, Sandbox, Grid mutation, relay, archive, discovery,
  consensus, finality, or capability promotion is activated by these helpers;
- the accepted no-egress social storage composition remains unchanged.

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

The current persona projection does not yet standardize a persona journal key
credential. Verification therefore requires an explicitly trusted persona
public key supplied out of band. A later key-credential and key-epoch protocol
must define binding, rotation, revocation, recovery, and replay behavior without
silently converting a cryptographic key into a legal-identity claim.

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

1. **W0 — pure cryptographic foundation:** public-only journal attestations,
   witness receipts, deterministic checkpoints, and non-authority tests;
2. **W1 — persona key credentials and epochs:** privacy-preserving key binding,
   rotation, revocation, recovery, and stale-key rejection;
3. **W2 — witness service laboratory:** independently deployable, bounded,
   no-Grid-authority witness service with replay/equivocation evidence;
4. **W3 — archive and availability laboratory:** independently operated public
   object retention with explicit availability and legal-removal semantics;
5. **W4 — optional checkpoint agreement adapter:** evaluate threshold/BFT
   certification of compact checkpoints under Byzantine, partition, capture,
   censorship, version-skew, and key-compromise conditions;
6. **W5 — AXIOM Verify:** independently verify content digests, persona journal
   signatures, continuity, witness receipts, checkpoints, availability, and any
   optional finality certificate while preserving explicit non-claims; and
7. **W6 — promotion:** only after applicable protocol, security, privacy,
   operational, scale, governance, and independent-review gates pass.

A persona can still sign two conflicting journal entries at the same continuity
position. That is equivocation, not something cryptography can prohibit. Future
witness and agreement protocols must retain and expose conflicting valid
artifacts rather than silently choose one by arrival time, popularity,
application preference, or lexical digest order.

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

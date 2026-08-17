# Public Social Witness Layer

**Status:** architectural foundation and pure verification laboratory  
**Updated:** 2026-08-17  
**Applies to:** public AXIOM social publications, future relays, archives, witness services, agreement adapters, and AXIOM Verify

## Purpose

AXIOM-MESH needs a way for a public social act to become difficult to erase or
silently rewrite without turning the Mesh into one mandatory global blockchain.
The public witness layer provides that history primitive while preserving the
existing split between sovereign local authority and optional bounded agreement.

The target property is precise:

> A statement that was intentionally published to a public audience can later be
> superseded, retracted, or stopped from being served, but its prior public form
> cannot be silently replaced with a different historical form while still
> presenting the replacement as the original.

This is an integrity and continuity property. It is not a claim that the content
was true, lawful, fair, human-authored, or legally attributable to a particular
person.

## Current implementation boundary

The first implementation is deliberately pure and non-networking:

- `mesh/src/lib/public-witness.mjs` defines strict cryptographic objects and
  verification helpers;
- `mesh/test/public-witness.test.mjs` exercises public-only admission,
  persona-key signatures, predecessor continuity, independent witness receipts,
  deterministic receipt commitments, tamper rejection, and explicit non-claims;
- no Gateway, Hypervisor, Sandbox, Grid mutation, transport, relay, discovery,
  archive, consensus, or finality path is activated by this work;
- the accepted no-egress social storage composition remains unchanged;
- no capability is promoted by the presence of these library primitives.

The current foundation is therefore an executable protocol laboratory, not a
claim of a live decentralized social network.

## Layer model

A public social history is built in distinct layers. Implementations MUST NOT
collapse the guarantees of one layer into the guarantees of another.

```text
public social projection
        |
        v
persona-key journal attestation
        |
        v
independent witness receipt(s)
        |
        v
deterministic receipt checkpoint
        |
        +--------------------+
        |                    |
        v                    v
archive / availability   agreement certificate
(future)                 (future, optional)
        |                    |
        +----------+---------+
                   v
              AXIOM Verify
                 (future)
```

### Layer 1 — Public social projection

The existing social projection remains the content object. Publications are
content addressed. Edits are new projections that name the exact prior
projection through `supersedes_digest`. Retractions are separate append-only
transitions and do not claim that copies held by third parties were deleted.

The public witness layer accepts only publications whose audience mode is
`public`. Followers-only and Circle-only material MUST NOT enter a public
witness domain merely because an application can read it locally.

`discoverability: unlisted` is still a public-audience statement; it controls
listing behavior, not whether the object was intentionally public.

### Layer 2 — Persona-key public journal attestation

A persona-controlled Ed25519 key signs an exact public social entry into a
persona journal. The v1 statement binds:

- entry type and schema;
- exact publication or retraction digest;
- persona ID and public persona-projection digest;
- signing-key digest;
- monotonically increasing sequence number;
- exact predecessor-attestation digest;
- canonical issuance time; and
- explicit non-claims and zero authority/network effects.

Sequence 1 has no predecessor. Every later journal statement names the exact
previous signed attestation. A verifier can therefore detect a missing,
substituted, or reordered predecessor when it has the relevant history.

The current public persona projection does **not** yet carry a standardized
persona signing-key credential. The verifier must therefore be given the
trusted persona public key out of band. This foundation proves that the trusted
key signed the exact journal statement. It does not yet prove how that key was
bound to the persona in the first place.

A future persona-key credential or key-epoch protocol MUST solve that binding
and rotation problem without exposing protected controller identity for
pseudonymous, selectively attributable, or anonymous personas.

### Layer 3 — Independent witness receipt

A witness signs a receipt only after verifying the supplied persona journal
attestation against the trusted persona key and exact public social entry.
The receipt binds:

- witness domain, witness ID, and witness key;
- exact journal-attestation digest;
- exact social entry digest;
- persona and persona-projection binding;
- journal sequence; and
- observation time.

A witness receipt means only that the named witness key observed and verified
that exact signed artifact under the stated verification inputs.

It MUST NOT be represented as proof that:

- the content is true;
- a legal or biological identity authored it;
- the represented human personally typed it;
- the statement is lawful or ethical;
- the witness endorses it;
- a quorum was achieved; or
- the statement reached consensus or finality.

Witnesses are evidence providers, not global social authorities.

### Layer 4 — Receipt checkpoint

Witness receipt digests may be aggregated into a compact deterministic
checkpoint. The v1 foundation:

- sorts unique receipt digests before commitment;
- uses domain-separated SHA-256 Merkle leaves and nodes;
- records receipt count and Merkle root;
- links later checkpoints to an exact predecessor checkpoint;
- declares `finality: unfinalized`;
- declares `consensus_claimed: false`;
- declares `data_availability_claimed: false`; and
- performs no network or authority effect.

A checkpoint is therefore a compact commitment to a set of receipts. The count
of witnesses or receipts MUST NOT be silently converted into a quorum rule.

A future agreement-domain contract may define a quorum, threshold-signature,
BFT certificate, or external anchoring policy over checkpoints. That policy is
a separate protocol with separate membership, Sybil, capture, liveness,
privacy, upgrade, and finality assumptions.

## Why not consensus on every post

Most social activity does not require a globally ordered state machine. Making
every post, edit, reply, reaction, or follow wait for universal consensus would
couple ordinary publishing to global throughput, membership, censorship,
latency, and governance failure modes.

AXIOM instead separates four questions:

1. **Origin integrity** — which trusted persona key signed this exact public
   journal entry?
2. **Independent observation** — which independent witnesses observed that
   signed artifact?
3. **Availability** — which archives or replicas still serve the content and
   supporting evidence?
4. **Shared authority/finality** — does a specifically defined agreement domain
   need to agree on some bounded shared fact?

Only the fourth question inherently requires consensus. Replication and
witnessing can remain useful without it.

## Supersession, correction, and retraction

Public permanence MUST NOT be confused with an inability to correct mistakes.

A correction is represented as a new publication whose `supersedes_digest`
points to the exact previous publication. Both can be separately journaled and
witnessed.

A retraction is represented as a new transition whose digest can also be
journaled and witnessed. User interfaces may stop serving the old body or show
it behind a historical notice according to law and policy, but the transition
must not rewrite the earlier commitment.

This produces a history of:

```text
published -> superseded -> retracted
```

rather than:

```text
published -> silently overwritten
```

The system should make correction easy while making invisible historical
revision difficult.

## Equivocation and forks

A persona key can technically sign conflicting journal entries with the same
sequence or predecessor. Cryptography cannot prevent a key holder from signing
two different messages.

Independent witnesses make that behavior detectable. Two valid attestations
with the same persona/key epoch and conflicting continuity position are
**equivocation evidence**. Future witness and agreement protocols must define
how that evidence is propagated, retained, displayed, and handled.

A verifier MUST NOT choose a fork by wall-clock arrival, social popularity,
application preference, or lexical digest order and call that choice historical
truth.

## Privacy and attribution

The witness layer inherits the existing social attribution modes. A public post
may be publicly identifiable, pseudonymous, selectively attributable,
anonymous, or organization-delegated.

The public witness protocol MUST bind the public persona projection that was
actually used without adding protected controller linkage. A witness must not
turn possession of a public cryptographic artifact into an unauthorized identity
reveal.

Private audience modes remain outside the public witness domain. A future
private or Circle-specific evidence domain may use encrypted replication,
selective disclosure, threshold attestation, or zero-knowledge verification,
but it must be designed and promoted separately.

## Data availability is separate

A hash proves integrity only when the referenced bytes are available to the
verifier. A witness receipt proves observation of an exact artifact, not that
its body will remain retrievable forever.

Future archive and replica roles therefore need separate rules for:

- object retention and expiry;
- legal removal and jurisdictional obligations;
- storage quotas and denial-of-service resistance;
- media and attachment availability;
- encrypted or selective retention where applicable;
- archive exit and transfer;
- evidence after an archive shuts down; and
- explicit signaling when only a commitment survives.

The v1 checkpoint consequently sets `data_availability_claimed: false`.

## Relationship to sovereign Grids

The owner's Grid remains authoritative for owner-local state. Publishing a
public journal attestation does not grant a witness, archive, relay, application,
or agreement domain authority over the owner's private memory, consent,
capabilities, devices, or local policy.

A witness certificate may later become evidence consumed by a local policy, but
it cannot bypass:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

where a privileged local effect is required.

The public witness layer is therefore an application of the existing
sovereignty-plane/agreement-plane split, not a replacement for it.

## Application and node roles

Applications may compose roles without owning the protocol. Candidate roles
include:

- **client** — create, sign, verify, render, and export public history;
- **relay** — transport exact bounded artifacts between endpoints;
- **indexer** — build disposable search/feed views from verified public state;
- **witness** — independently observe and sign bounded receipts;
- **archive** — retain public objects and evidence for availability;
- **checkpoint producer** — aggregate receipt commitments without claiming
  finality;
- **agreement participant** — participate in a separately defined bounded
  consensus domain; and
- **light verifier** — verify selected objects, receipts, checkpoints, and
  certificates without hosting the whole corpus.

An application disappearing must not redefine the user's cryptographic history.
Users should be able to move among compatible applications while preserving
persona state and independently verifiable public history.

## Agreement-domain boundary

A future public-witness agreement domain MUST define at least:

- domain purpose and exact governed state;
- witness/validator membership and epochs;
- admission and key rotation;
- independence assumptions and Sybil resistance;
- quorum and finality rules;
- equivocation handling;
- data-availability requirements;
- censorship and partition behavior;
- privacy and jurisdiction constraints;
- upgrade and rollback rules;
- capture and collusion analysis;
- member exit and domain dissolution; and
- portable certificate verification.

No universal quorum such as `3/5` is defined by this foundation. Different
agreement domains may require different mechanisms, and some public witnessing
may never require consensus at all.

## Phased roadmap

### W0 — Pure cryptographic foundation — current implementation scope

- public-only publication validation;
- persona-key journal attestations;
- publication, supersession, and retraction continuity support;
- witness observation receipts;
- deterministic receipt Merkle commitments;
- explicit non-authority, non-network, non-truth, and non-finality claims;
- unit tests for tamper, key-substitution, audience, continuity, and checkpoint
  boundaries.

### W1 — Persona key credentials and epochs

Define how a public persona projection delegates one or more journal signing
keys, rotates or revokes them, survives recovery, and preserves privacy. Prove
that old keys cannot silently regain authority in a new epoch.

### W2 — Witness service laboratory

Build an independently deployable witness service outside the Grid. It should
accept bounded artifacts, verify them without privileged Grid credentials, sign
receipts, expose anti-replay/equivocation evidence, and remain unable to admit
remote content or authorize local effects.

### W3 — Archive and availability laboratory

Add independently operated public-object archives and retrieval proofs with
explicit retention and data-availability semantics. Archive replication must
remain a separate claim from witness independence and consensus.

### W4 — Optional checkpoint agreement adapter

Define an agreement-domain contract over compact checkpoints. Evaluate threshold
signatures and BFT/state-machine approaches against independently operated
members, partitions, Byzantine behavior, capture, censorship, version skew, key
compromise, and member exit.

### W5 — AXIOM Verify

Allow a verifier to inspect a portable bundle and distinguish:

- valid content digest;
- valid persona-key journal signature;
- valid predecessor continuity;
- valid witness receipts;
- valid checkpoint commitment;
- data availability;
- optional agreement certificate/finality; and
- explicit non-claims.

Verification must work without trusting a hosted AXIOM service.

### W6 — Promotion

Only after the relevant protocol, security, operational, privacy, governance,
scale, and independent-review gates pass should any witness, archive, relay, or
agreement capability move into the supported runtime or public capability
claims.

## Threats that must be carried forward

Future work must explicitly test at least:

- persona signing-key theft and stale-key replay;
- witness key compromise;
- witness Sybils and concentration;
- colluding witnesses signing fabricated observation times;
- equivocation by a persona or checkpoint producer;
- withholding the content while retaining commitments;
- archive censorship or selective deletion;
- malicious oversized content and evidence amplification;
- replay across domains or epochs;
- privacy correlation of pseudonymous identities;
- metadata leakage through timing and witness selection;
- malicious renderable content delivered inside otherwise valid objects;
- false UI language that upgrades integrity evidence into truth or identity;
- checkpoint forks, partitions, and version skew; and
- governance capture of any later agreement domain.

## Current non-claims

This foundation does **not** claim:

- live social federation;
- public relay deployment;
- witness discovery;
- independent deployed witnesses;
- archive replication;
- durable global content availability;
- Sybil resistance;
- quorum or consensus;
- BFT safety or liveness;
- global ordering;
- public timestamp authority;
- legal identity proof;
- human authorship proof;
- content truth;
- moderation adjudication;
- recommendation/ranking authority; or
- production promotion.

Its narrower claim is useful: AXIOM now has a concrete, testable protocol shape
for turning an intentionally public social object into an append-only
persona-key journal entry, independently witnessable observation evidence, and a
compact checkpoint commitment without granting those objects network authority
or pretending that observation is consensus.

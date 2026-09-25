# Mesh-Notarized Agreements

**Status:** inert v0 contract candidate prepared from `0.1.0-draft.1`; no Grid
mutation, capability-registry change, runtime activation, enforcement, or
production claim.

## Purpose

Define a machine-verifiable record format for mutual commitments between
principals on the mesh, so that any later party — including an independent
verifier — can confirm that a commitment existed, in what exact form, when it
was recorded, and in what order, without trusting anyone's memory.

Notarization is evidence, not enforcement. The record proves
agreement *content and existence*; it grants no authority, executes nothing,
and settles nothing.

## Design goals

- **Existing global Grid ordering.** A future agreement event participates in
  the existing global Grid evidence sequence. Its `prev_hash` binds the
  immediately preceding Grid event, not a previous agreement or a
  principal-specific chain head. Agreement supersession links separately bind
  related agreement revisions.
- **Honest timestamps.** The recorded time is a `recorded_at` claim bound into
  the event. The Grid chain proves relative event order; absolute clock truth is
  claimed only where an independent attestation exists.
- **Metadata kept, separated.** Identity digests of the committing principals,
  schema version, content digest, timestamp, and supersession links travel with
  the record; private agreement content never does.
- **Digests over plaintext.** The notarization layer commits to content
  digests, never to private text. Content lives where its owners keep it; the
  mesh record is proof of *what was agreed*, not a copy of it.

## Record structure

A notarized-agreement record contains:

- `agreement_id` — content-addressed identifier derived from the canonical
  body digest and the parties' identity digests;
- `parties` — digest-bound identities of the committing principals, reusing
  existing human principal and machine-principal identity evidence
  (`core.machine-principals`); no new identity proofing is introduced;
- `body_digest` — digest of the canonical agreement text, using the same
  JSON-compatible plain-data canonicalization as authority/evidence
  canonicalization (no class instances, accessors, or prototype state);
- `metadata` — schema version, `recorded_at` claim, optional context tags,
  and supersession links to earlier records it replaces;
- `agreement_payload` — the exact JSON-compatible plain-data object
  `{agreement_id,parties,body_digest,metadata}`. A future Grid append MUST set
  its event `payload_digest` to the canonical digest of this exact object, so
  `agreement_id`, `body_digest`, party bindings, and `metadata.recorded_at`
  cannot be substituted independently of the signed Grid event;
- `grid_event` — the agreement payload is bound through the existing global
  Grid event envelope. Grid continuity is the repository's current
  `seq` / `prev_hash` / `event_hash` sequence. `event_hash` is the canonical
  digest of `{seq,event_id,trace_id,actor,kind,subject,occurred_at,payload_digest,prev_hash}`,
  and Grid signs `{event_hash}`. This draft introduces no separate per-principal
  evidence chain and no independent `prev_head_digest`;
- `acceptances` — each party's inert acceptance-evidence record references the
  exact `agreement_id`, `body_digest`, and one immutable consent-grant
  statement/evidence binding. Current AXIOM consent is materialized Grid state,
  not a generic reusable acceptance-signature envelope, so v0 does **not**
  invent a second signature system. The immutable `consent.granted` evidence
  establishes what consent was recorded at acceptance time; the current consent
  row is evaluated separately for later expiry/revocation currentness.

## Verification

An independent verifier can check, without trusting either party:

1. the body digest recomputes from the canonical text presented;
2. the canonical digest of the presented `agreement_payload` equals the bound
   Grid event's `payload_digest`;
3. the bound Grid event recomputes to its `event_hash`, its Grid signature
   validates, and its global `seq` / `prev_hash` continuity is valid against the
   trusted Grid history or retained continuity anchor used for that proof;
4. every acceptance binds the exact party to an immutable consent-grant
   statement/evidence record whose subject, controller, purpose, scope, expiry,
   and creation time match the agreement acceptance policy;
5. historical acceptance was valid at the recorded time;
6. current materialized consent state is reported separately and may later be
   revoked or expired without rewriting the historical acceptance result;
7. the record conforms to this schema version.

Verification proves only the bounded evidence claims it actually checks.
The v0 assessment deliberately separates **recorded acceptance validity** from
**current acceptance state**. A later consent revocation can make an acceptance
non-current without rewriting the historical fact that the acceptance evidence
was valid when recorded.

Neither state proves that the agreement is fair, legally enforceable, wise,
factually true, or presently executable.

## Non-goals and non-claims

- No legal enforceability, identity proofing, KYC, or settlement claim.
- No payment, token, bridge, or value-transfer primitive.
- No BFT consensus or replicated finality; ordering follows the single-log
  Grid evidence model.
- No change to `mesh/config/capabilities.json`, production policy, or any
  promotion status.
- Private agreement content is never committed in plaintext to the mesh
  record; digest-only by construction.

## Relation to the existing substrate

The design reuses `core.evidence-chain` (signed hash-linked evidence),
`core.intent-loop` (authenticated intent), `core.machine-principals`
(constrained principal identity), and `consent.receipts`. Any future
implementation would be gated by the normal capability, policy, registry, and
promotion rules, including a threat model and independent review.


## Inert executable v0 contract boundary

The prepared implementation uses two closed contracts:

- `axiom-agreement-record.v0` — sorted party principals, private body digest,
  honest `recorded_at` claim, context tags, supersession links, and a
  body-bound Grid-consent acceptance policy. The content-addressed
  `agreement_id` is recomputed from the canonical non-self-referential record
  body.
- `axiom-agreement-acceptance-evidence.v0` — one party's exact agreement/body
  binding plus one immutable consent-grant statement digest and evidence
  reference/digest.

The pure verifier accepts separately supplied immutable consent-grant
statements and current materialized consent rows. It can establish whether
every party had valid recorded acceptance evidence at agreement recording time
and whether all of those consent records are still active at a later assessment
time. It performs no Grid read, write, signature verification, network access,
consent issuance/revocation, enforcement, payment, settlement, or runtime
activation.

A separate closed-lineage verifier checks content-addressed supersession
references, missing records, chronological supersession, cycles, and a
permutation-stable lineage digest.

A future Circle adapter may require current Circle membership and charter
bindings around the generic agreement record. Circle-specific authority is not
part of the generic agreement contract.

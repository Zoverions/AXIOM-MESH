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

### Observation coverage for historical and present conclusions

The conditional historical conclusion requires each supplied consent observation
to cover the recording instant without coming from the future:
`agreement.recorded_at <= observation.observed_at <= assessedAt`.
An earlier observation cannot establish whether consent was revoked before the
agreement was recorded. A future observation cannot establish a result at an
earlier assessment time. Assessment before recording denies both the aggregate
historical result and each party's historical result.

Present currentness remains stricter: the observation must be at exactly
`assessedAt`, with matching grant terms and active, unexpired, unrevoked consent.
An observation after recording but before assessment may support the historical
conclusion without proving present currentness. Later revocation or expiry does
not rewrite a historical conclusion supported by temporally consistent evidence.

A materialized observation cannot precede the consent record's `created_at`, or
its `revoked_at` when it already reports revocation. Contradictory chronology is
rejected rather than treated as a future scheduled change.

These comparisons validate supplied evidence only. They do not authenticate a
snapshot, verify signatures or completeness, prove absolute time, or issue any
authority. Independent Grid evidence verification remains required. Regression
coverage is in `mesh/test/agreement-observation-window.test.mjs`; serialized UTC
pattern coverage across the four related contracts is in
`mesh/test/commitment-timestamp-patterns.test.mjs`. Calendar validity remains a
semantic-validator responsibility in addition to JSON Schema timestamp shape.

### Read-only Circle commitment status projection

`mesh/src/lib/circle-commitment-status.mjs` adds
`assessCircleCommitmentStatus` without replacing an agreement, membership, or
historical-admission contract. It composes the existing assessors and exposes
retained historical results beside separate present membership and consent
observations. This is a callable evidence projection, not a live Axiom One
screen, store, polling loop, or authority decision.

The caller supplies `historicalInput`, `currentCircleEvidence`,
`currentAgreementEvidenceInput`, and `assessedAt`. Either current evidence
bundle may explicitly be null. A present Circle bundle contains the exact
package, snapshot evidence, and bounded per-party membership evidence. Its
Circle ID, package digest, charter digest, and observation time must match.
Each supplied membership context must identify the original agreement party
and use the same assessment instant. Duplicate or outsider evidence is rejected.

Present agreement evidence must retain the same agreement, acceptances, and
immutable consent-grant statements; only its current consent observations and
assessment time vary. Input arrays may be reordered without changing per-party
decisions. The `input_digest` deliberately binds the exact supplied packet,
including ordering, and `status_digest` binds the complete resulting projection.

Each party has separate membership and consent support states: `supported`,
`not-supported`, or `unknown`. These labels describe support under the supplied
inputs, not externally authenticated truth. Missing present evidence and stale
positive observations remain unknown; they never borrow an older positive
result. Explicit negative findings dominate uncertainty both per party and in
the aggregate. A stale observation reporting revocation, expiry, or a binding
mismatch remains `not-supported`, with the stale-evidence reason retained.
When the present agreement bundle is supplied, expiry in its exact immutable
party-bound consent grant remains negative even if its current observation is
missing. No positive present consent is inferred from that grant.

A current Circle snapshot can likewise establish an effective exit or inactive
status for the exact historical membership even when supplemental member
context is missing. That fallback is negative-only: an active label without
context stays unknown, a future-dated exit or status is not treated as already
effective, and a separately assessed new membership is not overridden by the
old membership's exit. All findings still depend on independently verified
snapshot authenticity and completeness. Unknown evidence dominates success;
it never conceals an already established negative finding.

A later exit or consent revocation does not mutate the retained historical
input. Conversely, preserving history must not conceal contradictory evidence.
An explicitly dated pre-recording consent revocation, membership inactivity,
or exit concerning the historical membership raises
`historical_review_required` with reasons. This limited discrepancy signal is
not a proof that all possible contradictions or omissions were detected.
Historical and current findings must be displayed together, not collapsed into
an unconditional agreement-validity label.

A renewed current charter is reported separately as `charter_changed`; it is
never substituted into the historical admission. A status assessment cannot
predate the retained historical evaluation. Inputs are copied through the
existing plain-data canonicalizer before use, so accessors and prototype state
cannot participate in the projection. Neither input snapshots nor prior
assessments are edited.

Regression coverage is in `mesh/test/circle-commitment-status.test.mjs`.
All authority, governance, enforcement, execution, payment, settlement, and
network effects remain none; runtime activation remains false. Snapshot
completeness, provenance, signatures, and external evidence authenticity must
still be verified independently. No live interface or capability is promoted.

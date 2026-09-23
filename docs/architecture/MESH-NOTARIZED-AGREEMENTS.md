# Mesh-Notarized Agreements

**Status:** DESIGN-ONLY — `0.1.0-draft.1`. Specification only; no implementation,
no capability-registry change, no production claim.

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
- `acceptances` — each party's signed acceptance receipt referencing
  `agreement_id` and `body_digest`, consistent with `consent.receipts`.

## Verification

An independent verifier can check, without trusting either party:

1. the body digest recomputes from the canonical text presented;
2. the canonical digest of the presented `agreement_payload` equals the bound
   Grid event's `payload_digest`;
3. the bound Grid event recomputes to its `event_hash`, its Grid signature
   validates, and its global `seq` / `prev_hash` continuity is valid against the
   trusted Grid history or retained continuity anchor used for that proof;
4. every acceptance signature validates against the bound principal identity;
5. the record conforms to this schema version.

Verification proves the agreement was *recorded as stated*. It does not prove
the agreement is fair, legally enforceable, wise, or true.

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

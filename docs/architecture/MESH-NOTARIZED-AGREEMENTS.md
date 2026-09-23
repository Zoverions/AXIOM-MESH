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

- **Hash-chained ordering.** Each record binds the digest of the previous
  record head, so silent reordering, backdating, or deletion is detectable by
  anyone who holds an earlier digest.
- **Honest timestamps.** The recorded time is a `recorded_at` claim bound into
  the digest. The chain proves relative order; absolute clock truth is claimed
  only where an independent attestation exists.
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
- `chain` — `prev_head_digest`; the record is appended to the principal's
  Grid evidence chain (`core.evidence-chain`), preserving the
  Gateway -> Hypervisor -> Sandbox -> Grid authority sequence;
- `acceptances` — each party's signed acceptance receipt referencing
  `agreement_id` and `body_digest`, consistent with `consent.receipts`.

## Verification

An independent verifier can check, without trusting either party:

1. the body digest recomputes from the canonical text presented;
2. the chain is continuous from a trusted earlier head;
3. every acceptance signature validates against the bound principal identity;
4. the record conforms to this schema version.

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

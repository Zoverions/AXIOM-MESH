# AXIOM Operation Proposal Binding v0 (O1)

**Status:** inert verifier / O1  
**Version:** v0  
**Authority:** none  
**Issue:** #1628 (follows O0, PR #1741)

## Purpose and boundary

O0 ([Semantic Operation Proposal v0](SEMANTIC-OPERATION-PROPOSAL.md)) lets a
semantic engine propose operation IDs and typed arguments. O0 only
format-checks the digests a proposal carries. O1 adds one pure verifier,
`verifyOperationProposalBinding(trusted)`, in
`mesh/src/lib/operation-proposal-binding.mjs`. It recomputes every digest from
the caller's original objects and binds the proposal to the deterministic
Operation Candidate Selection only when every check passes.

> **A binding is evidence, never permission.**

The binding sits outside the privileged-effect sequence
`Gateway -> Hypervisor -> Sandbox -> Grid`. It does not enter that sequence or
grant permission to enter it. It has no filesystem, network, process or
runtime surface. It does not import the Specialist Harness Bridge or the
Semantic Action Consumption Lab, and it is not wired into either.
`mesh/config/capabilities.json` is unchanged.

## Contract identity

- Schema name: `axiom-operation-proposal-binding.v0`
- Wire schema: [`contracts/operation-proposal-binding.v0.schema.json`](contracts/operation-proposal-binding.v0.schema.json)
- Verifier and strict validator: `mesh/src/lib/operation-proposal-binding.mjs`
  (`verifyOperationProposalBinding`, `validateOperationProposalBinding`)

Input:

```text
trusted = {
  manifest,                 // full axiom-semantic-operation-manifest.v0
  selection_trusted_input,  // input to createOperationCandidateSelectionProposal
  selection,                // axiom-operation-candidate-selection.v0
  proposal,                 // axiom-semantic-operation-proposal.v0
  offers?                   // [{ operation_id, offer_digest, offer, catalog_entry, constraints }]
}
```

`offer_digest` is the digest the caller recorded for the offer, for example
the value passed to the deprecated `composeProposalWithOfferDigest`. O1
recomputes the digest from the supplied offer and requires the two to match.

## Hard zeros

Every binding document, including rejections, carries:

- `authority_effect: none`
- `assurance_effect: none`
- `currentness_effect: none`
- `execution_effect: none`
- `network_effect: none`
- `runtime_activation: false`
- `authorization_result: not-evaluated`

Limits: at most 32 candidates, 32 proposed operations and 32 offers. The
candidate limit equals the bound in `computeCandidateSetDigest`.

## Plain-data rule: inspect originals

This rule comes from the #1893 B-1 lesson. The verifier never works on a
clone or a JSON round-trip. Before any check reads a field, it walks the
caller's original `trusted` object:

- closed-key checks use `Reflect.ownKeys`, so non-enumerable and symbol keys
  are caught;
- Proxies (`util.types.isProxy`), accessors, non-plain prototypes, sparse or
  decorated arrays and cycles are rejected. Values are read through property
  descriptors, so a caller's getter never runs;
- the repo's strict `canonicalize` then runs on the same original as a
  second gate;
- every digest is recomputed from those same originals.

Any failure gives `input-not-plain-data`. The reused O0 and selection
validators still use `Object.keys`. That is sound here only because the walk
has already rejected every hidden-state shape they would miss.

## Check order and closed reason codes

The checks run in a fixed order and the first failure wins. A failure returns
`binding_status: rejected`, a closed `rejection_reason`, null digests and no
bound operations.

Preconditions: `input-not-plain-data`, `input-malformed` (a missing or
non-object top-level input, trusted candidate or proposal, or a non-array
candidate, proposed or offers list),
`candidate-limit-exceeded`, `proposed-limit-exceeded`, `offer-limit-exceeded`,
`proposal-invalid` (O0 shape or `proposal_digest` fails).

(a) **Manifest.** The verifier recomputes the manifest digest from
`{schema, version, status, operations}`. It must equal
`manifest.manifest_digest` (`manifest-digest-mismatch`). The manifest must
also rebuild to the same digest through the manifest constructor
(`manifest-invalid`). It must equal `proposal.operation_manifest_digest`
(`proposal-manifest-digest-mismatch`). Every selection candidate must be in the
manifest (`candidate-not-in-manifest`), and every candidate `manifest_digest`
must match (`candidate-manifest-digest-mismatch`).

(b) **Selection and candidate set.** The verifier recomputes the selection
from `selection_trusted_input` (`selection-not-recomputed`). It then derives
the proposal-space candidate digest from those same trusted candidates, using
the existing `computeCandidateSetDigest`, and requires it to equal
`proposal.candidate_set_digest` (`candidate-set-digest-mismatch`).

(c) **Discovery mode.** `descriptive-discovery` is never bindable
(`discovery-mode-not-bindable`).

(d)/(e) **Proposed operations.** For each proposed operation, a
deterministic-ineligible candidate is checked first and is never bound,
whatever the confidence (`operation-deterministic-ineligible`). Then the
operation must be in `selection.selected` (`operation-not-selected`). The
ineligibility check comes first because an ineligible operation is also never
selected; deny-dominant ordering gives it the more specific reason.

**Arguments.** Each proposed operation's arguments are checked again against
the manifest argument schemas (`proposal-arguments-invalid`). The check uses
O0's own validator, not a copy: `validateCallAgainstManifest` (unknown,
missing, wrong-type and wrong-enum arguments) and
`nestedArgumentFailureReason` (nested object arguments). Both are now exported
from the O0 module, and O0 behaviour is unchanged. `bound` therefore means the
arguments satisfy the manifest schema, even when the proposal was forged and
its digest resealed.

(f) **Offers.** Each supplied offer must name a proposed operation
(`offer-operation-not-proposed`), appear once (`offer-duplicate`), and be
well formed (`offer-malformed`). It must re-evaluate as `eligible: true`
through `evaluateExternalOperationOffer` (`offer-ineligible`, with the offer
module's own codes in `offer_rejection_reasons`, for example
`quote-exceeds-spend-ceiling` or `catalog-binding-invalid`). Its recomputed
digest must equal the recorded `offer_digest` (`offer-digest-mismatch`).

(g) **Abstention.** Zero proposed operations gives `abstained`.

If every check passes, the status is `bound` for a resolved selection. For an
unresolved selection (a fallback) the status is `unresolved-deliberation`,
never `bound`.

## Output

`bound_operations[]` holds `{operation_id, arguments_digest, offer_digest}`,
sorted canonically. Provider identity and confidence are left out, so two
providers proposing the same operation and arguments yield identical
`bound_operations` and authority fields. `binding_digest` is the digest of
every other field. It does not depend on key order, candidate order, evidence
order or `offers[]` order.

Two properties of `bound_operations` follow from this. If a proposal repeats
the same operation with the same arguments, it produces duplicate
`bound_operations` entries, which are kept and not merged. Number handling,
including `-0`, follows the repo's canonical encoding (`canonicalize` maps
`-0` to `0`); O1 adds no rules of its own.

## Validator scope: internal consistency only

`validateOperationProposalBinding` checks only that a binding document is
internally consistent. It checks the closed keys, hard zeros, enums, the
status and cardinality rules, canonical order and that `binding_digest`
recomputes. It cannot tell whether the digests inside were ever recomputed from
real inputs. A hand-built `bound` document with a recomputed `binding_digest`
passes it. Consumers must re-run `verifyOperationProposalBinding` on the
original inputs and never trust a binding document on its own.

## Candidate-set projections (P3)

Operation Candidate Selection hashes
`{operation_id, manifest_digest, eligible, eligibility_reason, deterministic_match}`.
The proposal hashes `{operation_id, eligible, eligibility_reason}`. The two
digests are different projections and are never compared directly. O1 connects
them by recomputing the selection and then deriving the proposal-space digest
from the same trusted candidates. `manifest_digest` is covered by check (a).

## Failure-path proposal_id

The O0 failure-path `proposal_id` now includes `provider` in its preimage, so
failure proposals from two providers no longer collide. The pinned failure
fixture digests in `mesh/test/operation-proposal-binding.test.mjs` were
updated in the same change. No earlier test pinned a failure-path digest.

## Tests

- `mesh/test/operation-proposal-binding.test.mjs`: one GREEN path, RED 1-16
  from the O1 task, and assertions showing the O0 (P1/P2) path accepting each
  negative where applicable
- `mesh/test/operation-proposal-binding-schema.test.mjs`
- `mesh/test/operation-proposal-binding-boundary-static.test.mjs`

## Non-claims

O1 grants no authority, assurance, currentness, execution, network, spend,
consent, approval or runtime activation, and it evaluates no authorization. A
binding document is not a credential: only a fresh `verifyOperationProposalBinding`
run over the original inputs is evidence. It does not claim Needle is
integrated or calibrated. It does not
promote any capability.

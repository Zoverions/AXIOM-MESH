# AXIOM Semantic Operation Proposal v0

**Status:** inert researcher enrichment / O0  
**Version:** v0  
**Authority:** none  
**Issue:** #1628

## Purpose and boundary

Semantic Operation Proposal v0 is the smallest provider-neutral contract that lets
a local or remote semantic engine propose one or more deterministic operation IDs
plus typed arguments **without creating authority, assurance, currentness,
execution rights, or runtime activation**.

Provider output is data/evidence about likely intent. It is not permission.

The supported privileged-effect authority sequence remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

This contract does not sit inside that sequence, bypass it, or grant permission
to enter it.

> **Semantic judgment is not authority.**

## Composition target

```text
Knowledge / current component guidance
  -> machine-readable operation manifest
  -> deterministic candidate eligibility/filtering
  -> semantic operation proposal provider
  -> schema/currentness validation
  -> AXIOM intent
  -> Gateway -> Hypervisor -> Sandbox -> Grid
```

O0 composes with External Operation Offer and Operation Candidate Selection
**by digest only**. It does not merge spend, eligibility, or ranking logic into
this module.

## Contract identity

- Schema name: `axiom-semantic-operation-proposal.v0`
- Wire schema: [`contracts/semantic-operation-proposal.v0.schema.json`](contracts/semantic-operation-proposal.v0.schema.json)
- Validator: `mesh/src/lib/semantic-operation-proposal.mjs`

Hard zeros (all proposals):

- `authority_effect: none`
- `assurance_effect: none`
- `currentness_effect: none`
- `execution_effect: none`
- `runtime_activation: false`
- `network_effect: none`
- `selection_effect: proposal-only`

Size and nesting bounds:

- The serialized document is at most 65,536 bytes.
- The whole document nests at most 1,400 container levels, counted from the
  document root (`SEMANTIC_OPERATION_PROPOSAL_MAX_DEPTH`, equal to
  `CANONICAL_JSON_MAX_CONTRACT_DEPTH` in `mesh/src/lib/canonical.mjs`).
  Free-form argument values are where this bites: the byte limit alone would
  allow about 32,768 levels, canonical JSON accepts at most 2,048, and the
  validator's `structuredClone` argument copy overflows the native stack
  earlier on some platforms (1,833 levels on Windows CI, Node 24). The bound
  sits about 24% below that lowest measured value, and the validator rejects
  deeper documents with a `ValidationError` before any digest or copy runs.
  JSON Schema cannot express a depth limit, so the wire schema states it in a
  `$comment`. Earlier releases sometimes accepted deeper arguments, but only up
  to wherever the stack ran out (about 2,900–3,290 levels on Linux at Node's
  default stack size, about 1,830 on Windows, about 1,160–1,250 at
  `--stack-size=400`), so that was never a guarantee.

## Needle ≠ Decision Observation

Needle-shaped payloads (`function_calls`, `suppressed_calls`, scalar
`confidence`) are first-class proposal evidence for the Operation plane.

They must **not** be forced into `#1588` Bounded Decision Intelligence
probability observations. O0 never fabricates a full distribution, `p_true`, or
choice/score answer from Needle confidence.

Related boundary preservation: #1627.

## Eligibility ordering

Where operation consequence requires it, semantic engines receive only the
deterministically eligible candidate set (`candidate_mode: eligible-only`).
A model may rank or select among candidates; it cannot restore a candidate
removed for policy, currentness, locality, disclosure, capability, or other hard
constraints.

Descriptive discovery may use a wider inert candidate set only when no effect is
reachable; the mode is explicit on the proposal.

## O0 surface (network-free)

- closed schema + validator
- deterministic inert operation-candidate fixture (3–6 operation IDs)
- generic provider-result normalization
- Needle-shaped payload fixture/normalization
- hostile falsification tests from #1628
- digest-only composition helpers for Offer / selection

## O1: Operation Proposal Binding

O1 adds [Operation Proposal Binding v0](OPERATION-PROPOSAL-BINDING.md)
(`axiom-operation-proposal-binding.v0`). It is a pure verifier that recomputes
the manifest digest, the candidate selection, the proposal-space candidate set
digest and every supplied offer digest from the caller's original objects.
It binds a proposal only when all of them agree. It fixes these O0 gaps:

- P1: O0 only format-checks `manifest.manifest_digest`; O1 recomputes it.
- P2: the compose helpers only format-check digests; O1 recomputes them.
- P3: the selection and proposal candidate digests use different projections;
  O1 derives the proposal-space digest from the trusted selection candidates.
- `descriptive-discovery` skips eligibility in O0; O1 never binds it.
- The failure-path `proposal_id` now includes the provider in its preimage.

**Deprecated (docs only, behaviour unchanged):** `composeProposalWithOfferDigest`
and `composeProposalWithSelectionDigest` check only the format of the digest
they are given. Use `verifyOperationProposalBinding` instead.

## Out of O0

Package install, weights, live provider invocation, Gateway route, Grid
mutation, capability promotion, credentials, Monid, and O1–O4 follow-ons.

## Non-claims

This document does not claim Needle is integrated, calibrated, trusted,
production-ready, or superior to Jev/general models. It does not change
Jev-first policy for genuine `#1588` bounded decisions. It creates no operation,
capability, credential, disclosure, execution, merge, deployment, or production
authority.

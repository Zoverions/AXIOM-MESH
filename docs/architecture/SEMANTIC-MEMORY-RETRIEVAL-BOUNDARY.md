# Semantic Memory Retrieval Authority Boundary

Status: supported boundary for the semantic-memory library in
`mesh/src/lib/semantic-memory-provenance.mjs`,
`mesh/src/lib/semantic-memory-lifecycle.mjs`,
`mesh/src/lib/semantic-memory-grid-evidence.mjs` and
`mesh/src/grid/semantic-memory-review-evidence.mjs`. This document records a
Chief of Staff decision and the evidence behind it. It does not change any
retrieval semantics.

## Purpose and boundary

Semantic-memory retrieval is a Knowledge path. **Retrieval allow is content, never authority.**
A retrieval result says that a record may be read as content. It never says
that the record may instruct an agent, hold tool or capability authority, gain
privilege, write anything, or escalate.

`evaluateSemanticMemoryUse(record, 'ordinary-retrieval')` and
`evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'ordinary-retrieval')`
return:

```
{ allow: true, code: 'semantic_memory_retrieval_allowed', authority_tier, provenance_digest }
```

with `lifecycle_digest` added by the lifecycle function. The `authority_tier`
is the record's own claim. Retrieval performs no Grid check, so a fully
forged record is returned with `allow: true` and whatever tier it claims,
including `owner-approved-instruction`. This is intended: the retrieval path
only decides whether a record may be shown as content. Quarantined and
rejected records are still denied.

## What must never feed an authority decision

A claimed review field coming out of retrieval must never feed an authority decision.
That covers all of the following, whether they appear on the retrieved record
or on the retrieval result:

- `allow` and `code` from an `ordinary-retrieval` result;
- `authority_tier`, `review_state`, `review_decision` and `review_actor`;
- `review_request_digest`, `reviewed_from_provenance_digest` and
  `provenance_digest`;
- `semantic_class: 'instruction-candidate'` and any other instruction-related
  field;
- a lifecycle record (`lifecycle_digest`, `retention_mode`, ...). A lifecycle
  is retention metadata, not review evidence.

`ownerReviewSemanticMemory` is not authenticated. Anyone holding a record can
produce a reviewed-looking record with self-consistent digests, so a record
that looks reviewed is a claim, not a review.

## The Grid-verified path

The only authority-bearing outcome in the semantic-memory library is
`semantic_memory_instruction_allowed`, returned for `privileged-instruction`.
It requires `verified_review_request_digest`, and that value must come from
`verifySemanticMemoryReviewFromGrid(store, record)`. That function finds the
completed `memory.semantic.review` intent for the record's exact review request
in the store's verified evidence chain. It also requires the record's own
pre-review provenance to reproduce the reviewed-from digest (#1937). Any
authority decision about a semantic memory record goes through
`verifySemanticMemoryReviewFromGrid` and then
`evaluateSemanticMemoryLifecycleUse` (or `evaluateSemanticMemoryUse`) with the
digest it returned.

`authority-mutation` is always denied.

Two inputs are trusted by contract, so they are listed here explicitly:

- `verified_review_request_digest` is taken as given. Passing the record's own
  `review_request_digest`, or any value from a retrieval result, is exactly
  the forbidden use described above.
- `verifySemanticMemoryGridEvidence(record, { intent, events, chain })` checks
  that the rows it is handed are consistent with the review. It does not read
  the Grid. Rows a caller builds from the record itself pass, so its output is
  Grid evidence only when the rows came from `GridStore`, which is what
  `verifySemanticMemoryReviewFromGrid` does.

## Consumer audit

The audit of every src tree in the repository (`mesh/src` and
`labs/rust-trust-core/src`) found no consumer outside the four semantic-memory
modules. In particular:

- no consumer reads retrieval output to grant anything;
- `evaluateSemanticMemoryLifecycleUse` only forwards the caller's verified
  digest;
- `verifySemanticMemoryReviewFromGrid` is the only src caller of
  `verifySemanticMemoryGridEvidence`, and it passes rows read from the store.

The `context-semantic-*` modules are a separate subsystem with their own trust
records. They do not import the semantic-memory modules.

## Regression coverage

`mesh/test/semantic-memory-retrieval-authority-boundary.test.mjs` pins this
boundary:

- **Export discovery.** It finds every exported function of every
  `mesh/src/**/semantic-memory-*.mjs` module at run time, so a new export is
  probed automatically.
- **Forged records.** Each export is driven with fully forged records:
  self-asserted owner review, hand-forged review digests bound to a decoy
  origin, and a record that reuses a genuine Grid review of a different
  origin. The other arguments come from those records, their retrieval
  results, lifecycles, and Grid stores that hold no review of them. Outputs
  are fed back in a second round.
- **No grant.** No call may produce `semantic_memory_instruction_allowed`, an
  `allow: true` other than content retrieval, verified Grid evidence, or
  `downstream_effect_authorized: true`.
- **Prototype pollution.** The same sweep runs with the forged review claims
  and grant markers placed on `Object.prototype`, and every pollution is
  restored in `finally`. The inherited-options case (`verified_review_request_digest`
  and `now` on `Object.prototype`) runs unconditionally; the lifecycle
  own-reads change (#1940) is what closes it.
- **Consumer allowlist.** A static scan of every `src` tree fails when a new
  module imports the semantic-memory modules, supplies
  `verified_review_request_digest`, or calls `verifySemanticMemoryGridEvidence`.
  Such a change must be audited against this document first.

## Non-claims

- Retrieval semantics are unchanged: `ordinary-retrieval` still returns
  `allow: true` with the claimed tier for any record that normalizes and is
  not quarantined or rejected.
- This boundary does not authenticate records. It only fixes which path may
  turn a record into authority.
- `verifySemanticMemoryGridEvidence` is not a Grid check on its own.

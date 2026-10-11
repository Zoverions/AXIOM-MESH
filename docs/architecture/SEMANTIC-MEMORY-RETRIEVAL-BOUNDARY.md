# Semantic Memory Retrieval Authority Boundary

Status: supported boundary for the semantic-memory library in
`mesh/src/lib/semantic-memory-provenance.mjs`,
`mesh/src/lib/semantic-memory-lifecycle.mjs`,
`mesh/src/lib/semantic-memory-grid-evidence.mjs` and
`mesh/src/grid/semantic-memory-review-evidence.mjs`. This document records a
Chief of Staff decision and the evidence behind it. It does not change any
retrieval semantics. It does define, deny-only, what counts as the Grid
evidence that the privileged-instruction path requires.

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
It requires the `verified_review_evidence` option: the evidence object that
`verifySemanticMemoryReviewFromGrid(store, record)` returned for that same
record. That function finds the completed `memory.semantic.review` intent for
the record's exact review request in the store's verified evidence chain. It
also requires the record's own pre-review provenance to reproduce the
reviewed-from digest (#1937). Any authority decision about a semantic memory
record goes through `verifySemanticMemoryReviewFromGrid` and then
`evaluateSemanticMemoryLifecycleUse` (or `evaluateSemanticMemoryUse`) with
`{ verified_review_evidence: evidence }`:

```
const evidence = verifySemanticMemoryReviewFromGrid(store, record);
evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'privileged-instruction', {
  verified_review_evidence: evidence
});
```

`authority-mutation` is always denied.

### Evidence, not a digest

The evaluate functions used to take a bare `verified_review_request_digest`
string. That string equals the record's own `review_request_digest`, which
anyone can compute from the record, so a forged self-asserted record plus its
own digest was granted with no Grid review at all. The option is removed. For
`privileged-instruction`:

- **Only genuine evidence counts.** `verified_review_evidence` is recognised
  only by the evidence's private brand (`isSemanticMemoryGridEvidence`), never
  by its shape. A string (including the record's own digest), a hand-built,
  copied, spread, structured-cloned, `Object.create`-wrapped or Proxy-wrapped
  object, `null` or any other non-evidence value throws a `ValidationError`
  with `details.code` `semantic_memory_review_evidence_required`.
- **The removed option throws.** A `verified_review_request_digest` option,
  alone or next to genuine evidence, throws the same `ValidationError`, so an
  old string caller fails loudly instead of being silently downgraded. The new
  name is deliberately different: an option called `..._digest` that requires
  an object would be ambiguous.
- **Bound to the record.** At mint time the evidence's private brand records
  the verified record's `owner`, `object_id`, `content_digest`,
  `review_request_digest` and `review_decision` (readable, frozen, through
  `semanticMemoryGridEvidenceBinding(evidence)`). All five must equal the
  evaluated record's; otherwise the result is
  `{ allow: false, code: 'semantic_memory_review_evidence_mismatch' }`. Evidence
  for record A therefore never verifies record B, and evidence for an
  `approve-memory` review never verifies an `approve-instruction` record.
- **The owner is not in the request digest.** The five binding fields are not
  all covered by `review_request_digest`. For a human principal
  `intentRequestBinding` (`mesh/src/lib/intent-binding.mjs`) keeps only
  `action`, `input`, `purpose` and `data_scopes` and drops `principal.id`, and
  the review input carries `object_id`, `content_digest`, the claimed
  pre-review provenance digest and the decision, not the owner. A record that
  differs from a genuinely reviewed record only in `owner` (and `review_actor`)
  therefore has the same `review_request_digest`. The owner is bound in two
  places only: the evidence binding's `owner` clause, checked first, which
  returns `semantic_memory_review_evidence_mismatch`; and the #1937 pre-review
  check, which recomputes the pre-review provenance digest (owner included)
  from the record's own fields and returns
  `semantic_memory_review_provenance_mismatch`.
  `mesh/test/semantic-memory-evidence-owner-binding.test.mjs` pins the first on
  both evaluate paths.
- **No evidence** still returns
  `{ allow: false, code: 'semantic_memory_review_evidence_unverified' }`.
- **Own reads and deny dominance (#1938/#1940)** apply to both option names:
  an inherited `verified_review_evidence` (genuine or not) reads as absent, and
  an inherited value that would deny as an own value (non-evidence, or the
  removed digest option) raises that same deny.
- `ordinary-retrieval` and `authority-mutation` ignore both options.

The `store` passed to `verifySemanticMemoryReviewFromGrid` is trusted by
contract, so it is listed here explicitly:

- The `store` passed to `verifySemanticMemoryReviewFromGrid` is the trust
  root: the function proves what that store holds, not which store the caller
  chose. `GridStore` opens its own `DatabaseSync` from `options.path` (it never
  accepts a database object), so a caller-supplied file is trusted only as far
  as the evidence-chain verification goes, together with the `dataDir`,
  `identity` and `protector` the store was constructed with.

### Trust boundary: in-process code is trusted (CoS decision)

This is a Chief of Staff decision. In-process code is trusted, and the store
is the trust root. "Unforgeable" means that evidence can only be minted by
`verifySemanticMemoryReviewFromGrid` reading a completed review from a genuine
`GridStore`. It does not mean that in-process code cannot obtain evidence for a
record it made up. Any in-process caller can open its own `GridStore`, append
a completed owner review of a forged record, and mint genuine evidence for that
record. That is the documented trust boundary, not a defect: the boundary
protects against data (records, retrieval results, digest strings, copied or
hand-built evidence, prototype pollution), not against code running in the
same process with access to a store.

Known residuals, tracked on #1918
(https://github.com/Zoverions/AXIOM-MESH/issues/1918#issuecomment-6105608155):

- Evidence is reusable for its own record. It is bound to one record, not to a
  caller, a time or a single use.
- Later Grid events do not revoke evidence that has already been minted. The
  review is not re-read at evaluate time.

### Store-bound, unforgeable Grid evidence

No export accepts Grid rows. The row checker that binds the intent row, the
accepted and completed events and the chain summary to the exact review
(formerly the exported `verifySemanticMemoryGridEvidence`) does not read the
Grid, and rows a caller builds from the record itself pass it. It is
therefore a non-exported function inside
`mesh/src/grid/semantic-memory-review-evidence.mjs`, reachable only through
`verifySemanticMemoryReviewFromGrid`, which reads the rows from the store.

- **Store genuineness** comes only from `GridStore`'s private `#brand`
  (`#brand in store`, exposed as `GridStore.isGridStore`), never from
  `instanceof`, the prototype or the object's shape. A store-shaped object,
  `Object.create(GridStore.prototype)` and a Proxy around a real store (private
  names do not pass through a Proxy) are rejected with a `ValidationError`.
  Instances of every repository store class (all extend `GridStore`, including
  the server's `AcceptedSocialGridStore`) carry the brand.
- **Reads captured at load.** The adapter captures `Reflect.apply`, the
  `GridStore` methods it uses (`requireIntentEvidenceChain`, `getIntent`,
  `decodeEventRow`, `GridStore.isGridStore`, `GridStore.openedDatabase`) and
  `DatabaseSync.prototype.prepare` / `StatementSync.prototype.all` when it
  loads, and calls them only through the captured `Reflect.apply`. It queries
  the database the store opened, read from the private `#db` field, never the
  public `db` property. A branded store with an own property shadowing any
  inherited method or accessor (an instance method swap), or whose public `db`
  is no longer the database it opened, is rejected with a `ValidationError`.
- **Frozen at load.** When the adapter loads it freezes the `GridStore` class
  chain (`GridStore` and its base classes), the evidence brand classes and the
  `node:sqlite` `DatabaseSync` / `StatementSync` classes together with their
  prototypes. A later method swap on those prototypes throws, and
  `Object.setPrototypeOf(GridStore, ...)` (the "super returns an arbitrary
  object" route to stamping a private brand) throws.
- **Evidence** is a frozen plain object stamped with a private `#binding` by an
  unexported class; the mint and the check live only in the adapter file.
  `isSemanticMemoryGridEvidence(value)` is true only for that exact object.
  `semanticMemoryGridEvidenceBinding(evidence)` returns the frozen record
  binding and `semanticMemoryGridEvidenceDigest(evidence)` the verified review
  request digest, both from the brand, never from the object's fields; both
  throw a `ValidationError` for a hand-built, copied, spread,
  structured-cloned, `Object.create`-wrapped or Proxy-wrapped object. None of
  them can create evidence. Pass the evidence object itself as
  `verified_review_evidence`; the digest is informational only.

## Consumer audit

The audit of every src tree in the repository (`mesh/src` and
`labs/rust-trust-core/src`) found no consumer outside the four semantic-memory
modules. In particular:

- no consumer reads retrieval output to grant anything;
- `evaluateSemanticMemoryLifecycleUse` only forwards the caller's verified
  evidence (and the removed digest option, so it throws) to the
  `evaluateSemanticMemoryUse` core;
- `semantic-memory-provenance.mjs` imports only the evidence checkers
  (`isSemanticMemoryGridEvidence`, `semanticMemoryGridEvidenceBinding`) from the
  Grid adapter; it cannot mint evidence;
- `verifySemanticMemoryReviewFromGrid` is the only caller of the internal
  Grid row checker, and it passes rows read from the store.

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
  `downstream_effect_authorized: true`. The candidate options include digest
  strings under both option names and the genuine evidence of a different,
  genuinely reviewed record (replay).
- **Prototype pollution.** The same sweep runs with the forged review claims
  and grant markers placed on `Object.prototype`, and every pollution is
  restored in `finally`. The inherited-options cases (`verified_review_request_digest`
  and `now`, and separately genuine evidence as `verified_review_evidence`, on
  `Object.prototype`) run unconditionally; the lifecycle own-reads change
  (#1940) is what closes them.
- **Evidence required.**
  `mesh/test/semantic-memory-evaluate-requires-grid-evidence.test.mjs` requires,
  on both evaluate paths: a `ValidationError` for a forged self-asserted record
  plus its own digest string, for a genuinely reviewed record's digest string
  without the evidence object, and for hand-built, copied, Proxy-wrapped or
  `Object.create`'d evidence; `semantic_memory_review_evidence_mismatch` for
  evidence replayed from another record (other object, content, owner or
  origin) or from an `approve-memory` review; a deny for evidence reachable
  only through an inherited option; and an unchanged grant for every genuine
  `GridStore` flow (including the server's store class and bounded
  lifecycles).
- **Owner binding.**
  `mesh/test/semantic-memory-evidence-owner-binding.test.mjs` changes only
  `owner` and `review_actor` on a genuinely reviewed record, presents the
  original's genuine evidence, and requires an unchanged
  `review_request_digest` and `semantic_memory_review_evidence_mismatch` on
  both evaluate paths. Without the evidence owner clause the result would be
  the #1937 `semantic_memory_review_provenance_mismatch`, so the test fails.
- **Store-bound Grid evidence.**
  `mesh/test/semantic-memory-grid-evidence-store-bound.test.mjs` fabricates
  Grid rows from a forged record alone and requires a `ValidationError` deny
  and no `semantic_memory_instruction_allowed` for: a store built via
  `Object.create(GridStore.prototype)`, a Proxy over a real store, an instance
  method or `db` swap on a genuine store, a `GridStore.prototype` or
  `node:sqlite` method swap after load, re-parenting the store classes, patched
  `WeakSet`/`WeakMap.prototype.has`, a post-load `Function.prototype.call` /
  `apply` patch, hand-built evidence and mutated or re-wrapped evidence. It
  also calls every export of every semantic-memory and `mesh/src/grid` module
  and requires that none mints or registers evidence, and that genuine reviews
  (including on the server's store class) verify and grant exactly as before.
- **Consumer allowlist.** A static scan of every `src` tree fails when a new
  module imports the semantic-memory modules, supplies
  `verified_review_evidence` or names the removed
  `verified_review_request_digest`, or calls the Grid row checker
  (`verifySemanticMemoryGridEvidence`, now internal to the Grid adapter).
  Such a change must be audited against this document first.

## Non-claims

- Retrieval semantics are unchanged: `ordinary-retrieval` still returns
  `allow: true` with the claimed tier for any record that normalizes and is
  not quarantined or rejected.
- This boundary does not authenticate records. It only fixes which path may
  turn a record into authority.
- The internal Grid row checker is not a Grid check on its own, which is why
  it is not exported.
- A caller that constructs or controls the store it passes (its file,
  `dataDir`, identity or protector) is outside this boundary; anyone holding a
  `GridStore` can append signed events to it.
- Built-ins patched before the adapter module loads are out of scope.
  Subclass prototypes of `GridStore` (the repository's other store classes)
  are not frozen by the adapter; the captured `GridStore` methods are called
  directly, but their internal `this` dispatch on a subclass instance still
  goes through the subclass's own overrides.
- Evidence is bound to the record it was minted for, not to a caller, a time
  or a single use: whoever holds genuine evidence for a record can reuse it
  for that record until the record changes. The Grid review it reflects is
  not re-read at evaluate time (a later Grid event does not revoke evidence
  already minted).

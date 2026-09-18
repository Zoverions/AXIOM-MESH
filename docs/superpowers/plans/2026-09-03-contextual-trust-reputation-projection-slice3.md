# Contextual Trust and Reputation Projection — Slice 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement exact-purpose, evidence-backed contextual reputation queries and privacy-minimized signed presentations without creating a universal reputation score, transferring reputation, or minting execution authority.

**Architecture:** Reuse the merged Slice 1 semantic contracts and Slice 2 governed SIEA Grid state. Reputation evaluation consumes only SIEA objects retrieved through exact verified `InformationAccessDecision` reads, binds each evidence assertion to an `InformationRightsEnvelope` whose `subjects` include the queried principal and whose purpose policy permits the query, applies a local criterion evaluator, and produces a private signed derived claim. External presentation is a separately signed, audience- and purpose-bound projection that does not expose evidence identifiers by default and reuses `selectMinimumSufficientProjection()` rather than creating a second disclosure policy engine.

**Tech Stack:** Node.js ESM, `node:test`, existing canonical validators/digests, existing Ed25519 `MeshIdentity`/`verifyObjectSignature`, Slice 1 domain contracts, Slice 2 `SovereignInformationGridStore`, existing protected CI.

**Spec:** `docs/superpowers/specs/2026-09-03-sovereign-information-evidence-authority-design.md`

## Global Constraints

- Slice 3 MUST remain unpromoted: no Gateway route, no capability-registry change, no provider/network egress, and no regulated-data activation.
- `identity != authority`, `credential != authority`, `reputation != authority`, `risk != prohibition`, and `provenance != truth` remain executable invariants.
- Reputation MUST remain domain-specific. No schema or evaluator may emit a universal person/entity score, rank, percentile, or cross-domain composite.
- A presentation MUST bind exact subject, domain, purpose, criterion, requester/audience, issue time, and expiry.
- Reputation is non-transferable. Delegation, representation, sponsorship, or agent ownership MUST NOT substitute another principal as the reputation subject.
- Evidence about a queried subject MUST be bound through an `InformationRightsEnvelope`; free-form proposition text MUST NOT be parsed to infer subject identity.
- Evidence use MUST satisfy exact-purpose policy. Requested data does not become justified data merely because a verifier asks for it.
- Challenged, disputed, stale, unavailable, incompletely reviewed, or otherwise unresolved evidence MUST remain visible to the private evaluation and MUST NOT be silently promoted into a clean positive claim.
- Negative/absence claims such as “no current violation exists” MUST NOT be emitted as established `not-met` results without separately verified criterion-completeness evidence.
- The default external presentation MUST reveal the criterion result only. Evidence IDs, source IDs, relationship history, stable cross-domain identifiers, and private derived-claim digests remain local by default.
- Initial cryptography is ordinary Ed25519 attribution. Slice 3 MUST NOT claim zero-knowledge, anonymous-credential, unlinkable-presentation, or advanced selective-disclosure cryptography.
- Slice 3 MUST NOT duplicate or depend on still-open PR #1437 (`interop/data-residency-selective-disclosure`), #1409 (adaptive assurance/reputation signals), or #1438 (compositional assurance vectors). Interoperation is by stable existing boundaries only.
- Core Grid schema 10 and SIEA extension schema 1 remain unchanged. Slice 3 adds no database migration.

---

## File Structure

### Create

- `mesh/src/domain/reputation-query.mjs` — strict exact-purpose query contract.
- `mesh/src/domain/derived-reputation-claim.mjs` — private derived claim and Ed25519 envelope validation/signing.
- `mesh/src/domain/contextual-reputation.mjs` — subject/purpose/review/currentness binding plus criterion-result normalization.
- `mesh/src/domain/reputation-presentation.mjs` — minimum-sufficient projection and audience-bound signed presentation.
- `mesh/src/lib/contextual-trust-projector.mjs` — composition layer that retrieves only exact-authorized SIEA objects and runs the end-to-end flow.
- `mesh/test/reputation-query.test.mjs`
- `mesh/test/derived-reputation-claim.test.mjs`
- `mesh/test/contextual-reputation.test.mjs`
- `mesh/test/reputation-presentation.test.mjs`
- `mesh/test/contextual-trust-projector.test.mjs`
- `mesh/test/contextual-reputation-invariants.test.mjs`

### Modify

- `docs/rebuild/REQUIREMENTS.md` — add Slice 3 normative requirements.
- `mesh/src/check-docs.mjs` — register this plan and required Slice 3 requirement markers.

### Must remain byte-identical to Slice 2 / current `main`

- `mesh/config/capabilities.json`
- `mesh/src/gateway/contract.mjs`
- `mesh/src/grid/migrations.mjs`
- `mesh/src/grid/sovereign-information-migrations.mjs`
- current supported Grid-server/runtime-composition entrypoint(s)

---

### Task 1: Exact-purpose reputation query contract

**Files:**
- Create: `mesh/src/domain/reputation-query.mjs`
- Test: `mesh/test/reputation-query.test.mjs`

**Interfaces:**
- Produces: `REPUTATION_QUERY_SCHEMA`, `REPUTATION_PRESENTATION_LEVELS`, `REPUTATION_REVIEW_FLOORS`, `validateReputationQuery(query)`.
- Later tasks consume the normalized query unchanged; validation returns the input object after strict checks, matching Slice 1 conventions.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPUTATION_QUERY_SCHEMA,
  validateReputationQuery
} from '../src/domain/reputation-query.mjs';

function fixture(overrides = {}) {
  return {
    schema: REPUTATION_QUERY_SCHEMA,
    query_id: 'repq:security-review-1',
    requester: 'principal:verifier',
    subject_ref: 'principal:subject',
    domain: 'software-security',
    purpose: 'vendor-security-review',
    criterion_ref: 'criterion:verified-findings-v1',
    evidence_window: {
      starts_at: '2026-08-01T00:00:00.000Z',
      ends_at: '2026-09-03T00:00:00.000Z'
    },
    minimum_review_state: 'integrity-verified',
    requested_presentation: 'criterion-only',
    max_claim_ttl_seconds: 3600,
    verifier_policy_ref: 'policy:vendor-security-v1',
    created_at: '2026-09-03T00:00:00.000Z',
    expires_at: '2026-09-03T01:00:00.000Z',
    ...overrides
  };
}

test('reputation query is exact-purpose and has no score surface', () => {
  assert.equal(validateReputationQuery(fixture()).domain, 'software-security');
  assert.throws(() => validateReputationQuery({ ...fixture(), score: 97 }), /unsupported fields/);
  assert.throws(() => validateReputationQuery({ ...fixture(), rank: 1 }), /unsupported fields/);
  assert.throws(() => validateReputationQuery({ ...fixture(), percentile: 99 }), /unsupported fields/);
});

test('query time and evidence windows are ordered and bounded', () => {
  assert.throws(() => validateReputationQuery(fixture({
    expires_at: '2026-09-02T23:59:59.000Z'
  })), /expires_at must follow created_at/);
  assert.throws(() => validateReputationQuery(fixture({
    evidence_window: {
      starts_at: '2026-09-03T00:00:00.000Z',
      ends_at: '2026-08-01T00:00:00.000Z'
    }
  })), /evidence_window.ends_at must follow/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test mesh/test/reputation-query.test.mjs
```

Expected: FAIL because `mesh/src/domain/reputation-query.mjs` does not exist.

- [ ] **Step 3: Implement the strict contract**

```js
import { ValidationError, assertPlainObject, assertString } from '../lib/canonical.mjs';
import {
  assertAuthorityNeutral,
  assertEnum,
  assertIsoTimestamp,
  assertNoUnknownKeys,
  assertReference
} from './sovereign-information-common.mjs';

export const REPUTATION_QUERY_SCHEMA = 'axiom-reputation-query.v1';
export const REPUTATION_PRESENTATION_LEVELS = new Set(['criterion-only', 'bounded-summary']);
export const REPUTATION_REVIEW_FLOORS = new Set([
  'integrity-verified', 'machine-reviewed', 'human-reviewed', 'adjudicated'
]);

const DOMAIN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ROOT_KEYS = new Set([
  'schema','query_id','requester','subject_ref','domain','purpose','criterion_ref',
  'evidence_window','minimum_review_state','requested_presentation',
  'max_claim_ttl_seconds','verifier_policy_ref','created_at','expires_at'
]);
const WINDOW_KEYS = new Set(['starts_at','ends_at']);

export function validateReputationQuery(query) {
  assertAuthorityNeutral(query, 'reputation query');
  assertPlainObject(query, 'reputation query');
  assertNoUnknownKeys(query, 'reputation query', ROOT_KEYS);
  if (query.schema !== REPUTATION_QUERY_SCHEMA) throw new ValidationError('reputation query has unsupported schema');
  assertReference(query.query_id, 'query_id');
  assertReference(query.requester, 'requester');
  assertReference(query.subject_ref, 'subject_ref');
  assertString(query.domain, 'domain', { min: 1, max: 64, pattern: DOMAIN });
  assertString(query.purpose, 'purpose', { min: 1, max: 256 });
  assertReference(query.criterion_ref, 'criterion_ref');
  assertPlainObject(query.evidence_window, 'evidence_window');
  assertNoUnknownKeys(query.evidence_window, 'evidence_window', WINDOW_KEYS);
  assertIsoTimestamp(query.evidence_window.starts_at, 'evidence_window.starts_at');
  assertIsoTimestamp(query.evidence_window.ends_at, 'evidence_window.ends_at');
  if (Date.parse(query.evidence_window.ends_at) <= Date.parse(query.evidence_window.starts_at)) {
    throw new ValidationError('evidence_window.ends_at must follow evidence_window.starts_at');
  }
  assertEnum(query.minimum_review_state, 'minimum_review_state', REPUTATION_REVIEW_FLOORS);
  assertEnum(query.requested_presentation, 'requested_presentation', REPUTATION_PRESENTATION_LEVELS);
  if (!Number.isInteger(query.max_claim_ttl_seconds) || query.max_claim_ttl_seconds < 1 || query.max_claim_ttl_seconds > 2_592_000) {
    throw new ValidationError('max_claim_ttl_seconds must be an integer from 1 to 2592000');
  }
  assertReference(query.verifier_policy_ref, 'verifier_policy_ref');
  assertIsoTimestamp(query.created_at, 'created_at');
  assertIsoTimestamp(query.expires_at, 'expires_at');
  if (Date.parse(query.expires_at) <= Date.parse(query.created_at)) {
    throw new ValidationError('expires_at must follow created_at');
  }
  return query;
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
node --test mesh/test/reputation-query.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/domain/reputation-query.mjs mesh/test/reputation-query.test.mjs
git commit -m "feat: add exact-purpose reputation queries"
```

---

### Task 2: Private derived reputation claim and Ed25519 attribution

**Files:**
- Create: `mesh/src/domain/derived-reputation-claim.mjs`
- Test: `mesh/test/derived-reputation-claim.test.mjs`

**Interfaces:**
- Produces `DERIVED_REPUTATION_CLAIM_SCHEMA`, `DERIVED_REPUTATION_CLAIM_ENVELOPE_SCHEMA`.
- Produces `validateDerivedReputationClaim(claim)`, `signDerivedReputationClaim({ claim, signer })`, `verifyDerivedReputationClaimEnvelope({ envelope, publicKey, now })`.
- Claim results are `met|not-demonstrated|not-met|unresolved`; `not-met` is reserved for separately verified complete evidence.

- [ ] **Step 1: Write failing tests for non-authority, non-transfer, signatures, and currentness**

```js
const claim = {
  schema: DERIVED_REPUTATION_CLAIM_SCHEMA,
  claim_id: 'repclaim:1',
  query_id: 'repq:security-review-1',
  subject_ref: 'principal:subject',
  domain: 'software-security',
  purpose: 'vendor-security-review',
  criterion_ref: 'criterion:verified-findings-v1',
  result: 'met',
  evidence_set_digest: 'a'.repeat(64),
  considered_evidence_refs: ['evidence:a'],
  supporting_evidence_refs: ['evidence:a'],
  contrary_evidence_refs: [],
  challenge_refs: [],
  correction_refs: [],
  access_decision_digests: ['b'.repeat(64)],
  evaluator_ref: 'evaluator:criterion-v1',
  evaluated_at: '2026-09-03T00:10:00.000Z',
  valid_until: '2026-09-03T01:00:00.000Z',
  completeness: 'bounded-selected-evidence',
  authority_effect: 'none',
  reputation_transfer: 'none',
  truth_status: 'attributed-derived-claim'
};

assert.equal(validateDerivedReputationClaim(claim).authority_effect, 'none');
assert.throws(() => validateDerivedReputationClaim({ ...claim, score: 88 }), /unsupported fields/);
assert.throws(() => validateDerivedReputationClaim({ ...claim, reputation_transfer: 'delegate' }), /reputation_transfer/);
```

Create a test `MeshIdentity` from an ephemeral Ed25519 pair, sign the claim, verify the envelope, mutate `criterion_ref`, and prove signature verification fails.

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/derived-reputation-claim.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement claim normalization and envelope signing**

Use:

```js
import { ValidationError, assertPlainObject, assertString, digestObject } from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';
```

The claim validator MUST:

- reject unknown fields, including `score`, `rank`, `percentile`, `authority_granted`, and delegate/owner substitution fields;
- require exact subject/domain/purpose/criterion/query binding;
- require unique evidence refs and 64-hex digests;
- require `valid_until > evaluated_at`;
- require `authority_effect: 'none'`, `reputation_transfer: 'none'`, `truth_status: 'attributed-derived-claim'`;
- require `completeness` to be `bounded-selected-evidence|verified-complete-for-criterion`;
- permit `result: 'not-met'` only when completeness is `verified-complete-for-criterion`.

Signing MUST be:

```js
export function signDerivedReputationClaim({ claim, signer }) {
  const statement = validateDerivedReputationClaim(claim);
  if (!signer || typeof signer.signObject !== 'function' || typeof signer.keyId !== 'string') {
    throw new ValidationError('derived reputation claim signer is invalid');
  }
  return {
    schema: DERIVED_REPUTATION_CLAIM_ENVELOPE_SCHEMA,
    claim: statement,
    claim_digest: digestObject(statement),
    attestation: signer.signObject(statement)
  };
}
```

Verification MUST recompute the digest, verify Ed25519 attribution, reject future `evaluated_at`, and reject expired `valid_until` at the supplied `now`.

- [ ] **Step 4: Run GREEN**

```bash
node --test mesh/test/derived-reputation-claim.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/src/domain/derived-reputation-claim.mjs mesh/test/derived-reputation-claim.test.mjs
git commit -m "feat: add signed derived reputation claims"
```

---

### Task 3: Contextual evidence binding and criterion evaluation

**Files:**
- Create: `mesh/src/domain/contextual-reputation.mjs`
- Test: `mesh/test/contextual-reputation.test.mjs`

**Interfaces:**
- Consumes `validateReputationQuery`, `validateInformationRightsEnvelope`, `validateEvidenceAssertion`, `validateEvidenceLink`, `validateEvidenceReviewState`.
- Produces `evaluateContextualReputation({ query, objects, criterionEvaluator, completenessVerifier, accessDecisionDigests, now })` returning a validated private derived claim.
- `criterionEvaluator({ query, entries, links, now })` returns only:
  `result`, `supporting_assertion_refs`, `contrary_assertion_refs`, `neutral_assertion_refs`, `reason_codes`, `recommended_ttl_seconds`, `requires_complete_evidence`.

- [ ] **Step 1: Write RED tests for subject, purpose, review, challenge, stale evidence, and completeness**

Use a fixture containing:

- one `evidence-assertion` whose `purpose_scope` contains `reputation:software-security`;
- one `information-rights` envelope with the assertion ID as `object_ref`, `relationships.subjects = ['principal:subject']`, and `allowed_purposes = ['vendor-security-review']`;
- one `evidence-review` with `available`, `integrity_verified`, and the requested review floor true;
- optional `evidence-link` contradiction/challenge/correction relationships.

Required tests:

```js
assert.equal(evaluateContextualReputation(validInput).result, 'met');
assert.throws(() => evaluateContextualReputation(withWrongSubject), /subject binding/);
assert.throws(() => evaluateContextualReputation(withForbiddenPurpose), /purpose/);
```

Also prove:

- supporting evidence with `epistemic_state: 'disputed'` forces final `unresolved`;
- supporting evidence with `review.challenged === true` and `review.adjudicated === false` forces `unresolved`;
- a review older than the query’s evidence window or a future review cannot silently satisfy currentness;
- evaluator output containing `score`, `rank`, or unknown fields is rejected;
- evaluator `not-met` without verified completeness becomes `unresolved` with `criterion_completeness_unverified`;
- missing rights/review objects produce `unresolved` rather than a clean positive result;
- evidence outside `reputation:${query.domain}` cannot satisfy the query.

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/contextual-reputation.test.mjs
```

- [ ] **Step 3: Implement normalization and evaluation**

Build maps from `objects` by `object_kind`. For each candidate evidence assertion:

```js
const rights = rightsByRef.get(assertion.assertion_id);
const review = reviewByRef.get(assertion.assertion_id);
```

Require:

```js
rights.relationships.subjects.includes(query.subject_ref)
rights.allowed_purposes.includes(query.purpose)
!rights.forbidden_purposes.includes(query.purpose)
assertion.purpose_scope.includes(`reputation:${query.domain}`)
review.object_ref === assertion.assertion_id
```

Review-floor evaluation order:

```js
const REVIEW_FIELD = {
  'integrity-verified': 'integrity_verified',
  'machine-reviewed': 'machine_reviewed',
  'human-reviewed': 'human_reviewed',
  'adjudicated': 'adjudicated'
};
```

The function MUST compute a private canonical `evidence_set_digest` from the complete normalized local input, but external presentation MUST NOT expose that digest directly.

If structural uncertainty exists, return a derived claim with `result: 'unresolved'` and explicit reason codes; do not coerce unknown into `not-met`.

For complete/absence semantics:

```js
if (normalized.requires_complete_evidence) {
  const complete = completenessVerifier?.({ query, objects, now });
  if (!complete || complete.complete !== true) {
    finalResult = 'unresolved';
    reasons.add('criterion_completeness_unverified');
  } else {
    completeness = 'verified-complete-for-criterion';
  }
}
```

- [ ] **Step 4: Run GREEN**

```bash
node --test mesh/test/contextual-reputation.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/src/domain/contextual-reputation.mjs mesh/test/contextual-reputation.test.mjs
git commit -m "feat: evaluate contextual reputation from governed evidence"
```

---

### Task 4: Minimum-sufficient signed reputation presentation

**Files:**
- Create: `mesh/src/domain/reputation-presentation.mjs`
- Test: `mesh/test/reputation-presentation.test.mjs`

**Interfaces:**
- Consumes `selectMinimumSufficientProjection()` from Slice 1 and a valid signed derived claim.
- Produces `REPUTATION_PRESENTATION_SCHEMA`, `REPUTATION_PRESENTATION_ENVELOPE_SCHEMA`, `buildReputationPresentation(...)`, and `verifyReputationPresentationEnvelope(...)`.

- [ ] **Step 1: Write RED privacy and replay tests**

Prove the default `criterion-only` presentation contains:

- subject, domain, purpose, criterion, audience/requester, result;
- issue/expiry times;
- a per-presentation `basis_binding_digest`;
- no `evidence_refs`, source IDs, access-decision digests, private `evidence_set_digest`, client/task history, score, rank, or percentile.

Also prove:

- a broad `ContextualDisclosureRequest.requested_fields` cannot force raw history disclosure when projection policy allows only the criterion;
- `bounded-summary` may contain integer counts only when local policy explicitly permits it;
- presentation verification fails for wrong audience, wrong purpose, wrong subject, wrong criterion, expired presentation, or signature mutation;
- the same private claim presented to two distinct audiences gets different `basis_binding_digest` values.

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/reputation-presentation.test.mjs
```

- [ ] **Step 3: Implement projection and presentation**

Internally map a clean derived result to Slice 1 claim semantics:

```js
const availableClaim = {
  claim_id: claim.claim_id,
  predicate: claim.criterion_ref,
  value: claim.result === 'met',
  evidence_refs: claim.supporting_evidence_refs,
  derived_from_fields: []
};
```

Do not create an available boolean claim for `unresolved` or `not-demonstrated`; the existing projection engine must therefore return escalation/partial as appropriate.

The external statement MUST use a per-presentation binding:

```js
const basisBindingDigest = digestObject({
  private_claim_digest: envelope.claim_digest,
  presentation_id,
  audience_ref: query.requester,
  purpose: query.purpose
});
```

Do not include `private_claim_digest` itself in the external statement.

Default statement fields:

```js
{
  schema: REPUTATION_PRESENTATION_SCHEMA,
  presentation_id,
  query_id: query.query_id,
  disclosure_request_id: disclosureRequest.request_id,
  audience_ref: query.requester,
  subject_ref: query.subject_ref,
  domain: query.domain,
  purpose: query.purpose,
  criterion_ref: query.criterion_ref,
  result: claim.result,
  basis_binding_digest: basisBindingDigest,
  disclosure_level: 'criterion-only',
  summary: null,
  issued_at: now,
  valid_until,
  authority_effect: 'none',
  reputation_transfer: 'none',
  truth_status: 'attributed-derived-claim'
}
```

The signed envelope uses the existing signer interface and `verifyObjectSignature`.

- [ ] **Step 4: Run GREEN**

```bash
node --test mesh/test/reputation-presentation.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/src/domain/reputation-presentation.mjs mesh/test/reputation-presentation.test.mjs
git commit -m "feat: add privacy-minimized reputation presentations"
```

---

### Task 5: Store-backed contextual trust projector

**Files:**
- Create: `mesh/src/lib/contextual-trust-projector.mjs`
- Test: `mesh/test/contextual-trust-projector.test.mjs`

**Interfaces:**
- Consumes an initialized `SovereignInformationGridStore` or compatible subclass.
- Constructor:

```js
new ContextualTrustProjector({
  store,
  criterionEvaluators,
  claimSigner,
  presentationSigner,
  completenessVerifier = null
})
```

- Main method:

```js
project({
  query,
  disclosureRequest,
  projectionPolicy,
  accessDecisions,
  now
})
```

returns:

```js
{
  derived_claim_envelope,
  projection_result,
  presentation_envelope
}
```

- [ ] **Step 1: Write RED integration tests**

Build a temporary `SovereignInformationGridStore` with test mutation/access verifiers, record:

1. evidence assertion;
2. matching rights envelope;
3. matching review state;
4. optional links.

Produce exact `inspect-full-content` decisions for each object.

Tests MUST prove:

- the projector succeeds only with exact authorized decisions;
- omitting the rights-envelope decision cannot be bypassed by subject status;
- wrong purpose, requester, object digest, future-issued decision, or expired decision fails closed at the existing Slice 2 read boundary;
- projector source never reads `.db`, `decodeAllSieaRows()`, or any private/raw row helper;
- criterion registry is exact-ref keyed; unknown criterion produces an unresolved result/presentation, not a default score or authority;
- no extra Grid schema/table/event kind is required for Slice 3.

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/contextual-trust-projector.test.mjs
```

- [ ] **Step 3: Implement composition without bypasses**

The projector MUST retrieve through:

```js
store.listAuthorizedSovereignInformation({
  requester: query.requester,
  purpose: query.purpose,
  right: 'inspect-full-content',
  decisions: accessDecisions,
  now,
  limit: 100
});
```

It MUST NOT import or call any raw SQLite/private row API.

Compute `accessDecisionDigests` with `digestObject(validateInformationAccessDecision(decision))`, evaluate the private claim, sign it, run Slice 1 projection, then build/sign the external presentation.

Unknown criterion evaluator:

```js
const evaluator = criterionEvaluators.get(query.criterion_ref);
```

If absent, use a deterministic unresolved evaluator result with `criterion_evaluator_unavailable`; do not throw a fake denial and do not invent a score.

- [ ] **Step 4: Run GREEN**

```bash
node --test mesh/test/contextual-trust-projector.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/src/lib/contextual-trust-projector.mjs mesh/test/contextual-trust-projector.test.mjs
git commit -m "feat: compose contextual trust projection from SIEA reads"
```

---

### Task 6: Cross-cutting adversarial reputation invariants

**Files:**
- Create: `mesh/test/contextual-reputation-invariants.test.mjs`

**Interfaces:**
- Exercises all Slice 3 public functions plus the exact unchanged activation boundary.

- [ ] **Step 1: Add adversarial tests**

Required cases:

1. **No universal score:** `score`, `rank`, `percentile`, `global_reputation`, and cross-domain aggregate fields are rejected from query, criterion result, private claim, and presentation contracts.
2. **No reputation transfer:** changing `subject_ref` from a human/digital principal to its delegate/owner/agent breaks validation or exact expected binding; there is no inheritance rule.
3. **Cross-domain isolation:** software-security evidence cannot satisfy clinical-review or teaching queries.
4. **Cross-subject isolation:** an assertion whose rights envelope names another subject cannot satisfy the query even if proposition text mentions the target.
5. **Challenge preservation:** challenged/disputed supporting evidence forces unresolved unless the review state records adjudication consistent with the criterion evaluator.
6. **Freshness:** future/stale evidence, review state, query, claim, or presentation fails closed or becomes unresolved according to the exact layer contract.
7. **Absence proof:** `not-met` cannot be produced without verified complete-for-criterion evidence.
8. **Purpose minimization:** a query valid for one purpose cannot be replayed for another.
9. **Audience minimization:** a presentation for verifier A cannot be accepted by verifier B.
10. **Correlation minimization:** criterion-only presentation contains no evidence/source/access-decision/private-claim identifiers; two audiences get distinct basis bindings.
11. **Authority confusion:** credential/reputation result never sets `authority_granted`, `execution_authority`, `delegation_granted`, or capability fields.
12. **No promotion:** byte-pin the Slice 2/current-main blobs for capability registry, Gateway contract, core migrations, SIEA migrations, and supported Grid-server/runtime composition.

- [ ] **Step 2: Run the invariant suite**

```bash
node --test mesh/test/contextual-reputation-invariants.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run all Slice 3 focused tests together**

```bash
node --test \
  mesh/test/reputation-query.test.mjs \
  mesh/test/derived-reputation-claim.test.mjs \
  mesh/test/contextual-reputation.test.mjs \
  mesh/test/reputation-presentation.test.mjs \
  mesh/test/contextual-trust-projector.test.mjs \
  mesh/test/contextual-reputation-invariants.test.mjs
```

- [ ] **Step 4: Commit**

```bash
git add mesh/test/contextual-reputation-invariants.test.mjs
git commit -m "test: harden contextual reputation boundaries"
```

---

### Task 7: Normative requirements, canonical registration, and full verification

**Files:**
- Modify: `docs/rebuild/REQUIREMENTS.md`
- Modify: `mesh/src/check-docs.mjs`
- Test through existing `docs:check` and repository verification.

**Interfaces:**
- No runtime interface changes.

- [ ] **Step 1: Add Slice 3 normative requirements**

Add exactly these requirements:

```markdown
| SIEA-13 | Reputation queries MUST bind exact subject, domain, purpose, criterion, verifier policy, evidence window, review floor, requester, and expiry; no universal person/entity reputation score is permitted. | Query validation and no-score tests. |
| SIEA-14 | Reputation evidence MUST be bound to the queried subject through information-rights relationships and exact-purpose policy rather than inferred from free-form proposition text. | Cross-subject/domain/purpose tests. |
| SIEA-15 | Challenged, disputed, stale, future, unavailable, or insufficiently reviewed evidence MUST NOT silently satisfy a clean contextual reputation claim; uncertainty remains explicit. | Challenge/currentness/review tests. |
| SIEA-16 | Negative or absence-style reputation conclusions MUST NOT be represented as complete `not-met` claims without separately verified criterion-completeness evidence. | Completeness/absence tests. |
| SIEA-17 | External reputation presentations MUST be audience-, purpose-, subject-, domain-, criterion-, and time-bound, privacy-minimized by default, non-transferable, and non-authorizing. | Presentation replay/privacy/authority tests. |
```

- [ ] **Step 2: Register the Slice 3 plan in canonical docs**

Add:

```js
'docs/superpowers/plans/2026-09-03-contextual-trust-reputation-projection-slice3.md'
```

to the canonical Markdown set and add required-content checks for `SIEA-13` through `SIEA-17` plus `no universal person/entity reputation score`.

- [ ] **Step 3: Verify docs**

```bash
npm --prefix mesh run docs:check
```

Expected: PASS.

- [ ] **Step 4: Verify no forbidden activation drift**

```bash
git diff --exit-code 5be1eb0f4e3da2896525612577c93e7795d7cf6d -- \
  mesh/config/capabilities.json \
  mesh/src/gateway/contract.mjs \
  mesh/src/grid/migrations.mjs \
  mesh/src/grid/sovereign-information-migrations.mjs
```

Expected: no diff.

- [ ] **Step 5: Run repository-wide verification**

```bash
npm --prefix mesh run check
npm --prefix mesh run release:verify
```

Then require protected CI on the exact PR head:

- Clean Kernel;
- Node 22 compatibility;
- container deny-egress/service-network isolation;
- signed 50,000-event chain benchmark;
- Windows;
- macOS Apple Silicon;
- macOS Intel.

- [ ] **Step 6: Final line-by-line review**

Confirm:

- every spec Slice 3 bullet maps to a task/test;
- no open review thread remains unresolved;
- no `score|rank|percentile|global_reputation` surface slipped into production contracts;
- no raw SIEA database access is present in the projector;
- no evidence IDs/private claim digest leak into criterion-only presentation;
- no new Gateway/capability/provider/runtime activation exists;
- no open PR #1437/#1409/#1438 code is copied in as an undeclared dependency.

- [ ] **Step 7: Commit documentation**

```bash
git add docs/rebuild/REQUIREMENTS.md mesh/src/check-docs.mjs
git commit -m "docs: register contextual reputation requirements"
```

---

## Self-review against the approved design

### Spec coverage

- **Derived claims:** Tasks 2–3.
- **Exact-purpose verifier requests:** Task 1 and Task 5.
- **Contextual reputation evidence queries:** Tasks 1, 3, and 5.
- **Privacy-minimized presentations:** Task 4.
- **Challenge/currentness semantics:** Tasks 3 and 6.
- **No universal reputation score:** Tasks 1, 2, 4, 6, and SIEA-13.
- **Minimum-sufficient disclosure:** Task 4 reuses Slice 1 projection semantics.
- **Reputation != authority:** every Slice 3 contract is authority-neutral and Task 6 verifies it.
- **Cross-domain correlation resistance:** Task 4 default presentation and Task 6 adversarial tests.
- **No advanced-crypto overclaim:** Global Constraints and presentation non-claims.

### Deliberate deferrals

- No W3C VC/SD-JWT/BBS+/ZK protocol commitment in Slice 3.
- No production cross-domain residency engine; #1437 remains independent pending convergence.
- No adaptive-assurance reputation scoring; #1409/#1438 remain independent pending convergence.
- No reputation-derived capability promotion.
- No broad absence claim without completeness proof.
- No public/global reputation directory.

### Type consistency

The plan uses one exact vocabulary throughout:

- query: `axiom-reputation-query.v1`;
- private claim: `axiom-derived-reputation-claim.v1`;
- private claim envelope: `axiom-derived-reputation-claim-envelope.v1`;
- external presentation: `axiom-reputation-presentation.v1`;
- presentation envelope: `axiom-reputation-presentation-envelope.v1`;
- results: `met|not-demonstrated|not-met|unresolved`;
- completeness: `bounded-selected-evidence|verified-complete-for-criterion`;
- presentation levels: `criterion-only|bounded-summary`.

No placeholder/TODO steps are permitted in execution.
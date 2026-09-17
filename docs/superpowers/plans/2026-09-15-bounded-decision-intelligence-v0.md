# Bounded Decision Intelligence v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Slice A of Bounded Decision Intelligence v0 as strict, provider-neutral, network-free evidence contracts plus deterministic interpretation helpers, without adding Jev access, provider credentials, production routing, capability grants, or authority changes.

**Architecture:** Add four closed-world v0 contracts as pure Node.js ESM modules with matching JSON Schema 2020-12 mirrors: provider profile, question schema, decision observation, and calibration report. Add one pure interpretation module that consumes already-validated evidence and returns evidence-quality states only. Bind provider profiles to exact runtime/provider catalog entries, content-address question semantics, preserve complete probability evidence, and keep all execution authority in the existing policy/plan path.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, existing `mesh/src/lib/canonical.mjs` (`digestObject`, `ValidationError`), existing `validateRuntimeConnectorCatalogEntry`, JSON Schema 2020-12. No new npm dependency.

**Spec:** `docs/superpowers/specs/2026-09-15-bounded-decision-intelligence-v0-design.md`

## Global Constraints

- Node compatibility remains `>=22.23.2 <23 || >=24.14.0 <25`.
- `mesh/config/capabilities.json` remains authoritative and MUST NOT be changed by Slice A.
- `axiom-plan.v1` remains unchanged.
- Slice A performs no provider invocation, no network access, no credential access, no runtime activation, no filesystem access from production contract/interpretation modules, no subprocess execution, no wallet/payment action, and no Grid mutation.
- Bounded decision evidence MUST NOT mint capability, approve an action, widen scopes, authorize egress, reveal credentials, spend funds, mutate policy, or independently cause an external effect.
- Model confidence/probability MUST NOT populate, derive, raise, or lower AXIOM `required_assurance` or `achieved_assurance`.
- Unknown fields fail closed at every contract object layer.
- `choice`, `score`, and `binary-probability` are the only v0 question kinds.
- Choice and Score observations used by interpretation policy preserve full distributions.
- Question schema material semantics are content-addressed; `schema_digest` is excluded only from its own digest payload.
- Observation `observation_digest` and calibration `report_digest` are likewise excluded only from their own digest payloads.
- Exact ties in Choice distributions are explicit: `selected_option_id` is the lexicographically smallest maximal-probability option and `tied_option_ids` is the sorted list of all maximal-probability option ids when more than one maximum exists; otherwise `tied_option_ids` is empty. Consumers may reject/escalate ties.
- Provider offering revision evidence remains explicit: `exact-artifact | provider-versioned | mutable-alias | unknown`. Mutable aliases never silently become exact versions.
- Calibration requires independently sourced outcomes; provider self-confidence is not ground truth.
- `null`, stale, expired, rejected, out-of-domain, or revision-incompatible calibration cannot satisfy an interpretation policy requiring reviewed current calibration.
- Result states from interpretation are evidence states only: `accepted-evidence | insufficient-evidence | conflicting-evidence | stale-evidence | invalid-evidence`.
- Existing canonical digest conventions from `canonical.mjs` MUST be used.
- Production outputs from validators/resolvers/interpreters must be frozen/deep-frozen and must not mutate caller objects.

## File Structure

Create these focused modules and mirrors:

```text
mesh/src/lib/bounded-decision-provider-profile.mjs
mesh/src/lib/bounded-decision-question-schema.mjs
mesh/src/lib/bounded-decision-observation.mjs
mesh/src/lib/bounded-decision-calibration-report.mjs
mesh/src/lib/bounded-decision-interpretation.mjs

mesh/config/bounded-decision-provider-profile-v0.schema.json
mesh/config/bounded-decision-question-schema-v0.schema.json
mesh/config/bounded-decision-observation-v0.schema.json
mesh/config/bounded-decision-calibration-report-v0.schema.json

mesh/test/bounded-decision-provider-profile.test.mjs
mesh/test/bounded-decision-provider-profile-schema.test.mjs
mesh/test/bounded-decision-question-schema.test.mjs
mesh/test/bounded-decision-question-schema-schema.test.mjs
mesh/test/bounded-decision-observation.test.mjs
mesh/test/bounded-decision-observation-schema.test.mjs
mesh/test/bounded-decision-calibration-report.test.mjs
mesh/test/bounded-decision-calibration-report-schema.test.mjs
mesh/test/bounded-decision-interpretation.test.mjs
mesh/test/bounded-decision-authority-boundary.test.mjs
```

Keep validation helpers local to each module for Slice A, matching nearby cognitive/reward evidence code. Do not create a generalized contract framework in this slice.

---

### Task 1: Bounded Decision Provider Profile v0

**Files:**
- Create: `mesh/test/bounded-decision-provider-profile.test.mjs`
- Create: `mesh/test/bounded-decision-provider-profile-schema.test.mjs`
- Create after RED: `mesh/src/lib/bounded-decision-provider-profile.mjs`
- Create after RED: `mesh/config/bounded-decision-provider-profile-v0.schema.json`

**Interfaces:**
- Produces `BOUNDED_DECISION_PROVIDER_PROFILE_SCHEMA = 'axiom-bounded-decision-provider-profile.v0'`.
- Produces `validateBoundedDecisionProviderProfile(profile)`.
- Produces `boundedDecisionProviderProfileDigest(profile)`.
- Produces `resolveBoundedDecisionProviderProfile(profile, catalogEntry)`.
- Consumes `digestObject`, `ValidationError`, `validateRuntimeConnectorCatalogEntry`.

- [ ] **Step 1: Write the failing profile tests**

Use an inline valid catalog fixture patterned after `cognitive-capability-profile.test.mjs`; do not mutate `runtime-provider-catalog.v0.json`.

Core assertions:

```js
assert.equal(BOUNDED_DECISION_PROVIDER_PROFILE_SCHEMA, 'axiom-bounded-decision-provider-profile.v0');
const result = validateBoundedDecisionProviderProfile(profile);
assert.equal(result.valid, true);
assert.equal(result.authority_effect, 'none');
assert.equal(result.assurance_effect, 'none');
assert.equal(result.runtime_activation, false);
assert.match(boundedDecisionProviderProfileDigest(profile), /^[a-f0-9]{64}$/);
```

Required profile fields are exactly:

```text
schema version status profile_id
catalog_entry_id catalog_entry_version catalog_entry_digest
offering_ref offering_version_or_revision offering_revision_evidence
provider_mode supported_question_kinds
max_questions_per_request max_choice_cardinality max_score_levels
type_guarantee probability_support latency_class calibration_claim
retention_posture_ref training_use_posture_ref
created_at review_at
authority_effect network_effect credential_visibility runtime_activation
selection_effect assurance_effect
```

Tests must prove exact catalog identity/version/digest binding; `review_at >= created_at`; duplicate question kinds fail; positive bounded integer ceilings fail on zero/overflow; closed vocabularies fail on unknown values; nullable posture refs accept only null or bounded strings; and all six hard-boundary fields fail on widening.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/bounded-decision-provider-profile.test.mjs test/bounded-decision-provider-profile-schema.test.mjs
```

Expected: FAIL because the module/schema do not exist.

- [ ] **Step 3: Implement the profile validator/resolver**

Implement the public shape directly:

```js
export const BOUNDED_DECISION_PROVIDER_PROFILE_SCHEMA =
  'axiom-bounded-decision-provider-profile.v0';

export function validateBoundedDecisionProviderProfile(profile) {
  validateProfileShape(profile);
  return deepFreeze({
    valid: true,
    schema: profile.schema,
    profile_id: profile.profile_id,
    offering_ref: profile.offering_ref,
    offering_version_or_revision: profile.offering_version_or_revision,
    offering_revision_evidence: profile.offering_revision_evidence,
    profile_digest: digestObject(profile),
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none'
  });
}

export function boundedDecisionProviderProfileDigest(profile) {
  validateProfileShape(profile);
  return digestObject(profile);
}
```

`resolveBoundedDecisionProviderProfile()` must call `validateRuntimeConnectorCatalogEntry(catalogEntry)`, recompute `digestObject(catalogEntry)`, require exact id/version/digest equality, and require provider-mode/network posture consistency without granting network access.

- [ ] **Step 4: Add the JSON Schema mirror**

Use Draft 2020-12, top-level `additionalProperties: false`, exact enums/constants, numeric maximums matching code, and these hard constants:

```json
{
  "authority_effect": "none",
  "network_effect": "none",
  "credential_visibility": "none",
  "runtime_activation": false,
  "selection_effect": "eligibility-only",
  "assurance_effect": "none"
}
```

Add `x-axiom-semantic-validator`, semantic rules for exact catalog binding/revision evidence, and non-claims for invocation, egress, authority, correctness, calibration truth, and production routing.

- [ ] **Step 5: Verify GREEN and commit**

```bash
cd mesh
node --test test/bounded-decision-provider-profile.test.mjs test/bounded-decision-provider-profile-schema.test.mjs
git add src/lib/bounded-decision-provider-profile.mjs config/bounded-decision-provider-profile-v0.schema.json test/bounded-decision-provider-profile.test.mjs test/bounded-decision-provider-profile-schema.test.mjs
git commit -m "feat: add bounded decision provider profile v0"
```

---

### Task 2: Bounded Decision Question Schema v0

**Files:**
- Create: `mesh/test/bounded-decision-question-schema.test.mjs`
- Create: `mesh/test/bounded-decision-question-schema-schema.test.mjs`
- Create after RED: `mesh/src/lib/bounded-decision-question-schema.mjs`
- Create after RED: `mesh/config/bounded-decision-question-schema-v0.schema.json`

**Interfaces:**
- Produces `BOUNDED_DECISION_QUESTION_SCHEMA = 'axiom-bounded-decision-question-schema.v0'`.
- Produces `computeBoundedDecisionQuestionSchemaDigest(document)`.
- Produces `validateBoundedDecisionQuestionSchema(document)`.
- Produces `boundedDecisionQuestionSchemaDigest(document)` as the validated digest accessor.

- [ ] **Step 1: Write failing question-schema tests**

Common exact fields:

```text
schema version status question_schema_id question_kind
instructions purpose domain state_contract_ref known_limitations
created_at schema_digest
```

Choice adds `options` and `other_option_policy`; Score adds `levels`; Binary adds `true_meaning` and `false_meaning`. Tests must reject fields from the other variants.

Digest construction test:

```js
const unsigned = validChoiceSchema({ schema_digest: '0'.repeat(64) });
const expected = computeBoundedDecisionQuestionSchemaDigest(unsigned);
unsigned.schema_digest = expected;
assert.equal(validateBoundedDecisionQuestionSchema(unsigned).schema_digest, expected);
const changed = structuredClone(unsigned);
changed.options[0].description = 'materially changed meaning';
assert.notEqual(computeBoundedDecisionQuestionSchemaDigest(changed), expected);
```

Choice tests: 2-64 unique `option_id`s, non-empty descriptions, closed `other_option_policy`, and `required` must include an explicit `other` or `none` option id. Score tests: 2-10 unique ordered levels with positions exactly `0..n-1`. Binary tests: distinct non-empty true/false meanings. All variants reject raw authority fields, tool calls, chain-of-thought fields, and unknown keys.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/bounded-decision-question-schema.test.mjs test/bounded-decision-question-schema-schema.test.mjs
```

- [ ] **Step 3: Implement content-addressed schema validation**

Digest helper must strip only `schema_digest`:

```js
function digestPayload(document) {
  const copy = structuredClone(document);
  delete copy.schema_digest;
  return copy;
}

export function computeBoundedDecisionQuestionSchemaDigest(document) {
  validateQuestionShape(document, { verifyDigest: false });
  return digestObject(digestPayload(document));
}

export function validateBoundedDecisionQuestionSchema(document) {
  validateQuestionShape(document, { verifyDigest: false });
  const expected = digestObject(digestPayload(document));
  if (document.schema_digest !== expected) {
    throw new ValidationError('Bounded decision question schema digest mismatch');
  }
  return deepFreeze({ valid: true, schema: document.schema, question_schema_id: document.question_schema_id, question_kind: document.question_kind, schema_digest: expected, authority_effect: 'none' });
}
```

No constructor should silently rewrite a caller's digest.

- [ ] **Step 4: Add JSON Schema mirror and verify GREEN**

Use `oneOf` for the three variants while retaining `additionalProperties: false` in each variant object. Include semantic notes that atomicity is reviewed semantically and that the digest covers every material field except itself.

```bash
cd mesh
node --test test/bounded-decision-question-schema.test.mjs test/bounded-decision-question-schema-schema.test.mjs
git add src/lib/bounded-decision-question-schema.mjs config/bounded-decision-question-schema-v0.schema.json test/bounded-decision-question-schema.test.mjs test/bounded-decision-question-schema-schema.test.mjs
git commit -m "feat: add bounded decision question schema v0"
```

---

### Task 3: Bounded Decision Observation v0 and Normalization

**Files:**
- Create: `mesh/test/bounded-decision-observation.test.mjs`
- Create: `mesh/test/bounded-decision-observation-schema.test.mjs`
- Create after RED: `mesh/src/lib/bounded-decision-observation.mjs`
- Create after RED: `mesh/config/bounded-decision-observation-v0.schema.json`

**Interfaces:**
- Produces `BOUNDED_DECISION_OBSERVATION_SCHEMA = 'axiom-bounded-decision-observation.v0'`.
- Produces `computeBoundedDecisionObservationDigest(document)`.
- Produces `validateBoundedDecisionObservation(document, providerProfile, questionSchema)`.
- Produces `boundedDecisionObservationDigest(document, providerProfile, questionSchema)`.
- Produces `normalizeBoundedDecisionProviderResult(input, providerProfile, questionSchema)`.
- Produces `createBoundedDecisionFailureReceipt(input)` for provider/transport/schema/distribution failures; failure receipts are not decision observations.

- [ ] **Step 1: Write failing Choice tests**

A normalized Choice answer is:

```js
{
  kind: 'choice',
  selected_option_id: 'export-data',
  tied_option_ids: [],
  probability_evidence: [
    { option_id: 'export-data', probability: 0.82 },
    { option_id: 'other', probability: 0.18 }
  ]
}
```

Require every declared option exactly once, no unknown/duplicate ids, finite `[0,1]` probabilities, sum-to-one tolerance `1e-12`, and selected maximum. For exact ties, normalize deterministically:

```js
assert.equal(result.answer.selected_option_id, 'a');
assert.deepEqual(result.answer.tied_option_ids, ['a', 'b']);
```

where `a` and `b` have equal maximal probability.

- [ ] **Step 2: Write failing Score and binary tests**

Score preserves every level distribution and validates the weighted mean:

```js
const expected = distribution.reduce((sum, item) => sum + item.position * item.probability, 0);
assert.ok(Math.abs(result.answer.score - expected) <= 1e-12);
```

Binary requires finite `p_true` in `[0,1]` and normalizes exactly two probability records whose sum is 1. Reject provider attempts to supply contradictory independent `p_false` values.

All observations must bind exact provider-profile digest, catalog digest, offering/ref revision evidence, question-schema id/digest, state digest/classification, timestamps, bounded usage evidence, nullable calibration/transport refs, and zero authority/assurance effects. Raw state is never embedded.

- [ ] **Step 3: Verify RED**

```bash
cd mesh
node --test test/bounded-decision-observation.test.mjs test/bounded-decision-observation-schema.test.mjs
```

- [ ] **Step 4: Implement validation/normalization**

Use exact upstream validation before response validation:

```js
validateBoundedDecisionProviderProfile(providerProfile);
validateBoundedDecisionQuestionSchema(questionSchema);
```

`normalizeBoundedDecisionProviderResult()` accepts only a provider-neutral input object; it performs no network call. Construct a fresh observation, derive deterministic tie representation, validate weighted score, set `observation_digest` from the payload excluding that field, validate again, and return a deep-frozen object.

Failure receipt classes are exactly:

```text
provider-unavailable
transport-integrity-failure
schema-invalid
distribution-invalid
```

A failure receipt contains no semantic default answer.

- [ ] **Step 5: Add JSON Schema mirror, verify GREEN, commit**

```bash
cd mesh
node --test test/bounded-decision-observation.test.mjs test/bounded-decision-observation-schema.test.mjs
git add src/lib/bounded-decision-observation.mjs config/bounded-decision-observation-v0.schema.json test/bounded-decision-observation.test.mjs test/bounded-decision-observation-schema.test.mjs
git commit -m "feat: add bounded decision observation v0"
```

---

### Task 4: Bounded Decision Calibration Report v0

**Files:**
- Create: `mesh/test/bounded-decision-calibration-report.test.mjs`
- Create: `mesh/test/bounded-decision-calibration-report-schema.test.mjs`
- Create after RED: `mesh/src/lib/bounded-decision-calibration-report.mjs`
- Create after RED: `mesh/config/bounded-decision-calibration-report-v0.schema.json`

**Interfaces:**
- Produces `BOUNDED_DECISION_CALIBRATION_REPORT_SCHEMA = 'axiom-bounded-decision-calibration-report.v0'`.
- Produces `computeBoundedDecisionCalibrationReportDigest(document)`.
- Produces `validateBoundedDecisionCalibrationReport(document)`.
- Produces `resolveBoundedDecisionCalibrationReport(document, providerProfile, questionSchemas)`.

- [ ] **Step 1: Write failing calibration tests**

Require exact fields from the design: report id; profile digest; offering revision/revision-evidence; schema-family refs; domain/population/evaluation period; sample count; independent outcome refs; metrics; limitations; distribution-shift notes; created/valid-until; review state; report digest.

Review states are exactly:

```text
experimental
reviewed
expired
rejected
```

Tests must prove: `valid_until >= created_at`; sample count is positive; duplicate schema refs/outcome refs fail; self-confidence cannot appear as outcome truth; metrics reject non-finite numbers; `mutable-alias`/`unknown` revision evidence remains visible; report digest changes with material metrics/domain/population/revision changes; and zero authority/assurance boundaries cannot widen.

Use independently sourced outcome references like:

```js
{
  outcome_ref: 'outcome.eval.001',
  outcome_digest: 'a'.repeat(64),
  source_class: 'deterministic-checker'
}
```

Do not store raw prompts/answers in the report.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/bounded-decision-calibration-report.test.mjs test/bounded-decision-calibration-report-schema.test.mjs
```

- [ ] **Step 3: Implement report validation/resolution and schema**

`resolveBoundedDecisionCalibrationReport()` must validate the provider profile and every referenced supplied question schema, require the exact profile digest, ensure all schema-family refs resolve, and preserve revision-evidence limitations. It must not convert review state into authority.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd mesh
node --test test/bounded-decision-calibration-report.test.mjs test/bounded-decision-calibration-report-schema.test.mjs
git add src/lib/bounded-decision-calibration-report.mjs config/bounded-decision-calibration-report-v0.schema.json test/bounded-decision-calibration-report.test.mjs test/bounded-decision-calibration-report-schema.test.mjs
git commit -m "feat: add bounded decision calibration report v0"
```

---

### Task 5: Deterministic Interpretation Helper

**Files:**
- Create: `mesh/test/bounded-decision-interpretation.test.mjs`
- Create after RED: `mesh/src/lib/bounded-decision-interpretation.mjs`

**Interfaces:**
- Produces `validateBoundedDecisionInterpretationPolicy(policy)`.
- Produces `interpretBoundedDecisionEvidence({ observations, calibrationReports, policy, now })`.
- Consumes Task 3 observations and Task 4 calibration reports.
- Returns only evidence states, never `allow`, `authorized`, an assurance tier, a capability, or an executable plan.

- [ ] **Step 1: Write failing interpretation tests**

Closed policy fields:

```text
required_schema_digests[]
maximum_observation_age_ms
minimum_calibration_state
minimum_sample_count
allowed_provider_profiles[]
allowed_revision_evidence[]
probability_predicates[]
disagreement_rule
fallback_route
```

`minimum_calibration_state` is `none | experimental | reviewed`; `disagreement_rule` is `conflict | require-unanimity`; `fallback_route` is descriptive only: `reject | gather-more-evidence | deliberative-review | human-review`.

Predicate objects support only:

```text
choice-min-probability
score-min
score-max
binary-min-p-true
binary-max-p-true
```

A predicate binds an exact `question_schema_digest` and its kind-specific option/threshold fields.

Test these result states:

```js
assert.equal(interpret(...).status, 'accepted-evidence');
assert.equal(interpret(...stale...).status, 'stale-evidence');
assert.equal(interpret(...conflict...).status, 'conflicting-evidence');
assert.equal(interpret(...missingCalibration...).status, 'insufficient-evidence');
assert.equal(interpret(...malformed...).status, 'invalid-evidence');
```

Also prove reviewed calibration is rejected when expired/rejected, sample count is too small, domain/schema/profile does not bind, or policy requires `exact-artifact`/`provider-versioned` while evidence is `mutable-alias`.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/bounded-decision-interpretation.test.mjs
```

- [ ] **Step 3: Implement deterministic interpretation**

Return a deep-frozen report shaped as:

```js
{
  status,
  observation_ids,
  calibration_report_ids,
  reason_codes,
  fallback_route: policy.fallback_route,
  authority_effect: 'none',
  assurance_effect: 'none',
  execution_effect: 'none'
}
```

Do not average materially conflicting observations by default. Do not infer provider independence. Do not emit an authority decision.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd mesh
node --test test/bounded-decision-interpretation.test.mjs
git add src/lib/bounded-decision-interpretation.mjs test/bounded-decision-interpretation.test.mjs
git commit -m "feat: add bounded decision evidence interpretation"
```

---

### Task 6: Authority Boundary, Inertness, and Full Verification

**Files:**
- Create: `mesh/test/bounded-decision-authority-boundary.test.mjs`
- Do not modify: `mesh/src/lib/plan.mjs`
- Do not modify: `mesh/config/capabilities.json`

**Interfaces:**
- Proves all new Slice A modules remain evidence-only and cannot substitute confidence for AXIOM assurance.

- [ ] **Step 1: Write the authority-boundary regression test**

Use the existing high-assurance behavior directly:

```js
const highConfidenceEvidence = {
  provider_confidence: 0.999999,
  probability_evidence: [{ value: true, probability: 0.999999 }]
};
assert.ok(highConfidenceEvidence.provider_confidence > 0.99);
assert.throws(
  () => buildPlan(intent(), decision({ risk: 'high', required_assurance: 'A3' })),
  /cannot satisfy required assurance A3; current path achieves A2/
);
```

The test intentionally does not pass model evidence to `buildPlan`: there is no accepted interface for doing so in Slice A.

Also read the five new production module source files in the test and assert they contain no imports from `node:fs`, `node:net`, `node:http`, `node:https`, `node:child_process`, provider SDK/client modules, credential/token broker modules, Grid stores, wallet/payment modules, or capability issuance modules.

Assert `mesh/config/capabilities.json` contains no new implemented bounded-decision capability and that `plan.mjs` remains `axiom-plan.v1` without bounded decision fields.

- [ ] **Step 2: Run every bounded-decision test**

```bash
cd mesh
node --test \
  test/bounded-decision-provider-profile.test.mjs \
  test/bounded-decision-provider-profile-schema.test.mjs \
  test/bounded-decision-question-schema.test.mjs \
  test/bounded-decision-question-schema-schema.test.mjs \
  test/bounded-decision-observation.test.mjs \
  test/bounded-decision-observation-schema.test.mjs \
  test/bounded-decision-calibration-report.test.mjs \
  test/bounded-decision-calibration-report-schema.test.mjs \
  test/bounded-decision-interpretation.test.mjs \
  test/bounded-decision-authority-boundary.test.mjs
```

Expected: all PASS.

- [ ] **Step 3: Run the complete kernel test suite**

```bash
cd mesh
npm test
```

Expected: PASS with no existing regression.

- [ ] **Step 4: Run repository checks**

```bash
cd mesh
npm run check
```

Expected: setup, network policy, gateway contract, Axiom One, registry, status, docs, and full tests all PASS.

- [ ] **Step 5: Commit verification test**

```bash
cd mesh
git add test/bounded-decision-authority-boundary.test.mjs
git commit -m "test: lock bounded decision authority boundary"
```

---

## Self-Review Checklist

Before declaring Slice A complete, verify:

- Provider profile is exact-catalog-bound and no provider invocation exists.
- Question semantics are content-addressed and every material semantic edit changes the digest.
- Choice/Score preserve full distributions; binary probability preserves deterministic complement.
- Choice ties are explicit and deterministic.
- Observation failure receipts never fabricate semantic answers.
- Raw state is absent from durable observation contracts.
- Calibration uses independent outcome references and preserves revision-evidence limitations.
- Interpretation reports evidence quality only and has no `allow`, `authorized`, capability, tool, effect, or assurance-promotion output.
- Confidence cannot affect `axiom-plan.v1` assurance.
- No production bounded-decision module imports effectful runtime/network/filesystem/credential/wallet/Grid/capability surfaces.
- No new dependency is added.
- No change is made to `mesh/config/capabilities.json` or `mesh/src/lib/plan.mjs`.
- Focused tests, `npm test`, and `npm run check` all pass before completion is claimed.

## Deferred Slices

The following are explicitly outside this plan and require separate review after Slice A evidence contracts have implementation history:

- Slice B local/provider-specific conformance adapter.
- Slice C external Jev or other provider adapter, credentials, disclosure checks, or egress.
- Slice D live bounded-vs-deliberative routing experiments.
- Any production consequential-action routing.
- Any `axiom-plan.v1` or capability-registry extension for bounded evidence references.

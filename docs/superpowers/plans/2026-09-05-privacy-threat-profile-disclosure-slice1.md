# Privacy Threat Profile + Disclosure Firewall Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first effect-inert, deterministic contracts for privacy threat-profile semantics and pre-disclosure review without adding a sanitizer, network path, runtime authority, or production anonymity claim.

**Architecture:** Implement two small pure validators under `mesh/src/lib/`: one validates a versioned `PrivacyThreatProfile`, the other validates a versioned `DisclosureReview`. Both use existing canonical validation/digest helpers, reject unknown fields, return only bounded summaries plus semantic digests, and import no effect-capable modules. The slice is intentionally isolated from Gateway, Hypervisor, Sandbox, Grid, file I/O, network I/O, sanitizer execution, and host enforcement.

**Tech Stack:** Node.js ES modules, built-in `node:test`, `node:assert/strict`, existing `mesh/src/lib/canonical.mjs` helpers.

**Spec:** `docs/superpowers/specs/2026-09-03-privacy-preserving-collective-intelligence-design.md` plus `docs/superpowers/specs/2026-09-05-privacy-threat-profiles-disclosure-correlation-addendum.md`

## Global Constraints

- Build remains `0.12.0-dev.3`; no capability promotion.
- Validators are effect-inert and must not import filesystem, child-process, network, TLS, service, runtime, Grid, Sandbox, or executor modules.
- Unknown fields fail closed.
- Every validated object explicitly carries `authority_effect: "none"`.
- Threat-profile names are requirement classes, not guarantees.
- Encryption/pseudonymity may not be represented as proof of anonymity/unlinkability.
- Disclosure review does not authorize release or transmission.
- No Gateway route, Grid mutation, sanitizer, automatic file rewrite, telemetry expansion, external dependency, or cryptographic-suite change.
- Canonical semantic digests use existing `digestObject()` over the exact validated input object.
- Required disclosure categories that are `not_checked`, `unsupported`, or `finding` cannot produce an `allow` decision.
- Documentation remains truthful about non-claims and source-derived rationale.

---

## File Structure

Create:

- `mesh/src/lib/privacy-threat-profile.mjs` — pure threat-profile validator and semantic digest.
- `mesh/test/privacy-threat-profile.test.mjs` — positive, downgrade, claim-confusion, exact-shape, and effect-inert tests.
- `mesh/src/lib/disclosure-review.mjs` — pure disclosure-review validator and semantic digest.
- `mesh/test/disclosure-review.test.mjs` — positive, fail-closed finding-state, minimization, exact-shape, and effect-inert tests.

Modify only if needed for documentation-boundary verification:

- `mesh/src/check-docs.mjs` — register the approved privacy design, addendum, and implementation plan; do not alter other canonical-document semantics.

Do not modify:

- Gateway/Hypervisor/Sandbox/Grid runtime routes;
- `mesh/config/capabilities.json`;
- external telemetry;
- deployment/runtime network policy;
- current production-promotion claims.

---

### Task 1: Threat Profile RED tests

**Files:**
- Create: `mesh/test/privacy-threat-profile.test.mjs`

**Interfaces:**
- Consumes: future `validatePrivacyThreatProfile(raw)` from `../src/lib/privacy-threat-profile.mjs`.
- Produces: executable contract expectations for Task 2.

- [ ] **Step 1: Write the failing threat-profile tests**

Create a test fixture with this shape:

```js
const VALID_PROFILE = Object.freeze({
  schema: 'axiom-privacy-threat-profile.v1',
  profile_id: 'privacy_profile_example',
  profile_class: 'correlation-resistant',
  purpose: 'publish-minimized-research-artifact',
  adversary_capabilities: [
    'auxiliary-data-correlation',
    'network-metadata-observation',
    'host-device-correlation'
  ],
  protections: {
    host_device_telemetry: 'controlled',
    network_metadata: 'minimized',
    persona_isolation: 'credential-and-context',
    disclosure_inspection: 'required',
    physical_tamper: 'detect-only',
    artifact_verification: 'signed-and-digested'
  },
  residual_risks: [
    'stylometric-attribution-may-remain',
    'global-passive-network-observer-not-defeated'
  ],
  currentness: {
    issued_at: '2026-09-05T00:00:00.000Z',
    expires_at: '2026-10-05T00:00:00.000Z',
    policy_digest: 'a'.repeat(64)
  },
  authority_effect: 'none'
});
```

Tests must assert:

```js
test('correlation-resistant threat profile validates as requirements-only evidence', () => {
  const result = validatePrivacyThreatProfile(structuredClone(VALID_PROFILE));
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-privacy-threat-profile.v1');
  assert.equal(result.profile_class, 'correlation-resistant');
  assert.match(result.profile_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.anonymity_granted, false);
  assert.equal(result.execution_authority_granted, false);
});
```

```js
test('high-anonymity cannot downgrade host, network, persona, or disclosure requirements', () => {
  const base = structuredClone(VALID_PROFILE);
  base.profile_class = 'high-anonymity';
  base.protections.host_device_telemetry = 'isolated';
  base.protections.network_metadata = 'anonymity-preserving';
  base.protections.persona_isolation = 'host-and-network';
  base.protections.physical_tamper = 'resist-and-detect';

  for (const [field, weakened] of [
    ['host_device_telemetry', 'controlled'],
    ['network_metadata', 'minimized'],
    ['persona_isolation', 'credential-and-context'],
    ['disclosure_inspection', 'optional']
  ]) {
    const candidate = structuredClone(base);
    candidate.protections[field] = weakened;
    assert.throws(() => validatePrivacyThreatProfile(candidate), /high-anonymity protection boundary/);
  }
});
```

```js
test('threat profile cannot encode encryption or pseudonymity as anonymity proof', () => {
  for (const [field, value] of [
    ['anonymity_proven_by', 'encrypted-transport'],
    ['unlinkability_proven_by', 'pseudonym'],
    ['identity_guarantee', 'anonymous']
  ]) {
    const candidate = structuredClone(VALID_PROFILE);
    candidate[field] = value;
    assert.throws(() => validatePrivacyThreatProfile(candidate), new RegExp(`unsupported field ${field}`));
  }
});
```

Also test:

- invalid/duplicate adversary capability;
- empty `residual_risks` rejected (residual-risk acknowledgement is mandatory);
- `authority_effect !== "none"` rejected;
- non-canonical timestamps / expiry not after issue rejected;
- unknown protection field rejected;
- policy digest must be lowercase 64-char SHA-256 text;
- validator source imports none of `node:child_process`, `node:fs`, `node:net`, `node:http`, `node:https`, `node:dgram`, `node:tls`, Grid, Sandbox, Hypervisor, Gateway, or service executor modules.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd mesh
node --test --test-reporter=spec test/privacy-threat-profile.test.mjs
```

Expected: FAIL because `../src/lib/privacy-threat-profile.mjs` does not exist yet. The failure must be module-not-found for the intended production module, not a syntax error in the test.

- [ ] **Step 3: Commit RED state**

```bash
git add mesh/test/privacy-threat-profile.test.mjs
git commit -m "test: define privacy threat profile boundary"
```

---

### Task 2: Threat Profile GREEN implementation

**Files:**
- Create: `mesh/src/lib/privacy-threat-profile.mjs`
- Test: `mesh/test/privacy-threat-profile.test.mjs`

**Interfaces:**
- Consumes: `ValidationError`, `assertPlainObject`, `assertString`, `digestObject` from `./canonical.mjs`.
- Produces: `PRIVACY_THREAT_PROFILE_SCHEMA`, `validatePrivacyThreatProfile(raw)`.

- [ ] **Step 1: Implement exact-shape validator**

The top-level accepted fields are exactly:

```js
[
  'schema',
  'profile_id',
  'profile_class',
  'purpose',
  'adversary_capabilities',
  'protections',
  'residual_risks',
  'currentness',
  'authority_effect'
]
```

Allowed profile classes:

```js
new Set(['baseline-private', 'correlation-resistant', 'high-anonymity'])
```

Allowed adversary capabilities:

```js
new Set([
  'auxiliary-data-correlation',
  'network-metadata-observation',
  'host-device-correlation',
  'behavioral-stylometric-analysis',
  'physical-tampering',
  'malicious-file-content'
])
```

Allowed protection vocabularies:

```js
const PROTECTION_VALUES = Object.freeze({
  host_device_telemetry: new Set(['minimized', 'controlled', 'isolated']),
  network_metadata: new Set(['authenticated-encrypted', 'minimized', 'anonymity-preserving']),
  persona_isolation: new Set(['application', 'credential-and-context', 'host-and-network']),
  disclosure_inspection: new Set(['optional', 'required']),
  physical_tamper: new Set(['not-assessed', 'detect-only', 'resist-and-detect', 'continuous-custody-required']),
  artifact_verification: new Set(['digest-required', 'signed-and-digested'])
});
```

Minimum profile requirements:

```js
const MINIMUMS = Object.freeze({
  'baseline-private': {
    host_device_telemetry: 'minimized',
    network_metadata: 'authenticated-encrypted',
    persona_isolation: 'application',
    disclosure_inspection: 'optional',
    artifact_verification: 'digest-required'
  },
  'correlation-resistant': {
    host_device_telemetry: 'controlled',
    network_metadata: 'minimized',
    persona_isolation: 'credential-and-context',
    disclosure_inspection: 'required',
    artifact_verification: 'signed-and-digested'
  },
  'high-anonymity': {
    host_device_telemetry: 'isolated',
    network_metadata: 'anonymity-preserving',
    persona_isolation: 'host-and-network',
    disclosure_inspection: 'required',
    artifact_verification: 'signed-and-digested'
  }
});
```

Implement explicit rank tables rather than string comparison. For `high-anonymity`, `physical_tamper` may be `detect-only`, `resist-and-detect`, or `continuous-custody-required` but not `not-assessed`.

Require:

- ordinary/plain objects only;
- `profile_id` / `purpose` bounded text;
- unique non-empty `adversary_capabilities`;
- exactly six protection fields;
- non-empty unique `residual_risks` with bounded machine-readable strings;
- canonical ISO timestamps and `expires_at > issued_at`;
- lowercase `[a-f0-9]{64}` policy digest;
- `authority_effect === 'none'`.

Return:

```js
Object.freeze({
  valid: true,
  schema: profile.schema,
  profile_id: profile.profile_id,
  profile_class: profile.profile_class,
  profile_digest: digestObject(profile),
  required_disclosure_inspection: profile.protections.disclosure_inspection === 'required',
  authority_effect: 'none',
  anonymity_granted: false,
  execution_authority_granted: false
});
```

- [ ] **Step 2: Verify GREEN**

Run:

```bash
cd mesh
node --test --test-reporter=spec test/privacy-threat-profile.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run focused canonical tests**

```bash
cd mesh
node --test --test-reporter=spec test/canonical.test.mjs test/privacy-threat-profile.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mesh/src/lib/privacy-threat-profile.mjs mesh/test/privacy-threat-profile.test.mjs
git commit -m "feat: add effect-inert privacy threat profiles"
```

---

### Task 3: Disclosure Review RED tests

**Files:**
- Create: `mesh/test/disclosure-review.test.mjs`

**Interfaces:**
- Consumes: future `validateDisclosureReview(raw)` from `../src/lib/disclosure-review.mjs`.
- Produces: executable contract expectations for Task 4.

- [ ] **Step 1: Write failing tests**

Base fixture:

```js
const VALID_REVIEW = Object.freeze({
  schema: 'axiom-disclosure-review.v1',
  review_id: 'disclosure_review_example',
  object_digest: 'b'.repeat(64),
  threat_profile_digest: 'c'.repeat(64),
  purpose: 'publish-minimized-research-artifact',
  required_categories: ['metadata', 'watermark', 'malware'],
  findings: [
    { category: 'metadata', status: 'clear', severity: 'none', detector: 'metadata-lab.v1', reason_code: 'no-supported-metadata-found' },
    { category: 'watermark', status: 'clear', severity: 'none', detector: 'watermark-lab.v1', reason_code: 'no-supported-watermark-found' },
    { category: 'malware', status: 'clear', severity: 'none', detector: 'malware-lab.v1', reason_code: 'no-supported-malware-found' }
  ],
  decision: 'allow',
  authority_effect: 'none'
});
```

Tests must assert:

```js
test('clear required disclosure categories validate without granting release authority', () => {
  const result = validateDisclosureReview(structuredClone(VALID_REVIEW));
  assert.equal(result.valid, true);
  assert.equal(result.decision, 'allow');
  assert.match(result.review_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.release_authorized, false);
  assert.equal(result.transmission_authorized, false);
});
```

```js
test('required not_checked, unsupported, and finding states cannot produce allow', () => {
  for (const [status, severity] of [
    ['not_checked', 'none'],
    ['unsupported', 'none'],
    ['finding', 'high']
  ]) {
    const candidate = structuredClone(VALID_REVIEW);
    candidate.findings[0].status = status;
    candidate.findings[0].severity = severity;
    assert.throws(() => validateDisclosureReview(candidate), /allow requires every required disclosure category to be clear/);
  }
});
```

Also test:

- every required category appears exactly once in `findings`;
- supported category set is exactly `metadata`, `watermark`, `malware`, `embedded-content`, `identity-marker`, `stylometry`, `format-risk`;
- duplicates rejected;
- `clear` requires severity `none`;
- `finding` requires `low|medium|high|critical`;
- `not_checked|unsupported` require severity `none`;
- unknown fields such as `raw_secret`, `participant_id`, `owner_email`, `release_token`, or `sanitized_bytes` are rejected;
- `authority_effect !== 'none'` rejected;
- `decision` only `allow|deny|requires-review`;
- object/profile digests are lowercase 64-char SHA-256 text;
- validator source imports no effect-capable modules.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd mesh
node --test --test-reporter=spec test/disclosure-review.test.mjs
```

Expected: FAIL because `../src/lib/disclosure-review.mjs` does not exist.

- [ ] **Step 3: Commit RED state**

```bash
git add mesh/test/disclosure-review.test.mjs
git commit -m "test: define disclosure firewall evidence boundary"
```

---

### Task 4: Disclosure Review GREEN implementation

**Files:**
- Create: `mesh/src/lib/disclosure-review.mjs`
- Test: `mesh/test/disclosure-review.test.mjs`

**Interfaces:**
- Consumes: `ValidationError`, `assertPlainObject`, `assertString`, `digestObject` from `./canonical.mjs`.
- Produces: `DISCLOSURE_REVIEW_SCHEMA`, `validateDisclosureReview(raw)`.

- [ ] **Step 1: Implement exact-shape validator**

Top-level fields are exactly:

```js
[
  'schema',
  'review_id',
  'object_digest',
  'threat_profile_digest',
  'purpose',
  'required_categories',
  'findings',
  'decision',
  'authority_effect'
]
```

Finding fields are exactly:

```js
['category', 'status', 'severity', 'detector', 'reason_code']
```

Allowed categories:

```js
new Set([
  'metadata',
  'watermark',
  'malware',
  'embedded-content',
  'identity-marker',
  'stylometry',
  'format-risk'
])
```

Allowed statuses: `clear`, `finding`, `not_checked`, `unsupported`.

Allowed severities: `none`, `low`, `medium`, `high`, `critical`.

Decision rule:

```js
const requiredAreClear = requiredCategories.every(category => byCategory.get(category).status === 'clear');
if (review.decision === 'allow' && !requiredAreClear) {
  throw new ValidationError('Disclosure review allow requires every required disclosure category to be clear');
}
```

No `allow` semantics are inferred from a valid review; the returned summary must keep release/transmission authority false.

Return:

```js
Object.freeze({
  valid: true,
  schema: review.schema,
  review_id: review.review_id,
  review_digest: digestObject(review),
  decision: review.decision,
  required_categories: Object.freeze([...review.required_categories]),
  authority_effect: 'none',
  release_authorized: false,
  transmission_authorized: false,
  sanitizer_executed: false
});
```

- [ ] **Step 2: Verify GREEN**

```bash
cd mesh
node --test --test-reporter=spec test/disclosure-review.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run both new test files together**

```bash
cd mesh
node --test --test-reporter=spec test/privacy-threat-profile.test.mjs test/disclosure-review.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mesh/src/lib/disclosure-review.mjs mesh/test/disclosure-review.test.mjs
git commit -m "feat: add effect-inert disclosure review contract"
```

---

### Task 5: Documentation-boundary registration

**Files:**
- Modify: `mesh/src/check-docs.mjs`

**Interfaces:**
- Consumes: approved privacy design/addendum/plan paths.
- Produces: canonical documentation boundary recognizing the approved design lineage and implementation plan.

- [ ] **Step 1: Add exact paths to `CANONICAL_DOCUMENTS`**

Add:

```js
'docs/superpowers/specs/2026-09-03-privacy-preserving-collective-intelligence-design.md',
'docs/superpowers/specs/2026-09-05-privacy-threat-profiles-disclosure-correlation-addendum.md',
'docs/superpowers/plans/2026-09-05-privacy-threat-profile-disclosure-slice1.md',
```

Do not add `REQUIRED_CONTENT` constraints unless `docs:check` shows the project convention requires them for these new documents.

- [ ] **Step 2: Verify documentation boundary**

```bash
cd mesh
npm run docs:check
```

Expected: PASS with no unregistered Markdown caused by this design/plan lineage.

- [ ] **Step 3: Commit**

```bash
git add mesh/src/check-docs.mjs
git commit -m "docs: register privacy threat-profile design lineage"
```

---

### Task 6: Full verification and claim audit

**Files:**
- No new production files unless verification exposes a defect in this slice.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: exact-head evidence that the slice remains effect-inert and does not broaden current capabilities.

- [ ] **Step 1: Run focused tests**

```bash
cd mesh
node --test --test-reporter=spec \
  test/privacy-threat-profile.test.mjs \
  test/disclosure-review.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run the full kernel check**

```bash
cd mesh
npm run check
```

Expected: PASS.

- [ ] **Step 3: Run release verification**

```bash
cd mesh
npm run release:verify
```

Expected: PASS; current build remains `0.12.0-dev.3` with no capability promotion.

- [ ] **Step 4: Inspect diff for authority widening**

Confirm the diff contains no changes to:

- Gateway/Hypervisor/Sandbox/Grid route handling;
- `mesh/config/capabilities.json`;
- production provider/network policy;
- telemetry schemas;
- release status claims.

Confirm new modules contain no effect-capable imports.

- [ ] **Step 5: Commit any verification-only documentation correction if required**

Only if a truthful documentation correction is necessary; otherwise do not create a no-op commit.

---

## Plan self-review

**Spec coverage:** This slice covers the addendum's first executable semantics: effect-inert threat profiles, disclosure-review evidence, anti-downgrade rules, explicit non-authority, semantic digests, and no runtime exposure. Host enforcement, sanitization, anonymous networking, DP/secure aggregation, and production attestation remain deliberately out of scope.

**Placeholder scan:** No implementation step depends on TBD/TODO behavior. Vocabularies, object fields, decisions, return values, and test expectations are explicit.

**Type consistency:** Both validators consume plain JavaScript records, return frozen summary records, and expose lowercase SHA-256 semantic digests named `profile_digest` and `review_digest` respectively.

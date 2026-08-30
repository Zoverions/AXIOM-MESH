# Cognitive Recovery Observability v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an inert evidence layer that records topology-bound cognitive availability, cognitive lineage, multidimensional replacement fidelity, and a deterministic recovery assessment without performing any model/runtime/provider effect.

**Architecture:** Add three strict, content-addressed evidence contracts plus one pure derived report. Each evidence contract binds to one exact Cognitive Topology and exposes validator/digest/resolver functions; the recovery assessment consumes only validated underlying evidence and derives freshness, conflicts, candidate fidelity, sovereignty/persistence posture, and recovery readiness without authorizing a transition.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, JSON Schema 2020-12, existing `mesh/src/lib/canonical.mjs`, `cognitive-topology.mjs`, `model-acquisition-manifest.mjs`, and `persistence-attestation.mjs` primitives.

**Spec:** `docs/superpowers/specs/2026-08-29-cognitive-recovery-observability-design.md`

## Global Constraints

- Schema identifiers are exactly `axiom-cognitive-availability-attestation.v0`, `axiom-cognitive-lineage-manifest.v0`, `axiom-replacement-fidelity-evaluation.v0`, and `axiom-cognitive-recovery-assessment.v0`.
- Versions are exactly `0`.
- Persistent evidence status is exactly `inert-evidence`; the recovery report status is exactly `inert-evidence-report`.
- All evidence contracts are closed-world, content-addressed, and fail closed on malformed identifiers/digests/timestamps, unknown fields, secret-like fields, or activation-boundary changes.
- `contains_secret_material` is exactly `false`; `authority_effect` and `network_effect` are exactly `none`; `runtime_activation` is exactly `false` for persistent evidence contracts.
- Recovery-report authority boundary is exactly no file writes, no network effects, no model loading, no persistence synchronization, no weight acquisition, no substitution/topology mutation, no execution-authority grants, no principal-continuity proof, and no subjective-identity proof.
- Cognitive lineage is never principal/Self Bundle lineage.
- Fidelity scores are dimension-specific normalized evidence only; no field or derived output may represent a universal percentage of identity/sameness.
- Cognitive Continuity Report v0 and all existing v0 contracts remain unchanged.
- No provider API calls, endpoint probes, runtime inspection, benchmark execution, evaluator execution, model invocation, acquisition, persistence export/restore/sync, replacement, topology mutation, self-revision, credential promotion, or capability promotion is added.
- **v0 recovery-candidate clarification:** a recovery candidate must already be a different node in the same exact Cognitive Topology. External/not-yet-declared models require a future topology-proposal/transition slice and are out of scope.
- Cognitive Lineage Manifest v0 and Replacement Fidelity Evaluation v0 therefore bind exact source/reference and destination/candidate node/model pairs in the same exact topology.
- Use existing identifier regex `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$`, lowercase 64-hex digests, and canonical `Date#toISOString()` timestamp equality checks.

## File Structure

### Availability evidence
- Create `mesh/src/lib/cognitive-availability-attestation.mjs` — strict validator, canonical digest, topology resolver, and artifact-match result.
- Create `mesh/config/cognitive-availability-attestation-v0.schema.json` — JSON Schema mirror plus semantic/non-claim annotations.
- Create `mesh/test/cognitive-availability-attestation.test.mjs` — behavior, binding, freshness-shape, artifact, and authority-boundary tests.
- Create `mesh/test/cognitive-availability-attestation-schema.test.mjs` — schema parity/boundary tests.

### Cognitive lineage
- Create `mesh/src/lib/cognitive-lineage-manifest.mjs` — one-edge topology-bound lineage validator/digest/resolver.
- Create `mesh/config/cognitive-lineage-manifest-v0.schema.json`.
- Create `mesh/test/cognitive-lineage-manifest.test.mjs`.
- Create `mesh/test/cognitive-lineage-manifest-schema.test.mjs`.

### Replacement fidelity
- Create `mesh/src/lib/replacement-fidelity-evaluation.mjs` — topology-bound pair validation, suite digest binding, dimension status validation, and deterministic aggregate derivation.
- Create `mesh/config/replacement-fidelity-evaluation-v0.schema.json`.
- Create `mesh/test/replacement-fidelity-evaluation.test.mjs`.
- Create `mesh/test/replacement-fidelity-evaluation-schema.test.mjs`.

### Recovery interpretation
- Create `mesh/src/lib/cognitive-recovery-assessment.mjs` — pure assessment over supplied evidence.
- Create `mesh/test/cognitive-recovery-assessment.test.mjs`.

### Documentation / canonical boundary
- Modify `docs/superpowers/specs/2026-08-29-cognitive-recovery-observability-design.md` — mark written spec approved and record the same-topology candidate clarification plus implemented status after GREEN.
- Modify `mesh/src/check-docs.mjs` — register the spec and this plan if they remain in the supported tree at merge time.

---

### Task 1: Cognitive Availability Attestation v0

**Files:**
- Create: `mesh/test/cognitive-availability-attestation.test.mjs`
- Create: `mesh/src/lib/cognitive-availability-attestation.mjs`
- Create: `mesh/test/cognitive-availability-attestation-schema.test.mjs`
- Create: `mesh/config/cognitive-availability-attestation-v0.schema.json`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError` from `./canonical.mjs`; `cognitiveTopologyDigest`, `validateCognitiveTopology` from `./cognitive-topology.mjs`.
- Produces:
  - `COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA`
  - `validateCognitiveAvailabilityAttestation(document)`
  - `cognitiveAvailabilityAttestationDigest(document)`
  - `resolveCognitiveAvailabilityAttestation(document, topology)`
- Resolver summary includes `availability`, `observation_mode`, `evidence_class`, `observed_artifact_digest`, `artifact_match`, `observed_at`, `valid_until`, evidence/observer references, attestation digest, and zero-authority boundary fields.

**Exact v0 document shape:**

```js
{
  schema: 'axiom-cognitive-availability-attestation.v0',
  version: 0,
  status: 'inert-evidence',
  attestation_id: 'availability.node.primary.v1',
  topology_id: 'topology.personal.v1',
  topology_digest: '<64 hex>',
  node_id: 'node.primary',
  model_id: 'model.primary',
  declared_target: {
    access_mode: 'api',
    custody: 'provider-controlled',
    weight_state: 'closed',
    artifact_digest: null
  },
  observation: {
    availability: 'available',
    observation_mode: 'provider-api',
    evidence_class: 'direct-remote',
    observed_artifact_digest: null
  },
  observer_ref: 'observer.provider.primary.v1',
  evidence: {
    evidence_ref: 'evidence.provider.primary.v1',
    evidence_digest: '<64 hex>'
  },
  observed_at: '2026-08-29T20:00:00.000Z',
  valid_until: '2026-08-29T20:05:00.000Z',
  recorded_at: '2026-08-29T20:00:01.000Z',
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

- [ ] **Step 1: Write the failing behavioral tests**

Create tests proving:

1. valid provider-controlled and owner-acquired attestations validate and digest deterministically;
2. key order does not change the digest;
3. unknown fields and credential/token/cookie-like injected fields fail closed;
4. identifiers/digests/canonical timestamps are strict;
5. `valid_until >= observed_at` and `recorded_at >= observed_at`;
6. availability enum is exactly `available | unavailable | indeterminate`;
7. observation mode enum is exactly `local-artifact | local-runtime | provider-api | remote-runtime | provider-statement | synthetic-probe`;
8. evidence class enum is exactly `direct-local | direct-remote | provider-asserted | synthetic-observed | indirect`;
9. declared target exactly matches the bound topology node access/custody/weight state/artifact digest;
10. owner-addressable `open-acquired | local-proprietary` + `available` requires a 64-hex observed artifact digest;
11. owner-addressable `unavailable | indeterminate` requires observed artifact digest `null`;
12. non-owner-addressable nodes require observed artifact digest `null`;
13. a valid but different owner artifact digest does not make the document malformed: resolver returns `artifact_match: false` so consumers cannot treat it as the declared artifact;
14. exact topology ID/digest and node/model binding fail closed;
15. resolver/validator do not mutate deeply frozen input;
16. production module imports only canonical + cognitive-topology modules.

Representative assertion:

```js
const resolved = resolveCognitiveAvailabilityAttestation(attestation, topology);
assert.equal(resolved.availability, 'available');
assert.equal(resolved.artifact_match, true);
assert.match(resolved.attestation_digest, /^[a-f0-9]{64}$/);
assert.equal(resolved.authority_effect, 'none');
assert.equal(resolved.network_effect, 'none');
assert.equal(resolved.runtime_activation, false);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd mesh && node --test test/cognitive-availability-attestation.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../src/lib/cognitive-availability-attestation.mjs` and no production implementation present.

- [ ] **Step 3: Implement the minimal strict validator/digest/resolver**

Use the existing persistence-attestation exact-object/id/digest/date helper style. Do not add provider/network code. Resolver artifact semantics:

```js
const ownerAddressable = node.weights.state === 'open-acquired'
  || node.weights.state === 'local-proprietary';
const artifactMatch = ownerAddressable && document.observation.availability === 'available'
  ? document.observation.observed_artifact_digest === node.weights.artifact_digest
  : null;
```

A mismatch returns `artifact_match: false`; it is **not** trusted as declared-artifact availability by Task 4.

- [ ] **Step 4: Run focused behavior test and verify GREEN**

Run the same focused command. Expected: all availability behavior tests pass.

- [ ] **Step 5: Write the failing schema-parity test**

Assert JSON Schema 2020-12, closed top-level/nested objects, exact enum domains/constants, identifier/digest patterns, semantic-validator pointer, and non-claims including provider reachability, authority, runtime activation, principal continuity, and subjective identity.

- [ ] **Step 6: Run schema test and verify RED**

```bash
cd mesh && node --test test/cognitive-availability-attestation-schema.test.mjs
```

Expected: failure because `config/cognitive-availability-attestation-v0.schema.json` does not exist.

- [ ] **Step 7: Add the schema mirror**

Set:

```json
"x-axiom-semantic-validator": "mesh/src/lib/cognitive-availability-attestation.mjs"
```

Document semantic rules for exact topology binding, target equality, artifact requirements, timestamp chronology, and resolver-only artifact mismatch detection.

- [ ] **Step 8: Run both Task 1 tests**

```bash
cd mesh && node --test \
  test/cognitive-availability-attestation.test.mjs \
  test/cognitive-availability-attestation-schema.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add mesh/src/lib/cognitive-availability-attestation.mjs \
  mesh/config/cognitive-availability-attestation-v0.schema.json \
  mesh/test/cognitive-availability-attestation.test.mjs \
  mesh/test/cognitive-availability-attestation-schema.test.mjs
git commit -m "Add cognitive availability attestation v0"
```

---

### Task 2: Cognitive Lineage Manifest v0

**Files:**
- Create: `mesh/test/cognitive-lineage-manifest.test.mjs`
- Create: `mesh/src/lib/cognitive-lineage-manifest.mjs`
- Create: `mesh/test/cognitive-lineage-manifest-schema.test.mjs`
- Create: `mesh/config/cognitive-lineage-manifest-v0.schema.json`

**Interfaces:**
- Consumes: canonical digest/validation primitives and Cognitive Topology validation/digest.
- Produces:
  - `COGNITIVE_LINEAGE_MANIFEST_SCHEMA`
  - `validateCognitiveLineageManifest(document)`
  - `cognitiveLineageManifestDigest(document)`
  - `resolveCognitiveLineageManifest(document, topology)`
- One manifest = one exact source-node -> destination-node edge in one exact topology.

**Exact v0 document shape:**

```js
{
  schema: 'axiom-cognitive-lineage-manifest.v0',
  version: 0,
  status: 'inert-evidence',
  lineage_id: 'lineage.primary.to.backup.v1',
  topology_id: 'topology.personal.v1',
  topology_digest: '<64 hex>',
  source: {
    node_id: 'node.primary',
    model_id: 'model.primary',
    artifact_digest: null
  },
  destination: {
    node_id: 'node.backup',
    model_id: 'model.backup',
    artifact_digest: '<64 hex or null>'
  },
  relationship: 'replacement',
  evidence: {
    evidence_ref: 'evidence.lineage.primary.backup.v1',
    evidence_digest: '<64 hex>'
  },
  recorded_at: '2026-08-29T20:10:00.000Z',
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

- [ ] **Step 1: Write failing behavioral tests**

Prove:

1. valid one-edge manifest validates/digests deterministically;
2. source and destination must be different topology nodes;
3. both node/model pairs must exactly match the same bound topology;
4. topology ID/digest mismatch fails closed;
5. relationship enum is exactly `successor | replacement | fine-tuned-descendant | distilled-descendant | quantized-derivative | adapter-derived | provider-version-successor | functionally-unrelated`;
6. owner-addressable node artifact digest must equal the topology artifact digest; non-owner-addressable node artifact digest must be `null`;
7. evidence reference/digest are required;
8. unknown/secret-like fields fail closed;
9. there is no principal/subjective identity proof field or authority effect;
10. frozen inputs are not mutated;
11. imports only canonical + cognitive-topology.

- [ ] **Step 2: Run focused test and verify RED**

```bash
cd mesh && node --test test/cognitive-lineage-manifest.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for production module.

- [ ] **Step 3: Implement strict validator/digest/resolver**

Resolver must validate source and destination independently against topology. Do not infer ancestry from IDs or model names. Return a frozen summary with exact relationship and manifest digest.

- [ ] **Step 4: Run behavior test and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Add failing schema test, then JSON Schema mirror**

Schema is closed-world, one source + one destination only, exact relationship enum, semantic-validator pointer:

```json
"x-axiom-semantic-validator": "mesh/src/lib/cognitive-lineage-manifest.mjs"
```

Non-claims must explicitly include behavioral equivalence, runtime compatibility, principal lineage/continuity, subjective identity, replacement approval, and authority grant.

- [ ] **Step 6: Run Task 2 tests and commit**

```bash
cd mesh && node --test \
  test/cognitive-lineage-manifest.test.mjs \
  test/cognitive-lineage-manifest-schema.test.mjs
```

Expected: PASS.

```bash
git add mesh/src/lib/cognitive-lineage-manifest.mjs \
  mesh/config/cognitive-lineage-manifest-v0.schema.json \
  mesh/test/cognitive-lineage-manifest.test.mjs \
  mesh/test/cognitive-lineage-manifest-schema.test.mjs
git commit -m "Add cognitive lineage manifest v0"
```

---

### Task 3: Replacement Fidelity Evaluation v0

**Files:**
- Create: `mesh/test/replacement-fidelity-evaluation.test.mjs`
- Create: `mesh/src/lib/replacement-fidelity-evaluation.mjs`
- Create: `mesh/test/replacement-fidelity-evaluation-schema.test.mjs`
- Create: `mesh/config/replacement-fidelity-evaluation-v0.schema.json`

**Interfaces:**
- Consumes: canonical digest/validation, Cognitive Topology, and optionally Cognitive Lineage resolver/digest.
- Produces:
  - `REPLACEMENT_FIDELITY_EVALUATION_SCHEMA`
  - `SUPPORTED_FIDELITY_DIMENSIONS`
  - `replacementFidelitySuiteDigest(suite)`
  - `deriveReplacementFidelityClass(suite, dimensions)`
  - `validateReplacementFidelityEvaluation(document)`
  - `replacementFidelityEvaluationDigest(document)`
  - `resolveReplacementFidelityEvaluation(document, topology, lineageManifests = [])`

**Exact suite descriptor:**

```js
{
  suite_id: 'suite.personal.recovery.v1',
  suite_digest: '<digest of descriptor without suite_digest>',
  required_dimensions: [
    'capability-fidelity',
    'preference-fidelity',
    'safety-policy-fidelity'
  ],
  aggregation_rules: {
    degraded_result: 'acceptable-with-degradation',
    fail_result: 'incompatible'
  }
}
```

`required_dimensions` must be unique and lexicographically sorted. `suite_digest` is exactly:

```js
digestObject({
  suite_id: suite.suite_id,
  required_dimensions: suite.required_dimensions,
  aggregation_rules: suite.aggregation_rules
})
```

**Supported dimensions:**

```text
capability-fidelity
preference-fidelity
behavioral-fidelity
epistemic-fidelity
safety-policy-fidelity
style-personality-fidelity
memory-use-fidelity
relationship-fidelity
robustness-fidelity
```

**Per-dimension normalized evidence:**

```js
{
  dimension_id: 'capability-fidelity',
  metric_ref: 'metric.capability.normalized.v1',
  metric_digest: '<64 hex>',
  measured_score: 0.93,
  thresholds: {
    degraded_min: 0.70,
    pass_min: 0.90
  },
  sample_count: 100,
  confidence: 'high',
  evidence_ref: 'evidence.capability.v1',
  evidence_digest: '<64 hex>',
  status: 'pass'
}
```

Rules:
- `0 <= degraded_min <= pass_min <= 1`;
- `measured_score` is `null` only for `indeterminate`, otherwise a finite number in `[0, 1]`;
- non-null score `>= pass_min` => `pass`;
- non-null score `>= degraded_min` and `< pass_min` => `degraded`;
- non-null score `< degraded_min` => `fail`;
- `confidence` is exactly `low | medium | high | unknown`;
- `sample_count` is integer `0..1_000_000`;
- normalized score is explicitly dimension-specific and never interpreted as identity sameness.

**Aggregate order (strongest -> weakest):**

```text
high-fidelity
acceptable-with-degradation
insufficient-evidence
materially-degraded
incompatible
```

For every suite-required dimension, derive a constraint:
- `pass` => no downgrade;
- `indeterminate` => at best `insufficient-evidence`;
- `degraded` => `suite.aggregation_rules.degraded_result` where allowed values are `acceptable-with-degradation | materially-degraded`;
- `fail` => `suite.aggregation_rules.fail_result` where allowed values are `materially-degraded | incompatible`.

The aggregate is the weakest constraint. `high-fidelity` therefore requires all required dimensions to pass.

**Exact evaluation shape:**

```js
{
  schema: 'axiom-replacement-fidelity-evaluation.v0',
  version: 0,
  status: 'inert-evidence',
  evaluation_id: 'evaluation.primary.to.backup.v1',
  topology_id: 'topology.personal.v1',
  topology_digest: '<64 hex>',
  reference: {
    node_id: 'node.primary',
    model_id: 'model.primary',
    artifact_digest: null
  },
  candidate: {
    node_id: 'node.backup',
    model_id: 'model.backup',
    artifact_digest: '<64 hex or null>'
  },
  lineage: {
    lineage_id: 'lineage.primary.to.backup.v1',
    lineage_digest: '<64 hex>'
  },
  suite: { /* exact descriptor above */ },
  dimensions: [ /* unique dimension_id entries */ ],
  aggregate_class: 'high-fidelity',
  evaluator_ref: 'evaluator.recovery.v1',
  evaluated_at: '2026-08-29T20:20:00.000Z',
  recorded_at: '2026-08-29T20:21:00.000Z',
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

`lineage` is nullable as a whole. If non-null, ID/digest must resolve to exactly the same reference/candidate pair.

- [ ] **Step 1: Write failing behavior tests**

Cover:

1. topology/reference/candidate exact binding and distinct nodes;
2. exact artifact digest parity with topology when owner-addressable;
3. deterministic suite digest;
4. changed suite ID/dimensions/rules requires changed suite digest;
5. required dimensions are sorted, unique, supported, and explicitly present;
6. dimension IDs are unique/supported;
7. score/threshold/status consistency;
8. required indeterminate prevents high fidelity;
9. deterministic aggregate for pass/degraded/fail/indeterminate combinations;
10. supplied aggregate stronger than derived aggregate fails closed;
11. optional lineage resolves to same topology pair when supplied;
12. evaluator/evidence provenance and chronology are strict;
13. no identity-percentage/sameness field is accepted; unknown field rejection proves this;
14. secret-like injections and activation effects fail closed;
15. frozen input/non-mutation and restricted imports.

- [ ] **Step 2: Run focused test and verify RED**

```bash
cd mesh && node --test test/replacement-fidelity-evaluation.test.mjs
```

Expected: missing production module.

- [ ] **Step 3: Implement suite digest, dimension derivation, aggregate derivation, validator/digest/resolver**

Keep all classification pure/deterministic. Do not invoke a benchmark or model. The resolver may accept supplied lineage manifests but must not discover/fetch them.

- [ ] **Step 4: Run behavior test and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Add failing schema test and JSON Schema mirror**

Use closed-world nested objects, score bounds, exact enums, semantic-validator pointer:

```json
"x-axiom-semantic-validator": "mesh/src/lib/replacement-fidelity-evaluation.mjs"
```

Non-claims include benchmark execution, model equivalence, principal continuity, subjective identity, replacement approval, authority/network/runtime effects.

- [ ] **Step 6: Run Task 3 tests and commit**

```bash
cd mesh && node --test \
  test/replacement-fidelity-evaluation.test.mjs \
  test/replacement-fidelity-evaluation-schema.test.mjs
```

Expected: PASS.

```bash
git add mesh/src/lib/replacement-fidelity-evaluation.mjs \
  mesh/config/replacement-fidelity-evaluation-v0.schema.json \
  mesh/test/replacement-fidelity-evaluation.test.mjs \
  mesh/test/replacement-fidelity-evaluation-schema.test.mjs
git commit -m "Add replacement fidelity evaluation v0"
```

---

### Task 4: Cognitive Recovery Assessment v0

**Files:**
- Create: `mesh/test/cognitive-recovery-assessment.test.mjs`
- Create: `mesh/src/lib/cognitive-recovery-assessment.mjs`

**Interfaces:**
- Consumes:
  - `digestObject`, `ValidationError`;
  - Cognitive Topology validator/digest;
  - `resolveCognitiveAvailabilityAttestation`;
  - `resolveModelAcquisitionManifest`;
  - `resolvePersistenceAttestation`;
  - `resolveCognitiveLineageManifest`;
  - `resolveReplacementFidelityEvaluation`.
- Produces:
  - `COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA = 'axiom-cognitive-recovery-assessment.v0'`
  - `buildCognitiveRecoveryAssessment(topology, inputs)`

**Exact input shape:**

```js
{
  assessment_at: '2026-08-29T20:30:00.000Z',
  availability_attestations: [],
  persistence_attestations: [],
  acquisition_manifests: [],
  lineage_manifests: [],
  fidelity_evaluations: []
}
```

No nested Cognitive Continuity Report is accepted.

**Fresh availability resolution:**

For each topology node:
1. resolve every supplied attestation against the topology;
2. mark attestation stale if `assessment_at > valid_until`;
3. stale attestations remain in evidence summaries/warnings but do not contribute a fresh state;
4. fresh `available` with `artifact_match === false` contributes `indeterminate` plus `artifact-digest-mismatch` warning;
5. no fresh attestation => node effective state `indeterminate`;
6. one or more fresh attestations all yielding the same effective state => that state;
7. fresh effective states disagree => node effective state `indeterminate` and surface all conflicting attestation IDs/digests.

**Recovery-required node:** any node whose `continuity_importance !== 'optional' || fidelity_importance !== 'optional'` and whose effective model availability is `unavailable` or `indeterminate`.

- `indeterminate` required node makes aggregate recovery readiness `indeterminate`; AXIOM does not infer a provider/model failure from insufficient freshness/conflicting evidence.
- `unavailable` required node is eligible for candidate assessment.
- Optional unavailable/indeterminate nodes remain warnings and do not by themselves trigger recovery.

**Candidate rules for one unavailable reference node:**
- candidate is a different node in the same topology;
- candidate effective availability must be `available`;
- at least one lineage manifest must exactly connect reference -> candidate;
- a matching fidelity evaluation must bind the same pair;
- `high-fidelity` evaluation => per-reference `recoverable-high-fidelity`;
- `acceptable-with-degradation` => `recoverable-with-degradation`;
- `insufficient-evidence`, missing evaluation, missing lineage, conflicting evaluation classes, or artifact mismatch => `candidate-available-insufficient-evidence`;
- `materially-degraded | incompatible` does not count as an acceptable candidate.

If several candidates exist, preserve all candidate summaries sorted by candidate node ID. Per-reference readiness uses the best supported class in this order:

```text
recoverable-high-fidelity
recoverable-with-degradation
candidate-available-insufficient-evidence
blocked-no-acceptable-candidate
```

For multiple unavailable required reference nodes, aggregate readiness is the weakest per-reference readiness. If no required node needs recovery, return `no-recovery-needed`. Any required node with effective `indeterminate` returns aggregate `indeterminate` regardless of other candidates.

**Persistence/sovereignty posture:**
- resolve at most one Persistence Attestation per node; duplicates fail closed;
- missing durable persistence evidence => `unknown`;
- preserve declared + observed exportability;
- resolve at most one Model Acquisition Manifest per owner-addressable node; duplicates fail closed;
- candidate sovereignty states reuse the existing conceptual vocabulary: `verified-owner-artifact`, `declared-owner-artifact-unverified`, `artifact-digest-mismatch`, `provider-dependent`, `mirrored`, `shared-dependent`, `owner-controlled`;
- these postures are descriptive and do not independently authorize/reject a candidate unless artifact mismatch makes its model availability indeterminate.

**Exact report authority boundary:**

```js
{
  writes_files: false,
  performs_network_effects: false,
  loads_models: false,
  synchronizes_persistence: false,
  acquires_weights: false,
  performs_substitution: false,
  mutates_topology: false,
  grants_execution_authority: false,
  proves_principal_continuity: false,
  proves_subjective_identity: false
}
```

**Report shape:**

```js
{
  schema: 'axiom-cognitive-recovery-assessment.v0',
  version: 0,
  status: 'inert-evidence-report',
  topology: {
    topology_id: '<id>',
    topology_digest: '<64 hex>'
  },
  assessment_at: '<canonical timestamp>',
  recovery_readiness: 'recoverable-with-degradation',
  blockers: [],
  warnings: [],
  nodes: [],
  recovery_cases: [],
  authority_boundary: { /* exact object above */ },
  report_digest: '<64 hex>'
}
```

- [ ] **Step 1: Write failing recovery-assessment tests**

At minimum prove:

1. all important/critical dependencies fresh+available => `no-recovery-needed`;
2. stale last availability evidence => required node indeterminate => aggregate `indeterminate`;
3. conflicting fresh availability => indeterminate with both evidence refs surfaced;
4. owner artifact mismatch cannot be treated as available;
5. unavailable primary + available same-topology candidate + exact lineage + high-fidelity evaluation => `recoverable-high-fidelity`;
6. same with acceptable degradation => `recoverable-with-degradation`;
7. available candidate missing/insufficient evaluation or missing lineage => `candidate-available-insufficient-evidence`;
8. only materially degraded/incompatible or unavailable candidates => `blocked-no-acceptable-candidate`;
9. optional node loss does not trigger recovery;
10. multiple required failures aggregate to weakest supported readiness;
11. persistence/acquisition/sovereignty summaries remain visible and deterministic;
12. duplicate/conflicting exact evidence identities fail closed where the contract requires uniqueness;
13. report order/digest is deterministic across reordered input arrays;
14. report and nested arrays/objects are deeply frozen;
15. principal continuity and subjective identity remain explicitly false/not-proven;
16. import boundary contains only canonical/topology + the five public evidence resolvers listed above.

- [ ] **Step 2: Run focused test and verify RED**

```bash
cd mesh && node --test test/cognitive-recovery-assessment.test.mjs
```

Expected: missing production module.

- [ ] **Step 3: Implement the pure assessment**

Use sorted maps/arrays and stable issue strings. Suggested warning/blocker forms:

```text
availability:<node>:stale:<attestation_id>
availability:<node>:conflict
availability:<node>:artifact-digest-mismatch
recovery:<reference>:candidate-insufficient:<candidate>
recovery:<reference>:no-acceptable-candidate
persistence:<node>:unknown
```

Do not call `buildCognitiveContinuityReport`; derive from exact supplied evidence/resolvers as required by the spec.

- [ ] **Step 4: Run focused test and verify GREEN**

Expected: PASS.

- [ ] **Step 5: Run all new feature tests together**

```bash
cd mesh && node --test \
  test/cognitive-availability-attestation.test.mjs \
  test/cognitive-availability-attestation-schema.test.mjs \
  test/cognitive-lineage-manifest.test.mjs \
  test/cognitive-lineage-manifest-schema.test.mjs \
  test/replacement-fidelity-evaluation.test.mjs \
  test/replacement-fidelity-evaluation-schema.test.mjs \
  test/cognitive-recovery-assessment.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add mesh/src/lib/cognitive-recovery-assessment.mjs \
  mesh/test/cognitive-recovery-assessment.test.mjs
git commit -m "Add cognitive recovery assessment v0"
```

---

### Task 5: Canonical documentation, regression verification, and merge gate

**Files:**
- Modify: `docs/superpowers/specs/2026-08-29-cognitive-recovery-observability-design.md`
- Modify: `mesh/src/check-docs.mjs`
- Keep: `docs/superpowers/plans/2026-08-29-cognitive-recovery-observability-v0.md`

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: canonical supported-document registration, implementation-status truth, and exact-head CI evidence.

- [ ] **Step 1: Update the canonical spec after implementation is GREEN**

Change status to implemented inert evidence layer and explicitly record:

- same-topology candidate restriction for v0;
- the three persistent schemas/modules;
- recovery assessment module;
- no live observers/evaluators/migration effects;
- future activation sequence remains separate.

- [ ] **Step 2: Register spec and plan in `CANONICAL_DOCUMENTS`**

Add exactly:

```js
'docs/superpowers/specs/2026-08-29-cognitive-recovery-observability-design.md',
'docs/superpowers/plans/2026-08-29-cognitive-recovery-observability-v0.md',
```

beside the other 2026-08-29 superpowers docs. Do not alter unrelated required-content assertions.

- [ ] **Step 3: Run the full repository verification surface**

Authoritative protected CI must prove on the exact final head:

- `verify` / Clean Kernel;
- `container` including deny-egress, network segmentation, and service isolation;
- `compatibility-node-22`;
- Windows compatibility;
- macOS ARM and Intel compatibility;
- `Analyze (actions)`;
- `Analyze (javascript-typescript)`.

Clean Kernel must also complete its signed operational drills: credential history, recovery, backup lifecycle, SLO/restart, resilience, mTLS, service isolation, node scheduling, online causal exchange, telemetry, credential rotation, data-key rotation, provider conformance, runtime adapter, pilot dossier/package, independent security review intake, and incident tabletop.

- [ ] **Step 4: Review exact changed-file set**

Expected implementation files are only the new modules/schemas/tests, the approved spec/plan, and canonical-doc registration. Confirm no changes to:

```text
mesh/config/capabilities.json
Gateway
Hypervisor
Sandbox
Grid
principal/credential stores
network policy
provider transports
runtime activation
production promotion
```

- [ ] **Step 5: Verify non-claims in PR description**

State explicitly:

- no live availability probing;
- no provider reachability proof merely from provider statements;
- no benchmark/model evaluator execution;
- no model loading/invocation/acquisition;
- no persistence sync/export/restore;
- no automatic substitution/topology mutation;
- no authority/capability/credential promotion;
- no principal-continuity proof;
- no subjective-identity claim;
- v0 candidates are limited to already-declared same-topology nodes.

- [ ] **Step 6: Merge only with immutable-head protection**

Use the exact final PR head SHA as the merge guard. If draft->ready transition is connector-broken again, preserve provenance by closing the draft and opening a non-draft replacement PR from the identical branch/head, rerun protected merge-candidate checks, and merge only the green replacement.

- [ ] **Step 7: Verify post-merge `main`**

Confirm `main` points to the merge commit, fetch one new implementation module from `main`, and verify post-merge Clean Kernel/container/CodeQL runs succeed before claiming completion.

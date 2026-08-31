# Cognitive Capability Surface Report v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a deterministic, deeply frozen, zero-authority `axiom-cognitive-capability-surface-report.v0` contract that aggregates exact Capability Observation v0 artifacts for one exact Cognitive Capability Profile into a contextual evidence surface without scoring, ranking, routing, or authority amplification.

**Architecture:** Add one pure contract module that validates, derives, digests, and verifies Surface Reports using only canonical digest helpers plus the existing Cognitive Capability Profile and Capability Observation contracts. Derivation classifies observations relative to explicit `assessment_at`, groups only current observations into exact content-addressed comparison cells, preserves conflict/variation/evaluator/failure/resource evidence without winner selection, and re-derives reports for verification. Mirror the executable contract in JSON Schema only after behavior is green, then register the approved spec and plan as canonical documentation.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, existing `digestObject` / `ValidationError` helpers, JSON Schema Draft 2020-12, protected GitHub Actions Clean Kernel + Node 22 + container + Windows/macOS compatibility workflows.

**Spec:** `docs/superpowers/specs/2026-08-31-cognitive-capability-surface-report-v0-design.md`

## Global Constraints

- Schema identity is exactly `axiom-cognitive-capability-surface-report.v0`; version is `0`; status is `inert-evidence-report`.
- A report binds to exactly one Cognitive Capability Profile using exact `profile_id` plus recomputed canonical `profile_digest`.
- Source observation set is bounded to 0-256 entries; duplicate `observation_id` values and duplicate canonical observation digests fail closed.
- Derivation and verification never read the wall clock; callers supply canonical `assessment_at` and `recorded_at`, with `recorded_at >= assessment_at`.
- Freshness precedence is exact: `future` if `observed_at > assessment_at`; else `not-yet-recorded` if `recorded_at > assessment_at`; else `stale` if `valid_until < assessment_at`; else `current`.
- Only `current` observations participate in evidence cells, conflict/variation, evaluator/assurance coverage, failure-mode aggregation, and resource ranges.
- Every capability declared by the exact bound profile appears in `capability_surfaces`, even when it has zero observations; absence of evidence is never converted to failure.
- Comparison cells group only observations with exactly identical capability/context/task-family/difficulty/environment/toolset/suite/metric-set/threshold/method references and digests.
- Same-cell `pass + fail` is `direct`; more than one distinct non-`indeterminate` classification without pass+fail is `mixed`; otherwise `none`.
- Cross-cell variation is descriptive and must never be relabeled as direct contradiction.
- No universal score, normalized benchmark score, majority winner, candidate rank, routing weight, averaged confidence, or hidden policy utility may be emitted.
- Evaluator references remain distinct evidence references; v0 never infers statistical independence.
- Resource aggregation buckets only exact `resource_class + basis + unit`; observed/estimated/unlike units never combine; `measurement_count` counts resource entries while supporting observations are independently deduplicated; no averages or unit conversion.
- Every report hard-codes: `contains_secret_material:false`, `authority_effect:'none'`, `network_effect:'none'`, `training_effect:'none'`, `spend_effect:'none'`, `runtime_activation:false`, `selection_effect:'evidence-only'`.
- Contract source must import only `./canonical.mjs`, `./cognitive-capability-profile.mjs`, and `./cognitive-capability-observation.mjs`; no network, provider, Grid, credential, wallet, filesystem-discovery, subprocess, model-runtime, training, spend, routing, topology, or Ledger effect surface.
- Input arrays and objects must not be mutated. Derived report and verification summaries must be deeply frozen.
- Canonical ordering is normative and verifier rejects non-canonical supplied reports rather than silently accepting reordered equivalents.

---

## File Structure

- `mesh/src/lib/cognitive-capability-surface-report.mjs` — strict semantic validator, canonical digest, deterministic derivation, exact-cell/resource helpers, deep-freeze, and re-derivation verifier. No I/O.
- `mesh/test/cognitive-capability-surface-report.test.mjs` — behavioral, adversarial, deterministic-order, immutability, import-boundary, and verifier tests.
- `mesh/config/cognitive-capability-surface-report-v0.schema.json` — Draft 2020-12 structural mirror plus semantic-rule/non-claim annotations.
- `mesh/test/cognitive-capability-surface-report-schema.test.mjs` — schema parity, strictness, enum/order/boundary/non-claim assertions.
- `mesh/src/check-docs.mjs` — add exactly the approved Surface Report spec and implementation-plan paths to `CANONICAL_DOCUMENTS`; do not change checker logic.

---

### Task 1: Baseline Report Contract, Freshness, and Exact Source Binding

**Files:**
- Create: `mesh/test/cognitive-capability-surface-report.test.mjs`
- Create: `mesh/src/lib/cognitive-capability-surface-report.mjs`

**Interfaces:**
- Consumes: `validateCognitiveCapabilityProfile(profile)`, `cognitiveCapabilityProfileDigest(profile)`, `validateCognitiveCapabilityObservation(observation)`, `cognitiveCapabilityObservationDigest(observation)`, `digestObject(value)`, `ValidationError`.
- Produces:
  - `COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA = 'axiom-cognitive-capability-surface-report.v0'`
  - `validateCognitiveCapabilitySurfaceReport(document)`
  - `cognitiveCapabilitySurfaceReportDigest(document)`
  - `deriveCognitiveCapabilitySurfaceReport({ report_id, profile, observations, assessment_at, recorded_at })`
  - initial report shape with canonical observation inventory and one capability surface per declared capability.

- [ ] **Step 1: Write the failing baseline behavioral tests**

Create `mesh/test/cognitive-capability-surface-report.test.mjs` with reusable `validProfile()` and `validObservation()` fixtures copied structurally from `cognitive-capability-observation.test.mjs`, then add tests equivalent to:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveCapabilityProfileDigest } from '../src/lib/cognitive-capability-profile.mjs';
import { cognitiveCapabilityObservationDigest } from '../src/lib/cognitive-capability-observation.mjs';
import {
  COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
  cognitiveCapabilitySurfaceReportDigest,
  deriveCognitiveCapabilitySurfaceReport,
  validateCognitiveCapabilitySurfaceReport
} from '../src/lib/cognitive-capability-surface-report.mjs';

test('derives a deterministic inert report and represents declared-but-unobserved capabilities', () => {
  const profile = validProfile();
  const observation = validObservation(profile, {
    observation_id: 'capobs.reasoning.current.v1',
    capability: 'reasoning'
  });
  const report = deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.example.v1',
    profile,
    observations: [observation],
    assessment_at: '2026-08-31T13:00:00.000Z',
    recorded_at: '2026-08-31T13:01:00.000Z'
  });

  assert.equal(COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA, report.schema);
  assert.equal(report.profile_id, profile.profile_id);
  assert.equal(report.profile_digest, cognitiveCapabilityProfileDigest(profile));
  assert.deepEqual(report.observations.map(item => item.freshness_class), ['current']);
  assert.deepEqual(report.capability_surfaces.map(item => item.capability), [
    'reasoning', 'research', 'summarization'
  ]);
  const research = report.capability_surfaces.find(item => item.capability === 'research');
  assert.deepEqual(research.observation_counts, {
    current: 0, stale: 0, future: 0, not_yet_recorded: 0
  });
  assert.deepEqual(research.current_cells, []);
  assert.equal(research.declared, true);
  assert.equal(report.authority_effect, 'none');
  assert.equal(report.selection_effect, 'evidence-only');
  assert.equal(Object.isFrozen(report), true);
  assert.match(cognitiveCapabilitySurfaceReportDigest(report), /^[a-f0-9]{64}$/);
});

test('freshness classification is time-travel safe and follows normative precedence', () => {
  const profile = validProfile();
  const current = validObservation(profile, { observation_id: 'obs.current' });
  const stale = validObservation(profile, {
    observation_id: 'obs.stale',
    valid_until: '2026-08-31T12:30:00.000Z'
  });
  const future = validObservation(profile, {
    observation_id: 'obs.future',
    observed_at: '2026-08-31T14:00:00.000Z',
    recorded_at: '2026-08-31T14:01:00.000Z',
    valid_until: '2026-09-30T14:00:00.000Z'
  });
  const notRecorded = validObservation(profile, {
    observation_id: 'obs.not-recorded',
    observed_at: '2026-08-31T12:10:00.000Z',
    recorded_at: '2026-08-31T14:00:00.000Z'
  });
  const report = deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.time.v1',
    profile,
    observations: [future, notRecorded, stale, current],
    assessment_at: '2026-08-31T13:00:00.000Z',
    recorded_at: '2026-08-31T13:10:00.000Z'
  });
  assert.deepEqual(
    Object.fromEntries(report.observations.map(item => [item.observation_id, item.freshness_class])),
    {
      'obs.current': 'current',
      'obs.future': 'future',
      'obs.not-recorded': 'not-yet-recorded',
      'obs.stale': 'stale'
    }
  );
});

test('derivation rejects profile drift and duplicate source identity', () => {
  const profile = validProfile();
  const observation = validObservation(profile);
  const duplicateId = structuredClone(observation);
  duplicateId.result.classification = 'fail';
  duplicateId.result.observed_metric_digest = 'f'.repeat(64);
  assert.throws(() => deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.duplicate.v1', profile,
    observations: [observation, duplicateId],
    assessment_at: '2026-08-31T13:00:00.000Z',
    recorded_at: '2026-08-31T13:01:00.000Z'
  }), /duplicate.*observation_id/i);

  const duplicateDigest = structuredClone(observation);
  duplicateDigest.observation_id = observation.observation_id;
  assert.equal(cognitiveCapabilityObservationDigest(duplicateDigest), cognitiveCapabilityObservationDigest(observation));
});
```

Also add fail-closed tests for malformed report IDs/timestamps, `recorded_at < assessment_at`, boundary widening, unknown report fields, and deeply frozen fixture input.

- [ ] **Step 2: Run the new test and prove RED**

Run from repository root:

```bash
cd mesh && node --test test/cognitive-capability-surface-report.test.mjs
```

Expected: FAIL because `../src/lib/cognitive-capability-surface-report.mjs` does not exist. In the connector-only execution environment, reproduce this through a clean verification PR whose only new executable change is the test file; do not count a docs-registration failure as the RED proof.

- [ ] **Step 3: Implement the minimal baseline contract**

Create `mesh/src/lib/cognitive-capability-surface-report.mjs` beginning with only these imports:

```js
import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveCapabilityProfileDigest,
  validateCognitiveCapabilityProfile
} from './cognitive-capability-profile.mjs';
import {
  cognitiveCapabilityObservationDigest,
  validateCognitiveCapabilityObservation
} from './cognitive-capability-observation.mjs';
```

Implement exact plain-object/identifier/digest/timestamp/safe-integer helpers following neighboring cognitive contracts. Implement `classifyFreshness(observation, assessmentAtMs)` exactly:

```js
if (Date.parse(observation.observed_at) > assessmentAtMs) return 'future';
if (Date.parse(observation.recorded_at) > assessmentAtMs) return 'not-yet-recorded';
if (Date.parse(observation.valid_until) < assessmentAtMs) return 'stale';
return 'current';
```

Implement canonical capability order as:

```js
const CAPABILITY_ORDER = Object.freeze([
  'reasoning', 'coding', 'vision', 'computer-use', 'research', 'planning',
  'critique', 'summarization', 'embedding', 'tool-use', 'agent-orchestration', 'other'
]);
```

For the baseline, derive observation inventory plus capability entries and current cell containers. Current observations may initially form one exact cell each until Task 2 adds multi-observation grouping/conflict/resource semantics. Every emitted capability surface already uses the final field names so Task 2 extends values rather than changes interfaces.

`validateCognitiveCapabilitySurfaceReport` must enforce exact top-level fields, schema/version/status, canonical timestamps, report/profile identifiers/digests, 0-256 observations, exact hard boundaries, canonical observation ordering, and canonical capability ordering. It must not accept undeclared/extra capability surfaces.

- [ ] **Step 4: Run baseline tests and prove GREEN**

Run:

```bash
cd mesh && node --test test/cognitive-capability-surface-report.test.mjs
```

Expected: PASS for Task 1 tests. In protected CI, require the exact test+module head to pass `Verify clean kernel`; also confirm pinned Node 22 and container jobs remain green before advancing.

- [ ] **Step 5: Commit Task 1**

```bash
git add mesh/test/cognitive-capability-surface-report.test.mjs \
        mesh/src/lib/cognitive-capability-surface-report.mjs
git commit -m "feat: add capability surface report baseline"
```

---

### Task 2: Exact Cells, Conflict/Variation, Evidence Coverage, Resources, and Verifier

**Files:**
- Modify: `mesh/test/cognitive-capability-surface-report.test.mjs`
- Modify: `mesh/src/lib/cognitive-capability-surface-report.mjs`

**Interfaces:**
- Consumes: Task 1 public functions.
- Produces: final deterministic cell aggregation and `verifyCognitiveCapabilitySurfaceReport(document, profile, observations)`.

- [ ] **Step 1: Add failing aggregation and verifier tests**

Extend the behavioral test with exact cases:

```js
test('same exact cell preserves direct conflict without choosing a winner', () => {
  const profile = validProfile();
  const pass = validObservation(profile, {
    observation_id: 'obs.pass',
    classification: 'pass'
  });
  const fail = validObservation(profile, {
    observation_id: 'obs.fail',
    classification: 'fail',
    observed_metric_ref: 'metric-result.fail.v1',
    observed_metric_digest: 'f'.repeat(64),
    failure_mode_refs: ['failure.reasoning.logic']
  });
  const report = deriveAt13(profile, [fail, pass]);
  const reasoning = report.capability_surfaces.find(item => item.capability === 'reasoning');
  assert.equal(reasoning.current_cells.length, 1);
  const [cell] = reasoning.current_cells;
  assert.deepEqual(cell.classification_counts, {
    pass: 1, degraded: 0, fail: 1, indeterminate: 0
  });
  assert.deepEqual(cell.classification_set, ['pass', 'fail']);
  assert.equal(cell.conflict_class, 'direct');
  assert.equal(reasoning.direct_conflict_cells, 1);
  assert.equal(Object.hasOwn(cell, 'winner'), false);
  assert.equal(Object.hasOwn(reasoning, 'score'), false);
});

test('different exact contexts produce variation rather than direct conflict', () => {
  const profile = validProfile();
  const pass = validObservation(profile, { observation_id: 'obs.tools.pass' });
  const fail = validObservation(profile, {
    observation_id: 'obs.no-tools.fail',
    classification: 'fail',
    context_ref: 'context.reasoning.other.v1',
    context_digest: 'f'.repeat(64),
    observed_metric_ref: 'metric-result.other.v1',
    observed_metric_digest: 'e'.repeat(64)
  });
  const reasoning = deriveAt13(profile, [pass, fail]).capability_surfaces[0];
  assert.equal(reasoning.current_cells.length, 2);
  assert.equal(reasoning.direct_conflict_cells, 0);
  assert.equal(reasoning.variation_present, true);
});

test('resource ranges count measurements and deduplicate supporting observations', () => {
  const profile = validProfile();
  const observation = validObservation(profile, { observation_id: 'obs.resources' });
  observation.resource_observations = [
    { resource_class: 'input-tokens', basis: 'observed', amount: 100, unit: 'tokens', source_ref: null },
    { resource_class: 'input-tokens', basis: 'observed', amount: 140, unit: 'tokens', source_ref: null },
    { resource_class: 'input-tokens', basis: 'estimated', amount: 120, unit: 'tokens', source_ref: null },
    { resource_class: 'energy', basis: 'unknown', amount: null, unit: null, source_ref: null }
  ];
  const reasoning = deriveAt13(profile, [observation]).capability_surfaces[0];
  const observed = reasoning.current_resource_ranges.find(item =>
    item.resource_class === 'input-tokens' && item.basis === 'observed');
  assert.equal(observed.measurement_count, 2);
  assert.equal(observed.minimum, 100);
  assert.equal(observed.maximum, 140);
  assert.equal(observed.supporting_observations.length, 1);
  assert.notEqual(
    reasoning.current_resource_ranges.find(item => item.basis === 'estimated'),
    undefined
  );
});

test('verifier rejects any derived-field tampering or source-set drift', () => {
  const profile = validProfile();
  const observation = validObservation(profile);
  const report = deriveAt13(profile, [observation]);
  const tampered = structuredClone(report);
  tampered.capability_surfaces[0].observation_counts.current = 99;
  assert.throws(() => verifyCognitiveCapabilitySurfaceReport(tampered, profile, [observation]), /re-deriv|digest|mismatch/i);
  assert.throws(() => verifyCognitiveCapabilitySurfaceReport(report, profile, []), /observation.*set|inventory|mismatch/i);
});
```

Add companion tests for:

- `pass + degraded -> mixed`;
- `degraded + fail -> mixed`;
- `pass + indeterminate -> none`;
- evaluator kind/ref and assurance unique sorted coverage;
- repeated failure-mode refs preserve exact supporting source pairs and synthesize no causal confidence;
- stale/future/not-yet-recorded observations excluded from cells and current aggregates;
- observed and estimated resource bases stay separate;
- different units stay separate;
- unknown basis produces null min/max;
- input observation ordering produces byte-equivalent derived object / identical canonical digest;
- structurally valid but non-canonical ordering fails verifier;
- `confidence` is not aggregated into any report field;
- output nested arrays/objects are deeply frozen;
- source inputs remain unchanged;
- source imports exactly the three allowed helper modules.

- [ ] **Step 2: Run the expanded test and prove RED**

Run:

```bash
cd mesh && node --test test/cognitive-capability-surface-report.test.mjs
```

Expected: FAIL because Task 1 does not yet implement same-cell grouping, conflict/variation/resource aggregation, and verifier semantics. In protected CI, establish RED on a child verification branch from the known-green Task 1 head.

- [ ] **Step 3: Implement exact comparison cells**

Create a cell-dimension object using exactly:

```js
{
  capability: observation.capability,
  context_ref: observation.context.context_ref,
  context_digest: observation.context.context_digest,
  task_family_ref: observation.context.task_family_ref,
  task_family_digest: observation.context.task_family_digest,
  difficulty_class: observation.context.difficulty_class,
  environment_ref: observation.context.environment_ref,
  environment_digest: observation.context.environment_digest,
  toolset_ref: observation.context.toolset_ref,
  toolset_digest: observation.context.toolset_digest,
  suite_ref: observation.evaluation.suite_ref,
  suite_digest: observation.evaluation.suite_digest,
  metric_set_ref: observation.evaluation.metric_set_ref,
  metric_set_digest: observation.evaluation.metric_set_digest,
  threshold_ref: observation.evaluation.threshold_ref,
  threshold_digest: observation.evaluation.threshold_digest,
  method_ref: observation.evaluation.method_ref,
  method_digest: observation.evaluation.method_digest
}
```

Use `digestObject(dimensions)` as `cell_digest`. Group only `current` observations by that digest and sort cells lexically.

Derive classification counts and fixed-order set. Conflict logic is exactly:

```js
if (counts.pass > 0 && counts.fail > 0) return 'direct';
const represented = ['pass', 'degraded', 'fail'].filter(name => counts[name] > 0);
return represented.length > 1 ? 'mixed' : 'none';
```

Derive `variation_present` from distinct non-indeterminate classification-set signatures across at least two current cells. Do not collapse cells and do not emit a winner.

- [ ] **Step 4: Implement evaluator, failure-mode, and resource aggregation**

For each cell and capability-level current aggregate:

- evaluator kinds and refs are sorted unique strings;
- assurance classes use fixed order `declared`, `signed`, `verified-local`, `corroborated`;
- failure modes map each `failure_mode_ref` to a sorted deduplicated array of `{ observation_id, observation_digest }`;
- resource bucket key is canonical `resource_class + basis + unit` with null unit preserved for unknown basis;
- every matching resource entry increments `measurement_count`;
- numeric buckets compute integer `minimum` / `maximum`;
- unknown buckets emit `minimum:null`, `maximum:null`;
- supporting observation refs are deduplicated independent of measurement count;
- no averages, conversions, or scores.

- [ ] **Step 5: Implement strict validator completion and verifier**

`validateCognitiveCapabilitySurfaceReport(document)` must validate every nested object, exact fields, enum domains, safe integers, array bounds, canonical order, fixed capability ordering, cell digest correctness, boundary constants, and prohibit extra fields. Validation may check internal structural invariants directly; source-dependent truth is checked by verifier.

Implement:

```js
export function verifyCognitiveCapabilitySurfaceReport(document, profile, observations) {
  validateCognitiveCapabilitySurfaceReport(document);
  const derived = deriveCognitiveCapabilitySurfaceReport({
    report_id: document.report_id,
    profile,
    observations,
    assessment_at: document.assessment_at,
    recorded_at: document.recorded_at
  });
  if (digestObject(derived) !== digestObject(document)) {
    throw new ValidationError('Cognitive capability surface report does not match deterministic re-derivation');
  }
  return deepFreeze({
    valid: true,
    schema: COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
    report_id: document.report_id,
    profile_id: document.profile_id,
    report_digest: digestObject(document),
    observations: document.observations.length,
    capability_surfaces: document.capability_surfaces.length,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}
```

`cognitiveCapabilitySurfaceReportDigest(document)` validates first and then returns `digestObject(document)`.

- [ ] **Step 6: Run behavioral tests and prove GREEN**

Run:

```bash
cd mesh && node --test test/cognitive-capability-surface-report.test.mjs
```

Expected: PASS. Then run the protected Clean Kernel workflow on the exact behavioral head; require `Verify clean kernel`, Node 22, and container jobs green before schema work.

- [ ] **Step 7: Commit Task 2**

```bash
git add mesh/test/cognitive-capability-surface-report.test.mjs \
        mesh/src/lib/cognitive-capability-surface-report.mjs
git commit -m "feat: derive and verify capability surfaces"
```

---

### Task 3: JSON Schema 2020-12 Mirror and Semantic-Parity Tests

**Files:**
- Create: `mesh/test/cognitive-capability-surface-report-schema.test.mjs`
- Create: `mesh/config/cognitive-capability-surface-report-v0.schema.json`

**Interfaces:**
- Consumes: final Task 2 report shape and semantic rules.
- Produces: strict structural mirror with semantic annotations naming the executable validator.

- [ ] **Step 1: Write the failing schema-parity test with the schema file absent**

Create `mesh/test/cognitive-capability-surface-report-schema.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-capability-surface-report-v0.schema.json', import.meta.url);
const loadSchema = async () => JSON.parse(await readFile(schemaUrl, 'utf8'));

test('surface report schema mirrors inert evidence aggregation boundary', async () => {
  const schema = await loadSchema();
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-cognitive-capability-surface-report.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence-report');
  assert.equal(schema.properties.observations.maxItems, 256);
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.training_effect.const, 'none');
  assert.equal(schema.properties.spend_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'evidence-only');
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/cognitive-capability-surface-report.mjs');
  assert.equal(Object.hasOwn(schema.properties, 'score'), false);
  assert.equal(Object.hasOwn(schema.properties, 'rank'), false);
  assert.equal(Object.hasOwn(schema.properties, 'routing_weight'), false);
});

test('schema closes all nested object boundaries and preserves key enums', async () => {
  const schema = await loadSchema();
  assert.equal(schema.additionalProperties, false);
  for (const name of [
    'observationInventoryItem', 'capabilitySurface', 'observationCounts', 'cell',
    'cellDimensions', 'classificationCounts', 'evaluatorCoverage', 'failureMode',
    'observationRef', 'resourceRange'
  ]) assert.equal(schema.$defs[name].additionalProperties, false, `${name} must fail closed`);
  assert.deepEqual(schema.$defs.observationInventoryItem.properties.freshness_class.enum,
    ['current', 'stale', 'future', 'not-yet-recorded']);
  assert.deepEqual(schema.$defs.cell.properties.conflict_class.enum,
    ['none', 'mixed', 'direct']);
});

test('semantic annotations preserve historical safety, exact grouping, resources, and non-claims', async () => {
  const schema = await loadSchema();
  const rules = schema['x-axiom-semantic-rules'].join('\n');
  assert.match(rules, /future.*not-yet-recorded.*stale.*current/i);
  assert.match(rules, /only.*current.*cell/i);
  assert.match(rules, /cell.*exact.*context.*threshold.*method/i);
  assert.match(rules, /pass.*fail.*direct/i);
  assert.match(rules, /measurement_count.*resource/i);
  assert.match(rules, /aggregation.*does not.*authority/i);
  const nonClaims = new Set(schema['x-axiom-non-claims']);
  for (const item of [
    'universal-intelligence-score', 'candidate-ranking', 'majority-vote-truth',
    'routing-authority', 'execution-authority', 'training-authority',
    'spend-authority', 'evaluator-independence', 'topology-mutation',
    'learning-promotion'
  ]) assert.equal(nonClaims.has(item), true, `missing non-claim ${item}`);
});
```

- [ ] **Step 2: Run schema test and prove RED**

Run:

```bash
cd mesh && node --test test/cognitive-capability-surface-report-schema.test.mjs
```

Expected: FAIL with `ENOENT` for `config/cognitive-capability-surface-report-v0.schema.json`. In protected CI, use a child verification branch whose only delta from the known-green behavioral head is this test file.

- [ ] **Step 3: Add the strict JSON Schema mirror**

Create `mesh/config/cognitive-capability-surface-report-v0.schema.json` with Draft 2020-12, top-level `additionalProperties:false`, exact required top-level fields, bounded arrays, nested `$defs`, hard constants, identifier/digest/unit patterns, safe-integer numeric bounds, and exact enum domains.

Include:

```json
"x-axiom-semantic-validator": "mesh/src/lib/cognitive-capability-surface-report.mjs"
```

Include semantic-rule strings explicitly covering:

- exact profile binding and canonical source digests;
- duplicate source ID/digest rejection;
- freshness precedence `future -> not-yet-recorded -> stale -> current`;
- current-only active aggregation;
- every declared capability represented;
- exact cell identity across all context/evaluation dimensions;
- direct/mixed conflict semantics without winner selection;
- cross-cell variation is contextual, not direct contradiction;
- evaluator independence is not inferred;
- resource buckets use exact class+basis+unit and `measurement_count`;
- verifier requires deterministic re-derivation;
- aggregation does not amplify authority.

Add non-claims exactly including those asserted by the schema test.

- [ ] **Step 4: Run schema + behavioral tests and prove GREEN**

Run:

```bash
cd mesh && node --test \
  test/cognitive-capability-surface-report.test.mjs \
  test/cognitive-capability-surface-report-schema.test.mjs
```

Expected: PASS. Then require protected Clean Kernel, Node 22, and container verification green on the exact schema head.

- [ ] **Step 5: Commit Task 3**

```bash
git add mesh/test/cognitive-capability-surface-report-schema.test.mjs \
        mesh/config/cognitive-capability-surface-report-v0.schema.json
git commit -m "feat: add capability surface report schema"
```

---

### Task 4: Canonical Documentation Registration and Integrated Verification

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Existing approved docs to register:
  - `docs/superpowers/specs/2026-08-31-cognitive-capability-surface-report-v0-design.md`
  - `docs/superpowers/plans/2026-08-31-cognitive-capability-surface-report-v0.md`

**Interfaces:**
- Consumes: green Tasks 1-3 contract/schema/tests.
- Produces: canonical-doc discoverability only; no checker-logic behavior change.

- [ ] **Step 1: Add exactly two canonical-document entries**

In `CANONICAL_DOCUMENTS`, place the Surface Report spec immediately after the Capability Observation spec and the Surface Report plan immediately after the Capability Observation plan:

```js
'docs/superpowers/specs/2026-08-31-capability-observation-v0-design.md',
'docs/superpowers/specs/2026-08-31-cognitive-capability-surface-report-v0-design.md',
...
'docs/superpowers/plans/2026-08-31-capability-observation-v0.md',
'docs/superpowers/plans/2026-08-31-cognitive-capability-surface-report-v0.md',
```

Do not change any checker logic, required-content rules, or unrelated documentation.

- [ ] **Step 2: Run focused and full repository verification**

Run focused tests first:

```bash
cd mesh && node --test \
  test/cognitive-capability-surface-report.test.mjs \
  test/cognitive-capability-surface-report-schema.test.mjs
```

Then run the repository-supported full kernel command used by protected CI. In connector-only execution, push the integrated head and require the protected **Clean Kernel** workflow to complete green, including `Verify clean kernel`, all recovery/security drills, Node 22 compatibility, and container deny-egress/isolation.

Also require the protected compatibility workflow on the exact integrated head to complete green for:

- Windows;
- macOS Intel;
- macOS ARM.

No completion claim is allowed while any required job remains running or failed.

- [ ] **Step 3: Audit diff scope**

Compare the implementation branch against `feat/capability-observation-v0` and require exactly these seven intended paths:

1. `docs/superpowers/specs/2026-08-31-cognitive-capability-surface-report-v0-design.md`
2. `docs/superpowers/plans/2026-08-31-cognitive-capability-surface-report-v0.md`
3. `mesh/src/lib/cognitive-capability-surface-report.mjs`
4. `mesh/config/cognitive-capability-surface-report-v0.schema.json`
5. `mesh/test/cognitive-capability-surface-report.test.mjs`
6. `mesh/test/cognitive-capability-surface-report-schema.test.mjs`
7. `mesh/src/check-docs.mjs`

Explicitly verify no changes to `mesh/config/capabilities.json`, Cognitive Topology, Cognitive Capability Profile, Capability Observation semantics, eligibility/routing execution, provider transports, credentials, Gateway/Hypervisor/Sandbox/Grid, Cognitive Learning Ledger promotion, training/adaptation, or spend authorization.

- [ ] **Step 4: Commit integration**

```bash
git add mesh/src/check-docs.mjs
git commit -m "docs: register capability surface report"
```

- [ ] **Step 5: Update the implementation PR without merging**

Create or update a draft implementation PR stacked on `feat/capability-observation-v0`. Its body must record:

- schema/status and evidence-only purpose;
- hard zero-effect boundary;
- TDD RED/GREEN evidence for Tasks 1-3;
- exact verified head SHA;
- full Clean Kernel/Node 22/container/Windows/macOS verification outcomes;
- seven-path scope audit;
- explicit statement that routing, ranking, topology mutation, Ledger promotion, training, spending, and authority remain out of scope.

Keep the PR draft and unmerged until separate review/integration approval.

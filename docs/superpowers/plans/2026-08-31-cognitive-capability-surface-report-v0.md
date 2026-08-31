# Cognitive Capability Surface Report v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic, deeply frozen `axiom-cognitive-capability-surface-report.v0` evidence aggregation for one exact Cognitive Capability Profile without scoring, ranking, routing, training, spending, or authority amplification.

**Architecture:** Add one pure ESM contract module that validates, derives, digests, and re-verifies reports from exact Cognitive Capability Profile + Capability Observation artifacts. Derivation uses explicit assessment time, current-only exact comparison cells, attributable conflict/variation/evaluator/failure/resource summaries, and canonical ordering. Add the JSON Schema mirror only after behavior is green; register the approved spec/plan only after executable verification is green.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, existing canonical digest/validation helpers, JSON Schema Draft 2020-12, protected GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-31-cognitive-capability-surface-report-v0-design.md`

## Global Constraints

- Schema/version/status: `axiom-cognitive-capability-surface-report.v0` / `0` / `inert-evidence-report`.
- Bind one exact profile by `profile_id` + recomputed canonical `profile_digest`.
- Accept 0-256 source observations; duplicate source IDs fail closed. Exact duplicate source artifacts necessarily duplicate their ID because `observation_id` contributes to the canonical observation digest; reject them as duplicate source identity and still maintain a digest set as defense in depth.
- Never read wall clock. Require explicit canonical `assessment_at` and `recorded_at`; require `recorded_at >= assessment_at`.
- Freshness precedence: `future` when `observed_at > assessment_at`; else `not-yet-recorded` when `recorded_at > assessment_at`; else `stale` when `valid_until < assessment_at`; else `current`.
- Only current observations enter cells, conflict/variation, evaluator/assurance, failure-mode, and resource aggregation.
- Represent every profile-declared capability, including zero-evidence capabilities. Zero evidence is not failure.
- Exact-cell dimensions: capability + context/task-family/difficulty/environment/toolset + suite/metric-set/threshold/method references and digests.
- Same-cell pass+fail => `direct`; multiple distinct non-indeterminate classes without pass+fail => `mixed`; otherwise `none`.
- Cross-cell differences are contextual variation, never direct conflict.
- Never emit universal/overall score, normalized benchmark score, majority winner, rank, routing weight, averaged confidence, or hidden policy utility.
- Never infer evaluator independence.
- Resource bucket identity is exact `resource_class + basis + unit`; `measurement_count` counts entries, supporting observations are separately deduplicated, no averages/conversions.
- Hard boundary constants: `contains_secret_material:false`, `authority_effect:'none'`, `network_effect:'none'`, `training_effect:'none'`, `spend_effect:'none'`, `runtime_activation:false`, `selection_effect:'evidence-only'`.
- Production module imports only `./canonical.mjs`, `./cognitive-capability-profile.mjs`, `./cognitive-capability-observation.mjs`.
- Inputs are not mutated; derived report and verification summary are deeply frozen.
- Canonical ordering is normative; supplied non-canonical reports fail verification.

## File Structure

- Create `mesh/src/lib/cognitive-capability-surface-report.mjs`: validator, digest, derivation, verifier, pure helpers.
- Create `mesh/test/cognitive-capability-surface-report.test.mjs`: behavioral/adversarial tests.
- Create `mesh/config/cognitive-capability-surface-report-v0.schema.json`: Draft 2020-12 mirror.
- Create `mesh/test/cognitive-capability-surface-report-schema.test.mjs`: schema parity tests.
- Modify `mesh/src/check-docs.mjs`: two canonical-document entries only.

---

### Task 1: Baseline Contract, Fixtures, Freshness, and Source Binding

**Files:**
- Create: `mesh/test/cognitive-capability-surface-report.test.mjs`
- Create: `mesh/src/lib/cognitive-capability-surface-report.mjs`

**Interfaces:**
- Consumes `cognitiveCapabilityProfileDigest`, `validateCognitiveCapabilityProfile`, `cognitiveCapabilityObservationDigest`, `validateCognitiveCapabilityObservation`, `digestObject`, `ValidationError`.
- Produces `COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA`, `validateCognitiveCapabilitySurfaceReport`, `cognitiveCapabilitySurfaceReportDigest`, `deriveCognitiveCapabilitySurfaceReport`.

- [ ] **Step 1: Write exact fixtures and failing tests**

In the test file, define the complete profile fixture and an override-safe observation fixture. Use explicit nested override handling so later tests cannot accidentally write fields at the wrong level:

```js
function validProfile() {
  return {
    schema: 'axiom-cognitive-capability-profile.v0', version: 0,
    status: 'inert-routing-metadata-laboratory',
    profile_id: 'cognitive.example.remote.general',
    catalog_entry: { entry_id: 'provider:example-api', entry_version: '0.1.0', entry_digest: 'e'.repeat(64) },
    integration_class: 'model-provider', offering_ref: 'model.example.general',
    capabilities: ['reasoning', 'research', 'summarization'],
    modalities: { input: ['text'], output: ['text'] },
    deployment: { locality: 'provider-remote', access_mode: 'api' },
    data_policy: { retention: 'unknown', training_use: 'unknown', exportability: 'unknown', policy_ref: 'policy.example.provider.v1' },
    economics: { cost_class: 'medium', latency_class: 'interactive', context_class: 'large' },
    openness: { weight_access: 'closed', artifact_digest: null, license_ref: null },
    assurance: { ceiling: 'self-asserted', evidence_refs: ['evidence.example.provider-review'] },
    created_at: '2026-08-31T12:00:00.000Z', updated_at: '2026-08-31T12:00:00.000Z',
    authority_effect: 'none', network_effect: 'none', credential_visibility: 'none',
    runtime_activation: false, selection_effect: 'eligibility-only'
  };
}

function validObservation(profile = validProfile(), o = {}) {
  const base = {
    schema: 'axiom-cognitive-capability-observation.v0', version: 0, status: 'inert-evidence',
    observation_id: 'capobs.reasoning.project.v1', profile_id: profile.profile_id,
    profile_digest: cognitiveCapabilityProfileDigest(profile), capability: 'reasoning',
    context: {
      context_ref: 'context.reasoning.project.v1', context_digest: 'a'.repeat(64),
      task_family_ref: 'task-family.reasoning.project.v1', task_family_digest: 'b'.repeat(64),
      difficulty_class: 'challenging', environment_ref: 'environment.node22.v1', environment_digest: 'c'.repeat(64),
      toolset_ref: 'toolset.none.v1', toolset_digest: 'd'.repeat(64)
    },
    evaluation: {
      suite_ref: 'suite.reasoning.v1', suite_digest: 'a'.repeat(64),
      metric_set_ref: 'metrics.reasoning.v1', metric_set_digest: 'b'.repeat(64),
      threshold_ref: 'threshold.reasoning.v1', threshold_digest: 'c'.repeat(64),
      method_ref: 'method.deterministic.v1', method_digest: 'd'.repeat(64)
    },
    result: {
      classification: 'pass', confidence: 0.9,
      observed_metric_ref: 'metric-result.reasoning.v1', observed_metric_digest: 'a'.repeat(64), failure_mode_refs: []
    },
    evaluator: { evaluator_kind: 'synthetic-harness', evaluator_ref: 'evaluator.reasoning.harness.v1', evaluator_principal_ref: null },
    evidence: {
      evidence_kind: 'evaluation-run', evidence_ref: 'evidence.reasoning.run.v1', evidence_digest: 'b'.repeat(64),
      verification_ref: null, verification_digest: null, assurance_class: 'declared'
    },
    resource_observations: [
      { resource_class: 'input-tokens', basis: 'observed', amount: 2400, unit: 'tokens', source_ref: 'usage.reasoning.v1' },
      { resource_class: 'energy', basis: 'unknown', amount: null, unit: null, source_ref: null }
    ],
    observed_at: '2026-08-31T12:00:00.000Z', valid_until: '2026-09-30T12:00:00.000Z', recorded_at: '2026-08-31T12:01:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', training_effect: 'none',
    spend_effect: 'none', runtime_activation: false, selection_effect: 'evidence-only'
  };
  if (o.observation_id) base.observation_id = o.observation_id;
  if (o.capability) base.capability = o.capability;
  if (o.classification) base.result.classification = o.classification;
  if (o.observed_metric_ref) base.result.observed_metric_ref = o.observed_metric_ref;
  if (o.observed_metric_digest) base.result.observed_metric_digest = o.observed_metric_digest;
  if (o.failure_mode_refs) base.result.failure_mode_refs = [...o.failure_mode_refs];
  if (o.context_ref) base.context.context_ref = o.context_ref;
  if (o.context_digest) base.context.context_digest = o.context_digest;
  if (o.toolset_ref) base.context.toolset_ref = o.toolset_ref;
  if (o.toolset_digest) base.context.toolset_digest = o.toolset_digest;
  if (o.observed_at) base.observed_at = o.observed_at;
  if (o.valid_until) base.valid_until = o.valid_until;
  if (o.recorded_at) base.recorded_at = o.recorded_at;
  return base;
}

function deriveAt13(profile, observations) {
  return deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.example.v1', profile, observations,
    assessment_at: '2026-08-31T13:00:00.000Z', recorded_at: '2026-08-31T13:01:00.000Z'
  });
}
```

Add RED tests asserting: module export exists; one current observation derives a report; profile capabilities are ordered `reasoning,research,summarization`; research/summarization have zero evidence rather than failure; current/stale/future/not-yet-recorded precedence is exact; malformed timestamps and `recorded_at < assessment_at` fail; widened hard boundaries fail; profile ID/digest/capability mismatch fails; two artifacts with the same `observation_id` fail even when other fields differ; inserting the exact same source artifact twice fails as duplicate source identity; input remains unchanged/deep-frozen.

- [ ] **Step 2: Prove RED**

Run:

```bash
cd mesh && node --test test/cognitive-capability-surface-report.test.mjs
```

Expected: module-not-found for `../src/lib/cognitive-capability-surface-report.mjs`. In connector-only execution, prove this on a clean verification branch containing the test but not the production module; do not count a docs allowlist failure as RED.

- [ ] **Step 3: Implement baseline module**

Start with exactly:

```js
import { digestObject, ValidationError } from './canonical.mjs';
import { cognitiveCapabilityProfileDigest, validateCognitiveCapabilityProfile } from './cognitive-capability-profile.mjs';
import { cognitiveCapabilityObservationDigest, validateCognitiveCapabilityObservation } from './cognitive-capability-observation.mjs';

export const COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA = 'axiom-cognitive-capability-surface-report.v0';
```

Implement plain-object, identifier (`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$`), digest, canonical timestamp, safe-integer, exact-fields, sorted-order and deep-freeze helpers. Use fixed capability order:

```js
const CAPABILITY_ORDER = Object.freeze([
  'reasoning', 'coding', 'vision', 'computer-use', 'research', 'planning',
  'critique', 'summarization', 'embedding', 'tool-use', 'agent-orchestration', 'other'
]);
```

Freshness logic must be literally equivalent to:

```js
if (Date.parse(observation.observed_at) > assessmentMs) return 'future';
if (Date.parse(observation.recorded_at) > assessmentMs) return 'not-yet-recorded';
if (Date.parse(observation.valid_until) < assessmentMs) return 'stale';
return 'current';
```

Derivation validates profile and every observation, recomputes digests, rejects duplicate IDs and duplicate digests, checks exact profile binding/capability membership, sorts inventory, emits every declared capability, hard boundary constants, and a deeply frozen report. The baseline may initially emit one cell per current observation; Task 2 replaces this with exact grouping.

Validator enforces exact top-level shape, lexical/timestamp/boundary rules, 0-256 inventory, canonical inventory ordering, and canonical declared-capability ordering. Source-dependent equality is verifier responsibility.

- [ ] **Step 4: Prove GREEN and commit**

```bash
cd mesh && node --test test/cognitive-capability-surface-report.test.mjs
```

Expected: Task 1 PASS. Require protected `Verify clean kernel`, Node 22, and container green on the exact head, then commit:

```bash
git add mesh/test/cognitive-capability-surface-report.test.mjs mesh/src/lib/cognitive-capability-surface-report.mjs
git commit -m "feat: add capability surface report baseline"
```

---

### Task 2: Exact Cells, Conflict/Variation, Evidence/Resource Aggregation, and Verifier

**Files:**
- Modify: `mesh/test/cognitive-capability-surface-report.test.mjs`
- Modify: `mesh/src/lib/cognitive-capability-surface-report.mjs`

**Interfaces:**
- Produces final exact cells and `verifyCognitiveCapabilitySurfaceReport(document, profile, observations)`.

- [ ] **Step 1: Add RED tests for final semantics**

Add these concrete tests:

```js
test('same exact cell preserves direct conflict without winner selection', () => {
  const profile = validProfile();
  const pass = validObservation(profile, { observation_id: 'obs.pass' });
  const fail = validObservation(profile, {
    observation_id: 'obs.fail', classification: 'fail',
    observed_metric_ref: 'metric-result.fail.v1', observed_metric_digest: 'f'.repeat(64),
    failure_mode_refs: ['failure.reasoning.logic']
  });
  const reasoning = deriveAt13(profile, [fail, pass]).capability_surfaces[0];
  assert.equal(reasoning.current_cells.length, 1);
  assert.deepEqual(reasoning.current_cells[0].classification_counts, { pass: 1, degraded: 0, fail: 1, indeterminate: 0 });
  assert.deepEqual(reasoning.current_cells[0].classification_set, ['pass', 'fail']);
  assert.equal(reasoning.current_cells[0].conflict_class, 'direct');
  assert.equal(reasoning.direct_conflict_cells, 1);
  assert.equal(Object.hasOwn(reasoning, 'score'), false);
  assert.equal(Object.hasOwn(reasoning.current_cells[0], 'winner'), false);
});

test('different exact contexts create variation instead of direct conflict', () => {
  const profile = validProfile();
  const pass = validObservation(profile, { observation_id: 'obs.pass' });
  const fail = validObservation(profile, {
    observation_id: 'obs.fail.other-context', classification: 'fail',
    context_ref: 'context.reasoning.other.v1', context_digest: 'f'.repeat(64),
    observed_metric_ref: 'metric-result.other.v1', observed_metric_digest: 'e'.repeat(64)
  });
  const reasoning = deriveAt13(profile, [pass, fail]).capability_surfaces[0];
  assert.equal(reasoning.current_cells.length, 2);
  assert.equal(reasoning.direct_conflict_cells, 0);
  assert.equal(reasoning.variation_present, true);
});

test('resource ranges count measurements but deduplicate source observations', () => {
  const profile = validProfile();
  const observation = validObservation(profile, { observation_id: 'obs.resources' });
  observation.resource_observations = [
    { resource_class: 'input-tokens', basis: 'observed', amount: 100, unit: 'tokens', source_ref: null },
    { resource_class: 'input-tokens', basis: 'observed', amount: 140, unit: 'tokens', source_ref: null },
    { resource_class: 'input-tokens', basis: 'estimated', amount: 120, unit: 'tokens', source_ref: null },
    { resource_class: 'energy', basis: 'unknown', amount: null, unit: null, source_ref: null }
  ];
  const ranges = deriveAt13(profile, [observation]).capability_surfaces[0].current_resource_ranges;
  const observed = ranges.find(x => x.resource_class === 'input-tokens' && x.basis === 'observed');
  assert.equal(observed.measurement_count, 2);
  assert.equal(observed.minimum, 100);
  assert.equal(observed.maximum, 140);
  assert.equal(observed.supporting_observations.length, 1);
});

test('verifier rejects derived-field tampering and observation-set drift', () => {
  const profile = validProfile();
  const observation = validObservation(profile);
  const report = deriveAt13(profile, [observation]);
  const tampered = structuredClone(report);
  tampered.capability_surfaces[0].observation_counts.current = 99;
  assert.throws(() => verifyCognitiveCapabilitySurfaceReport(tampered, profile, [observation]), /re-derivation|mismatch/i);
  assert.throws(() => verifyCognitiveCapabilitySurfaceReport(report, profile, []), /re-derivation|mismatch|inventory/i);
});
```

Also assert pass+degraded => mixed; degraded+fail => mixed; pass+indeterminate => none; stale/future/not-yet-recorded excluded from active aggregation; evaluator refs/kinds and assurance are sorted unique; repeated failure-mode refs preserve source pairs; observed/estimated/unlike-unit/unknown resource buckets remain separate; confidence is absent from aggregates; reversing source order yields identical report/digest; nested output is frozen; source imports are exactly the three allowed modules; supplied non-canonical order fails verifier.

- [ ] **Step 2: Prove RED**

Run the behavioral file. Expected failure: missing exact grouping/conflict/resource/verifier behavior on known-green Task 1 head.

- [ ] **Step 3: Implement exact cell aggregation**

Cell dimensions are exactly:

```js
{
  capability: o.capability,
  context_ref: o.context.context_ref, context_digest: o.context.context_digest,
  task_family_ref: o.context.task_family_ref, task_family_digest: o.context.task_family_digest,
  difficulty_class: o.context.difficulty_class,
  environment_ref: o.context.environment_ref, environment_digest: o.context.environment_digest,
  toolset_ref: o.context.toolset_ref, toolset_digest: o.context.toolset_digest,
  suite_ref: o.evaluation.suite_ref, suite_digest: o.evaluation.suite_digest,
  metric_set_ref: o.evaluation.metric_set_ref, metric_set_digest: o.evaluation.metric_set_digest,
  threshold_ref: o.evaluation.threshold_ref, threshold_digest: o.evaluation.threshold_digest,
  method_ref: o.evaluation.method_ref, method_digest: o.evaluation.method_digest
}
```

Group only current observations by `digestObject(dimensions)`. Classification order is `pass,degraded,fail,indeterminate`. Conflict:

```js
if (counts.pass > 0 && counts.fail > 0) return 'direct';
const represented = ['pass', 'degraded', 'fail'].filter(k => counts[k] > 0);
return represented.length > 1 ? 'mixed' : 'none';
```

Variation compares non-indeterminate classification-set signatures across current cells; it never merges cells.

- [ ] **Step 4: Implement evaluator/failure/resource aggregation**

Use sorted unique evaluator kinds/refs and fixed assurance order `declared,signed,verified-local,corroborated`. Map failure modes to sorted deduplicated `{observation_id, observation_digest}` refs.

Resource bucket key includes exact class/basis/unit. Each matching entry increments `measurement_count`; numeric buckets use safe-integer min/max; unknown buckets use null min/max; source refs are independently deduplicated. No averages or conversions.

- [ ] **Step 5: Finish strict validator and verifier**

Validator checks exact nested fields, enums, safe integers, bounds, cell digest correctness, ordering, and boundaries. Verifier re-derives using the document's own metadata and requires exact canonical digest equality:

```js
export function verifyCognitiveCapabilitySurfaceReport(document, profile, observations) {
  validateCognitiveCapabilitySurfaceReport(document);
  const derived = deriveCognitiveCapabilitySurfaceReport({
    report_id: document.report_id, profile, observations,
    assessment_at: document.assessment_at, recorded_at: document.recorded_at
  });
  if (digestObject(derived) !== digestObject(document)) {
    throw new ValidationError('Cognitive capability surface report does not match deterministic re-derivation');
  }
  return deepFreeze({
    valid: true, schema: COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
    report_id: document.report_id, profile_id: document.profile_id,
    report_digest: digestObject(document), observations: document.observations.length,
    capability_surfaces: document.capability_surfaces.length,
    authority_effect: 'none', network_effect: 'none', training_effect: 'none',
    spend_effect: 'none', runtime_activation: false, selection_effect: 'evidence-only'
  });
}
```

- [ ] **Step 6: Prove GREEN and commit**

```bash
cd mesh && node --test test/cognitive-capability-surface-report.test.mjs
git add mesh/test/cognitive-capability-surface-report.test.mjs mesh/src/lib/cognitive-capability-surface-report.mjs
git commit -m "feat: derive and verify capability surfaces"
```

Require protected Clean Kernel, Node 22, and container green before schema work.

---

### Task 3: JSON Schema Mirror

**Files:**
- Create: `mesh/test/cognitive-capability-surface-report-schema.test.mjs`
- Create: `mesh/config/cognitive-capability-surface-report-v0.schema.json`

- [ ] **Step 1: Write schema RED test**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const schemaUrl = new URL('../config/cognitive-capability-surface-report-v0.schema.json', import.meta.url);
const load = async () => JSON.parse(await readFile(schemaUrl, 'utf8'));

test('surface report schema mirrors the evidence-only contract', async () => {
  const s = await load();
  assert.equal(s.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(s.properties.schema.const, 'axiom-cognitive-capability-surface-report.v0');
  assert.equal(s.properties.version.const, 0);
  assert.equal(s.properties.status.const, 'inert-evidence-report');
  assert.equal(s.properties.observations.maxItems, 256);
  assert.equal(s.properties.authority_effect.const, 'none');
  assert.equal(s.properties.selection_effect.const, 'evidence-only');
  assert.equal(s['x-axiom-semantic-validator'], 'mesh/src/lib/cognitive-capability-surface-report.mjs');
  assert.equal(Object.hasOwn(s.properties, 'score'), false);
  assert.equal(Object.hasOwn(s.properties, 'rank'), false);
  assert.equal(Object.hasOwn(s.properties, 'routing_weight'), false);
});

test('schema closes nested boundaries and preserves evidence enums', async () => {
  const s = await load();
  assert.equal(s.additionalProperties, false);
  for (const name of ['observationInventoryItem','capabilitySurface','observationCounts','cell','cellDimensions','classificationCounts','evaluatorCoverage','failureMode','observationRef','resourceRange']) {
    assert.equal(s.$defs[name].additionalProperties, false);
  }
  assert.deepEqual(s.$defs.observationInventoryItem.properties.freshness_class.enum, ['current','stale','future','not-yet-recorded']);
  assert.deepEqual(s.$defs.cell.properties.conflict_class.enum, ['none','mixed','direct']);
});
```

Add a semantic-annotation test matching freshness precedence, current-only cells, exact cell dimensions, pass+fail direct conflict, measurement_count, aggregation-does-not-amplify-authority, and non-claims for scoring/ranking/routing/execution/training/spend/evaluator-independence/topology mutation/learning promotion.

- [ ] **Step 2: Prove RED**

```bash
cd mesh && node --test test/cognitive-capability-surface-report-schema.test.mjs
```

Expected: `ENOENT` for the schema file on the known-green behavioral head.

- [ ] **Step 3: Create strict Draft 2020-12 schema**

Use top-level and all nested `additionalProperties:false`, exact required fields, identifier/digest/unit patterns, safe-integer bounds, exact enums, 256 observation maximum, hard constants, and:

```json
"x-axiom-semantic-validator": "mesh/src/lib/cognitive-capability-surface-report.mjs"
```

Semantic rules must explicitly state profile/source binding, duplicate rejection, freshness precedence, current-only aggregation, exact cell identity, conflict/variation semantics, no independence inference, exact resource buckets/measurement_count, deterministic re-derivation, and zero authority amplification.

- [ ] **Step 4: Prove GREEN and commit**

```bash
cd mesh && node --test test/cognitive-capability-surface-report.test.mjs test/cognitive-capability-surface-report-schema.test.mjs
git add mesh/test/cognitive-capability-surface-report-schema.test.mjs mesh/config/cognitive-capability-surface-report-v0.schema.json
git commit -m "feat: add capability surface report schema"
```

Require protected Clean Kernel, Node 22, and container green.

---

### Task 4: Canonical Registration and Full Integration Verification

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Register existing:
  - `docs/superpowers/specs/2026-08-31-cognitive-capability-surface-report-v0-design.md`
  - `docs/superpowers/plans/2026-08-31-cognitive-capability-surface-report-v0.md`

- [ ] **Step 1: Add exactly two canonical entries**

```js
'docs/superpowers/specs/2026-08-31-capability-observation-v0-design.md',
'docs/superpowers/specs/2026-08-31-cognitive-capability-surface-report-v0-design.md',
...
'docs/superpowers/plans/2026-08-31-capability-observation-v0.md',
'docs/superpowers/plans/2026-08-31-cognitive-capability-surface-report-v0.md',
```

Do not alter checker logic or required-content rules.

- [ ] **Step 2: Run focused and protected full verification**

```bash
cd mesh && node --test test/cognitive-capability-surface-report.test.mjs test/cognitive-capability-surface-report-schema.test.mjs
```

Then require the exact integrated head to complete protected Clean Kernel (including all recovery/security drills), pinned Node 22, container deny-egress/isolation, Windows, macOS Intel, and macOS ARM. Do not claim completion while any required job is running or failed.

- [ ] **Step 3: Scope audit**

Compare against `feat/capability-observation-v0` and require exactly these seven paths:

1. `docs/superpowers/specs/2026-08-31-cognitive-capability-surface-report-v0-design.md`
2. `docs/superpowers/plans/2026-08-31-cognitive-capability-surface-report-v0.md`
3. `mesh/src/lib/cognitive-capability-surface-report.mjs`
4. `mesh/config/cognitive-capability-surface-report-v0.schema.json`
5. `mesh/test/cognitive-capability-surface-report.test.mjs`
6. `mesh/test/cognitive-capability-surface-report-schema.test.mjs`
7. `mesh/src/check-docs.mjs`

Confirm no changes to `mesh/config/capabilities.json`, Cognitive Topology/Profile/Observation semantics, eligibility/routing execution, provider transports/credentials, Gateway/Hypervisor/Sandbox/Grid, Cognitive Learning Ledger promotion, training/adaptation, or spend authorization.

- [ ] **Step 4: Commit integration and maintain a draft stacked PR**

```bash
git add mesh/src/check-docs.mjs
git commit -m "docs: register capability surface report"
```

Implementation PR base remains `feat/capability-observation-v0`; keep it draft and unmerged. PR body records RED/GREEN evidence, verified SHA, full platform/security verification, seven-path scope, and explicit out-of-scope routing/ranking/topology/Ledger/training/spend/authority effects.

# Evidence-Aware Routing Capability Surface Report v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct `axiom-cognitive-capability-surface-report.v0` on current `main` as a deterministic, evidence-only aggregation layer over exact Capability Observation v0 artifacts, without scoring, routing, execution, training, spend, or authority amplification.

**Architecture:** Add one pure ESM module that derives and verifies a bounded report for one exact Cognitive Capability Profile from exact Capability Observation v0 artifacts at an explicit assessment time. Only current observations enter exact-cell aggregation; stale, future, and not-yet-recorded evidence remains inventory evidence. Direct same-cell conflict, cross-cell contextual variation, evaluator/assurance provenance, failure modes, and unit-preserving resource ranges remain explicit. Add a strict JSON Schema 2020-12 mirror only after semantic behavior is green.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, existing `digestObject`/`ValidationError`, Cognitive Capability Profile v0, Capability Observation v0, JSON Schema Draft 2020-12, protected GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`

## Global Constraints

- Schema/version/status are exactly `axiom-cognitive-capability-surface-report.v0` / `0` / `inert-evidence-report`.
- The report binds one exact profile through `profile_id` plus recomputed canonical `profile_digest`.
- Accept at most 256 source observations; duplicate `observation_id` or duplicate canonical observation digest fails closed.
- Never read wall clock. Derivation requires explicit canonical `assessment_at` and `recorded_at`; require `recorded_at >= assessment_at`.
- Freshness precedence is exactly: `future` when `observed_at > assessment_at`; otherwise `not-yet-recorded` when `recorded_at > assessment_at`; otherwise `stale` when `valid_until < assessment_at`; otherwise `current`.
- Preserve all profile-declared capabilities, including capabilities with zero observations. Missing evidence is not failure.
- Only `current` observations contribute to current exact cells, conflict/variation, evaluator/assurance summaries, failure-mode summaries, and resource summaries.
- Exact-cell identity includes capability plus every context/evaluation ref+digest dimension: context, task family, difficulty, environment, toolset, suite, metric set, threshold, and method.
- Same-cell `pass` + `fail` is `direct` conflict. Multiple distinct non-indeterminate classifications without both pass+fail are `mixed`. Otherwise conflict is `none`.
- Different exact cells are contextual variation, never direct conflict.
- Never infer evaluator independence from count, identity variety, or repeated evidence.
- Never emit a universal model score, provider-wide rank, majority winner, routing weight, averaged confidence, normalized benchmark score, or hidden policy utility.
- Resource bucket identity is exact `resource_class + basis + unit`; `measurement_count` counts entries; supporting observation refs are deduplicated; no average, conversion, or unlike-unit aggregation is permitted.
- Unknown-resource entries retain `amount:null` and `unit:null` and do not contribute numeric min/max.
- Hard constants are `contains_secret_material:false`, `authority_effect:'none'`, `network_effect:'none'`, `training_effect:'none'`, `spend_effect:'none'`, `runtime_activation:false`, `selection_effect:'evidence-only'`.
- Production module imports only `./canonical.mjs`, `./cognitive-capability-profile.mjs`, and `./cognitive-capability-observation.mjs`.
- Inputs are not mutated. Derived report and verifier summary are recursively frozen.
- Canonical ordering is normative; supplied non-canonical reports fail verification.
- Do not modify `mesh/config/capabilities.json`, Gateway/Hypervisor/Sandbox/Grid, provider invocation, runtime activation, training/adaptation, spend, Cognitive Selection v0, or Cognitive Topology.

## File Structure

- Create `mesh/src/lib/cognitive-capability-surface-report.mjs` — pure validator, digest, derivation, exact-cell aggregation, and verifier.
- Create `mesh/test/cognitive-capability-surface-report.test.mjs` — semantic/adversarial tests.
- Create `mesh/config/cognitive-capability-surface-report-v0.schema.json` — strict Draft 2020-12 mirror using the repository `https://axiom.invalid/schemas/...` identifier convention.
- Create `mesh/test/cognitive-capability-surface-report-schema.test.mjs` — schema/semantic parity tests.

---

### Task 1: Baseline, source binding, freshness, and canonical inventory

**Files:**
- Create: `mesh/test/cognitive-capability-surface-report.test.mjs`
- Create: `mesh/src/lib/cognitive-capability-surface-report.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError`, `validateCognitiveCapabilityProfile`, `cognitiveCapabilityProfileDigest`, `validateCognitiveCapabilityObservation`, `cognitiveCapabilityObservationDigest`, `resolveCognitiveCapabilityObservation`.
- Produces: `COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA`, `validateCognitiveCapabilitySurfaceReport(document)`, `cognitiveCapabilitySurfaceReportDigest(document)`, `deriveCognitiveCapabilitySurfaceReport({ report_id, profile, observations, assessment_at, recorded_at })`.

- [ ] **Step 1: Write the semantic RED fixture and tests**

Use one complete current-main Cognitive Capability Profile fixture and an Observation fixture whose `profile_digest` is computed with `cognitiveCapabilityProfileDigest(profile)`. The first tests MUST assert:

```js
import {
  COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
  deriveCognitiveCapabilitySurfaceReport,
  validateCognitiveCapabilitySurfaceReport
} from '../src/lib/cognitive-capability-surface-report.mjs';

assert.equal(COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA, 'axiom-cognitive-capability-surface-report.v0');
```

Add explicit tests for:

```text
one current observation -> one current inventory item
profile-declared but unobserved capability -> surface entry with zero current cells
future precedence over not-yet-recorded
not-yet-recorded precedence over stale
stale classification
recorded_at < assessment_at -> ValidationError
malformed/non-canonical timestamp -> ValidationError
observation profile_id mismatch -> ValidationError
observation profile_digest mismatch -> ValidationError
observation capability not declared by profile -> ValidationError
duplicate observation_id -> ValidationError
duplicate observation digest -> ValidationError
more than 256 observations -> ValidationError
widened authority/effect constants -> ValidationError
input profile/observations remain byte-for-byte unchanged
returned report is deeply frozen
```

The inventory item shape produced by derivation is exactly:

```js
{
  observation_id,
  observation_digest,
  capability,
  freshness, // current | stale | future | not-yet-recorded
  observed_at,
  valid_until,
  recorded_at
}
```

The top-level report shape is exactly:

```js
{
  schema: 'axiom-cognitive-capability-surface-report.v0',
  version: 0,
  status: 'inert-evidence-report',
  report_id,
  profile_id,
  profile_digest,
  assessment_at,
  recorded_at,
  source_observations: [],
  capability_surfaces: [],
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  training_effect: 'none',
  spend_effect: 'none',
  runtime_activation: false,
  selection_effect: 'evidence-only'
}
```

- [ ] **Step 2: Prove semantic RED**

Run through the repository verification branch/PR with the test committed but the production module absent.

Expected failure: `ERR_MODULE_NOT_FOUND` for `mesh/src/lib/cognitive-capability-surface-report.mjs`. A documentation-boundary failure does not count as semantic RED.

- [ ] **Step 3: Implement the minimal baseline module**

Start with exactly:

```js
import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveCapabilityProfileDigest,
  validateCognitiveCapabilityProfile
} from './cognitive-capability-profile.mjs';
import {
  cognitiveCapabilityObservationDigest,
  resolveCognitiveCapabilityObservation,
  validateCognitiveCapabilityObservation
} from './cognitive-capability-observation.mjs';

export const COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA =
  'axiom-cognitive-capability-surface-report.v0';
```

Use the same plain-object, identifier, digest, canonical timestamp, exact-field, sorted-order, safe-integer, and recursive-freeze discipline as the Profile/Observation modules.

Freshness MUST be equivalent to:

```js
if (Date.parse(observation.observed_at) > assessmentMs) return 'future';
if (Date.parse(observation.recorded_at) > assessmentMs) return 'not-yet-recorded';
if (Date.parse(observation.valid_until) < assessmentMs) return 'stale';
return 'current';
```

Derivation validates the profile, validates/resolves every observation against it, recomputes every observation digest, rejects duplicate IDs/digests, sorts inventory canonically, creates one surface for every profile capability in profile capability order, and initially leaves `current_cells` empty until Task 2.

- [ ] **Step 4: Prove semantic GREEN and commit**

Run the focused test and the protected clean-kernel suite on the exact head. Expected: all new baseline tests pass and no existing kernel regression.

Commit message:

```text
feat: add capability surface report baseline
```

---

### Task 2: Exact cells, conflict/variation, provenance, failures, resources, and verifier

**Files:**
- Modify: `mesh/test/cognitive-capability-surface-report.test.mjs`
- Modify: `mesh/src/lib/cognitive-capability-surface-report.mjs`

**Interfaces:**
- Extends `deriveCognitiveCapabilitySurfaceReport(...)` with final aggregation.
- Produces `verifyCognitiveCapabilitySurfaceReport(document, profile, observations)`.

- [ ] **Step 1: Add RED tests for exact-cell semantics**

Add tests that construct current observations with controlled differences and assert:

```js
// same exact cell, pass + fail
assert.deepEqual(cell.classification_counts,
  { pass: 1, degraded: 0, fail: 1, indeterminate: 0 });
assert.deepEqual(cell.classification_set, ['pass', 'fail']);
assert.equal(cell.conflict_class, 'direct');
assert.equal(surface.direct_conflict_cells, 1);
assert.equal(Object.hasOwn(cell, 'winner'), false);
assert.equal(Object.hasOwn(surface, 'score'), false);
```

Add distinct tests for:

```text
same cell pass+degraded -> mixed conflict
same cell only indeterminate -> none
pass and fail in different context/evaluation cells -> zero direct conflicts + variation_present=true
stale/future/not-yet-recorded observations never enter current_cells
cell identity changes when ANY exact context/evaluation ref or digest changes
cell identity is stable under input observation permutation
classification_set uses fixed order pass,degraded,fail,indeterminate
supporting observation refs/digests are canonical and unique
failure-mode summary preserves exact supporting observation refs
evaluator summary preserves evaluator_kind/ref/principal plus assurance class without independence claim
resource observed 100 + 140 tokens -> measurement_count=2,min=100,max=140
resource estimated tokens remain a different bucket from observed tokens
resource milliseconds never merge with seconds
unknown resource bucket has measurement_count but null numeric range
repeated measurements in one observation increment measurement_count but supporting observation is listed once
no confidence average exists anywhere in report
```

The exact comparison-cell key is a canonical object containing:

```js
{
  capability,
  context_ref, context_digest,
  task_family_ref, task_family_digest,
  difficulty_class,
  environment_ref, environment_digest,
  toolset_ref, toolset_digest,
  suite_ref, suite_digest,
  metric_set_ref, metric_set_digest,
  threshold_ref, threshold_digest,
  method_ref, method_digest
}
```

The cell result MUST contain at least:

```js
{
  cell_key,
  cell_digest,
  observation_refs,
  observation_digests,
  classification_counts,
  classification_set,
  conflict_class,
  evaluator_evidence,
  failure_modes,
  resource_buckets
}
```

- [ ] **Step 2: Prove RED on the exact semantic-green baseline head**

Expected: failures are assertions about absent/final aggregation fields, not module loading or unrelated baseline behavior.

- [ ] **Step 3: Implement deterministic aggregation and verifier**

Implement exact-cell grouping only from `freshness === 'current'` sources. Sort cells by canonical `cell_digest`, supporting refs lexically, classification sets by the fixed classification order, and summary objects by their complete canonical identity.

Use conflict semantics exactly:

```js
if (classes.has('pass') && classes.has('fail')) return 'direct';
const nonIndeterminate = [...classes].filter(value => value !== 'indeterminate');
if (new Set(nonIndeterminate).size > 1) return 'mixed';
return 'none';
```

`variation_present` is true only when a capability has more than one current exact cell and the cells do not all expose the same classification set.

Resource buckets key on exact `{ resource_class, basis, unit }`. Numeric `min_amount`/`max_amount` are present only when the basis is not `unknown`; unknown buckets use `null` for both. Never calculate average/sum across unlike buckets.

`verifyCognitiveCapabilitySurfaceReport(document, profile, observations)` MUST:

1. validate supplied document shape;
2. re-derive the canonical report using the supplied report identity/timestamps plus exact profile/observation artifacts;
3. compare canonical digest of supplied document with canonical digest of the re-derived document;
4. fail closed on any mismatch, source substitution, ordering change, profile change, evidence change, timestamp change, or aggregate change;
5. return a deeply frozen evidence-only verification summary containing report/profile IDs+digests, source count, report digest, and the hard non-authority constants.

- [ ] **Step 4: Prove GREEN and commit**

Run focused tests plus full protected verification. Expected: deterministic permutation tests, conflict/variation tests, provenance/failure/resource tests, verifier tamper tests, and existing kernel all green.

Commit message:

```text
feat: aggregate exact cognitive capability surfaces
```

---

### Task 3: Strict JSON Schema 2020-12 mirror

**Files:**
- Create: `mesh/test/cognitive-capability-surface-report-schema.test.mjs`
- Create: `mesh/config/cognitive-capability-surface-report-v0.schema.json`

**Interfaces:**
- Mirrors the semantic report vocabulary and hard constants. Cross-artifact equality, canonical ordering, freshness derivation, exact-cell derivation, conflict semantics, and verifier equality remain semantic rules annotated with `x-axiom-semantic-rules`.

- [ ] **Step 1: Write schema RED tests with schema deliberately absent**

Test exact schema expectations:

```js
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.$id,
  'https://axiom.invalid/schemas/cognitive-capability-surface-report-v0.schema.json');
assert.equal(schema.properties.schema.const,
  'axiom-cognitive-capability-surface-report.v0');
assert.equal(schema.properties.version.const, 0);
assert.equal(schema.properties.status.const, 'inert-evidence-report');
assert.equal(schema.properties.contains_secret_material.const, false);
assert.equal(schema.properties.authority_effect.const, 'none');
assert.equal(schema.properties.network_effect.const, 'none');
assert.equal(schema.properties.training_effect.const, 'none');
assert.equal(schema.properties.spend_effect.const, 'none');
assert.equal(schema.properties.runtime_activation.const, false);
assert.equal(schema.properties.selection_effect.const, 'evidence-only');
```

Also assert `additionalProperties:false` at every object boundary; source freshness enum is exactly `current|stale|future|not-yet-recorded`; conflict enum is exactly `none|mixed|direct`; source array maxItems is 256; required sets mirror the semantic validator; annotations explicitly deny universal score/rank/routing/authority claims.

- [ ] **Step 2: Prove schema RED**

Expected: `ENOENT` for `mesh/config/cognitive-capability-surface-report-v0.schema.json` and no unrelated semantic regression.

- [ ] **Step 3: Add the minimal strict schema mirror**

Use Draft 2020-12 with repository convention:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://axiom.invalid/schemas/cognitive-capability-surface-report-v0.schema.json"
}
```

Mirror all structural closed vocabularies and constants. Add:

```json
"x-axiom-semantic-validator": "mesh/src/lib/cognitive-capability-surface-report.mjs"
```

and semantic annotations stating that profile/source digest equality, freshness precedence, exact-cell grouping, conflict classification, canonical ordering, aggregation attribution, and report re-verification are enforced by the semantic module rather than falsely claimed as JSON Schema-only constraints.

- [ ] **Step 4: Prove schema GREEN and commit**

Run schema tests, focused semantic tests, then protected full verification on the exact head.

Commit message:

```text
feat: add capability surface report schema
```

---

### Task 4: Exact-head scope and authority verification

**Files:** no new production files.

- [ ] **Step 1: Compare final branch against the exact merged base**

Expected changed implementation files only:

```text
mesh/src/lib/cognitive-capability-surface-report.mjs
mesh/test/cognitive-capability-surface-report.test.mjs
mesh/config/cognitive-capability-surface-report-v0.schema.json
mesh/test/cognitive-capability-surface-report-schema.test.mjs
```

Any change to capability registry, provider invocation, authorization/effect paths, runtime activation, Cognitive Selection v0, or Cognitive Topology is out of scope and must be removed.

- [ ] **Step 2: Verify import boundary**

Production module imports only:

```text
./canonical.mjs
./cognitive-capability-profile.mjs
./cognitive-capability-observation.mjs
```

No network, filesystem, process, credential, provider, runtime, training, spend, Gateway, Hypervisor, Sandbox, Grid, or topology imports.

- [ ] **Step 3: Verify exact-head protected CI**

Require at minimum the repository's protected `verify`, `container`, Actions analysis, and JavaScript/TypeScript analysis contexts green on the exact final head. Record Node 22/macOS/Windows compatibility separately and claim only observed successes.

- [ ] **Step 4: Request code review and address findings before merge readiness**

Any Critical/Important finding is blocking. Minor consistency findings are verified against current repository conventions and fixed when technically sound, with fresh exact-head verification after every code-changing review fix.

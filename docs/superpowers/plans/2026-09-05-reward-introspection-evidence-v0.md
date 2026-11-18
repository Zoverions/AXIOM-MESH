# Reward Introspection Evidence v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four strict, content-addressed, evidence-only contracts for model reward/introspection probes, observations, calibration, and drift comparison without enabling model invocation, routing, promotion, authority, or external effects.

**Architecture:** Implement four pure Node.js ESM libraries with matching JSON Schema 2020-12 mirrors. Bind every downstream artifact to exact upstream digests, preserve independently sourced outcome evidence, fail closed on incompatible comparisons, and keep raw hidden states / chain-of-thought out of durable evidence. The subsystem ends at evaluation evidence and never crosses into the Gateway/capability authority path.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, existing `mesh/src/lib/canonical.mjs` (`digestObject`, `ValidationError`), existing Cognitive Topology and Cognitive Capability Profile validators/digests, JSON Schema 2020-12.

**Spec:** `docs/superpowers/specs/2026-09-05-reward-introspection-evidence-v0-design.md`

## Global Constraints

- Node compatibility remains `>=22.23.2 <23 || >=24.14.0 <25`.
- `mesh/config/capabilities.json` remains authoritative and MUST NOT be widened for this slice.
- Every new contract is strict, closed-world, fail-closed, deterministic, and evidence-only.
- `authority_effect = none`.
- `network_effect = none`.
- `credential_visibility = none`.
- `runtime_activation = false`.
- `routing_effect = none`.
- `promotion_effect = evidence-only`.
- No production module in this slice may import filesystem, network, subprocess, Gateway-effect, credential/token broker, wallet/payment, provider client, model-runtime launcher, or capability-grant surfaces.
- Raw prompt text, response text, chain-of-thought, raw hidden states/tensors, reconstructive embeddings, credentials, secrets, and direct personal-data payloads MUST NOT appear in durable v0 evidence contracts.
- `NaN`, positive infinity, and negative infinity MUST fail closed anywhere numeric evidence is accepted.
- Probability semantics MUST NOT be inferred from arbitrary scores; they are allowed only when the exact bound probe manifest declares `calibrated-probabilistic`.
- External correctness/outcome evidence MUST remain independently sourced and MUST NOT be satisfied by self-attestation from the same model/probe.
- Incompatible probe/model/calibration conditions MUST become `incompatible`; they MUST NOT be numerically compared as if equivalent.
- Insufficient evidence MUST remain explicit as `insufficient-evidence`; no validator/resolver may fabricate calibration or drift certainty.
- Existing canonical digest conventions from `canonical.mjs` MUST be used for all contract digests.
- Resolver outputs must be frozen/deep-frozen consistent with nearby cognitive evidence modules.

---

### Task 1: Reward Probe Manifest v0

**Files:**
- Create: `mesh/test/reward-probe-manifest.test.mjs`
- Create: `mesh/test/reward-probe-manifest-schema.test.mjs`
- Create after RED: `mesh/src/lib/reward-probe-manifest.mjs`
- Create after RED: `mesh/config/reward-probe-manifest-v0.schema.json`

**Interfaces:**
- Produces:
  - `REWARD_PROBE_MANIFEST_SCHEMA = 'axiom-reward-probe-manifest.v0'`
  - `validateRewardProbeManifest(document)`
  - `rewardProbeManifestDigest(document)`
  - `resolveRewardProbeManifest(document, target)`
- `resolveRewardProbeManifest(document, target)` consumes one exact target form:
  - topology node: `{ kind: 'topology-node', topology, node_id }`
  - runtime offering: `{ kind: 'runtime-offering', profile }`
  - exact model artifact: `{ kind: 'model-artifact', model_id, artifact_digest }`
- Consumes: `digestObject`, `ValidationError`, `validateCognitiveTopology`, `cognitiveTopologyDigest`, `validateCognitiveCapabilityProfile`, `cognitiveCapabilityProfileDigest`.

- [ ] **Step 1: Write failing manifest tests**

Assert the public surface and deterministic digest:

```js
assert.equal(REWARD_PROBE_MANIFEST_SCHEMA, 'axiom-reward-probe-manifest.v0');
assert.equal(validateRewardProbeManifest(validManifest).valid, true);
assert.match(rewardProbeManifestDigest(validManifest), /^[a-f0-9]{64}$/);
assert.equal(
  rewardProbeManifestDigest(validManifest),
  rewardProbeManifestDigest(Object.fromEntries(Object.entries(validManifest).reverse()))
);
```

Use these closed vocabularies:

```text
target_kind:
  topology-node
  model-artifact
  runtime-offering

probe_type:
  state-value
  reward-prediction-error

measurement_method:
  linear-probe
  sparse-feature-probe
  activation-subset
  model-native-signal
  other-reviewed

calibration_class:
  uncalibrated
  calibrated-bounded
  calibrated-probabilistic

transfer_scope:
  exact-target-only
  declared-family
  reviewed-cross-target

artifact_digest_availability:
  exact
  unavailable-provider-controlled
  not-applicable
```

Required top-level shape:

```js
{
  schema,
  version,
  status,
  manifest_id,
  target_kind,
  target,
  probe_type,
  measurement_method,
  probe_artifact_ref,
  probe_artifact_digest,
  artifact_digest_availability,
  method_ref,
  evidence_ref,
  evidence_digest,
  feature_descriptor,
  training_data_class,
  dataset_refs,
  calibration,
  transfer_scope,
  transfer_evidence_refs,
  limitations,
  source_refs,
  created_at,
  recorded_at,
  contains_secret_material,
  authority_effect,
  network_effect,
  credential_visibility,
  runtime_activation,
  routing_effect,
  promotion_effect
}
```

`target` is a closed discriminated object:

```js
// topology-node
{ topology_id, topology_digest, node_id, model_id, artifact_digest }

// model-artifact
{ model_id, artifact_digest }

// runtime-offering
{ profile_id, profile_digest, offering_ref, entry_id, entry_version, entry_digest }
```

Tests must prove:
- topology target binding recomputes `cognitiveTopologyDigest(topology)` and checks node/model/artifact facts exactly.
- runtime-offering binding recomputes `cognitiveCapabilityProfileDigest(profile)` and checks profile/offering/catalog facts exactly.
- model-artifact requires an exact 64-hex artifact digest.
- `other-reviewed` requires non-null `method_ref`, `evidence_ref`, and `evidence_digest`.
- `calibration` is a closed object `{ class, method_ref, evidence_digest, population_ref, score_min, score_max, normalization_rule_ref, uncertainty_method_ref }`; uncalibrated manifests require all fields except `class` to be null.
- calibrated manifests require finite ordered score bounds and non-null method/evidence/population fields.
- broader transfer scope requires non-empty `transfer_evidence_refs` of `{ evidence_ref, evidence_digest }`; `exact-target-only` requires an empty array.
- artifact-backed probe methods require `probe_artifact_digest`; `model-native-signal` may use null when `artifact_digest_availability` is `not-applicable`.
- raw-content fields such as `prompt`, `response`, `chain_of_thought`, `hidden_state`, `activation_tensor`, `embedding`, `api_key`, `token`, or `credential` fail as unknown fields.
- all six boundary constants reject widening.
- canonical timestamps are required and `recorded_at >= created_at`.
- validator/resolver preserve deeply frozen inputs.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/reward-probe-manifest.test.mjs test/reward-probe-manifest-schema.test.mjs
```

Expected: FAIL because the module/schema do not yet exist.

- [ ] **Step 3: Implement the minimal manifest library**

Follow the existing cognitive-evidence style: local `exactObject`, identifier/digest/timestamp helpers, `Number.isFinite`, `digestObject`, and deep-freeze outputs. `validateRewardProbeManifest()` returns a frozen summary including `manifest_digest` and all zero-effect boundaries. `resolveRewardProbeManifest()` validates the supplied target with the existing source contract, recomputes exact digests, rejects drift, and returns a resolved frozen evidence summary.

- [ ] **Step 4: Add the JSON Schema mirror**

Use JSON Schema 2020-12, `additionalProperties: false` at every object layer, exact enum/constant vocabularies, bounded arrays/strings, digest patterns, `x-axiom-semantic-validator`, semantic rules for exact target binding/calibration/transfer semantics, and non-claims including `authority-grant`, `routing`, `promotion`, `runtime-activation`, `network-effect`, `biological-dopamine`, and `consciousness-inference`.

- [ ] **Step 5: Verify GREEN and commit**

```bash
cd mesh
node --test test/reward-probe-manifest.test.mjs test/reward-probe-manifest-schema.test.mjs
git add src/lib/reward-probe-manifest.mjs config/reward-probe-manifest-v0.schema.json \
  test/reward-probe-manifest.test.mjs test/reward-probe-manifest-schema.test.mjs
git commit -m "feat: add reward probe manifest v0"
```

### Task 2: Reward Introspection Observation v0

**Files:**
- Create: `mesh/test/reward-introspection-observation.test.mjs`
- Create: `mesh/test/reward-introspection-observation-schema.test.mjs`
- Create after RED: `mesh/src/lib/reward-introspection-observation.mjs`
- Create after RED: `mesh/config/reward-introspection-observation-v0.schema.json`

**Interfaces:**
- Produces:
  - `REWARD_INTROSPECTION_OBSERVATION_SCHEMA = 'axiom-reward-introspection-observation.v0'`
  - `validateRewardIntrospectionObservation(document)`
  - `rewardIntrospectionObservationDigest(document)`
  - `resolveRewardIntrospectionObservation(document, manifest, target)`
- Consumes: `rewardProbeManifestDigest`, `resolveRewardProbeManifest`, and Task 1 target forms.

- [ ] **Step 1: Write failing observation tests**

Required shape:

```js
{
  schema,
  version,
  status,
  observation_id,
  probe_manifest_id,
  probe_manifest_digest,
  target_ref,
  target_digest,
  reasoning_state_ref,
  reasoning_state_digest,
  step_ref,
  raw_score,
  normalized_score,
  normalized_range,
  probability_semantics,
  uncertainty,
  provenance_ref,
  provenance_digest,
  observed_at,
  recorded_at,
  contains_secret_material,
  authority_effect,
  network_effect,
  credential_visibility,
  runtime_activation,
  routing_effect,
  promotion_effect
}
```

`normalized_range` is null or `{ min, max }`. `uncertainty` is null or `{ lower, upper, confidence }`.

Test:

```js
for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  const item = observation();
  item.raw_score = value;
  assert.throws(() => validateRewardIntrospectionObservation(item));
}
```

Also prove:
- exact manifest id/digest binding and exact target inheritance.
- uncalibrated manifests require `normalized_score`, `normalized_range`, and `uncertainty` to be null and `probability_semantics` false.
- normalized values require manifest normalization metadata and must lie within the manifest score range.
- `probability_semantics: true` requires `calibrated-probabilistic` and a normalized range exactly `[0, 1]`.
- uncertainty requires a manifest `uncertainty_method_ref`; interval endpoints/confidence are finite and ordered/bounded.
- `recorded_at >= observed_at`.
- reasoning state and step fields are opaque refs/digests only; raw prompt/response/CoT/activation payload fields fail closed.
- action-like fields `recommended_action`, `route_to`, `activate_model`, `approve_candidate`, `grant_capability`, and `execute` fail as unknown.
- deeply frozen inputs are preserved.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/reward-introspection-observation.test.mjs test/reward-introspection-observation-schema.test.mjs
```

Expected: FAIL because the module/schema do not yet exist.

- [ ] **Step 3: Implement validator/resolver and schema**

The resolver must call `resolveRewardProbeManifest(manifest, target)`, recompute `rewardProbeManifestDigest(manifest)`, verify exact target consistency, and return a frozen evidence summary. It MUST NOT convert arbitrary scores into probability or derive any route/action. The schema mirrors every closed object and hard boundary and delegates cross-document normalization/probability semantics to `x-axiom-semantic-rules`.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd mesh
node --test test/reward-introspection-observation.test.mjs test/reward-introspection-observation-schema.test.mjs
git add src/lib/reward-introspection-observation.mjs config/reward-introspection-observation-v0.schema.json \
  test/reward-introspection-observation.test.mjs test/reward-introspection-observation-schema.test.mjs
git commit -m "feat: add reward introspection observation v0"
```

### Task 3: Reward Calibration Report v0

**Files:**
- Create: `mesh/test/reward-calibration-report.test.mjs`
- Create: `mesh/test/reward-calibration-report-schema.test.mjs`
- Create after RED: `mesh/src/lib/reward-calibration-report.mjs`
- Create after RED: `mesh/config/reward-calibration-report-v0.schema.json`

**Interfaces:**
- Produces:
  - `REWARD_CALIBRATION_REPORT_SCHEMA = 'axiom-reward-calibration-report.v0'`
  - `validateRewardCalibrationReport(document)`
  - `rewardCalibrationReportDigest(document)`
  - `resolveRewardCalibrationReport(document, manifest, observations)`
- Consumes exact Reward Probe Manifest v0 and Reward Introspection Observation v0 documents.

- [ ] **Step 1: Write failing calibration tests**

Required shape:

```js
{
  schema,
  version,
  status,
  report_id,
  probe_manifest_id,
  probe_manifest_digest,
  target_ref,
  target_digest,
  evaluation_set_ref,
  evaluation_set_digest,
  task_domain,
  sample_count,
  minimum_sample_count,
  inclusion_rule_ref,
  inclusion_rule_digest,
  verification_source,
  samples,
  metrics,
  calibration_status,
  evaluated_from,
  evaluated_to,
  recorded_at,
  contains_secret_material,
  authority_effect,
  network_effect,
  credential_visibility,
  runtime_activation,
  routing_effect,
  promotion_effect
}
```

`verification_source`:

```js
{
  source_class, // benchmark-harness | deterministic-checker | human-adjudication | independent-verifier | other-reviewed
  source_ref,
  source_digest,
  principal_ref,
  independent_from_probe // const true
}
```

Each `samples[]` entry:

```js
{
  observation_id,
  observation_digest,
  outcome_ref,
  outcome_digest,
  outcome_result // success | failure | indeterminate
}
```

Closed metrics:

```text
agreement-count
disagreement-count
success-rate
calibration-error
discrimination-score
false-high-confidence-count
false-low-confidence-count
missing-invalid-observation-count
```

Closed statuses:

```text
calibrated
miscalibrated
mixed
insufficient-evidence
incompatible
```

Tests must prove:
- every sample observation resolves to the same exact manifest and target.
- duplicate observation ids/digests or duplicate outcome refs/digests fail closed.
- `sample_count === samples.length`.
- `sample_count < minimum_sample_count` forces `insufficient-evidence`.
- `calibration-error` is permitted only for `calibrated-probabilistic` probes.
- `verification_source.independent_from_probe` must be true; verifier provenance must not alias the exact probe manifest id or target ref.
- outcome evidence stays reference/digest/result only; raw answer/content fields are rejected.
- metric names are unique and every metric value is finite.
- invalid chronology fails (`evaluated_to < evaluated_from`, `recorded_at < evaluated_to`).
- report/status cannot carry routing, promotion, activation, or authority semantics.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/reward-calibration-report.test.mjs test/reward-calibration-report-schema.test.mjs
```

Expected: FAIL because the module/schema do not yet exist.

- [ ] **Step 3: Implement strict report validation/resolution**

`resolveRewardCalibrationReport()` must:
1. validate the report and exact manifest digest;
2. validate/re-digest each supplied observation;
3. require exact manifest and target identity across observations;
4. require every sample observation id/digest to match exactly one supplied observation;
5. keep outcome evidence separate from introspection evidence;
6. force structural `insufficient-evidence` when the minimum sample count is not met;
7. reject `calibration-error` for non-probabilistic probes;
8. never invent scientific thresholds for `calibrated`, `miscalibrated`, or `mixed`—those statuses remain bound to the declared evaluation methodology/evidence.

- [ ] **Step 4: Add the JSON Schema mirror**

Use closed nested objects, bounded arrays, exact boundary constants, digest patterns, semantic rules for unique samples/metrics, independent verification, sample sufficiency, and non-claims for correctness proof, self-certification, authority, routing, and activation.

- [ ] **Step 5: Verify GREEN and commit**

```bash
cd mesh
node --test test/reward-calibration-report.test.mjs test/reward-calibration-report-schema.test.mjs
git add src/lib/reward-calibration-report.mjs config/reward-calibration-report-v0.schema.json \
  test/reward-calibration-report.test.mjs test/reward-calibration-report-schema.test.mjs
git commit -m "feat: add reward calibration report v0"
```

### Task 4: Reward Drift Comparison v0

**Files:**
- Create: `mesh/test/reward-drift-comparison.test.mjs`
- Create: `mesh/test/reward-drift-comparison-schema.test.mjs`
- Create after RED: `mesh/src/lib/reward-drift-comparison.mjs`
- Create after RED: `mesh/config/reward-drift-comparison-v0.schema.json`

**Interfaces:**
- Produces:
  - `REWARD_DRIFT_COMPARISON_SCHEMA = 'axiom-reward-drift-comparison.v0'`
  - `validateRewardDriftComparison(document)`
  - `rewardDriftComparisonDigest(document)`
  - `resolveRewardDriftComparison(document, referenceManifest, referenceReport, candidateManifest, candidateReport)`
- Consumes exact probe manifests and calibration reports from Tasks 1 and 3.

- [ ] **Step 1: Write failing drift tests**

Required shape:

```js
{
  schema,
  version,
  status,
  comparison_id,
  reference,
  candidate,
  comparison_scope,
  metric_deltas,
  compatibility,
  drift_status,
  compared_at,
  recorded_at,
  contains_secret_material,
  authority_effect,
  network_effect,
  credential_visibility,
  runtime_activation,
  routing_effect,
  promotion_effect
}
```

Each side:

```js
{
  manifest_id,
  manifest_digest,
  calibration_report_id,
  calibration_report_digest,
  target_ref,
  target_digest
}
```

`comparison_scope`:

```js
{
  task_domain,
  population_ref,
  population_digest,
  metric_set_ref,
  metric_set_digest,
  method_ref,
  method_digest,
  bounds_ref,
  bounds_digest
}
```

Each `metric_deltas[]` entry:

```js
{
  metric_name,
  reference_value,
  candidate_value,
  delta
}
```

`compatibility`:

```js
{
  compatible,
  reason_codes
}
```

Closed compatibility reason codes:

```text
compatible
probe-type-mismatch
measurement-method-mismatch
normalization-semantics-mismatch
calibration-class-mismatch
target-binding-incompatible
population-incompatible
metric-set-incompatible
transfer-scope-insufficient
insufficient-calibration-evidence
```

Closed drift statuses:

```text
stable-within-declared-bounds
material-drift
mixed
insufficient-evidence
incompatible
```

Tests must prove:
- exact predecessor/candidate ids/digests are preserved.
- probe-type, measurement-method, normalization, calibration, population, metric-set, target-transfer, and transfer-scope incompatibilities are reason-coded deterministically.
- any hard incompatibility forces `compatibility.compatible = false`, `drift_status = 'incompatible'`, and an empty `metric_deltas` array.
- if no hard incompatibility exists but either calibration report is `insufficient-evidence`, drift status is `insufficient-evidence` and numeric drift claims are empty.
- compatible comparisons only accept metrics present with identical metric semantics on both reports.
- every `delta` equals `candidate_value - reference_value`; all values are finite.
- `stable-within-declared-bounds`, `material-drift`, or `mixed` requires non-null bound methodology refs/digests in `comparison_scope`; the kernel validates binding but does not define universal thresholds.
- source inputs remain unmodified and canonical digesting is deterministic.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/reward-drift-comparison.test.mjs test/reward-drift-comparison-schema.test.mjs
```

Expected: FAIL because the module/schema do not yet exist.

- [ ] **Step 3: Implement compatibility gate and resolver**

Resolution order:

```text
validate documents
-> recompute exact manifest/report digests
-> evaluate hard compatibility and sorted reason codes
-> incompatible => no numeric comparison
-> otherwise check calibration sufficiency
-> insufficient evidence => no numeric comparison
-> otherwise verify each supplied metric delta from exact report metric values
-> require bound comparison methodology/bounds for stable/material/mixed status
-> return frozen evidence-only result
```

Do not embed universal drift thresholds in v0.

- [ ] **Step 4: Add schema, verify GREEN, and commit**

```bash
cd mesh
node --test test/reward-drift-comparison.test.mjs test/reward-drift-comparison-schema.test.mjs
git add src/lib/reward-drift-comparison.mjs config/reward-drift-comparison-v0.schema.json \
  test/reward-drift-comparison.test.mjs test/reward-drift-comparison-schema.test.mjs
git commit -m "feat: add reward drift comparison v0"
```

The JSON Schema mirror must use closed objects, exact enums/constants, digest patterns, compatibility structures, semantic-validator metadata, and explicit non-claims for promotion/activation/authority.

### Task 5: Authority isolation, canonical docs, and exact-head verification

**Files:**
- Create: `mesh/test/reward-introspection-boundary-static.test.mjs`
- Modify: `mesh/src/check-docs.mjs`
- Modify: `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- Existing: `docs/superpowers/specs/2026-09-05-reward-introspection-evidence-v0-design.md`
- Existing: `docs/superpowers/plans/2026-09-05-reward-introspection-evidence-v0.md`

**Interfaces:**
- Inspects the four new production modules.
- Registers the new spec and plan in `CANONICAL_DOCUMENTS`.
- Does not add or modify an executable capability.

- [ ] **Step 1: Write the static authority/I-O boundary test**

Parse only actual ESM import specifiers using:

```js
const imports = [...source.matchAll(/from\s+['"](.+?)['"]/g)].map(match => match[1]).sort();
```

Across the four modules, allowed local imports are limited to the subset each module needs from:

```text
./canonical.mjs
./cognitive-topology.mjs
./cognitive-capability-profile.mjs
./reward-probe-manifest.mjs
./reward-introspection-observation.mjs
./reward-calibration-report.mjs
```

Reject import specifiers beginning with or naming:

```text
node:fs
node:http
node:https
node:net
node:tls
node:dns
node:child_process
node:worker_threads
gateway
hypervisor
sandbox
grid
credential-broker
wallet
payment
provider-client
runtime-supervisor
capability-grant
```

Also reject executable-call tokens with word-boundary/parenthesis-aware checks, not naive substrings, for:

```text
fetch(
activateModel(
routeTo(
approveCandidate(
grantCapability(
```

Do **not** forbid the legitimate inert field name `credential_visibility` merely because it contains the word `credential`.

Behavioral tests for each contract must assert the frozen resolved output contains exactly the six approved boundary values.

- [ ] **Step 2: Register canonical documents**

Add exactly:

```text
docs/superpowers/specs/2026-09-05-reward-introspection-evidence-v0-design.md
docs/superpowers/plans/2026-09-05-reward-introspection-evidence-v0.md
```

to `CANONICAL_DOCUMENTS` in `mesh/src/check-docs.mjs`. Do not add the four `mesh/config/*schema.json` files; nearby cognitive config schemas are verified by dedicated schema tests rather than the canonical-document list.

- [ ] **Step 3: Cross-link Cognitive Topology**

Add one short current-boundary paragraph to `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`: Reward Introspection Evidence v0 is an optional evidence-only adjunct for internal value/reward-prediction-error observations, calibration, and drift evaluation. It does not alter Cognitive Topology, runtime activation, routing, promotion, capability authority, or the existing governed self-improvement lifecycle.

- [ ] **Step 4: Run all focused tests**

```bash
cd mesh
node --test \
  test/reward-probe-manifest.test.mjs \
  test/reward-probe-manifest-schema.test.mjs \
  test/reward-introspection-observation.test.mjs \
  test/reward-introspection-observation-schema.test.mjs \
  test/reward-calibration-report.test.mjs \
  test/reward-calibration-report-schema.test.mjs \
  test/reward-drift-comparison.test.mjs \
  test/reward-drift-comparison-schema.test.mjs \
  test/reward-introspection-boundary-static.test.mjs
```

Expected: all PASS.

- [ ] **Step 5: Run documentation, registry, and full checks**

```bash
cd mesh
npm run docs:check
npm run check-registry
npm run check
```

Expected: PASS with no `mesh/config/capabilities.json` change. If `check-registry` requires this evidence class to become an executable capability, STOP and return to design review rather than weakening the checker or widening authority.

- [ ] **Step 6: Review exact changed-file scope**

Expected implementation files:

```text
docs/superpowers/specs/2026-09-05-reward-introspection-evidence-v0-design.md
docs/superpowers/plans/2026-09-05-reward-introspection-evidence-v0.md
docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md
mesh/src/check-docs.mjs
mesh/src/lib/reward-probe-manifest.mjs
mesh/src/lib/reward-introspection-observation.mjs
mesh/src/lib/reward-calibration-report.mjs
mesh/src/lib/reward-drift-comparison.mjs
mesh/config/reward-probe-manifest-v0.schema.json
mesh/config/reward-introspection-observation-v0.schema.json
mesh/config/reward-calibration-report-v0.schema.json
mesh/config/reward-drift-comparison-v0.schema.json
mesh/test/reward-probe-manifest.test.mjs
mesh/test/reward-probe-manifest-schema.test.mjs
mesh/test/reward-introspection-observation.test.mjs
mesh/test/reward-introspection-observation-schema.test.mjs
mesh/test/reward-calibration-report.test.mjs
mesh/test/reward-calibration-report-schema.test.mjs
mesh/test/reward-drift-comparison.test.mjs
mesh/test/reward-drift-comparison-schema.test.mjs
mesh/test/reward-introspection-boundary-static.test.mjs
```

No Gateway, Hypervisor, Sandbox, Grid, provider/runtime invocation, credential broker, wallet/payment, external-network, or capability-registry authority file should change.

- [ ] **Step 7: Commit boundary/docs integration**

```bash
cd mesh
git add src/check-docs.mjs test/reward-introspection-boundary-static.test.mjs \
  ../docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md \
  ../docs/superpowers/specs/2026-09-05-reward-introspection-evidence-v0-design.md \
  ../docs/superpowers/plans/2026-09-05-reward-introspection-evidence-v0.md
git commit -m "test: verify reward introspection authority boundary"
```

- [ ] **Step 8: Open PR and require exact-head verification**

PR summary must state:
- evidence-only introspection contracts;
- no runtime/model invocation;
- no raw hidden-state persistence;
- no capability widening;
- no routing/promotion/authority effects;
- independently sourced external outcome evidence remains mandatory for calibration.

Require the repository's protected CI, especially Clean Kernel and supported Node/platform compatibility. Inspect exact failing assertions/logs before any retry or repair.

- [ ] **Step 9: Merge only the freshly verified exact head**

Do not claim implementation complete until the final PR head is green and the merged `main` commit is known. Verify required post-merge workflows on that resulting `main` commit before closing the slice.

---

## Self-Review Checklist

- Spec coverage: all four contracts, exact digest binding, privacy minimization, independent outcomes, sample sufficiency, compatibility gating, recursive-improvement evidence-only integration, static authority isolation, canonical documentation registration, and full verification are assigned to explicit tasks.
- Placeholder scan: no `TBD`, `TODO`, “similar to”, or unspecified implementation step remains.
- Type consistency: every downstream interface consumes function names and document fields defined in earlier tasks.
- Privacy consistency: calibration samples carry only observation/outcome references, digests, and bounded outcome classes; no raw reasoning or answer content is required.
- Scope discipline: no model adapter, hidden-state extractor, routing policy, promotion rule, capability grant, or runtime invocation is introduced.
- Authority discipline: any discovery that requires changing `mesh/config/capabilities.json` is an explicit STOP/review condition, not an implementation shortcut.

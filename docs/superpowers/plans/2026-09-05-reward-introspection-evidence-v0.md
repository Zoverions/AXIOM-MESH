# Reward Introspection Evidence v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four strict, content-addressed, evidence-only contracts for model reward/introspection probes, observations, calibration, and drift comparison without enabling model invocation, routing, promotion, authority, or external effects.

**Architecture:** Implement four pure Node.js ESM libraries with matching JSON Schema 2020-12 mirrors. Bind every downstream artifact to exact upstream digests, preserve independent external outcome evidence, fail closed on incompatible comparisons, and keep raw hidden states / chain-of-thought out of durable evidence. The subsystem ends at evaluation evidence and never crosses into the Gateway/capability authority path.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, existing `mesh/src/lib/canonical.mjs` (`digestObject`, `ValidationError`), existing Cognitive Topology and Cognitive Capability Profile validators/digests, JSON Schema 2020-12.

**Spec:** `docs/superpowers/specs/2026-09-05-reward-introspection-evidence-v0-design.md`

## Global Constraints

- Node compatibility remains `>=22.23.2 <23 || >=24.14.0 <25`.
- `mesh/config/capabilities.json` remains authoritative and MUST NOT be widened for this slice.
- Every new contract is strict, closed-world, fail-closed, deterministic, and evidence-only.
- `authority_effect` must remain `none`.
- `network_effect` must remain `none`.
- `credential_visibility` must remain `none`.
- `runtime_activation` must remain `false`.
- `routing_effect` must remain `none`.
- `promotion_effect` must remain `evidence-only`.
- No production module in this slice may import filesystem, network, subprocess, Gateway-effect, credential/token, wallet/payment, provider client, model-runtime launcher, or capability-grant surfaces.
- Raw prompt text, response text, chain-of-thought, raw hidden states/tensors, reconstructive embeddings, credentials, secrets, and direct personal-data payloads MUST NOT appear in durable v0 evidence contracts.
- `NaN`, positive infinity, and negative infinity MUST fail closed anywhere numeric evidence is accepted.
- Probability semantics MUST NOT be inferred from arbitrary scores; they are allowed only when the bound probe manifest declares `calibrated-probabilistic`.
- External correctness/outcome evidence MUST remain independently sourced and MUST NOT be satisfied by self-attestation from the same model/probe.
- Incompatible probe/model/calibration conditions MUST return or validate to `incompatible`; they MUST NOT be numerically compared as if equivalent.
- Insufficient evidence MUST remain explicit as `insufficient-evidence`; no validator/resolver may fabricate calibration or drift certainty.
- Existing canonical digest conventions from `canonical.mjs` MUST be used for all contract digests.
- All returned resolver summaries should be frozen/deep-frozen consistent with nearby cognitive evidence modules.

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
- `resolveRewardProbeManifest(document, target)` consumes one of the exact target forms below:
  - `target.kind === 'topology-node'` with `{ kind, topology, node_id }`; validate with `validateCognitiveTopology(topology)`, recompute `cognitiveTopologyDigest(topology)`, locate `node_id`, and compare exact target/model/artifact facts.
  - `target.kind === 'runtime-offering'` with `{ kind, profile }`; validate with `validateCognitiveCapabilityProfile(profile)`, recompute `cognitiveCapabilityProfileDigest(profile)`, and compare exact profile/offering/catalog identity fields.
  - `target.kind === 'model-artifact'` with `{ kind, model_id, artifact_digest }`; use only when an exact owner-addressable artifact digest exists.
- Consumes: `digestObject`, `ValidationError`, `validateCognitiveTopology`, `cognitiveTopologyDigest`, `validateCognitiveCapabilityProfile`, `cognitiveCapabilityProfileDigest`.

- [ ] **Step 1: Write the failing manifest tests**

Create fixtures for all three `target_kind` values and assert:

```js
assert.equal(REWARD_PROBE_MANIFEST_SCHEMA, 'axiom-reward-probe-manifest.v0');
assert.equal(validateRewardProbeManifest(validManifest).valid, true);
assert.match(rewardProbeManifestDigest(validManifest), /^[a-f0-9]{64}$/);
assert.equal(
  rewardProbeManifestDigest(validManifest),
  rewardProbeManifestDigest(Object.fromEntries(Object.entries(validManifest).reverse()))
);
```

Test the exact closed vocabularies:

```text
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

Also prove:
- `other-reviewed` requires `method_ref`, `evidence_ref`, and `evidence_digest`.
- calibrated manifests require calibration method/evidence/population/range; uncalibrated manifests require those calibration fields to be null.
- broader transfer scope requires non-empty transfer evidence references.
- `probe_artifact_digest` is required for artifact-backed probe methods and nullable only for `model-native-signal` where no separate probe artifact exists.
- raw-content fields such as `prompt`, `response`, `chain_of_thought`, `hidden_state`, `activation_tensor`, `embedding`, `api_key`, `token`, or `credential` fail as unknown fields.
- all six boundary constants reject widening.
- canonical timestamps are required and `recorded_at >= created_at`.
- validator/resolver do not mutate deeply frozen inputs.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd mesh
node --test test/reward-probe-manifest.test.mjs test/reward-probe-manifest-schema.test.mjs
```

Expected: FAIL because the module/schema do not yet exist.

- [ ] **Step 3: Implement the minimal manifest library**

Use the nearby cognitive evidence pattern: local `exactObject`, identifier/digest/timestamp helpers, `Number.isFinite`, `digestObject`, and deep-freeze outputs. Required top-level shape:

```js
{
  schema,
  version,
  status,
  manifest_id,
  probe_type,
  measurement_method,
  target,
  probe_artifact_ref,
  probe_artifact_digest,
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

`target` must be a closed object that carries enough exact identity/digest fields for the selected `target_kind`; do not accept a generic untyped blob.

`validateRewardProbeManifest()` returns a frozen summary including `manifest_digest` and all six zero-effect boundaries. `resolveRewardProbeManifest()` first validates the manifest and supplied target, then requires exact digest/identity binding and returns the resolved frozen evidence summary.

- [ ] **Step 4: Add the JSON Schema mirror**

Create JSON Schema 2020-12 with `additionalProperties: false` at every object layer, exact enum/constant vocabularies, bounded arrays/strings, digest patterns, semantic-validator metadata, and explicit non-claims including `authority-grant`, `routing`, `promotion`, `runtime-activation`, `network-effect`, `biological-dopamine`, and `consciousness-inference`.

- [ ] **Step 5: Verify GREEN**

Run the two focused tests again and require PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add mesh/src/lib/reward-probe-manifest.mjs \
  mesh/config/reward-probe-manifest-v0.schema.json \
  mesh/test/reward-probe-manifest.test.mjs \
  mesh/test/reward-probe-manifest-schema.test.mjs
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
- Consumes: `rewardProbeManifestDigest`, `resolveRewardProbeManifest`, and the exact target object used in Task 1.

- [ ] **Step 1: Write the failing observation tests**

Use one calibrated-probabilistic manifest fixture and one uncalibrated fixture. Assert exact manifest digest binding, exact target inheritance, deterministic digesting, deep immutability, and boundary constants.

Required observation shape:

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

Test these semantic failures explicitly:

```js
for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  const item = observation();
  item.raw_score = value;
  assert.throws(() => validateRewardIntrospectionObservation(item));
}
```

Also prove:
- `normalized_score` and `normalized_range` are both null for an uncalibrated manifest.
- normalized values require a manifest normalization declaration and must lie in the declared range.
- `probability_semantics: true` requires `calibrated-probabilistic` and normalized range `[0, 1]`.
- `uncertainty` is null unless the manifest declares an uncertainty method; if present its interval endpoints are finite and ordered.
- `recorded_at` cannot precede `observed_at`.
- manifest id/digest mismatch fails.
- target mismatch fails.
- `reasoning_state_ref`/`step_ref` are opaque references only; payload fields for prompt/response/CoT/raw activation are rejected.
- fields such as `recommended_action`, `route_to`, `activate_model`, `approve_candidate`, `grant_capability`, and `execute` are rejected as unknown.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/reward-introspection-observation.test.mjs test/reward-introspection-observation-schema.test.mjs
```

Expected: FAIL because the module/schema do not yet exist.

- [ ] **Step 3: Implement the minimal observation validator/resolver**

The resolver must call `resolveRewardProbeManifest(manifest, target)`, recompute `rewardProbeManifestDigest(manifest)`, verify target consistency, and then return a frozen evidence summary. It MUST NOT interpret a raw score as probability or derive a route/action.

- [ ] **Step 4: Add the JSON Schema mirror**

Mirror the exact observation contract, including finite numeric constraints where JSON Schema can express them, nullable normalized/uncertainty structures, six hard zero-effect constants, and semantic rules for normalization/probability enforcement in the JS validator.

- [ ] **Step 5: Verify GREEN**

Run the two focused tests and require PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add mesh/src/lib/reward-introspection-observation.mjs \
  mesh/config/reward-introspection-observation-v0.schema.json \
  mesh/test/reward-introspection-observation.test.mjs \
  mesh/test/reward-introspection-observation-schema.test.mjs
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
- Consumes: exact Reward Probe Manifest v0 and Reward Introspection Observation v0 documents.

- [ ] **Step 1: Write failing calibration tests**

Required top-level shape:

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
  observation_refs,
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

`verification_source` must be a closed object with:

```js
{
  source_class, // benchmark-harness | deterministic-checker | human-adjudication | independent-verifier | other-reviewed
  source_ref,
  source_digest,
  principal_ref,
  independent_from_probe // const true
}
```

Closed v0 metric names:

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

Closed status vocabulary:

```text
calibrated
miscalibrated
mixed
insufficient-evidence
incompatible
```

Tests must prove:
- every observation reference resolves to the same exact manifest and target.
- duplicate observation ids/digests fail closed.
- `sample_count` equals the count of accepted observation/outcome pairs represented by the report.
- `sample_count < minimum_sample_count` requires `calibration_status = 'insufficient-evidence'`.
- `calibration-error` is allowed only for `calibrated-probabilistic` probes.
- self-attested verifier identity that aliases the probe/model target is rejected; `independent_from_probe` must be true and verifier provenance must be separately identified.
- all metric values are finite and metric names are unique.
- invalid chronology fails (`evaluated_to < evaluated_from`, `recorded_at < evaluated_to`).
- report/status is evidence-only and cannot contain promotion/routing/action fields.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/reward-calibration-report.test.mjs test/reward-calibration-report-schema.test.mjs
```

Expected: FAIL because the module/schema do not yet exist.

- [ ] **Step 3: Implement strict report validation and resolution**

`resolveRewardCalibrationReport()` must:
1. validate the report;
2. validate/re-digest the manifest;
3. validate/re-digest each supplied observation;
4. require exact manifest and target identity across all observations;
5. require every `observation_ref` in the report to match exactly one supplied observation id/digest;
6. preserve the independently supplied verifier evidence as a separate structure;
7. derive only structural status constraints (for example sample insufficiency and incompatibility), never invent scientific thresholds for `calibrated` versus `miscalibrated`.

The validator may accept an explicitly reported `calibration_status` only when it is structurally consistent with sample sufficiency and probe compatibility. Scientific classification thresholds stay in the bound evaluation methodology/evidence, not hidden in kernel code.

- [ ] **Step 4: Add the JSON Schema mirror**

Use closed nested objects, bounded arrays, unique metric names enforced semantically, exact boundary constants, semantic-validator metadata, and non-claims for correctness proof, authority, routing, activation, and self-certification.

- [ ] **Step 5: Verify GREEN**

Run focused tests and require PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add mesh/src/lib/reward-calibration-report.mjs \
  mesh/config/reward-calibration-report-v0.schema.json \
  mesh/test/reward-calibration-report.test.mjs \
  mesh/test/reward-calibration-report-schema.test.mjs
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
- Consumes: exact probe manifests and calibration reports from Tasks 1 and 3.

- [ ] **Step 1: Write failing drift-comparison tests**

Required top-level shape:

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
  drift_status,
  compatibility,
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

Each side binds exact `{ manifest_id, manifest_digest, calibration_report_id, calibration_report_digest, target_ref, target_digest }`.

Closed drift status vocabulary:

```text
stable-within-declared-bounds
material-drift
mixed
insufficient-evidence
incompatible
```

Closed compatibility reason codes should include:

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

Tests must prove:
- exact predecessor/candidate identities and digests are preserved.
- probe-type mismatch resolves to `incompatible`.
- incompatible normalization or calibration semantics resolve to `incompatible`.
- transfer beyond `exact-target-only` without required transfer evidence resolves to `incompatible`.
- a reference or candidate report with `insufficient-evidence` forces drift status `insufficient-evidence` unless an earlier hard incompatibility applies.
- metric deltas are finite and only compare metric names present and semantically comparable on both sides.
- the resolver does not silently compare differently defined metrics.
- input order does not change canonical digest.
- no source input is mutated.

- [ ] **Step 2: Verify RED**

```bash
cd mesh
node --test test/reward-drift-comparison.test.mjs test/reward-drift-comparison-schema.test.mjs
```

Expected: FAIL because the module/schema do not yet exist.

- [ ] **Step 3: Implement the compatibility gate and drift resolver**

Resolution order must be deterministic:

```text
validate documents
-> verify exact digests/ids
-> evaluate hard compatibility
-> if incompatible: return incompatible with stable reason codes and no numeric drift claim
-> else if either side lacks sufficient calibration evidence: return insufficient-evidence
-> else validate supplied comparable metric deltas against exact report metrics
-> preserve declared drift_status only when structurally compatible with the evidence
```

Do not embed universal drift thresholds in v0. Thresholds/bounds belong to the separately referenced comparison methodology/evidence. The kernel verifies exact binding and semantic compatibility, not scientific policy.

- [ ] **Step 4: Add the JSON Schema mirror**

Mirror all closed enums/objects, exact boundary constants, digest patterns, compatibility structures, semantic-validator metadata, and non-claims for promotion/activation/authority.

- [ ] **Step 5: Verify GREEN**

Run focused tests and require PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add mesh/src/lib/reward-drift-comparison.mjs \
  mesh/config/reward-drift-comparison-v0.schema.json \
  mesh/test/reward-drift-comparison.test.mjs \
  mesh/test/reward-drift-comparison-schema.test.mjs
git commit -m "feat: add reward drift comparison v0"
```

### Task 5: Prove authority isolation, register canonical docs, and verify exact head

**Files:**
- Create: `mesh/test/reward-introspection-boundary-static.test.mjs`
- Modify: `mesh/src/check-docs.mjs`
- Existing spec: `docs/superpowers/specs/2026-09-05-reward-introspection-evidence-v0-design.md`
- Existing plan: `docs/superpowers/plans/2026-09-05-reward-introspection-evidence-v0.md`
- Modify only if narrowly necessary for cross-linking current executable evidence: `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`

**Interfaces:**
- Inspects the four new production modules.
- Registers the new spec and plan in `CANONICAL_DOCUMENTS` inside `mesh/src/check-docs.mjs`.
- Does not add or modify an executable capability.

- [ ] **Step 1: Write the static boundary test**

Load all four source files and reject forbidden imports/direct execution surfaces. Expected allowed local imports are limited to:

```text
./canonical.mjs
./cognitive-topology.mjs
./cognitive-capability-profile.mjs
./reward-probe-manifest.mjs
./reward-introspection-observation.mjs
./reward-calibration-report.mjs
```

Forbid direct references/imports to at least:

```text
node:fs
node:http
node:https
node:net
node:tls
node:dns
node:child_process
node:worker_threads
fetch(
gateway
hypervisor
sandbox
grid
credential
wallet
payment
provider-client
runtime-supervisor
capability-grant
activate_model
route_to
approve_candidate
grant_capability
```

The test should additionally parse/inspect exported resolved objects in the behavioral tests to prove `authority_effect: 'none'`, `network_effect: 'none'`, `credential_visibility: 'none'`, `runtime_activation: false`, `routing_effect: 'none'`, and `promotion_effect: 'evidence-only'` remain present.

- [ ] **Step 2: Register the new canonical documents**

Add exactly these paths to `CANONICAL_DOCUMENTS`:

```text
docs/superpowers/specs/2026-09-05-reward-introspection-evidence-v0-design.md
docs/superpowers/plans/2026-09-05-reward-introspection-evidence-v0.md
```

Do not add the four `mesh/config/*schema.json` files to the canonical documentation list unless `check-docs.mjs` already treats analogous `mesh/config` schemas as canonical documents; current nearby cognitive schemas are verified by dedicated schema tests instead.

- [ ] **Step 3: Add one narrow cross-link to the cognitive-topology design**

In the current executable-boundary/future-work portion of `2026-08-29-cognitive-topology-identity-kernel-design.md`, add a short statement that Reward Introspection Evidence v0 is an optional evidence-only adjunct for internal value/reward-prediction-error observations and drift evaluation; explicitly state it does not alter Cognitive Topology, authority, activation, routing, or promotion semantics.

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

- [ ] **Step 5: Run documentation and registry checks**

```bash
cd mesh
npm run docs:check
npm run check-registry
```

Expected: PASS with no capability-registry changes. If `check-registry` fails because this evidence class is unexpectedly required to register as a capability, STOP: that would widen the authority surface beyond this approved spec and requires a new design review rather than weakening the checker.

- [ ] **Step 6: Run the full local protected check**

```bash
cd mesh
npm run check
```

Expected: PASS. Do not suppress unrelated failures; classify them before proceeding.

- [ ] **Step 7: Review changed-file scope**

Expected implementation scope:

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

No `mesh/config/capabilities.json`, Gateway, Hypervisor, Sandbox, Grid, runtime/provider invocation, credential, wallet, or external-network file should change.

- [ ] **Step 8: Commit integration/documentation evidence**

```bash
git add mesh/src/check-docs.mjs \
  mesh/test/reward-introspection-boundary-static.test.mjs \
  docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md \
  docs/superpowers/specs/2026-09-05-reward-introspection-evidence-v0-design.md \
  docs/superpowers/plans/2026-09-05-reward-introspection-evidence-v0.md
git commit -m "test: verify reward introspection authority boundary"
```

- [ ] **Step 9: Open a PR and require exact-head CI**

PR summary must state:
- evidence-only introspection contracts;
- no runtime/model invocation;
- no raw hidden-state persistence;
- no capability widening;
- no routing/promotion/authority effects;
- independent external outcome evidence remains mandatory for calibration.

Require the repository's normal protected checks, especially Clean Kernel and supported Node/platform compatibility. Treat any failing check as unresolved until its exact assertion/log is inspected.

- [ ] **Step 10: Merge only a freshly verified exact head**

Do not claim implementation complete until the final PR head is green and the merged `main` commit is known. After merge, verify the resulting `main` commit's required workflows before closing the implementation slice.

---

## Self-Review Checklist

- Spec coverage: all four contracts, exact digest binding, privacy minimization, independent outcomes, insufficient-evidence behavior, compatibility gating, recursive-improvement evidence-only integration, static authority isolation, documentation registration, and full verification are assigned to explicit tasks.
- No placeholders: the plan contains no `TBD`, `TODO`, or unspecified implementation steps.
- Type/interface consistency: downstream tasks consume the exact exported function names introduced by earlier tasks.
- Scope discipline: no model adapter, hidden-state extractor, routing policy, promotion rule, capability grant, or runtime invocation is introduced.
- Authority discipline: any discovery that requires changing `mesh/config/capabilities.json` is an explicit STOP/review condition, not an implementation shortcut.

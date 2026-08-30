# Cognitive Observability and Recovery Evidence v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement inert, deterministic evidence contracts for attributable cognitive availability, cognitive lineage, replacement fidelity, and recovery assessment without adding model invocation, network probing, migration, or authority.

**Architecture:** Add three strict evidence contracts with semantic validator/digest/resolver APIs plus JSON Schema mirrors, then add one pure Cognitive Recovery Assessment builder that consumes those contracts together with existing topology, acquisition, and persistence evidence. Existing `axiom-cognitive-continuity-report.v0` remains unchanged; all new conclusions are evidence-relative, content-addressed where applicable, deterministic, frozen, and explicitly unable to prove principal continuity or perform recovery.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, JSON Schema 2020-12, existing `mesh/src/lib/canonical.mjs`, `cognitive-topology.mjs`, `model-acquisition-manifest.mjs`, and `persistence-attestation.mjs` primitives.

**Spec:** `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md` sections 17-29.

## Global Constraints

- New evidence schema identifiers are exactly `axiom-cognitive-availability-attestation.v0`, `axiom-cognitive-lineage-manifest.v0`, and `axiom-replacement-fidelity-evaluation.v0`.
- Evidence contract version is exactly `0`; evidence status is exactly `inert-evidence`.
- Recovery report schema identifier is exactly `axiom-cognitive-recovery-assessment.v0`; status is exactly `inert-evidence-report`.
- Unknown fields fail closed at every contract object boundary.
- All timestamps are canonical ISO timestamps; all SHA-256-style digests are lowercase 64-hex strings.
- All topology-bound evidence must match exact `topology_id` + canonical `topology_digest` and exact node/model where the contract observes an existing topology node.
- No contract may contain raw credentials, secrets, tokens, cookies, vault keys, provider sessions, or capability grants.
- `contains_secret_material` is exactly `false`; `authority_effect` and `network_effect` are exactly `none`; `runtime_activation` is exactly `false` wherever those fields exist.
- Availability evidence records observations but performs no health check or provider call.
- Cognitive lineage never establishes AXIOM principal lineage.
- Replacement fidelity never emits an identity percentage and never establishes principal continuity or subjective identity.
- Recovery assessment uses explicit caller-supplied `assessed_at`; it never reads the wall clock.
- Evidence dated after `assessed_at` fails closed; stale availability evidence cannot establish current availability.
- Conflicting fresh availability evidence remains `conflicting`; no last-write-wins resolution.
- Existing `axiom-cognitive-continuity-report.v0` behavior and input shape remain unchanged.
- No Gateway, Hypervisor, Sandbox, Grid, capability registry, provider transport, model loading, weight acquisition, training, persistence synchronization, topology mutation, or transition executor changes.
- Node engine support remains `>=22.23.2 <23 || >=24.14.0 <25`.

---

### Task 1: Cognitive Availability Attestation semantic contract

**Files:**
- Create: `mesh/test/cognitive-availability-attestation.test.mjs`
- Create: `mesh/src/lib/cognitive-availability-attestation.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError` from `./canonical.mjs`; `validateCognitiveTopology`, `cognitiveTopologyDigest` from `./cognitive-topology.mjs`.
- Produces:
  - `COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA`
  - `validateCognitiveAvailabilityAttestation(document)`
  - `cognitiveAvailabilityAttestationDigest(document)`
  - `resolveCognitiveAvailabilityAttestation(document, topology)`
- Resolver returns a frozen descriptive summary only; it never contacts an observer/provider.

- [ ] **Step 1: Write the failing behavioral test**

Create `mesh/test/cognitive-availability-attestation.test.mjs` with a valid topology fixture containing at least:

```js
{
  node_id: 'node.owner.local',
  model_id: 'model.owner.local',
  access_mode: 'local-runtime',
  custody: 'owner-local',
  weights: { state: 'open-acquired', artifact_digest: 'a'.repeat(64), licence_ref: 'licence.local.v1' }
}
```

and a provider-controlled node using `access_mode: 'api'`, `weights.state: 'closed'`.

Tests must prove:

1. valid `local-artifact` and `provider-api` attestations validate and digest deterministically;
2. object-key order does not change the digest;
3. wrong topology ID/digest, node ID, or model ID fails closed;
4. `local-artifact + available` on an owner-addressable acquired artifact requires the exact observed artifact digest;
5. closed/provider nodes require `observed_artifact_digest: null`;
6. `provider-api` is incompatible with a node whose declared access mode cannot use an API, and `local-artifact` is incompatible with provider-controlled closed weights;
7. availability is exactly `available | unavailable | indeterminate`;
8. assurance is exactly `declared | signed | verified-local | corroborated`;
9. `declared` requires null verification refs/digests; stronger assurance requires both verification fields;
10. `recorded_at >= observed_at` and `valid_until >= observed_at`;
11. unknown fields, prototype-bearing objects, credential-like injected fields, malformed timestamps, and malformed digests fail closed;
12. validator/resolver do not mutate deeply frozen input;
13. production module imports only canonical/topology primitives;
14. zero-effect boundary values are exact.

Representative valid fixture:

```js
{
  schema: 'axiom-cognitive-availability-attestation.v0',
  version: 0,
  status: 'inert-evidence',
  attestation_id: 'availability.owner.local.v1',
  topology_id: topology.topology_id,
  topology_digest: cognitiveTopologyDigest(topology),
  node_id: 'node.owner.local',
  model_id: 'model.owner.local',
  observation: {
    availability: 'available',
    method: 'local-artifact',
    observed_artifact_digest: 'a'.repeat(64),
    observed_runtime_ref: null,
    assurance_class: 'verified-local'
  },
  observer: {
    observer_kind: 'local-service',
    observer_ref: 'observer.local.weights.v1',
    observer_principal_ref: null
  },
  evidence: {
    evidence_kind: 'artifact-verification',
    evidence_ref: 'evidence.local.weights.v1',
    evidence_digest: 'b'.repeat(64),
    verification_ref: 'verification.local.weights.v1',
    verification_digest: 'c'.repeat(64)
  },
  observed_at: '2026-08-30T10:00:00.000Z',
  valid_until: '2026-08-30T10:05:00.000Z',
  recorded_at: '2026-08-30T10:00:01.000Z',
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd mesh && node --test test/cognitive-availability-attestation.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../src/lib/cognitive-availability-attestation.mjs`.

- [ ] **Step 3: Implement the minimal strict validator/resolver**

Create `mesh/src/lib/cognitive-availability-attestation.mjs` with this public API:

```js
export const COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA = 'axiom-cognitive-availability-attestation.v0';
export function validateCognitiveAvailabilityAttestation(document) {}
export function cognitiveAvailabilityAttestationDigest(document) {}
export function resolveCognitiveAvailabilityAttestation(document, topology) {}
```

Use exact-object helpers, bounded strings, digest/timestamp validation, the enum sets from the spec, topology binding, method/topology compatibility, assurance/evidence cross-field checks, and recursive freezing. The resolver summary must include at least `attestation_id`, `topology_id`, `topology_digest`, `node_id`, `model_id`, `availability`, `method`, `assurance_class`, `observed_artifact_digest`, `observed_at`, `valid_until`, and the zero-effect boundary fields.

- [ ] **Step 4: Run focused test and verify GREEN**

```bash
cd mesh && node --test test/cognitive-availability-attestation.test.mjs
```

Expected: zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add mesh/test/cognitive-availability-attestation.test.mjs mesh/src/lib/cognitive-availability-attestation.mjs
git commit -m "feat: add cognitive availability attestation v0"
```

---

### Task 2: Cognitive Availability JSON Schema parity

**Files:**
- Create: `mesh/test/cognitive-availability-attestation-schema.test.mjs`
- Create: `mesh/config/cognitive-availability-attestation-v0.schema.json`

**Interfaces:**
- Produces JSON Schema 2020-12 mirror with `x-axiom-semantic-validator: "mesh/src/lib/cognitive-availability-attestation.mjs"`.

- [ ] **Step 1: Write the failing schema test**

Assert:

```js
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.properties.schema.const, 'axiom-cognitive-availability-attestation.v0');
assert.equal(schema.properties.version.const, 0);
assert.equal(schema.properties.status.const, 'inert-evidence');
assert.equal(schema.properties.contains_secret_material.const, false);
assert.equal(schema.properties.authority_effect.const, 'none');
assert.equal(schema.properties.network_effect.const, 'none');
assert.equal(schema.properties.runtime_activation.const, false);
assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/cognitive-availability-attestation.mjs');
```

Also assert `additionalProperties:false` for top-level, observation, observer, and evidence objects, exact enums, required fields, and non-claims covering provider reachability, runtime activation, authority, principal continuity, and subjective identity.

- [ ] **Step 2: Verify RED**

```bash
cd mesh && node --test test/cognitive-availability-attestation-schema.test.mjs
```

Expected: missing schema file failure.

- [ ] **Step 3: Add schema mirror**

Create `mesh/config/cognitive-availability-attestation-v0.schema.json`. Put cross-field method/topology and assurance/verification rules in `x-axiom-semantic-rules`; keep JSON Schema structural constraints exact.

- [ ] **Step 4: Verify schema + semantic GREEN**

```bash
cd mesh && node --test test/cognitive-availability-attestation-schema.test.mjs test/cognitive-availability-attestation.test.mjs
```

Expected: zero failures.

- [ ] **Step 5: Commit Task 2**

```bash
git add mesh/test/cognitive-availability-attestation-schema.test.mjs mesh/config/cognitive-availability-attestation-v0.schema.json
git commit -m "feat: add cognitive availability schema"
```

---

### Task 3: Cognitive Lineage Manifest semantic contract and schema

**Files:**
- Create: `mesh/test/cognitive-lineage-manifest.test.mjs`
- Create: `mesh/test/cognitive-lineage-manifest-schema.test.mjs`
- Create: `mesh/src/lib/cognitive-lineage-manifest.mjs`
- Create: `mesh/config/cognitive-lineage-manifest-v0.schema.json`

**Interfaces:**
- Consumes canonical + topology primitives.
- Produces:
  - `COGNITIVE_LINEAGE_MANIFEST_SCHEMA`
  - `validateCognitiveLineageManifest(document)`
  - `cognitiveLineageManifestDigest(document)`
  - `resolveCognitiveLineageManifest(document, topology)`
- Candidate may be outside the current topology; resolver must not represent it as active.

- [ ] **Step 1: Write behavioral RED tests**

Cover all relationship values exactly:

```js
[
  'successor',
  'replacement',
  'fine-tuned-descendant',
  'distilled-descendant',
  'quantized-derivative',
  'adapter-derived',
  'provider-version-successor',
  'functionally-unrelated'
]
```

Tests must prove:

1. exact topology binding for the reference node/model when it is a current topology node;
2. candidate outside current topology is allowed only as a descriptor and never reported as active;
3. descendant relationships require non-null `procedure_ref` + `procedure_digest`;
4. `replacement` and `functionally-unrelated` may use an inert procedure descriptor but cannot imply shared artifact lineage;
5. artifact digest is either null with null artifact ref or both are present and valid;
6. `declared` assurance requires null verification fields; `verified` requires both;
7. wrong reference node/model/topology digest fails closed;
8. malformed relationship/procedure/evidence fields, duplicate/unknown fields, future chronology (`recorded_at < created_at`), and secret/effect violations fail closed;
9. returned summary includes `proves_principal_lineage: false` and `runtime_activation: false`;
10. digest is deterministic and inputs remain unmodified/frozen.

Representative descriptors:

```js
reference: {
  node_id: 'node.provider.primary',
  model_id: 'model.provider.primary',
  artifact_ref: null,
  artifact_digest: null,
  provider_version_ref: 'provider.model.v4'
},
candidate: {
  node_id: null,
  model_id: 'model.provider.successor',
  artifact_ref: null,
  artifact_digest: null,
  provider_version_ref: 'provider.model.v5'
}
```

- [ ] **Step 2: Verify behavioral RED**

```bash
cd mesh && node --test test/cognitive-lineage-manifest.test.mjs
```

Expected: missing production module failure.

- [ ] **Step 3: Implement semantic contract**

Public API:

```js
export const COGNITIVE_LINEAGE_MANIFEST_SCHEMA = 'axiom-cognitive-lineage-manifest.v0';
export function validateCognitiveLineageManifest(document) {}
export function cognitiveLineageManifestDigest(document) {}
export function resolveCognitiveLineageManifest(document, topology) {}
```

Resolver output must preserve relationship/evidence posture and include:

```js
{
  active_candidate: false,
  proves_principal_lineage: false,
  grants_execution_authority: false,
  runtime_activation: false
}
```

- [ ] **Step 4: Verify behavioral GREEN**

```bash
cd mesh && node --test test/cognitive-lineage-manifest.test.mjs
```

Expected: zero failures.

- [ ] **Step 5: Write schema RED test and schema mirror**

Schema test must assert exact constants/enums, object closures, digest shapes, nullability, `x-axiom-semantic-validator`, and non-claims. Then create `mesh/config/cognitive-lineage-manifest-v0.schema.json`.

- [ ] **Step 6: Verify semantic + schema GREEN**

```bash
cd mesh && node --test test/cognitive-lineage-manifest.test.mjs test/cognitive-lineage-manifest-schema.test.mjs
```

Expected: zero failures.

- [ ] **Step 7: Commit Task 3**

```bash
git add mesh/test/cognitive-lineage-manifest.test.mjs mesh/test/cognitive-lineage-manifest-schema.test.mjs mesh/src/lib/cognitive-lineage-manifest.mjs mesh/config/cognitive-lineage-manifest-v0.schema.json
git commit -m "feat: add cognitive lineage manifest v0"
```

---

### Task 4: Replacement Fidelity Evaluation semantic contract and schema

**Files:**
- Create: `mesh/test/replacement-fidelity-evaluation.test.mjs`
- Create: `mesh/test/replacement-fidelity-evaluation-schema.test.mjs`
- Create: `mesh/src/lib/replacement-fidelity-evaluation.mjs`
- Create: `mesh/config/replacement-fidelity-evaluation-v0.schema.json`

**Interfaces:**
- Consumes canonical/topology primitives and optionally resolves one supplied Cognitive Lineage Manifest by `lineage_id` when a caller provides it to the resolver.
- Produces:
  - `REPLACEMENT_FIDELITY_EVALUATION_SCHEMA`
  - `validateReplacementFidelityEvaluation(document)`
  - `replacementFidelityEvaluationDigest(document)`
  - `resolveReplacementFidelityEvaluation(document, topology, lineageManifest = null)`

- [ ] **Step 1: Write behavioral RED tests**

Supported dimensions are exactly:

```js
[
  'capability-fidelity',
  'preference-fidelity',
  'behavioral-fidelity',
  'epistemic-fidelity',
  'safety-policy-fidelity',
  'style-personality-fidelity',
  'memory-use-fidelity',
  'relationship-fidelity',
  'robustness-fidelity'
]
```

Tests must prove:

1. valid multidimensional evaluation validates/digests deterministically;
2. duplicate dimension names fail closed;
3. `required_dimensions` is duplicate-free and references only dimensions present in the evaluation;
4. result status is exactly `pass | degraded | fail | indeterminate`;
5. aggregate classification is exactly `high-fidelity | acceptable-with-degradation | materially-degraded | insufficient-evidence | incompatible`;
6. `high-fidelity` is rejected when any required dimension is degraded/fail/indeterminate;
7. missing or indeterminate required dimensions require `insufficient-evidence`;
8. required fail cannot map to `high-fidelity` or `acceptable-with-degradation`;
9. suite/metric/threshold/evidence digests are valid and exact fields are present;
10. `confidence` is a bounded numeric evaluation confidence and is never exposed as identity probability;
11. lineage ID mismatch against a supplied manifest fails closed;
12. evaluator provenance is retained but `grants_execution_authority` remains false;
13. output explicitly has `proves_principal_continuity:false`, `proves_subjective_identity:false`, and no `identity_percentage` property;
14. unknown fields, malformed chronology, secret/effect boundary violations, and input mutation fail closed.

Use a deterministic aggregation rule for v0 validator parity:

```text
all required pass -> high-fidelity
required degraded and no fail/indeterminate -> acceptable-with-degradation
required fail -> materially-degraded or incompatible only
required indeterminate/missing -> insufficient-evidence
```

If the document declares `incompatible`, at least one required dimension must be `fail`.

- [ ] **Step 2: Verify behavioral RED**

```bash
cd mesh && node --test test/replacement-fidelity-evaluation.test.mjs
```

Expected: missing module failure.

- [ ] **Step 3: Implement semantic contract**

Public API:

```js
export const REPLACEMENT_FIDELITY_EVALUATION_SCHEMA = 'axiom-replacement-fidelity-evaluation.v0';
export function validateReplacementFidelityEvaluation(document) {}
export function replacementFidelityEvaluationDigest(document) {}
export function resolveReplacementFidelityEvaluation(document, topology, lineageManifest = null) {}
```

Validation must sort/canonicalize only for derived summaries/digests, never mutate caller arrays. Returned summary keeps individual dimension statuses and aggregate classification visible.

- [ ] **Step 4: Verify behavioral GREEN**

```bash
cd mesh && node --test test/replacement-fidelity-evaluation.test.mjs
```

Expected: zero failures.

- [ ] **Step 5: Write schema RED and schema mirror**

Assert constants, exact enums, bounded `dimensions`, unique structural objects, digest patterns, `additionalProperties:false`, boundary constants, semantic-validator pointer, and non-claims. Create `mesh/config/replacement-fidelity-evaluation-v0.schema.json`.

- [ ] **Step 6: Verify semantic + schema GREEN**

```bash
cd mesh && node --test test/replacement-fidelity-evaluation.test.mjs test/replacement-fidelity-evaluation-schema.test.mjs
```

Expected: zero failures.

- [ ] **Step 7: Commit Task 4**

```bash
git add mesh/test/replacement-fidelity-evaluation.test.mjs mesh/test/replacement-fidelity-evaluation-schema.test.mjs mesh/src/lib/replacement-fidelity-evaluation.mjs mesh/config/replacement-fidelity-evaluation-v0.schema.json
git commit -m "feat: add replacement fidelity evaluation v0"
```

---

### Task 5: Cognitive Recovery Assessment v0 pure builder

**Files:**
- Create: `mesh/test/cognitive-recovery-assessment.test.mjs`
- Create: `mesh/src/lib/cognitive-recovery-assessment.mjs`

**Interfaces:**
- Consumes:
  - `validateCognitiveTopology`, `cognitiveTopologyDigest`
  - `resolveCognitiveAvailabilityAttestation`
  - `resolveModelAcquisitionManifest`
  - `resolvePersistenceAttestation`
  - `resolveCognitiveLineageManifest`
  - `resolveReplacementFidelityEvaluation`
- Produces:
  - `COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA = 'axiom-cognitive-recovery-assessment.v0'`
  - `buildCognitiveRecoveryAssessment(topology, inputs)`
- Builder reads no wall clock, filesystem, environment, network, credential store, runtime, or model endpoint.

- [ ] **Step 1: Write behavioral RED tests**

Input object exact fields:

```js
{
  assessed_at,
  availability_attestations,
  acquisition_manifests,
  persistence_attestations,
  lineage_manifests,
  fidelity_evaluations
}
```

Use fixtures for:

- owner-local identity kernel: critical continuity, important fidelity;
- provider-controlled primary embodiment: important continuity, critical fidelity;
- optional augmentation.

Tests must prove:

1. all fresh dependencies available produces `cognitive_availability_status:'available'` and no recovery blocker;
2. explicit `assessed_at` is copied to output and changing wall-clock conditions cannot affect the report;
3. attestation where `observed_at`, `recorded_at`, `created_at`, or `evaluated_at` is after `assessed_at` fails closed;
4. `assessed_at > valid_until` yields evidence posture `stale` and does not establish availability;
5. multiple fresh agreeing observations are preserved and may yield `supported`/`verified` posture;
6. contradictory fresh `available` vs `unavailable` observations yield `conflicting` and degrade/block critical conclusions without last-write-wins;
7. critical unavailable dependency with no candidate produces `no-supported-recovery-path`;
8. candidate available + valid lineage + high-fidelity evaluation produces `ready-with-candidate-evidence` but never performs or authorizes substitution;
9. degraded required fidelity produces `recoverable-with-degradation`;
10. candidate without required fidelity evidence produces `insufficient-evidence`;
11. provider-dependent and verified-owner-artifact sovereignty remain distinct by reusing acquisition/topology facts;
12. persistence availability is evaluated independently from model/runtime availability;
13. duplicate evidence IDs or duplicate exact evidence objects for a uniqueness domain fail closed;
14. output is deterministic regardless of input array order;
15. output is recursively frozen and deeply frozen inputs are unchanged;
16. `authority_boundary` equals exactly:

```js
{
  writes_files: false,
  performs_network_effects: false,
  loads_models: false,
  switches_models: false,
  synchronizes_persistence: false,
  acquires_weights: false,
  trains_models: false,
  grants_execution_authority: false,
  mutates_topology: false,
  proves_principal_continuity: false,
  proves_subjective_identity: false
}
```

17. report has no credential/session/provider-call/executor fields.

- [ ] **Step 2: Verify RED**

```bash
cd mesh && node --test test/cognitive-recovery-assessment.test.mjs
```

Expected: missing module failure.

- [ ] **Step 3: Implement the pure builder**

Create `mesh/src/lib/cognitive-recovery-assessment.mjs`.

Required top-level output:

```js
{
  schema: 'axiom-cognitive-recovery-assessment.v0',
  version: 0,
  status: 'inert-evidence-report',
  assessed_at: '<canonical ISO timestamp>',
  topology: {
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology)
  },
  cognitive_availability_status: 'available | degraded | blocked | indeterminate',
  cognitive_continuity_status: 'full | degraded | blocked',
  cognitive_fidelity_status: 'full | degraded | blocked | insufficient-evidence',
  cognitive_sovereignty_status: 'owner-controlled | provider-dependent | mixed | unverified',
  recovery_readiness_status: 'ready-no-substitution | ready-with-candidate-evidence | recoverable-with-degradation | insufficient-evidence | no-supported-recovery-path',
  blockers: [],
  warnings: [],
  conflicts: [],
  nodes: [],
  candidates: [],
  authority_boundary: { /* exact object above */ },
  report_digest: '<64 hex>'
}
```

Derive freshness only from `assessed_at` and attestation `valid_until`. Preserve all material evidence refs/digests in node/candidate summaries. Sort blockers/warnings/conflicts/nodes/candidates deterministically before digesting.

- [ ] **Step 4: Verify focused GREEN**

```bash
cd mesh && node --test test/cognitive-recovery-assessment.test.mjs
```

Expected: zero failures.

- [ ] **Step 5: Run all new cognitive evidence tests together**

```bash
cd mesh && node --test \
  test/cognitive-availability-attestation.test.mjs \
  test/cognitive-availability-attestation-schema.test.mjs \
  test/cognitive-lineage-manifest.test.mjs \
  test/cognitive-lineage-manifest-schema.test.mjs \
  test/replacement-fidelity-evaluation.test.mjs \
  test/replacement-fidelity-evaluation-schema.test.mjs \
  test/cognitive-recovery-assessment.test.mjs \
  test/cognitive-continuity-report.test.mjs
```

Expected: zero failures and unchanged v0 continuity-report tests.

- [ ] **Step 6: Commit Task 5**

```bash
git add mesh/test/cognitive-recovery-assessment.test.mjs mesh/src/lib/cognitive-recovery-assessment.mjs
git commit -m "feat: add cognitive recovery assessment v0"
```

---

### Task 6: Canonical documentation registration and full verification

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Existing modified spec: `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- New plan: `docs/superpowers/plans/2026-08-30-cognitive-observability-recovery-evidence-v0.md`

**Interfaces:**
- Registers this plan in the repository's supported/canonical documentation boundary.
- Makes no capability/status/production claim changes.

- [ ] **Step 1: Register exactly the new plan path**

Add this path to `CANONICAL_DOCUMENTS` beside the other Superpowers plans:

```text
docs/superpowers/plans/2026-08-30-cognitive-observability-recovery-evidence-v0.md
```

The design spec is already canonical; do not duplicate it.

- [ ] **Step 2: Run documentation guard**

```bash
cd mesh && npm run docs:check
```

Expected: valid canonical documentation boundary with no unexpected/missing Markdown files.

- [ ] **Step 3: Run focused cognitive suite**

```bash
cd mesh && node --test test/cognitive-*.test.mjs test/replacement-fidelity-evaluation*.test.mjs
```

Expected: zero failures.

- [ ] **Step 4: Run the repository protected-CI equivalent verification**

```bash
cd mesh && npm run check
```

Expected: setup check, network policy, Gateway contract, Axiom One, registry, status, docs, and complete `node:test` suite all pass.

- [ ] **Step 5: Review final diff against the base `main` commit**

Intended implementation paths only:

```text
docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md
docs/superpowers/plans/2026-08-30-cognitive-observability-recovery-evidence-v0.md
mesh/src/check-docs.mjs
mesh/src/lib/cognitive-availability-attestation.mjs
mesh/src/lib/cognitive-lineage-manifest.mjs
mesh/src/lib/replacement-fidelity-evaluation.mjs
mesh/src/lib/cognitive-recovery-assessment.mjs
mesh/config/cognitive-availability-attestation-v0.schema.json
mesh/config/cognitive-lineage-manifest-v0.schema.json
mesh/config/replacement-fidelity-evaluation-v0.schema.json
mesh/test/cognitive-availability-attestation.test.mjs
mesh/test/cognitive-availability-attestation-schema.test.mjs
mesh/test/cognitive-lineage-manifest.test.mjs
mesh/test/cognitive-lineage-manifest-schema.test.mjs
mesh/test/replacement-fidelity-evaluation.test.mjs
mesh/test/replacement-fidelity-evaluation-schema.test.mjs
mesh/test/cognitive-recovery-assessment.test.mjs
```

Confirm no changes to:

```text
mesh/config/capabilities.json
Gateway / Hypervisor / Sandbox / Grid effect path
principal / credential stores
service-network policy
provider transport/runtime invocation
production-promotion state
```

- [ ] **Step 6: Commit Task 6**

```bash
git add mesh/src/check-docs.mjs docs/superpowers/plans/2026-08-30-cognitive-observability-recovery-evidence-v0.md docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md
git commit -m "chore: register cognitive recovery evidence docs"
```

- [ ] **Step 7: Open a non-draft PR and require normal protected checks before merge**

PR title:

```text
Add cognitive observability and recovery evidence v0
```

PR body must state:

```text
- evidence-only, zero-authority contracts
- Cognitive Continuity Report v0 unchanged
- no model/provider invocation or network effects
- no transition/migration executor
- explicit principal/subjective-identity non-claims
- RED->GREEN focused tests plus full npm run check
```

Do not merge until required branch protection checks succeed and review threads are resolved.

## Self-review result

- Spec coverage: sections 17-29 are mapped to Tasks 1-6; all four approved contracts have explicit behavioral coverage.
- Compatibility: Cognitive Continuity Report v0 remains untouched and is rerun in Task 5.
- Freshness determinism: `assessed_at`, `valid_until`, future-dated rejection, and no wall-clock reads are explicitly tested.
- Authority separation: every evidence contract and recovery report has mechanically tested zero-effect/non-identity boundaries; no transition executor is in scope.
- Conflict handling: contradictory fresh observations are preserved as conflict rather than resolved by ordering.
- Type consistency: schema names, enum values, field names, and public function signatures match the approved design.
- Placeholder scan: no TBD/TODO or unspecified implementation step remains in this plan.

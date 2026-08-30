# Cognitive Sovereignty Evidence v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inert, content-addressed evidence for owner-controlled model acquisition and persistence state, then derive a topology-aware cognitive continuity/fidelity report without activating models, synchronizing provider state, or changing AXIOM authority.

**Architecture:** Extend the approved Cognitive Topology design with two evidence contracts and one pure report builder. `Model Acquisition Manifest v0` proves only that an exact model artifact was recorded as acquired into owner/shared custody; `Persistence Attestation v0` records a point-in-time observation about a topology node's persistence representation; `Cognitive Continuity Report v0` binds to one exact topology and derives independent cognitive-continuity, fidelity, and sovereignty posture from model observations plus those evidence artifacts. Existing Agent Composition v0, Self Bundle v0, Continuity Report v0, provider profiles, capability registry, and runtime authority paths remain unchanged.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, JSON Schema 2020-12, existing `mesh/src/lib/canonical.mjs`, `mesh/src/lib/cognitive-topology.mjs`, and existing exact-object/fail-closed patterns.

**Spec:** `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md` sections 4, 7, 8, 11, 13, and 15.

## Global Constraints

- All new contracts are descriptive/evidentiary and zero-authority.
- No contract may contain raw credentials, tokens, cookies, provider session material, model bytes, vault keys, endpoints, or executable runtime configuration.
- Unknown fields fail closed.
- All exact bindings use canonical 64-character lowercase SHA-256 digests.
- Validation/building is pure, deterministic, local, non-mutating, and performs no filesystem/network/process/provider/model effect.
- No Gateway, Hypervisor, Sandbox, Grid, principal, credential, policy, capability-registry, network-policy, provider-transport, model-loading, persistence-sync, training/adaptation, or production-promotion behavior changes.
- `contains_secret_material` is exactly `false` on declarative evidence contracts.
- `authority_effect` and `network_effect` are exactly `none`; `runtime_activation` is exactly `false`.
- A model/persistence evidence artifact can support an inspection claim but cannot prove subjective identity or grant execution authority.
- Cognitive continuity/fidelity status is not principal continuity. The report must explicitly preserve that separation.

---

## File Structure

### Model acquisition evidence
- Create `mesh/src/lib/model-acquisition-manifest.mjs` — strict validator, digest, topology resolver.
- Create `mesh/config/model-acquisition-manifest-v0.schema.json` — JSON Schema mirror.
- Create `mesh/test/model-acquisition-manifest.test.mjs` — semantic/binding tests.
- Create `mesh/test/model-acquisition-manifest-schema.test.mjs` — schema-boundary tests.

### Persistence evidence
- Create `mesh/src/lib/persistence-attestation.mjs` — strict validator, digest, topology resolver.
- Create `mesh/config/persistence-attestation-v0.schema.json` — JSON Schema mirror.
- Create `mesh/test/persistence-attestation.test.mjs` — semantic/binding tests.
- Create `mesh/test/persistence-attestation-schema.test.mjs` — schema-boundary tests.

### Cognitive dependency reporting
- Create `mesh/src/lib/cognitive-continuity-report.mjs` — pure deterministic report builder.
- Create `mesh/test/cognitive-continuity-report.test.mjs` — report semantics and authority-boundary tests.

### Canonical documentation
- Modify `mesh/src/check-docs.mjs` — register this plan only; the governing design is already canonical.

---

### Task 1: Model Acquisition Manifest v0

**Files:**
- Create: `mesh/test/model-acquisition-manifest.test.mjs`
- Create: `mesh/src/lib/model-acquisition-manifest.mjs`
- Create: `mesh/test/model-acquisition-manifest-schema.test.mjs`
- Create: `mesh/config/model-acquisition-manifest-v0.schema.json`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError`; `validateCognitiveTopology`, `cognitiveTopologyDigest`.
- Produces:
  - `MODEL_ACQUISITION_MANIFEST_SCHEMA = 'axiom-model-acquisition-manifest.v0'`
  - `validateModelAcquisitionManifest(document)`
  - `modelAcquisitionManifestDigest(document)`
  - `resolveModelAcquisitionManifest(document, topology)`

The exact top-level fields are:

```text
schema
version
status
acquisition_id
topology_id
topology_digest
node_id
model_id
artifact
source
custody
acquired_at
recorded_at
contains_secret_material
authority_effect
network_effect
runtime_activation
```

`artifact` exact fields:

```text
artifact_ref
artifact_digest
licence_ref
format_ref
```

`source` exact fields:

```text
source_kind
source_ref
source_evidence_ref
source_evidence_digest
```

`source_kind` values:

```text
upstream-release | owner-build | authorized-transfer | recovery-copy
```

`custody` exact fields:

```text
mode
location_ref
verification_ref
verification_digest
```

`custody.mode` values:

```text
owner-local | owner-remote | shared
```

All `*_ref` fields above are opaque identifiers; all `*_digest` fields are exact digests. No URLs or credentials are representable.

- [ ] **Step 1: Write failing semantic tests**

Create fixtures for a valid Agent Composition + Cognitive Topology where one node has:

```js
weights: {
  state: 'open-acquired',
  artifact_digest: 'a'.repeat(64),
  licence_ref: 'licence.model.example'
},
custody: 'owner-local'
```

Create a matching acquisition manifest and assert:

1. validation returns a frozen zero-authority summary;
2. digest is deterministic across object-key order;
3. unknown or credential-like fields fail closed;
4. malformed identifiers/digests/timestamps fail closed;
5. `recorded_at` cannot precede `acquired_at`;
6. resolver rejects topology ID/digest mismatch;
7. resolver rejects missing `node_id`/`model_id` or node/model mismatch;
8. resolver requires topology weight state `open-acquired` or `local-proprietary`;
9. resolver requires exact artifact digest match with topology `weights.artifact_digest`;
10. resolver requires exact licence ref match when topology `weights.licence_ref` is non-null;
11. resolver rejects a topology node with `custody: provider-controlled`;
12. resolver requires manifest `custody.mode` to match topology owner custody, while topology `shared` accepts only manifest `shared`;
13. validation/resolution does not mutate deeply frozen inputs;
14. production module imports only `./canonical.mjs` and `./cognitive-topology.mjs`.

Representative resolver result:

```js
{
  valid: true,
  schema: 'axiom-model-acquisition-manifest.v0',
  acquisition_id: 'acquisition.model.example.v1',
  topology_id: 'topology.personal.primary',
  topology_digest: '<64 hex>',
  node_id: 'node.local.primary',
  model_id: 'model.local.primary',
  artifact_digest: '<64 hex>',
  custody_mode: 'owner-local',
  acquisition_digest: '<64 hex>',
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

- [ ] **Step 2: Run focused semantic test and verify RED**

Run:

```bash
cd mesh && node --test test/model-acquisition-manifest.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `../src/lib/model-acquisition-manifest.mjs`.

- [ ] **Step 3: Implement the minimal semantic validator/resolver**

Use exact-object validation, canonical timestamps, identifier/digest helpers, and `deepFreeze`/frozen summaries consistent with Cognitive Topology. Resolver must validate the manifest and topology, compare `topology_id`, compare `cognitiveTopologyDigest(topology)`, find the exact node, and enforce the binding rules above.

No artifact existence, filesystem presence, signature validity, provider availability, licence legal interpretation, or behavioral equivalence is claimed.

- [ ] **Step 4: Run semantic test and verify GREEN**

Run the focused test and require zero failures.

- [ ] **Step 5: Write failing schema-boundary test**

Assert the schema has:

```js
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.properties.schema.const, 'axiom-model-acquisition-manifest.v0');
assert.equal(schema.properties.version.const, 0);
assert.equal(schema.properties.status.const, 'inert-evidence');
assert.equal(schema.properties.contains_secret_material.const, false);
assert.equal(schema.properties.authority_effect.const, 'none');
assert.equal(schema.properties.network_effect.const, 'none');
assert.equal(schema.properties.runtime_activation.const, false);
assert.equal(schema.additionalProperties, false);
assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/model-acquisition-manifest.mjs');
```

Also assert closed objects and the exact source/custody enums.

- [ ] **Step 6: Run schema test and verify RED**

Expected: schema file missing.

- [ ] **Step 7: Add JSON Schema mirror**

Mirror the exact shape and enum domains. Put cross-document topology rules under `x-axiom-semantic-rules`. Add explicit non-claims covering artifact availability, source authenticity, licence legal validity, behavioral equivalence, authority, network/runtime activation, and subjective identity.

- [ ] **Step 8: Run Task 1 tests and commit**

```bash
cd mesh && node --test test/model-acquisition-manifest.test.mjs test/model-acquisition-manifest-schema.test.mjs
```

Expected: PASS.

Commit message:

```text
feat: add model acquisition manifest v0
```

---

### Task 2: Persistence Attestation v0

**Files:**
- Create: `mesh/test/persistence-attestation.test.mjs`
- Create: `mesh/src/lib/persistence-attestation.mjs`
- Create: `mesh/test/persistence-attestation-schema.test.mjs`
- Create: `mesh/config/persistence-attestation-v0.schema.json`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError`; `validateCognitiveTopology`, `cognitiveTopologyDigest`.
- Produces:
  - `PERSISTENCE_ATTESTATION_SCHEMA = 'axiom-persistence-attestation.v0'`
  - `validatePersistenceAttestation(document)`
  - `persistenceAttestationDigest(document)`
  - `resolvePersistenceAttestation(document, topology)`

Exact top-level fields:

```text
schema
version
status
attestation_id
topology_id
topology_digest
node_id
model_id
declared_persistence
observation
evidence
observed_at
recorded_at
contains_secret_material
authority_effect
network_effect
runtime_activation
```

`declared_persistence` exact fields mirror Cognitive Topology:

```text
mode
provider_id
state_ref
exportability
```

`observation` exact fields:

```text
availability
observed_exportability
snapshot_ref
snapshot_digest
```

`availability` values:

```text
available | unavailable | unknown
```

`observed_exportability` values:

```text
none | partial | full | unknown
```

When `availability = available`, `snapshot_ref` and `snapshot_digest` may both be non-null or both null. When unavailable/unknown, both must be null.

`evidence` exact fields:

```text
evidence_kind
evidence_ref
evidence_digest
```

`evidence_kind` values:

```text
local-observation | provider-statement | signed-provider-statement | export-test
```

The contract records evidence type but does not verify an external signature in v0.

- [ ] **Step 1: Write failing semantic tests**

Use a topology with local, provider-bound, and mirrored persistence nodes. Assert:

1. valid attestations validate/digest deterministically;
2. unknown/secret-bearing fields and malformed values fail closed;
3. `recorded_at` cannot precede `observed_at`;
4. available snapshot ref/digest pair must be both-null or both-present;
5. unavailable/unknown observations require both snapshot fields null;
6. resolver rejects topology ID/digest mismatch;
7. resolver rejects node/model mismatch;
8. `declared_persistence` must exactly equal the bound topology node's persistence declaration;
9. provider-bound/mirrored declarations retain their provider/state references without claiming they are reachable;
10. resolver returns a frozen evidence summary;
11. validation/resolution does not mutate inputs;
12. module imports only canonical + cognitive topology.

Representative result:

```js
{
  valid: true,
  schema: 'axiom-persistence-attestation.v0',
  attestation_id: 'persistence.provider.example.v1',
  topology_id: 'topology.personal.primary',
  topology_digest: '<64 hex>',
  node_id: 'node.provider.primary',
  model_id: 'model.provider.primary',
  persistence_mode: 'provider-bound',
  provider_id: 'provider.memory.example',
  state_ref: 'state.provider.example',
  declared_exportability: 'partial',
  availability: 'available',
  observed_exportability: 'partial',
  evidence_kind: 'provider-statement',
  attestation_digest: '<64 hex>',
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

- [ ] **Step 2: Verify semantic RED**

Run the focused test; expect `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement minimal validator/resolver**

Use pure exact validation and exact topology binding. Do not contact a provider, perform an export, check a snapshot on disk, or interpret `signed-provider-statement` as cryptographically verified.

- [ ] **Step 4: Verify semantic GREEN**

Run the focused test; require zero failures.

- [ ] **Step 5: Write and run failing schema test**

Assert exact schema/version/status (`inert-evidence`), enums, closed objects, hard boundary constants, semantic validator path, and explicit non-claims.

- [ ] **Step 6: Add JSON Schema mirror and verify Task 2 GREEN**

Run:

```bash
cd mesh && node --test test/persistence-attestation.test.mjs test/persistence-attestation-schema.test.mjs
```

Expected: PASS.

Commit message:

```text
feat: add persistence attestation v0
```

---

### Task 3: Cognitive Continuity Report v0

**Files:**
- Create: `mesh/test/cognitive-continuity-report.test.mjs`
- Create: `mesh/src/lib/cognitive-continuity-report.mjs`

**Interfaces:**
- Consumes:
  - `validateCognitiveTopology`, `cognitiveTopologyDigest`
  - `resolveModelAcquisitionManifest`
  - `resolvePersistenceAttestation`
  - model observations supplied as inert data
- Produces:
  - `COGNITIVE_CONTINUITY_REPORT_SCHEMA = 'axiom-cognitive-continuity-report.v0'`
  - `buildCognitiveContinuityReport(topology, inputs)`

`inputs` exact fields:

```text
model_observations
acquisition_manifests
persistence_attestations
```

Each `model_observation` exact fields:

```text
node_id
model_id
availability
observed_artifact_digest
```

`availability` values:

```text
available | unavailable | unknown
```

`observed_artifact_digest` is nullable. It is allowed only for `available` and is required when the topology node declares `weights.state = open-acquired | local-proprietary`.

Only one model observation, acquisition manifest, and persistence attestation may resolve to a given topology node in v0. Duplicate node coverage fails closed rather than picking a winner.

- [ ] **Step 1: Write failing report tests**

Create a topology fixture containing:

- a persistent owner-local `identity-kernel`, critical continuity + important fidelity, open-acquired;
- a primary provider-controlled `primary-embodiment`, important continuity + critical fidelity, provider-bound persistence;
- an ephemeral optional augmentation.

Required tests:

1. all required evidence present produces `cognitive_continuity_status: 'full'` and `cognitive_fidelity_status: 'full'`;
2. unavailable critical-continuity node produces cognitive continuity `blocked` without claiming principal discontinuity;
3. unavailable important-continuity node degrades continuity but does not block it;
4. unavailable critical-fidelity node produces fidelity `blocked` while cognitive continuity may remain degraded/full independently;
5. unavailable important-fidelity node produces fidelity `degraded`;
6. optional node loss is listed but does not degrade either status;
7. unknown observation for important/critical dependency degrades rather than silently passes;
8. owner-controlled `open-acquired`/`local-proprietary` node requires matching acquisition manifest and matching observed artifact digest for `sovereignty_state: verified-owner-artifact`; otherwise it is `declared-owner-artifact-unverified` or `artifact-digest-mismatch`;
9. provider-bound persistence attestation available with non-full exportability is reported as `provider-dependent`;
10. provider-bound persistence unavailable is surfaced as a fidelity/continuity dependency according to the node importance, not hidden;
11. mirrored persistence with available evidence is `mirrored` and still reports observed exportability;
12. duplicate or unknown node observations/evidence fail closed;
13. acquisition/persistence evidence bound to another topology fails closed;
14. report digest is deterministic across input ordering after canonical sorting;
15. builder does not mutate deeply frozen inputs;
16. production module has no filesystem/network/runtime/Gateway imports;
17. authority boundary includes `grants_execution_authority:false`, `proves_principal_continuity:false`, `proves_subjective_identity:false`, `loads_models:false`, `synchronizes_persistence:false`, and `acquires_weights:false`.

Status rules:

```text
importance = critical + unavailable     -> blocked
importance = critical + unknown         -> degraded
importance = important + unavailable    -> degraded
importance = important + unknown        -> degraded
importance = optional + any non-available -> no aggregate degradation
```

Apply those rules independently to `continuity_importance` and `fidelity_importance`.

Per-node sovereignty states:

```text
verified-owner-artifact
declared-owner-artifact-unverified
artifact-digest-mismatch
provider-dependent
mirrored
owner-persistence
no-persistence
unknown
```

The report is cognitive-layer evidence only. It must include:

```js
authority_boundary: {
  writes_files: false,
  performs_network_effects: false,
  loads_models: false,
  synchronizes_persistence: false,
  acquires_weights: false,
  grants_execution_authority: false,
  proves_principal_continuity: false,
  proves_subjective_identity: false
}
```

Representative top-level output:

```js
{
  schema: 'axiom-cognitive-continuity-report.v0',
  topology: {
    topology_id: 'topology.personal.primary',
    topology_digest: '<64 hex>'
  },
  cognitive_continuity_status: 'full',
  cognitive_fidelity_status: 'full',
  sovereignty_status: 'mixed',
  blockers: [],
  warnings: [],
  nodes: [/* canonical node_id order */],
  authority_boundary: {/* exact false values */},
  report_digest: '<64 hex>'
}
```

`sovereignty_status` values:

```text
owner-controlled | mixed | provider-dependent | unverified
```

Aggregation:

- `unverified` if any owner-declared durable artifact has digest mismatch or lacks required acquisition evidence;
- else `mixed` when at least one verified owner-controlled durable dependency and at least one provider-dependent durable dependency exist;
- else `owner-controlled` when durable dependencies are owner-controlled/owner-persistence only;
- else `provider-dependent` when durable dependencies are provider-dependent only;
- when there are no durable dependencies, use `owner-controlled` because no provider dependency exists.

- [ ] **Step 2: Verify report RED**

Run:

```bash
cd mesh && node --test test/cognitive-continuity-report.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement minimal report builder**

Normalize inputs with exact-object validation and duplicate rejection. Validate topology. Sort observations/evidence by node ID before resolution. Use the Task 1/2 resolvers for evidence rather than duplicating their binding rules. Build node summaries, independent continuity/fidelity aggregate states, sovereignty state, sorted unique blockers/warnings, authority boundary, then canonical `report_digest` over the unsigned report.

Do not import or call Self Bundle Continuity Report. The cognitive report must remain an adjunct, not an override of principal/lineage continuity.

- [ ] **Step 4: Verify report GREEN**

Run the focused report test and require zero failures.

- [ ] **Step 5: Run all cognitive evidence tests**

```bash
cd mesh && node --test \
  test/model-acquisition-manifest.test.mjs \
  test/model-acquisition-manifest-schema.test.mjs \
  test/persistence-attestation.test.mjs \
  test/persistence-attestation-schema.test.mjs \
  test/cognitive-continuity-report.test.mjs \
  test/cognitive-topology.test.mjs \
  test/cognitive-topology-schema.test.mjs
```

Expected: PASS.

Commit message:

```text
feat: add cognitive continuity report v0
```

---

### Task 4: Canonical documentation registration and protected verification

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Existing new doc: `docs/superpowers/plans/2026-08-29-cognitive-sovereignty-evidence-v0.md`

- [ ] **Step 1: Run the full repository verification before registration**

Expected: if the canonical-document guard discovers the new plan, it fails only because the plan is not registered; focused feature tests remain green.

- [ ] **Step 2: Add only this plan path to `CANONICAL_DOCUMENTS`**

Add:

```text
docs/superpowers/plans/2026-08-29-cognitive-sovereignty-evidence-v0.md
```

Do not change required product claims, capability status, or authority boundaries.

- [ ] **Step 3: Run focused tests and protected full verification**

Require all focused cognitive evidence tests to pass, then run the repository's full protected verification workflow through the PR.

- [ ] **Step 4: Review the final diff**

Expected intended paths only:

```text
docs/superpowers/plans/2026-08-29-cognitive-sovereignty-evidence-v0.md
mesh/src/lib/model-acquisition-manifest.mjs
mesh/config/model-acquisition-manifest-v0.schema.json
mesh/test/model-acquisition-manifest.test.mjs
mesh/test/model-acquisition-manifest-schema.test.mjs
mesh/src/lib/persistence-attestation.mjs
mesh/config/persistence-attestation-v0.schema.json
mesh/test/persistence-attestation.test.mjs
mesh/test/persistence-attestation-schema.test.mjs
mesh/src/lib/cognitive-continuity-report.mjs
mesh/test/cognitive-continuity-report.test.mjs
mesh/src/check-docs.mjs
```

Confirm no diff in:

```text
mesh/config/capabilities.json
Gateway / Hypervisor / Sandbox / Grid effect paths
principal / credential stores
service-network policy
provider transport or runtime activation
production-promotion state
```

- [ ] **Step 5: Open PR, require branch-protection checks, and merge only after required checks pass**

PR non-claims must explicitly state:

- no weight download/acquisition effect;
- no provider persistence synchronization;
- no provider reachability or signature-verification claim;
- no model invocation/loading;
- no adaptation/training;
- no authority/capability promotion;
- no principal or subjective identity proof.

## Self-review result

- **Spec coverage:** implements the already-approved future slices for topology-aware continuity/fidelity reporting, provider-persistence attestations, and owner-controlled model acquisition manifests; does not enter adaptation/routing/provider-retirement work.
- **Scope:** the three artifacts form one dependency chain and remain independently testable.
- **Type consistency:** topology bindings use `topology_id` + `cognitiveTopologyDigest`; node bindings use exact `node_id` + `model_id`; acquisition and persistence evidence are consumed only through their public resolvers.
- **Placeholder scan:** no TBD/TODO or unspecified implementation placeholders remain.
- **Authority review:** no new contract can activate a model, acquire an artifact, synchronize persistence, grant credentials, or alter execution authority.
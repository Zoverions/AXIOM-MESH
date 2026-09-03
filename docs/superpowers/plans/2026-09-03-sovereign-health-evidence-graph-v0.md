# Sovereign Health Evidence Graph v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first inert, synthetic-only AXIOM Health domain foundation on current `main`, preserving the still-valid Health Mesh safety semantics from PR #1064 while adding a patient-sovereign evidence graph, model-inference receipts, bounded research participation, neural-data non-authority rules, and pure Health action-boundary checks.

**Architecture:** Health remains a domain layer above the existing AXIOM authority, consent, evidence, Sovereign Vault, Context Capsule, machine-principal, provider, governance, and portability primitives. The implementation adds only strict caller-authored contracts, pure semantic validators, deterministic digests, graph consistency checks, synthetic fixtures, and documentation/conformance gates; it does not add a Gateway route, a clinical provider, medical-device control, network egress, or execution authority. The old #1064 branch is treated as design lineage: unique safety semantics are forward-ported onto current `main`, while generic concepts already provided by current Mesh primitives are referenced instead of duplicated.

**Tech Stack:** Node.js ESM, built-in `node:test`/`node:assert`, existing `mesh/src/lib/canonical.mjs` canonical JSON/digest helpers and `ValidationError`, JSON Schema Draft 2020-12, zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-03-sovereign-health-evidence-graph-design.md`

## Global Constraints

- `domains.health` remains `adapter_required`; do not modify its capability status.
- Every Health object in v0 is inert: `authority_effect: "none"`, `network_effect: "none"`, `runtime_activation: false`.
- V0 fixtures/contracts contain no raw patient health content and no secret or credential material.
- Health data, inference, clinical judgment, consent, and execution authority remain separately represented.
- Model inference must not self-promote to `clinical-assessment` or `diagnosis-assertion`.
- Consent must not substitute for competence, device safety, regulatory authorization, or clinical authority.
- Health disclosure reuses the existing Sovereign Vault + Context Broker + Context Capsule architecture; do not create a parallel Health context-capsule system.
- Future clinical effects remain on the ordinary `Gateway -> Hypervisor -> Sandbox -> Grid` path.
- The H0-H5 Health autonomy vocabulary from PR #1064 remains the execution vocabulary; v0 grants none of those runtime levels.
- Unknown fields fail closed for every v0 contract.
- Canonicalization and SHA-256 digests reuse `mesh/src/lib/canonical.mjs`.
- Node support remains `>=22.23.2 <23 || >=24.14.0 <25`.
- No new dependency may be added.

---

## File Structure

Create:

- `mesh/config/health-evidence-node-v0.schema.json` — exact HealthEvidenceNode v0 schema.
- `mesh/config/health-provenance-edge-v0.schema.json` — exact HealthProvenanceEdge v0 schema.
- `mesh/config/clinical-inference-receipt-v0.schema.json` — exact ClinicalInferenceReceipt v0 schema.
- `mesh/config/health-research-participation-v0.schema.json` — exact ResearchParticipation v0 schema.
- `mesh/config/neural-data-profile-v0.schema.json` — exact NeuralDataProfile v0 schema.
- `mesh/src/lib/health-evidence-graph.mjs` — node/edge validation, digesting, set-level consistency, cycle detection.
- `mesh/src/lib/clinical-inference-receipt.mjs` — inference receipt validation/digesting.
- `mesh/src/lib/health-research-participation.mjs` — research contract validation/digesting.
- `mesh/src/lib/neural-data-profile.mjs` — neural profile validation/digesting.
- `mesh/src/lib/health-action-boundary.mjs` — pure non-authority/action-firewall evaluation.
- `mesh/test/health-evidence-schema.test.mjs`
- `mesh/test/health-evidence-graph.test.mjs`
- `mesh/test/clinical-inference-receipt.test.mjs`
- `mesh/test/health-research-participation.test.mjs`
- `mesh/test/neural-data-profile.test.mjs`
- `mesh/test/health-action-boundary.test.mjs`
- `mesh/test/health-foundation-docs.test.mjs`
- `docs/architecture/HEALTH-MESH-FOUNDATION.md`
- `docs/security/HEALTH-MESH-THREAT-MODEL.md`
- `docs/ROADMAP-EXTENSION-HEALTH-MESH.md`
- `docs/MASTER-TODO-HEALTH-MESH.md`
- `docs/architecture/contracts/health-mesh-clinical-envelope.v0.1.schema.json`
- `mesh/config/health-mesh-workflow.v0.1.schema.json`
- `mesh/config/health-mesh-regulatory-eligibility.v0.1.schema.json`
- `mesh/config/health-mesh-endpoint-profile.v0.1.schema.json`

Modify:

- `mesh/src/check-docs.mjs` — register Health canonical documents and required content.
- `docs/README.md` — add the Health architecture/roadmap/TODO to the canonical documentation index.
- PR #1479 body — mark the design approved and summarize implemented slices as they land.

Do **not** modify:

- Gateway routes;
- Hypervisor policy/grants;
- Sandbox execution;
- Grid mutation APIs;
- `mesh/config/capabilities.json` Health status;
- production deployment or provider configuration.

---

### Task 1: Forward-port the Health Mesh safety lineage onto current main

**Files:**
- Create: `docs/architecture/HEALTH-MESH-FOUNDATION.md`
- Create: `docs/security/HEALTH-MESH-THREAT-MODEL.md`
- Create: `docs/ROADMAP-EXTENSION-HEALTH-MESH.md`
- Create: `docs/MASTER-TODO-HEALTH-MESH.md`
- Create: `docs/architecture/contracts/health-mesh-clinical-envelope.v0.1.schema.json`
- Create: `mesh/config/health-mesh-workflow.v0.1.schema.json`
- Create: `mesh/config/health-mesh-regulatory-eligibility.v0.1.schema.json`
- Create: `mesh/config/health-mesh-endpoint-profile.v0.1.schema.json`
- Test: `mesh/test/health-foundation-docs.test.mjs`

**Interfaces:**
- Consumes: current `docs/rebuild/REQUIREMENTS.md`, `docs/architecture/SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md`, current capability registry semantics, and the unique Health-specific material from PR #1064.
- Produces: current-main Health doctrine and planning-only H0-H5 workflow/regulatory/endpoint schemas. No runtime function is exported.

- [ ] **Step 1: Write the RED documentation/contract regression test**

Create `mesh/test/health-foundation-docs.test.mjs` that loads the eight files above and asserts:

```js
assert.match(foundation, /Gateway -> Hypervisor -> Sandbox -> Grid/);
assert.match(foundation, /H0/);
assert.match(foundation, /H5/);
assert.match(foundation, /Health data is evidence, not authority|Evidence must remain distinguishable from claims/);
assert.match(foundation, /Sovereign Vault/i);
assert.match(foundation, /Context Capsule/i);
assert.match(threatModel, /epistemic laundering/i);
assert.match(threatModel, /cross-patient/i);
assert.match(threatModel, /neural/i);
assert.match(todo, /Health Evidence Graph/i);
assert.match(todo, /Clinical Inference Receipt/i);
assert.match(roadmap, /adapter_required/i);
assert.equal(workflow.properties.runtime_authority_granted.const, false);
assert.equal(workflow.properties.clinical_authorization_claimed.const, false);
assert.deepEqual(workflow.properties.maximum_autonomy_level.enum, ['H0', 'H1', 'H2', 'H3', 'H4', 'H5']);
assert.equal(workflow.properties.escalation_policy.properties.supervision_loss_cannot_raise_autonomy.const, true);
assert.equal(workflow.properties.escalation_policy.properties.emergency_authority_is_separate.const, true);
assert.equal(workflow.properties.escalation_policy.properties.uncertain_physical_effects_are_not_retried.const, true);
assert.equal(regulatory.properties.runtime_authority_granted.const, false);
assert.equal(regulatory.properties.regulatory_truth_claimed_by_axiom.const, false);
assert.equal(endpoint.properties.runtime_authority_granted.const, false);
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
cd mesh
node --test test/health-foundation-docs.test.mjs
```

Expected: FAIL because the current-main Health foundation files do not exist.

- [ ] **Step 3: Forward-port #1064 without reviving stale generic contracts**

Copy/reconstruct the still-valid Health-specific content from #1064, but update it so:

- generic consent points to current consent receipts;
- private health information points to Sovereign Vaults;
- external disclosure points to the generic Context Capsule path;
- machine actors point to current constrained machine-principal/provider semantics;
- current evidence-chain and portability primitives are referenced rather than redefined;
- `domains.health` is explicitly described as `adapter_required`;
- no document claims runtime, clinical, legal, regulatory, medical-device, research-egress, or emergency-dispatch promotion.

Preserve these exact #1064 safety ideas: H0-H5, loss-of-supervision cannot increase autonomy, emergency authority is separate, uncertain physical effects are not blindly retried, physical safety controls are independent of model reasoning, clinical/regulatory eligibility is external evidence, and protocol compatibility does not grant authority.

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run:

```bash
cd mesh
node --test test/health-foundation-docs.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the forward-port slice**

```bash
git add docs/architecture/HEALTH-MESH-FOUNDATION.md docs/security/HEALTH-MESH-THREAT-MODEL.md docs/ROADMAP-EXTENSION-HEALTH-MESH.md docs/MASTER-TODO-HEALTH-MESH.md docs/architecture/contracts/health-mesh-clinical-envelope.v0.1.schema.json mesh/config/health-mesh-workflow.v0.1.schema.json mesh/config/health-mesh-regulatory-eligibility.v0.1.schema.json mesh/config/health-mesh-endpoint-profile.v0.1.schema.json mesh/test/health-foundation-docs.test.mjs
git commit -m "docs: converge Health Mesh safety foundation"
```

---

### Task 2: Health Evidence Node and Provenance Edge contracts

**Files:**
- Create: `mesh/config/health-evidence-node-v0.schema.json`
- Create: `mesh/config/health-provenance-edge-v0.schema.json`
- Create: `mesh/src/lib/health-evidence-graph.mjs`
- Test: `mesh/test/health-evidence-schema.test.mjs`
- Test: `mesh/test/health-evidence-graph.test.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError` from `./canonical.mjs`.
- Produces:
  - `HEALTH_EVIDENCE_NODE_SCHEMA = 'axiom-health-evidence-node.v0'`
  - `HEALTH_PROVENANCE_EDGE_SCHEMA = 'axiom-health-provenance-edge.v0'`
  - `validateHealthEvidenceNode(document)`
  - `healthEvidenceNodeDigest(document)`
  - `validateHealthProvenanceEdge(document)`
  - `healthProvenanceEdgeDigest(document)`
  - `validateHealthEvidenceGraph({ nodes, edges })`

- [ ] **Step 1: Write RED schema tests**

Require both schemas to use Draft 2020-12, `additionalProperties: false`, the exact schema/status constants, and inert flags. The node schema must expose exactly these epistemic classes:

```js
[
  'observation',
  'clinical-record',
  'derived-feature',
  'model-hypothesis',
  'clinical-assessment',
  'diagnosis-assertion',
  'recommendation',
  'authorized-care-action-record'
]
```

The edge schema must expose exactly:

```js
[
  'derived-from',
  'supports',
  'contradicts',
  'supersedes-without-erasure',
  'corrects-without-erasure',
  'interprets',
  'reviews',
  'result-of',
  'authorized-by-record',
  'collected-from',
  'custody-successor'
]
```

- [ ] **Step 2: Run schema tests and verify RED**

Run:

```bash
cd mesh
node --test test/health-evidence-schema.test.mjs
```

Expected: FAIL because the schemas do not exist.

- [ ] **Step 3: Add the exact schemas and make schema tests GREEN**

Use identifier pattern `/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/`, digest pattern `/^[a-f0-9]{64}$/`, canonical ISO timestamps, bounded lists at 32 unless the field needs a stricter limit, and `contains_raw_health_data: false`, `contains_secret_material: false`, `authority_effect: 'none'`, `network_effect: 'none'`, `runtime_activation: false` as constants.

Node `source` must bind `kind`, `ref`, nullable `digest`, and bounded `credential_status_evidence_refs`; `artifact` must bind `ref`, `digest`, `media_type`, and `summary_class` only—no raw content field.

- [ ] **Step 4: Write RED semantic tests**

Use synthetic fixtures and assert:

```js
const node = validHealthNode();
const result = validateHealthEvidenceNode(node);
assert.equal(result.valid, true);
assert.equal(result.epistemic_class, node.epistemic_class);
assert.match(result.node_digest, /^[a-f0-9]{64}$/);
assert.equal(Object.isFrozen(result), true);
```

Negative tests must reject unknown fields, malformed IDs, duplicate refs, raw/secret flags set true, unsupported source kinds, invalid epistemic classes, self-edges, missing referenced nodes, cross-subject edges, encounter mismatch, duplicate node/edge IDs, and `authorized-by-record` being represented as an authority grant.

Add a derivation-cycle fixture `A -> B -> C -> A` using `derived-from`; `validateHealthEvidenceGraph` must reject it. `supports`/`contradicts` cycles are not treated as derivation cycles.

- [ ] **Step 5: Run semantic tests and verify RED**

```bash
cd mesh
node --test test/health-evidence-graph.test.mjs
```

Expected: FAIL because `health-evidence-graph.mjs` does not exist.

- [ ] **Step 6: Implement the minimal pure validator/digest module**

Follow the current `resource-envelope.mjs` style: strict plain-object/exact-field checks, local enum Sets, canonical timestamps, unique bounded arrays, and `digestObject(document)`. Do not mutate caller documents.

`validateHealthEvidenceGraph({ nodes, edges })` must build node/edge maps, reject duplicate IDs, validate all members, require edge endpoints to exist, require subject equality, require encounter equality when both sides are encounter-bound, and run DFS only across `derived-from` and `result-of` edges to reject derivation cycles.

- [ ] **Step 7: Run tests and verify GREEN**

```bash
cd mesh
node --test test/health-evidence-schema.test.mjs test/health-evidence-graph.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add mesh/config/health-evidence-node-v0.schema.json mesh/config/health-provenance-edge-v0.schema.json mesh/src/lib/health-evidence-graph.mjs mesh/test/health-evidence-schema.test.mjs mesh/test/health-evidence-graph.test.mjs
git commit -m "feat: add inert Health evidence graph contracts"
```

---

### Task 3: Clinical Inference Receipt v0

**Files:**
- Create: `mesh/config/clinical-inference-receipt-v0.schema.json`
- Create: `mesh/src/lib/clinical-inference-receipt.mjs`
- Test: `mesh/test/clinical-inference-receipt.test.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError`.
- Produces:
  - `CLINICAL_INFERENCE_RECEIPT_SCHEMA = 'axiom-clinical-inference-receipt.v0'`
  - `validateClinicalInferenceReceipt(document)`
  - `clinicalInferenceReceiptDigest(document)`

- [ ] **Step 1: Write RED tests for the exact model-bound receipt**

A valid fixture must contain exact `model_ref`, `model_digest`, `runtime_ref`, `intended_use_ref`, at least one `{ evidence_id, evidence_digest }` input, `output_digest`, `output_epistemic_class` of only `model-hypothesis` or `derived-feature`, uncertainty object, calibration evidence refs, population constraints, human-review requirement, and inert flags.

Assert rejection of:

- `clinical-assessment` or `diagnosis-assertion` as model output class;
- missing intended-use reference;
- duplicate input evidence IDs;
- invalid input digest;
- caller field such as `model_is_within_intended_use: true`;
- uncertainty type `calibrated-probability` without at least one calibration evidence ref;
- `human_review_requirement: 'none'` when `output_epistemic_class` is `model-hypothesis` and the fixture's `review_floor` is `qualified-human`;
- `clinical_authority_granted: true`;
- secret/credential-looking unknown fields.

- [ ] **Step 2: Run and verify RED**

```bash
cd mesh
node --test test/clinical-inference-receipt.test.mjs
```

- [ ] **Step 3: Implement schema and semantic validator**

The validator returns a frozen summary containing `valid`, `schema`, `inference_id`, `subject_ref`, `model_ref`, `output_epistemic_class`, `receipt_digest`, and fixed non-authority flags. It validates the document only; it does not verify external model correctness, run a model, or resolve an intended-use authority.

- [ ] **Step 4: Run and verify GREEN**

```bash
cd mesh
node --test test/clinical-inference-receipt.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/config/clinical-inference-receipt-v0.schema.json mesh/src/lib/clinical-inference-receipt.mjs mesh/test/clinical-inference-receipt.test.mjs
git commit -m "feat: bind inert clinical inference receipts"
```

---

### Task 4: Health Research Participation v0

**Files:**
- Create: `mesh/config/health-research-participation-v0.schema.json`
- Create: `mesh/src/lib/health-research-participation.mjs`
- Test: `mesh/test/health-research-participation.test.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError`.
- Produces:
  - `HEALTH_RESEARCH_PARTICIPATION_SCHEMA = 'axiom-health-research-participation.v0'`
  - `validateHealthResearchParticipation(document)`
  - `healthResearchParticipationDigest(document)`
  - `evaluateResearchUse(participation, request)` returning an inert decision summary only.

- [ ] **Step 1: Write RED contract/use tests**

A participation document must bind subject, controller, exact recipient, study/protocol ref+digest, purpose, allowed/forbidden data classes, named transformations, explicit `model_training_allowed`, onward-disclosure enum, retention object, start/expiry, revocation handle, withdrawal semantics, result-return policy, consent refs, evidence refs, and fixed `external_access_granted: false`.

`evaluateResearchUse` accepts an inert request shape:

```js
{
  recipient_ref,
  study_or_protocol_ref,
  study_or_protocol_digest,
  purpose,
  requested_data_classes,
  requested_transformations,
  model_training_requested,
  onward_disclosure_requested,
  at
}
```

It must return `{ allowed: true|false, reasons: [...], authority_effect: 'none', network_effect: 'none' }` and never perform disclosure.

Negative tests: wrong purpose, wrong recipient, changed study digest, forbidden data class, missing required transformation, training when forbidden, widened onward disclosure, expired contract, and unknown fields.

- [ ] **Step 2: Run and verify RED**

```bash
cd mesh
node --test test/health-research-participation.test.mjs
```

- [ ] **Step 3: Implement the exact schema, validator, and pure evaluator**

The evaluator must be deterministic, local, and deny by accumulation: collect every mismatch reason rather than stopping after the first. It may report compatibility only; it does not create a Context Capsule or effect grant.

- [ ] **Step 4: Run and verify GREEN**

```bash
cd mesh
node --test test/health-research-participation.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/config/health-research-participation-v0.schema.json mesh/src/lib/health-research-participation.mjs mesh/test/health-research-participation.test.mjs
git commit -m "feat: add bounded Health research participation contract"
```

---

### Task 5: Neural Data Profile v0

**Files:**
- Create: `mesh/config/neural-data-profile-v0.schema.json`
- Create: `mesh/src/lib/neural-data-profile.mjs`
- Test: `mesh/test/neural-data-profile.test.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError`.
- Produces:
  - `NEURAL_DATA_PROFILE_SCHEMA = 'axiom-neural-data-profile.v0'`
  - `validateNeuralDataProfile(document)`
  - `neuralDataProfileDigest(document)`

- [ ] **Step 1: Write RED tests for the neural non-authority invariant**

Allow signal classes such as `eeg`, `intracranial`, `neuroimaging-derived`, `neural-interface`, and `other-governed`; require acquisition-device ref+digest, source evidence refs, optional paired decoder ref+digest, derived-output type, fixed high/critical sensitivity, retention, consent refs, limitations, and these exact constants:

```js
decoded_intent_is_authority: false
decoded_signal_is_legal_consent: false
decoded_signal_is_identity_proof: false
authority_effect: 'none'
network_effect: 'none'
runtime_activation: false
```

Reject decoder ref without decoder digest and decoder digest without decoder ref. Reject any attempt to set one of the three decoded-signal constants to true. Reject raw neural samples/content fields, secrets, credentials, or arbitrary model-output text.

- [ ] **Step 2: Run and verify RED**

```bash
cd mesh
node --test test/neural-data-profile.test.mjs
```

- [ ] **Step 3: Implement exact schema and pure validator**

The validator returns only bounded metadata plus a digest; it does not interpret neural signals or infer consent/intention.

- [ ] **Step 4: Run and verify GREEN**

```bash
cd mesh
node --test test/neural-data-profile.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/config/neural-data-profile-v0.schema.json mesh/src/lib/neural-data-profile.mjs mesh/test/neural-data-profile.test.mjs
git commit -m "feat: add neural data non-authority profile"
```

---

### Task 6: Health Action Boundary / inference-to-effect firewall

**Files:**
- Create: `mesh/src/lib/health-action-boundary.mjs`
- Test: `mesh/test/health-action-boundary.test.mjs`

**Interfaces:**
- Consumes: validated Health evidence/inference objects and planning-only Health workflow/regulatory records.
- Produces:
  - `HEALTH_AUTONOMY_LEVELS = Object.freeze(['H0','H1','H2','H3','H4','H5'])`
  - `evaluateHealthActionBoundary(candidate) -> frozen inert decision`

`candidate` exact shape:

```js
{
  source_kind: 'evidence-node' | 'clinical-inference' | 'consent-record' | 'regulatory-research' | 'workflow-record',
  source_ref,
  source_autonomy_level: 'H0' | 'H1' | 'H2' | null,
  requested_effect: 'record-read' | 'record-write' | 'diagnosis-finalization' | 'prescribing' | 'treatment' | 'physical-invasive' | 'emergency-dispatch' | 'other-consequential',
  requested_autonomy_level: 'H0' | 'H1' | 'H2' | 'H3' | 'H4' | 'H5',
  separate_authority_ref,
  supervision_required,
  supervision_available,
  external_outcome_state: 'not-applicable' | 'known-success' | 'known-failure' | 'uncertain',
  retry_requested,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

- [ ] **Step 1: Write RED denial tests**

Require denial when:

- evidence or inference is supplied without `separate_authority_ref` for a consequential effect;
- H0/H1/H2 source is used to claim H3/H4/H5 authority;
- required supervision is unavailable;
- `external_outcome_state === 'uncertain'` and retry is requested for a physical/consequential effect;
- `source_kind === 'regulatory-research'` is treated as execution authority;
- `source_kind === 'consent-record'` is treated as competence/device-safety evidence;
- clinical inference directly requests diagnosis finalization, prescribing, treatment, invasive action, or emergency dispatch.

A permitted result in v0 means only **boundary-compatible for later ordinary authorization**, never execution-authorized.

- [ ] **Step 2: Run and verify RED**

```bash
cd mesh
node --test test/health-action-boundary.test.mjs
```

- [ ] **Step 3: Implement the pure evaluator**

Return:

```js
Object.freeze({
  allowed_to_enter_ordinary_authorization: boolean,
  execution_authorized: false,
  reasons: Object.freeze([...]),
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
})
```

The module must have no filesystem, network, process, provider, or Grid imports.

- [ ] **Step 4: Run and verify GREEN**

```bash
cd mesh
node --test test/health-action-boundary.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add mesh/src/lib/health-action-boundary.mjs mesh/test/health-action-boundary.test.mjs
git commit -m "feat: enforce Health inference-to-effect boundary"
```

---

### Task 7: Canonical documentation registration and Health roadmap reconciliation

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Modify: `docs/README.md`
- Modify: `docs/MASTER-TODO-HEALTH-MESH.md`

**Interfaces:**
- Consumes: all Health documents/contracts from Tasks 1-6.
- Produces: documentation checker enforcement and a current roadmap that distinguishes completed generic prerequisites, inert Health contracts, adapter-required work, and future clinical/jurisdictional promotion gates.

- [ ] **Step 1: Write RED expectations into the existing Health docs regression test**

Add assertions that `check-docs.mjs` includes:

```js
'docs/MASTER-TODO-HEALTH-MESH.md'
'docs/ROADMAP-EXTENSION-HEALTH-MESH.md'
'docs/architecture/HEALTH-MESH-FOUNDATION.md'
'docs/security/HEALTH-MESH-THREAT-MODEL.md'
'docs/superpowers/specs/2026-09-03-sovereign-health-evidence-graph-design.md'
'docs/superpowers/plans/2026-09-03-sovereign-health-evidence-graph-v0.md'
```

and required-content markers include `Health Evidence Graph`, `H0`, `H5`, `adapter_required`, `model inference`, `Context Capsule`, and the neural non-authority statement.

- [ ] **Step 2: Run the documentation tests/checker and verify RED**

```bash
cd mesh
node --test test/health-foundation-docs.test.mjs
npm run docs:check
```

Expected: RED until `check-docs.mjs` and `docs/README.md` are updated.

- [ ] **Step 3: Register the Health canonical surface**

Update `CANONICAL_DOCUMENTS`, `REQUIRED_CONTENT`, and `MINIMUM_LENGTH` only for the new Health documents/spec/plan that need support-boundary enforcement. Do not add every generated JSON schema to `CANONICAL_DOCUMENTS` if focused tests already enforce them; keep docs-check focused on human-maintained canonical documents.

- [ ] **Step 4: Reconcile the Health TODO against current main**

Mark an old #1064 prerequisite complete only if current executable evidence actually supports it. In particular, do not mark clinical credential status, live patient audit, external clinical currentness, or regulatory deployment as complete merely because adjacent generic capabilities exist.

Use four states in the TODO narrative:

- generic substrate satisfied;
- Health inert contract implemented;
- adapter/interop implementation required;
- clinical/jurisdictional promotion evidence required.

- [ ] **Step 5: Run docs checks and targeted tests GREEN**

```bash
cd mesh
node --test test/health-foundation-docs.test.mjs
npm run docs:check
```

- [ ] **Step 6: Commit**

```bash
git add mesh/src/check-docs.mjs docs/README.md docs/MASTER-TODO-HEALTH-MESH.md
git commit -m "docs: register current Health convergence surface"
```

---

### Task 8: Whole-slice adversarial verification and PR convergence metadata

**Files:**
- Modify only if verification exposes a defect in files created/modified above.
- Update: PR #1479 body/comment with exact verification status.

**Interfaces:**
- Consumes: Tasks 1-7.
- Produces: one reviewable Health convergence branch with no capability promotion and exact test evidence.

- [ ] **Step 1: Run all Health tests**

```bash
cd mesh
node --test \
  test/health-foundation-docs.test.mjs \
  test/health-evidence-schema.test.mjs \
  test/health-evidence-graph.test.mjs \
  test/clinical-inference-receipt.test.mjs \
  test/health-research-participation.test.mjs \
  test/neural-data-profile.test.mjs \
  test/health-action-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run registry/status/documentation checks**

```bash
cd mesh
npm run check-registry
npm run status:check
npm run docs:check
```

Expected: PASS and `domains.health` still reports `adapter_required`.

- [ ] **Step 3: Run the complete kernel check**

```bash
cd mesh
npm run check
```

Expected: PASS. If an unrelated current-main verification issue prevents a clean run, record the exact failing command and prove the Health-targeted tests plus registry/status/docs gates independently; do not describe the branch as fully green until the complete check actually passes.

- [ ] **Step 4: Adversarial grep/review**

Inspect the diff for prohibited additions:

```bash
git diff main...HEAD -- mesh/src/gateway mesh/src/hypervisor mesh/src/sandbox mesh/src/grid mesh/config/capabilities.json
```

Expected: no Health runtime route/effect/capability-status changes.

Search Health fixtures/contracts for common secret/raw-data fields:

```bash
grep -RniE 'api[_-]?key|password|refresh[_-]?token|cookie|authorization:|raw[_-]?(patient|health|eeg|neural)[_-]?(data|content|sample)' mesh/config mesh/test docs/architecture docs/security | grep -i health || true
```

Review every match; expected result is no actual secret/raw-patient fixture content.

- [ ] **Step 5: Update PR #1479 metadata**

State which tasks landed, exact commands run, exact head SHA, and these nonclaims:

- no clinical runtime capability;
- no medical advice/product claim;
- no EHR/provider/device connectivity;
- no research egress;
- no BCI/neural ingestion;
- no H3/H4/H5 execution authority;
- no jurisdictional/regulatory compliance claim;
- `domains.health` remains `adapter_required`.

Once every unique accepted #1064 semantic has a current-main mapping, note that #1064 can be closed as superseded-by-convergence rather than merged wholesale.

- [ ] **Step 6: Final commit if verification required fixes**

```bash
git add <only files changed to repair verified defects>
git commit -m "test: harden Health convergence boundaries"
```

If no verification fixes are needed, do not create an empty commit.

---

## Self-review results

### Spec coverage

- PR #1064 H0-H5 and safety lineage: Task 1.
- Patient-sovereign evidence graph and immutable epistemic classes: Task 2.
- Provenance, disagreement/correction-without-erasure, cross-subject protection, derivation cycles: Task 2.
- Model-bound inference receipt and model/non-authority rule: Task 3.
- Purpose/recipient/study/data/training/retention/withdrawal-bound research participation: Task 4.
- Neural signal/decoder non-consent/non-identity/non-authority boundary: Task 5.
- Inference-to-effect firewall, supervision-loss, autonomy escalation, uncertain retry, regulatory/consent laundering: Task 6.
- Canonical docs/TODO reconciliation and current capability truth: Task 7.
- Full verification, no-runtime-change proof, and #1064 successor metadata: Task 8.

### Placeholder scan

No `TBD`, `TODO`, “similar to”, or unspecified implementation step remains in this plan. Every task identifies exact files, interfaces, targeted tests, expected RED/GREEN behavior, and a commit boundary.

### Type/interface consistency

The only cross-task runtime dependencies are the fixed exported validator/digest names listed above. Task 6 consumes validated objects but does not call execution paths. Task 7 consumes only documents/contracts. No later task depends on an undefined runtime authority function.

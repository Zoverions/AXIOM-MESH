# Deployment & Capability Engine v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, inert Deployment & Capability Engine that composes current-main resource, capability, provider, and host-sovereignty contracts to produce non-authorizing deployment plans.

**Architecture:** The engine is a pure validation/resolution module above existing contracts. Caller-authored deployment documents bind existing artifacts by exact reference and digest; the resolver validates Resource Envelope/Observation freshness, capability discovery metadata, provider evidence, and optional exact G0 host-sovereignty evidence, then derives a stable plan. It performs no network, filesystem mutation, process execution, credential access, provider activation, installation, model invocation, or authority mutation.

**Tech Stack:** Node.js 24 ESM; `node:test`; existing `canonical.mjs` digest/validation utilities; Resource Envelope v0; Resource Observation v0; Capability Surfaces v0; Host Sovereignty G0; Runtime & Connector Fabric validators; JSON Schema draft 2020-12.

**Spec:** `docs/superpowers/specs/2026-09-02-deployment-capability-engine-v0-design.md`

## Global Constraints

- `DesiredDeployment`, `DeploymentProviderBinding`, and `DeploymentSpec` are caller-authored inert v0 documents; `DeploymentPlan` is derived only.
- `authority_effect` is always `none`; `network_effect` is always `none`; `runtime_activation` is always `false`; spec/plan `execution_authorized` is always `false`.
- Reuse `validateResourceEnvelope`, `resourceEnvelopeDigest`, `validateResourceObservation`, `resourceObservationDigest`, and `requireFreshResourceObservations`; do not fork their semantics.
- Reuse `validateCapabilitySurfaceRegistry` / `capabilitySurfacesDigest`; capability discovery never grants executable authority.
- Reuse `validateRuntimeConnectorCatalogEntry` for runtime-catalog evidence where applicable.
- Reuse G0 host-sovereignty validators/evaluator only when a complete, explicit G0-compatible runtime/request evidence bundle is supplied. Never infer instantaneous bandwidth, user-idle state, foreground activity, metering, transfer accounting, or G0 storage/bandwidth request dimensions from Resource Envelope budgets.
- Provider evidence is supplied to the pure resolver; v0 performs no discovery/network calls. `provider_ref + provider_digest` must exactly bind the supplied artifact.
- Hard constraints always outrank preferences.
- Equivalent candidates without accepted ranking evidence produce an explicit owner choice; never invent a cost/performance/intelligence ranking.
- Maximums: 32 required capabilities; 128 provider bindings; 64 resource observations; 16 roles; 32 capabilities per binding; 32 evidence refs per binding.
- No Gateway route, executable capability-registry promotion, installer invocation, runtime activation, package manager, model download, USB writing, cloud provisioning, or host mutation.

---

### Task 1: Caller-authored deployment contracts

**Files:**
- Create: `mesh/test/deployment-capability-engine.test.mjs`
- Create: `mesh/config/desired-deployment-v0.schema.json`
- Create: `mesh/config/deployment-provider-binding-v0.schema.json`
- Create: `mesh/config/deployment-spec-v0.schema.json`
- Create: `mesh/src/lib/deployment-capability-engine.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError`, Resource Envelope/Observation validators.
- Produces: `validateDesiredDeployment(document)`, `validateDeploymentProviderBinding(document)`, `validateDeploymentSpec(document, context)`, `deploymentSpecDigest(document, context)`.

- [ ] **Step 1: Write RED tests for exact shapes, enums, cardinality, duplicate rejection, no-authority fields, and stable digests.**

```js
assert.equal(validateDesiredDeployment(desired()).valid, true);
assert.equal(validateDeploymentProviderBinding(binding()).valid, true);
assert.equal(validateDeploymentSpec(spec(), context()).valid, true);
assert.equal(deploymentSpecDigest(spec(), context()), deploymentSpecDigest(spec(), context()));
const widened = desired();
widened.authority_effect = 'grant';
assert.throws(() => validateDesiredDeployment(widened), /authority/i);
```

- [ ] **Step 2: Run the focused RED test and confirm failure is caused by the missing engine/schemas.**

Run: `node --test mesh/test/deployment-capability-engine.test.mjs`

Expected: FAIL with module/schema absence, and no unrelated current-main failure.

- [ ] **Step 3: Implement strict semantic validators and JSON Schema mirrors using the spec's exact fields/enums.**

```js
export function validateDesiredDeployment(document) {
  validateDesiredShape(document);
  return Object.freeze({
    valid: true,
    deployment_id: document.deployment_id,
    target_host_ref: document.target_host_ref,
    desired_digest: digestObject(document),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}
```

`DeploymentProviderBinding.resource_request` must use exactly the Resource Envelope dimensions:

```js
[
  'cpu_millis','memory_bytes','accelerator_memory_bytes','durable_storage_bytes',
  'scratch_storage_bytes','io_bytes','network_bytes','network_requests','model_calls',
  'input_units','output_units','concurrency','wall_time_ms','monetary_cost_units',
  'energy_millijoules','process_count','thread_count','file_descriptors'
]
```

- [ ] **Step 4: Run focused tests and schema parity checks.**

Run: `node --test mesh/test/deployment-capability-engine.test.mjs`

Expected: PASS for Task 1 cases.

- [ ] **Step 5: Commit the caller-authored contract slice.**

```bash
git add mesh/test/deployment-capability-engine.test.mjs mesh/config/*deployment*v0.schema.json mesh/src/lib/deployment-capability-engine.mjs
git commit -m "feat: add inert deployment planning contracts"
```

### Task 2: Exact composition and evidence binding

**Files:**
- Modify: `mesh/src/lib/deployment-capability-engine.mjs`
- Modify: `mesh/test/deployment-capability-engine.test.mjs`

**Interfaces:**
- Consumes: `validateResourceEnvelope`, `resourceEnvelopeDigest`, `validateResourceObservation`, `resourceObservationDigest`, `requireFreshResourceObservations`, `validateCapabilitySurfaceRegistry`, `capabilitySurfacesDigest`, `validateRuntimeConnectorCatalogEntry`.
- Produces: validated composition context containing exact resource, capability-surface, provider, and host-policy bindings.

- [ ] **Step 1: Add RED tests for host mismatch, stale/missing observations, capability-surface digest mismatch, provider artifact digest mismatch, duplicate binding IDs, and conflicting duplicate provider identity.**

```js
const mismatched = spec();
mismatched.resource_envelope.host_ref = 'host.other';
assert.throws(() => validateDeploymentSpec(mismatched, context()), /host/i);

const badContext = context();
badContext.provider_artifacts['provider.synthetic'] = { changed: true };
assert.throws(() => validateDeploymentSpec(spec(), badContext), /provider.*digest/i);
```

- [ ] **Step 2: Run focused RED cases.**

Run: `node --test mesh/test/deployment-capability-engine.test.mjs`

Expected: FAIL only on the new composition assertions.

- [ ] **Step 3: Implement exact reference/digest composition.**

```js
const envelope = validateResourceEnvelope(document.resource_envelope);
if (envelope.host_ref !== desired.target_host_ref) {
  throw new ValidationError('resource envelope host does not match desired deployment');
}
requireFreshResourceObservations(document.resource_envelope, document.resource_observations, context.as_of);

const surface = context.capability_surface;
validateCapabilitySurfaceRegistry(surface);
if (capabilitySurfacesDigest(surface) !== document.capability_surface_ref.digest) {
  throw new ValidationError('capability surface digest mismatch');
}
```

For each provider binding, resolve `context.provider_artifacts[binding.provider_ref]`, compute `digestObject(artifact)`, compare to `provider_digest`, and—when `provider_kind === 'runtime-catalog-entry'`—also call `validateRuntimeConnectorCatalogEntry(artifact)`.

- [ ] **Step 4: Run focused tests.**

Run: `node --test mesh/test/deployment-capability-engine.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit composition integrity.**

```bash
git add mesh/src/lib/deployment-capability-engine.mjs mesh/test/deployment-capability-engine.test.mjs
git commit -m "feat: bind deployment planning evidence exactly"
```

### Task 3: Deterministic resolver and hard constraints

**Files:**
- Modify: `mesh/src/lib/deployment-capability-engine.mjs`
- Modify: `mesh/test/deployment-capability-engine.test.mjs`

**Interfaces:**
- Produces: `resolveDeploymentPlan(document, context)` returning inert `axiom-deployment-plan.v0`.

- [ ] **Step 1: Add RED tests for existing reuse, compatible addition, offline/locality/replacement rejection, resource conflict, unsatisfied capability, and equivalent-candidate owner choice.**

```js
const plan = resolveDeploymentPlan(spec(), context());
assert.deepEqual(plan.satisfied_existing, ['capability.present']);
assert.deepEqual(plan.selected_bindings, ['binding.addition']);
assert.equal(plan.execution_authorized, false);
```

- [ ] **Step 2: Run focused RED tests.**

Run: `node --test mesh/test/deployment-capability-engine.test.mjs`

Expected: FAIL because resolver behavior is not yet implemented.

- [ ] **Step 3: Implement constraint-first resolution.**

For each required capability:
1. sort matching candidate bindings by `binding_id` for deterministic processing;
2. reject invalid hard constraints before evaluating preferences;
3. when `reuse_existing` is true, reuse a unique compatible `installed-available` candidate;
4. never rank by `cost|performance|intelligence` without accepted ranking evidence;
5. if more than one equivalent compatible candidate remains, emit a sorted owner choice and `owner-choice-required` + `insufficient-ranking-evidence`;
6. if none remain, emit unsatisfied capability + `no-compatible-provider`.

- [ ] **Step 4: Run focused tests twice with order-permuted input fixtures.**

Run: `node --test mesh/test/deployment-capability-engine.test.mjs`

Expected: PASS and identical derived plan/digest for semantically order-insensitive permutations.

- [ ] **Step 5: Commit deterministic resolution.**

```bash
git add mesh/src/lib/deployment-capability-engine.mjs mesh/test/deployment-capability-engine.test.mjs
git commit -m "feat: resolve deployment plans deterministically"
```

### Task 4: Explicit G0 host-sovereignty composition

**Files:**
- Modify: `mesh/src/lib/deployment-capability-engine.mjs`
- Modify: `mesh/test/deployment-capability-engine.test.mjs`

**Interfaces:**
- Consumes: `evaluateContribution`, G0 policy/reserve/runtime/request documents supplied explicitly through `context.host_sovereignty_evidence`.
- Produces: `host-sovereignty-conflict` rejection only when complete G0-compatible evidence can be evaluated exactly.

- [ ] **Step 1: Add RED tests proving an explicit G0 denial rejects a provider and proving Resource Envelope data alone is never coerced into G0 runtime/request fields.**

```js
const denied = context();
denied.host_sovereignty_evidence = completeG0Evidence({ guardianState: 'QUARANTINED' });
assert.ok(resolveDeploymentPlan(spec(), denied).rejected_bindings.some(
  item => item.reason_codes.includes('host-sovereignty-conflict')
));

const envelopeOnly = context();
delete envelopeOnly.host_sovereignty_evidence;
assert.doesNotThrow(() => resolveDeploymentPlan(spec(), envelopeOnly));
```

- [ ] **Step 2: Run focused RED tests.**

Run: `node --test mesh/test/deployment-capability-engine.test.mjs`

Expected: FAIL on the new G0 composition cases only.

- [ ] **Step 3: Implement the explicit adapter.**

```js
function evaluateHostSovereigntyIfPresent(context, binding) {
  const evidence = context.host_sovereignty_evidence?.[binding.binding_id];
  if (!evidence) return null;
  return evaluateContribution({
    policy: evidence.policy,
    reserve: evidence.reserve,
    runtime: evidence.runtime,
    request: evidence.request,
    guardianState: evidence.guardian_state,
    remoteConstraints: evidence.remote_constraints
  });
}
```

Do not derive G0 `bandwidth_bytes_per_second`, `user_idle`, `foreground_user_active`, `unmetered_network`, `transfer_bytes_today`, or `transfer_bytes` from Resource Envelope/Observation documents.

- [ ] **Step 4: Run focused tests.**

Run: `node --test mesh/test/deployment-capability-engine.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit G0 composition.**

```bash
git add mesh/src/lib/deployment-capability-engine.mjs mesh/test/deployment-capability-engine.test.mjs
git commit -m "feat: compose explicit host sovereignty evidence"
```

### Task 5: Downstream requests and side-effect proof

**Files:**
- Modify: `mesh/src/lib/deployment-capability-engine.mjs`
- Modify: `mesh/test/deployment-capability-engine.test.mjs`

**Interfaces:**
- Produces: stable `downstream_plan_requests`, `consequences`, `reason_codes`, `plan_digest`.

- [ ] **Step 1: Add RED tests for descriptive downstream requests and monkey-patched side-effect primitives.**

```js
const plan = resolveDeploymentPlan(specRequiringInstall(), context());
assert.ok(plan.downstream_plan_requests.some(
  request => request.kind === 'host-install-plan'
));
assert.equal(plan.execution_authorized, false);
```

Patch or guard `fetch`, process-spawn functions, and filesystem mutation primitives so any invocation throws; resolution must still succeed without invoking them.

- [ ] **Step 2: Run focused RED tests.**

Run: `node --test mesh/test/deployment-capability-engine.test.mjs`

Expected: FAIL until downstream result projection is implemented; no side-effect primitive may be called.

- [ ] **Step 3: Implement descriptive downstream requests only.**

Map consequences to request kinds without invoking them:
- `install-profile` or `requires_privileged_change` -> `host-install-plan`;
- runtime acquisition -> `runtime-acquisition-plan`;
- model/provider acquisition -> `model-acquisition-plan` where explicitly declared by evidence;
- adapter requirement -> `adapter-configuration-plan`.

Each request carries references and requirements only.

- [ ] **Step 4: Run focused tests and full kernel tests.**

Run: `node --test mesh/test/deployment-capability-engine.test.mjs`

Then: `npm --prefix mesh test`

Expected: PASS.

- [ ] **Step 5: Commit side-effect-free plan projection.**

```bash
git add mesh/src/lib/deployment-capability-engine.mjs mesh/test/deployment-capability-engine.test.mjs
git commit -m "feat: project inert downstream deployment requests"
```

### Task 6: Repository integration and protected verification

**Files:**
- Modify: `mesh/src/check-docs.mjs` only if the new JSON schemas are placed under `docs/`; the spec-selected `mesh/config/*.schema.json` paths do not require supported-doc registration.
- Modify: PR #1459 / PR body with RED/GREEN evidence.

**Interfaces:**
- Produces: a reviewable current-main PR with exact-head verification evidence.

- [ ] **Step 1: Run repository checks.**

Run: `npm run check`

Expected: PASS.

- [ ] **Step 2: Run fresh protected CI on the exact final head.**

Required matrix: main verify, container, Node 22 compatibility, Windows, Apple Silicon macOS, Intel macOS, CodeQL, and all other required check runs for the repository.

- [ ] **Step 3: Inspect failures rather than weakening tests.**

Any failure must be classified as contract defect, integration boundary, or unrelated infrastructure failure; fix only the actual defect and re-run exact-head verification.

- [ ] **Step 4: Update PR evidence and issue #1459.**

Record RED SHA, GREEN SHA(s), exact test failures, exact-head check completion, non-authority boundary, and any deferred downstream planner dependency.

- [ ] **Step 5: Merge only when the complete exact-head matrix is green and the PR is mergeable.**

Use expected-head-SHA protection on the merge.
# Evidence-Aware Routing: Capability Observation v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct `axiom-cognitive-capability-observation.v0` on current `main` as the first executable evidence layer for task-specific model/runtime routing without importing stale branch architecture or widening AXIOM authority.

**Architecture:** Add one pure semantic validator/digest/resolver module beside the existing Cognitive Capability Profile, one strict JSON Schema 2020-12 mirror, and focused adversarial tests. The implementation preserves the historical #1393 contract vocabulary where it remains compatible with current `main`, but the approved 2026-09-06 Sovereign Intelligence Selection design is normative; historical PR code is provenance only and must not be merged wholesale.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, `node:assert/strict`, existing `mesh/src/lib/canonical.mjs`, existing `mesh/src/lib/cognitive-capability-profile.mjs`, JSON Schema 2020-12, protected GitHub CI.

**Spec:** `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`

## Global Constraints

- This plan implements only **Implementation Sequence step 1** from the approved spec: reconstruct Capability Observation v0.
- Schema identifier is exactly `axiom-cognitive-capability-observation.v0`.
- Version is exactly `0`; status is exactly `inert-evidence`.
- Every observation binds to exactly one current-main Cognitive Capability Profile using exact `profile_id` plus canonical `profile_digest`.
- The observed capability must already be declared by that exact profile.
- Capability vocabulary must reuse the existing Cognitive Capability Profile vocabulary; do not create a second task taxonomy here.
- Observation context binds exact context, task family, difficulty, environment, and toolset identities/digests.
- Evaluation binds exact suite, metric-set, threshold, and method identities/digests.
- Result classification is exactly `pass | degraded | fail | indeterminate` and is meaningful only relative to the bound threshold.
- `confidence` is finite in `[0,1]`; it is not a routing weight or probability of general intelligence.
- Evidence provenance remains attributable and content-addressed; provider-issued evidence is permitted as evidence but is not independent assurance by declaration.
- Resource observations preserve class, basis, amount, and unit; unlike units/bases are never converted or aggregated by this contract.
- `valid_until >= observed_at` and `recorded_at >= observed_at`; validation never reads wall-clock time.
- Every object is a plain exact object; unknown fields fail closed.
- Hard boundary fields are exact: `contains_secret_material=false`, `authority_effect='none'`, `network_effect='none'`, `training_effect='none'`, `spend_effect='none'`, `runtime_activation=false`, `selection_effect='evidence-only'`.
- No Gateway, Hypervisor, Sandbox, Grid, provider transport, credential broker, runtime activation, benchmark executor, routing mutation, training/adaptation, spend, topology mutation, or capability-registry promotion is introduced.
- Do not change `mesh/config/capabilities.json`.
- Historical PR #1393 is a source of reviewed semantics only. Reconstruct on the exact current branch; do not merge/cherry-pick its stack or its CCLE dependencies wholesale.

---

### Task 1: Define the RED semantic contract on current main

**Files:**
- Create: `mesh/test/cognitive-capability-observation.test.mjs`

**Interfaces:**
- Consumes current-main `cognitiveCapabilityProfileDigest(profile)` from `mesh/src/lib/cognitive-capability-profile.mjs`.
- Expects future exports from `mesh/src/lib/cognitive-capability-observation.mjs`:
  - `COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA`
  - `validateCognitiveCapabilityObservation(document)`
  - `cognitiveCapabilityObservationDigest(document)`
  - `resolveCognitiveCapabilityObservation(document, profile)`
- Produces the behavioral contract that Task 2 must satisfy.

- [ ] **Step 1: Create a current-main Cognitive Capability Profile fixture**

Use the already-landed v0 profile contract. The fixture must bind to a valid runtime/provider catalog entry and declare at least `reasoning` and `coding`. Keep the fixture local to the test file; do not add provider credentials, live URLs, or external calls.

- [ ] **Step 2: Add the valid observation fixture**

Use this exact observation shape as the baseline:

```js
function validObservation(profile) {
  return {
    schema: 'axiom-cognitive-capability-observation.v0',
    version: 0,
    status: 'inert-evidence',
    observation_id: 'capobs.reasoning.current-main.v1',
    profile_id: profile.profile_id,
    profile_digest: cognitiveCapabilityProfileDigest(profile),
    capability: 'reasoning',
    context: {
      context_ref: 'context.reasoning.current-main.v1',
      context_digest: 'a'.repeat(64),
      task_family_ref: 'task-family.reasoning.v1',
      task_family_digest: 'b'.repeat(64),
      difficulty_class: 'challenging',
      environment_ref: 'environment.node24.v1',
      environment_digest: 'c'.repeat(64),
      toolset_ref: 'toolset.none.v1',
      toolset_digest: 'd'.repeat(64)
    },
    evaluation: {
      suite_ref: 'suite.reasoning.v1',
      suite_digest: 'e'.repeat(64),
      metric_set_ref: 'metrics.reasoning.v1',
      metric_set_digest: 'f'.repeat(64),
      threshold_ref: 'threshold.reasoning.v1',
      threshold_digest: '1'.repeat(64),
      method_ref: 'method.deterministic-harness.v1',
      method_digest: '2'.repeat(64)
    },
    result: {
      classification: 'pass',
      confidence: 0.9,
      observed_metric_ref: 'metric-result.reasoning.v1',
      observed_metric_digest: '3'.repeat(64),
      failure_mode_refs: []
    },
    evaluator: {
      evaluator_kind: 'synthetic-harness',
      evaluator_ref: 'evaluator.reasoning.harness.v1',
      evaluator_principal_ref: null
    },
    evidence: {
      evidence_kind: 'evaluation-run',
      evidence_ref: 'evidence.reasoning.run.v1',
      evidence_digest: '4'.repeat(64),
      verification_ref: null,
      verification_digest: null,
      assurance_class: 'declared'
    },
    resource_observations: [
      {
        resource_class: 'input-tokens',
        basis: 'observed',
        amount: 2400,
        unit: 'tokens',
        source_ref: 'usage.reasoning.v1'
      },
      {
        resource_class: 'energy',
        basis: 'unknown',
        amount: null,
        unit: null,
        source_ref: null
      }
    ],
    observed_at: '2026-09-06T12:00:00.000Z',
    valid_until: '2026-10-06T12:00:00.000Z',
    recorded_at: '2026-09-06T12:01:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };
}
```

- [ ] **Step 3: Add positive contract assertions**

The test must require:

```js
const summary = validateCognitiveCapabilityObservation(observation);
assert.equal(summary.valid, true);
assert.equal(summary.schema, 'axiom-cognitive-capability-observation.v0');
assert.equal(summary.profile_id, profile.profile_id);
assert.equal(summary.capability, 'reasoning');
assert.equal(summary.classification, 'pass');
assert.equal(summary.authority_effect, 'none');
assert.equal(summary.network_effect, 'none');
assert.equal(summary.training_effect, 'none');
assert.equal(summary.spend_effect, 'none');
assert.equal(summary.runtime_activation, false);
assert.equal(summary.selection_effect, 'evidence-only');
assert.match(summary.observation_digest, /^[a-f0-9]{64}$/);
assert.equal(Object.isFrozen(summary), true);
```

Also require canonical digest stability under semantically identical object-key ordering.

- [ ] **Step 4: Add fail-closed adversarial cases**

Use table-driven mutations to prove rejection of:

```text
unknown top-level field
unknown nested field
wrong schema/version/status
malformed identifier/digest/unit/timestamp
NaN / Infinity / confidence < 0 / confidence > 1
duplicate failure_mode_refs
33 failure_mode_refs
33 resource_observations
negative or unsafe resource amount
unknown resource with non-null amount/unit
observed/estimated resource with null amount/unit
verification_ref without verification_digest
verification_digest without verification_ref
declared assurance with verification evidence
signed/verified-local/corroborated assurance without verification evidence
signed-evaluation-run with declared assurance
valid_until before observed_at
recorded_at before observed_at
any widened hard-boundary field
```

- [ ] **Step 5: Add exact-profile resolver cases**

Require `resolveCognitiveCapabilityObservation(document, profile)` to accept only exact `profile_id`, exact recomputed profile digest, and a capability declared by that profile. Add explicit negatives for profile ID substitution, profile digest substitution, and changing the observation capability to one absent from the profile.

- [ ] **Step 6: Add purity and source-boundary assertions**

Deep-freeze the test inputs before validation/resolution and assert no mutation. Read the future production module source and require imports to be limited to:

```text
./canonical.mjs
./cognitive-capability-profile.mjs
```

Reject imports containing `node:fs`, `node:child_process`, network clients, Gateway/Hypervisor/Sandbox/Grid, provider transport, credential/token/secret modules, or runtime activation surfaces.

- [ ] **Step 7: Run RED**

Run:

```bash
cd mesh && node --test test/cognitive-capability-observation.test.mjs
```

Expected: **FAIL** with `ERR_MODULE_NOT_FOUND` for `../src/lib/cognitive-capability-observation.mjs`, while unrelated existing tests are not part of this focused RED step.

- [ ] **Step 8: Commit the witnessed RED test only**

```bash
git add mesh/test/cognitive-capability-observation.test.mjs
git commit -m "test: define current-main capability observation v0 contract"
```

---

### Task 2: Implement the minimal semantic validator, digest, and resolver

**Files:**
- Create: `mesh/src/lib/cognitive-capability-observation.mjs`
- Test: `mesh/test/cognitive-capability-observation.test.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError` from `./canonical.mjs`.
- Consumes: `validateCognitiveCapabilityProfile`, `cognitiveCapabilityProfileDigest` from `./cognitive-capability-profile.mjs`.
- Produces the four public exports pinned by Task 1.

- [ ] **Step 1: Add only the permitted imports and schema constant**

```js
import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveCapabilityProfileDigest,
  validateCognitiveCapabilityProfile
} from './cognitive-capability-profile.mjs';

export const COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA =
  'axiom-cognitive-capability-observation.v0';
```

- [ ] **Step 2: Implement strict exact-object validation**

Implement helpers for plain-object checks, exact required fields, bounded AXIOM identifiers, lowercase SHA-256 digests, bounded unit identifiers, enum membership, unique identifier arrays, canonical ISO timestamps, finite confidence, non-negative safe integers, and recursive output freezing.

Top-level required fields are exactly:

```text
schema version status observation_id profile_id profile_digest capability
context evaluation result evaluator evidence resource_observations
observed_at valid_until recorded_at
contains_secret_material authority_effect network_effect training_effect
spend_effect runtime_activation selection_effect
```

- [ ] **Step 3: Implement the nested vocabularies exactly**

Use these exact sets:

```js
const CAPABILITIES = new Set([
  'reasoning','coding','vision','computer-use','research','planning','critique',
  'summarization','embedding','tool-use','agent-orchestration','other'
]);
const DIFFICULTIES = new Set([
  'trivial','routine','challenging','expert','adversarial','unknown'
]);
const CLASSIFICATIONS = new Set(['pass','degraded','fail','indeterminate']);
const EVALUATOR_KINDS = new Set([
  'local-agent','local-service','remote-service','human-reviewer','provider',
  'external-verifier','synthetic-harness'
]);
const EVIDENCE_KINDS = new Set([
  'evaluation-run','signed-evaluation-run','human-review','external-observation',
  'provider-report','synthetic-probe-result','other'
]);
const ASSURANCE_CLASSES = new Set([
  'declared','signed','verified-local','corroborated'
]);
const RESOURCE_CLASSES = new Set([
  'input-tokens','output-tokens','compute-time','wall-time','energy','memory',
  'storage','network-transfer','currency','other'
]);
const RESOURCE_BASES = new Set(['observed','estimated','unknown']);
```

- [ ] **Step 4: Implement evidence and resource cross-field rules**

Enforce paired verification reference/digest semantics; `declared` must have neither; stronger assurance must have both; `signed-evaluation-run` cannot be merely declared. Enforce `0-32` bounded resource observations and the exact null/non-null amount+unit rules by basis.

- [ ] **Step 5: Implement temporal and hard-boundary rules**

Parse only supplied timestamps. Do not call `Date.now()` or `new Date()` without the supplied timestamp. Reject `valid_until < observed_at` and `recorded_at < observed_at`. Require every hard-boundary constant exactly.

- [ ] **Step 6: Implement the public API**

`validateCognitiveCapabilityObservation(document)` returns a frozen descriptive summary including the canonical `observation_digest` and zero-effect constants.

`cognitiveCapabilityObservationDigest(document)` validates first and returns `digestObject(document)`.

`resolveCognitiveCapabilityObservation(document, profile)` must:

```text
validate the observation
validate the supplied current-main profile
recompute the profile digest
require exact profile_id equality
require exact profile_digest equality
require capability membership in profile.capabilities
return a deeply frozen evidence summary
```

It must not contact or execute the offering.

- [ ] **Step 7: Run GREEN**

```bash
cd mesh && node --test test/cognitive-capability-observation.test.mjs
```

Expected: all Capability Observation behavioral/resolver tests **PASS**, zero failures.

- [ ] **Step 8: Commit production implementation**

```bash
git add mesh/src/lib/cognitive-capability-observation.mjs
git commit -m "feat: reconstruct capability observation v0 on current main"
```

---

### Task 3: Add the JSON Schema 2020-12 mirror with witnessed RED → GREEN

**Files:**
- Create: `mesh/test/cognitive-capability-observation-schema.test.mjs`
- Create: `mesh/config/cognitive-capability-observation-v0.schema.json`

**Interfaces:**
- Schema mirrors the semantic contract but does not pretend JSON Schema can express profile-resolution or temporal cross-artifact truth.
- `x-axiom-semantic-validator` must point to `mesh/src/lib/cognitive-capability-observation.mjs`.

- [ ] **Step 1: Write schema-parity RED test**

Require at minimum:

```js
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.properties.schema.const, 'axiom-cognitive-capability-observation.v0');
assert.equal(schema.properties.version.const, 0);
assert.equal(schema.properties.status.const, 'inert-evidence');
assert.equal(schema.properties.contains_secret_material.const, false);
assert.equal(schema.properties.authority_effect.const, 'none');
assert.equal(schema.properties.network_effect.const, 'none');
assert.equal(schema.properties.training_effect.const, 'none');
assert.equal(schema.properties.spend_effect.const, 'none');
assert.equal(schema.properties.runtime_activation.const, false);
assert.equal(schema.properties.selection_effect.const, 'evidence-only');
assert.equal(
  schema['x-axiom-semantic-validator'],
  'mesh/src/lib/cognitive-capability-observation.mjs'
);
```

Also assert `additionalProperties:false` at every object boundary; exact enum domains; confidence min/max; `failure_mode_refs.maxItems === 32`; `resource_observations.maxItems === 32`; and annotations covering profile binding, declared-capability membership, evidence pairing, timestamp ordering, unit-preserving resources, and zero routing/execution authority.

- [ ] **Step 2: Run schema RED**

```bash
cd mesh && node --test test/cognitive-capability-observation-schema.test.mjs
```

Expected: **FAIL** with `ENOENT` for `config/cognitive-capability-observation-v0.schema.json`.

- [ ] **Step 3: Commit schema RED test**

```bash
git add mesh/test/cognitive-capability-observation-schema.test.mjs
git commit -m "test: define capability observation schema mirror"
```

- [ ] **Step 4: Add strict schema mirror**

Create `mesh/config/cognitive-capability-observation-v0.schema.json` using JSON Schema 2020-12, shared `$defs` for identifiers/digests/units and exact nested shapes. Add `x-axiom-semantic-rules` for semantics not safely represented by schema alone, including exact profile resolution and chronology, and `x-axiom-non-claims` for universal rank, availability, routing, execution, training, spend, capability promotion, and topology mutation.

- [ ] **Step 5: Run semantic + schema GREEN**

```bash
cd mesh && node --test \
  test/cognitive-capability-observation.test.mjs \
  test/cognitive-capability-observation-schema.test.mjs
```

Expected: all tests **PASS**, zero failures.

- [ ] **Step 6: Commit schema implementation**

```bash
git add mesh/config/cognitive-capability-observation-v0.schema.json
git commit -m "feat: add capability observation v0 schema"
```

---

### Task 4: Register the current plan and observation contract in the documentation boundary

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Existing spec: `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`
- Existing plan: `docs/superpowers/plans/2026-09-06-evidence-aware-routing-capability-observation-v0.md`

**Interfaces:**
- Keeps the approved routing spec and this first-slice plan inside the existing canonical-document integrity check.
- Makes no product/capability claim.

- [ ] **Step 1: Register exactly the plan path if not already registered**

Add:

```text
docs/superpowers/plans/2026-09-06-evidence-aware-routing-capability-observation-v0.md
```

Do not add a duplicate observation design document: the normative spec remains `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`.

- [ ] **Step 2: Add focused required-content assertions only if repository policy requires them**

If the current `check-docs.mjs` pattern requires a `REQUIRED_CONTENT` entry for every new canonical plan, require these exact strings:

```text
axiom-cognitive-capability-observation.v0
Historical PR #1393
contains_secret_material=false
authority_effect='none'
selection_effect='evidence-only'
mesh/config/capabilities.json
```

Do not weaken or special-case the canonical-doc validator to admit the file.

- [ ] **Step 3: Run documentation checks through the supported repository command**

```bash
cd mesh && npm run check
```

Expected: canonical documentation checks and all repository tests pass, or any unrelated current-main failure is recorded without weakening this slice.

- [ ] **Step 4: Commit documentation registration**

```bash
git add mesh/src/check-docs.mjs
git commit -m "chore: register capability observation routing plan"
```

---

### Task 5: Exact-head scope audit and protected verification

**Files:**
- No new source files expected.
- Review all files changed from the implementation base.

**Interfaces:**
- Produces verification evidence for the exact implementation head.
- Does not promote `ai.providers` or any capability registry entry.

- [ ] **Step 1: Audit the final diff**

Expected implementation-related paths are only:

```text
docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md
docs/superpowers/plans/2026-09-06-evidence-aware-routing-capability-observation-v0.md
mesh/src/lib/cognitive-capability-observation.mjs
mesh/config/cognitive-capability-observation-v0.schema.json
mesh/test/cognitive-capability-observation.test.mjs
mesh/test/cognitive-capability-observation-schema.test.mjs
mesh/src/check-docs.mjs
```

Confirm no changes to:

```text
mesh/config/capabilities.json
Gateway / Hypervisor / Sandbox / Grid effect paths
provider transports or credentials
cognitive-capability-profile semantics
cognitive-selection-proposal v0 semantics
AI-001 provider invocation semantics
runtime activation
training/adaptation execution
spend authorization
Cognitive Topology
```

- [ ] **Step 2: Run the focused suite one final time**

```bash
cd mesh && node --test \
  test/cognitive-capability-observation.test.mjs \
  test/cognitive-capability-observation-schema.test.mjs
```

Expected: **PASS**, zero failures.

- [ ] **Step 3: Run the repository verification gate**

```bash
cd mesh && npm run check
```

Expected: **PASS** under the repository-supported Node engine. Do not convert unrelated failures into success claims.

- [ ] **Step 4: Push exact head and use the existing draft PR as the protected-CI surface**

The existing branch/PR for the approved design is the landing surface unless current-main movement makes a fresh reconstruction branch necessary. Preserve draft status until protected checks are green on the exact head.

- [ ] **Step 5: Verify protected checks on the exact head**

Require the repository's current protected contexts, including at least:

```text
verify
container
Analyze (actions)
Analyze (javascript-typescript)
```

Also record Windows/macOS compatibility and CodeQL results when those workflows are instantiated for the PR. Do not claim a check that did not run.

- [ ] **Step 6: Record completion truthfully in the PR body**

State exact RED heads, GREEN head, tests/checks actually observed, hard authority boundaries, and explicit non-claims. Keep the PR draft if any required current repository gate is missing or red.

## Self-Review Result

- **Spec coverage:** This plan implements only Capability Observation v0, exactly matching Implementation Sequence step 1. Capability Surface, evidence-aware Selection v1, provider-selection binding, authorization reconstruction, AXIOM One UX, and provider promotion remain separate later plans.
- **Placeholder scan:** No `TBD`, `TODO`, undefined implementation placeholder, or “similar to” dependency remains.
- **Type consistency:** `COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA`, `validateCognitiveCapabilityObservation`, `cognitiveCapabilityObservationDigest`, and `resolveCognitiveCapabilityObservation` are named consistently throughout.
- **Current-main dependency discipline:** The implementation consumes only current-main `canonical.mjs` and `cognitive-capability-profile.mjs`; historical #1393 code is not treated as executable truth.
- **Authority consistency:** Every produced artifact remains evidence-only and incapable of model invocation, routing authorization, execution authorization, training, spend, runtime activation, Grid mutation, or capability promotion.
- **Routing relevance:** The slice records exact task/context/evaluation evidence so later `Best` routing can reject missing/stale/wrong-cell evidence without hard-coding vendor winners.

# Self Bundle Index v0 and Continuity Report v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement inert, content-addressed Self Bundle Index v0 validation and a pure Continuity Report v0 that distinguishes principal, lineage, composition, Pack, semantic-state, and evidence continuity without granting authority or claiming subjective identity.

**Architecture:** Add one strict schema/validator for the Self Bundle and one pure report builder that consumes validated predecessor/successor bundles plus explicit observations. Reuse the repository's canonical digest helper and the existing fail-closed validation style; do not add persistence, Gateway routes, Grid writes, runtime activation, model execution, credential handling, or capability promotion.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, JSON Schema 2020-12, existing `mesh/src/lib/canonical.mjs` digest/validation primitives.

**Spec:** `docs/superpowers/specs/2026-08-29-self-bundle-continuity-v0-design.md`

## Global Constraints

- Schema identifiers are exactly `axiom-self-bundle-index.v0` and `axiom-continuity-report.v0`.
- Version is exactly `0`; status is exactly `inert-contract-laboratory`.
- The AXIOM principal is the stable identity root; Self Bundle lineage cannot grant authority.
- Self Bundle contains no raw memories, vault content, credentials, secrets, model weights, capability tokens, access leases, or executable runtime code.
- `contains_secret_material` is exactly `false`.
- `authority_effect` and `network_effect` are exactly `none`.
- `runtime_activation` is exactly `false`.
- Semantic-state list is bounded at 256 entries with unique `claim_id` values.
- Observations are bounded and duplicate refs fail closed.
- Omitted observations are `unassessed`, never inferred present or absent.
- No file/network/vault/runtime/model/credential side effects.
- No capability registry state changes.
- No subjective identity, consciousness, cross-model equivalence, or production-promotion claim.

---

### Task 1: Self Bundle Index validator and digest

**Files:**
- Create: `mesh/test/self-bundle-index.test.mjs`
- Create: `mesh/src/lib/self-bundle-index.mjs`

**Interfaces:**
- Produces: `SELF_BUNDLE_INDEX_SCHEMA`, `validateSelfBundleIndex(document)`, `selfBundleIndexDigest(document)`.
- `validateSelfBundleIndex` returns a frozen summary containing `valid`, `schema`, `bundle_id`, `principal_id`, `bundle_digest`, `authority_effect`, `network_effect`, and `runtime_activation`.
- `selfBundleIndexDigest` returns the canonical SHA-256 digest for a valid document.

- [ ] **Step 1: Write the failing validator tests**

Create `mesh/test/self-bundle-index.test.mjs` with fixtures and tests that require:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SELF_BUNDLE_INDEX_SCHEMA,
  selfBundleIndexDigest,
  validateSelfBundleIndex
} from '../src/lib/self-bundle-index.mjs';

const DIGEST = 'a'.repeat(64);

function validBundle() {
  return {
    schema: 'axiom-self-bundle-index.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    bundle_id: 'self.personal.v1',
    principal_id: 'agent.personal.primary',
    created_at: '2026-08-29T12:00:00.000Z',
    predecessor_bundle: null,
    agent_composition: { ref: 'composition.personal.primary', digest: DIGEST },
    personal_agent_pack: { ref: 'pack.personal.v2', digest: DIGEST },
    semantic_state: [{
      claim_id: 'claim.worldview.001',
      ref: 'semantic.claim.worldview.001',
      digest: DIGEST,
      required_for_continuity: true
    }],
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}
```

Tests must prove:

1. a valid root bundle validates and returns a deterministic digest;
2. a valid successor accepts exact predecessor `{ref,digest}`;
3. digest is deterministic across object-key order;
4. unknown fields and credential-like fields fail closed;
5. duplicate `claim_id`, invalid digests, and more than 256 semantic-state entries fail closed;
6. noncanonical timestamps fail closed;
7. activation/secret boundary mutations fail closed;
8. validation does not mutate a deeply frozen document;
9. the production module imports only `./canonical.mjs`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd mesh && node --test test/self-bundle-index.test.mjs
```

Expected: FAIL because `../src/lib/self-bundle-index.mjs` does not exist.

- [ ] **Step 3: Implement the minimal strict validator**

Create `mesh/src/lib/self-bundle-index.mjs` following the exact-object, bounded-array, identifier, digest, and canonical-timestamp patterns in `agent-composition.mjs`.

Required public API:

```js
export const SELF_BUNDLE_INDEX_SCHEMA = 'axiom-self-bundle-index.v0';
export function validateSelfBundleIndex(document) { /* strict validation */ }
export function selfBundleIndexDigest(document) { /* validate then digestObject */ }
```

Validation requirements are the spec/global constraints above. `predecessor_bundle` is either `null` or exact `{ref,digest}`. The validator is pure and returns no authority.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
cd mesh && node --test test/self-bundle-index.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add mesh/test/self-bundle-index.test.mjs mesh/src/lib/self-bundle-index.mjs
git commit -m "feat: add self bundle index validator"
```

---

### Task 2: Self Bundle JSON Schema parity

**Files:**
- Create: `mesh/test/self-bundle-index-schema.test.mjs`
- Create: `mesh/config/self-bundle-index-v0.schema.json`

**Interfaces:**
- Produces a JSON Schema mirror for the semantic validator.
- The schema must carry `x-axiom-semantic-validator: "mesh/src/lib/self-bundle-index.mjs"`.

- [ ] **Step 1: Write the failing schema-parity test**

Create `mesh/test/self-bundle-index-schema.test.mjs` that reads `mesh/config/self-bundle-index-v0.schema.json` and asserts:

```js
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.properties.schema.const, 'axiom-self-bundle-index.v0');
assert.equal(schema.properties.version.const, 0);
assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
assert.equal(schema.properties.contains_secret_material.const, false);
assert.equal(schema.properties.authority_effect.const, 'none');
assert.equal(schema.properties.network_effect.const, 'none');
assert.equal(schema.properties.runtime_activation.const, false);
assert.equal(schema.properties.semantic_state.maxItems, 256);
assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/self-bundle-index.mjs');
```

Also assert `additionalProperties:false` at the top level and inside predecessor/reference/semantic-state objects, and assert the non-claims include subjective identity, authority grant, secret storage, and runtime activation.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd mesh && node --test test/self-bundle-index-schema.test.mjs
```

Expected: FAIL because the schema file does not exist.

- [ ] **Step 3: Add the minimal JSON Schema**

Create `mesh/config/self-bundle-index-v0.schema.json` mirroring the validator exactly, using the identifier and digest patterns already used by `agent-composition-v0.schema.json`.

- [ ] **Step 4: Run schema and validator tests**

Run:

```bash
cd mesh && node --test test/self-bundle-index-schema.test.mjs test/self-bundle-index.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add mesh/test/self-bundle-index-schema.test.mjs mesh/config/self-bundle-index-v0.schema.json
git commit -m "feat: add self bundle index schema"
```

---

### Task 3: Continuity Report v0 pure comparison

**Files:**
- Create: `mesh/test/continuity-report.test.mjs`
- Create: `mesh/src/lib/continuity-report.mjs`

**Interfaces:**
- Consumes: `validateSelfBundleIndex(document)` and `selfBundleIndexDigest(document)` from Task 1.
- Produces: `CONTINUITY_REPORT_SCHEMA` and `buildContinuityReport(predecessor, successor, observations)`.
- `observations` is an array of exact `{ref,available,observed_digest?}` objects.
- Returns a deeply frozen deterministic report with `report_digest`.

- [ ] **Step 1: Write the failing continuity tests**

Create `mesh/test/continuity-report.test.mjs` with a root fixture and successor helper. Tests must independently prove:

1. exact principal + exact predecessor lineage + unchanged composition/Pack + matching observations + unchanged semantic state => `full`;
2. principal mismatch => `blocked` with `principal-mismatch` blocker;
3. predecessor ref mismatch => `blocked`;
4. predecessor digest mismatch => `blocked`;
5. changed composition with otherwise valid evidence => `degraded`, never identity-blocked;
6. changed Pack with a matching successor observation => `degraded` and portable-state `changed`;
7. required Pack explicitly unavailable => `blocked`;
8. Pack digest mismatch => `blocked`;
9. omitted Pack observation => `degraded` / `unassessed`;
10. required semantic state unavailable or digest-mismatched => `blocked`;
11. optional semantic state unavailable/digest-mismatched => `degraded`;
12. added, removed, or changed semantic claim => `degraded`;
13. duplicate observations fail closed;
14. unavailable observation carrying `observed_digest` fails closed;
15. input objects are not mutated and output is deeply frozen;
16. `report_digest` is deterministic across observation ordering;
17. authority boundary is all false/none and explicitly denies subjective identity proof;
18. production module imports only `./canonical.mjs` and `./self-bundle-index.mjs`.

A representative expected authority boundary is:

```js
{
  writes_files: false,
  performs_network_effects: false,
  opens_or_decrypts_vaults: false,
  activates_runtimes: false,
  loads_models: false,
  issues_or_refreshes_credentials: false,
  substitutes_missing_artifacts: false,
  grants_vault_access: false,
  grants_execution_authority: false,
  proves_subjective_identity: false
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd mesh && node --test test/continuity-report.test.mjs
```

Expected: FAIL because `../src/lib/continuity-report.mjs` does not exist.

- [ ] **Step 3: Implement the minimal report builder**

Create `mesh/src/lib/continuity-report.mjs`.

Required API:

```js
export const CONTINUITY_REPORT_SCHEMA = 'axiom-continuity-report.v0';
export function buildContinuityReport(predecessor, successor, observations) { /* pure */ }
```

Implementation rules:

- validate both bundles before comparison;
- canonical-digest both bundles;
- normalize observations into a map only after strict validation;
- sort blockers/warnings and structured claim-change lists before hashing;
- mark omitted observations `unassessed`;
- hard-block only the conditions defined by the spec;
- degrade on nonblocking changes/unassessed evidence;
- compute `report_digest = digestObject(unsignedReport)`;
- deep-freeze the final report;
- do not invoke Pack restore or perform I/O.

- [ ] **Step 4: Run focused continuity tests and verify GREEN**

Run:

```bash
cd mesh && node --test test/continuity-report.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Run all slice tests**

Run:

```bash
cd mesh && node --test test/self-bundle-index.test.mjs test/self-bundle-index-schema.test.mjs test/continuity-report.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add mesh/test/continuity-report.test.mjs mesh/src/lib/continuity-report.mjs
git commit -m "feat: add continuity report v0"
```

---

### Task 4: Documentation guard integration and full verification

**Files:**
- Modify only if required by existing repository checks: `mesh/src/check-docs.mjs`
- No capability registry files may be changed.

**Interfaces:**
- Ensures new normative spec/schema paths are visible to any existing documentation integrity checks without changing capability state.

- [ ] **Step 1: Run the repository's full current verification command**

Run the same clean-kernel verification used by CI from the `mesh` package/repository workflow. If the command reports documentation-path drift caused specifically by the new normative files, add only the minimal documentation-check registration needed.

- [ ] **Step 2: If a docs guard change is required, write its failing test/verification first**

Re-run the exact failing docs check and record the expected failure before changing `check-docs.mjs`.

- [ ] **Step 3: Make the minimal docs guard update if and only if required**

Do not change runtime behavior, capability states, README claims, product definitions, or production-promotion language.

- [ ] **Step 4: Run focused and full verification fresh**

Run:

```bash
cd mesh && node --test test/self-bundle-index.test.mjs test/self-bundle-index-schema.test.mjs test/continuity-report.test.mjs
```

Then run the repository's complete current verification command used by CI.

Expected: zero failures.

- [ ] **Step 5: Review the branch diff against `main`**

Expected intended files only:

```text
docs/superpowers/specs/2026-08-29-self-bundle-continuity-v0-design.md
docs/superpowers/plans/2026-08-29-self-bundle-continuity-v0.md
mesh/config/self-bundle-index-v0.schema.json
mesh/src/lib/self-bundle-index.mjs
mesh/src/lib/continuity-report.mjs
mesh/test/self-bundle-index.test.mjs
mesh/test/self-bundle-index-schema.test.mjs
mesh/test/continuity-report.test.mjs
```

`mesh/src/check-docs.mjs` may appear only if Step 1 proves registration is required. No binary, generated artifact, lockfile, capability registry, runtime route, or credential file should change.

- [ ] **Step 6: Commit any required documentation-guard adjustment**

```bash
git add mesh/src/check-docs.mjs
git commit -m "chore: register self bundle continuity docs"
```

Skip this commit if no adjustment was required.

- [ ] **Step 7: Complete the branch through the finishing-a-development-branch workflow**

Create a pull request from `design/self-bundle-continuity-v0-20260829` to `main`, require the normal protected-branch checks, and do not merge until all required checks are green on the exact head SHA.

## Self-review

**Spec coverage:** Tasks 1-3 cover the full approved v0 contract, lineage semantics, observation semantics, continuity dimensions, aggregate status, authority boundary, determinism, and non-claims. Task 4 covers repository integration without capability promotion.

**Placeholder scan:** No TBD/TODO/"similar to" placeholders are present. Each production task has a concrete RED command, minimal implementation contract, GREEN command, and commit boundary.

**Type consistency:** The plan consistently uses `predecessor_bundle`, `agent_composition`, `personal_agent_pack`, `semantic_state`, `{ref,digest}`, observation `{ref,available,observed_digest?}`, `buildContinuityReport`, `selfBundleIndexDigest`, and the v0 schema constants throughout.

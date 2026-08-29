# Agent Composition Contract v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a deterministic, zero-authority Agent Composition Contract v0 that can describe replaceable agent runtimes, models, memories, skills, and policy references without granting authority or accepting credential material.

**Architecture:** Add one inert JSON Schema plus one pure semantic validator built on the existing `canonical.mjs` validation/digest primitives. The contract is descriptive only: it binds an existing AXIOM principal reference to a composition and derived digest, while all runtime/model/memory/skill declarations remain non-authoritative. No Gateway route, policy grant, credential broker, network call, runtime activation, capability promotion, or external effect is added in this slice.

**Tech Stack:** Node.js ESM, built-in `node:test`/`node:assert`, JSON Schema Draft 2020-12 as a machine-readable contract, existing `mesh/src/lib/canonical.mjs` helpers, zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-sovereign-agent-composition-continuity-design.md`

## Global Constraints

- Axiom remains a sovereign substrate rather than a prescribed agent stack.
- `wrapped`, `integrated`, and `native` integration modes are all legitimate and none receives hidden authority.
- The model, scaffold, memory provider, and skill source are descriptive components, not authority roots.
- Cognitive delegation does not imply authority delegation.
- Authority delegation does not imply credential delegation.
- Credential values, TOTP seeds, cookies, refresh tokens, passkey private keys, and other secret-bearing fields are not representable by the v0 contract.
- Validation is pure and local: no network, filesystem mutation, credential, runtime activation, or external effect.
- Unknown fields fail closed for the exact v0 profile.
- Canonicalization/digest behavior reuses `mesh/src/lib/canonical.mjs`.
- No new runtime capability is promoted by this plan; `mesh/config/capabilities.json` and capability evidence bindings remain unchanged.
- Node support remains `>=22.23.2 <23 || >=24.14.0 <25`.

---

## File Structure

- Create `mesh/config/agent-composition-v0.schema.json`: machine-readable exact v0 structure and non-authority constants.
- Create `mesh/src/lib/agent-composition.mjs`: pure semantic validator and deterministic digest function.
- Create `mesh/test/agent-composition-schema.test.mjs`: schema-level regression tests for the inert boundary.
- Create `mesh/test/agent-composition.test.mjs`: semantic validation, negative fixtures, determinism, and non-mutation tests.
- Modify no Gateway, Hypervisor, Sandbox, Grid, policy, principal, credential, or capability registry files in this slice.

### Contract shape

The semantic validator accepts exactly this top-level shape:

```js
{
  schema: 'axiom-agent-composition.v0',
  version: 0,
  status: 'inert-contract-laboratory',
  composition_id: 'composition.personal.primary',
  principal_id: 'agent.personal.primary',
  integration_mode: 'wrapped' | 'integrated' | 'native',
  self_bundle: {
    ref: 'self.personal.v1',
    digest: '<64 lowercase hex characters>'
  },
  runtimes: [{
    runtime_id: 'runtime.hermes',
    adapter_id: 'adapter.hermes.v1',
    profile_ref: 'profile.runtime.hermes.v1',
    required: true
  }],
  models: [{
    model_id: 'model.reasoner.primary',
    provider_id: 'provider.example',
    profile_ref: 'profile.model.reasoner.v1',
    roles: ['reasoning']
  }],
  memories: [{
    memory_id: 'memory.primary',
    provider_id: 'memory.example',
    profile_ref: 'profile.memory.primary.v1',
    classes: ['semantic', 'episodic']
  }],
  skill_sources: [{
    source_id: 'skills.local',
    kind: 'native' | 'imported' | 'mcp' | 'custom',
    artifact_ref: 'artifact.skills.local.v1',
    profile_ref: 'profile.skills.local.v1'
  }],
  cognitive_workers: {
    policy_ref: 'policy.cognitive-workers.v1' | null,
    authority_effect: 'none',
    delegation_enabled: false
  },
  continuity_policy_ref: 'policy.continuity.v1' | null,
  credential_broker_policy_ref: 'policy.credentials.v1' | null,
  assurance_policy_ref: 'policy.assurance.v1' | null,
  portability: {
    enabled: true,
    export_profile_ref: 'profile.export.agent-self.v1' | null
  },
  created_at: '2026-08-29T00:00:00.000Z',
  updated_at: '2026-08-29T00:00:00.000Z',
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

Identifiers/references use `/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/`; digests use `/^[a-f0-9]{64}$/`. Arrays are bounded at 32 items, model roles at 16 items, and all array-local IDs are unique. `updated_at` cannot precede `created_at`.

The validator returns a frozen summary rather than rewriting the document:

```js
{
  valid: true,
  schema: 'axiom-agent-composition.v0',
  composition_id: '<input composition_id>',
  principal_id: '<input principal_id>',
  integration_mode: '<input integration_mode>',
  composition_digest: '<sha256 of canonical full input document>',
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

---

### Task 1: Machine-readable inert contract

**Files:**
- Create: `mesh/config/agent-composition-v0.schema.json`
- Test: `mesh/test/agent-composition-schema.test.mjs`

**Interfaces:**
- Consumes: none beyond JSON parsing.
- Produces: JSON Schema constants and field boundaries consumed by reviewers/tools; declares `mesh/src/lib/agent-composition.mjs` as the semantic validator.

- [ ] **Step 1: Write the failing schema regression test**

Create `mesh/test/agent-composition-schema.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/agent-composition-v0.schema.json', import.meta.url);

test('Agent Composition v0 schema preserves the inert non-authority boundary', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-agent-composition.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
  assert.deepEqual(schema.properties.integration_mode.enum, ['wrapped', 'integrated', 'native']);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.cognitive_workers.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.cognitive_workers.properties.delegation_enabled.const, false);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/agent-composition.mjs');
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'runtime-activation',
    'authority-grant',
    'machine-delegation',
    'credential-storage',
    'credential-brokering',
    'model-continuity-proof',
    'autonomous-self-modification'
  ]);
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `node --test mesh/test/agent-composition-schema.test.mjs`

Expected: FAIL because `mesh/config/agent-composition-v0.schema.json` does not exist.

- [ ] **Step 3: Add the exact JSON Schema**

Create `mesh/config/agent-composition-v0.schema.json` using Draft 2020-12. Require every top-level field shown in the Contract shape, set `additionalProperties: false` on every object, use the identifier/digest patterns from this plan, bound component arrays to 32 items and role/class arrays to 16 items, require unique string values where applicable, and set these exact annotations:

```json
{
  "x-axiom-semantic-validator": "mesh/src/lib/agent-composition.mjs",
  "x-axiom-non-claims": [
    "runtime-activation",
    "authority-grant",
    "machine-delegation",
    "credential-storage",
    "credential-brokering",
    "model-continuity-proof",
    "autonomous-self-modification"
  ]
}
```

The schema must not include generic configuration bags, arbitrary URLs, environment maps, headers, cookies, tokens, passwords, inline prompts, or inline executable code. Those surfaces belong in separately governed artifacts later.

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `node --test mesh/test/agent-composition-schema.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the schema slice**

```bash
git add mesh/config/agent-composition-v0.schema.json mesh/test/agent-composition-schema.test.mjs
git commit -m "test: specify inert agent composition contract"
```

---

### Task 2: Pure semantic validator and deterministic digest

**Files:**
- Create: `mesh/src/lib/agent-composition.mjs`
- Test: `mesh/test/agent-composition.test.mjs`

**Interfaces:**
- Consumes: `digestObject` and `ValidationError` from `mesh/src/lib/canonical.mjs`.
- Produces:
  - `AGENT_COMPOSITION_SCHEMA = 'axiom-agent-composition.v0'`
  - `validateAgentComposition(document) -> frozen validation summary`
  - `agentCompositionDigest(document) -> 64-character lowercase SHA-256 hex digest`

- [ ] **Step 1: Write the failing semantic tests**

Create `mesh/test/agent-composition.test.mjs` with a `validComposition()` fixture matching the Contract shape and the following tests:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AGENT_COMPOSITION_SCHEMA,
  agentCompositionDigest,
  validateAgentComposition
} from '../src/lib/agent-composition.mjs';

const DIGEST = 'a'.repeat(64);

function validComposition() {
  return {
    schema: 'axiom-agent-composition.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    composition_id: 'composition.personal.primary',
    principal_id: 'agent.personal.primary',
    integration_mode: 'integrated',
    self_bundle: { ref: 'self.personal.v1', digest: DIGEST },
    runtimes: [{
      runtime_id: 'runtime.hermes',
      adapter_id: 'adapter.hermes.v1',
      profile_ref: 'profile.runtime.hermes.v1',
      required: true
    }],
    models: [{
      model_id: 'model.reasoner.primary',
      provider_id: 'provider.example',
      profile_ref: 'profile.model.reasoner.v1',
      roles: ['reasoning']
    }],
    memories: [{
      memory_id: 'memory.primary',
      provider_id: 'memory.example',
      profile_ref: 'profile.memory.primary.v1',
      classes: ['semantic', 'episodic']
    }],
    skill_sources: [{
      source_id: 'skills.local',
      kind: 'native',
      artifact_ref: 'artifact.skills.local.v1',
      profile_ref: 'profile.skills.local.v1'
    }],
    cognitive_workers: {
      policy_ref: 'policy.cognitive-workers.v1',
      authority_effect: 'none',
      delegation_enabled: false
    },
    continuity_policy_ref: 'policy.continuity.v1',
    credential_broker_policy_ref: 'policy.credentials.v1',
    assurance_policy_ref: 'policy.assurance.v1',
    portability: {
      enabled: true,
      export_profile_ref: 'profile.export.agent-self.v1'
    },
    created_at: '2026-08-29T12:00:00.000Z',
    updated_at: '2026-08-29T12:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

test('validates a zero-authority integrated composition', () => {
  const document = validComposition();
  const result = validateAgentComposition(document);
  assert.equal(AGENT_COMPOSITION_SCHEMA, document.schema);
  assert.equal(result.valid, true);
  assert.equal(result.composition_id, document.composition_id);
  assert.equal(result.principal_id, document.principal_id);
  assert.equal(result.integration_mode, 'integrated');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.composition_digest, agentCompositionDigest(document));
  assert.match(result.composition_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(result), true);
});

test('digest is deterministic across object key order', () => {
  const first = validComposition();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(agentCompositionDigest(first), agentCompositionDigest(second));
});

test('native mode receives no implicit authority', () => {
  const document = validComposition();
  document.integration_mode = 'native';
  const result = validateAgentComposition(document);
  assert.equal(result.integration_mode, 'native');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('cognitive worker declarations cannot enable delegation', () => {
  const document = validComposition();
  document.cognitive_workers.delegation_enabled = true;
  assert.throws(() => validateAgentComposition(document), /cognitive worker/i);
});

test('unknown and credential-bearing fields fail closed', () => {
  const topLevel = validComposition();
  topLevel.password = 'not-allowed';
  assert.throws(() => validateAgentComposition(topLevel), /unknown field/i);

  const runtime = validComposition();
  runtime.runtimes[0].api_key = 'not-allowed';
  assert.throws(() => validateAgentComposition(runtime), /unknown field/i);

  const model = validComposition();
  model.models[0].refresh_token = 'not-allowed';
  assert.throws(() => validateAgentComposition(model), /unknown field/i);
});

test('duplicate component ids and oversized lists fail closed', () => {
  const duplicate = validComposition();
  duplicate.runtimes.push({ ...duplicate.runtimes[0] });
  assert.throws(() => validateAgentComposition(duplicate), /duplicate runtime_id/i);

  const oversized = validComposition();
  oversized.models = Array.from({ length: 33 }, (_, index) => ({
    model_id: `model.${index}`,
    provider_id: 'provider.example',
    profile_ref: `profile.model.${index}`,
    roles: ['reasoning']
  }));
  assert.throws(() => validateAgentComposition(oversized), /at most 32/i);
});

test('updated_at cannot precede created_at', () => {
  const document = validComposition();
  document.updated_at = '2026-08-29T11:59:59.000Z';
  assert.throws(() => validateAgentComposition(document), /updated_at/i);
});

test('validation does not mutate a deeply frozen document', () => {
  const document = validComposition();
  const deepFreeze = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  };
  deepFreeze(document);
  assert.doesNotThrow(() => validateAgentComposition(document));
});

test('validator module imports only the local canonical helper', async () => {
  const sourceUrl = new URL('../src/lib/agent-composition.mjs', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const importPattern = new RegExp("from\\s+['\\\"]([^'\\\"]+)['\\\"]", 'g');
  const imports = [...source.matchAll(importPattern)].map(match => match[1]);
  assert.deepEqual(imports, ['./canonical.mjs']);
});
```

- [ ] **Step 2: Run the targeted semantic test and verify RED**

Run: `node --test mesh/test/agent-composition.test.mjs`

Expected: FAIL because `mesh/src/lib/agent-composition.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure validator**

Create `mesh/src/lib/agent-composition.mjs` with only this import:

```js
import { digestObject, ValidationError } from './canonical.mjs';
```

Export the constants/functions in the Interfaces block. Implement local helpers with these exact behavioral rules:

- `exactObject(value, label, allowedFields)` rejects non-plain objects, missing required fields at the call site, and every key outside `allowedFields` with an error containing `unknown field`.
- `id(value, label)` enforces `/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/`.
- `digest(value, label)` enforces `/^[a-f0-9]{64}$/`.
- `nullableId(value, label)` accepts `null` or `id(...)`.
- `date(value, label)` requires a string that round-trips through `new Date(value).toISOString() === value`.
- `uniqueArray(value, label, key, validator)` requires an array of at most 32 objects and rejects duplicate `key` values with an error containing `duplicate <key>`.
- `stringSet(value, label, allowed, maxItems = 16)` requires a non-empty array no longer than `maxItems`, unique members, and membership in `allowed`.
- Runtime descriptors allow exactly `runtime_id`, `adapter_id`, `profile_ref`, `required`.
- Model descriptors allow exactly `model_id`, `provider_id`, `profile_ref`, `roles`; allowed roles are `reasoning`, `coding`, `vision`, `computer-use`, `research`, `planning`, `critique`, `summarization`, `embedding`, `other`.
- Memory descriptors allow exactly `memory_id`, `provider_id`, `profile_ref`, `classes`; allowed classes are `semantic`, `episodic`, `procedural`, `working`.
- Skill-source descriptors allow exactly `source_id`, `kind`, `artifact_ref`, `profile_ref`; allowed kinds are `native`, `imported`, `mcp`, `custom`.
- Cognitive workers allow exactly `policy_ref`, `authority_effect`, `delegation_enabled`; require `authority_effect === 'none'` and `delegation_enabled === false`.
- Portability allows exactly `enabled`, `export_profile_ref`; `enabled` must be boolean and `export_profile_ref` must be a nullable ID.
- Require the exact schema/version/status constants from the Contract shape.
- Require `integration_mode` in `wrapped`, `integrated`, `native`.
- Require `authority_effect === 'none'`, `network_effect === 'none'`, and `runtime_activation === false` for every mode.
- Require `updated_at >= created_at`.
- Return `Object.freeze({...})` with the exact summary shape in this plan.
- `agentCompositionDigest(document)` must call `validateAgentCompositionShape(document)` or equivalent validation logic that does not recursively call `agentCompositionDigest`, then return `digestObject(document)`.

Do not import `fs`, `http`, `https`, `net`, `tls`, child processes, environment/config loaders, provider clients, credential stores, Gateway code, or runtime activation code.

- [ ] **Step 4: Run the targeted semantic tests and verify GREEN**

Run: `node --test mesh/test/agent-composition.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Run both contract test files together**

Run: `node --test mesh/test/agent-composition-schema.test.mjs mesh/test/agent-composition.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit the semantic slice**

```bash
git add mesh/src/lib/agent-composition.mjs mesh/test/agent-composition.test.mjs
git commit -m "feat: validate zero-authority agent compositions"
```

---

### Task 3: Repository verification and claim-drift check

**Files:**
- Verify: `mesh/config/capabilities.json`
- Verify: `mesh/config/capability-evidence-bindings.json`
- Verify: repository check/test surfaces

**Interfaces:**
- Consumes: completed schema, validator, and tests from Tasks 1-2.
- Produces: fresh evidence that the new inert contract does not require runtime/capability promotion and does not break the supported repository checks.

- [ ] **Step 1: Confirm capability registries are unchanged in the branch diff**

Run:

```bash
git diff --name-only main...HEAD -- mesh/config/capabilities.json mesh/config/capability-evidence-bindings.json
```

Expected: no output.

- [ ] **Step 2: Run the full kernel test suite**

Run: `npm --prefix mesh test`

Expected: exit 0, zero failed tests.

- [ ] **Step 3: Run the full supported check surface**

Run: `npm --prefix mesh run check`

Expected: exit 0. If documentation/status checkers require explicit indexing for the new spec/plan/contract, add only the minimal deterministic registration they demand, rerun the failing check, and keep capability status unchanged.

- [ ] **Step 4: Inspect the branch diff for authority creep**

Run:

```bash
git diff --stat main...HEAD
git diff main...HEAD -- mesh/src mesh/config mesh/test docs/superpowers
```

Verify manually that no Gateway route, policy allow rule, principal grant, credential store, runtime executor, network call, or capability promotion was added.

- [ ] **Step 5: Commit only if verification required a deterministic registration fix**

If Step 3 required no edits, do not create an empty commit. If it required a check/index registration, commit only those exact files with:

```bash
git add <exact-files-required-by-checker>
git commit -m "chore: register agent composition contract checks"
```

- [ ] **Step 6: Update the draft PR summary with verification evidence**

Record the exact targeted test count, full test-suite result, full check result, changed-file list, and explicit non-claims. Keep the PR draft until verification is green.

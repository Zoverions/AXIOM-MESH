# Persistent Entity Bundle v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a zero-authority, deterministic Persistent Entity Bundle v0 semantic contract that preserves portable personal-agent meaning without carrying credentials, server-bound identity, standing approvals, or execution authority.

**Architecture:** Add one pure validator/digest module beside the existing Agent Composition contract, plus a strict JSON Schema mirror and fail-closed Node tests. C0 is intentionally inert: no Gateway route, Grid mutation, capability-registry change, runtime activation, delegation activation, or import application is introduced.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, existing `mesh/src/lib/canonical.mjs`, JSON Schema Draft 2020-12.

**Spec:** `docs/superpowers/specs/2026-09-17-persistent-entity-bundle-v0-design.md`

## Global Constraints

- Base: current `main` at `b8a746eace641c1b97ca70163bb030f49ca033f3` when this plan was created.
- `mesh/config/capabilities.json` MUST remain unchanged.
- No Gateway/Hypervisor/Sandbox/Grid execution route in C0.
- No credentials, sessions, standing approvals, capabilities, delegation or source-server identifiers may be portable through the contract.
- Validation MUST be deterministic, fail closed on unknown fields and avoid mutation.
- Imported `skill_ref` records MUST require `disabled_by_default: true`.
- `relationship_projection` MUST require `third_party_private_data: false` in v0.
- Scope declarations and record kinds MUST agree exactly.
- All authority/network/runtime effects remain fixed at none/false.

---

### Task 1: Add RED semantic validator tests

**Files:**
- Create: `mesh/test/persistent-entity-bundle.test.mjs`

**Interfaces:**
- Consumes: existing `ValidationError` and canonical digest behavior through the future module.
- Produces: required public API `PERSISTENT_ENTITY_BUNDLE_SCHEMA`, `persistentEntityBundleDigest(document)`, and `validatePersistentEntityBundle(document)`.

- [ ] **Step 1: Write the failing semantic test file**

Create `mesh/test/persistent-entity-bundle.test.mjs` with a `validBundle()` fixture containing all eight v0 record kinds and tests for:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PERSISTENT_ENTITY_BUNDLE_SCHEMA,
  persistentEntityBundleDigest,
  validatePersistentEntityBundle
} from '../src/lib/persistent-entity-bundle.mjs';
```

Required test names:

```text
validates an inert persistent entity bundle
digest is deterministic across object key order
validation does not mutate a deeply frozen bundle
unknown top-level and record fields fail closed
unknown record kinds and invalid scopes fail closed
scope declarations must exactly match carried record kinds
singleton semantic groups cannot be duplicated
reference record identifiers cannot be duplicated
invalid digests and timestamps fail closed
portable skills must remain disabled by default
relationship projections cannot declare third-party private data
bundle cannot widen authority network runtime or credential boundaries
forbidden credential authority and implementation-lock-in field names fail recursively
bounded cardinality and text limits fail closed
validator module imports only the local canonical helper
```

Use concrete hostile mutations rather than mocks. For example:

```js
const bundle = validBundle();
bundle.records.find(record => record.kind === 'skill_ref').disabled_by_default = false;
assert.throws(() => validatePersistentEntityBundle(bundle), /disabled/i);
```

and:

```js
const bundle = validBundle();
bundle.records[0].credentials = { token: 'secret' };
assert.throws(() => validatePersistentEntityBundle(bundle), /forbidden|unknown field/i);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd mesh
node --test test/persistent-entity-bundle.test.mjs
```

Expected: test process fails because `../src/lib/persistent-entity-bundle.mjs` does not exist.

- [ ] **Step 3: Commit the RED test**

```bash
git add mesh/test/persistent-entity-bundle.test.mjs
git commit -m "test: define persistent entity bundle v0 semantics"
```

---

### Task 2: Implement the minimal semantic validator

**Files:**
- Create: `mesh/src/lib/persistent-entity-bundle.mjs`
- Test: `mesh/test/persistent-entity-bundle.test.mjs`

**Interfaces:**
- Consumes: `digestObject` and `ValidationError` from `./canonical.mjs`.
- Produces:

```js
export const PERSISTENT_ENTITY_BUNDLE_SCHEMA = 'axiom-persistent-entity-bundle.v0';
export function validatePersistentEntityBundle(document) {}
export function persistentEntityBundleDigest(document) {}
```

- [ ] **Step 1: Add the public module skeleton and exact top-level validation**

The module imports only:

```js
import { digestObject, ValidationError } from './canonical.mjs';
```

`validatePersistentEntityBundle(document)` must call one internal shape validator and return:

```js
Object.freeze({
  valid: true,
  schema: document.schema,
  bundle_id: document.bundle_id,
  entity_ref: document.entity_ref,
  bundle_digest: digestObject(document),
  record_count: document.records.length,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  credential_material: false
});
```

Top-level exact fields:

```js
[
  'schema',
  'version',
  'status',
  'bundle_id',
  'entity_ref',
  'source_composition_digest',
  'scopes',
  'records',
  'created_at',
  'authority_effect',
  'network_effect',
  'runtime_activation',
  'credential_material'
]
```

Constants:

```js
document.schema === 'axiom-persistent-entity-bundle.v0'
document.version === 0
document.status === 'inert-portability-contract'
document.authority_effect === 'none'
document.network_effect === 'none'
document.runtime_activation === false
document.credential_material === false
```

- [ ] **Step 2: Implement exact record validators**

Allowed record shapes:

```text
identity: kind, display_name, handle_intent
character: kind, text
personal_model_projection: kind, projection_ref, projection_digest, purpose
runtime_policy: kind, primary_profile_ref, fallback_profile_ref, local_preferred
private_memory_ref: kind, memory_ref, content_digest
private_artifact_ref: kind, artifact_ref, content_digest
skill_ref: kind, skill_ref, artifact_digest, disabled_by_default
relationship_projection: kind, relationship_ref, projection_digest, third_party_private_data
```

Requirements:

- bounded identifiers use `/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/`;
- digests use `/^[a-f0-9]{64}$/`;
- `display_name` max 256 chars;
- `handle_intent` nullable, max 256 chars;
- `character.text` max 16 KiB;
- `purpose` max 2048 chars;
- record array max 128;
- scopes max 8 and unique;
- `created_at` must round-trip through `new Date(value).toISOString()`;
- `source_composition_digest` may be null or a digest;
- `skill_ref.disabled_by_default` must equal `true`;
- `relationship_projection.third_party_private_data` must equal `false`.

- [ ] **Step 3: Implement scope/record consistency**

Use the record `kind` values as the canonical semantic groups. Reject when:

- a record kind is absent from `scopes`;
- a scope has no corresponding record;
- a scope is duplicated;
- any singleton kind appears more than once: `identity`, `character`, `personal_model_projection`, `runtime_policy`;
- duplicate ref keys occur for `private_memory_ref`, `private_artifact_ref`, `skill_ref`, or `relationship_projection`.

- [ ] **Step 4: Implement recursive forbidden-name defense**

Before or during kind validation, recursively walk ordinary arrays/plain records and reject any key in this exact set:

```js
[
  'password', 'secret', 'token', 'api_key', 'apiKey',
  'refresh_token', 'refreshToken', 'cookie', 'cookies',
  'credential', 'credentials', 'recovery', 'recovery_key',
  'session', 'session_id', 'server_id', 'source_db_id',
  'capability', 'capabilities', 'standing_approval', 'standing_approvals',
  'delegation', 'delegations', 'embedding', 'embeddings',
  'filesystem_path', 'absolute_path'
]
```

Do not treat values containing these words as automatically forbidden; this is a field-name guard.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
cd mesh
node --test test/persistent-entity-bundle.test.mjs
```

Expected: all semantic tests pass.

- [ ] **Step 6: Commit the semantic implementation**

```bash
git add mesh/src/lib/persistent-entity-bundle.mjs mesh/test/persistent-entity-bundle.test.mjs
git commit -m "feat: add persistent entity bundle v0 validator"
```

---

### Task 3: Add the strict JSON Schema mirror RED-first

**Files:**
- Create: `mesh/test/persistent-entity-bundle-schema.test.mjs`
- Create: `mesh/config/persistent-entity-bundle-v0.schema.json`

**Interfaces:**
- Consumes: semantic contract implemented in Task 2.
- Produces: machine-readable structural schema mirror for tooling/discovery; semantic validator remains authoritative for cross-record invariants such as exact scope/record agreement and duplicate ref semantics.

- [ ] **Step 1: Write the failing schema test**

Create `mesh/test/persistent-entity-bundle-schema.test.mjs` that loads:

```js
const schemaUrl = new URL('../config/persistent-entity-bundle-v0.schema.json', import.meta.url);
```

Assert at minimum:

```js
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.properties.schema.const, 'axiom-persistent-entity-bundle.v0');
assert.equal(schema.properties.version.const, 0);
assert.equal(schema.properties.status.const, 'inert-portability-contract');
assert.equal(schema.properties.authority_effect.const, 'none');
assert.equal(schema.properties.network_effect.const, 'none');
assert.equal(schema.properties.runtime_activation.const, false);
assert.equal(schema.properties.credential_material.const, false);
assert.equal(schema.additionalProperties, false);
assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/persistent-entity-bundle.mjs');
```

Also assert the exact eight scope enum values and the non-claim array:

```text
credential-portability
authority-portability
standing-approval-portability
runtime-activation
machine-delegation
server-bound-identity-portability
canonical-embedding-portability
production-machine-person
```

- [ ] **Step 2: Run the schema test and verify RED**

Run:

```bash
cd mesh
node --test test/persistent-entity-bundle-schema.test.mjs
```

Expected: fail because the schema file does not yet exist.

- [ ] **Step 3: Implement the JSON Schema**

Use Draft 2020-12 with:

- top-level `additionalProperties: false`;
- exact required top-level field list;
- `$defs.identifier`, `$defs.digest`, and one `$defs` record schema per kind;
- `records.items.oneOf` across the eight exact record definitions;
- `scopes.uniqueItems: true`, `minItems: 1`, `maxItems: 8`;
- `records.maxItems: 128`;
- constant safety fields matching the semantic validator;
- `x-axiom-semantic-validator` pointing to the module;
- `x-axiom-non-claims` exact array above.

The schema should structurally enforce `disabled_by_default: true` and `third_party_private_data: false`. Cross-record scope equality and duplicate logical refs remain semantic-validator checks and should be documented in `x-axiom-semantic-invariants`.

- [ ] **Step 4: Run both focused tests**

Run:

```bash
cd mesh
node --test test/persistent-entity-bundle.test.mjs test/persistent-entity-bundle-schema.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit the schema**

```bash
git add mesh/config/persistent-entity-bundle-v0.schema.json mesh/test/persistent-entity-bundle-schema.test.mjs
git commit -m "feat: add persistent entity bundle v0 schema"
```

---

### Task 4: Verify non-authority boundaries and repository integration

**Files:**
- Inspect only: `mesh/config/capabilities.json`
- Inspect only: `mesh/src/gateway/server.mjs`
- Inspect only: `mesh/src/lib/agent-composition.mjs`
- Modify only if required by existing checker policy: documentation/checker registration files identified by `npm run check` output.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: exact verification evidence that C0 is an inert contract slice.

- [ ] **Step 1: Confirm no capability or route promotion**

Run:

```bash
git diff -- mesh/config/capabilities.json mesh/src/gateway/server.mjs
```

Expected: no diff.

- [ ] **Step 2: Run focused contract tests**

```bash
cd mesh
node --test test/persistent-entity-bundle.test.mjs test/persistent-entity-bundle-schema.test.mjs
```

Expected: pass.

- [ ] **Step 3: Run repository-required validation**

From repository root:

```bash
npm run check
npm run release:verify
```

Record exact results. Do not claim either command passed unless it was actually run successfully.

- [ ] **Step 4: Repair only failures caused by this slice**

If repository checkers require new document/schema/test registration, make the smallest deterministic registration change and add/adjust checker coverage as required. Do not use this task to clean unrelated repository debt.

- [ ] **Step 5: Re-run affected checks**

Run the narrow failing checker first, then `npm run check`; run `npm run release:verify` again if any source/checker change can affect release verification.

- [ ] **Step 6: Commit integration-only corrections**

```bash
git add <only files changed by the verified correction>
git commit -m "chore: register persistent entity bundle verification"
```

---

### Task 5: Final review and draft PR

**Files:**
- No additional production scope expected.

**Interfaces:**
- Consumes: verified C0 implementation.
- Produces: a reviewable draft PR bound to issue #1610.

- [ ] **Step 1: Self-review against the spec**

Confirm every requirement in `docs/superpowers/specs/2026-09-17-persistent-entity-bundle-v0-design.md` is either implemented in C0 or explicitly deferred to later import/application slices.

- [ ] **Step 2: Inspect exact diff**

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

Confirm there are no capability-registry, Gateway, Grid mutation, credential-store or runtime-activation changes.

- [ ] **Step 3: Open a draft PR**

PR title:

```text
feat: persistent entity bundle v0
```

PR body must include:

- issue `#1610`;
- exact head SHA;
- RED evidence actually observed;
- focused test results;
- `npm run check` and `npm run release:verify` results if run;
- explicit statement that `mesh/config/capabilities.json` is unchanged;
- non-claims: no Gateway route, no import mutation, no credential/authority portability, no runtime activation, no machine delegation.

Keep the PR draft until protected CI and review confirm the exact head.

# Epistemic E2-RC Reproducibility Closure v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, authority-neutral `axiom-epistemic-reproducibility-closure.v0` contract that records exactly what target, verifier, environment, dependency closure, and replay context were actually checked, so no system can safely collapse a partial verification into an unqualified `verified = true` claim.

**Architecture:** Implement E2-RC as a standalone inert evidence adjunct under `mesh/` rather than widening the owner-approved E0/E1 `Source -> Claim -> Evidence` schemas. The contract reuses `mesh/src/lib/canonical.mjs` for strict plain-data canonicalization and SHA-256, binds direct dependencies and recursively referenced child-closure digests, derives bounded coverage summaries, and distinguishes original/same-context/separate-context/unknown-context replay without claiming epistemic independence. It has no store, no network path, no provider/prover invocation, no canonical admission, and no policy/effect consumer in this slice.

**Tech Stack:** Node.js ESM; JSON Schema 2020-12; Node built-ins (`node:test`, `node:assert/strict`, `node:fs/promises` in tests only); existing `mesh/src/lib/canonical.mjs`; existing Clean Kernel and compatibility workflows.

**Spec:** `docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md` — Amendment B, especially sections 22.1, 22.3, 22.6, and 22.7.

## Global Constraints

- **Fresh-gate rule:** this plan is not E2 implementation authority. Execution may start only after the Amendment B design is merged, E0/E1 PR #1563 is merged, and a fresh E2-RC implementation gate is approved against the exact then-current `main` head.
- The owner-approved E0/E1 schema bytes and SHA-256 digests MUST remain byte-identical. Do not modify `mesh/config/epistemic-record-v0.schema.json`, `mesh/config/epistemic-source-v0.schema.json`, `mesh/config/epistemic-claim-v0.schema.json`, `mesh/config/epistemic-evidence-v0.schema.json`, `mesh/src/lib/epistemic-contracts.mjs`, or `mesh/src/lib/epistemic-proposal-store.mjs` in this slice.
- `mesh/config/capabilities.json` MUST NOT change.
- No Gateway, Hypervisor, Sandbox, Grid, provider, model, theorem prover, repository-effect, credential, wallet, or external-effect surface may be imported or invoked.
- Production E2-RC code may import only `ValidationError`, `canonicalJson`, `canonicalize`, and `sha256` from `./canonical.mjs`.
- Production E2-RC code MUST NOT import `node:fs`, `node:http`, `node:https`, `node:net`, `node:dgram`, `node:tls`, `node:child_process`, or any runtime/effect client.
- Production E2-RC code MUST NOT consult `process.env`, `process.cwd()`, `Date.now()`, `new Date()`, `Math.random()`, hostnames, package caches, user directories, or ambient network/filesystem state to decide validation semantics.
- All digest strings use the Epistemic Fabric form `sha256:<64 lowercase hex>`.
- Reuse the existing canonical JSON discipline. Do not create a second canonicalizer.
- The content digest is self-excluding and domain-separated with exact prefix `axiom-epistemic-reproducibility-closure.v0\n`.
- The dependency-list digest is domain-separated with exact prefix `axiom-epistemic-dependency-closure.v0\n`.
- Serialized E2-RC records are limited to 64 KiB.
- Direct dependencies are limited to 256 per record. Larger systems compose bounded records by binding `child_closure_ref` + `child_closure_digest`; this slice does not claim global graph-cycle validation across separately stored records.
- `limitations` is limited to 64 strings of at most 2 KiB each.
- `separation_evidence_refs` is limited to 32 unique references of at most 256 characters each.
- Dependency references are unique and MUST already be in canonical order by `(dependency_kind, dependency_ref, dependency_digest)`; the validator rejects rather than silently reorders.
- `freshly_checked` and `reused_with_bound_verification` dependencies require `verification_evidence_ref`.
- `reused_without_recheck` and `unavailable` dependencies MUST NOT pretend to carry verification evidence for the current run.
- `child_closure_ref` and `child_closure_digest` are an all-or-nothing pair. Direct self-reference to the current `closure_id` is rejected.
- `coverage_claim` is one of `target_only`, `partial_closure`, `declared_closure_checked`, `fresh_rebuild`.
- `declared_closure_checked` is invalid if any direct dependency is `reused_without_recheck` or `unavailable`.
- `fresh_rebuild` is invalid unless every direct dependency is `freshly_checked`. A fresh rebuild MAY still have `result: fail|indeterminate|error`; coverage and outcome remain separate dimensions.
- Replay mode is one of `original`, `same_context_replay`, `separate_context_replay`, `unknown_context_replay`.
- `separate_context_replay` means only that bound actor/environment context differs and separation evidence is present. It MUST NOT be called “independent reproduction”; epistemic independence belongs to the later evidence-independence layer.
- `status` is always `inert-evidence`, `canonical_state` is always `proposal`, `authority_effect` and `network_effect` are always `none`, `execution_authority` is always `false`, and `contains_secret_material` is always `false`.
- The contract MUST NOT expose a `truth`, `confidence`, `score`, `verified`, `independent`, `canonical`, `authorize`, `capability`, `grant`, `consent`, or `permission` field.
- Open FORMAL-001 PR #1537 and Verified Work Graph PR #1539 are design/provenance inputs only for this plan. E2-RC MUST NOT depend on their unmerged source files. A future adapter may map their artifacts into this contract only after a separate gate.

---

## Planned File Structure

The implementation candidate is intentionally small:

```text
mesh/config/epistemic-reproducibility-closure-v0.schema.json
mesh/src/lib/epistemic-reproducibility-closure.mjs
mesh/test/epistemic-reproducibility-closure.test.mjs
mesh/test/epistemic-reproducibility-authority-boundary.test.mjs
docs/MASTER-TODO-EPISTEMIC-FABRIC.md
docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md
```

The first four files are the executable contract and tests. The two documentation files are status/evidence updates only after the implementation candidate exists; they do not widen the design or authority boundary.

### Public interface

`mesh/src/lib/epistemic-reproducibility-closure.mjs` produces exactly:

```js
export const REPRODUCIBILITY_CLOSURE_SCHEMA = 'axiom-epistemic-reproducibility-closure.v0';
export const REPRODUCIBILITY_CLOSURE_VERSION = '0.1.0';
export const REPRODUCIBILITY_CLOSURE_LIMITS = Object.freeze({
  serialized_record_bytes: 64 * 1024,
  direct_dependencies: 256,
  limitation_items: 64,
  separation_evidence_refs: 32,
  network_requests: 0,
  external_effects: 0,
  provider_calls: 0,
  production_credentials: 0
});

export function computeDependencyClosureDigest(dependencies) {}
export function computeReproducibilityClosureDigest(value) {}
export function validateReproducibilityClosure(value) {}
export function finalizeReproducibilityClosure(value) {}
export function summarizeReproducibilityClosure(value) {}
```

No other public execution or mutation API is added.

---

### Task 1: Base contract, canonical identity, and RED/GREEN skeleton

**Files:**
- Create: `mesh/src/lib/epistemic-reproducibility-closure.mjs`
- Create: `mesh/test/epistemic-reproducibility-closure.test.mjs`

**Interfaces:**
- Consumes: `ValidationError`, `canonicalJson`, `canonicalize`, `sha256` from `mesh/src/lib/canonical.mjs`.
- Produces: the exact public interface listed above.
- Later tasks extend the validator but do not rename or widen the interface.

- [ ] **Step 1: Write the failing public-contract test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPRODUCIBILITY_CLOSURE_SCHEMA,
  REPRODUCIBILITY_CLOSURE_VERSION,
  computeDependencyClosureDigest,
  finalizeReproducibilityClosure,
  validateReproducibilityClosure
} from '../src/lib/epistemic-reproducibility-closure.mjs';

const D = (hex = 'a') => `sha256:${hex.repeat(64)}`;

function baseRecord(overrides = {}) {
  return {
    schema: 'axiom-epistemic-reproducibility-closure.v0',
    version: '0.1.0',
    status: 'inert-evidence',
    closure_id: 'closure:fixture:001',
    target: {
      target_ref: 'claim:math:001',
      target_kind: 'formal_statement',
      target_digest: D('1')
    },
    verifier: {
      verifier_id: 'lean-kernel',
      verifier_version: '4.24.0',
      implementation_digest: D('2'),
      profile_digest: D('3')
    },
    environment: {
      environment_digest: D('4'),
      runtime_ref: 'runtime:fixture'
    },
    dependencies: [],
    dependency_closure_digest: '',
    coverage_claim: 'target_only',
    replay: {
      mode: 'original',
      actor_ref: 'actor:fixture',
      run_id: 'run:fixture:001',
      input_digest: D('5'),
      output_digest: D('6')
    },
    result: 'pass',
    limitations: [],
    recorded_at: '2026-09-08T16:00:00.000Z',
    contains_secret_material: false,
    canonical_state: 'proposal',
    authority_effect: 'none',
    network_effect: 'none',
    execution_authority: false,
    ...overrides
  };
}

test('E2-RC public schema and version are exact', () => {
  assert.equal(REPRODUCIBILITY_CLOSURE_SCHEMA, 'axiom-epistemic-reproducibility-closure.v0');
  assert.equal(REPRODUCIBILITY_CLOSURE_VERSION, '0.1.0');
});

test('finalize and validate produce a self-bound inert record', () => {
  const input = baseRecord();
  input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
  const finalized = finalizeReproducibilityClosure(input);
  assert.match(finalized.content_digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(validateReproducibilityClosure(finalized), finalized);
});
```

- [ ] **Step 2: Run the focused test and witness RED**

Run:

```bash
node --test mesh/test/epistemic-reproducibility-closure.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `epistemic-reproducibility-closure.mjs` and no unrelated production change.

- [ ] **Step 3: Add constants, closed field vocabulary, and canonical helpers**

Create the module with these exact constants and helper semantics:

```js
import { ValidationError, canonicalJson, canonicalize, sha256 } from './canonical.mjs';

export const REPRODUCIBILITY_CLOSURE_SCHEMA = 'axiom-epistemic-reproducibility-closure.v0';
export const REPRODUCIBILITY_CLOSURE_VERSION = '0.1.0';

const CONTENT_DOMAIN = 'axiom-epistemic-reproducibility-closure.v0\n';
const DEPENDENCY_DOMAIN = 'axiom-epistemic-dependency-closure.v0\n';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_RECORD_BYTES = 64 * 1024;

export const REPRODUCIBILITY_CLOSURE_LIMITS = Object.freeze({
  serialized_record_bytes: MAX_RECORD_BYTES,
  direct_dependencies: 256,
  limitation_items: 64,
  separation_evidence_refs: 32,
  network_requests: 0,
  external_effects: 0,
  provider_calls: 0,
  production_credentials: 0
});

const TOP_LEVEL_FIELDS = new Set([
  'schema', 'version', 'status', 'closure_id', 'target', 'verifier', 'environment',
  'dependencies', 'dependency_closure_digest', 'coverage_claim', 'replay', 'result',
  'limitations', 'recorded_at', 'contains_secret_material', 'canonical_state',
  'content_digest', 'authority_effect', 'network_effect', 'execution_authority'
]);

function fail(message) {
  throw new ValidationError(message);
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function rejectUnknown(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unknown field ${key}`);
  }
}

function text(value, label, max = 256) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    fail(`${label} must be a non-empty string of at most ${max} characters`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail(`${label} must be a sha256 digest`);
  return value;
}

function canonicalTimestamp(value, label) {
  const raw = text(value, label, 64);
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== raw) {
    fail(`${label} must be a canonical ISO timestamp`);
  }
  return raw;
}

function domainDigest(domain, value) {
  return `sha256:${sha256(Buffer.concat([
    Buffer.from(domain, 'utf8'),
    Buffer.from(canonicalJson(value), 'utf8')
  ]))}`;
}
```

- [ ] **Step 4: Implement exact target/verifier/environment/base validation**

Use closed nested vocabularies and exact enums:

```js
const TARGET_KINDS = new Set([
  'epistemic_claim', 'formal_statement', 'software_build', 'experiment',
  'simulation', 'benchmark', 'dataset', 'other'
]);
const RESULTS = new Set(['pass', 'fail', 'indeterminate', 'error']);
const COVERAGE = new Set(['target_only', 'partial_closure', 'declared_closure_checked', 'fresh_rebuild']);

function validateTarget(value) {
  const target = record(value, 'target');
  rejectUnknown(target, new Set(['target_ref', 'target_kind', 'target_digest']), 'target');
  for (const key of ['target_ref', 'target_kind', 'target_digest']) {
    if (!Object.hasOwn(target, key)) fail(`target.${key} is required`);
  }
  text(target.target_ref, 'target.target_ref', 512);
  if (!TARGET_KINDS.has(target.target_kind)) fail('target.target_kind has an unsupported value');
  digest(target.target_digest, 'target.target_digest');
}

function validateVerifier(value) {
  const verifier = record(value, 'verifier');
  rejectUnknown(verifier, new Set([
    'verifier_id', 'verifier_version', 'implementation_digest', 'profile_digest'
  ]), 'verifier');
  for (const key of ['verifier_id', 'verifier_version', 'implementation_digest', 'profile_digest']) {
    if (!Object.hasOwn(verifier, key)) fail(`verifier.${key} is required`);
  }
  text(verifier.verifier_id, 'verifier.verifier_id', 160);
  text(verifier.verifier_version, 'verifier.verifier_version', 128);
  digest(verifier.implementation_digest, 'verifier.implementation_digest');
  digest(verifier.profile_digest, 'verifier.profile_digest');
}

function validateEnvironment(value) {
  const environment = record(value, 'environment');
  rejectUnknown(environment, new Set(['environment_digest', 'runtime_ref']), 'environment');
  if (!Object.hasOwn(environment, 'environment_digest')) fail('environment.environment_digest is required');
  digest(environment.environment_digest, 'environment.environment_digest');
  if (Object.hasOwn(environment, 'runtime_ref')) text(environment.runtime_ref, 'environment.runtime_ref', 160);
}
```

Base semantics are exact:

```js
function validateBase(value) {
  rejectUnknown(value, TOP_LEVEL_FIELDS, 'reproducibility closure');
  for (const key of [
    'schema', 'version', 'status', 'closure_id', 'target', 'verifier', 'environment',
    'dependencies', 'dependency_closure_digest', 'coverage_claim', 'replay', 'result',
    'limitations', 'recorded_at', 'contains_secret_material', 'canonical_state',
    'content_digest', 'authority_effect', 'network_effect', 'execution_authority'
  ]) {
    if (!Object.hasOwn(value, key)) fail(`${key} is required`);
  }
  if (value.schema !== REPRODUCIBILITY_CLOSURE_SCHEMA) fail('schema is not E2-RC v0');
  if (value.version !== REPRODUCIBILITY_CLOSURE_VERSION) fail('version is not 0.1.0');
  if (value.status !== 'inert-evidence') fail('status must be inert-evidence');
  text(value.closure_id, 'closure_id', 160);
  validateTarget(value.target);
  validateVerifier(value.verifier);
  validateEnvironment(value.environment);
  if (!COVERAGE.has(value.coverage_claim)) fail('coverage_claim has an unsupported value');
  if (!RESULTS.has(value.result)) fail('result has an unsupported value');
  canonicalTimestamp(value.recorded_at, 'recorded_at');
  if (value.contains_secret_material !== false) fail('contains_secret_material must be false');
  if (value.canonical_state !== 'proposal') fail('canonical_state must be proposal');
  if (value.authority_effect !== 'none') fail('authority_effect must be none');
  if (value.network_effect !== 'none') fail('network_effect must be none');
  if (value.execution_authority !== false) fail('execution_authority must be false');
  digest(value.content_digest, 'content_digest');
}
```

- [ ] **Step 5: Implement self-excluding content digest and basic finalize/validate**

```js
export function computeReproducibilityClosureDigest(value) {
  const normalized = canonicalize(value);
  record(normalized, 'reproducibility closure');
  if (Object.hasOwn(normalized, 'content_digest')) delete normalized.content_digest;
  return domainDigest(CONTENT_DOMAIN, normalized);
}

export function validateReproducibilityClosure(value) {
  const normalized = canonicalize(value);
  record(normalized, 'reproducibility closure');
  validateBase(normalized);
  const expected = computeReproducibilityClosureDigest(normalized);
  if (normalized.content_digest !== expected) fail('content_digest does not match reproducibility closure content');
  const bytes = Buffer.byteLength(canonicalJson(normalized), 'utf8');
  if (bytes > MAX_RECORD_BYTES) fail('reproducibility closure exceeds 64 KiB');
  return normalized;
}

export function finalizeReproducibilityClosure(value) {
  const normalized = canonicalize(value);
  record(normalized, 'reproducibility closure');
  const expected = computeReproducibilityClosureDigest(normalized);
  if (Object.hasOwn(normalized, 'content_digest') && normalized.content_digest !== expected) {
    fail('content_digest does not match reproducibility closure content');
  }
  normalized.content_digest = expected;
  return validateReproducibilityClosure(normalized);
}
```

Task 2 will make `validateReproducibilityClosure()` call dependency, coverage, limitations, and replay validators before digest acceptance.

- [ ] **Step 6: Run focused tests and verify the skeleton is GREEN only for the base fixture**

```bash
node --test mesh/test/epistemic-reproducibility-closure.test.mjs
```

Expected: the public-constant and simple empty-dependency original-run tests pass. Do not proceed if unrelated tests fail.

- [ ] **Step 7: Commit Task 1**

```bash
git add mesh/src/lib/epistemic-reproducibility-closure.mjs mesh/test/epistemic-reproducibility-closure.test.mjs
git commit -m "feat: add reproducibility closure base contract"
```

---

### Task 2: Dependency closure and coverage semantics

**Files:**
- Modify: `mesh/src/lib/epistemic-reproducibility-closure.mjs`
- Modify: `mesh/test/epistemic-reproducibility-closure.test.mjs`

**Interfaces:**
- Produces: `computeDependencyClosureDigest(dependencies)` and validated `coverage_claim` semantics.
- Consumes: Task 1 constants/helpers.

- [ ] **Step 1: Add RED fixtures for all dependency dispositions**

Add this exact valid dependency helper:

```js
function dep({
  dependency_kind = 'formal_library',
  dependency_ref = 'dep:base',
  dependency_digest = D('7'),
  disposition = 'freshly_checked',
  verification_evidence_ref = 'evidence:verify:base',
  child_closure_ref,
  child_closure_digest
} = {}) {
  return {
    dependency_kind,
    dependency_ref,
    dependency_digest,
    disposition,
    ...(verification_evidence_ref ? { verification_evidence_ref } : {}),
    ...(child_closure_ref ? { child_closure_ref } : {}),
    ...(child_closure_digest ? { child_closure_digest } : {})
  };
}
```

Add tests proving:

```js
test('fresh_rebuild requires every direct dependency freshly checked', () => {
  const input = baseRecord({
    dependencies: [dep({ disposition: 'reused_without_recheck', verification_evidence_ref: undefined })],
    coverage_claim: 'fresh_rebuild'
  });
  input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
  assert.throws(() => finalizeReproducibilityClosure(input), /fresh_rebuild|freshly_checked/i);
});

test('declared_closure_checked rejects unavailable or unchecked reuse', () => {
  for (const disposition of ['reused_without_recheck', 'unavailable']) {
    const input = baseRecord({
      dependencies: [dep({ disposition, verification_evidence_ref: undefined })],
      coverage_claim: 'declared_closure_checked'
    });
    input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
    assert.throws(() => finalizeReproducibilityClosure(input), /declared_closure_checked|coverage/i);
  }
});
```

Also prove:
- `freshly_checked` without `verification_evidence_ref` fails;
- `reused_with_bound_verification` without `verification_evidence_ref` fails;
- `reused_without_recheck` with `verification_evidence_ref` fails;
- `unavailable` with `verification_evidence_ref` fails;
- one of `child_closure_ref` / `child_closure_digest` without the other fails;
- `child_closure_ref === closure_id` fails;
- duplicate `dependency_ref` fails even if digests differ;
- unsorted dependencies fail rather than reorder;
- more than 256 direct dependencies fail;
- changing any dependency digest changes `dependency_closure_digest` and final `content_digest`.

- [ ] **Step 2: Run focused tests and witness RED**

```bash
node --test mesh/test/epistemic-reproducibility-closure.test.mjs
```

Expected: only the new dependency/coverage assertions fail because Task 1 does not yet validate those semantics.

- [ ] **Step 3: Implement exact dependency vocabulary and canonical-order validation**

```js
const DEPENDENCY_KINDS = new Set([
  'formal_library', 'software_package', 'dataset', 'artifact',
  'configuration', 'environment', 'source', 'other'
]);
const DISPOSITIONS = new Set([
  'freshly_checked', 'reused_with_bound_verification',
  'reused_without_recheck', 'unavailable'
]);
const DEP_FIELDS = new Set([
  'dependency_kind', 'dependency_ref', 'dependency_digest', 'disposition',
  'verification_evidence_ref', 'child_closure_ref', 'child_closure_digest'
]);

function dependencyKey(item) {
  return `${item.dependency_kind}\u0000${item.dependency_ref}\u0000${item.dependency_digest}`;
}

function validateDependencies(value, closureId) {
  if (!Array.isArray(value) || value.length > REPRODUCIBILITY_CLOSURE_LIMITS.direct_dependencies) {
    fail('dependencies must be an array with at most 256 items');
  }

  const refs = new Set();
  let priorKey = null;

  value.forEach((raw, index) => {
    const item = record(raw, `dependencies[${index}]`);
    rejectUnknown(item, DEP_FIELDS, `dependencies[${index}]`);
    for (const key of ['dependency_kind', 'dependency_ref', 'dependency_digest', 'disposition']) {
      if (!Object.hasOwn(item, key)) fail(`dependencies[${index}].${key} is required`);
    }
    if (!DEPENDENCY_KINDS.has(item.dependency_kind)) fail(`dependencies[${index}].dependency_kind is unsupported`);
    text(item.dependency_ref, `dependencies[${index}].dependency_ref`, 256);
    digest(item.dependency_digest, `dependencies[${index}].dependency_digest`);
    if (!DISPOSITIONS.has(item.disposition)) fail(`dependencies[${index}].disposition is unsupported`);

    if (refs.has(item.dependency_ref)) fail(`duplicate dependency_ref ${item.dependency_ref}`);
    refs.add(item.dependency_ref);

    const key = dependencyKey(item);
    if (priorKey !== null && key <= priorKey) fail('dependencies must be in canonical order');
    priorKey = key;

    const checked = item.disposition === 'freshly_checked' || item.disposition === 'reused_with_bound_verification';
    if (checked) {
      if (!Object.hasOwn(item, 'verification_evidence_ref')) {
        fail(`dependencies[${index}].verification_evidence_ref is required for checked dispositions`);
      }
      text(item.verification_evidence_ref, `dependencies[${index}].verification_evidence_ref`, 256);
    } else if (Object.hasOwn(item, 'verification_evidence_ref')) {
      fail(`dependencies[${index}].verification_evidence_ref is forbidden for ${item.disposition}`);
    }

    const hasChildRef = Object.hasOwn(item, 'child_closure_ref');
    const hasChildDigest = Object.hasOwn(item, 'child_closure_digest');
    if (hasChildRef !== hasChildDigest) fail(`dependencies[${index}] child closure ref/digest must be paired`);
    if (hasChildRef) {
      text(item.child_closure_ref, `dependencies[${index}].child_closure_ref`, 256);
      digest(item.child_closure_digest, `dependencies[${index}].child_closure_digest`);
      if (item.child_closure_ref === closureId) fail('direct child closure self-reference is forbidden');
    }
  });
}
```

- [ ] **Step 4: Implement domain-separated dependency digest**

```js
export function computeDependencyClosureDigest(dependencies) {
  const normalized = canonicalize(dependencies);
  if (!Array.isArray(normalized)) fail('dependencies must be an array');
  return domainDigest(DEPENDENCY_DOMAIN, normalized);
}
```

Do not silently sort inside this function. `validateDependencies()` is the canonical-order gate.

- [ ] **Step 5: Implement coverage validation and bind the declared dependency digest**

```js
function validateCoverage(value) {
  const dispositions = value.dependencies.map((item) => item.disposition);

  if (value.coverage_claim === 'partial_closure' && value.dependencies.length === 0) {
    fail('partial_closure requires at least one declared dependency');
  }

  if (value.coverage_claim === 'declared_closure_checked') {
    if (dispositions.some((item) => item === 'reused_without_recheck' || item === 'unavailable')) {
      fail('declared_closure_checked cannot include unchecked or unavailable dependencies');
    }
  }

  if (value.coverage_claim === 'fresh_rebuild') {
    if (dispositions.some((item) => item !== 'freshly_checked')) {
      fail('fresh_rebuild requires every direct dependency to be freshly_checked');
    }
  }
}
```

Then add to `validateReproducibilityClosure()` before content-digest validation:

```js
validateDependencies(normalized.dependencies, normalized.closure_id);
const expectedDependencyDigest = computeDependencyClosureDigest(normalized.dependencies);
if (normalized.dependency_closure_digest !== expectedDependencyDigest) {
  fail('dependency_closure_digest does not match exact dependencies');
}
validateCoverage(normalized);
```

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
node --test mesh/test/epistemic-reproducibility-closure.test.mjs
```

Expected: dependency ordering, disposition, child-closure, digest, and coverage tests pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add mesh/src/lib/epistemic-reproducibility-closure.mjs mesh/test/epistemic-reproducibility-closure.test.mjs
git commit -m "feat: bind reproducibility dependency coverage"
```

---

### Task 3: Replay-context semantics and bounded summary

**Files:**
- Modify: `mesh/src/lib/epistemic-reproducibility-closure.mjs`
- Modify: `mesh/test/epistemic-reproducibility-closure.test.mjs`

**Interfaces:**
- Produces: validated replay modes and `summarizeReproducibilityClosure(value)`.
- Does NOT produce an `independent` boolean or semantic independence score.

- [ ] **Step 1: Add RED replay tests**

Use these exact cases:

```js
test('separate_context_replay requires bound prior context and separation evidence', () => {
  const input = baseRecord({
    replay: {
      mode: 'separate_context_replay',
      actor_ref: 'actor:new',
      run_id: 'run:new',
      input_digest: D('5'),
      output_digest: D('6'),
      prior_run_ref: 'run:old',
      prior_actor_ref: 'actor:old',
      prior_environment_digest: D('8'),
      separation_evidence_refs: []
    }
  });
  input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
  assert.throws(() => finalizeReproducibilityClosure(input), /separation_evidence_refs/i);
});

test('same_context_replay rejects changed actor or environment', () => {
  const input = baseRecord({
    replay: {
      mode: 'same_context_replay',
      actor_ref: 'actor:new',
      run_id: 'run:new',
      input_digest: D('5'),
      output_digest: D('6'),
      prior_run_ref: 'run:old',
      prior_actor_ref: 'actor:old',
      prior_environment_digest: D('4')
    }
  });
  input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
  assert.throws(() => finalizeReproducibilityClosure(input), /same_context_replay/i);
});
```

Also prove:
- `original` rejects every `prior_*` field and `separation_evidence_refs`;
- `same_context_replay` requires `prior_run_ref`, `prior_actor_ref`, `prior_environment_digest`, same actor, and same environment;
- `separate_context_replay` requires those three prior fields, at least one changed actor/environment dimension, and at least one separation evidence ref;
- `unknown_context_replay` requires `prior_run_ref`, permits missing prior actor/environment, and rejects `separation_evidence_refs` so unknown context cannot masquerade as evidenced separation;
- duplicate separation evidence refs fail;
- more than 32 separation refs fail;
- changing run input/output digest changes final identity;
- replay mode changes final identity.

- [ ] **Step 2: Add RED summary test**

```js
test('summary preserves coverage dimensions without truth or independence claims', () => {
  const input = baseRecord({
    dependencies: [
      dep({ dependency_ref: 'dep:a', dependency_digest: D('7') }),
      dep({
        dependency_ref: 'dep:b',
        dependency_digest: D('8'),
        disposition: 'reused_without_recheck',
        verification_evidence_ref: undefined
      })
    ],
    coverage_claim: 'partial_closure',
    result: 'pass'
  });
  input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
  const finalized = finalizeReproducibilityClosure(input);
  const summary = summarizeReproducibilityClosure(finalized);
  assert.deepEqual(summary, {
    dependency_count: 2,
    freshly_checked_count: 1,
    reused_with_bound_verification_count: 0,
    reused_without_recheck_count: 1,
    unavailable_count: 0,
    coverage_claim: 'partial_closure',
    replay_mode: 'original',
    result: 'pass'
  });
  assert.equal(Object.hasOwn(summary, 'verified'), false);
  assert.equal(Object.hasOwn(summary, 'independent'), false);
  assert.equal(Object.hasOwn(summary, 'confidence'), false);
});
```

- [ ] **Step 3: Run focused test and witness RED**

```bash
node --test mesh/test/epistemic-reproducibility-closure.test.mjs
```

Expected: replay and summary tests fail; Tasks 1–2 remain green.

- [ ] **Step 4: Implement replay validator**

```js
const REPLAY_FIELDS = new Set([
  'mode', 'actor_ref', 'run_id', 'input_digest', 'output_digest',
  'prior_run_ref', 'prior_actor_ref', 'prior_environment_digest', 'separation_evidence_refs'
]);
const REPLAY_MODES = new Set([
  'original', 'same_context_replay', 'separate_context_replay', 'unknown_context_replay'
]);

function uniqueRefs(value, label, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${label} exceeds ${maxItems} items`);
  const output = value.map((item, index) => text(item, `${label}[${index}]`, 256));
  if (new Set(output).size !== output.length) fail(`${label} must contain unique references`);
  return output;
}

function validateReplay(value, environmentDigest) {
  const replay = record(value, 'replay');
  rejectUnknown(replay, REPLAY_FIELDS, 'replay');
  for (const key of ['mode', 'actor_ref', 'run_id', 'input_digest', 'output_digest']) {
    if (!Object.hasOwn(replay, key)) fail(`replay.${key} is required`);
  }
  if (!REPLAY_MODES.has(replay.mode)) fail('replay.mode has an unsupported value');
  text(replay.actor_ref, 'replay.actor_ref', 256);
  text(replay.run_id, 'replay.run_id', 256);
  digest(replay.input_digest, 'replay.input_digest');
  digest(replay.output_digest, 'replay.output_digest');

  const has = (key) => Object.hasOwn(replay, key);

  if (replay.mode === 'original') {
    for (const key of ['prior_run_ref', 'prior_actor_ref', 'prior_environment_digest', 'separation_evidence_refs']) {
      if (has(key)) fail(`replay.${key} must be absent for original`);
    }
    return;
  }

  if (!has('prior_run_ref')) fail('replay.prior_run_ref is required for replay modes');
  text(replay.prior_run_ref, 'replay.prior_run_ref', 256);

  if (replay.mode === 'unknown_context_replay') {
    if (has('prior_actor_ref')) text(replay.prior_actor_ref, 'replay.prior_actor_ref', 256);
    if (has('prior_environment_digest')) digest(replay.prior_environment_digest, 'replay.prior_environment_digest');
    if (has('separation_evidence_refs')) fail('unknown_context_replay cannot claim separation evidence');
    return;
  }

  if (!has('prior_actor_ref') || !has('prior_environment_digest')) {
    fail(`${replay.mode} requires prior_actor_ref and prior_environment_digest`);
  }
  text(replay.prior_actor_ref, 'replay.prior_actor_ref', 256);
  digest(replay.prior_environment_digest, 'replay.prior_environment_digest');

  const sameActor = replay.actor_ref === replay.prior_actor_ref;
  const sameEnvironment = environmentDigest === replay.prior_environment_digest;

  if (replay.mode === 'same_context_replay') {
    if (!sameActor || !sameEnvironment) fail('same_context_replay requires same actor and environment');
    if (has('separation_evidence_refs')) fail('same_context_replay cannot claim separation evidence');
    return;
  }

  if (sameActor && sameEnvironment) fail('separate_context_replay requires a changed actor or environment');
  if (!has('separation_evidence_refs')) fail('separate_context_replay requires separation_evidence_refs');
  const refs = uniqueRefs(replay.separation_evidence_refs, 'replay.separation_evidence_refs', 32);
  if (refs.length < 1) fail('separate_context_replay requires at least one separation evidence reference');
}
```

Call it from `validateReproducibilityClosure()`:

```js
validateReplay(normalized.replay, normalized.environment.environment_digest);
```

- [ ] **Step 5: Implement bounded limitations validation**

```js
function validateLimitations(value) {
  if (!Array.isArray(value) || value.length > 64) fail('limitations must contain at most 64 items');
  value.forEach((item, index) => text(item, `limitations[${index}]`, 2048));
}
```

Call it before digest acceptance.

- [ ] **Step 6: Implement the non-authorizing summary**

```js
export function summarizeReproducibilityClosure(value) {
  const normalized = validateReproducibilityClosure(value);
  const counts = {
    freshly_checked: 0,
    reused_with_bound_verification: 0,
    reused_without_recheck: 0,
    unavailable: 0
  };
  for (const item of normalized.dependencies) counts[item.disposition] += 1;
  return Object.freeze({
    dependency_count: normalized.dependencies.length,
    freshly_checked_count: counts.freshly_checked,
    reused_with_bound_verification_count: counts.reused_with_bound_verification,
    reused_without_recheck_count: counts.reused_without_recheck,
    unavailable_count: counts.unavailable,
    coverage_claim: normalized.coverage_claim,
    replay_mode: normalized.replay.mode,
    result: normalized.result
  });
}
```

The summary deliberately emits no scalar confidence, truth, independence, or authority conclusion.

- [ ] **Step 7: Run focused tests and verify GREEN**

```bash
node --test mesh/test/epistemic-reproducibility-closure.test.mjs
```

Expected: all Task 1–3 tests pass.

- [ ] **Step 8: Commit Task 3**

```bash
git add mesh/src/lib/epistemic-reproducibility-closure.mjs mesh/test/epistemic-reproducibility-closure.test.mjs
git commit -m "feat: bind reproducibility replay context"
```

---

### Task 4: Closed JSON Schema mirror and semantic parity

**Files:**
- Create: `mesh/config/epistemic-reproducibility-closure-v0.schema.json`
- Modify: `mesh/test/epistemic-reproducibility-closure.test.mjs`

**Interfaces:**
- Produces a closed JSON Schema 2020-12 structural mirror.
- Semantic rules that JSON Schema cannot express cleanly remain enforced by the Node validator and are separately tested.

- [ ] **Step 1: Add schema-absence RED test before creating the schema**

```js
import { readFile } from 'node:fs/promises';

async function readSchema() {
  return JSON.parse(await readFile(
    new URL('../config/epistemic-reproducibility-closure-v0.schema.json', import.meta.url),
    'utf8'
  ));
}

test('E2-RC JSON Schema mirrors the closed structural contract', async () => {
  const schema = await readSchema();
  assert.equal(schema.$id, 'axiom-epistemic-reproducibility-closure.v0');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.properties.canonical_state.const, 'proposal');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.execution_authority.const, false);
  assert.equal(schema.properties.dependencies.maxItems, 256);
});
```

Run:

```bash
node --test mesh/test/epistemic-reproducibility-closure.test.mjs
```

Expected: FAIL with `ENOENT` for the deliberately absent schema; behavioral tests remain green.

- [ ] **Step 2: Create the exact closed schema**

Use this schema as the implementation target; keep it pretty-printed JSON with LF line endings:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "axiom-epistemic-reproducibility-closure.v0",
  "title": "AXIOM Epistemic Reproducibility Closure v0",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema", "version", "status", "closure_id", "target", "verifier", "environment",
    "dependencies", "dependency_closure_digest", "coverage_claim", "replay", "result",
    "limitations", "recorded_at", "contains_secret_material", "canonical_state",
    "content_digest", "authority_effect", "network_effect", "execution_authority"
  ],
  "properties": {
    "schema": { "const": "axiom-epistemic-reproducibility-closure.v0" },
    "version": { "const": "0.1.0" },
    "status": { "const": "inert-evidence" },
    "closure_id": { "$ref": "#/$defs/id160" },
    "target": {
      "type": "object",
      "additionalProperties": false,
      "required": ["target_ref", "target_kind", "target_digest"],
      "properties": {
        "target_ref": { "type": "string", "minLength": 1, "maxLength": 512 },
        "target_kind": {
          "enum": [
            "epistemic_claim", "formal_statement", "software_build", "experiment",
            "simulation", "benchmark", "dataset", "other"
          ]
        },
        "target_digest": { "$ref": "#/$defs/digest" }
      }
    },
    "verifier": {
      "type": "object",
      "additionalProperties": false,
      "required": ["verifier_id", "verifier_version", "implementation_digest", "profile_digest"],
      "properties": {
        "verifier_id": { "$ref": "#/$defs/id160" },
        "verifier_version": { "type": "string", "minLength": 1, "maxLength": 128 },
        "implementation_digest": { "$ref": "#/$defs/digest" },
        "profile_digest": { "$ref": "#/$defs/digest" }
      }
    },
    "environment": {
      "type": "object",
      "additionalProperties": false,
      "required": ["environment_digest"],
      "properties": {
        "environment_digest": { "$ref": "#/$defs/digest" },
        "runtime_ref": { "$ref": "#/$defs/id160" }
      }
    },
    "dependencies": {
      "type": "array",
      "maxItems": 256,
      "items": { "$ref": "#/$defs/dependency" }
    },
    "dependency_closure_digest": { "$ref": "#/$defs/digest" },
    "coverage_claim": {
      "enum": ["target_only", "partial_closure", "declared_closure_checked", "fresh_rebuild"]
    },
    "replay": { "$ref": "#/$defs/replay" },
    "result": { "enum": ["pass", "fail", "indeterminate", "error"] },
    "limitations": {
      "type": "array",
      "maxItems": 64,
      "items": { "type": "string", "minLength": 1, "maxLength": 2048 }
    },
    "recorded_at": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$"
    },
    "contains_secret_material": { "const": false },
    "canonical_state": { "const": "proposal" },
    "content_digest": { "$ref": "#/$defs/digest" },
    "authority_effect": { "const": "none" },
    "network_effect": { "const": "none" },
    "execution_authority": { "const": false }
  },
  "$defs": {
    "id160": {
      "type": "string",
      "minLength": 1,
      "maxLength": 160
    },
    "digest": {
      "type": "string",
      "pattern": "^sha256:[0-9a-f]{64}$"
    },
    "dependency": {
      "type": "object",
      "additionalProperties": false,
      "required": ["dependency_kind", "dependency_ref", "dependency_digest", "disposition"],
      "properties": {
        "dependency_kind": {
          "enum": [
            "formal_library", "software_package", "dataset", "artifact",
            "configuration", "environment", "source", "other"
          ]
        },
        "dependency_ref": { "type": "string", "minLength": 1, "maxLength": 256 },
        "dependency_digest": { "$ref": "#/$defs/digest" },
        "disposition": {
          "enum": [
            "freshly_checked", "reused_with_bound_verification",
            "reused_without_recheck", "unavailable"
          ]
        },
        "verification_evidence_ref": { "type": "string", "minLength": 1, "maxLength": 256 },
        "child_closure_ref": { "type": "string", "minLength": 1, "maxLength": 256 },
        "child_closure_digest": { "$ref": "#/$defs/digest" }
      }
    },
    "replay": {
      "type": "object",
      "additionalProperties": false,
      "required": ["mode", "actor_ref", "run_id", "input_digest", "output_digest"],
      "properties": {
        "mode": {
          "enum": [
            "original", "same_context_replay", "separate_context_replay", "unknown_context_replay"
          ]
        },
        "actor_ref": { "type": "string", "minLength": 1, "maxLength": 256 },
        "run_id": { "type": "string", "minLength": 1, "maxLength": 256 },
        "input_digest": { "$ref": "#/$defs/digest" },
        "output_digest": { "$ref": "#/$defs/digest" },
        "prior_run_ref": { "type": "string", "minLength": 1, "maxLength": 256 },
        "prior_actor_ref": { "type": "string", "minLength": 1, "maxLength": 256 },
        "prior_environment_digest": { "$ref": "#/$defs/digest" },
        "separation_evidence_refs": {
          "type": "array",
          "maxItems": 32,
          "uniqueItems": true,
          "items": { "type": "string", "minLength": 1, "maxLength": 256 }
        }
      }
    }
  }
}
```

Cross-field replay, dependency-disposition, canonical-order, child-pairing, content-digest, dependency-digest, and coverage constraints remain semantic-validator responsibilities; do not duplicate them with fragile schema conditionals in v0.

- [ ] **Step 3: Add schema-vs-validator structural parity tests**

Assert exact enum and ceiling parity by reading schema constants:

```js
const schema = await readSchema();
assert.deepEqual(
  schema.properties.coverage_claim.enum,
  ['target_only', 'partial_closure', 'declared_closure_checked', 'fresh_rebuild']
);
assert.deepEqual(
  schema.$defs.replay.properties.mode.enum,
  ['original', 'same_context_replay', 'separate_context_replay', 'unknown_context_replay']
);
assert.equal(schema.properties.dependencies.maxItems, REPRODUCIBILITY_CLOSURE_LIMITS.direct_dependencies);
assert.equal(schema.properties.limitations.maxItems, REPRODUCIBILITY_CLOSURE_LIMITS.limitation_items);
assert.equal(
  schema.$defs.replay.properties.separation_evidence_refs.maxItems,
  REPRODUCIBILITY_CLOSURE_LIMITS.separation_evidence_refs
);
```

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
node --test mesh/test/epistemic-reproducibility-closure.test.mjs
```

- [ ] **Step 5: Commit Task 4**

```bash
git add mesh/config/epistemic-reproducibility-closure-v0.schema.json mesh/test/epistemic-reproducibility-closure.test.mjs
git commit -m "feat: add reproducibility closure schema mirror"
```

---

### Task 5: Authority boundary, anti-scalar protections, and source reachability

**Files:**
- Create: `mesh/test/epistemic-reproducibility-authority-boundary.test.mjs`
- Modify only if required by test-discovered defect: `mesh/src/lib/epistemic-reproducibility-closure.mjs`

**Interfaces:**
- Proves E2-RC is inert evidence and cannot become an alternate authority or truth primitive.

- [ ] **Step 1: Write the authority-boundary tests before any corrective production change**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  computeDependencyClosureDigest,
  finalizeReproducibilityClosure
} from '../src/lib/epistemic-reproducibility-closure.mjs';

const D = (hex = 'a') => `sha256:${hex.repeat(64)}`;

function validInput(overrides = {}) {
  const input = {
    schema: 'axiom-epistemic-reproducibility-closure.v0',
    version: '0.1.0',
    status: 'inert-evidence',
    closure_id: 'closure:authority:001',
    target: { target_ref: 'claim:001', target_kind: 'epistemic_claim', target_digest: D('1') },
    verifier: {
      verifier_id: 'validator:fixture', verifier_version: '1.0.0',
      implementation_digest: D('2'), profile_digest: D('3')
    },
    environment: { environment_digest: D('4') },
    dependencies: [],
    dependency_closure_digest: '',
    coverage_claim: 'target_only',
    replay: {
      mode: 'original', actor_ref: 'actor:fixture', run_id: 'run:fixture',
      input_digest: D('5'), output_digest: D('6')
    },
    result: 'pass',
    limitations: [],
    recorded_at: '2026-09-08T16:00:00.000Z',
    contains_secret_material: false,
    canonical_state: 'proposal',
    authority_effect: 'none',
    network_effect: 'none',
    execution_authority: false,
    ...overrides
  };
  input.dependency_closure_digest = computeDependencyClosureDigest(input.dependencies);
  return input;
}

test('E2-RC cannot claim truth, scalar confidence, canonicality, independence, or authority', () => {
  for (const mutation of [
    { verified: true },
    { truth: true },
    { confidence: 1 },
    { score: 100 },
    { independent: true },
    { capability_id: 'cap:forbidden' },
    { grant_id: 'grant:forbidden' },
    { consent: true },
    { canonical_state: 'canonical' },
    { authority_effect: 'allow' },
    { network_effect: 'allowed' },
    { execution_authority: true }
  ]) {
    assert.throws(() => finalizeReproducibilityClosure(validInput(mutation)), /unknown|canonical|authority|network|execution/i);
  }
});
```

- [ ] **Step 2: Add source-level forbidden-import test**

```js
test('E2-RC production module imports no authority, network, provider, prover, or filesystem surfaces', async () => {
  const source = await readFile(new URL('../src/lib/epistemic-reproducibility-closure.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  assert.deepEqual(imports, ['./canonical.mjs']);

  const forbiddenTokens = [
    'gateway', 'hypervisor', 'sandbox', 'grid', 'capability', 'credential', 'provider',
    'wallet', 'node:fs', 'node:http', 'node:https', 'node:net', 'node:dgram', 'node:tls',
    'node:child_process', 'lean', 'coq', 'isabelle', 'prover'
  ];
  for (const token of forbiddenTokens) {
    assert.equal(source.toLowerCase().includes(`from '${token}`), false, `forbidden source reachability token ${token}`);
  }
});
```

- [ ] **Step 3: Add capability-registry and E0/E1 byte-preservation tests**

Do not rely on memory for the four E0/E1 schema digests. Read the exact owner-approved values from `docs/superpowers/plans/2026-09-07-epistemic-fabric-stage5b-e0-e1.md` and pin them in the test exactly as recorded there:

```js
import { createHash } from 'node:crypto';

const expectedSchemaDigests = new Map([
  ['epistemic-record-v0.schema.json', 'd647878abe6912d580ac60122b4a15a2ae845b411d4236630ce19a62deb0c7ae'],
  ['epistemic-source-v0.schema.json', 'd359eb1238eb44d573ff273aa8b89780b42b85b7e67f0f80f2a47f3eae6a3868'],
  ['epistemic-claim-v0.schema.json', 'a7c6b20afcb223a2e48db9543d5e332bb8de9b752110d68b80582e63f02f2c87'],
  ['epistemic-evidence-v0.schema.json', '207ab9477334eb6654869abc9e688a7cbe40ba5065c72f349f22ede8d944d628']
]);

for (const [name, expected] of expectedSchemaDigests) {
  const bytes = await readFile(new URL(`../config/${name}`, import.meta.url));
  const actual = createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual, expected, `${name} must remain byte-identical to Amendment A approval`);
}

const registry = JSON.parse(await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8'));
assert.deepEqual(
  registry.capabilities.map((item) => item.id).filter((id) => /reproduc|epistemic/i.test(id)),
  []
);
```

This is a load-bearing regression: E2-RC may add inert evidence without mutating E0/E1 identity or runnable capability state.

- [ ] **Step 4: Run the authority test and witness any RED defect before correction**

```bash
node --test mesh/test/epistemic-reproducibility-authority-boundary.test.mjs
```

Expected: PASS if Tasks 1–4 already reject unknown fields and preserve the boundary. If a test fails, make the smallest fail-closed validator correction, rerun this focused test, and then rerun the behavioral test.

- [ ] **Step 5: Run both E2-RC test files**

```bash
node --test \
  mesh/test/epistemic-reproducibility-closure.test.mjs \
  mesh/test/epistemic-reproducibility-authority-boundary.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add mesh/test/epistemic-reproducibility-authority-boundary.test.mjs mesh/src/lib/epistemic-reproducibility-closure.mjs
git commit -m "test: enforce reproducibility closure authority boundary"
```

If the production module did not require correction, commit only the new test file.

---

### Task 6: Documentation status, exact-head verification, and review gate

**Files:**
- Modify: `docs/MASTER-TODO-EPISTEMIC-FABRIC.md`
- Modify: `docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md`
- No production-code change in this task.

**Interfaces:**
- Records what is actually implemented without claiming E3+, canonical admission, formal prover integration, or independent reproduction.

- [ ] **Step 1: Update the Master TODO with an E2-RC candidate section**

Add a section that states exactly:

```markdown
## Amendment B implementation track — E2-RC reproducibility closure

E2-RC is an inert evidence candidate only. It records exact target/verifier/environment/dependency/replay scope and remains proposal-only.

Implemented candidate surfaces:

- `axiom-epistemic-reproducibility-closure.v0` schema;
- deterministic self-excluding content digest;
- domain-separated direct dependency-closure digest;
- explicit fresh/reused/unavailable dependency dispositions;
- coverage claims bounded by the actual declared dependency state;
- replay context classified as original/same/separate/unknown without asserting epistemic independence;
- zero-authority and zero-network semantics.

Non-claims:

- no E3 canonical admission;
- no E4 evidence-state vector or failure-provenance implementation;
- no E6 continuous ingestion;
- no E7 continuation packet or frontier engine;
- no Lean/Coq/Isabelle/prover invocation;
- no FORMAL-001 runtime dependency;
- no independent-reproduction truth claim;
- no capability, policy, network, repository, spending, deployment, or experiment authority.
```

Do not mark the section “promoted” until the exact candidate head passes protected checks and review.

- [ ] **Step 2: Update the threat-model Amendment B status narrowly**

Under the existing `Verification-closure ambiguity`, `Dependency shadowing`, and `Replay-depth spoofing` threats, add a candidate-status note stating that E2-RC now has an inert structural contract candidate, while semantic evidence-independence, external prover assurance, global dependency-graph validation, and canonical admission remain unimplemented.

Use this exact non-claim sentence:

```markdown
The E2-RC candidate records bounded closure/replay evidence only; it does not prove that a verifier is trustworthy, that dependencies are externally true, that a replay is epistemically independent, or that any external effect is permitted.
```

- [ ] **Step 3: Run documentation registration and focused tests**

```bash
node --test mesh/test/epistemic-fabric-doc-registration.test.mjs
node mesh/src/check-docs.mjs
```

Expected: PASS. This implementation slice does not add a new Markdown path because the plan document must already have been canonically registered by the planning PR before execution starts.

- [ ] **Step 4: Run the complete local check**

```bash
npm run check
```

Expected: exit code 0 with no failing tests.

- [ ] **Step 5: Inspect the final diff for forbidden surfaces**

Run:

```bash
git diff --name-only <EXACT_IMPLEMENTATION_BASE_SHA>...HEAD
```

The exact base SHA is supplied by the separately approved E2-RC gate before execution. The final changed-file set must be a subset of:

```text
mesh/config/epistemic-reproducibility-closure-v0.schema.json
mesh/src/lib/epistemic-reproducibility-closure.mjs
mesh/test/epistemic-reproducibility-closure.test.mjs
mesh/test/epistemic-reproducibility-authority-boundary.test.mjs
docs/MASTER-TODO-EPISTEMIC-FABRIC.md
docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md
```

If any additional production, capability, policy, runtime, Gateway, Hypervisor, Sandbox, Grid, provider, credential, or network file appears, STOP and reopen the Stage 5B gate rather than broadening the plan.

- [ ] **Step 6: Commit documentation evidence**

```bash
git add docs/MASTER-TODO-EPISTEMIC-FABRIC.md docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md
git commit -m "docs: record E2 reproducibility closure candidate"
```

- [ ] **Step 7: Push and open a draft implementation PR**

PR title:

```text
feat: add E2 reproducibility closure v0
```

PR body must state:

```markdown
## Stage

E2-RC only. Inert reproducibility-closure evidence; no E3+, no canonical admission, no authority promotion.

## Exact base

Record the exact `main` SHA approved by the fresh E2-RC gate.

## Authority boundary

- E0/E1 schema bytes unchanged;
- `mesh/config/capabilities.json` unchanged;
- no Gateway/Hypervisor/Sandbox/Grid path;
- no network/provider/prover invocation;
- no canonical admission;
- no execution authority;
- no claim of epistemic independence;
- no external-world truth claim.

## TDD evidence

List the exact RED and GREEN commit SHAs for Tasks 1–5.
```

- [ ] **Step 8: Require protected exact-head verification before readiness**

The exact final head must complete successfully under the repository’s protected workflows, including at minimum:

```text
Clean Kernel / verify
Clean Kernel / container
Windows Compatibility
macOS Apple Silicon compatibility
macOS Intel compatibility
Analyze (actions)
Analyze (javascript-typescript)
```

Do not represent the candidate as passing, ready, or complete until the workflow results for the exact immutable head have been read and confirmed.

- [ ] **Step 9: Independent review focus**

The final review must specifically test or inspect:

```text
1. dependency disposition cannot overstate fresh checking;
2. coverage_claim cannot exceed direct dependency state;
3. child closure refs/digests cannot be silently decoupled;
4. dependency bytes/digests change closure identity;
5. replay context cannot self-label as independent;
6. separate-context replay requires bound separation evidence;
7. result=pass does not create verified/truth/confidence/authority fields;
8. E0/E1 schema bytes remain exact Amendment A bytes;
9. no capability or effect path is reachable;
10. no unmerged FORMAL-001 / Verified Work Graph source is imported.
```

Any finding that requires a new field class, new runtime dependency, external verifier execution, store/federation behavior, canonical admission, or effect-bearing consumer reopens design/gate review instead of being patched into this slice.

---

## Plan Self-Review Record

### Spec coverage

This plan covers the Amendment B E2-RC requirements as follows:

- exact statement/target identity: Tasks 1 and 4;
- verifier identity/version/profile/implementation binding: Tasks 1 and 4;
- execution-environment digest: Tasks 1 and 4;
- dependency-closure digest and explicit checked/reused/unavailable state: Task 2;
- strongest claim cannot exceed checked closure: Task 2;
- cached/reused dependencies remain visible: Task 2;
- replay actor/run/input/output/environment binding: Task 3;
- self-declared replay cannot become “independent”: Tasks 3 and 5;
- no scalar truth/confidence/authority collapse: Task 5;
- zero-authority and no-effect boundary: Task 5;
- exact-head verification and future-phase non-claims: Task 6.

### Deliberate exclusions

The following belong to later separately gated work and are not implementation gaps in E2-RC:

```text
E4-EV evidence-state vectors
E4-FP failure provenance
IndependenceCluster semantics
continuous feeds
continuation packets
computed frontier
canonical epistemic admission
real theorem-prover execution
FORMAL-001 adapter integration
Verified Work Graph integration
cross-node closure graph validation
```

### Type/interface consistency

The plan uses one digest representation (`sha256:<64 lowercase hex>`), one public module interface, one set of coverage enum values, one set of replay enum values, and one bounded direct-dependency schema across all tasks. `summarizeReproducibilityClosure()` deliberately returns only counts + declared coverage/replay/result dimensions and no derived truth, confidence, verification, independence, or authority field.

### No-placeholder check

The only value intentionally supplied later is `<EXACT_IMPLEMENTATION_BASE_SHA>` in the execution command and PR record. That is not an implementation placeholder: the Stage 5B fresh-gate rule requires the SHA to be the exact future `main` head after prerequisite PRs merge, so hard-coding today’s stale SHA would violate the design. The executor must obtain that SHA from the separately approved E2-RC gate before Task 1 begins.

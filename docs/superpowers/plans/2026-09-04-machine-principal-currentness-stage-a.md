# Machine-Principal Currentness Stage A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct the current-main machine-principal lifecycle-currentness foundation so AXIOM can retain and verify the latest signed lifecycle authority state and evaluate it against one exact pending effect admission without changing Sandbox or granting effect authority.

**Architecture:** Build three focused current-main modules: operation-independent lifecycle/currentness semantics, a signed checkpoint plus controller-trust resolver, a durable retained-head store, and an exact retained-head admission evaluator. Reuse existing `canonical.mjs`, Agent Trust machine-identity/currentness evidence, and delegation-root durable-store patterns rather than forward-porting stale #1420/#1444 runtime wiring. Stage A ends before lifecycle mutation and before Gateway/Hypervisor/Sandbox/Grid integration.

**Tech Stack:** Node.js ESM; Node `crypto` Ed25519; Node `fs/promises`; `node:test`; current AXIOM canonicalization/digest helpers; current Agent Trust identity/currentness verifier; current repository CI (`npm run check`, Clean Kernel, Windows/macOS compatibility, CodeQL).

**Spec:** `docs/superpowers/specs/2026-09-04-machine-principal-currentness-reconstruction-design.md`

## Global Constraints

- Reconstruction baseline approved at `6170bb13d077ec5f5752853ef23da71dc3798cee`; before implementation, refresh against protected `main` and stop if semantic conflicts have landed.
- Historical #1420/#1440/#1444 code is provenance only; do not merge or cherry-pick the stale A6 stack wholesale.
- Currentness evidence is not authority. Every introduced projection must preserve `authority_effect: 'none'`, `execution_authority_granted: false`, and `global_currentness_claimed: false`.
- `active` and `narrowed` are potentially usable only when the retained authority digest exactly equals the pending capability-bound authority digest. `revoked`, `compromised`, and `expired` are non-usable terminal states for Stage A.
- Machine-principal lifecycle expiry is an explicit retained `expired` successor. Ordinary checkpoint/evidence/credential freshness may still fail by wall-clock time without creating a lifecycle mutation.
- Signed but unretained evidence is not the retained latest head.
- No caller-controlled state path, trust root, retained-head selection, or currentness source may enter the pending effect request.
- No Sandbox, Gateway, Hypervisor, Grid, capability-registry, service-network, or runtime-adapter production path changes in Stage A.
- Existing capability signature, TTL, replay, policy, plan, destination, subject, approval, and durable-consumption checks remain untouched.
- Required currentness fails closed; `indeterminate != allow`.
- Use deterministic fixed test clocks. Do not add wall-clock-decaying fixtures.
- Node engine remains `>=22.23.2 <23 || >=24.14.0 <25`.
- External RT-AUTH-001 revoke/narrow classification remains `ARCHITECTURE-LIMITED / NOT REPRODUCED` throughout Stage A.

---

## File Structure

Create these focused implementation files:

- `mesh/src/lib/machine-principal-currentness.mjs` — strict lifecycle-state normalization, exact effect-admission digest, and pure currentness evaluation.
- `mesh/src/lib/machine-principal-currentness-checkpoint.mjs` — controller-evidence resolution, Ed25519 checkpoint creation/verification, and checkpoint transition validation.
- `mesh/src/lib/machine-principal-currentness-store.mjs` — durable canonical JSONL retained-head storage, restart verification, rollback/equivocation/torn-state defenses, and latest-head projection.
- `mesh/src/lib/machine-principal-effect-currentness.mjs` — trusted-store resolver plus exact pending-admission evaluation against the actual retained latest head.

Create these tests:

- `mesh/test/machine-principal-currentness.test.mjs`
- `mesh/test/machine-principal-currentness-checkpoint.test.mjs`
- `mesh/test/machine-principal-currentness-store.test.mjs`
- `mesh/test/machine-principal-effect-currentness.test.mjs`

Modify only documentation/governance surfaces required by the supported-document boundary:

- `mesh/src/check-docs.mjs` — register the approved spec and this plan if the implementation branch carries them.
- `docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md` — add the current-main Stage A boundary only after code is green; do not copy the stale historical wording that treated every `narrowed` state as unusable.

Do **not** create a dedicated workflow in Stage A. Existing protected CI is the merge gate unless repository policy changes before execution.

---

### Task 1: Lifecycle State and Exact Admission Semantics

**Files:**
- Create: `mesh/src/lib/machine-principal-currentness.mjs`
- Create: `mesh/test/machine-principal-currentness.test.mjs`

**Interfaces:**
- Consumes: `ValidationError`, `assertPlainObject`, `assertString`, `digestObject` from `mesh/src/lib/canonical.mjs`.
- Produces:
  - `MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA = 'axiom-machine-principal-currentness.v1'`
  - `MACHINE_PRINCIPAL_EFFECT_ADMISSION_SCHEMA = 'axiom-machine-principal-effect-admission.v1'`
  - `MACHINE_PRINCIPAL_EFFECT_CURRENTNESS_EVALUATION_SCHEMA = 'axiom-machine-principal-effect-currentness-evaluation.v1'`
  - `normalizeMachinePrincipalCurrentness(value) -> frozen normalized state`
  - `machinePrincipalAdmissionDigest(input) -> lowercase SHA-256 digest`
  - `evaluateMachinePrincipalCurrentness(input) -> frozen { allow, code, ...nonclaims }`

- [ ] **Step 1: Write the failing lifecycle normalization and narrowed-state tests**

Create `mesh/test/machine-principal-currentness.test.mjs` with fixed constants and helpers:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
  evaluateMachinePrincipalCurrentness,
  machinePrincipalAdmissionDigest,
  normalizeMachinePrincipalCurrentness
} from '../src/lib/machine-principal-currentness.mjs';

const T0 = '2026-09-04T19:30:00.000Z';
const T1 = '2026-09-04T19:30:30.000Z';
const AUTH_A = 'a'.repeat(64);
const AUTH_B = 'b'.repeat(64);
const HEAD_1 = '1'.repeat(64);
const HEAD_2 = '2'.repeat(64);
const CREDENTIAL = 'c'.repeat(64);
const CONTROLLER_KEY = 'd'.repeat(64);

function state(overrides = {}) {
  return {
    schema: MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
    principal_id: 'agent.currentness.stage-a',
    principal_type: 'agent',
    authority_digest: AUTH_A,
    status: 'active',
    sequence: 1,
    observed_at: T0,
    source_head_digest: HEAD_1,
    predecessor_head_digest: null,
    controller_id: 'service.currentness-controller',
    controller_key_id: CONTROLLER_KEY,
    controller_credential_digest: CREDENTIAL,
    controller_key_epoch: 1,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false,
    ...overrides
  };
}

function admission(authorityDigest = AUTH_A) {
  return {
    principalId: 'agent.currentness.stage-a',
    principalType: 'agent',
    authorityDigest,
    capabilityId: 'capability:stage-a:1',
    intentDigest: 'e'.repeat(64),
    planDigest: 'f'.repeat(64),
    effectDestination: 'sandbox:builtin:stage-a'
  };
}

test('normalizes exact non-authorizing lifecycle state', () => {
  const normalized = normalizeMachinePrincipalCurrentness(state());
  assert.equal(normalized.status, 'active');
  assert.equal(normalized.authority_effect, 'none');
  assert.equal(normalized.execution_authority_granted, false);
  assert.equal(normalized.global_currentness_claimed, false);
});

test('narrowed state is usable only for the exact narrowed authority digest', () => {
  const narrowed = state({
    authority_digest: AUTH_B,
    status: 'narrowed',
    sequence: 2,
    observed_at: T1,
    source_head_digest: HEAD_2,
    predecessor_head_digest: HEAD_1
  });
  const bAdmission = machinePrincipalAdmissionDigest(admission(AUTH_B));
  const current = evaluateMachinePrincipalCurrentness({
    currentness: narrowed,
    expectedPrincipalId: 'agent.currentness.stage-a',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest: AUTH_B,
    expectedAdmissionDigest: bAdmission,
    now: '2026-09-04T19:30:40.000Z',
    maxAgeMs: 60_000
  });
  assert.equal(current.allow, true);
  assert.equal(current.code, 'machine_currentness_satisfied');

  const oldA = evaluateMachinePrincipalCurrentness({
    currentness: narrowed,
    expectedPrincipalId: 'agent.currentness.stage-a',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest: AUTH_A,
    expectedAdmissionDigest: machinePrincipalAdmissionDigest(admission(AUTH_A)),
    now: '2026-09-04T19:30:40.000Z',
    maxAgeMs: 60_000
  });
  assert.deepEqual(
    { allow: oldA.allow, code: oldA.code },
    { allow: false, code: 'machine_currentness_authority_changed' }
  );
});
```

Add table-driven terminal/freshness tests in the same file:

```js
for (const status of ['revoked', 'compromised', 'expired']) {
  test(`${status} lifecycle state fails closed`, () => {
    const result = evaluateMachinePrincipalCurrentness({
      currentness: state({ status }),
      expectedPrincipalId: 'agent.currentness.stage-a',
      expectedPrincipalType: 'agent',
      expectedAuthorityDigest: AUTH_A,
      expectedAdmissionDigest: machinePrincipalAdmissionDigest(admission()),
      now: '2026-09-04T19:30:10.000Z',
      maxAgeMs: 60_000
    });
    assert.equal(result.allow, false);
    assert.equal(result.code, `machine_currentness_${status}`);
  });
}

test('future and stale observations are distinct fail-closed outcomes', () => {
  const digest = machinePrincipalAdmissionDigest(admission());
  assert.equal(evaluateMachinePrincipalCurrentness({
    currentness: state({ observed_at: '2026-09-04T19:31:00.000Z' }),
    expectedPrincipalId: 'agent.currentness.stage-a',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest: AUTH_A,
    expectedAdmissionDigest: digest,
    now: T0,
    maxAgeMs: 60_000
  }).code, 'machine_currentness_future');

  assert.equal(evaluateMachinePrincipalCurrentness({
    currentness: state(),
    expectedPrincipalId: 'agent.currentness.stage-a',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest: AUTH_A,
    expectedAdmissionDigest: digest,
    now: '2026-09-04T19:32:00.001Z',
    maxAgeMs: 60_000
  }).code, 'machine_currentness_stale');
});
```

Also cover: unknown fields, wrong schema/type, malformed digests, genesis with predecessor, non-genesis without predecessor, zero/unsafe sequence, non-canonical UTC timestamp, invalid controller metadata, and attempted `authority_effect`, `execution_authority_granted`, or `global_currentness_claimed` elevation.

- [ ] **Step 2: Run the focused test to verify RED**

Run from repository root:

```bash
node --test mesh/test/machine-principal-currentness.test.mjs
```

Expected: FAIL because `mesh/src/lib/machine-principal-currentness.mjs` does not exist on current `main`. Do not accept a RED caused by another import or unrelated repository failure.

- [ ] **Step 3: Implement strict lifecycle normalization and exact admission digest**

Create `mesh/src/lib/machine-principal-currentness.mjs` using current `canonical.mjs` helpers. The exact normalized state keys are:

```js
const CURRENTNESS_KEYS = new Set([
  'schema',
  'principal_id',
  'principal_type',
  'authority_digest',
  'status',
  'sequence',
  'observed_at',
  'source_head_digest',
  'predecessor_head_digest',
  'controller_id',
  'controller_key_id',
  'controller_credential_digest',
  'controller_key_epoch',
  'authority_effect',
  'execution_authority_granted',
  'global_currentness_claimed'
]);
```

Implement `machinePrincipalAdmissionDigest` over exactly:

```js
return digestObject({
  schema: MACHINE_PRINCIPAL_EFFECT_ADMISSION_SCHEMA,
  principal_id: principalId,
  principal_type: principalType,
  authority_digest: authorityDigest,
  capability_id: capabilityId,
  intent_digest: intentDigest,
  plan_digest: planDigest,
  effect_destination: effectDestination
});
```

Implement `evaluateMachinePrincipalCurrentness` in this order:

```js
if (state.principal_id !== expectedPrincipalId) return deny('machine_currentness_principal_mismatch');
if (state.principal_type !== expectedPrincipalType) return deny('machine_currentness_principal_type_mismatch');
if (state.authority_digest !== expectedAuthorityDigest) return deny('machine_currentness_authority_changed');
if (!['active', 'narrowed'].includes(state.status)) return deny(`machine_currentness_${state.status}`);

const ageMs = nowMs - observedMs;
if (ageMs < 0) return deny('machine_currentness_future');
if (ageMs > maxAgeMs) return deny('machine_currentness_stale');
```

Successful evaluation must include deterministic `currentness_evidence_digest`, `admission_digest`, `effect_currentness_evaluation_digest`, plus the fixed nonclaims. It must never return ordinary effect authority.

- [ ] **Step 4: Run focused tests to verify GREEN**

```bash
node --test mesh/test/machine-principal-currentness.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add mesh/src/lib/machine-principal-currentness.mjs mesh/test/machine-principal-currentness.test.mjs
git commit -m "feat: add machine principal currentness semantics"
```

---

### Task 2: Controller-Scoped Signed Currentness Checkpoints

**Files:**
- Create: `mesh/src/lib/machine-principal-currentness-checkpoint.mjs`
- Create: `mesh/test/machine-principal-currentness-checkpoint.test.mjs`
- Reuse unchanged: `mesh/src/lib/agent-trust-machine-identity.mjs`
- Reuse unchanged: `mesh/src/lib/agent-trust-currentness-checkpoint.mjs`

**Interfaces:**
- Consumes Task 1 `normalizeMachinePrincipalCurrentness`.
- Consumes current Agent Trust `evaluateAgentCurrentnessAtEffect`, `verifyMachineIdentityCredentialHistory`, and `machineIdentityKeyId`.
- Produces:
  - `MACHINE_PRINCIPAL_CURRENTNESS_CHECKPOINT_SCHEMA = 'axiom-machine-principal-currentness-checkpoint.v1'`
  - `resolveMachineCurrentnessControllerTrust(input) -> frozen current controller projection`
  - `createMachinePrincipalCurrentnessCheckpoint({ currentness, controllerPrivateKey, controllerTrust })`
  - `verifyMachinePrincipalCurrentnessCheckpoint(raw, { controllerTrust, expectedPrincipalId, expectedPrincipalType, retainedCheckpoint })`
  - `validateMachinePrincipalCurrentnessCheckpointTransition(previous, current, { controllerTrust })`

- [ ] **Step 1: Write a failing checkpoint/control-trust test**

Use Node Ed25519 keys and the repository's existing Agent Trust machine-identity/currentness test helpers as the fixture pattern. The test must prove three separate facts:

```js
test('controller-currentness evidence selects the exact active controller key and checkpoint stays non-authorizing', () => {
  const controllerTrust = resolveMachineCurrentnessControllerTrust(controllerEvidenceFixture());
  assert.equal(controllerTrust.controller_id, 'service.machine-currentness-controller');
  assert.equal(controllerTrust.controller_key_id, controllerTrust.active_operational_key_id);
  assert.equal(controllerTrust.authority_effect, 'none');
  assert.equal(controllerTrust.execution_authority_granted, false);

  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: lifecycleState({
      controller_id: controllerTrust.controller_id,
      controller_key_id: controllerTrust.controller_key_id,
      controller_credential_digest: controllerTrust.controller_credential_digest,
      controller_key_epoch: controllerTrust.controller_key_epoch
    }),
    controllerPrivateKey: fixture.controllerOperational.privateKey,
    controllerTrust
  });

  const verified = verifyMachinePrincipalCurrentnessCheckpoint(checkpoint, {
    controllerTrust,
    expectedPrincipalId: 'agent.currentness.stage-a',
    expectedPrincipalType: 'agent'
  });
  assert.equal(verified.checkpoint_digest, checkpoint.checkpoint_digest);
  assert.equal(verified.statement.controller_credential_digest, controllerTrust.controller_credential_digest);
  assert.equal(verified.execution_authority_granted, false);
});
```

`controllerEvidenceFixture()` must create a controller machine-identity credential and retained Agent Trust currentness checkpoint with fixed timestamps. The controller currentness checkpoint is evidence-only; it is used only to identify the currently usable operational verification key.

Add negatives for:

- controller currentness status revoked/expired/not-yet-valid;
- wrong retained/latest controller checkpoint digest;
- controller operational key substitution;
- controller credential digest or key epoch mismatch in lifecycle state;
- principal id/type substitution;
- state/statement digest tamper;
- signature tamper;
- checkpoint digest tamper;
- unknown top-level or statement fields;
- sequence transition not `+1`;
- wrong predecessor checkpoint/source-head binding;
- non-advancing `observed_at`.

- [ ] **Step 2: Run the focused checkpoint test to verify RED**

```bash
node --test mesh/test/machine-principal-currentness-checkpoint.test.mjs
```

Expected: FAIL because the checkpoint module is missing.

- [ ] **Step 3: Implement controller-trust resolution by composing current Agent Trust evidence**

`resolveMachineCurrentnessControllerTrust` must accept this exact input shape:

```js
{
  currentnessCheckpoint,
  trustedObserverPublicKey,
  credentialHistory,
  revocations,
  trustedIssuerPublicKey,
  expectedLatestCheckpointDigest,
  expectedControllerPrincipalId,
  evaluatedAt,
  maxAgeMs
}
```

Its implementation must call the current `evaluateAgentCurrentnessAtEffect` rather than duplicate issuer-evidence currentness semantics. Require `currentness_status === 'active'`. Then verify the credential history, find the exact credential whose digest equals `current_credential_digest`, and require its `operational_key_id`, `key_epoch`, and principal id to equal the evaluated currentness projection.

Return only this frozen trust projection:

```js
{
  controller_id: expectedControllerPrincipalId,
  controller_key_id: currentCredential.statement.operational_key_id,
  controller_credential_digest: currentCredential.credential_digest,
  controller_key_epoch: currentCredential.statement.key_epoch,
  operational_public_key: currentCredential.statement.operational_public_key,
  currentness_checkpoint_digest: currentnessCheckpoint.checkpoint_digest,
  evidence_scope: 'supplied-issuer-evidence-only',
  global_currentness_claimed: false,
  authority_effect: 'none',
  execution_authority_granted: false
}
```

Do not export or infer mutation authority from this object.

- [ ] **Step 4: Implement signed checkpoint creation/verification**

Use Ed25519 `sign`/`verify` over canonical JSON. The signed envelope shape is exactly:

```js
{
  schema: MACHINE_PRINCIPAL_CURRENTNESS_CHECKPOINT_SCHEMA,
  statement,
  statement_digest,
  controller_signature,
  checkpoint_digest
}
```

The `statement` is the normalized lifecycle state from Task 1. Do not inject an effect/admission digest into the checkpoint.

Require the supplied private key's public key ID to equal `controllerTrust.controller_key_id`, and require the lifecycle state's controller id/key/credential/epoch fields to equal the trust projection before signing or verifying.

`validateMachinePrincipalCurrentnessCheckpointTransition` must require:

```text
current.sequence === previous.sequence + 1
current.predecessor_head_digest === previous.source_head_digest
Date.parse(current.observed_at) > Date.parse(previous.observed_at)
principal id/type unchanged
```

It must not require authority digest equality because Stage B narrowing/revocation will legitimately change lifecycle authority state.

- [ ] **Step 5: Run currentness + checkpoint tests**

```bash
node --test \
  mesh/test/machine-principal-currentness.test.mjs \
  mesh/test/machine-principal-currentness-checkpoint.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add \
  mesh/src/lib/machine-principal-currentness-checkpoint.mjs \
  mesh/test/machine-principal-currentness-checkpoint.test.mjs
git commit -m "feat: add signed machine currentness checkpoints"
```

---

### Task 3: Durable Retained-Head Store

**Files:**
- Create: `mesh/src/lib/machine-principal-currentness-store.mjs`
- Create: `mesh/test/machine-principal-currentness-store.test.mjs`
- Reference only: `mesh/src/lib/delegation-root-attestation-key-currentness-store.mjs`
- Reference only: `mesh/test/delegation-root-attestation-key-currentness-store.test.mjs`

**Interfaces:**
- Consumes Task 2 `verifyMachinePrincipalCurrentnessCheckpoint` and `validateMachinePrincipalCurrentnessCheckpointTransition`.
- Produces:
  - `MACHINE_PRINCIPAL_CURRENTNESS_STORE_SCHEMA = 'axiom-machine-principal-currentness-store.v1'`
  - `openMachinePrincipalCurrentnessStore(options) -> MachinePrincipalCurrentnessStore`
  - store methods `snapshot()`, `verifyState()`, `retainedHead()`, `retain(checkpoint)`.

- [ ] **Step 1: Write failing durable-store tests by adapting the current delegation-root store pattern**

Use `mkdtemp`, `tmpdir`, `join`, fixed checkpoints, and `t.after(() => rm(...))`.

The first positive test must assert:

```js
const store = await openMachinePrincipalCurrentnessStore(openOptions(statePath, fixture));
const retained = await store.retain(fixture.checkpoint1);
assert.equal(retained.status, 'retained');
assert.equal(retained.checkpoint_digest, fixture.checkpoint1.checkpoint_digest);

const snapshot = store.snapshot();
assert.equal(snapshot.durable_checkpoint_count, 1);
assert.equal(snapshot.durable_head_checkpoint_digest, fixture.checkpoint1.checkpoint_digest);
assert.equal(snapshot.state_path_disclosed, false);
assert.equal(snapshot.local_durable_retention_claimed, true);
assert.equal(snapshot.storage_rollback_proof_claimed, false);
assert.equal(snapshot.hardware_monotonicity_claimed, false);
assert.equal(snapshot.global_currentness_claimed, false);
assert.equal(snapshot.authority_effect, 'none');
assert.equal(snapshot.execution_authority_granted, false);
```

Add focused tests for every store invariant:

1. reopen preserves exact retained head;
2. exact duplicate is `already-retained`;
3. same sequence/different digest is equivocation;
4. older checkpoint after advancement is rollback;
5. first retained checkpoint must be sequence 1;
6. sequence gap fails;
7. wrong predecessor fails through transition verification;
8. torn trailing JSONL line fails;
9. non-canonical JSON fails;
10. symlink/non-regular file fails;
11. checkpoint byte bound fails;
12. total state byte bound fails;
13. active disk/memory divergence fails;
14. tampered signed checkpoint in retained state fails;
15. truncated retained history beginning at sequence >1 fails;
16. source contains `await handle.sync()` and does not use `appendFile(`.

- [ ] **Step 2: Run durable-store test to verify RED**

```bash
node --test mesh/test/machine-principal-currentness-store.test.mjs
```

Expected: FAIL because the store module is missing.

- [ ] **Step 3: Implement the store with the current durable-store safety pattern**

Use these hard/default limits unless current repository constants have become stricter before execution:

```js
const DEFAULT_MAX_STATE_BYTES = 64 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_CHECKPOINT_BYTES = 2 * 1024 * 1024;
const HARD_MAX_CHECKPOINT_BYTES = 16 * 1024 * 1024;
```

`openMachinePrincipalCurrentnessStore` options are trusted composition, not request data:

```js
{
  statePath,
  controllerTrust,
  expectedPrincipalId,
  expectedPrincipalType,
  maxStateBytes,
  maxCheckpointBytes
}
```

Required private flow:

```text
create state file if missing
-> require regular non-symlink file
-> read bounded bytes
-> require newline-terminated canonical JSONL
-> verify every signed checkpoint with controllerTrust
-> require first sequence 1
-> validate every transition
-> retain in memory
```

`retain()` must re-read disk before append, compare exact retained history with memory, verify candidate, require next sequence, write canonical line through an opened file handle, `await handle.sync()`, close, then update memory.

`retainedHead()` returns the actual verified latest checkpoint object or `null`; it must not accept arguments that could select an older head.

- [ ] **Step 4: Run store and checkpoint tests**

```bash
node --test \
  mesh/test/machine-principal-currentness-checkpoint.test.mjs \
  mesh/test/machine-principal-currentness-store.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add \
  mesh/src/lib/machine-principal-currentness-store.mjs \
  mesh/test/machine-principal-currentness-store.test.mjs
git commit -m "feat: add durable machine currentness store"
```

---

### Task 4: Exact Retained-Head Effect-Currentness Evaluator

**Files:**
- Create: `mesh/src/lib/machine-principal-effect-currentness.mjs`
- Create: `mesh/test/machine-principal-effect-currentness.test.mjs`

**Interfaces:**
- Consumes Task 1 `machinePrincipalAdmissionDigest`, `evaluateMachinePrincipalCurrentness`.
- Consumes Task 2 checkpoint verification through the store.
- Consumes Task 3 store methods `verifyState()` and `retainedHead()`.
- Produces:
  - `resolveRetainedMachinePrincipalCurrentnessHead(input) -> frozen non-authorizing projection`
  - `evaluateRetainedMachinePrincipalEffectCurrentness(input) -> frozen prerequisite decision`

- [ ] **Step 1: Write failing retained-head evaluator tests**

The control test must prove the evaluator uses the store's actual latest head:

```js
test('exact retained active authority satisfies currentness prerequisite only', async t => {
  const fixture = await retainedFixture(t, { status: 'active', authorityDigest: AUTH_A });
  const result = await evaluateRetainedMachinePrincipalEffectCurrentness({
    currentnessStore: fixture.store,
    principalId: fixture.principalId,
    principalType: 'agent',
    authorityDigest: AUTH_A,
    capabilityId: 'capability:stage-a:1',
    intentDigest: 'e'.repeat(64),
    planDigest: 'f'.repeat(64),
    effectDestination: 'sandbox:builtin:stage-a',
    now: '2026-09-04T19:30:30.000Z',
    maxCurrentnessAgeMs: 60_000
  });

  assert.equal(result.allow, true);
  assert.equal(result.code, 'machine_currentness_satisfied');
  assert.equal(result.retained_checkpoint_digest, fixture.checkpoint.checkpoint_digest);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_authority_granted, false);
});
```

Add these exact hostile cases:

```text
retained authority B + pending old authority A -> machine_currentness_authority_changed
retained narrowed B + pending B -> allow prerequisite only
retained narrowed B + pending old A -> machine_currentness_authority_changed
retained revoked -> machine_currentness_revoked
retained compromised -> machine_currentness_compromised
retained expired -> machine_currentness_expired
wrong principal -> machine_currentness_principal_mismatch
wrong principal type -> machine_currentness_principal_type_mismatch
stale retained observation -> machine_currentness_stale
future retained observation -> machine_currentness_future
empty required store -> machine_currentness_unavailable
invalid/tampered durable state -> throw ValidationError; never ALLOW
```

Also prove two anti-substitution properties:

1. An older valid signed checkpoint object passed as unrelated data cannot change the result because the evaluator has no checkpoint parameter.
2. A newer valid but unretained checkpoint cannot change the result because the evaluator resolves only `currentnessStore.retainedHead()`.

- [ ] **Step 2: Run evaluator test to verify RED**

```bash
node --test mesh/test/machine-principal-effect-currentness.test.mjs
```

Expected: FAIL because the evaluator module is missing.

- [ ] **Step 3: Implement strict store requirement and retained-head resolver**

The resolver accepts only trusted composition inputs:

```js
export async function resolveRetainedMachinePrincipalCurrentnessHead({
  currentnessStore,
  expectedPrincipalId,
  expectedPrincipalType
} = {})
```

Require the store to expose `verifyState()` and `retainedHead()`. Call `await verifyState()` first. If `retainedHead()` is `null`, return a frozen unavailable projection rather than inventing a head.

Return only:

```js
{
  available: true,
  checkpoint: retained,
  retained_checkpoint_digest: retained.checkpoint_digest,
  retained_source_head_digest: retained.statement.source_head_digest,
  retained_sequence: retained.statement.sequence,
  principal_id: retained.statement.principal_id,
  principal_type: retained.statement.principal_type,
  authority_digest: retained.statement.authority_digest,
  status: retained.statement.status,
  observed_at: retained.statement.observed_at,
  controller_credential_digest: retained.statement.controller_credential_digest,
  controller_key_epoch: retained.statement.controller_key_epoch,
  authority_effect: 'none',
  execution_authority_granted: false,
  global_currentness_claimed: false
}
```

- [ ] **Step 4: Implement exact pending-admission evaluation**

Export:

```js
export async function evaluateRetainedMachinePrincipalEffectCurrentness({
  currentnessStore,
  principalId,
  principalType,
  authorityDigest,
  capabilityId,
  intentDigest,
  planDigest,
  effectDestination,
  now,
  maxCurrentnessAgeMs
} = {})
```

Compute `admissionDigest = machinePrincipalAdmissionDigest(...)`, resolve the actual retained head, then call Task 1's pure evaluator. On success, enrich the result with the exact retained checkpoint/source-head/sequence/controller evidence digests. On fail-closed lifecycle decisions, preserve the stable code and nonclaims.

Do not catch `ValidationError` from store verification and translate it to ALLOW. Invalid required currentness state must remain a hard failure or explicit denial according to existing AXIOM error conventions.

- [ ] **Step 5: Run all four focused Stage A test files**

```bash
node --test \
  mesh/test/machine-principal-currentness.test.mjs \
  mesh/test/machine-principal-currentness-checkpoint.test.mjs \
  mesh/test/machine-principal-currentness-store.test.mjs \
  mesh/test/machine-principal-effect-currentness.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add \
  mesh/src/lib/machine-principal-effect-currentness.mjs \
  mesh/test/machine-principal-effect-currentness.test.mjs
git commit -m "feat: add retained machine effect currentness evaluator"
```

---

### Task 5: Cross-Boundary Non-Authority Regression and Documentation Boundary

**Files:**
- Modify: `mesh/test/machine-principal-effect-currentness.test.mjs`
- Create: `docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md`
- Modify: `mesh/src/check-docs.mjs`
- Carry/retain: `docs/superpowers/specs/2026-09-04-machine-principal-currentness-reconstruction-design.md`
- Carry/retain: `docs/superpowers/plans/2026-09-04-machine-principal-currentness-stage-a.md`

**Interfaces:**
- Consumes all Stage A modules.
- Produces documentation and a regression proving Stage A cannot become a second authorization path.

- [ ] **Step 1: Add a failing semantic-elevation test**

Add to `machine-principal-effect-currentness.test.mjs`:

```js
test('currentness prerequisite cannot authorize an otherwise invalid pending effect', async t => {
  const fixture = await retainedFixture(t, { status: 'active', authorityDigest: AUTH_A });
  const currentness = await evaluateRetainedMachinePrincipalEffectCurrentness({
    currentnessStore: fixture.store,
    principalId: fixture.principalId,
    principalType: 'agent',
    authorityDigest: AUTH_A,
    capabilityId: 'capability:stage-a:1',
    intentDigest: 'e'.repeat(64),
    planDigest: 'f'.repeat(64),
    effectDestination: 'sandbox:builtin:stage-a',
    now: '2026-09-04T19:30:30.000Z',
    maxCurrentnessAgeMs: 60_000
  });

  assert.equal(currentness.allow, true);
  assert.equal(currentness.execution_authority_granted, false);
  assert.equal(currentness.authority_effect, 'none');
  assert.equal(Object.hasOwn(currentness, 'capability'), false);
  assert.equal(Object.hasOwn(currentness, 'grant'), false);
  assert.equal(Object.hasOwn(currentness, 'approval'), false);
});
```

Also statically read all four new source files and assert they do not import `sandbox/server.mjs`, Hypervisor, Grid execution, capability issuance, runtime adapters, or service mutation modules.

- [ ] **Step 2: Run focused tests**

```bash
node --test mesh/test/machine-principal-effect-currentness.test.mjs
```

Expected before any necessary tightening: either PASS if the APIs already satisfy the boundary or FAIL only on a concrete authority-looking field/import. If it passes immediately, retain the regression; TDD does not require manufacturing a false failure for a boundary already guaranteed by Tasks 1-4.

- [ ] **Step 3: Write the current-main security boundary document**

Create `docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md` with these required sections and exact claims:

```markdown
# Machine-principal effect-currentness — Stage A

Status: experimental current-main semantic/storage foundation; non-authorizing; not wired into Sandbox.

## Invariant
A valid capability and historically valid machine authority are not sufficient when currentness is required. Stage A can prove only whether the exact retained latest lifecycle authority still matches an exact pending admission.

## Lifecycle semantics
- active: potentially usable with exact authority match
- narrowed: potentially usable only for the new exact narrowed authority digest
- revoked / compromised / expired: non-usable terminal states
- lifecycle expiry is represented by an explicit retained expired successor

## Retained-head boundary
Signed but unretained evidence is not the retained latest head. Request data cannot choose the store path, trust root, or an older checkpoint.

## Explicit non-claims
Stage A does not authorize effects, mutate lifecycle state, wire Sandbox, prove global currentness, prove hostile-host rollback resistance, reproduce RT-AUTH-001, or certify WIMSE/MCP/A2A behavior.

## Next gates
Stage B: separately authorized lifecycle mutation source.
Stage C: durable-consume -> pre-effect barrier -> latest-head evaluation -> deterministic revoke/narrow race.
```

Do not copy the stale historical sentence that `narrowed` is always denied.

- [ ] **Step 4: Register supported documentation**

Modify `mesh/src/check-docs.mjs` `CANONICAL_DOCUMENTS` to include exactly:

```js
'docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md',
'docs/superpowers/specs/2026-09-04-machine-principal-currentness-reconstruction-design.md',
'docs/superpowers/plans/2026-09-04-machine-principal-currentness-stage-a.md',
```

Place each entry in its existing section/order: security docs with security docs, specs with specs, plans with plans.

- [ ] **Step 5: Run docs and focused Stage A tests**

```bash
cd mesh
npm run docs:check
cd ..
node --test \
  mesh/test/machine-principal-currentness.test.mjs \
  mesh/test/machine-principal-currentness-checkpoint.test.mjs \
  mesh/test/machine-principal-currentness-store.test.mjs \
  mesh/test/machine-principal-effect-currentness.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add \
  docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md \
  docs/superpowers/specs/2026-09-04-machine-principal-currentness-reconstruction-design.md \
  docs/superpowers/plans/2026-09-04-machine-principal-currentness-stage-a.md \
  mesh/src/check-docs.mjs \
  mesh/test/machine-principal-effect-currentness.test.mjs
git commit -m "docs: bind Stage A machine currentness boundary"
```

---

### Task 6: Full Repository Verification and Review Candidate

**Files:**
- No new product files unless verification exposes a specific defect.
- Review all Stage A files from Tasks 1-5.

**Interfaces:**
- Produces an exact-head review candidate; no merge or Stage B authorization.

- [ ] **Step 1: Run the complete local kernel check**

From `mesh/`:

```bash
npm run check
```

Expected: PASS. This executes setup verification, service-network policy, gateway-client contract, AXIOM One checks, registry checks, status checks, supported-document checks, and the full Node test suite.

If it fails, classify the exact failing assertion before modifying code. Do not weaken an existing guard merely to make Stage A green.

- [ ] **Step 2: Inspect the final diff for forbidden runtime wiring**

Run:

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

Expected implementation surface is limited to the approved spec/plan/security doc, `check-docs.mjs`, the four Stage A source modules, and four Stage A tests. There must be no changes under:

```text
mesh/src/sandbox/
mesh/src/hypervisor/
mesh/src/gateway/
mesh/src/grid/
mesh/config/capabilities.json
mesh/src/lib/runtime-adapter*
```

- [ ] **Step 3: Verify currentness nonclaims mechanically**

Run:

```bash
grep -R "execution_authority_granted" \
  mesh/src/lib/machine-principal-currentness*.mjs \
  mesh/src/lib/machine-principal-effect-currentness.mjs
```

Expected: every successful currentness/checkpoint/store/evaluator projection that exposes this field sets it to `false`.

Then run:

```bash
grep -R "authority_effect" \
  mesh/src/lib/machine-principal-currentness*.mjs \
  mesh/src/lib/machine-principal-effect-currentness.mjs
```

Expected: every Stage A authority-effect declaration is `'none'`.

- [ ] **Step 4: Commit any verification-only test/doc correction separately**

Only if Step 1-3 identified a concrete Stage A test/documentation defect, fix that exact defect, rerun the affected focused test plus `npm run check`, then commit with a narrow message such as:

```bash
git commit -am "test: harden machine currentness boundary"
```

Do not add Stage B mutation or Stage C runtime wiring during verification.

- [ ] **Step 5: Open a draft PR against current protected `main`**

PR title:

```text
security: reconstruct machine-principal currentness foundation
```

PR body must state:

```markdown
## Scope
Stage A only: strict machine lifecycle-currentness state, signed controller-bound checkpoints, durable retained-head storage, and exact retained-head effect-currentness prerequisite evaluation.

## Non-claims
- no Sandbox/Gateway/Hypervisor/Grid effect-path wiring
- no lifecycle mutation source
- no capability issuance or registry change
- currentness evidence grants no execution authority
- no global-currentness or hostile-host rollback-proof claim
- RT-AUTH-001 revoke/narrow race remains ARCHITECTURE-LIMITED / NOT REPRODUCED

## Verification
- focused Stage A tests
- `cd mesh && npm run check`
- protected Clean Kernel / container / Node 22
- Windows + macOS compatibility
- CodeQL Actions + JavaScript/TypeScript
```

Keep the PR draft until fresh exact-head protected checks and review are complete.

- [ ] **Step 6: Require protected CI on the exact PR head**

Do not infer CI success from an earlier commit. Verify the exact candidate head through:

```text
Clean Kernel: verify + container + compatibility-node-22
Windows Compatibility: Windows + macOS ARM + macOS Intel
CodeQL: actions + javascript-typescript
```

Expected: all required checks success.

- [ ] **Step 7: Review the PR for scope and semantic correctness**

Review specifically for:

```text
narrowed B can satisfy a B-bound prerequisite
old A is denied after retained B
terminal statuses deny
signed-unretained state cannot displace retained head
controller currentness remains evidence-relative
store durability claims do not become hostile-host rollback claims
no currentness artifact becomes bearer authority
no runtime effect path changed
```

Resolve only review findings that are technically valid and within Stage A.

- [ ] **Step 8: Final Stage A completion statement**

Only after exact-head protected CI and review are green, state:

```text
Stage A machine-principal currentness foundation is review-complete on the exact candidate. It provides non-authorizing retained lifecycle currentness evidence and exact pending-admission prerequisite evaluation. It does not wire the effect path or classify the external revoke/narrow race beyond ARCHITECTURE-LIMITED / NOT REPRODUCED.
```

Do not start Stage B in the same PR.

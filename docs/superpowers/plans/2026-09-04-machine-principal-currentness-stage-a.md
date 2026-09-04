# Machine-Principal Currentness Stage A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct the current-main machine-principal lifecycle-currentness foundation so AXIOM can retain and verify the latest signed lifecycle authority state and evaluate it against one exact pending effect admission without changing Sandbox or granting effect authority.

**Architecture:** Build four focused current-main modules: lifecycle/currentness semantics, signed controller-bound checkpoints, a durable retained-head store, and an exact retained-head effect-currentness evaluator. Reuse current `canonical.mjs`, Agent Trust identity/currentness evidence, and the delegation-root durable-store pattern instead of forward-porting the stale #1420/#1444 runtime stack. Stage A stops before lifecycle mutation and before Gateway/Hypervisor/Sandbox/Grid integration.

**Tech Stack:** Node.js ESM; Node `crypto` Ed25519; Node `fs/promises`; `node:test`; existing AXIOM canonicalization/digest helpers; existing Agent Trust machine-identity/currentness verifier; current repository CI (`npm run check`, Clean Kernel, Windows/macOS compatibility, CodeQL).

**Spec:** `docs/superpowers/specs/2026-09-04-machine-principal-currentness-reconstruction-design.md`

## Global Constraints

- Approved reconstruction baseline: `6170bb13d077ec5f5752853ef23da71dc3798cee`. At execution start, re-read protected `main`; if it advanced, rebase/carry the approved spec and plan onto the new exact main head before writing tests.
- Historical #1420/#1440/#1444 code is provenance only. Do not merge or cherry-pick the stale A6 stack wholesale.
- Currentness evidence is not authority. Every introduced projection must preserve `authority_effect: 'none'`, `execution_authority_granted: false`, and `global_currentness_claimed: false`.
- `active` and `narrowed` are potentially usable only when the retained authority digest exactly equals the pending capability-bound authority digest. `revoked`, `compromised`, and `expired` are non-usable terminal states for Stage A.
- Lifecycle expiry is represented by an explicit retained `expired` successor. Checkpoint/evidence/credential freshness may separately fail by time without creating a lifecycle mutation.
- Signed but unretained evidence is not the retained latest head.
- Caller data must not choose a state path, trust root, retained head, or currentness source.
- No Sandbox, Gateway, Hypervisor, Grid, capability-registry, service-network, or runtime-adapter production path changes in Stage A.
- Existing capability signature, TTL, replay, policy, plan, destination, subject, approval, and durable-consumption checks remain untouched.
- Required currentness fails closed; `indeterminate != allow`.
- Tests use fixed canonical UTC timestamps, never wall-clock-decaying fixtures.
- Node engine remains `>=22.23.2 <23 || >=24.14.0 <25`.
- RT-AUTH-001 revoke/narrow classification remains `ARCHITECTURE-LIMITED / NOT REPRODUCED` throughout Stage A.

## Locked File Structure

Create:

- `mesh/src/lib/machine-principal-currentness.mjs` — strict lifecycle state, exact admission digest, pure currentness evaluator.
- `mesh/src/lib/machine-principal-currentness-checkpoint.mjs` — controller-currentness trust resolution plus checkpoint sign/verify/transition.
- `mesh/src/lib/machine-principal-currentness-store.mjs` — canonical JSONL retained-head store.
- `mesh/src/lib/machine-principal-effect-currentness.mjs` — actual retained-head resolver and exact pending-admission prerequisite evaluator.
- `mesh/test/machine-principal-currentness.test.mjs`
- `mesh/test/machine-principal-currentness-checkpoint.test.mjs`
- `mesh/test/machine-principal-currentness-store.test.mjs`
- `mesh/test/machine-principal-effect-currentness.test.mjs`
- `docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md`

Modify:

- `mesh/src/check-docs.mjs` — register this plan, its approved design, and the Stage A security boundary document.

Do not add a dedicated GitHub workflow in Stage A. Existing protected workflows remain authoritative.

---

### Task 1: Lifecycle State and Exact Admission Semantics

**Files:**
- Create: `mesh/src/lib/machine-principal-currentness.mjs`
- Create: `mesh/test/machine-principal-currentness.test.mjs`

**Interfaces:**
- Consumes: `ValidationError`, `assertPlainObject`, `assertString`, `digestObject` from `mesh/src/lib/canonical.mjs`.
- Produces:
  - `MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA`
  - `MACHINE_PRINCIPAL_EFFECT_ADMISSION_SCHEMA`
  - `MACHINE_PRINCIPAL_EFFECT_CURRENTNESS_EVALUATION_SCHEMA`
  - `normalizeMachinePrincipalCurrentness(value)`
  - `machinePrincipalAdmissionDigest(input)`
  - `evaluateMachinePrincipalCurrentness(input)`

- [ ] **Step 1: Write the failing semantic test file**

Create `mesh/test/machine-principal-currentness.test.mjs` with these helpers and first tests:

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
const AUTH_A = 'a'.repeat(64);
const AUTH_B = 'b'.repeat(64);
const HEAD_1 = '1'.repeat(64);
const HEAD_2 = '2'.repeat(64);
const CREDENTIAL = 'c'.repeat(64);
const CONTROLLER_KEY = 'd'.repeat(64);

function lifecycleState(overrides = {}) {
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
  const normalized = normalizeMachinePrincipalCurrentness(lifecycleState());
  assert.equal(normalized.status, 'active');
  assert.equal(normalized.authority_effect, 'none');
  assert.equal(normalized.execution_authority_granted, false);
  assert.equal(normalized.global_currentness_claimed, false);
});

test('narrowed state is usable only for the exact narrowed authority digest', () => {
  const narrowed = lifecycleState({
    authority_digest: AUTH_B,
    status: 'narrowed',
    sequence: 2,
    observed_at: '2026-09-04T19:30:20.000Z',
    source_head_digest: HEAD_2,
    predecessor_head_digest: HEAD_1
  });

  const currentB = evaluateMachinePrincipalCurrentness({
    currentness: narrowed,
    expectedPrincipalId: 'agent.currentness.stage-a',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest: AUTH_B,
    expectedAdmissionDigest: machinePrincipalAdmissionDigest(admission(AUTH_B)),
    now: '2026-09-04T19:30:30.000Z',
    maxAgeMs: 60_000
  });
  assert.equal(currentB.allow, true);
  assert.equal(currentB.code, 'machine_currentness_satisfied');
  assert.equal(currentB.execution_authority_granted, false);

  const staleA = evaluateMachinePrincipalCurrentness({
    currentness: narrowed,
    expectedPrincipalId: 'agent.currentness.stage-a',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest: AUTH_A,
    expectedAdmissionDigest: machinePrincipalAdmissionDigest(admission(AUTH_A)),
    now: '2026-09-04T19:30:30.000Z',
    maxAgeMs: 60_000
  });
  assert.equal(staleA.allow, false);
  assert.equal(staleA.code, 'machine_currentness_authority_changed');
});
```

Add explicit tests in the same file for:

```js
for (const status of ['revoked', 'compromised', 'expired']) {
  test(`${status} lifecycle state fails closed`, () => {
    const result = evaluateMachinePrincipalCurrentness({
      currentness: lifecycleState({ status }),
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

test('future and stale evidence have distinct stable denials', () => {
  const digest = machinePrincipalAdmissionDigest(admission());
  assert.equal(evaluateMachinePrincipalCurrentness({
    currentness: lifecycleState({ observed_at: '2026-09-04T19:31:00.000Z' }),
    expectedPrincipalId: 'agent.currentness.stage-a',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest: AUTH_A,
    expectedAdmissionDigest: digest,
    now: T0,
    maxAgeMs: 60_000
  }).code, 'machine_currentness_future');

  assert.equal(evaluateMachinePrincipalCurrentness({
    currentness: lifecycleState(),
    expectedPrincipalId: 'agent.currentness.stage-a',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest: AUTH_A,
    expectedAdmissionDigest: digest,
    now: '2026-09-04T19:31:00.001Z',
    maxAgeMs: 60_000
  }).code, 'machine_currentness_stale');
});
```

Also add one `assert.throws` for each of: unsupported field, unsupported schema, invalid principal type, malformed digest, sequence zero, genesis with predecessor, non-genesis without predecessor, non-canonical timestamp, malformed controller metadata, and each attempted nonclaim elevation.

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/machine-principal-currentness.test.mjs
```

Expected: FAIL because `mesh/src/lib/machine-principal-currentness.mjs` is missing. Reject any unrelated RED.

- [ ] **Step 3: Implement the minimal strict semantic core**

Use these exact schemas:

```js
export const MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA = 'axiom-machine-principal-currentness.v1';
export const MACHINE_PRINCIPAL_EFFECT_ADMISSION_SCHEMA = 'axiom-machine-principal-effect-admission.v1';
export const MACHINE_PRINCIPAL_EFFECT_CURRENTNESS_EVALUATION_SCHEMA =
  'axiom-machine-principal-effect-currentness-evaluation.v1';
```

Allow exactly these lifecycle-state fields:

```js
const CURRENTNESS_KEYS = new Set([
  'schema', 'principal_id', 'principal_type', 'authority_digest', 'status',
  'sequence', 'observed_at', 'source_head_digest', 'predecessor_head_digest',
  'controller_id', 'controller_key_id', 'controller_credential_digest',
  'controller_key_epoch', 'authority_effect', 'execution_authority_granted',
  'global_currentness_claimed'
]);
```

`machinePrincipalAdmissionDigest()` hashes exactly:

```js
{
  schema: MACHINE_PRINCIPAL_EFFECT_ADMISSION_SCHEMA,
  principal_id: principalId,
  principal_type: principalType,
  authority_digest: authorityDigest,
  capability_id: capabilityId,
  intent_digest: intentDigest,
  plan_digest: planDigest,
  effect_destination: effectDestination
}
```

`evaluateMachinePrincipalCurrentness()` checks in this order:

```js
if (state.principal_id !== expectedPrincipalId) return deny('machine_currentness_principal_mismatch');
if (state.principal_type !== expectedPrincipalType) return deny('machine_currentness_principal_type_mismatch');
if (state.authority_digest !== expectedAuthorityDigest) return deny('machine_currentness_authority_changed');
if (!['active', 'narrowed'].includes(state.status)) return deny(`machine_currentness_${state.status}`);
const ageMs = nowMs - observedMs;
if (ageMs < 0) return deny('machine_currentness_future');
if (ageMs > maxAgeMs) return deny('machine_currentness_stale');
```

On success, compute `currentness_evidence_digest = digestObject(state)` and `effect_currentness_evaluation_digest = digestObject({ schema, admission_digest, currentness_evidence_digest, currentness_sequence, currentness_head_digest })`. Return `allow:true` but keep authority nonclaims false/none.

- [ ] **Step 4: Run GREEN**

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

### Task 2: Controller-Scoped Signed Checkpoints

**Files:**
- Create: `mesh/src/lib/machine-principal-currentness-checkpoint.mjs`
- Create: `mesh/test/machine-principal-currentness-checkpoint.test.mjs`
- Reuse unchanged: `mesh/src/lib/agent-trust-machine-identity.mjs`
- Reuse unchanged: `mesh/src/lib/agent-trust-currentness-checkpoint.mjs`

**Interfaces:**
- Consumes Task 1 `normalizeMachinePrincipalCurrentness`.
- Consumes current `evaluateAgentCurrentnessAtEffect`, `verifyMachineIdentityCredentialHistory`, and `machineIdentityKeyId`.
- Produces `resolveMachineCurrentnessControllerTrust`, `createMachinePrincipalCurrentnessCheckpoint`, `verifyMachinePrincipalCurrentnessCheckpoint`, and `validateMachinePrincipalCurrentnessCheckpointTransition`.

- [ ] **Step 1: Write controller fixture helpers in the new test file**

At the top of `mesh/test/machine-principal-currentness-checkpoint.test.mjs`, import the existing Agent Trust machine identity/currentness creation helpers used by `mesh/test/agent-trust-currentness-checkpoint.test.mjs`. Then define these local helpers completely in this file:

```js
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

const T0 = '2026-09-04T18:00:00.000Z';
const T1 = '2026-09-04T18:10:00.000Z';
const T2 = '2026-09-04T18:20:00.000Z';

function keys() {
  return generateKeyPairSync('ed25519');
}

function targetState(controllerTrust, overrides = {}) {
  return {
    schema: 'axiom-machine-principal-currentness.v1',
    principal_id: 'agent.currentness.stage-a',
    principal_type: 'agent',
    authority_digest: 'a'.repeat(64),
    status: 'active',
    sequence: 1,
    observed_at: T2,
    source_head_digest: '1'.repeat(64),
    predecessor_head_digest: null,
    controller_id: controllerTrust.controller_id,
    controller_key_id: controllerTrust.controller_key_id,
    controller_credential_digest: controllerTrust.controller_credential_digest,
    controller_key_epoch: controllerTrust.controller_key_epoch,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false,
    ...overrides
  };
}
```

For the controller evidence fixture, copy the **existing public test-helper construction pattern** from `mesh/test/agent-trust-currentness-checkpoint.test.mjs` without changing its semantics: create one `service` machine-principal identity credential for principal `service.machine-currentness-controller`, signed by a test issuer; create one retained Agent Trust currentness checkpoint for that credential at `T1`; retain the issuer/observer public keys and the operational private key. Name the returned helper `controllerEvidenceFixture()` and make it return exactly:

```js
{
  issuer,
  observer,
  controllerOperational,
  credentialHistory,
  revocations: [],
  currentnessCheckpoint,
  expectedLatestCheckpointDigest: currentnessCheckpoint.checkpoint_digest
}
```

Do not invent a second controller credential format in this task.

- [ ] **Step 2: Write the first failing checkpoint test**

```js
test('active controller evidence resolves the exact signing key and checkpoint stays non-authorizing', () => {
  const fixture = controllerEvidenceFixture();
  const controllerTrust = resolveMachineCurrentnessControllerTrust({
    currentnessCheckpoint: fixture.currentnessCheckpoint,
    trustedObserverPublicKey: fixture.observer.publicKey,
    credentialHistory: fixture.credentialHistory,
    revocations: fixture.revocations,
    trustedIssuerPublicKey: fixture.issuer.publicKey,
    expectedLatestCheckpointDigest: fixture.expectedLatestCheckpointDigest,
    expectedControllerPrincipalId: 'service.machine-currentness-controller',
    evaluatedAt: T2,
    maxAgeMs: 60 * 60 * 1000
  });

  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: targetState(controllerTrust),
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
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.execution_authority_granted, false);
});
```

Add negatives for controller currentness revoked/expired/not-yet-valid; stale/mismatched expected latest controller checkpoint; controller operational key substitution; controller credential digest/key epoch mismatch; target principal substitution; state/statement/signature/checkpoint digest tamper; unknown fields; invalid sequence transition; wrong predecessor source head; non-advancing observation time.

- [ ] **Step 3: Run RED**

```bash
node --test mesh/test/machine-principal-currentness-checkpoint.test.mjs
```

Expected: FAIL because the new checkpoint module is missing.

- [ ] **Step 4: Implement `resolveMachineCurrentnessControllerTrust`**

Accept exactly:

```js
{
  currentnessCheckpoint,
  trustedObserverPublicKey,
  credentialHistory,
  revocations = [],
  trustedIssuerPublicKey,
  expectedLatestCheckpointDigest,
  expectedControllerPrincipalId,
  evaluatedAt,
  maxAgeMs
}
```

Call the existing `evaluateAgentCurrentnessAtEffect` with the same credential history/revocation/currentness checkpoint and exact latest checkpoint digest. Require its result to be `active`. Verify the machine identity credential history with `verifyMachineIdentityCredentialHistory`, find the exact credential named by the currentness result, and require principal id, operational key id, and key epoch equality.

Return exactly:

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

- [ ] **Step 5: Implement checkpoint sign/verify/transition**

Use Ed25519 and canonical JSON. Envelope fields are exactly:

```js
{
  schema: 'axiom-machine-principal-currentness-checkpoint.v1',
  statement,
  statement_digest,
  controller_signature,
  checkpoint_digest
}
```

The statement is the Task 1 normalized lifecycle state; it contains no admission/effect fields. Require its controller id/key/credential/epoch to equal `controllerTrust`. Require the signing private key's derived public key ID to equal `controllerTrust.controller_key_id`.

Transition validation requires:

```text
same principal id/type
sequence exactly previous + 1
predecessor_head_digest exactly previous source_head_digest
observed_at strictly advances
```

Authority digest and lifecycle status may change; Stage B needs that later.

- [ ] **Step 6: Run focused tests and commit**

```bash
node --test \
  mesh/test/machine-principal-currentness.test.mjs \
  mesh/test/machine-principal-currentness-checkpoint.test.mjs

git add mesh/src/lib/machine-principal-currentness-checkpoint.mjs mesh/test/machine-principal-currentness-checkpoint.test.mjs
git commit -m "feat: add signed machine currentness checkpoints"
```

Expected: tests PASS before commit.

---

### Task 3: Durable Retained-Head Store

**Files:**
- Create: `mesh/src/lib/machine-principal-currentness-store.mjs`
- Create: `mesh/test/machine-principal-currentness-store.test.mjs`
- Reference unchanged: `mesh/src/lib/delegation-root-attestation-key-currentness-store.mjs`
- Reference unchanged: `mesh/test/delegation-root-attestation-key-currentness-store.test.mjs`

**Interfaces:**
- Consumes Task 2 checkpoint verification/transition.
- Produces `openMachinePrincipalCurrentnessStore(options)` and store methods `snapshot()`, `verifyState()`, `retainedHead()`, `retain(checkpoint)`.

- [ ] **Step 1: Write complete local durable-store fixture helpers**

In `mesh/test/machine-principal-currentness-store.test.mjs`, use the Task 2 controller fixture construction and define:

```js
async function tempState(t, suffix = 'state.jsonl') {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-machine-currentness-store-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  return { dir, statePath: join(dir, suffix) };
}

function openOptions(statePath, fixture, extra = {}) {
  return {
    statePath,
    controllerTrust: fixture.controllerTrust,
    expectedPrincipalId: fixture.principalId,
    expectedPrincipalType: 'agent',
    ...extra
  };
}
```

Define `checkpointFixture()` in the same test file by constructing controller trust exactly as Task 2, then create:

- `checkpoint1`: active authority A, sequence 1, no predecessor;
- `checkpoint2`: narrowed authority B, sequence 2, predecessor source head = checkpoint1 source head;
- `checkpoint3`: sequence 3 successor of checkpoint2;
- `conflictingCheckpoint1`: independently signed sequence 1 with a different source head.

Use fixed `T1 < T2 < T3 < T4` timestamps. Return the four checkpoints, controller trust, principal id, and authority digests.

- [ ] **Step 2: Write store invariants as failing tests**

The positive test must assert exact local-durability nonclaims after retain and reopen. Add individual tests for:

1. exact duplicate -> `already-retained`;
2. same sequence/different digest -> equivocation rejection;
3. older checkpoint after advancement -> rollback rejection;
4. empty store requires sequence 1;
5. sequence gap rejection;
6. wrong predecessor rejection;
7. torn trailing JSONL rejection;
8. non-canonical JSON rejection;
9. symlink/non-regular state rejection;
10. bounded checkpoint bytes;
11. bounded total state bytes;
12. active disk/memory divergence rejection;
13. tampered signed retained checkpoint rejection;
14. locally truncated history beginning at sequence >1 rejection;
15. source contains `await handle.sync()` and does not use `appendFile(`.

- [ ] **Step 3: Run RED**

```bash
node --test mesh/test/machine-principal-currentness-store.test.mjs
```

Expected: FAIL because the store module is missing.

- [ ] **Step 4: Implement the store by adapting current delegation-root storage mechanics**

Use:

```js
export const MACHINE_PRINCIPAL_CURRENTNESS_STORE_SCHEMA =
  'axiom-machine-principal-currentness-store.v1';

const DEFAULT_MAX_STATE_BYTES = 64 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_CHECKPOINT_BYTES = 2 * 1024 * 1024;
const HARD_MAX_CHECKPOINT_BYTES = 16 * 1024 * 1024;
```

Trusted open options are exactly:

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

Required open flow:

```text
create missing file with mode 0600 under directory mode 0700
-> require regular non-symlink
-> enforce max state bytes
-> require newline-terminated canonical JSONL
-> verify every signed checkpoint
-> require sequence 1 genesis
-> verify every transition
-> retain exact verified history in memory
```

Required `retain()` flow:

```text
verify candidate
-> re-read and verify disk
-> require disk history == active in-memory history
-> enforce sequence/rollback/equivocation rules
-> append canonical JSON line with opened file handle
-> await handle.sync()
-> close handle
-> update in-memory history
```

`retainedHead()` has no parameters and returns only the actual latest verified checkpoint or `null`.

Store projections include `local_durable_retention_claimed:true`, but `storage_rollback_proof_claimed:false`, `hardware_monotonicity_claimed:false`, `global_currentness_claimed:false`, `authority_effect:'none'`, and `execution_authority_granted:false`.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test \
  mesh/test/machine-principal-currentness-checkpoint.test.mjs \
  mesh/test/machine-principal-currentness-store.test.mjs

git add mesh/src/lib/machine-principal-currentness-store.mjs mesh/test/machine-principal-currentness-store.test.mjs
git commit -m "feat: add durable machine currentness store"
```

Expected: tests PASS before commit.

---

### Task 4: Exact Retained-Head Effect-Currentness Evaluator

**Files:**
- Create: `mesh/src/lib/machine-principal-effect-currentness.mjs`
- Create: `mesh/test/machine-principal-effect-currentness.test.mjs`

**Interfaces:**
- Consumes Task 1 admission/currentness evaluator and Task 3 `verifyState()` / `retainedHead()`.
- Produces `resolveRetainedMachinePrincipalCurrentnessHead(input)` and `evaluateRetainedMachinePrincipalEffectCurrentness(input)`.

- [ ] **Step 1: Define the test fixture in the evaluator test file**

In `mesh/test/machine-principal-effect-currentness.test.mjs`, define `retainedFixture(t, { status = 'active', authorityDigest = AUTH_A } = {})` completely by:

1. constructing controller trust using the same Task 2 fixture construction;
2. opening a temp Task 3 store;
3. creating one signed checkpoint with the requested `status` and authority digest;
4. retaining it;
5. returning `{ store, checkpoint, principalId, controllerTrust }`.

For the narrowed tests, construct/retain active A checkpoint 1 followed by narrowed B checkpoint 2 so the store has real retained progression, not a synthetic isolated sequence-2 object.

- [ ] **Step 2: Write failing exact-head tests**

Control case:

```js
test('exact retained active authority satisfies currentness prerequisite only', async t => {
  const fixture = await retainedFixture(t);
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

Add exact cases:

```text
retained B + pending old A -> machine_currentness_authority_changed
retained narrowed B + pending B -> allow prerequisite only
retained narrowed B + pending old A -> machine_currentness_authority_changed
retained revoked -> machine_currentness_revoked
retained compromised -> machine_currentness_compromised
retained expired -> machine_currentness_expired
wrong principal -> machine_currentness_principal_mismatch
wrong principal type -> machine_currentness_principal_type_mismatch
stale observation -> machine_currentness_stale
future observation -> machine_currentness_future
empty required store -> machine_currentness_unavailable
invalid durable state -> ValidationError; never ALLOW
```

Also prove older signed and newer-unretained checkpoint objects cannot affect evaluation: the public evaluator has no checkpoint/head/state-path/trust-root argument.

- [ ] **Step 3: Run RED**

```bash
node --test mesh/test/machine-principal-effect-currentness.test.mjs
```

Expected: FAIL because the effect-currentness module is missing.

- [ ] **Step 4: Implement the retained-head resolver**

Signature:

```js
export async function resolveRetainedMachinePrincipalCurrentnessHead({
  currentnessStore,
  expectedPrincipalId,
  expectedPrincipalType
} = {})
```

Require `verifyState()` and `retainedHead()`. Call `await verifyState()` before reading the head. If no head exists, return `{ available:false, ...nonclaims }`.

For an available head, return exact checkpoint/source-head/sequence/principal/type/authority/status/observed-at/controller credential/key epoch plus fixed nonclaims. Do not accept a caller checkpoint, path, or trust key.

- [ ] **Step 5: Implement exact pending-admission evaluation**

Signature:

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

Compute Task 1's exact `machinePrincipalAdmissionDigest`, resolve the store's actual head, reconstruct the normalized currentness statement from the retained checkpoint, call Task 1's evaluator, and on success bind exact retained checkpoint/source-head/controller evidence fields into the returned prerequisite evidence.

Do not catch a store `ValidationError` and translate it to ALLOW.

- [ ] **Step 6: Run all focused Stage A tests and commit**

```bash
node --test \
  mesh/test/machine-principal-currentness.test.mjs \
  mesh/test/machine-principal-currentness-checkpoint.test.mjs \
  mesh/test/machine-principal-currentness-store.test.mjs \
  mesh/test/machine-principal-effect-currentness.test.mjs

git add mesh/src/lib/machine-principal-effect-currentness.mjs mesh/test/machine-principal-effect-currentness.test.mjs
git commit -m "feat: add retained machine effect currentness evaluator"
```

Expected: all focused tests PASS before commit.

---

### Task 5: Non-Authority Regression and Supported Documentation

**Files:**
- Modify: `mesh/test/machine-principal-effect-currentness.test.mjs`
- Create: `docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md`
- Modify: `mesh/src/check-docs.mjs`
- Preserve: approved design and this plan.

**Interfaces:**
- Consumes all Stage A modules.
- Produces mechanical non-authority regression plus canonical documentation.

- [ ] **Step 1: Add the semantic-elevation regression**

```js
test('currentness prerequisite cannot become bearer or execution authority', async t => {
  const fixture = await retainedFixture(t);
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

Add a static-source test that reads the four new Stage A modules and rejects imports from `sandbox/`, `hypervisor/`, `gateway/`, Grid execution modules, capability issuance modules, and runtime-adapter effect modules.

- [ ] **Step 2: Run the focused regression**

```bash
node --test mesh/test/machine-principal-effect-currentness.test.mjs
```

Expected: PASS if Tasks 1-4 preserved the design. If it fails, fix only the exact authority-looking field/import and rerun.

- [ ] **Step 3: Create the Stage A security boundary document**

`docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md` must contain these statements verbatim or equivalently without widening them:

```markdown
Status: experimental current-main semantic/storage foundation; non-authorizing; not wired into Sandbox.

active: potentially usable with exact retained authority match.
narrowed: potentially usable only for the new exact narrowed authority digest.
revoked / compromised / expired: non-usable terminal states.

Signed but unretained evidence is not the retained latest head.
Request data cannot choose the store path, trust root, or an older checkpoint.

Stage A does not authorize effects, mutate lifecycle state, wire Sandbox, prove global currentness, prove hostile-host rollback resistance, reproduce RT-AUTH-001, or certify WIMSE/MCP/A2A behavior.

Next gate Stage B: separately authorized lifecycle mutation source.
Next gate Stage C: durable consume -> pre-effect barrier -> latest-head evaluation -> deterministic revoke/narrow race.
```

- [ ] **Step 4: Register supported documentation**

Add exactly these entries to `CANONICAL_DOCUMENTS` in `mesh/src/check-docs.mjs`, each in its corresponding section:

```js
'docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md',
'docs/superpowers/specs/2026-09-04-machine-principal-currentness-reconstruction-design.md',
'docs/superpowers/plans/2026-09-04-machine-principal-currentness-stage-a.md',
```

- [ ] **Step 5: Run docs + focused tests and commit**

```bash
cd mesh
npm run docs:check
cd ..
node --test \
  mesh/test/machine-principal-currentness.test.mjs \
  mesh/test/machine-principal-currentness-checkpoint.test.mjs \
  mesh/test/machine-principal-currentness-store.test.mjs \
  mesh/test/machine-principal-effect-currentness.test.mjs

git add \
  docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md \
  docs/superpowers/specs/2026-09-04-machine-principal-currentness-reconstruction-design.md \
  docs/superpowers/plans/2026-09-04-machine-principal-currentness-stage-a.md \
  mesh/src/check-docs.mjs \
  mesh/test/machine-principal-effect-currentness.test.mjs
git commit -m "docs: bind Stage A machine currentness boundary"
```

Expected: docs check and focused tests PASS before commit.

---

### Task 6: Full Verification and Draft Review Candidate

**Files:**
- No new implementation surface unless verification exposes a concrete Stage A defect.

**Interfaces:**
- Produces an exact-head draft PR candidate; does not authorize merge or Stage B.

- [ ] **Step 1: Run the full kernel check**

```bash
cd mesh
npm run check
```

Expected: PASS. This executes setup, policy/contracts, registry/status/docs checks, and the complete Node test suite.

- [ ] **Step 2: Verify the diff contains no effect-path wiring**

```bash
git diff --name-only main...HEAD
```

Allowed paths are only:

```text
docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md
docs/superpowers/specs/2026-09-04-machine-principal-currentness-reconstruction-design.md
docs/superpowers/plans/2026-09-04-machine-principal-currentness-stage-a.md
mesh/src/check-docs.mjs
mesh/src/lib/machine-principal-currentness.mjs
mesh/src/lib/machine-principal-currentness-checkpoint.mjs
mesh/src/lib/machine-principal-currentness-store.mjs
mesh/src/lib/machine-principal-effect-currentness.mjs
mesh/test/machine-principal-currentness.test.mjs
mesh/test/machine-principal-currentness-checkpoint.test.mjs
mesh/test/machine-principal-currentness-store.test.mjs
mesh/test/machine-principal-effect-currentness.test.mjs
```

Any other changed path is a stop-and-review condition, not an automatic acceptance.

- [ ] **Step 3: Verify nonclaims mechanically**

```bash
grep -R "execution_authority_granted" \
  mesh/src/lib/machine-principal-currentness*.mjs \
  mesh/src/lib/machine-principal-effect-currentness.mjs

grep -R "authority_effect" \
  mesh/src/lib/machine-principal-currentness*.mjs \
  mesh/src/lib/machine-principal-effect-currentness.mjs
```

Expected: all exposed Stage A execution-authority fields are false and all authority-effect fields are `none`.

- [ ] **Step 4: If verification exposes a concrete Stage A defect, fix only that defect and commit it**

After the exact fix, rerun its focused test and `cd mesh && npm run check`, then commit:

```bash
git add <the exact files changed by the verified defect fix>
git commit -m "test: harden machine currentness boundary"
```

The `<the exact files changed by the verified defect fix>` shell token is not to be copied literally: stage only files actually modified for the observed defect. Do not add Stage B or Stage C work under this step.

- [ ] **Step 5: Open a draft PR against protected `main`**

Title exactly:

```text
security: reconstruct machine-principal currentness foundation
```

Body must include:

```markdown
## Scope
Stage A only: strict machine lifecycle-currentness state, controller-bound signed checkpoints, durable retained-head storage, and exact retained-head effect-currentness prerequisite evaluation.

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

Keep the PR draft until exact-head protected checks and review complete.

- [ ] **Step 6: Require protected CI on the exact PR head**

Require success for:

```text
Clean Kernel: verify + container + compatibility-node-22
Windows Compatibility: Windows + macOS ARM + macOS Intel
CodeQL: actions + javascript-typescript
```

Do not reuse a result from an earlier candidate SHA.

- [ ] **Step 7: Review exact Stage A semantics**

The review checklist is:

```text
narrowed B can satisfy a B-bound prerequisite
old A is denied after retained B
revoked/compromised/expired deny
signed-unretained state cannot displace retained head
controller trust remains evidence-relative
local fsync retention is not hostile-host rollback proof
no currentness artifact becomes bearer authority
no runtime effect path changed
```

- [ ] **Step 8: State the bounded completion result**

Only after exact-head protected CI and review are green, use this completion statement:

```text
Stage A machine-principal currentness foundation is review-complete on the exact candidate. It provides non-authorizing retained lifecycle currentness evidence and exact pending-admission prerequisite evaluation. It does not wire the effect path or classify the external revoke/narrow race beyond ARCHITECTURE-LIMITED / NOT REPRODUCED.
```

Do not start Stage B in the same PR.

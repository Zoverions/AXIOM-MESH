# Machine-Principal Currentness Stage A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct the current-main machine-principal lifecycle-currentness foundation so AXIOM can retain and verify the latest signed lifecycle authority state and evaluate it against one exact pending effect admission without changing Sandbox or granting effect authority.

**Architecture:** Build four focused current-main modules: lifecycle/currentness semantics, signed controller-bound checkpoints, a durable retained-head store, and an exact retained-head effect-currentness evaluator. Reuse current `canonical.mjs`, Agent Trust identity/currentness evidence, and the delegation-root durable-store pattern instead of forward-porting stale #1420/#1444 runtime wiring. Stage A stops before lifecycle mutation and before Gateway/Hypervisor/Sandbox/Grid integration.

**Tech Stack:** Node.js ESM; Node `crypto` Ed25519; Node `fs/promises`; `node:test`; existing AXIOM canonicalization/digest helpers; existing Agent Trust machine-identity/currentness verifier; current repository CI (`npm run check`, Clean Kernel, Windows/macOS compatibility, CodeQL).

**Spec:** `docs/superpowers/specs/2026-09-04-machine-principal-currentness-reconstruction-design.md`

## Global Constraints

- Approved reconstruction baseline: `6170bb13d077ec5f5752853ef23da71dc3798cee`. At execution start, re-read protected `main`; if it advanced, carry the approved spec and plan onto the new exact main head before writing tests.
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
- `mesh/test/helpers/machine-currentness-fixtures.mjs` — shared deterministic Stage A cryptographic/currentness fixtures only.
- `mesh/test/machine-principal-currentness.test.mjs`
- `mesh/test/machine-principal-currentness-checkpoint.test.mjs`
- `mesh/test/machine-principal-currentness-store.test.mjs`
- `mesh/test/machine-principal-effect-currentness.test.mjs`
- `docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md`

Modify:

- `mesh/src/check-docs.mjs` — register the Stage A plan, approved design, and security boundary document.

Do not add a dedicated GitHub workflow in Stage A. Existing protected workflows remain authoritative.

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
  - `normalizeMachinePrincipalCurrentness(value)`
  - `machinePrincipalAdmissionDigest(input)`
  - `evaluateMachinePrincipalCurrentness(input)`

- [ ] **Step 1: Write the failing semantic test file**

Create `mesh/test/machine-principal-currentness.test.mjs`:

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
    controller_id: 'service.machine-currentness-controller',
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

Add explicit `assert.throws` tests for unsupported field, unsupported schema, invalid principal type, malformed digest, sequence zero, genesis with predecessor, non-genesis without predecessor, non-canonical UTC timestamp, malformed controller metadata, and each attempted nonclaim elevation.

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/machine-principal-currentness.test.mjs
```

Expected: FAIL because `mesh/src/lib/machine-principal-currentness.mjs` is missing. Reject any unrelated RED.

- [ ] **Step 3: Implement the minimal strict semantic core**

Use these exact schemas and exact lifecycle keys:

```js
export const MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA = 'axiom-machine-principal-currentness.v1';
export const MACHINE_PRINCIPAL_EFFECT_ADMISSION_SCHEMA = 'axiom-machine-principal-effect-admission.v1';
export const MACHINE_PRINCIPAL_EFFECT_CURRENTNESS_EVALUATION_SCHEMA =
  'axiom-machine-principal-effect-currentness-evaluation.v1';

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

On success compute `currentness_evidence_digest = digestObject(state)` and `effect_currentness_evaluation_digest = digestObject({ schema, admission_digest, currentness_evidence_digest, currentness_sequence, currentness_head_digest })`. Return `allow:true` while preserving the fixed nonclaims.

- [ ] **Step 4: Run GREEN and commit**

```bash
node --test mesh/test/machine-principal-currentness.test.mjs
git add mesh/src/lib/machine-principal-currentness.mjs mesh/test/machine-principal-currentness.test.mjs
git commit -m "feat: add machine principal currentness semantics"
```

Expected: test PASS before commit.

---

### Task 2: Controller-Scoped Signed Checkpoints

**Files:**
- Create: `mesh/src/lib/machine-principal-currentness-checkpoint.mjs`
- Create: `mesh/test/helpers/machine-currentness-fixtures.mjs`
- Create: `mesh/test/machine-principal-currentness-checkpoint.test.mjs`
- Reuse unchanged: `mesh/src/lib/agent-trust-machine-identity.mjs`
- Reuse unchanged: `mesh/src/lib/agent-trust-currentness-checkpoint.mjs`

**Interfaces:**
- Consumes Task 1 `normalizeMachinePrincipalCurrentness`.
- Consumes existing `createMachineIdentityCredential`, `verifyMachineIdentityCredentialHistory`, `machineIdentityKeyId`, `createAgentCurrentnessCheckpoint`, and `evaluateAgentCurrentnessAtEffect`.
- Produces `resolveMachineCurrentnessControllerTrust`, `createMachinePrincipalCurrentnessCheckpoint`, `verifyMachinePrincipalCurrentnessCheckpoint`, and `validateMachinePrincipalCurrentnessCheckpointTransition`.
- Test helper produces deterministic `controllerEvidenceFixture()`, `controllerTrustFixture()`, and `targetLifecycleState()` for Tasks 2-4.

- [ ] **Step 1: Create the deterministic shared fixture file**

Create `mesh/test/helpers/machine-currentness-fixtures.mjs` with these imports/constants/helpers:

```js
import { generateKeyPairSync } from 'node:crypto';
import { normalizeMachinePrincipalDefinition } from '../../src/lib/machine-principal.mjs';
import { createMachineIdentityCredential } from '../../src/lib/agent-trust-machine-identity.mjs';
import { createAgentCurrentnessCheckpoint } from '../../src/lib/agent-trust-currentness-checkpoint.mjs';
import {
  createMachinePrincipalCurrentnessCheckpoint,
  resolveMachineCurrentnessControllerTrust
} from '../../src/lib/machine-principal-currentness-checkpoint.mjs';

export const T0 = '2026-09-04T18:00:00.000Z';
export const T1 = '2026-09-04T18:10:00.000Z';
export const T2 = '2026-09-04T18:20:00.000Z';
export const T3 = '2026-09-04T18:30:00.000Z';
export const AUTH_A = 'a'.repeat(64);
export const AUTH_B = 'b'.repeat(64);
export const PRINCIPAL_ID = 'agent.currentness.stage-a';
const HUMANS = new Set(['owner.alice']);

export function keys() {
  return generateKeyPairSync('ed25519');
}

export function controllerEvidenceFixture() {
  const issuer = keys();
  const observer = keys();
  const controllerOperational = keys();
  const controller = normalizeMachinePrincipalDefinition({
    id: 'service.machine-currentness-controller',
    type: 'service',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.machine-currentness-controller',
      kind: 'local-process',
      software_digest: '9'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 2,
        max_execution_ms: 5_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  }, {
    knownHumanPrincipals: HUMANS,
    now: new Date(T0)
  });

  const credential = createMachineIdentityCredential({
    principal: controller,
    issuerId: 'identity.machine-currentness-controller',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: controllerOperational.publicKey,
    keyEpoch: 1,
    issuedAt: T0,
    validFrom: T0,
    expiresAt: '2026-09-05T00:00:00.000Z',
    knownHumanPrincipals: HUMANS
  });

  const currentnessCheckpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'controller.currentness.cp.1',
    checkpointSequence: 1,
    credentialHistory: [credential],
    revocations: [],
    trustedIssuerPublicKey: issuer.publicKey,
    observerId: 'observer.local.currentness',
    observerPrivateKey: observer.privateKey,
    evaluatedAt: T1
  });

  return {
    issuer,
    observer,
    controllerOperational,
    credentialHistory: [credential],
    revocations: [],
    currentnessCheckpoint,
    expectedLatestCheckpointDigest: currentnessCheckpoint.checkpoint_digest
  };
}

export function controllerTrustFixture() {
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
  return { ...fixture, controllerTrust };
}

export function targetLifecycleState(controllerTrust, overrides = {}) {
  return {
    schema: 'axiom-machine-principal-currentness.v1',
    principal_id: PRINCIPAL_ID,
    principal_type: 'agent',
    authority_digest: AUTH_A,
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

export function signedTargetCheckpoint({ controllerTrust, controllerOperational, overrides = {} }) {
  return createMachinePrincipalCurrentnessCheckpoint({
    currentness: targetLifecycleState(controllerTrust, overrides),
    controllerPrivateKey: controllerOperational.privateKey,
    controllerTrust
  });
}
```

- [ ] **Step 2: Write the failing checkpoint test**

Create `mesh/test/machine-principal-currentness-checkpoint.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMachinePrincipalCurrentnessCheckpoint,
  resolveMachineCurrentnessControllerTrust,
  validateMachinePrincipalCurrentnessCheckpointTransition,
  verifyMachinePrincipalCurrentnessCheckpoint
} from '../src/lib/machine-principal-currentness-checkpoint.mjs';
import {
  AUTH_B,
  PRINCIPAL_ID,
  T3,
  controllerEvidenceFixture,
  controllerTrustFixture,
  signedTargetCheckpoint,
  targetLifecycleState
} from './helpers/machine-currentness-fixtures.mjs';

test('active controller evidence resolves exact signing key and checkpoint stays non-authorizing', () => {
  const fixture = controllerTrustFixture();
  const checkpoint = signedTargetCheckpoint(fixture);
  const verified = verifyMachinePrincipalCurrentnessCheckpoint(checkpoint, {
    controllerTrust: fixture.controllerTrust,
    expectedPrincipalId: PRINCIPAL_ID,
    expectedPrincipalType: 'agent'
  });
  assert.equal(verified.checkpoint_digest, checkpoint.checkpoint_digest);
  assert.equal(verified.statement.controller_credential_digest, fixture.controllerTrust.controller_credential_digest);
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.execution_authority_granted, false);
});

test('valid transition advances sequence/head/time while allowing authority narrowing', () => {
  const fixture = controllerTrustFixture();
  const first = signedTargetCheckpoint(fixture);
  const second = createMachinePrincipalCurrentnessCheckpoint({
    currentness: targetLifecycleState(fixture.controllerTrust, {
      authority_digest: AUTH_B,
      status: 'narrowed',
      sequence: 2,
      observed_at: T3,
      predecessor_head_digest: first.statement.source_head_digest,
      source_head_digest: '2'.repeat(64)
    }),
    controllerPrivateKey: fixture.controllerOperational.privateKey,
    controllerTrust: fixture.controllerTrust
  });
  assert.equal(validateMachinePrincipalCurrentnessCheckpointTransition(first, second, {
    controllerTrust: fixture.controllerTrust
  }).valid, true);
});
```

Add negatives for wrong expected latest controller currentness checkpoint, revoked/expired controller evidence, controller operational key substitution, controller credential digest/key epoch mismatch, target principal/type substitution, statement/signature/checkpoint digest tamper, unsupported fields, sequence not `+1`, wrong predecessor source head, and non-advancing observation time.

- [ ] **Step 3: Run RED**

```bash
node --test mesh/test/machine-principal-currentness-checkpoint.test.mjs
```

Expected: FAIL because the checkpoint module is missing.

- [ ] **Step 4: Implement controller trust resolution exactly over existing Agent Trust currentness evidence**

`resolveMachineCurrentnessControllerTrust()` accepts exactly:

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

Call:

```js
const check = evaluateAgentCurrentnessAtEffect({
  checkpoint: currentnessCheckpoint,
  trustedObserverPublicKey,
  credentialHistory,
  revocations,
  trustedIssuerPublicKey,
  expectedLatestCheckpointDigest,
  effectAt: evaluatedAt,
  maxEvidenceAgeMs: maxAgeMs
});
```

Require `check.known_active_under_retained_evidence === true`. Verify the credential history with `verifyMachineIdentityCredentialHistory`, requiring `expectedPrincipalId: expectedControllerPrincipalId`; find the credential whose `credential_digest === check.active_credential_digest`; require its key epoch and operational key ID to equal `currentnessCheckpoint.statement.current_key_epoch` and `.current_operational_key_id`.

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

- [ ] **Step 5: Implement Ed25519 checkpoint sign/verify/transition**

Envelope:

```js
{
  schema: 'axiom-machine-principal-currentness-checkpoint.v1',
  statement,
  statement_digest,
  controller_signature,
  checkpoint_digest
}
```

The statement is Task 1's normalized lifecycle state. It contains no admission/effect-specific fields. Require controller id/key/credential/epoch to equal `controllerTrust`, and derive the signing public key ID with existing `machineIdentityKeyId` so a substituted private key cannot sign.

Transition requirements:

```text
same principal id/type
sequence exactly previous + 1
predecessor_head_digest exactly previous source_head_digest
observed_at strictly advances
```

Do not require authority digest or lifecycle status equality.

- [ ] **Step 6: Run GREEN and commit**

```bash
node --test \
  mesh/test/machine-principal-currentness.test.mjs \
  mesh/test/machine-principal-currentness-checkpoint.test.mjs
git add \
  mesh/src/lib/machine-principal-currentness-checkpoint.mjs \
  mesh/test/helpers/machine-currentness-fixtures.mjs \
  mesh/test/machine-principal-currentness-checkpoint.test.mjs
git commit -m "feat: add signed machine currentness checkpoints"
```

Expected: tests PASS before commit.

---

### Task 3: Durable Retained-Head Store

**Files:**
- Create: `mesh/src/lib/machine-principal-currentness-store.mjs`
- Create: `mesh/test/machine-principal-currentness-store.test.mjs`
- Reuse test helper: `mesh/test/helpers/machine-currentness-fixtures.mjs`
- Reference unchanged: `mesh/src/lib/delegation-root-attestation-key-currentness-store.mjs`

**Interfaces:**
- Consumes Task 2 checkpoint verification/transition.
- Produces `openMachinePrincipalCurrentnessStore(options)` and store methods `snapshot()`, `verifyState()`, `retainedHead()`, `retain(checkpoint)`.

- [ ] **Step 1: Write the durable-store test fixture and tests**

Create `mesh/test/machine-principal-currentness-store.test.mjs`. Reuse `controllerTrustFixture`, `signedTargetCheckpoint`, `targetLifecycleState`, `AUTH_B`, `PRINCIPAL_ID`, `T3`, and create a sequence-2 narrowed checkpoint with predecessor/source-head continuity. Use this local temp helper:

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
    expectedPrincipalId: PRINCIPAL_ID,
    expectedPrincipalType: 'agent',
    ...extra
  };
}
```

Write separate tests for:

1. retain + reopen preserves exact head and only local-durability claims;
2. exact duplicate is `already-retained`;
3. same-sequence/different-digest equivocation fails;
4. older checkpoint after sequence 2 fails rollback;
5. first retained checkpoint must be sequence 1;
6. sequence gap fails;
7. wrong predecessor fails;
8. torn trailing JSONL fails;
9. non-canonical JSON fails;
10. symlink/non-regular path fails;
11. checkpoint byte bound fails;
12. total state byte bound fails;
13. active disk/memory divergence fails;
14. tampered signed retained checkpoint fails;
15. retained history beginning at sequence >1 fails as truncated;
16. source has `await handle.sync()` and no `appendFile(`.

- [ ] **Step 2: Run RED**

```bash
node --test mesh/test/machine-principal-currentness-store.test.mjs
```

Expected: FAIL because the store module is missing.

- [ ] **Step 3: Implement the store using current delegation-root storage mechanics**

Use:

```js
export const MACHINE_PRINCIPAL_CURRENTNESS_STORE_SCHEMA =
  'axiom-machine-principal-currentness-store.v1';
const DEFAULT_MAX_STATE_BYTES = 64 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_CHECKPOINT_BYTES = 2 * 1024 * 1024;
const HARD_MAX_CHECKPOINT_BYTES = 16 * 1024 * 1024;
```

Open options:

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

Open flow:

```text
create missing 0600 state file in 0700 directory
-> require regular non-symlink file
-> enforce max state bytes
-> require newline-terminated canonical JSONL
-> verify every checkpoint
-> require sequence-1 genesis
-> validate every transition
-> retain exact verified history in memory
```

`retain()` flow:

```text
verify candidate
-> re-read/verify disk
-> require disk history == active memory history
-> enforce next-sequence/rollback/equivocation rules
-> append canonical JSON line through open file handle
-> await handle.sync()
-> close
-> update memory
```

`retainedHead()` takes no arguments and returns only the actual latest verified checkpoint or `null`.

- [ ] **Step 4: Run GREEN and commit**

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
- Reuse helper: `mesh/test/helpers/machine-currentness-fixtures.mjs`

**Interfaces:**
- Consumes Task 1 admission/currentness evaluator and Task 3 `verifyState()` / `retainedHead()`.
- Produces `resolveRetainedMachinePrincipalCurrentnessHead(input)` and `evaluateRetainedMachinePrincipalEffectCurrentness(input)`.

- [ ] **Step 1: Write the local retained-store fixture in the evaluator test**

Create `mesh/test/machine-principal-effect-currentness.test.mjs` with:

```js
async function retainedFixture(t, {
  status = 'active',
  authorityDigest = AUTH_A
} = {}) {
  const fixture = controllerTrustFixture();
  const dir = await mkdtemp(join(tmpdir(), 'axiom-machine-effect-currentness-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const store = await openMachinePrincipalCurrentnessStore({
    statePath: join(dir, 'state.jsonl'),
    controllerTrust: fixture.controllerTrust,
    expectedPrincipalId: PRINCIPAL_ID,
    expectedPrincipalType: 'agent'
  });
  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: targetLifecycleState(fixture.controllerTrust, {
      status,
      authority_digest: authorityDigest
    }),
    controllerPrivateKey: fixture.controllerOperational.privateKey,
    controllerTrust: fixture.controllerTrust
  });
  await store.retain(checkpoint);
  return { ...fixture, store, checkpoint, principalId: PRINCIPAL_ID };
}
```

For narrowed-B tests, create active-A checkpoint 1, retain it, then create and retain sequence-2 narrowed-B with proper predecessor/source-head progression before evaluation.

- [ ] **Step 2: Write failing exact-head tests**

Control:

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
    now: '2026-09-04T18:20:30.000Z',
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

Also assert the public evaluator accepts no checkpoint, path, head digest, or trust-key argument, so an older signed object or newer unretained object cannot displace the store's actual head.

- [ ] **Step 3: Run RED**

```bash
node --test mesh/test/machine-principal-effect-currentness.test.mjs
```

Expected: FAIL because the evaluator module is missing.

- [ ] **Step 4: Implement retained-head resolver**

Signature:

```js
export async function resolveRetainedMachinePrincipalCurrentnessHead({
  currentnessStore,
  expectedPrincipalId,
  expectedPrincipalType
} = {})
```

Require `verifyState()` and `retainedHead()`. Call `await verifyState()` first. Empty store returns `available:false` with nonclaims. Available store returns exact checkpoint/source-head/sequence/principal/type/authority/status/observed-at/controller credential/key epoch, plus nonclaims.

- [ ] **Step 5: Implement exact pending-admission evaluator**

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

Compute Task 1's exact admission digest, resolve only the actual retained head, call Task 1's pure evaluator, and bind the exact retained checkpoint/source-head/controller evidence fields into successful prerequisite evidence. Never translate store verification failure into ALLOW.

- [ ] **Step 6: Run all focused tests and commit**

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
    now: '2026-09-04T18:20:30.000Z',
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

Add a source-reading test over the four new `mesh/src/lib/machine-principal*currentness*.mjs` files that rejects imports containing `/sandbox/`, `/hypervisor/`, `/gateway/`, `runtime-adapter`, capability issuance, or Grid execution paths.

- [ ] **Step 2: Run the focused regression**

```bash
node --test mesh/test/machine-principal-effect-currentness.test.mjs
```

Expected: PASS. If it fails, return to the task that introduced the exact offending field/import; do not weaken the regression.

- [ ] **Step 3: Create the Stage A security boundary document**

`docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md` must state:

```markdown
# Machine-principal effect-currentness — Stage A

Status: experimental current-main semantic/storage foundation; non-authorizing; not wired into Sandbox.

## Lifecycle semantics
active: potentially usable with exact retained authority match.
narrowed: potentially usable only for the new exact narrowed authority digest.
revoked / compromised / expired: non-usable terminal states.
Lifecycle expiry is represented by an explicit retained expired successor.

## Retained-head boundary
Signed but unretained evidence is not the retained latest head.
Request data cannot choose the store path, trust root, or an older checkpoint.

## Explicit non-claims
Stage A does not authorize effects, mutate lifecycle state, wire Sandbox, prove global currentness, prove hostile-host rollback resistance, reproduce RT-AUTH-001, or certify WIMSE/MCP/A2A behavior.

## Next gates
Stage B: separately authorized lifecycle mutation source.
Stage C: durable consume -> pre-effect barrier -> latest-head evaluation -> deterministic revoke/narrow race.
```

- [ ] **Step 4: Register supported documentation**

Add exactly these entries to `CANONICAL_DOCUMENTS` in `mesh/src/check-docs.mjs`, in their existing security/spec/plan sections:

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
- No new implementation files.

**Interfaces:**
- Produces an exact-head draft PR candidate; does not authorize merge or Stage B.

- [ ] **Step 1: Run the full kernel check**

```bash
cd mesh
npm run check
```

Expected: PASS. If it fails, stop and return to the owning Task 1-5; do not progress to PR creation until `npm run check` is green.

- [ ] **Step 2: Verify the diff contains only Stage A paths**

```bash
git diff --name-only main...HEAD
```

Allowed paths:

```text
docs/security/MACHINE-PRINCIPAL-EFFECT-CURRENTNESS.md
docs/superpowers/specs/2026-09-04-machine-principal-currentness-reconstruction-design.md
docs/superpowers/plans/2026-09-04-machine-principal-currentness-stage-a.md
mesh/src/check-docs.mjs
mesh/src/lib/machine-principal-currentness.mjs
mesh/src/lib/machine-principal-currentness-checkpoint.mjs
mesh/src/lib/machine-principal-currentness-store.mjs
mesh/src/lib/machine-principal-effect-currentness.mjs
mesh/test/helpers/machine-currentness-fixtures.mjs
mesh/test/machine-principal-currentness.test.mjs
mesh/test/machine-principal-currentness-checkpoint.test.mjs
mesh/test/machine-principal-currentness-store.test.mjs
mesh/test/machine-principal-effect-currentness.test.mjs
```

Any other path is a stop-and-review condition.

- [ ] **Step 3: Verify nonclaims mechanically**

```bash
grep -R "execution_authority_granted" \
  mesh/src/lib/machine-principal-currentness*.mjs \
  mesh/src/lib/machine-principal-effect-currentness.mjs

grep -R "authority_effect" \
  mesh/src/lib/machine-principal-currentness*.mjs \
  mesh/src/lib/machine-principal-effect-currentness.mjs
```

Expected: every exposed Stage A execution-authority field is false and every authority-effect field is `none`.

- [ ] **Step 4: Open a draft PR against protected `main`**

Title exactly:

```text
security: reconstruct machine-principal currentness foundation
```

Body:

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

- [ ] **Step 5: Require protected CI on the exact PR head**

Require success for:

```text
Clean Kernel: verify + container + compatibility-node-22
Windows Compatibility: Windows + macOS ARM + macOS Intel
CodeQL: actions + javascript-typescript
```

Do not reuse a result from an earlier candidate SHA.

- [ ] **Step 6: Review exact Stage A semantics**

Review checklist:

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

- [ ] **Step 7: State the bounded completion result**

Only after exact-head protected CI and review are green:

```text
Stage A machine-principal currentness foundation is review-complete on the exact candidate. It provides non-authorizing retained lifecycle currentness evidence and exact pending-admission prerequisite evaluation. It does not wire the effect path or classify the external revoke/narrow race beyond ARCHITECTURE-LIMITED / NOT REPRODUCED.
```

Do not start Stage B in the same PR.

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { signedFetch } from '../src/lib/client.mjs';
import {
  capabilityConsumptionEventId
} from '../src/lib/capability-consumption.mjs';
import {
  normalizeMachinePrincipalDefinition
} from '../src/lib/machine-principal.mjs';
import {
  createMachinePrincipalCurrentnessCheckpoint
} from '../src/lib/machine-principal-currentness-checkpoint.mjs';
import {
  openMachinePrincipalCurrentnessStore
} from '../src/lib/machine-principal-currentness-store.mjs';
import {
  createMachineCurrentnessMutationCommand
} from '../src/lib/machine-currentness-mutation-command.mjs';
import {
  applyMachinePrincipalCurrentnessMutation
} from '../src/lib/machine-currentness-lifecycle-source.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { executeSandboxBuiltin } from '../src/sandbox/education-executor.mjs';

const HUMAN_TOKEN = `human-${'h'.repeat(40)}`;
const AGENT_TOKEN = `agent-${'a'.repeat(40)}`;
const HUMAN_ID = 'owner.rt-auth-barrier';
const AGENT_ID = 'agent.rt-auth-barrier';

function rawMachinePrincipal() {
  return {
    id: AGENT_ID,
    type: 'agent',
    sponsor: HUMAN_ID,
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.rt-auth-barrier',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 30,
        max_concurrent_requests: 1,
        max_execution_ms: 5_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  };
}

function apiTokens() {
  return {
    [HUMAN_TOKEN]: {
      id: HUMAN_ID,
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [AGENT_TOKEN]: rawMachinePrincipal()
  };
}

function timeout(promise, label, ms = 10_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      timer.unref?.();
    })
  ]);
}

async function runBarrierRace(t, {
  mutationKind,
  resultingAuthorityDigest,
  expectedErrorCode
}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-rt-auth-currentness-barrier-'));
  const lease = await reserveProductionPortBlock('axiom-rt-auth-currentness-barrier-');
  const basePort = lease.base_port;
  const controller = generateKeyPairSync('ed25519');
  const mutationAuthority = generateKeyPairSync('ed25519');

  const normalizedPrincipal = normalizeMachinePrincipalDefinition(rawMachinePrincipal(), {
    knownHumanPrincipals: new Set([HUMAN_ID])
  });
  const authorityA = normalizedPrincipal.authority_digest;
  const genesisObservedAt = new Date(Date.now() - 1_000).toISOString();
  const genesis = createMachinePrincipalCurrentnessCheckpoint({
    currentness: {
      schema: 'axiom-machine-principal-currentness.v1',
      principal_id: AGENT_ID,
      principal_type: 'agent',
      authority_digest: authorityA,
      status: 'active',
      sequence: 1,
      observed_at: genesisObservedAt,
      source_head_digest: digestObject({
        schema: 'rt-auth-001-currentness-genesis.v1',
        principal_id: AGENT_ID,
        authority_digest: authorityA,
        observed_at: genesisObservedAt
      }),
      predecessor_head_digest: null,
      authority_effect: 'none',
      execution_authority_granted: false,
      global_currentness_claimed: false
    },
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const currentnessStore = await openMachinePrincipalCurrentnessStore({
    statePath: join(dataDir, 'machine-currentness', 'rt-auth-001.jsonl'),
    trustedControllerPublicKey: controller.publicKey,
    expectedPrincipalId: AGENT_ID,
    expectedPrincipalType: 'agent'
  });
  await currentnessStore.retain(genesis);

  let stack;
  let builtinInvocations = 0;
  let barrierResolve;
  let releaseResolve;
  const barrierReached = new Promise(resolve => {
    barrierResolve = resolve;
  });
  const releaseBarrier = new Promise(resolve => {
    releaseResolve = resolve;
  });

  t.after(async () => {
    releaseResolve?.();
    try {
      await stack?.stop();
    } finally {
      await lease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  stack = await startDevelopmentStack({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 1_000,
    rateLimitRefillPerSecond: 1_000,
    apiTokens: apiTokens()
  }, {
    sandbox: {
      machineCurrentness: {
        required: true,
        store: currentnessStore,
        trustedControllerPublicKey: controller.publicKey,
        maxEvidenceAgeMs: 60_000
      },
      beforeMachineEffectAdmission: async evidence => {
        barrierResolve(evidence);
        await releaseBarrier;
      },
      executeBuiltin: args => {
        builtinInvocations += 1;
        return executeSandboxBuiltin(args);
      }
    }
  });

  const grid = stack.services.find(service => service.name === 'grid');
  const hypervisor = stack.services.find(service => service.name === 'hypervisor');
  assert.ok(grid?.store, 'development stack must expose the real Grid store');
  assert.ok(hypervisor?.identity, 'development stack must expose Hypervisor identity');

  const gatewayUrl = `http://127.0.0.1:${basePort}`;
  const client = createGatewayClient({
    token: AGENT_TOKEN,
    request: (path, options) => fetch(`${gatewayUrl}${path}`, options),
    defaultTimeoutMs: 15_000
  });
  const body = {
    action: 'system.echo',
    input: { message: `currentness-barrier-${mutationKind}` },
    purpose: 'test.conformance'
  };
  const idempotencyKey = `rt-auth-currentness-barrier-${mutationKind}-0001`;

  const pending = client.call('intents.submit', {
    body,
    idempotencyKey
  }).then(
    value => ({ allowed: true, value }),
    error => ({ allowed: false, error })
  );

  const boundary = await timeout(
    barrierReached,
    'machine currentness pre-effect barrier'
  );

  assert.equal(builtinInvocations, 0);
  assert.equal(boundary.claims.authority_digest, authorityA);
  assert.equal(boundary.claims.subject, AGENT_ID);
  assert.match(boundary.claims.jti, /^cap_/);
  assert.match(boundary.consumption_receipt_digest, /^[a-f0-9]{64}$/);

  const consumedEventId = capabilityConsumptionEventId(boundary.claims.jti);
  assert.equal(
    grid.store.db.prepare(`
      SELECT COUNT(*) AS count
      FROM events
      WHERE event_id = ? AND kind = 'capability.consumed'
    `).get(consumedEventId).count,
    1,
    'Grid durable consumption must exist before the mutation barrier is released'
  );

  const predecessor = currentnessStore.retainedHead();
  assert.equal(predecessor.checkpoint_digest, genesis.checkpoint_digest);

  const mutationTime = new Date().toISOString();
  const mutation = createMachineCurrentnessMutationCommand({
    commandId: `mutation.rt-auth-001.${mutationKind}`,
    principalId: AGENT_ID,
    principalType: 'agent',
    predecessorCheckpointDigest: predecessor.checkpoint_digest,
    expectedSuccessorSequence: 2,
    mutationKind,
    resultingAuthorityDigest:
      resultingAuthorityDigest === 'preserve'
        ? authorityA
        : resultingAuthorityDigest,
    issuedAt: mutationTime,
    effectiveAt: mutationTime,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    reasonCode: `rt-auth-001-${mutationKind}`,
    mutationAuthorityPrivateKey: mutationAuthority.privateKey,
    trustedMutationAuthorityPublicKey: mutationAuthority.publicKey
  });
  const applied = await applyMachinePrincipalCurrentnessMutation({
    currentnessStore,
    mutationCommand: mutation,
    trustedMutationAuthorityPublicKey: mutationAuthority.publicKey,
    currentnessControllerPrivateKey: controller.privateKey,
    trustedCurrentnessControllerPublicKey: controller.publicKey,
    at: mutationTime
  });
  assert.equal(applied.predecessor_checkpoint_digest, genesis.checkpoint_digest);
  assert.equal(
    currentnessStore.retainedHead().checkpoint_digest,
    applied.successor_checkpoint_digest
  );

  releaseResolve();

  const outcome = await timeout(pending, 'machine currentness denied request');
  assert.equal(outcome.allowed, false, 'stale capability must not reach the effect');
  assert.equal(outcome.error.code, expectedErrorCode);
  assert.equal(outcome.error.status, 403);
  assert.match(
    outcome.error.details?.currentness_prerequisite_decision_digest ?? '',
    /^[a-f0-9]{64}$/,
    'denial must expose the exact currentness prerequisite decision digest'
  );
  assert.equal(
    outcome.error.details?.retained_checkpoint_digest,
    applied.successor_checkpoint_digest
  );
  assert.equal(
    builtinInvocations,
    0,
    'Sandbox builtin must not be invoked after currentness denial'
  );

  assert.equal(
    grid.store.db.prepare(`
      SELECT COUNT(*) AS count
      FROM events
      WHERE event_id = ? AND kind = 'capability.consumed'
    `).get(consumedEventId).count,
    1,
    'currentness denial must not undo durable capability consumption'
  );
  assert.equal(
    grid.store.db.prepare(`
      SELECT COUNT(*) AS count
      FROM events
      WHERE subject = ? AND kind = 'intent.completed'
    `).get(boundary.intent.intent_id).count,
    0
  );
  assert.equal(
    grid.store.db.prepare(`
      SELECT COUNT(*) AS count
      FROM events
      WHERE subject = ? AND kind = 'intent.failed'
    `).get(boundary.intent.intent_id).count,
    1
  );

  await assert.rejects(
    () => signedFetch(
      hypervisor.identity,
      'grid',
      `${stack.config.urls.grid}/internal/v1/commit`,
      {
        method: 'POST',
        traceId: `trace_duplicate_consumption_${mutationKind}`,
        body: {
          actor: AGENT_ID,
          principal: AGENT_ID,
          events: [{
            kind: 'capability.consume.requested',
            subject: boundary.claims.jti,
            payload: {
              capability: boundary.capability,
              execution_epoch: boundary.execution_epoch
            }
          }]
        }
      }
    ),
    error => error?.code === 'capability_consumed'
  );

  return {
    authorityA,
    mutation,
    applied,
    outcome
  };
}

test('RT-AUTH-001 authority change after durable consumption denies before first Sandbox effect', async t => {
  await runBarrierRace(t, {
    mutationKind: 'authority-update',
    resultingAuthorityDigest: 'b'.repeat(64),
    expectedErrorCode: 'machine_currentness_authority_changed'
  });
});

test('RT-AUTH-001 revocation after durable consumption denies before first Sandbox effect', async t => {
  await runBarrierRace(t, {
    mutationKind: 'revoke',
    resultingAuthorityDigest: 'preserve',
    expectedErrorCode: 'machine_currentness_revoked'
  });
});

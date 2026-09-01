import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
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
  createMachinePrincipalCurrentnessFileSource
} from '../src/lib/machine-principal-currentness-file-source.mjs';
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
const HUMAN_ID = 'owner.file-source-race';
const AGENT_ID = 'agent.file-source-race';

function rawPrincipal() {
  return {
    id: AGENT_ID,
    type: 'agent',
    sponsor: HUMAN_ID,
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.file-source-race',
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
    [AGENT_TOKEN]: rawPrincipal()
  };
}

function timeout(promise, label, ms = 15_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      timer.unref?.();
    })
  ]);
}

test('Sandbox file source freshly observes post-consumption successor without writer memory sharing', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-currentness-file-source-race-'));
  const lease = await reserveProductionPortBlock('axiom-currentness-file-source-race-');
  const basePort = lease.base_port;
  const controller = generateKeyPairSync('ed25519');
  const mutationAuthority = generateKeyPairSync('ed25519');

  const normalized = normalizeMachinePrincipalDefinition(rawPrincipal(), {
    knownHumanPrincipals: new Set([HUMAN_ID])
  });
  const authorityA = normalized.authority_digest;
  const statePath = join(dataDir, 'currentness', 'agent.jsonl');
  const writer = await openMachinePrincipalCurrentnessStore({
    statePath,
    trustedControllerPublicKey: controller.publicKey,
    expectedPrincipalId: AGENT_ID,
    expectedPrincipalType: 'agent'
  });
  const observedAt = new Date(Date.now() - 500).toISOString();
  const genesisState = {
    schema: 'axiom-machine-principal-currentness.v1',
    principal_id: AGENT_ID,
    principal_type: 'agent',
    authority_digest: authorityA,
    status: 'active',
    sequence: 1,
    observed_at: observedAt,
    source_head_digest: digestObject({
      schema: 'axiom-a6-5-file-source-genesis.v1',
      principal_id: AGENT_ID,
      authority_digest: authorityA,
      observed_at: observedAt
    }),
    predecessor_head_digest: null,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  };
  const genesis = createMachinePrincipalCurrentnessCheckpoint({
    currentness: genesisState,
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  await writer.retain(genesis);

  const fileSource = createMachinePrincipalCurrentnessFileSource({
    entries: [{
      principalId: AGENT_ID,
      principalType: 'agent',
      statePath,
      trustedControllerPublicKey: controller.publicKey
    }]
  });

  // Prove the source is usable before the writer advances. The same source
  // instance must later observe the successor from disk, without receiving
  // the writer object or any mutation callback.
  const before = await fileSource.resolveRetainedHead({
    principalId: AGENT_ID,
    principalType: 'agent'
  });
  assert.equal(before.retained_checkpoint_digest, genesis.checkpoint_digest);

  let stack;
  let builtinInvocations = 0;
  let barrierResolve;
  let releaseResolve;
  const barrierReached = new Promise(resolve => { barrierResolve = resolve; });
  const releaseBarrier = new Promise(resolve => { releaseResolve = resolve; });

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
        source: fileSource,
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

  const client = createGatewayClient({
    token: AGENT_TOKEN,
    request: (path, options) => fetch(`http://127.0.0.1:${basePort}${path}`, options),
    defaultTimeoutMs: 15_000
  });

  const pending = client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'must-not-run-after-file-source-update' },
      purpose: 'test.conformance'
    },
    idempotencyKey: 'a6-5-file-source-race-0001'
  }).then(
    value => ({ allowed: true, value }),
    error => ({ allowed: false, error })
  );

  const boundary = await timeout(barrierReached, 'A6.5 file-source barrier');
  assert.equal(boundary.claims.authority_digest, authorityA);
  assert.equal(builtinInvocations, 0);

  const mutationTime = new Date().toISOString();
  const mutation = createMachineCurrentnessMutationCommand({
    commandId: 'mutation.a6-5.file-source',
    principalId: AGENT_ID,
    principalType: 'agent',
    predecessorCheckpointDigest: writer.retainedHead().checkpoint_digest,
    expectedSuccessorSequence: 2,
    mutationKind: 'authority-update',
    resultingAuthorityDigest: 'b'.repeat(64),
    issuedAt: mutationTime,
    effectiveAt: mutationTime,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    reasonCode: 'file-source-race',
    mutationAuthorityPrivateKey: mutationAuthority.privateKey,
    trustedMutationAuthorityPublicKey: mutationAuthority.publicKey
  });
  const applied = await applyMachinePrincipalCurrentnessMutation({
    currentnessStore: writer,
    mutationCommand: mutation,
    trustedMutationAuthorityPublicKey: mutationAuthority.publicKey,
    currentnessControllerPrivateKey: controller.privateKey,
    trustedCurrentnessControllerPublicKey: controller.publicKey,
    at: mutationTime
  });
  assert.equal(applied.successor_sequence, 2);

  // A direct read through the pre-existing reader instance must now see the
  // newly appended durable successor.
  const after = await fileSource.resolveRetainedHead({
    principalId: AGENT_ID,
    principalType: 'agent'
  });
  assert.equal(
    after.retained_checkpoint_digest,
    applied.successor_checkpoint_digest
  );
  assert.equal(after.checkpoint_count, 2);

  releaseResolve();

  const outcome = await timeout(pending, 'A6.5 stale-capability denial');
  assert.equal(outcome.allowed, false);
  assert.equal(outcome.error.code, 'machine_currentness_authority_changed');
  assert.equal(outcome.error.status, 403);
  assert.equal(builtinInvocations, 0);

  const events = await client.call('events.list', {
    query: { after: 0, limit: 100 }
  });
  const failed = events.events.find(event => (
    event.kind === 'intent.failed'
    && event.subject === boundary.intent.intent_id
  ));
  assert.ok(failed);
  assert.equal(
    failed.payload.error.evidence?.retained_checkpoint_digest,
    applied.successor_checkpoint_digest
  );
});

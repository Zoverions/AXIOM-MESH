import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PolicyEngine } from '../src/lib/policy.mjs';
import { buildMachineDiscovery } from '../src/lib/machine-discovery.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import {
  createMachineIdentityCredential,
  createMachineIdentityRevocation
} from '../src/lib/agent-trust-machine-identity.mjs';
import { createAgentAuthorityManifest } from '../src/lib/agent-trust-authority-manifest.mjs';
import { createAgentSignedHandoff } from '../src/lib/agent-trust-signed-handoff.mjs';
import { createAgentCurrentnessCheckpoint } from '../src/lib/agent-trust-currentness-checkpoint.mjs';
import {
  AGENT_EFFECT_CONSUMPTION_ACTION,
  consumeAgentReadSystemFactsHandoff,
  readAgentEffectConsumptionRecord,
  verifyAgentEffectConsumptionRecord
} from '../src/lib/agent-trust-effect-consumption.mjs';

const humans = new Set(['owner.alice']);
const INPUT = '1'.repeat(64);
const SOFTWARE = 'a'.repeat(64);
const EFFECT_AT = '2026-08-17T20:02:40.000Z';

function principal(id, actions = [AGENT_EFFECT_CONSUMPTION_ACTION, 'agent.noop']) {
  return normalizeMachinePrincipalDefinition({
    id,
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-01T00:00:00.000Z',
    runtime: {
      id: `runtime.${id}`,
      kind: 'local-process',
      software_digest: SOFTWARE
    },
    constraints: {
      actions,
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
    knownHumanPrincipals: humans,
    now: new Date('2026-08-17T19:00:00.000Z')
  });
}

function policy() {
  return {
    version: 'effect-consumption-fixture-v1',
    actions: {
      [AGENT_EFFECT_CONSUMPTION_ACTION]: {
        decision: 'allow',
        risk: 'low',
        required_scopes: ['intent:execute'],
        required_confirmations: 1,
        required_confirmation_values: ['confirm.read-system-facts'],
        requires_independent_approval: false,
        required_assurance: 'A1',
        timeout_ms: 3_000,
        constraints: {},
        tool: 'builtin.read-system-facts',
        effect: AGENT_EFFECT_CONSUMPTION_ACTION
      },
      'agent.noop': {
        decision: 'allow',
        risk: 'low',
        required_scopes: ['intent:execute'],
        required_confirmations: 1,
        required_confirmation_values: ['confirm.noop'],
        requires_independent_approval: false,
        required_assurance: 'A1',
        timeout_ms: 3_000,
        constraints: {},
        tool: 'builtin.noop',
        effect: 'agent.noop'
      }
    }
  };
}

function capabilities() {
  return {
    schema: 'axiom-capabilities.v1',
    capabilities: [
      { id: 'agent.read-system-facts-lab', status: 'implemented' },
      { id: 'agent.noop-lab', status: 'implemented' }
    ]
  };
}

function createIdentity({ id, issuer, operational }) {
  const machine = principal(id);
  const credential = createMachineIdentityCredential({
    principal: machine,
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-08-17T20:00:00.000Z',
    validFrom: '2026-08-17T20:00:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    knownHumanPrincipals: humans
  });
  return { machine, credential };
}

function fixture() {
  const issuer = generateKeyPairSync('ed25519');
  const senderOperational = generateKeyPairSync('ed25519');
  const executorOperational = generateKeyPairSync('ed25519');
  const senderObserver = generateKeyPairSync('ed25519');
  const executorObserver = generateKeyPairSync('ed25519');
  const store = generateKeyPairSync('ed25519');

  const sender = createIdentity({
    id: 'agent.effect.sender.1',
    issuer,
    operational: senderOperational
  });
  const executor = createIdentity({
    id: 'agent.effect.executor.1',
    issuer,
    operational: executorOperational
  });

  const activePolicy = policy();
  const engine = new PolicyEngine(activePolicy);
  const discovery = buildMachineDiscovery({
    principal: sender.machine,
    policy: engine,
    kernelVersion: '0.12.0-dev.3'
  });
  const capabilityRegistry = capabilities();
  const authorityManifest = createAgentAuthorityManifest({
    principal: sender.machine,
    identityCredential: sender.credential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy: activePolicy,
    capabilityRegistry,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:10:00.000Z',
    knownHumanPrincipals: humans
  });
  const authorityEvidence = {
    principal: sender.machine,
    identityCredential: sender.credential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy: activePolicy,
    capabilityRegistry,
    knownHumanPrincipals: humans
  };

  const senderCheckpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.effect.sender.1',
    checkpointSequence: 1,
    credentialHistory: [sender.credential],
    revocations: [],
    trustedIssuerPublicKey: issuer.publicKey,
    observerId: 'observer.effect.sender',
    observerPrivateKey: senderObserver.privateKey,
    evaluatedAt: '2026-08-17T20:02:30.000Z'
  });
  const executorCheckpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.effect.executor.1',
    checkpointSequence: 1,
    credentialHistory: [executor.credential],
    revocations: [],
    trustedIssuerPublicKey: issuer.publicKey,
    observerId: 'observer.effect.executor',
    observerPrivateKey: executorObserver.privateKey,
    evaluatedAt: '2026-08-17T20:02:31.000Z'
  });

  return {
    issuer,
    senderOperational,
    executorOperational,
    senderObserver,
    executorObserver,
    store,
    sender,
    executor,
    activePolicy,
    discovery,
    capabilityRegistry,
    authorityManifest,
    authorityEvidence,
    senderCheckpoint,
    executorCheckpoint
  };
}

function handoffEvidence(f) {
  return {
    identityCredential: f.sender.credential,
    trustedIssuerPublicKey: f.issuer.publicKey,
    authorityManifest: f.authorityManifest,
    authorityEvidence: f.authorityEvidence
  };
}

function createHandoff(f, overrides = {}) {
  return createAgentSignedHandoff({
    handoffId: 'handoff.effect.1',
    parentTaskId: 'task.effect.parent.1',
    recipientPrincipalId: f.executor.machine.id,
    recipientIdentityDigest: f.executor.credential.credential_digest,
    intendedExecutorId: f.executor.machine.id,
    intendedExecutorIdentityDigest: f.executor.credential.credential_digest,
    identityCredential: f.sender.credential,
    trustedIssuerPublicKey: f.issuer.publicKey,
    authorityManifest: f.authorityManifest,
    authorityEvidence: f.authorityEvidence,
    operationalPrivateKey: f.senderOperational.privateKey,
    action: AGENT_EFFECT_CONSUMPTION_ACTION,
    purpose: 'test.conformance',
    destination: 'local',
    inputDigest: INPUT,
    contextDigests: [],
    evidenceObligations: ['consume-before-effect', 'effect.receipt'],
    expectedOutputClasses: ['system-facts.receipt'],
    resourceCeiling: {
      max_requests_per_minute: 5,
      max_concurrent_requests: 1,
      max_execution_ms: 2_000,
      max_request_bytes: 4_096,
      max_response_bytes: 16_384
    },
    notBefore: '2026-08-17T20:02:00.000Z',
    expiresAt: '2026-08-17T20:06:00.000Z',
    nonce: 'nonce.effect.1',
    idempotencyKey: 'idem.effect.1',
    ...overrides
  });
}

function currentness(f, {
  senderCheckpoint = f.senderCheckpoint,
  executorCheckpoint = f.executorCheckpoint,
  executorRevocations = []
} = {}) {
  return {
    senderCurrentness: {
      checkpoint: senderCheckpoint,
      trustedObserverPublicKey: f.senderObserver.publicKey,
      credentialHistory: [f.sender.credential],
      revocations: [],
      trustedIssuerPublicKey: f.issuer.publicKey,
      expectedLatestCheckpointDigest: senderCheckpoint.checkpoint_digest
    },
    executorCurrentness: {
      checkpoint: executorCheckpoint,
      trustedObserverPublicKey: f.executorObserver.publicKey,
      credentialHistory: [f.executor.credential],
      revocations: executorRevocations,
      trustedIssuerPublicKey: f.issuer.publicKey,
      expectedLatestCheckpointDigest: executorCheckpoint.checkpoint_digest
    }
  };
}

async function stateRoot() {
  return mkdtemp(join(tmpdir(), 'axiom-effect-consumption-'));
}

async function consume(f, root, overrides = {}) {
  const handoff = overrides.handoff ?? createHandoff(f);
  const current = overrides.currentness ?? currentness(f);
  return consumeAgentReadSystemFactsHandoff({
    stateRoot: root,
    consumptionId: overrides.consumptionId ?? 'consumption.effect.1',
    handoff,
    handoffEvidence: overrides.handoffEvidence ?? handoffEvidence(f),
    executorIdentityCredential:
      overrides.executorIdentityCredential ?? f.executor.credential,
    trustedExecutorIssuerPublicKey:
      overrides.trustedExecutorIssuerPublicKey ?? f.issuer.publicKey,
    senderCurrentness: current.senderCurrentness,
    executorCurrentness: current.executorCurrentness,
    storePrivateKey: overrides.storePrivateKey ?? f.store.privateKey,
    effectAt: overrides.effectAt ?? EFFECT_AT,
    maxEvidenceAgeMs: overrides.maxEvidenceAgeMs ?? 30_000
  });
}

function recordPath(root, record) {
  const key = record.statement.storage_key;
  return join(root, 'agent-effect-consumption-v1', key.slice(0, 2), `${key}.json`);
}

test('current A4 + A6 evidence can commit one signed pre-effect consumption without claiming effect execution', async t => {
  const f = fixture();
  const root = await stateRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await consume(f, root);
  assert.equal(result.valid, true);
  assert.equal(result.consume_before_effect_committed, true);
  assert.equal(result.effect_executed, false);
  assert.equal(result.effect_admission_authorized, false);
  assert.equal(result.resume_after_recovery_allowed, false);
  assert.equal(result.global_currentness_claimed, false);

  const statement = result.record.statement;
  assert.equal(statement.action, AGENT_EFFECT_CONSUMPTION_ACTION);
  assert.equal(statement.handoff_digest, createHandoff(f).handoff_digest);
  assert.equal(statement.sender_credential_digest, f.sender.credential.credential_digest);
  assert.equal(statement.executor_credential_digest, f.executor.credential.credential_digest);
  assert.equal(statement.sender_active_credential_digest, f.sender.credential.credential_digest);
  assert.equal(statement.executor_active_credential_digest, f.executor.credential.credential_digest);
  assert.equal(statement.effect_at, EFFECT_AT);
  assert.equal(statement.consume_before_effect_committed, true);
  assert.equal(statement.effect_executed, false);
  assert.equal(statement.effect_admission_authorized, false);
  assert.equal(statement.authority_effect, 'none');
  assert.equal(statement.delegation_effect, 'none');

  const recovered = await readAgentEffectConsumptionRecord({
    stateRoot: root,
    handoffDigest: statement.handoff_digest,
    inputDigest: statement.input_digest,
    executorCredentialDigest: statement.executor_credential_digest,
    trustedStorePublicKey: f.store.publicKey,
    expectedRecordDigest: result.record_digest
  });
  assert.equal(recovered.record_digest, result.record_digest);
});

test('same handoff cannot be consumed twice even if caller changes consumption id', async t => {
  const f = fixture();
  const root = await stateRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await consume(f, root, { consumptionId: 'consumption.effect.first' });
  assert.match(first.record_digest, /^[a-f0-9]{64}$/);
  await assert.rejects(
    consume(f, root, { consumptionId: 'consumption.effect.second' }),
    /already exists or is ambiguous; consumed work must not resume/
  );
});

test('stale A6 evidence fails before consumption and does not burn the handoff', async t => {
  const f = fixture();
  const root = await stateRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const staleSender = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.effect.sender.stale',
    checkpointSequence: 1,
    credentialHistory: [f.sender.credential],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey,
    observerId: 'observer.effect.sender',
    observerPrivateKey: f.senderObserver.privateKey,
    evaluatedAt: '2026-08-17T20:01:00.000Z'
  });
  const staleCurrentness = currentness(f, { senderCheckpoint: staleSender });
  await assert.rejects(
    consume(f, root, { currentness: staleCurrentness }),
    /too stale/
  );

  const valid = await consume(f, root, { consumptionId: 'consumption.effect.after-stale' });
  assert.equal(valid.consume_before_effect_committed, true);
});

test('revoked executor A1 credential cannot cross the effect-consumption boundary', async t => {
  const f = fixture();
  const root = await stateRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const revocation = createMachineIdentityRevocation({
    credential: f.executor.credential,
    issuerPrivateKey: f.issuer.privateKey,
    effectiveAt: '2026-08-17T20:02:35.000Z',
    reasonCode: 'compromised'
  });
  const revokedCheckpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.effect.executor.revoked',
    checkpointSequence: 1,
    credentialHistory: [f.executor.credential],
    revocations: [revocation],
    trustedIssuerPublicKey: f.issuer.publicKey,
    observerId: 'observer.effect.executor',
    observerPrivateKey: f.executorObserver.privateKey,
    evaluatedAt: '2026-08-17T20:02:36.000Z'
  });
  const revokedCurrentness = currentness(f, {
    executorCheckpoint: revokedCheckpoint,
    executorRevocations: [revocation]
  });
  await assert.rejects(
    consume(f, root, { currentness: revokedCurrentness }),
    /revoked; new effect denied/
  );
});

test('executor identity substitution is rejected before one-time state is committed', async t => {
  const f = fixture();
  const root = await stateRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const otherOperational = generateKeyPairSync('ed25519');
  const other = createIdentity({
    id: 'agent.effect.attacker.1',
    issuer: f.issuer,
    operational: otherOperational
  });
  await assert.rejects(
    consume(f, root, { executorIdentityCredential: other.credential }),
    /principal_id mismatch|does not match handoff intended executor identity/
  );

  const valid = await consume(f, root, { consumptionId: 'consumption.effect.after-substitution' });
  assert.equal(valid.consume_before_effect_committed, true);
});

test('a separately valid non-reviewed action cannot reuse the fixed read-system-facts consumption gate', async t => {
  const f = fixture();
  const root = await stateRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const handoff = createHandoff(f, {
    handoffId: 'handoff.effect.noop',
    action: 'agent.noop',
    nonce: 'nonce.effect.noop',
    idempotencyKey: 'idem.effect.noop'
  });
  await assert.rejects(
    consume(f, root, { handoff }),
    /only admits agent\.read-system-facts/
  );
});

test('store signer substitution, semantic elevation and record tamper fail closed', async t => {
  const f = fixture();
  const root = await stateRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await consume(f, root);
  const wrongStore = generateKeyPairSync('ed25519');
  assert.throws(
    () => verifyAgentEffectConsumptionRecord(result.record, {
      trustedStorePublicKey: wrongStore.publicKey
    }),
    /store key substitution/
  );

  const elevated = structuredClone(result.record);
  elevated.statement.effect_executed = true;
  assert.throws(
    () => verifyAgentEffectConsumptionRecord(elevated, {
      trustedStorePublicKey: f.store.publicKey
    }),
    /effect_executed must remain false/
  );

  const tampered = structuredClone(result.record);
  tampered.statement.input_digest = '9'.repeat(64);
  await writeFile(recordPath(root, result.record), `${JSON.stringify(tampered)}\n`, 'utf8');
  await assert.rejects(
    readAgentEffectConsumptionRecord({
      stateRoot: root,
      handoffDigest: result.record.statement.handoff_digest,
      inputDigest: result.record.statement.input_digest,
      executorCredentialDigest: result.record.statement.executor_credential_digest,
      trustedStorePublicKey: f.store.publicKey,
      expectedRecordDigest: result.record_digest
    }),
    /statement digest mismatch|storage_key does not reproduce|store signature is invalid|record_digest mismatch/
  );
});

test('retained record digest turns missing local state into rollback/uncertainty instead of permission', async t => {
  const f = fixture();
  const root = await stateRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await consume(f, root);
  await rm(recordPath(root, result.record), { force: true });
  await assert.rejects(
    readAgentEffectConsumptionRecord({
      stateRoot: root,
      handoffDigest: result.record.statement.handoff_digest,
      inputDigest: result.record.statement.input_digest,
      executorCredentialDigest: result.record.statement.executor_credential_digest,
      trustedStorePublicKey: f.store.publicKey,
      expectedRecordDigest: result.record_digest
    }),
    /rollback\/uncertainty detected/
  );
});

test('effect-consumption module is bounded to control-state filesystem and has no target-effect imports', async () => {
  const source = await readFile(new URL(
    '../src/lib/agent-trust-effect-consumption.mjs',
    import.meta.url
  ), 'utf8');
  for (const forbidden of [
    "'node:child_process'",
    '"node:child_process"',
    "'node:http'",
    '"node:http"',
    "'node:https'",
    '"node:https"',
    "'node:net'",
    '"node:net"',
    "'node:dns'",
    '"node:dns"'
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden target-effect import ${forbidden}`);
  }
  assert.match(source, /from 'node:fs\/promises'/);
  assert.match(source, /open\(filePath, 'wx'/);
  assert.match(source, /resume_after_recovery_allowed: false/);
  assert.match(source, /effect_executed: false/);
  assert.match(source, /effect_admission_authorized: false/);
});

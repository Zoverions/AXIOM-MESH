import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { appendFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, digestObject } from '../src/lib/canonical.mjs';
import { DELEGATION_ROOT_BINDING_SCHEMA } from '../src/lib/delegation-ledger.mjs';
import { createDelegationRootAttestationKeyCredential } from '../src/lib/delegation-root-attestation-key-lifecycle.mjs';
import { createDelegationRootAttestationKeyCurrentnessCheckpoint } from '../src/lib/delegation-root-attestation-key-currentness-checkpoint.mjs';
import { createDelegationRootAttestationKeyCurrentnessAnchor } from '../src/lib/delegation-root-attestation-key-currentness-anchor.mjs';
import {
  PUBLIC_WITNESS_PROCESS_CONFIG_SCHEMA,
  PUBLIC_WITNESS_PROCESS_REQUEST_SCHEMA,
  handlePublicWitnessProcessRequest,
  loadPublicWitnessProcessRuntime
} from '../src/public-witness-service.mjs';

const T0 = '2026-08-28T16:00:00.000Z';
const T1 = '2026-08-28T16:10:00.000Z';
const T2 = '2026-08-28T16:20:00.000Z';
const T3 = '2026-08-28T16:30:00.000Z';
const T4 = '2026-08-28T16:40:00.000Z';
const DOMAIN = 'axiom.delegation.currentness.v1';
const WITNESS_ID = 'witness.alpha';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    ...pair,
    privatePem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function rootBinding({ holder = 'owner.alice', authorityDigest = 'a'.repeat(64) } = {}) {
  const core = {
    schema: DELEGATION_ROOT_BINDING_SCHEMA,
    root_holder: holder,
    root_authority_digest: authorityDigest,
    execution_authority_granted: false,
    authority_effect: 'none'
  };
  return { ...core, binding_digest: digestObject(core) };
}

function fixture() {
  const binding = rootBinding();
  const controller = keys();
  const witness = keys();
  const otherWitness = keys();
  const operational1 = keys();
  const operational2 = keys();

  const credential1 = createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: operational1.publicKey,
    keyEpoch: 1,
    activatedAt: T0
  });
  const credential2 = createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: operational2.publicKey,
    keyEpoch: 2,
    activatedAt: T1,
    transitionKind: 'rotation',
    predecessorCredential: credential1,
    predecessorDisposition: 'retired'
  });

  const checkpoint1 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [credential1],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T1
  });
  const checkpoint2 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [credential1, credential2],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 2,
    checkpointedAt: T2,
    predecessorCheckpoint: checkpoint1
  });
  const alternateCheckpoint2 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [credential1, credential2],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 2,
    checkpointedAt: T3,
    predecessorCheckpoint: checkpoint1
  });

  const anchor1 = createDelegationRootAttestationKeyCurrentnessAnchor({
    checkpoint: checkpoint1,
    checkpointPath: [checkpoint1],
    trustedControllerPublicKey: controller.publicKey,
    expectedRootBindingDigest: binding.binding_digest,
    expectedRootAuthorityDigest: binding.root_authority_digest,
    expectedRootHolder: binding.root_holder,
    witnessId: WITNESS_ID,
    witnessPrivateKey: witness.privateKey,
    anchorSequence: 1,
    anchoredAt: T2
  });
  const anchor2 = createDelegationRootAttestationKeyCurrentnessAnchor({
    checkpoint: checkpoint2,
    checkpointPath: [checkpoint1, checkpoint2],
    trustedControllerPublicKey: controller.publicKey,
    expectedRootBindingDigest: binding.binding_digest,
    expectedRootAuthorityDigest: binding.root_authority_digest,
    expectedRootHolder: binding.root_holder,
    witnessId: WITNESS_ID,
    witnessPrivateKey: witness.privateKey,
    anchorSequence: 2,
    anchoredAt: T3,
    predecessorAnchor: anchor1
  });
  const alternateAnchor2 = createDelegationRootAttestationKeyCurrentnessAnchor({
    checkpoint: alternateCheckpoint2,
    checkpointPath: [checkpoint1, alternateCheckpoint2],
    trustedControllerPublicKey: controller.publicKey,
    expectedRootBindingDigest: binding.binding_digest,
    expectedRootAuthorityDigest: binding.root_authority_digest,
    expectedRootHolder: binding.root_holder,
    witnessId: WITNESS_ID,
    witnessPrivateKey: witness.privateKey,
    anchorSequence: 2,
    anchoredAt: T4,
    predecessorAnchor: anchor1
  });

  return {
    binding,
    controller,
    witness,
    otherWitness,
    checkpoint1,
    checkpoint2,
    alternateCheckpoint2,
    anchor1,
    anchor2,
    alternateAnchor2
  };
}

async function storeModule() {
  try {
    return await import('../src/lib/public-witness-currentness-anchor-store.mjs');
  } catch (error) {
    assert.fail(`public witness currentness anchor store module must exist: ${error.message}`);
  }
}

async function tempState(t, name = 'anchors.jsonl') {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-public-witness-anchor-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  return { dir, statePath: join(dir, name) };
}

async function openStore(f, statePath, extra = {}) {
  const { openPublicWitnessCurrentnessAnchorStore } = await storeModule();
  return openPublicWitnessCurrentnessAnchorStore({
    statePath,
    domainId: DOMAIN,
    witnessId: WITNESS_ID,
    witnessPrivateKey: f.witness.privatePem,
    ...extra
  });
}

function publishRequest(f, anchor, checkpoint, publishedAt = T4) {
  return {
    anchor,
    anchoredCheckpoint: checkpoint,
    trustedControllerPublicKey: f.controller.publicPem,
    publishedAt
  };
}

function chainQuery(f) {
  return {
    rootBindingDigest: f.binding.binding_digest,
    rootAuthorityDigest: f.binding.root_authority_digest,
    rootHolder: f.binding.root_holder,
    controllerKeyId: f.anchor1.statement.controller_key_id
  };
}

function processRequest(requestId, operation, payload) {
  return {
    schema: PUBLIC_WITNESS_PROCESS_REQUEST_SCHEMA,
    request_id: requestId,
    operation,
    payload
  };
}

async function processFixture(t, f) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-public-witness-anchor-process-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const keyPath = join(dir, 'witness-key.pem');
  const statePath = join(dir, 'witness-state.jsonl');
  const configPath = join(dir, 'witness-config.json');
  await writeFile(keyPath, f.witness.privatePem, { encoding: 'utf8', mode: 0o600 });
  await writeFile(configPath, JSON.stringify({
    schema: PUBLIC_WITNESS_PROCESS_CONFIG_SCHEMA,
    domain_id: DOMAIN,
    witness_id: WITNESS_ID,
    witness_private_key_path: './witness-key.pem',
    state_path: './witness-state.jsonl',
    max_artifacts: null,
    max_conflicts: null,
    max_state_bytes: null,
    max_record_bytes: null,
    max_request_bytes: 1024 * 1024
  }), 'utf8');
  const runtime = await loadPublicWitnessProcessRuntime(configPath);
  return { dir, statePath, runtime };
}

test('public witness anchor store durably publishes a verified anchor without authority or global-currentness claims', async t => {
  const f = fixture();
  const { statePath } = await tempState(t);
  const store = await openStore(f, statePath);
  const result = await store.publish(publishRequest(f, f.anchor1, f.checkpoint1));

  assert.equal(result.status, 'published');
  assert.equal(result.anchor.anchor_digest, f.anchor1.anchor_digest);
  assert.equal(result.durable_record.statement.anchor_digest, f.anchor1.anchor_digest);
  assert.equal(result.durable_record.statement.data_availability_claimed, false);
  assert.equal(result.durable_record.statement.global_currentness_claimed, false);
  assert.equal(result.durable_record.statement.finality_claimed, false);
  assert.equal(result.durable_record.statement.authority_effect, 'none');
  assert.equal(result.durable_record.statement.network_effect, 'none');
  assert.equal(result.execution_authority_granted, false);
  assert.ok((await readFile(statePath, 'utf8')).endsWith('\n'));
});

test('public witness anchor store retrieves exact signed anchors by digest and chain head', async t => {
  const f = fixture();
  const { statePath } = await tempState(t);
  const store = await openStore(f, statePath);
  await store.publish(publishRequest(f, f.anchor1, f.checkpoint1, T2));
  await store.publish(publishRequest(f, f.anchor2, f.checkpoint2, T4));

  assert.deepEqual(store.getAnchor(f.anchor1.anchor_digest), f.anchor1);
  assert.deepEqual(store.getAnchor(f.anchor2.anchor_digest), f.anchor2);
  assert.deepEqual(store.getHead(chainQuery(f)), f.anchor2);
  assert.equal(store.getAnchor('f'.repeat(64)), null);
});

test('public witness anchor store replay is idempotent and does not append a duplicate durable record', async t => {
  const f = fixture();
  const { statePath } = await tempState(t);
  const store = await openStore(f, statePath);
  await store.publish(publishRequest(f, f.anchor1, f.checkpoint1, T2));
  const replay = await store.publish(publishRequest(f, f.anchor1, f.checkpoint1, T3));

  assert.equal(replay.status, 'replay');
  assert.equal(replay.durable_record, null);
  assert.equal((await readFile(statePath, 'utf8')).trim().split('\n').length, 1);
});

test('public witness anchor store survives restart and re-verifies durable publication state', async t => {
  const f = fixture();
  const { statePath } = await tempState(t);
  const first = await openStore(f, statePath);
  await first.publish(publishRequest(f, f.anchor1, f.checkpoint1, T2));
  await first.publish(publishRequest(f, f.anchor2, f.checkpoint2, T4));

  const reopened = await openStore(f, statePath);
  const verified = await reopened.verifyState();
  assert.equal(verified.valid, true);
  assert.equal(verified.records, 2);
  assert.equal(verified.anchor_count, 2);
  assert.equal(verified.global_currentness_claimed, false);
  assert.deepEqual(reopened.getHead(chainQuery(f)), f.anchor2);
});

test('public witness anchor store rejects rollback and same-sequence fork publication', async t => {
  const f = fixture();
  const { statePath } = await tempState(t);
  const store = await openStore(f, statePath);
  await store.publish(publishRequest(f, f.anchor1, f.checkpoint1, T2));
  await store.publish(publishRequest(f, f.anchor2, f.checkpoint2, T4));

  await assert.rejects(
    store.publish(publishRequest(f, f.anchor1, f.checkpoint1, T4)),
    /rollback|stale|older anchor|sequence moved backward/i
  );
  await assert.rejects(
    store.publish(publishRequest(f, f.alternateAnchor2, f.alternateCheckpoint2, T4)),
    /equivocation|same.*sequence|fork|different.*digest/i
  );
});

test('public witness anchor store rejects wrong witness identity/key and signed-content tampering', async t => {
  const f = fixture();
  const { statePath } = await tempState(t);
  const store = await openStore(f, statePath);

  const wrongWitnessAnchor = createDelegationRootAttestationKeyCurrentnessAnchor({
    checkpoint: f.checkpoint1,
    checkpointPath: [f.checkpoint1],
    trustedControllerPublicKey: f.controller.publicKey,
    expectedRootBindingDigest: f.binding.binding_digest,
    expectedRootAuthorityDigest: f.binding.root_authority_digest,
    expectedRootHolder: f.binding.root_holder,
    witnessId: 'witness.other',
    witnessPrivateKey: f.otherWitness.privateKey,
    anchorSequence: 1,
    anchoredAt: T2
  });
  await assert.rejects(
    store.publish(publishRequest(f, wrongWitnessAnchor, f.checkpoint1, T3)),
    /witness.*key|witness.*identity|trusted witness|substitution/i
  );

  const tampered = structuredClone(f.anchor1);
  tampered.statement.root_holder = 'owner.mallory';
  await assert.rejects(
    store.publish(publishRequest(f, tampered, f.checkpoint1, T3)),
    /statement digest|signature|root.*match|tamper/i
  );
});

test('public witness anchor store fails closed on torn or tampered durable state', async t => {
  const f = fixture();
  const { statePath } = await tempState(t);
  const store = await openStore(f, statePath);
  await store.publish(publishRequest(f, f.anchor1, f.checkpoint1, T2));
  await appendFile(statePath, '{"torn":', 'utf8');

  await assert.rejects(openStore(f, statePath), /incomplete trailing|torn|valid JSON/i);
});

test('public witness anchor store rejects symlink state paths and configured byte-limit exhaustion', { skip: process.platform === 'win32' }, async t => {
  const f = fixture();
  const { dir, statePath } = await tempState(t);
  const realPath = join(dir, 'real.jsonl');
  await writeFile(realPath, '', 'utf8');
  await symlink(realPath, statePath);
  await assert.rejects(openStore(f, statePath), /regular non-symlink|symlink/i);

  const boundedPath = join(dir, 'bounded.jsonl');
  const bounded = await openStore(f, boundedPath, { maxStateBytes: 512, maxRecordBytes: 512 });
  await assert.rejects(
    bounded.publish(publishRequest(f, f.anchor1, f.checkpoint1, T2)),
    /byte limit|capacity|record.*exceeds/i
  );
});

test('public witness process publishes and retrieves currentness anchors without widening existing witness semantics', async t => {
  const f = fixture();
  const data = await processFixture(t, f);
  const published = await handlePublicWitnessProcessRequest(data.runtime, processRequest(
    'anchor-publish-one',
    'publish-currentness-anchor',
    {
      anchor: f.anchor1,
      anchored_checkpoint: f.checkpoint1,
      trusted_controller_public_key: f.controller.publicPem,
      published_at: T3
    }
  ));
  assert.equal(published.ok, true);
  assert.equal(published.result.status, 'published');
  assert.equal(published.result.anchor.anchor_digest, f.anchor1.anchor_digest);
  assert.equal(published.result.global_currentness_claimed, false);
  assert.equal(published.result.execution_authority_granted, false);

  const fetched = await handlePublicWitnessProcessRequest(data.runtime, processRequest(
    'anchor-get-one',
    'get-currentness-anchor',
    { anchor_digest: f.anchor1.anchor_digest }
  ));
  assert.equal(fetched.ok, true);
  assert.deepEqual(fetched.result, f.anchor1);

  const head = await handlePublicWitnessProcessRequest(data.runtime, processRequest(
    'anchor-head-one',
    'get-currentness-anchor-head',
    {
      root_binding_digest: f.binding.binding_digest,
      root_authority_digest: f.binding.root_authority_digest,
      root_holder: f.binding.root_holder,
      controller_key_id: f.anchor1.statement.controller_key_id
    }
  ));
  assert.equal(head.ok, true);
  assert.deepEqual(head.result, f.anchor1);

  const legacySnapshot = await handlePublicWitnessProcessRequest(data.runtime, processRequest('legacy-snapshot', 'snapshot', {}));
  assert.equal(legacySnapshot.ok, true);
  assert.equal(legacySnapshot.result.global_currentness_claimed, false);
  assert.equal(legacySnapshot.result.network_effect, 'none');
});

test('public witness process rejects malformed currentness-anchor payloads through the existing structured error boundary', async t => {
  const f = fixture();
  const data = await processFixture(t, f);
  const malformed = await handlePublicWitnessProcessRequest(data.runtime, processRequest(
    'anchor-bad-one',
    'publish-currentness-anchor',
    {
      anchor: f.anchor1,
      anchored_checkpoint: f.checkpoint1,
      trusted_controller_public_key: f.controller.publicPem,
      published_at: T3,
      extra: true
    }
  ));
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error.code, 'validation_error');
  assert.match(malformed.error.message, /fields are invalid|unsupported field/i);
});

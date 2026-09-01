import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, digestObject } from '../src/lib/canonical.mjs';
import {
  createMachinePrincipalCurrentnessCheckpoint
} from '../src/lib/machine-principal-currentness-checkpoint.mjs';

const PRINCIPAL_ID = 'agent.currentness.store';
const PRINCIPAL_TYPE = 'agent';
const AUTHORITY_1 = 'a'.repeat(64);
const AUTHORITY_2 = 'b'.repeat(64);
const T1 = '2026-09-01T16:00:00.000Z';
const T2 = '2026-09-01T16:01:00.000Z';
const T3 = '2026-09-01T16:02:00.000Z';

function currentness({
  authorityDigest = AUTHORITY_1,
  status = 'active',
  sequence = 1,
  observedAt = T1,
  predecessorHeadDigest = null,
  sourceSeed = 'head-1'
} = {}) {
  return {
    schema: 'axiom-machine-principal-currentness.v1',
    principal_id: PRINCIPAL_ID,
    principal_type: PRINCIPAL_TYPE,
    authority_digest: authorityDigest,
    status,
    sequence,
    observed_at: observedAt,
    source_head_digest: digestObject({ sourceSeed, sequence, authorityDigest, status }),
    predecessor_head_digest: predecessorHeadDigest,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  };
}

function fixture() {
  const controller = generateKeyPairSync('ed25519');
  const oneCurrentness = currentness();
  const one = createMachinePrincipalCurrentnessCheckpoint({
    currentness: oneCurrentness,
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const twoCurrentness = currentness({
    authorityDigest: AUTHORITY_2,
    sequence: 2,
    observedAt: T2,
    predecessorHeadDigest: oneCurrentness.source_head_digest,
    sourceSeed: 'head-2'
  });
  const two = createMachinePrincipalCurrentnessCheckpoint({
    currentness: twoCurrentness,
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const threeCurrentness = currentness({
    authorityDigest: AUTHORITY_2,
    status: 'revoked',
    sequence: 3,
    observedAt: T3,
    predecessorHeadDigest: twoCurrentness.source_head_digest,
    sourceSeed: 'head-3'
  });
  const three = createMachinePrincipalCurrentnessCheckpoint({
    currentness: threeCurrentness,
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const conflict = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({ sourceSeed: 'conflict' }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  return { controller, one, two, three, conflict };
}

async function tempState(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-machine-currentness-store-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  return { dir, statePath: join(dir, 'state.jsonl') };
}

function openOptions(statePath, fixture, extra = {}) {
  return {
    statePath,
    trustedControllerPublicKey: fixture.controller.publicKey,
    expectedPrincipalId: PRINCIPAL_ID,
    expectedPrincipalType: PRINCIPAL_TYPE,
    ...extra
  };
}

test('durable machine currentness store persists retained latest head with explicit local-only claims', async t => {
  const f = fixture();
  const { statePath } = await tempState(t);
  const { openMachinePrincipalCurrentnessStore } =
    await import('../src/lib/machine-principal-currentness-store.mjs');

  const store = await openMachinePrincipalCurrentnessStore(openOptions(statePath, f));
  const retained = await store.retain(f.one);
  assert.equal(retained.status, 'retained');
  assert.equal(retained.execution_authority_granted, false);

  const snapshot = store.snapshot();
  assert.equal(snapshot.durable_checkpoint_count, 1);
  assert.equal(snapshot.durable_head_checkpoint_sequence, 1);
  assert.equal(snapshot.durable_head_checkpoint_digest, f.one.checkpoint_digest);
  assert.equal(snapshot.principal_id, PRINCIPAL_ID);
  assert.equal(snapshot.authority_digest, AUTHORITY_1);
  assert.equal(snapshot.local_durable_retention_claimed, true);
  assert.equal(snapshot.storage_rollback_proof_claimed, false);
  assert.equal(snapshot.external_witness_claimed, false);
  assert.equal(snapshot.global_currentness_claimed, false);
  assert.equal(snapshot.authority_effect, 'none');
  assert.equal(snapshot.execution_authority_granted, false);

  const reopened = await openMachinePrincipalCurrentnessStore(openOptions(statePath, f));
  const verified = await reopened.verifyState();
  assert.equal(verified.valid, true);
  assert.equal(verified.durable_head_checkpoint_digest, f.one.checkpoint_digest);
  assert.equal(reopened.retainedHead().checkpoint_digest, f.one.checkpoint_digest);
});

test('store rejects rollback, same-sequence equivocation and sequence gaps while exact head replay is idempotent', async t => {
  const f = fixture();
  const { statePath } = await tempState(t);
  const { openMachinePrincipalCurrentnessStore } =
    await import('../src/lib/machine-principal-currentness-store.mjs');
  const store = await openMachinePrincipalCurrentnessStore(openOptions(statePath, f));

  await store.retain(f.one);
  const replay = await store.retain(f.one);
  assert.equal(replay.status, 'already-retained');

  await assert.rejects(store.retain(f.conflict), /equivocation|different signed digest/i);
  await assert.rejects(store.retain(f.three), /advance by one|sequence gap/i);

  await store.retain(f.two);
  await assert.rejects(store.retain(f.one), /rollback|older than retained/i);
  const terminal = await store.retain(f.three);
  assert.equal(terminal.status, 'retained');
  assert.equal(store.snapshot().status, 'revoked');
});

test('store rejects torn, non-canonical, truncated and tampered durable histories', async t => {
  const f = fixture();
  const { statePath } = await tempState(t);
  const { openMachinePrincipalCurrentnessStore } =
    await import('../src/lib/machine-principal-currentness-store.mjs');

  await writeFile(statePath, canonicalJson(f.one), 'utf8');
  await assert.rejects(
    openMachinePrincipalCurrentnessStore(openOptions(statePath, f)),
    /incomplete trailing|torn/i
  );

  await writeFile(statePath, `${JSON.stringify(f.one, null, 2)}\n`, 'utf8');
  await assert.rejects(
    openMachinePrincipalCurrentnessStore(openOptions(statePath, f)),
    /canonical JSON/i
  );

  await writeFile(statePath, `${canonicalJson(f.two)}\n`, 'utf8');
  await assert.rejects(
    openMachinePrincipalCurrentnessStore(openOptions(statePath, f)),
    /begin at sequence 1|truncated path/i
  );

  const tampered = structuredClone(f.one);
  tampered.statement.authority_digest = 'f'.repeat(64);
  await writeFile(statePath, `${canonicalJson(tampered)}\n`, 'utf8');
  await assert.rejects(
    openMachinePrincipalCurrentnessStore(openOptions(statePath, f)),
    /statement digest|signature|digest mismatch/i
  );
});

test('active store detects external durable mutation and state path must not be a symlink', async t => {
  const f = fixture();
  const { dir, statePath } = await tempState(t);
  const { openMachinePrincipalCurrentnessStore } =
    await import('../src/lib/machine-principal-currentness-store.mjs');

  const store = await openMachinePrincipalCurrentnessStore(openOptions(statePath, f));
  await store.retain(f.one);
  await writeFile(
    statePath,
    `${canonicalJson(f.one)}\n${canonicalJson(f.two)}\n`,
    'utf8'
  );
  await assert.rejects(
    store.retain(f.two),
    /changed outside|disk and memory histories differ/i
  );

  const target = join(dir, 'target.jsonl');
  const link = join(dir, 'link.jsonl');
  await writeFile(target, '', 'utf8');
  await symlink(target, link);
  await assert.rejects(
    openMachinePrincipalCurrentnessStore(openOptions(link, f)),
    /regular non-symlink file/i
  );
});

test('durable machine currentness store enforces state/checkpoint bounds and fsync discipline', async t => {
  const f = fixture();
  const { statePath } = await tempState(t);
  const { openMachinePrincipalCurrentnessStore } =
    await import('../src/lib/machine-principal-currentness-store.mjs');
  const line = `${canonicalJson(f.one)}\n`;
  await writeFile(statePath, line, 'utf8');

  await assert.rejects(
    openMachinePrincipalCurrentnessStore(openOptions(statePath, f, {
      maxStateBytes: Buffer.byteLength(line, 'utf8') - 1
    })),
    /state exceeds configured byte limit/i
  );
  await assert.rejects(
    openMachinePrincipalCurrentnessStore(openOptions(statePath, f, {
      maxCheckpointBytes: Buffer.byteLength(canonicalJson(f.one), 'utf8') - 1
    })),
    /checkpoint 1 exceeds configured byte limit/i
  );

  const source = await readFile(
    new URL('../src/lib/machine-principal-currentness-store.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /await\s+handle\.sync\(\)/);
  assert.doesNotMatch(source, /\bappendFile\s*\(/);
});

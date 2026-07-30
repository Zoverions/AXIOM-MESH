import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

function acceptedEvent(index) {
  return {
    kind: 'intent.accepted',
    subject: `intent_checkpoint_${index}`,
    payload: {
      intent_id: `intent_checkpoint_${index}`,
      principal: 'person:checkpoint',
      action: 'system.echo',
      risk: 'low',
      input_digest: sha256(`input-${index}`),
      request_digest: sha256(`request-${index}`)
    }
  };
}

async function checkpointFixture(t, { checkpointInterval = 10_000 } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-checkpoint-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector,
    checkpointInterval
  });
  t.after(() => {
    try {
      store.close();
    } catch {
      // The test may close the store deliberately before restart.
    }
  });
  return { dataDir, identity, protector, store };
}

test('signed checkpoints bound default verification to the uncheckpointed suffix', async t => {
  const { store } = await checkpointFixture(t);
  store.appendEvents({
    traceId: 'trace_checkpoint_0001',
    actor: 'person:checkpoint',
    events: [acceptedEvent(1)]
  });
  const first = store.verifyChain();
  assert.equal(first.valid, true);
  assert.equal(first.verification_mode, 'checkpoint');
  assert.equal(first.checkpoint_seq, 1);
  assert.equal(first.verified_events, 0);
  assert.equal(first.events, 1);

  store.appendEvents({
    traceId: 'trace_checkpoint_0002',
    actor: 'person:checkpoint',
    events: [acceptedEvent(2)]
  });
  const suffix = store.verifyChain();
  assert.equal(suffix.valid, true);
  assert.equal(suffix.verification_mode, 'checkpoint');
  assert.equal(suffix.checkpoint_seq, 1);
  assert.equal(suffix.verified_events, 1);
  assert.equal(suffix.verified_from_seq, 2);
  assert.equal(suffix.verified_through_seq, 2);

  const full = store.verifyFullChain();
  assert.equal(full.valid, true);
  assert.equal(full.verification_mode, 'full');
  assert.equal(full.verified_events, 2);
  assert.equal(full.verified_from_seq, 1);
});

test('periodic checkpoint history is signed, linked, and restart-verifiable', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-checkpoint-restart-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new GridStore({
    path,
    dataDir,
    identity,
    protector,
    checkpointInterval: 1
  });
  for (let index = 1; index <= 3; index += 1) {
    store.appendEvents({
      traceId: `trace_checkpoint_link_${index}`,
      actor: 'person:checkpoint',
      events: [acceptedEvent(index)]
    });
  }
  const history = store.listChainCheckpoints();
  assert.equal(history.length, 3);
  assert.equal(history[0].statement.previous_checkpoint_digest, null);
  assert.equal(
    history[1].statement.previous_checkpoint_digest,
    history[0].checkpoint_digest
  );
  assert.equal(
    history[2].statement.previous_checkpoint_digest,
    history[1].checkpoint_digest
  );
  store.close();

  store = new GridStore({
    path,
    dataDir,
    identity,
    protector,
    checkpointInterval: 1
  });
  const verified = store.verifyChain();
  assert.equal(verified.valid, true);
  assert.equal(verified.verification_mode, 'checkpoint');
  assert.equal(verified.checkpoint_count, 3);
  assert.equal(verified.checkpoint_seq, 3);
  assert.equal(verified.verified_events, 0);
  store.close();
});

test('checkpoint corruption and unavailable verification keys fail closed', async t => {
  const { store } = await checkpointFixture(t);
  store.appendEvents({
    traceId: 'trace_checkpoint_corrupt',
    actor: 'person:checkpoint',
    events: [acceptedEvent(1)]
  });
  const original = store.db.prepare(
    "SELECT value FROM meta WHERE key = 'chain_checkpoints_v1'"
  ).get().value;
  const history = JSON.parse(original);
  history[0].checkpoint_digest = 'f'.repeat(64);
  store.db.prepare(
    "UPDATE meta SET value = ? WHERE key = 'chain_checkpoints_v1'"
  ).run(JSON.stringify(history));
  assert.equal(store.verifyChain().reason, 'checkpoint_digest_mismatch');
  assert.equal(store.verifyFullChain().valid, true);

  store.db.prepare(
    "UPDATE meta SET value = ? WHERE key = 'chain_checkpoints_v1'"
  ).run(original);
  const signer = JSON.parse(original)[0].attestation.key_id;
  store.verificationKeys.delete(signer);
  assert.equal(store.verifyChain().reason, 'checkpoint_verification_key_mismatch');
  assert.equal(store.verifyFullChain().reason, 'signature_mismatch');
});

test('checkpoint verification detects corruption in the suffix', async t => {
  const { store } = await checkpointFixture(t);
  store.appendEvents({
    traceId: 'trace_checkpoint_suffix_1',
    actor: 'person:checkpoint',
    events: [acceptedEvent(1)]
  });
  store.appendEvents({
    traceId: 'trace_checkpoint_suffix_2',
    actor: 'person:checkpoint',
    events: [acceptedEvent(2)]
  });
  assert.equal(store.verifyChain().checkpoint_seq, 1);
  store.db.prepare('UPDATE events SET payload_json = ? WHERE seq = 2').run(
    '{"tampered":true}'
  );
  const verification = store.verifyChain();
  assert.equal(verification.valid, false);
  assert.equal(verification.seq, 2);
  assert.equal(verification.reason, 'payload_decryption_failed');
});

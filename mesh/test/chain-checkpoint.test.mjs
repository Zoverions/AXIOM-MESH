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
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector,
    checkpointInterval
  });
  t.after(async () => {
    try {
      store.close();
    } catch {
      // The test may close the store deliberately before restart.
    }
    await rm(dataDir, { recursive: true, force: true });
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

function appendAccepted(store, index) {
  store.appendEvents({
    traceId: `trace_checkpoint_head_${index}`,
    actor: 'person:checkpoint',
    events: [acceptedEvent(index)]
  });
}

function readHead(store) {
  const row = store.db.prepare(
    "SELECT value FROM meta WHERE key = 'chain_checkpoint_head_v1'"
  ).get();
  return row ? JSON.parse(row.value) : null;
}

test('routine appends do not read checkpoint history (S-03)', async t => {
  const { store } = await checkpointFixture(t, { checkpointInterval: 3 });
  appendAccepted(store, 1); // first append always checkpoints
  assert.deepEqual(readHead(store), {
    seq: 1,
    checkpoint_digest: store.listChainCheckpoints().at(-1).checkpoint_digest
  });

  const readHistory = store.readCheckpointHistory.bind(store);
  let historyReads = 0;
  store.readCheckpointHistory = () => {
    historyReads += 1;
    return readHistory();
  };
  appendAccepted(store, 2);
  appendAccepted(store, 3);
  assert.equal(historyReads, 0, 'appends before the interval never parse history');

  appendAccepted(store, 4);
  assert.equal(historyReads, 1, 'the append that reaches the interval takes the full path');
  assert.equal(store.listChainCheckpoints().at(-1).statement.seq, 4);
  assert.equal(readHead(store).seq, 4);
  assert.equal(store.verifyChain().valid, true);
});

test('a missing, malformed or impossible checkpoint head falls back to the history', async t => {
  const { store } = await checkpointFixture(t, { checkpointInterval: 3 });
  appendAccepted(store, 1);
  const setHead = value => store.db.prepare(
    "UPDATE meta SET value = ? WHERE key = 'chain_checkpoint_head_v1'"
  ).run(value);

  // Ahead of the chain: rewritten from the history, no checkpoint skipped.
  setHead(JSON.stringify({ seq: 999, checkpoint_digest: 'a'.repeat(64) }));
  appendAccepted(store, 2);
  assert.equal(readHead(store).seq, 1);

  setHead('not json');
  appendAccepted(store, 3);
  assert.equal(readHead(store).seq, 1);

  // A pre-S-03 store has no head at all.
  store.db.prepare("DELETE FROM meta WHERE key = 'chain_checkpoint_head_v1'").run();
  appendAccepted(store, 4);
  assert.equal(readHead(store).seq, 4);
  assert.equal(store.listChainCheckpoints().length, 2);
});

test('an edited checkpoint head cannot make a tampered history verify', async t => {
  const { store } = await checkpointFixture(t, { checkpointInterval: 3 });
  appendAccepted(store, 1);
  const history = JSON.parse(store.db.prepare(
    "SELECT value FROM meta WHERE key = 'chain_checkpoints_v1'"
  ).get().value);
  history[0].checkpoint_digest = 'f'.repeat(64);
  store.db.prepare(
    "UPDATE meta SET value = ? WHERE key = 'chain_checkpoints_v1'"
  ).run(JSON.stringify(history));
  store.db.prepare(
    "UPDATE meta SET value = ? WHERE key = 'chain_checkpoint_head_v1'"
  ).run(JSON.stringify({ seq: 1, checkpoint_digest: 'f'.repeat(64) }));

  appendAccepted(store, 2); // not due, so the corrupt history is not consulted
  assert.equal(store.verifyChain().reason, 'checkpoint_digest_mismatch');
  assert.equal(store.verifyFullChain().valid, true);
});

function countVerifiedCheckpoints(store) {
  const verifyStoredEvent = store.verifyStoredEvent.bind(store);
  const counter = { count: 0 };
  store.verifyStoredEvent = row => {
    counter.count += 1;
    return verifyStoredEvent(row);
  };
  return counter;
}

function rewriteHistory(store, edit) {
  const history = JSON.parse(store.db.prepare(
    "SELECT value FROM meta WHERE key = 'chain_checkpoints_v1'"
  ).get().value);
  edit(history);
  store.db.prepare(
    "UPDATE meta SET value = ? WHERE key = 'chain_checkpoints_v1'"
  ).run(JSON.stringify(history));
}

test('checkpoint verification re-verifies only records after an unchanged, verified prefix (S-03)', async t => {
  const { store } = await checkpointFixture(t, { checkpointInterval: 1 });
  for (let index = 1; index <= 5; index += 1) appendAccepted(store, index);
  const counter = countVerifiedCheckpoints(store);

  assert.equal(store.verifyChain().valid, true);
  assert.equal(counter.count, 5, 'first verification checks every checkpoint');

  counter.count = 0;
  assert.equal(store.verifyChain().valid, true);
  assert.equal(counter.count, 1, 'unchanged history: only the latest checkpoint');

  appendAccepted(store, 6);
  appendAccepted(store, 7);
  counter.count = 0;
  const verified = store.verifyChain();
  assert.equal(verified.valid, true);
  assert.equal(verified.checkpoint_count, 7);
  assert.equal(counter.count, 3, 'the previous latest plus the two new checkpoints');
});

test('a verified checkpoint prefix cannot hide later edits, key changes or a changed latest record', async t => {
  const { store } = await checkpointFixture(t, { checkpointInterval: 1 });
  for (let index = 1; index <= 4; index += 1) appendAccepted(store, index);
  assert.equal(store.verifyChain().valid, true);

  // An earlier record edited after it was verified, digest field left intact.
  const original = store.db.prepare(
    "SELECT value FROM meta WHERE key = 'chain_checkpoints_v1'"
  ).get().value;
  rewriteHistory(store, history => {
    history[0].statement.created_at = '2001-01-01T00:00:00.000Z';
  });
  assert.equal(store.verifyChain().reason, 'checkpoint_id_mismatch');

  // The latest record is always verified again.
  store.db.prepare("UPDATE meta SET value = ? WHERE key = 'chain_checkpoints_v1'").run(original);
  assert.equal(store.verifyChain().valid, true);
  rewriteHistory(store, history => {
    history.at(-1).checkpoint_digest = 'e'.repeat(64);
  });
  assert.equal(store.verifyChain().reason, 'checkpoint_digest_mismatch');

  // A change to the verification keys invalidates the verified prefix.
  store.db.prepare("UPDATE meta SET value = ? WHERE key = 'chain_checkpoints_v1'").run(original);
  assert.equal(store.verifyChain().valid, true);
  const signer = JSON.parse(original)[0].attestation.key_id;
  store.verificationKeys.delete(signer);
  assert.equal(store.verifyChain().reason, 'checkpoint_verification_key_mismatch');
});

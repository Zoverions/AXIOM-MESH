import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { createHypervisorService } from '../src/hypervisor/server.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';

// Scalability audit S-15: every accepted intent reaches exactly one terminal
// state, even when the Hypervisor stops part-way, and nothing an
// interrupted intent would have changed is applied.

async function openStore(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-intent-recovery-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const open = () => new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
  const handle = { store: open(), reopen() { handle.store.close(); handle.store = open(); return handle.store; } };
  // One hook, in order: Windows cannot remove an open database file.
  t.after(async () => {
    try { handle.store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return handle;
}

const accepted = (id, principal = 'alice') => ({
  kind: 'intent.accepted',
  subject: id,
  payload: {
    intent_id: id,
    principal,
    action: 'system.echo',
    risk: 'low',
    input_digest: 'a'.repeat(64),
    request_digest: 'b'.repeat(64)
  }
});
const terminal = (kind, id) => ({ kind, subject: id, payload: { intent_id: id, ...(kind === 'intent.completed' ? { result: { ok: true } } : { error: { code: 'x', message: 'x' } }) } });
const capsule = name => {
  const manifest = { name };
  return { kind: 'capsule.registered', subject: `capsule.${name}`, payload: { capsule_id: `capsule.${name}`, version: '1.0.0', digest: digestObject(manifest), manifest, signer: 'alice' } };
};
const append = (store, actor, events) => store.appendEvents({ traceId: 'trace.recovery.test', actor, events });
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('an intent reaches exactly one terminal state, and a refused terminal event rolls back its batch', async t => {
  const { store } = await openStore(t);
  append(store, 'alice', [accepted('intent_one')]);
  append(store, 'alice', [terminal('intent.failed', 'intent_one')]);

  // A late completion, with the mutation it carries, is refused whole.
  assert.throws(
    () => append(store, 'alice', [capsule('late'), terminal('intent.completed', 'intent_one')]),
    error => error.code === 'intent_not_accepted' && error.status === 409 && error.details.status === 'failed'
  );
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM capsules WHERE capsule_id = 'capsule.late'").get().n, 0);
  assert.equal(store.getIntent('intent_one').status, 'failed');
  for (const kind of ['intent.completed', 'intent.denied', 'intent.failed']) {
    assert.throws(() => append(store, 'alice', [terminal(kind, 'intent_one')]), { code: 'intent_not_accepted' });
  }
  // An unknown intent, and another principal's intent, are refused.
  assert.throws(() => append(store, 'alice', [terminal('intent.completed', 'intent_unknown')]), { code: 'intent_not_found' });
  append(store, 'alice', [accepted('intent_two')]);
  assert.throws(() => append(store, 'mallory', [terminal('intent.completed', 'intent_two')]), /committed by its principal/);
  // Accepted and completed in one batch is still one terminal state.
  append(store, 'alice', [accepted('intent_three'), terminal('intent.completed', 'intent_three')]);
  assert.equal(store.getIntent('intent_three').status, 'completed');
  assert.equal(store.verifyChain().valid, true);
});

test('a log written before the rule still replays', async t => {
  const handle = await openStore(t);
  const { store } = handle;
  append(store, 'alice', [accepted('intent_old')]);
  append(store, 'alice', [terminal('intent.completed', 'intent_old')]);
  // As an older build could have written: a second terminal event.
  const guard = store.requireAcceptedIntent;
  store.requireAcceptedIntent = () => {};
  append(store, 'alice', [terminal('intent.failed', 'intent_old')]);
  store.requireAcceptedIntent = guard;

  const reopened = handle.reopen();
  assert.equal(reopened.getIntent('intent_old').status, 'failed');
  assert.equal(reopened.verifyChain().valid, true);
});

test('interrupted intents are closed as their principal, by cutoff or by id, and nothing newer is touched', async t => {
  const { store } = await openStore(t);
  append(store, 'alice', [accepted('intent_a', 'alice')]);
  append(store, 'bob', [accepted('intent_b', 'bob')]);
  append(store, 'alice', [accepted('intent_done', 'alice')]);
  append(store, 'alice', [terminal('intent.completed', 'intent_done')]);
  await tick();
  const cutoff = new Date().toISOString();
  await tick();
  append(store, 'carol', [accepted('intent_new', 'carol')]);

  const first = store.closeInterruptedIntents({ before: cutoff, limit: 1, traceId: 'trace.recovery.one' });
  assert.deepEqual(first.closed.map(item => item.intent_id), ['intent_a']);
  assert.equal(first.has_more, true);
  const second = store.closeInterruptedIntents({ before: cutoff, traceId: 'trace.recovery.two' });
  assert.deepEqual(second.closed.map(item => item.intent_id), ['intent_b']);
  assert.equal(second.has_more, false);

  for (const [id, principal] of [['intent_a', 'alice'], ['intent_b', 'bob']]) {
    const intent = store.getIntent(id);
    assert.equal(intent.status, 'failed');
    assert.equal(intent.error_json.code, 'intent_interrupted');
    const [event] = store.db.prepare("SELECT actor FROM events WHERE subject = ? AND kind = 'intent.failed'").all(id);
    assert.equal(event.actor, principal, 'recorded as the intent principal');
  }
  assert.equal(store.getIntent('intent_done').status, 'completed', 'a finished intent is untouched');
  assert.equal(store.getIntent('intent_new').status, 'accepted', 'an intent after the cutoff is untouched');

  // By id: pending while not before the cutoff; closed once it is; unknown
  // and finished ids are settled without change.
  const early = store.closeInterruptedIntents({ before: cutoff, intentIds: ['intent_new', 'intent_done', 'intent_unknown'], traceId: 'trace.recovery.three' });
  assert.deepEqual(early, { closed: [], has_more: false, pending: ['intent_new'] });
  await tick();
  const late = store.closeInterruptedIntents({ before: new Date().toISOString(), intentIds: ['intent_new'], traceId: 'trace.recovery.four' });
  assert.deepEqual(late.closed.map(item => item.intent_id), ['intent_new']);
  assert.deepEqual(late.pending, []);
  assert.equal(store.getIntent('intent_new').status, 'failed');

  assert.throws(() => store.closeInterruptedIntents({ before: 'yesterday', traceId: 'trace.recovery.five' }), /ISO timestamp/);
  assert.throws(() => store.closeInterruptedIntents({ before: cutoff, intentIds: 'intent_a', traceId: 'trace.recovery.six' }), /array/);
  assert.equal(store.verifyChain().valid, true);
});

test('a Hypervisor stopped at any point leaves its intent recoverable, and recovery applies nothing it had not committed', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-intent-crash-'));
  const lease = await reserveProductionPortBlock('hypervisor intent recovery');
  const basePort = lease.base_port;
  const token = `intent-recovery-${'r'.repeat(32)}`;
  let stack;
  t.after(async () => {
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
    // Recovery is driven by the test; no clock margin on one host.
    // Pages of one, so a sweep must follow has_more.
    intentRecovery: { delayMs: 3_600_000, marginMs: 0, pageSize: 1 },
    apiTokens: {
      [token]: { id: 'recovery-operator', type: 'human', roles: ['administrator'], scopes: ['*'] }
    }
  });
  const client = createGatewayClient({
    token,
    request: (path, options) => fetch(`http://127.0.0.1:${basePort}${path}`, options)
  });
  const grid = stack.services.find(service => service.name === 'grid');
  const index = stack.services.findIndex(service => service.name === 'hypervisor');
  const submit = key => client.call('intents.submit', {
    body: {
      action: 'memory.put',
      input: { kind: 'note', content: { title: key, text: 'written only if completed' } },
      purpose: 'intent-recovery-test'
    },
    idempotencyKey: key
  });
  const memoryObjects = () => grid.store.db.prepare('SELECT COUNT(*) AS n FROM memory_objects').get().n;

  const points = ['after_accepted', 'after_capability_consumed', 'after_sandbox_executed'];
  const interrupted = [];
  for (const point of points) {
    stack.services[index].setCrashPointForTest(point);
    const key = `intent-recovery-${point.replaceAll('_', '-')}`;
    await assert.rejects(submit(key));
    const intentId = grid.store.db.prepare("SELECT intent_id FROM intents WHERE status = 'accepted' ORDER BY created_at DESC LIMIT 1").get()?.intent_id;
    assert.ok(intentId, `${point}: the intent is left accepted, as after a crash`);
    interrupted.push({ point, key, intentId });
  }
  assert.equal(memoryObjects(), 0, 'no interrupted intent applied its write');

  // Restart the Hypervisor, as the supervisor would after a crash.
  await stack.services[index].stop();
  const restarted = await createHypervisorService(stack.config);
  stack.services[index] = restarted;
  await restarted.start();
  const closed = await restarted.recoverInterruptedIntents();
  assert.deepEqual(closed.map(item => item.intent_id).sort(), interrupted.map(item => item.intentId).sort());

  for (const { point, key, intentId } of interrupted) {
    const intent = await client.call('intents.get', { params: { id: intentId } });
    assert.equal(intent.status, 'failed', point);
    assert.equal(intent.error_json.code, 'intent_interrupted', point);
    // The same request and key returns the terminal record; it does not run
    // again. (Raw: the client's result schema does not describe a replayed
    // failure, before and after this change.)
    const response = await fetch(`http://127.0.0.1:${basePort}/v1/intents`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({
        action: 'memory.put',
        input: { kind: 'note', content: { title: key, text: 'written only if completed' } },
        purpose: 'intent-recovery-test'
      })
    });
    const replay = await response.json();
    assert.equal(replay.idempotent_replay, true, point);
    assert.equal(replay.status, 'failed', point);
  }
  assert.equal(memoryObjects(), 0, 'recovery applied nothing');
  assert.deepEqual(await restarted.recoverInterruptedIntents(), [], 'a second sweep finds nothing');

  // The restarted Hypervisor runs new intents normally.
  const fresh = await submit('intent-recovery-after-restart');
  assert.equal(fresh.status, 'completed');
  assert.equal(memoryObjects(), 1, 'a completed intent applies its write');

  // Recovery never closes an intent this process is still running.
  let release;
  const pause = new Promise(resolve => { release = resolve; });
  restarted.setCrashPointForTest('after_accepted', { pause });
  const running = submit('intent-recovery-in-flight');
  while (!grid.store.db.prepare("SELECT 1 FROM intents WHERE status = 'accepted'").get()) await tick();
  await tick();
  assert.deepEqual(await restarted.recoverInterruptedIntents(), [], 'an intent in flight is not interrupted');
  release();
  assert.equal((await running).status, 'completed');
  restarted.setCrashPointForTest(null);

  // An ordinary failure after acceptance still records a terminal state.
  restarted.setCrashPointForTest('after_accepted', { mode: 'fail' });
  await assert.rejects(submit('intent-recovery-failure'), error => error.code === 'injected_failure' || error.status === 500);
  restarted.setCrashPointForTest(null);
  const failed = grid.store.db.prepare("SELECT status, intent_id FROM intents ORDER BY created_at DESC LIMIT 1").get();
  assert.equal(failed.status, 'failed');
  assert.equal(grid.store.getIntent(failed.intent_id).error_json.code, 'injected_failure');

  // An intent this process could not settle is retried by id.
  restarted.setCrashPointForTest('after_accepted');
  await assert.rejects(submit('intent-recovery-unsettled'));
  restarted.setCrashPointForTest(null);
  const unsettled = grid.store.db.prepare("SELECT intent_id FROM intents WHERE status = 'accepted'").get().intent_id;
  restarted.unsettledIntentIds.add(unsettled);
  restarted.unsettledIntentIds.add('intent_never_existed');
  const settled = await restarted.settleUnsettledIntents();
  assert.deepEqual(settled.map(item => item.intent_id), [unsettled]);
  assert.equal(restarted.unsettledIntentIds.size, 0, 'closed and unknown ids are both settled');
  assert.equal(grid.store.verifyChain().valid, true);
  // Crash points exist only in the test environment.
  const development = await createHypervisorService({ ...stack.config, environment: 'development' });
  assert.throws(() => development.setCrashPointForTest('after_accepted'), /only in the test environment/);
});

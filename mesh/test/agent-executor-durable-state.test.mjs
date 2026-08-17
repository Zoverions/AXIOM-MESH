import assert from 'node:assert/strict';
import {
  copyFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  AgentExecutorDurableConformanceController,
  AgentExecutorDurableStateStore
} from '../src/lib/agent-executor-durable-state.mjs';
import {
  verifyAgentExecutorDurableStateReceipt
} from '../src/lib/agent-executor-durable-format.mjs';
import { sha256 } from '../src/lib/canonical.mjs';
import {
  DURABLE_STORE_ID,
  cleanupDurableState,
  createDurableStateFixture,
  durableKeyPair,
  durableRequestFor,
  reopenDurableState
} from './fixtures/agent-executor-durable-fixture.mjs';

function controllerFor(current, suffix = '001') {
  const executorKeys = durableKeyPair();
  return {
    executorKeys,
    controller: new AgentExecutorDurableConformanceController({
      durableStore: current.store,
      executorId: `executor:durable:${suffix}`,
      executorPrivateKey: executorKeys.privateKey,
      startedAt: '2026-08-18T12:05:00.000Z'
    })
  };
}

test('durable controller commits consumption before first virtual admission and restart never restores issued state', () => {
  const current = createDurableStateFixture();
  try {
    const { executorKeys, controller } = controllerFor(current);
    const first = controller.admit(durableRequestFor(current.plan, 1, '2026-08-18T12:05:05.000Z'));
    assert.equal(first.decision, 'admitted');
    assert.equal(current.store.status, 'consumed');
    assert.equal(current.store.generation, 2);
    const head = current.store.headReceipt({ generatedAt: '2026-08-18T12:05:06.000Z' });
    current.store.release();

    const recovered = reopenDurableState(current, { expectedHeadReceipt: head });
    current.store = recovered;
    assert.equal(recovered.status, 'consumed');
    assert.equal(recovered.recoveryClassification, 'consumed-uncertain-no-resume');
    assert.equal(recovered.canResume, false);
    assert.throws(
      () => new AgentExecutorDurableConformanceController({
        durableStore: recovered,
        executorId: 'executor:durable:replay',
        executorPrivateKey: executorKeys.privateKey,
        startedAt: '2026-08-18T12:05:20.000Z'
      }),
      /consumed-uncertain-no-resume/
    );
    assert.throws(
      () => recovered.consume({ eventId: 'executor-consume:again', occurredAt: '2026-08-18T12:05:21.000Z' }),
      /transition|not allowed/
    );
    recovered.interrupt({
      eventId: 'event:durable:restart-interrupt',
      occurredAt: '2026-08-18T12:05:21.000Z',
      reasonCode: 'executor-restart-uncertain'
    });
    assert.equal(recovered.status, 'interrupted');
    assert.equal(recovered.recoveryClassification, 'terminal-interrupted');
  } finally {
    cleanupDurableState(current);
  }
});

test('crash window after durable consume but before virtual admission recovers consumed and cannot resume', () => {
  const current = createDurableStateFixture();
  try {
    current.store.consume({
      eventId: `executor-consume:${current.plan.plan_digest.slice(0, 24)}`,
      occurredAt: '2026-08-18T12:05:05.000Z'
    });
    const head = current.store.headReceipt({ generatedAt: '2026-08-18T12:05:06.000Z' });
    current.store.release();
    const recovered = reopenDurableState(current, { expectedHeadReceipt: head });
    current.store = recovered;
    assert.equal(recovered.status, 'consumed');
    assert.equal(recovered.canResume, false);
    assert.equal(recovered.recoveryClassification, 'consumed-uncertain-no-resume');
  } finally {
    cleanupDurableState(current);
  }
});

test('preflight denial does not consume durable authorization, while post-consumption denial persists interruption', () => {
  const preflight = createDurableStateFixture();
  try {
    const { controller } = controllerFor(preflight, 'preflight-denial');
    const invalid = durableRequestFor(preflight.plan, 1, '2026-08-18T12:05:05.000Z');
    invalid.executable_id = 'arbitrary-shell';
    const denied = controller.admit(invalid);
    assert.equal(denied.decision, 'denied');
    assert.equal(preflight.store.status, 'issued');
    assert.equal(preflight.store.generation, 1);
  } finally {
    cleanupDurableState(preflight);
  }

  const post = createDurableStateFixture();
  try {
    const { controller } = controllerFor(post, 'post-denial');
    assert.equal(controller.admit(durableRequestFor(post.plan, 1, '2026-08-18T12:05:05.000Z')).decision, 'admitted');
    const invalid = durableRequestFor(post.plan, 2, '2026-08-18T12:05:10.000Z');
    invalid.arguments = [...invalid.arguments, 'unexpected'];
    const denied = controller.admit(invalid);
    assert.equal(denied.decision, 'denied');
    assert.equal(post.store.status, 'interrupted');
    assert.equal(post.store.recoveryClassification, 'terminal-interrupted');
  } finally {
    cleanupDurableState(post);
  }
});

test('completed virtual session and signed conformance receipt survive exact-head recovery', () => {
  const current = createDurableStateFixture();
  try {
    const { controller } = controllerFor(current, 'completed');
    for (let index = 1; index <= current.plan.steps.length; index += 1) {
      const time = `2026-08-18T12:05:${String(index * 5).padStart(2, '0')}.000Z`;
      assert.equal(controller.admit(durableRequestFor(current.plan, index, time)).decision, 'admitted');
    }
    controller.complete({ eventId: 'event:durable:complete', occurredAt: '2026-08-18T12:06:00.000Z' });
    const conformance = controller.receipt({ finishedAt: '2026-08-18T12:06:00.000Z' });
    assert.equal(current.store.status, 'completed');
    assert.equal(current.store.currentRecord.statement.conformance_receipt_digest, conformance.receipt_digest);
    const head = current.store.headReceipt({ generatedAt: '2026-08-18T12:06:01.000Z' });
    assert.equal(verifyAgentExecutorDurableStateReceipt(head, {
      trustedStorePublicKey: current.store.storePublicKey,
      plan: current.plan
    }).valid, true);
    current.store.release();

    const recovered = reopenDurableState(current, {
      expectedHeadReceipt: head,
      now: '2026-08-18T12:06:10.000Z'
    });
    current.store = recovered;
    assert.equal(recovered.status, 'completed');
    assert.equal(recovered.recoveryClassification, 'terminal-completed');
    assert.equal(recovered.currentRecord.statement.conformance_receipt_digest, conformance.receipt_digest);
  } finally {
    cleanupDurableState(current);
  }
});

test('active writer lease rejects concurrent open', () => {
  const current = createDurableStateFixture();
  try {
    assert.throws(
      () => reopenDurableState(current, { now: '2026-08-18T12:05:01.000Z' }),
      /active writer lease/
    );
  } finally {
    cleanupDurableState(current);
  }
});

test('expired writer lease recovery requires exact durable head receipt and fences the old writer', () => {
  const current = createDurableStateFixture({ leaseSeconds: 1 });
  try {
    const head = current.store.headReceipt({ generatedAt: '2026-08-18T12:05:00.500Z' });
    assert.throws(
      () => reopenDurableState(current, { now: '2026-08-18T12:05:02.000Z' }),
      /stale lock recovery requires/
    );
    const recovered = reopenDurableState(current, {
      now: '2026-08-18T12:05:02.000Z',
      staleLockRecoveryReceipt: head,
      expectedHeadReceipt: head
    });
    assert.equal(recovered.status, 'issued');
    assert.throws(
      () => current.store.consume({
        eventId: 'event:durable:old-writer',
        occurredAt: '2026-08-18T12:05:02.500Z'
      }),
      /ownership changed|lease/
    );
    current.store = recovered;
  } finally {
    cleanupDurableState(current);
  }
});

test('externally retained head receipt detects rollback to an authentic older generation', () => {
  const current = createDurableStateFixture();
  try {
    current.store.consume({
      eventId: `executor-consume:${current.plan.plan_digest.slice(0, 24)}`,
      occurredAt: '2026-08-18T12:05:05.000Z'
    });
    const head = current.store.headReceipt({ generatedAt: '2026-08-18T12:05:06.000Z' });
    current.store.release();
    const recordsDir = join(current.root, `store-${sha256(DURABLE_STORE_ID).slice(0, 24)}`, 'records');
    const generation2 = readdirSync(recordsDir).find(name => name.startsWith('g00000002-'));
    unlinkSync(join(recordsDir, generation2));
    assert.throws(
      () => reopenDurableState(current, { expectedHeadReceipt: head }),
      /separately retained expected head/
    );
  } finally {
    cleanupDurableState(current);
  }
});

test('abandoned temp record is ignored but malformed committed record fails closed', () => {
  const current = createDurableStateFixture();
  try {
    const recordsDir = join(current.root, `store-${sha256(DURABLE_STORE_ID).slice(0, 24)}`, 'records');
    writeFileSync(join(recordsDir, '.tmp-g00000002-abandoned.json'), '{not committed', 'utf8');
    const head = current.store.headReceipt({ generatedAt: '2026-08-18T12:05:01.000Z' });
    current.store.release();
    const recovered = reopenDurableState(current, { expectedHeadReceipt: head });
    assert.equal(recovered.status, 'issued');
    recovered.release();

    const generation1 = readdirSync(recordsDir).find(name => name.startsWith('g00000001-'));
    const path = join(recordsDir, generation1);
    const original = readFileSync(path, 'utf8');
    writeFileSync(path, original.slice(0, -5), 'utf8');
    assert.throws(() => reopenDurableState(current), /incomplete trailing data|not JSON|canonical/);
  } finally {
    cleanupDurableState(current);
  }
});

test('generation conflict and oversized committed record fail closed', () => {
  const current = createDurableStateFixture();
  try {
    current.store.release();
    const recordsDir = join(current.root, `store-${sha256(DURABLE_STORE_ID).slice(0, 24)}`, 'records');
    const generation1 = readdirSync(recordsDir).find(name => name.startsWith('g00000001-'));
    const conflict = `g00000001-${'f'.repeat(64)}.json`;
    copyFileSync(join(recordsDir, generation1), join(recordsDir, conflict));
    assert.throws(() => reopenDurableState(current), /conflicting same-generation/);
    unlinkSync(join(recordsDir, conflict));
    writeFileSync(join(recordsDir, `g00000002-${'e'.repeat(64)}.json`), 'x'.repeat(2 * 1024 * 1024 + 1), 'utf8');
    assert.throws(() => reopenDurableState(current), /bounded regular file|maximum size/);
  } finally {
    cleanupDurableState(current);
  }
});

test('store/lifecycle key substitution, path traversal, and terminal-state rewrite fail closed', () => {
  const current = createDurableStateFixture();
  try {
    const wrong = durableKeyPair();
    current.store.release();
    assert.throws(
      () => reopenDurableState(current, { storePrivateKey: wrong.privateKey }),
      /store key substitution|store key/
    );
    assert.throws(
      () => reopenDurableState(current, { lifecyclePrivateKey: wrong.privateKey }),
      /lifecycle private key|lifecycle key/
    );
    assert.throws(
      () => AgentExecutorDurableStateStore.open({
        stateRoot: current.root,
        storeId: '../escape',
        storePrivateKey: current.storeKeys.privateKey,
        lifecyclePrivateKey: current.lifecycleKeys.privateKey,
        plan: current.plan,
        initialLifecycleTranscript: current.lifecycleTranscript,
        initialLifecycleReceipt: current.lifecycleReceipt,
        now: '2026-08-18T12:05:00.000Z',
        clock: () => '2026-08-18T12:05:00.000Z'
      }),
      /storeId/
    );

    const reopened = reopenDurableState(current);
    current.store = reopened;
    reopened.revoke({ eventId: 'event:durable:revoked', occurredAt: '2026-08-18T12:05:30.000Z' });
    assert.equal(reopened.status, 'revoked');
    assert.throws(
      () => reopened.consume({ eventId: 'event:durable:after-revoke', occurredAt: '2026-08-18T12:05:31.000Z' }),
      /transition|not allowed/
    );
  } finally {
    cleanupDurableState(current);
  }
});

test('durable head receipt rejects signer substitution and effect/authority elevation', () => {
  const current = createDurableStateFixture();
  try {
    const receipt = current.store.headReceipt({ generatedAt: '2026-08-18T12:05:01.000Z' });
    const wrong = durableKeyPair();
    assert.throws(
      () => verifyAgentExecutorDurableStateReceipt(receipt, {
        trustedStorePublicKey: wrong.publicKey,
        plan: current.plan
      }),
      /substitution/
    );
    for (const mutate of [
      value => { value.statement.global_currentness_claimed = true; },
      value => { value.statement.production_persistence_claimed = true; },
      value => { value.statement.effect_reachable = true; },
      value => { value.statement.authority_granted = true; },
      value => { value.statement.record_digest = 'f'.repeat(64); }
    ]) {
      const changed = structuredClone(receipt);
      mutate(changed);
      assert.throws(() => verifyAgentExecutorDurableStateReceipt(changed, {
        trustedStorePublicKey: current.store.storePublicKey,
        plan: current.plan
      }));
    }
  } finally {
    cleanupDurableState(current);
  }
});

test('durable filesystem effect is isolated to state format; no process/network/service/credential effect module appears', () => {
  const controllerSource = readFileSync(new URL('../src/lib/agent-executor-durable-state.mjs', import.meta.url), 'utf8').toLowerCase();
  const formatSource = readFileSync(new URL('../src/lib/agent-executor-durable-format.mjs', import.meta.url), 'utf8').toLowerCase();
  assert.equal(controllerSource.includes('node:fs'), false, 'controller should delegate control-state persistence to format module');
  assert.equal(formatSource.includes("from 'node:fs'"), true, 'format module must make its local state filesystem effect explicit');
  for (const source of [controllerSource, formatSource]) {
    for (const forbidden of [
      'node:child_process', 'node:dns', 'node:http', 'node:https', 'node:net', 'node:dgram',
      'node:tls', 'spawn(', 'exec(', 'execfile(', 'fetch(', 'ssh ', 'keychain', 'credential-manager'
    ]) {
      assert.equal(source.includes(forbidden), false, `durable control-state lab must not contain ${forbidden}`);
    }
  }
});

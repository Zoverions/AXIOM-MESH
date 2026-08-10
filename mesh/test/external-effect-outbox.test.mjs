import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity, MeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';
import {
  buildPreparedRepositoryDocsEffect,
  buildRepositoryDocsEffectPlan,
  buildRepositoryDocsEffectReceipt,
  verifyPreparedRepositoryDocsEffect,
  verifyRepositoryDocsEffectReceipt
} from '../src/lib/repository-docs-effect.mjs';
import {
  buildExternalEffectCompletedEvent,
  buildExternalEffectPreparedEvent,
  deriveExternalEffectGridState
} from '../src/lib/external-effect-outbox.mjs';
import { runExternalEffectOutbox } from '../src/hypervisor/external-effect-outbox.mjs';

const NOW = '2026-08-10T22:40:00.000Z';
const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const OLD_BLOB = 'c'.repeat(40);
const D = character => character.repeat(64);
const PRINCIPAL = 'operator-human';

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function effectFixture() {
  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const content = '# Durable effect fixture\n';
  const plan = buildRepositoryDocsEffectPlan({
    identity: operator,
    base_sha: BASE_SHA,
    changes: [{
      path: 'docs/rebuild/STATUS.md',
      operation: 'update',
      old_blob_sha: OLD_BLOB,
      old_content_sha256: sha256('# old\n'),
      new_content: content
    }],
    planned_at: NOW,
    expires_at: '2026-08-10T22:45:00.000Z'
  });
  const prepared = buildPreparedRepositoryDocsEffect({
    identity: hypervisor,
    plan,
    operatorPublicKey: operator.publicKey,
    source_bindings: {
      intent_id: 'intent-docs-outbox',
      intent_digest: D('1'),
      handoff_digest: D('2'),
      remediation_proposal_id: `intent-remediation:${D('3')}`,
      remediation_proposal_digest: D('3'),
      principal: PRINCIPAL,
      machine_authority_digest: null
    },
    authority_bindings: {
      policy_digest: D('4'),
      capability_registry_digest: D('5'),
      executor_registry_digest: D('6'),
      mapping_digest: D('7'),
      build_digest: D('8')
    },
    one_use_nonce: 'outbox_nonce_0123456789',
    prepared_at: '2026-08-10T22:40:30.000Z',
    expires_at: '2026-08-10T22:45:00.000Z'
  });
  const receipt = buildRepositoryDocsEffectReceipt({
    identity: operator,
    prepared_effect: prepared,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    head_sha: HEAD_SHA,
    pull_request_number: 2001,
    pull_request_id: 'PR_docs_outbox_2001',
    applied_files: [{
      path: 'docs/rebuild/STATUS.md',
      new_content_sha256: sha256(content),
      observed_blob_sha: HEAD_SHA
    }],
    observed_at: '2026-08-10T22:41:00.000Z'
  });
  return { operator, hypervisor, prepared, receipt };
}

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-external-effect-outbox-'));
  const gridIdentity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new GridStore({ path, dataDir, identity: gridIdentity, protector });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    dataDir,
    gridIdentity,
    protector,
    path,
    get store() { return store; },
    restart() {
      store.close();
      store = new GridStore({ path, dataDir, identity: gridIdentity, protector });
      return store;
    }
  };
}

function append(store, events, traceId = 'trace:external-effect') {
  return store.appendEvents({ traceId, actor: PRINCIPAL, events });
}

test('Grid requires a previously durable prepare before external effect completion', async t => {
  const fixture = await storeFixture(t);
  const { prepared, receipt } = effectFixture();
  const preparedEvent = buildExternalEffectPreparedEvent(prepared);
  const completedEvent = buildExternalEffectCompletedEvent(prepared, receipt);

  assert.throws(
    () => append(fixture.store, [completedEvent], 'trace:complete-first'),
    error => error?.code === 'external_effect_not_prepared'
  );
  assert.throws(
    () => append(fixture.store, [preparedEvent, completedEvent], 'trace:same-batch'),
    /committed separately/
  );
  assert.equal(fixture.store.getStatus().last_seq, 0);

  const preparedRows = append(fixture.store, [preparedEvent], 'trace:prepare');
  assert.equal(preparedRows.length, 1);
  assert.equal(fixture.store.getExternalEffect(prepared.effect_id).status, 'prepared');

  const completedRows = append(fixture.store, [completedEvent], 'trace:complete');
  assert.equal(completedRows.length, 1);
  const state = fixture.store.getExternalEffect(prepared.effect_id);
  assert.equal(state.status, 'completed');
  assert.equal(state.prepared_event.seq < state.completed_event.seq, true);
  assert.equal(state.receipt.receipt_id, receipt.receipt_id);
  assert.equal(state.merge_performed, false);
  assert.equal(state.remediation_converged, false);
});

test('prepared state survives restart and remains recoverable before completion', async t => {
  const fixture = await storeFixture(t);
  const { prepared, receipt } = effectFixture();
  append(fixture.store, [buildExternalEffectPreparedEvent(prepared)], 'trace:prepare-restart');
  const before = fixture.store.getExternalEffect(prepared.effect_id);
  assert.equal(before.status, 'prepared');
  const lastBefore = fixture.store.getStatus();

  fixture.restart();
  const after = fixture.store.getExternalEffect(prepared.effect_id);
  assert.equal(after.status, 'prepared');
  assert.equal(after.effect_digest, prepared.effect_digest);
  assert.deepEqual(fixture.store.getStatus(), lastBefore);

  append(fixture.store, [buildExternalEffectCompletedEvent(prepared, receipt)], 'trace:complete-after-restart');
  assert.equal(fixture.store.getExternalEffect(prepared.effect_id).status, 'completed');
});

test('Grid rejects duplicate, invented, actor-mismatched, and post-completion transitions', async t => {
  const fixture = await storeFixture(t);
  const { prepared, receipt } = effectFixture();
  const preparedEvent = buildExternalEffectPreparedEvent(prepared);
  const completedEvent = buildExternalEffectCompletedEvent(prepared, receipt);

  assert.throws(() => fixture.store.appendEvents({
    traceId: 'trace:wrong-actor',
    actor: 'attacker',
    events: [preparedEvent]
  }), /actor must match/);
  assert.throws(() => append(fixture.store, [{
    kind: 'external.effect.applied',
    subject: prepared.effect_id,
    payload: {}
  }], 'trace:invented-transition'), /unsupported external effect transition/);

  append(fixture.store, [preparedEvent], 'trace:prepare-once');
  assert.throws(
    () => append(fixture.store, [preparedEvent], 'trace:prepare-twice'),
    error => error?.code === 'external_effect_already_prepared'
  );
  append(fixture.store, [completedEvent], 'trace:complete-once');
  assert.throws(
    () => append(fixture.store, [completedEvent], 'trace:complete-twice'),
    error => error?.code === 'external_effect_not_prepared'
  );
});

test('derived state rejects mixed subjects and completion that does not follow preparation', () => {
  const { prepared, receipt } = effectFixture();
  const preparedEvent = { ...buildExternalEffectPreparedEvent(prepared), seq: 2, actor: PRINCIPAL };
  const completedEvent = { ...buildExternalEffectCompletedEvent(prepared, receipt), seq: 1, actor: PRINCIPAL };
  assert.throws(() => deriveExternalEffectGridState([preparedEvent, completedEvent], prepared.effect_id), /must follow/);
  assert.throws(() => deriveExternalEffectGridState([
    preparedEvent,
    { ...completedEvent, subject: `effect:${D('9')}` }
  ], prepared.effect_id), /mixed subjects/);
});

test('Hypervisor outbox invokes operator only after Grid durably records preparation', async t => {
  const fixture = await storeFixture(t);
  const { operator, hypervisor, prepared, receipt } = effectFixture();
  const order = [];

  const result = await runExternalEffectOutbox({
    prepared_effect: prepared,
    verify_prepared: raw => verifyPreparedRepositoryDocsEffect(raw, {
      hypervisorPublicKey: hypervisor.publicKey,
      operatorPublicKey: operator.publicKey,
      now: '2026-08-10T22:41:00.000Z'
    }),
    commit: async events => {
      const appended = append(fixture.store, events, `trace:outbox:${order.length}`);
      order.push(events[0].kind);
      return { events: appended };
    },
    invoke_operator: async verifiedPrepared => {
      order.push('operator.invoked');
      const durable = fixture.store.getExternalEffect(verifiedPrepared.effect_id);
      assert.equal(durable.status, 'prepared');
      assert.equal(durable.prepared_event.seq > 0, true);
      return receipt;
    },
    verify_receipt: raw => verifyRepositoryDocsEffectReceipt(raw, {
      prepared_effect: prepared,
      hypervisorPublicKey: hypervisor.publicKey,
      operatorPublicKey: operator.publicKey,
      now: '2026-08-10T22:42:00.000Z'
    })
  });

  assert.deepEqual(order, [
    'external.effect.prepared',
    'operator.invoked',
    'external.effect.completed'
  ]);
  assert.equal(result.operator_invoked_after_durable_prepare, true);
  assert.equal(result.prepared_event.seq < result.completed_event.seq, true);
  assert.equal(fixture.store.getExternalEffect(prepared.effect_id).status, 'completed');
});

test('prepare commit failure guarantees zero operator invocations', async () => {
  const { prepared } = effectFixture();
  let operatorCalls = 0;
  await assert.rejects(() => runExternalEffectOutbox({
    prepared_effect: prepared,
    verify_prepared: raw => raw,
    commit: async () => { throw new Error('Grid unavailable'); },
    invoke_operator: async () => { operatorCalls += 1; },
    verify_receipt: raw => raw
  }), error => error?.code === 'external_effect_prepare_uncommitted');
  assert.equal(operatorCalls, 0);
});

test('operator or receipt uncertainty leaves the effect durably prepared, never completed', async t => {
  const fixture = await storeFixture(t);
  const { prepared } = effectFixture();
  let calls = 0;
  await assert.rejects(() => runExternalEffectOutbox({
    prepared_effect: prepared,
    verify_prepared: raw => raw,
    commit: async events => ({ events: append(fixture.store, events, `trace:uncertain:${calls}`) }),
    invoke_operator: async () => {
      calls += 1;
      throw new Error('timeout');
    },
    verify_receipt: raw => raw
  }), error => error?.code === 'external_effect_outcome_unresolved');
  assert.equal(calls, 1);
  assert.equal(fixture.store.getExternalEffect(prepared.effect_id).status, 'prepared');
});

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  EDUCATION_CONTRACT_CONTROLLER,
  EDUCATION_CONTRACT_ID,
  EDUCATION_CONTRACT_SHA256,
  EDUCATION_CONTRACT_VERSION,
} from '../src/domain/education-contract.mjs';
import { createEducationLearnerAppendMutation } from '../src/domain/education-learner-append-mutation.mjs';
import { preflightEducationLearnerGridEvent } from '../src/domain/education-learner-grid-preflight.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-education-grid-evidence-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  const store = new GridStore({ path, dataDir, identity, protector });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store, path, dataDir, identity, protector };
}

function append(store, actor, traceId, mutation) {
  return store.appendEvents({ traceId, actor, events: [mutation] });
}

function grantConsent(learner) {
  return executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'consent.grant',
      principal: { id: learner },
      input: {
        controller: EDUCATION_CONTRACT_CONTROLLER,
        purpose: 'learning-progress-recording',
        scopes: ['learning-progress:write'],
        expires_at: '2099-01-01T00:00:00.000Z',
      },
    },
  });
}

function putSubmission(learner) {
  return executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      principal: { id: learner },
      input: {
        kind: 'education.learner-submission',
        content: { answer: 'private and encrypted' },
        metadata: {},
      },
    },
  });
}

test('learner record persists as signed evidence-only event and survives rebuild', async t => {
  const { store, path, dataDir, identity, protector } = await fixture(t);
  const learner = 'human:learner-001';
  const consent = grantConsent(learner);
  const memory = putSubmission(learner);
  append(store, learner, 'trace:evidence:consent', consent.mutation);
  append(store, learner, 'trace:evidence:memory', memory.mutation);

  const input = {
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256,
    subject_id: learner,
    consent_id: consent.output.consent_id,
    purpose: 'learning-progress-recording',
    event_id: 'workflow-event:evidence-001',
    event_type: 'submission.created',
    occurred_at: '2026-08-11T21:30:00-04:00',
    payload_digest: 'a'.repeat(64),
    memory_object_id: memory.output.object_id,
    course_code: 'MTH1W',
    expectation_ids: ['MTH1W-A1.1'],
    review_state: 'submitted',
  };
  const prepared = createEducationLearnerAppendMutation({
    action: 'education.learner.event.append',
    principal: { id: learner },
    input,
  });
  const evidenceEvent = {
    ...prepared.mutation,
    payload: {
      ...prepared.mutation.payload,
      evidence: {
        intent_id: 'intent:evidence-001',
        plan_digest: 'b'.repeat(64),
        policy_digest: 'c'.repeat(64),
        capability_digest: 'd'.repeat(64),
        execution_digest: 'e'.repeat(64),
      },
    },
  };

  const authority = preflightEducationLearnerGridEvent(
    store,
    evidenceEvent,
    learner,
    { now: '2026-08-11T21:31:00-04:00' },
  );
  assert.equal(authority.memory_object_id, memory.output.object_id);
  const [recorded] = append(store, learner, 'trace:evidence:record', evidenceEvent);
  assert.equal(recorded.event_id, prepared.mutation.event_id);
  assert.equal(recorded.kind, 'education.learner.event.recorded');
  assert.equal(recorded.subject, learner);
  assert.equal(store.verifyFullChain().valid, true);

  const row = store.db.prepare('SELECT * FROM events WHERE event_id = ?').get(recorded.event_id);
  const decoded = store.decodeEventRow(row);
  assert.equal(decoded.payload.memory_object_id, memory.output.object_id);
  assert.equal(JSON.stringify(decoded.payload).includes('private and encrypted'), false);

  store.rebuildMaterializedState();
  assert.equal(store.verifyFullChain().valid, true);
  assert.equal(
    store.db.prepare('SELECT COUNT(*) AS count FROM events WHERE event_id = ?').get(recorded.event_id).count,
    1,
  );

  assert.throws(
    () => preflightEducationLearnerGridEvent(
      store,
      evidenceEvent,
      learner,
      { now: '2026-08-11T21:32:00-04:00' },
    ),
    /already recorded/,
  );

  store.close();
  const reopened = new GridStore({ path, dataDir, identity, protector });
  try {
    assert.equal(reopened.verifyFullChain().valid, true);
    const reopenedRow = reopened.db.prepare(
      'SELECT * FROM events WHERE event_id = ?',
    ).get(recorded.event_id);
    assert.equal(reopened.decodeEventRow(reopenedRow).kind, 'education.learner.event.recorded');
  } finally {
    reopened.close();
  }
});

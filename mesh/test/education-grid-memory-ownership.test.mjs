import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createGridEducationMemoryReferenceAssertion } from '../src/domain/education-grid-memory.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-education-memory-owner-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector,
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function putMemory(store, owner, kind, traceId) {
  const put = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      principal: { id: owner },
      input: {
        kind,
        content: { opaque: true },
        metadata: {},
      },
    },
  });
  store.appendEvents({ traceId, actor: owner, events: [put.mutation] });
  return put.output.object_id;
}

function assertion(store) {
  return createGridEducationMemoryReferenceAssertion({
    store,
    allowedKinds: [
      'education.assignment-artifact',
      'education.learner-submission',
    ],
  });
}

test('non-content workflow events may reuse canonical memory owned by actor or subject only', async t => {
  const store = await storeFixture(t);
  const actor = 'human:educator-001';
  const subject = 'human:learner-001';
  const outsider = 'human:outsider-001';
  const actorMemory = putMemory(
    store,
    actor,
    'education.assignment-artifact',
    'trace:memory-owner:actor',
  );
  const subjectMemory = putMemory(
    store,
    subject,
    'education.learner-submission',
    'trace:memory-owner:subject',
  );
  const outsiderMemory = putMemory(
    store,
    outsider,
    'education.assignment-artifact',
    'trace:memory-owner:outsider',
  );
  const check = assertion(store);
  const base = {
    actor_id: actor,
    subject_id: subject,
    event_type: 'review.started',
  };

  assert.equal(check({ ...base, memory_object_id: actorMemory }), true);
  assert.equal(check({ ...base, memory_object_id: subjectMemory }), true);
  assert.equal(check({ ...base, memory_object_id: outsiderMemory }), false);
});

test('mapped new-content events require both profile owner and profile kind', async t => {
  const store = await storeFixture(t);
  const actor = 'human:educator-001';
  const subject = 'human:learner-001';
  const actorAssignment = putMemory(
    store,
    actor,
    'education.assignment-artifact',
    'trace:memory-owner:assignment',
  );
  const subjectAssignment = putMemory(
    store,
    subject,
    'education.assignment-artifact',
    'trace:memory-owner:wrong-owner',
  );
  const actorSubmission = putMemory(
    store,
    actor,
    'education.learner-submission',
    'trace:memory-owner:wrong-kind',
  );
  const check = assertion(store);
  const base = {
    actor_id: actor,
    subject_id: subject,
    event_type: 'assignment.created',
  };

  assert.equal(check({ ...base, memory_object_id: actorAssignment }), true);
  assert.equal(check({ ...base, memory_object_id: subjectAssignment }), false);
  assert.equal(check({ ...base, memory_object_id: actorSubmission }), false);
});

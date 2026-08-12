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
import { createGridEducationLearnerRecordReferenceProvider } from '../src/domain/education-grid-learner-record-provider.mjs';
import { InMemoryEducationLearnerRecordIndex } from '../src/domain/education-learner-record-index.mjs';
import { executeEducationLearnerRecordAction } from '../src/domain/education-learner-record-provider.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const LEARNER_MEMORY_KIND = 'education.learner-submission';

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-education-grid-provider-'));
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

function appendMutation(store, actor, traceId, mutation) {
  store.appendEvents({ traceId, actor, events: [mutation] });
}

function grantConsent(subject, purpose, scope) {
  return executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'consent.grant',
      principal: { id: subject },
      input: {
        controller: EDUCATION_CONTRACT_CONTROLLER,
        purpose,
        scopes: [scope],
        expires_at: '2099-01-01T00:00:00.000Z',
      },
    },
  });
}

function putMemory(subject, kind = LEARNER_MEMORY_KIND) {
  return executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      principal: { id: subject },
      input: {
        kind,
        content: {
          private_learner_content: 'opaque-to-education-reference-provider',
        },
        metadata: {},
      },
    },
  });
}

function contractFields() {
  return {
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256,
  };
}

function appendInput({ subject, consentId, memoryObjectId, eventId = 'event:001' }) {
  return {
    ...contractFields(),
    subject_id: subject,
    consent_id: consentId,
    purpose: 'learning-progress-recording',
    event_id: eventId,
    event_type: 'submission.created',
    occurred_at: '2026-08-11T20:00:00-04:00',
    payload_digest: eventId === 'event:001' ? DIGEST_A : DIGEST_B,
    memory_object_id: memoryObjectId,
    course_code: 'MTH1W',
    expectation_ids: ['MTH1W-A1.1'],
    review_state: 'submitted',
  };
}

function readInput({ subject, consentId }) {
  return {
    ...contractFields(),
    subject_id: subject,
    consent_id: consentId,
    purpose: 'learning-progress-review',
    course_code: 'MTH1W',
    expectation_ids: ['MTH1W-A1.1'],
  };
}

test('Grid-authorized reference provider appends and reads bounded learner-event references', async t => {
  const store = await storeFixture(t);
  const subject = 'human:learner-001';
  const writeConsent = grantConsent(
    subject,
    'learning-progress-recording',
    'learning-progress:write',
  );
  const readConsent = grantConsent(
    subject,
    'learning-progress-review',
    'learning-progress:read',
  );
  const memory = putMemory(subject);
  appendMutation(store, subject, 'trace:grid-provider:write-consent', writeConsent.mutation);
  appendMutation(store, subject, 'trace:grid-provider:read-consent', readConsent.mutation);
  appendMutation(store, subject, 'trace:grid-provider:memory', memory.mutation);

  const index = new InMemoryEducationLearnerRecordIndex();
  const provider = createGridEducationLearnerRecordReferenceProvider({
    store,
    index,
    allowedMemoryKinds: [LEARNER_MEMORY_KIND],
    now: () => '2026-08-11T20:01:00-04:00',
  });

  const append = await executeEducationLearnerRecordAction(
    'education.learner.event.append',
    appendInput({
      subject,
      consentId: writeConsent.output.consent_id,
      memoryObjectId: memory.output.object_id,
    }),
    { provider },
  );
  assert.equal(append.ok, true);
  assert.equal(index.size, 1);

  const read = await executeEducationLearnerRecordAction(
    'education.learner.progress.read',
    readInput({ subject, consentId: readConsent.output.consent_id }),
    { provider },
  );
  assert.equal(read.ok, true);
  assert.equal(read.result.events.length, 1);
  assert.equal(read.result.events[0].memory_object_id, memory.output.object_id);
  assert.equal(JSON.stringify(read.result).includes('private_learner_content'), false);
});

test('Grid consent revocation blocks a later append before index mutation', async t => {
  const store = await storeFixture(t);
  const subject = 'human:learner-001';
  const writeConsent = grantConsent(
    subject,
    'learning-progress-recording',
    'learning-progress:write',
  );
  const memory = putMemory(subject);
  appendMutation(store, subject, 'trace:grid-provider:grant-revoke', writeConsent.mutation);
  appendMutation(store, subject, 'trace:grid-provider:memory-revoke', memory.mutation);

  const index = new InMemoryEducationLearnerRecordIndex();
  const provider = createGridEducationLearnerRecordReferenceProvider({
    store,
    index,
    allowedMemoryKinds: [LEARNER_MEMORY_KIND],
    now: () => '2026-08-11T20:01:00-04:00',
  });

  const revoke = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'consent.revoke',
      principal: { id: subject },
      input: {
        consent_id: writeConsent.output.consent_id,
        revocation_handle: writeConsent.output.revocation_handle,
      },
    },
  });
  appendMutation(store, subject, 'trace:grid-provider:revoke', revoke.mutation);

  await assert.rejects(
    () => executeEducationLearnerRecordAction(
      'education.learner.event.append',
      appendInput({
        subject,
        consentId: writeConsent.output.consent_id,
        memoryObjectId: memory.output.object_id,
      }),
      { provider },
    ),
    /consent assertion failed/,
  );
  assert.equal(index.size, 0);
});

test('tombstoned or disallowed-kind memory cannot be appended', async t => {
  const store = await storeFixture(t);
  const subject = 'human:learner-001';
  const writeConsent = grantConsent(
    subject,
    'learning-progress-recording',
    'learning-progress:write',
  );
  const memory = putMemory(subject);
  const disallowed = putMemory(subject, 'personal.note');
  appendMutation(store, subject, 'trace:grid-provider:grant-memory', writeConsent.mutation);
  appendMutation(store, subject, 'trace:grid-provider:memory-active', memory.mutation);
  appendMutation(store, subject, 'trace:grid-provider:memory-disallowed', disallowed.mutation);

  const index = new InMemoryEducationLearnerRecordIndex();
  const provider = createGridEducationLearnerRecordReferenceProvider({
    store,
    index,
    allowedMemoryKinds: [LEARNER_MEMORY_KIND],
    now: () => '2026-08-11T20:01:00-04:00',
  });

  await assert.rejects(
    () => executeEducationLearnerRecordAction(
      'education.learner.event.append',
      appendInput({
        subject,
        consentId: writeConsent.output.consent_id,
        memoryObjectId: disallowed.output.object_id,
      }),
      { provider },
    ),
    /memory reference assertion failed/,
  );

  const tombstone = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.tombstone',
      principal: { id: subject },
      input: {
        object_id: memory.output.object_id,
        reason: 'fixture tombstone',
      },
    },
  });
  appendMutation(store, subject, 'trace:grid-provider:tombstone', tombstone.mutation);

  await assert.rejects(
    () => executeEducationLearnerRecordAction(
      'education.learner.event.append',
      appendInput({
        subject,
        consentId: writeConsent.output.consent_id,
        memoryObjectId: memory.output.object_id,
        eventId: 'event:002',
      }),
      { provider },
    ),
    /memory reference assertion failed/,
  );
  assert.equal(index.size, 0);
});

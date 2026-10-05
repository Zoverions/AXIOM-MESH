import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  EDUCATION_CONTRACT_CONTROLLER,
  EDUCATION_CONTRACT_ID,
  EDUCATION_CONTRACT_SHA256,
  EDUCATION_CONTRACT_VERSION,
} from '../src/domain/education-contract.mjs';
import {
  createEducationLearnerAppendMutation,
  deriveEducationLearnerGridEventId,
} from '../src/domain/education-learner-append-mutation.mjs';
import { preflightEducationLearnerGridEvent } from '../src/domain/education-learner-grid-preflight.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';

const DIGEST = 'a'.repeat(64);

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-education-native-append-'));
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

function grantConsent(subject) {
  return executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'consent.grant',
      principal: { id: subject },
      input: {
        controller: EDUCATION_CONTRACT_CONTROLLER,
        purpose: 'learning-progress-recording',
        scopes: ['learning-progress:write'],
        expires_at: '2099-01-01T00:00:00.000Z',
      },
    },
  });
}

function putMemory(owner, kind) {
  return executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      principal: { id: owner },
      input: {
        kind,
        content: { private_body: 'must remain outside learner-record evidence' },
        metadata: {},
      },
    },
  });
}

function appendInput({
  subject,
  consentId,
  memoryObjectId,
  eventType = 'submission.created',
  eventId = 'workflow-event:001',
}) {
  return {
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256,
    subject_id: subject,
    consent_id: consentId,
    purpose: 'learning-progress-recording',
    event_id: eventId,
    event_type: eventType,
    occurred_at: '2026-08-11T21:00:00-04:00',
    payload_digest: DIGEST,
    memory_object_id: memoryObjectId,
    course_code: 'MTH1W',
    expectation_ids: ['MTH1W-A1.1'],
    review_state: eventType === 'assignment.created' ? 'assigned' : 'submitted',
  };
}

function sandboxIntent(actor, input) {
  return {
    action: 'education.learner.event.append',
    principal: { id: actor },
    input,
  };
}

function withExecutionEvidence(mutation) {
  return {
    ...mutation,
    payload: {
      ...mutation.payload,
      evidence: {
        intent_id: 'intent:test',
        plan_digest: 'b'.repeat(64),
        policy_digest: 'c'.repeat(64),
        capability_digest: 'd'.repeat(64),
        execution_digest: 'e'.repeat(64),
      },
    },
  };
}

test('pure learner append validator emits deterministic reference-only Grid mutation', async t => {
  const store = await storeFixture(t);
  const learner = 'human:learner-001';
  const consent = grantConsent(learner);
  const memory = putMemory(learner, 'education.learner-submission');
  appendMutation(store, learner, 'trace:native:consent', consent.mutation);
  appendMutation(store, learner, 'trace:native:memory', memory.mutation);
  const input = appendInput({
    subject: learner,
    consentId: consent.output.consent_id,
    memoryObjectId: memory.output.object_id,
  });

  const first = createEducationLearnerAppendMutation(sandboxIntent(learner, input));
  const second = createEducationLearnerAppendMutation(sandboxIntent(learner, input));

  assert.deepEqual(first, second);
  assert.equal(
    first.mutation.event_id,
    deriveEducationLearnerGridEventId(learner, input.event_id),
  );
  assert.equal(first.mutation.kind, 'education.learner.event.recorded');
  assert.equal(first.mutation.subject, learner);
  assert.equal(first.mutation.payload.memory_object_id, memory.output.object_id);
  assert.match(first.mutation.payload.record_digest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(first).includes('private_body'), false);

  const authority = preflightEducationLearnerGridEvent(
    store,
    withExecutionEvidence(first.mutation),
    learner,
    { now: '2026-08-11T21:01:00-04:00' },
  );
  assert.equal(authority.memory_owner, learner);
  assert.equal(authority.memory_kind, 'education.learner-submission');
  assert.equal(authority.consent_id, consent.output.consent_id);
});

test('educator-authored assignment preflight requires authenticated actor ownership', async t => {
  const store = await storeFixture(t);
  const learner = 'human:learner-001';
  const educator = 'human:educator-001';
  const consent = grantConsent(learner);
  const memory = putMemory(educator, 'education.assignment-artifact');
  appendMutation(store, learner, 'trace:native:assignment-consent', consent.mutation);
  appendMutation(store, educator, 'trace:native:assignment-memory', memory.mutation);
  const input = appendInput({
    subject: learner,
    consentId: consent.output.consent_id,
    memoryObjectId: memory.output.object_id,
    eventType: 'assignment.created',
  });
  const prepared = createEducationLearnerAppendMutation(sandboxIntent(educator, input));

  const authority = preflightEducationLearnerGridEvent(
    store,
    withExecutionEvidence(prepared.mutation),
    educator,
    { now: '2026-08-11T21:01:00-04:00' },
  );
  assert.equal(authority.memory_owner, educator);
  assert.equal(authority.memory_kind, 'education.assignment-artifact');

  assert.throws(
    () => preflightEducationLearnerGridEvent(
      store,
      withExecutionEvidence(prepared.mutation),
      'human:other-educator',
      { now: '2026-08-11T21:01:00-04:00' },
    ),
    /memory reference does not match required owner and kind/,
  );
});

test('revoked consent blocks native learner append preflight', async t => {
  const store = await storeFixture(t);
  const learner = 'human:learner-001';
  const consent = grantConsent(learner);
  const memory = putMemory(learner, 'education.learner-submission');
  appendMutation(store, learner, 'trace:native:revoke-consent', consent.mutation);
  appendMutation(store, learner, 'trace:native:revoke-memory', memory.mutation);

  const revoke = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'consent.revoke',
      principal: { id: learner },
      input: {
        consent_id: consent.output.consent_id,
        revocation_handle: consent.output.revocation_handle,
      },
    },
  });
  appendMutation(store, learner, 'trace:native:revoke', revoke.mutation);

  const input = appendInput({
    subject: learner,
    consentId: consent.output.consent_id,
    memoryObjectId: memory.output.object_id,
  });
  const prepared = createEducationLearnerAppendMutation(sandboxIntent(learner, input));
  assert.throws(
    () => preflightEducationLearnerGridEvent(
      store,
      withExecutionEvidence(prepared.mutation),
      learner,
      { now: '2026-08-11T21:01:00-04:00' },
    ),
    /consent was not found/,
  );
});

test('production policy remains capability_unavailable for learner append', async () => {
  const policy = JSON.parse(await readFile(new URL('../config/policy.json', import.meta.url), 'utf8'));
  const rule = policy.actions['education.learner.event.append'];
  assert.equal(rule.decision, 'deny');
  assert.equal(rule.code, 'capability_unavailable');
  assert.equal(rule.http_status, 503);
  assert.equal(rule.tool, undefined);
  assert.deepEqual(rule.required_scopes, ['education:learner:write']);
});

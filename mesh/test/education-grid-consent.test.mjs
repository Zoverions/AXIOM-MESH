import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createGridEducationConsentAssertion } from '../src/domain/education-grid-consent.mjs';
import { EDUCATION_CONTRACT_CONTROLLER } from '../src/domain/education-contract.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-education-consent-'));
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

function grantEducationConsent(subject, overrides = {}) {
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
        ...overrides,
      },
    },
  });
}

test('exact active education consent receipt authorizes only its bound purpose and scope', async t => {
  const store = await storeFixture(t);
  const subject = 'human:learner-001';
  const grant = grantEducationConsent(subject);
  appendMutation(store, subject, 'trace:education-consent:grant', grant.mutation);

  const assertConsent = createGridEducationConsentAssertion({
    store,
    now: () => '2026-08-11T20:00:00-04:00',
  });
  const request = {
    subject_id: subject,
    consent_id: grant.output.consent_id,
    purpose: 'learning-progress-recording',
    data_scope: 'learning-progress:write',
  };

  assert.equal(await assertConsent(request), true);
  assert.equal(await assertConsent({ ...request, purpose: 'learning-progress-review' }), false);
  assert.equal(await assertConsent({ ...request, data_scope: 'learning-progress:read' }), false);
  assert.equal(await assertConsent({ ...request, consent_id: 'consent:missing' }), false);
  assert.equal(await assertConsent({ ...request, subject_id: 'human:learner-002' }), false);
});

test('education consent rejects wrong controller and expired receipt', async t => {
  const store = await storeFixture(t);
  const subject = 'human:learner-001';
  const wrongController = grantEducationConsent(subject, {
    controller: 'capsule:other.education',
  });
  appendMutation(store, subject, 'trace:education-consent:wrong-controller', wrongController.mutation);

  const assertConsent = createGridEducationConsentAssertion({
    store,
    now: () => '2100-01-01T00:00:00.000Z',
  });
  assert.equal(await assertConsent({
    subject_id: subject,
    consent_id: wrongController.output.consent_id,
    purpose: 'learning-progress-recording',
    data_scope: 'learning-progress:write',
  }), false);
});

test('revoked Grid consent stops authorizing education immediately', async t => {
  const store = await storeFixture(t);
  const subject = 'human:learner-001';
  const grant = grantEducationConsent(subject);
  appendMutation(store, subject, 'trace:education-consent:grant-revoke', grant.mutation);

  const assertConsent = createGridEducationConsentAssertion({
    store,
    now: () => '2026-08-11T20:00:00-04:00',
  });
  const request = {
    subject_id: subject,
    consent_id: grant.output.consent_id,
    purpose: 'learning-progress-recording',
    data_scope: 'learning-progress:write',
  };
  assert.equal(await assertConsent(request), true);

  const revoke = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'consent.revoke',
      principal: { id: subject },
      input: {
        consent_id: grant.output.consent_id,
        revocation_handle: grant.output.revocation_handle,
      },
    },
  });
  appendMutation(store, subject, 'trace:education-consent:revoke', revoke.mutation);

  assert.equal(await assertConsent(request), false);
});

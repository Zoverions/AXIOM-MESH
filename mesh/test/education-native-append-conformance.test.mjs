import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  EDUCATION_CONTRACT_ID,
  EDUCATION_CONTRACT_SHA256,
  EDUCATION_CONTRACT_VERSION,
} from '../src/domain/education-contract.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { canonicalJson } from '../src/lib/canonical.mjs';

const DIGEST = 'a'.repeat(64);

async function api(base, token, path, {
  method = 'GET',
  body,
  idempotencyKey = `education-conformance-${crypto.randomUUID()}`,
} = {}, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(
    response.status,
    expectedStatus,
    `HTTP ${method} ${path} expected ${expectedStatus}, got ${response.status}: ${canonicalJson(payload)}`,
  );
  return payload;
}

async function findPortBlock() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const base = 20_000 + Math.floor(Math.random() * 20_000);
    const servers = [];
    try {
      for (let port = base; port < base + 4; port += 1) {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, '127.0.0.1', resolve);
        });
        servers.push(server);
      }
      await Promise.all(
        servers.map(server => new Promise(resolve => server.close(resolve))),
      );
      return base;
    } catch {
      await Promise.all(
        servers.map(server => new Promise(resolve => server.close(resolve))),
      );
    }
  }
  throw new Error('Unable to reserve a local four-port block');
}

function learnerEventInput({
  subject,
  consentId,
  memoryObjectId,
  eventId,
  eventType,
  reviewState,
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
    occurred_at: '2026-08-12T13:00:00-04:00',
    payload_digest: DIGEST,
    memory_object_id: memoryObjectId,
    course_code: 'MTH1W',
    expectation_ids: ['MTH1W-A1.1'],
    review_state: reviewState,
  };
}

function learnerProgressInput({ subject, consentId, courseCode = 'MTH1W' }) {
  return {
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256,
    subject_id: subject,
    consent_id: consentId,
    purpose: 'learning-progress-review',
    course_code: courseCode,
  };
}

test('test-only policy proves native learner append and self-read across Gateway, Hypervisor, Sandbox, and Grid', { timeout: 90_000 }, async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-education-native-conformance-'));
  const policyPath = join(dataDir, 'education-conformance-policy.json');
  const productionPolicy = JSON.parse(await readFile(
    new URL('../config/policy.json', import.meta.url),
    'utf8',
  ));
  for (const action of [
    'education.learner.event.append',
    'education.learner.progress.read',
  ]) {
    assert.equal(productionPolicy.actions[action].decision, 'deny');
    assert.equal(productionPolicy.actions[action].code, 'capability_unavailable');
    assert.equal(productionPolicy.actions[action].tool, undefined);
  }

  const conformancePolicy = structuredClone(productionPolicy);
  conformancePolicy.actions['education.learner.event.append'] = {
    decision: 'allow',
    risk: 'medium',
    required_scopes: ['education:learner:write'],
    tool: 'builtin.validate-mutation',
  };
  conformancePolicy.actions['education.learner.progress.read'] = {
    decision: 'allow',
    risk: 'medium',
    required_scopes: ['education:learner:read'],
    tool: 'builtin.education-learner-progress-read',
  };
  const changedActions = Object.keys(productionPolicy.actions).filter(
    action => canonicalJson(productionPolicy.actions[action])
      !== canonicalJson(conformancePolicy.actions[action]),
  );
  assert.deepEqual(changedActions, [
    'education.learner.event.append',
    'education.learner.progress.read',
  ]);
  await writeFile(policyPath, JSON.stringify(conformancePolicy), 'utf8');

  const basePort = await findPortBlock();
  const learnerToken = `education-learner-${crypto.randomUUID()}-${'l'.repeat(24)}`;
  const educatorToken = `education-educator-${crypto.randomUUID()}-${'e'.repeat(24)}`;
  const imposterToken = `education-imposter-${crypto.randomUUID()}-${'i'.repeat(24)}`;
  const learner = 'human:learner-001';
  const educator = 'human:educator-001';
  const imposter = 'human:educator-002';
  const overrides = {
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    policyPath,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 2_000,
    rateLimitRefillPerSecond: 2_000,
    apiTokens: {
      [learnerToken]: {
        id: learner,
        type: 'human',
        roles: ['learner'],
        scopes: [
          'intent:execute',
          'consent:write',
          'memory:write',
          'education:learner:write',
          'education:learner:read',
          'audit:read',
        ],
      },
      [educatorToken]: {
        id: educator,
        type: 'human',
        roles: ['educator'],
        scopes: [
          'intent:execute',
          'memory:write',
          'education:learner:write',
        ],
      },
      [imposterToken]: {
        id: imposter,
        type: 'human',
        roles: ['educator'],
        scopes: [
          'intent:execute',
          'education:learner:write',
          'education:learner:read',
        ],
      },
    },
  };

  let stack;
  try {
    stack = await startDevelopmentStack(overrides);
    const gateway = `http://127.0.0.1:${basePort}`;

    const writeConsent = await api(gateway, learnerToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'consent.grant',
        input: {
          controller: 'capsule:axiom.education',
          purpose: 'learning-progress-recording',
          scopes: ['learning-progress:write'],
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      },
    });
    assert.equal(writeConsent.status, 'completed');

    const readConsent = await api(gateway, learnerToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'consent.grant',
        input: {
          controller: 'capsule:axiom.education',
          purpose: 'learning-progress-review',
          scopes: ['learning-progress:read'],
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      },
    });
    assert.equal(readConsent.status, 'completed');

    const submissionMemory = await api(gateway, learnerToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'memory.put',
        input: {
          kind: 'education.learner-submission',
          content: { answer: 'private learner content' },
          metadata: {},
        },
      },
    });
    const submission = await api(gateway, learnerToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'education.learner.event.append',
        input: learnerEventInput({
          subject: learner,
          consentId: writeConsent.consent_id,
          memoryObjectId: submissionMemory.object_id,
          eventId: 'workflow-event:submission-001',
          eventType: 'submission.created',
          reviewState: 'submitted',
        }),
      },
    });
    assert.equal(submission.status, 'completed');
    assert.equal(submission.learner_record_status, 'recorded');
    assert.equal(submission.memory_object_id, submissionMemory.object_id);

    const assignmentMemory = await api(gateway, educatorToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'memory.put',
        input: {
          kind: 'education.assignment-artifact',
          content: { prompt: 'private educator-authored assignment' },
          metadata: {},
        },
      },
    });
    const assignment = await api(gateway, educatorToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'education.learner.event.append',
        input: learnerEventInput({
          subject: learner,
          consentId: writeConsent.consent_id,
          memoryObjectId: assignmentMemory.object_id,
          eventId: 'workflow-event:assignment-001',
          eventType: 'assignment.created',
          reviewState: 'assigned',
        }),
      },
    });
    assert.equal(assignment.status, 'completed');
    assert.equal(assignment.learner_record_status, 'recorded');

    const progress = await api(gateway, learnerToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'education.learner.progress.read',
        input: learnerProgressInput({
          subject: learner,
          consentId: readConsent.consent_id,
        }),
      },
    });
    assert.equal(progress.status, 'completed');
    assert.equal(progress.provider_result.provider_capability, 'education.learner-record');
    assert.equal(progress.provider_result.result.status, 'available');
    assert.equal(progress.provider_result.result.subject_id, learner);
    assert.equal(progress.provider_result.result.course_code, 'MTH1W');
    assert.deepEqual(
      progress.provider_result.result.events.map(event => event.event_type),
      ['assignment.created', 'submission.created'],
    );
    const progressJson = canonicalJson(progress.provider_result.result);
    for (const forbidden of [
      'private learner content',
      'private educator-authored assignment',
      '"grade"',
      '"credit"',
      '"transcript"',
      '"mastery"',
      '"automatic_mastery"',
    ]) {
      assert.equal(progressJson.includes(forbidden), false, `read leaked forbidden value: ${forbidden}`);
    }

    const otherCourse = await api(gateway, learnerToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'education.learner.progress.read',
        input: learnerProgressInput({
          subject: learner,
          consentId: readConsent.consent_id,
          courseCode: 'ENG1D',
        }),
      },
    });
    assert.deepEqual(otherCourse.provider_result.result.events, []);

    const crossSubject = await api(gateway, imposterToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'education.learner.progress.read',
        input: learnerProgressInput({
          subject: learner,
          consentId: readConsent.consent_id,
        }),
      },
    }, 403);
    assert.equal(
      crossSubject.error?.code,
      'education_cross_subject_read_unavailable',
    );

    const wrongOwner = await api(gateway, imposterToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'education.learner.event.append',
        input: learnerEventInput({
          subject: learner,
          consentId: writeConsent.consent_id,
          memoryObjectId: assignmentMemory.object_id,
          eventId: 'workflow-event:assignment-imposter',
          eventType: 'assignment.created',
          reviewState: 'assigned',
        }),
      },
    }, 409);
    assert.equal(wrongOwner.error?.code, 'education_memory_reference_unavailable');

    const revokedRead = await api(gateway, learnerToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'consent.revoke',
        input: {
          consent_id: readConsent.consent_id,
          revocation_handle: readConsent.revocation_handle,
        },
      },
    });
    assert.equal(revokedRead.status, 'completed');

    const readAfterRevoke = await api(gateway, learnerToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'education.learner.progress.read',
        input: learnerProgressInput({
          subject: learner,
          consentId: readConsent.consent_id,
        }),
      },
    }, 409);
    assert.equal(readAfterRevoke.error?.code, 'education_consent_unavailable');

    const revokedWrite = await api(gateway, learnerToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'consent.revoke',
        input: {
          consent_id: writeConsent.consent_id,
          revocation_handle: writeConsent.revocation_handle,
        },
      },
    });
    assert.equal(revokedWrite.status, 'completed');

    const postRevokeMemory = await api(gateway, learnerToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'memory.put',
        input: {
          kind: 'education.learner-submission',
          content: { answer: 'new private learner content' },
          metadata: {},
        },
      },
    });
    const revokedConsent = await api(gateway, learnerToken, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'education.learner.event.append',
        input: learnerEventInput({
          subject: learner,
          consentId: writeConsent.consent_id,
          memoryObjectId: postRevokeMemory.object_id,
          eventId: 'workflow-event:submission-after-revoke',
          eventType: 'submission.created',
          reviewState: 'submitted',
        }),
      },
    }, 409);
    assert.equal(revokedConsent.error?.code, 'education_consent_unavailable');

    const audit = await api(gateway, learnerToken, '/v1/audit/verify');
    assert.equal(audit.valid, true);

    const grid = stack.services.find(service => service.name === 'grid');
    const rows = grid.store.db.prepare(`
      SELECT * FROM events
      WHERE kind = 'education.learner.event.recorded'
      ORDER BY seq
    `).all().map(row => grid.store.decodeEventRow(row));
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map(row => row.payload.event_type),
      ['submission.created', 'assignment.created'],
    );
    assert.equal(
      canonicalJson(rows).includes('private learner content'),
      false,
    );
    assert.equal(
      canonicalJson(rows).includes('private educator-authored assignment'),
      false,
    );
    assert.ok(rows.every(row => row.payload.evidence?.execution?.signature));
  } finally {
    if (stack) await stack.stop().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  }
});

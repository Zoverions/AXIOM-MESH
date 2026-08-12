import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const TOKEN = `education-e2e-${'e'.repeat(40)}`;
const CONTRACT_SHA = 'a20e191a05308ef85bdc1cc74bfa0d54b98a176818f8030a172b4c3709a28fa2';

async function startEducationStack(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-education-learner-e2e-'));
  const policyPath = join(dataDir, 'education-test-policy.json');
  const policy = JSON.parse(await readFile(
    new URL('../config/policy.json', import.meta.url),
    'utf8'
  ));
  policy.version = `${policy.version}-education-self-consent-e2e`;
  policy.actions['education.learner.event.append'] = {
    decision: 'allow',
    risk: 'medium',
    required_scopes: ['education:learner:write'],
    required_confirmations: 0,
    requires_independent_approval: false,
    timeout_ms: 10_000,
    constraints: {
      max_event_bytes: 16_384
    },
    tool: 'adapter.education-learner-record',
    effect: 'education.learner.event.append'
  };
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);

  const lease = await reserveProductionPortBlock('education learner record e2e');
  const basePort = lease.base_port;
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
    policyPath,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 1_000,
    rateLimitRefillPerSecond: 1_000,
    apiTokens: {
      [TOKEN]: {
        id: 'learner.self',
        type: 'human',
        roles: ['learner'],
        scopes: ['*']
      }
    }
  });

  const gateway = `http://127.0.0.1:${basePort}`;
  const client = createGatewayClient({
    token: TOKEN,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });
  return { client };
}

function learnerEventInput({ eventId, consentId, memoryObjectId, subjectId = 'learner.self' }) {
  return {
    contract_id: 'axiom.education',
    contract_version: '1.0.0',
    contract_sha256: CONTRACT_SHA,
    subject_id: subjectId,
    consent_id: consentId,
    purpose: 'learning-progress-recording',
    event_id: eventId,
    event_type: 'claw.activity.completed',
    occurred_at: new Date().toISOString(),
    payload_digest: 'c'.repeat(64),
    memory_object_id: memoryObjectId,
    review_state: 'unreviewed'
  };
}

test('self-consent learner event reaches Grid, deduplicates by event identity, validates memory, and revocation blocks the next write', async t => {
  const { client } = await startEducationStack(t);

  const grant = await client.call('intents.submit', {
    body: {
      action: 'consent.grant',
      input: {
        controller: 'capsule:axiom.education',
        purpose: 'learning-progress-recording',
        scopes: ['learning-progress:write'],
        expires_at: new Date(Date.now() + 3_600_000).toISOString()
      }
    },
    idempotencyKey: 'education-consent-grant-0001'
  });
  assert.equal(grant.status, 'completed');
  assert.match(grant.consent_id, /^consent_/);
  assert.ok(grant.revocation_handle);

  const memory = await client.call('intents.submit', {
    body: {
      action: 'memory.put',
      input: {
        kind: 'education.private-reflection',
        content: {
          reflection_digest: 'd'.repeat(64),
          note: 'Test-only governed memory reference; no raw reflection required.'
        },
        metadata: {
          source: 'education-learner-record-e2e'
        }
      }
    },
    idempotencyKey: 'education-memory-put-0001'
  });
  assert.equal(memory.status, 'completed');
  assert.match(memory.object_id, /^memory_/);

  const firstInput = learnerEventInput({
    eventId: 'event_bridge_1',
    consentId: grant.consent_id,
    memoryObjectId: memory.object_id
  });
  const first = await client.call('intents.submit', {
    body: {
      action: 'education.learner.event.append',
      input: firstInput
    },
    idempotencyKey: 'education-event-append-0001'
  });
  assert.equal(first.status, 'completed');
  assert.equal(first.event_id, 'event_bridge_1');
  assert.equal(first.subject_id, 'learner.self');
  assert.equal(first.review_state, 'unreviewed');
  assert.equal(first.standards_bound, false);
  assert.match(first.record_digest, /^[a-f0-9]{64}$/);

  const events = await client.call('events.list', {
    query: { after: 0, limit: 100 }
  });
  const learnerEvent = events.events.find(event => (
    event.kind === 'education.learner.event.appended'
    && event.subject === 'event_bridge_1'
  ));
  assert.ok(learnerEvent);
  assert.match(learnerEvent.event_id, /^edu_evt_[a-f0-9]{64}$/);
  assert.equal(learnerEvent.actor, 'learner.self');
  assert.equal(learnerEvent.payload.subject_id, 'learner.self');
  assert.equal(learnerEvent.payload.consent.consent_id, grant.consent_id);
  assert.equal(learnerEvent.payload.memory_object_id, memory.object_id);
  assert.equal(learnerEvent.payload.payload_digest, 'c'.repeat(64));
  assert.equal('raw_reflection' in learnerEvent.payload, false);
  assert.match(learnerEvent.payload.evidence.plan_digest, /^[a-f0-9]{64}$/);

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'education.learner.event.append',
        input: firstInput
      },
      idempotencyKey: 'education-event-duplicate-0001'
    }),
    error => {
      assert.equal(error.code, 'state_conflict');
      assert.equal(error.status, 409);
      return true;
    }
  );

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'education.learner.event.append',
        input: learnerEventInput({
          eventId: 'event_missing_memory_1',
          consentId: grant.consent_id,
          memoryObjectId: `memory_${'f'.repeat(64)}`
        })
      },
      idempotencyKey: 'education-event-missing-memory-0001'
    }),
    error => {
      assert.equal(error.code, 'education_memory_reference_unavailable');
      assert.equal(error.status, 409);
      return true;
    }
  );

  const revoked = await client.call('intents.submit', {
    body: {
      action: 'consent.revoke',
      input: {
        consent_id: grant.consent_id,
        revocation_handle: grant.revocation_handle
      }
    },
    idempotencyKey: 'education-consent-revoke-0001'
  });
  assert.equal(revoked.status, 'completed');
  assert.equal(revoked.revoked, true);

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'education.learner.event.append',
        input: learnerEventInput({
          eventId: 'event_bridge_2',
          consentId: grant.consent_id,
          memoryObjectId: memory.object_id
        })
      },
      idempotencyKey: 'education-event-after-revoke-0001'
    }),
    error => {
      assert.equal(error.code, 'education_consent_mismatch');
      assert.equal(error.status, 403);
      return true;
    }
  );

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'education.learner.event.append',
        input: learnerEventInput({
          eventId: 'event_child_1',
          consentId: grant.consent_id,
          memoryObjectId: memory.object_id,
          subjectId: 'child.other'
        })
      },
      idempotencyKey: 'education-event-other-subject-0001'
    }),
    error => {
      assert.equal(error.code, 'delegated_consent_unavailable');
      assert.equal(error.status, 403);
      return true;
    }
  );
});

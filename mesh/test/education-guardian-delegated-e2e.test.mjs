import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { buildDelegatedConsentReceipt } from '../src/authority/human-delegated-consent.mjs';

const GUARDIAN_TOKEN = `education-guardian-e2e-${'g'.repeat(32)}`;
const CONTRACT_SHA = 'a20e191a05308ef85bdc1cc74bfa0d54b98a176818f8030a172b4c3709a28fa2';
const SUBJECT = 'learner.child.1';
const HOLDER = 'adult.guardian.1';
const ATTESTOR = 'authority.attestor.1';
const RELATIONSHIP_ID = 'relationship_guardian_child_e2e_1';
const GRANT_ID = 'authority_guardian_child_education_e2e_1';
const JURISDICTION = 'c'.repeat(64);
const REVOCATION = 'f'.repeat(64);

async function startGuardianStack(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-education-guardian-e2e-'));
  const policyPath = join(dataDir, 'education-guardian-test-policy.json');
  const policy = JSON.parse(await readFile(
    new URL('../config/policy.json', import.meta.url),
    'utf8'
  ));
  policy.version = `${policy.version}-education-guardian-delegated-e2e`;
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

  const lease = await reserveProductionPortBlock('education guardian delegated e2e');
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
      [GUARDIAN_TOKEN]: {
        id: HOLDER,
        type: 'human',
        roles: ['guardian'],
        scopes: ['*']
      }
    }
  });

  const gateway = `http://127.0.0.1:${basePort}`;
  const client = createGatewayClient({
    token: GUARDIAN_TOKEN,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });
  const grid = stack.services.find(service => service.name === 'grid');
  assert.ok(grid?.store);
  return { client, grid: grid.store };
}

function append(store, actor, kind, subject, payload, eventId) {
  return store.appendEvents({
    traceId: `trace_${eventId}`,
    actor,
    events: [{ event_id: eventId, kind, subject, payload }]
  })[0];
}

function seedRelationshipAndGrant(store) {
  const effectiveFrom = new Date(Date.now() - 60_000).toISOString();
  const effectiveUntil = new Date(Date.now() + 86_400_000).toISOString();
  append(
    store,
    ATTESTOR,
    'human.relationship.claimed',
    RELATIONSHIP_ID,
    {
      schema: 'axiom-human-relationship-claim.v1',
      claim_id: RELATIONSHIP_ID,
      subject_id: SUBJECT,
      holder_id: HOLDER,
      relationship_type: 'legal-guardian',
      issuer_id: ATTESTOR,
      assurance: 'A3',
      evidence_digest: 'a'.repeat(64),
      jurisdiction_context_digest: JURISDICTION,
      effective_from: effectiveFrom,
      effective_until: effectiveUntil,
      status: 'active'
    },
    'event_guardian_relationship_e2e_1'
  );
  append(
    store,
    ATTESTOR,
    'human.authority.granted',
    GRANT_ID,
    {
      schema: 'axiom-human-authority-grant.v1',
      grant_id: GRANT_ID,
      subject_id: SUBJECT,
      holder_id: HOLDER,
      relationship_claim_id: RELATIONSHIP_ID,
      issuer_id: ATTESTOR,
      authority_source: 'guardian',
      controllers: ['capsule:axiom.education'],
      purposes: ['learning-progress-recording'],
      data_scopes: ['learning-progress:write'],
      actions: ['education.learner.event.append'],
      assurance: 'A3',
      evidence_digest: 'b'.repeat(64),
      jurisdiction_context_digest: JURISDICTION,
      effective_from: effectiveFrom,
      effective_until: effectiveUntil,
      revocable: true,
      delegable: false,
      status: 'active'
    },
    'event_guardian_authority_e2e_1'
  );
}

function seedChildMemory(store) {
  const kind = 'education.private-reflection';
  const content = {
    reflection_digest: 'd'.repeat(64),
    note: 'Test-only child-owned governed memory reference.'
  };
  const metadata = { source: 'education-guardian-delegated-e2e' };
  const contentDigest = digestObject({ owner: SUBJECT, kind, content, metadata });
  const objectId = `memory_${contentDigest}`;
  append(
    store,
    SUBJECT,
    'memory.put',
    objectId,
    {
      object_id: objectId,
      owner: SUBJECT,
      kind,
      content,
      metadata,
      content_digest: contentDigest
    },
    'event_guardian_child_memory_e2e_1'
  );
  return objectId;
}

function issueDelegatedReceipt(store) {
  const now = new Date().toISOString();
  const authority = store.resolveStoredHumanAuthority({
    holderType: 'human',
    subjectId: SUBJECT,
    holderId: HOLDER,
    grantId: GRANT_ID,
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    dataScopes: ['learning-progress:write'],
    asOf: now
  });
  assert.equal(authority.allow, true);
  const result = buildDelegatedConsentReceipt({
    principal: { id: HOLDER, type: 'human' },
    authority,
    consentId: 'delegated_consent_guardian_e2e_1',
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    dataScopes: ['learning-progress:write'],
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    revocationHandleHash: REVOCATION,
    now
  });
  assert.equal(result.allow, true);
  append(
    store,
    HOLDER,
    'human.delegated-consent.granted',
    result.receipt.consent_id,
    result.receipt,
    'event_guardian_delegated_consent_e2e_1'
  );
  return result.receipt;
}

function learnerEventInput({ eventId, consentId, memoryObjectId }) {
  return {
    contract_id: 'axiom.education',
    contract_version: '1.0.0',
    contract_sha256: CONTRACT_SHA,
    subject_id: SUBJECT,
    consent_id: consentId,
    purpose: 'learning-progress-recording',
    event_id: eventId,
    event_type: 'claw.activity.completed',
    occurred_at: new Date().toISOString(),
    payload_digest: 'e'.repeat(64),
    memory_object_id: memoryObjectId,
    review_state: 'unreviewed'
  };
}

test('guardian delegated authority records a child learner event and current grant revocation blocks the next write', async t => {
  const { client, grid } = await startGuardianStack(t);
  seedRelationshipAndGrant(grid);
  const memoryObjectId = seedChildMemory(grid);
  const receipt = issueDelegatedReceipt(grid);

  const first = await client.call('intents.submit', {
    body: {
      action: 'education.learner.event.append',
      input: learnerEventInput({
        eventId: 'guardian_child_event_1',
        consentId: receipt.consent_id,
        memoryObjectId
      })
    },
    idempotencyKey: 'education-guardian-event-append-0001'
  });
  assert.equal(first.status, 'completed');
  assert.equal(first.event_id, 'guardian_child_event_1');
  assert.equal(first.subject_id, SUBJECT);
  assert.match(first.record_digest, /^[a-f0-9]{64}$/);

  const events = await client.call('events.list', {
    query: { after: 0, limit: 100 }
  });
  const learnerEvent = events.events.find(event => (
    event.kind === 'education.learner.event.appended'
    && event.subject === 'guardian_child_event_1'
  ));
  assert.ok(learnerEvent);
  assert.equal(learnerEvent.actor, HOLDER);
  assert.equal(learnerEvent.payload.subject_id, SUBJECT);
  assert.equal(learnerEvent.payload.memory_object_id, memoryObjectId);
  assert.equal(learnerEvent.payload.consent.authority_mode, 'delegated-human-authority-v1');
  assert.equal(learnerEvent.payload.consent.holder_id, HOLDER);
  assert.equal(learnerEvent.payload.consent.authority_grant_id, GRANT_ID);
  assert.equal(learnerEvent.payload.consent.relationship_claim_id, RELATIONSHIP_ID);
  assert.equal(learnerEvent.payload.consent.consent_id, receipt.consent_id);
  assert.equal(learnerEvent.payload.consent.receipt_digest.length, 64);
  assert.equal(JSON.stringify(learnerEvent.payload).includes('legal-guardian'), false);
  assert.equal(JSON.stringify(learnerEvent.payload).includes('evidence_digest'), false);

  append(
    grid,
    ATTESTOR,
    'human.authority.revoked',
    GRANT_ID,
    {
      grant_id: GRANT_ID,
      subject_id: SUBJECT,
      evidence_digest: '9'.repeat(64)
    },
    'event_guardian_authority_revoke_e2e_1'
  );
  assert.equal(grid.getDelegatedConsent(receipt.consent_id).status, 'active');

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'education.learner.event.append',
        input: learnerEventInput({
          eventId: 'guardian_child_event_2',
          consentId: receipt.consent_id,
          memoryObjectId
        })
      },
      idempotencyKey: 'education-guardian-event-after-revoke-0001'
    }),
    error => {
      assert.equal(error.code, 'authority_grant_inactive');
      assert.equal(error.status, 403);
      return true;
    }
  );
});

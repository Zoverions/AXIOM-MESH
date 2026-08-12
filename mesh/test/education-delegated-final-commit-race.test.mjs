import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { buildDelegatedConsentReceipt } from '../src/authority/human-delegated-consent.mjs';
import {
  EDUCATION_DELEGATED_BINDING_SCHEMA,
  evaluateEducationDelegatedAuthorization
} from '../src/domain/education-delegated-authorization.mjs';
import { loadEducationContract } from '../src/domain/education-contract.mjs';
import { executeEducationLearnerEvent } from '../src/domain/education-learner-record.mjs';
import { preflightEducationGridCommit } from '../src/domain/education-grid-commit.mjs';
import { DelegatedAuthorityGridStore } from '../src/grid/delegated-authority-store.mjs';

const SUBJECT = 'learner.child.race';
const HOLDER = 'adult.guardian.race';
const ATTESTOR = 'authority.attestor.race';
const RELATIONSHIP = 'relationship_guardian_child_race';
const GRANT = 'authority_guardian_child_race';
const CONSENT = 'delegated_consent_race';
const JURISDICTION = 'c'.repeat(64);
const REVOCATION = 'f'.repeat(64);

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-education-delegated-race-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(Buffer.alloc(32, 19));
  const store = new DelegatedAuthorityGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function append(store, actor, kind, subject, payload, eventId) {
  return store.appendEvents({
    traceId: `trace_${eventId}`,
    actor,
    events: [{ event_id: eventId, kind, subject, payload }]
  })[0];
}

function seedAuthority(store) {
  const from = new Date(Date.now() - 60_000).toISOString();
  const until = new Date(Date.now() + 3_600_000).toISOString();
  append(store, ATTESTOR, 'human.relationship.claimed', RELATIONSHIP, {
    schema: 'axiom-human-relationship-claim.v1',
    claim_id: RELATIONSHIP,
    subject_id: SUBJECT,
    holder_id: HOLDER,
    relationship_type: 'legal-guardian',
    issuer_id: ATTESTOR,
    assurance: 'A3',
    evidence_digest: 'a'.repeat(64),
    jurisdiction_context_digest: JURISDICTION,
    effective_from: from,
    effective_until: until,
    status: 'active'
  }, 'event_relationship_race');
  append(store, ATTESTOR, 'human.authority.granted', GRANT, {
    schema: 'axiom-human-authority-grant.v1',
    grant_id: GRANT,
    subject_id: SUBJECT,
    holder_id: HOLDER,
    relationship_claim_id: RELATIONSHIP,
    issuer_id: ATTESTOR,
    authority_source: 'guardian',
    controllers: ['capsule:axiom.education'],
    purposes: ['learning-progress-recording'],
    data_scopes: ['learning-progress:write'],
    actions: ['education.learner.event.append'],
    assurance: 'A3',
    evidence_digest: 'b'.repeat(64),
    jurisdiction_context_digest: JURISDICTION,
    effective_from: from,
    effective_until: until,
    revocable: true,
    delegable: false,
    status: 'active'
  }, 'event_grant_race');
}

function seedMemory(store) {
  const kind = 'education.private-reflection';
  const content = { reflection_digest: 'd'.repeat(64) };
  const metadata = { source: 'delegated-final-commit-race' };
  const contentDigest = digestObject({ owner: SUBJECT, kind, content, metadata });
  const objectId = `memory_${contentDigest}`;
  append(store, SUBJECT, 'memory.put', objectId, {
    object_id: objectId,
    owner: SUBJECT,
    kind,
    content,
    metadata,
    content_digest: contentDigest
  }, 'event_memory_race');
  return objectId;
}

function seedConsent(store) {
  const now = new Date().toISOString();
  const authority = store.resolveStoredHumanAuthority({
    holderType: 'human',
    subjectId: SUBJECT,
    holderId: HOLDER,
    grantId: GRANT,
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    dataScopes: ['learning-progress:write'],
    asOf: now
  });
  assert.equal(authority.allow, true);
  const issued = buildDelegatedConsentReceipt({
    principal: { id: HOLDER, type: 'human' },
    authority,
    consentId: CONSENT,
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    dataScopes: ['learning-progress:write'],
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    revocationHandleHash: REVOCATION,
    now
  });
  assert.equal(issued.allow, true);
  append(store, HOLDER, 'human.delegated-consent.granted', CONSENT, issued.receipt, 'event_consent_race');
  return issued.receipt;
}

test('authority revoked after Hypervisor-style binding is rejected by final Grid preflight', async t => {
  const store = await fixture(t);
  const contract = await loadEducationContract();
  seedAuthority(store);
  const memoryObjectId = seedMemory(store);
  seedConsent(store);

  const intent = {
    principal: { id: HOLDER, type: 'human' },
    action: 'education.learner.event.append',
    input: {
      contract_id: 'axiom.education',
      contract_version: '1.0.0',
      contract_sha256: 'a20e191a05308ef85bdc1cc74bfa0d54b98a176818f8030a172b4c3709a28fa2',
      subject_id: SUBJECT,
      consent_id: CONSENT,
      purpose: 'learning-progress-recording',
      event_id: 'learner_event_race',
      event_type: 'claw.activity.completed',
      occurred_at: new Date().toISOString(),
      payload_digest: 'e'.repeat(64),
      memory_object_id: memoryObjectId,
      review_state: 'unreviewed'
    }
  };

  // Represents Hypervisor's observation and the stable facts subsequently
  // bound into the signed plan/capability.
  const current = store.resolveDelegatedConsentAuthorization({
    consentId: CONSENT,
    subjectId: SUBJECT,
    holderId: HOLDER,
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    dataScopes: ['learning-progress:write']
  });
  const authorization = evaluateEducationDelegatedAuthorization({ intent, authorization: current });
  assert.equal(authorization.allow, true);
  const binding = {
    schema: EDUCATION_DELEGATED_BINDING_SCHEMA,
    facts: authorization.facts,
    authorization_digest: authorization.authorization_digest
  };
  const execution = executeEducationLearnerEvent({
    contract,
    intent,
    capability: {
      constraints: { education_delegated_consent: binding }
    },
    plan: {
      steps: [{
        id: 'execute',
        constraints: { education_delegated_consent: binding }
      }]
    }
  });

  // The mutation is valid against the state Hypervisor observed.
  assert.doesNotThrow(() => preflightEducationGridCommit(store, HOLDER, execution.mutation));

  // Authority changes after plan/capability issuance but before commit.
  append(store, ATTESTOR, 'human.authority.revoked', GRANT, {
    grant_id: GRANT,
    subject_id: SUBJECT,
    evidence_digest: '9'.repeat(64)
  }, 'event_grant_race_revoked');
  assert.equal(store.getDelegatedConsent(CONSENT).status, 'active');

  assert.throws(
    () => preflightEducationGridCommit(store, HOLDER, execution.mutation),
    error => error.code === 'authority_grant_inactive' && error.status === 403
  );
});

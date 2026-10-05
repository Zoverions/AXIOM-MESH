import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity, ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import {
  verifyContextAuthorityEvidence
} from '../src/lib/context-authority-evidence.mjs';
import {
  CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT,
  CONTEXT_AUTHORITY_EVIDENCE_ADMISSION_SCHEMA,
  ContextAuthorityAdmissionGridStore
} from '../src/grid/context-authority-admission-store.mjs';

function makeSigner(service = 'context-policy') {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

const signer = makeSigner();

function publicPem(identity = signer) {
  return String(identity.publicKey.export({ type: 'spki', format: 'pem' }));
}

function trustPins(identity = signer) {
  return [{
    issuer_principal_ref: 'policy_authority_1',
    key_id: identity.keyId,
    public_key_pem: publicPem(identity),
    allowed_evidence_types: ['context-disclosure-policy-decision']
  }];
}

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function policyPayload(label = 'one') {
  return {
    schema: 'axiom-context-disclosure-policy-decision.v1',
    decision_ref: `policy_decision_${label}`,
    allowed: true
  };
}

function signEvidence({
  evidenceId = 'evidence_policy_1',
  nonce = 'nonce_policy_1',
  payload = policyPayload(),
  issuedAt = iso(-60_000),
  expiresAt = iso(600_000),
  identity = signer
} = {}) {
  const unsigned = {
    schema: 'axiom-context-authority-evidence.v1',
    evidence_id: evidenceId,
    evidence_type: 'context-disclosure-policy-decision',
    issuer_principal_ref: 'policy_authority_1',
    issued_at: issuedAt,
    expires_at: expiresAt,
    nonce,
    payload_sha256: digestObject(payload),
    payload: structuredClone(payload)
  };
  return {
    ...unsigned,
    attestation: identity.signObject(unsigned)
  };
}

function admissionPayload(envelope, {
  actor = 'context_broker_1',
  now = Date.now()
} = {}) {
  const verified = verifyContextAuthorityEvidence(envelope, {
    trustPins: trustPins(),
    now
  });
  return {
    schema: CONTEXT_AUTHORITY_EVIDENCE_ADMISSION_SCHEMA,
    evidence_id: verified.evidence_id,
    evidence_type: verified.evidence_type,
    issuer_principal_ref: verified.issuer_principal_ref,
    issuer_nonce: verified.nonce,
    key_id: verified.key_id,
    payload_sha256: verified.payload_sha256,
    envelope_sha256: verified.envelope_sha256,
    issued_at: verified.issued_at,
    expires_at: verified.expires_at,
    admitted_by: actor,
    signed_evidence: structuredClone(envelope),
    authority_effect: 'none',
    grants_vault_access: false,
    grants_execution_authority: false
  };
}

async function storeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'axiom-context-authority-admit-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const key = randomBytes(32);
  const path = join(dataDir, 'grid.sqlite');
  const store = new ContextAuthorityAdmissionGridStore({
    path,
    dataDir,
    identity,
    protector: new DataProtector(key),
    contextAuthorityTrustPins: trustPins()
  });
  return { root, dataDir, identity, key, path, store };
}

function reopen(setup, pins = trustPins()) {
  return new ContextAuthorityAdmissionGridStore({
    path: setup.path,
    dataDir: setup.dataDir,
    identity: setup.identity,
    protector: new DataProtector(setup.key),
    contextAuthorityTrustPins: pins
  });
}

test('verified signed evidence is admitted once into append-only Grid provenance', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const envelope = signEvidence();
  const admitted = setup.store.admitContextAuthorityEvidence({
    envelope,
    actor: 'context_broker_1',
    traceId: 'trace_context_admission_1'
  });

  assert.equal(admitted.evidence_id, 'evidence_policy_1');
  assert.equal(admitted.status, 'admitted');
  assert.equal(admitted.authority_effect, 'none');
  assert.equal(admitted.grants_vault_access, false);
  assert.equal(admitted.grants_execution_authority, false);

  const events = setup.store.db.prepare(`
    SELECT event_id, kind, subject, payload_json
    FROM events
    WHERE kind = ?
  `).all(CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT);
  assert.equal(events.length, 1);
  assert.equal(events[0].subject, admitted.evidence_id);
  assert.equal(setup.store.protector.isProtected(events[0].payload_json), true);

  const decoded = setup.store.decodeEventRow(
    setup.store.db.prepare('SELECT * FROM events WHERE event_id = ?')
      .get(events[0].event_id)
  );
  assert.equal(decoded.payload.signed_evidence.evidence_id, admitted.evidence_id);
  assert.ok(decoded.payload.signed_evidence.attestation.signature);

  const columns = setup.store.db.prepare(`
    PRAGMA table_info(context_authority_evidence_admissions)
  `).all().map(row => row.name);
  assert.equal(columns.includes('signed_evidence'), false);
  assert.equal(columns.includes('payload_json'), false);
});

test('re-admitting the exact same signed envelope is idempotent and does not append twice', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const envelope = signEvidence();

  const first = setup.store.admitContextAuthorityEvidence({
    envelope,
    actor: 'context_broker_1',
    traceId: 'trace_context_admission_first'
  });
  const second = setup.store.admitContextAuthorityEvidence({
    envelope,
    actor: 'context_broker_1',
    traceId: 'trace_context_admission_second'
  });

  assert.deepEqual(second, first);
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count
    FROM events
    WHERE kind = ?
  `).get(CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT).count, 1);
});

test('evidence_id cannot be rebound to different signed evidence', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  setup.store.admitContextAuthorityEvidence({
    envelope: signEvidence(),
    actor: 'context_broker_1',
    traceId: 'trace_context_admission_original'
  });

  const rebound = signEvidence({
    evidenceId: 'evidence_policy_1',
    nonce: 'nonce_policy_2',
    payload: policyPayload('rebound')
  });
  assert.throws(
    () => setup.store.admitContextAuthorityEvidence({
      envelope: rebound,
      actor: 'context_broker_1',
      traceId: 'trace_context_admission_rebound'
    }),
    error => error?.code === 'context_authority_evidence_id_conflict'
  );
});

test('issuer nonce cannot be replayed under a different evidence identity', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  setup.store.admitContextAuthorityEvidence({
    envelope: signEvidence(),
    actor: 'context_broker_1',
    traceId: 'trace_context_nonce_original'
  });

  const replay = signEvidence({
    evidenceId: 'evidence_policy_2',
    nonce: 'nonce_policy_1',
    payload: policyPayload('replay')
  });
  assert.throws(
    () => setup.store.admitContextAuthorityEvidence({
      envelope: replay,
      actor: 'context_broker_1',
      traceId: 'trace_context_nonce_replay'
    }),
    error => error?.code === 'context_authority_evidence_nonce_replay'
  );
});

test('forged or tampered admission events fail before durable append', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const envelope = signEvidence();
  const payload = admissionPayload(envelope);
  payload.signed_evidence.payload.allowed = false;

  assert.throws(
    () => setup.store.appendEvents({
      traceId: 'trace_context_tampered',
      actor: 'context_broker_1',
      events: [{
        kind: CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT,
        subject: envelope.evidence_id,
        payload
      }]
    }),
    /payload digest does not match/
  );
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count
    FROM events
    WHERE kind = ?
  `).get(CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT).count, 0);
});

test('metadata, actor, and event subject bindings are enforced', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const envelope = signEvidence();
  const wrongDigest = admissionPayload(envelope);
  wrongDigest.payload_sha256 = 'f'.repeat(64);
  assert.throws(
    () => setup.store.appendEvents({
      traceId: 'trace_context_wrong_digest',
      actor: 'context_broker_1',
      events: [{
        kind: CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT,
        subject: envelope.evidence_id,
        payload: wrongDigest
      }]
    }),
    /payload_sha256 does not match signed evidence/
  );

  const wrongActor = admissionPayload(envelope);
  assert.throws(
    () => setup.store.appendEvents({
      traceId: 'trace_context_wrong_actor',
      actor: 'other_broker',
      events: [{
        kind: CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT,
        subject: envelope.evidence_id,
        payload: wrongActor
      }]
    }),
    /actor must match admitted_by/
  );

  const wrongSubject = admissionPayload(envelope);
  assert.throws(
    () => setup.store.appendEvents({
      traceId: 'trace_context_wrong_subject',
      actor: 'context_broker_1',
      events: [{
        kind: CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT,
        subject: 'different_evidence_id',
        payload: wrongSubject
      }]
    }),
    /subject must match evidence_id/
  );
});

test('materialized registry rebuilds from encrypted signed Grid history', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    try {
      setup.store.close();
    } catch {}
    await rm(setup.root, { recursive: true, force: true });
  });

  const envelope = signEvidence();
  const admitted = setup.store.admitContextAuthorityEvidence({
    envelope,
    actor: 'context_broker_1',
    traceId: 'trace_context_rebuild'
  });

  setup.store.db.prepare(`
    UPDATE context_authority_evidence_admissions
    SET payload_sha256 = ?
    WHERE evidence_id = ?
  `).run('f'.repeat(64), admitted.evidence_id);
  setup.store.close();

  setup.store = reopen(setup);
  const rebuilt = setup.store.getContextAuthorityEvidenceAdmission(
    admitted.evidence_id
  );
  assert.equal(rebuilt.payload_sha256, digestObject(policyPayload()));
  assert.equal(rebuilt.envelope_sha256, admitted.envelope_sha256);
  assert.equal(rebuilt.admitted_event_id, admitted.admitted_event_id);
});

test('historical admission survives expiry, while current usability still fails closed', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const envelope = signEvidence({
    issuedAt: iso(-60_000),
    expiresAt: iso(60_000)
  });
  const admitted = setup.store.admitContextAuthorityEvidence({
    envelope,
    actor: 'context_broker_1',
    traceId: 'trace_context_expiry'
  });

  const future = Date.now() + 120_000;
  assert.throws(
    () => setup.store.assertContextAuthorityEvidenceAdmitted(envelope, {
      now: future
    }),
    /not currently valid/
  );
  assert.equal(
    setup.store.getContextAuthorityEvidenceAdmission(admitted.evidence_id)
      .status,
    'admitted'
  );

  setup.store.close();
  setup.store = reopen(setup);
  assert.equal(
    setup.store.getContextAuthorityEvidenceAdmission(admitted.evidence_id)
      .envelope_sha256,
    admitted.envelope_sha256
  );
});

test('admission is replay-resistant but verified evidence use is non-consuming', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const envelope = signEvidence();
  const admitted = setup.store.admitContextAuthorityEvidence({
    envelope,
    actor: 'context_broker_1',
    traceId: 'trace_context_non_consuming'
  });

  const first = setup.store.assertContextAuthorityEvidenceAdmitted(envelope);
  const second = setup.store.assertContextAuthorityEvidenceAdmitted(envelope);
  assert.deepEqual(first, admitted);
  assert.deepEqual(second, admitted);
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count
    FROM context_authority_evidence_admissions
  `).get().count, 1);
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count
    FROM events
    WHERE kind = ?
  `).get(CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT).count, 1);
});

test('duplicate issuer nonce inside one raw append transaction rolls back atomically', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const firstEnvelope = signEvidence({
    evidenceId: 'evidence_batch_1',
    nonce: 'nonce_batch_1',
    payload: policyPayload('batch_1')
  });
  const secondEnvelope = signEvidence({
    evidenceId: 'evidence_batch_2',
    nonce: 'nonce_batch_1',
    payload: policyPayload('batch_2')
  });

  assert.throws(
    () => setup.store.appendEvents({
      traceId: 'trace_context_batch_replay',
      actor: 'context_broker_1',
      events: [
        {
          kind: CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT,
          subject: firstEnvelope.evidence_id,
          payload: admissionPayload(firstEnvelope)
        },
        {
          kind: CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT,
          subject: secondEnvelope.evidence_id,
          payload: admissionPayload(secondEnvelope)
        }
      ]
    }),
    error => (
      error?.code === 'state_conflict'
      || /UNIQUE constraint failed/.test(String(error?.message))
    )
  );

  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count
    FROM context_authority_evidence_admissions
  `).get().count, 0);
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count
    FROM events
    WHERE kind = ?
  `).get(CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT).count, 0);
});

test('registry exposes metadata only and does not create authority or network effects', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const envelope = signEvidence();
  setup.store.admitContextAuthorityEvidence({
    envelope,
    actor: 'context_broker_1',
    traceId: 'trace_context_surface'
  });

  const listed = setup.store.listContextAuthorityEvidenceAdmissions();
  assert.equal(listed.length, 1);
  assert.equal(Object.hasOwn(listed[0], 'signed_evidence'), false);
  assert.equal(Object.hasOwn(listed[0], 'payload'), false);
  assert.equal(Object.hasOwn(listed[0], 'attestation'), false);
  assert.equal(listed[0].authority_effect, 'none');
  assert.equal(listed[0].grants_vault_access, false);
  assert.equal(listed[0].grants_execution_authority, false);

  const status = setup.store.getStatus();
  assert.equal(status.context_authority_admission_schema_version, 1);
  assert.equal(
    status.context_authority_admission_runtime,
    'verified-append-only-replay-resistant-registry'
  );
});

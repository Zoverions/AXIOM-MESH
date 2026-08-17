import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection
} from '../src/lib/social-publication.mjs';
import { createSocialExchangePackage } from '../src/lib/social-exchange-package.mjs';
import { RemoteSocialGridStore } from '../src/grid/remote-social-store.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_ACTION,
  REMOTE_SOCIAL_ADMISSION_EVENT,
  REMOTE_SOCIAL_ADMISSION_SCHEMA,
  RemoteSocialAdmissionGridStore
} from '../src/grid/remote-social-admission-store.mjs';

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function exporterKeys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function remotePackageFixture({ suffix = 'one' } = {}) {
  const exporter = exporterKeys();
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: `persona-remote-${suffix}`,
    controller_actor_id: `actor-private-remote-${suffix}`,
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: iso(-300_000),
    status: 'active'
  };
  const publicPersona = createPublicPersonaProjection(persona);
  const publication = createSocialPublicationProjection({
    publication_id: `publication-remote-${suffix}`,
    content: {
      media_type: 'text/plain',
      text: `Remote observation ${suffix} is not local authorship.`
    },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: iso(-240_000),
    supersedes_digest: null
  }, { persona });
  const packageValue = createSocialExchangePackage({
    personas: [publicPersona],
    publications: [publication],
    transitions: [],
    exporterGridId: `grid-remote-${suffix}`,
    exporterPrivateKey: exporter.privateKey,
    exporterPublicKey: exporter.publicKey,
    createdAt: iso(-180_000),
    now: Date.now()
  });
  return { exporter, persona, publicPersona, publication, packageValue };
}

async function storeFixture(StoreClass = RemoteSocialAdmissionGridStore) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-remote-social-admit-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const key = randomBytes(32);
  const protector = new DataProtector(key);
  const path = join(dataDir, 'grid.sqlite');
  const store = new StoreClass({ path, dataDir, identity, protector });
  return { root, dataDir, identity, key, protector, path, store };
}

function stage(store, data, owner = 'principal-local-owner') {
  return store.stageRemoteSocialPackage({
    owner,
    package: data.packageValue,
    trustedExporterPublicKey: data.exporter.publicKey,
    expectedExporterGridId: data.packageValue.statement.exporter.grid_id,
    trustLabel: 'manual-review',
    stagedAt: iso(-120_000),
    expiresAt: iso(1_800_000),
    now: Date.now()
  });
}

function grantAdmissionAuthority(store, staged, {
  owner = staged.owner,
  intentId = 'intent-remote-social-admit-1',
  approvalId = 'approval-remote-social-admit-1',
  approver = 'principal-independent-reviewer',
  requestDigest
} = {}) {
  const request = store.getRemoteSocialAdmissionRequest(owner, staged.stage_id);
  const digest = requestDigest ?? request.request_digest;
  store.appendEvents({
    traceId: 'trace-remote-admit-intent',
    actor: owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: owner,
        action: REMOTE_SOCIAL_ADMISSION_ACTION,
        risk: 'high',
        input_digest: digestObject({ stage_id: staged.stage_id }),
        request_digest: digest
      }
    }]
  });
  store.appendEvents({
    traceId: 'trace-remote-admit-approval',
    actor: approver,
    events: [{
      kind: 'approval.granted',
      subject: approvalId,
      payload: {
        approval_id: approvalId,
        approver,
        requester: owner,
        action: REMOTE_SOCIAL_ADMISSION_ACTION,
        request_digest: digest,
        expires_at: iso(2_400_000)
      }
    }]
  });
  return { request, intentId, approvalId, approver };
}

test('staging-only RemoteSocialGridStore does not opt into remote admission schema or methods', async t => {
  const setup = await storeFixture(RemoteSocialGridStore);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  assert.equal(setup.store.getStatus().remote_social_schema_version, 1);
  assert.equal(setup.store.db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'remote_social_admissions'
  `).get(), undefined);
  assert.equal(setup.store.db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'remote_social_admission_schema_migrations'
  `).get(), undefined);
  assert.equal(typeof setup.store.admitRemoteSocialStage, 'undefined');
});

test('admission laboratory initializes after staging and keeps a separate event-derived schema', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const status = setup.store.getStatus();
  assert.equal(status.schema_version, 10);
  assert.equal(status.social_schema_version, 1);
  assert.equal(status.remote_social_schema_version, 1);
  assert.equal(status.remote_social_admission_schema_version, 1);
  assert.equal(status.remote_social_admission_runtime, 'approval-bound-observation-laboratory');
});

test('exact accepted intent and independent approval atomically admit remote observations only', async t => {
  const data = remotePackageFixture();
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const staged = stage(setup.store, data);
  const authority = grantAdmissionAuthority(setup.store, staged);

  const admission = setup.store.admitRemoteSocialStage({
    owner: staged.owner,
    stageId: staged.stage_id,
    intentId: authority.intentId,
    approvalId: authority.approvalId,
    traceId: 'trace-remote-admit-commit',
    now: Date.now()
  });

  assert.equal(admission.status, 'admitted');
  assert.equal(admission.remote_observation_only, true);
  assert.equal(admission.local_authorship_claimed, false);
  assert.equal(admission.network_effect, 'none');
  assert.equal(admission.authority_effect, 'none');
  assert.deepEqual(admission.summary_json.observation_counts, {
    personas: 1,
    publications: 1,
    transitions: 0
  });

  const approval = setup.store.db.prepare(`
    SELECT status, consumed_by_intent FROM approvals WHERE approval_id = ?
  `).get(authority.approvalId);
  assert.equal(approval.status, 'consumed');
  assert.equal(approval.consumed_by_intent, authority.intentId);

  const tail = setup.store.db.prepare(`
    SELECT kind, subject FROM events ORDER BY seq DESC LIMIT 2
  `).all().reverse();
  assert.deepEqual(tail.map(row => row.kind), ['approval.consumed', REMOTE_SOCIAL_ADMISSION_EVENT]);
  assert.equal(tail[1].subject, admission.admission_id);

  const observations = setup.store.listRemoteSocialObservations(staged.owner);
  assert.equal(observations.observations.length, 2);
  assert.deepEqual(
    observations.observations.map(item => item.object_kind).sort(),
    ['persona', 'publication']
  );
  assert.ok(observations.observations.every(item => (
    item.remote_observation_only === true
    && item.local_authorship_claimed === false
    && item.network_effect === 'none'
  )));

  assert.equal(setup.store.listSocialCorpus(staged.owner).publications.length, 0);
  assert.equal(setup.store.db.prepare('SELECT COUNT(*) AS count FROM social_publications').get().count, 0);
  assert.equal(setup.store.db.prepare('SELECT COUNT(*) AS count FROM publication_personas').get().count, 0);
});

test('admission requires exact accepted intent and exact active independent approval', async t => {
  const data = remotePackageFixture();
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const staged = stage(setup.store, data);
  const authority = grantAdmissionAuthority(setup.store, staged, {
    requestDigest: 'f'.repeat(64)
  });

  assert.throws(
    () => setup.store.admitRemoteSocialStage({
      owner: staged.owner,
      stageId: staged.stage_id,
      intentId: authority.intentId,
      approvalId: authority.approvalId,
      traceId: 'trace-remote-admit-reject',
      now: Date.now()
    }),
    error => error?.code === 'remote_social_admission_intent_unavailable'
  );
  assert.equal(setup.store.db.prepare(`
    SELECT status FROM approvals WHERE approval_id = ?
  `).get(authority.approvalId).status, 'active');
  assert.equal(setup.store.db.prepare('SELECT COUNT(*) AS count FROM remote_social_admissions').get().count, 0);
});

test('failed admission materialization rolls back approval consumption in the same event transaction', async t => {
  const data = remotePackageFixture();
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const staged = stage(setup.store, data);
  const authority = grantAdmissionAuthority(setup.store, staged);
  const correct = authority.request;
  const fakeAdmissionId = `remote_admission_${'a'.repeat(64)}`;

  assert.throws(
    () => setup.store.appendEvents({
      traceId: 'trace-remote-admit-atomic-negative',
      actor: staged.owner,
      events: [
        {
          kind: 'approval.consumed',
          subject: authority.approvalId,
          payload: {
            approval_id: authority.approvalId,
            intent_id: authority.intentId
          }
        },
        {
          kind: REMOTE_SOCIAL_ADMISSION_EVENT,
          subject: fakeAdmissionId,
          payload: {
            schema: REMOTE_SOCIAL_ADMISSION_SCHEMA,
            admission_id: fakeAdmissionId,
            owner: staged.owner,
            stage_id: staged.stage_id,
            package_digest: 'f'.repeat(64),
            exporter_grid_id: staged.exporter_grid_id,
            exporter_key_id: staged.exporter_key_id,
            intent_id: authority.intentId,
            approval_id: authority.approvalId,
            request_digest: authority.request.request_digest ?? setup.store.getRemoteSocialAdmissionRequest(staged.owner, staged.stage_id).request_digest,
            import_plan_digest: staged.import_plan_json.plan_digest,
            trust_label: staged.trust_label,
            admitted_objects: correct.request.admitted_objects,
            remote_observation_only: true,
            local_authorship_claimed: false,
            network_effect: 'none',
            authority_effect: 'none'
          }
        }
      ]
    }),
    /does not match the staged review package/
  );

  const approval = setup.store.db.prepare(`
    SELECT status, consumed_by_intent FROM approvals WHERE approval_id = ?
  `).get(authority.approvalId);
  assert.equal(approval.status, 'active');
  assert.equal(approval.consumed_by_intent, null);
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count FROM events WHERE kind IN ('approval.consumed', ?)
  `).get(REMOTE_SOCIAL_ADMISSION_EVENT).count, 0);
});

test('successful admission is idempotent for the same stage and authority but rejects conflicting authority', async t => {
  const data = remotePackageFixture();
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const staged = stage(setup.store, data);
  const authority = grantAdmissionAuthority(setup.store, staged);
  const first = setup.store.admitRemoteSocialStage({
    owner: staged.owner,
    stageId: staged.stage_id,
    intentId: authority.intentId,
    approvalId: authority.approvalId,
    traceId: 'trace-remote-admit-idempotent-1'
  });
  const replay = setup.store.admitRemoteSocialStage({
    owner: staged.owner,
    stageId: staged.stage_id,
    intentId: authority.intentId,
    approvalId: authority.approvalId,
    traceId: 'trace-remote-admit-idempotent-2'
  });
  assert.equal(replay.admission_id, first.admission_id);
  assert.equal(setup.store.db.prepare('SELECT COUNT(*) AS count FROM remote_social_admissions').get().count, 1);

  assert.throws(
    () => setup.store.admitRemoteSocialStage({
      owner: staged.owner,
      stageId: staged.stage_id,
      intentId: 'intent-conflicting-authority',
      approvalId: authority.approvalId,
      traceId: 'trace-remote-admit-conflict'
    }),
    error => error?.code === 'remote_social_admission_conflict'
  );
});

test('admission and encrypted remote observations rebuild from Grid evidence after restart', async t => {
  const data = remotePackageFixture();
  const setup = await storeFixture();
  const staged = stage(setup.store, data);
  const authority = grantAdmissionAuthority(setup.store, staged);
  const admission = setup.store.admitRemoteSocialStage({
    owner: staged.owner,
    stageId: staged.stage_id,
    intentId: authority.intentId,
    approvalId: authority.approvalId,
    traceId: 'trace-remote-admit-restart'
  });

  const rawAdmission = setup.store.db.prepare(`
    SELECT summary_json FROM remote_social_admissions WHERE admission_id = ?
  `).get(admission.admission_id).summary_json;
  const rawObservation = setup.store.db.prepare(`
    SELECT object_json FROM remote_social_observations
    WHERE object_kind = 'publication' LIMIT 1
  `).get().object_json;
  assert.equal(setup.protector.isProtected(rawAdmission), true);
  assert.equal(setup.protector.isProtected(rawObservation), true);
  assert.equal(rawObservation.includes('Remote observation'), false);

  setup.store.close();
  setup.store = new RemoteSocialAdmissionGridStore({
    path: setup.path,
    dataDir: setup.dataDir,
    identity: setup.identity,
    protector: new DataProtector(setup.key)
  });
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const restored = setup.store.getRemoteSocialAdmission(staged.owner, admission.admission_id);
  assert.equal(restored.approval_id, authority.approvalId);
  assert.equal(restored.summary_json.remote_observation_only, true);
  assert.equal(setup.store.listRemoteSocialObservations(staged.owner).observations.length, 2);
  assert.equal(setup.store.listSocialCorpus(staged.owner).publications.length, 0);
  const approval = setup.store.db.prepare(`
    SELECT status, consumed_by_intent FROM approvals WHERE approval_id = ?
  `).get(authority.approvalId);
  assert.equal(approval.status, 'consumed');
  assert.equal(approval.consumed_by_intent, authority.intentId);
});

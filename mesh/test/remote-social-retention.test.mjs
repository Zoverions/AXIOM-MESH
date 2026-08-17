import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection
} from '../src/lib/social-publication.mjs';
import { createSocialExchangePackage } from '../src/lib/social-exchange-package.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_ACTION
} from '../src/grid/remote-social-admission-store.mjs';
import { RemoteSocialFollowingGridStore } from '../src/grid/remote-social-following-store.mjs';
import {
  REMOTE_SOCIAL_STAGE_EXPIRED_EVENT,
  REMOTE_SOCIAL_RETENTION_POLICY_SCHEMA,
  RemoteSocialRetentionGridStore,
  normalizeRemoteSocialRetentionPolicy
} from '../src/grid/remote-social-retention-store.mjs';

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

function remotePackageFixture({ suffix = 'retention-one' } = {}) {
  const exporter = exporterKeys();
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: `persona-${suffix}`,
    controller_actor_id: `actor-private-${suffix}`,
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
    publication_id: `publication-${suffix}`,
    content: {
      media_type: 'text/plain',
      text: `Remote retention fixture ${suffix}.`
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
    exporterGridId: `grid-${suffix}`,
    exporterPrivateKey: exporter.privateKey,
    exporterPublicKey: exporter.publicKey,
    createdAt: iso(-180_000),
    now: Date.now()
  });
  return { exporter, persona, publicPersona, publication, packageValue };
}

async function storeFixture(StoreClass = RemoteSocialRetentionGridStore) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-remote-social-retention-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(randomBytes(32));
  const path = join(dataDir, 'grid.sqlite');
  const store = new StoreClass({ path, dataDir, identity, protector });
  return { root, dataDir, identity, protector, path, store };
}

function stage(store, data, {
  owner = 'principal-retention-owner',
  stagedAt = iso(-60_000),
  expiresAt = iso(1_800_000),
  now = Date.now(),
  retentionPolicy
} = {}) {
  return store.stageRemoteSocialPackage({
    owner,
    package: data.packageValue,
    trustedExporterPublicKey: data.exporter.publicKey,
    expectedExporterGridId: data.packageValue.statement.exporter.grid_id,
    trustLabel: 'manual-review',
    stagedAt,
    expiresAt,
    now,
    retentionPolicy
  });
}

function grantAdmissionAuthority(store, staged, {
  intentId = 'intent-retention-admit-1',
  approvalId = 'approval-retention-admit-1',
  approver = 'principal-independent-retention-reviewer'
} = {}) {
  const request = store.getRemoteSocialAdmissionRequest(staged.owner, staged.stage_id);
  store.appendEvents({
    traceId: `trace-${intentId}`,
    actor: staged.owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: staged.owner,
        action: REMOTE_SOCIAL_ADMISSION_ACTION,
        risk: 'high',
        input_digest: digestObject({ stage_id: staged.stage_id }),
        request_digest: request.request_digest
      }
    }]
  });
  store.appendEvents({
    traceId: `trace-${approvalId}`,
    actor: approver,
    events: [{
      kind: 'approval.granted',
      subject: approvalId,
      payload: {
        approval_id: approvalId,
        approver,
        requester: staged.owner,
        action: REMOTE_SOCIAL_ADMISSION_ACTION,
        request_digest: request.request_digest,
        expires_at: iso(2_400_000)
      }
    }]
  });
  return { intentId, approvalId };
}

test('following laboratory remains retention-schema-free until the explicit G2 subclass is selected', async t => {
  const setup = await storeFixture(RemoteSocialFollowingGridStore);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  assert.equal(setup.store.db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'remote_social_retention_receipts'
  `).get(), undefined);
  assert.equal(typeof setup.store.expireUnadmittedRemoteSocialStage, 'undefined');
  assert.equal(typeof setup.store.getRemoteSocialRetentionAssessment, 'undefined');
});

test('retention laboratory initializes after S3C/D/E with a separate receipt schema', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const status = setup.store.getStatus();
  assert.equal(status.remote_social_schema_version, 1);
  assert.equal(status.remote_social_admission_schema_version, 1);
  assert.equal(status.remote_social_following_schema_version, 1);
  assert.equal(status.remote_social_retention_schema_version, 1);
  assert.equal(status.remote_social_retention_runtime, 'operator-driven-quota-laboratory');
});

test('retention policy is explicit, bounded, and rejects unsupported expansion', () => {
  const policy = normalizeRemoteSocialRetentionPolicy({ max_stages: 12 });
  assert.equal(policy.schema, REMOTE_SOCIAL_RETENTION_POLICY_SCHEMA);
  assert.equal(policy.max_stages, 12);
  assert.ok(policy.max_stage_protected_bytes >= 1_048_576);
  assert.throws(
    () => normalizeRemoteSocialRetentionPolicy({ automatic_cleanup: true }),
    /unsupported field/
  );
  assert.throws(
    () => normalizeRemoteSocialRetentionPolicy({ max_stages: 0 }),
    /between 1 and 1024/
  );
});

test('new staging fails before insertion when owner stage-count quota would be exceeded', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const first = remotePackageFixture({ suffix: 'quota-stage-one' });
  const second = remotePackageFixture({ suffix: 'quota-stage-two' });
  const policy = { max_stages: 1 };
  stage(setup.store, first, { retentionPolicy: policy });
  assert.throws(
    () => stage(setup.store, second, { retentionPolicy: policy }),
    error => error?.code === 'remote_social_stage_count_quota_exceeded'
  );
  assert.equal(setup.store.listRemoteSocialStages('principal-retention-owner').stages.length, 1);
});

test('observation quota fails before one-use approval consumption or admission event', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const data = remotePackageFixture({ suffix: 'quota-observation' });
  const staged = stage(setup.store, data);
  const authority = grantAdmissionAuthority(setup.store, staged, {
    intentId: 'intent-retention-quota-admit',
    approvalId: 'approval-retention-quota-admit'
  });
  assert.throws(
    () => setup.store.admitRemoteSocialStage({
      owner: staged.owner,
      stageId: staged.stage_id,
      intentId: authority.intentId,
      approvalId: authority.approvalId,
      traceId: 'trace-retention-quota-admit',
      retentionPolicy: { max_observations: 1 },
      now: Date.now()
    }),
    error => error?.code === 'remote_social_observation_count_quota_exceeded'
  );
  assert.equal(setup.store.db.prepare(`
    SELECT status FROM approvals WHERE approval_id = ?
  `).get(authority.approvalId).status, 'active');
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count FROM remote_social_admissions
  `).get().count, 0);
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count FROM remote_social_observations
  `).get().count, 0);
});

test('expiry alone never deletes an unadmitted stage; explicit cleanup appends evidence and reclaims payload atomically', async t => {
  const setup = await storeFixture();
  let current = setup.store;
  t.after(async () => {
    try { current.close(); } catch {}
    await rm(setup.root, { recursive: true, force: true });
  });
  const data = remotePackageFixture({ suffix: 'expired-unadmitted' });
  const now = Date.now();
  const expiresAt = new Date(now + 1_000).toISOString();
  const staged = stage(current, data, {
    stagedAt: new Date(now).toISOString(),
    expiresAt,
    now
  });

  const later = now + 2_000;
  assert.equal(current.getRemoteSocialStage(staged.owner, staged.stage_id).stage_id, staged.stage_id);
  const candidates = current.listExpiredUnadmittedRemoteSocialStages(staged.owner, {
    now: later
  });
  assert.equal(candidates.stages.length, 1);
  assert.equal(candidates.stages[0].eligible_for_payload_reclamation, true);

  const receipt = current.expireUnadmittedRemoteSocialStage({
    owner: staged.owner,
    stageId: staged.stage_id,
    traceId: 'trace-retention-expire-stage',
    now: later
  });
  assert.equal(receipt.action, 'expire-unadmitted-stage');
  assert.equal(receipt.stage_id, staged.stage_id);
  assert.equal(receipt.package_digest, staged.package_digest);
  assert.equal(receipt.payload_deleted, true);
  assert.equal(receipt.admission_evidence_deleted, false);
  assert.ok(receipt.logical_bytes_reclaimed > 0);
  assert.ok(receipt.protected_bytes_reclaimed > receipt.logical_bytes_reclaimed);
  assert.throws(
    () => current.getRemoteSocialStage(staged.owner, staged.stage_id),
    error => error?.code === 'remote_social_stage_not_found'
  );
  const event = current.db.prepare(`
    SELECT kind, subject FROM events WHERE kind = ? ORDER BY seq DESC LIMIT 1
  `).get(REMOTE_SOCIAL_STAGE_EXPIRED_EVENT);
  assert.equal(event.kind, REMOTE_SOCIAL_STAGE_EXPIRED_EVENT);
  assert.equal(event.subject, receipt.receipt_id);

  current.close();
  current = new RemoteSocialRetentionGridStore({
    path: setup.path,
    dataDir: setup.dataDir,
    identity: setup.identity,
    protector: setup.protector
  });
  const rebuilt = current.getRemoteSocialRetentionReceipt(staged.owner, receipt.receipt_id);
  assert.equal(rebuilt.stage_id, staged.stage_id);
  assert.equal(current.listRemoteSocialRetentionReceipts(staged.owner).receipts.length, 1);
  assert.throws(
    () => current.getRemoteSocialStage(staged.owner, staged.stage_id),
    error => error?.code === 'remote_social_stage_not_found'
  );
});

test('admitted stage remains a replay dependency and cannot be reclaimed after review expiry', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const data = remotePackageFixture({ suffix: 'admitted-replay-dependency' });
  const now = Date.now();
  const staged = stage(setup.store, data, {
    stagedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 2_000).toISOString(),
    now
  });
  const authority = grantAdmissionAuthority(setup.store, staged, {
    intentId: 'intent-retention-admitted-stage',
    approvalId: 'approval-retention-admitted-stage'
  });
  const admission = setup.store.admitRemoteSocialStage({
    owner: staged.owner,
    stageId: staged.stage_id,
    intentId: authority.intentId,
    approvalId: authority.approvalId,
    traceId: 'trace-retention-admitted-stage',
    now: now + 1_000
  });
  assert.equal(admission.status, 'admitted');

  assert.throws(
    () => setup.store.expireUnadmittedRemoteSocialStage({
      owner: staged.owner,
      stageId: staged.stage_id,
      traceId: 'trace-retention-forbidden-cleanup',
      now: now + 3_000
    }),
    error => error?.code === 'remote_social_stage_is_admission_dependency'
  );
  assert.equal(setup.store.getRemoteSocialStage(staged.owner, staged.stage_id).stage_id, staged.stage_id);
  assert.equal(setup.store.listRemoteSocialRetentionReceipts(staged.owner).receipts.length, 0);
});

test('retention assessment reports owner-scoped storage without exposing payload contents', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const data = remotePackageFixture({ suffix: 'assessment' });
  stage(setup.store, data);
  const result = setup.store.getRemoteSocialRetentionAssessment('principal-retention-owner');
  assert.equal(result.stage_count, 1);
  assert.ok(result.stage_protected_bytes > 0);
  assert.equal(result.admission_count, 0);
  assert.equal(result.observation_count, 0);
  assert.equal(result.within_policy, true);
  assert.equal(result.network_effect, 'none');
  assert.equal(result.authority_effect, 'none');
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('Remote retention fixture assessment'), false);
  assert.equal(serialized.includes('BEGIN PUBLIC KEY'), false);
});

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
import { REMOTE_SOCIAL_ADMISSION_ACTION } from '../src/grid/remote-social-admission-store.mjs';
import { RemoteSocialRetentionGridStore } from '../src/grid/remote-social-retention-store.mjs';
import {
  REMOTE_SOCIAL_PREFERENCE_SET_EVENT,
  RemoteSocialAbuseGridStore,
  normalizeRemoteSocialSourceOrigin
} from '../src/grid/remote-social-abuse-store.mjs';

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

function sourceFixture(suffix) {
  const exporter = exporterKeys();
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: `persona-abuse-${suffix}`,
    controller_actor_id: `actor-private-abuse-${suffix}`,
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: iso(-600_000),
    status: 'active'
  };
  const publicPersona = createPublicPersonaProjection(persona);
  const publication = createSocialPublicationProjection({
    publication_id: `publication-abuse-${suffix}`,
    content: {
      media_type: 'text/plain',
      text: `${suffix} remote safety fixture`
    },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: iso(-480_000),
    supersedes_digest: null
  }, { persona });
  const packageValue = createSocialExchangePackage({
    personas: [publicPersona],
    publications: [publication],
    transitions: [],
    exporterGridId: `grid-abuse-${suffix}`,
    exporterPrivateKey: exporter.privateKey,
    exporterPublicKey: exporter.publicKey,
    createdAt: iso(-240_000),
    now: Date.now()
  });
  return { exporter, persona, publicPersona, publication, packageValue };
}

async function storeFixture(StoreClass = RemoteSocialAbuseGridStore, existing = null) {
  const root = existing?.root ?? await mkdtemp(join(tmpdir(), 'axiom-remote-social-abuse-'));
  const dataDir = existing?.dataDir ?? join(root, 'data');
  const identity = existing?.identity ?? await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = existing?.protector ?? new DataProtector(randomBytes(32));
  const path = existing?.path ?? join(dataDir, 'grid.sqlite');
  const store = new StoreClass({ path, dataDir, identity, protector });
  return { root, dataDir, identity, protector, path, store };
}

function stageSource(store, data, owner, index) {
  const staged = store.stageRemoteSocialPackage({
    owner,
    package: data.packageValue,
    trustedExporterPublicKey: data.exporter.publicKey,
    expectedExporterGridId: data.packageValue.statement.exporter.grid_id,
    trustLabel: 'manual-review',
    stagedAt: iso(-180_000 + index),
    expiresAt: iso(1_800_000),
    now: Date.now()
  });
  const request = store.getRemoteSocialAdmissionRequest(owner, staged.stage_id);
  const intentId = `intent-abuse-admit-${index}`;
  const approvalId = `approval-abuse-admit-${index}`;
  const approver = `principal-abuse-reviewer-${index}`;
  store.appendEvents({
    traceId: `trace-abuse-intent-${index}`,
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
        request_digest: request.request_digest
      }
    }]
  });
  store.appendEvents({
    traceId: `trace-abuse-approval-${index}`,
    actor: approver,
    events: [{
      kind: 'approval.granted',
      subject: approvalId,
      payload: {
        approval_id: approvalId,
        approver,
        requester: owner,
        action: REMOTE_SOCIAL_ADMISSION_ACTION,
        request_digest: request.request_digest,
        expires_at: iso(2_400_000)
      }
    }]
  });
  store.admitRemoteSocialStage({
    owner,
    stageId: staged.stage_id,
    intentId,
    approvalId,
    traceId: `trace-abuse-admit-${index}`
  });
  return staged;
}

function observation(store, owner, kind, digest) {
  return store.listRemoteSocialObservations(owner, { kind }).observations
    .find(item => item.object_digest === digest);
}

function follow(store, owner, personaObservation, suffix) {
  return store.followRemotePersona({
    owner,
    personaObservationId: personaObservation.observation_id,
    trustLabel: 'recognized-exporter',
    traceId: `trace-abuse-follow-${suffix}`
  });
}

test('retention layer does not opt into G6 schema or methods', async t => {
  const setup = await storeFixture(RemoteSocialRetentionGridStore);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  for (const table of [
    'remote_social_abuse_preferences',
    'remote_social_reports',
    'remote_social_quarantines'
  ]) {
    assert.equal(setup.store.db.prepare(`
      SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
    `).get(table), undefined);
  }
  assert.equal(typeof setup.store.muteRemotePersona, 'undefined');
  assert.equal(typeof setup.store.reportRemoteObservation, 'undefined');
  assert.equal(typeof setup.store.quarantineRemoteSource, 'undefined');
});

test('G6 adds only owner-private abuse-control schema above retention', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const status = setup.store.getStatus();
  assert.equal(status.remote_social_retention_schema_version, 1);
  assert.equal(status.remote_social_abuse_schema_version, 1);
  assert.equal(status.remote_social_abuse_runtime, 'owner-private-safety-controls-laboratory');
  assert.equal(setup.store.db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'remote_social_transport_jobs'
  `).get(), undefined);
});

test('mute and block suppress only local Following while preserving follow and observation evidence', async t => {
  const owner = 'principal-abuse-owner';
  const source = sourceFixture('alpha');
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  stageSource(setup.store, source, owner, 1);
  const persona = observation(setup.store, owner, 'persona', source.publicPersona.projection_digest);
  const activeFollow = follow(setup.store, owner, persona, 'alpha');
  assert.equal(setup.store.getChronologicalFollowing(owner).items.length, 1);

  const mute = setup.store.muteRemotePersona({
    owner,
    personaObservationId: persona.observation_id,
    reasonCode: 'owner-choice',
    note: 'quiet for now',
    traceId: 'trace-abuse-mute-alpha'
  });
  assert.equal(mute.action, 'mute');
  assert.equal(mute.status, 'active');
  assert.equal(setup.store.getChronologicalFollowing(owner).items.length, 0);
  assert.equal(setup.store.getRemoteSocialFollow(owner, activeFollow.follow_id).status, 'following');
  assert.equal(setup.store.listRemoteSocialObservations(owner).observations.length >= 2, true);

  setup.store.unmuteRemotePersona({
    owner,
    personaObservationId: persona.observation_id,
    traceId: 'trace-abuse-unmute-alpha'
  });
  assert.equal(setup.store.getChronologicalFollowing(owner).items.length, 1);

  setup.store.blockRemotePersona({
    owner,
    personaObservationId: persona.observation_id,
    reasonCode: 'harassment',
    traceId: 'trace-abuse-block-alpha'
  });
  assert.equal(setup.store.getChronologicalFollowing(owner).items.length, 0);
  assert.equal(setup.store.getRemoteSocialFollow(owner, activeFollow.follow_id).status, 'following');
  assert.throws(
    () => follow(setup.store, owner, persona, 'alpha-blocked'),
    error => error?.code === 'remote_social_persona_blocked'
  );

  setup.store.unblockRemotePersona({
    owner,
    personaObservationId: persona.observation_id,
    traceId: 'trace-abuse-unblock-alpha'
  });
  assert.equal(setup.store.getChronologicalFollowing(owner).items.length, 1);
});

test('exporter quarantine is owner-local, suppresses matching Following and blocks new follow', async t => {
  const owner = 'principal-abuse-owner';
  const alpha = sourceFixture('alpha');
  const beta = sourceFixture('beta');
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  stageSource(setup.store, alpha, owner, 11);
  stageSource(setup.store, beta, owner, 12);
  const alphaPersona = observation(setup.store, owner, 'persona', alpha.publicPersona.projection_digest);
  const betaPersona = observation(setup.store, owner, 'persona', beta.publicPersona.projection_digest);
  const alphaFollow = follow(setup.store, owner, alphaPersona, 'alpha');
  follow(setup.store, owner, betaPersona, 'beta');
  assert.equal(setup.store.getChronologicalFollowing(owner).items.length, 2);

  const quarantine = setup.store.quarantineRemoteExporter({
    owner,
    exporterKeyId: alpha.packageValue.statement.exporter.key_id,
    reasonCode: 'key-compromise',
    note: 'local review only',
    traceId: 'trace-abuse-quarantine-alpha'
  });
  assert.equal(quarantine.status, 'active');
  assert.equal(quarantine.owner_local_only, true);
  const following = setup.store.getChronologicalFollowing(owner);
  assert.equal(following.items.length, 1);
  assert.equal(following.items[0].exporter_key_id, beta.packageValue.statement.exporter.key_id);

  setup.store.unfollowRemotePersona({
    owner,
    followId: alphaFollow.follow_id,
    traceId: 'trace-abuse-unfollow-alpha'
  });
  assert.throws(
    () => follow(setup.store, owner, alphaPersona, 'alpha-quarantined'),
    error => error?.code === 'remote_social_exporter_quarantined'
  );
  assert.throws(
    () => setup.store.quarantineRemoteExporter({
      owner: 'principal-other',
      exporterKeyId: alpha.packageValue.statement.exporter.key_id,
      reasonCode: 'operator-review',
      traceId: 'trace-abuse-other-quarantine'
    }),
    error => error?.code === 'remote_social_exporter_not_found'
  );

  setup.store.releaseRemoteExporterQuarantine({
    owner,
    exporterKeyId: alpha.packageValue.statement.exporter.key_id,
    traceId: 'trace-abuse-release-alpha'
  });
  assert.equal(follow(setup.store, owner, alphaPersona, 'alpha-restored').status, 'following');
});

test('reports are private append-only owner assertions and do not change visibility', async t => {
  const owner = 'principal-abuse-owner';
  const source = sourceFixture('report');
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  stageSource(setup.store, source, owner, 21);
  const persona = observation(setup.store, owner, 'persona', source.publicPersona.projection_digest);
  const publication = observation(setup.store, owner, 'publication', source.publication.projection_digest);
  follow(setup.store, owner, persona, 'report');

  const first = setup.store.reportRemoteObservation({
    owner,
    observationId: publication.observation_id,
    reasonCode: 'spam',
    note: 'private observation, not adjudication',
    traceId: 'trace-abuse-report'
  });
  const replay = setup.store.reportRemoteObservation({
    owner,
    observationId: publication.observation_id,
    reasonCode: 'spam',
    note: 'private observation, not adjudication',
    traceId: 'trace-abuse-report-replay'
  });
  assert.equal(first.report_id, replay.report_id);
  assert.equal(first.owner_assertion_only, true);
  assert.equal(first.adjudicated, false);
  assert.equal(first.adjudication_effect, 'none');
  assert.equal(first.report_json.content_truth_claimed, false);
  assert.equal(first.report_json.visibility_effect, 'none');
  assert.equal(setup.store.listRemoteSocialReports(owner).reports.length, 1);
  assert.equal(setup.store.getChronologicalFollowing(owner).items.length, 1);

  assert.throws(
    () => setup.store.reportRemoteObservation({
      owner: 'principal-other',
      observationId: publication.observation_id,
      reasonCode: 'spam',
      traceId: 'trace-abuse-report-other'
    }),
    error => error?.code === 'remote_social_report_target_not_found'
  );
});

test('source quarantine canonicalizes an exact HTTPS origin without adding transport authority', async t => {
  const owner = 'principal-abuse-owner';
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  assert.equal(
    normalizeRemoteSocialSourceOrigin('https://EXAMPLE.com:443'),
    'https://example.com'
  );
  for (const invalid of [
    'http://example.com',
    'https://user@example.com',
    'https://example.com/path',
    'https://example.com/?query=1',
    'https://example.com/#fragment',
    'not-a-url'
  ]) {
    assert.throws(
      () => normalizeRemoteSocialSourceOrigin(invalid),
      /HTTPS origin|exact HTTPS origin/
    );
  }

  const quarantine = setup.store.quarantineRemoteSource({
    owner,
    sourceOrigin: 'https://EXAMPLE.com:443',
    reasonCode: 'suspicious-source',
    note: 'future relay must consult this local digest',
    traceId: 'trace-abuse-source-quarantine'
  });
  assert.equal(quarantine.target_kind, 'source');
  assert.equal(quarantine.detail_json.source_origin, 'https://example.com');
  assert.equal(quarantine.network_effect, 'none');
  assert.equal(quarantine.authority_effect, 'none');
  assert.equal(typeof setup.store.queueRemoteSocialTransportJob, 'undefined');
  assert.equal(typeof setup.store.processRemoteSocialTransportJob, 'undefined');
  assert.equal(setup.store.db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'remote_social_transport_jobs'
  `).get(), undefined);

  setup.store.releaseRemoteSourceQuarantine({
    owner,
    sourceOrigin: 'https://example.com/',
    traceId: 'trace-abuse-source-release'
  });
  assert.equal(
    setup.store.getRemoteSocialQuarantine(owner, quarantine.quarantine_id).status,
    'released'
  );
});

test('abuse-control state rebuilds from Grid events after restart', async t => {
  const owner = 'principal-abuse-owner';
  const source = sourceFixture('restart');
  const setup = await storeFixture();
  t.after(async () => {
    setup.store?.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  stageSource(setup.store, source, owner, 31);
  const persona = observation(setup.store, owner, 'persona', source.publicPersona.projection_digest);
  const publication = observation(setup.store, owner, 'publication', source.publication.projection_digest);
  follow(setup.store, owner, persona, 'restart');
  setup.store.muteRemotePersona({
    owner,
    personaObservationId: persona.observation_id,
    reasonCode: 'owner-choice',
    traceId: 'trace-abuse-restart-mute'
  });
  setup.store.reportRemoteObservation({
    owner,
    observationId: publication.observation_id,
    reasonCode: 'other',
    note: 'persist me',
    traceId: 'trace-abuse-restart-report'
  });
  setup.store.quarantineRemoteExporter({
    owner,
    exporterKeyId: source.packageValue.statement.exporter.key_id,
    reasonCode: 'operator-review',
    traceId: 'trace-abuse-restart-quarantine'
  });
  setup.store.close();
  setup.store = null;

  const reopened = await storeFixture(RemoteSocialAbuseGridStore, setup);
  setup.store = reopened.store;
  assert.equal(reopened.store.listRemoteSocialAbusePreferences(owner).preferences.length, 1);
  assert.equal(reopened.store.listRemoteSocialReports(owner).reports.length, 1);
  assert.equal(reopened.store.listRemoteSocialQuarantines(owner).quarantines.length, 1);
  assert.equal(reopened.store.getChronologicalFollowing(owner).items.length, 0);
});

test('tampered or cross-owner abuse events fail closed before durable append', async t => {
  const owner = 'principal-abuse-owner';
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const before = setup.store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count;
  assert.throws(
    () => setup.store.appendEvents({
      traceId: 'trace-abuse-tampered',
      actor: owner,
      events: [{
        kind: REMOTE_SOCIAL_PREFERENCE_SET_EVENT,
        subject: `remote_abuse_${'a'.repeat(64)}`,
        payload: {
          schema: 'axiom-remote-social-abuse-preference.v1',
          preference_id: `remote_abuse_${'a'.repeat(64)}`,
          owner: 'principal-other',
          action: 'mute',
          exporter_key_id: 'b'.repeat(64),
          persona_projection_digest: 'c'.repeat(64),
          persona_observation_id: 'observation-tampered',
          detail: {
            reason_code: 'owner-choice',
            note: null,
            private_local_record: true,
            content_truth_claimed: false,
            legal_identity_claimed: false,
            personal_authorship_claimed: false
          },
          network_effect: 'none',
          authority_effect: 'none',
          recommendation_effect: 'none'
        }
      }]
    }),
    /authority or effect boundary is invalid/
  );
  const after = setup.store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count;
  assert.equal(after, before);
});
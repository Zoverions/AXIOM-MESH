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
  createSocialPublicationProjection,
  createSocialPublicationRetraction,
  createSupersedingSocialPublication
} from '../src/lib/social-publication.mjs';
import { createSocialExchangePackage } from '../src/lib/social-exchange-package.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_ACTION,
  RemoteSocialAdmissionGridStore
} from '../src/grid/remote-social-admission-store.mjs';
import {
  REMOTE_SOCIAL_FOLLOWED_EVENT,
  REMOTE_SOCIAL_FOLLOW_SCHEMA,
  RemoteSocialFollowingGridStore
} from '../src/grid/remote-social-following-store.mjs';

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

function sourceFixture({ suffix, revised = false }) {
  const exporter = exporterKeys();
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: `persona-follow-${suffix}`,
    controller_actor_id: `actor-private-follow-${suffix}`,
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: iso(-600_000),
    status: 'active'
  };
  const publicPersona = createPublicPersonaProjection(persona);
  const original = createSocialPublicationProjection({
    publication_id: `publication-follow-${suffix}-1`,
    content: {
      media_type: 'text/plain',
      text: `${suffix} original remote observation`
    },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: iso(-480_000),
    supersedes_digest: null
  }, { persona });
  const publications = [original];
  const transitions = [];
  let active = original;
  if (revised) {
    active = createSupersedingSocialPublication(original, {
      publication_id: `publication-follow-${suffix}-2`,
      content: {
        media_type: 'text/plain',
        text: `${suffix} revised remote observation`
      },
      attachment_digests: [],
      audience: { mode: 'public' },
      discoverability: 'listed',
      authorship_mode: 'human-authored',
      created_at: iso(-360_000)
    }, { persona });
    publications.push(active);
    transitions.push(createSocialPublicationRetraction(original, {
      reason_code: 'author-retracted',
      occurred_at: iso(-300_000)
    }));
  }
  const packageValue = createSocialExchangePackage({
    personas: [publicPersona],
    publications,
    transitions,
    exporterGridId: `grid-follow-${suffix}`,
    exporterPrivateKey: exporter.privateKey,
    exporterPublicKey: exporter.publicKey,
    createdAt: iso(-240_000),
    now: Date.now()
  });
  return { exporter, persona, publicPersona, original, active, packageValue };
}

async function storeFixture(StoreClass = RemoteSocialFollowingGridStore) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-remote-social-following-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const key = randomBytes(32);
  const protector = new DataProtector(key);
  const path = join(dataDir, 'grid.sqlite');
  const store = new StoreClass({ path, dataDir, identity, protector });
  return { root, dataDir, identity, key, protector, path, store };
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
  const intentId = `intent-follow-admit-${index}`;
  const approvalId = `approval-follow-admit-${index}`;
  const approver = `principal-follow-reviewer-${index}`;
  store.appendEvents({
    traceId: `trace-follow-intent-${index}`,
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
    traceId: `trace-follow-approval-${index}`,
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
    traceId: `trace-follow-admit-${index}`
  });
  return staged;
}

function personaObservation(store, owner, personaDigest) {
  return store.listRemoteSocialObservations(owner, { kind: 'persona' })
    .observations.find(item => item.object_digest === personaDigest);
}

test('admission-only store does not opt into following schema or methods', async t => {
  const setup = await storeFixture(RemoteSocialAdmissionGridStore);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  assert.equal(setup.store.getStatus().remote_social_admission_schema_version, 1);
  assert.equal(setup.store.db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'remote_social_follows'
  `).get(), undefined);
  assert.equal(typeof setup.store.followRemotePersona, 'undefined');
  assert.equal(typeof setup.store.getChronologicalFollowing, 'undefined');
});

test('following laboratory adds a separate private local preference schema', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const status = setup.store.getStatus();
  assert.equal(status.remote_social_admission_schema_version, 1);
  assert.equal(status.remote_social_following_schema_version, 1);
  assert.equal(status.remote_social_following_runtime, 'private-chronological-projection-laboratory');
});

test('owner can follow only an admitted persona observation and trust remains narrowly scoped', async t => {
  const owner = 'principal-follow-owner';
  const source = sourceFixture({ suffix: 'alpha' });
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  stageSource(setup.store, source, owner, 1);
  const persona = personaObservation(setup.store, owner, source.publicPersona.projection_digest);
  const publication = setup.store.listRemoteSocialObservations(owner, { kind: 'publication' }).observations[0];

  const follow = setup.store.followRemotePersona({
    owner,
    personaObservationId: persona.observation_id,
    trustLabel: 'recognized-exporter',
    traceId: 'trace-follow-alpha'
  });
  assert.equal(follow.status, 'following');
  assert.equal(follow.private_local_preference, true);
  assert.deepEqual(follow.trust_json, {
    owner_trust_label: 'recognized-exporter',
    trust_scope: 'exporter-attestation-only',
    content_truth_claimed: false,
    legal_identity_claimed: false,
    actor_authorship_claimed: false
  });
  assert.equal(follow.network_effect, 'none');
  assert.equal(follow.recommendation_effect, 'none');

  assert.throws(
    () => setup.store.followRemotePersona({
      owner,
      personaObservationId: publication.observation_id,
      trustLabel: 'recognized-exporter',
      traceId: 'trace-follow-publication-rejected'
    }),
    error => error?.code === 'remote_social_persona_observation_not_found'
  );
  assert.throws(
    () => setup.store.followRemotePersona({
      owner: 'principal-other',
      personaObservationId: persona.observation_id,
      trustLabel: 'recognized-exporter',
      traceId: 'trace-follow-other-rejected'
    }),
    error => error?.code === 'remote_social_persona_observation_not_found'
  );
});

test('Following is chronological over active publications from followed admitted personas only', async t => {
  const owner = 'principal-follow-owner';
  const alpha = sourceFixture({ suffix: 'alpha', revised: true });
  const beta = sourceFixture({ suffix: 'beta', revised: false });
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  stageSource(setup.store, alpha, owner, 1);
  stageSource(setup.store, beta, owner, 2);
  const alphaPersona = personaObservation(setup.store, owner, alpha.publicPersona.projection_digest);
  setup.store.followRemotePersona({
    owner,
    personaObservationId: alphaPersona.observation_id,
    trustLabel: 'manual-review',
    traceId: 'trace-follow-alpha-only'
  });

  const following = setup.store.getChronologicalFollowing(owner);
  assert.equal(following.ordering, 'chronological-desc');
  assert.equal(following.ranking_effect, 'none');
  assert.equal(following.recommendation_effect, 'none');
  assert.equal(following.transport_effect, 'none');
  assert.equal(following.network_effect, 'none');
  assert.equal(following.remote_observation_only, true);
  assert.equal(following.items.length, 1);
  assert.equal(following.items[0].publication.projection_digest, alpha.active.projection_digest);
  assert.equal(following.items[0].publication.content.text, 'alpha revised remote observation');
  assert.equal(following.items[0].persona.projection_digest, alpha.publicPersona.projection_digest);
  assert.equal(following.items[0].source_trust.owner_trust_label, 'manual-review');
  assert.equal(JSON.stringify(following).includes('beta original remote observation'), false);
  assert.equal(JSON.stringify(following).includes('alpha original remote observation'), false);
  assert.equal(setup.store.listSocialCorpus(owner).publications.length, 0);
});

test('Following sorts active followed publications by publication timestamp without recommendation ranking', async t => {
  const owner = 'principal-follow-owner';
  const first = sourceFixture({ suffix: 'first' });
  const second = sourceFixture({ suffix: 'second' });
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  stageSource(setup.store, first, owner, 1);
  await new Promise(resolve => setTimeout(resolve, 5));
  const secondFresh = sourceFixture({ suffix: 'second-fresh' });
  stageSource(setup.store, secondFresh, owner, 2);
  for (const source of [first, secondFresh]) {
    const persona = personaObservation(setup.store, owner, source.publicPersona.projection_digest);
    setup.store.followRemotePersona({
      owner,
      personaObservationId: persona.observation_id,
      trustLabel: 'manual-review',
      traceId: `trace-follow-${source.persona.persona_id}`
    });
  }

  const following = setup.store.getChronologicalFollowing(owner);
  assert.equal(following.items.length, 2);
  assert.ok(
    following.items[0].publication.created_at >= following.items[1].publication.created_at
  );
  assert.equal(following.ranking_effect, 'none');
  assert.equal(following.recommendation_effect, 'none');
});

test('unfollow is local-only, removes the source from Following, and can be replayed safely', async t => {
  const owner = 'principal-follow-owner';
  const source = sourceFixture({ suffix: 'unfollow' });
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  stageSource(setup.store, source, owner, 1);
  const persona = personaObservation(setup.store, owner, source.publicPersona.projection_digest);
  const follow = setup.store.followRemotePersona({
    owner,
    personaObservationId: persona.observation_id,
    trustLabel: 'manual-review',
    traceId: 'trace-follow-before-unfollow'
  });
  assert.equal(setup.store.getChronologicalFollowing(owner).items.length, 1);

  const unfollowed = setup.store.unfollowRemotePersona({
    owner,
    followId: follow.follow_id,
    traceId: 'trace-unfollow'
  });
  assert.equal(unfollowed.status, 'unfollowed');
  assert.equal(unfollowed.network_effect, 'none');
  assert.equal(setup.store.getChronologicalFollowing(owner).items.length, 0);
  const replay = setup.store.unfollowRemotePersona({
    owner,
    followId: follow.follow_id,
    traceId: 'trace-unfollow-replay'
  });
  assert.equal(replay.status, 'unfollowed');
});

test('follow events reject trust claims beyond exporter-attestation scope before durable write', async t => {
  const owner = 'principal-follow-owner';
  const source = sourceFixture({ suffix: 'trust-negative' });
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  stageSource(setup.store, source, owner, 1);
  const persona = personaObservation(setup.store, owner, source.publicPersona.projection_digest);
  const fakeFollowId = `remote_follow_${'a'.repeat(64)}`;

  assert.throws(
    () => setup.store.appendEvents({
      traceId: 'trace-follow-overclaim-rejected',
      actor: owner,
      events: [{
        kind: REMOTE_SOCIAL_FOLLOWED_EVENT,
        subject: fakeFollowId,
        payload: {
          schema: REMOTE_SOCIAL_FOLLOW_SCHEMA,
          follow_id: fakeFollowId,
          owner,
          exporter_grid_id: persona.exporter_grid_id,
          exporter_key_id: persona.exporter_key_id,
          persona_projection_digest: persona.object_digest,
          persona_observation_id: persona.observation_id,
          trust: {
            owner_trust_label: 'overclaim',
            trust_scope: 'content-truth',
            content_truth_claimed: true,
            legal_identity_claimed: true,
            actor_authorship_claimed: true
          },
          network_effect: 'none',
          recommendation_effect: 'none',
          authority_effect: 'none'
        }
      }]
    }),
    /cannot exceed exporter-attestation scope/
  );
  assert.equal(setup.store.db.prepare(`
    SELECT COUNT(*) AS count FROM events WHERE kind = ?
  `).get(REMOTE_SOCIAL_FOLLOWED_EVENT).count, 0);
});

test('private follow trust label is encrypted and follow state rebuilds from Grid evidence', async t => {
  const owner = 'principal-follow-owner';
  const source = sourceFixture({ suffix: 'restart' });
  const setup = await storeFixture();
  stageSource(setup.store, source, owner, 1);
  const persona = personaObservation(setup.store, owner, source.publicPersona.projection_digest);
  const follow = setup.store.followRemotePersona({
    owner,
    personaObservationId: persona.observation_id,
    trustLabel: 'private-assessment',
    traceId: 'trace-follow-restart'
  });
  const raw = setup.store.db.prepare(`
    SELECT trust_json FROM remote_social_follows WHERE follow_id = ?
  `).get(follow.follow_id).trust_json;
  assert.equal(setup.protector.isProtected(raw), true);
  assert.equal(raw.includes('private-assessment'), false);

  setup.store.close();
  setup.store = new RemoteSocialFollowingGridStore({
    path: setup.path,
    dataDir: setup.dataDir,
    identity: setup.identity,
    protector: new DataProtector(setup.key)
  });
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const restored = setup.store.getRemoteSocialFollow(owner, follow.follow_id);
  assert.equal(restored.status, 'following');
  assert.equal(restored.trust_json.owner_trust_label, 'private-assessment');
  const following = setup.store.getChronologicalFollowing(owner);
  assert.equal(following.items.length, 1);
  assert.equal(following.items[0].publication.projection_digest, source.active.projection_digest);
});

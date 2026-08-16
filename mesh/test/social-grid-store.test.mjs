import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import {
  ACTOR_STATE_SCHEMA,
  CREDENTIAL_EPOCH_SCHEMA,
  PUBLICATION_PERSONA_SCHEMA
} from '../src/identity/actor-state.mjs';
import {
  STATE_ACCESS_ENVELOPE_SCHEMA,
  verifyStateAccessUse
} from '../src/identity/actor-state-access.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection,
  createSocialPublicationRetraction,
  createSupersedingSocialPublication
} from '../src/lib/social-publication.mjs';
import {
  GridStore,
  reencryptGridProtectedColumns
} from '../src/grid/store.mjs';
import { SocialGridStore } from '../src/grid/social-store.mjs';

function times() {
  const now = Date.now();
  return {
    actor: new Date(now - 60_000).toISOString(),
    persona: new Date(now - 50_000).toISOString(),
    publication: new Date(now - 40_000).toISOString(),
    revision: new Date(now - 30_000).toISOString(),
    retraction: new Date(now - 20_000).toISOString(),
    accessStart: new Date(now - 120_000).toISOString(),
    accessEnd: new Date(now + 3_600_000).toISOString()
  };
}

function fixtures(t = times()) {
  const owner = 'principal-local-custodian';
  const actorId = 'actor-local-zov';
  const actorState = {
    schema: ACTOR_STATE_SCHEMA,
    actor_id: actorId,
    actor_type: 'human',
    lifecycle_state: 'active',
    credential_epochs: [{
      schema: CREDENTIAL_EPOCH_SCHEMA,
      actor_id: actorId,
      epoch_id: 'actor-local-zov-epoch-1',
      sequence: 1,
      state: 'active',
      crypto_profile_id: 'classical-ed25519-v1',
      activated_at: t.actor,
      ended_at: null,
      predecessor_epoch_id: null
    }],
    active_epoch_id: 'actor-local-zov-epoch-1',
    state_compartments: ['identity', 'publications'],
    continuity_predecessor_actor_id: null,
    succession_directive_digest: null
  };
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-local-zov',
    controller_actor_id: actorId,
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: t.persona,
    status: 'active'
  };
  const personaProjection = createPublicPersonaProjection(persona);
  const publication = createSocialPublicationProjection({
    publication_id: 'publication-local-1',
    content: {
      media_type: 'text/plain',
      text: 'This is saved to my local social corpus, not distributed to a network.'
    },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: t.publication,
    supersedes_digest: null
  }, { persona });
  const envelope = {
    schema: STATE_ACCESS_ENVELOPE_SCHEMA,
    envelope_id: 'social-access-local-1',
    subject_actor_id: actorId,
    requester_actor_id: actorId,
    state_class: 'publications',
    purpose: 'social-publish',
    action: 'publish',
    data_scopes: ['publication-projection'],
    recipient_actor_ids: [],
    disclosure_profile: 'pseudonymous',
    authority_basis: {
      type: 'self_authority',
      source_id: actorId,
      basis_digest: digestObject(actorState)
    },
    consent: { required: false, receipt_digest: null },
    required_assurance: 'A2',
    observed_assurance: 'A2',
    effective_at: t.accessStart,
    expires_at: t.accessEnd,
    raw_state_allowed: false,
    grants_ordinary_authority: false
  };
  const use = {
    subject_actor_id: actorId,
    requester_actor_id: actorId,
    state_class: 'publications',
    purpose: 'social-publish',
    action: 'publish',
    data_scopes: ['publication-projection'],
    recipient_actor_ids: [],
    disclosure_profile: 'pseudonymous',
    payload_digest: publication.projection_digest
  };
  return {
    t,
    owner,
    actorId,
    actorState,
    persona,
    personaProjection,
    publication,
    envelope,
    use
  };
}

function initialEvents(f) {
  return [
    {
      kind: 'actor.local.created',
      subject: f.actorId,
      payload: {
        owner: f.owner,
        actor_state: f.actorState,
        actor_state_digest: digestObject(f.actorState)
      }
    },
    {
      kind: 'social.persona.saved',
      subject: f.persona.persona_id,
      payload: {
        owner: f.owner,
        actor_id: f.actorId,
        protected_persona: f.persona,
        public_projection: f.personaProjection
      }
    },
    {
      kind: 'social.publication.saved',
      subject: f.publication.projection_digest,
      payload: {
        owner: f.owner,
        actor_id: f.actorId,
        publication: f.publication,
        state_access_envelope: f.envelope,
        state_access_use: f.use
      }
    }
  ];
}

async function createStore(t) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-social-grid-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const key = randomBytes(32);
  const protector = new DataProtector(key);
  const path = join(dataDir, 'grid.sqlite');
  const store = new SocialGridStore({ path, dataDir, identity, protector });
  return { root, dataDir, identity, key, protector, path, store, t };
}

test('social schema 1 creates local corpus tables without changing core schema 10', async t => {
  const setup = await createStore(t);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const status = setup.store.getStatus();
  assert.equal(status.schema_version, 10);
  assert.equal(status.social_schema_version, 1);
  const socialLedger = setup.store.db.prepare(`
    SELECT version, name, checksum FROM social_schema_migrations ORDER BY version
  `).all();
  assert.equal(socialLedger.length, 1);
  assert.equal(socialLedger[0].version, 1);
  assert.equal(socialLedger[0].name, 'actor-custody-and-local-social-corpus');
  assert.match(socialLedger[0].checksum, /^[a-f0-9]{64}$/);

  const tables = new Set(setup.store.db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table'
  `).all().map(row => row.name));
  for (const table of [
    'actor_states',
    'publication_personas',
    'social_publications',
    'social_transitions'
  ]) assert.equal(tables.has(table), true, `${table} missing`);
});

test('ordinary GridStore does not opt into the experimental social schema', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-core-grid-no-social-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(randomBytes(32));
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  assert.equal(store.getStatus().schema_version, 10);
  assert.equal(store.db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'actor_states'
  `).get(), undefined);
  assert.equal(store.db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'social_schema_migrations'
  `).get(), undefined);
});

test('custodian principal remains distinct from stable actor identity', async t => {
  const f = fixtures();
  const setup = await createStore(t);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  setup.store.appendEvents({
    traceId: 'trace-social-create',
    actor: f.owner,
    events: initialEvents(f)
  });
  const actor = setup.store.getActorState(f.owner, f.actorId);
  assert.equal(actor.owner, f.owner);
  assert.notEqual(actor.owner, actor.actor_id);
  assert.equal(actor.actor_id, f.actorId);
  assert.equal(actor.state_json.actor_id, f.actorId);

  const persona = setup.store.getPublicationPersona(f.owner, f.persona.persona_id);
  assert.equal(persona.actor_id, f.actorId);
  assert.equal(persona.protected_json.controller_actor_id, f.actorId);
  assert.equal(persona.public_projection_json.public_actor_link, null);

  const corpus = setup.store.listSocialCorpus(f.owner);
  assert.equal(corpus.publications.length, 1);
  assert.equal(corpus.publications[0].projection_json.projection_digest, f.publication.projection_digest);
  assert.equal(corpus.publications[0].access_use_json.payload_digest, f.publication.projection_digest);
  assert.equal(corpus.publications[0].projection_json.network_effect, 'none');
});

test('materialized actor/persona/publication bytes are protected at rest', async t => {
  const f = fixtures();
  const setup = await createStore(t);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  setup.store.appendEvents({
    traceId: 'trace-social-encryption',
    actor: f.owner,
    events: initialEvents(f)
  });
  const actorRaw = setup.store.db.prepare('SELECT state_json FROM actor_states').get().state_json;
  const personaRaw = setup.store.db.prepare(`
    SELECT protected_json, public_projection_json FROM publication_personas
  `).get();
  const publicationRaw = setup.store.db.prepare(`
    SELECT projection_json, access_envelope_json, access_use_json FROM social_publications
  `).get();
  for (const serialized of [
    actorRaw,
    personaRaw.protected_json,
    personaRaw.public_projection_json,
    publicationRaw.projection_json,
    publicationRaw.access_envelope_json,
    publicationRaw.access_use_json
  ]) {
    assert.equal(setup.protector.isProtected(serialized), true);
    assert.equal(serialized.includes('actor-local-zov'), false);
    assert.equal(serialized.includes('local social corpus'), false);
  }
});

test('owner scoping denies another custodian from protected actor and persona reads', async t => {
  const f = fixtures();
  const setup = await createStore(t);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  setup.store.appendEvents({
    traceId: 'trace-social-owner-scope',
    actor: f.owner,
    events: initialEvents(f)
  });
  assert.throws(
    () => setup.store.getActorState('principal-other', f.actorId),
    error => error?.code === 'actor_custody_not_found'
  );
  assert.throws(
    () => setup.store.getPublicationPersona('principal-other', f.persona.persona_id),
    error => error?.code === 'publication_persona_not_found'
  );
  assert.equal(setup.store.listSocialCorpus('principal-other').publications.length, 0);
});

test('publication self authority must bind the current custodied actor-state digest', async t => {
  const f = fixtures();
  const setup = await createStore(t);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const events = initialEvents(f);
  events[2].payload.state_access_envelope = {
    ...f.envelope,
    authority_basis: {
      ...f.envelope.authority_basis,
      basis_digest: digestObject({ actor_id: f.actorId, stale: true })
    }
  };
  assert.throws(
    () => setup.store.appendEvents({
      traceId: 'trace-social-stale-self-authority',
      actor: f.owner,
      events
    }),
    /self authority to the current custodied actor state/
  );
});

test('revision and retraction remain append-only materialized history', async t => {
  const f = fixtures();
  const setup = await createStore(t);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  setup.store.appendEvents({
    traceId: 'trace-social-lineage-initial',
    actor: f.owner,
    events: initialEvents(f)
  });

  const revision = createSupersedingSocialPublication(
    f.publication,
    {
      publication_id: 'publication-local-1-r2',
      content: { media_type: 'text/plain', text: 'Revised local social corpus record.' },
      attachment_digests: [],
      audience: { mode: 'public' },
      discoverability: 'listed',
      authorship_mode: 'human-authored',
      created_at: f.t.revision,
      supersedes_digest: f.publication.projection_digest
    },
    { persona: f.persona }
  );
  const revisionEnvelope = {
    ...f.envelope,
    envelope_id: 'social-access-local-r2'
  };
  const revisionUse = {
    ...f.use,
    payload_digest: revision.projection_digest
  };
  verifyStateAccessUse(revisionEnvelope, revisionUse);
  setup.store.appendEvents({
    traceId: 'trace-social-lineage-revision',
    actor: f.owner,
    events: [{
      kind: 'social.publication.saved',
      subject: revision.projection_digest,
      payload: {
        owner: f.owner,
        actor_id: f.actorId,
        publication: revision,
        state_access_envelope: revisionEnvelope,
        state_access_use: revisionUse
      }
    }]
  });

  const retraction = createSocialPublicationRetraction(revision, {
    reason_code: 'author-retracted',
    occurred_at: f.t.retraction
  });
  setup.store.appendEvents({
    traceId: 'trace-social-lineage-retraction',
    actor: f.owner,
    events: [{
      kind: 'social.publication.retracted',
      subject: retraction.transition_digest,
      payload: {
        owner: f.owner,
        actor_id: f.actorId,
        transition: retraction
      }
    }]
  });

  const corpus = setup.store.listSocialCorpus(f.owner);
  assert.equal(corpus.publications.length, 2);
  const byDigest = new Map(corpus.publications.map(item => [item.projection_digest, item]));
  assert.equal(byDigest.get(f.publication.projection_digest).status, 'superseded');
  assert.equal(byDigest.get(revision.projection_digest).status, 'retracted');
  assert.equal(corpus.transitions.length, 1);
  assert.equal(corpus.transitions[0].transition_json.third_party_deletion_claimed, false);
});

test('materialized local social state rebuilds deterministically from the event chain', async t => {
  const f = fixtures();
  const setup = await createStore(t);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  setup.store.appendEvents({
    traceId: 'trace-social-rebuild',
    actor: f.owner,
    events: initialEvents(f)
  });
  const before = setup.store.listSocialCorpus(f.owner);
  setup.store.rebuildMaterializedState();
  const after = setup.store.listSocialCorpus(f.owner);
  assert.deepEqual(after, before);
  assert.equal(setup.store.verifyFullChain().valid, true);
});

test('supported data-key rotation re-encrypts social columns and reopens with the new key', async t => {
  const f = fixtures();
  const setup = await createStore(t);
  setup.store.appendEvents({
    traceId: 'trace-social-rotate',
    actor: f.owner,
    events: initialEvents(f)
  });
  setup.store.close();

  const nextKey = randomBytes(32);
  const nextProtector = new DataProtector(nextKey);
  const db = new DatabaseSync(setup.path);
  const result = reencryptGridProtectedColumns({
    db,
    sourceProtector: setup.protector,
    targetProtector: nextProtector
  });
  db.close();
  assert.ok(result.protected_values >= 6);
  assert.ok(result.tables.actor_states >= 1);
  assert.ok(result.tables.publication_personas >= 2);
  assert.ok(result.tables.social_publications >= 3);

  const reopened = new SocialGridStore({
    path: setup.path,
    dataDir: setup.dataDir,
    identity: setup.identity,
    protector: nextProtector
  });
  t.after(async () => {
    reopened.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  assert.equal(reopened.getStatus().schema_version, 10);
  assert.equal(reopened.getStatus().social_schema_version, 1);
  assert.equal(reopened.getActorState(f.owner, f.actorId).state_json.actor_id, f.actorId);
  assert.equal(
    reopened.listSocialCorpus(f.owner).publications[0].projection_json.projection_digest,
    f.publication.projection_digest
  );
  assert.equal(reopened.verifyFullChain().valid, true);
});

test('social event owner cannot differ from authenticated custodian principal', async t => {
  const f = fixtures();
  const setup = await createStore(t);
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  const event = initialEvents(f)[0];
  assert.throws(
    () => setup.store.appendEvents({
      traceId: 'trace-social-owner-substitution',
      actor: 'principal-other',
      events: [event]
    }),
    /owner must match the authenticated custodian principal/
  );
});

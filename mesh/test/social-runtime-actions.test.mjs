import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { SocialGridStore } from '../src/grid/social-store.mjs';
import { executeBuiltin } from '../src/sandbox/social-executor.mjs';

const PRINCIPAL = Object.freeze({
  id: 'principal-social-runtime',
  type: 'human',
  roles: [],
  scopes: ['social:write']
});
const ASSURANCE = Object.freeze({
  required: 'A2',
  achieved: 'A2',
  basis: 'auditable_kernel_path'
});

function execute(action, input = {}, assurance = ASSURANCE) {
  return executeBuiltin({
    tool: 'builtin.validate-mutation',
    assurance,
    intent: {
      action,
      input,
      principal: PRINCIPAL
    }
  });
}

async function createStore(t) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-social-runtime-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(randomBytes(32));
  const store = new SocialGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  return store;
}

function actorAndPersona() {
  const actor = execute('social.actor.create');
  const persona = execute('social.persona.create', {
    actor_id: actor.output.actor_id,
    attribution_mode: 'pseudonymous'
  });
  return { actor, persona };
}

test('local social lifecycle stays append-only and network-effect free', async t => {
  const store = await createStore(t);
  const { actor, persona } = actorAndPersona();

  assert.notEqual(actor.output.actor_id, PRINCIPAL.id);
  assert.equal(actor.output.custody, 'owner-local');
  assert.equal(actor.output.network_effect, 'none');
  assert.equal(persona.output.public_projection.public_actor_link, null);
  assert.equal(persona.output.public_projection.authority_effect, 'none');
  assert.equal(persona.output.network_effect, 'none');

  store.appendEvents({
    traceId: 'trace-social-runtime-identity',
    actor: PRINCIPAL.id,
    events: [actor.mutation, persona.mutation]
  });

  const publication = execute('social.publication.create', {
    actor_id: actor.output.actor_id,
    actor_state_digest: actor.output.actor_state_digest,
    protected_persona: persona.mutation.payload.protected_persona,
    content: {
      media_type: 'text/markdown',
      text: 'Local corpus entry. **No network distribution.**'
    },
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored'
  });
  assert.equal(publication.output.publication.network_effect, 'none');
  assert.equal(publication.output.local_corpus_effect, 'append');
  assert.equal(publication.mutation.payload.state_access_envelope.required_assurance, 'A2');
  assert.equal(publication.mutation.payload.state_access_envelope.observed_assurance, 'A2');
  assert.equal(publication.mutation.payload.state_access_envelope.raw_state_allowed, false);
  assert.deepEqual(publication.mutation.payload.state_access_envelope.recipient_actor_ids, []);
  assert.equal(
    publication.mutation.payload.state_access_use.payload_digest,
    publication.output.publication.projection_digest
  );
  store.appendEvents({
    traceId: 'trace-social-runtime-publication',
    actor: PRINCIPAL.id,
    events: [publication.mutation]
  });

  const revision = execute('social.publication.supersede', {
    actor_id: actor.output.actor_id,
    actor_state_digest: actor.output.actor_state_digest,
    protected_persona: persona.mutation.payload.protected_persona,
    previous_publication: publication.output.publication,
    content: {
      media_type: 'text/plain',
      text: 'Revised local corpus entry.'
    },
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored'
  });
  assert.equal(
    revision.output.publication.supersedes_digest,
    publication.output.publication.projection_digest
  );
  assert.equal(revision.output.publication.network_effect, 'none');
  store.appendEvents({
    traceId: 'trace-social-runtime-revision',
    actor: PRINCIPAL.id,
    events: [revision.mutation]
  });

  const retraction = execute('social.publication.retract', {
    actor_id: actor.output.actor_id,
    previous_publication: revision.output.publication,
    reason_code: 'author-retracted'
  });
  assert.equal(retraction.output.stop_serving_requested, true);
  assert.equal(retraction.output.third_party_deletion_claimed, false);
  assert.equal(retraction.output.network_effect, 'none');
  store.appendEvents({
    traceId: 'trace-social-runtime-retraction',
    actor: PRINCIPAL.id,
    events: [retraction.mutation]
  });

  const corpus = store.listSocialCorpus(PRINCIPAL.id);
  assert.equal(corpus.publications.length, 2);
  const byDigest = new Map(corpus.publications.map(item => [item.projection_digest, item]));
  assert.equal(byDigest.get(publication.output.publication.projection_digest).status, 'superseded');
  assert.equal(byDigest.get(revision.output.publication.projection_digest).status, 'retracted');
  assert.equal(corpus.transitions.length, 1);
  assert.equal(corpus.transitions[0].transition_json.third_party_deletion_claimed, false);
  assert.equal(store.verifyFullChain().valid, true);
});

test('current local gate permits only one actor per custodian principal', async t => {
  const store = await createStore(t);
  const first = execute('social.actor.create');
  const second = execute('social.actor.create');
  store.appendEvents({
    traceId: 'trace-social-first-actor',
    actor: PRINCIPAL.id,
    events: [first.mutation]
  });
  assert.throws(
    () => store.appendEvents({
      traceId: 'trace-social-second-actor',
      actor: PRINCIPAL.id,
      events: [second.mutation]
    }),
    error => error?.code === 'actor_custody_limit_reached'
  );
});

test('current local gate permits only one active persona per actor', async t => {
  const store = await createStore(t);
  const actor = execute('social.actor.create');
  const first = execute('social.persona.create', {
    actor_id: actor.output.actor_id,
    attribution_mode: 'pseudonymous'
  });
  const second = execute('social.persona.create', {
    actor_id: actor.output.actor_id,
    attribution_mode: 'anonymous'
  });
  store.appendEvents({
    traceId: 'trace-social-persona-setup',
    actor: PRINCIPAL.id,
    events: [actor.mutation, first.mutation]
  });
  assert.throws(
    () => store.appendEvents({
      traceId: 'trace-social-second-persona',
      actor: PRINCIPAL.id,
      events: [second.mutation]
    }),
    error => error?.code === 'publication_persona_limit_reached'
  );
});

test('organization-delegated persona stays unavailable without verified delegation authority', () => {
  const actor = execute('social.actor.create');
  assert.throws(
    () => execute('social.persona.create', {
      actor_id: actor.output.actor_id,
      attribution_mode: 'organization-delegated'
    }),
    /separately verified delegation authority/
  );
});

test('social executor preserves the existing builtin surface for non-social actions', () => {
  const result = executeBuiltin({
    tool: 'builtin.echo',
    intent: {
      action: 'system.echo',
      input: { message: 'unchanged' },
      principal: PRINCIPAL
    }
  });
  assert.deepEqual(result, { output: { message: 'unchanged' } });
});

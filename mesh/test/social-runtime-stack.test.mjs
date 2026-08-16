import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';

async function api(base, token, path, {
  method = 'GET',
  body,
  idempotencyKey = `social-${randomUUID()}`
} = {}, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey
      })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(payload));
  return payload;
}

async function findPortBlock() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const base = 20_000 + Math.floor(Math.random() * 20_000);
    const servers = [];
    try {
      for (let port = base; port < base + 4; port += 1) {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, '127.0.0.1', resolve);
        });
        servers.push(server);
      }
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
      return base;
    } catch {
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    }
  }
  throw new Error('Unable to reserve a local port block');
}

test('local social actions traverse Gateway Hypervisor Sandbox and Grid without network distribution', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-social-stack-'));
  const basePort = await findPortBlock();
  const token = `social-operator-${'s'.repeat(40)}`;
  const principalId = 'local-social-operator';
  const overrides = {
    dataDir,
    environment: 'test',
    autoBootstrap: true,
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
      [token]: {
        id: principalId,
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      }
    }
  };
  const stack = await startDevelopmentStack(overrides);
  t.after(async () => {
    try {
      await stack.stop();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  const gateway = `http://127.0.0.1:${basePort}`;

  const actor = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'social.actor.create',
      input: {},
      purpose: 'local-social-identity',
      data_scopes: ['social:identity']
    }
  });
  assert.equal(actor.status, 'completed');
  assert.notEqual(actor.actor_id, principalId);
  assert.equal(actor.custody, 'owner-local');
  assert.equal(actor.network_effect, 'none');

  const persona = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'social.persona.create',
      input: {
        actor_id: actor.actor_id,
        attribution_mode: 'pseudonymous'
      },
      purpose: 'local-social-persona',
      data_scopes: ['social:identity']
    }
  });
  assert.equal(persona.status, 'completed');
  assert.equal(persona.public_projection.public_actor_link, null);
  assert.equal(persona.public_projection.authority_effect, 'none');
  assert.equal(persona.network_effect, 'none');

  const protectedPersona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: persona.persona_id,
    controller_actor_id: actor.actor_id,
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: persona.public_projection.created_at,
    status: 'active'
  };
  const publication = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'social.publication.create',
      input: {
        actor_id: actor.actor_id,
        actor_state_digest: actor.actor_state_digest,
        protected_persona: protectedPersona,
        content: {
          media_type: 'text/plain',
          text: 'Persisted locally through the full kernel path.'
        },
        audience: { mode: 'public' },
        discoverability: 'listed',
        authorship_mode: 'human-authored'
      },
      purpose: 'social-publish',
      data_scopes: ['publication-projection']
    }
  });
  assert.equal(publication.status, 'completed');
  assert.equal(publication.publication.network_effect, 'none');
  assert.equal(publication.local_corpus_effect, 'append');

  const gridStore = stack.services.find(service => service.name === 'grid').store;
  const actors = gridStore.listActorStates(principalId);
  const personas = gridStore.listPublicationPersonas(principalId);
  const corpus = gridStore.listSocialCorpus(principalId);
  assert.equal(actors.actors.length, 1);
  assert.equal(actors.actors[0].actor_id, actor.actor_id);
  assert.equal(personas.personas.length, 1);
  assert.equal(personas.personas[0].persona_id, persona.persona_id);
  assert.equal(corpus.publications.length, 1);
  assert.equal(
    corpus.publications[0].projection_digest,
    publication.publication.projection_digest
  );
  assert.equal(corpus.publications[0].projection_json.network_effect, 'none');
  assert.deepEqual(corpus.publications[0].access_envelope_json.recipient_actor_ids, []);
  assert.equal(corpus.publications[0].access_envelope_json.raw_state_allowed, false);
  assert.equal(gridStore.verifyFullChain().valid, true);

  const secondActor = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'social.actor.create',
      input: {},
      purpose: 'local-social-identity',
      data_scopes: ['social:identity']
    }
  }, 409);
  assert.equal(secondActor.error.code, 'actor_custody_limit_reached');
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

async function request(base, token, path, {
  method = 'GET',
  body,
  expectedStatus = 200
} = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : {
        'content-type': 'application/json',
        'idempotency-key': `social-read-${randomUUID()}`
      })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(payload));
  return payload;
}

async function createSocialState(gateway, token) {
  const actor = await request(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'social.actor.create',
      input: {},
      purpose: 'local-social-identity',
      data_scopes: ['social:identity']
    }
  });
  const persona = await request(gateway, token, '/v1/intents', {
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
  const publication = await request(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'social.publication.create',
      input: {
        actor_id: actor.actor_id,
        actor_state_digest: actor.actor_state_digest,
        protected_persona: protectedPersona,
        content: {
          media_type: 'text/plain',
          text: 'Owner-scoped social snapshot.'
        },
        audience: { mode: 'public' },
        discoverability: 'listed',
        authorship_mode: 'human-authored'
      },
      purpose: 'social-publish',
      data_scopes: ['publication-projection']
    }
  });
  return { actor, persona, publication };
}

test('Gateway social snapshot is derived only from authenticated owner history', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-social-gateway-'));
  const portLease = await reserveProductionPortBlock('social gateway route test');
  const basePort = portLease.base_port;
  const ownerToken = `social-owner-${'o'.repeat(40)}`;
  const otherToken = `social-other-${'x'.repeat(40)}`;
  const ownerId = 'principal-social-route-owner';
  const otherId = 'principal-social-route-other';
  const stack = await startDevelopmentStack({
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
      [ownerToken]: {
        id: ownerId,
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      },
      [otherToken]: {
        id: otherId,
        type: 'human',
        roles: [],
        scopes: ['social:write']
      }
    }
  });
  t.after(async () => {
    try {
      await stack.stop();
    } finally {
      await portLease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  const state = await createSocialState(gateway, ownerToken);

  const snapshot = await request(gateway, ownerToken, '/v1/social?publication_limit=1');
  assert.equal(snapshot.schema, 'axiom-local-social-snapshot.v1');
  assert.equal(snapshot.owner, ownerId);
  assert.equal(snapshot.network_effect, 'none');
  assert.equal(snapshot.actors.length, 1);
  assert.equal(snapshot.actors[0].actor_id, state.actor.actor_id);
  assert.equal(snapshot.personas.length, 1);
  assert.equal(snapshot.personas[0].persona_id, state.persona.persona_id);
  assert.equal(snapshot.personas[0].public_projection.public_actor_link, null);
  assert.equal(snapshot.corpus.publications.length, 1);
  assert.equal(
    snapshot.corpus.publications[0].projection_digest,
    state.publication.publication.projection_digest
  );
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /state_access_envelope|state_access_use|plan_digest|invocation_digest/);

  const other = await request(gateway, otherToken, '/v1/social');
  assert.equal(other.owner, otherId);
  assert.deepEqual(other.actors, []);
  assert.deepEqual(other.personas, []);
  assert.deepEqual(other.corpus.publications, []);

  const attemptedOverride = await request(
    gateway,
    ownerToken,
    `/v1/social?owner=${encodeURIComponent(otherId)}`
  );
  assert.equal(attemptedOverride.owner, ownerId);
  assert.equal(attemptedOverride.actors[0].actor_id, state.actor.actor_id);
});

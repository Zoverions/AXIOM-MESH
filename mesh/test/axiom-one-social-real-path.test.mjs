import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startAxiomOnePreview } from '../../apps/axiom-one/server.mjs';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

test('AXIOM One Social traverses the real preview and four-service owner-scoped read path', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-one-social-preview-'));
  const lease = await reserveProductionPortBlock('AXIOM One Social preview test');
  const basePort = lease.base_port;
  const token = `preview-social-${'s'.repeat(40)}`;
  const outsiderToken = `preview-social-${'o'.repeat(40)}`;
  let stack;
  let preview;

  t.after(async () => {
    try {
      await preview?.stop();
      await stack?.stop();
    } finally {
      await lease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  stack = await startDevelopmentStack({
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
        id: 'axiom-one-social-owner',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      },
      [outsiderToken]: {
        id: 'axiom-one-social-outsider',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      }
    }
  });

  preview = await startAxiomOnePreview({
    port: 0,
    gatewayOrigin: `http://127.0.0.1:${basePort}`
  });

  const previewRequest = (path, options) => {
    const headers = new Headers(options.headers);
    headers.set('origin', preview.url);
    headers.set('sec-fetch-site', 'same-origin');
    return fetch(`${preview.url}${path}`, { ...options, headers });
  };
  const client = createGatewayClient({ token, request: previewRequest });
  const outsider = createGatewayClient({ token: outsiderToken, request: previewRequest });

  const local = await client.call('social.get');
  assert.equal(local.schema, 'axiom-local-social-snapshot.v1');
  assert.equal(local.owner, 'axiom-one-social-owner');
  assert.equal(local.network_effect, 'none');
  assert.deepEqual(local.actors, []);
  assert.deepEqual(local.personas, []);
  assert.deepEqual(local.corpus.publications, []);

  const remote = await client.call('social_remote_review.get');
  assert.equal(remote.schema, 'axiom-remote-social-review.v1');
  assert.equal(remote.owner, 'axiom-one-social-owner');
  assert.equal(remote.activation_scope, 'local-read-only-review');
  assert.deepEqual(remote.observations, []);
  assert.deepEqual(remote.follows, []);
  assert.equal(remote.transport_state_included, false);
  assert.equal(remote.ranking_state_included, false);
  assert.equal(remote.mutation_effect, 'none');
  assert.equal(remote.network_effect, 'none');
  assert.equal(remote.recommendation_effect, 'none');
  assert.equal(remote.authority_effect, 'none');

  const outsiderLocal = await outsider.call('social.get');
  assert.equal(outsiderLocal.owner, 'axiom-one-social-outsider');
  assert.notEqual(outsiderLocal.owner, local.owner);

  await assert.rejects(
    outsider.call('social.get', { query: { owner: local.owner } }),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    outsider.call('social_remote_review.get', { query: { owner: local.owner } }),
    error => error.code === 'invalid_client_request'
  );
});

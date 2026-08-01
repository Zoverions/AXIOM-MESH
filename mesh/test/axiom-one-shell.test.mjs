import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkAxiomOnePreview, validateAxiomOnePolicy } from '../src/check-axiom-one.mjs';
import { startAxiomOnePreview, validatePreviewConfiguration } from '../../apps/axiom-one/server.mjs';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

test('AXIOM One preview policy and static boundary are exact', async () => {
  const result = await checkAxiomOnePreview();
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-one-preview.v1');
  assert.equal(result.kernel_version, '0.12.0-dev.3');
  assert.equal(result.status, 'experimental-local-preview');
  assert.equal(result.surfaces, 7);
  assert.equal(result.gateway_routes, 14);
  assert.equal(result.bind_host, '127.0.0.1');
  assert.equal(result.gateway_target, 'same-origin-relative-v1');
  assert.equal(result.token_persistence, 'memory-only');
  assert.equal(result.secret_or_user_data_storage, false);
  assert.equal(result.public_shell_cache, true);
  assert.equal(result.api_cache, false);
  assert.equal(result.remote_origins_allowed, false);
  assert.equal(result.explained_actions, 5);
  assert.equal(result.memory_lifecycle_status, 'experimental-bounded-lifecycle');
  assert.equal(result.provenance_relations, 3);
  assert.equal(result.self_links, false);
  assert.equal(result.correction_replaces_original, false);
  assert.equal(result.link_deletion, false);
  assert.equal(result.hard_delete, false);
  assert.equal(result.restore, false);
  assert.match(result.policy_digest, /^[a-f0-9]{64}$/);
  assert.match(result.assets_digest, /^[a-f0-9]{64}$/);

  const app = await readFile(new URL('../../apps/axiom-one/app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML/);
});

test('AXIOM One preview rejects non-loopback and weakened policy', async () => {
  assert.throws(() => validatePreviewConfiguration({
    host: '0.0.0.0',
    port: 4173,
    gatewayOrigin: 'http://127.0.0.1:8080',
    fetchImpl: fetch
  }), /must bind IPv4 loopback/);
  assert.throws(() => validatePreviewConfiguration({
    host: '127.0.0.1',
    port: 4173,
    gatewayOrigin: 'https://gateway.example.com',
    fetchImpl: fetch
  }), /explicit loopback HTTP origin/);
  const policy = JSON.parse(await readFile(
    new URL('../../apps/axiom-one/app-policy.json', import.meta.url),
    'utf8'
  ));
  policy.security.secret_or_user_data_storage = true;
  assert.throws(() => validateAxiomOnePolicy(policy), /security boundary is weakened/);

  const weakenedLifecycle = JSON.parse(await readFile(
    new URL('../../apps/axiom-one/app-policy.json', import.meta.url),
    'utf8'
  ));
  weakenedLifecycle.memory_lifecycle.provenance_relations.push('arbitrary');
  assert.throws(
    () => validateAxiomOnePolicy(weakenedLifecycle),
    /memory lifecycle boundary is weakened/
  );
});

test('AXIOM One serves a hardened shell and proxies only contract routes', async t => {
  const observed = [];
  const gateway = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    observed.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
      body: Buffer.concat(chunks).toString('utf8')
    });
    const payload = req.url === '/v1/status'
      ? {
          kernel_version: '0.12.0-dev.3',
          claim_source_digest: 'a'.repeat(64),
          runtime: {},
          capability_counts: {}
        }
      : {
          intent_id: `intent_${'b'.repeat(64)}`,
          trace_id: 'trace-preview-intent',
          status: 'completed',
          evidence: {},
          message: 'preview'
        };
    const body = Buffer.from(JSON.stringify(payload));
    res.writeHead(req.url === '/v1/status' ? 200 : 201, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(body.length),
      'x-trace-id': 'trace-preview-upstream'
    });
    res.end(body);
  });
  await new Promise((resolve, reject) => {
    gateway.once('error', reject);
    gateway.listen(0, '127.0.0.1', resolve);
  });
  const gatewayPort = gateway.address().port;
  const preview = await startAxiomOnePreview({
    port: 0,
    gatewayOrigin: `http://127.0.0.1:${gatewayPort}`
  });
  t.after(async () => {
    await preview.stop();
    await new Promise((resolve, reject) => gateway.close(error => error ? reject(error) : resolve()));
  });

  const shell = await fetch(preview.url);
  assert.equal(shell.status, 200);
  assert.match(shell.headers.get('content-type'), /^text\/html/);
  assert.match(shell.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(shell.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(shell.headers.get('x-frame-options'), 'DENY');
  assert.equal(shell.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.match(await shell.text(), /AXIOM One/);

  const rejectedHost = await rawRequest(preview.port, '/', {
    host: 'attacker.example'
  });
  assert.equal(rejectedHost.status, 421);
  assert.equal(rejectedHost.body, 'Loopback host required');

  const health = await fetch(`${preview.url}/app-health`);
  assert.deepEqual(await health.json(), {
    schema: 'axiom-one-preview.v1',
    status: 'live',
    kernel_version: '0.12.0-dev.3',
    support: 'experimental-local-preview'
  });

  const status = await fetch(`${preview.url}/v1/status`, {
    headers: {
      authorization: 'Bearer preview-fixture-token',
      origin: preview.url,
      'sec-fetch-site': 'same-origin'
    }
  });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).kernel_version, '0.12.0-dev.3');
  assert.equal(observed.length, 1);
  assert.equal(observed[0].url, '/v1/status');
  assert.equal(observed[0].authorization, 'Bearer preview-fixture-token');
  assert.equal(observed[0].cookie, undefined);

  const intent = await fetch(`${preview.url}/v1/intents`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer preview-fixture-token',
      origin: preview.url,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'idempotency-key': 'preview-idempotency-0001'
    },
    body: JSON.stringify({ action: 'system.echo', input: { message: 'preview' } })
  });
  assert.equal(intent.status, 201);
  assert.equal((await intent.json()).message, 'preview');
  assert.equal(observed.length, 2);
  assert.equal(observed[1].url, '/v1/intents');
  assert.deepEqual(JSON.parse(observed[1].body), {
    action: 'system.echo',
    input: { message: 'preview' }
  });

  const crossOrigin = await fetch(`${preview.url}/v1/status`, {
    headers: {
      authorization: 'Bearer preview-fixture-token',
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site'
    }
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error.code, 'forbidden');
  assert.equal(observed.length, 2);

  const unlisted = await fetch(`${preview.url}/v1/unlisted`, {
    headers: {
      authorization: 'Bearer preview-fixture-token',
      origin: preview.url,
      'sec-fetch-site': 'same-origin'
    }
  });
  assert.equal(unlisted.status, 404);
  assert.equal((await unlisted.json()).error.code, 'not_found');
  assert.equal(observed.length, 2);

  const undeclaredQuery = await fetch(`${preview.url}/v1/status?debug=true`, {
    headers: {
      authorization: 'Bearer preview-fixture-token',
      origin: preview.url,
      'sec-fetch-site': 'same-origin'
    }
  });
  assert.equal(undeclaredQuery.status, 404);
  assert.equal(observed.length, 2);
});

test('AXIOM One preview traverses the real four-service status and intent path', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-one-preview-'));
  const lease = await reserveProductionPortBlock('AXIOM One preview test');
  const basePort = lease.base_port;
  const token = `preview-${'p'.repeat(40)}`;
  const outsiderToken = `preview-${'o'.repeat(40)}`;
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
        id: 'axiom-one-preview-operator',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      },
      [outsiderToken]: {
        id: 'axiom-one-preview-outsider',
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
  const client = createGatewayClient({
    token,
    request: previewRequest
  });
  const outsider = createGatewayClient({
    token: outsiderToken,
    request: previewRequest
  });

  const status = await client.call('status.get');
  assert.equal(status.kernel_version, '0.12.0-dev.3');
  assert.equal(status.runtime.grid.mode, 'single-node-transparency-log');
  const intent = await client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'AXIOM One real path' },
      purpose: 'axiom-one-preview-test'
    },
    idempotencyKey: 'axiom-one-real-path-0001'
  });
  assert.equal(intent.status, 'completed');
  assert.equal(intent.message, 'AXIOM One real path');
  assert.ok(intent.evidence);

  const created = await client.call('intents.submit', {
    body: {
      action: 'memory.put',
      input: {
        kind: 'note',
        content: { title: 'AXIOM One memory', text: 'owner-scoped private record' },
        metadata: { source: 'axiom-one-local-preview' }
      },
      purpose: 'private-memory-recording'
    },
    idempotencyKey: 'axiom-one-memory-create-0001'
  });
  assert.equal(created.status, 'completed');
  assert.match(created.object_id, /^memory_[a-f0-9]{64}$/);
  const correction = await client.call('intents.submit', {
    body: {
      action: 'memory.put',
      input: {
        kind: 'note',
        content: { title: 'AXIOM One correction', text: 'new record; original retained' },
        metadata: { source: 'axiom-one-local-preview' }
      },
      purpose: 'private-memory-recording'
    },
    idempotencyKey: 'axiom-one-memory-create-0002'
  });
  assert.equal(correction.status, 'completed');
  const linked = await client.call('intents.submit', {
    body: {
      action: 'memory.link',
      input: {
        from_id: correction.object_id,
        to_id: created.object_id,
        relation: 'corrects',
        metadata: { source: 'axiom-one-local-preview' }
      },
      purpose: 'owner-memory-provenance'
    },
    idempotencyKey: 'axiom-one-memory-link-0001'
  });
  assert.equal(linked.status, 'completed');
  assert.match(linked.edge_id, /^edge_[a-f0-9]{64}$/);
  const memory = await client.call('memory.list');
  assert.equal(memory.objects.length, 2);
  assert.equal(memory.objects[0].object_id, created.object_id);
  assert.equal(memory.objects[0].payload_json.content.title, 'AXIOM One memory');
  assert.equal(memory.edges.length, 1);
  assert.equal(memory.edges[0].from_id, correction.object_id);
  assert.equal(memory.edges[0].to_id, created.object_id);
  assert.equal(memory.edges[0].relation, 'corrects');

  const exported = await client.call('intents.submit', {
    body: {
      action: 'export.create',
      input: { types: ['memory'], object_ids: [created.object_id] },
      purpose: 'owner-selective-memory-export'
    },
    idempotencyKey: 'axiom-one-memory-export-0001'
  });
  assert.equal(exported.status, 'completed');
  const exportRecord = await client.call('exports.get', {
    params: { id: exported.export_id }
  });
  assert.equal(exportRecord.principal, 'axiom-one-preview-operator');
  assert.deepEqual(exportRecord.scope_json.object_ids, [created.object_id]);
  const exportBundle = await client.call('export_bundles.get', {
    params: { id: exported.export_id }
  });
  assert.match(exportBundle.bundle, new RegExp(created.object_id));
  assert.match(exportBundle.bundle, /"type":"memory_object"/);

  const hiddenMemory = await outsider.call('memory.list', {
    query: { owner: 'axiom-one-preview-operator' }
  });
  assert.equal(hiddenMemory.objects.length, 0);
  await assert.rejects(
    outsider.call('exports.get', { params: { id: exported.export_id } }),
    error => error.code === 'export_not_found'
  );
  await assert.rejects(
    outsider.call('intents.submit', {
      body: {
        action: 'memory.link',
        input: {
          from_id: correction.object_id,
          to_id: created.object_id,
          relation: 'supports',
          metadata: { source: 'axiom-one-local-preview' }
        },
        purpose: 'owner-memory-provenance'
      },
      idempotencyKey: 'axiom-one-outsider-link-0001'
    }),
    error => error.code === 'validation_error'
  );
  await assert.rejects(
    outsider.call('intents.submit', {
      body: {
        action: 'memory.tombstone',
        input: { object_id: created.object_id, reason: 'unauthorized removal' },
        confirmations: ['confirm:memory.tombstone']
      },
      idempotencyKey: 'axiom-one-outsider-tombstone-0001'
    }),
    error => error.code === 'validation_error'
  );

  const tombstoned = await client.call('intents.submit', {
    body: {
      action: 'memory.tombstone',
      input: {
        object_id: created.object_id,
        reason: 'Owner removed this record through AXIOM One local preview.'
      },
      confirmations: ['confirm:memory.tombstone'],
      purpose: 'owner-memory-tombstone'
    },
    idempotencyKey: 'axiom-one-memory-tombstone-0001'
  });
  assert.equal(tombstoned.status, 'completed');
  assert.equal(tombstoned.object_id, created.object_id);
  const afterTombstone = await client.call('memory.list');
  assert.equal(afterTombstone.objects.length, 1);
  assert.equal(afterTombstone.objects[0].object_id, correction.object_id);
  assert.equal(afterTombstone.edges.length, 0);

  const correctionTombstoned = await client.call('intents.submit', {
    body: {
      action: 'memory.tombstone',
      input: {
        object_id: correction.object_id,
        reason: 'Owner removed this record through AXIOM One local preview.'
      },
      confirmations: ['confirm:memory.tombstone'],
      purpose: 'owner-memory-tombstone'
    },
    idempotencyKey: 'axiom-one-memory-tombstone-0002'
  });
  assert.equal(correctionTombstoned.status, 'completed');
  assert.equal((await client.call('memory.list')).objects.length, 0);
});

function rawRequest(port, path, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.once('end', () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

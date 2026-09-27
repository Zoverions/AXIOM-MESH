import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { signedFetch } from '../src/lib/client.mjs';
import { ReplayGuard, ensureMeshIdentity, verifySignedRequest } from '../src/lib/identity.mjs';

test('plain-HTTP signed requests send exactly the path they signed', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-signed-path-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'gateway', { create: true });
  const replayGuard = new ReplayGuard();
  const received = [];
  const server = http.createServer(async (req, res) => {
    received.push(req.url);
    try {
      await verifySignedRequest({
        req,
        body: Buffer.alloc(0),
        audience: 'grid',
        dataDir,
        allowedCallers: ['gateway'],
        replayGuard
      });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    } catch (error) {
      res.writeHead(401, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: { code: error.code, message: error.message } }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;

  // An empty query is dropped by URL normalization, which the signature
  // covers; the raw `?` used to go on the wire instead and fail verification.
  for (const suffix of ['', '?', '?limit=5']) {
    const result = await signedFetch(identity, 'grid', `${origin}/internal/v1/capsules${suffix}`);
    assert.deepEqual(result, { ok: true }, `suffix ${JSON.stringify(suffix)}`);
  }
  assert.deepEqual(received, [
    '/internal/v1/capsules',
    '/internal/v1/capsules',
    '/internal/v1/capsules?limit=5'
  ]);
  // A fragment never leaves the caller: the network policy refuses it.
  await assert.rejects(
    () => signedFetch(identity, 'grid', `${origin}/internal/v1/capsules#fragment`),
    /network policy/
  );
  assert.equal(received.length, 3);
});

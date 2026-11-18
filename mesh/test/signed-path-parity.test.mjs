import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { signedFetch } from '../src/lib/client.mjs';
import {
  ReplayGuard,
  ensureMeshIdentity,
  signedRequestHeaders,
  verifySignedRequest
} from '../src/lib/identity.mjs';

test('signed service request proof rejects method, path, audience, and body mutation', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-signed-request-binding-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'gateway', { create: true });
  const url = 'http://127.0.0.1/internal/v1/protected?item=1';
  const body = Buffer.from('{"operation":"inspect"}');

  const signed = () => signedRequestHeaders(identity, {
    method: 'POST',
    url,
    audience: 'grid',
    body
  });
  const verify = ({
    headers = signed(),
    method = 'POST',
    path = '/internal/v1/protected?item=1',
    requestBody = body,
    verifierAudience = 'grid'
  } = {}) => verifySignedRequest({
    req: { headers, method, url: path },
    body: requestBody,
    audience: verifierAudience,
    dataDir,
    allowedCallers: ['gateway'],
    replayGuard: new ReplayGuard()
  });

  await verify();

  await assert.rejects(
    () => verify({ method: 'GET' }),
    error => error?.code === 'invalid_service_signature'
  );
  await assert.rejects(
    () => verify({ path: '/internal/v1/protected?item=2' }),
    error => error?.code === 'invalid_service_signature'
  );
  await assert.rejects(
    () => verify({ verifierAudience: 'sandbox' }),
    error => error?.code === 'incompatible_interface'
  );
  await assert.rejects(
    () => verify({
      headers: {
        ...signed(),
        'x-axiom-audience': 'sandbox',
        'x-axiom-interface': 'axiom.sandbox.v1'
      },
      verifierAudience: 'sandbox'
    }),
    error => error?.code === 'invalid_service_signature'
  );
  const mutatedBody = Buffer.from('{"operation":"modify"}');
  await assert.rejects(
    () => verify({ requestBody: mutatedBody }),
    error => error?.code === 'body_digest_mismatch'
  );
  await assert.rejects(
    () => verify({
      headers: {
        ...signed(),
        'x-axiom-content-sha256': createHash('sha256').update(mutatedBody).digest('hex')
      },
      requestBody: mutatedBody
    }),
    error => error?.code === 'invalid_service_signature'
  );
});

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

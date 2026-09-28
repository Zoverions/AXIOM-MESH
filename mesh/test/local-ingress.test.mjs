import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startLocalIngressBridge } from '../src/local-ingress.mjs';

test('local Unix-domain ingress bridges only to loopback', {
  skip: process.platform === 'win32'
}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-ingress-'));
  const socketPath = join(directory, 'gateway.sock');
  const upstream = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"status":"ready"}');
  });
  await new Promise((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const bridge = await startLocalIngressBridge({
    socketPath,
    targetPort: upstream.address().port
  });
  t.after(async () => {
    await bridge.close();
    await new Promise(resolve => upstream.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const payload = await new Promise((resolve, reject) => {
    const request = http.get({
      socketPath,
      path: '/ready'
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
      });
      response.on('end', () => resolve({
        status: response.statusCode,
        body
      }));
    });
    request.once('error', reject);
  });
  assert.deepEqual(payload, {
    status: 200,
    body: '{"status":"ready"}'
  });
});

test('local ingress refuses to replace a non-socket path', {
  skip: process.platform === 'win32'
}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-ingress-'));
  const socketPath = join(directory, 'gateway.sock');
  await writeFile(socketPath, 'preserve-me');
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(
    () => startLocalIngressBridge({
      socketPath,
      targetPort: 8080
    }),
    /not a Unix-domain socket/
  );
});

test('local ingress refuses to replace a live Unix-domain socket', {
  skip: process.platform === 'win32'
}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-ingress-'));
  const socketPath = join(directory, 'gateway.sock');
  const existing = net.createServer(socket => {
    socket.on('error', () => {});
    socket.end('existing');
  });
  t.after(async () => {
    if (existing.listening) await new Promise(resolve => existing.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  try {
    await new Promise((resolve, reject) => {
      existing.once('error', reject);
      existing.listen(socketPath, resolve);
    });
  } catch (error) {
    if (error.code === 'EPERM') {
      t.skip('This sandbox does not permit Unix-domain listeners');
      return;
    }
    throw error;
  }

  const attempt = await startLocalIngressBridge({
    socketPath,
    targetPort: 8080
  }).then(bridge => ({ bridge }), error => ({ error }));
  if (attempt.bridge) t.after(() => attempt.bridge.close());

  assert.match(attempt.error?.message ?? '', /already in use/);
  const reply = await new Promise((resolve, reject) => {
    const connection = net.createConnection(socketPath);
    let body = '';
    connection.setEncoding('utf8');
    connection.on('data', chunk => { body += chunk; });
    connection.once('end', () => resolve(body));
    connection.once('error', reject);
  });
  assert.equal(reply, 'existing');
});

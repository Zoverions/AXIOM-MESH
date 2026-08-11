import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startDevelopmentStack } from '../src/dev.mjs';
import { startLocalIngressBridge } from '../src/local-ingress.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const TOKEN_ALPHA = `alpha-${'a'.repeat(48)}`;
const TOKEN_BETA = `beta-${'b'.repeat(48)}`;
const TOKEN_INVALID = `invalid-${'x'.repeat(48)}`;

function apiTokens() {
  return {
    [TOKEN_ALPHA]: {
      id: 'tenant.alpha',
      type: 'human',
      roles: ['operator'],
      scopes: ['*']
    },
    [TOKEN_BETA]: {
      id: 'tenant.beta',
      type: 'human',
      roles: ['operator'],
      scopes: ['*']
    }
  };
}

async function startStack(t, prefix, { localIngress }) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const lease = await reserveProductionPortBlock(prefix);
  const basePort = lease.base_port;
  const socketPath = join(root, 'gateway.sock');
  let stack;
  let bridge;
  t.after(async () => {
    try {
      await bridge?.close();
      await stack?.stop();
    } finally {
      await lease.release();
      await rm(root, { recursive: true, force: true });
    }
  });

  stack = await startDevelopmentStack({
    dataDir: join(root, 'data'),
    environment: 'test',
    autoBootstrap: true,
    gatewaySocket: localIngress ? socketPath : null,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 3,
    rateLimitRefillPerSecond: 0,
    apiTokens: apiTokens()
  });

  if (localIngress) {
    bridge = await startLocalIngressBridge({
      socketPath,
      targetPort: basePort
    });
  }

  return {
    socketPath,
    gateway: `http://127.0.0.1:${basePort}`
  };
}

function socketRequest(socketPath, path, { token } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      path,
      method: 'GET',
      agent: false,
      headers: token ? { authorization: `Bearer ${token}` } : {}
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = text;
        try { body = JSON.parse(text); } catch {}
        resolve({ status: response.statusCode, body });
      });
    });
    request.once('error', reject);
    request.end();
  });
}

async function directRequest(gateway, path, { token } = {}) {
  const response = await fetch(`${gateway}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
  return { status: response.status, body: await response.json() };
}

test('Unix ingress cannot starve readiness or make one principal spend another principal budget', {
  skip: process.platform === 'win32'
}, async t => {
  const { socketPath, gateway } = await startStack(t, 'axiom-a3-local-', {
    localIngress: true
  });

  const probes = await Promise.all(
    Array.from({ length: 30 }, () => socketRequest(socketPath, '/ready'))
  );
  assert.equal(probes.every(result => result.status === 200), true);

  // The orchestrator-style direct loopback healthcheck remains available after
  // external Unix-socket probe pressure; no caller can spend a readiness token
  // that makes this request return 429.
  const healthcheck = await directRequest(gateway, '/ready');
  assert.equal(healthcheck.status, 200);
  assert.equal(healthcheck.body.status, 'ready');

  for (let index = 0; index < 3; index += 1) {
    assert.equal(
      (await socketRequest(socketPath, '/v1/status', { token: TOKEN_ALPHA })).status,
      200
    );
  }
  const alphaLimited = await socketRequest(socketPath, '/v1/status', {
    token: TOKEN_ALPHA
  });
  assert.equal(alphaLimited.status, 429);
  assert.equal(alphaLimited.body.error.code, 'rate_limited');
  assert.match(alphaLimited.body.error.message, /Principal request/);

  for (let index = 0; index < 3; index += 1) {
    const invalid = await socketRequest(socketPath, '/v1/status', {
      token: TOKEN_INVALID
    });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error.code, 'invalid_token');
  }
  const invalidLimited = await socketRequest(socketPath, '/v1/status', {
    token: TOKEN_INVALID
  });
  assert.equal(invalidLimited.status, 429);
  assert.equal(invalidLimited.body.error.code, 'rate_limited');
  assert.match(invalidLimited.body.error.message, /Invalid-authentication/);

  // Neither alpha's principal pressure nor invalid-token pressure consumes
  // beta's principal-specific budget despite every bridged request appearing to
  // the Gateway as the same loopback source address.
  const betaFirst = await socketRequest(socketPath, '/v1/status', {
    token: TOKEN_BETA
  });
  assert.equal(betaFirst.status, 200);
});

test('direct-network mode retains source-address rate limiting', async t => {
  const { gateway } = await startStack(t, 'axiom-a3-direct-', {
    localIngress: false
  });

  for (let index = 0; index < 3; index += 1) {
    assert.equal(
      (await directRequest(gateway, '/v1/status', { token: TOKEN_ALPHA })).status,
      200
    );
  }

  const betaSameAddress = await directRequest(gateway, '/v1/status', {
    token: TOKEN_BETA
  });
  assert.equal(betaSameAddress.status, 429);
  assert.equal(betaSameAddress.body.error.code, 'rate_limited');
  assert.match(betaSameAddress.body.error.message, /IP request/);
});

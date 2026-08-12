import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';

import {
  REPOSITORY_OPERATOR_REQUEST_SCHEMA,
  REPOSITORY_OPERATOR_RESPONSE_SCHEMA,
  startRepositoryOperatorService
} from '../src/repository-operator/service.mjs';

async function socketPathFor(t) {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\axiom-repository-operator-test-${process.pid}-${randomUUID()}`;
  }
  const dir = await mkdtemp(join(tmpdir(), 'axiom-repo-operator-exclusion-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'operator.sock');
}

function windowsTestTransport() {
  return process.platform === 'win32' ? { allowTestOnlyWindowsNamedPipe: true } : {};
}

function connect(socketPath) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: socketPath });
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

function readResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => { buffer = Buffer.concat([buffer, chunk]); });
    socket.once('end', () => {
      try {
        resolve(JSON.parse(buffer.toString('utf8').trim()));
      } catch (error) {
        reject(error);
      }
    });
    socket.once('error', reject);
  });
}

test('connections admitted while idle cannot execute two repository effects concurrently', async t => {
  const socketPath = await socketPathFor(t);
  let concurrent = 0;
  let peak = 0;
  let invocations = 0;

  const service = await startRepositoryOperatorService({
    socketPath,
    ...windowsTestTransport(),
    runOperator: async () => {
      invocations += 1;
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await sleep(200);
      concurrent -= 1;
      return { receipt: { regression: true } };
    }
  });
  t.after(() => service.close());

  // Both peers must be accepted while the service is idle. This is the ordering
  // that bypassed the old connection-time-only exclusion check.
  const [left, right] = await Promise.all([
    connect(socketPath),
    connect(socketPath)
  ]);

  const payload = `${JSON.stringify({
    schema: REPOSITORY_OPERATOR_REQUEST_SCHEMA,
    prepared_effect: { regression: 'prepared' },
    grid_prepared_event: { regression: 'grid-proof' }
  })}\n`;

  const leftResponse = readResponse(left);
  const rightResponse = readResponse(right);
  left.write(payload);
  right.write(payload);

  const responses = await Promise.all([leftResponse, rightResponse]);
  const successes = responses.filter(response => (
    response.schema === REPOSITORY_OPERATOR_RESPONSE_SCHEMA
    && response.receipt?.regression === true
  ));
  const busy = responses.filter(response => response.error?.code === 'repository_operator_busy');

  assert.equal(invocations, 1);
  assert.equal(peak, 1);
  assert.equal(successes.length, 1);
  assert.equal(busy.length, 1);
});

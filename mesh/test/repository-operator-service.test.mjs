import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { lstat, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  buildPreparedRepositoryDocsEffect,
  buildRepositoryDocsEffectPlan,
  buildRepositoryDocsEffectReceipt
} from '../src/lib/repository-docs-effect.mjs';
import { invokeRepositoryOperator } from '../src/hypervisor/repository-operator-client.mjs';
import { runGitHubRepositoryDocsOperator } from '../src/repository-operator/github-docs-operator.mjs';
import {
  REPOSITORY_OPERATOR_REQUEST_SCHEMA,
  REPOSITORY_OPERATOR_RESPONSE_SCHEMA,
  startRepositoryOperatorService
} from '../src/repository-operator/service.mjs';

const BASE_SHA = 'a'.repeat(40);
const OLD_BLOB = 'b'.repeat(40);
const HEAD_SHA = 'c'.repeat(40);
const NEW_BLOB = 'd'.repeat(40);
const OLD_CONTENT = '# old\n';
const NEW_CONTENT = '# new\n';
const TOKEN = 'ghp_transport_secret_never_crosses_socket';
const TOKEN_PATH = '/run/secrets/repository-operator.token';
const D = char => char.repeat(64);

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function effectFixture() {
  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const grid = identity('grid');
  const now = Date.now();
  const plannedAt = new Date(now - 2_000).toISOString();
  const expiresAt = new Date(now + 5 * 60_000).toISOString();
  const plan = buildRepositoryDocsEffectPlan({
    identity: operator,
    base_sha: BASE_SHA,
    changes: [{
      path: 'docs/transport.md',
      operation: 'update',
      old_blob_sha: OLD_BLOB,
      old_content_sha256: sha256(OLD_CONTENT),
      new_content: NEW_CONTENT
    }],
    planned_at: plannedAt,
    expires_at: expiresAt
  });
  const prepared = buildPreparedRepositoryDocsEffect({
    identity: hypervisor,
    plan,
    operatorPublicKey: operator.publicKey,
    source_bindings: {
      intent_id: 'intent-repository-transport',
      intent_digest: D('1'),
      handoff_digest: D('2'),
      remediation_proposal_id: `intent-remediation:${D('3')}`,
      remediation_proposal_digest: D('3'),
      principal: 'operator-human',
      machine_authority_digest: null
    },
    authority_bindings: {
      policy_digest: D('4'),
      capability_registry_digest: D('5'),
      executor_registry_digest: D('6'),
      mapping_digest: D('7'),
      build_digest: D('8')
    },
    one_use_nonce: 'service_transport_nonce_0123456789',
    prepared_at: plannedAt,
    expires_at: expiresAt
  });
  const occurredAt = new Date(now - 1_000).toISOString();
  const envelope = {
    seq: 7,
    event_id: 'evt_repository_transport_prepare',
    trace_id: 'trace:repository-transport',
    actor: 'operator-human',
    kind: 'external.effect.prepared',
    subject: prepared.effect_id,
    occurred_at: occurredAt,
    payload_digest: digestObject({ prepared_effect: prepared }),
    prev_hash: D('9')
  };
  const eventHash = digestObject(envelope);
  const gridEvent = {
    ...envelope,
    event_hash: eventHash,
    signature: grid.signObject({ event_hash: eventHash })
  };
  return { operator, hypervisor, grid, prepared, gridEvent };
}

function fakeGitHub() {
  const state = {
    calls: [],
    branch: null,
    branchHead: null,
    content: OLD_CONTENT,
    blob: OLD_BLOB,
    changed: false,
    pr: null
  };
  const json = (value, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method ?? 'GET';
    state.calls.push({
      method,
      path: `${url.pathname}${url.search}`,
      body: options.body ? JSON.parse(options.body) : null,
      authorization: options.headers?.Authorization
    });
    if (options.headers?.Authorization !== `Bearer ${TOKEN}`) return json({ message: 'unauthorized' }, 401);

    if (method === 'GET' && url.pathname.endsWith('/git/ref/heads/main')) {
      return json({ ref: 'refs/heads/main', object: { sha: BASE_SHA } });
    }
    if (method === 'GET' && url.pathname.includes('/git/ref/heads/axiom/')) {
      return state.branch
        ? json({ ref: `refs/heads/${state.branch}`, object: { sha: state.branchHead } })
        : json({ message: 'missing' }, 404);
    }
    if (method === 'POST' && url.pathname.endsWith('/git/refs')) {
      const body = JSON.parse(options.body);
      state.branch = body.ref.replace(/^refs\/heads\//, '');
      state.branchHead = body.sha;
      return json({ ref: body.ref, object: { sha: state.branchHead } }, 201);
    }
    if (method === 'GET' && url.pathname.includes('/contents/docs/transport.md')) {
      const ref = url.searchParams.get('ref');
      const branchRead = ref === state.branch;
      const content = branchRead ? state.content : OLD_CONTENT;
      const blob = branchRead ? state.blob : OLD_BLOB;
      return json({
        type: 'file',
        encoding: 'base64',
        sha: blob,
        content: Buffer.from(content).toString('base64')
      });
    }
    if (method === 'PUT' && url.pathname.includes('/contents/docs/transport.md')) {
      const body = JSON.parse(options.body);
      state.content = Buffer.from(body.content, 'base64').toString('utf8');
      state.blob = NEW_BLOB;
      state.branchHead = HEAD_SHA;
      state.changed = true;
      if (state.pr) state.pr.head.sha = HEAD_SHA;
      return json({ content: { sha: NEW_BLOB }, commit: { sha: HEAD_SHA } });
    }
    if (method === 'GET' && url.pathname.includes('/compare/')) {
      return json({
        merge_base_commit: { sha: BASE_SHA },
        files: state.changed ? [{ filename: 'docs/transport.md', status: 'modified' }] : []
      });
    }
    if (method === 'GET' && url.pathname.endsWith('/pulls')) {
      return json(state.pr ? [state.pr] : []);
    }
    if (method === 'POST' && url.pathname.endsWith('/pulls')) {
      const body = JSON.parse(options.body);
      state.pr = {
        number: 77,
        state: 'open',
        draft: true,
        title: body.title,
        body: body.body,
        base: { ref: body.base, sha: BASE_SHA },
        head: { ref: body.head, sha: state.branchHead }
      };
      return json(state.pr, 201);
    }
    if (method === 'GET' && url.pathname.endsWith('/pulls/77')) return json(state.pr);
    return json({ message: 'unhandled' }, 404);
  };
  return { state, fetchImpl };
}

async function socketPathFor(t) {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\axiom-repository-operator-test-${process.pid}-${randomUUID()}`;
  }
  const dir = await mkdtemp(join(tmpdir(), 'axiom-repo-operator-service-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'operator.sock');
}

function windowsTestTransport() {
  return process.platform === 'win32' ? { allowTestOnlyWindowsNamedPipe: true } : {};
}

function clientArgs(socketPath, fixture) {
  return {
    socketPath,
    prepared_effect: fixture.prepared,
    grid_prepared_event: fixture.gridEvent,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    operatorPublicKey: fixture.operator.publicKey,
    timeoutMs: 5_000
  };
}

test('local operator service composes with real operator and client without crossing repository credentials', async t => {
  const fixture = effectFixture();
  const fake = fakeGitHub();
  const socketPath = await socketPathFor(t);
  let observedRequest;
  const service = await startRepositoryOperatorService({
    socketPath,
    ...windowsTestTransport(),
    runOperator: request => {
      observedRequest = structuredClone(request);
      return runGitHubRepositoryDocsOperator({
        ...request,
        operatorIdentity: fixture.operator,
        hypervisorPublicKey: fixture.hypervisor.publicKey,
        gridPublicKey: fixture.grid.publicKey,
        token: TOKEN,
        origin: 'http://127.0.0.1:43210',
        environment: 'test',
        fetchImpl: fake.fetchImpl,
        now: new Date().toISOString()
      });
    }
  });
  t.after(() => service.close());

  if (process.platform === 'win32') {
    assert.equal(service.transport, 'windows-named-pipe-test-only');
    assert.equal(service.socket_mode, 'platform-default-test-only');
  } else {
    const metadata = await lstat(socketPath);
    assert.equal(metadata.isSocket(), true);
    assert.equal(metadata.mode & 0o777, 0o600);
  }

  const receipt = await invokeRepositoryOperator(clientArgs(socketPath, fixture));
  assert.equal(receipt.pull_request_created_observed, true);
  assert.equal(receipt.merge_performed, false);
  assert.equal(fake.state.calls.some(call => ['PUT', 'POST'].includes(call.method)), true);
  assert.equal(JSON.stringify(observedRequest).includes(TOKEN), false);
  assert.equal(JSON.stringify(observedRequest).includes(TOKEN_PATH), false);
  assert.deepEqual(Object.keys(observedRequest).sort(), ['grid_prepared_event', 'prepared_effect']);
});

test('forged Grid proof crosses socket but causes zero GitHub calls', async t => {
  const fixture = effectFixture();
  const fake = fakeGitHub();
  const socketPath = await socketPathFor(t);
  const service = await startRepositoryOperatorService({
    socketPath,
    ...windowsTestTransport(),
    runOperator: request => runGitHubRepositoryDocsOperator({
      ...request,
      operatorIdentity: fixture.operator,
      hypervisorPublicKey: fixture.hypervisor.publicKey,
      gridPublicKey: fixture.grid.publicKey,
      token: TOKEN,
      origin: 'http://127.0.0.1:43210',
      environment: 'test',
      fetchImpl: fake.fetchImpl,
      now: new Date().toISOString()
    })
  });
  t.after(() => service.close());
  const forged = structuredClone(fixture.gridEvent);
  forged.payload_digest = D('0');
  await assert.rejects(
    () => invokeRepositoryOperator({ ...clientArgs(socketPath, fixture), grid_prepared_event: forged }),
    /payload digest|hash|signature/
  );
  assert.equal(fake.state.calls.length, 0);
});

test('socket path collision with ordinary file fails closed', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-repo-operator-collision-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const socketPath = join(directory, 'operator.sock');
  await writeFile(socketPath, 'not a socket');
  await assert.rejects(
    () => startRepositoryOperatorService({ socketPath, runOperator: async () => ({}) }),
    process.platform === 'win32' ? /Windows named pipes are test-only/ : /not a Unix-domain socket/
  );
});

test('Windows production transport fails closed instead of using ambient named-pipe ACLs', {
  skip: process.platform !== 'win32'
}, async () => {
  const socketPath = `\\\\.\\pipe\\axiom-repository-operator-test-${process.pid}-${randomUUID()}`;
  await assert.rejects(
    () => startRepositoryOperatorService({ socketPath, runOperator: async () => ({}) }),
    /permission-restricted Unix-domain socket/
  );
});

test('transport rejects multiple messages and oversized requests', async t => {
  const fixture = effectFixture();
  const socketPath = await socketPathFor(t);
  let calls = 0;
  const service = await startRepositoryOperatorService({
    socketPath,
    ...windowsTestTransport(),
    runOperator: async () => { calls += 1; return { receipt: {} }; }
  });
  t.after(() => service.close());

  const request = JSON.stringify({
    schema: REPOSITORY_OPERATOR_REQUEST_SCHEMA,
    prepared_effect: fixture.prepared,
    grid_prepared_event: fixture.gridEvent
  });
  const multiple = await rawSocketExchange(socketPath, `${request}\n${request}\n`);
  assert.equal(multiple.schema, REPOSITORY_OPERATOR_RESPONSE_SCHEMA);
  assert.match(multiple.error.message, /exactly one request/);
  assert.equal(calls, 0);

  const huge = `{"schema":"${REPOSITORY_OPERATOR_REQUEST_SCHEMA}","prepared_effect":{"pad":"${'x'.repeat(2 * 1024 * 1024)}"},"grid_prepared_event":{}}\n`;
  const oversized = await rawSocketExchange(socketPath, huge);
  assert.equal(oversized.error.code, 'repository_operator_request_too_large');
  assert.equal(calls, 0);
});

test('concurrent second request is rejected while first external effect is active', async t => {
  const fixture = effectFixture();
  const socketPath = await socketPathFor(t);
  let release;
  let startedResolve;
  const started = new Promise(resolve => { startedResolve = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const receipt = buildRepositoryDocsEffectReceipt({
    identity: fixture.operator,
    prepared_effect: fixture.prepared,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    operatorPublicKey: fixture.operator.publicKey,
    head_sha: HEAD_SHA,
    pull_request_number: 77,
    pull_request_id: 'github-pr:77',
    applied_files: [{ path: 'docs/transport.md', new_content_sha256: sha256(NEW_CONTENT), observed_blob_sha: NEW_BLOB }],
    observed_at: new Date().toISOString()
  });
  const service = await startRepositoryOperatorService({
    socketPath,
    ...windowsTestTransport(),
    runOperator: async () => {
      startedResolve();
      await blocked;
      return { receipt };
    }
  });
  t.after(() => service.close());
  const first = invokeRepositoryOperator(clientArgs(socketPath, fixture));
  await started;
  await assert.rejects(
    () => invokeRepositoryOperator(clientArgs(socketPath, fixture)),
    error => error?.code === 'repository_operator_busy'
  );
  release();
  assert.equal((await first).receipt_id, receipt.receipt_id);
});

test('client connection loss is unresolved and client API contains no credential argument', async t => {
  const socketPath = await socketPathFor(t);
  const fixture = effectFixture();
  await assert.rejects(
    () => invokeRepositoryOperator(clientArgs(socketPath, fixture)),
    error => error?.code === 'repository_operator_unavailable'
  );
  const sourceKeys = Object.keys(clientArgs(socketPath, fixture));
  assert.equal(sourceKeys.some(key => /token|credential|origin/i.test(key)), false);
});

function rawSocketExchange(socketPath, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: socketPath });
    let buffer = '';
    socket.once('connect', () => socket.write(payload));
    socket.on('data', chunk => { buffer += chunk.toString('utf8'); });
    socket.once('end', () => {
      try { resolve(JSON.parse(buffer.trim())); } catch (error) { reject(error); }
    });
    socket.once('error', reject);
  });
}

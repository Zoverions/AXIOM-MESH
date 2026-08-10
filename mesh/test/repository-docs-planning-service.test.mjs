import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { MeshIdentity } from '../src/lib/identity.mjs';
import { sha256 } from '../src/lib/canonical.mjs';
import { planRepositoryDocsEffect } from '../src/hypervisor/repository-operator-client.mjs';
import { buildRepositoryDocsEffectPlan } from '../src/lib/repository-docs-effect.mjs';
import { planGitHubRepositoryDocsEffect } from '../src/repository-operator/github-docs-planner.mjs';
import {
  REPOSITORY_OPERATOR_PLAN_REQUEST_SCHEMA,
  REPOSITORY_OPERATOR_REQUEST_SCHEMA,
  startRepositoryOperatorService
} from '../src/repository-operator/service.mjs';

const TOKEN = 'ghp_planning_token_must_never_cross_socket';
const BASE_SHA = 'a'.repeat(40);
const NEXT_SHA = 'f'.repeat(40);
const OLD_BLOB = 'b'.repeat(40);
const OLD_CONTENT = '# Existing\n';
const NEW_CONTENT = '# Updated by intent\n';

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

async function socketPathFor(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-repo-planner-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'planner.sock');
}

function fakePlanningGitHub({
  existing = new Map([['docs/existing.md', { sha: OLD_BLOB, content: OLD_CONTENT }]]),
  race = false
} = {}) {
  const calls = [];
  let baseReads = 0;
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({
      method: options.method ?? 'GET',
      pathname: url.pathname,
      search: url.search,
      authorization: options.headers?.Authorization,
      body: options.body
    });
    if (options.headers?.Authorization !== `Bearer ${TOKEN}`) {
      return new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401 });
    }
    if ((options.method ?? 'GET') !== 'GET') {
      return new Response(JSON.stringify({ message: 'writes forbidden' }), { status: 405 });
    }
    if (url.pathname.endsWith('/git/ref/heads/main')) {
      baseReads += 1;
      const sha = race && baseReads > 1 ? NEXT_SHA : BASE_SHA;
      return new Response(JSON.stringify({ ref: 'refs/heads/main', object: { sha } }), { status: 200 });
    }
    const marker = '/contents/';
    const index = url.pathname.indexOf(marker);
    if (index !== -1) {
      const path = url.pathname.slice(index + marker.length).split('/').map(decodeURIComponent).join('/');
      const file = existing.get(path);
      if (!file) return new Response(JSON.stringify({ message: 'missing' }), { status: 404 });
      return new Response(JSON.stringify({
        type: 'file',
        encoding: 'base64',
        sha: file.sha,
        content: Buffer.from(file.content, 'utf8').toString('base64')
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: 'unhandled' }), { status: 404 });
  };
  return { calls, fetchImpl };
}

async function planningService(t, { operator, fake, now }) {
  const socketPath = await socketPathFor(t);
  let observedPlanningRequest = null;
  const service = await startRepositoryOperatorService({
    socketPath,
    runOperator: async () => { throw new Error('execution must not be called by planning'); },
    planOperator: request => {
      observedPlanningRequest = structuredClone(request);
      return planGitHubRepositoryDocsEffect({
        ...request,
        operatorIdentity: operator,
        token: TOKEN,
        origin: 'http://127.0.0.1:43210',
        environment: 'test',
        fetchImpl: fake.fetchImpl,
        now,
        expires_at: new Date(new Date(now).valueOf() + 5 * 60_000).toISOString()
      });
    }
  });
  t.after(() => service.close());
  return { socketPath, get observedPlanningRequest() { return observedPlanningRequest; } };
}

test('update planning observes exact base/blob/content and uses GET only', async t => {
  const operator = identity('repository-operator');
  const fake = fakePlanningGitHub();
  const now = new Date().toISOString();
  const service = await planningService(t, { operator, fake, now });
  const plan = await planRepositoryDocsEffect({
    socketPath: service.socketPath,
    proposed_changes: [{ path: 'docs/existing.md', operation: 'update', new_content: NEW_CONTENT }],
    operatorPublicKey: operator.publicKey
  });

  assert.equal(plan.base_sha, BASE_SHA);
  assert.equal(plan.read_only_observation, true);
  assert.equal(plan.mutations_performed, false);
  assert.equal(plan.changes[0].old_blob_sha, OLD_BLOB);
  assert.equal(plan.changes[0].old_content_sha256, sha256(OLD_CONTENT));
  assert.equal(plan.changes[0].new_content, NEW_CONTENT);
  assert.deepEqual(fake.calls.map(call => call.method), ['GET', 'GET', 'GET']);
  assert.equal(fake.calls.some(call => call.body !== undefined), false);
  assert.equal(fake.calls.every(call => call.authorization === `Bearer ${TOKEN}`), true);
  assert.deepEqual(Object.keys(service.observedPlanningRequest), ['proposed_changes']);
  assert.equal(JSON.stringify(service.observedPlanningRequest).includes(TOKEN), false);
  assert.equal(JSON.stringify(plan).includes(TOKEN), false);
});

test('create planning proves path absence and signs null old-state fields', async t => {
  const operator = identity('repository-operator');
  const fake = fakePlanningGitHub({ existing: new Map() });
  const now = new Date().toISOString();
  const service = await planningService(t, { operator, fake, now });
  const plan = await planRepositoryDocsEffect({
    socketPath: service.socketPath,
    proposed_changes: [{ path: 'docs/new.md', operation: 'create', new_content: '# New\n' }],
    operatorPublicKey: operator.publicKey
  });
  assert.equal(plan.changes[0].operation, 'create');
  assert.equal(plan.changes[0].old_blob_sha, null);
  assert.equal(plan.changes[0].old_content_sha256, null);
  assert.deepEqual(fake.calls.map(call => call.method), ['GET', 'GET', 'GET']);
});

test('caller cannot inject base or old-content authority into planning request', async t => {
  const operator = identity('repository-operator');
  const fake = fakePlanningGitHub();
  const now = new Date().toISOString();
  const service = await planningService(t, { operator, fake, now });

  await assert.rejects(() => planRepositoryDocsEffect({
    socketPath: service.socketPath,
    proposed_changes: [{
      path: 'docs/existing.md',
      operation: 'update',
      new_content: NEW_CONTENT,
      old_blob_sha: 'c'.repeat(40)
    }],
    operatorPublicKey: operator.publicKey
  }), /unsupported fields/);
  assert.equal(fake.calls.length, 0);

  const rawRequestKeys = ['schema', 'proposed_changes'];
  assert.deepEqual(rawRequestKeys, ['schema', 'proposed_changes']);
  assert.equal(REPOSITORY_OPERATOR_PLAN_REQUEST_SCHEMA, 'axiom-repository-operator-plan-request.v1');
  assert.equal(REPOSITORY_OPERATOR_REQUEST_SCHEMA, 'axiom-repository-operator-request.v1');
});

test('prohibited source path fails before any GitHub read', async t => {
  const operator = identity('repository-operator');
  const fake = fakePlanningGitHub();
  const now = new Date().toISOString();
  const service = await planningService(t, { operator, fake, now });
  await assert.rejects(() => planRepositoryDocsEffect({
    socketPath: service.socketPath,
    proposed_changes: [{ path: 'mesh/src/status.mjs', operation: 'update', new_content: 'bad\n' }],
    operatorPublicKey: operator.publicKey
  }), /docs-only ceiling/);
  assert.equal(fake.calls.length, 0);
});

test('main branch race fails closed and emits no signed plan', async t => {
  const operator = identity('repository-operator');
  const fake = fakePlanningGitHub({ race: true });
  const now = new Date().toISOString();
  const service = await planningService(t, { operator, fake, now });
  await assert.rejects(() => planRepositoryDocsEffect({
    socketPath: service.socketPath,
    proposed_changes: [{ path: 'docs/existing.md', operation: 'update', new_content: NEW_CONTENT }],
    operatorPublicKey: operator.publicKey
  }), error => error?.code === 'repository_planner_base_race');
  assert.deepEqual(fake.calls.map(call => call.method), ['GET', 'GET', 'GET']);
});

test('tampered planning response fails client content-address/signature verification', async t => {
  const operator = identity('repository-operator');
  const socketPath = await socketPathFor(t);
  const now = new Date().toISOString();
  const valid = buildRepositoryDocsEffectPlan({
    identity: operator,
    base_sha: BASE_SHA,
    changes: [{
      path: 'docs/existing.md',
      operation: 'update',
      old_blob_sha: OLD_BLOB,
      old_content_sha256: sha256(OLD_CONTENT),
      new_content: NEW_CONTENT
    }],
    planned_at: now,
    expires_at: new Date(new Date(now).valueOf() + 5 * 60_000).toISOString()
  });
  const forged = structuredClone(valid);
  forged.base_sha = NEXT_SHA;
  const service = await startRepositoryOperatorService({
    socketPath,
    runOperator: async () => { throw new Error('not execution'); },
    planOperator: async () => forged
  });
  t.after(() => service.close());

  await assert.rejects(() => planRepositoryDocsEffect({
    socketPath,
    proposed_changes: [{ path: 'docs/existing.md', operation: 'update', new_content: NEW_CONTENT }],
    operatorPublicKey: operator.publicKey
  }), /content-addressed|signature/);
});

test('unchanged repository and fixed planning clock produce deterministic signed plans', async () => {
  const operator = identity('repository-operator');
  const now = '2026-08-10T23:30:00.000Z';
  const proposals = [{ path: 'docs/existing.md', operation: 'update', new_content: NEW_CONTENT }];
  const firstFake = fakePlanningGitHub();
  const secondFake = fakePlanningGitHub();
  const first = await planGitHubRepositoryDocsEffect({
    proposed_changes: proposals,
    operatorIdentity: operator,
    token: TOKEN,
    origin: 'http://127.0.0.1:43210',
    environment: 'test',
    fetchImpl: firstFake.fetchImpl,
    now,
    expires_at: '2026-08-10T23:35:00.000Z'
  });
  const second = await planGitHubRepositoryDocsEffect({
    proposed_changes: proposals,
    operatorIdentity: operator,
    token: TOKEN,
    origin: 'http://127.0.0.1:43210',
    environment: 'test',
    fetchImpl: secondFake.fetchImpl,
    now,
    expires_at: '2026-08-10T23:35:00.000Z'
  });
  assert.deepEqual(first, second);
});

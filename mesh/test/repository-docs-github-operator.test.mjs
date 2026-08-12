import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity, MeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { buildExternalEffectPreparedEvent } from '../src/lib/external-effect-outbox.mjs';
import {
  buildPreparedRepositoryDocsEffect,
  buildRepositoryDocsEffectPlan,
  repositoryDocsEffectBranch,
  verifyRepositoryDocsEffectReceipt
} from '../src/lib/repository-docs-effect.mjs';
import {
  readRepositoryOperatorToken,
  resolveRepositoryOperatorOrigin,
  runGitHubRepositoryDocsOperator,
  verifyDurableGridPreparation
} from '../src/repository-operator/github-docs-operator.mjs';

const TOKEN = 'ghp_test_token_must_never_escape_operator_results';
const OWNER = 'Zoverions';
const REPO = 'AXIOM-MESH';
const BASE_SHA = 'a'.repeat(40);
const OLD_BLOB_SHA = 'b'.repeat(40);
const OLD_CONTENT = '# Old status\n';
const NEW_CONTENT = '# Updated status\n\nEvidence-first repository operator.\n';
const PRINCIPAL = 'operator-human';
const D = character => character.repeat(64);

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

async function createPreparedFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-repo-operator-grid-'));
  const gridIdentity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity: gridIdentity,
    protector
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });

  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const plannedAt = new Date(Date.now() - 2_000).toISOString();
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const plan = buildRepositoryDocsEffectPlan({
    identity: operator,
    base_sha: BASE_SHA,
    changes: [{
      path: 'docs/rebuild/STATUS.md',
      operation: 'update',
      old_blob_sha: OLD_BLOB_SHA,
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
      intent_id: 'intent-docs-github-operator',
      intent_digest: D('1'),
      handoff_digest: D('2'),
      remediation_proposal_id: `intent-remediation:${D('3')}`,
      remediation_proposal_digest: D('3'),
      principal: PRINCIPAL,
      machine_authority_digest: null
    },
    authority_bindings: {
      policy_digest: D('4'),
      capability_registry_digest: D('5'),
      executor_registry_digest: D('6'),
      mapping_digest: D('7'),
      build_digest: D('8')
    },
    one_use_nonce: 'github_operator_nonce_0123456789',
    prepared_at: plannedAt,
    expires_at: expiresAt
  });
  const [gridEvent] = store.appendEvents({
    traceId: 'trace:repository-operator',
    actor: PRINCIPAL,
    events: [buildExternalEffectPreparedEvent(prepared)]
  });
  return { dataDir, store, gridIdentity, operator, hypervisor, prepared, gridEvent };
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function fakeGitHubState() {
  return {
    mainSha: BASE_SHA,
    baseFiles: new Map([
      ['docs/rebuild/STATUS.md', { sha: OLD_BLOB_SHA, content: OLD_CONTENT }]
    ]),
    branches: new Map(),
    branchFiles: new Map(),
    changed: new Map(),
    pulls: [],
    requestLog: [],
    putCount: 0,
    createPrCount: 0,
    branchCreateCount: 0,
    shaCounter: 0,
    dropAfterPutOnce: false,
    malformedBaseRef: false,
    extraChangedPath: null
  };
}

function nextSha(state, seed) {
  state.shaCounter += 1;
  return sha256(`${seed}:${state.shaCounter}`).slice(0, 40);
}

function fileForRef(state, path, ref) {
  if (ref === BASE_SHA) return state.baseFiles.get(path) ?? null;
  const files = state.branchFiles.get(ref);
  if (files?.has(path)) return files.get(path);
  return state.baseFiles.get(path) ?? null;
}

function compareFiles(state, branch) {
  const changed = state.changed.get(branch) ?? new Map();
  const files = [...changed.entries()].map(([filename, status]) => ({ filename, status }));
  if (state.extraChangedPath) files.push({ filename: state.extraChangedPath, status: 'modified' });
  return files;
}

async function startFakeGitHub(t, state = fakeGitHubState()) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let body = null;
    try { body = await readBody(req); }
    catch { res.writeHead(400); res.end(); return; }
    state.requestLog.push({
      method: req.method,
      pathname: url.pathname,
      search: url.search,
      body,
      auth_ok: req.headers.authorization === `Bearer ${TOKEN}`,
      api_version: req.headers['x-github-api-version']
    });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { message: 'bad auth' });

    if (req.method === 'GET' && url.pathname === `/repos/${OWNER}/${REPO}/git/ref/heads/main`) {
      if (state.malformedBaseRef) return json(res, 200, { object: { sha: 'not-a-sha' } });
      return json(res, 200, { ref: 'refs/heads/main', object: { sha: state.mainSha } });
    }

    const branchRefPrefix = `/repos/${OWNER}/${REPO}/git/ref/heads/`;
    if (req.method === 'GET' && url.pathname.startsWith(branchRefPrefix)) {
      const branch = decodeURIComponent(url.pathname.slice(branchRefPrefix.length));
      const sha = state.branches.get(branch);
      return sha ? json(res, 200, { ref: `refs/heads/${branch}`, object: { sha } }) : json(res, 404, { message: 'missing' });
    }

    if (req.method === 'POST' && url.pathname === `/repos/${OWNER}/${REPO}/git/refs`) {
      state.branchCreateCount += 1;
      const branch = body?.ref?.replace(/^refs\/heads\//, '');
      if (!branch || body.sha !== BASE_SHA || state.branches.has(branch)) return json(res, 422, { message: 'conflict' });
      state.branches.set(branch, BASE_SHA);
      state.branchFiles.set(branch, new Map());
      state.changed.set(branch, new Map());
      return json(res, 201, { ref: body.ref, object: { sha: BASE_SHA } });
    }

    const contentsPrefix = `/repos/${OWNER}/${REPO}/contents/`;
    if (url.pathname.startsWith(contentsPrefix)) {
      const path = url.pathname.slice(contentsPrefix.length).split('/').map(decodeURIComponent).join('/');
      if (req.method === 'GET') {
        const ref = url.searchParams.get('ref');
        const file = fileForRef(state, path, ref);
        if (!file) return json(res, 404, { message: 'missing' });
        return json(res, 200, {
          type: 'file',
          encoding: 'base64',
          sha: file.sha,
          content: Buffer.from(file.content, 'utf8').toString('base64')
        });
      }
      if (req.method === 'PUT') {
        state.putCount += 1;
        const branch = body?.branch;
        if (!state.branches.has(branch) || branch === 'main') return json(res, 422, { message: 'bad branch' });
        const current = fileForRef(state, path, branch);
        if (body?.sha && current?.sha !== body.sha) return json(res, 409, { message: 'sha conflict' });
        if (!body?.sha && current) return json(res, 422, { message: 'create conflict' });
        const content = Buffer.from(body.content, 'base64').toString('utf8');
        const blobSha = nextSha(state, `blob:${path}:${content}`);
        const headSha = nextSha(state, `commit:${branch}:${path}:${content}`);
        state.branchFiles.get(branch).set(path, { sha: blobSha, content });
        state.changed.get(branch).set(path, state.baseFiles.has(path) ? 'modified' : 'added');
        state.branches.set(branch, headSha);
        for (const pr of state.pulls) if (pr.head.ref === branch) pr.head.sha = headSha;
        if (state.dropAfterPutOnce) {
          state.dropAfterPutOnce = false;
          req.socket.destroy();
          return;
        }
        return json(res, 200, { content: { sha: blobSha }, commit: { sha: headSha } });
      }
    }

    const comparePrefix = `/repos/${OWNER}/${REPO}/compare/`;
    if (req.method === 'GET' && url.pathname.startsWith(comparePrefix)) {
      const basehead = decodeURIComponent(url.pathname.slice(comparePrefix.length));
      const [base, branch] = basehead.split('...');
      if (base !== BASE_SHA || !state.branches.has(branch)) return json(res, 404, { message: 'missing compare' });
      return json(res, 200, {
        merge_base_commit: { sha: BASE_SHA },
        files: compareFiles(state, branch)
      });
    }

    if (url.pathname === `/repos/${OWNER}/${REPO}/pulls` && req.method === 'GET') {
      const head = url.searchParams.get('head')?.replace(`${OWNER}:`, '');
      const base = url.searchParams.get('base');
      return json(res, 200, state.pulls.filter(pr => pr.state === 'open' && pr.head.ref === head && pr.base.ref === base));
    }

    if (url.pathname === `/repos/${OWNER}/${REPO}/pulls` && req.method === 'POST') {
      state.createPrCount += 1;
      const branch = body?.head;
      if (!state.branches.has(branch) || body?.base !== 'main' || body?.draft !== true) return json(res, 422, { message: 'bad pr' });
      const pr = {
        number: state.pulls.length + 100,
        state: 'open',
        draft: true,
        title: body.title,
        body: body.body,
        base: { ref: 'main', sha: BASE_SHA },
        head: { ref: branch, sha: state.branches.get(branch) }
      };
      state.pulls.push(pr);
      return json(res, 201, pr);
    }

    const prPrefix = `/repos/${OWNER}/${REPO}/pulls/`;
    if (req.method === 'GET' && url.pathname.startsWith(prPrefix)) {
      const number = Number(url.pathname.slice(prPrefix.length));
      const pr = state.pulls.find(item => item.number === number);
      return pr ? json(res, 200, pr) : json(res, 404, { message: 'missing' });
    }

    return json(res, 404, { message: 'unhandled' });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  return { state, origin: `http://127.0.0.1:${address.port}` };
}

function runArgs(fixture, fake, overrides = {}) {
  return {
    prepared_effect: fixture.prepared,
    grid_prepared_event: fixture.gridEvent,
    operatorIdentity: fixture.operator,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    gridPublicKey: fixture.gridIdentity.publicKey,
    token: TOKEN,
    origin: fake.origin,
    environment: 'test',
    now: new Date().toISOString(),
    timeoutMs: 1_500,
    ...overrides
  };
}

test('durable Grid proof is independently verified before any GitHub request', async t => {
  const fixture = await createPreparedFixture(t);
  const fake = await startFakeGitHub(t);
  const proof = verifyDurableGridPreparation({
    prepared_effect: fixture.prepared,
    grid_prepared_event: fixture.gridEvent,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    operatorPublicKey: fixture.operator.publicKey,
    gridPublicKey: fixture.gridIdentity.publicKey,
    now: new Date().toISOString()
  });
  assert.equal(proof.grid_event.subject, fixture.prepared.effect_id);

  const forged = structuredClone(fixture.gridEvent);
  forged.payload_digest = D('9');
  await assert.rejects(
    () => runGitHubRepositoryDocsOperator(runArgs(fixture, fake, { grid_prepared_event: forged })),
    /payload digest|hash|signature/
  );
  assert.equal(fake.state.requestLog.length, 0);
});

test('docs operator creates only deterministic branch, exact file update, and draft PR', async t => {
  const fixture = await createPreparedFixture(t);
  const fake = await startFakeGitHub(t);
  const result = await runGitHubRepositoryDocsOperator(runArgs(fixture, fake));
  const branch = repositoryDocsEffectBranch(fixture.prepared.effect_digest);

  assert.equal(result.branch, branch);
  assert.equal(result.mutation_count, 2);
  assert.equal(result.ambiguous_recoveries, 0);
  assert.equal(result.merge_performed, false);
  assert.equal(result.base_branch_content_changed, false);
  assert.equal(fake.state.branchCreateCount, 1);
  assert.equal(fake.state.putCount, 1);
  assert.equal(fake.state.createPrCount, 1);
  assert.equal(fake.state.pulls[0].draft, true);
  assert.equal(fake.state.pulls[0].base.ref, 'main');
  assert.equal(fake.state.pulls[0].head.ref, branch);

  const verifiedReceipt = verifyRepositoryDocsEffectReceipt(result.receipt, {
    prepared_effect: fixture.prepared,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    operatorPublicKey: fixture.operator.publicKey,
    now: new Date(Date.now() + 30_000).toISOString()
  });
  assert.equal(verifiedReceipt.pull_request_created_observed, true);
  assert.equal(verifiedReceipt.merge_performed, false);
  assert.equal(verifiedReceipt.base_branch_content_changed, false);

  const writes = fake.state.requestLog.filter(item => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(item.method));
  assert.deepEqual(writes.map(item => [item.method, item.pathname]), [
    ['POST', `/repos/${OWNER}/${REPO}/git/refs`],
    ['PUT', `/repos/${OWNER}/${REPO}/contents/docs/rebuild/STATUS.md`],
    ['POST', `/repos/${OWNER}/${REPO}/pulls`]
  ]);
  assert.equal(writes.some(item => item.body?.branch === 'main'), false);
  assert.equal(fake.state.requestLog.every(item => item.auth_ok && item.api_version === '2026-03-10'), true);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(JSON.stringify(fixture.prepared).includes(TOKEN), false);
  assert.equal(JSON.stringify(fixture.gridEvent).includes(TOKEN), false);
});

test('retry is idempotent and returns already-applied receipt without duplicate mutation', async t => {
  const fixture = await createPreparedFixture(t);
  const fake = await startFakeGitHub(t);
  const first = await runGitHubRepositoryDocsOperator(runArgs(fixture, fake));
  const counts = {
    branches: fake.state.branchCreateCount,
    puts: fake.state.putCount,
    prs: fake.state.createPrCount
  };
  const second = await runGitHubRepositoryDocsOperator(runArgs(fixture, fake));
  assert.equal(second.mutation_count, 0);
  assert.equal(second.receipt.already_applied, true);
  assert.equal(second.pull_request_number, first.pull_request_number);
  assert.deepEqual({
    branches: fake.state.branchCreateCount,
    puts: fake.state.putCount,
    prs: fake.state.createPrCount
  }, counts);
});

test('stale main SHA fails before any repository mutation', async t => {
  const fixture = await createPreparedFixture(t);
  const state = fakeGitHubState();
  state.mainSha = 'f'.repeat(40);
  const fake = await startFakeGitHub(t, state);
  await assert.rejects(
    () => runGitHubRepositoryDocsOperator(runArgs(fixture, fake)),
    error => error?.code === 'repository_operator_stale_base'
  );
  assert.equal(state.branchCreateCount, 0);
  assert.equal(state.putCount, 0);
  assert.equal(state.createPrCount, 0);
});

test('existing deterministic branch with an extra changed path fails closed', async t => {
  const fixture = await createPreparedFixture(t);
  const state = fakeGitHubState();
  const branch = repositoryDocsEffectBranch(fixture.prepared.effect_digest);
  state.branches.set(branch, BASE_SHA);
  state.branchFiles.set(branch, new Map());
  state.changed.set(branch, new Map());
  state.extraChangedPath = 'mesh/src/status.mjs';
  const fake = await startFakeGitHub(t, state);
  await assert.rejects(
    () => runGitHubRepositoryDocsOperator(runArgs(fixture, fake)),
    /unplanned changed path/
  );
  assert.equal(state.putCount, 0);
  assert.equal(state.createPrCount, 0);
});

test('successful remote file write followed by transport loss is recovered by exact readback', async t => {
  const fixture = await createPreparedFixture(t);
  const state = fakeGitHubState();
  state.dropAfterPutOnce = true;
  const fake = await startFakeGitHub(t, state);
  const result = await runGitHubRepositoryDocsOperator(runArgs(fixture, fake));
  assert.equal(state.putCount, 1);
  assert.equal(state.createPrCount, 1);
  assert.equal(result.ambiguous_recoveries, 1);
  assert.equal(result.receipt.pull_request_created_observed, true);
});

test('malformed GitHub response fails without leaking the repository token', async t => {
  const fixture = await createPreparedFixture(t);
  const state = fakeGitHubState();
  state.malformedBaseRef = true;
  const fake = await startFakeGitHub(t, state);
  let error;
  try { await runGitHubRepositoryDocsOperator(runArgs(fixture, fake)); }
  catch (caught) { error = caught; }
  assert.ok(error);
  assert.equal(String(error.message).includes(TOKEN), false);
  assert.equal(JSON.stringify(error.details ?? {}).includes(TOKEN), false);
  assert.equal(state.branchCreateCount, 0);
  assert.equal(state.putCount, 0);
  assert.equal(state.createPrCount, 0);
});

test('operator origin override is test-loopback only and token loader requires private file permissions', async t => {
  assert.equal(new URL(resolveRepositoryOperatorOrigin()).origin, 'https://api.github.com');
  assert.throws(
    () => resolveRepositoryOperatorOrigin({ origin: 'https://example.com', environment: 'test' }),
    /loopback tests/
  );
  assert.throws(
    () => resolveRepositoryOperatorOrigin({ origin: 'http://127.0.0.1:1234', environment: 'production' }),
    /loopback tests/
  );

  const dir = await mkdtemp(join(tmpdir(), 'axiom-repo-operator-token-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tokenPath = join(dir, 'github.token');
  await writeFile(tokenPath, `${TOKEN}\n`, { mode: 0o600 });
  assert.equal(await readRepositoryOperatorToken(tokenPath), TOKEN);
  if (process.platform !== 'win32') {
    await chmod(tokenPath, 0o644);
    await assert.rejects(() => readRepositoryOperatorToken(tokenPath), /group\/world accessible/);
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalJson } from '../src/lib/canonical.mjs';
import {
  AGENT_COMMONS_READONLY_LAB_SCHEMA,
  AGENT_COMMONS_READONLY_METHODS,
  AGENT_COMMONS_READONLY_REQUEST_SCHEMA,
  createAgentCommonsReadonlyLab,
  loadAgentCommonsReadonlySnapshot,
  validateAgentCommonsReadonlyManifest,
  validateAgentCommonsReadonlyResponse
} from '../src/lib/agent-commons-readonly-lab.mjs';

const manifestUrl = new URL('../../agent-commons/readonly-lab.json', import.meta.url);
const sourceUrl = new URL('../src/lib/agent-commons-readonly-lab.mjs', import.meta.url);

function request(method, id = `test-${method.replace('.', '-')}`) {
  return {
    schema: AGENT_COMMONS_READONLY_REQUEST_SCHEMA,
    id,
    method,
    params: {}
  };
}

async function committedManifest() {
  return JSON.parse(await readFile(manifestUrl, 'utf8'));
}

test('Agent Commons read-only manifest is transportless, public-only, non-authorizing, and non-claiming', async () => {
  const manifest = await committedManifest();
  const result = validateAgentCommonsReadonlyManifest(manifest);

  assert.equal(result.valid, true);
  assert.equal(result.schema, AGENT_COMMONS_READONLY_LAB_SCHEMA);
  assert.equal(result.transport, 'none');
  assert.equal(result.public_state_only, true);
  assert.equal(result.authority_granted, false);
  assert.equal(result.compatibility_claimed, false);
  assert.deepEqual(manifest.methods, AGENT_COMMONS_READONLY_METHODS);
  assert.equal(manifest.network_listener, false);
  assert.equal(manifest.private_grid_access, false);
  assert.equal(manifest.consequential_tools, false);
});

test('Agent Commons read-only manifest rejects transport, authority, compatibility, and protocol-profile elevation', async () => {
  for (const mutate of [
    manifest => { manifest.transport = 'http'; },
    manifest => { manifest.network_listener = true; },
    manifest => { manifest.private_grid_access = true; },
    manifest => { manifest.consequential_tools = true; },
    manifest => { manifest.authority_granted = true; },
    manifest => { manifest.compatibility_claimed = true; },
    manifest => { manifest.protocol_references[0].released_profile = 'future-unverified'; },
    manifest => { manifest.protocol_references[1].compatibility_claimed = true; }
  ]) {
    const manifest = structuredClone(await committedManifest());
    mutate(manifest);
    assert.throws(() => validateAgentCommonsReadonlyManifest(manifest));
  }
});

test('Agent Commons read-only snapshot exposes only bounded selected public state', async () => {
  const snapshot = await loadAgentCommonsReadonlySnapshot();

  assert.equal(snapshot.project.transport, 'none');
  assert.equal(snapshot.project.network_listener, false);
  assert.equal(snapshot.project.public_state_only, true);
  assert.equal(snapshot.project.private_grid_access, false);
  assert.equal(snapshot.project.consequential_tools, false);
  assert.equal(snapshot.project.discovery_is_not_authorization, true);

  assert.ok(snapshot.capabilities.capabilities.length > 0);
  assert.ok(snapshot.capabilities.capabilities.length <= snapshot.manifest.limits.max_capabilities);
  for (const capability of snapshot.capabilities.capabilities) {
    assert.deepEqual(Object.keys(capability).sort(), ['family', 'id', 'status']);
    assert.equal(Object.hasOwn(capability, 'evidence'), false);
    assert.equal(Object.hasOwn(capability, 'summary'), false);
  }

  assert.ok(snapshot.challenges.open_challenges.length <= snapshot.manifest.limits.max_challenges);
  assert.equal(snapshot.challenges.public_discovery_only, true);
  assert.equal(snapshot.challenges.authority_granted, false);
  assert.equal(snapshot.challenges.payment_promised, false);
  assert.equal(snapshot.challenges.evidence_certified, false);
  for (const entry of snapshot.challenges.open_challenges) {
    assert.equal(entry.status, 'open');
    assert.ok(/^[0-9a-f]{40}$/.test(entry.challenge.base_sha));
    assert.ok(Object.values(entry.challenge.authority_nonclaims).every(value => value === false));
  }

  assert.equal(snapshot.protocols.transport_implemented, false);
  assert.equal(snapshot.protocols.compatibility_claimed, false);
  assert.ok(snapshot.protocols.references.every(item => item.candidate_reference_only === true));
  assert.ok(snapshot.protocols.references.every(item => item.compatibility_claimed === false));
});

test('Agent Commons schema discovery returns only fixed public paths and content hashes', async () => {
  const lab = await createAgentCommonsReadonlyLab();
  const response = await lab.request(request('schemas.list'));
  validateAgentCommonsReadonlyResponse(response);

  assert.deepEqual(
    response.data.schemas.map(item => item.path),
    [
      'docs/architecture/contracts/agent-challenge.v1.schema.json',
      'docs/architecture/contracts/agent-feedback.v1.schema.json',
      'agent-readiness/CONTRIBUTION-RESULT.schema.json'
    ]
  );
  for (const item of response.data.schemas) {
    assert.match(item.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(item.bytes) && item.bytes > 0);
    assert.deepEqual(Object.keys(item).sort(), ['bytes', 'path', 'sha256']);
  }
});

test('Agent Commons read-only methods are deterministic, digest-bound, and response-bounded', async () => {
  const lab = await createAgentCommonsReadonlyLab();

  for (const [index, method] of AGENT_COMMONS_READONLY_METHODS.entries()) {
    const first = await lab.request(request(method, `stable-${index}`));
    const second = await lab.request(request(method, `stable-${index}`));
    assert.deepEqual(first, second);
    validateAgentCommonsReadonlyResponse(first);
    assert.ok(Buffer.byteLength(canonicalJson(first), 'utf8') <= lab.limits.max_response_bytes);
  }
});

test('Agent Commons read-only request parser rejects method, params, field, and canonical-shape injection', async () => {
  const lab = await createAgentCommonsReadonlyLab();

  await assert.rejects(
    lab.request({ ...request('project.get'), method: 'filesystem.read' }),
    /method is unsupported/
  );
  await assert.rejects(
    lab.request({ ...request('project.get'), params: { path: '../../etc/passwd' } }),
    /params fields are invalid/
  );
  await assert.rejects(
    lab.request({ ...request('project.get'), authority: true }),
    /fields are invalid/
  );

  const symbolBearing = request('project.get');
  symbolBearing[Symbol('hidden')] = 'state';
  await assert.rejects(
    lab.request(symbolBearing),
    /must contain canonical JSON data/
  );
});

test('Agent Commons read-only request byte ceiling rejects oversized hostile input before dispatch', async () => {
  const lab = await createAgentCommonsReadonlyLab();
  const oversized = {
    ...request('project.get'),
    padding: 'x'.repeat(lab.limits.max_request_bytes + 1)
  };

  await assert.rejects(
    lab.request(oversized),
    /exceeds the maximum encoded size/
  );
});

test('Agent Commons read-only session enforces a fixed request-count ceiling', async () => {
  const lab = await createAgentCommonsReadonlyLab();
  for (let index = 0; index < lab.limits.max_requests_per_session; index += 1) {
    await lab.request(request('project.get', `budget-${index}`));
  }
  await assert.rejects(
    lab.request(request('project.get', 'budget-exhausted')),
    /session request limit exceeded/
  );
});

test('Agent Commons read-only session rejects concurrent calls above one', async () => {
  const lab = await createAgentCommonsReadonlyLab();
  const first = lab.request(request('project.get', 'concurrent-1'));
  const second = lab.request(request('project.get', 'concurrent-2'));

  await assert.rejects(second, /concurrent request limit exceeded/);
  await first;
});

test('Agent Commons caller mutation cannot alter retained public snapshot state', async () => {
  const lab = await createAgentCommonsReadonlyLab();
  const first = await lab.request(request('project.get', 'mutation-1'));
  first.data.project = 'MUTATED';
  first.data.authority_granted = true;

  const second = await lab.request(request('project.get', 'mutation-2'));
  assert.equal(second.data.project, 'AXIOM-MESH');
  assert.equal(second.data.authority_granted, false);
});

test('Agent Commons verification projection points to repository checks without claiming external validation', async () => {
  const lab = await createAgentCommonsReadonlyLab();
  const response = await lab.request(request('verification.get'));

  assert.deepEqual(response.data.commands, [
    'npm run setup:check',
    'npm run agent-commons:check',
    'npm run agent-commons:challenges:check',
    'npm run check'
  ]);
  assert.equal(response.data.sensitive_findings_route, 'SECURITY.md');
  assert.equal(response.data.successful_check_is_not_authority, true);
  assert.equal(response.data.external_validation_claimed, false);
  assert.equal(response.data.production_promotion_claimed, false);
});

test('Agent Commons protocol references remain candidate metadata rather than compatibility claims', async () => {
  const lab = await createAgentCommonsReadonlyLab();
  const response = await lab.request(request('protocols.get'));
  const byFamily = new Map(response.data.references.map(item => [item.family, item]));

  assert.equal(byFamily.get('mcp').released_profile, '2026-07-28');
  assert.equal(byFamily.get('mcp').compatibility_claimed, false);
  assert.equal(byFamily.get('a2a').released_profile, '1.0.0');
  assert.equal(byFamily.get('a2a').maintenance_release, '1.0.1');
  assert.equal(byFamily.get('a2a').compatibility_claimed, false);
});

test('Agent Commons read-only implementation contains no network listener or process-execution imports', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.doesNotMatch(source, /node:(?:http|https|net|tls|dgram|child_process)/);
  assert.doesNotMatch(source, /\bcreateServer\s*\(/);
  assert.doesNotMatch(source, /\.listen\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\b(?:spawn|exec|execFile|fork)\s*\(/);
  assert.doesNotMatch(source, /\bGridStore\b/);
});

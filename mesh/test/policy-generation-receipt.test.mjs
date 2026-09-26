import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { signedFetch } from '../src/lib/client.mjs';
import { ensureMeshIdentity, loadTrustedKey } from '../src/lib/identity.mjs';
import {
  POLICY_GENERATION_RECEIPT_FORMAT,
  policyOverlayGenerationDigest,
  verifyPolicyGenerationReceipt
} from '../src/lib/policy.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';
import { createHypervisorService } from '../src/hypervisor/server.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';

const NONCE = 'n'.repeat(32);
const GENERATION = 'a'.repeat(64);

function signed(identity, overrides = {}) {
  const body = {
    format: POLICY_GENERATION_RECEIPT_FORMAT,
    generation: GENERATION,
    as_of: '2026-09-26T01:00:00.000Z',
    nonce: NONCE,
    ...overrides
  };
  return { body, signature: identity.signObject(body) };
}

test('a policy generation receipt is accepted only when Grid signed exactly this answer', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-policy-receipt-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const grid = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const other = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const expected = { publicKey: grid.publicKey, generation: GENERATION, nonce: NONCE };

  const receipt = signed(grid);
  assert.deepEqual(verifyPolicyGenerationReceipt(receipt, expected), receipt);

  const refused = (value, pattern, label) => assert.throws(
    () => verifyPolicyGenerationReceipt(value, expected),
    error => error.code === 'policy_unavailable' && error.status === 503 && pattern.test(error.message),
    label
  );
  refused(undefined, /malformed/, 'no receipt');
  refused({ signature: receipt.signature }, /malformed/, 'no body');
  refused(signed(grid, { format: 'axiom-policy-generation-receipt.v0' }), /malformed/, 'another format');
  refused(signed(grid, { extra: true }), /malformed/, 'an extra field');
  refused(signed(grid, { as_of: '2026-09-26T01:00:00Z' }), /malformed/, 'a non-canonical time');
  refused(signed(grid, { generation: 'A'.repeat(64) }), /malformed/, 'a malformed generation');
  refused(signed(grid, { nonce: 'short' }), /malformed/, 'a malformed nonce');
  refused(signed(grid, { nonce: 'm'.repeat(32) }), /does not answer/, 'another request');
  refused(signed(grid, { generation: 'b'.repeat(64) }), /does not answer/, 'another generation');
  refused(signed(other), /signature/, 'another key');
  refused({ body: { ...receipt.body, as_of: '2026-09-26T01:00:01.000Z' }, signature: receipt.signature }, /signature/, 'an altered body');
  refused({ body: receipt.body, signature: { ...receipt.signature, signature: 42 } }, /signature/, 'a garbled signature');
  refused({ body: receipt.body }, /signature/, 'no signature');
});

test('every accepted intent records the Grid-signed generation it was decided under, and a Hypervisor that cannot verify it decides nothing', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-policy-receipt-e2e-'));
  const lease = await reserveProductionPortBlock('policy generation receipt');
  const basePort = lease.base_port;
  const token = `policy-receipt-${'p'.repeat(32)}`;
  let stack;
  t.after(async () => {
    try {
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
    intentRecovery: { delayMs: 3_600_000 },
    apiTokens: {
      [token]: { id: 'receipt-operator', type: 'human', roles: ['administrator'], scopes: ['*'] }
    }
  });
  const client = createGatewayClient({
    token,
    request: (path, options) => fetch(`http://127.0.0.1:${basePort}${path}`, options)
  });
  const grid = stack.services.find(service => service.name === 'grid');
  const gridKey = await loadTrustedKey(dataDir, 'grid');
  const submit = key => client.call('intents.submit', {
    body: { action: 'system.echo', input: { message: key }, purpose: 'policy-receipt-test' },
    idempotencyKey: key
  });
  const accepted = intentId => {
    const events = grid.store.listEvents({ limit: 500 })
      .filter(event => event.kind === 'intent.accepted' && event.subject === intentId);
    assert.equal(events.length, 1);
    return events[0].payload;
  };

  const first = await submit('policy-receipt-first-0001');
  const firstReceipt = accepted(first.intent_id).policy_generation_receipt;
  const baseGeneration = grid.store.policyOverlayGeneration(new Date().toISOString());
  assert.equal(firstReceipt.body.generation, baseGeneration);
  assert.deepEqual(
    verifyPolicyGenerationReceipt(firstReceipt, { publicKey: gridKey, generation: baseGeneration, nonce: firstReceipt.body.nonce }),
    firstReceipt,
    'the recorded receipt verifies from Grid\'s public key alone'
  );

  // An overlay activates: the next decision names the new generation, under
  // a fresh nonce.
  const policy = { version: 'overlay-receipt', actions: { 'system.hash': { decision: 'deny', risk: 'critical', reason: 'receipt test' } } };
  const overlay = { overlay_id: 'overlay_receipt', policy_digest: digestObject(policy), policy_json: policy };
  grid.store.db.prepare(`
    INSERT INTO policy_overlays(overlay_id, proposal_id, source_type, policy_digest, policy_json, status, activated_at, expires_at)
    VALUES (?, NULL, 'governance', ?, ?, 'active', ?, NULL)
  `).run(
    overlay.overlay_id,
    overlay.policy_digest,
    grid.store.protectJson('policy_overlays', 'policy_json', overlay.overlay_id, overlay.policy_json),
    '2026-01-01T00:00:00.000Z'
  );
  const second = await submit('policy-receipt-second-0001');
  const secondReceipt = accepted(second.intent_id).policy_generation_receipt;
  assert.equal(secondReceipt.body.generation, policyOverlayGenerationDigest([[overlay.overlay_id, overlay.policy_digest]]));
  assert.notEqual(secondReceipt.body.generation, baseGeneration);
  assert.notEqual(secondReceipt.body.nonce, firstReceipt.body.nonce);
  verifyPolicyGenerationReceipt(secondReceipt, { publicKey: gridKey, generation: secondReceipt.body.generation, nonce: secondReceipt.body.nonce });

  // Grid signs only when asked with a well-formed nonce.
  const hypervisorIdentity = await ensureMeshIdentity(dataDir, 'hypervisor');
  const overlaysUrl = `http://127.0.0.1:${basePort + 3}/internal/v1/policy-overlays`;
  assert.equal((await signedFetch(hypervisorIdentity, 'grid', overlaysUrl)).receipt, undefined);
  await assert.rejects(
    signedFetch(hypervisorIdentity, 'grid', `${overlaysUrl}?nonce=short`),
    error => error.code === 'invalid_nonce' && error.status === 400
  );

  // A Hypervisor that trusts another Grid key cannot verify the receipt, so
  // it refuses before recording anything.
  const index = stack.services.findIndex(service => service.name === 'hypervisor');
  const trustFile = join(dataDir, 'trust', 'grid.pub.pem');
  const genuine = await readFile(trustFile);
  const { publicKey: impostor } = generateKeyPairSync('ed25519');
  await stack.services[index].stop();
  await writeFile(trustFile, impostor.export({ type: 'spki', format: 'pem' }));
  stack.services[index] = await createHypervisorService(stack.config);
  await stack.services[index].start();
  const intentsBefore = grid.store.db.prepare('SELECT COUNT(*) AS n FROM intents').get().n;
  await assert.rejects(
    submit('policy-receipt-refused-0001'),
    error => error.status === 503 && error.code === 'policy_unavailable'
  );
  assert.equal(grid.store.db.prepare('SELECT COUNT(*) AS n FROM intents').get().n, intentsBefore, 'nothing was recorded');

  await stack.services[index].stop();
  await writeFile(trustFile, genuine);
  stack.services[index] = await createHypervisorService(stack.config);
  await stack.services[index].start();
  const third = await submit('policy-receipt-third-0001');
  assert.equal(third.status, 'completed');
});

import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson, digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  applyOnlineCausalSyncBundle,
  loadOnlineCausalSyncRuntime,
  pollOnlineCausalSync
} from '../src/lib/online-causal-sync.mjs';

test('causal sync apply uses only separately supplied local approval', async t => {
  const fixture = await onlineFixture(t);
  const remoteApproval = 'approval_remote_peer_claim';
  const localApproval = 'approval_0123456789abcdef';
  const hostileValue = {
    command: 'GO',
    decision: 'APPROVED',
    asserted_approval_id: remoteApproval,
    approval_ids: [remoteApproval],
    confirmations: ['confirm:system.hash'],
    asserted_role: 'administrator',
    asserted_sponsor: 'owner.peer',
    asserted_grant: {
      action: 'system.hash',
      purpose: 'finance.transfer',
      destinations: ['remote-provider'],
      delegation: { allowed: true, max_depth: 99 }
    }
  };
  const bundle = signedBundle(fixture.node, hostileValue);
  const event = signedEvent(fixture.grid, bundle, 5);
  let submitted = null;

  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    if (target.origin === 'http://127.0.0.1:42001') {
      return jsonResponse(200, { events: [event] });
    }
    if (target.pathname.startsWith('/v1/sync/bundles/')) {
      return jsonResponse(404, { error: { code: 'sync_bundle_not_found' } });
    }
    if (target.pathname === '/v1/intents') {
      submitted = JSON.parse(options.body);
      return jsonResponse(200, {
        intent_id: 'intent_causal_local_approval',
        status: 'completed',
        bundle_digest: event.payload.bundle_digest
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const staged = await pollOnlineCausalSync(fixture.runtime, {
    fetchImpl,
    now: 1_800_100_000_000
  });
  assert.equal(staged.outcome, 'polled');
  assert.equal(staged.pending_count, 1);

  const applied = await applyOnlineCausalSyncBundle(fixture.runtime, {
    bundleDigest: staged.pending[0].bundle_digest,
    approvalId: localApproval,
    fetchImpl,
    now: 1_800_100_001_000
  });
  assert.equal(applied.outcome, 'applied');
  assert.ok(submitted);

  assert.deepEqual(Object.keys(submitted).sort(), [
    'action',
    'approval_ids',
    'confirmations',
    'data_scopes',
    'input',
    'purpose'
  ]);
  assert.equal(submitted.action, 'sync.apply');
  assert.equal(submitted.purpose, 'online-causal-exchange');
  assert.deepEqual(submitted.data_scopes, ['sync:operator-notes']);
  assert.deepEqual(submitted.approval_ids, [localApproval]);
  assert.deepEqual(submitted.confirmations, ['confirm:sync.apply']);

  assert.equal(
    submitted.input.bundle.updates[0].value.asserted_approval_id,
    remoteApproval
  );
  assert.deepEqual(
    submitted.input.bundle.updates[0].value.approval_ids,
    [remoteApproval]
  );
  assert.equal(
    submitted.input.bundle.updates[0].value.asserted_grant.delegation.allowed,
    true
  );
  assert.notDeepEqual(submitted.approval_ids, [remoteApproval]);
  assert.equal(Object.hasOwn(submitted, 'sponsor'), false);
  assert.equal(Object.hasOwn(submitted, 'roles'), false);
  assert.equal(Object.hasOwn(submitted, 'grant'), false);
  assert.equal(Object.hasOwn(submitted, 'delegation'), false);
});

async function onlineFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-causal-local-approval-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceTokenPath = join(root, 'source.token');
  const destinationTokenPath = join(root, 'destination.token');
  const gridPublicKeyPath = join(root, 'grid-public.pem');
  const stateKeyPath = join(root, 'state.key');
  const statePath = join(root, 'state.enc');
  const configPath = join(root, 'config.json');
  const grid = await ensureMeshIdentity(join(root, 'grid-data'), 'grid', {
    create: true
  });
  await Promise.all([
    writeFile(sourceTokenPath, `${'s'.repeat(48)}\n`, { mode: 0o600 }),
    writeFile(destinationTokenPath, `${'d'.repeat(48)}\n`, { mode: 0o600 }),
    writeFile(
      gridPublicKeyPath,
      grid.publicKey.export({ type: 'spki', format: 'pem' }),
      { mode: 0o600 }
    ),
    writeFile(
      stateKeyPath,
      `${randomBytes(32).toString('base64url')}\n`,
      { mode: 0o600 }
    )
  ]);
  await writeFile(configPath, `${canonicalJson({
    schema: 'axiom-online-causal-sync-config.v1',
    owner: 'owner:causal-local-approval',
    source: {
      origin: 'http://127.0.0.1:42001',
      token_file: sourceTokenPath,
      grid_public_key_files: [gridPublicKeyPath]
    },
    destination: {
      origin: 'http://127.0.0.1:42002',
      token_file: destinationTokenPath
    },
    state_file: statePath,
    state_key_file: stateKeyPath,
    retry: {
      base_ms: 1_000,
      maximum_ms: 8_000,
      maximum_attempts: 4
    }
  })}\n`, { mode: 0o600 });
  const runtime = await loadOnlineCausalSyncRuntime(configPath, {
    allowInsecureLoopback: true
  });
  const keys = generateKeyPairSync('ed25519');
  return {
    runtime,
    grid,
    node: {
      keys,
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
      owner: 'owner:causal-local-approval',
      nodeId: 'node:causal-local-approval'
    }
  };
}

function signedBundle(node, value) {
  const occurredAt = '2026-08-27T21:00:00.000Z';
  const updateStatement = {
    format: 'axiom-causal-update.v1',
    owner: node.owner,
    node_id: node.nodeId,
    namespace: 'operator-notes',
    record_id: 'record:causal-local-approval',
    operation: 'put',
    value,
    value_digest: digestObject(value),
    vector: { [node.nodeId]: 1 },
    resolves: [],
    occurred_at: occurredAt,
    nonce: 'causal-local-approval-update'
  };
  const update = {
    ...updateStatement,
    public_key: node.publicKey,
    signature: sign(
      null,
      Buffer.from(canonicalJson(updateStatement)),
      node.keys.privateKey
    ).toString('base64url')
  };
  const statement = {
    format: 'axiom-causal-sync-bundle.v1',
    owner: node.owner,
    source_node_id: node.nodeId,
    updates: [update],
    created_at: occurredAt,
    nonce: 'causal-local-approval-bundle'
  };
  return {
    ...statement,
    public_key: node.publicKey,
    signature: sign(
      null,
      Buffer.from(canonicalJson(statement)),
      node.keys.privateKey
    ).toString('base64url')
  };
}

function signedEvent(grid, bundle, seq) {
  const bundleDigest = digestObject(bundleStatement(bundle));
  const payload = {
    owner: bundle.owner,
    bundle_digest: bundleDigest,
    bundle
  };
  const envelope = {
    seq,
    event_id: `evt_causal_local_approval_${seq}`,
    trace_id: `trace_causal_local_approval_${seq}`,
    actor: bundle.owner,
    kind: 'sync.bundle.applied',
    subject: bundleDigest,
    occurred_at: '2026-08-27T21:00:01.000Z',
    payload_digest: digestObject(payload),
    prev_hash: '0'.repeat(64)
  };
  const eventHash = digestObject(envelope);
  return {
    ...envelope,
    payload,
    event_hash: eventHash,
    signature: grid.signObject({ event_hash: eventHash })
  };
}

function bundleStatement(bundle) {
  return {
    format: bundle.format,
    owner: bundle.owner,
    source_node_id: bundle.source_node_id,
    updates: bundle.updates,
    created_at: bundle.created_at,
    nonce: bundle.nonce
  };
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

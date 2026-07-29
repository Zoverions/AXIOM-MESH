import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  canonicalJson,
  digestObject
} from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  applyOnlineCausalSyncBundle,
  loadOnlineCausalSyncRuntime,
  onlineCausalSyncStatus,
  pollOnlineCausalSync
} from '../src/lib/online-causal-sync.mjs';

test('online causal sync survives partition, orders approvals, and encrypts state', async t => {
  const fixture = await onlineFixture(t);
  const firstBundle = signedBundle(fixture.node, {
    counter: 1,
    value: { title: 'sensitive baseline' },
    nonce: 'bundle-online-one'
  });
  const secondBundle = signedBundle(fixture.node, {
    counter: 2,
    value: { title: 'sensitive successor' },
    nonce: 'bundle-online-two'
  });
  const events = [
    signedEvent(fixture.grid, firstBundle, 5),
    signedEvent(fixture.grid, secondBundle, 9)
  ];
  let partitioned = true;
  const submitted = [];
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    if (target.origin === 'http://127.0.0.1:41001') {
      if (partitioned) throw new Error('controlled partition');
      const after = Number(target.searchParams.get('after'));
      return jsonResponse(200, {
        events: events.filter(event => event.seq > after)
      });
    }
    if (target.pathname.startsWith('/v1/sync/bundles/')) {
      return jsonResponse(404, {
        error: { code: 'sync_bundle_not_found' }
      });
    }
    if (target.pathname === '/v1/intents') {
      const body = JSON.parse(options.body);
      submitted.push(body);
      return jsonResponse(200, {
        intent_id: `intent_${submitted.length}`,
        status: 'completed',
        bundle_digest: body.input.bundle.bundle_digest_for_test
          ?? digestObject(bundleStatement(body.input.bundle))
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const partition = await pollOnlineCausalSync(fixture.runtime, {
    fetchImpl,
    now: 1_800_000_000_000
  });
  assert.equal(partition.outcome, 'failed');
  assert.equal(partition.source_cursor, 0);
  assert.equal(partition.failure.attempts, 1);

  const backingOff = await pollOnlineCausalSync(fixture.runtime, {
    fetchImpl,
    now: 1_800_000_000_500
  });
  assert.equal(backingOff.outcome, 'backing_off');
  assert.equal(backingOff.source_cursor, 0);

  partitioned = false;
  const staged = await pollOnlineCausalSync(fixture.runtime, {
    fetchImpl,
    now: 1_800_000_001_000
  });
  assert.equal(staged.outcome, 'polled');
  assert.equal(staged.source_cursor, 9);
  assert.equal(staged.pending_count, 2);
  assert.deepEqual(
    staged.pending.map(item => item.bundle_digest),
    events.map(event => event.payload.bundle_digest)
  );
  assert.doesNotMatch(JSON.stringify(staged), /sensitive baseline|sensitive successor/);
  assert.doesNotMatch(
    await readFile(fixture.statePath, 'utf8'),
    /sensitive baseline|sensitive successor|bundle-online-one/
  );

  await assert.rejects(
    applyOnlineCausalSyncBundle(fixture.runtime, {
      bundleDigest: events[1].payload.bundle_digest,
      approvalId: 'approval_0123456789abcdef',
      fetchImpl,
      now: 1_800_000_002_000
    }),
    error => error?.code === 'online_sync_order_required'
  );

  const firstApplied = await applyOnlineCausalSyncBundle(fixture.runtime, {
    bundleDigest: events[0].payload.bundle_digest,
    approvalId: 'approval_0123456789abcdef',
    fetchImpl,
    now: 1_800_000_003_000
  });
  assert.equal(firstApplied.outcome, 'applied');
  assert.equal(firstApplied.pending_count, 1);
  const secondApplied = await applyOnlineCausalSyncBundle(fixture.runtime, {
    bundleDigest: events[1].payload.bundle_digest,
    approvalId: 'approval_fedcba9876543210',
    fetchImpl,
    now: 1_800_000_004_000
  });
  assert.equal(secondApplied.pending_count, 0);
  assert.deepEqual(
    submitted.map(item => item.purpose),
    ['online-causal-exchange', 'online-causal-exchange']
  );
  assert.deepEqual(
    submitted.map(item => item.confirmations),
    [['confirm:sync.apply'], ['confirm:sync.apply']]
  );
  assert.equal((await onlineCausalSyncStatus(fixture.runtime)).receipts.length, 2);
});

test('online causal sync rejects source evidence tampering without advancing', async t => {
  const fixture = await onlineFixture(t, 'tamper');
  const bundle = signedBundle(fixture.node, {
    counter: 1,
    value: { title: 'authentic' },
    nonce: 'bundle-tamper-one'
  });
  const event = signedEvent(fixture.grid, bundle, 4);
  event.payload.bundle.updates[0].value.title = 'tampered';
  const fetchImpl = async url => {
    const target = new URL(url);
    if (target.origin === 'http://127.0.0.1:41001') {
      return jsonResponse(200, { events: [event] });
    }
    throw new Error(`Destination must not be contacted: ${url}`);
  };
  const status = await pollOnlineCausalSync(fixture.runtime, {
    fetchImpl,
    now: 1_800_000_100_000
  });
  assert.equal(status.outcome, 'failed');
  assert.equal(status.failure.code, 'online_sync_evidence_invalid');
  assert.equal(status.source_cursor, 0);
  assert.equal(status.pending_count, 0);
});

test('destination preflight absorbs duplicate delivery without approval', async t => {
  const fixture = await onlineFixture(t, 'duplicate');
  const bundle = signedBundle(fixture.node, {
    counter: 1,
    value: { title: 'already converged' },
    nonce: 'bundle-duplicate-one'
  });
  const event = signedEvent(fixture.retiredGrid, bundle, 3);
  let submitted = false;
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    if (target.origin === 'http://127.0.0.1:41001') {
      return jsonResponse(200, { events: [event] });
    }
    if (target.pathname.startsWith('/v1/sync/bundles/')) {
      return jsonResponse(200, {
        owner: 'owner:online',
        bundle_digest: event.payload.bundle_digest
      });
    }
    if (options.method === 'POST') submitted = true;
    throw new Error(`Unexpected URL ${url}`);
  };
  const status = await pollOnlineCausalSync(fixture.runtime, {
    fetchImpl,
    now: 1_800_000_200_000
  });
  assert.equal(status.source_cursor, 3);
  assert.equal(status.pending_count, 0);
  assert.equal(status.source_grid_key_digests.length, 2);
  assert.equal(status.receipts[0].outcome, 'already_present');
  assert.equal(submitted, false);
});

test('a rejected approval can be replaced without idempotency deadlock', async t => {
  const fixture = await onlineFixture(t, 'approval-retry');
  const bundle = signedBundle(fixture.node, {
    counter: 1,
    value: { title: 'approval retry' },
    nonce: 'bundle-approval-retry'
  });
  const event = signedEvent(fixture.grid, bundle, 7);
  const idempotencyKeys = [];
  let postCount = 0;
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    if (target.origin === 'http://127.0.0.1:41001') {
      return jsonResponse(200, { events: [event] });
    }
    if (target.pathname.startsWith('/v1/sync/bundles/')) {
      return jsonResponse(404, {
        error: { code: 'sync_bundle_not_found' }
      });
    }
    if (target.pathname === '/v1/intents') {
      postCount += 1;
      idempotencyKeys.push(options.headers['idempotency-key']);
      if (postCount === 1) {
        return jsonResponse(409, {
          error: { code: 'approval_mismatch' }
        });
      }
      return jsonResponse(200, {
        intent_id: 'intent_approval_retry',
        status: 'completed',
        bundle_digest: event.payload.bundle_digest
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const staged = await pollOnlineCausalSync(fixture.runtime, {
    fetchImpl,
    now: 1_800_000_300_000
  });
  await assert.rejects(
    applyOnlineCausalSyncBundle(fixture.runtime, {
      bundleDigest: staged.pending[0].bundle_digest,
      approvalId: 'approval_aaaaaaaaaaaaaaaa',
      fetchImpl,
      now: 1_800_000_301_000
    }),
    error => (
      error?.code === 'online_sync_destination_rejected'
      && error?.details?.remote_code === 'approval_mismatch'
    )
  );
  const applied = await applyOnlineCausalSyncBundle(fixture.runtime, {
    bundleDigest: staged.pending[0].bundle_digest,
    approvalId: 'approval_bbbbbbbbbbbbbbbb',
    fetchImpl,
    now: 1_800_000_302_000
  });
  assert.equal(applied.outcome, 'applied');
  assert.equal(applied.pending_count, 0);
  assert.equal(idempotencyKeys.length, 2);
  assert.notEqual(idempotencyKeys[0], idempotencyKeys[1]);
});

async function onlineFixture(t, suffix = 'ordered') {
  const root = await mkdtemp(join(tmpdir(), `axiom-online-sync-${suffix}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceTokenPath = join(root, 'source.token');
  const destinationTokenPath = join(root, 'destination.token');
  const gridPublicKeyPath = join(root, 'grid-public.pem');
  const retiredGridPublicKeyPath = join(root, 'grid-retired-public.pem');
  const stateKeyPath = join(root, 'state.key');
  const statePath = join(root, 'state.enc');
  const configPath = join(root, 'config.json');
  const grid = await ensureMeshIdentity(join(root, 'grid-data'), 'grid', {
    create: true
  });
  const retiredGrid = await ensureMeshIdentity(
    join(root, 'grid-retired-data'),
    'grid-retired',
    { create: true }
  );
  await Promise.all([
    writeFile(sourceTokenPath, `${'s'.repeat(48)}\n`, { mode: 0o600 }),
    writeFile(destinationTokenPath, `${'d'.repeat(48)}\n`, { mode: 0o600 }),
    writeFile(
      gridPublicKeyPath,
      grid.publicKey.export({ type: 'spki', format: 'pem' }),
      { mode: 0o600 }
    ),
    writeFile(
      retiredGridPublicKeyPath,
      retiredGrid.publicKey.export({ type: 'spki', format: 'pem' }),
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
    owner: 'owner:online',
    source: {
      origin: 'http://127.0.0.1:41001',
      token_file: sourceTokenPath,
      grid_public_key_files: [
        gridPublicKeyPath,
        retiredGridPublicKeyPath
      ]
    },
    destination: {
      origin: 'http://127.0.0.1:41002',
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
    root,
    runtime,
    statePath,
    grid,
    retiredGrid,
    node: {
      keys,
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
      owner: 'owner:online',
      nodeId: 'node:online'
    }
  };
}

function signedBundle(node, { counter, value, nonce }) {
  const occurredAt = new Date(1_700_000_000_000 + counter * 1_000).toISOString();
  const updateStatement = {
    format: 'axiom-causal-update.v1',
    owner: node.owner,
    node_id: node.nodeId,
    namespace: 'operator-notes',
    record_id: 'record:online',
    operation: 'put',
    value,
    value_digest: digestObject(value),
    vector: { [node.nodeId]: counter },
    resolves: [],
    occurred_at: occurredAt,
    nonce: `${nonce}-update`
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
  const bundleStatementValue = {
    format: 'axiom-causal-sync-bundle.v1',
    owner: node.owner,
    source_node_id: node.nodeId,
    updates: [update],
    created_at: occurredAt,
    nonce
  };
  return {
    ...bundleStatementValue,
    public_key: node.publicKey,
    signature: sign(
      null,
      Buffer.from(canonicalJson(bundleStatementValue)),
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
    event_id: `evt_online_${seq}`,
    trace_id: `trace_online_${seq}`,
    actor: bundle.owner,
    kind: 'sync.bundle.applied',
    subject: bundleDigest,
    occurred_at: new Date(1_700_001_000_000 + seq * 1_000).toISOString(),
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

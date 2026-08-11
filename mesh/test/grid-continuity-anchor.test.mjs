import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity, MeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';
import {
  buildClaimBuildContext,
  buildGridContinuityAnchor,
  verifyGridContinuityAnchor
} from '../src/grid/continuity-anchor.mjs';

function acceptedEvent(index) {
  const intentId = `intent_continuity_${String(index).padStart(4, '0')}`;
  return {
    kind: 'intent.accepted',
    subject: intentId,
    payload: {
      intent_id: intentId,
      principal: 'person:continuity-test',
      action: 'system.echo',
      risk: 'low',
      input_digest: sha256(`input-${index}`),
      request_digest: sha256(`request-${index}`)
    }
  };
}

function exportManifest(identity, evidenceHead, {
  exportId = 'export_continuity_0001',
  principal = 'person:continuity-test',
  scope = { types: ['events'] }
} = {}) {
  const unsigned = {
    format: 'axiom-export.v1',
    schema_versions: {
      manifest: 1,
      records: 2,
      scope: 2,
      evidence: 1
    },
    export_id: exportId,
    principal,
    scope,
    created_at: '2026-08-10T20:00:00.000Z',
    record_count: 0,
    files: [{
      name: 'bundle.jsonl',
      media_type: 'application/x-ndjson',
      bytes: 0,
      sha256: sha256('')
    }],
    continuity: {
      mode: 'signed-transparency-log-head',
      evidence_head: evidenceHead
    }
  };
  return { ...unsigned, attestation: identity.signObject(unsigned) };
}

function buildContext(suffix = 'a') {
  return buildClaimBuildContext({
    schema: 'axiom-capability-registry.v1',
    kernel_version: '0.12.0-dev.3',
    capabilities: [{ id: `test.${suffix}`, status: 'implemented' }]
  });
}

function foreignIdentity() {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    'grid',
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-continuity-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector,
    checkpointInterval: 10_000
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store, identity };
}

function append(store, index) {
  return store.appendEvents({
    traceId: `trace_continuity_${String(index).padStart(4, '0')}`,
    actor: 'person:continuity-test',
    events: [acceptedEvent(index)]
  })[0];
}

test('externally retained anchor accepts exact head and a fully verified extension', async t => {
  const { store, identity } = await fixture(t);
  const first = append(store, 1);
  const manifest = exportManifest(identity, first.event_hash);
  const build = buildContext();
  const anchor = buildGridContinuityAnchor({
    store,
    sourceManifest: manifest,
    identity,
    buildContext: build,
    createdAt: '2026-08-10T20:01:00.000Z'
  });

  const exact = verifyGridContinuityAnchor({
    store,
    anchor,
    sourceManifest: manifest,
    expectedBuildContext: build
  });
  assert.equal(exact.valid, true);
  assert.equal(exact.relation, 'exact');
  assert.equal(exact.anchor_seq, 1);
  assert.equal(exact.verification_mode, 'full-plus-external-anchor');

  append(store, 2);
  const extended = verifyGridContinuityAnchor({
    store,
    anchor,
    sourceManifest: manifest,
    expectedBuildContext: build
  });
  assert.equal(extended.valid, true);
  assert.equal(extended.relation, 'extends');
  assert.equal(extended.anchor_seq, 1);
  assert.equal(extended.current_seq, 2);
  assert.equal(extended.truncation_detectable_through_seq, 1);
});

test('suffix truncation to before the retained anchor fails even after local metadata is rewritten consistently', async t => {
  const { store, identity } = await fixture(t);
  const first = append(store, 1);
  const second = append(store, 2);
  const manifest = exportManifest(identity, second.event_hash);
  const build = buildContext();
  const anchor = buildGridContinuityAnchor({
    store,
    sourceManifest: manifest,
    identity,
    buildContext: build
  });

  store.db.prepare('DELETE FROM events WHERE seq > 1').run();
  store.db.prepare("UPDATE meta SET value = ? WHERE key = 'last_seq'").run('1');
  store.db.prepare("UPDATE meta SET value = ? WHERE key = 'last_hash'").run(first.event_hash);
  assert.equal(store.verifyFullChain().valid, true);

  assert.throws(
    () => verifyGridContinuityAnchor({
      store,
      anchor,
      sourceManifest: manifest,
      expectedBuildContext: build
    }),
    error => error.code === 'continuity_truncation_detected' && error.status === 409
  );
});

test('rewriting only local head metadata cannot satisfy an externally retained anchor', async t => {
  const { store, identity } = await fixture(t);
  const first = append(store, 1);
  const second = append(store, 2);
  const manifest = exportManifest(identity, second.event_hash);
  const build = buildContext();
  const anchor = buildGridContinuityAnchor({
    store,
    sourceManifest: manifest,
    identity,
    buildContext: build
  });

  store.db.prepare("UPDATE meta SET value = ? WHERE key = 'last_seq'").run('1');
  store.db.prepare("UPDATE meta SET value = ? WHERE key = 'last_hash'").run(first.event_hash);
  assert.equal(store.verifyFullChain().valid, false);
  assert.throws(
    () => verifyGridContinuityAnchor({
      store,
      anchor,
      sourceManifest: manifest,
      expectedBuildContext: build
    }),
    error => error.code === 'integrity_verification_failed' && error.status === 503
  );
});

test('forged, wrong-Grid, stale-build, and re-addressed anchors fail closed', async t => {
  const { store, identity } = await fixture(t);
  const first = append(store, 1);
  const manifest = exportManifest(identity, first.event_hash);
  const build = buildContext('a');
  const anchor = buildGridContinuityAnchor({
    store,
    sourceManifest: manifest,
    identity,
    buildContext: build
  });

  const forged = structuredClone(anchor);
  forged.statement.evidence_head = 'f'.repeat(64);
  assert.throws(
    () => verifyGridContinuityAnchor({
      store,
      anchor: forged,
      sourceManifest: manifest,
      expectedBuildContext: build
    }),
    /digest|ID|signature|anchor/i
  );

  assert.throws(
    () => verifyGridContinuityAnchor({
      store,
      anchor,
      sourceManifest: manifest,
      expectedBuildContext: buildContext('b')
    }),
    /stale|another build/i
  );

  const otherManifest = exportManifest(identity, first.event_hash, {
    exportId: 'export_continuity_other_0001'
  });
  assert.throws(
    () => verifyGridContinuityAnchor({
      store,
      anchor,
      sourceManifest: otherManifest,
      expectedBuildContext: build
    }),
    /export_id|re-addressed|context/i
  );

  const foreign = foreignIdentity();
  const foreignManifest = exportManifest(foreign, first.event_hash);
  assert.throws(
    () => buildGridContinuityAnchor({
      store,
      sourceManifest: foreignManifest,
      identity: foreign,
      buildContext: build
    }),
    /trusted|Grid|signer|identity/i
  );
});

test('external-anchor verification is explicitly full-chain even when normal verification uses checkpoints', async t => {
  const { store, identity } = await fixture(t);
  const first = append(store, 1);
  const manifest = exportManifest(identity, first.event_hash);
  const build = buildContext();
  const anchor = buildGridContinuityAnchor({
    store,
    sourceManifest: manifest,
    identity,
    buildContext: build
  });

  const normal = store.verifyChain();
  assert.equal(normal.valid, true);
  assert.equal(normal.verification_mode, 'checkpoint');

  const anchored = verifyGridContinuityAnchor({
    store,
    anchor,
    sourceManifest: manifest,
    expectedBuildContext: build
  });
  assert.equal(anchored.local_chain_verification, 'full-genesis-reverification');
  assert.equal(anchored.verification_mode, 'full-plus-external-anchor');
});

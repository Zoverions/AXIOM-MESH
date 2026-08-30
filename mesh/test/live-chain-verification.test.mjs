import assert from 'node:assert/strict';
import test from 'node:test';

import { GridStore as CheckpointGridStore } from '../src/grid/_store-checkpoints.mjs';

function validResult(mode, lastSeq, lastHash) {
  return {
    valid: true,
    verification_mode: mode,
    count: lastSeq,
    last_seq: lastSeq,
    last_hash: lastHash
  };
}

function fixture() {
  let marker = {
    last_seq: 3,
    last_hash: 'a'.repeat(64),
    data_version: 1,
    total_changes: 10
  };
  let fullCalls = 0;
  let checkpointCalls = 0;
  const store = {
    liveChainVerificationCache: null,
    liveChainTrustedGrowth: null,
    readLiveChainMarker() {
      return structuredClone(marker);
    },
    verifyFullChain() {
      fullCalls += 1;
      return validResult('full', marker.last_seq, marker.last_hash);
    },
    verifyChain(options) {
      checkpointCalls += 1;
      assert.deepEqual(options, { mode: 'checkpoint' });
      return validResult('checkpoint', marker.last_seq, marker.last_hash);
    }
  };
  return {
    store,
    setMarker(next) {
      marker = { ...marker, ...next };
    },
    trustGrowth(next) {
      const from = structuredClone(marker);
      marker = { ...marker, ...next };
      store.liveChainTrustedGrowth = {
        from,
        to: structuredClone(marker)
      };
    },
    calls() {
      return { full: fullCalls, checkpoint: checkpointCalls };
    }
  };
}

test('live chain verification reuses an unchanged verified head and verifies only the checkpoint suffix after trusted growth', () => {
  const f = fixture();

  const first = CheckpointGridStore.prototype.verifyLiveChain.call(f.store);
  assert.equal(first.valid, true);
  assert.deepEqual(f.calls(), { full: 1, checkpoint: 0 });

  const repeated = CheckpointGridStore.prototype.verifyLiveChain.call(f.store);
  assert.equal(repeated.valid, true);
  assert.deepEqual(f.calls(), { full: 1, checkpoint: 0 });

  f.trustGrowth({
    last_seq: 6,
    last_hash: 'b'.repeat(64),
    total_changes: 16
  });
  const grown = CheckpointGridStore.prototype.verifyLiveChain.call(f.store);
  assert.equal(grown.valid, true);
  assert.deepEqual(f.calls(), { full: 1, checkpoint: 1 });
});

test('untracked mutation or head growth falls back to genesis verification', () => {
  const f = fixture();

  CheckpointGridStore.prototype.verifyLiveChain.call(f.store);
  assert.deepEqual(f.calls(), { full: 1, checkpoint: 0 });

  f.setMarker({ total_changes: 11 });
  const sameHeadMutation = CheckpointGridStore.prototype.verifyLiveChain.call(f.store);
  assert.equal(sameHeadMutation.valid, true);
  assert.deepEqual(f.calls(), { full: 2, checkpoint: 0 });

  f.setMarker({
    last_seq: 7,
    last_hash: 'c'.repeat(64),
    data_version: 2,
    total_changes: 20
  });
  const externalMutation = CheckpointGridStore.prototype.verifyLiveChain.call(f.store);
  assert.equal(externalMutation.valid, true);
  assert.deepEqual(f.calls(), { full: 3, checkpoint: 0 });
});

test('failed live verification is never cached', () => {
  let fullCalls = 0;
  const marker = {
    last_seq: 3,
    last_hash: 'd'.repeat(64),
    data_version: 1,
    total_changes: 10
  };
  const store = {
    liveChainVerificationCache: null,
    liveChainTrustedGrowth: null,
    readLiveChainMarker() {
      return structuredClone(marker);
    },
    verifyFullChain() {
      fullCalls += 1;
      return { valid: false, reason: 'signature_mismatch' };
    }
  };

  const first = CheckpointGridStore.prototype.verifyLiveChain.call(store);
  const second = CheckpointGridStore.prototype.verifyLiveChain.call(store);
  assert.equal(first.valid, false);
  assert.equal(second.valid, false);
  assert.equal(fullCalls, 2);
  assert.equal(store.liveChainVerificationCache, null);
});

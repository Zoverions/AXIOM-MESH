import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPLAY_CAPACITY_MARGIN,
  REPLAY_DECLARED_REQUESTS_PER_SECOND,
  REPLAY_DEFAULT_CAPACITY,
  REPLAY_RETENTION_SECONDS,
  ReplayGuard,
  replayGuardCapacity
} from '../src/lib/identity.mjs';

// Counts every walk over the guard's nonce map. Admission must never walk
// it: eviction works from the expiry index alone (scalability audit S-06).
class WalkCountingMap extends Map {
  walks = 0;
  [Symbol.iterator]() { this.walks += 1; return super[Symbol.iterator](); }
  entries() { this.walks += 1; return super.entries(); }
  keys() { this.walks += 1; return super.keys(); }
  values() { this.walks += 1; return super.values(); }
  forEach(...args) { this.walks += 1; return super.forEach(...args); }
}

test('replay admission never scans retained nonces, even when saturated', () => {
  const guard = new ReplayGuard({ maxEntries: 1_000 });
  const nonces = new WalkCountingMap();
  guard.nonces = nonces;
  const now = 1_000_000;
  for (let index = 0; index < 1_000; index += 1) {
    assert.equal(guard.admit('hypervisor', `n-${index}`, now + 30_000, now), 'admitted');
  }
  for (let index = 0; index < 500; index += 1) {
    assert.equal(guard.admit('hypervisor', `late-${index}`, now + 30_000, now + 1), 'saturated');
  }
  assert.equal(guard.admit('hypervisor', 'n-7', now + 30_000, now + 2), 'replayed');
  // Expiry frees capacity without a scan, exactly at the expiry time.
  assert.equal(guard.admit('hypervisor', 'fresh', now + 60_000, now + 29_999), 'saturated');
  assert.equal(guard.admit('hypervisor', 'fresh', now + 60_000, now + 30_000), 'admitted');
  assert.equal(nonces.walks, 0);
  assert.equal(guard.stats().entries, 1);
});

test('a nonce is a replay until exactly its expiry, then admissible again', () => {
  const guard = new ReplayGuard({ maxEntries: 4 });
  assert.equal(guard.admit('grid', 'a', 5_000, 1_000), 'admitted');
  assert.equal(guard.admit('grid', 'a', 9_000, 4_999), 'replayed');
  assert.equal(guard.admit('grid', 'a', 9_000, 5_000), 'admitted');
  assert.equal(guard.admit('grid', 'a', 9_000, 8_999), 'replayed');
  // The same nonce from another caller is a different entry.
  assert.equal(guard.admit('sandbox', 'a', 9_000, 8_999), 'admitted');
  // An already-expired nonce is admitted and not retained.
  assert.equal(guard.admit('grid', 'old', 1_000, 8_999), 'admitted');
  assert.equal(guard.stats().entries, 2);
  assert.throws(() => guard.admit('grid', 'b', Number.NaN, 1), RangeError);
  assert.throws(() => new ReplayGuard({ maxEntries: 0 }), RangeError);
});

test('default capacity absorbs the declared peak rate at the worst-case retention', () => {
  assert.equal(
    REPLAY_DEFAULT_CAPACITY,
    REPLAY_DECLARED_REQUESTS_PER_SECOND * REPLAY_RETENTION_SECONDS * REPLAY_CAPACITY_MARGIN
  );
  assert.equal(replayGuardCapacity({ requestsPerSecond: 10, retentionSeconds: 61, margin: 1.5 }), 915);
  // Retention for the default 30 s skew: stamped 30 s ahead, kept to +31 s.
  assert.equal(REPLAY_RETENTION_SECONDS, 2 * 30 + 1);

  // Five minutes at the declared rate, every request stamped as far ahead as
  // the skew window allows, never saturates the default guard.
  const guard = new ReplayGuard();
  const start = 1_700_000_000_000;
  let sequence = 0;
  for (let second = 0; second < 300; second += 1) {
    const now = start + second * 1_000;
    for (let index = 0; index < REPLAY_DECLARED_REQUESTS_PER_SECOND; index += 1) {
      const expiresAt = now + REPLAY_RETENTION_SECONDS * 1_000;
      assert.equal(guard.admit('hypervisor', `n-${sequence += 1}`, expiresAt, now), 'admitted');
    }
  }
  const stats = guard.stats();
  assert.equal(stats.saturated_total, 0);
  assert.ok(stats.high_water <= REPLAY_DECLARED_REQUESTS_PER_SECOND * REPLAY_RETENTION_SECONDS);
  assert.ok(stats.high_water * REPLAY_CAPACITY_MARGIN <= stats.capacity);
});

test('replay guard stats keep replay, saturation and expiry apart', () => {
  const guard = new ReplayGuard({ maxEntries: 2 });
  guard.admit('grid', 'a', 2_000, 0);
  guard.admit('grid', 'b', 3_000, 0);
  guard.admit('grid', 'a', 2_000, 1);
  guard.admit('grid', 'c', 2_000, 1);
  guard.admit('grid', 'c', 4_000, 2_500);
  assert.deepEqual({ ...guard.stats() }, {
    entries: 2,
    capacity: 2,
    high_water: 2,
    admitted_total: 3,
    replayed_total: 1,
    saturated_total: 1,
    expired_total: 1,
    max_expiry_lag_ms: 500
  });
});

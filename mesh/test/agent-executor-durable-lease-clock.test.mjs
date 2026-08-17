import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cleanupDurableState,
  createDurableStateFixture
} from './fixtures/agent-executor-durable-fixture.mjs';

test('expired durable writer cannot backdate an event to bypass lease expiry', () => {
  const current = createDurableStateFixture({ leaseSeconds: 1 });
  try {
    current.clockState.value = '2026-08-18T12:05:02.000Z';
    assert.throws(
      () => current.store.consume({
        eventId: 'event:durable:backdated-after-expiry',
        occurredAt: '2026-08-18T12:05:00.500Z'
      }),
      /writer lease expired/
    );
    assert.equal(current.store.status, 'issued');
    assert.equal(current.store.generation, 1);
  } finally {
    cleanupDurableState(current);
  }
});

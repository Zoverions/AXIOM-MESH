import assert from 'node:assert/strict';
import test from 'node:test';
import { HostContributionLeaseController } from '../src/lib/host-contribution-leases.mjs';

function lease(id, stop) {
  return {
    lease_id: id,
    unit_name: `mesh-contribution-${id}.service`,
    expires_at: '2026-09-02T17:10:00.000Z',
    stop
  };
}

test('registers bounded leases and rejects duplicate active identifiers', () => {
  const controller = new HostContributionLeaseController();
  controller.register(lease('aaaaaaaaaaaaaaaaaaaaaaaa', () => {}));
  assert.equal(controller.activeLeases().length, 1);
  assert.throws(
    () => controller.register(lease('aaaaaaaaaaaaaaaaaaaaaaaa', () => {})),
    /already active/
  );
});

test('Guardian stop-all dispatch reaches every active lease and keeps them pending until confirmed', () => {
  const calls = [];
  const controller = new HostContributionLeaseController();
  for (const id of [
    'aaaaaaaaaaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbbbbbbbbbb'
  ]) {
    controller.register(lease(id, event => calls.push(event)));
  }
  const result = controller.requestStopAll({
    reason: 'local_pause',
    guardian_state: 'NORMAL'
  });
  assert.equal(result.requested, 2);
  assert.equal(calls.length, 2);
  assert.ok(
    controller.activeLeases().every(item => item.status === 'stop_requested')
  );
  controller.confirmStopped('aaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(controller.activeLeases().length, 1);
});

test('stop dispatch attempts every lease and surfaces aggregate failure', () => {
  let secondCalled = false;
  const controller = new HostContributionLeaseController();
  controller.register(lease('aaaaaaaaaaaaaaaaaaaaaaaa', () => {
    throw new Error('systemctl unavailable');
  }));
  controller.register(lease('bbbbbbbbbbbbbbbbbbbbbbbb', () => {
    secondCalled = true;
  }));
  assert.throws(
    () => controller.requestStopAll({
      reason: 'guardian_state_change',
      guardian_state: 'QUARANTINED'
    }),
    /failed to request stop for 1 contribution lease/
  );
  assert.equal(secondCalled, true);
  const states = controller.activeLeases();
  assert.equal(
    states.find(item => item.lease_id.startsWith('a')).status,
    'stop_failed'
  );
  assert.equal(
    states.find(item => item.lease_id.startsWith('b')).status,
    'stop_requested'
  );
});

test('confirmation cannot invent or double-confirm a lease', () => {
  const controller = new HostContributionLeaseController();
  controller.register(lease('aaaaaaaaaaaaaaaaaaaaaaaa', () => {}));
  controller.confirmStopped('aaaaaaaaaaaaaaaaaaaaaaaa');
  assert.throws(
    () => controller.confirmStopped('aaaaaaaaaaaaaaaaaaaaaaaa'),
    /not active/
  );
  assert.throws(
    () => controller.confirmStopped('cccccccccccccccccccccccc'),
    /not active/
  );
});

test('lease identifiers, unit names, expiry, and stop callbacks are strictly bounded', () => {
  const controller = new HostContributionLeaseController();
  assert.throws(
    () => controller.register({ ...lease('../escape', () => {}) }),
    /lease_id/
  );
  assert.throws(
    () => controller.register({
      ...lease('aaaaaaaaaaaaaaaaaaaaaaaa', () => {}),
      unit_name: 'other.service'
    }),
    /unit_name/
  );
  assert.throws(
    () => controller.register({
      ...lease('aaaaaaaaaaaaaaaaaaaaaaaa', () => {}),
      expires_at: 'not-a-date'
    }),
    /expires_at/
  );
  assert.throws(
    () => controller.register({
      ...lease('aaaaaaaaaaaaaaaaaaaaaaaa', undefined)
    }),
    /stop/
  );
});

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { waitForSupervisorChildExit } from '../src/supervisor.mjs';

function fakeChild(killImpl) {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = killImpl.bind(null, child);
  return child;
}

test('supervisor waits for confirmed child exit after forced termination', async () => {
  let killSignal = null;
  const child = fakeChild((target, signal) => {
    killSignal = signal;
    queueMicrotask(() => {
      target.signalCode = signal;
      target.emit('exit', null, signal);
    });
    return true;
  });

  await waitForSupervisorChildExit(child, 1, { forcedExitTimeoutMs: 1_000 });

  assert.equal(killSignal, 'SIGKILL');
  assert.equal(child.signalCode, 'SIGKILL');
});

test('supervisor fails closed when forced termination never produces exit', async () => {
  let killSignal = null;
  const child = fakeChild((_target, signal) => {
    killSignal = signal;
    return true;
  });

  await assert.rejects(
    () => waitForSupervisorChildExit(child, 1, { forcedExitTimeoutMs: 5 }),
    /did not exit after forced termination/i
  );
  assert.equal(killSignal, 'SIGKILL');
});

test('supervisor does not escalate a child that exits within the graceful window', async () => {
  let killed = false;
  const child = fakeChild(() => {
    killed = true;
    return true;
  });
  queueMicrotask(() => {
    child.exitCode = 0;
    child.emit('exit', 0, null);
  });

  await waitForSupervisorChildExit(child, 1_000, { forcedExitTimeoutMs: 1_000 });

  assert.equal(killed, false);
  assert.equal(child.exitCode, 0);
});

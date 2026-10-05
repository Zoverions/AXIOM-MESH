import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCleanProductionStop,
  stopProductionHostStrict
} from '../src/lib/production-host.mjs';

test('clean production stop is accepted as a stopped-host boundary', () => {
  const result = {
    code: 0,
    signal: null,
    duration_ms: 12.5
  };

  assert.equal(
    assertCleanProductionStop(result, 'credential rotation boundary'),
    result
  );
});

test('non-zero supervisor exit cannot establish a clean stopped-host boundary', async () => {
  await assert.rejects(
    () => stopProductionHostStrict({
      exitCode: 1,
      signalCode: null
    }, {
      boundary: 'credential rotation boundary'
    }),
    /requires a clean production supervisor stop; code=1; signal=none/i
  );
});

test('forced supervisor termination cannot establish a clean stopped-host boundary', async () => {
  await assert.rejects(
    () => stopProductionHostStrict({
      exitCode: null,
      signalCode: 'SIGKILL'
    }, {
      boundary: 'data-key restore boundary'
    }),
    /requires a clean production supervisor stop; code=unknown; signal=SIGKILL/i
  );
});

test('strict production stop validates timeout and boundary inputs before use', async () => {
  await assert.rejects(
    () => stopProductionHostStrict({
      exitCode: 0,
      signalCode: null
    }, {
      timeoutMs: 0
    }),
    /stop timeout is invalid/i
  );

  assert.throws(
    () => assertCleanProductionStop({ code: 0, signal: null }, '../unsafe'),
    /boundary label is invalid/i
  );
});

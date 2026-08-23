import assert from 'node:assert/strict';
import test from 'node:test';
import { testRunnerArgs } from '../src/test-runner.mjs';

test('test runner preserves default parallelism and accepts an explicit bounded cap', () => {
  assert.deepEqual(
    testRunnerArgs(),
    ['--test', '--test-reporter=spec']
  );
  assert.deepEqual(
    testRunnerArgs({ concurrency: '1' }),
    ['--test', '--test-reporter=spec', '--test-concurrency=1']
  );
  assert.deepEqual(
    testRunnerArgs({ concurrency: 4 }),
    ['--test', '--test-reporter=spec', '--test-concurrency=4']
  );
});

test('test runner rejects malformed, zero, negative, and excessive concurrency', () => {
  for (const value of ['0', '-1', '1.5', 'abc', '65']) {
    assert.throws(
      () => testRunnerArgs({ concurrency: value }),
      /AXIOM_TEST_CONCURRENCY/
    );
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReasoningCompute } from '../src/lib/reasoning-compute-normalization.mjs';
import { digestObject } from '../src/lib/canonical.mjs';

function report({ correctItems = 3, jointlyCorrectPairs = 2 } = {}) {
  const value = {
    schema: 'axiom-reasoning-evaluation-report.v1',
    metrics: {
      counts: {
        correct_items: correctItems,
        jointly_correct_pairs: jointlyCorrectPairs
      }
    }
  };
  value.report_digest = digestObject(value);
  return value;
}

test('compute normalization keeps parameter count separate from measured work', () => {
  const normalized = normalizeReasoningCompute(report(), {
    basis: 'measured',
    source: 'hardware-counter.synthetic',
    parameter_count: 124000000,
    inference_flops: 600000,
    inference_energy_joules: 90,
    peak_memory_bytes: 2147483648
  });

  assert.equal(normalized.disclosure.parameter_count, 124000000);
  assert.equal(normalized.derived.inference_flops_per_correct_item, 200000);
  assert.equal(
    normalized.derived.inference_flops_per_jointly_correct_pair,
    300000
  );
  assert.equal(
    normalized.derived.inference_energy_joules_per_jointly_correct_pair,
    45
  );
  assert.match(normalized.disclosure_digest, /^[a-f0-9]{64}$/);
  assert.match(normalized.normalization_digest, /^[a-f0-9]{64}$/);
});

test('compute normalization does not invent efficiency when no correct pair exists', () => {
  const normalized = normalizeReasoningCompute(
    report({ correctItems: 0, jointlyCorrectPairs: 0 }),
    {
      basis: 'estimated',
      source: 'profiler.synthetic',
      inference_flops: 600000,
      training_flops: 5000000
    }
  );

  assert.equal(normalized.derived.inference_flops_per_correct_item, null);
  assert.equal(normalized.derived.inference_flops_per_jointly_correct_pair, null);
  assert.equal(normalized.disclosure.training_flops, 5000000);
});

test('compute normalization rejects undisclosed basis and empty observations', () => {
  assert.throws(
    () =>
      normalizeReasoningCompute(report(), {
        basis: 'unknown',
        source: 'missing'
      }),
    /basis must be measured, estimated, or reported/
  );

  assert.throws(
    () =>
      normalizeReasoningCompute(report(), {
        basis: 'reported',
        source: 'vendor'
      }),
    /at least one compute or model-size observation/
  );
});

test('compute normalization rejects a report whose content no longer matches its digest', () => {
  const tampered = report();
  tampered.metrics.counts.correct_items = 999;
  assert.throws(
    () =>
      normalizeReasoningCompute(tampered, {
        basis: 'measured',
        source: 'hardware-counter.synthetic',
        inference_flops: 600000
      }),
    /report_digest does not match report content/
  );
});

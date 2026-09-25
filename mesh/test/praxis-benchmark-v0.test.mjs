import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  benchmarkSource,
  benchmarkCpuRunsPerSample,
  runBenchmarks,
  checkBudgets,
  formatReport,
  syntheticProgram
} from '../../labs/praxis/bench.mjs';

test('front-end benchmarks stay within non-pathological budgets', async () => {
  const releaseUrl = new URL('../../labs/praxis/examples/release.prax', import.meta.url);
  const release = await readFile(releaseUrl, 'utf8');
  const results = runBenchmarks([
    { label: 'release.prax', source: release },
    { label: 'synthetic-1k', source: syntheticProgram(1000) },
    { label: 'synthetic-10k', source: syntheticProgram(10000) }
  ]);
  // Visible in CI logs for trend-spotting; assertions below enforce the budgets.
  console.log('\n' + formatReport(results));
  const failures = checkBudgets(results);
  assert.deepEqual(failures, [], 'benchmark budgets exceeded:\n' + failures.join('\n'));
});

test('benchmark scaling uses CPU time without weakening absolute wall-clock caps', () => {
  const withinBudget = [
    {
      label: 'synthetic-1k',
      parseMs: 1,
      parseCpuMs: 10,
      formatMs: 1
    },
    {
      label: 'synthetic-10k',
      parseMs: 4000,
      parseCpuMs: 190,
      formatMs: 4000
    }
  ];
  assert.deepEqual(checkBudgets(withinBudget), []);

  const wallClockRegression = structuredClone(withinBudget);
  wallClockRegression[1].parseMs = 5001;
  assert.ok(
    checkBudgets(wallClockRegression).some(failure => failure.includes('10k-line parse took')),
    'absolute parse wall-clock budget must remain enforced'
  );

  const cpuScalingRegression = structuredClone(withinBudget);
  cpuScalingRegression[1].parseCpuMs = 201;
  assert.ok(
    checkBudgets(cpuScalingRegression).some(failure => failure.includes('parse CPU scaling ratio')),
    '20x CPU scaling guard must remain enforced'
  );

  const missingCpuEvidence = structuredClone(withinBudget);
  delete missingCpuEvidence[0].parseCpuMs;
  assert.ok(
    checkBudgets(missingCpuEvidence).some(failure => failure.includes('CPU timing is missing')),
    'missing scaling evidence must fail closed'
  );
});

test('CPU sampling normalizes batch work by source volume within the bounded run ceiling', () => {
  const small = syntheticProgram(1000);
  const large = syntheticProgram(10000);
  const smallRuns = benchmarkCpuRunsPerSample(small.length);
  const largeRuns = benchmarkCpuRunsPerSample(large.length);

  assert.equal(smallRuns, 10);
  assert.equal(largeRuns, 1);
  assert.ok(smallRuns * 5 <= 80);
  assert.ok(largeRuns * 5 <= 80);

  const smallVolume = small.length * smallRuns;
  const largeVolume = large.length * largeRuns;
  assert.ok(
    Math.abs(smallVolume - largeVolume) / largeVolume < 0.1,
    'standard CPU batches should process comparable source volume'
  );

  assert.equal(benchmarkCpuRunsPerSample(0), 16);
  assert.equal(benchmarkCpuRunsPerSample(422), 16);
  for (const invalid of [-1, 1.5, Number.NaN]) {
    assert.throws(() => benchmarkCpuRunsPerSample(invalid), /non-negative integer/);
  }
});

function withCpuDeltas(deltas, fn) {
  const original = process.cpuUsage;
  let index = 0;
  process.cpuUsage = (start) => {
    if (start === undefined) return { user: 0, system: 0 };
    return { user: deltas[index++] ?? 0, system: 0 };
  };
  try {
    return fn(() => index);
  } finally {
    process.cpuUsage = original;
  }
}

test('CPU sampling median resists one first-batch outlier', () => {
  withCpuDeltas([100_000, 10_000, 10_000, 10_000, 10_000], getSamples => {
    const result = benchmarkSource('cpu-sampler-outlier', 'observe x = "v" from "src";\n');
    assert.equal(result.parseCpuMs, 0.625);
    assert.equal(getSamples(), 5);
  });
});

test('CPU sampling fails closed when repeated coarse zeros exhaust the bounded run budget', () => {
  withCpuDeltas([0, 0, 10_000], getSamples => {
    const result = benchmarkSource('cpu-sampler-insufficient', 'observe x = "v" from "src";\n');
    assert.equal(result.parseCpuMs, 0);
    assert.equal(getSamples(), 3);
  });
});

test('CPU sampling recovers from an initial coarse zero to a stable multi-sample median', () => {
  withCpuDeltas([0, 20_000, 10_000, 10_000], getSamples => {
    const result = benchmarkSource('cpu-sampler-coarse', 'observe x = "v" from "src";\n');
    assert.equal(result.parseCpuMs, 0.625);
    assert.equal(getSamples(), 4);
  });
});


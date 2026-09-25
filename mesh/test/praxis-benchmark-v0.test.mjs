import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
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

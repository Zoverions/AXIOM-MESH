import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  runBenchmarks,
  checkBudgets,
  formatReport,
  measureCpuPerRun,
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

test('CPU measurement stays accurate when process CPU time advances in coarse steps', () => {
  // Windows reports process CPU time in ~15.6 ms steps. A 1k-line parse costs
  // a few milliseconds, so stopping at the first non-zero reading let one step
  // stand for many runs and inflated the 1k->10k ratio in CI.
  const STEP = 15_625;
  for (const costMicros of [2_700, 31_000]) {
    for (let phase = 0; phase < STEP; phase += 625) {
      let elapsed = phase;
      const read = () => Math.floor(elapsed / STEP) * STEP;
      const cpuUsage = start => (start
        ? { user: read() - start.user, system: 0 }
        : { user: read(), system: 0 });
      const measured = measureCpuPerRun(() => { elapsed += costMicros; }, { cpuUsage }) * 1000;
      const error = Math.abs(measured - costMicros) / costMicros;
      assert.ok(
        error <= 0.2,
        `cost ${costMicros}us at phase ${phase}us measured as ${measured.toFixed(0)}us`
      );
    }
  }
});

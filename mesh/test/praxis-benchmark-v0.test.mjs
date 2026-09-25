import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  runBenchmarks,
  checkBudgets,
  formatReport,
  measureCpuPerRun,
  measureMinCpuPerRun,
  BENCHMARK_CPU_ROUNDS,
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

test('CPU evidence below the floor or non-finite is unavailable, never certified', () => {
  const exactClock = costMicros => {
    let elapsed = 0;
    const cpuUsage = start => (start
      ? { user: elapsed - start.user, system: 0 }
      : { user: elapsed, system: 0 });
    return measureCpuPerRun(() => { elapsed += costMicros; }, { cpuUsage });
  };
  // 80 runs at 1,000 us reach only 80,000 us: the ceiling came first.
  assert.equal(exactClock(1_000), null);
  // 80 runs at 1,250 us reach the 100,000 us floor exactly.
  assert.equal(exactClock(1_250), 1.25);
  assert.equal(exactClock(30_000), 30);
  const broken = value => measureCpuPerRun(() => {}, {
    cpuUsage: start => (start ? { user: value, system: 0 } : { user: 0, system: 0 })
  });
  assert.equal(broken(Number.NaN), null);
  assert.equal(broken(Number.POSITIVE_INFINITY), null);
  assert.equal(broken(0), null);
});

test('scaling and wall-clock guards reject every invalid measurement', () => {
  const valid = () => [
    { label: 'synthetic-1k', parseMs: 1, parseCpuMs: 10, formatMs: 1 },
    { label: 'synthetic-10k', parseMs: 4000, parseCpuMs: 190, formatMs: 4000 }
  ];
  assert.deepEqual(checkBudgets(valid()), []);
  const failsWith = (mutate, text) => {
    const results = valid();
    mutate(results);
    const failures = checkBudgets(results);
    assert.ok(failures.some(failure => failure.includes(text)), `${text}: ${JSON.stringify(results)}`);
  };
  for (const value of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '10']) {
    failsWith(results => { results[0].parseCpuMs = value; }, 'CPU timing is missing or invalid');
    failsWith(results => { results[1].parseCpuMs = value; }, 'CPU timing is missing or invalid');
  }
  for (const value of [undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY, '10']) {
    failsWith(results => { results[1].parseMs = value; }, '10k-line parse wall time is missing or invalid');
    failsWith(results => { results[1].formatMs = value; }, '10k-line format wall time is missing or invalid');
  }
  // Budgets themselves are unchanged.
  failsWith(results => { results[1].parseMs = 5001; }, '10k-line parse took');
  failsWith(results => { results[1].formatMs = 5001; }, '10k-line format took');
  failsWith(results => { results[1].parseCpuMs = 201; }, 'parse CPU scaling ratio');
});

test('scaling CPU time is the minimum over rounds, and any insufficient round voids it', () => {
  const rounds = values => {
    let call = 0;
    return measureMinCpuPerRun(() => {}, { measureRound: () => values[call++] });
  };
  assert.equal(BENCHMARK_CPU_ROUNDS, 5);
  // Contention only adds time: the least-disturbed round is the estimate.
  assert.equal(rounds([52.6, 31.2, 29.9, 44.0, 30.4]), 29.9);
  assert.equal(rounds([2.4, 2.4, 2.4, 2.4, 2.4]), 2.4);
  // Evidence below the floor in any round is not averaged away.
  assert.equal(rounds([30, 29, null, 31, 30]), null);
  assert.equal(rounds([null, 29, 30, 31, 30]), null);
  let calls = 0;
  measureMinCpuPerRun(() => {}, { measureRound: () => { calls += 1; return 1; } });
  assert.equal(calls, BENCHMARK_CPU_ROUNDS);
});

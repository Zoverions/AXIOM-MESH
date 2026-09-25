import test from 'node:test';
import assert from 'node:assert/strict';
import { BUDGETS, checkBudgets } from '../../labs/praxis/bench.mjs';

function validResults() {
  return [
    { label: 'synthetic-1k', parseCpuMs: 10, parseMs: 10, formatMs: 10 },
    { label: 'synthetic-10k', parseCpuMs: 190, parseMs: 190, formatMs: 100 }
  ];
}

test('both benchmark rows require finite positive CPU diagnostic measurements', () => {
  for (const index of [0, 1]) {
    for (const value of [undefined, null, NaN, Infinity, -Infinity, 0, -1, '10']) {
      const rows = validResults();
      rows[index].parseCpuMs = value;
      assert.ok(checkBudgets(rows).some(f => f.includes('CPU timing is missing or invalid')),
        `row ${index} accepted invalid CPU value ${String(value)}`);
    }
  }
});

test('large parse and format wall measurements reject missing or malformed evidence', () => {
  for (const key of ['parseMs', 'formatMs']) {
    for (const value of [undefined, null, NaN, Infinity, -Infinity, -1, '10']) {
      const rows = validResults();
      rows[1][key] = value;
      assert.ok(checkBudgets(rows).some(f => f.includes('wall timing is missing or invalid')),
        `${key} accepted invalid wall value ${String(value)}`);
    }
  }
});

test('absolute parse and format limits and the 20x isolated wall scaling limit remain unchanged', () => {
  assert.equal(BUDGETS.maxParseMs10k, 5000);
  assert.equal(BUDGETS.maxFormatMs10k, 5000);
  assert.equal(BUDGETS.maxScalingRatio, 20);
  for (const key of ['parseMs', 'formatMs']) {
    const rows = validResults();
    rows[1][key] = 5001;
    assert.ok(checkBudgets(rows).some(f => f.includes('budget 5000ms')));
  }
  const rows = validResults();
  rows[1].parseMs = 201;
  assert.ok(checkBudgets(rows).some(f => f.includes('parse wall scaling ratio') && f.includes('budget 20x')));
});

test('exact finite budget boundaries retain the prior inclusive behavior', () => {
  const rows = validResults();
  Object.assign(rows[0], { parseMs: 250 });
  Object.assign(rows[1], { parseCpuMs: 200, parseMs: 5000, formatMs: 5000 });
  assert.equal(checkBudgets(rows).length, 0);
});

test('the recorded PR 1831 CPU-only spike is diagnostic when isolated wall scaling is within budget', () => {
  const rows = validResults();
  Object.assign(rows[0], { parseCpuMs: 2.4021999999999997, parseMs: 4.1 });
  Object.assign(rows[1], { parseCpuMs: 52.5788, parseMs: 51.18573600000002, formatMs: 7.959235000000035 });
  const failures = checkBudgets(rows);
  assert.ok(!failures.some(f => f.includes('scaling ratio')));
});

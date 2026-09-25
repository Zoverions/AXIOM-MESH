import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBudgets } from '../../labs/praxis/bench.mjs';

function standardRows() {
  return [
    { label: 'synthetic-1k', parseCpuMs: 10, parseMs: 10, formatMs: 10 },
    { label: 'synthetic-10k', parseCpuMs: 190, parseMs: 190, formatMs: 100 }
  ];
}

function hasFailure(rows, expected) {
  const failures = checkBudgets(rows);
  assert.ok(failures.some(message => expected.test(message)), JSON.stringify(failures));
}

test('empty results do not certify standard benchmark budgets', () => {
  hasFailure([], /missing.*synthetic-1k/);
  hasFailure([], /missing.*synthetic-10k/);
});

test('the small standard row is required for scaling evidence', () => {
  hasFailure([standardRows()[1]], /missing.*synthetic-1k/);
});

test('the large standard row is required for wall and scaling evidence', () => {
  hasFailure([standardRows()[0]], /missing.*synthetic-10k/);
});

test('unrelated corpus rows cannot substitute for the standard corpus', () => {
  hasFailure([{ label: 'release.prax', parseCpuMs: 1, parseMs: 1, formatMs: 1 }],
    /missing.*synthetic-/);
});

test('duplicate required rows reject even when their measurements agree', () => {
  for (const index of [0, 1]) {
    const rows = standardRows();
    rows.push({ ...rows[index] });
    hasFailure(rows, new RegExp(`duplicate.*${rows[index].label}`));
  }
});

test('a duplicate cannot replace a failing standard measurement in either order', () => {
  for (const index of [0, 1]) {
    const rows = standardRows();
    const bad = { ...rows[index], parseCpuMs: index === 0 ? 0 : 201, parseMs: 5001 };
    for (const pair of [[bad, rows[index]], [rows[index], bad]]) {
      hasFailure([...pair, rows[1 - index]], new RegExp(`duplicate.*${bad.label}`));
    }
  }
});

test('complete unique standard rows remain order independent with optional corpora', () => {
  const rows = standardRows();
  const extra = { label: 'release.prax', parseCpuMs: null, parseMs: 1, formatMs: 1 };
  assert.deepEqual(checkBudgets([extra, ...rows]), []);
  assert.deepEqual(checkBudgets([rows[1], extra, rows[0]]), []);
});

test('nonstandard duplicate labels do not acquire standard-corpus requirements', () => {
  const extra = { label: 'custom.prax', parseCpuMs: null, parseMs: 1, formatMs: 1 };
  assert.deepEqual(checkBudgets([extra, ...standardRows(), { ...extra }]), []);
});

test('missing companion evidence does not hide an observed wall-budget failure', () => {
  const large = { ...standardRows()[1], parseMs: 5001 };
  hasFailure([large], /10k-line parse took 5001ms/);
});

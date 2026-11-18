import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const url = new URL('../../institutional/pattern-adoption-lifecycle.v1.json', import.meta.url);

test('institutional adoption lifecycle has no ambient authority state', async () => {
  const lifecycle = JSON.parse(await readFile(url, 'utf8'));
  assert.equal(lifecycle.schema, 'axiom-institutional-pattern-adoption-lifecycle.v1');
  assert.ok(lifecycle.states.length >= 8);
  assert.ok(lifecycle.states.every(({ authority_effect }) => authority_effect === 'none'));
  assert.match(lifecycle.invariant, /never substitutes for effect-level authorization/);
});

test('institutional adoption lifecycle forbids discovery-to-activation shortcuts', async () => {
  const lifecycle = JSON.parse(await readFile(url, 'utf8'));
  const forbidden = new Set(lifecycle.forbidden_shortcuts.map(pair => pair.join('->')));
  for (const edge of [
    'discovered->pilot_active',
    'discovered->adopted',
    'inspected->adopted',
    'simulated->adopted'
  ]) assert.ok(forbidden.has(edge), edge);

  const allowed = new Set(lifecycle.permitted_transitions.map(pair => pair.join('->')));
  assert.ok(!allowed.has('discovered->adopted'));
  assert.ok(allowed.has('discovered->inspected'));
  assert.ok(allowed.has('simulated->locally_adapted'));
});

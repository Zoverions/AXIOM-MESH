import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const url = new URL('../../agent-commons/research-relevance-resource-gate.v1.json', import.meta.url);

test('research gate distinguishes frontier work from compatibility obligations', async () => {
  const gate = JSON.parse(await readFile(url, 'utf8'));
  const ids = new Set(gate.categories.map(({id}) => id));
  for (const id of ['adopt_existing','augment_existing','novel_research','compatibility_only','park','reject']) {
    assert.ok(ids.has(id), id);
  }
  assert.match(gate.compatibility_principle, /adapters and translation layers/);
});

test('research gate requires falsifiability and opportunity-cost review', async () => {
  const gate = JSON.parse(await readFile(url, 'utf8'));
  assert.ok(gate.evaluation_dimensions.includes('falsifiability'));
  assert.ok(gate.evaluation_dimensions.includes('opportunity cost'));
  assert.equal(gate.evidence_requirements.falsification_criterion, true);
  assert.equal(gate.evidence_requirements.alternative_reuse_path, true);
});

test('research gate blocks redundant core reinvention', async () => {
  const gate = JSON.parse(await readFile(url, 'utf8'));
  assert.ok(gate.anti_dead_end_rules.some(rule => /new identity protocol/i.test(rule)));
  assert.ok(gate.anti_dead_end_rules.some(rule => /prompt-injection detection/i.test(rule)));
  assert.ok(gate.anti_dead_end_rules.some(rule => /obsolete semantics in the core/i.test(rule)));
});

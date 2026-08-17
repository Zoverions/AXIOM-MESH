import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIR, '../..');

async function json(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
}

test('regulatory eligibility contract fails toward no consequential authority', async () => {
  const schema = await json('mesh/contracts/health-mesh-regulatory-eligibility.v0.1.schema.json');
  const p = schema.properties;

  assert.equal(schema.additionalProperties, false);
  assert.equal(p.absence_behavior.const, 'DENY_CONSEQUENTIAL');
  assert.equal(p.axiom_may_expand_scope.const, false);
  assert.equal(p.runtime_authority_granted.const, false);
  assert.equal(p.regulatory_truth_claimed_by_axiom.const, false);
  assert.ok(p.eligibility_state.enum.includes('INTERPRETATION_REQUIRED'));
  assert.ok(p.eligibility_state.enum.includes('NOT_ESTABLISHED'));
});

test('Ontario robotic venipuncture research fixture cannot authorize puncture', async () => {
  const fixture = await json(
    'mesh/test/fixtures/health-mesh/ontario-supervised-venipuncture-regulatory.json'
  );

  assert.equal(fixture.assertion_class, 'RESEARCH_ONLY');
  assert.equal(fixture.authority_level, 'NON_AUTHORITATIVE_RESEARCH');
  assert.equal(fixture.eligibility_state, 'INTERPRETATION_REQUIRED');
  assert.equal(fixture.absence_behavior, 'DENY_CONSEQUENTIAL');
  assert.equal(fixture.axiom_may_expand_scope, false);
  assert.equal(fixture.runtime_authority_granted, false);
  assert.equal(fixture.regulatory_truth_claimed_by_axiom, false);
  assert.ok(fixture.action_scope.prohibited_actions.includes('health.specimen.venipuncture.supervised'));
  assert.ok(fixture.action_scope.prohibited_actions.includes('health.specimen.venipuncture.autonomous'));
});

test('research regulatory state cannot appear in production capability registry', async () => {
  const fixture = await json(
    'mesh/test/fixtures/health-mesh/ontario-supervised-venipuncture-regulatory.json'
  );
  const registry = await json('mesh/config/capabilities.json');
  const serialized = JSON.stringify(registry);

  for (const action of fixture.action_scope.prohibited_actions) {
    assert.equal(serialized.includes(action), false, `${action} must remain absent from production registry`);
  }
});

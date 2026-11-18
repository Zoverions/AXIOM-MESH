import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const url = new URL('../../agent-commons/high-risk-engagement-environment.v1.json', import.meta.url);

test('high-risk engagement environments never carry production authority', async () => {
  const profile = JSON.parse(await readFile(url, 'utf8'));
  assert.equal(profile.schema, 'axiom-high-risk-engagement-environment.v1');
  assert.ok(profile.environment_classes.length >= 4);
  assert.ok(profile.environment_classes.every(({ real_authority }) => real_authority === 'none'));
  assert.match(profile.promotion_gate.rule, /cannot authorize production execution/);
});

test('engagement environments preserve observer-specimen asymmetry', async () => {
  const profile = JSON.parse(await readFile(url, 'utf8'));
  for (const required of [
    'never expose detector reasoning or private incident corpus to the specimen',
    'export observations outward through a one-way evidence path',
    'do not allow the specimen to write directly into long-term trusted memory'
  ]) assert.ok(profile.asymmetry_controls.includes(required), required);
});

test('lab success and failure are both non-conclusive', async () => {
  const profile = JSON.parse(await readFile(url, 'utf8'));
  assert.ok(profile.nonclaims.includes('A successful lab run does not prove production safety.'));
  assert.ok(profile.nonclaims.includes('A failed lab run does not prove an artifact is malicious.'));
});

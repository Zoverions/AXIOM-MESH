import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const url = new URL('../../agent-commons/evidence-disposition-profile.v1.json', import.meta.url);

test('evidence disposition preserves useful advisory signals without authority laundering', async () => {
  const profile = JSON.parse(await readFile(url, 'utf8'));
  assert.equal(profile.schema, 'axiom-evidence-disposition-profile.v1');
  assert.match(profile.principle, /useful without being sufficient/i);

  const advisory = profile.lanes.find(({ id }) => id === 'advisory');
  assert.ok(advisory);
  assert.ok(advisory.may_influence.includes('what to inspect next'));
  assert.ok(advisory.must_not_do.includes('mint authority'));
  assert.ok(advisory.must_not_do.includes('override revocation'));

  const decision = profile.lanes.find(({ id }) => id === 'authoritative_decision');
  assert.ok(decision);
  assert.ok(decision.may_influence.includes('whether a consequential effect is admitted'));

  assert.match(profile.promotion_rule, /explicit verifier/);
  assert.match(profile.demotion_rule, /may remain useful as advisory context/);
});

test('profile rejects the false binary that evidence must be authoritative or discarded', async () => {
  const profile = JSON.parse(await readFile(url, 'utf8'));
  assert.ok(profile.positive_uses.length >= 4);
  assert.ok(profile.anti_patterns.includes(
    'requiring expensive verification for low-consequence advisory uses where no protected effect depends on it'
  ));
});

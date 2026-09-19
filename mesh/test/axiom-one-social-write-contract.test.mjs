import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appUrl = new URL('../../apps/axiom-one/app.mjs', import.meta.url);
const policyUrl = new URL('../../apps/axiom-one/app-policy.json', import.meta.url);
const contractUrl = new URL('../../apps/axiom-one/human-contract.json', import.meta.url);

const SOCIAL_WRITE_ACTIONS = Object.freeze({
  'social.actor.create': 'durable-local-social-actor-write',
  'social.persona.create': 'durable-local-social-persona-write'
});

test('AXIOM One exposes bounded local actor and persona writes only through reviewed intents', async () => {
  const [source, policyText, contractText] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(policyUrl, 'utf8'),
    readFile(contractUrl, 'utf8')
  ]);
  const policy = JSON.parse(policyText);
  const contract = JSON.parse(contractText);

  for (const [action, consequence] of Object.entries(SOCIAL_WRITE_ACTIONS)) {
    assert.ok(policy.human_explanations.action_previews.includes(action));
    assert.equal(contract.actions[action]?.consequence, consequence);
    assert.equal(contract.actions[action]?.external_egress, false);
    assert.equal(contract.actions[action]?.independent_approval, false);
    assert.deepEqual(contract.actions[action]?.required_confirmations, []);
  }

  assert.match(source, /action: 'social\.actor\.create'/);
  assert.match(source, /purpose: 'local-social-identity'/);
  assert.match(source, /action: 'social\.persona\.create'/);
  assert.match(source, /purpose: 'local-social-persona'/);
  assert.match(source, /data_scopes: \['social:identity'\]/);
  assert.match(source, /axiom-one:social:/);
  assert.match(source, /human\.requestPreview\(pending\.body\)/);
  assert.match(source, /state\.client\.call\('intents\.submit'/);
  assert.doesNotMatch(source, /state\.client\.call\('social\.mutate'/);
});

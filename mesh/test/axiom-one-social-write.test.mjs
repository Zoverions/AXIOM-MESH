import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { checkAxiomOnePreview, validateAxiomOnePolicy } from '../src/check-axiom-one.mjs';
import { validateHumanContract } from '../../apps/axiom-one/presentation.mjs';

const SOCIAL_ACTIONS = Object.freeze([
  'social.actor.create',
  'social.persona.create',
  'social.publication.create',
  'social.publication.supersede',
  'social.publication.retract'
]);

async function readJson(relative) {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
}

test('AXIOM One policy declares a bounded owner-local social lifecycle', async () => {
  const policy = await readJson('../../apps/axiom-one/app-policy.json');
  assert.deepEqual(policy.social_lifecycle, {
    status: 'experimental-bounded-local-social-lifecycle',
    actions: SOCIAL_ACTIONS,
    read_route: 'social.get',
    attribution_modes: ['pseudonymous'],
    publication_media_types: ['text/plain'],
    audience_modes: ['public'],
    discoverability: ['listed'],
    authorship_modes: ['human-authored'],
    network_effect: 'none',
    remote_distribution: false,
    persistent_browser_storage: false
  });
  assert.equal(validateAxiomOnePolicy(policy), true);
});

test('human contract explains every local social mutation without widening authority', async () => {
  const contract = await readJson('../../apps/axiom-one/human-contract.json');
  assert.equal(validateHumanContract(contract), true);
  for (const action of SOCIAL_ACTIONS) {
    const explanation = contract.actions[action];
    assert.ok(explanation, `${action} explanation`);
    assert.equal(explanation.external_egress, false, action);
    assert.equal(explanation.independent_approval, false, action);
    assert.deepEqual(explanation.required_confirmations, [], action);
  }
});

test('preview inventory reports the five new social explanations without adding a route', async () => {
  const result = await checkAxiomOnePreview();
  assert.equal(result.explained_actions, 10);
  assert.equal(result.social_lifecycle_status, 'experimental-bounded-local-social-lifecycle');
  assert.equal(result.social_actions, 5);
  assert.equal(result.social_network_effect, 'none');
  assert.equal(result.gateway_routes, 15);
});

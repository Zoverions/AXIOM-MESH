import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appUrl = new URL('../../apps/axiom-one/app.mjs', import.meta.url);
const humanContractUrl = new URL('../../apps/axiom-one/human-contract.json', import.meta.url);

test('AXIOM One exposes bounded local actor and persona writes only through reviewed intents', async () => {
  const [app, contractText] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(humanContractUrl, 'utf8')
  ]);
  const contract = JSON.parse(contractText);

  assert.match(app, /action:\s*'social\.actor\.create'/);
  assert.match(app, /action:\s*'social\.persona\.create'/);
  assert.match(app, /human\.requestPreview\(pending\.body\)/);
  assert.match(app, /state\.client\.call\('intents\.submit'/);
  assert.match(app, /network_effect === 'none'/);
  assert.doesNotMatch(app, /state\.client\.call\('social\.mutate'/);

  assert.equal(contract.actions['social.actor.create'].external_egress, false);
  assert.equal(contract.actions['social.actor.create'].independent_approval, false);
  assert.equal(contract.actions['social.persona.create'].external_egress, false);
  assert.equal(contract.actions['social.persona.create'].independent_approval, false);
  assert.match(contract.actions['social.actor.create'].effect, /local social actor identity/i);
  assert.match(contract.actions['social.persona.create'].effect, /publication persona bound to the authenticated owner's existing local social actor/i);
});

test('AXIOM One publication creation stays owner-local and reviewed', async () => {
  const [app, contractText] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(humanContractUrl, 'utf8')
  ]);
  const contract = JSON.parse(contractText);

  assert.match(app, /if \(activeActor && activePersona\)/);
  assert.match(app, /action:\s*'social\.publication\.create'/);
  assert.match(app, /actor_state_digest:\s*activeActor\.actor_state_digest/);
  assert.match(app, /protected_persona:\s*activePersona\.protected_persona/);
  assert.match(app, /media_type:\s*'text\/plain'/);
  assert.match(app, /audience:\s*\{\s*mode:\s*'public'\s*\}/s);
  assert.match(app, /discoverability:\s*'listed'/);
  assert.match(app, /authorship_mode:\s*'human-authored'/);
  assert.doesNotMatch(app, /state\.client\.call\('social\.mutate'/);

  const publication = contract.actions['social.publication.create'];
  assert.ok(publication);
  assert.equal(publication.consequence, 'durable-local-social-publication-write');
  assert.equal(publication.external_egress, false);
  assert.equal(publication.independent_approval, false);
  assert.match(publication.effect, /owner-local.*publication/i);
  assert.match(publication.retention, /append-only/i);
});

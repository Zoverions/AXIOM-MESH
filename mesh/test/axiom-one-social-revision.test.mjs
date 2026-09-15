import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// This test is intentionally production-RED before the bounded browser tranche lands.
const appUrl = new URL('../../apps/axiom-one/app.mjs', import.meta.url);
const humanContractUrl = new URL('../../apps/axiom-one/human-contract.json', import.meta.url);

test('AXIOM One exposes append-only owner-local publication supersede and retract through reviewed intents', async () => {
  const [app, contractText] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(humanContractUrl, 'utf8')
  ]);
  const contract = JSON.parse(contractText);

  assert.match(app, /if \(status === 'active' && activeActor && activePersona\)/);
  assert.match(app, /action:\s*'social\.publication\.supersede'/);
  assert.match(app, /actor_state_digest:\s*activeActor\.actor_state_digest/);
  assert.match(app, /protected_persona:\s*activePersona\.protected_persona/);
  assert.match(app, /previous_publication:\s*publication\.publication/);
  assert.match(app, /media_type:\s*'text\/plain'/);
  assert.match(app, /audience:\s*\{\s*mode:\s*'public'\s*\}/s);
  assert.match(app, /discoverability:\s*'listed'/);
  assert.match(app, /authorship_mode:\s*'human-authored'/);

  assert.match(app, /action:\s*'social\.publication\.retract'/);
  assert.match(app, /reason_code:\s*'author-retracted'/);
  assert.match(app, /human\.requestPreview\(pending\.body\)/);
  assert.match(app, /state\.client\.call\('intents\.submit'/);

  const supersede = contract.actions['social.publication.supersede'];
  assert.ok(supersede);
  assert.equal(supersede.consequence, 'durable-local-social-publication-supersede');
  assert.equal(supersede.external_egress, false);
  assert.equal(supersede.independent_approval, false);
  assert.match(supersede.effect, /owner-local.*supersed/i);
  assert.match(supersede.retention, /append-only/i);

  const retract = contract.actions['social.publication.retract'];
  assert.ok(retract);
  assert.equal(retract.consequence, 'durable-local-social-publication-retract');
  assert.equal(retract.external_egress, false);
  assert.equal(retract.independent_approval, false);
  assert.match(retract.effect, /owner-local.*retract/i);
  assert.match(retract.retention, /append-only/i);
  assert.match(retract.reversibility, /third-party deletion/i);
});

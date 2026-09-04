import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const url = new URL('../../agent-commons/interoperability-augmentation-profile.v1.json', import.meta.url);

test('augmentation profile supports selective adoption without platform replacement', async () => {
  const profile = JSON.parse(await readFile(url, 'utf8'));
  assert.equal(profile.schema, 'axiom-interoperability-augmentation-profile.v1');
  assert.match(profile.design_rule, /do not require platform replacement/i);
  assert.ok(profile.integration_modes.some(({ id }) => id === 'verification-service'));
  assert.ok(profile.integration_modes.some(({ id }) => id === 'policy-decision-point'));
  assert.ok(profile.integration_modes.some(({ id }) => id === 'evidence-and-audit-backplane'));
  assert.ok(profile.external_value_propositions.length >= 8);
});

test('augmentation cannot become an authority bypass', async () => {
  const profile = JSON.parse(await readFile(url, 'utf8'));
  for (const required of [
    'adapter installation granting effects',
    'discovery or identity verification becoming permission',
    'protocol switching widening scope'
  ]) assert.ok(profile.prohibited_patterns.includes(required));

  const advisory = profile.integration_modes.find(({ id }) => id === 'advisory-only');
  assert.ok(advisory, 'advisory-only integration mode must exist');
  assert.equal(advisory.mesh_authority_effect, 'none');

  const verifier = profile.integration_modes.find(({ id }) => id === 'verification-service');
  assert.ok(verifier, 'verification-service integration mode must exist');
  assert.equal(verifier.mesh_authority_effect, 'none');
});

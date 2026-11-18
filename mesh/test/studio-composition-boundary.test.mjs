import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const boundaryUrl = new URL('../../agent-commons/studio-composition-boundary.v1.json', import.meta.url);
const protectionUrl = new URL('../../agent-commons/adaptive-protection-envelope.v1.json', import.meta.url);
const topologyUrl = new URL('../../agent-commons/deployment-topology-profiles.v1.json', import.meta.url);

test('Studio is broad in authoring scope but not an authority/runtime monoculture', async () => {
  const boundary = JSON.parse(await readFile(boundaryUrl, 'utf8'));
  const studio = boundary.planes.find(({ id }) => id === 'studio');
  assert.ok(studio, 'Studio plane must exist');
  assert.ok(studio.may.includes('create inert contracts'));
  assert.ok(studio.may.includes('compose capsules'));
  assert.ok(studio.may.includes('define deployment manifests'));
  assert.ok(studio.must_not.includes('mint runtime authority'));
  assert.ok(studio.must_not.includes('hold ambient production secrets'));
  assert.ok(studio.must_not.includes('directly execute consequential effects'));
});

test('protection model is multi-dimensional rather than one global security tier', async () => {
  const profile = JSON.parse(await readFile(protectionUrl, 'utf8'));
  for (const key of ['encryption','verification','contracting','retention','connectivity','availability','assurance']) {
    assert.ok(profile.dimensions[key], key);
    assert.ok(profile.dimensions[key].values.length >= 4, key);
  }
  assert.match(profile.principle, /separate policy dimensions/i);
  assert.ok(profile.composition_rules.includes('encryption strength does not substitute for authorization or provenance'));
});

test('offline and air-gapped topology preserve authority semantics and freshness uncertainty', async () => {
  const topology = JSON.parse(await readFile(topologyUrl, 'utf8'));
  const ids = new Set(topology.profiles.map(({ id }) => id));
  assert.ok(ids.has('single_device_local'));
  assert.ok(ids.has('local_lan_mesh'));
  assert.ok(ids.has('intermittent_field_mesh'));
  assert.ok(ids.has('air_gapped_enclave'));
  assert.ok(topology.universal_rules.includes('deployment topology does not change underlying capability authority semantics'));
  assert.ok(topology.universal_rules.includes('every topology declares which claims require fresh external verification'));
});

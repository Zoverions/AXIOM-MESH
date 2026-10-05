import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateAgentProviderProfile } from '../src/lib/agent-provider-profile.mjs';

const LAB_PROFILES = Object.freeze([
  ['memory-os.v0.json', 'memory'],
  ['graft.v0.json', 'knowledge-projection'],
  ['beacon.v0.json', 'agent-interop'],
  ['rustchain-physical-attestation.v0.json', 'attestation'],
  ['avap.v0.json', 'provenance'],
  ['x402.v0.json', 'settlement']
]);

async function readProfile(name) {
  const url = new URL(`../../agent-commons/provider-lab/${name}`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

test('external ecosystem laboratory profiles remain inert evidence-only descriptors', async () => {
  for (const [name, providerClass] of LAB_PROFILES) {
    const profile = await readProfile(name);
    const result = validateAgentProviderProfile(profile);

    assert.equal(result.provider_class, providerClass, name);
    assert.equal(result.authority_effect, 'none', name);
    assert.equal(result.trust_effect, 'evidence-only', name);
    assert.equal(result.network_effect, 'none', name);
    assert.equal(result.runtime_activation, false, name);
    assert.equal(result.settlement_activation, false, name);
  }
});

test('external laboratory candidates do not claim an AXIOM adapter or verified artifact digest', async () => {
  for (const [name] of LAB_PROFILES) {
    const profile = await readProfile(name);
    assert.equal(profile.implementation.source_kind, 'external', name);
    assert.equal(profile.implementation.artifact_digest, null, name);
    assert.equal(typeof profile.implementation.upstream_ref, 'string', name);
  }
});

test('RustChain-style physical attestation is bounded as behavioral evidence, not hardware-root proof', async () => {
  const profile = await readProfile('rustchain-physical-attestation.v0.json');
  assert.equal(profile.assurance_ceiling, 'behavioral');
  assert.ok(profile.evidence_classes.includes('behavioral-fingerprint'));
  assert.equal(profile.evidence_classes.includes('hardware-rooted-attestation'), false);
});

test('Beacon-style interop declares signed replay-protected evidence without network activation', async () => {
  const profile = await readProfile('beacon.v0.json');
  assert.equal(profile.assurance_ceiling, 'cryptographic');
  assert.ok(profile.evidence_classes.includes('signed-envelope'));
  assert.ok(profile.evidence_classes.includes('replay-protected-envelope'));
  assert.equal(profile.network_effect, 'none');
});

test('AVAP-style provenance declares content and lineage evidence without importing chain authority', async () => {
  const profile = await readProfile('avap.v0.json');
  for (const evidenceClass of [
    'signed-envelope',
    'content-digest',
    'transformation-lineage',
    'external-anchor'
  ]) assert.ok(profile.evidence_classes.includes(evidenceClass));
  assert.equal(profile.authority_effect, 'none');
});

test('x402-style settlement can describe payment proof while settlement remains inactive', async () => {
  const profile = await readProfile('x402.v0.json');
  assert.ok(profile.evidence_classes.includes('payment-proof'));
  assert.equal(profile.settlement_activation, false);
  assert.equal(profile.authority_effect, 'none');
});

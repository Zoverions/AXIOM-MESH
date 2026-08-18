import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('converged semantic ingestion remains absent from production Grid policy and capability selection', async () => {
  const [server, policy, capabilities, storeSource] = await Promise.all([
    text('mesh/src/grid/server.mjs'),
    text('mesh/config/policy.json'),
    text('mesh/config/capabilities.json'),
    text('mesh/src/grid/semantic-memory-converged-ingestion-store.mjs')
  ]);

  assert.equal(server.includes('ConvergedSemanticMemoryGridStore'), false);
  assert.equal(server.includes('semantic-memory-converged-ingestion-store.mjs'), false);
  assert.equal(policy.includes('axiom_semantic_origin'), false);
  assert.equal(policy.includes('axiom_semantic_source_evidence_digest'), false);
  assert.equal(capabilities.includes('semantic-memory-converged'), false);
  assert.equal(capabilities.includes('axiom_semantic_origin'), false);

  for (const required of [
    "activation_state: 'opt-in-local-laboratory'",
    "accepted_action: 'memory.put'",
    'caller_supplied_provenance_allowed: false',
    'source_identity_verified: false',
    'artifact_authenticity_verified: false',
    'provider_direct_write_authority: false',
    'public_routes: false',
    'production_store_selected: false',
    'capability_registry_promoted: false',
    'downstream_effect_authority: false',
    'propagation_authority: false'
  ]) {
    assert.equal(storeSource.includes(required), true, `missing non-selection boundary: ${required}`);
  }
});

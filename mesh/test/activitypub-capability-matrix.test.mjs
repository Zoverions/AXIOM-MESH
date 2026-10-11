import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const matrixUrl = new URL('../config/social-activitypub-capability-matrix.v0.json', import.meta.url);
const adapterUrl = new URL('../config/social-activitypub-adapter.v0.json', import.meta.url);

async function load(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('ActivityPub matrix separates mapping knowledge from implementation status', async () => {
  const matrix = await load(matrixUrl);
  assert.equal(matrix.schema, 'axiom-social-activitypub-capability-matrix.v0');
  assert.equal(matrix.runtime_activation, false);
  assert.equal(matrix.entries.length, 11);
  assert.equal(new Set(matrix.entries.map(entry => entry.axiom_semantic)).size, 11);
  assert.equal(matrix.global_non_claims.semantic_mapping_means_runtime_implemented, false);
  assert.equal(matrix.global_non_claims.local_action_means_federation_enabled, false);
});

test('current local publication primitives are distinguished from future social actions', async () => {
  const matrix = await load(matrixUrl);
  const entries = new Map(matrix.entries.map(entry => [entry.axiom_semantic, entry]));
  for (const semantic of [
    'social.publication.create',
    'social.publication.supersede',
    'social.publication.retract'
  ]) {
    assert.equal(entries.get(semantic).axiom_status, 'implemented-local-no-network');
  }
  for (const semantic of [
    'social.follow.request',
    'social.follow.accept',
    'social.follow.reject',
    'social.follow.undo',
    'social.reshare',
    'social.like'
  ]) {
    assert.equal(entries.get(semantic).axiom_status, 'specified-not-current-runtime-action');
  }
});

test('supersession remains blocked until stable ActivityPub object binding exists', async () => {
  const matrix = await load(matrixUrl);
  const adapter = await load(adapterUrl);
  const entry = matrix.entries.find(item => item.axiom_semantic === 'social.publication.supersede');
  assert.equal(entry.activitypub_mapping, 'Update');
  assert.equal(entry.outbound_adapter_status, 'blocked-pending-stable-object-binding');
  assert.ok(adapter.prohibited_outbound_semantics.includes('social.publication.supersede'));
  assert.equal(adapter.outbound_mappings.some(item => item.activitypub_activity === 'Update'), false);
});

test('every active inert outbound mapping is represented in the truth matrix', async () => {
  const matrix = await load(matrixUrl);
  const adapter = await load(adapterUrl);
  const entries = new Map(matrix.entries.map(entry => [entry.axiom_semantic, entry]));
  for (const mapping of adapter.outbound_mappings) {
    const entry = entries.get(mapping.axiom_semantic);
    assert.ok(entry);
    assert.equal(entry.activitypub_mapping, mapping.activitypub_activity);
    assert.equal(entry.outbound_adapter_status, 'specified-inert');
  }
});

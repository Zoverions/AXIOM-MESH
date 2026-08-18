import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { SemanticMemoryContentGridStore } from '../src/grid/semantic-memory-content-store.mjs';

test('atomic semantic content binding remains opt-in and non-authorizing', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-content-status-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new SemanticMemoryContentGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const status = store.getStatus().semantic_memory_content;
  assert.equal(status.schema, 'axiom-semantic-memory-content-store.v1');
  assert.equal(status.activation_state, 'opt-in-local-laboratory');
  assert.equal(status.atomic_content_provenance_binding, true);
  assert.equal(status.existing_memory_graph_storage_reused, true);
  assert.equal(status.signed_memory_put_is_initial_source, true);
  assert.equal(status.encrypted_memory_object_required, true);
  assert.equal(status.active_content_required_for_current_use, true);
  assert.equal(status.historical_replay_preserves_later_tombstones, true);
  assert.equal(status.provenance_only_initial_state_allowed, false);
  assert.equal(status.semantic_content_without_provenance_allowed, false);
  assert.equal(status.preexisting_content_adoption_allowed, false);
  assert.equal(status.provider_direct_write_authority, false);
  assert.equal(status.sandbox_tool_wired, false);
  assert.equal(status.gateway_route_wired, false);
  assert.equal(status.capability_registry_promoted, false);
  assert.equal(status.downstream_effect_authority, false);
  assert.equal(status.propagation_authority, false);
});

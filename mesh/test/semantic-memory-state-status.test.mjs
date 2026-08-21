import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { SemanticMemoryStateGridStore } from '../src/grid/semantic-memory-state-store.mjs';

test('semantic memory current-state store advertises only opt-in local laboratory semantics', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-status-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new SemanticMemoryStateGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const status = store.getStatus().semantic_memory_state_store;
  assert.equal(status.activation_state, 'opt-in-local-laboratory');
  assert.equal(status.schema_version, 1);
  assert.equal(status.signed_event_authority, true);
  assert.equal(status.protected_materialized_state, true);
  assert.equal(status.currentness_verification, true);
  assert.equal(status.recursive_lineage_currentness, true);
  assert.equal(status.public_routes, false);
  assert.equal(status.provider_writes, false);
  assert.equal(status.prompt_composer_integration, false);
  assert.equal(status.downstream_effect_authority, false);
});

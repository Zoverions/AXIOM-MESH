import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { SemanticMemoryIngestionGridStore } from '../src/grid/semantic-memory-ingestion-store.mjs';

test('semantic memory ingestion store remains opt-in and grants no provider or downstream authority', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-ingestion-status-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new SemanticMemoryIngestionGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const status = store.getStatus().semantic_memory_ingestion;
  assert.equal(status.schema, 'axiom-semantic-memory-ingestion-store.v1');
  assert.equal(status.activation_state, 'opt-in-local-laboratory');
  assert.equal(status.exact_intent_binding, true);
  assert.equal(status.same_commit_completion_required, true);
  assert.equal(status.human_owner_commit_required, true);
  assert.equal(status.provider_output_may_be_source_data, true);
  assert.equal(status.provider_direct_write_authority, false);
  assert.equal(status.direct_unbound_state_recording, false);
  assert.equal(status.sandbox_tool_wired, false);
  assert.equal(status.gateway_route_wired, false);
  assert.equal(status.capability_registry_promoted, false);
  assert.equal(status.downstream_effect_authority, false);
  assert.equal(status.propagation_authority, false);
});

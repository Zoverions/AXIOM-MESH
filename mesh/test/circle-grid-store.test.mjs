import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { validateCircleCorePackage } from '../src/lib/circle-core.mjs';
import { CircleGridStore } from '../src/grid/circle-store.mjs';
import { executeSandboxBuiltin } from '../src/sandbox/education-executor.mjs';

const PRINCIPAL = Object.freeze({
  id: 'principal-circle-grid-owner',
  type: 'human',
  roles: [],
  scopes: ['circle:write']
});

function createCircleMutation() {
  return executeSandboxBuiltin({
    tool: 'builtin.validate-mutation',
    assurance: {
      required: 'A2',
      achieved: 'A2',
      basis: 'auditable_kernel_path'
    },
    intent: {
      action: 'circle.create',
      input: {
        name: 'Grid Circle',
        purpose: 'Persist one bounded local Circle in the signed Grid.',
        participation_model: 'voluntary'
      },
      principal: PRINCIPAL
    }
  });
}

async function createStore(t) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-circle-grid-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(randomBytes(32));
  const store = new CircleGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  return store;
}

test('Circle Grid stores a created package in the existing signed Grid without authority expansion', async t => {
  const store = await createStore(t);
  const created = createCircleMutation();

  store.appendEvents({
    traceId: 'trace-circle-grid-create',
    actor: PRINCIPAL.id,
    events: [created.mutation]
  });

  const persisted = store.getCirclePackage(PRINCIPAL.id, created.output.circle_id);
  assert.equal(persisted.circle_id, created.output.circle_id);
  assert.equal(persisted.owner, PRINCIPAL.id);
  assert.equal(persisted.package_digest, created.output.package_digest);
  assert.equal(persisted.authority_effect, 'none');
  assert.equal(persisted.network_effect, 'none');
  assert.equal(persisted.runtime_activation, false);
  assert.equal(validateCircleCorePackage(persisted.package_json).valid, true);
  assert.equal(store.getStatus().circle_schema_version, 1);
  assert.equal(store.verifyFullChain().valid, true);
});

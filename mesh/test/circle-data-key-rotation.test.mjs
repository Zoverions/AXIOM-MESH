import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { CircleGridStore } from '../src/grid/circle-store.mjs';
import { reencryptGridProtectedColumns } from '../src/grid/store.mjs';
import { executeSandboxBuiltin } from '../src/sandbox/education-executor.mjs';

const PRINCIPAL = Object.freeze({
  id: 'principal-circle-rotation-owner',
  type: 'human',
  roles: [],
  scopes: ['circle:write']
});

function createMutation() {
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
        name: 'Rotation Circle',
        purpose: 'Prove Circle projection bytes remain readable after supported Grid data-key rotation.',
        participation_model: 'voluntary'
      },
      principal: PRINCIPAL
    }
  });
}

test('supported data-key rotation re-encrypts Circle package projection and reopens with the new key', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-circle-key-rotation-'));
  const dataDir = join(root, 'data');
  const path = join(dataDir, 'grid.sqlite');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const sourceProtector = new DataProtector(randomBytes(32));
  const store = new CircleGridStore({ path, dataDir, identity, protector: sourceProtector });
  const created = createMutation();

  store.appendEvents({
    traceId: 'trace-circle-key-rotation',
    actor: PRINCIPAL.id,
    events: [created.mutation]
  });
  const rawBefore = store.db.prepare(`
    SELECT package_json FROM circle_packages WHERE circle_id = ?
  `).get(created.output.circle_id).package_json;
  assert.equal(sourceProtector.isProtected(rawBefore), true);
  store.close();

  const targetProtector = new DataProtector(randomBytes(32));
  const db = new DatabaseSync(path);
  const result = reencryptGridProtectedColumns({
    db,
    sourceProtector,
    targetProtector
  });
  db.close();

  assert.ok(result.protected_values >= 1);
  assert.equal(result.tables.circle_packages, 1);

  const reopened = new CircleGridStore({
    path,
    dataDir,
    identity,
    protector: targetProtector
  });
  t.after(async () => {
    reopened.close();
    await rm(root, { recursive: true, force: true });
  });

  const persisted = reopened.getCirclePackage(PRINCIPAL.id, created.output.circle_id);
  assert.equal(persisted.package_digest, created.output.package_digest);
  assert.equal(persisted.authority_effect, 'none');
  assert.equal(persisted.network_effect, 'none');
  assert.equal(persisted.runtime_activation, false);
  assert.equal(reopened.verifyFullChain().valid, true);
});

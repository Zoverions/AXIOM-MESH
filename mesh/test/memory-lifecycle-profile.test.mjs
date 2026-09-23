import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

test('memory lifecycle profile emits bounded machine-readable lifecycle evidence', () => {
  const result = spawnSync(process.execPath, ['memory-lifecycle-profile.mjs'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
    windowsHide: true
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const profile = JSON.parse(result.stdout);

  assert.equal(profile.schema, 'axiom-memory-lifecycle-profile.v0');
  assert.match(profile.source_ref, /^[0-9a-f]{40}$/u);
  assert.equal(profile.working_tree_clean, true);
  assert.equal(profile.scope, 'axiom-one-experimental-local-preview');
  assert.equal(profile.production_certification, false);
  assert.equal(profile.external_provider_used, false);
  assert.equal(profile.network_access_required, false);
  assert.equal(profile.telemetry_sent, false);
  assert.equal(profile.authority_granted, false);
  assert.equal(profile.preview_status, 'experimental-local-preview');
  assert.equal(profile.passed, true);

  assert.deepEqual(profile.memory_lifecycle, {
    status: 'experimental-bounded-lifecycle',
    actions: ['memory.put', 'memory.link', 'memory.tombstone', 'export.create'],
    read_route: 'memory.list',
    provenance_relations: ['derived-from', 'supports', 'corrects'],
    self_links: false,
    correction_replaces_original: false,
    link_deletion: false,
    export_routes: ['exports.get', 'export_bundles.get'],
    bundle_reveal: 'explicit-user-action-only',
    persistent_browser_storage: false,
    hard_delete: false,
    restore: false,
    sharing: false
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateRuntimeConnectorCatalogEntry } from '../src/lib/runtime-connector-fabric-contracts.mjs';

const CATALOG_URL = new URL('../config/runtime-provider-catalog.v0.json', import.meta.url);
const EXPECTED_TOP_LEVEL_FIELDS = Object.freeze([
  'catalog',
  'cataloged_at',
  'base_contract',
  'authority_boundary',
  'entries',
  'backlog',
  'non_claims'
]);

function loadCatalog() {
  return JSON.parse(readFileSync(CATALOG_URL, 'utf8'));
}

test('runtime/provider catalog v0 preserves discovery-without-authority invariants', () => {
  const catalog = loadCatalog();

  assert.deepEqual(Object.keys(catalog).sort(), [...EXPECTED_TOP_LEVEL_FIELDS].sort());
  assert.equal(catalog.catalog, 'axiom-runtime-provider-catalog.v0');
  assert.match(catalog.cataloged_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

  assert.deepEqual(catalog.base_contract, {
    schema: 'axiom-runtime-connector-catalog-entry.v1',
    schema_sha256: '0fbd3cf2e4a5df8bd803427413a37e1d83d5ccfa7568ac02a4760c8af7beca46'
  });

  assert.deepEqual(catalog.authority_boundary, {
    catalog_presence_grants_authority: false,
    installation_grants_authority: false,
    selection_requires_gateway_authorization: true,
    effect_path: 'Gateway -> Hypervisor -> Sandbox -> Grid'
  });

  assert.ok(Array.isArray(catalog.entries));
  assert.equal(catalog.entries.length, 10);

  const identities = new Set();
  const subjectIds = new Set();
  let runtimes = 0;
  let providers = 0;

  for (const entry of catalog.entries) {
    assert.equal(validateRuntimeConnectorCatalogEntry(entry), true);
    assert.ok(['agent-runtime', 'model-provider'].includes(entry.integration_class));
    assert.equal(entry.requested_access.install_grants_authority, false);
    assert.deepEqual(entry.requested_access.capabilities, []);
    assert.deepEqual(entry.requested_access.actions, []);
    assert.equal(entry.lifecycle.silent_permission_widening_allowed, false);
    assert.equal(entry.lifecycle.quarantine_supported, true);

    const identity = `${entry.entry_id}@${entry.entry_version}`;
    assert.equal(identities.has(identity), false, `duplicate catalog identity: ${identity}`);
    identities.add(identity);

    assert.equal(subjectIds.has(entry.subject.subject_id), false, `duplicate subject: ${entry.subject.subject_id}`);
    subjectIds.add(entry.subject.subject_id);

    if (entry.integration_class === 'agent-runtime') {
      runtimes += 1;
      assert.equal(entry.requested_access.network_required, false);
      assert.deepEqual(entry.requested_access.destinations, []);
      assert.deepEqual(entry.requested_access.data_classes, []);
      assert.deepEqual(entry.requested_access.credential_classes, []);
      assert.equal(entry.orchestration.independent_child_authority_requested, false);
      assert.equal(entry.orchestration.remote_execution_requested, false);
    } else {
      providers += 1;
      assert.equal(entry.provenance.source_kind, 'service-endpoint');
      assert.equal(entry.requested_access.network_required, true);
      assert.deepEqual(entry.requested_access.network_destinations, [entry.provenance.service_origin]);
      assert.deepEqual(entry.requested_access.destinations, [entry.provenance.service_origin]);
      assert.deepEqual(entry.requested_access.purposes, ['model-inference']);
      assert.deepEqual(entry.requested_access.data_classes, ['model-input', 'model-output']);
      assert.deepEqual(entry.requested_access.credential_classes, ['api-key']);
      assert.equal(entry.orchestration.mode, 'none');
      assert.equal(entry.orchestration.may_spawn_workers, false);
      assert.equal(entry.orchestration.independent_child_authority_requested, false);
      assert.equal(entry.orchestration.remote_execution_requested, false);
    }
  }

  assert.equal(runtimes, 4);
  assert.equal(providers, 6);

  assert.ok(Array.isArray(catalog.backlog));
  assert.ok(catalog.backlog.length > 0);
  assert.ok(Array.isArray(catalog.non_claims));
  assert.ok(catalog.non_claims.length >= 1);
});

test('catalog seed contains the intended runtime and provider subjects', () => {
  const catalog = loadCatalog();
  const ids = new Set(catalog.entries.map((entry) => entry.entry_id));

  for (const expected of [
    'runtime:hermes-agent:research',
    'runtime:openclaw:research',
    'runtime:codex-cli:research',
    'runtime:agent-zero:research',
    'provider:arcee-api',
    'provider:openai-api',
    'provider:anthropic-api',
    'provider:google-gemini-api',
    'provider:xai-api',
    'provider:mistral-api'
  ]) {
    assert.equal(ids.has(expected), true, `missing catalog entry: ${expected}`);
  }
});

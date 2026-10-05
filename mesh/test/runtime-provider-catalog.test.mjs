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
  assert.equal(catalog.entries.length, 14);

  const identities = new Set();
  const subjectIds = new Set();
  let runtimes = 0;
  let providers = 0;
  let computeBackends = 0;

  for (const entry of catalog.entries) {
    assert.equal(validateRuntimeConnectorCatalogEntry(entry), true);
    assert.ok(['agent-runtime', 'model-provider', 'compute-backend'].includes(entry.integration_class));
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
    } else if (entry.integration_class === 'model-provider') {
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
    } else {
      computeBackends += 1;
      assert.equal(entry.provenance.source_kind, 'source-repository');
      assert.equal(entry.provenance.mutable_ref_allowed, false);
      assert.match(entry.provenance.source_commit, /^[a-f0-9]{40}$/);
      assert.equal(entry.requested_access.network_required, false);
      assert.equal(Object.hasOwn(entry.requested_access, 'network_destinations'), false);
      assert.deepEqual(entry.requested_access.purposes, []);
      assert.deepEqual(entry.requested_access.destinations, []);
      assert.deepEqual(entry.requested_access.data_classes, []);
      assert.deepEqual(entry.requested_access.credential_classes, []);
      assert.deepEqual(entry.compatibility.platforms, ['linux']);
      assert.deepEqual(entry.compatibility.deployment_forms, ['process']);
      assert.deepEqual(entry.compatibility.adapter_contracts, []);
      assert.equal(entry.orchestration.mode, 'none');
      assert.equal(entry.orchestration.may_spawn_workers, false);
      assert.equal(entry.orchestration.independent_child_authority_requested, false);
      assert.equal(entry.orchestration.remote_execution_requested, false);
    }
  }

  assert.equal(runtimes, 4);
  assert.equal(providers, 6);
  assert.equal(computeBackends, 4);

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
    'provider:mistral-api',
    'compute:ollama:research',
    'compute:vllm:research',
    'compute:llama.cpp:research',
    'compute:sglang:research'
  ]) {
    assert.equal(ids.has(expected), true, `missing catalog entry: ${expected}`);
  }
});

test('local inference profiles pin reviewed source identities without admitting backlog aliases', () => {
  const catalog = loadCatalog();
  const expected = new Map([
    ['compute:ollama:research', ['https://github.com/ollama/ollama', 'f6c59d87038ae77f52d4adfbdc37363f8edd1ef3', 'MIT']],
    ['compute:vllm:research', ['https://github.com/vllm-project/vllm', 'd9fbe526c0787eb5e6dd1e3e4d9b88848d21bc6b', 'Apache-2.0']],
    ['compute:llama.cpp:research', ['https://github.com/ggml-org/llama.cpp', '3737e41370da1830a44c663f9929a0f27591ffa6', 'MIT']],
    ['compute:sglang:research', ['https://github.com/sgl-project/sglang', '0c7ff19e3b739b2aabe9bfa070047bfa1aa6a7fd', 'Apache-2.0']]
  ]);

  for (const [entryId, [repository, commit, license]] of expected) {
    const entry = catalog.entries.find((candidate) => candidate.entry_id === entryId);
    assert.ok(entry, `missing local inference profile: ${entryId}`);
    assert.equal(entry.integration_class, 'compute-backend');
    assert.equal(entry.provenance.source_repository, repository);
    assert.equal(entry.provenance.source_commit, commit);
    assert.equal(entry.provenance.license_spdx, license);
  }

  for (const admitted of ['ollama', 'vllm', 'llama.cpp', 'sglang']) {
    assert.equal(catalog.backlog.includes(admitted), false, `admitted profile remains in backlog: ${admitted}`);
  }
});

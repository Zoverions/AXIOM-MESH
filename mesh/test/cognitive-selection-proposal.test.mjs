import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  COGNITIVE_SELECTION_POLICY_SCHEMA,
  proposeCognitiveSelection,
  validateCognitiveSelectionPolicy
} from '../src/lib/cognitive-selection-proposal.mjs';

const SCHEMA_PATH = new URL('../config/cognitive-selection-policy-v0.schema.json', import.meta.url);
const SOURCE_PATH = new URL('../src/lib/cognitive-selection-proposal.mjs', import.meta.url);
const ARTIFACT_DIGEST = 'a'.repeat(64);

function catalogEntry({ entryId, integrationClass, networkRequired, remote = false }) {
  return {
    schema: 'axiom-runtime-connector-catalog-entry.v1',
    entry_id: entryId,
    entry_version: '0.1.0',
    integration_class: integrationClass,
    subject: {
      subject_id: entryId,
      display_name: entryId,
      description: 'Test-only cognitive selection fixture.'
    },
    provenance: remote
      ? {
          source_kind: 'service-endpoint',
          service_origin: 'https://api.example.com',
          license_spdx: 'NOASSERTION',
          mutable_ref_allowed: false
        }
      : {
          source_kind: 'source-repository',
          source_repository: 'https://github.com/example/example-local',
          source_commit: 'b'.repeat(40),
          license_spdx: 'MIT',
          mutable_ref_allowed: false
        },
    compatibility: remote
      ? {
          platforms: ['other'],
          deployment_forms: ['remote-service'],
          adapter_contracts: [],
          protocol_profiles: ['https-json-api']
        }
      : {
          platforms: ['linux'],
          deployment_forms: ['process'],
          adapter_contracts: []
        },
    requested_access: {
      install_grants_authority: false,
      capabilities: [],
      actions: [],
      purposes: remote ? ['model-inference'] : [],
      destinations: remote ? ['https://api.example.com'] : [],
      data_classes: remote ? ['model-input', 'model-output'] : [],
      credential_classes: remote ? ['api-key'] : [],
      network_required: networkRequired,
      ...(remote ? { network_destinations: ['https://api.example.com'] } : {})
    },
    orchestration: {
      mode: 'none',
      may_spawn_workers: false,
      independent_child_authority_requested: false,
      remote_execution_requested: false
    },
    assurance: {
      observations: [],
      cataloged_at: '2026-08-30T04:00:00Z'
    },
    lifecycle: {
      update_mode: 'manual-reviewed',
      silent_permission_widening_allowed: false,
      rollback_available: !remote,
      quarantine_supported: true
    },
    non_claims: ['Test fixture grants no authority.']
  };
}

function profileFor(entry, overrides = {}) {
  const local = entry.integration_class === 'compute-backend';
  return {
    schema: 'axiom-cognitive-capability-profile.v0',
    version: 0,
    status: 'inert-routing-metadata-laboratory',
    profile_id: local ? 'cognitive.example.local' : 'cognitive.example.remote',
    catalog_entry: {
      entry_id: entry.entry_id,
      entry_version: entry.entry_version,
      entry_digest: digestObject(entry)
    },
    integration_class: entry.integration_class,
    offering_ref: local ? 'runtime.example.local' : 'model.example.remote',
    capabilities: local
      ? ['reasoning', 'coding']
      : ['reasoning', 'research', 'summarization'],
    modalities: { input: ['text'], output: ['text'] },
    deployment: local
      ? { locality: 'owner-local', access_mode: 'local-runtime' }
      : { locality: 'provider-remote', access_mode: 'api' },
    data_policy: local
      ? { retention: 'none', training_use: 'excluded', exportability: 'full', policy_ref: null }
      : { retention: 'unknown', training_use: 'unknown', exportability: 'unknown', policy_ref: 'policy.example.remote.v1' },
    economics: local
      ? { cost_class: 'none', latency_class: 'local-fast', context_class: 'medium' }
      : { cost_class: 'medium', latency_class: 'interactive', context_class: 'large' },
    openness: local
      ? { weight_access: 'open-acquired', artifact_digest: ARTIFACT_DIGEST, license_ref: 'MIT' }
      : { weight_access: 'closed', artifact_digest: null, license_ref: null },
    assurance: local
      ? { ceiling: 'cryptographic', evidence_refs: ['evidence.local'] }
      : { ceiling: 'self-asserted', evidence_refs: ['evidence.remote'] },
    created_at: '2026-08-30T04:00:00.000Z',
    updated_at: '2026-08-30T04:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    ...overrides
  };
}

function candidates() {
  const localEntry = catalogEntry({
    entryId: 'compute:example-local:research',
    integrationClass: 'compute-backend',
    networkRequired: false
  });
  const remoteEntry = catalogEntry({
    entryId: 'provider:example-api',
    integrationClass: 'model-provider',
    networkRequired: true,
    remote: true
  });
  return [
    { profile: profileFor(remoteEntry), catalog_entry: remoteEntry },
    { profile: profileFor(localEntry), catalog_entry: localEntry }
  ];
}

function validRequest(overrides = {}) {
  return {
    schema: 'axiom-cognitive-eligibility-request.v0',
    version: 0,
    status: 'inert-eligibility-request',
    request_id: 'eligibility.example.general',
    required_capabilities: ['reasoning'],
    allowed_integration_classes: ['model-provider', 'compute-backend'],
    allowed_localities: ['owner-local', 'provider-remote'],
    allowed_retention: ['none', 'unknown'],
    allowed_training_use: ['excluded', 'unknown'],
    allowed_weight_access: ['closed', 'open-acquired'],
    max_cost_class: 'high',
    max_latency_class: 'batch',
    min_assurance_ceiling: 'none',
    min_context_class: 'small',
    created_at: '2026-08-30T04:05:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    ...overrides
  };
}

function validPolicy(overrides = {}) {
  return {
    schema: 'axiom-cognitive-selection-policy.v0',
    version: 0,
    status: 'inert-selection-policy',
    policy_id: 'selection.example.sovereign',
    criteria: [
      {
        field: 'assurance.ceiling',
        preference: ['hardware-rooted', 'cryptographic', 'behavioral', 'self-asserted', 'none']
      },
      {
        field: 'economics.cost_class',
        preference: ['none', 'low', 'medium', 'high', 'unknown']
      }
    ],
    created_at: '2026-08-30T04:10:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'proposal-only',
    ...overrides
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function tiedCandidates() {
  const template = candidates()[0];
  const ids = [
    'cognitive.example.a',
    'cognitive.example.A',
    'cognitive.example.-',
    'cognitive.example._'
  ];
  return ids.map((profileId, index) => {
    const catalog_entry = structuredClone(template.catalog_entry);
    catalog_entry.entry_id = `provider:example-api-${index}`;
    catalog_entry.subject.subject_id = catalog_entry.entry_id;
    const profile = structuredClone(template.profile);
    profile.profile_id = profileId;
    profile.catalog_entry.entry_id = catalog_entry.entry_id;
    profile.catalog_entry.entry_digest = digestObject(catalog_entry);
    return { profile, catalog_entry };
  });
}

test('selection policy schema and source preserve an inert non-authority boundary', async () => {
  assert.equal(COGNITIVE_SELECTION_POLICY_SCHEMA, 'axiom-cognitive-selection-policy.v0');
  assert.equal(typeof validateCognitiveSelectionPolicy, 'function');
  assert.equal(typeof proposeCognitiveSelection, 'function');

  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  assert.equal(schema.$id, 'https://axiom.invalid/schemas/cognitive-selection-policy-v0.schema.json');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, COGNITIVE_SELECTION_POLICY_SCHEMA);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'proposal-only');

  const source = await readFile(SOURCE_PATH, 'utf8');
  const imports = source.split('\n').filter((line) => /^\s*import\b/.test(line)).join('\n');
  for (const marker of ['node:fs', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:child_process', 'node:worker_threads']) {
    assert.equal(imports.includes(marker), false, `selection proposal imports must not contain ${marker}`);
  }
  for (const marker of ['fetch(', 'createConnection(', 'request(', 'spawn(', 'exec(']) {
    assert.equal(source.includes(marker), false, `selection proposal source must not contain effect primitive ${marker}`);
  }
});

test('validates an explicit ordered selection policy without widening authority', () => {
  const policy = validPolicy();
  const result = validateCognitiveSelectionPolicy(policy);

  assert.equal(result.valid, true);
  assert.equal(result.schema, COGNITIVE_SELECTION_POLICY_SCHEMA);
  assert.equal(result.policy_id, policy.policy_id);
  assert.equal(result.policy_digest, digestObject(policy));
  assert.equal(result.criteria, 2);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.credential_visibility, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.selection_effect, 'proposal-only');
  assertDeepFrozen(result);
});

test('selection policy fails closed on ambiguity, partial preferences, timestamp drift, and boundary widening', () => {
  const cases = [
    { ...validPolicy(), unexpected: true },
    validPolicy({ criteria: [...validPolicy().criteria, structuredClone(validPolicy().criteria[0])] }),
    validPolicy({ criteria: [{ field: 'assurance.ceiling', preference: ['cryptographic', 'self-asserted'] }] }),
    validPolicy({ criteria: [{ field: 'assurance.ceiling', preference: ['hardware-rooted', 'cryptographic', 'behavioral', 'self-asserted', 'self-asserted'] }] }),
    validPolicy({ criteria: [{ field: 'provider.brand', preference: ['a', 'b'] }] }),
    validPolicy({ created_at: '2026-08-30T04:10:00Z' }),
    validPolicy({ authority_effect: 'grant' }),
    validPolicy({ network_effect: 'provider-egress' }),
    validPolicy({ credential_visibility: 'api-key' }),
    validPolicy({ runtime_activation: true }),
    validPolicy({ selection_effect: 'winner' })
  ];

  for (const policy of cases) {
    assert.throws(() => validateCognitiveSelectionPolicy(policy));
  }
});

test('ranks only eligible candidates by explicit ordered policy and recommends without selecting a winner', () => {
  const report = proposeCognitiveSelection(candidates(), validRequest(), validPolicy());

  assert.equal(report.valid, true);
  assert.equal(report.schema, 'axiom-cognitive-selection-proposal.v0');
  assert.equal(report.status, 'inert-selection-proposal');
  assert.deepEqual(report.ranked_candidates.map((item) => item.profile_id), [
    'cognitive.example.local',
    'cognitive.example.remote'
  ]);
  assert.deepEqual(report.ranked_candidates.map((item) => item.rank), [1, 2]);
  assert.equal(report.recommendation_made, true);
  assert.equal(report.recommended_profile_id, 'cognitive.example.local');
  assert.equal(report.recommended_profile_digest, report.ranked_candidates[0].profile_digest);
  assert.equal(report.ranking_applied, true);
  assert.equal(report.winner_selected, false);
  assert.equal(report.requires_gateway_authorization, true);
  assert.equal(report.execution_effect, 'none');
  assert.equal(report.authority_effect, 'none');
  assert.equal(report.network_effect, 'none');
  assert.equal(report.credential_visibility, 'none');
  assert.equal(report.runtime_activation, false);
  assert.equal(report.selection_effect, 'proposal-only');
  assertDeepFrozen(report);
});

test('changing an explicit preference changes the recommendation deterministically', () => {
  const policy = validPolicy({
    criteria: [
      {
        field: 'deployment.locality',
        preference: ['provider-remote', 'owner-local', 'owner-remote', 'hybrid']
      }
    ]
  });

  const report = proposeCognitiveSelection(candidates(), validRequest(), policy);
  assert.equal(report.recommended_profile_id, 'cognitive.example.remote');
  assert.deepEqual(report.ranked_candidates.map((item) => item.profile_id), [
    'cognitive.example.remote',
    'cognitive.example.local'
  ]);
});

test('eligibility rejection dominates selection preference and cannot be widened by the policy', () => {
  const request = validRequest({ allowed_localities: ['provider-remote'] });
  const policy = validPolicy({
    criteria: [
      {
        field: 'deployment.locality',
        preference: ['owner-local', 'provider-remote', 'owner-remote', 'hybrid']
      }
    ]
  });

  const report = proposeCognitiveSelection(candidates(), request, policy);
  assert.deepEqual(report.ranked_candidates.map((item) => item.profile_id), ['cognitive.example.remote']);
  assert.equal(report.recommended_profile_id, 'cognitive.example.remote');
  assert.equal(report.rejected_profiles.length, 1);
  assert.equal(report.rejected_profiles[0].profile_id, 'cognitive.example.local');
  assert.deepEqual(report.rejected_profiles[0].reasons, ['locality-not-allowed']);
});

test('all rejected candidates produce no recommendation instead of relaxing eligibility', () => {
  const report = proposeCognitiveSelection(
    candidates(),
    validRequest({ required_capabilities: ['vision'] }),
    validPolicy()
  );

  assert.deepEqual(report.ranked_candidates, []);
  assert.equal(report.eligible_profiles, 0);
  assert.equal(report.rejected_profiles.length, 2);
  assert.equal(report.recommendation_made, false);
  assert.equal(report.recommended_profile_id, null);
  assert.equal(report.recommended_profile_digest, null);
  assert.equal(report.winner_selected, false);
  assert.equal(report.runtime_activation, false);
  assert.equal(report.authority_effect, 'none');
});

test('complete policy ties use locale-independent profile_id code-unit ordering', () => {
  const report = proposeCognitiveSelection(tiedCandidates(), validRequest(), validPolicy());
  assert.deepEqual(report.ranked_candidates.map((item) => item.profile_id), [
    'cognitive.example.-',
    'cognitive.example.A',
    'cognitive.example._',
    'cognitive.example.a'
  ]);
});

test('selection proposal does not mutate deeply frozen candidates, request, or policy', () => {
  const inputCandidates = deepFreeze(candidates());
  const request = deepFreeze(validRequest());
  const policy = deepFreeze(validPolicy());
  const candidateSnapshot = structuredClone(inputCandidates);
  const requestSnapshot = structuredClone(request);
  const policySnapshot = structuredClone(policy);

  const report = proposeCognitiveSelection(inputCandidates, request, policy);

  assert.deepEqual(inputCandidates, candidateSnapshot);
  assert.deepEqual(request, requestSnapshot);
  assert.deepEqual(policy, policySnapshot);
  assertDeepFrozen(report);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  COGNITIVE_CAPABILITY_PROFILE_SCHEMA,
  cognitiveCapabilityProfileDigest,
  resolveCognitiveCapabilityProfile,
  validateCognitiveCapabilityProfile
} from '../src/lib/cognitive-capability-profile.mjs';

const ARTIFACT_DIGEST = 'a'.repeat(64);

function remoteCatalogEntry() {
  return {
    schema: 'axiom-runtime-connector-catalog-entry.v1',
    entry_id: 'provider:example-api',
    entry_version: '0.1.0',
    integration_class: 'model-provider',
    subject: {
      subject_id: 'provider:example-api',
      display_name: 'Example API',
      description: 'Test-only hosted model provider.'
    },
    provenance: {
      source_kind: 'service-endpoint',
      service_origin: 'https://api.example.com',
      license_spdx: 'NOASSERTION',
      mutable_ref_allowed: false
    },
    compatibility: {
      platforms: ['other'],
      deployment_forms: ['remote-service'],
      adapter_contracts: [],
      protocol_profiles: ['https-json-api']
    },
    requested_access: {
      install_grants_authority: false,
      capabilities: [],
      actions: [],
      purposes: ['model-inference'],
      destinations: ['https://api.example.com'],
      data_classes: ['model-input', 'model-output'],
      credential_classes: ['api-key'],
      network_required: true,
      network_destinations: ['https://api.example.com']
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
      rollback_available: false,
      quarantine_supported: true
    },
    non_claims: [
      'Test fixture does not authorize provider access.'
    ]
  };
}

function localCatalogEntry() {
  return {
    schema: 'axiom-runtime-connector-catalog-entry.v1',
    entry_id: 'compute:example-local:research',
    entry_version: '0.1.0',
    integration_class: 'compute-backend',
    subject: {
      subject_id: 'compute:example-local:research',
      display_name: 'Example Local Runtime',
      description: 'Test-only local compute backend.'
    },
    provenance: {
      source_kind: 'source-repository',
      source_repository: 'https://github.com/example/example-local',
      source_commit: 'b'.repeat(40),
      license_spdx: 'MIT',
      mutable_ref_allowed: false
    },
    compatibility: {
      platforms: ['linux'],
      deployment_forms: ['process'],
      adapter_contracts: []
    },
    requested_access: {
      install_grants_authority: false,
      capabilities: [],
      actions: [],
      purposes: [],
      destinations: [],
      data_classes: [],
      credential_classes: [],
      network_required: false
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
      rollback_available: true,
      quarantine_supported: true
    },
    non_claims: [
      'Test fixture does not authorize runtime activation.'
    ]
  };
}

function remoteProfile(entry = remoteCatalogEntry()) {
  return {
    schema: 'axiom-cognitive-capability-profile.v0',
    version: 0,
    status: 'inert-routing-metadata-laboratory',
    profile_id: 'cognitive.example.remote.general',
    catalog_entry: {
      entry_id: entry.entry_id,
      entry_version: entry.entry_version,
      entry_digest: digestObject(entry)
    },
    integration_class: 'model-provider',
    offering_ref: 'model.example.general',
    capabilities: ['reasoning', 'research', 'summarization'],
    modalities: {
      input: ['text'],
      output: ['text']
    },
    deployment: {
      locality: 'provider-remote',
      access_mode: 'api'
    },
    data_policy: {
      retention: 'unknown',
      training_use: 'unknown',
      exportability: 'unknown',
      policy_ref: 'policy.example.provider.v1'
    },
    economics: {
      cost_class: 'medium',
      latency_class: 'interactive',
      context_class: 'large'
    },
    openness: {
      weight_access: 'closed',
      artifact_digest: null,
      license_ref: null
    },
    assurance: {
      ceiling: 'self-asserted',
      evidence_refs: ['evidence.example.provider-review']
    },
    created_at: '2026-08-30T04:00:00.000Z',
    updated_at: '2026-08-30T04:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only'
  };
}

function localProfile(entry = localCatalogEntry()) {
  const profile = remoteProfile(entry);
  profile.profile_id = 'cognitive.example.local.general';
  profile.integration_class = 'compute-backend';
  profile.offering_ref = 'runtime.example.local';
  profile.capabilities = ['reasoning', 'coding'];
  profile.deployment = {
    locality: 'owner-local',
    access_mode: 'local-runtime'
  };
  profile.data_policy = {
    retention: 'none',
    training_use: 'excluded',
    exportability: 'full',
    policy_ref: null
  };
  profile.economics = {
    cost_class: 'none',
    latency_class: 'local-fast',
    context_class: 'medium'
  };
  profile.openness = {
    weight_access: 'open-acquired',
    artifact_digest: ARTIFACT_DIGEST,
    license_ref: 'MIT'
  };
  profile.assurance = {
    ceiling: 'cryptographic',
    evidence_refs: ['evidence.example.local-artifact']
  };
  return profile;
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('validates routing metadata without widening authority', () => {
  const profile = remoteProfile();
  const result = validateCognitiveCapabilityProfile(profile);

  assert.equal(COGNITIVE_CAPABILITY_PROFILE_SCHEMA, profile.schema);
  assert.equal(result.valid, true);
  assert.equal(result.profile_id, profile.profile_id);
  assert.equal(result.offering_ref, profile.offering_ref);
  assert.equal(result.integration_class, 'model-provider');
  assert.equal(result.profile_digest, cognitiveCapabilityProfileDigest(profile));
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.credential_visibility, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.selection_effect, 'eligibility-only');
  assert.equal(Object.isFrozen(result), true);
});

test('profile digest is deterministic across top-level key order', () => {
  const first = remoteProfile();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(cognitiveCapabilityProfileDigest(first), cognitiveCapabilityProfileDigest(second));
});

test('resolves an exact remote provider catalog entry by identity version digest and class', () => {
  const entry = remoteCatalogEntry();
  const result = resolveCognitiveCapabilityProfile(remoteProfile(entry), entry);

  assert.equal(result.valid, true);
  assert.equal(result.catalog_entry_id, entry.entry_id);
  assert.equal(result.catalog_entry_version, entry.entry_version);
  assert.equal(result.catalog_entry_digest, digestObject(entry));
  assert.equal(result.integration_class, 'model-provider');
  assert.equal(result.locality, 'provider-remote');
  assert.equal(result.access_mode, 'api');
  assert.equal(result.requires_gateway_authorization, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(Object.isFrozen(result), true);
});

test('resolves an owner-local compute backend without treating local access as authority', () => {
  const entry = localCatalogEntry();
  const result = resolveCognitiveCapabilityProfile(localProfile(entry), entry);

  assert.equal(result.valid, true);
  assert.equal(result.integration_class, 'compute-backend');
  assert.equal(result.locality, 'owner-local');
  assert.equal(result.access_mode, 'local-runtime');
  assert.equal(result.requires_gateway_authorization, true);
});

test('catalog identity version digest and class drift fail closed', () => {
  const entry = remoteCatalogEntry();

  const wrongId = remoteProfile(entry);
  wrongId.catalog_entry.entry_id = 'provider:other-api';
  assert.throws(() => resolveCognitiveCapabilityProfile(wrongId, entry), /entry_id/i);

  const wrongVersion = remoteProfile(entry);
  wrongVersion.catalog_entry.entry_version = '0.2.0';
  assert.throws(() => resolveCognitiveCapabilityProfile(wrongVersion, entry), /entry_version/i);

  const wrongDigest = remoteProfile(entry);
  wrongDigest.catalog_entry.entry_digest = 'c'.repeat(64);
  assert.throws(() => resolveCognitiveCapabilityProfile(wrongDigest, entry), /digest/i);

  const wrongClass = remoteProfile(entry);
  wrongClass.integration_class = 'compute-backend';
  assert.throws(() => resolveCognitiveCapabilityProfile(wrongClass, entry), /integration_class/i);
});

test('locality and access mode must agree with catalog network posture', () => {
  const remoteEntry = remoteCatalogEntry();
  const remoteAsLocal = remoteProfile(remoteEntry);
  remoteAsLocal.deployment = { locality: 'owner-local', access_mode: 'local-runtime' };
  assert.throws(() => resolveCognitiveCapabilityProfile(remoteAsLocal, remoteEntry), /network|local/i);

  const localEntry = localCatalogEntry();
  const localAsApi = localProfile(localEntry);
  localAsApi.deployment = { locality: 'provider-remote', access_mode: 'api' };
  assert.throws(() => resolveCognitiveCapabilityProfile(localAsApi, localEntry), /network|remote|api/i);
});

test('owner-addressable weight states require exact artifact digests and other states reject them', () => {
  for (const weightAccess of ['open-acquired', 'local-proprietary']) {
    const missing = localProfile();
    missing.openness.weight_access = weightAccess;
    missing.openness.artifact_digest = null;
    assert.throws(() => validateCognitiveCapabilityProfile(missing), /artifact_digest/i);
  }

  for (const weightAccess of ['closed', 'open-remote', 'not-applicable']) {
    const unexpected = remoteProfile();
    unexpected.openness.weight_access = weightAccess;
    unexpected.openness.artifact_digest = ARTIFACT_DIGEST;
    assert.throws(() => validateCognitiveCapabilityProfile(unexpected), /artifact_digest/i);
  }
});

test('unknown fields duplicates and malformed enum values fail closed', () => {
  const unknown = remoteProfile();
  unknown.api_key = 'not-allowed';
  assert.throws(() => validateCognitiveCapabilityProfile(unknown), /unknown field/i);

  const duplicateCapability = remoteProfile();
  duplicateCapability.capabilities.push('reasoning');
  assert.throws(() => validateCognitiveCapabilityProfile(duplicateCapability), /duplicate/i);

  const duplicateModality = remoteProfile();
  duplicateModality.modalities.input.push('text');
  assert.throws(() => validateCognitiveCapabilityProfile(duplicateModality), /duplicate/i);

  const invalidLocality = remoteProfile();
  invalidLocality.deployment.locality = 'ambient';
  assert.throws(() => validateCognitiveCapabilityProfile(invalidLocality), /locality/i);
});

test('timestamps and hard boundary fields fail closed', () => {
  const time = remoteProfile();
  time.updated_at = '2026-08-30T03:59:59.000Z';
  assert.throws(() => validateCognitiveCapabilityProfile(time), /updated_at/i);

  const mutations = [
    ['authority_effect', 'grant'],
    ['network_effect', 'outbound'],
    ['credential_visibility', 'provider'],
    ['runtime_activation', true],
    ['selection_effect', 'winner']
  ];

  for (const [field, value] of mutations) {
    const profile = remoteProfile();
    profile[field] = value;
    assert.throws(() => validateCognitiveCapabilityProfile(profile), /boundary|selection_effect/i);
  }
});

test('validation and resolution do not mutate deeply frozen inputs', () => {
  const entry = deepFreeze(remoteCatalogEntry());
  const profile = deepFreeze(remoteProfile(entry));
  const beforeEntry = JSON.stringify(entry);
  const beforeProfile = JSON.stringify(profile);

  assert.equal(validateCognitiveCapabilityProfile(profile).valid, true);
  assert.equal(resolveCognitiveCapabilityProfile(profile, entry).valid, true);
  assert.equal(JSON.stringify(entry), beforeEntry);
  assert.equal(JSON.stringify(profile), beforeProfile);
});

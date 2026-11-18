import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  BOUNDED_DECISION_PROVIDER_PROFILE_SCHEMA,
  boundedDecisionProviderProfileDigest,
  resolveBoundedDecisionProviderProfile,
  validateBoundedDecisionProviderProfile
} from '../src/lib/bounded-decision-provider-profile.mjs';

function remoteCatalogEntry() {
  return {
    schema: 'axiom-runtime-connector-catalog-entry.v1',
    entry_id: 'provider:example-bounded-api',
    entry_version: '0.1.0',
    integration_class: 'model-provider',
    subject: {
      subject_id: 'provider:example-bounded-api',
      display_name: 'Example Bounded API',
      description: 'Test-only hosted bounded-decision provider.'
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
      cataloged_at: '2026-09-15T20:00:00Z'
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
    entry_id: 'compute:example-bounded-local',
    entry_version: '0.1.0',
    integration_class: 'compute-backend',
    subject: {
      subject_id: 'compute:example-bounded-local',
      display_name: 'Example Local Bounded Runtime',
      description: 'Test-only owner-local bounded-decision runtime.'
    },
    provenance: {
      source_kind: 'source-repository',
      source_repository: 'https://github.com/example/bounded-local',
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
      cataloged_at: '2026-09-15T20:00:00Z'
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
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.example.remote.v1',
    catalog_entry_id: entry.entry_id,
    catalog_entry_version: entry.entry_version,
    catalog_entry_digest: digestObject(entry),
    offering_ref: 'model.example.bounded',
    offering_version_or_revision: 'model.example.bounded-latest',
    offering_revision_evidence: 'mutable-alias',
    provider_mode: 'provider-remote',
    supported_question_kinds: ['choice', 'score', 'binary-probability'],
    max_questions_per_request: 64,
    max_choice_cardinality: 64,
    max_score_levels: 10,
    type_guarantee: 'provider-native-closed-set',
    probability_support: 'full-distribution',
    latency_class: 'interactive',
    calibration_claim: 'provider-claimed',
    retention_posture_ref: null,
    training_use_posture_ref: null,
    created_at: '2026-09-15T21:00:00.000Z',
    review_at: '2026-10-15T21:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none'
  };
}

function localProfile(entry = localCatalogEntry()) {
  const profile = remoteProfile(entry);
  profile.profile_id = 'bounded.provider.example.local.v1';
  profile.offering_ref = 'model.example.local-bounded';
  profile.offering_version_or_revision = 'sha256:' + 'a'.repeat(64);
  profile.offering_revision_evidence = 'exact-artifact';
  profile.provider_mode = 'owner-local';
  profile.latency_class = 'local-fast';
  profile.calibration_claim = 'local-experimental';
  profile.retention_posture_ref = 'posture.retention.none.v1';
  profile.training_use_posture_ref = 'posture.training.excluded.v1';
  return profile;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('validates bounded-decision provider metadata without widening authority', () => {
  const profile = remoteProfile();
  const result = validateBoundedDecisionProviderProfile(profile);

  assert.equal(BOUNDED_DECISION_PROVIDER_PROFILE_SCHEMA, profile.schema);
  assert.equal(result.valid, true);
  assert.equal(result.profile_id, profile.profile_id);
  assert.equal(result.offering_ref, profile.offering_ref);
  assert.equal(result.offering_revision_evidence, 'mutable-alias');
  assert.equal(result.profile_digest, boundedDecisionProviderProfileDigest(profile));
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.credential_visibility, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.selection_effect, 'eligibility-only');
  assert.equal(result.assurance_effect, 'none');
  assert.equal(Object.isFrozen(result), true);
});

test('profile digest is deterministic across top-level key order', () => {
  const first = remoteProfile();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(
    boundedDecisionProviderProfileDigest(first),
    boundedDecisionProviderProfileDigest(second)
  );
});

test('resolves exact remote and owner-local catalog bindings without granting execution', () => {
  const remoteEntry = remoteCatalogEntry();
  const remote = resolveBoundedDecisionProviderProfile(remoteProfile(remoteEntry), remoteEntry);
  assert.equal(remote.catalog_entry_id, remoteEntry.entry_id);
  assert.equal(remote.catalog_entry_version, remoteEntry.entry_version);
  assert.equal(remote.catalog_entry_digest, digestObject(remoteEntry));
  assert.equal(remote.provider_mode, 'provider-remote');
  assert.equal(remote.network_required, true);
  assert.equal(remote.requires_gateway_authorization, true);
  assert.equal(remote.authority_effect, 'none');

  const localEntry = localCatalogEntry();
  const local = resolveBoundedDecisionProviderProfile(localProfile(localEntry), localEntry);
  assert.equal(local.catalog_entry_id, localEntry.entry_id);
  assert.equal(local.provider_mode, 'owner-local');
  assert.equal(local.network_required, false);
  assert.equal(local.requires_gateway_authorization, true);
  assert.equal(local.runtime_activation, false);
});

test('catalog identity version and digest drift fail closed', () => {
  const entry = remoteCatalogEntry();

  const wrongId = remoteProfile(entry);
  wrongId.catalog_entry_id = 'provider:other';
  assert.throws(
    () => resolveBoundedDecisionProviderProfile(wrongId, entry),
    /catalog.*entry_id|entry_id.*catalog/i
  );

  const wrongVersion = remoteProfile(entry);
  wrongVersion.catalog_entry_version = '0.2.0';
  assert.throws(
    () => resolveBoundedDecisionProviderProfile(wrongVersion, entry),
    /catalog.*version|version.*catalog/i
  );

  const wrongDigest = remoteProfile(entry);
  wrongDigest.catalog_entry_digest = 'c'.repeat(64);
  assert.throws(
    () => resolveBoundedDecisionProviderProfile(wrongDigest, entry),
    /catalog.*digest|digest.*catalog/i
  );
});

test('provider mode must agree with catalog network posture', () => {
  const remoteEntry = remoteCatalogEntry();
  const remoteAsLocal = remoteProfile(remoteEntry);
  remoteAsLocal.provider_mode = 'owner-local';
  assert.throws(
    () => resolveBoundedDecisionProviderProfile(remoteAsLocal, remoteEntry),
    /owner-local|network/i
  );

  const localEntry = localCatalogEntry();
  const localAsRemote = localProfile(localEntry);
  localAsRemote.provider_mode = 'provider-remote';
  assert.throws(
    () => resolveBoundedDecisionProviderProfile(localAsRemote, localEntry),
    /provider-remote|network|remote/i
  );
});

test('unknown fields duplicate kinds malformed enums and invalid ceilings fail closed', () => {
  const unknown = remoteProfile();
  unknown.api_key = 'forbidden';
  assert.throws(() => validateBoundedDecisionProviderProfile(unknown), /unknown field/i);

  const duplicate = remoteProfile();
  duplicate.supported_question_kinds.push('choice');
  assert.throws(() => validateBoundedDecisionProviderProfile(duplicate), /duplicate/i);

  for (const [field, value] of [
    ['offering_revision_evidence', 'exact-ish'],
    ['provider_mode', 'ambient'],
    ['type_guarantee', 'perfect'],
    ['probability_support', 'magic'],
    ['latency_class', 'instant'],
    ['calibration_claim', 'guaranteed']
  ]) {
    const profile = remoteProfile();
    profile[field] = value;
    assert.throws(() => validateBoundedDecisionProviderProfile(profile), new RegExp(field, 'i'));
  }

  for (const field of ['max_questions_per_request', 'max_choice_cardinality', 'max_score_levels']) {
    for (const value of [0, -1, Number.MAX_SAFE_INTEGER]) {
      const profile = remoteProfile();
      profile[field] = value;
      assert.throws(() => validateBoundedDecisionProviderProfile(profile), new RegExp(field, 'i'));
    }
  }
});

test('timestamps nullable posture references and hard boundaries fail closed', () => {
  const chronology = remoteProfile();
  chronology.review_at = '2026-09-15T20:59:59.000Z';
  assert.throws(() => validateBoundedDecisionProviderProfile(chronology), /review_at/i);

  const badTimestamp = remoteProfile();
  badTimestamp.created_at = 'not-a-date';
  assert.throws(() => validateBoundedDecisionProviderProfile(badTimestamp), /created_at/i);

  for (const field of ['retention_posture_ref', 'training_use_posture_ref']) {
    const empty = remoteProfile();
    empty[field] = '';
    assert.throws(() => validateBoundedDecisionProviderProfile(empty), new RegExp(field, 'i'));

    const tooLong = remoteProfile();
    tooLong[field] = 'x'.repeat(513);
    assert.throws(() => validateBoundedDecisionProviderProfile(tooLong), new RegExp(field, 'i'));
  }

  const mutations = [
    ['authority_effect', 'grant'],
    ['network_effect', 'outbound'],
    ['credential_visibility', 'provider'],
    ['runtime_activation', true],
    ['selection_effect', 'winner'],
    ['assurance_effect', 'A3']
  ];
  for (const [field, value] of mutations) {
    const profile = remoteProfile();
    profile[field] = value;
    assert.throws(() => validateBoundedDecisionProviderProfile(profile), /boundary|effect|selection/i);
  }
});

test('validation and resolution preserve deeply frozen caller inputs', () => {
  const entry = deepFreeze(remoteCatalogEntry());
  const profile = deepFreeze(remoteProfile(entry));
  const beforeEntry = JSON.stringify(entry);
  const beforeProfile = JSON.stringify(profile);

  assert.equal(validateBoundedDecisionProviderProfile(profile).valid, true);
  assert.equal(resolveBoundedDecisionProviderProfile(profile, entry).valid, true);
  assert.equal(JSON.stringify(entry), beforeEntry);
  assert.equal(JSON.stringify(profile), beforeProfile);
});

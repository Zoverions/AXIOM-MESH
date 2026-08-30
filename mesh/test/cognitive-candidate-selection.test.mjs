import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  COGNITIVE_ELIGIBILITY_REQUEST_SCHEMA,
  evaluateCognitiveCandidates,
  validateCognitiveEligibilityRequest
} from '../src/lib/cognitive-capability-profile.mjs';

const ARTIFACT_DIGEST = 'a'.repeat(64);

function catalogEntry({
  entryId,
  integrationClass,
  networkRequired,
  remote = false
}) {
  const base = {
    schema: 'axiom-runtime-connector-catalog-entry.v1',
    entry_id: entryId,
    entry_version: '0.1.0',
    integration_class: integrationClass,
    subject: {
      subject_id: entryId,
      display_name: entryId,
      description: 'Test-only cognitive eligibility fixture.'
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
  return base;
}

function profileFor(entry, overrides = {}) {
  const local = entry.integration_class === 'compute-backend';
  const profile = {
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
    modalities: {
      input: ['text'],
      output: ['text']
    },
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
    selection_effect: 'eligibility-only'
  };

  for (const [key, value] of Object.entries(overrides)) profile[key] = value;
  return profile;
}

function candidates() {
  const localEntry = catalogEntry({
    entryId: 'compute:example-local:research',
    integrationClass: 'compute-backend',
    networkRequired: false,
    remote: false
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

function validRequest() {
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
    selection_effect: 'eligibility-only'
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function rejectedReasons(report, profileId) {
  return report.rejected.find((item) => item.profile_id === profileId)?.reasons ?? [];
}

test('validates an explicit zero-authority eligibility request', () => {
  const request = validRequest();
  const result = validateCognitiveEligibilityRequest(request);

  assert.equal(COGNITIVE_ELIGIBILITY_REQUEST_SCHEMA, request.schema);
  assert.equal(result.valid, true);
  assert.equal(result.request_id, request.request_id);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.credential_visibility, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.selection_effect, 'eligibility-only');
  assert.equal(Object.isFrozen(result), true);
});

test('returns deterministic eligible candidates without ranking or winner selection', () => {
  const report = evaluateCognitiveCandidates(candidates(), validRequest());

  assert.equal(report.valid, true);
  assert.equal(report.schema, 'axiom-cognitive-eligibility-report.v0');
  assert.deepEqual(report.eligible.map((item) => item.profile_id), [
    'cognitive.example.local',
    'cognitive.example.remote'
  ]);
  assert.deepEqual(report.rejected, []);
  assert.equal(report.ranking_applied, false);
  assert.equal(report.winner_selected, false);
  assert.equal(report.requires_gateway_authorization, true);
  assert.equal(report.authority_effect, 'none');
  assert.equal(report.network_effect, 'none');
  assert.equal(report.credential_visibility, 'none');
  assert.equal(report.runtime_activation, false);
  assert.equal(report.selection_effect, 'eligibility-only');
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.eligible), true);
  assert.equal(Object.isFrozen(report.rejected), true);
});

test('reports stable reason codes for every hard constraint dimension', () => {
  const cases = [
    ['required_capabilities', ['coding'], 'cognitive.example.remote', 'missing-capability'],
    ['allowed_integration_classes', ['compute-backend'], 'cognitive.example.remote', 'integration-class-not-allowed'],
    ['allowed_localities', ['owner-local'], 'cognitive.example.remote', 'locality-not-allowed'],
    ['allowed_retention', ['none'], 'cognitive.example.remote', 'retention-not-allowed'],
    ['allowed_training_use', ['excluded'], 'cognitive.example.remote', 'training-use-not-allowed'],
    ['allowed_weight_access', ['open-acquired'], 'cognitive.example.remote', 'weight-access-not-allowed'],
    ['max_cost_class', 'low', 'cognitive.example.remote', 'cost-too-high-or-unknown'],
    ['max_latency_class', 'local-fast', 'cognitive.example.remote', 'latency-too-high-or-unknown'],
    ['min_assurance_ceiling', 'cryptographic', 'cognitive.example.remote', 'assurance-too-low-or-unknown'],
    ['min_context_class', 'large', 'cognitive.example.local', 'context-too-small-or-unknown']
  ];

  for (const [field, value, profileId, reason] of cases) {
    const request = validRequest();
    request[field] = value;
    const report = evaluateCognitiveCandidates(candidates(), request);
    assert.ok(
      rejectedReasons(report, profileId).includes(reason),
      `${field} should reject ${profileId} with ${reason}`
    );
  }
});

test('unknown cost latency or context fails constrained evaluation unless request explicitly allows unknown', () => {
  const items = candidates();
  const remote = items.find((item) => item.profile.profile_id === 'cognitive.example.remote');
  remote.profile.economics = {
    cost_class: 'unknown',
    latency_class: 'unknown',
    context_class: 'unknown'
  };
  remote.profile.catalog_entry.entry_digest = digestObject(remote.catalog_entry);

  const constrained = validRequest();
  const report = evaluateCognitiveCandidates(items, constrained);
  const reasons = rejectedReasons(report, 'cognitive.example.remote');
  assert.ok(reasons.includes('cost-too-high-or-unknown'));
  assert.ok(reasons.includes('latency-too-high-or-unknown'));
  assert.ok(reasons.includes('context-too-small-or-unknown'));

  const unconstrained = validRequest();
  unconstrained.max_cost_class = 'unknown';
  unconstrained.max_latency_class = 'unknown';
  unconstrained.min_context_class = 'unknown';
  const allowed = evaluateCognitiveCandidates(items, unconstrained);
  assert.equal(allowed.eligible.some((item) => item.profile_id === 'cognitive.example.remote'), true);
});

test('request validation fails closed for unknown fields duplicates invalid enums and widened boundary', () => {
  const unknown = validRequest();
  unknown.api_key = 'not-allowed';
  assert.throws(() => validateCognitiveEligibilityRequest(unknown), /unknown field/i);

  const duplicate = validRequest();
  duplicate.required_capabilities.push('reasoning');
  assert.throws(() => validateCognitiveEligibilityRequest(duplicate), /duplicate/i);

  const invalid = validRequest();
  invalid.max_cost_class = 'free-ish';
  assert.throws(() => validateCognitiveEligibilityRequest(invalid), /max_cost_class/i);

  const widened = validRequest();
  widened.runtime_activation = true;
  assert.throws(() => validateCognitiveEligibilityRequest(widened), /boundary/i);
});

test('duplicate profile identifiers in one evaluation fail closed', () => {
  const items = candidates();
  items.push({
    profile: structuredClone(items[0].profile),
    catalog_entry: structuredClone(items[0].catalog_entry)
  });
  assert.throws(() => evaluateCognitiveCandidates(items, validRequest()), /duplicate profile_id/i);
});

test('eligibility evaluation does not mutate deeply frozen requests profiles or catalog entries', () => {
  const request = deepFreeze(validRequest());
  const items = deepFreeze(candidates());
  const beforeRequest = JSON.stringify(request);
  const beforeItems = JSON.stringify(items);

  const report = evaluateCognitiveCandidates(items, request);
  assert.equal(report.valid, true);
  assert.equal(JSON.stringify(request), beforeRequest);
  assert.equal(JSON.stringify(items), beforeItems);
});

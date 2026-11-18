import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  COGNITIVE_ADVISOR_ESCALATION_POLICY_SCHEMA,
  COGNITIVE_ADVISOR_ESCALATION_REQUEST_SCHEMA,
  proposeCognitiveAdvisorEscalation,
  validateCognitiveAdvisorEscalationPolicy,
  validateCognitiveAdvisorEscalationRequest
} from '../src/lib/cognitive-advisor-escalation.mjs';

const SCHEMA_PATH = new URL('../config/cognitive-advisor-escalation-policy-v0.schema.json', import.meta.url);
const SOURCE_PATH = new URL('../src/lib/cognitive-advisor-escalation.mjs', import.meta.url);

function remoteCatalogEntry() {
  return {
    schema: 'axiom-runtime-connector-catalog-entry.v1',
    entry_id: 'provider:bounded-advisor',
    entry_version: '0.1.0',
    integration_class: 'model-provider',
    subject: {
      subject_id: 'provider:bounded-advisor',
      display_name: 'Bounded Advisor',
      description: 'Test-only remote model advisor.'
    },
    provenance: {
      source_kind: 'service-endpoint',
      service_origin: 'https://advisor.example.com',
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
      destinations: ['https://advisor.example.com'],
      data_classes: ['model-input', 'model-output'],
      credential_classes: ['api-key'],
      network_required: true,
      network_destinations: ['https://advisor.example.com']
    },
    orchestration: {
      mode: 'none',
      may_spawn_workers: false,
      independent_child_authority_requested: false,
      remote_execution_requested: false
    },
    assurance: {
      observations: [],
      cataloged_at: '2026-09-14T16:30:00Z'
    },
    lifecycle: {
      update_mode: 'manual-reviewed',
      silent_permission_widening_allowed: false,
      rollback_available: false,
      quarantine_supported: true
    },
    non_claims: ['Test fixture grants no provider authority or network permission.']
  };
}

function localCatalogEntry() {
  const entry = remoteCatalogEntry();
  entry.entry_id = 'compute:local-advisor';
  entry.integration_class = 'compute-backend';
  entry.subject = {
    subject_id: entry.entry_id,
    display_name: 'Local Advisor',
    description: 'Test-only local compute backend.'
  };
  entry.provenance = {
    source_kind: 'source-repository',
    source_repository: 'https://github.com/example/local-advisor',
    source_commit: 'b'.repeat(40),
    license_spdx: 'MIT',
    mutable_ref_allowed: false
  };
  entry.compatibility = {
    platforms: ['linux'],
    deployment_forms: ['process'],
    adapter_contracts: []
  };
  entry.requested_access = {
    install_grants_authority: false,
    capabilities: [],
    actions: [],
    purposes: [],
    destinations: [],
    data_classes: [],
    credential_classes: [],
    network_required: false
  };
  entry.lifecycle.rollback_available = true;
  return entry;
}

function profileFor(entry, overrides = {}) {
  const local = entry.integration_class === 'compute-backend';
  return {
    schema: 'axiom-cognitive-capability-profile.v0',
    version: 0,
    status: 'inert-routing-metadata-laboratory',
    profile_id: local ? 'cognitive.local.advisor' : 'cognitive.remote.advisor',
    catalog_entry: {
      entry_id: entry.entry_id,
      entry_version: entry.entry_version,
      entry_digest: digestObject(entry)
    },
    integration_class: entry.integration_class,
    offering_ref: local ? 'runtime.local.advisor' : 'model.remote.advisor',
    capabilities: ['reasoning', 'critique'],
    modalities: { input: ['text'], output: ['text'] },
    deployment: local
      ? { locality: 'owner-local', access_mode: 'local-runtime' }
      : { locality: 'provider-remote', access_mode: 'api' },
    data_policy: local
      ? { retention: 'none', training_use: 'excluded', exportability: 'full', policy_ref: null }
      : { retention: 'unknown', training_use: 'unknown', exportability: 'unknown', policy_ref: 'policy.remote.advisor.v1' },
    economics: local
      ? { cost_class: 'none', latency_class: 'local-fast', context_class: 'medium' }
      : { cost_class: 'medium', latency_class: 'interactive', context_class: 'large' },
    openness: local
      ? { weight_access: 'open-acquired', artifact_digest: 'a'.repeat(64), license_ref: 'MIT' }
      : { weight_access: 'closed', artifact_digest: null, license_ref: null },
    assurance: local
      ? { ceiling: 'cryptographic', evidence_refs: ['evidence.local'] }
      : { ceiling: 'self-asserted', evidence_refs: ['evidence.remote'] },
    created_at: '2026-09-14T16:30:00.000Z',
    updated_at: '2026-09-14T16:30:00.000Z',
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
    schema: 'axiom-cognitive-advisor-escalation-policy.v0',
    version: 0,
    status: 'inert-escalation-policy',
    policy_id: 'escalation.local-first.bounded-advisor',
    allowed_reasons: ['capability-gap', 'quality-threshold', 'owner-request'],
    owner_confirmation_required: true,
    projection_required: true,
    created_at: '2026-09-14T16:35:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    escalation_effect: 'proposal-only',
    ...overrides
  };
}

function validRequest(overrides = {}) {
  const catalogEntry = remoteCatalogEntry();
  return {
    schema: 'axiom-cognitive-advisor-escalation-request.v0',
    version: 0,
    status: 'inert-escalation-request',
    request_id: 'escalation.request.example',
    policy_id: validPolicy().policy_id,
    reason: 'capability-gap',
    local_selection_proposal_digest: 'd'.repeat(64),
    advisor_candidate: {
      profile: profileFor(catalogEntry),
      catalog_entry: catalogEntry
    },
    disclosure: {
      purpose: 'bounded-advisor-reasoning',
      projection_digest: 'c'.repeat(64),
      data_classes: ['task-context', 'selected-user-context'],
      raw_private_state_included: false,
      credentials_included: false
    },
    created_at: '2026-09-14T16:36:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    escalation_effect: 'proposal-only',
    ...overrides
  };
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test('schema and source keep cloud-advisor escalation inert and effect-free', async () => {
  assert.equal(COGNITIVE_ADVISOR_ESCALATION_POLICY_SCHEMA, 'axiom-cognitive-advisor-escalation-policy.v0');
  assert.equal(COGNITIVE_ADVISOR_ESCALATION_REQUEST_SCHEMA, 'axiom-cognitive-advisor-escalation-request.v0');

  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  assert.equal(schema.$id, 'https://axiom.invalid/schemas/cognitive-advisor-escalation-policy-v0.schema.json');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, COGNITIVE_ADVISOR_ESCALATION_POLICY_SCHEMA);
  assert.equal(schema.properties.owner_confirmation_required.const, true);
  assert.equal(schema.properties.projection_required.const, true);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.escalation_effect.const, 'proposal-only');

  const source = await readFile(SOURCE_PATH, 'utf8');
  const imports = source.split('\n').filter((line) => /^\s*import\b/.test(line)).join('\n');
  for (const marker of ['node:fs', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:child_process', 'node:worker_threads']) {
    assert.equal(imports.includes(marker), false, `cloud-advisor contract imports must not contain ${marker}`);
  }
  for (const marker of ['fetch(', 'createConnection(', 'request(', 'spawn(', 'exec(']) {
    assert.equal(source.includes(marker), false, `cloud-advisor contract must not contain effect primitive ${marker}`);
  }
});

test('validates bounded policy and request without granting network or runtime authority', () => {
  const policy = validateCognitiveAdvisorEscalationPolicy(validPolicy());
  const request = validateCognitiveAdvisorEscalationRequest(validRequest());

  assert.equal(policy.valid, true);
  assert.equal(policy.owner_confirmation_required, true);
  assert.equal(policy.projection_required, true);
  assert.equal(policy.authority_effect, 'none');
  assert.equal(policy.network_effect, 'none');
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.escalation_effect, 'proposal-only');

  assert.equal(request.valid, true);
  assert.equal(request.authority_effect, 'none');
  assert.equal(request.network_effect, 'none');
  assert.equal(request.credential_visibility, 'none');
  assert.equal(request.runtime_activation, false);
  assert.equal(request.escalation_effect, 'proposal-only');
  assertDeepFrozen(policy);
  assertDeepFrozen(request);
});

test('proposes exact remote advisor and disclosure projection without executing escalation', () => {
  const policy = validPolicy();
  const request = validRequest();
  const proposal = proposeCognitiveAdvisorEscalation(request, policy);

  assert.equal(proposal.valid, true);
  assert.equal(proposal.schema, 'axiom-cognitive-advisor-escalation-proposal.v0');
  assert.equal(proposal.status, 'inert-escalation-proposal');
  assert.equal(proposal.request_digest, digestObject(request));
  assert.equal(proposal.policy_digest, digestObject(policy));
  assert.equal(proposal.advisor_profile_id, request.advisor_candidate.profile.profile_id);
  assert.equal(proposal.advisor_profile_digest, digestObject(request.advisor_candidate.profile));
  assert.equal(proposal.catalog_entry_id, request.advisor_candidate.catalog_entry.entry_id);
  assert.equal(proposal.catalog_entry_digest, digestObject(request.advisor_candidate.catalog_entry));
  assert.equal(proposal.disclosure_projection_digest, request.disclosure.projection_digest);
  assert.deepEqual(proposal.disclosure_data_classes, request.disclosure.data_classes);
  assert.equal(proposal.requires_owner_confirmation, true);
  assert.equal(proposal.requires_gateway_authorization, true);
  assert.equal(proposal.requires_disclosure_authorization, true);
  assert.equal(proposal.recommendation_only, true);
  assert.equal(proposal.execution_effect, 'none');
  assert.equal(proposal.authority_effect, 'none');
  assert.equal(proposal.network_effect, 'none');
  assert.equal(proposal.credential_visibility, 'none');
  assert.equal(proposal.runtime_activation, false);
  assert.equal(proposal.escalation_effect, 'proposal-only');
  assertDeepFrozen(proposal);
});

test('owner-local candidates cannot be relabeled as cloud advisors', () => {
  const entry = localCatalogEntry();
  const request = validRequest({
    advisor_candidate: {
      profile: profileFor(entry),
      catalog_entry: entry
    }
  });
  assert.throws(() => validateCognitiveAdvisorEscalationRequest(request), /remote|advisor|provider/i);
});

test('raw private state and credentials cannot be admitted by a disclosure projection', () => {
  const rawState = validRequest();
  rawState.disclosure.raw_private_state_included = true;
  assert.throws(() => validateCognitiveAdvisorEscalationRequest(rawState), /raw private state|disclosure/i);

  const credentials = validRequest();
  credentials.disclosure.credentials_included = true;
  assert.throws(() => validateCognitiveAdvisorEscalationRequest(credentials), /credential|disclosure/i);
});

test('policy reason limits dominate request preference', () => {
  const request = validRequest({ reason: 'quality-threshold' });
  const policy = validPolicy({ allowed_reasons: ['capability-gap'] });
  assert.throws(() => proposeCognitiveAdvisorEscalation(request, policy), /reason|allowed/i);
});

test('catalog/profile substitution and boundary widening fail closed', () => {
  const substituted = validRequest();
  substituted.advisor_candidate.profile.catalog_entry.entry_digest = 'e'.repeat(64);
  assert.throws(() => validateCognitiveAdvisorEscalationRequest(substituted), /digest/i);

  const requestMutations = [
    ['authority_effect', 'grant'],
    ['network_effect', 'provider-egress'],
    ['credential_visibility', 'api-key'],
    ['runtime_activation', true],
    ['escalation_effect', 'execute']
  ];
  for (const [field, value] of requestMutations) {
    const request = validRequest();
    request[field] = value;
    assert.throws(() => validateCognitiveAdvisorEscalationRequest(request), /boundary|effect/i);
  }

  const policyMutations = [
    ['owner_confirmation_required', false],
    ['projection_required', false],
    ['authority_effect', 'grant'],
    ['network_effect', 'provider-egress'],
    ['credential_visibility', 'api-key'],
    ['runtime_activation', true],
    ['escalation_effect', 'execute']
  ];
  for (const [field, value] of policyMutations) {
    const policy = validPolicy();
    policy[field] = value;
    assert.throws(() => validateCognitiveAdvisorEscalationPolicy(policy), /boundary|confirmation|projection|effect/i);
  }
});

test('unknown fields and unsupported disclosure classes fail closed', () => {
  const unknown = validRequest();
  unknown.pii_clear = true;
  assert.throws(() => validateCognitiveAdvisorEscalationRequest(unknown), /unknown field/i);

  const unsupported = validRequest();
  unsupported.disclosure.data_classes.push('entire-personal-model');
  assert.throws(() => validateCognitiveAdvisorEscalationRequest(unsupported), /data_classes|disclosure/i);
});

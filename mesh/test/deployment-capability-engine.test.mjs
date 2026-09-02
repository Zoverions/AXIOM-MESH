import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  deploymentSpecDigest,
  validateDeploymentProviderBinding,
  validateDeploymentSpec,
  validateDesiredDeployment
} from '../src/lib/deployment-capability-engine.mjs';

const NOW = '2026-09-02T23:55:00.000Z';
const CREATED = '2026-09-02T23:54:00.000Z';
const EXPIRES = '2026-09-03T00:54:00.000Z';

const RESOURCE_KEYS = Object.freeze([
  'cpu_millis',
  'memory_bytes',
  'accelerator_memory_bytes',
  'durable_storage_bytes',
  'scratch_storage_bytes',
  'io_bytes',
  'network_bytes',
  'network_requests',
  'model_calls',
  'input_units',
  'output_units',
  'concurrency',
  'wall_time_ms',
  'monetary_cost_units',
  'energy_millijoules',
  'process_count',
  'thread_count',
  'file_descriptors'
]);

function resources(overrides = {}) {
  return Object.fromEntries(
    RESOURCE_KEYS.map((key) => [key, overrides[key] ?? 0])
  );
}

function desired(overrides = {}) {
  return {
    schema: 'axiom-desired-deployment.v0',
    version: 0,
    status: 'inert-desire',
    deployment_id: 'deployment.synthetic.v0',
    target_host_ref: 'host.synthetic',
    roles: ['personal-node', 'compute-worker'],
    required_capabilities: ['capability.add', 'capability.present'],
    preferences: {
      locality: 'hybrid',
      priority: 'balanced',
      reuse_existing: true,
      offline_required: false,
      allow_replacement: false
    },
    created_at: CREATED,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

function providerArtifact(id) {
  return {
    schema: 'synthetic-provider-evidence.v0',
    provider_id: id,
    observed_at: CREATED,
    authority_effect: 'none'
  };
}

function binding({
  bindingId = 'binding.synthetic.add',
  providerRef = 'provider.synthetic.add',
  capabilities = ['capability.add'],
  providerKind = 'local-service',
  hostRef = 'host.synthetic',
  presenceState = 'available-not-installed',
  artifact = providerArtifact(providerRef),
  overrides = {}
} = {}) {
  return {
    schema: 'axiom-deployment-provider-binding.v0',
    version: 0,
    status: 'inert-provider-binding',
    binding_id: bindingId,
    provider_kind: providerKind,
    provider_ref: providerRef,
    provider_digest: digestObject(artifact),
    capability_ids: capabilities,
    host_ref: hostRef,
    presence_state: presenceState,
    resource_request: resources({
      cpu_millis: 25,
      memory_bytes: 128 * 1024 * 1024,
      durable_storage_bytes: 64 * 1024 * 1024,
      concurrency: 1,
      process_count: 1,
      thread_count: 2,
      file_descriptors: 16
    }),
    requires_network: false,
    requires_privileged_change: false,
    requires_reboot: false,
    data_egress_possible: false,
    replacement_required: false,
    evidence_refs: ['evidence.synthetic.provider'],
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

function resourceEnvelope(overrides = {}) {
  return {
    schema: 'axiom-resource-envelope.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    envelope_id: 'resource-envelope.synthetic',
    subject_ref: 'deployment.synthetic.v0',
    principal_id: 'principal.synthetic',
    host_ref: 'host.synthetic',
    priority_class: 'P2',
    parent_envelope_ref: null,
    inheritance: {
      mode: 'root',
      parent_budget_accounting: 'not-applicable',
      child_authorization_ref: null
    },
    hard_ceilings: resources({
      cpu_millis: 1000,
      memory_bytes: 8 * 1024 * 1024 * 1024,
      accelerator_memory_bytes: 16 * 1024 * 1024 * 1024,
      durable_storage_bytes: 200 * 1024 * 1024 * 1024,
      scratch_storage_bytes: 50 * 1024 * 1024 * 1024,
      io_bytes: 10 * 1024 * 1024 * 1024,
      network_bytes: 10 * 1024 * 1024 * 1024,
      network_requests: 10000,
      model_calls: 1000,
      input_units: 10_000_000,
      output_units: 10_000_000,
      concurrency: 8,
      wall_time_ms: 3_600_000,
      monetary_cost_units: 10_000,
      energy_millijoules: 1_000_000_000,
      process_count: 32,
      thread_count: 256,
      file_descriptors: 4096
    }),
    soft_targets: resources({
      cpu_millis: 500,
      memory_bytes: 4 * 1024 * 1024 * 1024,
      accelerator_memory_bytes: 8 * 1024 * 1024 * 1024,
      durable_storage_bytes: 100 * 1024 * 1024 * 1024,
      scratch_storage_bytes: 25 * 1024 * 1024 * 1024,
      io_bytes: 5 * 1024 * 1024 * 1024,
      network_bytes: 5 * 1024 * 1024 * 1024,
      network_requests: 5000,
      model_calls: 500,
      input_units: 5_000_000,
      output_units: 5_000_000,
      concurrency: 4,
      wall_time_ms: 1_800_000,
      monetary_cost_units: 5000,
      energy_millijoules: 500_000_000,
      process_count: 16,
      thread_count: 128,
      file_descriptors: 2048
    }),
    measurement_freshness_ms: 120_000,
    required_observation_kinds: ['cpu', 'memory', 'storage'],
    degradation_policy_refs: [],
    fallback_refs: [],
    checkpoint_required: false,
    cancellable: true,
    reservation_expires_at: EXPIRES,
    source_policy_ref: 'policy.synthetic.resources',
    created_at: CREATED,
    expires_at: EXPIRES,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

function observation(kind, values, id = kind) {
  return {
    schema: 'axiom-resource-observation.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    observation_id: `observation.synthetic.${id}`,
    observer_principal_id: 'principal.synthetic',
    host_ref: 'host.synthetic',
    kind,
    observation_status: 'verified',
    observed_at: CREATED,
    expires_at: EXPIRES,
    measurement_method: `fixture.${kind}`,
    evidence_ref: `evidence.synthetic.${kind}`,
    values,
    limitations: [],
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function observations() {
  return [
    observation('cpu', {
      cpu_load_millis: 100,
      cpu_available_millis: 900
    }),
    observation('memory', {
      memory_used_bytes: 1024 * 1024 * 1024,
      memory_free_bytes: 7 * 1024 * 1024 * 1024
    }),
    observation('storage', {
      storage_total_bytes: 500 * 1024 * 1024 * 1024,
      storage_free_bytes: 300 * 1024 * 1024 * 1024
    })
  ];
}

function capabilitySurface() {
  return {
    schema: 'axiom-capability-surfaces.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    registry_id: 'capability-surfaces.synthetic.v0',
    executable_registry_ref: 'mesh/config/capabilities.json',
    discovery_grants_authority: false,
    entries: [
      capabilityEntry('capability.add'),
      capabilityEntry('capability.present')
    ],
    created_at: CREATED,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function capabilityEntry(capabilityId) {
  return {
    capability_id: capabilityId,
    lifecycle: 'specified',
    human: {
      product: 'Deployment',
      section: 'Synthetic',
      label: capabilityId,
      description: `Synthetic discovery surface for ${capabilityId}.`
    },
    machine: {
      schema_ids: [],
      read_surfaces: [],
      action_surfaces: []
    },
    executable_capability_ref: null,
    evidence_refs: ['evidence.synthetic.capability-surface'],
    authority_boundary: 'discovery-only-no-authority',
    non_claims: ['discovery-does-not-authorize-execution']
  };
}

function hostPolicyRef(policyKind, policyRef, artifact) {
  return {
    policy_kind: policyKind,
    policy_ref: policyRef,
    policy_digest: digestObject(artifact)
  };
}

function hostProfile() {
  return {
    format: 'host.profile.v1',
    host_class: 'desktop',
    power_class: 'mains',
    capabilities: ['compute']
  };
}

function contributionPolicy() {
  return {
    format: 'contribution.policy.v1',
    enabled: true,
    allowed_roles: ['compute'],
    only_when: {
      external_power: true,
      unmetered_network: false,
      user_idle: false,
      minimum_battery_percent: 0,
      allowed_thermal_states: ['normal', 'warm']
    },
    maximum: {
      cpu_millis: 1000,
      memory_bytes: 8 * 1024 * 1024 * 1024,
      storage_bytes: 200 * 1024 * 1024 * 1024,
      bandwidth_bytes_per_second: 10_000_000,
      transfer_bytes_per_day: 100 * 1024 * 1024 * 1024
    }
  };
}

function sovereigntyReserve() {
  return {
    format: 'resource.sovereignty-reserve.v1',
    battery_floor_percent: 0,
    free_storage_floor_bytes: 20 * 1024 * 1024 * 1024,
    foreground_user_priority: true,
    cpu_headroom_millis: 100,
    memory_headroom_bytes: 1024 * 1024 * 1024,
    bandwidth_headroom_bytes_per_second: 1_000_000,
    allowed_thermal_states: ['normal', 'warm']
  };
}

function providerArtifacts() {
  return {
    'provider.synthetic.add': providerArtifact('provider.synthetic.add'),
    'provider.synthetic.present': providerArtifact('provider.synthetic.present')
  };
}

function hostPolicies() {
  return {
    'host-profile.synthetic': hostProfile(),
    'contribution-policy.synthetic': contributionPolicy(),
    'sovereignty-reserve.synthetic': sovereigntyReserve()
  };
}

function spec(overrides = {}) {
  const surface = capabilitySurface();
  const policies = hostPolicies();
  const artifacts = providerArtifacts();
  const present = binding({
    bindingId: 'binding.synthetic.present',
    providerRef: 'provider.synthetic.present',
    capabilities: ['capability.present'],
    presenceState: 'installed-available',
    artifact: artifacts['provider.synthetic.present']
  });
  const addition = binding({
    artifact: artifacts['provider.synthetic.add']
  });
  return {
    schema: 'axiom-deployment-spec.v0',
    version: 0,
    status: 'inert-deployment-spec',
    desired: desired(),
    resource_envelope: resourceEnvelope(),
    resource_observations: observations(),
    host_policy_refs: [
      hostPolicyRef('host-profile', 'host-profile.synthetic', policies['host-profile.synthetic']),
      hostPolicyRef('contribution-policy', 'contribution-policy.synthetic', policies['contribution-policy.synthetic']),
      hostPolicyRef('sovereignty-reserve', 'sovereignty-reserve.synthetic', policies['sovereignty-reserve.synthetic'])
    ],
    capability_surface_ref: {
      registry_id: surface.registry_id,
      registry_digest: digestObject(surface)
    },
    provider_bindings: [addition, present],
    created_at: CREATED,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    execution_authorized: false,
    ...overrides
  };
}

function context() {
  return {
    as_of: NOW,
    capability_surface: capabilitySurface(),
    provider_artifacts: providerArtifacts(),
    host_policy_artifacts: hostPolicies()
  };
}

test('valid DesiredDeployment v0 is inert and digest-bound', () => {
  const result = validateDesiredDeployment(desired());
  assert.equal(result.valid, true);
  assert.equal(result.deployment_id, 'deployment.synthetic.v0');
  assert.equal(result.target_host_ref, 'host.synthetic');
  assert.match(result.desired_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(Object.isFrozen(result), true);
});

test('valid DeploymentProviderBinding v0 preserves exact Resource Envelope dimensions', () => {
  const document = binding();
  const result = validateDeploymentProviderBinding(document);
  assert.equal(result.valid, true);
  assert.deepEqual(Object.keys(document.resource_request).sort(), [...RESOURCE_KEYS].sort());
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('valid DeploymentSpec v0 composes current-main inert contracts and has stable digest', () => {
  const document = spec();
  const result = validateDeploymentSpec(document, context());
  assert.equal(result.valid, true);
  assert.equal(result.deployment_id, 'deployment.synthetic.v0');
  assert.equal(result.target_host_ref, 'host.synthetic');
  assert.equal(result.execution_authorized, false);
  const first = deploymentSpecDigest(document, context());
  const second = deploymentSpecDigest(document, context());
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
});

test('caller-authored deployment documents reject authority-looking fields and unknown keys', () => {
  const widened = desired({ authority_effect: 'grant' });
  assert.throws(() => validateDesiredDeployment(widened), /authority/i);

  const unknownDesired = desired({ surprise: true });
  assert.throws(() => validateDesiredDeployment(unknownDesired), /unknown|exact/i);

  const executable = spec({ execution_authorized: true });
  assert.throws(() => validateDeploymentSpec(executable, context()), /execution|authoriz/i);
});

test('required capability, role, binding capability, and evidence sets reject duplicates and overflow', () => {
  const duplicateCapability = desired({
    required_capabilities: ['capability.add', 'capability.add']
  });
  assert.throws(
    () => validateDesiredDeployment(duplicateCapability),
    /duplicate|required_capabilities/i
  );

  const duplicateRole = desired({ roles: ['personal-node', 'personal-node'] });
  assert.throws(() => validateDesiredDeployment(duplicateRole), /duplicate|roles/i);

  const tooManyCapabilities = desired({
    required_capabilities: Array.from({ length: 33 }, (_, i) => `capability.${i}`)
  });
  assert.throws(
    () => validateDesiredDeployment(tooManyCapabilities),
    /32|required_capabilities|cardinality/i
  );

  const duplicateBindingCapability = binding({
    capabilities: ['capability.add', 'capability.add']
  });
  assert.throws(
    () => validateDeploymentProviderBinding(duplicateBindingCapability),
    /duplicate|capability_ids/i
  );
});

test('schemas lock exact inert identities and executable boundary', async () => {
  const [desiredSchema, bindingSchema, specSchema] = await Promise.all([
    readSchema('../config/desired-deployment-v0.schema.json'),
    readSchema('../config/deployment-provider-binding-v0.schema.json'),
    readSchema('../config/deployment-spec-v0.schema.json')
  ]);
  assert.equal(desiredSchema.$id, 'axiom-desired-deployment.v0');
  assert.equal(bindingSchema.$id, 'axiom-deployment-provider-binding.v0');
  assert.equal(specSchema.$id, 'axiom-deployment-spec.v0');
  for (const schema of [desiredSchema, bindingSchema, specSchema]) {
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.authority_effect.const, 'none');
    assert.equal(schema.properties.network_effect.const, 'none');
    assert.equal(schema.properties.runtime_activation.const, false);
  }
  assert.equal(specSchema.properties.execution_authorized.const, false);
});

async function readSchema(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

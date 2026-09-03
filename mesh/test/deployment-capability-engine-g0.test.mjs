import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import { resolveDeploymentPlan } from '../src/lib/deployment-capability-engine.mjs';

const NOW = '2026-09-02T23:55:00.000Z';
const CREATED = '2026-09-02T23:54:00.000Z';
const EXPIRES = '2026-09-03T00:54:00.000Z';
const RESOURCE_KEYS = Object.freeze([
  'cpu_millis', 'memory_bytes', 'accelerator_memory_bytes',
  'durable_storage_bytes', 'scratch_storage_bytes', 'io_bytes',
  'network_bytes', 'network_requests', 'model_calls', 'input_units',
  'output_units', 'concurrency', 'wall_time_ms', 'monetary_cost_units',
  'energy_millijoules', 'process_count', 'thread_count', 'file_descriptors'
]);

function resources(overrides = {}) {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, overrides[key] ?? 0]));
}

function providerArtifact() {
  return {
    schema: 'synthetic-provider-evidence.v0',
    provider_id: 'provider.g0',
    observed_at: CREATED,
    authority_effect: 'none'
  };
}

function capabilitySurface() {
  return {
    schema: 'axiom-capability-surfaces.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    registry_id: 'capability-surfaces.g0.v0',
    executable_registry_ref: 'mesh/config/capabilities.json',
    discovery_grants_authority: false,
    entries: [{
      capability_id: 'capability.g0',
      lifecycle: 'specified',
      human: {
        product: 'Deployment',
        section: 'Synthetic',
        label: 'capability.g0',
        description: 'Synthetic G0 composition capability.'
      },
      machine: { schema_ids: [], read_surfaces: [], action_surfaces: [] },
      executable_capability_ref: null,
      evidence_refs: ['evidence.g0.capability'],
      authority_boundary: 'discovery-only-no-authority',
      non_claims: ['discovery-does-not-authorize-execution']
    }],
    created_at: CREATED,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function contributionPolicy() {
  return {
    format: 'contribution.policy.v1',
    enabled: true,
    allowed_roles: ['compute'],
    only_when: {
      external_power: false,
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
    free_storage_floor_bytes: 0,
    foreground_user_priority: true,
    cpu_headroom_millis: 0,
    memory_headroom_bytes: 0,
    bandwidth_headroom_bytes_per_second: 0,
    allowed_thermal_states: ['normal', 'warm']
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

function observations() {
  const base = {
    schema: 'axiom-resource-observation.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    observer_principal_id: 'principal.g0',
    host_ref: 'host.g0',
    observation_status: 'verified',
    observed_at: CREATED,
    expires_at: EXPIRES,
    limitations: [],
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  return [
    {
      ...base,
      observation_id: 'observation.g0.cpu',
      kind: 'cpu',
      measurement_method: 'fixture.cpu',
      evidence_ref: 'evidence.g0.cpu',
      values: { cpu_load_millis: 100, cpu_available_millis: 900 }
    },
    {
      ...base,
      observation_id: 'observation.g0.memory',
      kind: 'memory',
      measurement_method: 'fixture.memory',
      evidence_ref: 'evidence.g0.memory',
      values: {
        memory_used_bytes: 1024 * 1024 * 1024,
        memory_free_bytes: 7 * 1024 * 1024 * 1024
      }
    },
    {
      ...base,
      observation_id: 'observation.g0.storage',
      kind: 'storage',
      measurement_method: 'fixture.storage',
      evidence_ref: 'evidence.g0.storage',
      values: {
        storage_total_bytes: 500 * 1024 * 1024 * 1024,
        storage_free_bytes: 300 * 1024 * 1024 * 1024
      }
    }
  ];
}

function fixture() {
  const surface = capabilitySurface();
  const artifact = providerArtifact();
  const policy = contributionPolicy();
  const reserve = sovereigntyReserve();
  const profile = hostProfile();
  const spec = {
    schema: 'axiom-deployment-spec.v0',
    version: 0,
    status: 'inert-deployment-spec',
    desired: {
      schema: 'axiom-desired-deployment.v0',
      version: 0,
      status: 'inert-desire',
      deployment_id: 'deployment.g0.v0',
      target_host_ref: 'host.g0',
      roles: ['compute-worker'],
      required_capabilities: ['capability.g0'],
      preferences: {
        locality: 'local-only',
        priority: 'balanced',
        reuse_existing: true,
        offline_required: true,
        allow_replacement: false
      },
      created_at: CREATED,
      contains_secret_material: false,
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    },
    resource_envelope: {
      schema: 'axiom-resource-envelope.v0',
      version: 0,
      status: 'inert-contract-laboratory',
      envelope_id: 'resource-envelope.g0',
      subject_ref: 'deployment.g0.v0',
      principal_id: 'principal.g0',
      host_ref: 'host.g0',
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
        durable_storage_bytes: 200 * 1024 * 1024 * 1024,
        concurrency: 8,
        process_count: 32,
        thread_count: 256,
        file_descriptors: 4096
      }),
      soft_targets: resources(),
      measurement_freshness_ms: 120_000,
      required_observation_kinds: ['cpu', 'memory', 'storage'],
      degradation_policy_refs: [],
      fallback_refs: [],
      checkpoint_required: false,
      cancellable: true,
      reservation_expires_at: EXPIRES,
      source_policy_ref: 'policy.g0.resources',
      created_at: CREATED,
      expires_at: EXPIRES,
      contains_secret_material: false,
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    },
    resource_observations: observations(),
    host_policy_refs: [
      { policy_kind: 'host-profile', policy_ref: 'host-profile.g0', policy_digest: digestObject(profile) },
      { policy_kind: 'contribution-policy', policy_ref: 'contribution-policy.g0', policy_digest: digestObject(policy) },
      { policy_kind: 'sovereignty-reserve', policy_ref: 'sovereignty-reserve.g0', policy_digest: digestObject(reserve) }
    ],
    capability_surface_ref: {
      registry_id: surface.registry_id,
      registry_digest: digestObject(surface)
    },
    provider_bindings: [{
      schema: 'axiom-deployment-provider-binding.v0',
      version: 0,
      status: 'inert-provider-binding',
      binding_id: 'binding.g0',
      provider_kind: 'local-service',
      provider_ref: 'provider.g0',
      provider_digest: digestObject(artifact),
      capability_ids: ['capability.g0'],
      host_ref: 'host.g0',
      presence_state: 'available-not-installed',
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
      evidence_refs: ['evidence.g0.provider'],
      contains_secret_material: false,
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    }],
    created_at: CREATED,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    execution_authorized: false
  };
  const context = {
    as_of: NOW,
    capability_surface: surface,
    provider_artifacts: { 'provider.g0': artifact },
    host_policy_artifacts: {
      'host-profile.g0': profile,
      'contribution-policy.g0': policy,
      'sovereignty-reserve.g0': reserve
    }
  };
  return { spec, context, policy, reserve };
}

function completeG0Evidence({ guardianState = 'NORMAL' } = {}) {
  const { policy, reserve } = fixture();
  return {
    policy,
    reserve,
    runtime: {
      external_power: true,
      unmetered_network: true,
      user_idle: true,
      foreground_user_active: false,
      battery_percent: 90,
      free_storage_bytes: 100 * 1024 * 1024 * 1024,
      thermal_state: 'normal',
      transfer_bytes_today: 0,
      available_cpu_millis: 1000,
      available_memory_bytes: 8 * 1024 * 1024 * 1024,
      available_bandwidth_bytes_per_second: 10_000_000
    },
    request: {
      role: 'compute',
      resources: {
        cpu_millis: 25,
        memory_bytes: 128 * 1024 * 1024,
        storage_bytes: 64 * 1024 * 1024,
        bandwidth_bytes_per_second: 0,
        transfer_bytes: 0
      }
    },
    guardian_state: guardianState
  };
}

test('explicit complete G0 denial rejects the provider without widening deployment authority', () => {
  const { spec, context } = fixture();
  context.host_sovereignty_evidence = {
    'binding.g0': completeG0Evidence({ guardianState: 'QUARANTINED' })
  };
  const plan = resolveDeploymentPlan(spec, context);
  const rejected = plan.rejected_bindings.find((item) => item.binding_id === 'binding.g0');
  assert.ok(rejected);
  assert.ok(rejected.reason_codes.includes('host-sovereignty-conflict'));
  assert.ok(plan.unsatisfied_capabilities.includes('capability.g0'));
  assert.equal(plan.execution_authorized, false);
});

test('Resource Envelope evidence alone is never coerced into G0 runtime or request fields', () => {
  const { spec, context } = fixture();
  assert.equal(Object.hasOwn(context, 'host_sovereignty_evidence'), false);
  assert.doesNotThrow(() => resolveDeploymentPlan(spec, context));
  const plan = resolveDeploymentPlan(spec, context);
  assert.deepEqual(plan.selected_bindings, ['binding.g0']);
  assert.equal(plan.rejected_bindings.length, 0);
});

import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import { resolveDeploymentPlan } from '../src/lib/deployment-capability-engine.mjs';

const NOW = '2026-09-02T23:55:00.000Z';
const CREATED = '2026-09-02T23:54:00.000Z';
const EXPIRES = '2026-09-03T00:54:00.000Z';
const CATALOG = JSON.parse(readFileSync(
  new URL('../config/runtime-provider-catalog.v0.json', import.meta.url),
  'utf8'
));
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

function capabilitySurface() {
  return {
    schema: 'axiom-capability-surfaces.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    registry_id: 'capability-surfaces.downstream.v0',
    executable_registry_ref: 'mesh/config/capabilities.json',
    discovery_grants_authority: false,
    entries: [{
      capability_id: 'capability.downstream',
      lifecycle: 'specified',
      human: {
        product: 'Deployment',
        section: 'Synthetic',
        label: 'capability.downstream',
        description: 'Synthetic downstream projection capability.'
      },
      machine: { schema_ids: [], read_surfaces: [], action_surfaces: [] },
      executable_capability_ref: null,
      evidence_refs: ['evidence.downstream.capability'],
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
    observer_principal_id: 'principal.downstream',
    host_ref: 'host.downstream',
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
      observation_id: 'observation.downstream.cpu',
      kind: 'cpu',
      measurement_method: 'fixture.cpu',
      evidence_ref: 'evidence.downstream.cpu',
      values: { cpu_load_millis: 100, cpu_available_millis: 900 }
    },
    {
      ...base,
      observation_id: 'observation.downstream.memory',
      kind: 'memory',
      measurement_method: 'fixture.memory',
      evidence_ref: 'evidence.downstream.memory',
      values: {
        memory_used_bytes: 1024 * 1024 * 1024,
        memory_free_bytes: 7 * 1024 * 1024 * 1024
      }
    },
    {
      ...base,
      observation_id: 'observation.downstream.storage',
      kind: 'storage',
      measurement_method: 'fixture.storage',
      evidence_ref: 'evidence.downstream.storage',
      values: {
        storage_total_bytes: 500 * 1024 * 1024 * 1024,
        storage_free_bytes: 300 * 1024 * 1024 * 1024
      }
    }
  ];
}

function syntheticProvider() {
  return {
    schema: 'synthetic-provider-evidence.v0',
    provider_id: 'provider.downstream',
    observed_at: CREATED,
    authority_effect: 'none'
  };
}

function fixture() {
  const surface = capabilitySurface();
  const artifact = syntheticProvider();
  const policy = contributionPolicy();
  const reserve = sovereigntyReserve();
  const profile = hostProfile();
  const binding = {
    schema: 'axiom-deployment-provider-binding.v0',
    version: 0,
    status: 'inert-provider-binding',
    binding_id: 'binding.downstream',
    provider_kind: 'local-service',
    provider_ref: 'provider.downstream',
    provider_digest: digestObject(artifact),
    capability_ids: ['capability.downstream'],
    host_ref: 'host.downstream',
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
    evidence_refs: ['evidence.downstream.provider'],
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  const spec = {
    schema: 'axiom-deployment-spec.v0',
    version: 0,
    status: 'inert-deployment-spec',
    desired: {
      schema: 'axiom-desired-deployment.v0',
      version: 0,
      status: 'inert-desire',
      deployment_id: 'deployment.downstream.v0',
      target_host_ref: 'host.downstream',
      roles: ['compute-worker'],
      required_capabilities: ['capability.downstream'],
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
      envelope_id: 'resource-envelope.downstream',
      subject_ref: 'deployment.downstream.v0',
      principal_id: 'principal.downstream',
      host_ref: 'host.downstream',
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
      source_policy_ref: 'policy.downstream.resources',
      created_at: CREATED,
      expires_at: EXPIRES,
      contains_secret_material: false,
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    },
    resource_observations: observations(),
    host_policy_refs: [
      { policy_kind: 'host-profile', policy_ref: 'host-profile.downstream', policy_digest: digestObject(profile) },
      { policy_kind: 'contribution-policy', policy_ref: 'contribution-policy.downstream', policy_digest: digestObject(policy) },
      { policy_kind: 'sovereignty-reserve', policy_ref: 'sovereignty-reserve.downstream', policy_digest: digestObject(reserve) }
    ],
    capability_surface_ref: {
      registry_id: surface.registry_id,
      registry_digest: digestObject(surface)
    },
    provider_bindings: [binding],
    created_at: CREATED,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    execution_authorized: false
  };
  return {
    spec,
    binding,
    context: {
      as_of: NOW,
      capability_surface: surface,
      provider_artifacts: { 'provider.downstream': artifact },
      host_policy_artifacts: {
        'host-profile.downstream': profile,
        'contribution-policy.downstream': policy,
        'sovereignty-reserve.downstream': reserve
      }
    }
  };
}

function useCatalogEntry(fx, integrationClass) {
  const entry = structuredClone(CATALOG.entries.find(
    (item) => item.integration_class === integrationClass
  ));
  assert.ok(entry, `catalog lacks ${integrationClass} fixture`);
  fx.binding.provider_kind = 'runtime-catalog-entry';
  fx.binding.provider_ref = entry.entry_id;
  fx.binding.provider_digest = digestObject(entry);
  fx.context.provider_artifacts = { [entry.entry_id]: entry };
  return entry;
}

function findRequest(plan, kind) {
  return plan.downstream_plan_requests.find((request) => request.kind === kind);
}

function assertInertRequest(request, fx) {
  assert.ok(request);
  assert.equal(request.binding_id, fx.binding.binding_id);
  assert.equal(request.provider_ref, fx.binding.provider_ref);
  assert.equal(request.provider_digest, fx.binding.provider_digest);
  assert.deepEqual(request.capability_ids, ['capability.downstream']);
  assert.deepEqual(request.evidence_refs, ['evidence.downstream.provider']);
  assert.deepEqual(request.requirements, {
    presence_state: 'available-not-installed',
    requires_network: fx.binding.requires_network,
    requires_privileged_change: fx.binding.requires_privileged_change,
    requires_reboot: fx.binding.requires_reboot,
    data_egress_possible: fx.binding.data_egress_possible,
    replacement_required: fx.binding.replacement_required
  });
}

test('selected privileged provider projects an inert host-install request and declared consequence facts', () => {
  const fx = fixture();
  fx.binding.requires_privileged_change = true;
  const plan = resolveDeploymentPlan(fx.spec, fx.context);
  assertInertRequest(findRequest(plan, 'host-install-plan'), fx);
  assert.ok(plan.reason_codes.includes('downstream-install-plan-required'));
  assert.deepEqual(plan.consequences, [{
    binding_id: 'binding.downstream',
    provider_ref: 'provider.downstream',
    presence_state: 'available-not-installed',
    requires_network: false,
    requires_privileged_change: true,
    requires_reboot: false,
    data_egress_possible: false,
    replacement_required: false
  }]);
  assert.equal(plan.execution_authorized, false);
  assert.equal(plan.authority_effect, 'none');
  assert.equal(plan.network_effect, 'none');
  assert.equal(plan.runtime_activation, false);
});

test('runtime-catalog evidence projects runtime and model acquisition without heuristic classification', () => {
  const runtimeFx = fixture();
  useCatalogEntry(runtimeFx, 'agent-runtime');
  const runtimePlan = resolveDeploymentPlan(runtimeFx.spec, runtimeFx.context);
  assertInertRequest(findRequest(runtimePlan, 'runtime-acquisition-plan'), runtimeFx);
  assert.ok(runtimePlan.reason_codes.includes('downstream-runtime-plan-required'));
  assert.equal(findRequest(runtimePlan, 'model-acquisition-plan'), undefined);

  const modelFx = fixture();
  useCatalogEntry(modelFx, 'model-provider');
  const modelPlan = resolveDeploymentPlan(modelFx.spec, modelFx.context);
  assertInertRequest(findRequest(modelPlan, 'model-acquisition-plan'), modelFx);
  assert.ok(modelPlan.reason_codes.includes('downstream-model-plan-required'));
  assert.equal(findRequest(modelPlan, 'runtime-acquisition-plan'), undefined);
});

test('explicit adapter provider projects adapter configuration only', () => {
  const fx = fixture();
  fx.binding.provider_kind = 'adapter';
  const plan = resolveDeploymentPlan(fx.spec, fx.context);
  assertInertRequest(findRequest(plan, 'adapter-configuration-plan'), fx);
  assert.ok(plan.reason_codes.includes('downstream-adapter-plan-required'));
});

test('downstream projection invokes no fetch, process spawn, or filesystem mutation primitive', () => {
  const fx = fixture();
  fx.binding.requires_privileged_change = true;
  const forbidden = () => {
    throw new Error('side-effect primitive invoked during deployment resolution');
  };
  const originalFetch = globalThis.fetch;
  const fsMethods = [
    'writeFileSync', 'appendFileSync', 'renameSync', 'rmSync',
    'unlinkSync', 'mkdirSync'
  ];
  const processMethods = ['spawn', 'spawnSync', 'exec', 'execSync', 'fork'];
  const savedFs = Object.fromEntries(fsMethods.map((name) => [name, fs[name]]));
  const savedProcess = Object.fromEntries(
    processMethods.map((name) => [name, childProcess[name]])
  );
  try {
    globalThis.fetch = forbidden;
    for (const name of fsMethods) fs[name] = forbidden;
    for (const name of processMethods) childProcess[name] = forbidden;
    const plan = resolveDeploymentPlan(fx.spec, fx.context);
    assert.equal(plan.execution_authorized, false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of fsMethods) fs[name] = savedFs[name];
    for (const name of processMethods) childProcess[name] = savedProcess[name];
  }
});

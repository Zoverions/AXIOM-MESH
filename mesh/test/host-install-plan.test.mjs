import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHostInstallPlan,
  HOST_INSTALL_PLAN_SCHEMA,
  HOST_INSTALL_PLAN_STATUS,
  validateHostInstallPlan,
  validateHostInstallPolicy
} from '../src/lib/host-install-plan.mjs';

function linuxFacts(overrides = {}) {
  return {
    facts_source: 'synthetic-test',
    platform: 'linux',
    architecture: 'x64',
    distro_id: 'ubuntu',
    distro_version: '24.04',
    init_system: 'systemd',
    package_manager: 'apt-get',
    node_version: '24.18.0',
    memory_bytes: 16 * 1024 * 1024 * 1024,
    root_filesystem_free_bytes: 100 * 1024 * 1024 * 1024,
    container_runtime: 'none-detected',
    effective_uid: 1000,
    ...overrides
  };
}

test('host install policy is executable while the mutating installer remains explicitly absent', () => {
  const result = validateHostInstallPolicy();
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-host-install-policy.v1');
  assert.deepEqual(result.profile_ids, ['personal-local', 'infrastructure-node']);
  assert.match(result.policy_digest, /^[a-f0-9]{64}$/);
  assert.match(result.install_targets_digest, /^[a-f0-9]{64}$/);
});

test('personal-local plan is deterministic, non-mutating, deny-egress, and zero-authority', () => {
  const facts = linuxFacts();
  const left = buildHostInstallPlan({ profileId: 'personal-local', hostFacts: facts });
  const right = buildHostInstallPlan({ profileId: 'personal-local', hostFacts: facts });
  assert.deepEqual(left, right);
  assert.equal(left.schema, HOST_INSTALL_PLAN_SCHEMA);
  assert.equal(left.status, HOST_INSTALL_PLAN_STATUS);
  assert.equal(left.target_status, 'specified');
  assert.equal(left.host_candidate_compatible, true);
  assert.deepEqual(left.blockers, []);
  assert.equal(left.topology, 'single-host');
  assert.equal(left.runtime_identity, 'axiom-mesh');
  assert.equal(left.service_units, 'supported-option');
  assert.equal(left.mutation_performed, false);
  assert.equal(left.live_services_started, false);
  assert.equal(left.credentials_created, false);
  assert.equal(left.eligible_for_mutating_install, false);
  assert.equal(left.authority_effect, 'none');
  assert.equal(left.network_effect, 'none');
  assert.deepEqual(left.network, {
    public_ingress_enabled: false,
    external_egress: 'deny',
    mesh_enrollment: 'not-performed'
  });
  assert.equal(left.provisioning.production_credentials, 'compose-existing-provision-production');
  assert.equal(left.provisioning.signed_release_manifest_verified, false);
  assert.equal(validateHostInstallPlan(left).valid, true);
});

test('infrastructure-node plan requires independent service-unit projection without enrolling a node', () => {
  const plan = buildHostInstallPlan({
    profileId: 'infrastructure-node',
    hostFacts: linuxFacts({ architecture: 'arm64', distro_id: 'debian', distro_version: '12' })
  });
  assert.equal(plan.host_candidate_compatible, true);
  assert.equal(plan.topology, 'independent-service-units');
  assert.equal(plan.service_units, 'required');
  assert.equal(
    plan.provisioning.service_unit_projection,
    'compose-existing-provision-service-units'
  );
  assert.equal(plan.network.mesh_enrollment, 'not-performed');
  assert.equal(plan.network.public_ingress_enabled, false);
  assert.equal(validateHostInstallPlan(plan).valid, true);
});

test('unsupported host facts fail closed into explicit blockers rather than mutating around them', () => {
  const plan = buildHostInstallPlan({
    profileId: 'personal-local',
    hostFacts: linuxFacts({
      platform: 'win32',
      architecture: 'ia32',
      init_system: 'unknown',
      package_manager: 'none-detected',
      node_version: '22.0.0'
    })
  });
  assert.equal(plan.host_candidate_compatible, false);
  assert.ok(plan.blockers.includes('unsupported-platform:win32'));
  assert.ok(plan.blockers.includes('unsupported-architecture:ia32'));
  assert.ok(plan.blockers.includes('unsupported-init-system:unknown'));
  assert.ok(plan.blockers.includes('package-manager-not-detected'));
  assert.ok(plan.blockers.includes('current-node-runtime-outside-kernel-range:22.0.0'));
  assert.equal(plan.mutation_performed, false);
  assert.equal(plan.authority_effect, 'none');
  assert.equal(validateHostInstallPlan(plan).valid, true);
});

test('missing host observations are rejected rather than guessed', () => {
  const facts = linuxFacts();
  delete facts.root_filesystem_free_bytes;
  assert.throws(
    () => buildHostInstallPlan({ profileId: 'personal-local', hostFacts: facts }),
    /Host facts are incomplete: root_filesystem_free_bytes/
  );
});

test('planner refuses unknown profiles', () => {
  assert.throws(
    () => buildHostInstallPlan({ profileId: 'public-relay', hostFacts: linuxFacts() }),
    /Unknown host install profile/
  );
});

test('plan validation rejects public-ingress, authority, and mutation laundering', () => {
  const base = buildHostInstallPlan({ profileId: 'personal-local', hostFacts: linuxFacts() });
  assert.throws(
    () => validateHostInstallPlan({
      ...base,
      network: { ...base.network, public_ingress_enabled: true }
    }),
    /weakens the non-mutating boundary/
  );
  assert.throws(
    () => validateHostInstallPlan({ ...base, authority_effect: 'host-admin' }),
    /weakens the non-mutating boundary/
  );
  assert.throws(
    () => validateHostInstallPlan({ ...base, mutation_performed: true }),
    /weakens the non-mutating boundary/
  );
});

test('plan digest binds host observations and profile content', () => {
  const first = buildHostInstallPlan({ profileId: 'personal-local', hostFacts: linuxFacts() });
  const second = buildHostInstallPlan({
    profileId: 'personal-local',
    hostFacts: linuxFacts({ root_filesystem_free_bytes: 99 * 1024 * 1024 * 1024 })
  });
  const infrastructure = buildHostInstallPlan({
    profileId: 'infrastructure-node',
    hostFacts: linuxFacts()
  });
  assert.notEqual(first.host_facts_digest, second.host_facts_digest);
  assert.notEqual(first.plan_digest, second.plan_digest);
  assert.notEqual(first.profile_digest, infrastructure.profile_digest);
  assert.notEqual(first.plan_digest, infrastructure.plan_digest);
});

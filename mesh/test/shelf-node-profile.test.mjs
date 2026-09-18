import assert from 'node:assert/strict';
import test from 'node:test';
import shelfProfile from '../config/shelf-node-profile.json' with { type: 'json' };
import releasePolicy from '../config/install-release-manifest-policy.json' with { type: 'json' };
import { buildHostInstallPlan } from '../src/lib/host-install-plan.mjs';
import { validateInstallReleaseManifestPolicy } from '../src/lib/install-release-manifest.mjs';
import {
  SHELF_NODE_PLAN_SCHEMA,
  compileShelfNodePlan,
  validateShelfNodeProfile
} from '../src/lib/shelf-node-profile.mjs';

function facts(overrides = {}) {
  return {
    facts_source: 'synthetic-test',
    platform: 'linux',
    architecture: 'x64',
    distro_id: 'ubuntu',
    distro_version: '24.04',
    init_system: 'systemd',
    package_manager: 'apt-get',
    node_version: '24.19.0',
    memory_bytes: 8 * 1024 ** 3,
    root_filesystem_free_bytes: 80 * 1024 ** 3,
    container_runtime: 'docker',
    effective_uid: 1000,
    ...overrides
  };
}

function basePlan(overrides = {}) {
  return buildHostInstallPlan({
    profileId: 'infrastructure-node',
    hostFacts: facts(overrides)
  });
}

test('Shelf Node profile is an exact zero-authority infrastructure-node specialization', () => {
  const result = validateShelfNodeProfile(shelfProfile);
  assert.equal(result.valid, true);
  assert.equal(result.profile_id, 'shelf-node');
  assert.equal(result.base_install_profile, 'infrastructure-node');
  assert.match(result.profile_digest, /^[a-f0-9]{64}$/);
  assert.equal(shelfProfile.installation_grants_authority, false);
  assert.equal(shelfProfile.shared_contribution_enabled, false);
  assert.equal(shelfProfile.public_ingress_default, false);
  assert.equal(shelfProfile.axiom_egress_default, 'deny');
  assert.equal(shelfProfile.mesh_enrollment, 'explicit-separate-step');
  assert.equal(shelfProfile.display_network_required, false);
});

test('Shelf Node profile rejects unknown fields and authority widening', () => {
  assert.throws(
    () => validateShelfNodeProfile({ ...shelfProfile, surprise: true }),
    /key inventory|unknown|exact/i
  );
  assert.throws(
    () => validateShelfNodeProfile({ ...shelfProfile, installation_grants_authority: true }),
    /authority|profile/i
  );
  assert.throws(
    () => validateShelfNodeProfile({ ...shelfProfile, base_install_profile: 'personal-local' }),
    /base|profile/i
  );
  assert.throws(
    () => validateShelfNodeProfile({ ...shelfProfile, display_network_required: true }),
    /display|network|profile/i
  );
});

test('Shelf Node plan accepts only the canonical Ubuntu 24.04 x64 systemd host', () => {
  const plan = compileShelfNodePlan({ basePlan: basePlan(), shelfProfile });
  assert.equal(plan.schema, SHELF_NODE_PLAN_SCHEMA);
  assert.equal(plan.base_profile_id, 'infrastructure-node');
  assert.equal(plan.variant_id, 'shelf-node');
  assert.equal(plan.host_candidate_compatible, true);
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.roles, []);
  assert.deepEqual(plan.network, {
    public_ingress_enabled: false,
    axiom_external_egress: 'deny',
    mesh_enrollment: 'not-performed'
  });
  assert.deepEqual(plan.display, { required: true, network_required: false });
  assert.equal(plan.mutation_performed, false);
  assert.equal(plan.authority_effect, 'none');
  assert.match(plan.base_plan_digest, /^[a-f0-9]{64}$/);
  assert.match(plan.shelf_profile_digest, /^[a-f0-9]{64}$/);
  assert.match(plan.plan_digest, /^[a-f0-9]{64}$/);
});

test('Shelf Node plan fails closed on distro, release, architecture, platform, or init drift', () => {
  const cases = [
    [{ distro_id: 'debian', distro_version: '12' }, 'shelf-distro'],
    [{ distro_version: '24.10' }, 'shelf-distro-version'],
    [{ architecture: 'arm64' }, 'shelf-architecture'],
    [{ platform: 'win32' }, 'shelf-platform'],
    [{ init_system: 'unknown' }, 'shelf-init-system']
  ];
  for (const [overrides, expectedBlocker] of cases) {
    const plan = compileShelfNodePlan({ basePlan: basePlan(overrides), shelfProfile });
    assert.equal(plan.host_candidate_compatible, false, JSON.stringify(overrides));
    assert.ok(
      plan.blockers.some(value => value.includes(expectedBlocker)),
      `${JSON.stringify(overrides)} should include ${expectedBlocker}: ${plan.blockers.join(', ')}`
    );
    assert.equal(plan.mutation_performed, false);
    assert.equal(plan.authority_effect, 'none');
  }
});

test('Shelf Node compiler rejects a non-infrastructure base plan', () => {
  const personal = buildHostInstallPlan({ profileId: 'personal-local', hostFacts: facts() });
  assert.throws(
    () => compileShelfNodePlan({ basePlan: personal, shelfProfile }),
    /infrastructure-node|base plan/i
  );
});

test('Shelf Node plan digest binds host observations, base plan, and specialization policy', () => {
  const left = compileShelfNodePlan({ basePlan: basePlan(), shelfProfile });
  const right = compileShelfNodePlan({ basePlan: basePlan(), shelfProfile });
  const changedHost = compileShelfNodePlan({
    basePlan: basePlan({ root_filesystem_free_bytes: 79 * 1024 ** 3 }),
    shelfProfile
  });
  assert.deepEqual(left, right);
  assert.notEqual(left.base_plan_digest, changedHost.base_plan_digest);
  assert.notEqual(left.plan_digest, changedHost.plan_digest);
});

test('Shelf Node is not an install-release authority profile', () => {
  assert.deepEqual(releasePolicy.install_profiles, ['personal-local', 'infrastructure-node']);
  assert.throws(
    () => validateInstallReleaseManifestPolicy({
      ...releasePolicy,
      install_profiles: [...releasePolicy.install_profiles, 'shelf-node']
    }),
    /weakens|contract|policy/i
  );
});

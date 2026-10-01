import shelfNodeProfile from '../../config/shelf-node-profile.json' with { type: 'json' };
import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';
import { validateHostInstallPlan } from './host-install-plan.mjs';

export const SHELF_NODE_PROFILE_SCHEMA = 'axiom-shelf-node-profile.v1';
export const SHELF_NODE_PLAN_SCHEMA = 'axiom-shelf-node-plan.v1';

const PROFILE_KEYS = Object.freeze([
  'schema',
  'version',
  'id',
  'base_install_profile',
  'platform',
  'distro_id',
  'distro_version',
  'architecture',
  'host_class',
  'power_class',
  'public_ingress_default',
  'axiom_egress_default',
  'mesh_enrollment',
  'installation_grants_authority',
  'shared_contribution_enabled',
  'display_required',
  'display_network_required'
]);

export function validateShelfNodeProfile(profile = shelfNodeProfile) {
  exactObject(profile, 'Shelf Node profile', PROFILE_KEYS);
  if (
    profile.schema !== SHELF_NODE_PROFILE_SCHEMA
    || profile.version !== 1
    || profile.id !== 'shelf-node'
    || profile.base_install_profile !== 'infrastructure-node'
    || profile.platform !== 'linux'
    || profile.distro_id !== 'ubuntu'
    || profile.distro_version !== '24.04'
    || profile.architecture !== 'x64'
    || profile.host_class !== 'appliance'
    || profile.power_class !== 'mains'
    || profile.public_ingress_default !== false
    || profile.axiom_egress_default !== 'deny'
    || profile.mesh_enrollment !== 'explicit-separate-step'
    || profile.installation_grants_authority !== false
    || profile.shared_contribution_enabled !== false
    || profile.display_required !== true
    || profile.display_network_required !== false
  ) throw new ValidationError('Shelf Node profile identity, display, or authority boundary is invalid');

  return {
    valid: true,
    schema: profile.schema,
    profile_id: profile.id,
    base_install_profile: profile.base_install_profile,
    profile_digest: digestObject(profile),
    authority_effect: 'none'
  };
}

export function compileShelfNodePlan({ basePlan, shelfProfile = shelfNodeProfile }) {
  const profileValidation = validateShelfNodeProfile(shelfProfile);
  validateHostInstallPlan(basePlan);
  if (basePlan.profile_id !== shelfProfile.base_install_profile) {
    throw new ValidationError('Shelf Node requires an infrastructure-node base plan');
  }

  const blockers = [...basePlan.blockers];
  const host = basePlan.host;
  if (!host || typeof host !== 'object' || Array.isArray(host)) {
    throw new ValidationError('Shelf Node base plan is missing host identity evidence');
  }
  if (host.platform !== shelfProfile.platform) {
    blockers.push(`unsupported-shelf-platform:${host.platform}`);
  }
  if (host.distro_id !== shelfProfile.distro_id) {
    blockers.push(`unsupported-shelf-distro:${host.distro_id}`);
  }
  if (host.distro_version !== shelfProfile.distro_version) {
    blockers.push(`unsupported-shelf-distro-version:${host.distro_version}`);
  }
  if (host.architecture !== shelfProfile.architecture) {
    blockers.push(`unsupported-shelf-architecture:${host.architecture}`);
  }
  if (host.init_system !== 'systemd') {
    blockers.push(`unsupported-shelf-init-system:${host.init_system}`);
  }

  const planCore = {
    schema: SHELF_NODE_PLAN_SCHEMA,
    version: 1,
    base_profile_id: shelfProfile.base_install_profile,
    variant_id: shelfProfile.id,
    host_candidate_compatible: basePlan.host_candidate_compatible && blockers.length === 0,
    blockers: [...new Set(blockers)],
    base_plan_digest: basePlan.plan_digest,
    shelf_profile_digest: profileValidation.profile_digest,
    network: {
      public_ingress_enabled: false,
      axiom_external_egress: 'deny',
      mesh_enrollment: 'not-performed'
    },
    roles: [],
    display: {
      required: true,
      network_required: false
    },
    mutation_performed: false,
    authority_effect: 'none'
  };
  return {
    ...planCore,
    plan_digest: digestObject(planCore)
  };
}

function exactObject(value, label, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${label} key inventory drifted`);
}

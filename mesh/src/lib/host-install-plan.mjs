import { access, readFile, statfs } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { totalmem } from 'node:os';
import installTargets from '../../config/install-targets.json' with { type: 'json' };
import installPolicy from '../../config/host-install-policy.json' with { type: 'json' };
import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';

export const HOST_INSTALL_POLICY_SCHEMA = 'axiom-host-install-policy.v1';
export const HOST_INSTALL_PLAN_SCHEMA = 'axiom-host-install-plan.v1';
export const HOST_INSTALL_PLAN_STATUS = 'non-mutating-planning-evidence';

const EXACT_POLICY_KEYS = Object.freeze([
  'schema',
  'version',
  'kernel_version',
  'status',
  'authority_effect',
  'host_mutation_enabled',
  'planner',
  'mutating_installer',
  'profiles',
  'stages'
]);
const PROFILE_IDS = Object.freeze(['personal-local', 'infrastructure-node']);
const EXPECTED_STAGES = Object.freeze([
  'preflight',
  'release-selection',
  'artifact-verification',
  'toolchain-acquisition',
  'host-boundary-creation',
  'axiom-provisioning',
  'service-deployment',
  'readiness-proof',
  'human-handoff',
  'optional-integrations'
]);

export function validateHostInstallPolicy(policy = installPolicy, targets = installTargets) {
  exactObject(policy, 'Host install policy', EXACT_POLICY_KEYS);
  if (
    policy.schema !== HOST_INSTALL_POLICY_SCHEMA
    || policy.version !== 1
    || policy.kernel_version !== '0.12.0-dev.3'
    || policy.status !== 'planner-implemented-installer-not-implemented'
    || policy.authority_effect !== 'none'
    || policy.host_mutation_enabled !== false
  ) throw new ValidationError('Host install policy identity or authority boundary is invalid');

  exactObject(policy.planner, 'Host install planner policy', [
    'status',
    'platforms',
    'architectures',
    'required_facts',
    'unsupported_host_behavior',
    'mutation_performed'
  ]);
  if (
    policy.planner.status !== 'implemented-non-mutating'
    || canonicalJson(policy.planner.platforms) !== canonicalJson(['linux'])
    || canonicalJson(policy.planner.architectures) !== canonicalJson(['x64', 'arm64'])
    || !Array.isArray(policy.planner.required_facts)
    || policy.planner.required_facts.length < 8
    || policy.planner.unsupported_host_behavior !== 'fail-closed-with-blockers'
    || policy.planner.mutation_performed !== false
  ) throw new ValidationError('Host install planner policy drifted');

  exactObject(policy.mutating_installer, 'Mutating installer policy', [
    'status',
    'requires_signed_release_manifest',
    'requires_disposable_host_evidence',
    'requires_reboot_update_restore_evidence',
    'public_ingress_default',
    'external_egress_default',
    'mesh_enrollment',
    'installation_grants_authority'
  ]);
  if (
    policy.mutating_installer.status !== 'not-implemented'
    || policy.mutating_installer.requires_signed_release_manifest !== true
    || policy.mutating_installer.requires_disposable_host_evidence !== true
    || policy.mutating_installer.requires_reboot_update_restore_evidence !== true
    || policy.mutating_installer.public_ingress_default !== false
    || policy.mutating_installer.external_egress_default !== 'deny'
    || policy.mutating_installer.mesh_enrollment !== 'explicit-separate-step'
    || policy.mutating_installer.installation_grants_authority !== false
  ) throw new ValidationError('Mutating installer non-claims drifted');

  if (
    !policy.profiles
    || canonicalJson(Object.keys(policy.profiles)) !== canonicalJson(PROFILE_IDS)
    || canonicalJson(policy.stages) !== canonicalJson(EXPECTED_STAGES)
  ) throw new ValidationError('Host install profile or stage inventory drifted');

  const targetById = new Map(targets.targets?.map(target => [target.id, target]) ?? []);
  for (const profileId of PROFILE_IDS) {
    const profile = policy.profiles[profileId];
    const target = targetById.get(profileId);
    if (!profile || !target || target.status !== 'specified') {
      throw new ValidationError(`Host install target is not explicitly specified: ${profileId}`);
    }
    if (
      target.installation_grants_authority !== false
      || target.public_ingress_default !== false
      || target.external_egress_default !== 'deny'
      || target.mesh_enrollment !== 'explicit-separate-step'
      || profile.runtime_identity !== 'axiom-mesh'
    ) throw new ValidationError(`Host install authority boundary drifted: ${profileId}`);
    if (profile.topology !== target.topology || profile.service_units !== target.service_units) {
      throw new ValidationError(`Host install policy disagrees with install target: ${profileId}`);
    }
  }

  return {
    valid: true,
    schema: policy.schema,
    policy_digest: digestObject(policy),
    install_targets_digest: digestObject(targets),
    profile_ids: [...PROFILE_IDS]
  };
}

export async function collectHostFacts() {
  const platform = process.platform;
  const architecture = process.arch;
  const distro = platform === 'linux' ? await linuxDistribution() : {
    distro_id: 'not-linux',
    distro_version: 'not-linux'
  };
  const initSystem = platform === 'linux' && await pathExists('/run/systemd/system')
    ? 'systemd'
    : 'unknown';
  const packageManager = platform === 'linux'
    ? await firstExecutable(['apt-get', 'dnf', 'yum', 'zypper', 'pacman', 'apk'])
    : null;
  const containerRuntime = await firstExecutable(['podman', 'docker']);
  let freeBytes = 0;
  try {
    const stats = await statfs(platform === 'win32' ? process.cwd() : '/');
    freeBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    freeBytes = 0;
  }
  return {
    facts_source: 'live-local-observation',
    platform,
    architecture,
    ...distro,
    init_system: initSystem,
    package_manager: packageManager ?? 'none-detected',
    node_version: process.versions.node,
    memory_bytes: totalmem(),
    root_filesystem_free_bytes: freeBytes,
    container_runtime: containerRuntime ?? 'none-detected',
    effective_uid: typeof process.getuid === 'function' ? process.getuid() : null
  };
}

export function buildHostInstallPlan({
  profileId,
  hostFacts,
  policy = installPolicy,
  targets = installTargets
}) {
  const validation = validateHostInstallPolicy(policy, targets);
  if (!PROFILE_IDS.includes(profileId)) {
    throw new ValidationError(`Unknown host install profile: ${profileId}`);
  }
  validateHostFacts(hostFacts, policy.planner.required_facts);

  const profile = policy.profiles[profileId];
  const target = targets.targets.find(item => item.id === profileId);
  const blockers = [];
  if (!policy.planner.platforms.includes(hostFacts.platform)) {
    blockers.push(`unsupported-platform:${hostFacts.platform}`);
  }
  if (!policy.planner.architectures.includes(hostFacts.architecture)) {
    blockers.push(`unsupported-architecture:${hostFacts.architecture}`);
  }
  if (hostFacts.init_system !== 'systemd') {
    blockers.push(`unsupported-init-system:${hostFacts.init_system}`);
  }
  if (hostFacts.package_manager === 'none-detected') {
    blockers.push('package-manager-not-detected');
  }
  if (!nodeVersionInCurrentRange(hostFacts.node_version)) {
    blockers.push(`current-node-runtime-outside-kernel-range:${hostFacts.node_version}`);
  }
  if (hostFacts.memory_bytes <= 0) blockers.push('memory-observation-unavailable');
  if (hostFacts.root_filesystem_free_bytes <= 0) {
    blockers.push('root-filesystem-free-space-observation-unavailable');
  }

  const stages = policy.stages.map((id, index) => ({
    id,
    sequence: index + 1,
    state: id === 'preflight' ? 'observed' : 'planned-not-executed',
    privileged_effect_performed: false
  }));
  const hostFactsDigest = digestObject(hostFacts);
  const profileDigest = digestObject(profile);
  const planCore = {
    schema: HOST_INSTALL_PLAN_SCHEMA,
    version: 1,
    kernel_version: policy.kernel_version,
    status: HOST_INSTALL_PLAN_STATUS,
    profile_id: profileId,
    target_status: target.status,
    host_candidate_compatible: blockers.length === 0,
    blockers,
    host_facts_digest: hostFactsDigest,
    policy_digest: validation.policy_digest,
    install_targets_digest: validation.install_targets_digest,
    profile_digest: profileDigest,
    topology: profile.topology,
    runtime_identity: profile.runtime_identity,
    directories: Object.fromEntries(
      ['data_dir', 'secret_dir', 'units_dir', 'run_dir', 'log_dir']
        .filter(key => profile[key] !== undefined)
        .map(key => [key, profile[key]])
    ),
    service_units: profile.service_units,
    provisioning: {
      production_credentials: 'compose-existing-provision-production',
      service_unit_projection: profile.service_units === 'required'
        ? 'compose-existing-provision-service-units'
        : 'available-not-required',
      signed_release_manifest_verified: false
    },
    network: {
      public_ingress_enabled: false,
      external_egress: 'deny',
      mesh_enrollment: 'not-performed'
    },
    stages,
    mutating_installer_status: policy.mutating_installer.status,
    eligible_for_mutating_install: false,
    mutation_performed: false,
    live_services_started: false,
    credentials_created: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
  return {
    ...planCore,
    plan_digest: digestObject(planCore)
  };
}

export function validateHostInstallPlan(plan, { policy = installPolicy, targets = installTargets } = {}) {
  const validation = validateHostInstallPolicy(policy, targets);
  if (
    plan?.schema !== HOST_INSTALL_PLAN_SCHEMA
    || plan.version !== 1
    || plan.kernel_version !== policy.kernel_version
    || plan.status !== HOST_INSTALL_PLAN_STATUS
    || !PROFILE_IDS.includes(plan.profile_id)
    || plan.target_status !== 'specified'
    || plan.policy_digest !== validation.policy_digest
    || plan.install_targets_digest !== validation.install_targets_digest
    || plan.mutating_installer_status !== 'not-implemented'
    || plan.eligible_for_mutating_install !== false
    || plan.mutation_performed !== false
    || plan.live_services_started !== false
    || plan.credentials_created !== false
    || plan.authority_effect !== 'none'
    || plan.network_effect !== 'none'
    || plan.network?.public_ingress_enabled !== false
    || plan.network?.external_egress !== 'deny'
    || plan.network?.mesh_enrollment !== 'not-performed'
    || plan.provisioning?.signed_release_manifest_verified !== false
  ) throw new ValidationError('Host install plan weakens the non-mutating boundary');

  const { plan_digest: claimedDigest, ...planCore } = plan;
  if (claimedDigest !== digestObject(planCore)) {
    throw new ValidationError('Host install plan digest does not match its content');
  }
  if (
    !Array.isArray(plan.stages)
    || canonicalJson(plan.stages.map(stage => stage.id)) !== canonicalJson(EXPECTED_STAGES)
    || plan.stages.some(stage => stage.privileged_effect_performed !== false)
  ) throw new ValidationError('Host install plan stage evidence is invalid');
  return {
    valid: true,
    schema: plan.schema,
    plan_digest: claimedDigest,
    profile_id: plan.profile_id,
    host_candidate_compatible: plan.host_candidate_compatible,
    blocker_count: plan.blockers.length,
    authority_effect: 'none'
  };
}

function validateHostFacts(facts, requiredFacts) {
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) {
    throw new ValidationError('Host facts must be an object');
  }
  for (const key of requiredFacts) {
    if (!Object.hasOwn(facts, key)) {
      throw new ValidationError(`Host facts are incomplete: ${key}`);
    }
  }
  for (const key of [
    'platform',
    'architecture',
    'distro_id',
    'distro_version',
    'init_system',
    'package_manager',
    'node_version'
  ]) {
    if (typeof facts[key] !== 'string' || !facts[key].length) {
      throw new ValidationError(`Host fact is invalid: ${key}`);
    }
  }
  for (const key of ['memory_bytes', 'root_filesystem_free_bytes']) {
    if (!Number.isFinite(facts[key]) || facts[key] < 0) {
      throw new ValidationError(`Host numeric fact is invalid: ${key}`);
    }
  }
}

function nodeVersionInCurrentRange(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 24 && minor >= 14;
}

async function linuxDistribution() {
  try {
    const source = await readFile('/etc/os-release', 'utf8');
    const values = Object.fromEntries(source
      .split(/\r?\n/)
      .filter(line => line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        const key = line.slice(0, index);
        const raw = line.slice(index + 1).trim();
        const value = raw.replace(/^['"]|['"]$/g, '');
        return [key, value];
      }));
    return {
      distro_id: values.ID || 'unknown',
      distro_version: values.VERSION_ID || 'unknown'
    };
  } catch {
    return { distro_id: 'unknown', distro_version: 'unknown' };
  }
}

async function firstExecutable(names) {
  const searchPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const name of names) {
    for (const directory of searchPath) {
      const candidate = join(directory, process.platform === 'win32' ? `${name}.exe` : name);
      try {
        await access(candidate, fsConstants.X_OK);
        return name;
      } catch {
        // Continue searching without invoking the executable.
      }
    }
  }
  return null;
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function exactObject(value, label, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${label} key inventory drifted`);
}

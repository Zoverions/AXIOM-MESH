import { access, readFile, statfs } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { totalmem } from 'node:os';
import { types as utilTypes } from 'node:util';

import installTargets from '../../config/install-targets.json' with { type: 'json' };
import installPolicy from '../../config/host-install-policy.json' with { type: 'json' };
import sourceSetupPolicy from '../../config/setup.json' with { type: 'json' };
import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';

export const HOST_INSTALL_POLICY_SCHEMA = 'axiom-host-install-policy.v1';
export const HOST_INSTALL_PLAN_SCHEMA = 'axiom-host-install-plan.v1';
export const HOST_INSTALL_PLAN_STATUS = 'non-mutating-planning-evidence';

const PROFILE_IDS = Object.freeze(['personal-local', 'infrastructure-node']);
const RUNTIME_STRATEGIES = Object.freeze(['oci', 'source']);
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
  exactObject(policy, 'Host install policy', [
    'schema','version','kernel_version','status','authority_effect',
    'host_mutation_enabled','planner','mutating_installer','profiles','stages'
  ]);
  if (
    policy.schema !== HOST_INSTALL_POLICY_SCHEMA
    || policy.version !== 1
    || policy.kernel_version !== targets.kernel_version
    || policy.status !== 'planner-implemented-installer-not-implemented'
    || policy.authority_effect !== 'none'
    || policy.host_mutation_enabled !== false
  ) throw new ValidationError('Host install policy identity or authority boundary is invalid');

  exactObject(policy.planner, 'Host install planner policy', [
    'status','platforms','architectures','supported_distributions',
    'preferred_runtime_strategy','runtime_strategies','verified_oci_runtimes',
    'required_facts','node_fact_requirement','unsupported_host_behavior',
    'mutation_performed'
  ]);
  if (
    policy.planner.status !== 'implemented-non-mutating'
    || canonicalJson(policy.planner.platforms) !== canonicalJson(['linux'])
    || canonicalJson(policy.planner.architectures) !== canonicalJson(['x64','arm64'])
    || policy.planner.preferred_runtime_strategy !== 'oci'
    || canonicalJson(policy.planner.runtime_strategies) !== canonicalJson(RUNTIME_STRATEGIES)
    || canonicalJson(policy.planner.verified_oci_runtimes) !== canonicalJson(['docker'])
    || policy.planner.node_fact_requirement !== 'optional-for-oci-required-for-source'
    || policy.planner.unsupported_host_behavior !== 'fail-closed-with-blockers'
    || policy.planner.mutation_performed !== false
  ) throw new ValidationError('Host install planner policy drifted');

  validateStringArray(policy.planner.required_facts, 'planner.required_facts', 32);
  if (!policy.planner.required_facts.includes('node_version')) {
    throw new ValidationError('Host install planner must carry explicit node_version evidence');
  }
  validateSupportedDistributions(policy.planner.supported_distributions);

  exactObject(policy.mutating_installer, 'Mutating installer policy', [
    'status','requires_signed_release_manifest','requires_disposable_host_evidence',
    'requires_reboot_update_restore_evidence','public_ingress_default',
    'external_egress_default','mesh_enrollment','installation_grants_authority'
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
    exactObject(profile, `Host install profile ${profileId}`, profileId === 'personal-local'
      ? ['topology','service_units','runtime_identity','data_dir','secret_dir','run_dir','log_dir','applications']
      : ['topology','service_units','runtime_identity','data_dir','secret_dir','units_dir','run_dir','log_dir','network_participation']);
    if (!target || target.status !== 'specified') {
      throw new ValidationError(`Host install target is not explicitly specified: ${profileId}`);
    }
    if (
      target.installation_grants_authority !== false
      || target.public_ingress_default !== false
      || target.external_egress_default !== 'deny'
      || target.mesh_enrollment !== 'explicit-separate-step'
      || profile.runtime_identity !== 'axiom-mesh'
      || profile.topology !== target.topology
      || profile.service_units !== target.service_units
    ) throw new ValidationError(`Host install authority or topology boundary drifted: ${profileId}`);
  }

  return Object.freeze({
    valid: true,
    schema: policy.schema,
    policy_digest: digestObject(policy),
    install_targets_digest: digestObject(targets),
    profile_ids: Object.freeze([...PROFILE_IDS]),
    authority_effect: 'none',
    host_mutation_enabled: false
  });
}

export async function collectHostFacts() {
  const platform = process.platform;
  const architecture = process.arch;
  const distro = platform === 'linux'
    ? await linuxDistribution()
    : { distro_id: 'not-linux', distro_version: 'not-linux' };
  const initSystem = platform === 'linux' && await pathExists('/run/systemd/system')
    ? 'systemd'
    : 'unknown';
  const packageManager = platform === 'linux'
    ? await firstExecutable(['apt-get','dnf','yum','zypper','pacman','apk'])
    : null;
  const containerRuntime = await firstExecutable(['docker','podman']);
  let freeBytes = 0;
  try {
    const stats = await statfs(platform === 'win32' ? process.cwd() : '/');
    freeBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    freeBytes = 0;
  }
  return Object.freeze({
    facts_source: 'live-local-observation',
    platform,
    architecture,
    ...distro,
    init_system: initSystem,
    package_manager: packageManager ?? 'none-detected',
    node_version: process.versions?.node ?? null,
    memory_bytes: totalmem(),
    root_filesystem_free_bytes: freeBytes,
    container_runtime: containerRuntime ?? 'none-detected',
    effective_uid: typeof process.getuid === 'function' ? process.getuid() : null
  });
}

export function buildHostInstallPlan({
  profileId,
  hostFacts,
  runtimeStrategy = installPolicy.planner.preferred_runtime_strategy,
  policy = installPolicy,
  targets = installTargets,
  setupPolicy = sourceSetupPolicy
}) {
  const validation = validateHostInstallPolicy(policy, targets);
  if (!PROFILE_IDS.includes(profileId)) {
    throw new ValidationError(`Unknown host install profile: ${profileId}`);
  }
  if (!RUNTIME_STRATEGIES.includes(runtimeStrategy)) {
    throw new ValidationError(`Unknown host install runtime strategy: ${runtimeStrategy}`);
  }
  validateHostFacts(hostFacts, policy.planner.required_facts);

  const profile = policy.profiles[profileId];
  const target = targets.targets.find(item => item.id === profileId);
  const blockers = [];
  const prerequisites = [];

  if (!policy.planner.platforms.includes(hostFacts.platform)) {
    blockers.push(`unsupported-platform:${hostFacts.platform}`);
  }
  if (!policy.planner.architectures.includes(hostFacts.architecture)) {
    blockers.push(`unsupported-architecture:${hostFacts.architecture}`);
  }

  const distro = policy.planner.supported_distributions.find(item => item.id === hostFacts.distro_id);
  if (!distro || !distro.versions.includes(hostFacts.distro_version)) {
    blockers.push(`unsupported-distribution:${hostFacts.distro_id}:${hostFacts.distro_version}`);
  } else {
    if (hostFacts.init_system !== distro.init_system) {
      blockers.push(`unsupported-init-system:${hostFacts.init_system}`);
    }
    if (hostFacts.package_manager !== distro.package_manager) {
      blockers.push(`unsupported-package-manager:${hostFacts.package_manager}`);
    }
  }

  if (hostFacts.memory_bytes <= 0) blockers.push('memory-observation-unavailable');
  if (hostFacts.root_filesystem_free_bytes <= 0) {
    blockers.push('root-filesystem-free-space-observation-unavailable');
  }

  if (runtimeStrategy === 'oci') {
    if (hostFacts.container_runtime === 'none-detected') {
      prerequisites.push('install-reviewed-container-runtime:docker');
    } else if (!policy.planner.verified_oci_runtimes.includes(hostFacts.container_runtime)) {
      blockers.push(`unverified-container-runtime:${hostFacts.container_runtime}`);
    }
  } else {
    if (hostFacts.node_version === null || !nodeVersionAllowed(hostFacts.node_version, setupPolicy)) {
      blockers.push(`source-node-runtime-unavailable-or-unsupported:${hostFacts.node_version ?? 'missing'}`);
    }
  }

  const stages = policy.stages.map((id, index) => Object.freeze({
    id,
    sequence: index + 1,
    state: id === 'preflight' ? 'observed' : 'planned-not-executed',
    privileged_effect_performed: false
  }));

  const planCore = {
    schema: HOST_INSTALL_PLAN_SCHEMA,
    version: 1,
    kernel_version: policy.kernel_version,
    status: HOST_INSTALL_PLAN_STATUS,
    profile_id: profileId,
    target_status: target.status,
    runtime_strategy: runtimeStrategy,
    host_candidate_compatible: blockers.length === 0,
    blockers,
    prerequisites,
    host_facts_digest: digestObject(hostFacts),
    policy_digest: validation.policy_digest,
    install_targets_digest: validation.install_targets_digest,
    source_setup_policy_digest: digestObject(setupPolicy),
    profile_digest: digestObject(profile),
    topology: profile.topology,
    runtime_identity: profile.runtime_identity,
    directories: Object.fromEntries(
      ['data_dir','secret_dir','units_dir','run_dir','log_dir']
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
    runtime: {
      container_runtime_observed: hostFacts.container_runtime,
      container_runtime_verified: runtimeStrategy === 'oci'
        && policy.planner.verified_oci_runtimes.includes(hostFacts.container_runtime),
      node_runtime_required: runtimeStrategy === 'source',
      node_runtime_observed: hostFacts.node_version
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
  return deepFreeze({
    ...planCore,
    plan_digest: digestObject(planCore)
  });
}

export function validateHostInstallPlan(
  plan,
  { policy = installPolicy, targets = installTargets, setupPolicy = sourceSetupPolicy } = {}
) {
  exactObject(plan, 'Host install plan', [
    'schema','version','kernel_version','status','profile_id','target_status',
    'runtime_strategy','host_candidate_compatible','blockers','prerequisites',
    'host_facts_digest','policy_digest','install_targets_digest',
    'source_setup_policy_digest','profile_digest','topology','runtime_identity',
    'directories','service_units','provisioning','runtime','network','stages',
    'mutating_installer_status','eligible_for_mutating_install',
    'mutation_performed','live_services_started','credentials_created',
    'authority_effect','network_effect','plan_digest'
  ]);
  const validation = validateHostInstallPolicy(policy, targets);
  if (
    plan.schema !== HOST_INSTALL_PLAN_SCHEMA
    || plan.version !== 1
    || plan.kernel_version !== policy.kernel_version
    || plan.status !== HOST_INSTALL_PLAN_STATUS
    || !PROFILE_IDS.includes(plan.profile_id)
    || plan.target_status !== 'specified'
    || !RUNTIME_STRATEGIES.includes(plan.runtime_strategy)
    || plan.policy_digest !== validation.policy_digest
    || plan.install_targets_digest !== validation.install_targets_digest
    || plan.source_setup_policy_digest !== digestObject(setupPolicy)
    || plan.mutating_installer_status !== 'not-implemented'
    || plan.eligible_for_mutating_install !== false
    || plan.mutation_performed !== false
    || plan.live_services_started !== false
    || plan.credentials_created !== false
    || plan.authority_effect !== 'none'
    || plan.network_effect !== 'none'
  ) throw new ValidationError('Host install plan weakens the non-mutating boundary');

  validateStringArray(plan.blockers, 'plan.blockers', 64);
  validateStringArray(plan.prerequisites, 'plan.prerequisites', 64);
  if (plan.host_candidate_compatible !== (plan.blockers.length === 0)) {
    throw new ValidationError('Host install compatibility does not match blockers');
  }

  exactObject(plan.network, 'Host install plan network', [
    'public_ingress_enabled','external_egress','mesh_enrollment'
  ]);
  if (
    plan.network.public_ingress_enabled !== false
    || plan.network.external_egress !== 'deny'
    || plan.network.mesh_enrollment !== 'not-performed'
  ) throw new ValidationError('Host install plan network boundary is invalid');

  exactObject(plan.provisioning, 'Host install plan provisioning', [
    'production_credentials','service_unit_projection','signed_release_manifest_verified'
  ]);
  if (plan.provisioning.signed_release_manifest_verified !== false) {
    throw new ValidationError('Host install plan cannot claim release verification');
  }

  exactObject(plan.runtime, 'Host install plan runtime', [
    'container_runtime_observed','container_runtime_verified',
    'node_runtime_required','node_runtime_observed'
  ]);
  if (plan.runtime.node_runtime_required !== (plan.runtime_strategy === 'source')) {
    throw new ValidationError('Host install plan node runtime requirement drifted');
  }
  if (
    plan.runtime_strategy === 'oci'
    && plan.runtime.node_runtime_observed === null
    && plan.blockers.some(item => item.startsWith('source-node-runtime-'))
  ) throw new ValidationError('OCI install planning cannot require a Node runtime');

  if (!Array.isArray(plan.stages) || plan.stages.length !== EXPECTED_STAGES.length) {
    throw new ValidationError('Host install plan stage inventory is invalid');
  }
  for (let index = 0; index < plan.stages.length; index += 1) {
    const stage = plan.stages[index];
    exactObject(stage, 'Host install plan stage', [
      'id','sequence','state','privileged_effect_performed'
    ]);
    if (
      stage.id !== EXPECTED_STAGES[index]
      || stage.sequence !== index + 1
      || stage.privileged_effect_performed !== false
      || !['observed','planned-not-executed'].includes(stage.state)
      || (index === 0 ? stage.state !== 'observed' : stage.state !== 'planned-not-executed')
    ) throw new ValidationError('Host install plan stage evidence is invalid');
  }

  const { plan_digest: claimedDigest, ...planCore } = plan;
  if (claimedDigest !== digestObject(planCore)) {
    throw new ValidationError('Host install plan digest does not match its content');
  }

  return Object.freeze({
    valid: true,
    schema: plan.schema,
    plan_digest: claimedDigest,
    profile_id: plan.profile_id,
    runtime_strategy: plan.runtime_strategy,
    host_candidate_compatible: plan.host_candidate_compatible,
    blocker_count: plan.blockers.length,
    prerequisite_count: plan.prerequisites.length,
    authority_effect: 'none',
    mutation_performed: false
  });
}

function validateSupportedDistributions(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    throw new ValidationError('supported_distributions has invalid cardinality');
  }
  const seen = new Set();
  for (const item of value) {
    exactObject(item, 'Supported distribution', [
      'id','versions','package_manager','init_system'
    ]);
    if (
      typeof item.id !== 'string'
      || !/^[a-z0-9._-]+$/.test(item.id)
      || seen.has(item.id)
      || typeof item.package_manager !== 'string'
      || typeof item.init_system !== 'string'
    ) throw new ValidationError('Supported distribution entry is invalid');
    validateStringArray(item.versions, 'supported distribution versions', 16);
    seen.add(item.id);
  }
}

function validateHostFacts(facts, requiredFacts) {
  exactObject(facts, 'Host facts', [
    'facts_source','platform','architecture','distro_id','distro_version',
    'init_system','package_manager','node_version','memory_bytes',
    'root_filesystem_free_bytes','container_runtime','effective_uid'
  ]);
  for (const key of requiredFacts) {
    if (!Object.hasOwn(facts, key)) {
      throw new ValidationError(`Host facts are incomplete: ${key}`);
    }
  }
  for (const key of [
    'facts_source','platform','architecture','distro_id','distro_version',
    'init_system','package_manager','container_runtime'
  ]) {
    if (typeof facts[key] !== 'string' || facts[key].length === 0 || facts[key].length > 256) {
      throw new ValidationError(`Host fact is invalid: ${key}`);
    }
  }
  if (
    facts.node_version !== null
    && (typeof facts.node_version !== 'string' || facts.node_version.length > 64)
  ) throw new ValidationError('Host fact is invalid: node_version');
  for (const key of ['memory_bytes','root_filesystem_free_bytes']) {
    if (!Number.isSafeInteger(facts[key]) || facts[key] < 0) {
      throw new ValidationError(`Host numeric fact is invalid: ${key}`);
    }
  }
  if (
    facts.effective_uid !== null
    && (!Number.isSafeInteger(facts.effective_uid) || facts.effective_uid < 0)
  ) throw new ValidationError('Host fact is invalid: effective_uid');
}

function nodeVersionAllowed(version, setupPolicy) {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  const primary = parseVersion(setupPolicy.runtime.minimum_version);
  const compatibility = parseVersion(setupPolicy.runtime.compatibility_minimum_version);
  return (
    parsed.major === primary.major
    && compareVersions(parsed, primary) >= 0
    && parsed.major < setupPolicy.runtime.maximum_major_exclusive
  ) || (
    parsed.major === compatibility.major
    && compareVersions(parsed, compatibility) >= 0
    && parsed.major < setupPolicy.runtime.compatibility_maximum_major_exclusive
  );
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value ?? '');
  return match ? { major:Number(match[1]), minor:Number(match[2]), patch:Number(match[3]) } : null;
}

function compareVersions(a,b) {
  return a.major-b.major || a.minor-b.minor || a.patch-b.patch;
}

async function linuxDistribution() {
  try {
    const source = await readFile('/etc/os-release', 'utf8');
    const values = Object.fromEntries(source
      .split(/\r?\n/)
      .filter(line => line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        const key = line.slice(0,index);
        const raw = line.slice(index+1).trim();
        return [key, raw.replace(/^['"]|['"]$/g,'')];
      }));
    return {
      distro_id: values.ID || 'unknown',
      distro_version: values.VERSION_ID || 'unknown'
    };
  } catch {
    return { distro_id:'unknown', distro_version:'unknown' };
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
        // Observation only: never invoke the discovered executable.
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

function validateStringArray(value,label,maxItems) {
  if (
    utilTypes.isProxy(value)
    || !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > maxItems
  ) throw new ValidationError(`${label} has invalid cardinality`);
  const seen = new Set();
  for (let index=0; index<value.length; index+=1) {
    if (!Object.hasOwn(value,String(index))) throw new ValidationError(`${label} cannot be sparse`);
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor,'value')) {
      throw new ValidationError(`${label} must contain only enumerable data properties`);
    }
    const item=descriptor.value;
    if (typeof item !== 'string' || item.length === 0 || item.length > 512 || seen.has(item)) {
      throw new ValidationError(`${label} contains invalid or duplicate values`);
    }
    seen.add(item);
  }
}

function exactObject(value,label,keys) {
  if (utilTypes.isProxy(value)) throw new ValidationError(`${label} cannot be a Proxy`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype=Object.getPrototypeOf(value);
  if (prototype!==Object.prototype && prototype!==null) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const actual=Reflect.ownKeys(value);
  if (actual.some(key => typeof key === 'symbol')) {
    throw new ValidationError(`${label} cannot contain symbol keys`);
  }
  for (const key of actual) {
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor,'value')) {
      throw new ValidationError(`${label} must contain only enumerable data properties`);
    }
  }
  if (actual.map(String).sort().join(',') !== [...keys].sort().join(',')) {
    throw new ValidationError(`${label} key inventory drifted`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

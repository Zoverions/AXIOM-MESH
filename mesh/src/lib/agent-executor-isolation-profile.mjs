import { ValidationError, digestObject } from './canonical.mjs';
import { validateAgentExecutorPlatformProfile } from './agent-executor-dry-run.mjs';

export const AGENT_EXECUTOR_ISOLATION_PROFILE_SCHEMA = 'axiom-agent-executor-isolation-profile.v1';
export const AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA = 'axiom-agent-executor-isolation-policy-catalog.v1';
export const AGENT_EXECUTOR_ISOLATION_ASSESSMENT_SCHEMA = 'axiom-agent-executor-isolation-assessment.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const EVIDENCE_STATUS = new Set(['declared', 'measured', 'reproduced', 'externally-verified']);
const OBSERVATION_ENVIRONMENTS = new Set(['unspecified', 'hosted-ci', 'physical-device', 'external-lab']);
const MAX_DOCUMENT_BYTES = 262_144;

const COMMON_CONTROLS = Object.freeze([
  'disposable-workspace-root-containment',
  'host-root-deny',
  'symlink-reparse-boundary',
  'pinned-executable-resolution',
  'minimal-environment',
  'no-ambient-credentials-secrets',
  'no-privilege-escalation',
  'process-tree-containment',
  'timeout-terminal-kill',
  'cpu-memory-process-output-ceilings',
  'default-deny-network',
  'explicit-origin-network-only',
  'inherited-handle-descriptor-minimization',
  'terminal-on-uncertainty',
  'workspace-disposal'
]);

const PROFILE_POLICY = Object.freeze({
  linux: Object.freeze({
    policy_id: 'linux-kernel-isolation-v1',
    revision: 1,
    supported_architectures: Object.freeze(['x64', 'arm64']),
    repository_code_boundary: 'kernel-enforced-process-filesystem-network-isolation',
    mechanism_families: Object.freeze([
      'linux-process-namespace-boundary',
      'linux-filesystem-mount-boundary',
      'linux-network-namespace-boundary',
      'linux-resource-controller',
      'linux-syscall-filter-or-equivalent',
      'linux-privilege-ceiling'
    ]),
    hosted_ci_sufficient: false,
    physical_device_evidence_required_before_production_promotion: true
  }),
  macos: Object.freeze({
    policy_id: 'macos-virtualized-isolation-v1',
    revision: 1,
    supported_architectures: Object.freeze(['x64', 'arm64']),
    repository_code_boundary: 'virtual-machine-or-equivalent-kernel-enforced-isolation',
    mechanism_families: Object.freeze([
      'macos-vm-or-equivalent-kernel-boundary',
      'macos-disposable-volume-boundary',
      'macos-network-policy-boundary',
      'macos-process-resource-supervision',
      'macos-host-credential-separation'
    ]),
    hosted_ci_sufficient: false,
    physical_device_evidence_required_before_production_promotion: true
  }),
  windows: Object.freeze({
    policy_id: 'windows-contained-isolation-v1',
    revision: 1,
    supported_architectures: Object.freeze(['x64', 'arm64']),
    repository_code_boundary: 'container-vm-or-restricted-security-boundary-with-tree-containment',
    mechanism_families: Object.freeze([
      'windows-container-vm-or-restricted-security-boundary',
      'windows-process-tree-job-boundary',
      'windows-filesystem-namespace-boundary',
      'windows-network-policy-boundary',
      'windows-token-privilege-ceiling'
    ]),
    hosted_ci_sufficient: false,
    physical_device_evidence_required_before_production_promotion: true
  })
});

export const AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG = Object.freeze({
  schema: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA,
  version: 1,
  common_controls: COMMON_CONTROLS,
  profiles: PROFILE_POLICY,
  boundaries: Object.freeze({
    effect_reachable: false,
    real_process_execution_enabled: false,
    real_filesystem_isolation_verified: false,
    real_network_isolation_verified: false,
    repository_code_isolation_verified: false,
    hosted_ci_is_physical_device_proof: false,
    production_executor_ready: false,
    production_node_enrollment_enabled: false,
    remote_administration_enabled: false,
    deployment_authority: false,
    capability_promotion_authority: false,
    authority_granted: false
  })
});

export const AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST =
  digestObject(AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG);

const PROFILE_KEYS = new Set([
  'schema', 'profile_id', 'platform_profile_digest', 'operating_system', 'architecture',
  'policy', 'evidence', 'requirements', 'claims'
]);
const POLICY_KEYS = new Set(['catalog_schema', 'catalog_digest', 'policy_id', 'revision']);
const EVIDENCE_KEYS = new Set(['status', 'observation_environment', 'refs', 'real_effects_observed']);
const REQUIREMENT_KEYS = new Set([
  'common_controls', 'mechanism_families', 'repository_code_boundary', 'hosted_ci_sufficient',
  'physical_device_evidence_required_before_production_promotion'
]);
const CLAIM_KEYS = new Set([
  'platform_isolation_verified', 'repository_code_isolation_verified', 'effect_reachable',
  'production_executor_ready', 'remote_execution_enabled', 'production_node_enrollment',
  'deployment_authority', 'capability_promoted', 'authority_granted'
]);

function boundedDocument(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new ValidationError(`${label} exceeds the maximum encoded size`);
  }
}

function exactKeys(value, keys, label) {
  boundedDocument(value, label);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field: ${key}`);
  }
}

function identifier(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function boundedString(value, label, max = 1024) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.includes('\0')) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function exactStringArray(value, expected, label) {
  if (!Array.isArray(value) || value.length !== expected.length) {
    throw new ValidationError(`${label} must match the reviewed policy exactly`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (value[index] !== expected[index]) {
      throw new ValidationError(`${label} must match the reviewed policy exactly`);
    }
  }
  return Object.freeze([...expected]);
}

function evidenceRefs(value) {
  if (!Array.isArray(value) || value.length > 16) {
    throw new ValidationError('Agent executor isolation evidence refs are invalid');
  }
  const refs = value.map((item, index) =>
    boundedString(item, `Agent executor isolation evidence ref ${index}`, 1024)
  );
  if (new Set(refs).size !== refs.length) {
    throw new ValidationError('Agent executor isolation evidence refs must be unique');
  }
  return Object.freeze(refs);
}

function falseClaims(value) {
  exactKeys(value, CLAIM_KEYS, 'Agent executor isolation claims');
  for (const key of CLAIM_KEYS) {
    if (value[key] !== false) throw new ValidationError(`Agent executor isolation claims attempt to elevate ${key}`);
  }
  return Object.freeze(Object.fromEntries([...CLAIM_KEYS].map(key => [key, false])));
}

export function validateAgentExecutorIsolationProfile(
  raw,
  { expectedPlatformProfile = null, verifierConfirmed = false } = {}
) {
  boundedDocument(raw, 'Agent executor isolation profile');
  exactKeys(raw, PROFILE_KEYS, 'Agent executor isolation profile');

  if (raw.schema !== AGENT_EXECUTOR_ISOLATION_PROFILE_SCHEMA) {
    throw new ValidationError('Agent executor isolation profile schema is invalid');
  }

  const policy = PROFILE_POLICY[raw.operating_system];
  if (!policy) throw new ValidationError('Agent executor isolation operating_system is unsupported');
  if (!policy.supported_architectures.includes(raw.architecture)) {
    throw new ValidationError('Agent executor isolation architecture is unsupported for the selected platform policy');
  }

  exactKeys(raw.policy, POLICY_KEYS, 'Agent executor isolation policy binding');
  if (raw.policy.catalog_schema !== AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA) {
    throw new ValidationError('Agent executor isolation policy catalog schema is invalid');
  }
  if (raw.policy.catalog_digest !== AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST) {
    throw new ValidationError('Agent executor isolation policy catalog digest does not match the reviewed catalog');
  }
  if (raw.policy.policy_id !== policy.policy_id || raw.policy.revision !== policy.revision) {
    throw new ValidationError('Agent executor isolation platform policy binding is invalid');
  }

  exactKeys(raw.evidence, EVIDENCE_KEYS, 'Agent executor isolation evidence');
  if (!EVIDENCE_STATUS.has(raw.evidence.status)) {
    throw new ValidationError('Agent executor isolation evidence status is invalid');
  }
  if (!OBSERVATION_ENVIRONMENTS.has(raw.evidence.observation_environment)) {
    throw new ValidationError('Agent executor isolation observation environment is invalid');
  }
  if (raw.evidence.real_effects_observed !== false) {
    throw new ValidationError('Agent executor isolation profile cannot claim real effects were observed');
  }
  if (raw.evidence.status === 'externally-verified' && verifierConfirmed !== true) {
    throw new ValidationError('Externally verified isolation evidence requires separate verifier confirmation');
  }
  if (raw.evidence.status !== 'externally-verified' && verifierConfirmed === true) {
    throw new ValidationError('Verifier confirmation cannot upgrade a non-external evidence status');
  }

  exactKeys(raw.requirements, REQUIREMENT_KEYS, 'Agent executor isolation requirements');
  const commonControls = exactStringArray(
    raw.requirements.common_controls,
    COMMON_CONTROLS,
    'Agent executor isolation common controls'
  );
  const mechanismFamilies = exactStringArray(
    raw.requirements.mechanism_families,
    policy.mechanism_families,
    'Agent executor isolation mechanism families'
  );
  if (raw.requirements.repository_code_boundary !== policy.repository_code_boundary) {
    throw new ValidationError('Agent executor isolation repository-code boundary does not match the reviewed platform policy');
  }
  if (raw.requirements.hosted_ci_sufficient !== false) {
    throw new ValidationError('Hosted CI cannot be sufficient isolation proof');
  }
  if (raw.requirements.physical_device_evidence_required_before_production_promotion !== true) {
    throw new ValidationError('Physical-device evidence must remain required before production promotion');
  }

  const normalized = {
    schema: AGENT_EXECUTOR_ISOLATION_PROFILE_SCHEMA,
    profile_id: identifier(raw.profile_id, 'Agent executor isolation profile_id'),
    platform_profile_digest: digest(raw.platform_profile_digest, 'Agent executor isolation platform_profile_digest'),
    operating_system: raw.operating_system,
    architecture: raw.architecture,
    policy: Object.freeze({
      catalog_schema: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA,
      catalog_digest: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
      policy_id: policy.policy_id,
      revision: policy.revision
    }),
    evidence: Object.freeze({
      status: raw.evidence.status,
      observation_environment: raw.evidence.observation_environment,
      refs: evidenceRefs(raw.evidence.refs),
      real_effects_observed: false
    }),
    requirements: Object.freeze({
      common_controls: commonControls,
      mechanism_families: mechanismFamilies,
      repository_code_boundary: policy.repository_code_boundary,
      hosted_ci_sufficient: false,
      physical_device_evidence_required_before_production_promotion: true
    }),
    claims: falseClaims(raw.claims)
  };

  if (expectedPlatformProfile) {
    const platform = validateAgentExecutorPlatformProfile(expectedPlatformProfile);
    const expectedDigest = digestObject(platform);
    if (normalized.platform_profile_digest !== expectedDigest) {
      throw new ValidationError('Agent executor isolation platform-profile digest substitution detected');
    }
    if (
      normalized.operating_system !== platform.operating_system
      || normalized.architecture !== platform.architecture
    ) {
      throw new ValidationError('Agent executor isolation platform facts do not match the bound platform profile');
    }
  }

  return Object.freeze(normalized);
}

export function assessAgentExecutorIsolationProfile(raw, options = {}) {
  const profile = validateAgentExecutorIsolationProfile(raw, options);
  const verifierConfirmed = options.verifierConfirmed === true;

  return Object.freeze({
    schema: AGENT_EXECUTOR_ISOLATION_ASSESSMENT_SCHEMA,
    isolation_profile_digest: digestObject(profile),
    platform_profile_digest: profile.platform_profile_digest,
    operating_system: profile.operating_system,
    architecture: profile.architecture,
    policy_catalog_digest: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
    policy_id: profile.policy.policy_id,
    evidence_status: profile.evidence.status,
    observation_environment: profile.evidence.observation_environment,
    independent_verifier_confirmed: verifierConfirmed,
    requirements_match_reviewed_policy: true,
    hosted_ci_is_physical_device_proof: false,
    platform_isolation_verified: false,
    repository_code_isolation_verified: false,
    effect_admission_eligible: false,
    production_executor_ready: false,
    remaining_blockers: Object.freeze([
      'no-effect-capable-platform-adapter',
      'no-os-enforcement-evidence',
      'no-real-repository-code-isolation-evidence',
      'no-live-network-enforcement-evidence',
      'no-independent-effect-security-review',
      'no-production-promotion'
    ])
  });
}

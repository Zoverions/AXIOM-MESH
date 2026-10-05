import { digestObject, ValidationError } from './canonical.mjs';

export const STATE_FABRIC_SIMULATION_SCHEMA = 'axiom-state-fabric-simulation.v0';
export const STATE_FABRIC_SIMULATION_STATUS = 'inert-contract-laboratory';
export const STATE_FABRIC_COMMIT_PATH = 'Gateway -> Hypervisor -> Sandbox -> Grid';

export const STATE_FABRIC_REQUIRED_VERIFICATION_CHECKS = Object.freeze([
  'branch-source-bound',
  'step-chain-continuous',
  'scope-contained',
  'no-external-effect',
  'no-canonical-write',
  'result-bound'
]);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function validateStateFabricSimulation(document) {
  exactObject(document, 'State Fabric simulation package', [
    'schema',
    'version',
    'status',
    'branch',
    'simulation',
    'verification',
    'commit_candidate',
    'authority_effect',
    'network_effect',
    'canonical_state_mutated',
    'runtime_activation'
  ]);

  if (
    document.schema !== STATE_FABRIC_SIMULATION_SCHEMA
    || document.version !== 0
    || document.status !== STATE_FABRIC_SIMULATION_STATUS
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.canonical_state_mutated !== false
    || document.runtime_activation !== false
  ) {
    throw new ValidationError('State Fabric simulation activation boundary is invalid');
  }

  const branch = validateBranch(document.branch);
  const simulation = validateSimulation(document.simulation, branch);
  const simulationDigest = digestObject({ branch, simulation });
  const verification = validateVerification(
    document.verification,
    branch,
    simulation,
    simulationDigest
  );
  const verificationDigest = digestObject(verification);
  const commitCandidate = validateCommitCandidate(
    document.commit_candidate,
    branch,
    simulation,
    simulationDigest,
    verificationDigest
  );

  return Object.freeze({
    valid: true,
    schema: STATE_FABRIC_SIMULATION_SCHEMA,
    branch_id: branch.branch_id,
    simulation_id: simulation.simulation_id,
    simulation_digest: simulationDigest,
    verification_digest: verificationDigest,
    commit_candidate_id: commitCandidate.candidate_id,
    requested_action: commitCandidate.requested_action,
    authority_effect: 'none',
    network_effect: 'none',
    canonical_state_mutated: false,
    runtime_activation: false,
    direct_commit_allowed: false
  });
}

export function stateFabricSimulationDigest(document) {
  const result = validateStateFabricSimulation(document);
  return result.simulation_digest;
}

function validateBranch(branch) {
  exactObject(branch, 'State Fabric branch', [
    'branch_id',
    'owner_principal_id',
    'authority_domain',
    'source_head_digest',
    'source_sequence',
    'scope',
    'created_at',
    'expires_at',
    'isolation',
    'external_effects_allowed',
    'canonical_writes_allowed'
  ]);

  identifier(branch.branch_id, 'branch.branch_id');
  identifier(branch.owner_principal_id, 'branch.owner_principal_id');
  identifier(branch.authority_domain, 'branch.authority_domain');
  digest(branch.source_head_digest, 'branch.source_head_digest');
  nonnegativeInteger(branch.source_sequence, 'branch.source_sequence');
  uniqueIdentifierArray(branch.scope, 'branch.scope', { min: 1, max: 64 });

  const createdAt = timestamp(branch.created_at, 'branch.created_at');
  const expiresAt = timestamp(branch.expires_at, 'branch.expires_at');
  if (expiresAt <= createdAt) {
    throw new ValidationError('State Fabric branch expiry must follow creation');
  }

  if (
    branch.isolation !== 'simulation-only'
    || branch.external_effects_allowed !== false
    || branch.canonical_writes_allowed !== false
  ) {
    throw new ValidationError('State Fabric branch must remain simulation-only and effect-free');
  }

  return branch;
}

function validateSimulation(simulation, branch) {
  exactObject(simulation, 'State Fabric simulation', [
    'simulation_id',
    'engine_id',
    'engine_version',
    'started_at',
    'completed_at',
    'input_state_digest',
    'steps',
    'result_state_digest',
    'external_effects_performed',
    'canonical_writes_performed'
  ]);

  identifier(simulation.simulation_id, 'simulation.simulation_id');
  identifier(simulation.engine_id, 'simulation.engine_id');
  boundedString(simulation.engine_version, 'simulation.engine_version', 1, 128);
  digest(simulation.input_state_digest, 'simulation.input_state_digest');
  digest(simulation.result_state_digest, 'simulation.result_state_digest');

  const branchCreatedAt = timestamp(branch.created_at, 'branch.created_at');
  const branchExpiresAt = timestamp(branch.expires_at, 'branch.expires_at');
  const startedAt = timestamp(simulation.started_at, 'simulation.started_at');
  const completedAt = timestamp(simulation.completed_at, 'simulation.completed_at');
  if (
    startedAt < branchCreatedAt
    || completedAt < startedAt
    || completedAt > branchExpiresAt
  ) {
    throw new ValidationError('State Fabric simulation chronology is outside the branch lifetime');
  }

  if (simulation.input_state_digest !== branch.source_head_digest) {
    throw new ValidationError('State Fabric simulation input must bind the branch source head');
  }
  if (
    simulation.external_effects_performed !== false
    || simulation.canonical_writes_performed !== false
  ) {
    throw new ValidationError('State Fabric simulation may not perform external effects or canonical writes');
  }

  if (!Array.isArray(simulation.steps) || simulation.steps.length < 1 || simulation.steps.length > 256) {
    throw new ValidationError('State Fabric simulation requires 1-256 steps');
  }

  const scope = new Set(branch.scope);
  const stepIds = new Set();
  let expectedPreState = simulation.input_state_digest;
  for (let index = 0; index < simulation.steps.length; index += 1) {
    const step = simulation.steps[index];
    validateStep(step, index);
    if (stepIds.has(step.step_id)) {
      throw new ValidationError(`State Fabric simulation step id ${step.step_id} is duplicated`);
    }
    stepIds.add(step.step_id);
    if (!scope.has(step.target_ref)) {
      throw new ValidationError(`State Fabric simulation step ${step.step_id} targets state outside branch scope`);
    }
    if (step.pre_state_digest !== expectedPreState) {
      throw new ValidationError(`State Fabric simulation step ${step.step_id} does not continue the state chain`);
    }
    expectedPreState = step.post_state_digest;
  }

  if (simulation.result_state_digest !== expectedPreState) {
    throw new ValidationError('State Fabric simulation result does not match the final step state');
  }

  return simulation;
}

function validateStep(step, index) {
  exactObject(step, `State Fabric simulation step ${index}`, [
    'step_id',
    'operation',
    'target_ref',
    'pre_state_digest',
    'post_state_digest',
    'evidence_refs',
    'effect_class',
    'actual_external_effect'
  ]);
  identifier(step.step_id, `steps[${index}].step_id`);
  identifier(step.operation, `steps[${index}].operation`);
  identifier(step.target_ref, `steps[${index}].target_ref`);
  digest(step.pre_state_digest, `steps[${index}].pre_state_digest`);
  digest(step.post_state_digest, `steps[${index}].post_state_digest`);
  uniqueIdentifierArray(step.evidence_refs, `steps[${index}].evidence_refs`, { min: 0, max: 32 });
  if (
    step.effect_class !== 'simulated-state-transition'
    || step.actual_external_effect !== false
  ) {
    throw new ValidationError(`State Fabric simulation step ${step.step_id} attempts an effect outside simulation`);
  }
}

function validateVerification(verification, branch, simulation, simulationDigest) {
  exactObject(verification, 'State Fabric verification', [
    'verification_id',
    'verifier_principal_id',
    'verified_at',
    'simulation_digest',
    'checks',
    'result'
  ]);
  identifier(verification.verification_id, 'verification.verification_id');
  identifier(verification.verifier_principal_id, 'verification.verifier_principal_id');
  digest(verification.simulation_digest, 'verification.simulation_digest');
  const verifiedAt = timestamp(verification.verified_at, 'verification.verified_at');
  const completedAt = timestamp(simulation.completed_at, 'simulation.completed_at');
  const expiresAt = timestamp(branch.expires_at, 'branch.expires_at');
  if (verifiedAt < completedAt || verifiedAt > expiresAt) {
    throw new ValidationError('State Fabric verification must occur after simulation and before branch expiry');
  }
  if (verification.simulation_digest !== simulationDigest) {
    throw new ValidationError('State Fabric verification does not bind the exact simulation');
  }
  if (verification.result !== 'verified') {
    throw new ValidationError('State Fabric verification result must be verified');
  }
  exactVerificationChecks(verification.checks);
  return verification;
}

function validateCommitCandidate(
  candidate,
  branch,
  simulation,
  simulationDigest,
  verificationDigest
) {
  exactObject(candidate, 'State Fabric commit candidate', [
    'candidate_id',
    'requested_action',
    'source_head_digest',
    'source_sequence',
    'simulation_digest',
    'verification_digest',
    'result_state_digest',
    'fresh_authorization_required',
    'fresh_canonical_head_required',
    'direct_commit_allowed',
    'commit_path',
    'authority_effect',
    'external_effect_performed'
  ]);
  identifier(candidate.candidate_id, 'commit_candidate.candidate_id');
  identifier(candidate.requested_action, 'commit_candidate.requested_action');
  digest(candidate.source_head_digest, 'commit_candidate.source_head_digest');
  nonnegativeInteger(candidate.source_sequence, 'commit_candidate.source_sequence');
  digest(candidate.simulation_digest, 'commit_candidate.simulation_digest');
  digest(candidate.verification_digest, 'commit_candidate.verification_digest');
  digest(candidate.result_state_digest, 'commit_candidate.result_state_digest');

  if (
    candidate.source_head_digest !== branch.source_head_digest
    || candidate.source_sequence !== branch.source_sequence
    || candidate.simulation_digest !== simulationDigest
    || candidate.verification_digest !== verificationDigest
    || candidate.result_state_digest !== simulation.result_state_digest
  ) {
    throw new ValidationError('State Fabric commit candidate is not bound to the exact source, simulation, and verification');
  }

  if (
    candidate.fresh_authorization_required !== true
    || candidate.fresh_canonical_head_required !== true
    || candidate.direct_commit_allowed !== false
    || candidate.commit_path !== STATE_FABRIC_COMMIT_PATH
    || candidate.authority_effect !== 'none'
    || candidate.external_effect_performed !== false
  ) {
    throw new ValidationError('State Fabric commit candidate attempts to bypass fresh authority or canonical-head checks');
  }

  return candidate;
}

function exactVerificationChecks(checks) {
  if (!Array.isArray(checks) || checks.length !== STATE_FABRIC_REQUIRED_VERIFICATION_CHECKS.length) {
    throw new ValidationError('State Fabric verification must contain the complete required check set');
  }
  const supplied = new Set(checks);
  if (supplied.size !== checks.length) {
    throw new ValidationError('State Fabric verification checks must be unique');
  }
  for (const check of STATE_FABRIC_REQUIRED_VERIFICATION_CHECKS) {
    if (!supplied.has(check)) {
      throw new ValidationError(`State Fabric verification is missing required check ${check}`);
    }
  }
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const expected = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) throw new ValidationError(`${label} is missing required field ${field}`);
  }
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`${label} must be a bounded identifier`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function boundedString(value, label, min, max) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must be a bounded string`);
  }
  return value;
}

function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !value.endsWith('Z')) {
    throw new ValidationError(`${label} must be a UTC date-time`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${label} must be a valid date-time`);
  }
  return parsed;
}

function uniqueIdentifierArray(value, label, { min, max }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} identifiers`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = identifier(value[index], `${label}[${index}]`);
    if (seen.has(item)) throw new ValidationError(`${label} must not contain duplicates`);
    seen.add(item);
  }
  return value;
}

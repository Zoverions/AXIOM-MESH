import { ValidationError } from './canonical.mjs';

export const AGENT_INFRASTRUCTURE_OFFER_SCHEMA = 'axiom-agent-infrastructure-offer.v1';
export const AGENT_INFRASTRUCTURE_CHALLENGE_SCHEMA = 'axiom-agent-infrastructure-challenge.v1';
export const AGENT_INFRASTRUCTURE_RESULT_SCHEMA = 'axiom-agent-infrastructure-result.v1';
export const AGENT_INFRASTRUCTURE_REPOSITORY = 'Zoverions/AXIOM-MESH';
export const AGENT_INFRASTRUCTURE_MAX_BYTES = 262_144;

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CHALLENGE_CLASSES = new Set([
  'hardware-validation',
  'test-node-provisioning',
  'deployment-reproduction',
  'infrastructure-diagnostics',
  'support-assistance',
  'device-lab-capacity'
]);
const SAFE_OPERATIONS = new Set([
  'read-system-facts',
  'create-disposable-workspace',
  'install-test-dependencies',
  'run-build',
  'run-tests',
  'start-local-test-services',
  'collect-sanitized-logs',
  'collect-benchmark-metrics',
  'reset-disposable-workspace'
]);
const REQUIRED_PROHIBITED_OPERATIONS = Object.freeze([
  'production-node-enrollment',
  'credential-issuance',
  'secret-retrieval',
  'firmware-change',
  'boot-chain-change',
  'disk-erasure',
  'purchase-or-subscription',
  'security-boundary-weakening',
  'unbounded-remote-shell',
  'permanent-system-mutation'
]);
const FACT_STATUSES = new Set(['declared', 'measured', 'reproduced', 'externally-verified']);
const RESULT_STATUSES = new Set(['passed', 'failed', 'partial', 'blocked']);

export function validateAgentInfrastructureOffer(offer) {
  boundedDocument(offer, 'Agent infrastructure offer');
  exactKeys(offer, 'Agent infrastructure offer', [
    'schema', 'offer_id', 'repository', 'publisher', 'node_profile', 'custody',
    'availability', 'challenge_classes', 'evidence', 'boundaries'
  ]);
  if (
    offer.schema !== AGENT_INFRASTRUCTURE_OFFER_SCHEMA
    || !ID.test(offer.offer_id ?? '')
    || offer.repository !== AGENT_INFRASTRUCTURE_REPOSITORY
  ) throw new ValidationError('Agent infrastructure offer identity is invalid');

  exactKeys(offer.publisher, 'Agent infrastructure offer publisher', ['type', 'id']);
  if (!['human', 'machine', 'organization'].includes(offer.publisher.type) || !ID.test(offer.publisher.id ?? '')) {
    throw new ValidationError('Agent infrastructure offer publisher is invalid');
  }
  exactKeys(offer.node_profile, 'Agent infrastructure offer node profile', ['schema', 'profile_id', 'profile_sha256']);
  if (
    offer.node_profile.schema !== 'axiom-compute-node-profile.v1'
    || !ID.test(offer.node_profile.profile_id ?? '')
    || !SHA256.test(offer.node_profile.profile_sha256 ?? '')
  ) throw new ValidationError('Agent infrastructure offer node profile binding is invalid');

  exactKeys(offer.custody, 'Agent infrastructure offer custody', ['physical_control', 'remote_access_available']);
  if (
    !['contributor', 'organization', 'shared-lab', 'unknown'].includes(offer.custody.physical_control)
    || typeof offer.custody.remote_access_available !== 'boolean'
  ) throw new ValidationError('Agent infrastructure offer custody is invalid');

  exactKeys(offer.availability, 'Agent infrastructure offer availability', ['starts_at', 'expires_at', 'maximum_sessions']);
  const startsAt = parseDate(offer.availability.starts_at, 'Agent infrastructure offer starts_at');
  const expiresAt = parseDate(offer.availability.expires_at, 'Agent infrastructure offer expires_at');
  if (expiresAt <= startsAt || !Number.isSafeInteger(offer.availability.maximum_sessions) || offer.availability.maximum_sessions < 1 || offer.availability.maximum_sessions > 1000) {
    throw new ValidationError('Agent infrastructure offer availability is invalid');
  }

  setArray(offer.challenge_classes, 'Agent infrastructure offer challenge classes', CHALLENGE_CLASSES, { min: 1, max: 6 });
  exactKeys(offer.evidence, 'Agent infrastructure offer evidence', ['fact_status', 'evidence_refs']);
  if (!FACT_STATUSES.has(offer.evidence.fact_status)) throw new ValidationError('Agent infrastructure offer evidence status is invalid');
  boundedRefs(offer.evidence.evidence_refs, 'Agent infrastructure offer evidence refs', 64, { allowEmpty: true });
  assertFalseBoundary(offer.boundaries, 'Agent infrastructure offer boundaries', [
    'destructive_actions_allowed',
    'production_enrollment_allowed',
    'credential_issuance_allowed',
    'secret_access_allowed',
    'firmware_changes_allowed',
    'purchases_allowed',
    'authority_granted',
    'payment_promised'
  ]);

  return Object.freeze({ valid: true, offer_id: offer.offer_id, profile_sha256: offer.node_profile.profile_sha256, authority_granted: false });
}

export function validateAgentInfrastructureChallenge(challenge, { offer, expectedBaseSha } = {}) {
  boundedDocument(challenge, 'Agent infrastructure challenge');
  exactKeys(challenge, 'Agent infrastructure challenge', [
    'schema', 'challenge_id', 'repository', 'base_sha', 'class', 'target', 'plan',
    'acceptance', 'evidence_requirements', 'security_reporting', 'boundaries', 'expires_at'
  ]);
  if (
    challenge.schema !== AGENT_INFRASTRUCTURE_CHALLENGE_SCHEMA
    || !ID.test(challenge.challenge_id ?? '')
    || challenge.repository !== AGENT_INFRASTRUCTURE_REPOSITORY
    || !SHA40.test(challenge.base_sha ?? '')
    || !CHALLENGE_CLASSES.has(challenge.class)
  ) throw new ValidationError('Agent infrastructure challenge identity is invalid');
  if (expectedBaseSha !== undefined && challenge.base_sha !== expectedBaseSha) {
    throw new ValidationError('Agent infrastructure challenge has a stale base SHA');
  }

  exactKeys(challenge.target, 'Agent infrastructure challenge target', ['offer_id', 'node_profile_sha256']);
  if (!ID.test(challenge.target.offer_id ?? '') || !SHA256.test(challenge.target.node_profile_sha256 ?? '')) {
    throw new ValidationError('Agent infrastructure challenge target is invalid');
  }
  if (offer) {
    validateAgentInfrastructureOffer(offer);
    if (
      challenge.target.offer_id !== offer.offer_id
      || challenge.target.node_profile_sha256 !== offer.node_profile.profile_sha256
      || !offer.challenge_classes.includes(challenge.class)
    ) throw new ValidationError('Agent infrastructure challenge does not match the offered hardware scope');
  }

  exactKeys(challenge.plan, 'Agent infrastructure challenge plan', ['allowed_operations', 'prohibited_operations', 'network']);
  setArray(challenge.plan.allowed_operations, 'Agent infrastructure challenge allowed operations', SAFE_OPERATIONS, { min: 1, max: 16 });
  if (!Array.isArray(challenge.plan.prohibited_operations)) {
    throw new ValidationError('Agent infrastructure challenge prohibited operations are invalid');
  }
  const prohibited = new Set(challenge.plan.prohibited_operations);
  if (prohibited.size !== challenge.plan.prohibited_operations.length || REQUIRED_PROHIBITED_OPERATIONS.some(item => !prohibited.has(item))) {
    throw new ValidationError('Agent infrastructure challenge must prohibit every consequential v1 operation');
  }
  exactKeys(challenge.plan.network, 'Agent infrastructure challenge network', ['mode', 'allowed_origins', 'credentials_allowed']);
  if (!['none', 'bounded-public-read', 'owner-lan'].includes(challenge.plan.network.mode) || challenge.plan.network.credentials_allowed !== false) {
    throw new ValidationError('Agent infrastructure challenge network boundary is invalid');
  }
  boundedRefs(challenge.plan.network.allowed_origins, 'Agent infrastructure challenge allowed origins', 32, { allowEmpty: true });
  if (challenge.plan.network.mode === 'none' && challenge.plan.network.allowed_origins.length !== 0) {
    throw new ValidationError('Agent infrastructure challenge none network mode cannot name origins');
  }

  boundedTexts(challenge.acceptance, 'Agent infrastructure challenge acceptance', 64);
  boundedTexts(challenge.evidence_requirements, 'Agent infrastructure challenge evidence requirements', 64);
  exactKeys(challenge.security_reporting, 'Agent infrastructure challenge security reporting', ['public_safe', 'private_route']);
  if (typeof challenge.security_reporting.public_safe !== 'boolean' || challenge.security_reporting.private_route !== 'SECURITY.md') {
    throw new ValidationError('Agent infrastructure challenge security reporting is invalid');
  }
  assertFalseBoundary(challenge.boundaries, 'Agent infrastructure challenge boundaries', [
    'production_enrollment_allowed',
    'credential_issuance_allowed',
    'secret_access_allowed',
    'firmware_changes_allowed',
    'purchases_allowed',
    'destructive_actions_allowed',
    'authority_granted',
    'payment_promised'
  ]);
  parseDate(challenge.expires_at, 'Agent infrastructure challenge expires_at');

  return Object.freeze({ valid: true, challenge_id: challenge.challenge_id, base_sha: challenge.base_sha, authority_granted: false });
}

export function validateAgentInfrastructureResult(result, { challenge, offer, verifierConfirmed = false } = {}) {
  boundedDocument(result, 'Agent infrastructure result');
  exactKeys(result, 'Agent infrastructure result', [
    'schema', 'result_id', 'challenge_id', 'offer_id', 'repository', 'base_sha',
    'node_profile_sha256', 'execution', 'evidence', 'effects', 'limitations', 'producer'
  ]);
  if (
    result.schema !== AGENT_INFRASTRUCTURE_RESULT_SCHEMA
    || !ID.test(result.result_id ?? '')
    || !ID.test(result.challenge_id ?? '')
    || !ID.test(result.offer_id ?? '')
    || result.repository !== AGENT_INFRASTRUCTURE_REPOSITORY
    || !SHA40.test(result.base_sha ?? '')
    || !SHA256.test(result.node_profile_sha256 ?? '')
  ) throw new ValidationError('Agent infrastructure result identity is invalid');

  if (offer) {
    validateAgentInfrastructureOffer(offer);
    if (result.offer_id !== offer.offer_id || result.node_profile_sha256 !== offer.node_profile.profile_sha256) {
      throw new ValidationError('Agent infrastructure result does not match the offered hardware');
    }
  }
  if (challenge) {
    validateAgentInfrastructureChallenge(challenge, { offer });
    if (
      result.challenge_id !== challenge.challenge_id
      || result.offer_id !== challenge.target.offer_id
      || result.repository !== challenge.repository
      || result.base_sha !== challenge.base_sha
      || result.node_profile_sha256 !== challenge.target.node_profile_sha256
    ) throw new ValidationError('Agent infrastructure result does not bind the exact challenge');
  }

  exactKeys(result.execution, 'Agent infrastructure result execution', ['started_at', 'completed_at', 'status', 'operations_performed']);
  const startedAt = parseDate(result.execution.started_at, 'Agent infrastructure result started_at');
  const completedAt = parseDate(result.execution.completed_at, 'Agent infrastructure result completed_at');
  if (completedAt < startedAt || !RESULT_STATUSES.has(result.execution.status)) {
    throw new ValidationError('Agent infrastructure result execution is invalid');
  }
  setArray(result.execution.operations_performed, 'Agent infrastructure result operations', SAFE_OPERATIONS, { min: 0, max: 16 });
  if (challenge) {
    const allowed = new Set(challenge.plan.allowed_operations);
    if (result.execution.operations_performed.some(operation => !allowed.has(operation))) {
      throw new ValidationError('Agent infrastructure result contains an operation not authorized by the challenge');
    }
  }

  exactKeys(result.evidence, 'Agent infrastructure result evidence', ['fact_status', 'evidence_refs', 'logs_redacted', 'secrets_embedded', 'private_user_content_embedded']);
  if (
    !FACT_STATUSES.has(result.evidence.fact_status)
    || result.evidence.logs_redacted !== true
    || result.evidence.secrets_embedded !== false
    || result.evidence.private_user_content_embedded !== false
  ) throw new ValidationError('Agent infrastructure result evidence boundary is invalid');
  boundedRefs(result.evidence.evidence_refs, 'Agent infrastructure result evidence refs', 128, { allowEmpty: false });

  assertFalseBoundary(result.effects, 'Agent infrastructure result effects', [
    'production_enrolled',
    'credentials_issued',
    'secrets_accessed',
    'firmware_changed',
    'purchase_performed',
    'destructive_action_performed',
    'security_boundary_weakened',
    'authority_granted',
    'capability_promoted'
  ]);
  if (!Array.isArray(result.limitations) || result.limitations.length > 64) {
    throw new ValidationError('Agent infrastructure result limitations are invalid');
  }
  for (const limitation of result.limitations) boundedText(limitation, 'Agent infrastructure result limitation');

  exactKeys(result.producer, 'Agent infrastructure result producer', ['type', 'id', 'attestation_ref', 'verification_status']);
  if (
    !['human', 'machine', 'joint'].includes(result.producer.type)
    || !ID.test(result.producer.id ?? '')
    || !boundedString(result.producer.attestation_ref, 1024)
    || !['unverified', 'verified-by-challenge-verifier'].includes(result.producer.verification_status)
  ) throw new ValidationError('Agent infrastructure result producer is invalid');
  if (result.producer.verification_status === 'verified-by-challenge-verifier' && verifierConfirmed !== true) {
    throw new ValidationError('Agent infrastructure result cannot self-assert independent verifier confirmation');
  }

  return Object.freeze({
    valid: true,
    result_id: result.result_id,
    status: result.execution.status,
    verification_status: result.producer.verification_status,
    authority_granted: false,
    capability_promoted: false
  });
}

function boundedDocument(value, label) {
  if (!plainObject(value)) throw new ValidationError(`${label} must be an object`);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > AGENT_INFRASTRUCTURE_MAX_BYTES) {
    throw new ValidationError(`${label} exceeds the maximum encoded size`);
  }
}

function assertFalseBoundary(value, label, keys) {
  exactKeys(value, label, keys);
  for (const key of keys) if (value[key] !== false) throw new ValidationError(`${label} cannot elevate ${key}`);
}

function setArray(value, label, allowed, { min, max }) {
  if (!Array.isArray(value) || value.length < min || value.length > max || new Set(value).size !== value.length) {
    throw new ValidationError(`${label} are invalid`);
  }
  for (const item of value) if (!allowed.has(item)) throw new ValidationError(`${label} contains unsupported value: ${item}`);
}

function boundedTexts(value, label, max) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) throw new ValidationError(`${label} are invalid`);
  for (const item of value) boundedText(item, label);
}

function boundedText(value, label) {
  if (!boundedString(value, 8000) || value.includes('\0')) throw new ValidationError(`${label} is invalid`);
}

function boundedRefs(value, label, max, { allowEmpty }) {
  if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > max || new Set(value).size !== value.length) {
    throw new ValidationError(`${label} are invalid`);
  }
  for (const item of value) if (!boundedString(item, 1024) || item.includes('\0')) throw new ValidationError(`${label} contains an invalid reference`);
}

function parseDate(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(`${label} is invalid`);
  return parsed;
}

function exactKeys(value, label, keys) {
  if (!plainObject(value)) throw new ValidationError(`${label} must be an object`);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field: ${key}`);
}

function boundedString(value, max) {
  return typeof value === 'string' && value.length >= 1 && value.length <= max;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

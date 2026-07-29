import { createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './lib/canonical.mjs';
import { verifyObjectSignature } from './lib/identity.mjs';

export const PILOT_POLICY_SCHEMA = 'axiom-pilot-review-policy.v1';
export const PILOT_DOSSIER_SCHEMA = 'axiom-pilot-deployment-dossier.v1';
export const PILOT_APPROVAL_SCHEMA = 'axiom-pilot-dossier-approval.v1';

export const PILOT_REVIEW_ROLES = Object.freeze([
  'release_manager',
  'platform_operator',
  'security_reviewer',
  'data_recovery_reviewer',
  'independent_reviewer'
]);

export const PILOT_EVIDENCE_TYPES = Object.freeze([
  'deployment_manifest',
  'image_provenance',
  'availability_observation',
  'capacity_measurement',
  'external_telemetry',
  'provider_assessment',
  'custody_assessment',
  'scheduled_restore',
  'credential_rotation',
  'data_key_rotation',
  'credential_history_attestations',
  'incident_tabletop',
  'independent_security_review'
]);

export const PILOT_EVIDENCE_SCHEMAS = Object.freeze({
  deployment_manifest: 'axiom-pilot-deployment-manifest.v2',
  image_provenance: 'axiom-pilot-image-provenance.v2',
  availability_observation: 'axiom-pilot-availability-evidence.v2',
  capacity_measurement: 'axiom-pilot-capacity-evidence.v2',
  external_telemetry: 'axiom-pilot-telemetry-evidence.v2',
  provider_assessment: 'axiom-pilot-provider-assessment.v2',
  custody_assessment: 'axiom-pilot-custody-assessment.v2',
  scheduled_restore: 'axiom-pilot-scheduled-restore-evidence.v2',
  credential_rotation: 'axiom-pilot-credential-rotation-evidence.v2',
  data_key_rotation: 'axiom-pilot-data-key-rotation-evidence.v2',
  credential_history_attestations:
    'axiom-pilot-credential-history-attestations.v2',
  incident_tabletop: 'axiom-pilot-incident-tabletop-evidence.v2',
  independent_security_review:
    'axiom-pilot-independent-security-review.v2'
});

export const PILOT_CUSTODY_CONTROLS = Object.freeze([
  'data_protection_key',
  'transport_ca',
  'service_identities',
  'provider_secret_signer',
  'provider_policy_signer'
]);

export const PILOT_TRUST_ROOTS = Object.freeze([
  'grid',
  'transport_ca',
  'provider_secret',
  'provider_policy'
]);

const SERVICE_UNITS = Object.freeze(['gateway', 'grid', 'hypervisor', 'sandbox']);
const IDENTIFIER = /^[a-z][a-z0-9_-]{2,95}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const KEY_ID = /^[a-z][a-z0-9-]{0,63}:[a-f0-9]{16}$/;
const MAX_POLICY_MILLISECONDS = 120 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MILLISECONDS = 5 * 60 * 1000;
const FORBIDDEN_SECRET_KEYS = new Set([
  'api_key',
  'credential',
  'credential_value',
  'data_key',
  'key_material',
  'password',
  'passphrase',
  'private_key',
  'private_key_pem',
  'secret',
  'secret_value',
  'token'
]);
const CRYPTOGRAPHIC_VALUE_KEYS = new Set([
  'digest',
  'image_digest',
  'receipt_sha256',
  'sha256',
  'signature'
]);

export function validatePilotReviewPolicy(
  policy,
  authorityPublicKey,
  { now = Date.now() } = {}
) {
  exactObject(policy, 'Pilot review policy', [
    'schema',
    'version',
    'policy_id',
    'issued_at',
    'expires_at',
    'build',
    'requirements',
    'reviewers',
    'authority',
    'attestation'
  ]);
  if (
    policy.schema !== PILOT_POLICY_SCHEMA
    || policy.version !== 1
    || !IDENTIFIER.test(policy.policy_id ?? '')
  ) throw new ValidationError('Pilot review policy identity is invalid');

  const issuedAt = timestamp(policy.issued_at, 'Pilot policy issued_at');
  const expiresAt = timestamp(policy.expires_at, 'Pilot policy expires_at');
  if (
    issuedAt > now + CLOCK_SKEW_MILLISECONDS
    || expiresAt <= now
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > MAX_POLICY_MILLISECONDS
  ) throw new ValidationError('Pilot review policy is not currently valid');

  validateBuild(policy.build, 'Pilot review policy build');
  validateRequirements(policy.requirements);

  if (
    !Array.isArray(policy.reviewers)
    || canonicalJson(policy.reviewers.map(item => item?.role))
      !== canonicalJson(PILOT_REVIEW_ROLES)
  ) throw new ValidationError('Pilot review policy reviewer roles are incomplete or unordered');

  const reviewerIds = new Set();
  const reviewerKeys = new Set();
  for (const reviewer of policy.reviewers) {
    exactObject(reviewer, `Pilot reviewer ${reviewer?.role ?? 'unknown'}`, [
      'role',
      'reviewer_id',
      'key_id',
      'public_key_pem'
    ]);
    if (
      !PILOT_REVIEW_ROLES.includes(reviewer.role)
      || !IDENTIFIER.test(reviewer.reviewer_id ?? '')
      || !KEY_ID.test(reviewer.key_id ?? '')
      || reviewerIds.has(reviewer.reviewer_id)
      || reviewerKeys.has(reviewer.key_id)
    ) throw new ValidationError('Pilot reviewers must have distinct valid identities');
    const publicKey = parsePublicKey(
      reviewer.public_key_pem,
      `Pilot reviewer ${reviewer.role}`
    );
    const exported = publicKey.export({ type: 'spki', format: 'pem' });
    if (!reviewer.key_id.endsWith(`:${sha256(exported).slice(0, 16)}`)) {
      throw new ValidationError(`Pilot reviewer key id does not match its public key: ${reviewer.role}`);
    }
    const fingerprint = sha256(exported);
    if (reviewerKeys.has(fingerprint)) {
      throw new ValidationError('Pilot reviewers may not reuse a signing key');
    }
    reviewerIds.add(reviewer.reviewer_id);
    reviewerKeys.add(reviewer.key_id);
    reviewerKeys.add(fingerprint);
  }

  exactObject(policy.authority, 'Pilot policy authority', ['key_id']);
  if (
    !KEY_ID.test(policy.authority.key_id ?? '')
    || reviewerKeys.has(policy.authority.key_id)
  ) throw new ValidationError('Pilot policy authority identity is invalid or reused');

  const authorityKey = parsePublicKey(authorityPublicKey, 'Pilot policy authority');
  const authorityPem = authorityKey.export({ type: 'spki', format: 'pem' });
  if (
    !policy.authority.key_id.endsWith(`:${sha256(authorityPem).slice(0, 16)}`)
    || reviewerKeys.has(sha256(authorityPem))
  ) throw new ValidationError('Pilot policy authority key is untrusted or reused');

  const unsigned = structuredClone(policy);
  delete unsigned.attestation;
  validateAttestation(policy.attestation, 'Pilot policy attestation');
  if (
    policy.attestation?.key_id !== policy.authority.key_id
    || !verifyObjectSignature(unsigned, policy.attestation, authorityKey)
  ) throw new ValidationError('Pilot review policy authority signature is invalid');

  return {
    valid: true,
    schema: policy.schema,
    policy_id: policy.policy_id,
    policy_digest: digestObject(policy),
    reviewer_roles: policy.reviewers.length
  };
}

export function verifyPilotDossier(
  dossier,
  policy,
  authorityPublicKey,
  { now = Date.now() } = {}
) {
  validatePilotReviewPolicy(policy, authorityPublicKey, { now });
  assertPilotSecretFree(dossier);
  exactObject(dossier, 'Pilot dossier', [
    'schema',
    'version',
    'dossier_id',
    'policy_id',
    'claim',
    'generated_at',
    'build',
    'deployment',
    'observation',
    'measurements',
    'trust_roots',
    'custody',
    'evidence',
    'approvals'
  ]);
  if (
    dossier.schema !== PILOT_DOSSIER_SCHEMA
    || dossier.version !== 1
    || !IDENTIFIER.test(dossier.dossier_id ?? '')
    || dossier.policy_id !== policy.policy_id
    || dossier.claim !== 'pilot-evidence-submitted-for-review'
  ) throw new ValidationError('Pilot dossier identity or claim is invalid');

  validateBuild(dossier.build, 'Pilot dossier build');
  if (canonicalJson(dossier.build) !== canonicalJson(policy.build)) {
    throw new ValidationError('Pilot dossier build is not the policy-pinned build');
  }

  const generatedAt = timestamp(dossier.generated_at, 'Pilot dossier generated_at');
  if (generatedAt > now + CLOCK_SKEW_MILLISECONDS) {
    throw new ValidationError('Pilot dossier generation time is in the future');
  }
  const observation = validateObservation(dossier.observation, policy.requirements);
  if (
    generatedAt < observation.endedAt
    || generatedAt - observation.endedAt
      > policy.requirements.evidence_max_age_days * 24 * 60 * 60 * 1000
  ) throw new ValidationError('Pilot dossier is stale or predates its observation');

  validateDeployment(dossier.deployment, observation.startedAt);
  validateMeasurements(dossier.measurements, policy.requirements);
  validateTrustRoots(dossier.trust_roots);
  validateCustody(
    dossier.custody,
    observation.startedAt,
    generatedAt
  );
  validateEvidence(
    dossier.evidence,
    dossier.build,
    policy.requirements,
    observation.startedAt,
    generatedAt
  );
  validateApprovals(
    dossier,
    policy,
    observation.endedAt,
    generatedAt
  );

  return {
    valid: true,
    schema: dossier.schema,
    dossier_id: dossier.dossier_id,
    policy_id: policy.policy_id,
    source_revision: dossier.build.source_revision,
    image_digest: dossier.build.image_digest,
    evidence_items: dossier.evidence.length,
    reviewer_approvals: dossier.approvals.length,
    intake_status: 'accepted-for-promotion-review',
    production_promoted: false
  };
}

export function pilotDossierDigest(dossier) {
  const unsigned = structuredClone(dossier);
  delete unsigned.approvals;
  return digestObject(unsigned);
}

export function pilotApprovalPayload(dossier, approval) {
  return {
    schema: PILOT_APPROVAL_SCHEMA,
    dossier_id: dossier.dossier_id,
    dossier_digest: pilotDossierDigest(dossier),
    role: approval.role,
    reviewer_id: approval.reviewer_id,
    decision: approval.decision,
    signed_at: approval.signed_at
  };
}

function validateRequirements(requirements) {
  exactObject(requirements, 'Pilot review requirements', [
    'minimum_observation_hours',
    'minimum_availability_percent',
    'minimum_successful_intents',
    'maximum_p95_intent_latency_ms',
    'maximum_backup_rpo_minutes',
    'maximum_restore_rto_minutes',
    'maximum_critical_alert_ack_minutes',
    'expected_deprecated_history_entries',
    'evidence_max_age_days',
    'required_evidence'
  ]);
  if (
    !positiveInteger(requirements.minimum_observation_hours)
    || requirements.minimum_observation_hours < 720
    || !boundedNumber(requirements.minimum_availability_percent, 99.5, 100)
    || !positiveInteger(requirements.minimum_successful_intents)
    || requirements.minimum_successful_intents < 1_000
    || !positiveInteger(requirements.maximum_p95_intent_latency_ms)
    || requirements.maximum_p95_intent_latency_ms > 2_000
    || !positiveInteger(requirements.maximum_backup_rpo_minutes)
    || requirements.maximum_backup_rpo_minutes > 1_440
    || !positiveInteger(requirements.maximum_restore_rto_minutes)
    || requirements.maximum_restore_rto_minutes > 240
    || !positiveInteger(requirements.maximum_critical_alert_ack_minutes)
    || requirements.maximum_critical_alert_ack_minutes > 30
    || requirements.expected_deprecated_history_entries !== 32
    || !positiveInteger(requirements.evidence_max_age_days)
    || requirements.evidence_max_age_days > 30
    || canonicalJson(requirements.required_evidence) !== canonicalJson(PILOT_EVIDENCE_TYPES)
  ) throw new ValidationError('Pilot review requirements weaken the current promotion gates');
}

function validateBuild(build, name) {
  exactObject(build, name, ['kernel_version', 'source_revision', 'image_digest']);
  if (
    !SEMVER.test(build.kernel_version ?? '')
    || !REVISION.test(build.source_revision ?? '')
    || !DIGEST.test(build.image_digest ?? '')
  ) throw new ValidationError(`${name} is invalid`);
}

function validateDeployment(deployment, observationStartedAt) {
  exactObject(deployment, 'Pilot deployment', [
    'deployment_id',
    'environment',
    'platform',
    'region',
    'deployed_at',
    'topology',
    'service_units',
    'non_public',
    'public_ingress',
    'deny_egress',
    'resource_limits_enforced',
    'pilot_owned_receivers',
    'actual_provider_adapter',
    'scheduled_restore_from_pilot_media'
  ]);
  const deployedAt = timestamp(deployment.deployed_at, 'Pilot deployment deployed_at');
  if (
    !IDENTIFIER.test(deployment.deployment_id ?? '')
    || !IDENTIFIER.test(deployment.platform ?? '')
    || !IDENTIFIER.test(deployment.region ?? '')
    || deployment.environment !== 'isolated-non-public-pilot'
    || deployment.topology !== 'independent-service-units'
    || canonicalJson(deployment.service_units) !== canonicalJson(SERVICE_UNITS)
    || deployedAt > observationStartedAt
    || deployment.non_public !== true
    || deployment.public_ingress !== false
    || deployment.deny_egress !== true
    || deployment.resource_limits_enforced !== true
    || deployment.pilot_owned_receivers !== true
    || deployment.actual_provider_adapter !== true
    || deployment.scheduled_restore_from_pilot_media !== true
  ) throw new ValidationError('Pilot deployment boundary is incomplete');
}

function validateObservation(observation, requirements) {
  exactObject(observation, 'Pilot observation', [
    'started_at',
    'ended_at',
    'duration_hours',
    'continuous'
  ]);
  const startedAt = timestamp(observation.started_at, 'Pilot observation started_at');
  const endedAt = timestamp(observation.ended_at, 'Pilot observation ended_at');
  const durationHours = (endedAt - startedAt) / (60 * 60 * 1000);
  if (
    endedAt <= startedAt
    || observation.duration_hours !== durationHours
    || durationHours < requirements.minimum_observation_hours
    || observation.continuous !== true
  ) throw new ValidationError('Pilot observation window is insufficient');
  return { startedAt, endedAt };
}

function validateMeasurements(measurements, requirements) {
  exactObject(measurements, 'Pilot measurements', [
    'availability_percent',
    'successful_intents',
    'failed_intents',
    'p95_intent_latency_ms',
    'acknowledged_mutation_evidence_loss',
    'backup_rpo_minutes',
    'restore_rto_minutes',
    'critical_alert_ack_minutes',
    'deprecated_history_entries_disposed'
  ]);
  const totalIntents = measurements.successful_intents + measurements.failed_intents;
  const successPercent = (measurements.successful_intents / totalIntents) * 100;
  if (
    !boundedNumber(
      measurements.availability_percent,
      requirements.minimum_availability_percent,
      100
    )
    || !positiveInteger(measurements.successful_intents)
    || measurements.successful_intents < requirements.minimum_successful_intents
    || !nonNegativeInteger(measurements.failed_intents)
    || !Number.isFinite(successPercent)
    || successPercent < requirements.minimum_availability_percent
    || !positiveInteger(measurements.p95_intent_latency_ms)
    || measurements.p95_intent_latency_ms
      > requirements.maximum_p95_intent_latency_ms
    || measurements.acknowledged_mutation_evidence_loss !== 0
    || !nonNegativeInteger(measurements.backup_rpo_minutes)
    || measurements.backup_rpo_minutes > requirements.maximum_backup_rpo_minutes
    || !positiveInteger(measurements.restore_rto_minutes)
    || measurements.restore_rto_minutes > requirements.maximum_restore_rto_minutes
    || !positiveInteger(measurements.critical_alert_ack_minutes)
    || measurements.critical_alert_ack_minutes
      > requirements.maximum_critical_alert_ack_minutes
    || measurements.deprecated_history_entries_disposed
      !== requirements.expected_deprecated_history_entries
  ) throw new ValidationError('Pilot measurements do not meet the policy');
}

function validateTrustRoots(trustRoots) {
  if (
    !Array.isArray(trustRoots)
    || canonicalJson(trustRoots.map(item => item?.type))
      !== canonicalJson(PILOT_TRUST_ROOTS)
  ) throw new ValidationError('Pilot trust-root inventory is incomplete or unordered');
  const digests = new Set();
  for (const root of trustRoots) {
    exactObject(root, `Pilot trust root ${root?.type ?? 'unknown'}`, ['type', 'digest']);
    if (!DIGEST.test(root.digest ?? '') || digests.has(root.digest)) {
      throw new ValidationError('Pilot trust roots must be valid and distinct');
    }
    digests.add(root.digest);
  }
}

function validateCustody(custody, startedAt, generatedAt) {
  if (
    !Array.isArray(custody)
    || canonicalJson(custody.map(item => item?.control))
      !== canonicalJson(PILOT_CUSTODY_CONTROLS)
  ) throw new ValidationError('Pilot custody inventory is incomplete or unordered');
  const receipts = new Set();
  for (const item of custody) {
    exactObject(item, `Pilot custody ${item?.control ?? 'unknown'}`, [
      'control',
      'backend',
      'custodian',
      'workload_identity',
      'exportable',
      'rotation_observed',
      'receipt_reference',
      'receipt_sha256',
      'observed_at'
    ]);
    const observedAt = timestamp(item.observed_at, `Pilot custody ${item.control} observed_at`);
    if (
      !IDENTIFIER.test(item.backend ?? '')
      || !IDENTIFIER.test(item.custodian ?? '')
      || !IDENTIFIER.test(item.workload_identity ?? '')
      || item.exportable !== false
      || item.rotation_observed !== true
      || !safeReference(item.receipt_reference)
      || !DIGEST.test(item.receipt_sha256 ?? '')
      || receipts.has(item.receipt_sha256)
      || observedAt < startedAt
      || observedAt > generatedAt
    ) throw new ValidationError(`Pilot custody evidence is invalid: ${item.control}`);
    receipts.add(item.receipt_sha256);
  }
}

function validateEvidence(evidence, build, requirements, startedAt, generatedAt) {
  if (
    !Array.isArray(evidence)
    || canonicalJson(evidence.map(item => item?.type))
      !== canonicalJson(requirements.required_evidence)
  ) throw new ValidationError('Pilot evidence inventory is incomplete or unordered');
  const digests = new Set();
  for (const item of evidence) {
    exactObject(item, `Pilot evidence ${item?.type ?? 'unknown'}`, [
      'type',
      'schema',
      'reference',
      'sha256',
      'source_revision',
      'image_digest',
      'observed_at',
      'disposition',
      'independently_verified'
    ]);
    const observedAt = timestamp(item.observed_at, `Pilot evidence ${item.type} observed_at`);
    if (
      item.schema !== PILOT_EVIDENCE_SCHEMAS[item.type]
      || !safeReference(item.reference)
      || !DIGEST.test(item.sha256 ?? '')
      || digests.has(item.sha256)
      || item.source_revision !== build.source_revision
      || item.image_digest !== build.image_digest
      || observedAt < startedAt
      || observedAt > generatedAt
      || item.disposition !== 'passed'
      || item.independently_verified !== true
    ) throw new ValidationError(`Pilot evidence item is invalid: ${item.type}`);
    digests.add(item.sha256);
  }
}

function validateApprovals(dossier, policy, observationEndedAt, generatedAt) {
  if (
    !Array.isArray(dossier.approvals)
    || canonicalJson(dossier.approvals.map(item => item?.role))
      !== canonicalJson(PILOT_REVIEW_ROLES)
  ) throw new ValidationError('Pilot dossier approvals are incomplete or unordered');
  const dossierDigest = pilotDossierDigest(dossier);
  for (let index = 0; index < PILOT_REVIEW_ROLES.length; index += 1) {
    const approval = dossier.approvals[index];
    const reviewer = policy.reviewers[index];
    exactObject(approval, `Pilot approval ${approval?.role ?? 'unknown'}`, [
      'role',
      'reviewer_id',
      'decision',
      'signed_at',
      'attestation'
    ]);
    const signedAt = timestamp(approval.signed_at, `Pilot approval ${approval.role} signed_at`);
    const payload = pilotApprovalPayload(dossier, approval);
    validateAttestation(
      approval.attestation,
      `Pilot approval ${approval.role} attestation`
    );
    if (
      approval.role !== reviewer.role
      || approval.reviewer_id !== reviewer.reviewer_id
      || approval.decision !== 'approved-for-promotion-review'
      || signedAt < observationEndedAt
      || signedAt > generatedAt
      || payload.dossier_digest !== dossierDigest
      || approval.attestation?.key_id !== reviewer.key_id
      || !verifyObjectSignature(
        payload,
        approval.attestation,
        parsePublicKey(reviewer.public_key_pem, `Pilot reviewer ${reviewer.role}`)
      )
    ) throw new ValidationError(`Pilot approval is invalid: ${reviewer.role}`);
  }
}

export function assertPilotSecretFree(value) {
  const serialized = JSON.stringify(value);
  if (
    /-----BEGIN (?:ENCRYPTED )?PRIVATE KEY-----/.test(serialized)
    || /(?:^|[^A-Za-z])Bearer [A-Za-z0-9._~+/-]{8,}/i.test(serialized)
  ) throw new ValidationError('Pilot dossier contains secret material');
  visit(value, []);
}

function visit(value, path) {
  if (typeof value === 'string') {
    const key = path.at(-1)?.toLowerCase();
    if (
      !CRYPTOGRAPHIC_VALUE_KEYS.has(key)
      && /(?:^|[^A-Za-z0-9])(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/.test(value)
    ) throw new ValidationError(`Pilot dossier contains secret material: ${path.join('.')}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, [...path, String(index)]));
    return;
  }
  if (!plainObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_SECRET_KEYS.has(key.toLowerCase())) {
      throw new ValidationError(`Pilot dossier contains a forbidden secret field: ${[...path, key].join('.')}`);
    }
    visit(item, [...path, key]);
  }
}

function parsePublicKey(input, name) {
  if (
    typeof input !== 'string'
    || !input.includes('-----BEGIN PUBLIC KEY-----')
    || input.includes('PRIVATE KEY')
  ) throw new ValidationError(`${name} public key is invalid`);
  try {
    const key = createPublicKey(input);
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error('not Ed25519');
    }
    return key;
  } catch {
    throw new ValidationError(`${name} public key is invalid`);
  }
}

function exactObject(value, name, keys) {
  if (
    !plainObject(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}

function timestamp(value, name) {
  if (typeof value !== 'string') throw new ValidationError(`${name} is invalid`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new ValidationError(`${name} is invalid`);
  }
  return parsed;
}

function safeReference(value) {
  return (
    typeof value === 'string'
    && value.length >= 3
    && value.length <= 512
    && !/[\r\n]/.test(value)
    && !/[?#]/.test(value)
    && !/:\/\/[^/]*@/.test(value)
  );
}

function validateAttestation(attestation, name) {
  exactObject(attestation, name, [
    'algorithm',
    'key_id',
    'digest',
    'signature'
  ]);
  if (
    attestation.algorithm !== 'Ed25519'
    || !KEY_ID.test(attestation.key_id ?? '')
    || !/^[a-f0-9]{64}$/.test(attestation.digest ?? '')
    || !/^[A-Za-z0-9_-]{80,128}$/.test(attestation.signature ?? '')
  ) throw new ValidationError(`${name} is invalid`);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function boundedNumber(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function main() {
  const [command, dossierPath, policyPath, authorityKeyPath] = process.argv.slice(2);
  if (
    command !== 'verify'
    || !dossierPath
    || !policyPath
    || !authorityKeyPath
    || process.argv.length !== 6
  ) {
    throw new ValidationError(
      'Usage: node src/pilot-dossier.mjs verify <dossier.json> <policy.json> <authority-public.pem>'
    );
  }
  const [dossier, policy, authorityPublicKey] = await Promise.all([
    readJson(dossierPath, 'Pilot dossier'),
    readJson(policyPath, 'Pilot review policy'),
    readFile(authorityKeyPath, 'utf8')
  ]);
  process.stdout.write(`${JSON.stringify(
    verifyPilotDossier(dossier, policy, authorityPublicKey),
    null,
    2
  )}\n`);
}

async function readJson(path, name) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new ValidationError(`${name} cannot be read`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

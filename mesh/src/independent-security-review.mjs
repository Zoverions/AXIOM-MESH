import { createPublicKey } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './lib/canonical.mjs';
import { verifyObjectSignature } from './lib/identity.mjs';

export const SECURITY_REVIEW_POLICY_SCHEMA =
  'axiom-independent-security-review-policy.v1';
export const SECURITY_REVIEW_LEDGER_SCHEMA =
  'axiom-independent-security-review-findings.v1';
export const SECURITY_REVIEW_EXCEPTION_SCHEMA =
  'axiom-independent-security-review-exception-approval.v1';

export const SECURITY_REVIEW_SCOPE = Object.freeze([
  'authentication-authorization',
  'container-policy',
  'credential-trust',
  'evidence-integrity',
  'kernel',
  'provider-boundary',
  'recovery-rotation',
  'release-governance'
]);

export const SECURITY_REVIEW_ARTIFACT_TYPES = Object.freeze([
  'capability_registry',
  'container_policy',
  'deployment_policy',
  'kernel_source',
  'pilot_evidence_contract',
  'release_verifier',
  'security_policy',
  'threat_model'
]);

export const SECURITY_REVIEW_SEVERITIES = Object.freeze([
  'critical',
  'high',
  'medium',
  'low'
]);

const KERNEL_VERSION = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
).version;
const IDENTIFIER = /^[a-z][a-z0-9_-]{2,95}$/;
const FINDING_ID = /^sec-[0-9]{4,8}$/;
const KEY_ID = /^[a-z][a-z0-9-]{0,63}:[a-f0-9]{16}$/;
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const MAX_POLICY_MILLISECONDS = 120 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MILLISECONDS = 5 * 60 * 1000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
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
  'public_key_pem',
  'remediation_sha256',
  'sha256',
  'signature',
  'verification_sha256'
]);

export function validateSecurityReviewPolicy(
  policy,
  authorityPublicKey,
  { now = Date.now() } = {}
) {
  assertSecretFree(policy);
  exactObject(policy, 'Security review policy', [
    'schema',
    'version',
    'policy_id',
    'issued_at',
    'expires_at',
    'build',
    'requirements',
    'reviewer',
    'exception_approver',
    'authority',
    'attestation'
  ]);
  if (
    policy.schema !== SECURITY_REVIEW_POLICY_SCHEMA
    || policy.version !== 1
    || !IDENTIFIER.test(policy.policy_id ?? '')
  ) throw new ValidationError('Security review policy identity is invalid');

  const issuedAt = timestamp(policy.issued_at, 'Security review policy issued_at');
  const expiresAt = timestamp(policy.expires_at, 'Security review policy expires_at');
  if (
    issuedAt > now + CLOCK_SKEW_MILLISECONDS
    || expiresAt <= now
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > MAX_POLICY_MILLISECONDS
  ) throw new ValidationError('Security review policy is not currently valid');

  validateBuild(policy.build, 'Security review policy build');
  validateRequirements(policy.requirements);
  const reviewerKey = validatePrincipal(
    policy.reviewer,
    'Security reviewer',
    ['reviewer_id', 'reviewer_organization', 'engagement_reference',
      'independence_declared', 'key_id', 'public_key_pem'],
    'reviewer_id',
    'reviewer_organization'
  );
  if (policy.reviewer.independence_declared !== true) {
    throw new ValidationError('Security reviewer independence is not declared');
  }
  const approverKey = validatePrincipal(
    policy.exception_approver,
    'Security review exception approver',
    ['approver_id', 'approver_organization', 'key_id', 'public_key_pem'],
    'approver_id',
    'approver_organization'
  );
  if (
    policy.reviewer.reviewer_id === policy.exception_approver.approver_id
    || publicKeyFingerprint(reviewerKey) === publicKeyFingerprint(approverKey)
  ) throw new ValidationError('Reviewer and exception approver must be independent identities');

  exactObject(policy.authority, 'Security review policy authority', ['key_id']);
  if (!KEY_ID.test(policy.authority.key_id ?? '')) {
    throw new ValidationError('Security review policy authority identity is invalid');
  }
  const authorityKey = parsePublicKey(authorityPublicKey, 'Security review policy authority');
  const authorityFingerprint = publicKeyFingerprint(authorityKey);
  if (
    !policy.authority.key_id.endsWith(`:${authorityFingerprint.slice(0, 16)}`)
    || [
      publicKeyFingerprint(reviewerKey),
      publicKeyFingerprint(approverKey)
    ].includes(authorityFingerprint)
  ) throw new ValidationError('Security review policy authority key is untrusted or reused');

  const unsigned = structuredClone(policy);
  delete unsigned.attestation;
  validateAttestation(policy.attestation, 'Security review policy attestation');
  if (
    policy.attestation.key_id !== policy.authority.key_id
    || !verifyObjectSignature(unsigned, policy.attestation, authorityKey)
  ) throw new ValidationError('Security review policy authority signature is invalid');

  return {
    valid: true,
    schema: policy.schema,
    policy_id: policy.policy_id,
    policy_digest: digestObject(policy),
    source_revision: policy.build.source_revision,
    required_scope_items: SECURITY_REVIEW_SCOPE.length,
    required_artifacts: SECURITY_REVIEW_ARTIFACT_TYPES.length
  };
}

export function verifyIndependentSecurityReview(
  ledger,
  policy,
  authorityPublicKey,
  { now = Date.now() } = {}
) {
  validateSecurityReviewPolicy(policy, authorityPublicKey, { now });
  assertSecretFree(ledger);
  exactObject(ledger, 'Security review findings ledger', [
    'schema',
    'version',
    'review_id',
    'policy_id',
    'claim',
    'completed_at',
    'build',
    'reviewer',
    'scope',
    'artifacts',
    'methodology',
    'findings',
    'summary',
    'residual_risk',
    'attestation'
  ]);
  if (
    ledger.schema !== SECURITY_REVIEW_LEDGER_SCHEMA
    || ledger.version !== 1
    || !IDENTIFIER.test(ledger.review_id ?? '')
    || ledger.policy_id !== policy.policy_id
    || ledger.claim !== 'independent-security-review-submitted'
  ) throw new ValidationError('Security review findings ledger identity is invalid');

  validateBuild(ledger.build, 'Security review findings ledger build');
  if (canonicalJson(ledger.build) !== canonicalJson(policy.build)) {
    throw new ValidationError('Security review findings ledger build is not policy-pinned');
  }
  const completedAt = timestamp(
    ledger.completed_at,
    'Security review findings ledger completed_at'
  );
  const issuedAt = Date.parse(policy.issued_at);
  const expiresAt = Date.parse(policy.expires_at);
  if (
    completedAt < issuedAt
    || completedAt > expiresAt
    || completedAt > now + CLOCK_SKEW_MILLISECONDS
    || now - completedAt
      > policy.requirements.maximum_review_age_days * 24 * 60 * 60 * 1000
  ) throw new ValidationError('Security review findings ledger is stale or outside policy validity');

  validateLedgerReviewer(ledger.reviewer, policy.reviewer);
  requireSame(ledger.scope, policy.requirements.required_scope,
    'Security review scope is incomplete or unordered');
  validateArtifacts(ledger.artifacts, policy.requirements.required_artifacts);
  validateMethodology(ledger.methodology);

  if (!Array.isArray(ledger.findings) || ledger.findings.length > 512) {
    throw new ValidationError('Security review findings inventory is invalid');
  }
  if (
    canonicalJson(ledger.findings.map(item => item?.finding_id))
    !== canonicalJson(
      ledger.findings.map(item => item?.finding_id).toSorted()
    )
  ) throw new ValidationError('Security review findings must be ordered by finding id');

  const findingIds = new Set();
  const summary = emptySummary();
  const approvedExceptionIds = [];
  for (const finding of ledger.findings) {
    validateFinding(
      finding,
      ledger,
      policy,
      completedAt,
      now
    );
    if (findingIds.has(finding.finding_id)) {
      throw new ValidationError(`Duplicate security review finding: ${finding.finding_id}`);
    }
    findingIds.add(finding.finding_id);
    summary.total += 1;
    summary.counts[finding.severity] += 1;
    if (finding.status === 'closed') {
      summary.closed += 1;
    } else {
      summary.approved_exceptions += 1;
      approvedExceptionIds.push(finding.finding_id);
      if (finding.severity === 'critical') summary.unresolved_critical += 1;
      if (finding.severity === 'high') summary.unresolved_high += 1;
    }
  }
  if (summary.unresolved_critical !== 0 || summary.unresolved_high !== 0) {
    throw new ValidationError('Security review has unresolved critical or high findings');
  }
  exactObject(ledger.summary, 'Security review findings summary', [
    'total',
    'counts',
    'closed',
    'approved_exceptions',
    'unresolved_critical',
    'unresolved_high'
  ]);
  exactObject(ledger.summary.counts, 'Security review severity summary',
    SECURITY_REVIEW_SEVERITIES);
  if (canonicalJson(ledger.summary) !== canonicalJson(summary)) {
    throw new ValidationError('Security review findings summary does not match the findings');
  }

  exactObject(ledger.residual_risk, 'Security review residual risk', [
    'documented',
    'statement',
    'accepted_exception_ids'
  ]);
  if (
    ledger.residual_risk.documented !== true
    || !safeText(ledger.residual_risk.statement, 20, 2_000)
    || canonicalJson(ledger.residual_risk.accepted_exception_ids)
      !== canonicalJson(approvedExceptionIds)
  ) throw new ValidationError('Security review residual risk is incomplete');

  validateAttestation(ledger.attestation, 'Security review findings ledger attestation');
  const unsigned = structuredClone(ledger);
  delete unsigned.attestation;
  const reviewerKey = parsePublicKey(
    policy.reviewer.public_key_pem,
    'Security reviewer'
  );
  if (
    ledger.attestation.key_id !== policy.reviewer.key_id
    || !verifyObjectSignature(unsigned, ledger.attestation, reviewerKey)
  ) throw new ValidationError('Security review findings ledger signature is invalid');

  return {
    valid: true,
    schema: ledger.schema,
    review_id: ledger.review_id,
    policy_id: policy.policy_id,
    ledger_sha256: `sha256:${sha256(canonicalJson(ledger))}`,
    source_revision: ledger.build.source_revision,
    image_digest: ledger.build.image_digest,
    findings: summary.total,
    critical_findings: summary.counts.critical,
    high_findings: summary.counts.high,
    approved_exceptions: summary.approved_exceptions,
    review_attestation_verified: true,
    intake_status: 'accepted-for-security-promotion-review',
    production_promoted: false
  };
}

export function securityReviewExceptionPayload(ledger, finding) {
  const disposition = finding.disposition;
  return {
    schema: SECURITY_REVIEW_EXCEPTION_SCHEMA,
    policy_id: ledger.policy_id,
    review_id: ledger.review_id,
    finding_context_digest: digestObject({
      finding_id: finding.finding_id,
      severity: finding.severity,
      title: finding.title,
      category: finding.category,
      affected_components: finding.affected_components,
      owner: finding.owner,
      opened_at: finding.opened_at
    }),
    finding_id: finding.finding_id,
    severity: finding.severity,
    owner: finding.owner,
    rationale: disposition.rationale,
    containment: disposition.containment,
    expires_at: disposition.expires_at,
    approver_id: disposition.approval.approver_id,
    signed_at: disposition.approval.signed_at,
    build: ledger.build
  };
}

function validateRequirements(requirements) {
  exactObject(requirements, 'Security review policy requirements', [
    'required_scope',
    'required_artifacts',
    'maximum_review_age_days',
    'maximum_exception_days',
    'allowed_exception_severities'
  ]);
  requireSame(requirements.required_scope, SECURITY_REVIEW_SCOPE,
    'Security review policy scope weakens the required scope');
  if (
    !Array.isArray(requirements.required_artifacts)
    || requirements.required_artifacts.length !== SECURITY_REVIEW_ARTIFACT_TYPES.length
    || canonicalJson(requirements.required_artifacts.map(item => item?.type))
      !== canonicalJson(SECURITY_REVIEW_ARTIFACT_TYPES)
  ) throw new ValidationError('Security review policy artifact inventory is incomplete or unordered');
  validateArtifacts(requirements.required_artifacts, requirements.required_artifacts);
  if (
    !positiveInteger(requirements.maximum_review_age_days)
    || requirements.maximum_review_age_days > 30
    || !positiveInteger(requirements.maximum_exception_days)
    || requirements.maximum_exception_days > 90
    || canonicalJson(requirements.allowed_exception_severities)
      !== canonicalJson(['medium', 'low'])
  ) throw new ValidationError('Security review policy thresholds weaken promotion gates');
}

function validatePrincipal(value, name, keys, idField, organizationField) {
  exactObject(value, name, keys);
  if (
    !IDENTIFIER.test(value[idField] ?? '')
    || !safeText(value[organizationField], 3, 128)
    || !KEY_ID.test(value.key_id ?? '')
    || (
      Object.hasOwn(value, 'engagement_reference')
      && !safeReference(value.engagement_reference)
    )
  ) throw new ValidationError(`${name} identity is invalid`);
  const key = parsePublicKey(value.public_key_pem, name);
  if (!value.key_id.endsWith(`:${publicKeyFingerprint(key).slice(0, 16)}`)) {
    throw new ValidationError(`${name} key id does not match its public key`);
  }
  return key;
}

function validateLedgerReviewer(reviewer, policyReviewer) {
  exactObject(reviewer, 'Security review ledger reviewer', [
    'reviewer_id',
    'reviewer_organization',
    'engagement_reference'
  ]);
  if (
    reviewer.reviewer_id !== policyReviewer.reviewer_id
    || reviewer.reviewer_organization !== policyReviewer.reviewer_organization
    || reviewer.engagement_reference !== policyReviewer.engagement_reference
  ) throw new ValidationError('Security review ledger reviewer is not policy-authorized');
}

function validateArtifacts(artifacts, expected) {
  if (
    !Array.isArray(artifacts)
    || artifacts.length !== SECURITY_REVIEW_ARTIFACT_TYPES.length
    || canonicalJson(artifacts.map(item => item?.type))
      !== canonicalJson(SECURITY_REVIEW_ARTIFACT_TYPES)
  ) throw new ValidationError('Security review artifact inventory is incomplete or unordered');
  const digests = new Set();
  for (const artifact of artifacts) {
    exactObject(artifact, `Security review artifact ${artifact?.type ?? 'unknown'}`, [
      'type',
      'reference',
      'sha256'
    ]);
    if (
      !SECURITY_REVIEW_ARTIFACT_TYPES.includes(artifact.type)
      || !safeReference(artifact.reference)
      || !DIGEST.test(artifact.sha256 ?? '')
      || digests.has(artifact.sha256)
    ) throw new ValidationError(`Security review artifact is invalid: ${artifact.type}`);
    digests.add(artifact.sha256);
  }
  if (canonicalJson(artifacts) !== canonicalJson(expected)) {
    throw new ValidationError('Security review artifacts are not policy-pinned');
  }
}

function validateMethodology(methodology) {
  exactObject(methodology, 'Security review methodology', [
    'source_reviewed',
    'configuration_reviewed',
    'automated_analysis',
    'manual_abuse_cases',
    'negative_path_tests_reviewed',
    'limitations'
  ]);
  if (
    methodology.source_reviewed !== true
    || methodology.configuration_reviewed !== true
    || methodology.automated_analysis !== true
    || methodology.manual_abuse_cases !== true
    || methodology.negative_path_tests_reviewed !== true
    || !textArray(methodology.limitations, 1, 16, 512)
  ) throw new ValidationError('Security review methodology is incomplete');
}

function validateFinding(finding, ledger, policy, completedAt, now) {
  exactObject(finding, `Security review finding ${finding?.finding_id ?? 'unknown'}`, [
    'finding_id',
    'severity',
    'title',
    'category',
    'affected_components',
    'status',
    'owner',
    'opened_at',
    'disposition'
  ]);
  const openedAt = timestamp(finding.opened_at, `Security review finding ${finding.finding_id} opened_at`);
  if (
    !FINDING_ID.test(finding.finding_id ?? '')
    || !SECURITY_REVIEW_SEVERITIES.includes(finding.severity)
    || !safeText(finding.title, 8, 256)
    || !IDENTIFIER.test(finding.category ?? '')
    || !identifierArray(finding.affected_components, 1, 16)
    || !['closed', 'approved_exception'].includes(finding.status)
    || !IDENTIFIER.test(finding.owner ?? '')
    || openedAt < Date.parse(policy.issued_at)
    || openedAt > completedAt
  ) throw new ValidationError(`Security review finding is invalid: ${finding.finding_id}`);

  if (finding.status === 'closed') {
    validateClosedFinding(finding, ledger, policy, openedAt, completedAt);
    return;
  }
  validateExceptionFinding(finding, ledger, policy, openedAt, completedAt, now);
}

function validateClosedFinding(finding, ledger, policy, openedAt, completedAt) {
  const disposition = finding.disposition;
  exactObject(disposition, `Security review remediation ${finding.finding_id}`, [
    'type',
    'remediation_reference',
    'remediation_sha256',
    'verified_by',
    'verified_at',
    'verification_reference',
    'verification_sha256'
  ]);
  const verifiedAt = timestamp(
    disposition.verified_at,
    `Security review remediation ${finding.finding_id} verified_at`
  );
  if (
    disposition.type !== 'remediated'
    || !safeReference(disposition.remediation_reference)
    || !DIGEST.test(disposition.remediation_sha256 ?? '')
    || disposition.verified_by !== policy.reviewer.reviewer_id
    || verifiedAt < openedAt
    || verifiedAt > completedAt
    || !safeReference(disposition.verification_reference)
    || !DIGEST.test(disposition.verification_sha256 ?? '')
    || disposition.remediation_sha256 === disposition.verification_sha256
    || canonicalJson(ledger.build) !== canonicalJson(policy.build)
  ) throw new ValidationError(`Security review remediation is invalid: ${finding.finding_id}`);
}

function validateExceptionFinding(finding, ledger, policy, openedAt, completedAt, now) {
  const disposition = finding.disposition;
  exactObject(disposition, `Security review exception ${finding.finding_id}`, [
    'type',
    'rationale',
    'containment',
    'expires_at',
    'approval'
  ]);
  exactObject(disposition.approval, `Security review exception approval ${finding.finding_id}`, [
    'approver_id',
    'signed_at',
    'attestation'
  ]);
  const signedAt = timestamp(
    disposition.approval.signed_at,
    `Security review exception ${finding.finding_id} signed_at`
  );
  const expiresAt = timestamp(
    disposition.expires_at,
    `Security review exception ${finding.finding_id} expires_at`
  );
  if (
    !policy.requirements.allowed_exception_severities.includes(finding.severity)
    || disposition.type !== 'approved-exception'
    || !safeText(disposition.rationale, 20, 2_000)
    || !safeText(disposition.containment, 20, 2_000)
    || disposition.approval.approver_id !== policy.exception_approver.approver_id
    || signedAt < openedAt
    || signedAt > completedAt
    || expiresAt <= now
    || expiresAt <= completedAt
    || expiresAt - signedAt
      > policy.requirements.maximum_exception_days * 24 * 60 * 60 * 1000
  ) throw new ValidationError(`Security review exception is invalid: ${finding.finding_id}`);
  validateAttestation(
    disposition.approval.attestation,
    `Security review exception approval ${finding.finding_id}`
  );
  const approverKey = parsePublicKey(
    policy.exception_approver.public_key_pem,
    'Security review exception approver'
  );
  if (
    disposition.approval.attestation.key_id !== policy.exception_approver.key_id
    || !verifyObjectSignature(
      securityReviewExceptionPayload(ledger, finding),
      disposition.approval.attestation,
      approverKey
    )
  ) throw new ValidationError(`Security review exception approval is invalid: ${finding.finding_id}`);
}

function emptySummary() {
  return {
    total: 0,
    counts: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    },
    closed: 0,
    approved_exceptions: 0,
    unresolved_critical: 0,
    unresolved_high: 0
  };
}

function validateBuild(build, name) {
  exactObject(build, name, ['kernel_version', 'source_revision', 'image_digest']);
  if (
    build.kernel_version !== KERNEL_VERSION
    || !REVISION.test(build.source_revision ?? '')
    || !DIGEST.test(build.image_digest ?? '')
  ) throw new ValidationError(`${name} is not the current supported build`);
}

function assertSecretFree(value) {
  const serialized = JSON.stringify(value);
  if (
    /-----BEGIN (?:ENCRYPTED )?PRIVATE KEY-----/.test(serialized)
    || /(?:^|[^A-Za-z])Bearer [A-Za-z0-9._~+/-]{8,}/i.test(serialized)
  ) throw new ValidationError('Security review input contains secret material');
  visit(value, []);
}

function visit(value, path) {
  if (typeof value === 'string') {
    const key = path.at(-1)?.toLowerCase();
    if (
      !CRYPTOGRAPHIC_VALUE_KEYS.has(key)
      && /(?:^|[^A-Za-z0-9])(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/.test(value)
    ) throw new ValidationError(`Security review input contains secret material: ${path.join('.')}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, [...path, String(index)]));
    return;
  }
  if (!plainObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_SECRET_KEYS.has(key.toLowerCase())) {
      throw new ValidationError(`Security review input contains a forbidden secret field: ${[...path, key].join('.')}`);
    }
    visit(item, [...path, key]);
  }
}

function validateAttestation(attestation, name) {
  exactObject(attestation, name, ['algorithm', 'key_id', 'digest', 'signature']);
  if (
    attestation.algorithm !== 'Ed25519'
    || !KEY_ID.test(attestation.key_id ?? '')
    || !/^[a-f0-9]{64}$/.test(attestation.digest ?? '')
    || !/^[A-Za-z0-9_-]{80,128}$/.test(attestation.signature ?? '')
  ) throw new ValidationError(`${name} is invalid`);
}

function parsePublicKey(input, name) {
  if (
    typeof input !== 'string'
    || !input.includes('-----BEGIN PUBLIC KEY-----')
    || input.includes('PRIVATE KEY')
  ) throw new ValidationError(`${name} public key is invalid`);
  try {
    const key = createPublicKey(input);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new ValidationError(`${name} public key is invalid`);
  }
}

function publicKeyFingerprint(key) {
  return sha256(key.export({ type: 'spki', format: 'pem' }));
}

function exactObject(value, name, keys) {
  if (
    !plainObject(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}

function requireSame(actual, expected, message) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new ValidationError(message);
  }
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

function safeText(value, minimum, maximum) {
  return (
    typeof value === 'string'
    && value.length >= minimum
    && value.length <= maximum
    && value.trim() === value
    && !/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  );
}

function textArray(value, minimum, maximum, itemMaximum) {
  return (
    Array.isArray(value)
    && value.length >= minimum
    && value.length <= maximum
    && value.every(item => safeText(item, 3, itemMaximum))
    && new Set(value).size === value.length
  );
}

function identifierArray(value, minimum, maximum) {
  return (
    Array.isArray(value)
    && value.length >= minimum
    && value.length <= maximum
    && value.every(item => IDENTIFIER.test(item ?? ''))
    && new Set(value).size === value.length
    && canonicalJson(value) === canonicalJson([...value].toSorted())
  );
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readCanonicalJson(path, name) {
  let metadata;
  let raw;
  let value;
  try {
    metadata = await lstat(path);
    if (
      !metadata.isFile()
      || metadata.isSymbolicLink()
      || metadata.size <= 0
      || metadata.size > MAX_JSON_BYTES
    ) throw new Error('not a bounded regular file');
    raw = await readFile(path);
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new ValidationError(`${name} must be a bounded canonical JSON file`);
  }
  if (!raw.equals(Buffer.from(canonicalJson(value), 'utf8'))) {
    throw new ValidationError(`${name} must use exact canonical JSON`);
  }
  return value;
}

async function readPublicKey(path) {
  let metadata;
  try {
    metadata = await lstat(path);
    if (
      !metadata.isFile()
      || metadata.isSymbolicLink()
      || metadata.size <= 0
      || metadata.size > 16 * 1024
    ) throw new Error('not a bounded regular file');
    return await readFile(path, 'utf8');
  } catch {
    throw new ValidationError('Security review authority public key cannot be read');
  }
}

async function main() {
  const [command, ledgerPath, policyPath, authorityKeyPath] = process.argv.slice(2);
  if (
    command !== 'verify'
    || !ledgerPath
    || !policyPath
    || !authorityKeyPath
    || process.argv.length !== 6
  ) {
    throw new ValidationError(
      'Usage: node src/independent-security-review.mjs verify <findings.json> <policy.json> <authority-public.pem>'
    );
  }
  const [ledger, policy, authorityPublicKey] = await Promise.all([
    readCanonicalJson(ledgerPath, 'Security review findings ledger'),
    readCanonicalJson(policyPath, 'Security review policy'),
    readPublicKey(authorityKeyPath)
  ]);
  process.stdout.write(`${JSON.stringify(
    verifyIndependentSecurityReview(ledger, policy, authorityPublicKey),
    null,
    2
  )}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

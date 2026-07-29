import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './lib/canonical.mjs';
import { MeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import {
  SECURITY_REVIEW_ARTIFACT_TYPES,
  SECURITY_REVIEW_LEDGER_SCHEMA,
  SECURITY_REVIEW_POLICY_SCHEMA,
  SECURITY_REVIEW_SCOPE,
  securityReviewExceptionPayload,
  validateSecurityReviewPolicy,
  verifyIndependentSecurityReview
} from './independent-security-review.mjs';

const EVIDENCE_SCHEMA =
  'axiom-independent-security-review-verifier-conformance-evidence.v1';
const KERNEL_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;
const REVISION = /^[a-f0-9]{40}$/;
const DAY = 24 * 60 * 60 * 1000;

export function createSyntheticSecurityReviewFixture({
  now = Date.now(),
  sourceRevision = 'a'.repeat(40)
} = {}) {
  const authority = identity('security-review-policy-authority');
  const reviewer = identity('independent-security-reviewer');
  const exceptionApprover = identity('security-review-exception-approver');
  const issuedAt = now - (10 * DAY);
  const completedAt = now - DAY;
  const build = {
    kernel_version: KERNEL_VERSION,
    source_revision: sourceRevision,
    image_digest: syntheticDigest(1)
  };
  const requiredArtifacts = SECURITY_REVIEW_ARTIFACT_TYPES.map((type, index) => ({
    type,
    reference: `synthetic://review-input/${type}`,
    sha256: syntheticDigest(10 + index)
  }));
  const policy = {
    schema: SECURITY_REVIEW_POLICY_SCHEMA,
    version: 1,
    policy_id: 'security_review_policy_conformance_only',
    issued_at: new Date(issuedAt).toISOString(),
    expires_at: new Date(now + (30 * DAY)).toISOString(),
    build,
    requirements: {
      required_scope: [...SECURITY_REVIEW_SCOPE],
      required_artifacts: requiredArtifacts,
      maximum_review_age_days: 30,
      maximum_exception_days: 90,
      allowed_exception_severities: ['medium', 'low']
    },
    reviewer: {
      reviewer_id: 'synthetic_independent_reviewer',
      reviewer_organization: 'Synthetic Independent Review Organization',
      engagement_reference: 'synthetic://engagement/security-review',
      independence_declared: true,
      key_id: reviewer.keyId,
      public_key_pem: publicPem(reviewer)
    },
    exception_approver: {
      approver_id: 'synthetic_risk_owner',
      approver_organization: 'Synthetic Deployment Owner',
      key_id: exceptionApprover.keyId,
      public_key_pem: publicPem(exceptionApprover)
    },
    authority: {
      key_id: authority.keyId
    }
  };
  policy.attestation = authority.signObject(policy);

  const findings = [
    closedFinding({
      findingId: 'sec-0001',
      severity: 'critical',
      title: 'Synthetic authorization bypass was remediated',
      category: 'authorization',
      components: ['gateway', 'hypervisor'],
      owner: 'synthetic_kernel_owner',
      openedAt: now - (8 * DAY),
      verifiedAt: now - (3 * DAY),
      seed: 40,
      reviewerId: policy.reviewer.reviewer_id
    }),
    closedFinding({
      findingId: 'sec-0002',
      severity: 'high',
      title: 'Synthetic container policy gap was remediated',
      category: 'container_policy',
      components: ['sandbox'],
      owner: 'synthetic_platform_owner',
      openedAt: now - (7 * DAY),
      verifiedAt: now - (2 * DAY),
      seed: 50,
      reviewerId: policy.reviewer.reviewer_id
    }),
    {
      finding_id: 'sec-0003',
      severity: 'medium',
      title: 'Synthetic residual operational risk has bounded containment',
      category: 'operations',
      affected_components: ['grid'],
      status: 'approved_exception',
      owner: 'synthetic_operations_owner',
      opened_at: new Date(now - (6 * DAY)).toISOString(),
      disposition: {
        type: 'approved-exception',
        rationale: 'The synthetic fixture retains one medium residual risk to exercise exception validation.',
        containment: 'The synthetic affected path remains disabled and monitored until the exception expires.',
        expires_at: new Date(now + (30 * DAY)).toISOString(),
        approval: {
          approver_id: policy.exception_approver.approver_id,
          signed_at: new Date(now - (2 * DAY)).toISOString()
        }
      }
    },
    closedFinding({
      findingId: 'sec-0004',
      severity: 'low',
      title: 'Synthetic documentation ambiguity was remediated',
      category: 'documentation',
      components: ['release'],
      owner: 'synthetic_release_owner',
      openedAt: now - (5 * DAY),
      verifiedAt: now - (2 * DAY),
      seed: 60,
      reviewerId: policy.reviewer.reviewer_id
    })
  ];

  const ledger = {
    schema: SECURITY_REVIEW_LEDGER_SCHEMA,
    version: 1,
    review_id: 'security_review_conformance_only',
    policy_id: policy.policy_id,
    claim: 'independent-security-review-submitted',
    completed_at: new Date(completedAt).toISOString(),
    build,
    reviewer: {
      reviewer_id: policy.reviewer.reviewer_id,
      reviewer_organization: policy.reviewer.reviewer_organization,
      engagement_reference: policy.reviewer.engagement_reference
    },
    scope: [...SECURITY_REVIEW_SCOPE],
    artifacts: structuredClone(requiredArtifacts),
    methodology: {
      source_reviewed: true,
      configuration_reviewed: true,
      automated_analysis: true,
      manual_abuse_cases: true,
      negative_path_tests_reviewed: true,
      limitations: [
        'Synthetic conformance metadata does not represent an independent review or a live deployment.'
      ]
    },
    findings,
    summary: {
      total: 4,
      counts: {
        critical: 1,
        high: 1,
        medium: 1,
        low: 1
      },
      closed: 3,
      approved_exceptions: 1,
      unresolved_critical: 0,
      unresolved_high: 0
    },
    residual_risk: {
      documented: true,
      statement: 'Only the synthetic medium exception remains, with named ownership, containment, approval, and expiry.',
      accepted_exception_ids: ['sec-0003']
    }
  };
  findings[2].disposition.approval.attestation = exceptionApprover.signObject(
    securityReviewExceptionPayload(ledger, findings[2])
  );
  ledger.attestation = reviewer.signObject(ledger);

  return {
    authority,
    authorityPublicKey: publicPem(authority),
    reviewer,
    exceptionApprover,
    policy,
    ledger
  };
}

export function runIndependentSecurityReviewConformanceDrill({
  now = Date.now(),
  sourceRevision = process.env.GITHUB_SHA
} = {}) {
  const fixtureRevision = REVISION.test(sourceRevision ?? '')
    ? sourceRevision
    : 'a'.repeat(40);
  const fixture = createSyntheticSecurityReviewFixture({
    now,
    sourceRevision: fixtureRevision
  });
  const policyResult = validateSecurityReviewPolicy(
    fixture.policy,
    fixture.authorityPublicKey,
    { now }
  );
  const reviewResult = verifyIndependentSecurityReview(
    fixture.ledger,
    fixture.policy,
    fixture.authorityPublicKey,
    { now }
  );

  const wrongBuild = structuredClone(fixture.ledger);
  wrongBuild.build.image_digest = syntheticDigest(200);
  const missingScope = structuredClone(fixture.ledger);
  missingScope.scope.pop();
  const anonymousOwner = structuredClone(fixture.ledger);
  anonymousOwner.findings[0].owner = '';
  const unresolvedCritical = structuredClone(fixture.ledger);
  unresolvedCritical.findings[0].status = 'approved_exception';
  const expiredException = structuredClone(fixture.ledger);
  expiredException.findings[2].disposition.expires_at =
    new Date(now - 1).toISOString();
  const tamperedExceptionApproval = structuredClone(fixture.ledger);
  tamperedExceptionApproval.findings[2].disposition.rationale =
    'This modified rationale remains long enough but is no longer approved by the risk owner.';
  const summaryDrift = structuredClone(fixture.ledger);
  summaryDrift.summary.closed = 4;
  const tamperedLedger = structuredClone(fixture.ledger);
  tamperedLedger.residual_risk.statement =
    'This modified residual-risk statement invalidates the reviewer signature.';
  const secretBearing = structuredClone(fixture.ledger);
  secretBearing.methodology.private_key = 'forbidden';

  const verify = ledger => verifyIndependentSecurityReview(
    ledger,
    fixture.policy,
    fixture.authorityPublicKey,
    { now }
  );
  const checks = {
    authority_signature_verified: policyResult.valid === true,
    valid_synthetic_fixture_accepted: reviewResult.valid === true,
    production_promotion_not_claimed: reviewResult.production_promoted === false,
    wrong_build_rejected: rejects(() => verify(wrongBuild)),
    missing_scope_rejected: rejects(() => verify(missingScope)),
    anonymous_owner_rejected: rejects(() => verify(anonymousOwner)),
    unresolved_critical_rejected: rejects(() => verify(unresolvedCritical)),
    expired_exception_rejected: rejects(() => verify(expiredException)),
    tampered_exception_approval_rejected:
      rejects(() => verify(tamperedExceptionApproval)),
    summary_drift_rejected: rejects(() => verify(summaryDrift)),
    tampered_reviewer_attestation_rejected: rejects(() => verify(tamperedLedger)),
    secret_field_rejected: rejects(() => verify(secretBearing))
  };
  if (Object.values(checks).some(value => value !== true)) {
    throw new ValidationError('Independent security review conformance checks failed');
  }

  const signer = identity('security-review-conformance');
  const unsigned = {
    schema: EVIDENCE_SCHEMA,
    status: 'passed',
    generated_at: new Date(now).toISOString(),
    scope: 'synthetic-security-review-intake-conformance-only',
    synthetic_fixture: true,
    independent_security_review_performed: false,
    production_promotion_claimed: false,
    source: {
      kernel_version: KERNEL_VERSION,
      revision: REVISION.test(sourceRevision ?? '') ? sourceRevision : null,
      commit_bound: REVISION.test(sourceRevision ?? '')
    },
    checks,
    results: {
      required_scope_items: SECURITY_REVIEW_SCOPE.length,
      required_artifacts: SECURITY_REVIEW_ARTIFACT_TYPES.length,
      fixture_findings: fixture.ledger.findings.length,
      fixture_policy_digest: digestObject(fixture.policy),
      fixture_ledger_digest: digestObject(fixture.ledger)
    },
    signer: {
      key_id: signer.keyId,
      public_key_pem: publicPem(signer)
    }
  };
  const evidence = {
    ...unsigned,
    attestation: signer.signObject(unsigned)
  };
  verifyIndependentSecurityReviewConformanceEvidence(evidence);
  return evidence;
}

export function verifyIndependentSecurityReviewConformanceEvidence(evidence) {
  exactKeys(evidence, 'Independent security review conformance evidence', [
    'schema',
    'status',
    'generated_at',
    'scope',
    'synthetic_fixture',
    'independent_security_review_performed',
    'production_promotion_claimed',
    'source',
    'checks',
    'results',
    'signer',
    'attestation'
  ]);
  if (
    evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || evidence.scope !== 'synthetic-security-review-intake-conformance-only'
    || evidence.synthetic_fixture !== true
    || evidence.independent_security_review_performed !== false
    || evidence.production_promotion_claimed !== false
    || !canonicalTimestamp(evidence.generated_at)
  ) throw new ValidationError('Independent security review conformance evidence is invalid');
  exactKeys(evidence.source, 'Independent security review conformance source', [
    'kernel_version',
    'revision',
    'commit_bound'
  ]);
  if (
    evidence.source.kernel_version !== KERNEL_VERSION
    || (
      evidence.source.commit_bound === true
        ? !REVISION.test(evidence.source.revision ?? '')
        : evidence.source.commit_bound !== false || evidence.source.revision !== null
    )
  ) throw new ValidationError('Independent security review conformance source is invalid');
  exactKeys(evidence.checks, 'Independent security review conformance checks', [
    'authority_signature_verified',
    'valid_synthetic_fixture_accepted',
    'production_promotion_not_claimed',
    'wrong_build_rejected',
    'missing_scope_rejected',
    'anonymous_owner_rejected',
    'unresolved_critical_rejected',
    'expired_exception_rejected',
    'tampered_exception_approval_rejected',
    'summary_drift_rejected',
    'tampered_reviewer_attestation_rejected',
    'secret_field_rejected'
  ]);
  if (Object.values(evidence.checks).some(value => value !== true)) {
    throw new ValidationError('Independent security review conformance checks are incomplete');
  }
  exactKeys(evidence.results, 'Independent security review conformance results', [
    'required_scope_items',
    'required_artifacts',
    'fixture_findings',
    'fixture_policy_digest',
    'fixture_ledger_digest'
  ]);
  if (
    evidence.results.required_scope_items !== SECURITY_REVIEW_SCOPE.length
    || evidence.results.required_artifacts !== SECURITY_REVIEW_ARTIFACT_TYPES.length
    || evidence.results.fixture_findings !== 4
    || !/^[a-f0-9]{64}$/.test(evidence.results.fixture_policy_digest ?? '')
    || !/^[a-f0-9]{64}$/.test(evidence.results.fixture_ledger_digest ?? '')
  ) throw new ValidationError('Independent security review conformance results are invalid');
  exactKeys(evidence.signer, 'Independent security review conformance signer', [
    'key_id',
    'public_key_pem'
  ]);
  exactKeys(evidence.attestation, 'Independent security review conformance attestation', [
    'algorithm',
    'key_id',
    'digest',
    'signature'
  ]);
  const key = parsePublicKey(evidence.signer.public_key_pem);
  if (
    !/^[a-z][a-z0-9-]{0,63}:[a-f0-9]{16}$/.test(evidence.signer.key_id ?? '')
    || !evidence.signer.key_id.endsWith(
      `:${sha256(evidence.signer.public_key_pem).slice(0, 16)}`
    )
    || evidence.attestation.algorithm !== 'Ed25519'
    || evidence.attestation.key_id !== evidence.signer.key_id
    || !/^[a-f0-9]{64}$/.test(evidence.attestation.digest ?? '')
    || !/^[A-Za-z0-9_-]{80,128}$/.test(evidence.attestation.signature ?? '')
  ) throw new ValidationError('Independent security review conformance signer is invalid');
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, key)) {
    throw new ValidationError('Independent security review conformance signature is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    independent_security_review_performed: false,
    production_promotion_claimed: false
  };
}

function closedFinding({
  findingId,
  severity,
  title,
  category,
  components,
  owner,
  openedAt,
  verifiedAt,
  seed,
  reviewerId
}) {
  return {
    finding_id: findingId,
    severity,
    title,
    category,
    affected_components: components,
    status: 'closed',
    owner,
    opened_at: new Date(openedAt).toISOString(),
    disposition: {
      type: 'remediated',
      remediation_reference: `synthetic://remediation/${findingId}`,
      remediation_sha256: syntheticDigest(seed),
      verified_by: reviewerId,
      verified_at: new Date(verifiedAt).toISOString(),
      verification_reference: `synthetic://verification/${findingId}`,
      verification_sha256: syntheticDigest(seed + 1)
    }
  };
}

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function publicPem(identityValue) {
  return identityValue.publicKey.export({ type: 'spki', format: 'pem' });
}

function syntheticDigest(seed) {
  return `sha256:${Number(seed).toString(16).padStart(64, '0')}`;
}

function rejects(callback) {
  try {
    callback();
    return false;
  } catch (error) {
    return error instanceof ValidationError;
  }
}

function exactKeys(value, name, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function parsePublicKey(pem) {
  if (
    typeof pem !== 'string'
    || !pem.includes('-----BEGIN PUBLIC KEY-----')
    || pem.includes('PRIVATE KEY')
  ) throw new ValidationError('Independent security review conformance public key is invalid');
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new ValidationError('Independent security review conformance public key is invalid');
  }
}

async function main() {
  if (process.argv.length !== 2) {
    throw new ValidationError(
      'Usage: node src/independent-security-review-drill.mjs'
    );
  }
  process.stdout.write(`${JSON.stringify(
    runIndependentSecurityReviewConformanceDrill(),
    null,
    2
  )}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

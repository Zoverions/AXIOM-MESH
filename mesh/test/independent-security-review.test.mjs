import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { canonicalJson } from '../src/lib/canonical.mjs';
import {
  createSyntheticSecurityReviewFixture,
  runIndependentSecurityReviewConformanceDrill,
  verifyIndependentSecurityReviewConformanceEvidence
} from '../src/independent-security-review-drill.mjs';
import {
  SECURITY_REVIEW_ARTIFACT_TYPES,
  SECURITY_REVIEW_SCOPE,
  validateSecurityReviewPolicy,
  verifyIndependentSecurityReview
} from '../src/independent-security-review.mjs';

const execFileAsync = promisify(execFile);
const NOW = Date.parse('2026-07-29T15:00:00.000Z');

test('independent security review intake verifies a signed current-build ledger without promoting production', () => {
  const fixture = createSyntheticSecurityReviewFixture({ now: NOW });
  const policy = validateSecurityReviewPolicy(
    fixture.policy,
    fixture.authorityPublicKey,
    { now: NOW }
  );
  const result = verifyIndependentSecurityReview(
    fixture.ledger,
    fixture.policy,
    fixture.authorityPublicKey,
    { now: NOW }
  );

  assert.equal(policy.valid, true);
  assert.equal(policy.required_scope_items, SECURITY_REVIEW_SCOPE.length);
  assert.equal(policy.required_artifacts, SECURITY_REVIEW_ARTIFACT_TYPES.length);
  assert.equal(result.valid, true);
  assert.equal(result.findings, 4);
  assert.equal(result.critical_findings, 1);
  assert.equal(result.high_findings, 1);
  assert.equal(result.approved_exceptions, 1);
  assert.match(result.ledger_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.review_attestation_verified, true);
  assert.equal(result.intake_status, 'accepted-for-security-promotion-review');
  assert.equal(result.production_promoted, false);
});

test('findings ledger rejects incomplete scope, owner, remediation, summary, residual-risk, and signature evidence', () => {
  const fixture = createSyntheticSecurityReviewFixture({ now: NOW });
  const verify = ledger => verifyIndependentSecurityReview(
    ledger,
    fixture.policy,
    fixture.authorityPublicKey,
    { now: NOW }
  );

  const missingScope = structuredClone(fixture.ledger);
  missingScope.scope.pop();
  assert.throws(() => verify(missingScope), /scope is incomplete/);

  const artifactDrift = structuredClone(fixture.ledger);
  artifactDrift.artifacts[0].sha256 = `sha256:${'f'.repeat(64)}`;
  assert.throws(() => verify(artifactDrift), /not policy-pinned/);

  const unknownMethod = structuredClone(fixture.ledger);
  unknownMethod.methodology.unreviewed_extension = true;
  assert.throws(() => verify(unknownMethod), /methodology fields/);

  const anonymousOwner = structuredClone(fixture.ledger);
  anonymousOwner.findings[0].owner = '';
  assert.throws(() => verify(anonymousOwner), /finding is invalid/);

  const selfVerified = structuredClone(fixture.ledger);
  selfVerified.findings[0].disposition.verified_by = 'repository_maintainer';
  assert.throws(() => verify(selfVerified), /remediation is invalid/);

  const duplicateFinding = structuredClone(fixture.ledger);
  duplicateFinding.findings[1].finding_id = duplicateFinding.findings[0].finding_id;
  assert.throws(
    () => verify(duplicateFinding),
    /findings must be ordered|Duplicate security review finding/
  );

  const summaryDrift = structuredClone(fixture.ledger);
  summaryDrift.summary.counts.high = 0;
  assert.throws(() => verify(summaryDrift), /summary does not match/);

  const residualRiskDrift = structuredClone(fixture.ledger);
  residualRiskDrift.residual_risk.accepted_exception_ids = [];
  assert.throws(() => verify(residualRiskDrift), /residual risk/);

  const alteredLedger = structuredClone(fixture.ledger);
  alteredLedger.residual_risk.statement =
    'This altered statement remains structurally valid but invalidates the independent reviewer attestation.';
  assert.throws(() => verify(alteredLedger), /ledger signature/);

  const secretField = structuredClone(fixture.ledger);
  secretField.methodology.private_key = 'forbidden';
  assert.throws(() => verify(secretField), /forbidden secret field/);
});

test('critical and high findings require independently verified closure while lesser exceptions require separate bounded approval', () => {
  const fixture = createSyntheticSecurityReviewFixture({ now: NOW });
  const verify = ledger => verifyIndependentSecurityReview(
    ledger,
    fixture.policy,
    fixture.authorityPublicKey,
    { now: NOW }
  );

  const unresolvedCritical = structuredClone(fixture.ledger);
  unresolvedCritical.findings[0].status = 'approved_exception';
  assert.throws(() => verify(unresolvedCritical), /exception|critical or high/);

  const unresolvedHigh = structuredClone(fixture.ledger);
  unresolvedHigh.findings[1] = structuredClone(unresolvedHigh.findings[2]);
  unresolvedHigh.findings[1].finding_id = 'sec-0002';
  unresolvedHigh.findings[1].severity = 'high';
  assert.throws(() => verify(unresolvedHigh), /exception|critical or high/);

  const expiredException = structuredClone(fixture.ledger);
  expiredException.findings[2].disposition.expires_at =
    new Date(NOW - 1).toISOString();
  assert.throws(() => verify(expiredException), /exception is invalid/);

  const excessiveException = structuredClone(fixture.ledger);
  excessiveException.findings[2].disposition.expires_at =
    new Date(NOW + (91 * 24 * 60 * 60 * 1000)).toISOString();
  assert.throws(() => verify(excessiveException), /exception is invalid/);

  const ownerlessException = structuredClone(fixture.ledger);
  ownerlessException.findings[2].owner = '';
  assert.throws(() => verify(ownerlessException), /finding is invalid/);

  const alteredRationale = structuredClone(fixture.ledger);
  alteredRationale.findings[2].disposition.rationale =
    'This altered rationale is structurally valid but was not signed by the policy-authorized risk owner.';
  assert.throws(() => verify(alteredRationale), /exception approval is invalid/);

  const selfApproval = structuredClone(fixture.ledger);
  selfApproval.findings[2].disposition.approval.attestation =
    fixture.reviewer.signObject(
      fixture.ledger.findings[2].disposition.approval
    );
  assert.throws(() => verify(selfApproval), /exception approval is invalid/);
});

test('review policy requires a current build, complete controls, distinct identities, and an external trust anchor', () => {
  const fixture = createSyntheticSecurityReviewFixture({ now: NOW });

  const expired = structuredClone(fixture.policy);
  expired.expires_at = new Date(NOW - 1).toISOString();
  assert.throws(
    () => validateSecurityReviewPolicy(expired, fixture.authorityPublicKey, { now: NOW }),
    /not currently valid/
  );

  const oldBuild = structuredClone(fixture.policy);
  oldBuild.build.kernel_version = '0.11.0';
  assert.throws(
    () => validateSecurityReviewPolicy(oldBuild, fixture.authorityPublicKey, { now: NOW }),
    /current supported build/
  );

  const missingScope = structuredClone(fixture.policy);
  missingScope.requirements.required_scope.pop();
  assert.throws(
    () => validateSecurityReviewPolicy(missingScope, fixture.authorityPublicKey, { now: NOW }),
    /scope weakens/
  );

  const permissiveExceptions = structuredClone(fixture.policy);
  permissiveExceptions.requirements.allowed_exception_severities =
    ['high', 'medium', 'low'];
  assert.throws(
    () => validateSecurityReviewPolicy(
      permissiveExceptions,
      fixture.authorityPublicKey,
      { now: NOW }
    ),
    /thresholds weaken/
  );

  const reusedKey = structuredClone(fixture.policy);
  reusedKey.exception_approver.public_key_pem =
    reusedKey.reviewer.public_key_pem;
  reusedKey.exception_approver.key_id =
    `security-review-exception-approver:${reusedKey.reviewer.key_id.split(':')[1]}`;
  assert.throws(
    () => validateSecurityReviewPolicy(reusedKey, fixture.authorityPublicKey, { now: NOW }),
    /independent identities/
  );

  const undeclaredIndependence = structuredClone(fixture.policy);
  undeclaredIndependence.reviewer.independence_declared = false;
  assert.throws(
    () => validateSecurityReviewPolicy(
      undeclaredIndependence,
      fixture.authorityPublicKey,
      { now: NOW }
    ),
    /independence is not declared/
  );

  const otherFixture = createSyntheticSecurityReviewFixture({ now: NOW + 1 });
  assert.throws(
    () => validateSecurityReviewPolicy(
      fixture.policy,
      otherFixture.authorityPublicKey,
      { now: NOW }
    ),
    /untrusted or reused/
  );
});

test('command-line intake requires canonical bounded files', async () => {
  const fixture = createSyntheticSecurityReviewFixture({ now: Date.now() });
  const directory = await mkdtemp(join(tmpdir(), 'axiom-security-review-'));
  const ledgerPath = join(directory, 'findings.json');
  const policyPath = join(directory, 'policy.json');
  const authorityPath = join(directory, 'authority.pem');
  const executable = fileURLToPath(new URL(
    '../src/independent-security-review.mjs',
    import.meta.url
  ));
  try {
    await Promise.all([
      writeFile(ledgerPath, canonicalJson(fixture.ledger)),
      writeFile(policyPath, canonicalJson(fixture.policy)),
      writeFile(authorityPath, fixture.authorityPublicKey)
    ]);
    const accepted = await execFileAsync(process.execPath, [
      executable,
      'verify',
      ledgerPath,
      policyPath,
      authorityPath
    ], {
      env: {
        ...process.env,
        TZ: 'UTC'
      }
    });
    assert.equal(JSON.parse(accepted.stdout).valid, true);

    await writeFile(ledgerPath, JSON.stringify(fixture.ledger, null, 2));
    await assert.rejects(
      execFileAsync(process.execPath, [
        executable,
        'verify',
        ledgerPath,
        policyPath,
        authorityPath
      ]),
      /exact canonical JSON/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('signed conformance evidence proves verifier behavior and makes no real-review or production claim', () => {
  const evidence = runIndependentSecurityReviewConformanceDrill({
    now: NOW,
    sourceRevision: 'd'.repeat(40)
  });
  const result = verifyIndependentSecurityReviewConformanceEvidence(evidence);

  assert.equal(result.valid, true);
  assert.equal(result.independent_security_review_performed, false);
  assert.equal(result.production_promotion_claimed, false);
  assert.equal(evidence.source.commit_bound, true);
  assert.equal(evidence.source.revision, 'd'.repeat(40));
  assert.ok(Object.values(evidence.checks).every(Boolean));

  const tampered = structuredClone(evidence);
  tampered.results.required_scope_items -= 1;
  assert.throws(
    () => verifyIndependentSecurityReviewConformanceEvidence(tampered),
    /results are invalid/
  );
});

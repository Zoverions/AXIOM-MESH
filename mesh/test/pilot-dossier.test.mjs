import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSyntheticPilotFixture,
  runPilotDossierConformanceDrill,
  verifyPilotDossierConformanceEvidence
} from '../src/pilot-dossier-conformance-drill.mjs';
import {
  validatePilotReviewPolicy,
  verifyPilotDossier
} from '../src/pilot-dossier.mjs';

test('pilot dossier accepts a complete policy-pinned submission without promoting production', () => {
  const now = Date.parse('2026-07-29T15:00:00.000Z');
  const fixture = createSyntheticPilotFixture({ now });
  const policy = validatePilotReviewPolicy(
    fixture.policy,
    fixture.authorityPublicKey,
    { now }
  );
  const dossier = verifyPilotDossier(
    fixture.dossier,
    fixture.policy,
    fixture.authorityPublicKey,
    { now }
  );

  assert.equal(policy.valid, true);
  assert.equal(dossier.valid, true);
  assert.equal(dossier.intake_status, 'accepted-for-promotion-review');
  assert.equal(dossier.production_promoted, false);
  assert.equal(dossier.evidence_items, 13);
  assert.equal(dossier.reviewer_approvals, 5);
});

test('pilot dossier rejects policy, build, evidence, custody, SLO, secret, and approval drift', () => {
  const now = Date.parse('2026-07-29T15:00:00.000Z');
  const fixture = createSyntheticPilotFixture({ now });
  const verify = dossier => verifyPilotDossier(
    dossier,
    fixture.policy,
    fixture.authorityPublicKey,
    { now }
  );

  const changedPolicy = structuredClone(fixture.policy);
  changedPolicy.requirements.minimum_observation_hours = 721;
  assert.throws(
    () => validatePilotReviewPolicy(changedPolicy, fixture.authorityPublicKey, { now }),
    /authority signature/
  );

  const wrongBuild = structuredClone(fixture.dossier);
  wrongBuild.build.source_revision = 'c'.repeat(40);
  assert.throws(() => verify(wrongBuild), /policy-pinned build/);

  const missingEvidence = structuredClone(fixture.dossier);
  missingEvidence.evidence.pop();
  assert.throws(() => verify(missingEvidence), /evidence inventory/);

  const reusedEvidenceDigest = structuredClone(fixture.dossier);
  reusedEvidenceDigest.evidence[1].sha256 = reusedEvidenceDigest.evidence[0].sha256;
  assert.throws(() => verify(reusedEvidenceDigest), /evidence item/);

  const credentialReference = structuredClone(fixture.dossier);
  credentialReference.evidence[0].reference = 'https://user@example.invalid/evidence';
  assert.throws(() => verify(credentialReference), /evidence item/);

  const exportableKey = structuredClone(fixture.dossier);
  exportableKey.custody[0].exportable = true;
  assert.throws(() => verify(exportableKey), /custody evidence/);

  const slowRestore = structuredClone(fixture.dossier);
  slowRestore.measurements.restore_rto_minutes = 241;
  assert.throws(() => verify(slowRestore), /measurements/);

  const highFailureRate = structuredClone(fixture.dossier);
  highFailureRate.measurements.failed_intents = 100;
  assert.throws(() => verify(highFailureRate), /measurements/);

  const secretBearing = structuredClone(fixture.dossier);
  secretBearing.password = 'do-not-accept';
  assert.throws(() => verify(secretBearing), /secret field/);

  const productionClaim = structuredClone(fixture.dossier);
  productionClaim.claim = 'production-promoted';
  assert.throws(() => verify(productionClaim), /claim/);

  const tamperedApproval = structuredClone(fixture.dossier);
  tamperedApproval.approvals[4].signed_at = fixture.dossier.generated_at;
  assert.throws(() => verify(tamperedApproval), /approval/);

  const extendedAttestation = structuredClone(fixture.dossier);
  extendedAttestation.approvals[0].attestation.unreviewed_extension = true;
  assert.throws(() => verify(extendedAttestation), /attestation fields/);
});

test('pilot policy requires live, distinct, authority-pinned reviewer identities', () => {
  const now = Date.parse('2026-07-29T15:00:00.000Z');
  const fixture = createSyntheticPilotFixture({ now });

  const expired = structuredClone(fixture.policy);
  expired.expires_at = new Date(now - 1).toISOString();
  assert.throws(
    () => validatePilotReviewPolicy(expired, fixture.authorityPublicKey, { now }),
    /not currently valid/
  );

  const reusedIdentity = structuredClone(fixture.policy);
  reusedIdentity.reviewers[1] = {
    ...reusedIdentity.reviewers[1],
    reviewer_id: reusedIdentity.reviewers[0].reviewer_id
  };
  assert.throws(
    () => validatePilotReviewPolicy(reusedIdentity, fixture.authorityPublicKey, { now }),
    /distinct valid identities/
  );

  const reusedKey = structuredClone(fixture.policy);
  reusedKey.reviewers[1].public_key_pem = reusedKey.reviewers[0].public_key_pem;
  reusedKey.reviewers[1].key_id = `pilot-platform-operator:${reusedKey.reviewers[0].key_id.split(':')[1]}`;
  assert.throws(
    () => validatePilotReviewPolicy(reusedKey, fixture.authorityPublicKey, { now }),
    /reuse a signing key/
  );

  const wrongAuthority = createSyntheticPilotFixture({ now: now + 1 });
  assert.throws(
    () => validatePilotReviewPolicy(
      fixture.policy,
      wrongAuthority.authorityPublicKey,
      { now }
    ),
    /untrusted or reused/
  );
});

test('signed conformance evidence proves fail-closed behavior and explicitly excludes a live pilot', () => {
  const now = Date.parse('2026-07-29T15:00:00.000Z');
  const evidence = runPilotDossierConformanceDrill({
    now,
    sourceRevision: 'd'.repeat(40)
  });
  const verified = verifyPilotDossierConformanceEvidence(evidence);

  assert.equal(verified.valid, true);
  assert.equal(verified.live_pilot_observed, false);
  assert.equal(verified.production_promotion_claimed, false);
  assert.equal(evidence.source.commit_bound, true);
  assert.equal(evidence.source.revision, 'd'.repeat(40));
  assert.ok(Object.values(evidence.checks).every(Boolean));

  const tampered = structuredClone(evidence);
  tampered.results.required_evidence_items -= 1;
  assert.throws(
    () => verifyPilotDossierConformanceEvidence(tampered),
    /conformance evidence/
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDisclosureReview } from '../src/lib/disclosure-review.mjs';
import { validatePrivacyThreatProfile } from '../src/lib/privacy-threat-profile.mjs';

function validProfile() {
  return {
    schema: 'axiom-privacy-threat-profile.v1',
    profile_id: 'privacy_profile_composition',
    profile_class: 'correlation-resistant',
    purpose: 'publish-minimized-research-artifact',
    adversary_capabilities: [
      'auxiliary-data-correlation',
      'network-metadata-observation',
      'host-device-correlation'
    ],
    protections: {
      host_device_telemetry: 'controlled',
      network_metadata: 'minimized',
      persona_isolation: 'credential-and-context',
      disclosure_inspection: 'required',
      physical_tamper: 'detect-only',
      artifact_verification: 'signed-and-digested'
    },
    residual_risks: [
      'stylometric-attribution-may-remain',
      'global-passive-network-observer-not-defeated'
    ],
    currentness: {
      issued_at: '2026-09-05T00:00:00.000Z',
      expires_at: '2026-10-05T00:00:00.000Z',
      policy_digest: 'a'.repeat(64)
    },
    authority_effect: 'none'
  };
}

function validDisclosureReview(threatProfileDigest) {
  return {
    schema: 'axiom-disclosure-review.v1',
    review_id: 'disclosure_review_composition',
    object_digest: 'b'.repeat(64),
    threat_profile_digest: threatProfileDigest,
    purpose: 'publish-minimized-research-artifact',
    required_categories: ['metadata', 'watermark', 'malware'],
    findings: [
      {
        category: 'metadata',
        status: 'clear',
        severity: 'none',
        detector: 'metadata-lab.v1',
        reason_code: 'no-supported-metadata-found'
      },
      {
        category: 'watermark',
        status: 'clear',
        severity: 'none',
        detector: 'watermark-lab.v1',
        reason_code: 'no-supported-watermark-found'
      },
      {
        category: 'malware',
        status: 'clear',
        severity: 'none',
        detector: 'malware-lab.v1',
        reason_code: 'no-supported-malware-found'
      }
    ],
    decision: 'allow',
    authority_effect: 'none'
  };
}

test('disclosure review can bind the exact semantic digest of a validated threat profile without inheriting authority', () => {
  const profile = validatePrivacyThreatProfile(validProfile());
  const reviewInput = validDisclosureReview(profile.profile_digest);
  const review = validateDisclosureReview(reviewInput);

  assert.equal(reviewInput.threat_profile_digest, profile.profile_digest);
  assert.equal(profile.authority_effect, 'none');
  assert.equal(profile.anonymity_granted, false);
  assert.equal(profile.execution_authority_granted, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.release_authorized, false);
  assert.equal(review.transmission_authorized, false);
  assert.equal(review.sanitizer_executed, false);
});

test('a changed threat profile produces a different semantic digest and therefore requires a new disclosure binding', () => {
  const original = validProfile();
  const originalResult = validatePrivacyThreatProfile(original);

  const changed = validProfile();
  changed.residual_risks.push('additional-contextual-correlation-risk');
  const changedResult = validatePrivacyThreatProfile(changed);

  assert.notEqual(originalResult.profile_digest, changedResult.profile_digest);
  assert.equal(
    validDisclosureReview(originalResult.profile_digest).threat_profile_digest,
    originalResult.profile_digest
  );
  assert.notEqual(originalResult.profile_digest, changedResult.profile_digest);
});

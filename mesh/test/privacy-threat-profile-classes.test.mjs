import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePrivacyThreatProfile } from '../src/lib/privacy-threat-profile.mjs';

function profile(profileClass) {
  const protectionsByClass = {
    'baseline-private': {
      host_device_telemetry: 'minimized',
      network_metadata: 'authenticated-encrypted',
      persona_isolation: 'application',
      disclosure_inspection: 'optional',
      physical_tamper: 'not-assessed',
      artifact_verification: 'digest-required'
    },
    'high-anonymity': {
      host_device_telemetry: 'isolated',
      network_metadata: 'anonymity-preserving',
      persona_isolation: 'host-and-network',
      disclosure_inspection: 'required',
      physical_tamper: 'resist-and-detect',
      artifact_verification: 'signed-and-digested'
    }
  };

  return {
    schema: 'axiom-privacy-threat-profile.v1',
    profile_id: `privacy_profile_${profileClass.replaceAll('-', '_')}`,
    profile_class: profileClass,
    purpose: 'profile-class-validation',
    adversary_capabilities: [
      'auxiliary-data-correlation',
      'network-metadata-observation'
    ],
    protections: protectionsByClass[profileClass],
    residual_risks: ['external-correlation-may-remain'],
    currentness: {
      issued_at: '2026-09-05T00:00:00.000Z',
      expires_at: '2026-10-05T00:00:00.000Z',
      policy_digest: 'd'.repeat(64)
    },
    authority_effect: 'none'
  };
}

test('baseline-private validates without implying anonymity or mandatory disclosure inspection', () => {
  const result = validatePrivacyThreatProfile(profile('baseline-private'));

  assert.equal(result.valid, true);
  assert.equal(result.profile_class, 'baseline-private');
  assert.equal(result.required_disclosure_inspection, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.anonymity_granted, false);
  assert.equal(result.execution_authority_granted, false);
});

test('high-anonymity validates only as a stronger requirement class, not an anonymity grant', () => {
  const result = validatePrivacyThreatProfile(profile('high-anonymity'));

  assert.equal(result.valid, true);
  assert.equal(result.profile_class, 'high-anonymity');
  assert.equal(result.required_disclosure_inspection, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.anonymity_granted, false);
  assert.equal(result.execution_authority_granted, false);
});

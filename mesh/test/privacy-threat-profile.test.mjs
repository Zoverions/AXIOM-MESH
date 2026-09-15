import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validatePrivacyThreatProfile } from '../src/lib/privacy-threat-profile.mjs';

const IMPLEMENTATION_URL = new URL('../src/lib/privacy-threat-profile.mjs', import.meta.url);

const VALID_PROFILE = Object.freeze({
  schema: 'axiom-privacy-threat-profile.v1',
  profile_id: 'privacy_profile_example',
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
});

function clone(value = VALID_PROFILE) {
  return structuredClone(value);
}

test('correlation-resistant threat profile validates as requirements-only evidence', () => {
  const result = validatePrivacyThreatProfile(clone());
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-privacy-threat-profile.v1');
  assert.equal(result.profile_class, 'correlation-resistant');
  assert.match(result.profile_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.required_disclosure_inspection, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.anonymity_granted, false);
  assert.equal(result.execution_authority_granted, false);
});

test('high-anonymity cannot downgrade host, network, persona, or disclosure requirements', () => {
  const base = clone();
  base.profile_class = 'high-anonymity';
  base.protections.host_device_telemetry = 'isolated';
  base.protections.network_metadata = 'anonymity-preserving';
  base.protections.persona_isolation = 'host-and-network';
  base.protections.physical_tamper = 'resist-and-detect';

  for (const [field, weakened] of [
    ['host_device_telemetry', 'controlled'],
    ['network_metadata', 'minimized'],
    ['persona_isolation', 'credential-and-context'],
    ['disclosure_inspection', 'optional']
  ]) {
    const candidate = clone(base);
    candidate.protections[field] = weakened;
    assert.throws(
      () => validatePrivacyThreatProfile(candidate),
      /high-anonymity protection boundary/
    );
  }
});

test('threat profile cannot encode encryption or pseudonymity as anonymity proof', () => {
  for (const [field, value] of [
    ['anonymity_proven_by', 'encrypted-transport'],
    ['unlinkability_proven_by', 'pseudonym'],
    ['identity_guarantee', 'anonymous']
  ]) {
    const candidate = clone();
    candidate[field] = value;
    assert.throws(
      () => validatePrivacyThreatProfile(candidate),
      new RegExp(`unsupported field ${field}`)
    );
  }
});

test('threat profile rejects unknown, duplicate, or empty adversary capabilities', () => {
  const unknown = clone();
  unknown.adversary_capabilities.push('civil-identity-magically-known');
  assert.throws(
    () => validatePrivacyThreatProfile(unknown),
    /adversary_capabilities contains unsupported value/
  );

  const duplicate = clone();
  duplicate.adversary_capabilities.push(duplicate.adversary_capabilities[0]);
  assert.throws(
    () => validatePrivacyThreatProfile(duplicate),
    /adversary_capabilities contains duplicate value/
  );

  const empty = clone();
  empty.adversary_capabilities = [];
  assert.throws(
    () => validatePrivacyThreatProfile(empty),
    /adversary_capabilities must contain 1-16 items/
  );
});

test('threat profile requires explicit residual-risk acknowledgement', () => {
  const candidate = clone();
  candidate.residual_risks = [];
  assert.throws(
    () => validatePrivacyThreatProfile(candidate),
    /residual_risks must contain 1-32 items/
  );
});

test('threat profile rejects authority elevation, invalid currentness, and invalid policy digests', () => {
  const authority = clone();
  authority.authority_effect = 'grant';
  assert.throws(
    () => validatePrivacyThreatProfile(authority),
    /authority_effect must be none/
  );

  const chronology = clone();
  chronology.currentness.expires_at = chronology.currentness.issued_at;
  assert.throws(
    () => validatePrivacyThreatProfile(chronology),
    /expires_at must follow issued_at/
  );

  const timestamp = clone();
  timestamp.currentness.issued_at = '2026-09-05';
  assert.throws(
    () => validatePrivacyThreatProfile(timestamp),
    /must be a canonical UTC ISO timestamp/
  );

  const digest = clone();
  digest.currentness.policy_digest = 'ABC';
  assert.throws(
    () => validatePrivacyThreatProfile(digest),
    /policy_digest has an invalid format/
  );
});

test('threat profile rejects unsupported protection fields and values', () => {
  const field = clone();
  field.protections.browser_magic = 'anonymous';
  assert.throws(
    () => validatePrivacyThreatProfile(field),
    /protections contains unsupported field browser_magic/
  );

  const value = clone();
  value.protections.network_metadata = 'invisible';
  assert.throws(
    () => validatePrivacyThreatProfile(value),
    /protections.network_metadata is invalid/
  );
});

test('threat profile validator is effect-inert and imports no effect-capable modules', async () => {
  const source = await readFile(IMPLEMENTATION_URL, 'utf8');
  for (const forbidden of [
    'node:child_process',
    'node:fs',
    'node:net',
    'node:http',
    'node:https',
    'node:dgram',
    'node:tls',
    'gateway',
    'hypervisor',
    'sandbox',
    'grid',
    'executor'
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden), false, `validator must not import/reference ${forbidden}`);
  }
});

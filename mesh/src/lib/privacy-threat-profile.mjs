import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const PRIVACY_THREAT_PROFILE_SCHEMA = 'axiom-privacy-threat-profile.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const TOKEN = /^[a-z0-9][a-z0-9.-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const PROFILE_CLASSES = new Set([
  'baseline-private',
  'correlation-resistant',
  'high-anonymity'
]);

const ADVERSARY_CAPABILITIES = new Set([
  'auxiliary-data-correlation',
  'network-metadata-observation',
  'host-device-correlation',
  'behavioral-stylometric-analysis',
  'physical-tampering',
  'malicious-file-content'
]);

const PROTECTION_VALUES = Object.freeze({
  host_device_telemetry: new Set(['minimized', 'controlled', 'isolated']),
  network_metadata: new Set(['authenticated-encrypted', 'minimized', 'anonymity-preserving']),
  persona_isolation: new Set(['application', 'credential-and-context', 'host-and-network']),
  disclosure_inspection: new Set(['optional', 'required']),
  physical_tamper: new Set([
    'not-assessed',
    'detect-only',
    'resist-and-detect',
    'continuous-custody-required'
  ]),
  artifact_verification: new Set(['digest-required', 'signed-and-digested'])
});

const RANKS = Object.freeze({
  host_device_telemetry: Object.freeze({ minimized: 0, controlled: 1, isolated: 2 }),
  network_metadata: Object.freeze({
    'authenticated-encrypted': 0,
    minimized: 1,
    'anonymity-preserving': 2
  }),
  persona_isolation: Object.freeze({
    application: 0,
    'credential-and-context': 1,
    'host-and-network': 2
  }),
  disclosure_inspection: Object.freeze({ optional: 0, required: 1 }),
  artifact_verification: Object.freeze({ 'digest-required': 0, 'signed-and-digested': 1 })
});

const MINIMUMS = Object.freeze({
  'baseline-private': Object.freeze({
    host_device_telemetry: 'minimized',
    network_metadata: 'authenticated-encrypted',
    persona_isolation: 'application',
    disclosure_inspection: 'optional',
    artifact_verification: 'digest-required'
  }),
  'correlation-resistant': Object.freeze({
    host_device_telemetry: 'controlled',
    network_metadata: 'minimized',
    persona_isolation: 'credential-and-context',
    disclosure_inspection: 'required',
    artifact_verification: 'signed-and-digested'
  }),
  'high-anonymity': Object.freeze({
    host_device_telemetry: 'isolated',
    network_metadata: 'anonymity-preserving',
    persona_isolation: 'host-and-network',
    disclosure_inspection: 'required',
    artifact_verification: 'signed-and-digested'
  })
});

export function validatePrivacyThreatProfile(raw) {
  const profile = exactObject(raw, 'Privacy threat profile', [
    'schema',
    'profile_id',
    'profile_class',
    'purpose',
    'adversary_capabilities',
    'protections',
    'residual_risks',
    'currentness',
    'authority_effect'
  ]);

  if (profile.schema !== PRIVACY_THREAT_PROFILE_SCHEMA) {
    throw new ValidationError('Privacy threat profile schema is invalid');
  }

  const profileId = assertString(profile.profile_id, 'Privacy threat profile profile_id', {
    min: 1,
    max: 160,
    pattern: ID
  });

  if (!PROFILE_CLASSES.has(profile.profile_class)) {
    throw new ValidationError('Privacy threat profile profile_class is invalid');
  }

  assertString(profile.purpose, 'Privacy threat profile purpose', {
    min: 1,
    max: 160,
    pattern: TOKEN
  });

  validateUniqueTokenArray(
    profile.adversary_capabilities,
    'Privacy threat profile adversary_capabilities',
    { minItems: 1, maxItems: 16, allowed: ADVERSARY_CAPABILITIES }
  );

  const protections = exactObject(
    profile.protections,
    'Privacy threat profile protections',
    Object.keys(PROTECTION_VALUES)
  );
  for (const [field, allowed] of Object.entries(PROTECTION_VALUES)) {
    if (!allowed.has(protections[field])) {
      throw new ValidationError(`Privacy threat profile protections.${field} is invalid`);
    }
  }
  validateMinimumProtections(profile.profile_class, protections);

  validateUniqueTokenArray(
    profile.residual_risks,
    'Privacy threat profile residual_risks',
    { minItems: 1, maxItems: 32 }
  );

  const currentness = exactObject(profile.currentness, 'Privacy threat profile currentness', [
    'issued_at',
    'expires_at',
    'policy_digest'
  ]);
  const issuedAt = canonicalTimestamp(
    currentness.issued_at,
    'Privacy threat profile currentness.issued_at'
  );
  const expiresAt = canonicalTimestamp(
    currentness.expires_at,
    'Privacy threat profile currentness.expires_at'
  );
  if (expiresAt.getTime() <= issuedAt.getTime()) {
    throw new ValidationError('Privacy threat profile currentness expires_at must follow issued_at');
  }
  canonicalDigest(currentness.policy_digest, 'Privacy threat profile currentness.policy_digest');

  if (profile.authority_effect !== 'none') {
    throw new ValidationError('Privacy threat profile authority_effect must be none');
  }

  return Object.freeze({
    valid: true,
    schema: profile.schema,
    profile_id: profileId,
    profile_class: profile.profile_class,
    profile_digest: digestObject(profile),
    required_disclosure_inspection: protections.disclosure_inspection === 'required',
    authority_effect: 'none',
    anonymity_granted: false,
    execution_authority_granted: false
  });
}

function validateMinimumProtections(profileClass, protections) {
  const minimums = MINIMUMS[profileClass];
  for (const [field, minimum] of Object.entries(minimums)) {
    const ranks = RANKS[field];
    if (ranks[protections[field]] < ranks[minimum]) {
      throw new ValidationError(`Privacy threat profile ${profileClass} protection boundary is not satisfied`);
    }
  }

  if (profileClass === 'high-anonymity' && protections.physical_tamper === 'not-assessed') {
    throw new ValidationError('Privacy threat profile high-anonymity protection boundary is not satisfied');
  }
}

function validateUniqueTokenArray(value, label, { minItems, maxItems, allowed } = {}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${label} must contain ${minItems}-${maxItems} items`);
  }

  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = assertString(value[index], `${label}[${index}]`, {
      min: 1,
      max: 160,
      pattern: TOKEN
    });
    if (seen.has(item)) {
      throw new ValidationError(`${label} contains duplicate value`);
    }
    if (allowed && !allowed.has(item)) {
      throw new ValidationError(`${label} contains unsupported value`);
    }
    seen.add(item);
  }
}

function exactObject(raw, label, fields) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 1, max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return parsed;
}

function canonicalDigest(value, label) {
  const text = assertString(value, label, { min: 1, max: 128 });
  if (!SHA256.test(text)) throw new ValidationError(`${label} has an invalid format`);
  return text;
}

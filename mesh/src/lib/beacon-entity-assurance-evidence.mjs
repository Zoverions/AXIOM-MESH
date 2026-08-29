import {
  agentProviderProfileDigest,
  validateAgentProviderProfile
} from './agent-provider-profile.mjs';
import { verifyBeaconObservationEnvelope } from './beacon-observation-candidate.mjs';
import {
  assertPlainObject,
  assertString,
  digestObject,
  ValidationError
} from './canonical.mjs';
import { normalizeEntityAssuranceEvidence } from './entity-assurance.mjs';

const INPUT_FIELDS = Object.freeze([
  'envelope',
  'provider_profile',
  'now',
  'seen_replay_keys'
]);
const DIGEST = /^[a-f0-9]{64}$/;
const ACCEPTED_ASSURANCE_CEILINGS = new Set(['cryptographic', 'hardware-rooted']);

function assertExactInput(value) {
  const allowed = new Set(INPUT_FIELDS);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`Beacon Entity Assurance normalization input contains unknown field: ${key}`);
    }
  }
  for (const key of INPUT_FIELDS) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`Beacon Entity Assurance normalization input is missing required field: ${key}`);
    }
  }
}

export function beaconEntityAssuranceSubjectId(senderKeyFingerprint) {
  const fingerprint = assertString(
    senderKeyFingerprint,
    'Beacon sender key fingerprint',
    { min: 64, max: 64, pattern: DIGEST }
  );
  return `external.beacon.key.${fingerprint}`;
}

export function normalizeBeaconObservationEntityAssuranceEvidence(input) {
  const value = assertPlainObject(input, 'Beacon Entity Assurance normalization input');
  assertExactInput(value);

  const provider = value.provider_profile;
  const profile = validateAgentProviderProfile(provider);
  if (profile.provider_class !== 'agent-interop') {
    throw new ValidationError('Beacon Entity Assurance normalization requires an agent-interop provider profile');
  }
  if (!provider.evidence_classes.includes('signed-envelope')) {
    throw new ValidationError('Beacon Entity Assurance normalization requires signed-envelope evidence');
  }
  if (!provider.evidence_classes.includes('replay-protected-envelope')) {
    throw new ValidationError('Beacon Entity Assurance normalization requires replay-protected-envelope evidence');
  }
  if (!ACCEPTED_ASSURANCE_CEILINGS.has(profile.assurance_ceiling)) {
    throw new ValidationError('Beacon Entity Assurance normalization requires a cryptographic assurance ceiling');
  }

  const verification = verifyBeaconObservationEnvelope(value.envelope, {
    now: value.now,
    seen_replay_keys: value.seen_replay_keys
  });
  const subjectId = beaconEntityAssuranceSubjectId(verification.sender_key_fingerprint);
  const basisDigest = digestObject({
    provider_profile_digest: agentProviderProfileDigest(provider),
    observation_digest: verification.observation_digest,
    sender_key_fingerprint: verification.sender_key_fingerprint,
    replay_key: verification.replay_key
  });

  return normalizeEntityAssuranceEvidence({
    schema: 'axiom-entity-assurance-evidence.v1',
    evidence_id: `evidence.beacon.provenance.${verification.observation_digest}`,
    subject_id: subjectId,
    dimension: 'provenance',
    result: 'pass',
    strength: 'moderate',
    evidence_class: 'measured',
    basis_digest: basisDigest,
    issuer_id: null,
    binding_scope: 'pseudonymous',
    observed_at: value.envelope.issued_at,
    expires_at: value.envelope.expires_at,
    non_authorizing: true
  });
}

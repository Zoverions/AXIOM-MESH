import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import {
  validateAuthorityConflict,
  validateAuthorityGrant,
  validateRelationshipClaim
} from './human-authority.mjs';

export const HUMAN_AUTHORITY_ATTESTOR_PROFILE_SCHEMA = 'axiom-human-authority-attestor-profile.v1';
export const HUMAN_AUTHORITY_ATTESTATION_FACTS_SCHEMA = 'axiom-human-authority-attestation-facts.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ASSURANCE_RANK = Object.freeze({ A0: 0, A1: 1, A2: 2, A3: 3, A4: 4 });
const ARTIFACT_CLASSES = new Set(['relationship-claim', 'authority-grant', 'authority-conflict']);
const ATTESTOR_TYPES = new Set(['human', 'service']);

function canonicalTime(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const text = assertString(value, label, { max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical ISO-8601 timestamp`);
  }
  return text;
}

function boundedStrings(value, label, { pattern = ID, allowEmpty = true, maxItems = 128 } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > maxItems) {
    throw new ValidationError(`${label} must contain ${allowEmpty ? '0' : '1'}-${maxItems} values`);
  }
  const normalized = value.map((item, index) => assertString(item, `${label}[${index}]`, {
    max: 160,
    pattern
  }));
  if (normalized.some(item => item === '*')) {
    throw new ValidationError(`${label} may not contain wildcards`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationError(`${label} may not contain duplicates`);
  }
  return [...normalized].sort();
}

export function validateHumanAuthorityAttestorProfile(raw) {
  const profile = assertPlainObject(raw, 'human authority attestor profile');
  if (profile.schema !== HUMAN_AUTHORITY_ATTESTOR_PROFILE_SCHEMA) {
    throw new ValidationError('Human authority attestor profile schema is unsupported');
  }
  const profileId = assertString(profile.profile_id, 'profile_id', { max: 160, pattern: ID });
  const attestorId = assertString(profile.attestor_id, 'attestor_id', { max: 160, pattern: ID });
  const attestorType = assertString(profile.attestor_type, 'attestor_type', { max: 16 });
  if (!ATTESTOR_TYPES.has(attestorType)) throw new ValidationError('Attestor type is unsupported');
  const artifactClasses = boundedStrings(profile.artifact_classes, 'artifact_classes', {
    pattern: /^[a-z][a-z0-9-]{0,63}$/,
    allowEmpty: false,
    maxItems: 3
  });
  if (artifactClasses.some(value => !ARTIFACT_CLASSES.has(value))) {
    throw new ValidationError('Attestor profile contains an unsupported artifact class');
  }
  const relationshipTypes = boundedStrings(profile.relationship_types, 'relationship_types', {
    pattern: /^[a-z][a-z0-9-]{0,127}$/
  });
  const authoritySources = boundedStrings(profile.authority_sources, 'authority_sources', {
    pattern: /^[a-z][a-z0-9-]{0,127}$/
  });
  const jurisdictions = boundedStrings(
    profile.jurisdiction_context_digests,
    'jurisdiction_context_digests',
    { pattern: DIGEST, allowEmpty: false }
  );
  const maximumAssurance = assertString(profile.maximum_assurance, 'maximum_assurance', { max: 4 });
  if (!Object.hasOwn(ASSURANCE_RANK, maximumAssurance)) {
    throw new ValidationError('Attestor maximum assurance is unsupported');
  }
  const policyDigest = assertString(profile.policy_digest, 'policy_digest', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  const evidenceDigest = assertString(profile.evidence_digest, 'evidence_digest', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  const effectiveFrom = canonicalTime(profile.effective_from, 'effective_from');
  const effectiveUntil = canonicalTime(profile.effective_until, 'effective_until', { nullable: true });
  if (effectiveUntil !== null && effectiveUntil <= effectiveFrom) {
    throw new ValidationError('Attestor effective_until must be after effective_from');
  }
  const status = assertString(profile.status, 'status', { max: 16 });
  if (!new Set(['active', 'revoked', 'superseded']).has(status)) {
    throw new ValidationError('Attestor profile status is unsupported');
  }
  return {
    schema: HUMAN_AUTHORITY_ATTESTOR_PROFILE_SCHEMA,
    profile_id: profileId,
    attestor_id: attestorId,
    attestor_type: attestorType,
    artifact_classes: artifactClasses,
    relationship_types: relationshipTypes,
    authority_sources: authoritySources,
    jurisdiction_context_digests: jurisdictions,
    maximum_assurance: maximumAssurance,
    policy_digest: policyDigest,
    evidence_digest: evidenceDigest,
    effective_from: effectiveFrom,
    effective_until: effectiveUntil,
    status
  };
}

function activeAt(profile, now) {
  return profile.status === 'active'
    && profile.effective_from <= now
    && (profile.effective_until === null || profile.effective_until > now);
}

function validatedArtifact(artifactClass, artifact) {
  if (artifactClass === 'relationship-claim') return validateRelationshipClaim(artifact);
  if (artifactClass === 'authority-grant') return validateAuthorityGrant(artifact);
  if (artifactClass === 'authority-conflict') return validateAuthorityConflict(artifact);
  throw new ValidationError('Authority artifact class is unsupported');
}

export function authorizeHumanAuthorityAttestation({
  principal,
  profile: rawProfile,
  artifactClass,
  artifact: rawArtifact,
  now = new Date().toISOString()
}) {
  const identity = assertPlainObject(principal, 'attestor principal');
  const principalId = assertString(identity.id, 'attestor principal.id', { max: 160, pattern: ID });
  const principalType = assertString(identity.type, 'attestor principal.type', { max: 16 });
  const profile = validateHumanAuthorityAttestorProfile(rawProfile);
  const canonicalNow = canonicalTime(now, 'attestation time');
  const artifactClassName = assertString(artifactClass, 'artifactClass', { max: 64 });
  const artifact = validatedArtifact(artifactClassName, rawArtifact);

  if (
    principalId !== profile.attestor_id
    || principalType !== profile.attestor_type
    || !activeAt(profile, canonicalNow)
  ) {
    return deny('authority_attestor_unavailable', 'The attestor profile is inactive or does not match the authenticated principal.');
  }
  if (!profile.artifact_classes.includes(artifactClassName)) {
    return deny('authority_attestor_artifact_denied', 'The attestor profile does not cover this artifact class.');
  }
  if (!profile.jurisdiction_context_digests.includes(artifact.jurisdiction_context_digest)) {
    return deny('authority_attestor_jurisdiction_denied', 'The attestor profile does not cover this jurisdiction context.');
  }
  const assurance = artifact.assurance ?? 'A2';
  if (!Object.hasOwn(ASSURANCE_RANK, assurance) || ASSURANCE_RANK[assurance] > ASSURANCE_RANK[profile.maximum_assurance]) {
    return deny('authority_attestor_assurance_denied', 'The artifact assurance exceeds the attestor profile ceiling.');
  }
  if (
    artifactClassName === 'relationship-claim'
    && (
      artifact.issuer_id !== profile.attestor_id
      || !profile.relationship_types.includes(artifact.relationship_type)
    )
  ) {
    return deny('authority_attestor_relationship_denied', 'The attestor profile does not authorize this relationship claim.');
  }
  if (
    artifactClassName === 'authority-grant'
    && (
      artifact.issuer_id !== profile.attestor_id
      || !profile.authority_sources.includes(artifact.authority_source)
    )
  ) {
    return deny('authority_attestor_grant_denied', 'The attestor profile does not authorize this authority source.');
  }

  const facts = {
    schema: HUMAN_AUTHORITY_ATTESTATION_FACTS_SCHEMA,
    profile_id: profile.profile_id,
    profile_digest: digestObject(profile),
    attestor_id: profile.attestor_id,
    attestor_type: profile.attestor_type,
    artifact_class: artifactClassName,
    artifact_digest: digestObject(artifact),
    jurisdiction_context_digest: artifact.jurisdiction_context_digest,
    assurance,
    policy_digest: profile.policy_digest,
    resolved_at: canonicalNow
  };
  return {
    allow: true,
    artifact,
    facts,
    attestation_digest: digestObject(facts),
    non_claims: [
      'attestor-profile-does-not-prove-legal-jurisdiction',
      'attestation-does-not-create-subject-authority',
      'attestation-does-not-create-consent'
    ]
  };
}

function deny(code, reason) {
  return { allow: false, code, reason };
}

import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import {
  CREDENTIALED_PUBLIC_JOURNAL_ATTESTATION_SCHEMA,
  PERSONA_SIGNING_CREDENTIAL_SCHEMA,
  PERSONA_SIGNING_REVOCATION_SCHEMA,
  verifyCredentialedPublicJournalAttestation,
  verifyPersonaSigningCredential,
  verifyPersonaSigningRevocation
} from './persona-journal-credential.mjs';

export const PUBLIC_WITNESS_OBSERVATION_SCHEMA = 'axiom-public-witness-observation.v1';
export const PUBLIC_WITNESS_CONFLICT_SCHEMA = 'axiom-public-witness-conflict.v1';
export const PUBLIC_WITNESS_SERVICE_SNAPSHOT_SCHEMA = 'axiom-public-witness-service-snapshot.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_POSITION = Number.MAX_SAFE_INTEGER;
const DEFAULT_MAX_ARTIFACTS = 8192;
const DEFAULT_MAX_CONFLICTS = 4096;
const HARD_MAX_ARTIFACTS = 100000;
const HARD_MAX_CONFLICTS = 100000;
const MAX_KEY_STATE_EVIDENCE = 64;

const ARTIFACT_KINDS = new Set([
  'persona-signing-credential',
  'persona-signing-revocation',
  'credentialed-public-journal-attestation'
]);
const POSITION_KINDS = new Set(['credential-epoch', 'journal-sequence']);
const KEY_STATE_STATUS = new Set(['not-applicable', 'no-contradiction-observed', 'contradicted']);
const CONFLICT_KINDS = new Set(['credential-epoch', 'journal-sequence', 'stale-key-use']);

const OBSERVATION_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'witness_signature',
  'observation_digest'
]);
const OBSERVATION_STATEMENT_KEYS = new Set([
  'domain_id',
  'witness_id',
  'witness_key_id',
  'artifact_kind',
  'artifact_schema',
  'artifact_digest',
  'persona_id',
  'persona_projection_digest',
  'persona_root_key_id',
  'credential_digest',
  'key_epoch',
  'position_kind',
  'position',
  'artifact_time',
  'observed_at',
  'key_state_status',
  'key_state_evidence_digests',
  'cryptographic_verification',
  'content_truth_claimed',
  'authorship_claimed',
  'legal_identity_claimed',
  'global_currentness_claimed',
  'finality_claimed',
  'authority_effect',
  'network_effect'
]);
const CONFLICT_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'witness_signature',
  'conflict_digest'
]);
const CONFLICT_STATEMENT_KEYS = new Set([
  'domain_id',
  'witness_id',
  'witness_key_id',
  'conflict_kind',
  'persona_id',
  'persona_projection_digest',
  'persona_root_key_id',
  'position_kind',
  'position',
  'artifact_digests',
  'observation_digests',
  'detected_at',
  'conflict_observed',
  'preferred_artifact_digest',
  'truth_resolution_claimed',
  'legal_identity_claimed',
  'finality_claimed',
  'authority_effect',
  'network_effect'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_POSITION) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function boundedInteger(value, label, fallback, max) {
  const normalized = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > max) {
    throw new ValidationError(`${label} must be a positive safe integer no greater than ${max}`);
  }
  return normalized;
}

function parsePrivateKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'private'
      ? value
      : createPrivateKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
  return key;
}

function parsePublicKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'public'
      ? value
      : createPublicKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
  return key;
}

function publicKeyId(value, label) {
  const key = parsePublicKey(value, label);
  return sha256(key.export({ type: 'spki', format: 'pem' }).toString());
}

function witnessSigner(privateKeyValue) {
  const privateKey = parsePrivateKey(privateKeyValue, 'public witness private key');
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({
    privateKey,
    publicKey,
    keyId: publicKeyId(publicKey, 'public witness public key')
  });
}

function signEnvelope({ schema, statement, privateKey, digestField }) {
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({ schema, statement, statement_digest: statementDigest });
  const witnessSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    schema,
    statement,
    statement_digest: statementDigest,
    witness_signature: witnessSignature
  });
  return Object.freeze({ ...signed, [digestField]: digestObject(signed) });
}

function verifyEnvelope(raw, {
  schema,
  keys,
  statementNormalizer,
  trustedWitnessPublicKey,
  digestField,
  label
}) {
  const value = exactKeys(raw, keys, label);
  if (value.schema !== schema) throw new ValidationError(`${label} schema is unsupported`);
  const statement = statementNormalizer(value.statement);
  const statementDigest = digest(value.statement_digest, `${label} statement_digest`);
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError(`${label} statement digest does not match canonical content`);
  }
  const witnessSignature = assertString(value.witness_signature, `${label} witness_signature`, {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  const publicKey = parsePublicKey(trustedWitnessPublicKey, `trusted ${label} public key`);
  if (publicKeyId(publicKey, `trusted ${label} public key`) !== statement.witness_key_id) {
    throw new ValidationError(`${label} witness key does not match the trusted public key`);
  }
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({ schema, statement, statement_digest: statementDigest })),
      publicKey,
      Buffer.from(witnessSignature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError(`${label} witness signature is invalid`);
  const signed = Object.freeze({
    schema,
    statement,
    statement_digest: statementDigest,
    witness_signature: witnessSignature
  });
  const objectDigest = digest(value[digestField], `${label} ${digestField}`);
  if (objectDigest !== digestObject(signed)) {
    throw new ValidationError(`${label} ${digestField} does not match canonical signed content`);
  }
  return Object.freeze({ ...signed, [digestField]: objectDigest });
}

function sortedUniqueDigests(raw, label, { min = 0, max = MAX_KEY_STATE_EVIDENCE } = {}) {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} digests`);
  }
  const values = raw.map((value, index) => digest(value, `${label}[${index}]`));
  if (new Set(values).size !== values.length) throw new ValidationError(`${label} must be unique`);
  return Object.freeze([...values].sort());
}

function normalizeObservationStatement(raw) {
  const value = exactKeys(raw, OBSERVATION_STATEMENT_KEYS, 'public witness observation statement');
  const artifactKind = assertString(value.artifact_kind, 'public witness observation artifact_kind');
  if (!ARTIFACT_KINDS.has(artifactKind)) throw new ValidationError('public witness observation artifact_kind is invalid');
  const positionKind = assertString(value.position_kind, 'public witness observation position_kind');
  if (!POSITION_KINDS.has(positionKind)) throw new ValidationError('public witness observation position_kind is invalid');
  const keyStateStatus = assertString(value.key_state_status, 'public witness observation key_state_status');
  if (!KEY_STATE_STATUS.has(keyStateStatus)) throw new ValidationError('public witness observation key_state_status is invalid');
  if (artifactKind === 'persona-signing-credential' && value.artifact_schema !== PERSONA_SIGNING_CREDENTIAL_SCHEMA) {
    throw new ValidationError('public witness credential observation schema is invalid');
  }
  if (artifactKind === 'persona-signing-revocation' && value.artifact_schema !== PERSONA_SIGNING_REVOCATION_SCHEMA) {
    throw new ValidationError('public witness revocation observation schema is invalid');
  }
  if (
    artifactKind === 'credentialed-public-journal-attestation'
    && value.artifact_schema !== CREDENTIALED_PUBLIC_JOURNAL_ATTESTATION_SCHEMA
  ) {
    throw new ValidationError('public witness journal observation schema is invalid');
  }
  if (artifactKind === 'credentialed-public-journal-attestation' && positionKind !== 'journal-sequence') {
    throw new ValidationError('public witness journal observation requires journal-sequence position');
  }
  if (artifactKind !== 'credentialed-public-journal-attestation' && positionKind !== 'credential-epoch') {
    throw new ValidationError('public witness key-state observation requires credential-epoch position');
  }
  if (artifactKind === 'credentialed-public-journal-attestation' && keyStateStatus === 'not-applicable') {
    throw new ValidationError('public witness journal observation must state key-state status');
  }
  if (artifactKind !== 'credentialed-public-journal-attestation' && keyStateStatus !== 'not-applicable') {
    throw new ValidationError('public witness key-state observation cannot claim journal key-state status');
  }
  if (value.cryptographic_verification !== true) {
    throw new ValidationError('public witness observation requires successful cryptographic verification');
  }
  if (
    value.content_truth_claimed !== false
    || value.authorship_claimed !== false
    || value.legal_identity_claimed !== false
    || value.global_currentness_claimed !== false
    || value.finality_claimed !== false
  ) {
    throw new ValidationError('public witness observation cannot claim truth, authorship, legal identity, global currentness, or finality');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError('public witness observation cannot perform authority or network effects');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness observation domain_id'),
    witness_id: identifier(value.witness_id, 'public witness observation witness_id'),
    witness_key_id: digest(value.witness_key_id, 'public witness observation witness_key_id'),
    artifact_kind: artifactKind,
    artifact_schema: assertString(value.artifact_schema, 'public witness observation artifact_schema', { min: 1, max: 192 }),
    artifact_digest: digest(value.artifact_digest, 'public witness observation artifact_digest'),
    persona_id: identifier(value.persona_id, 'public witness observation persona_id'),
    persona_projection_digest: digest(value.persona_projection_digest, 'public witness observation persona_projection_digest'),
    persona_root_key_id: digest(value.persona_root_key_id, 'public witness observation persona_root_key_id'),
    credential_digest: digest(value.credential_digest, 'public witness observation credential_digest'),
    key_epoch: positiveInteger(value.key_epoch, 'public witness observation key_epoch'),
    position_kind: positionKind,
    position: positiveInteger(value.position, 'public witness observation position'),
    artifact_time: canonicalTimestamp(value.artifact_time, 'public witness observation artifact_time'),
    observed_at: canonicalTimestamp(value.observed_at, 'public witness observation observed_at'),
    key_state_status: keyStateStatus,
    key_state_evidence_digests: sortedUniqueDigests(
      value.key_state_evidence_digests,
      'public witness observation key_state_evidence_digests'
    ),
    cryptographic_verification: true,
    content_truth_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    global_currentness_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function normalizeConflictStatement(raw) {
  const value = exactKeys(raw, CONFLICT_STATEMENT_KEYS, 'public witness conflict statement');
  const conflictKind = assertString(value.conflict_kind, 'public witness conflict conflict_kind');
  if (!CONFLICT_KINDS.has(conflictKind)) throw new ValidationError('public witness conflict_kind is invalid');
  const positionKind = assertString(value.position_kind, 'public witness conflict position_kind');
  if (!POSITION_KINDS.has(positionKind)) throw new ValidationError('public witness conflict position_kind is invalid');
  if (conflictKind === 'credential-epoch' && positionKind !== 'credential-epoch') {
    throw new ValidationError('credential-epoch conflict requires credential-epoch position');
  }
  if (conflictKind !== 'credential-epoch' && positionKind !== 'journal-sequence') {
    throw new ValidationError('journal conflict requires journal-sequence position');
  }
  if (value.conflict_observed !== true || value.preferred_artifact_digest !== null) {
    throw new ValidationError('public witness conflict must preserve the conflict without selecting a preferred artifact');
  }
  if (
    value.truth_resolution_claimed !== false
    || value.legal_identity_claimed !== false
    || value.finality_claimed !== false
  ) {
    throw new ValidationError('public witness conflict cannot claim truth resolution, legal identity, or finality');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError('public witness conflict cannot perform authority or network effects');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness conflict domain_id'),
    witness_id: identifier(value.witness_id, 'public witness conflict witness_id'),
    witness_key_id: digest(value.witness_key_id, 'public witness conflict witness_key_id'),
    conflict_kind: conflictKind,
    persona_id: identifier(value.persona_id, 'public witness conflict persona_id'),
    persona_projection_digest: digest(value.persona_projection_digest, 'public witness conflict persona_projection_digest'),
    persona_root_key_id: digest(value.persona_root_key_id, 'public witness conflict persona_root_key_id'),
    position_kind: positionKind,
    position: positiveInteger(value.position, 'public witness conflict position'),
    artifact_digests: sortedUniqueDigests(value.artifact_digests, 'public witness conflict artifact_digests', { min: 2, max: 2 }),
    observation_digests: sortedUniqueDigests(value.observation_digests, 'public witness conflict observation_digests', { min: 2, max: 2 }),
    detected_at: canonicalTimestamp(value.detected_at, 'public witness conflict detected_at'),
    conflict_observed: true,
    preferred_artifact_digest: null,
    truth_resolution_claimed: false,
    legal_identity_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function verifyPublicWitnessObservation(raw, { trustedWitnessPublicKey, expectedDomainId } = {}) {
  const verified = verifyEnvelope(raw, {
    schema: PUBLIC_WITNESS_OBSERVATION_SCHEMA,
    keys: OBSERVATION_KEYS,
    statementNormalizer: normalizeObservationStatement,
    trustedWitnessPublicKey,
    digestField: 'observation_digest',
    label: 'public witness observation'
  });
  if (expectedDomainId !== undefined && verified.statement.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness observation belongs to a different domain');
  }
  return Object.freeze({ ...verified, valid: true, witness_signature_valid: true });
}

export function verifyPublicWitnessConflict(raw, {
  trustedWitnessPublicKey,
  expectedDomainId,
  observations
} = {}) {
  const verified = verifyEnvelope(raw, {
    schema: PUBLIC_WITNESS_CONFLICT_SCHEMA,
    keys: CONFLICT_KEYS,
    statementNormalizer: normalizeConflictStatement,
    trustedWitnessPublicKey,
    digestField: 'conflict_digest',
    label: 'public witness conflict'
  });
  if (expectedDomainId !== undefined && verified.statement.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness conflict belongs to a different domain');
  }
  if (observations !== undefined) {
    if (!Array.isArray(observations) || observations.length !== 2) {
      throw new ValidationError('public witness conflict verification requires exactly two observations');
    }
    const bound = observations.map(observation => verifyPublicWitnessObservation(observation, {
      trustedWitnessPublicKey,
      expectedDomainId: verified.statement.domain_id
    }));
    const observationDigests = [...bound.map(item => item.observation_digest)].sort();
    if (observationDigests.join(',') !== verified.statement.observation_digests.join(',')) {
      throw new ValidationError('public witness conflict observation binding is invalid');
    }
    const artifactDigests = [...bound.map(item => item.statement.artifact_digest)].sort();
    if (artifactDigests.join(',') !== verified.statement.artifact_digests.join(',')) {
      throw new ValidationError('public witness conflict artifact binding is invalid');
    }
    for (const observation of bound) {
      if (
        observation.statement.persona_id !== verified.statement.persona_id
        || observation.statement.persona_projection_digest !== verified.statement.persona_projection_digest
        || observation.statement.persona_root_key_id !== verified.statement.persona_root_key_id
      ) {
        throw new ValidationError('public witness conflict persona binding is invalid');
      }
    }
  }
  return Object.freeze({ ...verified, valid: true, witness_signature_valid: true });
}

function maxTimestamp(...values) {
  return [...values].sort().at(-1);
}

function positionKey(kind, personaId, personaProjectionDigest, rootKeyId, position) {
  return `${kind}\u0000${personaId}\u0000${personaProjectionDigest}\u0000${rootKeyId}\u0000${position}`;
}

function conflictKey(kind, artifactDigests) {
  return `${kind}\u0000${[...artifactDigests].sort().join('\u0000')}`;
}

function clone(value) {
  return structuredClone(value);
}

export class PublicWitnessServiceLab {
  constructor({
    domainId,
    witnessId,
    witnessPrivateKey,
    maxArtifacts,
    maxConflicts
  } = {}) {
    this.domainId = identifier(domainId, 'public witness service domainId');
    this.witnessId = identifier(witnessId, 'public witness service witnessId');
    this.signer = witnessSigner(witnessPrivateKey);
    this.maxArtifacts = boundedInteger(maxArtifacts, 'public witness service maxArtifacts', DEFAULT_MAX_ARTIFACTS, HARD_MAX_ARTIFACTS);
    this.maxConflicts = boundedInteger(maxConflicts, 'public witness service maxConflicts', DEFAULT_MAX_CONFLICTS, HARD_MAX_CONFLICTS);
    this.artifacts = new Map();
    this.observations = new Map();
    this.positions = new Map();
    this.conflicts = new Map();
  }

  get witnessPublicKey() {
    return this.signer.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  _createObservation(statement) {
    const normalized = normalizeObservationStatement({
      ...statement,
      domain_id: this.domainId,
      witness_id: this.witnessId,
      witness_key_id: this.signer.keyId,
      cryptographic_verification: true,
      content_truth_claimed: false,
      authorship_claimed: false,
      legal_identity_claimed: false,
      global_currentness_claimed: false,
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'none'
    });
    return signEnvelope({
      schema: PUBLIC_WITNESS_OBSERVATION_SCHEMA,
      statement: normalized,
      privateKey: this.signer.privateKey,
      digestField: 'observation_digest'
    });
  }

  _createConflict({
    conflictKind,
    positionKind,
    position,
    personaId,
    personaProjectionDigest,
    personaRootKeyId,
    firstObservation,
    secondObservation,
    detectedAt
  }) {
    const normalized = normalizeConflictStatement({
      domain_id: this.domainId,
      witness_id: this.witnessId,
      witness_key_id: this.signer.keyId,
      conflict_kind: conflictKind,
      persona_id: personaId,
      persona_projection_digest: personaProjectionDigest,
      persona_root_key_id: personaRootKeyId,
      position_kind: positionKind,
      position,
      artifact_digests: [
        firstObservation.statement.artifact_digest,
        secondObservation.statement.artifact_digest
      ],
      observation_digests: [
        firstObservation.observation_digest,
        secondObservation.observation_digest
      ],
      detected_at: detectedAt,
      conflict_observed: true,
      preferred_artifact_digest: null,
      truth_resolution_claimed: false,
      legal_identity_claimed: false,
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'none'
    });
    return signEnvelope({
      schema: PUBLIC_WITNESS_CONFLICT_SCHEMA,
      statement: normalized,
      privateKey: this.signer.privateKey,
      digestField: 'conflict_digest'
    });
  }

  _positionObservations(kind, personaId, personaProjectionDigest, rootKeyId, position) {
    const key = positionKey(kind, personaId, personaProjectionDigest, rootKeyId, position);
    const digests = this.positions.get(key) ?? new Set();
    return [...digests].map(artifactDigest => this.observations.get(artifactDigest));
  }

  _knownKeyStateEvidence(credentialDigest, artifactTime) {
    const evidence = [];
    for (const record of this.artifacts.values()) {
      if (record.kind === 'persona-signing-credential') {
        const statement = record.verified.statement;
        if (
          statement.predecessor_credential_digest === credentialDigest
          && artifactTime >= statement.activated_at
        ) {
          evidence.push(record.digest);
        }
      } else if (record.kind === 'persona-signing-revocation') {
        const statement = record.verified.statement;
        if (statement.credential_digest === credentialDigest && artifactTime >= statement.effective_at) {
          evidence.push(record.digest);
        }
      }
    }
    return [...new Set(evidence)].sort();
  }

  _staleJournalObservationsForKeyState(kind, verified) {
    let credentialDigest;
    let effectiveAt;
    if (kind === 'persona-signing-credential') {
      credentialDigest = verified.statement.predecessor_credential_digest;
      effectiveAt = verified.statement.activated_at;
      if (credentialDigest === null) return [];
    } else {
      credentialDigest = verified.statement.credential_digest;
      effectiveAt = verified.statement.effective_at;
    }
    const matches = [];
    for (const observation of this.observations.values()) {
      if (
        observation.statement.artifact_kind === 'credentialed-public-journal-attestation'
        && observation.statement.credential_digest === credentialDigest
        && observation.statement.artifact_time >= effectiveAt
      ) {
        matches.push(observation);
      }
    }
    return matches;
  }

  _preparePositionConflicts(observation) {
    const kind = observation.statement.position_kind === 'credential-epoch'
      ? 'credential-epoch'
      : 'journal-sequence';
    return this._positionObservations(
      observation.statement.position_kind,
      observation.statement.persona_id,
      observation.statement.persona_projection_digest,
      observation.statement.persona_root_key_id,
      observation.statement.position
    ).filter(existing => existing.statement.artifact_digest !== observation.statement.artifact_digest)
      .map(existing => this._createConflict({
        conflictKind: kind,
        positionKind: observation.statement.position_kind,
        position: observation.statement.position,
        personaId: observation.statement.persona_id,
        personaProjectionDigest: observation.statement.persona_projection_digest,
        personaRootKeyId: observation.statement.persona_root_key_id,
        firstObservation: existing,
        secondObservation: observation,
        detectedAt: maxTimestamp(existing.statement.observed_at, observation.statement.observed_at)
      }));
  }

  _prepareStaleKeyConflicts(kind, verified, observation) {
    return this._staleJournalObservationsForKeyState(kind, verified).map(journalObservation => this._createConflict({
      conflictKind: 'stale-key-use',
      positionKind: 'journal-sequence',
      position: journalObservation.statement.position,
      personaId: journalObservation.statement.persona_id,
      personaProjectionDigest: journalObservation.statement.persona_projection_digest,
      personaRootKeyId: journalObservation.statement.persona_root_key_id,
      firstObservation: journalObservation,
      secondObservation: observation,
      detectedAt: maxTimestamp(journalObservation.statement.observed_at, observation.statement.observed_at)
    }));
  }

  _commitRecord({ raw, kind, digest: artifactDigest, verified, observation, conflicts }) {
    if (this.artifacts.size >= this.maxArtifacts) {
      throw new ValidationError('public witness service artifact capacity is exhausted');
    }
    const uniqueConflicts = [];
    for (const conflict of conflicts) {
      const key = conflictKey(conflict.statement.conflict_kind, conflict.statement.artifact_digests);
      if (!this.conflicts.has(key) && !uniqueConflicts.some(item => item.key === key)) {
        uniqueConflicts.push({ key, conflict });
      }
    }
    if (this.conflicts.size + uniqueConflicts.length > this.maxConflicts) {
      throw new ValidationError('public witness service conflict capacity is exhausted');
    }
    this.artifacts.set(artifactDigest, Object.freeze({
      kind,
      digest: artifactDigest,
      raw: clone(raw),
      verified
    }));
    this.observations.set(artifactDigest, observation);
    const key = positionKey(
      observation.statement.position_kind,
      observation.statement.persona_id,
      observation.statement.persona_projection_digest,
      observation.statement.persona_root_key_id,
      observation.statement.position
    );
    const position = this.positions.get(key) ?? new Set();
    position.add(artifactDigest);
    this.positions.set(key, position);
    for (const item of uniqueConflicts) this.conflicts.set(item.key, item.conflict);
    return uniqueConflicts.map(item => item.conflict);
  }

  _conflictsForArtifact(artifactDigest) {
    return [...this.conflicts.values()]
      .filter(conflict => conflict.statement.artifact_digests.includes(artifactDigest))
      .map(clone)
      .sort((a, b) => a.conflict_digest.localeCompare(b.conflict_digest));
  }

  _replay(artifactDigest) {
    const observation = this.observations.get(artifactDigest);
    if (!observation) return null;
    return Object.freeze({
      status: 'replay',
      observation: clone(observation),
      conflicts: this._conflictsForArtifact(artifactDigest)
    });
  }

  observeCredential(raw, { trustedPersonaRootPublicKey, observedAt } = {}) {
    const verified = verifyPersonaSigningCredential(raw, { trustedPersonaRootPublicKey });
    const artifactDigest = verified.credential_digest;
    const replay = this._replay(artifactDigest);
    if (replay) return replay;
    const observation = this._createObservation({
      artifact_kind: 'persona-signing-credential',
      artifact_schema: PERSONA_SIGNING_CREDENTIAL_SCHEMA,
      artifact_digest: artifactDigest,
      persona_id: verified.statement.persona_id,
      persona_projection_digest: verified.statement.persona_projection_digest,
      persona_root_key_id: verified.statement.root_key_id,
      credential_digest: artifactDigest,
      key_epoch: verified.statement.epoch,
      position_kind: 'credential-epoch',
      position: verified.statement.epoch,
      artifact_time: verified.statement.activated_at,
      observed_at: canonicalTimestamp(observedAt, 'public witness credential observedAt'),
      key_state_status: 'not-applicable',
      key_state_evidence_digests: []
    });
    const conflicts = [
      ...this._preparePositionConflicts(observation),
      ...this._prepareStaleKeyConflicts('persona-signing-credential', verified, observation)
    ];
    const committed = this._commitRecord({
      raw,
      kind: 'persona-signing-credential',
      digest: artifactDigest,
      verified,
      observation,
      conflicts
    });
    return Object.freeze({
      status: committed.length > 0 ? 'observed-with-conflict' : 'observed',
      observation: clone(observation),
      conflicts: committed.map(clone)
    });
  }

  observeRevocation(raw, { trustedPersonaRootPublicKey, credential, observedAt } = {}) {
    const verified = verifyPersonaSigningRevocation(raw, {
      trustedPersonaRootPublicKey,
      credential
    });
    const artifactDigest = verified.revocation_digest;
    const replay = this._replay(artifactDigest);
    if (replay) return replay;
    const observation = this._createObservation({
      artifact_kind: 'persona-signing-revocation',
      artifact_schema: PERSONA_SIGNING_REVOCATION_SCHEMA,
      artifact_digest: artifactDigest,
      persona_id: verified.statement.persona_id,
      persona_projection_digest: verified.statement.persona_projection_digest,
      persona_root_key_id: verified.statement.root_key_id,
      credential_digest: verified.statement.credential_digest,
      key_epoch: verified.statement.epoch,
      position_kind: 'credential-epoch',
      position: verified.statement.epoch,
      artifact_time: verified.statement.effective_at,
      observed_at: canonicalTimestamp(observedAt, 'public witness revocation observedAt'),
      key_state_status: 'not-applicable',
      key_state_evidence_digests: []
    });
    const conflicts = this._prepareStaleKeyConflicts('persona-signing-revocation', verified, observation);
    const committed = this._commitRecord({
      raw,
      kind: 'persona-signing-revocation',
      digest: artifactDigest,
      verified,
      observation,
      conflicts
    });
    return Object.freeze({
      status: committed.length > 0 ? 'observed-with-conflict' : 'observed',
      observation: clone(observation),
      conflicts: committed.map(clone)
    });
  }

  observeJournal(raw, {
    personaSigningCredential,
    trustedPersonaRootPublicKey,
    entry,
    publication,
    observedAt
  } = {}) {
    const verified = verifyCredentialedPublicJournalAttestation(raw, {
      personaSigningCredential,
      trustedPersonaRootPublicKey,
      entry,
      publication
    });
    const artifactDigest = verified.attestation_digest;
    const replay = this._replay(artifactDigest);
    if (replay) return replay;
    const observed = canonicalTimestamp(observedAt, 'public witness journal observedAt');
    if (observed < verified.statement.issued_at) {
      throw new ValidationError('public witness journal observation cannot predate the attestation');
    }
    const keyStateEvidence = this._knownKeyStateEvidence(
      verified.credential_digest,
      verified.statement.issued_at
    );
    const observation = this._createObservation({
      artifact_kind: 'credentialed-public-journal-attestation',
      artifact_schema: CREDENTIALED_PUBLIC_JOURNAL_ATTESTATION_SCHEMA,
      artifact_digest: artifactDigest,
      persona_id: verified.statement.persona_id,
      persona_projection_digest: verified.statement.persona_projection_digest,
      persona_root_key_id: verified.statement.persona_root_key_id,
      credential_digest: verified.credential_digest,
      key_epoch: verified.statement.persona_key_epoch,
      position_kind: 'journal-sequence',
      position: verified.statement.sequence,
      artifact_time: verified.statement.issued_at,
      observed_at: observed,
      key_state_status: keyStateEvidence.length > 0 ? 'contradicted' : 'no-contradiction-observed',
      key_state_evidence_digests: keyStateEvidence
    });
    const conflicts = this._preparePositionConflicts(observation);
    if (keyStateEvidence.length > 0) {
      for (const evidenceDigest of keyStateEvidence) {
        const evidenceObservation = this.observations.get(evidenceDigest);
        if (!evidenceObservation) continue;
        conflicts.push(this._createConflict({
          conflictKind: 'stale-key-use',
          positionKind: 'journal-sequence',
          position: observation.statement.position,
          personaId: observation.statement.persona_id,
          personaProjectionDigest: observation.statement.persona_projection_digest,
          personaRootKeyId: observation.statement.persona_root_key_id,
          firstObservation: observation,
          secondObservation: evidenceObservation,
          detectedAt: maxTimestamp(observation.statement.observed_at, evidenceObservation.statement.observed_at)
        }));
      }
    }
    const committed = this._commitRecord({
      raw,
      kind: 'credentialed-public-journal-attestation',
      digest: artifactDigest,
      verified,
      observation,
      conflicts
    });
    return Object.freeze({
      status: committed.length > 0 ? 'observed-with-conflict' : 'observed',
      observation: clone(observation),
      conflicts: committed.map(clone)
    });
  }

  getArtifact(artifactDigest) {
    const normalized = digest(artifactDigest, 'public witness artifact digest');
    const record = this.artifacts.get(normalized);
    return record ? clone(record.raw) : null;
  }

  getObservation(artifactDigest) {
    const normalized = digest(artifactDigest, 'public witness artifact digest');
    const observation = this.observations.get(normalized);
    return observation ? clone(observation) : null;
  }

  listPosition({ positionKind, personaId, personaProjectionDigest, personaRootKeyId, position } = {}) {
    const normalizedKind = assertString(positionKind, 'public witness positionKind');
    if (!POSITION_KINDS.has(normalizedKind)) throw new ValidationError('public witness positionKind is invalid');
    const observations = this._positionObservations(
      normalizedKind,
      identifier(personaId, 'public witness personaId'),
      digest(personaProjectionDigest, 'public witness personaProjectionDigest'),
      digest(personaRootKeyId, 'public witness personaRootKeyId'),
      positiveInteger(position, 'public witness position')
    );
    return observations.map(clone).sort((a, b) => a.statement.artifact_digest.localeCompare(b.statement.artifact_digest));
  }

  listConflicts() {
    return [...this.conflicts.values()].map(clone).sort((a, b) => a.conflict_digest.localeCompare(b.conflict_digest));
  }

  snapshot() {
    const observations = [...this.observations.values()]
      .map(clone)
      .sort((a, b) => a.observation_digest.localeCompare(b.observation_digest));
    const conflicts = this.listConflicts();
    const body = Object.freeze({
      schema: PUBLIC_WITNESS_SERVICE_SNAPSHOT_SCHEMA,
      domain_id: this.domainId,
      witness_id: this.witnessId,
      witness_key_id: this.signer.keyId,
      artifact_count: observations.length,
      conflict_count: conflicts.length,
      observation_digests: observations.map(item => item.observation_digest),
      conflict_digests: conflicts.map(item => item.conflict_digest),
      global_currentness_claimed: false,
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'none'
    });
    return Object.freeze({ ...body, snapshot_digest: digestObject(body) });
  }
}

export function createPublicWitnessServiceLab(options) {
  return new PublicWitnessServiceLab(options);
}

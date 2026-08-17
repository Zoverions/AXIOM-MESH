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
  SOCIAL_PUBLICATION_SCHEMA,
  SOCIAL_PUBLICATION_TRANSITION_SCHEMA,
  validateSocialPublicationProjection,
  validateSocialPublicationRetraction
} from './social-publication.mjs';

export const PUBLIC_JOURNAL_ATTESTATION_SCHEMA = 'axiom-social-public-journal-attestation.v1';
export const PUBLIC_WITNESS_RECEIPT_SCHEMA = 'axiom-public-witness-receipt.v1';
export const PUBLIC_WITNESS_CHECKPOINT_SCHEMA = 'axiom-public-witness-checkpoint.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;
const MAX_CHECKPOINT_RECEIPTS = 4096;

const JOURNAL_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'signature',
  'attestation_digest'
]);
const JOURNAL_STATEMENT_KEYS = new Set([
  'entry_type',
  'entry_schema',
  'entry_digest',
  'persona_id',
  'persona_projection_digest',
  'persona_key_id',
  'sequence',
  'previous_attestation_digest',
  'issued_at',
  'public_audience',
  'content_truth_claimed',
  'authorship_claimed',
  'legal_identity_claimed',
  'authority_effect',
  'network_effect'
]);
const RECEIPT_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'signature',
  'receipt_digest'
]);
const RECEIPT_STATEMENT_KEYS = new Set([
  'domain_id',
  'witness_id',
  'witness_key_id',
  'journal_attestation_digest',
  'entry_digest',
  'persona_id',
  'persona_projection_digest',
  'sequence',
  'observed_at',
  'persona_signature_verified',
  'content_truth_claimed',
  'authorship_claimed',
  'legal_identity_claimed',
  'finality_claimed',
  'authority_effect',
  'network_effect'
]);
const CHECKPOINT_KEYS = new Set([
  'schema',
  'domain_id',
  'epoch',
  'height',
  'previous_checkpoint_digest',
  'receipt_count',
  'receipts_root',
  'created_at',
  'finality',
  'consensus_claimed',
  'data_availability_claimed',
  'authority_effect',
  'network_effect',
  'checkpoint_digest'
]);

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field ${key}`);
    }
  }
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const date = new Date(text);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function safePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SEQUENCE) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
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
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
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
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
  return key;
}

function publicKeyId(key) {
  const pem = key.export({ type: 'spki', format: 'pem' }).toString();
  return sha256(pem);
}

function derivedSigningKey(privateKeyValue, label) {
  const privateKey = parsePrivateKey(privateKeyValue, `${label} private key`);
  const publicKey = createPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    keyId: publicKeyId(publicKey)
  };
}

function signedEnvelope(schema, statement, privateKey, digestField) {
  const statementDigest = digestObject(statement);
  const envelope = Object.freeze({
    schema,
    statement_digest: statementDigest,
    statement
  });
  const signature = sign(
    null,
    Buffer.from(canonicalJson(envelope)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    schema,
    statement,
    statement_digest: statementDigest,
    signature
  });
  return Object.freeze({
    ...signed,
    [digestField]: digestObject(signed)
  });
}

function verifySignedEnvelope(value, {
  schema,
  keys,
  label,
  trustedPublicKey,
  keyId,
  digestField
}) {
  const input = assertPlainObject(value, label);
  assertExactKeys(input, keys, label);
  if (input.schema !== schema) {
    throw new ValidationError(`${label} schema is unsupported`);
  }
  const statementDigest = digest(input.statement_digest, `${label} statement_digest`);
  if (statementDigest !== digestObject(input.statement)) {
    throw new ValidationError(`${label} statement digest does not match canonical content`);
  }
  const signature = assertString(input.signature, `${label} signature`, {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  const publicKey = parsePublicKey(trustedPublicKey, `trusted ${label} public key`);
  if (publicKeyId(publicKey) !== keyId) {
    throw new ValidationError(`${label} signing key does not match the trusted public key`);
  }
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema,
        statement_digest: statementDigest,
        statement: input.statement
      })),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new ValidationError(`${label} signature is invalid`);
  }
  const signed = Object.freeze({
    schema,
    statement: input.statement,
    statement_digest: statementDigest,
    signature
  });
  const objectDigest = digest(input[digestField], `${label} ${digestField}`);
  if (objectDigest !== digestObject(signed)) {
    throw new ValidationError(`${label} ${digestField} does not match canonical signed content`);
  }
  return Object.freeze({ ...signed, [digestField]: objectDigest });
}

function normalizeJournalStatement(raw) {
  const value = assertPlainObject(raw, 'public journal statement');
  assertExactKeys(value, JOURNAL_STATEMENT_KEYS, 'public journal statement');
  if (!['publication', 'retraction'].includes(value.entry_type)) {
    throw new ValidationError('public journal entry_type must be publication or retraction');
  }
  const expectedSchema = value.entry_type === 'publication'
    ? SOCIAL_PUBLICATION_SCHEMA
    : SOCIAL_PUBLICATION_TRANSITION_SCHEMA;
  if (value.entry_schema !== expectedSchema) {
    throw new ValidationError('public journal entry_schema does not match entry_type');
  }
  const sequence = safePositiveInteger(value.sequence, 'public journal sequence');
  const previous = nullableDigest(
    value.previous_attestation_digest,
    'public journal previous_attestation_digest'
  );
  if ((sequence === 1) !== (previous === null)) {
    throw new ValidationError('public journal sequence 1 requires a null predecessor and later entries require one');
  }
  if (value.public_audience !== true) {
    throw new ValidationError('public journal attestation is restricted to public-audience social history');
  }
  if (
    value.content_truth_claimed !== false
    || value.authorship_claimed !== false
    || value.legal_identity_claimed !== false
  ) {
    throw new ValidationError('public journal attestation cannot claim truth, authorship, or legal identity');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError('public journal attestation cannot perform authority or network effects');
  }
  return Object.freeze({
    entry_type: value.entry_type,
    entry_schema: expectedSchema,
    entry_digest: digest(value.entry_digest, 'public journal entry_digest'),
    persona_id: identifier(value.persona_id, 'public journal persona_id'),
    persona_projection_digest: digest(
      value.persona_projection_digest,
      'public journal persona_projection_digest'
    ),
    persona_key_id: digest(value.persona_key_id, 'public journal persona_key_id'),
    sequence,
    previous_attestation_digest: previous,
    issued_at: canonicalTimestamp(value.issued_at, 'public journal issued_at'),
    public_audience: true,
    content_truth_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function validatePublicPublication(raw) {
  const publication = validateSocialPublicationProjection(raw);
  if (publication.audience.mode !== 'public') {
    throw new ValidationError('public witness layer accepts only public-audience publications');
  }
  return publication;
}

function validateRetractionEntry(raw, publicationRaw) {
  const transition = validateSocialPublicationRetraction(raw);
  const publication = validatePublicPublication(publicationRaw);
  if (transition.publication_digest !== publication.projection_digest) {
    throw new ValidationError('public retraction does not target the supplied public publication');
  }
  if (
    transition.persona_id !== publication.persona_id
    || transition.persona_projection_digest !== publication.persona_projection_digest
  ) {
    throw new ValidationError('public retraction persona binding does not match the supplied publication');
  }
  return { transition, publication };
}

function verifyJournalSignatureOnly(raw, trustedPersonaPublicKey) {
  const value = assertPlainObject(raw, 'public journal attestation');
  const statement = normalizeJournalStatement(value.statement);
  const verified = verifySignedEnvelope(value, {
    schema: PUBLIC_JOURNAL_ATTESTATION_SCHEMA,
    keys: JOURNAL_KEYS,
    label: 'public journal attestation',
    trustedPublicKey: trustedPersonaPublicKey,
    keyId: statement.persona_key_id,
    digestField: 'attestation_digest'
  });
  return Object.freeze({
    ...verified,
    statement
  });
}

function createJournalAttestation({
  entryType,
  entrySchema,
  entryDigest,
  personaId,
  personaProjectionDigest,
  eventTime,
  personaPrivateKey,
  previousAttestation,
  issuedAt
}) {
  const signer = derivedSigningKey(personaPrivateKey, 'persona journal');
  let previous = null;
  if (previousAttestation !== null && previousAttestation !== undefined) {
    previous = verifyJournalSignatureOnly(previousAttestation, signer.publicKey);
    if (
      previous.statement.persona_id !== personaId
      || previous.statement.persona_projection_digest !== personaProjectionDigest
      || previous.statement.persona_key_id !== signer.keyId
    ) {
      throw new ValidationError('public journal predecessor belongs to a different persona or signing key');
    }
  }
  const issued = canonicalTimestamp(issuedAt, 'public journal issued_at');
  if (issued < eventTime) {
    throw new ValidationError('public journal attestation cannot predate the social entry');
  }
  if (previous && issued < previous.statement.issued_at) {
    throw new ValidationError('public journal attestation cannot predate its predecessor');
  }
  const statement = normalizeJournalStatement({
    entry_type: entryType,
    entry_schema: entrySchema,
    entry_digest: entryDigest,
    persona_id: personaId,
    persona_projection_digest: personaProjectionDigest,
    persona_key_id: signer.keyId,
    sequence: previous ? previous.statement.sequence + 1 : 1,
    previous_attestation_digest: previous ? previous.attestation_digest : null,
    issued_at: issued,
    public_audience: true,
    content_truth_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  return signedEnvelope(
    PUBLIC_JOURNAL_ATTESTATION_SCHEMA,
    statement,
    signer.privateKey,
    'attestation_digest'
  );
}

export function createPersonaPublicationAttestation(publicationRaw, {
  personaPrivateKey,
  previousAttestation = null,
  issuedAt
} = {}) {
  const publication = validatePublicPublication(publicationRaw);
  return createJournalAttestation({
    entryType: 'publication',
    entrySchema: SOCIAL_PUBLICATION_SCHEMA,
    entryDigest: publication.projection_digest,
    personaId: publication.persona_id,
    personaProjectionDigest: publication.persona_projection_digest,
    eventTime: publication.created_at,
    personaPrivateKey,
    previousAttestation,
    issuedAt
  });
}

export function createPersonaRetractionAttestation(retractionRaw, {
  publication,
  personaPrivateKey,
  previousAttestation = null,
  issuedAt
} = {}) {
  const validated = validateRetractionEntry(retractionRaw, publication);
  return createJournalAttestation({
    entryType: 'retraction',
    entrySchema: SOCIAL_PUBLICATION_TRANSITION_SCHEMA,
    entryDigest: validated.transition.transition_digest,
    personaId: validated.transition.persona_id,
    personaProjectionDigest: validated.transition.persona_projection_digest,
    eventTime: validated.transition.occurred_at,
    personaPrivateKey,
    previousAttestation,
    issuedAt
  });
}

export function verifyPublicJournalAttestation(raw, {
  trustedPersonaPublicKey,
  entry,
  publication
} = {}) {
  const verified = verifyJournalSignatureOnly(raw, trustedPersonaPublicKey);
  const statement = verified.statement;
  if (statement.entry_type === 'publication') {
    const projected = validatePublicPublication(entry);
    if (
      statement.entry_digest !== projected.projection_digest
      || statement.persona_id !== projected.persona_id
      || statement.persona_projection_digest !== projected.persona_projection_digest
    ) {
      throw new ValidationError('public journal publication binding is invalid');
    }
    if (statement.issued_at < projected.created_at) {
      throw new ValidationError('public journal publication attestation predates the publication');
    }
  } else {
    const validated = validateRetractionEntry(entry, publication);
    if (
      statement.entry_digest !== validated.transition.transition_digest
      || statement.persona_id !== validated.transition.persona_id
      || statement.persona_projection_digest !== validated.transition.persona_projection_digest
    ) {
      throw new ValidationError('public journal retraction binding is invalid');
    }
    if (statement.issued_at < validated.transition.occurred_at) {
      throw new ValidationError('public journal retraction attestation predates the transition');
    }
  }
  return Object.freeze({
    valid: true,
    schema: verified.schema,
    statement,
    statement_digest: verified.statement_digest,
    attestation_digest: verified.attestation_digest,
    persona_key_signature_valid: true,
    content_truth_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function validatePublicJournalContinuity(previousRaw, currentRaw, {
  trustedPersonaPublicKey
} = {}) {
  const previous = verifyJournalSignatureOnly(previousRaw, trustedPersonaPublicKey);
  const current = verifyJournalSignatureOnly(currentRaw, trustedPersonaPublicKey);
  if (
    current.statement.persona_id !== previous.statement.persona_id
    || current.statement.persona_projection_digest !== previous.statement.persona_projection_digest
    || current.statement.persona_key_id !== previous.statement.persona_key_id
  ) {
    throw new ValidationError('public journal continuity cannot cross persona or signing-key bindings');
  }
  if (current.statement.sequence !== previous.statement.sequence + 1) {
    throw new ValidationError('public journal continuity requires the next sequence number');
  }
  if (current.statement.previous_attestation_digest !== previous.attestation_digest) {
    throw new ValidationError('public journal continuity predecessor digest is invalid');
  }
  if (current.statement.issued_at < previous.statement.issued_at) {
    throw new ValidationError('public journal continuity cannot move backward in issued time');
  }
  return Object.freeze({
    valid: true,
    persona_id: current.statement.persona_id,
    persona_projection_digest: current.statement.persona_projection_digest,
    persona_key_id: current.statement.persona_key_id,
    previous_sequence: previous.statement.sequence,
    current_sequence: current.statement.sequence,
    previous_attestation_digest: previous.attestation_digest,
    current_attestation_digest: current.attestation_digest
  });
}

function normalizeReceiptStatement(raw) {
  const value = assertPlainObject(raw, 'public witness receipt statement');
  assertExactKeys(value, RECEIPT_STATEMENT_KEYS, 'public witness receipt statement');
  if (value.persona_signature_verified !== true) {
    throw new ValidationError('public witness receipt requires verified persona signature evidence');
  }
  if (
    value.content_truth_claimed !== false
    || value.authorship_claimed !== false
    || value.legal_identity_claimed !== false
    || value.finality_claimed !== false
  ) {
    throw new ValidationError('public witness receipt cannot claim truth, authorship, legal identity, or finality');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError('public witness receipt cannot perform authority or network effects');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness domain_id'),
    witness_id: identifier(value.witness_id, 'public witness witness_id'),
    witness_key_id: digest(value.witness_key_id, 'public witness witness_key_id'),
    journal_attestation_digest: digest(
      value.journal_attestation_digest,
      'public witness journal_attestation_digest'
    ),
    entry_digest: digest(value.entry_digest, 'public witness entry_digest'),
    persona_id: identifier(value.persona_id, 'public witness persona_id'),
    persona_projection_digest: digest(
      value.persona_projection_digest,
      'public witness persona_projection_digest'
    ),
    sequence: safePositiveInteger(value.sequence, 'public witness sequence'),
    observed_at: canonicalTimestamp(value.observed_at, 'public witness observed_at'),
    persona_signature_verified: true,
    content_truth_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function createPublicWitnessReceipt(attestationRaw, {
  trustedPersonaPublicKey,
  entry,
  publication,
  domainId,
  witnessId,
  witnessPrivateKey,
  observedAt
} = {}) {
  const attestation = verifyPublicJournalAttestation(attestationRaw, {
    trustedPersonaPublicKey,
    entry,
    publication
  });
  const signer = derivedSigningKey(witnessPrivateKey, 'public witness');
  const observed = canonicalTimestamp(observedAt, 'public witness observed_at');
  if (observed < attestation.statement.issued_at) {
    throw new ValidationError('public witness receipt cannot predate the journal attestation');
  }
  const statement = normalizeReceiptStatement({
    domain_id: domainId,
    witness_id: witnessId,
    witness_key_id: signer.keyId,
    journal_attestation_digest: attestation.attestation_digest,
    entry_digest: attestation.statement.entry_digest,
    persona_id: attestation.statement.persona_id,
    persona_projection_digest: attestation.statement.persona_projection_digest,
    sequence: attestation.statement.sequence,
    observed_at: observed,
    persona_signature_verified: true,
    content_truth_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  return signedEnvelope(
    PUBLIC_WITNESS_RECEIPT_SCHEMA,
    statement,
    signer.privateKey,
    'receipt_digest'
  );
}

export function verifyPublicWitnessReceipt(raw, {
  trustedWitnessPublicKey,
  expectedDomainId,
  attestation,
  trustedPersonaPublicKey,
  entry,
  publication
} = {}) {
  const value = assertPlainObject(raw, 'public witness receipt');
  const statement = normalizeReceiptStatement(value.statement);
  const verified = verifySignedEnvelope(value, {
    schema: PUBLIC_WITNESS_RECEIPT_SCHEMA,
    keys: RECEIPT_KEYS,
    label: 'public witness receipt',
    trustedPublicKey: trustedWitnessPublicKey,
    keyId: statement.witness_key_id,
    digestField: 'receipt_digest'
  });
  if (expectedDomainId !== undefined && statement.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness receipt domain does not match the expected domain');
  }
  const journal = verifyPublicJournalAttestation(attestation, {
    trustedPersonaPublicKey,
    entry,
    publication
  });
  if (
    statement.journal_attestation_digest !== journal.attestation_digest
    || statement.entry_digest !== journal.statement.entry_digest
    || statement.persona_id !== journal.statement.persona_id
    || statement.persona_projection_digest !== journal.statement.persona_projection_digest
    || statement.sequence !== journal.statement.sequence
  ) {
    throw new ValidationError('public witness receipt does not bind the supplied journal attestation');
  }
  if (statement.observed_at < journal.statement.issued_at) {
    throw new ValidationError('public witness receipt predates the supplied journal attestation');
  }
  return Object.freeze({
    valid: true,
    schema: verified.schema,
    statement,
    statement_digest: verified.statement_digest,
    receipt_digest: verified.receipt_digest,
    witness_signature_valid: true,
    persona_signature_verified: true,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function normalizedReceiptDigests(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_CHECKPOINT_RECEIPTS) {
    throw new ValidationError(
      `public witness checkpoint requires 1-${MAX_CHECKPOINT_RECEIPTS} receipt digests`
    );
  }
  const digests = values.map((value, index) => digest(
    value,
    `public witness receipt_digests[${index}]`
  ));
  if (new Set(digests).size !== digests.length) {
    throw new ValidationError('public witness checkpoint cannot contain duplicate receipt digests');
  }
  return Object.freeze(digests.sort());
}

export function computePublicWitnessReceiptsRoot(receiptDigests) {
  let level = normalizedReceiptDigests(receiptDigests).map(item => (
    sha256(`axiom-public-witness-leaf.v1\u0000${item}`)
  ));
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(sha256(`axiom-public-witness-node.v1\u0000${left}\u0000${right}`));
    }
    level = next;
  }
  return level[0];
}

function normalizeCheckpointBody(raw) {
  const value = assertPlainObject(raw, 'public witness checkpoint');
  assertExactKeys(value, CHECKPOINT_KEYS, 'public witness checkpoint');
  if (value.schema !== PUBLIC_WITNESS_CHECKPOINT_SCHEMA) {
    throw new ValidationError('public witness checkpoint schema is unsupported');
  }
  const epoch = safePositiveInteger(value.epoch, 'public witness checkpoint epoch');
  const height = safePositiveInteger(value.height, 'public witness checkpoint height');
  const previous = nullableDigest(
    value.previous_checkpoint_digest,
    'public witness previous_checkpoint_digest'
  );
  if ((height === 1) !== (previous === null)) {
    throw new ValidationError('public witness checkpoint height 1 requires a null predecessor and later heights require one');
  }
  const receiptCount = safePositiveInteger(
    value.receipt_count,
    'public witness checkpoint receipt_count'
  );
  if (receiptCount > MAX_CHECKPOINT_RECEIPTS) {
    throw new ValidationError('public witness checkpoint receipt_count exceeds the supported bound');
  }
  if (
    value.finality !== 'unfinalized'
    || value.consensus_claimed !== false
    || value.data_availability_claimed !== false
  ) {
    throw new ValidationError('public witness checkpoint is commitment-only and cannot claim finality, consensus, or data availability');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError('public witness checkpoint cannot perform authority or network effects');
  }
  return Object.freeze({
    schema: PUBLIC_WITNESS_CHECKPOINT_SCHEMA,
    domain_id: identifier(value.domain_id, 'public witness checkpoint domain_id'),
    epoch,
    height,
    previous_checkpoint_digest: previous,
    receipt_count: receiptCount,
    receipts_root: digest(value.receipts_root, 'public witness checkpoint receipts_root'),
    created_at: canonicalTimestamp(value.created_at, 'public witness checkpoint created_at'),
    finality: 'unfinalized',
    consensus_claimed: false,
    data_availability_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function createPublicWitnessCheckpoint({
  domainId,
  epoch,
  height,
  previousCheckpointDigest = null,
  receiptDigests,
  createdAt
} = {}) {
  const receipts = normalizedReceiptDigests(receiptDigests);
  const body = normalizeCheckpointBody({
    schema: PUBLIC_WITNESS_CHECKPOINT_SCHEMA,
    domain_id: domainId,
    epoch,
    height,
    previous_checkpoint_digest: previousCheckpointDigest,
    receipt_count: receipts.length,
    receipts_root: computePublicWitnessReceiptsRoot(receipts),
    created_at: createdAt,
    finality: 'unfinalized',
    consensus_claimed: false,
    data_availability_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  return Object.freeze({
    ...body,
    checkpoint_digest: digestObject(body)
  });
}

export function validatePublicWitnessCheckpoint(raw, { receiptDigests } = {}) {
  const value = assertPlainObject(raw, 'public witness checkpoint');
  const body = normalizeCheckpointBody(value);
  const receipts = normalizedReceiptDigests(receiptDigests);
  if (body.receipt_count !== receipts.length) {
    throw new ValidationError('public witness checkpoint receipt_count does not match supplied receipts');
  }
  if (body.receipts_root !== computePublicWitnessReceiptsRoot(receipts)) {
    throw new ValidationError('public witness checkpoint receipts_root does not match supplied receipts');
  }
  const checkpointDigest = digest(
    value.checkpoint_digest,
    'public witness checkpoint checkpoint_digest'
  );
  if (checkpointDigest !== digestObject(body)) {
    throw new ValidationError('public witness checkpoint digest does not match canonical content');
  }
  return Object.freeze({
    valid: true,
    ...body,
    checkpoint_digest: checkpointDigest
  });
}

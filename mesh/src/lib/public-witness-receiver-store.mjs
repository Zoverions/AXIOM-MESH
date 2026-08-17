import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  stat
} from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import {
  PUBLIC_WITNESS_SOURCE_EQUIVOCATION_SCHEMA,
  createPublicWitnessTransferReceipt,
  detectPublicWitnessSourceEquivocation,
  validatePublicWitnessSourceAdmission,
  verifyPublicWitnessTransferEnvelope,
  verifyPublicWitnessTransferPackage,
  verifyPublicWitnessTransferReceipt
} from './public-witness-transfer.mjs';

export const PUBLIC_WITNESS_RECEIVER_RECORD_SCHEMA = 'axiom-public-witness-receiver-record.v1';
export const PUBLIC_WITNESS_RECEIVER_SNAPSHOT_SCHEMA = 'axiom-public-witness-receiver-snapshot.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const RECORD_KINDS = new Set(['source-admission', 'transfer-intake', 'observation-commit']);
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;
const DEFAULT_MAX_STATE_BYTES = 128 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 8 * 1024 * 1024;
const HARD_MAX_RECORD_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_SOURCES = 4096;
const HARD_MAX_SOURCES = 65536;
const DEFAULT_MAX_TRANSFERS = 100000;
const HARD_MAX_TRANSFERS = 1000000;

const RECORD_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'payload',
  'witness_signature',
  'record_digest'
]);
const STATEMENT_KEYS = new Set([
  'domain_id',
  'witness_id',
  'witness_key_id',
  'sequence',
  'previous_record_digest',
  'record_kind',
  'payload_digest',
  'recorded_at',
  'persona_root_trust_effect',
  'social_authority_effect',
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

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
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
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SEQUENCE) {
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

function witnessSigningKey(privateKeyValue) {
  const privateKey = parsePrivateKey(privateKeyValue, 'public witness receiver private key');
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({
    privateKey,
    publicKey,
    keyId: publicKeyId(publicKey, 'public witness receiver public key')
  });
}

function normalizeStatement(raw) {
  const value = exactKeys(raw, STATEMENT_KEYS, 'public witness receiver record statement');
  const sequence = positiveInteger(value.sequence, 'public witness receiver record sequence');
  const previous = nullableDigest(
    value.previous_record_digest,
    'public witness receiver previous_record_digest'
  );
  if ((sequence === 1) !== (previous === null)) {
    throw new ValidationError('public witness receiver first record requires null predecessor and later records require one');
  }
  const recordKind = assertString(value.record_kind, 'public witness receiver record_kind');
  if (!RECORD_KINDS.has(recordKind)) throw new ValidationError('public witness receiver record_kind is unsupported');
  if (
    value.persona_root_trust_effect !== 'none'
    || value.social_authority_effect !== 'none'
    || value.finality_claimed !== false
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError('public witness receiver record cannot expand trust, social authority, finality, authority, or networking');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness receiver domain_id'),
    witness_id: identifier(value.witness_id, 'public witness receiver witness_id'),
    witness_key_id: digest(value.witness_key_id, 'public witness receiver witness_key_id'),
    sequence,
    previous_record_digest: previous,
    record_kind: recordKind,
    payload_digest: digest(value.payload_digest, 'public witness receiver payload_digest'),
    recorded_at: canonicalTimestamp(value.recorded_at, 'public witness receiver recorded_at'),
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function normalizeAdmissionPayload(raw) {
  const value = exactKeys(
    raw,
    new Set(['admission', 'admitted_at', 'supersedes_admission_digest']),
    'public witness receiver source-admission payload'
  );
  const admission = validatePublicWitnessSourceAdmission(value.admission);
  const admittedAt = canonicalTimestamp(value.admitted_at, 'public witness receiver admitted_at');
  const supersedes = nullableDigest(
    value.supersedes_admission_digest,
    'public witness receiver supersedes_admission_digest'
  );
  return Object.freeze({
    admission,
    admitted_at: admittedAt,
    supersedes_admission_digest: supersedes
  });
}

function normalizeIntakePayload(raw) {
  const value = exactKeys(
    raw,
    new Set([
      'source_admission_digest',
      'transfer',
      'transfer_receipt',
      'received_at',
      'intake_status',
      'source_equivocation_evidence'
    ]),
    'public witness receiver transfer-intake payload'
  );
  const sourceAdmissionDigest = digest(
    value.source_admission_digest,
    'public witness receiver source_admission_digest'
  );
  const transfer = assertPlainObject(value.transfer, 'public witness receiver transfer');
  const receipt = assertPlainObject(value.transfer_receipt, 'public witness receiver transfer_receipt');
  const receivedAt = canonicalTimestamp(value.received_at, 'public witness receiver received_at');
  if (!['accepted', 'equivocation'].includes(value.intake_status)) {
    throw new ValidationError('public witness receiver intake_status is invalid');
  }
  let equivocation = null;
  if (value.source_equivocation_evidence !== null) {
    equivocation = assertPlainObject(
      value.source_equivocation_evidence,
      'public witness receiver source_equivocation_evidence'
    );
    if (equivocation.schema !== PUBLIC_WITNESS_SOURCE_EQUIVOCATION_SCHEMA) {
      throw new ValidationError('public witness receiver source equivocation schema is invalid');
    }
  }
  if ((value.intake_status === 'equivocation') !== (equivocation !== null)) {
    throw new ValidationError('public witness receiver equivocation intake must carry exact equivocation evidence');
  }
  return Object.freeze({
    source_admission_digest: sourceAdmissionDigest,
    transfer,
    transfer_receipt: receipt,
    received_at: receivedAt,
    intake_status: value.intake_status,
    source_equivocation_evidence: equivocation
  });
}

function normalizeCommitPayload(raw) {
  const value = exactKeys(
    raw,
    new Set([
      'transfer_digest',
      'transfer_receipt_digest',
      'observation_digest',
      'witness_durable_record_digest',
      'observation_committed_at',
      'reconciled_after_restart'
    ]),
    'public witness receiver observation-commit payload'
  );
  if (typeof value.reconciled_after_restart !== 'boolean') {
    throw new ValidationError('public witness receiver reconciled_after_restart must be boolean');
  }
  return Object.freeze({
    transfer_digest: digest(value.transfer_digest, 'public witness receiver transfer_digest'),
    transfer_receipt_digest: digest(
      value.transfer_receipt_digest,
      'public witness receiver transfer_receipt_digest'
    ),
    observation_digest: digest(value.observation_digest, 'public witness receiver observation_digest'),
    witness_durable_record_digest: digest(
      value.witness_durable_record_digest,
      'public witness receiver witness_durable_record_digest'
    ),
    observation_committed_at: canonicalTimestamp(
      value.observation_committed_at,
      'public witness receiver observation_committed_at'
    ),
    reconciled_after_restart: value.reconciled_after_restart
  });
}

function normalizePayload(kind, raw) {
  if (kind === 'source-admission') return normalizeAdmissionPayload(raw);
  if (kind === 'transfer-intake') return normalizeIntakePayload(raw);
  if (kind === 'observation-commit') return normalizeCommitPayload(raw);
  throw new ValidationError('public witness receiver payload kind is unsupported');
}

function signedRecord(statement, payload, privateKey) {
  const normalizedStatement = normalizeStatement(statement);
  const normalizedPayload = normalizePayload(normalizedStatement.record_kind, payload);
  if (normalizedStatement.payload_digest !== digestObject(normalizedPayload)) {
    throw new ValidationError('public witness receiver payload digest does not match payload');
  }
  const statementDigest = digestObject(normalizedStatement);
  const signable = Object.freeze({
    schema: PUBLIC_WITNESS_RECEIVER_RECORD_SCHEMA,
    statement: normalizedStatement,
    statement_digest: statementDigest,
    payload: normalizedPayload
  });
  const witnessSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({ ...signable, witness_signature: witnessSignature });
  return Object.freeze({ ...signed, record_digest: digestObject(signed) });
}

export function verifyPublicWitnessReceiverRecord(raw, {
  trustedWitnessPublicKey,
  expectedDomainId,
  expectedWitnessId
} = {}) {
  const value = exactKeys(raw, RECORD_KEYS, 'public witness receiver record');
  if (value.schema !== PUBLIC_WITNESS_RECEIVER_RECORD_SCHEMA) {
    throw new ValidationError('public witness receiver record schema is unsupported');
  }
  const statement = normalizeStatement(value.statement);
  const payload = normalizePayload(statement.record_kind, value.payload);
  const statementDigest = digest(value.statement_digest, 'public witness receiver statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('public witness receiver statement digest does not match canonical content');
  }
  if (statement.payload_digest !== digestObject(payload)) {
    throw new ValidationError('public witness receiver payload digest does not match canonical payload');
  }
  const signature = assertString(value.witness_signature, 'public witness receiver witness_signature', {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  const publicKey = parsePublicKey(trustedWitnessPublicKey, 'trusted public witness receiver public key');
  if (publicKeyId(publicKey, 'trusted public witness receiver public key') !== statement.witness_key_id) {
    throw new ValidationError('public witness receiver witness key does not match trusted public key');
  }
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: PUBLIC_WITNESS_RECEIVER_RECORD_SCHEMA,
        statement,
        statement_digest: statementDigest,
        payload
      })),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('public witness receiver witness signature is invalid');
  const signed = Object.freeze({
    schema: PUBLIC_WITNESS_RECEIVER_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    payload,
    witness_signature: signature
  });
  const recordDigest = digest(value.record_digest, 'public witness receiver record_digest');
  if (recordDigest !== digestObject(signed)) {
    throw new ValidationError('public witness receiver record digest does not match signed content');
  }
  if (expectedDomainId !== undefined && statement.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness receiver record belongs to a different domain');
  }
  if (expectedWitnessId !== undefined && statement.witness_id !== expectedWitnessId) {
    throw new ValidationError('public witness receiver record belongs to a different witness');
  }
  return Object.freeze({ ...signed, record_digest: recordDigest, valid: true });
}

function sourceKey(sourceId) {
  return sourceId;
}

function sourceEpochKey(sourceId, sourceEpoch) {
  return `${sourceId}\u0000${sourceEpoch}`;
}

function sourcePositionKey(sourceId, sourceEpoch, sequence) {
  return `${sourceId}\u0000${sourceEpoch}\u0000${sequence}`;
}

function applyRecord(state, record, witnessPublicKey) {
  const kind = record.statement.record_kind;
  if (kind === 'source-admission') {
    const { admission, admitted_at: admittedAt, supersedes_admission_digest: supersedes } = record.payload;
    if (admission.domain_id !== state.domainId) {
      throw new ValidationError('public witness receiver source admission belongs to a different domain');
    }
    if (admittedAt < admission.valid_from || admittedAt >= admission.expires_at) {
      throw new ValidationError('public witness receiver source admission activation is outside admission validity');
    }
    const existingDigest = state.admissionByDigest.get(admission.admission_digest);
    if (existingDigest) throw new ValidationError('public witness receiver durable state repeats a source admission');
    const prior = state.activeSource.get(sourceKey(admission.source_id)) ?? null;
    if (!prior) {
      if (admission.source_epoch !== 1 || supersedes !== null) {
        throw new ValidationError('public witness receiver first source admission must begin at epoch 1 without predecessor');
      }
      if (state.activeSource.size >= state.maxSources) {
        throw new ValidationError('public witness receiver source capacity is exhausted');
      }
    } else {
      if (admission.source_epoch !== prior.admission.source_epoch + 1) {
        throw new ValidationError('public witness receiver source admission epoch must advance exactly one');
      }
      if (supersedes !== prior.admission.admission_digest) {
        throw new ValidationError('public witness receiver source admission must supersede the exact active admission');
      }
      if (admittedAt <= prior.admittedAt) {
        throw new ValidationError('public witness receiver source admission activation must advance in time');
      }
      prior.supersededAt = admittedAt;
    }
    const entry = {
      admission,
      admittedAt,
      supersededAt: null,
      conflicted: false,
      lastSequence: 0,
      lastTransferDigest: null,
      transferIds: new Map(),
      positions: new Map()
    };
    state.admissionByDigest.set(admission.admission_digest, entry);
    state.activeSource.set(sourceKey(admission.source_id), entry);
    state.sourceEpoch.set(sourceEpochKey(admission.source_id, admission.source_epoch), entry);
    return;
  }

  if (kind === 'transfer-intake') {
    const payload = record.payload;
    const admissionEntry = state.admissionByDigest.get(payload.source_admission_digest);
    if (!admissionEntry) {
      throw new ValidationError('public witness receiver transfer references an unknown local source admission');
    }
    const envelope = verifyPublicWitnessTransferEnvelope(payload.transfer, {
      sourceAdmission: admissionEntry.admission,
      now: new Date(payload.received_at).valueOf(),
      allowExpired: false
    });
    const receipt = verifyPublicWitnessTransferReceipt(payload.transfer_receipt, {
      trustedWitnessPublicKey: witnessPublicKey,
      now: new Date(record.statement.recorded_at).valueOf()
    });
    if (
      receipt.statement.source_admission_digest !== admissionEntry.admission.admission_digest
      || receipt.statement.transfer_digest !== envelope.transfer_digest
      || receipt.statement.transfer_id !== envelope.statement.transfer_id
      || receipt.statement.source_sequence !== envelope.statement.sequence
      || receipt.statement.operation !== envelope.statement.operation
      || receipt.statement.received_at !== payload.received_at
    ) {
      throw new ValidationError('public witness receiver transfer receipt does not bind the durable transfer intake');
    }
    if (admissionEntry.supersededAt !== null && payload.received_at >= admissionEntry.supersededAt) {
      throw new ValidationError('public witness receiver durable state accepts a stale source epoch after local rollover');
    }
    const transferIdPrior = admissionEntry.transferIds.get(envelope.statement.transfer_id);
    if (transferIdPrior && transferIdPrior !== envelope.transfer_digest) {
      throw new ValidationError('public witness receiver transfer_id is reused for a different package');
    }
    const positionKey = sourcePositionKey(
      envelope.statement.source_id,
      envelope.statement.source_epoch,
      envelope.statement.sequence
    );
    const position = state.positionTransfers.get(positionKey) ?? [];
    const sameDigest = position.some(item => item.transferDigest === envelope.transfer_digest);
    if (sameDigest) throw new ValidationError('public witness receiver durable state repeats an exact transfer intake');

    if (payload.intake_status === 'accepted') {
      if (admissionEntry.conflicted) {
        throw new ValidationError('public witness receiver cannot advance a conflicted source epoch');
      }
      if (envelope.statement.sequence !== admissionEntry.lastSequence + 1) {
        throw new ValidationError('public witness receiver accepted source sequence is not contiguous');
      }
      const expectedPrevious = admissionEntry.lastSequence === 0
        ? null
        : admissionEntry.lastTransferDigest;
      if (envelope.statement.previous_transfer_digest !== expectedPrevious) {
        throw new ValidationError('public witness receiver accepted transfer predecessor is invalid');
      }
      if (position.length !== 0) {
        throw new ValidationError('public witness receiver accepted transfer conflicts with an existing source position');
      }
      admissionEntry.lastSequence = envelope.statement.sequence;
      admissionEntry.lastTransferDigest = envelope.transfer_digest;
    } else {
      if (position.length === 0) {
        throw new ValidationError('public witness receiver equivocation must conflict with an already retained source position');
      }
      const priorTransfer = position[0].transfer;
      const evidence = detectPublicWitnessSourceEquivocation(priorTransfer, payload.transfer, {
        sourceAdmission: admissionEntry.admission,
        now: new Date(payload.received_at).valueOf()
      });
      if (!evidence || evidence.evidence_digest !== payload.source_equivocation_evidence.evidence_digest) {
        throw new ValidationError('public witness receiver source equivocation evidence does not reproduce');
      }
      admissionEntry.conflicted = true;
    }

    admissionEntry.transferIds.set(envelope.statement.transfer_id, envelope.transfer_digest);
    const intake = {
      transferDigest: envelope.transfer_digest,
      transfer: payload.transfer,
      receipt: payload.transfer_receipt,
      receiptDigest: receipt.receipt_digest,
      receivedAt: payload.received_at,
      status: 'pending-observation',
      observationDigest: null,
      durableObservationRecordDigest: null,
      observationCommittedAt: null,
      reconciledAfterRestart: false,
      sourceAdmissionDigest: admissionEntry.admission.admission_digest,
      sourceId: envelope.statement.source_id,
      sourceEpoch: envelope.statement.source_epoch,
      sourceSequence: envelope.statement.sequence,
      transferId: envelope.statement.transfer_id,
      operation: envelope.statement.operation
    };
    state.transferByDigest.set(envelope.transfer_digest, intake);
    const nextPosition = [...position, intake];
    state.positionTransfers.set(positionKey, nextPosition);
    state.transferCount += 1;
    if (state.transferCount > state.maxTransfers) {
      throw new ValidationError('public witness receiver transfer capacity is exhausted');
    }
    return;
  }

  const payload = record.payload;
  const intake = state.transferByDigest.get(payload.transfer_digest);
  if (!intake) throw new ValidationError('public witness receiver observation commit references unknown transfer');
  if (intake.status === 'observation-committed') {
    throw new ValidationError('public witness receiver durable state repeats an observation commit');
  }
  if (intake.receiptDigest !== payload.transfer_receipt_digest) {
    throw new ValidationError('public witness receiver observation commit receipt digest is invalid');
  }
  if (payload.observation_committed_at < intake.receivedAt) {
    throw new ValidationError('public witness receiver observation commit cannot predate transfer receipt');
  }
  intake.status = 'observation-committed';
  intake.observationDigest = payload.observation_digest;
  intake.durableObservationRecordDigest = payload.witness_durable_record_digest;
  intake.observationCommittedAt = payload.observation_committed_at;
  intake.reconciledAfterRestart = payload.reconciled_after_restart;
}

function rebuild(records, options) {
  const state = {
    domainId: options.domainId,
    maxSources: options.maxSources,
    maxTransfers: options.maxTransfers,
    admissionByDigest: new Map(),
    activeSource: new Map(),
    sourceEpoch: new Map(),
    positionTransfers: new Map(),
    transferByDigest: new Map(),
    transferCount: 0
  };
  let priorDigest = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = verifyPublicWitnessReceiverRecord(records[index], {
      trustedWitnessPublicKey: options.witnessPublicKey,
      expectedDomainId: options.domainId,
      expectedWitnessId: options.witnessId
    });
    if (record.statement.sequence !== index + 1) {
      throw new ValidationError('public witness receiver record sequence is not contiguous');
    }
    if (record.statement.previous_record_digest !== priorDigest) {
      throw new ValidationError('public witness receiver record predecessor chain is invalid');
    }
    if (index > 0 && record.statement.recorded_at < records[index - 1].statement.recorded_at) {
      throw new ValidationError('public witness receiver record time cannot move backward');
    }
    applyRecord(state, record, options.witnessPublicKey);
    priorDigest = record.record_digest;
  }
  return Object.freeze({ state, lastRecordDigest: priorDigest });
}

async function ensureRegularStateFile(statePath) {
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  try {
    const info = await lstat(statePath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ValidationError('public witness receiver state path must be a regular non-symlink file');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const handle = await open(statePath, 'wx', 0o600);
    await handle.close();
  }
}

async function readLines(statePath, maxStateBytes, maxRecordBytes) {
  const info = await stat(statePath);
  if (info.size > maxStateBytes) throw new ValidationError('public witness receiver state exceeds configured byte limit');
  if (info.size === 0) return [];
  const bytes = await readFile(statePath);
  if (bytes.length > maxStateBytes) throw new ValidationError('public witness receiver state exceeds configured byte limit');
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) throw new ValidationError('public witness receiver state has an incomplete trailing record');
  return text.slice(0, -1).split('\n').map((line, index) => {
    if (Buffer.byteLength(line, 'utf8') > maxRecordBytes) {
      throw new ValidationError(`public witness receiver record ${index + 1} exceeds configured byte limit`);
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ValidationError(`public witness receiver record ${index + 1} is not valid JSON`);
    }
    if (canonicalJson(parsed) !== line) {
      throw new ValidationError(`public witness receiver record ${index + 1} must use canonical JSON`);
    }
    return parsed;
  });
}

export class PublicWitnessReceiverStore {
  #statePath;
  #domainId;
  #witnessId;
  #witnessPrivateKey;
  #witnessPublicKey;
  #witnessKeyId;
  #maxStateBytes;
  #maxRecordBytes;
  #maxSources;
  #maxTransfers;
  #records;
  #state;
  #tail;

  constructor(options) {
    this.#statePath = options.statePath;
    this.#domainId = options.domainId;
    this.#witnessId = options.witnessId;
    this.#witnessPrivateKey = options.witnessPrivateKey;
    this.#witnessPublicKey = options.witnessPublicKey;
    this.#witnessKeyId = options.witnessKeyId;
    this.#maxStateBytes = options.maxStateBytes;
    this.#maxRecordBytes = options.maxRecordBytes;
    this.#maxSources = options.maxSources;
    this.#maxTransfers = options.maxTransfers;
    this.#records = options.records;
    this.#state = options.state;
    this.#tail = Promise.resolve();
  }

  get witnessPublicKey() {
    return this.#witnessPublicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  async #append(kind, payload, recordedAt) {
    const recorded = canonicalTimestamp(recordedAt, 'public witness receiver recordedAt');
    if (this.#records.length > 0 && recorded < this.#records.at(-1).statement.recorded_at) {
      throw new ValidationError('public witness receiver record time cannot move backward');
    }
    await this.#assertDiskMatchesMemory();
    const trialRecords = [...this.#records];
    const statement = normalizeStatement({
      domain_id: this.#domainId,
      witness_id: this.#witnessId,
      witness_key_id: this.#witnessKeyId,
      sequence: trialRecords.length + 1,
      previous_record_digest: trialRecords.length === 0 ? null : trialRecords.at(-1).record_digest,
      record_kind: kind,
      payload_digest: digestObject(normalizePayload(kind, payload)),
      recorded_at: recorded,
      persona_root_trust_effect: 'none',
      social_authority_effect: 'none',
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'none'
    });
    const privateKey = parsePrivateKey(this.#witnessPrivateKey, 'public witness receiver private key');
    const record = signedRecord(statement, payload, privateKey);
    trialRecords.push(record);
    const trial = rebuild(trialRecords, {
      domainId: this.#domainId,
      witnessId: this.#witnessId,
      witnessPublicKey: this.#witnessPublicKey,
      maxSources: this.#maxSources,
      maxTransfers: this.#maxTransfers
    });
    const line = `${canonicalJson(record)}\n`;
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (lineBytes > this.#maxRecordBytes) {
      throw new ValidationError('public witness receiver record exceeds configured byte limit');
    }
    const info = await stat(this.#statePath);
    if (info.size + lineBytes > this.#maxStateBytes) {
      throw new ValidationError('public witness receiver state capacity is exhausted');
    }
    const handle = await open(this.#statePath, 'a');
    try {
      await handle.writeFile(line, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    this.#records = trialRecords;
    this.#state = trial.state;
    return structuredClone(record);
  }

  async #serialized(fn) {
    const run = async () => fn();
    const result = this.#tail.then(run, run);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async #assertDiskMatchesMemory() {
    const raw = await readLines(this.#statePath, this.#maxStateBytes, this.#maxRecordBytes);
    if (raw.length !== this.#records.length) {
      throw new ValidationError('public witness receiver state changed outside the active store');
    }
    for (let index = 0; index < raw.length; index += 1) {
      const verified = verifyPublicWitnessReceiverRecord(raw[index], {
        trustedWitnessPublicKey: this.#witnessPublicKey,
        expectedDomainId: this.#domainId,
        expectedWitnessId: this.#witnessId
      });
      if (verified.record_digest !== this.#records[index].record_digest) {
        throw new ValidationError('public witness receiver state changed outside the active store');
      }
    }
  }

  async admitSource(admissionRaw, { admittedAt } = {}) {
    return this.#serialized(async () => {
      const admission = validatePublicWitnessSourceAdmission(admissionRaw);
      if (admission.domain_id !== this.#domainId) {
        throw new ValidationError('public witness receiver source admission belongs to a different domain');
      }
      const existing = this.#state.admissionByDigest.get(admission.admission_digest);
      if (existing) {
        return Object.freeze({ status: 'replay', admission: structuredClone(existing.admission), durable_record: null });
      }
      const active = this.#state.activeSource.get(sourceKey(admission.source_id)) ?? null;
      if (active && admission.source_epoch === active.admission.source_epoch) {
        throw new ValidationError('public witness receiver cannot replace a source admission within the same epoch');
      }
      const payload = {
        admission,
        admitted_at: canonicalTimestamp(admittedAt, 'public witness receiver admittedAt'),
        supersedes_admission_digest: active ? active.admission.admission_digest : null
      };
      const record = await this.#append('source-admission', payload, payload.admitted_at);
      return Object.freeze({ status: 'admitted', admission: structuredClone(admission), durable_record: record });
    });
  }

  async receiveTransfer(transferRaw, {
    trustedPersonaRootPublicKey,
    receivedAt
  } = {}) {
    return this.#serialized(async () => {
      const received = canonicalTimestamp(receivedAt, 'public witness receiver receivedAt');
      const transferCandidate = assertPlainObject(transferRaw, 'public witness receiver transfer');
      const sourceId = identifier(
        transferCandidate.statement?.source_id,
        'public witness receiver transfer source_id'
      );
      const sourceEpoch = positiveInteger(
        transferCandidate.statement?.source_epoch,
        'public witness receiver transfer source_epoch'
      );
      const admissionEntry = this.#state.sourceEpoch.get(sourceEpochKey(sourceId, sourceEpoch));
      if (!admissionEntry) {
        throw new ValidationError('public witness receiver transfer source epoch is not locally admitted');
      }
      const existingByDigest = typeof transferCandidate.transfer_digest === 'string'
        ? this.#state.transferByDigest.get(transferCandidate.transfer_digest)
        : null;
      if (existingByDigest) {
        return Object.freeze({
          status: 'replay',
          transfer_digest: existingByDigest.transferDigest,
          transfer_receipt: structuredClone(existingByDigest.receipt),
          intake_status: existingByDigest.status,
          durable_record: null
        });
      }
      const active = this.#state.activeSource.get(sourceKey(sourceId));
      if (active !== admissionEntry) {
        throw new ValidationError('public witness receiver rejects previously unseen transfer from a stale source epoch');
      }
      if (admissionEntry.conflicted) {
        throw new ValidationError('public witness receiver source epoch is conflicted and cannot advance');
      }
      const verified = verifyPublicWitnessTransferPackage(transferCandidate, {
        sourceAdmission: admissionEntry.admission,
        trustedPersonaRootPublicKey,
        now: new Date(received).valueOf()
      });
      const transferIdPrior = admissionEntry.transferIds.get(verified.statement.transfer_id);
      if (transferIdPrior && transferIdPrior !== verified.transfer_digest) {
        throw new ValidationError('public witness receiver transfer_id was already used by a different package');
      }
      const positionKey = sourcePositionKey(sourceId, sourceEpoch, verified.statement.sequence);
      const position = this.#state.positionTransfers.get(positionKey) ?? [];
      let intakeStatus = 'accepted';
      let equivocation = null;
      if (position.length !== 0) {
        equivocation = detectPublicWitnessSourceEquivocation(position[0].transfer, transferCandidate, {
          sourceAdmission: admissionEntry.admission,
          now: new Date(received).valueOf()
        });
        if (!equivocation) {
          throw new ValidationError('public witness receiver transfer replay did not match retained digest');
        }
        intakeStatus = 'equivocation';
      } else {
        const expectedSequence = admissionEntry.lastSequence + 1;
        if (verified.statement.sequence !== expectedSequence) {
          throw new ValidationError('public witness receiver requires the next contiguous source sequence');
        }
        const expectedPrevious = admissionEntry.lastSequence === 0
          ? null
          : admissionEntry.lastTransferDigest;
        if (verified.statement.previous_transfer_digest !== expectedPrevious) {
          throw new ValidationError('public witness receiver transfer predecessor does not match retained source chain');
        }
      }
      const receipt = createPublicWitnessTransferReceipt(transferCandidate, {
        sourceAdmission: admissionEntry.admission,
        trustedPersonaRootPublicKey,
        witnessId: this.#witnessId,
        witnessPrivateKey: this.#witnessPrivateKey,
        receivedAt: received,
        now: new Date(received).valueOf()
      });
      const payload = {
        source_admission_digest: admissionEntry.admission.admission_digest,
        transfer: transferCandidate,
        transfer_receipt: receipt,
        received_at: received,
        intake_status: intakeStatus,
        source_equivocation_evidence: equivocation
      };
      const record = await this.#append('transfer-intake', payload, received);
      return Object.freeze({
        status: intakeStatus === 'accepted' ? 'received' : 'received-with-equivocation',
        transfer_digest: verified.transfer_digest,
        transfer_receipt: structuredClone(receipt),
        source_equivocation_evidence: equivocation ? structuredClone(equivocation) : null,
        observation_status: 'pending-observation',
        durable_record: record
      });
    });
  }

  async markObservationCommitted(transferDigest, {
    observationDigest,
    witnessDurableRecordDigest,
    committedAt,
    reconciledAfterRestart = false
  } = {}) {
    return this.#serialized(async () => {
      const normalizedTransferDigest = digest(transferDigest, 'public witness receiver transferDigest');
      const intake = this.#state.transferByDigest.get(normalizedTransferDigest);
      if (!intake) throw new ValidationError('public witness receiver cannot commit observation for unknown transfer');
      if (intake.status === 'observation-committed') {
        if (
          intake.observationDigest === observationDigest
          && intake.durableObservationRecordDigest === witnessDurableRecordDigest
        ) {
          return Object.freeze({ status: 'replay', durable_record: null, transfer: this.getTransfer(normalizedTransferDigest) });
        }
        throw new ValidationError('public witness receiver transfer already binds a different observation commit');
      }
      const payload = {
        transfer_digest: normalizedTransferDigest,
        transfer_receipt_digest: intake.receiptDigest,
        observation_digest: digest(observationDigest, 'public witness receiver observationDigest'),
        witness_durable_record_digest: digest(
          witnessDurableRecordDigest,
          'public witness receiver witnessDurableRecordDigest'
        ),
        observation_committed_at: canonicalTimestamp(committedAt, 'public witness receiver committedAt'),
        reconciled_after_restart: reconciledAfterRestart === true
      };
      const record = await this.#append('observation-commit', payload, payload.observation_committed_at);
      return Object.freeze({ status: 'observation-committed', durable_record: record, transfer: this.getTransfer(normalizedTransferDigest) });
    });
  }

  getTransfer(transferDigest) {
    const normalized = digest(transferDigest, 'public witness receiver transferDigest');
    const value = this.#state.transferByDigest.get(normalized);
    if (!value) return null;
    return structuredClone({
      transfer_digest: value.transferDigest,
      transfer_id: value.transferId,
      source_id: value.sourceId,
      source_epoch: value.sourceEpoch,
      source_sequence: value.sourceSequence,
      operation: value.operation,
      source_admission_digest: value.sourceAdmissionDigest,
      received_at: value.receivedAt,
      receipt_digest: value.receiptDigest,
      observation_status: value.status,
      observation_digest: value.observationDigest,
      witness_durable_record_digest: value.durableObservationRecordDigest,
      observation_committed_at: value.observationCommittedAt,
      reconciled_after_restart: value.reconciledAfterRestart
    });
  }

  getTransferArtifacts(transferDigest) {
    const normalized = digest(transferDigest, 'public witness receiver transferDigest');
    const value = this.#state.transferByDigest.get(normalized);
    if (!value) return null;
    return structuredClone({
      transfer: value.transfer,
      transfer_receipt: value.receipt
    });
  }

  listPendingTransfers() {
    return [...this.#state.transferByDigest.values()]
      .filter(value => value.status === 'pending-observation')
      .map(value => this.getTransfer(value.transferDigest))
      .sort((a, b) => a.received_at.localeCompare(b.received_at) || a.transfer_digest.localeCompare(b.transfer_digest));
  }

  listSourcePositions(sourceId, sourceEpoch) {
    const normalizedSource = identifier(sourceId, 'public witness receiver sourceId');
    const normalizedEpoch = positiveInteger(sourceEpoch, 'public witness receiver sourceEpoch');
    const results = [];
    for (const [key, values] of this.#state.positionTransfers.entries()) {
      if (!key.startsWith(`${normalizedSource}\u0000${normalizedEpoch}\u0000`)) continue;
      results.push(...values.map(value => this.getTransfer(value.transferDigest)));
    }
    return results.sort((a, b) => a.source_sequence - b.source_sequence || a.transfer_digest.localeCompare(b.transfer_digest));
  }

  snapshot() {
    const pending = this.listPendingTransfers().length;
    const committed = this.#state.transferCount - pending;
    const conflictedSources = [...this.#state.activeSource.values()].filter(value => value.conflicted).length;
    const body = Object.freeze({
      schema: PUBLIC_WITNESS_RECEIVER_SNAPSHOT_SCHEMA,
      domain_id: this.#domainId,
      witness_id: this.#witnessId,
      witness_key_id: this.#witnessKeyId,
      durable_record_count: this.#records.length,
      source_count: this.#state.activeSource.size,
      transfer_count: this.#state.transferCount,
      pending_observation_count: pending,
      committed_observation_count: committed,
      conflicted_source_count: conflictedSources,
      last_record_digest: this.#records.length === 0 ? null : this.#records.at(-1).record_digest,
      persona_root_trust_effect: 'none',
      social_authority_effect: 'none',
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'none'
    });
    return Object.freeze({ ...body, snapshot_digest: digestObject(body) });
  }

  async verifyState() {
    await this.#assertDiskMatchesMemory();
    rebuild(this.#records, {
      domainId: this.#domainId,
      witnessId: this.#witnessId,
      witnessPublicKey: this.#witnessPublicKey,
      maxSources: this.#maxSources,
      maxTransfers: this.#maxTransfers
    });
    return Object.freeze({
      valid: true,
      ...this.snapshot()
    });
  }
}

export async function openPublicWitnessReceiverStore({
  statePath,
  domainId,
  witnessId,
  witnessPrivateKey,
  maxStateBytes,
  maxRecordBytes,
  maxSources,
  maxTransfers
} = {}) {
  const normalizedPath = assertString(statePath, 'public witness receiver statePath', { min: 1, max: 4096 });
  const normalizedDomain = identifier(domainId, 'public witness receiver domainId');
  const normalizedWitness = identifier(witnessId, 'public witness receiver witnessId');
  const normalizedMaxState = boundedInteger(
    maxStateBytes,
    'public witness receiver maxStateBytes',
    DEFAULT_MAX_STATE_BYTES,
    HARD_MAX_STATE_BYTES
  );
  const normalizedMaxRecord = boundedInteger(
    maxRecordBytes,
    'public witness receiver maxRecordBytes',
    DEFAULT_MAX_RECORD_BYTES,
    HARD_MAX_RECORD_BYTES
  );
  if (normalizedMaxRecord > normalizedMaxState) {
    throw new ValidationError('public witness receiver maxRecordBytes cannot exceed maxStateBytes');
  }
  const normalizedMaxSources = boundedInteger(
    maxSources,
    'public witness receiver maxSources',
    DEFAULT_MAX_SOURCES,
    HARD_MAX_SOURCES
  );
  const normalizedMaxTransfers = boundedInteger(
    maxTransfers,
    'public witness receiver maxTransfers',
    DEFAULT_MAX_TRANSFERS,
    HARD_MAX_TRANSFERS
  );
  const signing = witnessSigningKey(witnessPrivateKey);
  await ensureRegularStateFile(normalizedPath);
  const raw = await readLines(normalizedPath, normalizedMaxState, normalizedMaxRecord);
  const records = raw.map(record => verifyPublicWitnessReceiverRecord(record, {
    trustedWitnessPublicKey: signing.publicKey,
    expectedDomainId: normalizedDomain,
    expectedWitnessId: normalizedWitness
  }));
  const rebuilt = rebuild(records, {
    domainId: normalizedDomain,
    witnessId: normalizedWitness,
    witnessPublicKey: signing.publicKey,
    maxSources: normalizedMaxSources,
    maxTransfers: normalizedMaxTransfers
  });
  return new PublicWitnessReceiverStore({
    statePath: normalizedPath,
    domainId: normalizedDomain,
    witnessId: normalizedWitness,
    witnessPrivateKey,
    witnessPublicKey: signing.publicKey,
    witnessKeyId: signing.keyId,
    maxStateBytes: normalizedMaxState,
    maxRecordBytes: normalizedMaxRecord,
    maxSources: normalizedMaxSources,
    maxTransfers: normalizedMaxTransfers,
    records,
    state: rebuilt.state
  });
}

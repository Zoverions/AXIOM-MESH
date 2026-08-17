import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';

import {
  ValidationError,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { validateAgentTestSessionAuthorization } from './agent-device-attestation-session.mjs';

export const AGENT_TEST_SESSION_LIFECYCLE_EVENT_SCHEMA = 'axiom-agent-test-session-lifecycle-event.v1';
export const AGENT_TEST_SESSION_LIFECYCLE_RECEIPT_SCHEMA = 'axiom-agent-test-session-lifecycle-receipt.v1';
export const AGENT_TEST_SESSION_LIFECYCLE_TRANSCRIPT_SCHEMA = 'axiom-agent-test-session-lifecycle-transcript.v1';
export const AGENT_TEST_SESSION_LIFECYCLE_MAX_EVENTS = 64;

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const REASON = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const EVENT_TYPES = new Set(['issued', 'consumed', 'revoked', 'expired', 'interrupted', 'completed']);
const TERMINAL = new Set(['revoked', 'expired', 'interrupted', 'completed']);
const ALLOWED_TRANSITIONS = Object.freeze({
  none: new Set(['issued']),
  issued: new Set(['consumed', 'revoked', 'expired']),
  consumed: new Set(['revoked', 'interrupted', 'completed']),
  revoked: new Set(),
  expired: new Set(),
  interrupted: new Set(),
  completed: new Set()
});

const EVENT_KEYS = new Set(['schema', 'statement', 'statement_digest', 'ledger_signature', 'event_digest']);
const EVENT_STATEMENT_KEYS = new Set([
  'ledger_id', 'ledger_key_id', 'event_id', 'sequence', 'previous_event_digest',
  'event_type', 'occurred_at', 'reason_code', 'status_after', 'authorization_id',
  'authorization_digest', 'authorization_not_before', 'authorization_expires_at',
  'sponsor_id', 'subject_id', 'challenge_id', 'offer_id', 'node_profile_sha256',
  'attestation_id', 'key_fingerprint_sha256', 'revocation_state_known',
  'effect_reachable', 'remote_effect_observed', 'task_success_claimed',
  'production_authority', 'capability_promoted'
]);
const RECEIPT_KEYS = new Set(['schema', 'statement', 'statement_digest', 'ledger_signature', 'receipt_digest']);
const RECEIPT_STATEMENT_KEYS = new Set([
  'ledger_id', 'ledger_key_id', 'authorization_id', 'authorization_digest',
  'sponsor_id', 'subject_id', 'challenge_id', 'offer_id', 'node_profile_sha256',
  'attestation_id', 'key_fingerprint_sha256', 'status', 'event_count',
  'head_event_digest', 'generated_at', 'effect_reachable', 'remote_effect_observed',
  'executor_receipt_present', 'task_success_claimed', 'production_enrollment',
  'credentials_issued', 'secrets_accessed', 'firmware_changed', 'purchase_performed',
  'destructive_action_performed', 'deployment_authority', 'capability_promoted',
  'production_persistence_claimed'
]);
const TRANSCRIPT_KEYS = new Set([
  'schema', 'ledger_id', 'ledger_key_id', 'events', 'transcript_digest',
  'production_persistence_claimed'
]);

function exactKeys(raw, allowed, label) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError(`${label} must be an object`);
  }
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(raw, key)) throw new ValidationError(`${label} is missing required field: ${key}`);
  }
  return raw;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical UTC timestamp`);
  }
  return value;
}

function timestampDate(value, label) {
  return new Date(canonicalTimestamp(value, label));
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

function publicKeyId(publicKey) {
  return sha256(publicKey.export({ type: 'spki', format: 'der' }));
}

function signer(privateKeyValue) {
  const privateKey = parsePrivateKey(privateKeyValue, 'test-session lifecycle ledger private key');
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({ privateKey, publicKey, keyId: publicKeyId(publicKey) });
}

function signEnvelope({ schema, statement, privateKey, digestField }) {
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({ schema, statement, statement_digest: statementDigest });
  const signature = sign(null, Buffer.from(canonicalJson(signable)), privateKey).toString('base64url');
  const signed = Object.freeze({
    schema,
    statement,
    statement_digest: statementDigest,
    ledger_signature: signature
  });
  return Object.freeze({ ...signed, [digestField]: digestObject(signed) });
}

function verifyEnvelope(raw, {
  schema,
  keys,
  statementNormalizer,
  trustedLedgerPublicKey,
  digestField,
  label
}) {
  const value = exactKeys(raw, keys, label);
  if (value.schema !== schema) throw new ValidationError(`${label} schema is invalid`);
  const statement = statementNormalizer(value.statement);
  const statementDigest = digest(value.statement_digest, `${label} statement_digest`);
  if (statementDigest !== digestObject(statement)) throw new ValidationError(`${label} statement digest is invalid`);
  if (typeof value.ledger_signature !== 'string' || !BASE64URL.test(value.ledger_signature)) {
    throw new ValidationError(`${label} signature encoding is invalid`);
  }
  const publicKey = parsePublicKey(trustedLedgerPublicKey, `trusted ${label} public key`);
  if (publicKeyId(publicKey) !== statement.ledger_key_id) {
    throw new ValidationError(`${label} ledger key does not match the trusted public key`);
  }
  let signatureValid = false;
  try {
    signatureValid = verify(
      null,
      Buffer.from(canonicalJson({ schema, statement, statement_digest: statementDigest })),
      publicKey,
      Buffer.from(value.ledger_signature, 'base64url')
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) throw new ValidationError(`${label} signature is invalid`);
  const signed = Object.freeze({
    schema,
    statement,
    statement_digest: statementDigest,
    ledger_signature: value.ledger_signature
  });
  const objectDigest = digest(value[digestField], `${label} ${digestField}`);
  if (objectDigest !== digestObject(signed)) throw new ValidationError(`${label} ${digestField} is invalid`);
  return Object.freeze({ ...signed, [digestField]: objectDigest });
}

function normalizeEventStatement(raw) {
  const value = exactKeys(raw, EVENT_STATEMENT_KEYS, 'test-session lifecycle event statement');
  const eventType = value.event_type;
  if (!EVENT_TYPES.has(eventType) || value.status_after !== eventType) {
    throw new ValidationError('test-session lifecycle event type/status is invalid');
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1 || value.sequence > AGENT_TEST_SESSION_LIFECYCLE_MAX_EVENTS) {
    throw new ValidationError('test-session lifecycle sequence is invalid');
  }
  if (value.sequence === 1) {
    if (value.previous_event_digest !== null || eventType !== 'issued') {
      throw new ValidationError('test-session lifecycle genesis must be an issued event with no predecessor');
    }
  } else {
    digest(value.previous_event_digest, 'test-session lifecycle previous_event_digest');
    if (eventType === 'issued') throw new ValidationError('test-session lifecycle issued event may occur only at genesis');
  }
  if (typeof value.reason_code !== 'string' || !REASON.test(value.reason_code)) {
    throw new ValidationError('test-session lifecycle reason_code is invalid');
  }
  const notBefore = timestampDate(value.authorization_not_before, 'test-session lifecycle authorization_not_before');
  const expiresAt = timestampDate(value.authorization_expires_at, 'test-session lifecycle authorization_expires_at');
  const occurredAt = timestampDate(value.occurred_at, 'test-session lifecycle occurred_at');
  if (expiresAt <= notBefore) throw new ValidationError('test-session lifecycle authorization window is invalid');
  if (eventType === 'consumed' && (occurredAt < notBefore || occurredAt >= expiresAt)) {
    throw new ValidationError('test-session lifecycle consumption is outside the authorization window');
  }
  if (eventType === 'expired' && occurredAt < expiresAt) {
    throw new ValidationError('test-session lifecycle expiry cannot precede authorization expiry');
  }
  if (eventType === 'completed' && occurredAt > expiresAt) {
    throw new ValidationError('test-session lifecycle completion cannot occur after authorization expiry');
  }
  if (
    value.revocation_state_known !== true
    || value.effect_reachable !== false
    || value.remote_effect_observed !== false
    || value.task_success_claimed !== false
    || value.production_authority !== false
    || value.capability_promoted !== false
  ) throw new ValidationError('test-session lifecycle event attempts to elevate effect or authority claims');
  return Object.freeze({
    ledger_id: identifier(value.ledger_id, 'test-session lifecycle ledger_id'),
    ledger_key_id: digest(value.ledger_key_id, 'test-session lifecycle ledger_key_id'),
    event_id: identifier(value.event_id, 'test-session lifecycle event_id'),
    sequence: value.sequence,
    previous_event_digest: value.previous_event_digest,
    event_type: eventType,
    occurred_at: value.occurred_at,
    reason_code: value.reason_code,
    status_after: eventType,
    authorization_id: identifier(value.authorization_id, 'test-session lifecycle authorization_id'),
    authorization_digest: digest(value.authorization_digest, 'test-session lifecycle authorization_digest'),
    authorization_not_before: value.authorization_not_before,
    authorization_expires_at: value.authorization_expires_at,
    sponsor_id: identifier(value.sponsor_id, 'test-session lifecycle sponsor_id'),
    subject_id: identifier(value.subject_id, 'test-session lifecycle subject_id'),
    challenge_id: identifier(value.challenge_id, 'test-session lifecycle challenge_id'),
    offer_id: identifier(value.offer_id, 'test-session lifecycle offer_id'),
    node_profile_sha256: digest(value.node_profile_sha256, 'test-session lifecycle node_profile_sha256'),
    attestation_id: identifier(value.attestation_id, 'test-session lifecycle attestation_id'),
    key_fingerprint_sha256: digest(value.key_fingerprint_sha256, 'test-session lifecycle key_fingerprint_sha256'),
    revocation_state_known: true,
    effect_reachable: false,
    remote_effect_observed: false,
    task_success_claimed: false,
    production_authority: false,
    capability_promoted: false
  });
}

function normalizeReceiptStatement(raw) {
  const value = exactKeys(raw, RECEIPT_STATEMENT_KEYS, 'test-session lifecycle receipt statement');
  if (!EVENT_TYPES.has(value.status)) throw new ValidationError('test-session lifecycle receipt status is invalid');
  if (!Number.isSafeInteger(value.event_count) || value.event_count < 1 || value.event_count > AGENT_TEST_SESSION_LIFECYCLE_MAX_EVENTS) {
    throw new ValidationError('test-session lifecycle receipt event_count is invalid');
  }
  canonicalTimestamp(value.generated_at, 'test-session lifecycle receipt generated_at');
  if (
    value.effect_reachable !== false
    || value.remote_effect_observed !== false
    || value.executor_receipt_present !== false
    || value.task_success_claimed !== false
    || value.production_enrollment !== false
    || value.credentials_issued !== false
    || value.secrets_accessed !== false
    || value.firmware_changed !== false
    || value.purchase_performed !== false
    || value.destructive_action_performed !== false
    || value.deployment_authority !== false
    || value.capability_promoted !== false
    || value.production_persistence_claimed !== false
  ) throw new ValidationError('test-session lifecycle receipt attempts to elevate effect, success, persistence, or authority claims');
  return Object.freeze({
    ledger_id: identifier(value.ledger_id, 'test-session lifecycle receipt ledger_id'),
    ledger_key_id: digest(value.ledger_key_id, 'test-session lifecycle receipt ledger_key_id'),
    authorization_id: identifier(value.authorization_id, 'test-session lifecycle receipt authorization_id'),
    authorization_digest: digest(value.authorization_digest, 'test-session lifecycle receipt authorization_digest'),
    sponsor_id: identifier(value.sponsor_id, 'test-session lifecycle receipt sponsor_id'),
    subject_id: identifier(value.subject_id, 'test-session lifecycle receipt subject_id'),
    challenge_id: identifier(value.challenge_id, 'test-session lifecycle receipt challenge_id'),
    offer_id: identifier(value.offer_id, 'test-session lifecycle receipt offer_id'),
    node_profile_sha256: digest(value.node_profile_sha256, 'test-session lifecycle receipt node_profile_sha256'),
    attestation_id: identifier(value.attestation_id, 'test-session lifecycle receipt attestation_id'),
    key_fingerprint_sha256: digest(value.key_fingerprint_sha256, 'test-session lifecycle receipt key_fingerprint_sha256'),
    status: value.status,
    event_count: value.event_count,
    head_event_digest: digest(value.head_event_digest, 'test-session lifecycle receipt head_event_digest'),
    generated_at: value.generated_at,
    effect_reachable: false,
    remote_effect_observed: false,
    executor_receipt_present: false,
    task_success_claimed: false,
    production_enrollment: false,
    credentials_issued: false,
    secrets_accessed: false,
    firmware_changed: false,
    purchase_performed: false,
    destructive_action_performed: false,
    deployment_authority: false,
    capability_promoted: false,
    production_persistence_claimed: false
  });
}

export function verifyAgentTestSessionLifecycleEvent(raw, { trustedLedgerPublicKey } = {}) {
  const verified = verifyEnvelope(raw, {
    schema: AGENT_TEST_SESSION_LIFECYCLE_EVENT_SCHEMA,
    keys: EVENT_KEYS,
    statementNormalizer: normalizeEventStatement,
    trustedLedgerPublicKey,
    digestField: 'event_digest',
    label: 'test-session lifecycle event'
  });
  return Object.freeze({ ...verified, valid: true, signature_valid: true });
}

export function verifyAgentTestSessionLifecycleReceipt(raw, {
  trustedLedgerPublicKey,
  transcript
} = {}) {
  const verified = verifyEnvelope(raw, {
    schema: AGENT_TEST_SESSION_LIFECYCLE_RECEIPT_SCHEMA,
    keys: RECEIPT_KEYS,
    statementNormalizer: normalizeReceiptStatement,
    trustedLedgerPublicKey,
    digestField: 'receipt_digest',
    label: 'test-session lifecycle receipt'
  });
  if (transcript !== undefined) {
    const checked = verifyAgentTestSessionLifecycleTranscript(transcript, { trustedLedgerPublicKey });
    if (
      verified.statement.ledger_id !== checked.ledger_id
      || verified.statement.ledger_key_id !== checked.ledger_key_id
      || verified.statement.authorization_id !== checked.authorization_id
      || verified.statement.authorization_digest !== checked.authorization_digest
      || verified.statement.status !== checked.status
      || verified.statement.event_count !== checked.event_count
      || verified.statement.head_event_digest !== checked.head_event_digest
    ) throw new ValidationError('test-session lifecycle receipt does not bind the exact transcript head');
    const lastTime = checked.events.at(-1).statement.occurred_at;
    if (verified.statement.generated_at < lastTime) {
      throw new ValidationError('test-session lifecycle receipt predates the transcript head');
    }
  }
  return Object.freeze({ ...verified, valid: true, signature_valid: true });
}

function assertSameBinding(first, current) {
  for (const key of [
    'ledger_id', 'ledger_key_id', 'authorization_id', 'authorization_digest',
    'authorization_not_before', 'authorization_expires_at', 'sponsor_id', 'subject_id',
    'challenge_id', 'offer_id', 'node_profile_sha256', 'attestation_id',
    'key_fingerprint_sha256'
  ]) {
    if (current[key] !== first[key]) throw new ValidationError(`test-session lifecycle binding drift: ${key}`);
  }
}

function assertTransition(previous, current) {
  const previousStatus = previous ? previous.statement.status_after : 'none';
  if (!ALLOWED_TRANSITIONS[previousStatus].has(current.statement.event_type)) {
    throw new ValidationError(`test-session lifecycle transition ${previousStatus} -> ${current.statement.event_type} is not allowed`);
  }
  if (previous) {
    if (current.statement.sequence !== previous.statement.sequence + 1) {
      throw new ValidationError('test-session lifecycle sequence is not contiguous');
    }
    if (current.statement.previous_event_digest !== previous.event_digest) {
      throw new ValidationError('test-session lifecycle predecessor binding is invalid');
    }
    if (current.statement.occurred_at < previous.statement.occurred_at) {
      throw new ValidationError('test-session lifecycle event time moves backwards');
    }
  }
}

export function verifyAgentTestSessionLifecycleTranscript(raw, { trustedLedgerPublicKey } = {}) {
  const value = exactKeys(raw, TRANSCRIPT_KEYS, 'test-session lifecycle transcript');
  if (value.schema !== AGENT_TEST_SESSION_LIFECYCLE_TRANSCRIPT_SCHEMA) {
    throw new ValidationError('test-session lifecycle transcript schema is invalid');
  }
  const ledgerId = identifier(value.ledger_id, 'test-session lifecycle transcript ledger_id');
  const ledgerKeyId = digest(value.ledger_key_id, 'test-session lifecycle transcript ledger_key_id');
  if (value.production_persistence_claimed !== false) {
    throw new ValidationError('test-session lifecycle transcript cannot claim production persistence');
  }
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > AGENT_TEST_SESSION_LIFECYCLE_MAX_EVENTS) {
    throw new ValidationError('test-session lifecycle transcript events are invalid');
  }
  const body = Object.freeze({
    schema: value.schema,
    ledger_id: ledgerId,
    ledger_key_id: ledgerKeyId,
    events: value.events,
    production_persistence_claimed: false
  });
  const transcriptDigest = digest(value.transcript_digest, 'test-session lifecycle transcript_digest');
  if (transcriptDigest !== digestObject(body)) throw new ValidationError('test-session lifecycle transcript digest is invalid');

  const events = [];
  const eventIds = new Set();
  let previous = null;
  let first = null;
  for (const rawEvent of value.events) {
    const event = verifyAgentTestSessionLifecycleEvent(rawEvent, { trustedLedgerPublicKey });
    if (event.statement.ledger_id !== ledgerId || event.statement.ledger_key_id !== ledgerKeyId) {
      throw new ValidationError('test-session lifecycle transcript ledger binding is invalid');
    }
    if (eventIds.has(event.statement.event_id)) throw new ValidationError('test-session lifecycle transcript reuses an event id');
    eventIds.add(event.statement.event_id);
    if (!first) first = event.statement;
    else assertSameBinding(first, event.statement);
    assertTransition(previous, event);
    events.push(event);
    previous = event;
  }
  return Object.freeze({
    valid: true,
    ledger_id: ledgerId,
    ledger_key_id: ledgerKeyId,
    authorization_id: first.authorization_id,
    authorization_digest: first.authorization_digest,
    status: previous.statement.status_after,
    event_count: events.length,
    head_event_digest: previous.event_digest,
    terminal: TERMINAL.has(previous.statement.status_after),
    events: Object.freeze(events)
  });
}

function clone(value) {
  return structuredClone(value);
}

export class AgentTestSessionLifecycleLedger {
  constructor({ ledgerId, ledgerPrivateKey, maxEvents = AGENT_TEST_SESSION_LIFECYCLE_MAX_EVENTS } = {}) {
    this.ledgerId = identifier(ledgerId, 'test-session lifecycle ledgerId');
    this.signer = signer(ledgerPrivateKey);
    if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > AGENT_TEST_SESSION_LIFECYCLE_MAX_EVENTS) {
      throw new ValidationError('test-session lifecycle maxEvents is invalid');
    }
    this.maxEvents = maxEvents;
    this.events = [];
    this.eventsById = new Map();
    this.binding = null;
  }

  get ledgerPublicKey() {
    return this.signer.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  get status() {
    return this.events.length ? this.events.at(-1).statement.status_after : null;
  }

  get terminal() {
    return this.status ? TERMINAL.has(this.status) : false;
  }

  _baseStatement({ eventId, eventType, occurredAt, reasonCode }) {
    if (!this.binding) throw new ValidationError('test-session lifecycle authorization has not been issued');
    const previous = this.events.at(-1) ?? null;
    return {
      ledger_id: this.ledgerId,
      ledger_key_id: this.signer.keyId,
      event_id: identifier(eventId, 'test-session lifecycle eventId'),
      sequence: this.events.length + 1,
      previous_event_digest: previous?.event_digest ?? null,
      event_type: eventType,
      occurred_at: canonicalTimestamp(occurredAt, 'test-session lifecycle occurredAt'),
      reason_code: typeof reasonCode === 'string' && REASON.test(reasonCode)
        ? reasonCode
        : (() => { throw new ValidationError('test-session lifecycle reasonCode is invalid'); })(),
      status_after: eventType,
      ...this.binding,
      revocation_state_known: true,
      effect_reachable: false,
      remote_effect_observed: false,
      task_success_claimed: false,
      production_authority: false,
      capability_promoted: false
    };
  }

  _replayOrConflict(eventId, eventType, occurredAt, reasonCode) {
    const existing = this.eventsById.get(eventId);
    if (!existing) return null;
    if (
      existing.statement.event_type === eventType
      && existing.statement.occurred_at === occurredAt
      && existing.statement.reason_code === reasonCode
    ) {
      return Object.freeze({ status: 'replay', event: clone(existing) });
    }
    throw new ValidationError('test-session lifecycle event id was reused with conflicting content');
  }

  _append({ eventId, eventType, occurredAt, reasonCode }) {
    const replay = this._replayOrConflict(eventId, eventType, occurredAt, reasonCode);
    if (replay) return replay;
    if (this.events.length >= this.maxEvents) throw new ValidationError('test-session lifecycle event capacity is exhausted');
    const previous = this.events.at(-1) ?? null;
    const statement = normalizeEventStatement(this._baseStatement({ eventId, eventType, occurredAt, reasonCode }));
    const unsigned = Object.freeze({ statement });
    assertTransition(previous, { statement, event_digest: null });
    const event = signEnvelope({
      schema: AGENT_TEST_SESSION_LIFECYCLE_EVENT_SCHEMA,
      statement,
      privateKey: this.signer.privateKey,
      digestField: 'event_digest'
    });
    this.events.push(event);
    this.eventsById.set(statement.event_id, event);
    return Object.freeze({ status: 'recorded', event: clone(event), lifecycle_status: statement.status_after });
  }

  issue(authorization, {
    eventId,
    occurredAt = authorization?.timing?.issued_at,
    challenge,
    offer,
    attestation,
    expectedNonce,
    now
  } = {}) {
    const validated = validateAgentTestSessionAuthorization(authorization, {
      challenge, offer, attestation, expectedNonce, now
    });
    const authorizationDigest = digestObject(authorization);
    if (this.binding) {
      const existing = this.events[0];
      if (
        this.binding.authorization_id === authorization.authorization_id
        && this.binding.authorization_digest === authorizationDigest
        && existing.statement.event_id === eventId
        && existing.statement.occurred_at === occurredAt
      ) return Object.freeze({ status: 'replay', event: clone(existing) });
      throw new ValidationError('test-session lifecycle ledger already binds a different or previously issued authorization');
    }
    this.binding = Object.freeze({
      authorization_id: validated.authorization_id,
      authorization_digest: authorizationDigest,
      authorization_not_before: canonicalTimestamp(authorization.timing.not_before, 'test-session lifecycle authorization not_before'),
      authorization_expires_at: canonicalTimestamp(authorization.timing.expires_at, 'test-session lifecycle authorization expires_at'),
      sponsor_id: validated.sponsor_id,
      subject_id: validated.subject_id,
      challenge_id: authorization.challenge.challenge_id,
      offer_id: authorization.challenge.offer_id,
      node_profile_sha256: authorization.challenge.node_profile_sha256,
      attestation_id: authorization.attestation.attestation_id,
      key_fingerprint_sha256: authorization.attestation.key_fingerprint_sha256
    });
    try {
      return this._append({
        eventId,
        eventType: 'issued',
        occurredAt,
        reasonCode: 'authorization-issued'
      });
    } catch (error) {
      this.binding = null;
      throw error;
    }
  }

  consume({ eventId, occurredAt, revocationState = 'unknown' } = {}) {
    if (revocationState !== 'active') {
      throw new ValidationError('test-session lifecycle consumption requires known active revocation state');
    }
    return this._append({ eventId, eventType: 'consumed', occurredAt, reasonCode: 'authorization-consumed' });
  }

  revoke({ eventId, occurredAt, reasonCode = 'sponsor-revoked' } = {}) {
    return this._append({ eventId, eventType: 'revoked', occurredAt, reasonCode });
  }

  expire({ eventId, occurredAt } = {}) {
    return this._append({ eventId, eventType: 'expired', occurredAt, reasonCode: 'authorization-expired' });
  }

  interrupt({ eventId, occurredAt, reasonCode = 'session-interrupted' } = {}) {
    return this._append({ eventId, eventType: 'interrupted', occurredAt, reasonCode });
  }

  complete({ eventId, occurredAt } = {}) {
    return this._append({ eventId, eventType: 'completed', occurredAt, reasonCode: 'lifecycle-completed' });
  }

  exportTranscript() {
    if (!this.events.length) throw new ValidationError('test-session lifecycle transcript requires an issued authorization');
    const body = Object.freeze({
      schema: AGENT_TEST_SESSION_LIFECYCLE_TRANSCRIPT_SCHEMA,
      ledger_id: this.ledgerId,
      ledger_key_id: this.signer.keyId,
      events: this.events.map(clone),
      production_persistence_claimed: false
    });
    return Object.freeze({ ...body, transcript_digest: digestObject(body) });
  }

  receipt({ generatedAt } = {}) {
    if (!this.events.length) throw new ValidationError('test-session lifecycle receipt requires an issued authorization');
    const head = this.events.at(-1);
    const generated = canonicalTimestamp(generatedAt, 'test-session lifecycle receipt generatedAt');
    if (generated < head.statement.occurred_at) {
      throw new ValidationError('test-session lifecycle receipt cannot predate the lifecycle head');
    }
    const statement = normalizeReceiptStatement({
      ledger_id: this.ledgerId,
      ledger_key_id: this.signer.keyId,
      authorization_id: this.binding.authorization_id,
      authorization_digest: this.binding.authorization_digest,
      sponsor_id: this.binding.sponsor_id,
      subject_id: this.binding.subject_id,
      challenge_id: this.binding.challenge_id,
      offer_id: this.binding.offer_id,
      node_profile_sha256: this.binding.node_profile_sha256,
      attestation_id: this.binding.attestation_id,
      key_fingerprint_sha256: this.binding.key_fingerprint_sha256,
      status: head.statement.status_after,
      event_count: this.events.length,
      head_event_digest: head.event_digest,
      generated_at: generated,
      effect_reachable: false,
      remote_effect_observed: false,
      executor_receipt_present: false,
      task_success_claimed: false,
      production_enrollment: false,
      credentials_issued: false,
      secrets_accessed: false,
      firmware_changed: false,
      purchase_performed: false,
      destructive_action_performed: false,
      deployment_authority: false,
      capability_promoted: false,
      production_persistence_claimed: false
    });
    return signEnvelope({
      schema: AGENT_TEST_SESSION_LIFECYCLE_RECEIPT_SCHEMA,
      statement,
      privateKey: this.signer.privateKey,
      digestField: 'receipt_digest'
    });
  }

  _restoreVerified(events) {
    this.events = events.map(event => Object.freeze({
      schema: event.schema,
      statement: event.statement,
      statement_digest: event.statement_digest,
      ledger_signature: event.ledger_signature,
      event_digest: event.event_digest
    }));
    this.eventsById = new Map(this.events.map(event => [event.statement.event_id, event]));
    const first = this.events[0].statement;
    this.binding = Object.freeze({
      authorization_id: first.authorization_id,
      authorization_digest: first.authorization_digest,
      authorization_not_before: first.authorization_not_before,
      authorization_expires_at: first.authorization_expires_at,
      sponsor_id: first.sponsor_id,
      subject_id: first.subject_id,
      challenge_id: first.challenge_id,
      offer_id: first.offer_id,
      node_profile_sha256: first.node_profile_sha256,
      attestation_id: first.attestation_id,
      key_fingerprint_sha256: first.key_fingerprint_sha256
    });
  }
}

export function restoreAgentTestSessionLifecycleLedger(transcript, {
  ledgerPrivateKey,
  maxEvents = AGENT_TEST_SESSION_LIFECYCLE_MAX_EVENTS
} = {}) {
  const privateKey = parsePrivateKey(ledgerPrivateKey, 'test-session lifecycle restore private key');
  const trustedPublicKey = createPublicKey(privateKey);
  const verified = verifyAgentTestSessionLifecycleTranscript(transcript, {
    trustedLedgerPublicKey: trustedPublicKey
  });
  const ledger = new AgentTestSessionLifecycleLedger({
    ledgerId: verified.ledger_id,
    ledgerPrivateKey: privateKey,
    maxEvents
  });
  if (ledger.signer.keyId !== verified.ledger_key_id) {
    throw new ValidationError('test-session lifecycle restore key does not match transcript ledger key');
  }
  ledger._restoreVerified(verified.events);
  return ledger;
}

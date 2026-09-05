import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const NEGOTIATION_MESSAGE_SCHEMA = 'axiom-negotiation-message.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MESSAGE_TYPES = new Set([
  'offer','counteroffer','clarification_request','partial_acceptance',
  'conditional_acceptance','rejection','withdrawal','reservation',
  'amendment_proposal','amendment_acceptance','mediation_proposal',
  'settlement_proposal','settlement_acceptance'
]);

function exact(raw, fields, label) {
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

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}
function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}
function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const d = new Date(text);
  if (Number.isNaN(d.valueOf()) || d.toISOString() !== text) {
    throw new ValidationError(`${label} must be canonical UTC ISO`);
  }
  return text;
}

export function validateNegotiationMessage(raw, { now = new Date() } = {}) {
  const value = exact(raw, [
    'schema','message_id','thread_id','message_type','sender','recipients',
    'base_contract_digest','prior_message_digest','terms','accepted_term_ids',
    'supersedes_message_ids','delegation_evidence_ref','issued_at','expires_at',
    'authority','limitations'
  ], 'negotiation message');

  if (value.schema !== NEGOTIATION_MESSAGE_SCHEMA) {
    throw new ValidationError('negotiation message schema is invalid');
  }

  id(value.message_id, 'message_id');
  id(value.thread_id, 'thread_id');
  const type = id(value.message_type, 'message_type');
  if (!MESSAGE_TYPES.has(type)) throw new ValidationError('message_type is unsupported');

  id(value.sender, 'sender');
  const recipients = assertStringArray(value.recipients, 'recipients', { maxItems: 128, itemMax: 192 });
  if (recipients.length === 0) throw new ValidationError('negotiation message requires recipients');
  for (const [i, recipient] of recipients.entries()) id(recipient, `recipients[${i}]`);

  if (value.base_contract_digest !== null) digest(value.base_contract_digest, 'base_contract_digest');
  if (value.prior_message_digest !== null) digest(value.prior_message_digest, 'prior_message_digest');

  if (!Array.isArray(value.terms) || value.terms.length > 256) {
    throw new ValidationError('terms must be an array with at most 256 entries');
  }
  const termIds = new Set();
  for (const [index, rawTerm] of value.terms.entries()) {
    const term = exact(rawTerm, ['term_id','operation','statement'], `terms[${index}]`);
    const termId = id(term.term_id, `terms[${index}].term_id`);
    if (termIds.has(termId)) throw new ValidationError('term IDs must be unique');
    termIds.add(termId);
    const op = id(term.operation, `terms[${index}].operation`);
    if (!['add','replace','remove','retain'].includes(op)) {
      throw new ValidationError('term operation is invalid');
    }
    assertString(term.statement, `terms[${index}].statement`, { min: 1, max: 4096 });
  }

  const accepted = assertStringArray(value.accepted_term_ids, 'accepted_term_ids', {
    maxItems: 256, itemMax: 192
  });
  if (['partial_acceptance','conditional_acceptance','amendment_acceptance','settlement_acceptance'].includes(type)
      && accepted.length === 0) {
    throw new ValidationError(`${type} requires explicit accepted_term_ids`);
  }

  const supersedes = assertStringArray(value.supersedes_message_ids, 'supersedes_message_ids', {
    maxItems: 64, itemMax: 192
  });
  for (const [i, msg] of supersedes.entries()) id(msg, `supersedes_message_ids[${i}]`);

  if (value.delegation_evidence_ref !== null) {
    assertString(value.delegation_evidence_ref, 'delegation_evidence_ref', { min: 1, max: 512 });
  }

  timestamp(value.issued_at, 'issued_at');
  const expiresAt = timestamp(value.expires_at, 'expires_at');

  const authority = exact(value.authority, [
    'message_grants_runtime_authority',
    'acceptance_grants_runtime_authority',
    'settlement_grants_effect_authority',
    'amendment_grants_effect_authority'
  ], 'authority');
  for (const [field, actual] of Object.entries(authority)) {
    if (actual !== false) throw new ValidationError(`authority.${field} must be false`);
  }

  const limitations = assertStringArray(value.limitations, 'limitations', {
    maxItems: 64, itemMax: 512
  });
  if (limitations.length === 0) throw new ValidationError('negotiation message must declare limitations');

  const nowMs = now instanceof Date ? now.valueOf() : new Date(now).valueOf();
  if (!Number.isFinite(nowMs)) throw new ValidationError('now is invalid');

  return Object.freeze({
    valid: new Date(expiresAt).valueOf() > nowMs,
    message_id: value.message_id,
    message_type: type,
    negotiation_effect: 'proposal_or_acceptance_evidence_only',
    authority_effect: 'none'
  });
}

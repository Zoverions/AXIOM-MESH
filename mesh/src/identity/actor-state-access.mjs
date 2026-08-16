import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject
} from '../lib/canonical.mjs';
import {
  ASSURANCE_TIER_IDS,
  getAssuranceTier
} from '../lib/assurance-tiers.mjs';

export const STATE_ACCESS_ENVELOPE_SCHEMA = 'axiom-actor-state-access-envelope.v1';
export const STATE_ACCESS_USE_SCHEMA = 'axiom-actor-state-access-use.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ACTIONS = new Set(['read', 'derive', 'export', 'publish', 'contribute_metric']);
const DISCLOSURE = new Set(['private', 'minimum', 'aggregate', 'pseudonymous', 'public']);
const BASIS_TYPES = new Set([
  'self_authority',
  'delegated_authority',
  'association_obligation',
  'jurisdiction_requirement',
  'succession_directive'
]);
const PUBLICATION_BASIS_TYPES = new Set([
  'self_authority',
  'delegated_authority',
  'succession_directive'
]);

function exactKeys(value, expected, name) {
  const actual = Object.keys(assertPlainObject(value, name)).sort();
  const wanted = [...expected].sort();
  if (actual.join(',') !== wanted.join(',')) {
    throw new ValidationError(`${name} fields are invalid`);
  }
}

function id(value, name) {
  return assertString(value, name, { min: 1, max: 192, pattern: ID });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalIso(value, name) {
  const text = assertString(value, name, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${name} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function assurance(value, name) {
  const level = assertString(value, name, { min: 2, max: 2 });
  if (!ASSURANCE_TIER_IDS.includes(level)) {
    throw new ValidationError(`${name} is invalid`);
  }
  return level;
}

function assuranceRank(value) {
  return getAssuranceTier(value).rank;
}

function uniqueIds(values, name, maxItems = 64) {
  const items = assertStringArray(values, name, { maxItems, itemMax: 192 })
    .map((value, index) => id(value, `${name}[${index}]`));
  if (new Set(items).size !== items.length) {
    throw new ValidationError(`${name} must be unique`);
  }
  return items.sort();
}

export function normalizeStateAccessEnvelope(raw) {
  exactKeys(raw, [
    'schema',
    'envelope_id',
    'subject_actor_id',
    'requester_actor_id',
    'state_class',
    'purpose',
    'action',
    'data_scopes',
    'recipient_actor_ids',
    'disclosure_profile',
    'authority_basis',
    'consent',
    'required_assurance',
    'observed_assurance',
    'effective_at',
    'expires_at',
    'raw_state_allowed',
    'grants_ordinary_authority'
  ], 'state access envelope');
  if (raw.schema !== STATE_ACCESS_ENVELOPE_SCHEMA) {
    throw new ValidationError('state access envelope schema is invalid');
  }
  const action = assertString(raw.action, 'action');
  if (!ACTIONS.has(action)) throw new ValidationError('state access action is invalid');
  const disclosure = assertString(raw.disclosure_profile, 'disclosure_profile');
  if (!DISCLOSURE.has(disclosure)) throw new ValidationError('state disclosure profile is invalid');

  const basis = assertPlainObject(raw.authority_basis, 'authority_basis');
  exactKeys(basis, ['type', 'source_id', 'basis_digest'], 'authority_basis');
  if (!BASIS_TYPES.has(basis.type)) throw new ValidationError('authority basis type is invalid');

  const consent = assertPlainObject(raw.consent, 'consent');
  exactKeys(consent, ['required', 'receipt_digest'], 'consent');
  if (typeof consent.required !== 'boolean') {
    throw new ValidationError('consent.required must be boolean');
  }
  const receiptDigest = consent.receipt_digest === null
    ? null
    : digest(consent.receipt_digest, 'consent.receipt_digest');
  if (consent.required && receiptDigest === null) {
    throw new ValidationError('required consent must bind a receipt digest');
  }
  if (!consent.required && receiptDigest !== null) {
    throw new ValidationError('non-required consent cannot imply a receipt binding');
  }

  const requiredAssurance = assurance(raw.required_assurance, 'required_assurance');
  const observedAssurance = assurance(raw.observed_assurance, 'observed_assurance');
  if (assuranceRank(observedAssurance) < assuranceRank(requiredAssurance)) {
    throw new ValidationError('observed assurance is below required assurance');
  }
  if (raw.grants_ordinary_authority !== false) {
    throw new ValidationError('state access envelope cannot grant ordinary authority');
  }
  if (typeof raw.raw_state_allowed !== 'boolean') {
    throw new ValidationError('raw_state_allowed must be boolean');
  }
  if (raw.raw_state_allowed && ['aggregate', 'pseudonymous', 'public'].includes(disclosure)) {
    throw new ValidationError('raw state cannot cross an aggregate, pseudonymous, or public disclosure boundary');
  }

  if (action === 'publish') {
    if (!['public', 'pseudonymous'].includes(disclosure)) {
      throw new ValidationError('publication requires public or pseudonymous disclosure profile');
    }
    if (!PUBLICATION_BASIS_TYPES.has(basis.type)) {
      throw new ValidationError('publication authority basis must be self, delegated, or succession authority');
    }
    if (assuranceRank(requiredAssurance) < assuranceRank('A2')) {
      throw new ValidationError('publication requires at least A2 assurance');
    }
    if (raw.raw_state_allowed) {
      throw new ValidationError('publication may disclose only an explicit non-raw projection');
    }
  }

  if (action === 'contribute_metric') {
    if (!['association_obligation', 'jurisdiction_requirement', 'self_authority'].includes(basis.type)) {
      throw new ValidationError('metric contribution authority basis is invalid');
    }
    if (!['minimum', 'aggregate', 'pseudonymous'].includes(disclosure) || raw.raw_state_allowed) {
      throw new ValidationError('metric contribution must use a minimized non-raw disclosure profile');
    }
  }
  if (
    basis.type === 'association_obligation'
    && action !== 'contribute_metric'
    && action !== 'export'
  ) {
    throw new ValidationError('association obligation cannot authorize arbitrary private-state access');
  }
  if (basis.type === 'succession_directive' && consent.required) {
    throw new ValidationError('succession directive access cannot fabricate current-source consent');
  }

  const effectiveAt = canonicalIso(raw.effective_at, 'effective_at');
  const expiresAt = canonicalIso(raw.expires_at, 'expires_at');
  if (expiresAt <= effectiveAt) {
    throw new ValidationError('state access envelope must expire after activation');
  }

  return {
    schema: STATE_ACCESS_ENVELOPE_SCHEMA,
    envelope_id: id(raw.envelope_id, 'envelope_id'),
    subject_actor_id: id(raw.subject_actor_id, 'subject_actor_id'),
    requester_actor_id: id(raw.requester_actor_id, 'requester_actor_id'),
    state_class: id(raw.state_class, 'state_class'),
    purpose: id(raw.purpose, 'purpose'),
    action,
    data_scopes: uniqueIds(raw.data_scopes, 'data_scopes'),
    recipient_actor_ids: uniqueIds(raw.recipient_actor_ids, 'recipient_actor_ids', 32),
    disclosure_profile: disclosure,
    authority_basis: {
      type: basis.type,
      source_id: id(basis.source_id, 'authority_basis.source_id'),
      basis_digest: digest(basis.basis_digest, 'authority_basis.basis_digest')
    },
    consent: {
      required: consent.required,
      receipt_digest: receiptDigest
    },
    required_assurance: requiredAssurance,
    observed_assurance: observedAssurance,
    effective_at: effectiveAt,
    expires_at: expiresAt,
    raw_state_allowed: raw.raw_state_allowed,
    grants_ordinary_authority: false
  };
}

function exactSet(actual, expected, name) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
    throw new ValidationError(`${name} does not match the authorized envelope`);
  }
}

export function verifyStateAccessUse(envelopeRaw, useRaw, now = new Date().toISOString()) {
  const envelope = normalizeStateAccessEnvelope(envelopeRaw);
  const observedAt = canonicalIso(now, 'now');
  if (observedAt < envelope.effective_at || observedAt >= envelope.expires_at) {
    throw new ValidationError('state access envelope is not active');
  }
  exactKeys(useRaw, [
    'subject_actor_id',
    'requester_actor_id',
    'state_class',
    'purpose',
    'action',
    'data_scopes',
    'recipient_actor_ids',
    'disclosure_profile',
    'payload_digest'
  ], 'state access use');
  for (const field of [
    'subject_actor_id',
    'requester_actor_id',
    'state_class',
    'purpose',
    'action',
    'disclosure_profile'
  ]) {
    if (useRaw[field] !== envelope[field]) {
      throw new ValidationError(`${field} does not match the authorized envelope`);
    }
  }
  exactSet(
    uniqueIds(useRaw.data_scopes, 'use.data_scopes'),
    envelope.data_scopes,
    'data_scopes'
  );
  exactSet(
    uniqueIds(useRaw.recipient_actor_ids, 'use.recipient_actor_ids', 32),
    envelope.recipient_actor_ids,
    'recipient_actor_ids'
  );
  const payloadDigest = digest(useRaw.payload_digest, 'payload_digest');
  return {
    schema: STATE_ACCESS_USE_SCHEMA,
    envelope_id: envelope.envelope_id,
    envelope_digest: digestObject(envelope),
    subject_actor_id: envelope.subject_actor_id,
    requester_actor_id: envelope.requester_actor_id,
    state_class: envelope.state_class,
    purpose: envelope.purpose,
    action: envelope.action,
    disclosure_profile: envelope.disclosure_profile,
    data_scopes: envelope.data_scopes,
    recipient_actor_ids: envelope.recipient_actor_ids,
    payload_digest: payloadDigest,
    authority_basis_digest: envelope.authority_basis.basis_digest,
    consent_receipt_digest: envelope.consent.receipt_digest,
    observed_assurance: envelope.observed_assurance,
    observed_at: observedAt,
    grants_ordinary_authority: false
  };
}

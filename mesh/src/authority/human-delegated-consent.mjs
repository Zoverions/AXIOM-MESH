import { readFile } from 'node:fs/promises';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import { AUTHORITY_FACTS_SCHEMA } from './human-authority.mjs';

export const HUMAN_DELEGATED_CONSENT_CONTRACT_ID = 'axiom.human-delegated-consent';
export const HUMAN_DELEGATED_CONSENT_CONTRACT_VERSION = '1.0.0';
export const HUMAN_DELEGATED_CONSENT_CONTRACT_SCHEMA = 'axiom-human-delegated-consent-contract.v1';
export const HUMAN_DELEGATED_CONSENT_RECEIPT_SCHEMA = 'axiom-human-delegated-consent.v1';
export const HUMAN_DELEGATED_CONSENT_FACTS_SCHEMA = 'axiom-human-delegated-consent-facts.v1';
export const HUMAN_DELEGATED_CONSENT_CONTRACT_PATH = new URL(
  '../../config/domain-contracts/human-delegated-consent.v1.json',
  import.meta.url
);

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const ACTION = /^[a-z][a-z0-9.-]{0,127}$/;
const SCOPE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const RECEIPT_STATUSES = new Set(['active', 'revoked']);

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical ISO-8601 timestamp`);
  }
  return text;
}

function canonicalScopes(value, label = 'delegated consent data_scopes') {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    throw new ValidationError(`${label} must contain 1-128 values`);
  }
  const items = value.map((item, index) => assertString(item, `${label}[${index}]`, {
    max: 160,
    pattern: SCOPE
  }));
  if (new Set(items).size !== items.length) {
    throw new ValidationError(`${label} must not contain duplicates`);
  }
  return [...items].sort();
}

function requireDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

export function delegatedAuthorityStateDigest(rawFacts) {
  const facts = assertPlainObject(rawFacts, 'authority facts');
  if (facts.schema !== AUTHORITY_FACTS_SCHEMA) {
    throw new ValidationError('Authority facts schema is unsupported');
  }
  const state = { ...facts };
  delete state.resolved_at;
  return digestObject(state);
}

function normalizeCurrentAuthority(raw) {
  const authority = assertPlainObject(raw, 'current authority resolution');
  if (authority.allow !== true) {
    return {
      allow: false,
      code: typeof authority.code === 'string' ? authority.code : 'delegated_authority_unavailable',
      reason: typeof authority.reason === 'string'
        ? authority.reason
        : 'Current delegated authority is unavailable.'
    };
  }
  const facts = assertPlainObject(authority.facts, 'current authority facts');
  if (facts.schema !== AUTHORITY_FACTS_SCHEMA) {
    throw new ValidationError('Current authority facts schema is unsupported');
  }
  const observationDigest = requireDigest(authority.authority_digest, 'current authority_digest');
  if (observationDigest !== digestObject(facts)) {
    throw new ValidationError('Current authority digest does not match its facts');
  }
  return {
    allow: true,
    facts,
    authority_observation_digest: observationDigest,
    authority_state_digest: delegatedAuthorityStateDigest(facts)
  };
}

export function validateDelegatedConsentReceipt(raw) {
  const receipt = assertPlainObject(raw, 'delegated consent receipt');
  if (receipt.schema !== HUMAN_DELEGATED_CONSENT_RECEIPT_SCHEMA) {
    throw new ValidationError('Delegated consent receipt schema is unsupported');
  }
  const normalized = {
    schema: HUMAN_DELEGATED_CONSENT_RECEIPT_SCHEMA,
    consent_id: assertString(receipt.consent_id, 'delegated consent_id', { max: 160, pattern: ID }),
    subject_id: assertString(receipt.subject_id, 'delegated subject_id', { max: 160, pattern: ID }),
    holder_id: assertString(receipt.holder_id, 'delegated holder_id', { max: 160, pattern: ID }),
    authority_grant_id: assertString(receipt.authority_grant_id, 'delegated authority_grant_id', {
      max: 160,
      pattern: ID
    }),
    relationship_claim_id: assertString(
      receipt.relationship_claim_id,
      'delegated relationship_claim_id',
      { max: 160, pattern: ID }
    ),
    authority_digest: requireDigest(receipt.authority_digest, 'delegated authority_digest'),
    controller: assertString(receipt.controller, 'delegated controller', { max: 160, pattern: ID }),
    purpose: assertString(receipt.purpose, 'delegated purpose', {
      max: 128,
      pattern: /^[a-z][a-z0-9.-]{0,127}$/
    }),
    action: assertString(receipt.action, 'delegated action', { max: 128, pattern: ACTION }),
    data_scopes: canonicalScopes(receipt.data_scopes),
    granted_at: canonicalTimestamp(receipt.granted_at, 'delegated granted_at'),
    expires_at: canonicalTimestamp(receipt.expires_at, 'delegated expires_at'),
    revocation_handle_hash: requireDigest(
      receipt.revocation_handle_hash,
      'delegated revocation_handle_hash'
    ),
    status: assertString(receipt.status, 'delegated status', { max: 16 })
  };
  if (!RECEIPT_STATUSES.has(normalized.status)) {
    throw new ValidationError('Delegated consent status is unsupported');
  }
  if (normalized.expires_at <= normalized.granted_at) {
    throw new ValidationError('Delegated consent expiry must follow its grant time');
  }
  return normalized;
}

function authorityExpiryCeiling(facts) {
  const values = [facts.grant_effective_until, facts.relationship_effective_until]
    .filter(value => value !== null && value !== undefined);
  return values.length ? values.sort()[0] : null;
}

export function buildDelegatedConsentReceipt({
  principal,
  authority: rawAuthority,
  consentId,
  controller,
  purpose,
  action,
  dataScopes,
  expiresAt,
  revocationHandleHash,
  now = new Date().toISOString()
}) {
  const holder = assertPlainObject(principal, 'delegated consent principal');
  const holderId = assertString(holder.id, 'delegated consent principal.id', {
    max: 160,
    pattern: ID
  });
  if (holder.type !== 'human') {
    throw new ValidationError('Only a human authority holder may issue delegated consent');
  }
  const authority = normalizeCurrentAuthority(rawAuthority);
  if (!authority.allow) return authority;
  const facts = authority.facts;
  const canonicalNow = canonicalTimestamp(now, 'delegated consent grant time');
  const canonicalExpiry = canonicalTimestamp(expiresAt, 'delegated consent expires_at');
  const requestedController = assertString(controller, 'delegated controller', {
    max: 160,
    pattern: ID
  });
  const requestedPurpose = assertString(purpose, 'delegated purpose', {
    max: 128,
    pattern: /^[a-z][a-z0-9.-]{0,127}$/
  });
  const requestedAction = assertString(action, 'delegated action', { max: 128, pattern: ACTION });
  const requestedScopes = canonicalScopes(dataScopes);

  if (facts.holder_id !== holderId) {
    return deny('delegated_consent_holder_mismatch', 'The authenticated human does not hold the resolved authority.');
  }
  if (
    facts.controller !== requestedController
    || facts.purpose !== requestedPurpose
    || facts.action !== requestedAction
  ) {
    return deny('delegated_consent_authority_mismatch', 'The delegated consent request does not match the resolved authority.');
  }
  if (requestedScopes.some(scope => !facts.data_scopes.includes(scope))) {
    return deny('delegated_consent_scope_denied', 'Delegated consent cannot expand the authority data-scope ceiling.');
  }
  if (canonicalExpiry <= canonicalNow) {
    return deny('delegated_consent_expiry_invalid', 'Delegated consent must expire after it is granted.');
  }
  const ceiling = authorityExpiryCeiling(facts);
  if (ceiling !== null && canonicalExpiry > ceiling) {
    return deny('delegated_consent_outlives_authority', 'Delegated consent may not outlive its relationship or authority grant.');
  }

  const receipt = validateDelegatedConsentReceipt({
    schema: HUMAN_DELEGATED_CONSENT_RECEIPT_SCHEMA,
    consent_id: consentId,
    subject_id: facts.subject_id,
    holder_id: holderId,
    authority_grant_id: facts.grant_id,
    relationship_claim_id: facts.relationship_claim_id,
    authority_digest: authority.authority_state_digest,
    controller: requestedController,
    purpose: requestedPurpose,
    action: requestedAction,
    data_scopes: requestedScopes,
    granted_at: canonicalNow,
    expires_at: canonicalExpiry,
    revocation_handle_hash: revocationHandleHash,
    status: 'active'
  });
  return {
    allow: true,
    receipt,
    receipt_digest: digestObject(receipt),
    authority_observation_digest: authority.authority_observation_digest,
    non_claims: [
      'delegated-consent-does-not-prove-legal-authority',
      'receipt-does-not-enable-domain-action-without-policy',
      'historical-receipt-does-not-prove-current-authority'
    ]
  };
}

export function evaluateDelegatedConsent({
  receipt: rawReceipt,
  authority: rawAuthority,
  subjectId,
  holderId,
  controller,
  purpose,
  action,
  dataScopes,
  now = new Date().toISOString()
}) {
  const authority = normalizeCurrentAuthority(rawAuthority);
  if (!authority.allow) return authority;
  const receipt = validateDelegatedConsentReceipt(rawReceipt);
  const canonicalNow = canonicalTimestamp(now, 'delegated consent resolution time');
  const requestedScopes = canonicalScopes(dataScopes, 'requested delegated data_scopes');

  if (receipt.status !== 'active' || receipt.expires_at <= canonicalNow) {
    return deny('delegated_consent_inactive', 'Delegated consent is revoked or expired.');
  }
  if (
    receipt.subject_id !== subjectId
    || receipt.holder_id !== holderId
    || receipt.controller !== controller
    || receipt.purpose !== purpose
    || receipt.action !== action
  ) {
    return deny('delegated_consent_request_mismatch', 'Delegated consent is not bound to this exact request.');
  }
  if (
    receipt.authority_grant_id !== authority.facts.grant_id
    || receipt.relationship_claim_id !== authority.facts.relationship_claim_id
    || receipt.authority_digest !== authority.authority_state_digest
  ) {
    return deny('delegated_consent_authority_stale', 'Delegated consent is not bound to the current authority state.');
  }
  if (
    authority.facts.subject_id !== subjectId
    || authority.facts.holder_id !== holderId
    || authority.facts.controller !== controller
    || authority.facts.purpose !== purpose
    || authority.facts.action !== action
  ) {
    return deny('delegated_consent_authority_mismatch', 'Current authority does not match the delegated request.');
  }
  if (
    requestedScopes.some(scope => !receipt.data_scopes.includes(scope))
    || requestedScopes.some(scope => !authority.facts.data_scopes.includes(scope))
  ) {
    return deny('delegated_consent_scope_denied', 'The requested data scopes exceed current delegated consent or authority.');
  }

  const facts = {
    schema: HUMAN_DELEGATED_CONSENT_FACTS_SCHEMA,
    consent_id: receipt.consent_id,
    subject_id: subjectId,
    holder_id: holderId,
    authority_grant_id: receipt.authority_grant_id,
    relationship_claim_id: receipt.relationship_claim_id,
    authority_digest: authority.authority_state_digest,
    authority_observation_digest: authority.authority_observation_digest,
    controller,
    purpose,
    action,
    data_scopes: requestedScopes,
    consent_expires_at: receipt.expires_at,
    resolved_at: canonicalNow
  };
  return {
    allow: true,
    facts,
    delegated_consent_digest: digestObject(facts),
    receipt_digest: digestObject(receipt)
  };
}

export function validateHumanDelegatedConsentContract(raw) {
  const contract = assertPlainObject(raw, 'human delegated consent contract');
  if (
    contract.schema !== HUMAN_DELEGATED_CONSENT_CONTRACT_SCHEMA
    || contract.contract_id !== HUMAN_DELEGATED_CONSENT_CONTRACT_ID
    || contract.contract_version !== HUMAN_DELEGATED_CONSENT_CONTRACT_VERSION
    || contract.status !== 'foundation-not-runtime-enabled'
    || contract.receipt_schema !== HUMAN_DELEGATED_CONSENT_RECEIPT_SCHEMA
    || contract.facts_schema !== HUMAN_DELEGATED_CONSENT_FACTS_SCHEMA
  ) {
    throw new ValidationError('Human delegated consent contract identity is invalid');
  }
  const invariants = new Set(contract.core_invariants ?? []);
  for (const invariant of [
    'direct-self-consent-remains-separate',
    'one-exact-current-authority-grant-required',
    'receipt-binds-authority-digest',
    'consent-cannot-expand-authority',
    'consent-cannot-outlive-authority',
    'current-authority-denial-dominates-unexpired-consent',
    'relationship-role-alone-never-creates-consent'
  ]) {
    if (!invariants.has(invariant)) {
      throw new ValidationError(`Human delegated consent contract is missing invariant: ${invariant}`);
    }
  }
  return contract;
}

export async function loadHumanDelegatedConsentContract(path = HUMAN_DELEGATED_CONSENT_CONTRACT_PATH) {
  const bytes = await readFile(path);
  try {
    return validateHumanDelegatedConsentContract(JSON.parse(bytes.toString('utf8')));
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`Human delegated consent contract JSON is invalid: ${error.message}`);
  }
}

function deny(code, reason) {
  return { allow: false, code, reason };
}

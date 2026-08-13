import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import {
  EDUCATION_CONTRACT_CONTROLLER,
  EDUCATION_CONTRACT_ID,
  EDUCATION_CONTRACT_SHA256,
  EDUCATION_CONTRACT_VERSION
} from './education-contract.mjs';

export const EDUCATION_DELEGATED_AUTHORITY_MODE = 'delegated-human-authority-v1';
export const EDUCATION_DELEGATED_FACTS_SCHEMA = 'axiom-education-delegated-consent-facts.v1';
export const EDUCATION_DELEGATED_BINDING_SCHEMA = 'axiom-education-delegated-consent-binding.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ACTION = 'education.learner.event.append';
const PURPOSE = 'learning-progress-recording';
const SCOPES = Object.freeze(['learning-progress:write']);

function requireDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

export function evaluateEducationDelegatedAuthorization({ intent, authorization }) {
  const principal = assertPlainObject(intent?.principal, 'education delegated principal');
  const input = assertPlainObject(intent?.input, 'education delegated input');
  const principalId = assertString(principal.id, 'education delegated principal.id', {
    max: 160,
    pattern: ID
  });
  const subjectId = assertString(input.subject_id, 'education delegated subject_id', {
    max: 160,
    pattern: ID
  });
  const consentId = assertString(input.consent_id, 'education delegated consent_id', {
    max: 160,
    pattern: ID
  });

  if (principal.type !== 'human' || subjectId === principalId) {
    return deny(
      'education_delegated_subject_authority_unavailable',
      'Delegated education authorization requires one human holder acting for a different subject.'
    );
  }
  if (!authorization || authorization.allow !== true) {
    return deny(
      authorization?.code ?? 'education_delegated_authorization_unavailable',
      authorization?.reason ?? 'Current delegated education authorization is unavailable.'
    );
  }

  const facts = assertPlainObject(authorization.facts, 'delegated consent authorization facts');
  if (facts.schema !== 'axiom-human-delegated-consent-facts.v1') {
    throw new ValidationError('Delegated consent authorization facts schema is unsupported');
  }
  const observationDigest = requireDigest(
    authorization.delegated_consent_digest,
    'delegated consent observation digest'
  );
  if (observationDigest !== digestObject(facts)) {
    throw new ValidationError('Delegated consent observation digest is invalid');
  }
  const receiptDigest = requireDigest(authorization.receipt_digest, 'delegated consent receipt digest');
  const authorityDigest = requireDigest(facts.authority_digest, 'delegated authority state digest');
  requireDigest(facts.authority_observation_digest, 'delegated authority observation digest');
  const dataScopes = Array.isArray(facts.data_scopes) ? [...facts.data_scopes] : [];

  if (
    facts.consent_id !== consentId
    || facts.subject_id !== subjectId
    || facts.holder_id !== principalId
    || facts.controller !== EDUCATION_CONTRACT_CONTROLLER
    || facts.purpose !== PURPOSE
    || facts.action !== ACTION
    || input.purpose !== PURPOSE
    || JSON.stringify(dataScopes) !== JSON.stringify(SCOPES)
  ) {
    return deny(
      'education_delegated_authorization_mismatch',
      'Delegated education authorization is not bound to this exact holder, subject, receipt, purpose, action, and scope.'
    );
  }

  const stableFacts = {
    schema: EDUCATION_DELEGATED_FACTS_SCHEMA,
    authority_mode: EDUCATION_DELEGATED_AUTHORITY_MODE,
    consent_id: facts.consent_id,
    subject_id: facts.subject_id,
    holder_id: facts.holder_id,
    authority_grant_id: assertString(facts.authority_grant_id, 'education delegated authority_grant_id', {
      max: 160,
      pattern: ID
    }),
    relationship_claim_id: assertString(
      facts.relationship_claim_id,
      'education delegated relationship_claim_id',
      { max: 160, pattern: ID }
    ),
    authority_digest: authorityDigest,
    receipt_digest: receiptDigest,
    controller: facts.controller,
    purpose: facts.purpose,
    action: facts.action,
    data_scopes: dataScopes,
    expires_at: assertString(facts.consent_expires_at, 'education delegated expires_at', { max: 64 }),
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256
  };
  const expiry = new Date(stableFacts.expires_at);
  if (Number.isNaN(expiry.valueOf()) || expiry <= new Date()) {
    return deny('education_delegated_consent_expired', 'Delegated education consent expired before execution.');
  }
  return {
    allow: true,
    facts: stableFacts,
    authorization_digest: digestObject(stableFacts),
    observation: {
      delegated_consent_digest: observationDigest,
      authority_observation_digest: facts.authority_observation_digest
    }
  };
}

export function validateEducationDelegatedBinding(binding, intent) {
  const value = assertPlainObject(binding, 'education delegated consent binding');
  if (value.schema !== EDUCATION_DELEGATED_BINDING_SCHEMA) {
    throw new ValidationError('Education delegated consent binding schema is unsupported');
  }
  const facts = assertPlainObject(value.facts, 'education delegated consent facts');
  if (facts.schema !== EDUCATION_DELEGATED_FACTS_SCHEMA) {
    throw new ValidationError('Education delegated consent facts schema is unsupported');
  }
  const authorizationDigest = requireDigest(value.authorization_digest, 'education delegated authorization_digest');
  if (authorizationDigest !== digestObject(facts)) {
    throw new ValidationError('Education delegated consent binding digest is invalid');
  }
  const principal = assertPlainObject(intent?.principal, 'education delegated intent principal');
  const input = assertPlainObject(intent?.input, 'education delegated intent input');
  if (
    principal.type !== 'human'
    || facts.authority_mode !== EDUCATION_DELEGATED_AUTHORITY_MODE
    || facts.contract_id !== EDUCATION_CONTRACT_ID
    || facts.contract_version !== EDUCATION_CONTRACT_VERSION
    || facts.contract_sha256 !== EDUCATION_CONTRACT_SHA256
    || facts.controller !== EDUCATION_CONTRACT_CONTROLLER
    || facts.subject_id !== input.subject_id
    || facts.holder_id !== principal.id
    || facts.subject_id === facts.holder_id
    || facts.consent_id !== input.consent_id
    || facts.purpose !== input.purpose
    || facts.action !== ACTION
    || JSON.stringify(facts.data_scopes) !== JSON.stringify(SCOPES)
  ) {
    throw new ValidationError('Education delegated consent binding does not match the learner event');
  }
  if (new Date(facts.expires_at) <= new Date()) {
    throw new ValidationError('Education delegated consent expired before execution');
  }
  return {
    facts: structuredClone(facts),
    authorization_digest: authorizationDigest
  };
}

function deny(code, reason) {
  return { allow: false, code, http_status: 403, reason };
}

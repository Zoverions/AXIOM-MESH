import { ValidationError, assertPlainObject, assertString } from '../lib/canonical.mjs';
import { EDUCATION_CONTRACT_CONTROLLER } from './education-contract.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

function parseInstant(value, name) {
  const text = assertString(value, name, { max: 64 });
  const millis = Date.parse(text);
  if (!Number.isFinite(millis)) throw new ValidationError(`${name} must be ISO-8601`);
  return millis;
}

/**
 * Build the education provider's consent assertion from the Grid's canonical
 * consent receipts. This adapter owns no consent authority; it only evaluates
 * the current materialized Grid state for an exact receipt binding.
 */
export function createGridEducationConsentAssertion({
  store,
  now = () => new Date().toISOString(),
}) {
  if (!store || typeof store.listConsents !== 'function') {
    throw new ValidationError('education Grid consent assertion requires GridStore.listConsents()');
  }
  if (typeof now !== 'function') {
    throw new ValidationError('education Grid consent assertion requires a now() function');
  }

  return async function assertEducationConsent(rawRequest) {
    const request = assertPlainObject(rawRequest, 'education consent assertion request');
    const subjectId = assertString(request.subject_id, 'education consent subject_id', {
      max: 160,
      pattern: ID,
    });
    const consentId = assertString(request.consent_id, 'education consent consent_id', {
      max: 160,
      pattern: ID,
    });
    const purpose = assertString(request.purpose, 'education consent purpose', { max: 512 });
    const dataScope = assertString(request.data_scope, 'education consent data_scope', {
      max: 160,
    });
    const nowMillis = parseInstant(now(), 'education consent current time');

    const receipts = store.listConsents(subjectId);
    return receipts.some(receipt => {
      if (receipt.consent_id !== consentId) return false;
      if (receipt.subject !== subjectId) return false;
      if (receipt.controller !== EDUCATION_CONTRACT_CONTROLLER) return false;
      if (receipt.purpose !== purpose) return false;
      if (receipt.status !== 'active') return false;
      if (parseInstant(receipt.expires_at, 'education consent expires_at') <= nowMillis) return false;
      return Array.isArray(receipt.scopes_json) && receipt.scopes_json.includes(dataScope);
    });
  };
}

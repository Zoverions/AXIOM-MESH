import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
} from '../lib/canonical.mjs';
import { parseJsonBody } from '../lib/http.mjs';

export const DELEGATED_AUTHORIZATION_RESOLVE_ROUTE =
  '/internal/v1/delegated-authorizations/resolve';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const PURPOSE = /^[a-z][a-z0-9.-]{0,127}$/;
const ACTION = /^[a-z][a-z0-9.-]{0,127}$/;
const REQUEST_FIELDS = new Set([
  'consent_id',
  'subject_id',
  'holder_id',
  'controller',
  'purpose',
  'action',
  'data_scopes',
]);

function exactRequest(raw) {
  const value = assertPlainObject(raw, 'delegated authorization request');
  for (const field of Object.keys(value)) {
    if (!REQUEST_FIELDS.has(field)) {
      throw new ValidationError(
        `Delegated authorization request contains unsupported field: ${field}`,
      );
    }
  }

  const dataScopes = assertStringArray(
    value.data_scopes,
    'delegated authorization data_scopes',
    { maxItems: 32, itemMax: 160 },
  );
  if (new Set(dataScopes).size !== dataScopes.length) {
    throw new ValidationError('Delegated authorization data_scopes must not contain duplicates');
  }
  const canonicalScopes = [...dataScopes].sort();
  if (JSON.stringify(canonicalScopes) !== JSON.stringify(dataScopes)) {
    throw new ValidationError('Delegated authorization data_scopes must be sorted canonically');
  }

  return Object.freeze({
    consent_id: assertString(value.consent_id, 'delegated authorization consent_id', {
      max: 160,
      pattern: ID,
    }),
    subject_id: assertString(value.subject_id, 'delegated authorization subject_id', {
      max: 160,
      pattern: ID,
    }),
    holder_id: assertString(value.holder_id, 'delegated authorization holder_id', {
      max: 160,
      pattern: ID,
    }),
    controller: assertString(value.controller, 'delegated authorization controller', {
      max: 160,
      pattern: ID,
    }),
    purpose: assertString(value.purpose, 'delegated authorization purpose', {
      max: 128,
      pattern: PURPOSE,
    }),
    action: assertString(value.action, 'delegated authorization action', {
      max: 128,
      pattern: ACTION,
    }),
    data_scopes: Object.freeze(canonicalScopes),
  });
}

export function createDelegatedAuthorizationResolveHandler(store) {
  if (!store || typeof store.resolveDelegatedConsentAuthorization !== 'function') {
    throw new ValidationError(
      'Delegated authorization route requires resolveDelegatedConsentAuthorization()',
    );
  }

  return async function resolveDelegatedAuthorization({ body, principal }) {
    if (principal?.service !== 'hypervisor') {
      throw new ValidationError('Only Hypervisor may resolve delegated human authorization');
    }
    const request = exactRequest(parseJsonBody(body));
    return store.resolveDelegatedConsentAuthorization({
      consentId: request.consent_id,
      subjectId: request.subject_id,
      holderId: request.holder_id,
      controller: request.controller,
      purpose: request.purpose,
      action: request.action,
      dataScopes: request.data_scopes,
    });
  };
}

export function registerDelegatedAuthorizationGridRoute(router, store) {
  if (!router || typeof router.add !== 'function') {
    throw new ValidationError('Delegated authorization route requires Router.add()');
  }
  router.add(
    'POST',
    DELEGATED_AUTHORIZATION_RESOLVE_ROUTE,
    createDelegatedAuthorizationResolveHandler(store),
  );
}

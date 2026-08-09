import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject
} from './canonical.mjs';

const ACTION = /^[a-z][a-z0-9.-]+$/;
const DIGEST = /^[a-f0-9]{64}$/;

/**
 * Canonical identity of a requested effect before transient fields such as
 * intent_id, submitted_at, confirmations, or approval IDs are added.
 *
 * Gateway idempotency and Hypervisor approval binding MUST use this helper so
 * retry semantics cannot drift from authorization semantics.
 */
export function intentRequestBinding(intent) {
  const value = assertPlainObject(intent, 'intent request binding');
  const principal = assertPlainObject(value.principal, 'intent principal');
  const action = assertString(value.action, 'intent.action', {
    max: 128,
    pattern: ACTION
  });
  const input = assertPlainObject(value.input ?? {}, 'intent.input');
  const purpose = assertString(value.purpose ?? 'operator-request', 'intent.purpose', {
    max: 512
  });
  const dataScopes = [...new Set(assertStringArray(
    value.data_scopes ?? [],
    'intent.data_scopes',
    { maxItems: 64, itemMax: 160 }
  ))].sort();

  let machineAuthorityDigest;
  if (principal.schema === 'axiom-machine-principal.v1') {
    machineAuthorityDigest = assertString(
      principal.authority_digest,
      'intent.principal.authority_digest',
      { min: 64, max: 64, pattern: DIGEST }
    );
  }

  return {
    action,
    input,
    purpose,
    data_scopes: dataScopes,
    ...(machineAuthorityDigest
      ? { machine_authority_digest: machineAuthorityDigest }
      : {})
  };
}

export function intentRequestDigest(intent) {
  return digestObject(intentRequestBinding(intent));
}

export function intentRequestIdentity(intent) {
  const binding = intentRequestBinding(intent);
  return {
    schema: 'axiom-intent-request-identity.v1',
    ...binding,
    digest: digestObject(binding)
  };
}

export function sameIntentRequest(left, right) {
  return intentRequestDigest(left) === intentRequestDigest(right);
}

export function assertIntentRequestDigest(intent, expectedDigest) {
  const expected = assertString(expectedDigest, 'expected request digest', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  const actual = intentRequestDigest(intent);
  if (actual !== expected) {
    throw new ValidationError('Intent request identity does not match the expected digest');
  }
  return actual;
}

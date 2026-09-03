import { ValidationError, assertString } from '../lib/canonical.mjs';
import {
  assertAuthorityNeutral,
  assertEnum,
  assertIsoTimestamp,
  assertNoUnknownKeys,
  assertReference,
  assertUniqueStrings
} from './sovereign-information-common.mjs';

export const INFORMATION_ACCESS_DECISION_SCHEMA = 'axiom-information-access-decision.v1';

const RIGHTS = new Set([
  'inspect-metadata',
  'inspect-full-content',
  'receive-projection',
  'export'
]);
const DECISIONS = new Set(['allow', 'deny', 'uncertain']);
const ROOT_KEYS = new Set([
  'schema',
  'decision_id',
  'requester',
  'object_ref',
  'purpose',
  'right',
  'decision',
  'authority_ref',
  'object_digest',
  'issued_at',
  'expires_at',
  'verifier_ref',
  'verifier_version',
  'reason_codes'
]);
const HEX_64 = /^[a-f0-9]{64}$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/;

export function validateInformationAccessDecision(value) {
  assertAuthorityNeutral(value, 'information access decision');
  assertNoUnknownKeys(value, 'information access decision', ROOT_KEYS);
  if (value.schema !== INFORMATION_ACCESS_DECISION_SCHEMA) {
    throw new ValidationError('information access decision has unsupported schema');
  }
  assertReference(value.decision_id, 'decision_id');
  assertReference(value.requester, 'requester');
  assertReference(value.object_ref, 'object_ref');
  assertString(value.purpose, 'purpose', { max: 256 });
  assertEnum(value.right, 'right', RIGHTS);
  assertEnum(value.decision, 'decision', DECISIONS);
  assertReference(value.authority_ref, 'authority_ref');
  assertString(value.object_digest, 'object_digest', { max: 64, pattern: HEX_64 });
  assertIsoTimestamp(value.issued_at, 'issued_at');
  assertIsoTimestamp(value.expires_at, 'expires_at');
  if (Date.parse(value.expires_at) <= Date.parse(value.issued_at)) {
    throw new ValidationError('expires_at must be after issued_at');
  }
  assertReference(value.verifier_ref, 'verifier_ref');
  assertString(value.verifier_version, 'verifier_version', { max: 64, pattern: VERSION });
  assertUniqueStrings(value.reason_codes, 'reason_codes', { maxItems: 32, itemMax: 128 });
  return value;
}

export function assertInformationAccessDecisionBinds(value, expected, { now }) {
  const decision = validateInformationAccessDecision(value);
  assertIsoTimestamp(now, 'now');
  if (decision.decision !== 'allow') {
    throw new ValidationError('information access decision does not allow access');
  }
  if (Date.parse(now) >= Date.parse(decision.expires_at)) {
    throw new ValidationError('information access decision expired');
  }
  for (const field of ['requester', 'object_ref', 'purpose', 'right', 'object_digest']) {
    if (decision[field] !== expected[field]) {
      throw new ValidationError('information access decision does not bind exact request');
    }
  }
  return decision;
}

import { ValidationError, assertPlainObject, assertString } from '../lib/canonical.mjs';
import {
  assertAuthorityNeutral,
  assertEnum,
  assertIsoTimestamp,
  assertNoUnknownKeys,
  assertReference
} from './sovereign-information-common.mjs';

export const REPUTATION_QUERY_SCHEMA = 'axiom-reputation-query.v1';
export const REPUTATION_PRESENTATION_LEVELS = new Set(['criterion-only', 'bounded-summary']);
export const REPUTATION_REVIEW_FLOORS = new Set([
  'integrity-verified',
  'machine-reviewed',
  'human-reviewed',
  'adjudicated'
]);

const DOMAIN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ROOT_KEYS = new Set([
  'schema',
  'query_id',
  'requester',
  'subject_ref',
  'domain',
  'purpose',
  'criterion_ref',
  'evidence_window',
  'minimum_review_state',
  'requested_presentation',
  'max_claim_ttl_seconds',
  'verifier_policy_ref',
  'created_at',
  'expires_at'
]);
const WINDOW_KEYS = new Set(['starts_at', 'ends_at']);

export function validateReputationQuery(query) {
  assertAuthorityNeutral(query, 'reputation query');
  assertPlainObject(query, 'reputation query');
  assertNoUnknownKeys(query, 'reputation query', ROOT_KEYS);
  if (query.schema !== REPUTATION_QUERY_SCHEMA) {
    throw new ValidationError('reputation query has unsupported schema');
  }
  assertReference(query.query_id, 'query_id');
  assertReference(query.requester, 'requester');
  assertReference(query.subject_ref, 'subject_ref');
  assertString(query.domain, 'domain', { min: 1, max: 64, pattern: DOMAIN });
  assertString(query.purpose, 'purpose', { min: 1, max: 256 });
  assertReference(query.criterion_ref, 'criterion_ref');
  assertPlainObject(query.evidence_window, 'evidence_window');
  assertNoUnknownKeys(query.evidence_window, 'evidence_window', WINDOW_KEYS);
  assertIsoTimestamp(query.evidence_window.starts_at, 'evidence_window.starts_at');
  assertIsoTimestamp(query.evidence_window.ends_at, 'evidence_window.ends_at');
  if (Date.parse(query.evidence_window.ends_at) <= Date.parse(query.evidence_window.starts_at)) {
    throw new ValidationError('evidence_window.ends_at must follow evidence_window.starts_at');
  }
  assertEnum(query.minimum_review_state, 'minimum_review_state', REPUTATION_REVIEW_FLOORS);
  assertEnum(query.requested_presentation, 'requested_presentation', REPUTATION_PRESENTATION_LEVELS);
  if (
    !Number.isInteger(query.max_claim_ttl_seconds)
    || query.max_claim_ttl_seconds < 1
    || query.max_claim_ttl_seconds > 2_592_000
  ) {
    throw new ValidationError('max_claim_ttl_seconds must be an integer from 1 to 2592000');
  }
  assertReference(query.verifier_policy_ref, 'verifier_policy_ref');
  assertIsoTimestamp(query.created_at, 'created_at');
  assertIsoTimestamp(query.expires_at, 'expires_at');
  if (Date.parse(query.expires_at) <= Date.parse(query.created_at)) {
    throw new ValidationError('expires_at must follow created_at');
  }
  return query;
}

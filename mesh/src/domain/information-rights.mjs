import { ValidationError, assertPlainObject, assertString } from '../lib/canonical.mjs';
import {
  assertAuthorityNeutral,
  assertEnum,
  assertIsoTimestamp,
  assertNoUnknownKeys,
  assertReference,
  assertUniqueStrings
} from './sovereign-information-common.mjs';

export const INFORMATION_RIGHTS_SCHEMA = 'axiom-information-rights-envelope.v1';
export const INFORMATION_RELATIONSHIP_FIELDS = Object.freeze([
  'subjects',
  'originators',
  'custodians',
  'controllers',
  'affected_parties',
  'beneficiaries',
  'reviewers',
  'disclosure_authorities',
  'retention_authorities'
]);

export const INFORMATION_RIGHTS = new Set([
  'know-exists', 'inspect-metadata', 'inspect-full-content', 'receive-projection',
  'use-for-purpose', 'correct-factual-metadata', 'challenge-interpretation',
  'append-contrary-evidence', 'export', 'disclose-onward', 'delete',
  'request-deletion', 'retain-under-obligation', 'seal', 'unseal',
  'aggregate-analytics', 'model-input', 'cite-as-evidence', 'rely-for-decision'
]);

const ROOT_KEYS = new Set([
  'schema', 'object_ref', 'information_class', 'sensitivity_class', 'relationships',
  'authority_basis', 'allowed_purposes', 'forbidden_purposes', 'policy_refs',
  'projection_profiles', 'jurisdiction_context', 'provenance_refs', 'evidence_refs',
  'state', 'created_at', 'reviewed_at'
]);
const POLICY_KEYS = new Set(['access', 'disclosure', 'retention', 'challenge', 'correction', 'export', 'deletion']);
const STATE_KEYS = new Set(['retention', 'challenge', 'supersession']);
const RETENTION = new Set(['active', 'held', 'expired', 'deleted']);
const CHALLENGE = new Set(['none', 'open', 'resolved']);
const SUPERSESSION = new Set(['current', 'superseded']);

function validateRefs(values, name, { min = 0 } = {}) {
  for (const [index, value] of assertUniqueStrings(values, name, { min }).entries()) {
    assertReference(value, `${name}[${index}]`);
  }
}

export function validateInformationRightsEnvelope(envelope) {
  assertAuthorityNeutral(envelope, 'information rights envelope');
  assertNoUnknownKeys(envelope, 'information rights envelope', ROOT_KEYS);
  if (envelope.schema !== INFORMATION_RIGHTS_SCHEMA) throw new ValidationError('information rights envelope has unsupported schema');
  assertReference(envelope.object_ref, 'object_ref');
  assertString(envelope.information_class, 'information_class', { max: 128 });
  assertString(envelope.sensitivity_class, 'sensitivity_class', { max: 128 });

  assertPlainObject(envelope.relationships, 'relationships');
  assertNoUnknownKeys(envelope.relationships, 'relationships', new Set(INFORMATION_RELATIONSHIP_FIELDS));
  for (const field of INFORMATION_RELATIONSHIP_FIELDS) {
    if (!Object.hasOwn(envelope.relationships, field)) throw new ValidationError(`relationships is missing ${field}`);
    validateRefs(envelope.relationships[field], `relationships.${field}`);
  }

  validateRefs(envelope.authority_basis, 'authority_basis');
  const allowed = assertUniqueStrings(envelope.allowed_purposes, 'allowed_purposes');
  const forbidden = assertUniqueStrings(envelope.forbidden_purposes, 'forbidden_purposes');
  const forbiddenSet = new Set(forbidden);
  if (allowed.some(value => forbiddenSet.has(value))) throw new ValidationError('allowed_purposes and forbidden_purposes must not overlap');

  assertPlainObject(envelope.policy_refs, 'policy_refs');
  assertNoUnknownKeys(envelope.policy_refs, 'policy_refs', POLICY_KEYS);
  for (const field of POLICY_KEYS) {
    if (!Object.hasOwn(envelope.policy_refs, field)) throw new ValidationError(`policy_refs is missing ${field}`);
    validateRefs(envelope.policy_refs[field], `policy_refs.${field}`);
  }

  validateRefs(envelope.projection_profiles, 'projection_profiles');
  validateRefs(envelope.jurisdiction_context, 'jurisdiction_context');
  validateRefs(envelope.provenance_refs, 'provenance_refs');
  validateRefs(envelope.evidence_refs, 'evidence_refs');

  assertPlainObject(envelope.state, 'state');
  assertNoUnknownKeys(envelope.state, 'state', STATE_KEYS);
  for (const field of STATE_KEYS) if (!Object.hasOwn(envelope.state, field)) throw new ValidationError(`state is missing ${field}`);
  assertEnum(envelope.state.retention, 'state.retention', RETENTION);
  assertEnum(envelope.state.challenge, 'state.challenge', CHALLENGE);
  assertEnum(envelope.state.supersession, 'state.supersession', SUPERSESSION);

  assertIsoTimestamp(envelope.created_at, 'created_at');
  if (envelope.reviewed_at !== null) assertIsoTimestamp(envelope.reviewed_at, 'reviewed_at');
  return envelope;
}

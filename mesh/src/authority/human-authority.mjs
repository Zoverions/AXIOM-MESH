import { readFile } from 'node:fs/promises';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';

export const HUMAN_AUTHORITY_CONTRACT_ID = 'axiom.human-authority';
export const HUMAN_AUTHORITY_CONTRACT_VERSION = '1.0.0';
export const HUMAN_AUTHORITY_CONTRACT_SCHEMA = 'axiom-human-authority-contract.v1';
export const RELATIONSHIP_SCHEMA = 'axiom-human-relationship-claim.v1';
export const AUTHORITY_GRANT_SCHEMA = 'axiom-human-authority-grant.v1';
export const AUTHORITY_CONFLICT_SCHEMA = 'axiom-human-authority-conflict.v1';
export const AUTHORITY_FACTS_SCHEMA = 'axiom-human-authority-facts.v1';
export const MINIMUM_DELEGATED_AUTHORITY_ASSURANCE = 'A2';
export const HUMAN_AUTHORITY_CONTRACT_PATH = new URL(
  '../../config/domain-contracts/human-authority.v1.json',
  import.meta.url
);

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const ACTION = /^[a-z][a-z0-9.-]{0,127}$/;
const SCOPE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ASSURANCE_RANK = Object.freeze({ A0: 0, A1: 1, A2: 2, A3: 3, A4: 4 });
const RELATIONSHIP_STATUSES = new Set(['active', 'revoked', 'superseded']);
const AUTHORITY_STATUSES = new Set(['active', 'revoked', 'superseded']);
const CONFLICT_STATUSES = new Set(['unresolved', 'resolved', 'superseded']);
const AUTHORITY_SOURCES = new Set([
  'subject',
  'guardian',
  'institution',
  'law',
  'court',
  'other'
]);
const RELATIONSHIP_AUTHORITY_FIELDS = new Set([
  'actions',
  'controllers',
  'data_scopes',
  'purposes'
]);

function canonicalTimestamp(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const text = assertString(value, label, { max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical ISO-8601 timestamp`);
  }
  return text;
}

function canonicalStrings(value, label, {
  minItems = 0,
  maxItems = 128,
  pattern = SCOPE
} = {}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${label} must contain ${minItems}-${maxItems} values`);
  }
  const items = value.map((item, index) => assertString(item, `${label}[${index}]`, {
    max: 160,
    pattern
  }));
  if (new Set(items).size !== items.length) {
    throw new ValidationError(`${label} must not contain duplicates`);
  }
  const sorted = [...items].sort();
  if (JSON.stringify(sorted) !== JSON.stringify(items)) {
    throw new ValidationError(`${label} must be sorted canonically`);
  }
  return items;
}

function requireDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function requireAssurance(value, label) {
  const assurance = assertString(value, label, { min: 2, max: 2, pattern: /^A[0-4]$/ });
  if (!Object.hasOwn(ASSURANCE_RANK, assurance)) {
    throw new ValidationError(`${label} is unsupported`);
  }
  return assurance;
}

function activeAt(record, asOf) {
  const start = new Date(record.effective_from).valueOf();
  const end = record.effective_until === null
    ? Number.POSITIVE_INFINITY
    : new Date(record.effective_until).valueOf();
  const point = new Date(asOf).valueOf();
  return start <= point && point < end;
}

export function validateRelationshipClaim(raw) {
  const claim = assertPlainObject(raw, 'relationship claim');
  if (claim.schema !== RELATIONSHIP_SCHEMA) {
    throw new ValidationError('Relationship claim schema is unsupported');
  }
  for (const field of RELATIONSHIP_AUTHORITY_FIELDS) {
    if (Object.hasOwn(claim, field)) {
      throw new ValidationError(`Relationship claim may not contain authority field: ${field}`);
    }
  }
  const normalized = {
    schema: RELATIONSHIP_SCHEMA,
    claim_id: assertString(claim.claim_id, 'relationship claim_id', { max: 160, pattern: ID }),
    subject_id: assertString(claim.subject_id, 'relationship subject_id', { max: 160, pattern: ID }),
    holder_id: assertString(claim.holder_id, 'relationship holder_id', { max: 160, pattern: ID }),
    relationship_type: assertString(claim.relationship_type, 'relationship_type', {
      max: 96,
      pattern: /^[a-z][a-z0-9.-]{0,95}$/
    }),
    issuer_id: assertString(claim.issuer_id, 'relationship issuer_id', { max: 160, pattern: ID }),
    assurance: requireAssurance(claim.assurance, 'relationship assurance'),
    evidence_digest: requireDigest(claim.evidence_digest, 'relationship evidence_digest'),
    jurisdiction_context_digest: requireDigest(
      claim.jurisdiction_context_digest,
      'relationship jurisdiction_context_digest'
    ),
    effective_from: canonicalTimestamp(claim.effective_from, 'relationship effective_from'),
    effective_until: canonicalTimestamp(claim.effective_until, 'relationship effective_until', {
      nullable: true
    }),
    status: assertString(claim.status, 'relationship status', { max: 32 })
  };
  if (!RELATIONSHIP_STATUSES.has(normalized.status)) {
    throw new ValidationError('Relationship status is unsupported');
  }
  if (
    normalized.effective_until !== null
    && new Date(normalized.effective_until) <= new Date(normalized.effective_from)
  ) {
    throw new ValidationError('Relationship effective_until must follow effective_from');
  }
  return normalized;
}

export function validateAuthorityGrant(raw) {
  const grant = assertPlainObject(raw, 'authority grant');
  if (grant.schema !== AUTHORITY_GRANT_SCHEMA) {
    throw new ValidationError('Authority grant schema is unsupported');
  }
  const normalized = {
    schema: AUTHORITY_GRANT_SCHEMA,
    grant_id: assertString(grant.grant_id, 'authority grant_id', { max: 160, pattern: ID }),
    subject_id: assertString(grant.subject_id, 'authority subject_id', { max: 160, pattern: ID }),
    holder_id: assertString(grant.holder_id, 'authority holder_id', { max: 160, pattern: ID }),
    relationship_claim_id: assertString(
      grant.relationship_claim_id,
      'authority relationship_claim_id',
      { max: 160, pattern: ID }
    ),
    issuer_id: assertString(grant.issuer_id, 'authority issuer_id', { max: 160, pattern: ID }),
    authority_source: assertString(grant.authority_source, 'authority source', { max: 32 }),
    controllers: canonicalStrings(grant.controllers, 'authority controllers', { minItems: 1 }),
    purposes: canonicalStrings(grant.purposes, 'authority purposes', {
      minItems: 1,
      pattern: /^[a-z][a-z0-9.-]{0,127}$/
    }),
    data_scopes: canonicalStrings(grant.data_scopes, 'authority data_scopes'),
    actions: canonicalStrings(grant.actions, 'authority actions', {
      minItems: 1,
      pattern: ACTION
    }),
    assurance: requireAssurance(grant.assurance, 'authority assurance'),
    evidence_digest: requireDigest(grant.evidence_digest, 'authority evidence_digest'),
    jurisdiction_context_digest: requireDigest(
      grant.jurisdiction_context_digest,
      'authority jurisdiction_context_digest'
    ),
    effective_from: canonicalTimestamp(grant.effective_from, 'authority effective_from'),
    effective_until: canonicalTimestamp(grant.effective_until, 'authority effective_until', {
      nullable: true
    }),
    revocable: grant.revocable,
    delegable: grant.delegable,
    status: assertString(grant.status, 'authority status', { max: 32 })
  };
  if (!AUTHORITY_SOURCES.has(normalized.authority_source)) {
    throw new ValidationError('Authority source is unsupported');
  }
  if (typeof normalized.revocable !== 'boolean') {
    throw new ValidationError('Authority revocable must be boolean');
  }
  if (normalized.delegable !== false) {
    throw new ValidationError('Human authority v1 does not permit transitive delegation');
  }
  if (!AUTHORITY_STATUSES.has(normalized.status)) {
    throw new ValidationError('Authority status is unsupported');
  }
  if (
    normalized.effective_until !== null
    && new Date(normalized.effective_until) <= new Date(normalized.effective_from)
  ) {
    throw new ValidationError('Authority effective_until must follow effective_from');
  }
  return normalized;
}

export function validateAuthorityConflict(raw) {
  const conflict = assertPlainObject(raw, 'authority conflict');
  if (conflict.schema !== AUTHORITY_CONFLICT_SCHEMA) {
    throw new ValidationError('Authority conflict schema is unsupported');
  }
  const normalized = {
    schema: AUTHORITY_CONFLICT_SCHEMA,
    conflict_id: assertString(conflict.conflict_id, 'authority conflict_id', {
      max: 160,
      pattern: ID
    }),
    subject_id: assertString(conflict.subject_id, 'authority conflict subject_id', {
      max: 160,
      pattern: ID
    }),
    grant_ids: canonicalStrings(conflict.grant_ids, 'authority conflict grant_ids', {
      minItems: 1
    }),
    evidence_digest: requireDigest(conflict.evidence_digest, 'authority conflict evidence_digest'),
    jurisdiction_context_digest: requireDigest(
      conflict.jurisdiction_context_digest,
      'authority conflict jurisdiction_context_digest'
    ),
    effective_from: canonicalTimestamp(conflict.effective_from, 'authority conflict effective_from'),
    effective_until: canonicalTimestamp(
      conflict.effective_until,
      'authority conflict effective_until',
      { nullable: true }
    ),
    status: assertString(conflict.status, 'authority conflict status', { max: 32 })
  };
  if (!CONFLICT_STATUSES.has(normalized.status)) {
    throw new ValidationError('Authority conflict status is unsupported');
  }
  if (
    normalized.effective_until !== null
    && new Date(normalized.effective_until) <= new Date(normalized.effective_from)
  ) {
    throw new ValidationError('Authority conflict effective_until must follow effective_from');
  }
  return normalized;
}

export function resolveHumanAuthority({
  holderType,
  subjectId,
  holderId,
  grantId,
  controller,
  purpose,
  action,
  dataScopes = [],
  relationshipClaims,
  authorityGrants,
  conflicts = [],
  asOf = new Date().toISOString(),
  minimumAssurance = MINIMUM_DELEGATED_AUTHORITY_ASSURANCE
}) {
  if (holderType !== 'human') {
    return deny('authority_holder_type_unavailable', 'Delegated human authority requires a human holder.');
  }
  const request = {
    subject_id: assertString(subjectId, 'authority request subjectId', { max: 160, pattern: ID }),
    holder_id: assertString(holderId, 'authority request holderId', { max: 160, pattern: ID }),
    grant_id: assertString(grantId, 'authority request grantId', { max: 160, pattern: ID }),
    controller: assertString(controller, 'authority request controller', { max: 160, pattern: ID }),
    purpose: assertString(purpose, 'authority request purpose', {
      max: 128,
      pattern: /^[a-z][a-z0-9.-]{0,127}$/
    }),
    action: assertString(action, 'authority request action', { max: 128, pattern: ACTION }),
    data_scopes: canonicalStrings(dataScopes, 'authority request dataScopes')
  };
  const asOfCanonical = canonicalTimestamp(asOf, 'authority request asOf');
  const minimum = requireAssurance(minimumAssurance, 'authority minimum assurance');
  if (ASSURANCE_RANK[minimum] < ASSURANCE_RANK[MINIMUM_DELEGATED_AUTHORITY_ASSURANCE]) {
    throw new ValidationError(
      `Delegated authority minimum assurance cannot be lower than ${MINIMUM_DELEGATED_AUTHORITY_ASSURANCE}`
    );
  }
  if (!Array.isArray(relationshipClaims) || !Array.isArray(authorityGrants) || !Array.isArray(conflicts)) {
    throw new ValidationError('Authority resolver records must be arrays');
  }

  const grants = authorityGrants.map(validateAuthorityGrant);
  const grant = grants.find(candidate => candidate.grant_id === request.grant_id);
  if (!grant) return deny('authority_grant_unavailable', 'The requested authority grant is unavailable.');
  if (
    grant.status !== 'active'
    || !activeAt(grant, asOfCanonical)
    || ASSURANCE_RANK[grant.assurance] < ASSURANCE_RANK[minimum]
  ) {
    return deny('authority_grant_inactive', 'The authority grant is revoked, expired, superseded, or below assurance.');
  }
  if (grant.subject_id !== request.subject_id || grant.holder_id !== request.holder_id) {
    return deny('authority_grant_subject_mismatch', 'The authority grant is not bound to this subject and holder.');
  }

  const relationships = relationshipClaims.map(validateRelationshipClaim);
  const relationship = relationships.find(
    candidate => candidate.claim_id === grant.relationship_claim_id
  );
  if (!relationship) {
    return deny('authority_relationship_unavailable', 'The relationship claim referenced by the authority grant is unavailable.');
  }
  if (
    relationship.status !== 'active'
    || !activeAt(relationship, asOfCanonical)
    || ASSURANCE_RANK[relationship.assurance] < ASSURANCE_RANK[minimum]
  ) {
    return deny('authority_relationship_inactive', 'The relationship claim is revoked, expired, superseded, or below assurance.');
  }
  if (
    relationship.subject_id !== grant.subject_id
    || relationship.holder_id !== grant.holder_id
    || relationship.jurisdiction_context_digest !== grant.jurisdiction_context_digest
  ) {
    return deny(
      'authority_relationship_mismatch',
      'The relationship claim does not match the grant subject, holder, and jurisdiction context.'
    );
  }

  const activeConflicts = conflicts
    .map(validateAuthorityConflict)
    .filter(conflict => (
      conflict.status === 'unresolved'
      && conflict.subject_id === request.subject_id
      && conflict.grant_ids.includes(grant.grant_id)
      && conflict.jurisdiction_context_digest === grant.jurisdiction_context_digest
      && activeAt(conflict, asOfCanonical)
    ));
  if (activeConflicts.length) {
    return deny(
      'authority_conflict_unresolved',
      'An unresolved authority conflict applies to the requested grant.'
    );
  }

  if (!grant.controllers.includes(request.controller)) {
    return deny('authority_controller_denied', 'The authority grant does not cover this controller.');
  }
  if (!grant.purposes.includes(request.purpose)) {
    return deny('authority_purpose_denied', 'The authority grant does not cover this purpose.');
  }
  if (!grant.actions.includes(request.action)) {
    return deny('authority_action_denied', 'The authority grant does not cover this action.');
  }
  if (request.data_scopes.some(scope => !grant.data_scopes.includes(scope))) {
    return deny('authority_data_scope_denied', 'The authority grant does not cover every requested data scope.');
  }

  const facts = {
    schema: AUTHORITY_FACTS_SCHEMA,
    contract_id: HUMAN_AUTHORITY_CONTRACT_ID,
    contract_version: HUMAN_AUTHORITY_CONTRACT_VERSION,
    grant_id: grant.grant_id,
    relationship_claim_id: relationship.claim_id,
    subject_id: request.subject_id,
    holder_id: request.holder_id,
    controller: request.controller,
    purpose: request.purpose,
    action: request.action,
    data_scopes: request.data_scopes,
    authority_source: grant.authority_source,
    assurance: grant.assurance,
    relationship_assurance: relationship.assurance,
    jurisdiction_context_digest: grant.jurisdiction_context_digest,
    grant_evidence_digest: grant.evidence_digest,
    relationship_evidence_digest: relationship.evidence_digest,
    grant_effective_until: grant.effective_until,
    relationship_effective_until: relationship.effective_until,
    resolved_at: asOfCanonical
  };
  return {
    allow: true,
    facts,
    authority_digest: digestObject(facts),
    non_claims: [
      'relationship-claim-does-not-prove-legal-authority',
      'authority-grant-does-not-create-consent',
      'resolution-does-not-encode-jurisdiction-law',
      'runtime-action-still-requires-policy-and-consent'
    ]
  };
}

export function validateHumanAuthorityContract(raw) {
  const contract = assertPlainObject(raw, 'human authority contract');
  if (
    contract.schema !== HUMAN_AUTHORITY_CONTRACT_SCHEMA
    || contract.contract_id !== HUMAN_AUTHORITY_CONTRACT_ID
    || contract.contract_version !== HUMAN_AUTHORITY_CONTRACT_VERSION
    || contract.kernel_minimum !== '0.12.0-dev.0'
    || contract.status !== 'foundation-not-runtime-enabled'
    || contract.minimum_delegated_authority_assurance !== MINIMUM_DELEGATED_AUTHORITY_ASSURANCE
  ) {
    throw new ValidationError('Human authority contract identity is invalid');
  }
  const invariants = new Set(contract.core_invariants ?? []);
  for (const invariant of [
    'relationship-is-not-authority',
    'authority-is-not-consent',
    'role-does-not-grant-authority',
    'delegation-is-not-transitive-in-v1',
    'unresolved-conflict-fails-closed',
    'revocation-affects-future-use-not-history'
  ]) {
    if (!invariants.has(invariant)) {
      throw new ValidationError(`Human authority contract is missing invariant: ${invariant}`);
    }
  }
  if (contract.authority_grant?.delegable_v1 !== false) {
    throw new ValidationError('Human authority v1 must keep transitive delegation disabled');
  }
  if (contract.resolution?.exact_grant_id_required !== true) {
    throw new ValidationError('Human authority v1 requires exact grant selection');
  }
  if (contract.resolution?.unresolved_conflict_for_grant_denies !== true) {
    throw new ValidationError('Human authority v1 must fail closed on unresolved conflict');
  }
  return contract;
}

export async function loadHumanAuthorityContract(path = HUMAN_AUTHORITY_CONTRACT_PATH) {
  const bytes = await readFile(path);
  let contract;
  try {
    contract = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new ValidationError(`Human authority contract JSON is invalid: ${error.message}`);
  }
  return validateHumanAuthorityContract(contract);
}

function deny(code, reason) {
  return { allow: false, code, reason };
}

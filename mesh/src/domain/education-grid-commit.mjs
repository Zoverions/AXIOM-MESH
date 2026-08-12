import {
  AxiomError,
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
import {
  EDUCATION_SELF_AUTHORITY_MODE,
  educationGridEventId
} from './education-learner-record.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const EDUCATION_EVENT_KIND = 'education.learner.event.appended';
const PURPOSE = 'learning-progress-recording';
const SCOPES = Object.freeze(['learning-progress:write']);

/**
 * Final synchronous education-event preflight at the Grid commit boundary.
 *
 * Hypervisor already binds the observed consent facts into the signed capability
 * and plan. This check intentionally repeats the authority-sensitive facts against
 * current Grid state immediately before append so a consent revoke cannot race the
 * final authoritative record. It checks only memory metadata (owner/status), never
 * decrypts learner memory content.
 */
export function preflightEducationGridCommit(store, actor, rawEvent, {
  now = new Date().toISOString()
} = {}) {
  if (rawEvent?.kind !== EDUCATION_EVENT_KIND) return;
  const event = assertPlainObject(rawEvent, 'education learner Grid event');
  const payload = assertPlainObject(event.payload, 'education learner Grid payload');
  const consent = assertPlainObject(payload.consent, 'education learner Grid consent');

  if (payload.schema !== 'axiom-education-learner-event.v1') {
    throw new ValidationError('Education learner Grid record schema is unsupported');
  }
  if (
    payload.contract_id !== EDUCATION_CONTRACT_ID
    || payload.contract_version !== EDUCATION_CONTRACT_VERSION
    || payload.contract_sha256 !== EDUCATION_CONTRACT_SHA256
  ) {
    throw new ValidationError('Education learner Grid record contract binding is invalid');
  }

  const subjectId = assertString(payload.subject_id, 'education subject_id', {
    max: 160,
    pattern: ID
  });
  const learnerEventId = assertString(payload.event_id, 'education event_id', {
    max: 160,
    pattern: ID
  });
  const memoryObjectId = assertString(payload.memory_object_id, 'education memory_object_id', {
    max: 160,
    pattern: ID
  });
  const gridEventId = assertString(event.event_id, 'education Grid event_id', {
    max: 160,
    pattern: ID
  });

  if (actor !== subjectId) {
    throw new AxiomError(
      'education_subject_authority_unavailable',
      'Education learner event actor must be the directly self-authorizing subject.',
      403
    );
  }
  if (event.subject !== learnerEventId) {
    throw new ValidationError('Education Grid event subject must equal the learner event ID');
  }
  if (gridEventId !== educationGridEventId(subjectId, learnerEventId)) {
    throw new ValidationError('Education Grid event ID is not bound to subject and learner event identity');
  }

  const consentId = assertString(consent.consent_id, 'education consent_id', {
    max: 160,
    pattern: ID
  });
  const suppliedConsentDigest = assertString(consent.consent_digest, 'education consent_digest', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  if (
    consent.authority_mode !== EDUCATION_SELF_AUTHORITY_MODE
    || consent.purpose !== PURPOSE
    || JSON.stringify(consent.data_scopes) !== JSON.stringify(SCOPES)
  ) {
    throw new ValidationError('Education learner event consent profile is unsupported');
  }

  const row = store.db.prepare(`
    SELECT consent_id, subject, controller, purpose, scopes_json,
           expires_at, status
    FROM consents
    WHERE consent_id = ?
  `).get(consentId);
  if (!row) {
    throw new AxiomError(
      'education_consent_unavailable_at_commit',
      'Education consent receipt is unavailable at the final Grid commit boundary.',
      403
    );
  }
  const scopes = store.openJson(
    'consents',
    'scopes_json',
    row.consent_id,
    row.scopes_json
  );
  const normalizedScopes = Array.isArray(scopes) ? [...scopes].sort() : [];
  const nowMs = new Date(now).valueOf();
  const expiryMs = new Date(row.expires_at).valueOf();
  if (
    row.status !== 'active'
    || row.subject !== actor
    || row.controller !== EDUCATION_CONTRACT_CONTROLLER
    || row.purpose !== PURPOSE
    || JSON.stringify(normalizedScopes) !== JSON.stringify(SCOPES)
    || !Number.isFinite(nowMs)
    || !Number.isFinite(expiryMs)
    || expiryMs <= nowMs
  ) {
    throw new AxiomError(
      'education_consent_unavailable_at_commit',
      'Education consent is revoked, expired, or mismatched at the final Grid commit boundary.',
      403
    );
  }

  const currentFacts = {
    schema: 'axiom-education-consent-facts.v1',
    authority_mode: EDUCATION_SELF_AUTHORITY_MODE,
    consent_id: row.consent_id,
    subject_id: row.subject,
    controller: row.controller,
    purpose: row.purpose,
    data_scopes: normalizedScopes,
    expires_at: row.expires_at,
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256
  };
  if (
    suppliedConsentDigest !== digestObject(currentFacts)
    || consent.expires_at !== row.expires_at
  ) {
    throw new AxiomError(
      'education_consent_binding_stale',
      'Education learner event consent binding no longer matches current Grid state.',
      403
    );
  }

  const memory = store.db.prepare(`
    SELECT object_id, owner, status
    FROM memory_objects
    WHERE object_id = ?
  `).get(memoryObjectId);
  if (!memory || memory.status !== 'active' || memory.owner !== actor) {
    throw new AxiomError(
      'education_memory_reference_unavailable',
      'Education learner event must reference an active memory object owned by the subject.',
      409
    );
  }

  const {
    record_digest: suppliedRecordDigest,
    evidence: _executionEvidence,
    ...record
  } = payload;
  const recordDigest = assertString(suppliedRecordDigest, 'education record_digest', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  if (recordDigest !== digestObject(record)) {
    throw new ValidationError('Education learner event record digest is invalid at Grid commit');
  }
}

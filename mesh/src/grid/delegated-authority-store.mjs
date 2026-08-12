import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString
} from '../lib/canonical.mjs';
import { AuthorityGridStore } from './authority-store.mjs';
import {
  evaluateDelegatedConsent,
  validateDelegatedConsentReceipt
} from '../authority/human-delegated-consent.mjs';

export const DELEGATED_CONSENT_GRANTED_EVENT = 'human.delegated-consent.granted';
export const DELEGATED_CONSENT_REVOKED_EVENT = 'human.delegated-consent.revoked';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_RECEIPT_COMMIT_AGE_MS = 5 * 60 * 1000;
const DELEGATED_CONSENT_COLUMNS = Object.freeze([
  'consent_id',
  'subject_id',
  'holder_id',
  'authority_grant_id',
  'expires_at',
  'status',
  'source_event_id',
  'status_event_id',
  'status_at'
]);

const DELEGATED_CONSENT_PROJECTION_SQL = `
  CREATE TABLE IF NOT EXISTS human_delegated_consents (
    consent_id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    holder_id TEXT NOT NULL,
    authority_grant_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL,
    source_event_id TEXT NOT NULL,
    status_event_id TEXT NOT NULL,
    status_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS human_delegated_consents_subject_holder_idx
  ON human_delegated_consents(subject_id, holder_id, status, expires_at);
`;

export class DelegatedAuthorityGridStore extends AuthorityGridStore {
  initialize() {
    // This table is a rebuildable projection over protected Grid events. Create it
    // before base initialization so dynamic replay can safely target it.
    this.db.exec(DELEGATED_CONSENT_PROJECTION_SQL);
    super.initialize();
    this.verifyDelegatedConsentProjectionSchema();
  }

  rebuildMaterializedState() {
    this.db.exec('DELETE FROM human_delegated_consents');
    super.rebuildMaterializedState();
  }

  appendEvents({ traceId, actor, events }) {
    if (Array.isArray(events)) {
      for (const event of events) this.preflightDelegatedConsentEvent(event, actor);
    }
    return super.appendEvents({ traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    const payload = event.payload;
    switch (event.kind) {
      case DELEGATED_CONSENT_GRANTED_EVENT: {
        const receipt = validateDelegatedConsentReceipt(payload);
        this.db.prepare(`
          INSERT INTO human_delegated_consents(
            consent_id, subject_id, holder_id, authority_grant_id, expires_at,
            status, source_event_id, status_event_id, status_at
          ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
        `).run(
          receipt.consent_id,
          receipt.subject_id,
          receipt.holder_id,
          receipt.authority_grant_id,
          receipt.expires_at,
          event.event_id,
          event.event_id,
          event.occurred_at
        );
        break;
      }
      case DELEGATED_CONSENT_REVOKED_EVENT: {
        const revocation = validateDelegatedConsentRevocation(payload);
        if (this.db.prepare(`
          UPDATE human_delegated_consents
          SET status = 'revoked', status_event_id = ?, status_at = ?
          WHERE consent_id = ? AND holder_id = ? AND status = 'active'
        `).run(
          event.event_id,
          event.occurred_at,
          revocation.consent_id,
          revocation.holder_id
        ).changes !== 1) {
          throw new ValidationError('Active delegated consent was not found for revocation');
        }
        break;
      }
      default:
        break;
    }
  }

  preflightDelegatedConsentEvent(rawEvent, actor) {
    if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) return;
    if (rawEvent.kind === DELEGATED_CONSENT_GRANTED_EVENT) {
      const receipt = validateDelegatedConsentReceipt(rawEvent.payload);
      if (rawEvent.subject !== receipt.consent_id) {
        throw new ValidationError('Delegated consent event subject must equal consent_id');
      }
      if (actor !== receipt.holder_id) {
        throw new ValidationError('Delegated consent holder must match the authenticated actor');
      }
      if (this.delegatedConsentRow(receipt.consent_id)) {
        throw new AxiomError('state_conflict', 'Delegated consent already exists', 409);
      }
      const current = new Date().toISOString();
      const age = new Date(current).valueOf() - new Date(receipt.granted_at).valueOf();
      if (age < 0 || age > MAX_RECEIPT_COMMIT_AGE_MS) {
        throw new AxiomError(
          'delegated_consent_stale_grant',
          'Delegated consent must be committed promptly after current authority resolution',
          409
        );
      }
      const authority = this.resolveStoredHumanAuthority({
        holderType: 'human',
        subjectId: receipt.subject_id,
        holderId: receipt.holder_id,
        grantId: receipt.authority_grant_id,
        controller: receipt.controller,
        purpose: receipt.purpose,
        action: receipt.action,
        dataScopes: receipt.data_scopes,
        asOf: current
      });
      const authorization = evaluateDelegatedConsent({
        receipt,
        authority,
        subjectId: receipt.subject_id,
        holderId: receipt.holder_id,
        controller: receipt.controller,
        purpose: receipt.purpose,
        action: receipt.action,
        dataScopes: receipt.data_scopes,
        now: current
      });
      if (!authorization.allow) {
        throw new AxiomError(
          authorization.code ?? 'delegated_consent_denied',
          authorization.reason ?? 'Delegated consent is not authorized by current authority',
          409
        );
      }
      return;
    }
    if (rawEvent.kind === DELEGATED_CONSENT_REVOKED_EVENT) {
      const revocation = validateDelegatedConsentRevocation(rawEvent.payload);
      if (rawEvent.subject !== revocation.consent_id) {
        throw new ValidationError('Delegated consent revocation subject must equal consent_id');
      }
      if (actor !== revocation.holder_id) {
        throw new ValidationError('Delegated consent revocation holder must match the authenticated actor');
      }
      const current = this.getDelegatedConsent(revocation.consent_id);
      if (
        current.status !== 'active'
        || current.holder_id !== revocation.holder_id
        || current.revocation_handle_hash !== revocation.revocation_handle_hash
      ) {
        throw new AxiomError(
          'delegated_consent_revocation_mismatch',
          'Delegated consent revocation does not match the active receipt',
          409
        );
      }
    }
  }

  getDelegatedConsent(consentId) {
    const id = assertString(consentId, 'delegated consentId', { max: 160, pattern: ID });
    const row = this.delegatedConsentRow(id);
    if (!row) {
      throw new AxiomError('delegated_consent_not_found', 'Delegated consent was not found', 404);
    }
    const event = this.delegatedConsentSourceEvent(row.source_event_id);
    return validateDelegatedConsentReceipt({ ...event.payload, status: row.status });
  }

  listDelegatedConsents(subjectId, { holderId } = {}) {
    const subject = assertString(subjectId, 'delegated consent subjectId', {
      max: 160,
      pattern: ID
    });
    const holder = holderId === undefined
      ? null
      : assertString(holderId, 'delegated consent holderId', { max: 160, pattern: ID });
    const rows = holder === null
      ? this.db.prepare(`
          SELECT consent_id FROM human_delegated_consents
          WHERE subject_id = ? ORDER BY consent_id
        `).all(subject)
      : this.db.prepare(`
          SELECT consent_id FROM human_delegated_consents
          WHERE subject_id = ? AND holder_id = ? ORDER BY consent_id
        `).all(subject, holder);
    return rows.map(row => this.getDelegatedConsent(row.consent_id));
  }

  resolveDelegatedConsentAuthorization({
    consentId,
    subjectId,
    holderId,
    controller,
    purpose,
    action,
    dataScopes,
    now = new Date().toISOString()
  }) {
    let receipt;
    try {
      receipt = this.getDelegatedConsent(consentId);
    } catch (error) {
      if (error?.code === 'delegated_consent_not_found') {
        return {
          allow: false,
          code: 'delegated_consent_unavailable',
          reason: 'The requested delegated consent receipt is unavailable.'
        };
      }
      throw error;
    }
    const authority = this.resolveStoredHumanAuthority({
      holderType: 'human',
      subjectId,
      holderId,
      grantId: receipt.authority_grant_id,
      controller,
      purpose,
      action,
      dataScopes,
      asOf: now
    });
    return evaluateDelegatedConsent({
      receipt,
      authority,
      subjectId,
      holderId,
      controller,
      purpose,
      action,
      dataScopes,
      now
    });
  }

  delegatedConsentRow(consentId) {
    return this.db.prepare(`
      SELECT * FROM human_delegated_consents WHERE consent_id = ?
    `).get(consentId);
  }

  delegatedConsentSourceEvent(eventId) {
    const row = this.db.prepare('SELECT * FROM events WHERE event_id = ?').get(eventId);
    if (!row) {
      throw new AxiomError('integrity_failure', 'Delegated consent source event is missing', 500);
    }
    const event = this.decodeEventRow(row);
    if (event.kind !== DELEGATED_CONSENT_GRANTED_EVENT) {
      throw new AxiomError('integrity_failure', 'Delegated consent source event kind is invalid', 500);
    }
    return event;
  }

  verifyDelegatedConsentProjectionSchema() {
    const columns = this.db.prepare('PRAGMA table_info(human_delegated_consents)')
      .all()
      .map(column => column.name);
    if (JSON.stringify(columns) !== JSON.stringify(DELEGATED_CONSENT_COLUMNS)) {
      throw new ValidationError('Delegated consent projection schema does not match the runtime');
    }
  }
}

export function validateDelegatedConsentRevocation(raw) {
  const payload = assertPlainObject(raw, 'delegated consent revocation');
  return {
    consent_id: assertString(payload.consent_id, 'delegated revocation consent_id', {
      max: 160,
      pattern: ID
    }),
    holder_id: assertString(payload.holder_id, 'delegated revocation holder_id', {
      max: 160,
      pattern: ID
    }),
    revocation_handle_hash: assertString(
      payload.revocation_handle_hash,
      'delegated revocation_handle_hash',
      { min: 64, max: 64, pattern: DIGEST }
    )
  };
}

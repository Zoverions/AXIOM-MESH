import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString
} from '../lib/canonical.mjs';
import {
  resolveHumanAuthority,
  validateAuthorityConflict,
  validateAuthorityGrant,
  validateRelationshipClaim
} from '../authority/human-authority.mjs';
import { GridStore } from './store.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export const HUMAN_AUTHORITY_EVENT_KINDS = Object.freeze([
  'human.relationship.claimed',
  'human.relationship.revoked',
  'human.relationship.superseded',
  'human.authority.granted',
  'human.authority.revoked',
  'human.authority.superseded',
  'human.authority.conflict.opened',
  'human.authority.conflict.resolved',
  'human.authority.conflict.superseded'
]);

export class AuthorityGridStore extends GridStore {
  rebuildMaterializedState() {
    this.db.exec(`
      DELETE FROM human_authority_conflicts;
      DELETE FROM human_authority_grants;
      DELETE FROM human_relationship_claims;
    `);
    return super.rebuildMaterializedState();
  }

  applyMaterializedEvent(event) {
    switch (event.kind) {
      case 'human.relationship.claimed':
        this.applyRelationshipClaimed(event);
        return;
      case 'human.relationship.revoked':
        this.applyRelationshipTransition(event, 'revoked');
        return;
      case 'human.relationship.superseded':
        this.applyRelationshipTransition(event, 'superseded');
        return;
      case 'human.authority.granted':
        this.applyAuthorityGranted(event);
        return;
      case 'human.authority.revoked':
        this.applyAuthorityTransition(event, 'revoked');
        return;
      case 'human.authority.superseded':
        this.applyAuthorityTransition(event, 'superseded');
        return;
      case 'human.authority.conflict.opened':
        this.applyAuthorityConflictOpened(event);
        return;
      case 'human.authority.conflict.resolved':
        this.applyAuthorityConflictTransition(event, 'resolved');
        return;
      case 'human.authority.conflict.superseded':
        this.applyAuthorityConflictTransition(event, 'superseded');
        return;
      default:
        return super.applyMaterializedEvent(event);
    }
  }

  applyRelationshipClaimed(event) {
    const claim = validateRelationshipClaim(event.payload);
    if (claim.status !== 'active') {
      throw new ValidationError('New relationship claim must enter materialized state as active');
    }
    if (event.subject !== claim.claim_id) {
      throw new ValidationError('Relationship event subject must equal claim_id');
    }
    if (this.relationshipRow(claim.claim_id)) {
      throw new AxiomError('state_conflict', 'Relationship claim already exists', 409);
    }
    this.db.prepare(`
      INSERT INTO human_relationship_claims(
        claim_id, subject_id, holder_id, issuer_id, assurance,
        jurisdiction_context_digest, effective_from, effective_until,
        status, source_event_id, status_event_id, status_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(
      claim.claim_id,
      claim.subject_id,
      claim.holder_id,
      claim.issuer_id,
      claim.assurance,
      claim.jurisdiction_context_digest,
      claim.effective_from,
      claim.effective_until,
      event.event_id,
      event.event_id,
      event.occurred_at
    );
  }

  applyRelationshipTransition(event, nextStatus) {
    const transition = validateStatusTransitionPayload(
      event.payload,
      'claim_id',
      'relationship transition'
    );
    if (event.subject !== transition.record_id) {
      throw new ValidationError('Relationship transition subject must equal claim_id');
    }
    const current = this.relationshipRow(transition.record_id);
    if (!current) {
      throw new AxiomError('state_conflict', 'Relationship claim does not exist', 409);
    }
    if (current.subject_id !== transition.subject_id) {
      throw new AxiomError('state_conflict', 'Relationship transition subject_id differs from current state', 409);
    }
    if (current.status !== 'active') {
      throw new AxiomError('state_conflict', 'Only an active relationship claim may transition', 409);
    }
    if (nextStatus === 'superseded') {
      const replacementId = assertString(
        event.payload.superseded_by_claim_id,
        'relationship superseded_by_claim_id',
        { max: 160, pattern: ID }
      );
      if (replacementId === current.claim_id) {
        throw new ValidationError('Relationship cannot supersede itself');
      }
      const replacement = this.relationshipRow(replacementId);
      if (
        !replacement
        || replacement.status !== 'active'
        || replacement.subject_id !== current.subject_id
        || replacement.holder_id !== current.holder_id
        || replacement.jurisdiction_context_digest !== current.jurisdiction_context_digest
      ) {
        throw new AxiomError(
          'state_conflict',
          'Relationship supersession requires a matching active replacement claim',
          409
        );
      }
    }
    this.db.prepare(`
      UPDATE human_relationship_claims
      SET status = ?, status_event_id = ?, status_at = ?
      WHERE claim_id = ?
    `).run(nextStatus, event.event_id, event.occurred_at, current.claim_id);
  }

  applyAuthorityGranted(event) {
    const grant = validateAuthorityGrant(event.payload);
    if (grant.status !== 'active') {
      throw new ValidationError('New authority grant must enter materialized state as active');
    }
    if (event.subject !== grant.grant_id) {
      throw new ValidationError('Authority grant event subject must equal grant_id');
    }
    if (this.authorityGrantRow(grant.grant_id)) {
      throw new AxiomError('state_conflict', 'Authority grant already exists', 409);
    }
    const relationship = this.relationshipRow(grant.relationship_claim_id);
    if (
      !relationship
      || relationship.status !== 'active'
      || relationship.subject_id !== grant.subject_id
      || relationship.holder_id !== grant.holder_id
      || relationship.jurisdiction_context_digest !== grant.jurisdiction_context_digest
    ) {
      throw new AxiomError(
        'state_conflict',
        'Authority grant requires a matching active relationship claim',
        409
      );
    }
    this.db.prepare(`
      INSERT INTO human_authority_grants(
        grant_id, subject_id, holder_id, relationship_claim_id,
        issuer_id, authority_source, assurance, jurisdiction_context_digest,
        effective_from, effective_until, revocable, delegable,
        status, source_event_id, status_event_id, status_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(
      grant.grant_id,
      grant.subject_id,
      grant.holder_id,
      grant.relationship_claim_id,
      grant.issuer_id,
      grant.authority_source,
      grant.assurance,
      grant.jurisdiction_context_digest,
      grant.effective_from,
      grant.effective_until,
      grant.revocable ? 1 : 0,
      grant.delegable ? 1 : 0,
      event.event_id,
      event.event_id,
      event.occurred_at
    );
  }

  applyAuthorityTransition(event, nextStatus) {
    const transition = validateStatusTransitionPayload(
      event.payload,
      'grant_id',
      'authority transition'
    );
    if (event.subject !== transition.record_id) {
      throw new ValidationError('Authority transition subject must equal grant_id');
    }
    const current = this.authorityGrantRow(transition.record_id);
    if (!current) {
      throw new AxiomError('state_conflict', 'Authority grant does not exist', 409);
    }
    if (current.subject_id !== transition.subject_id) {
      throw new AxiomError('state_conflict', 'Authority transition subject_id differs from current state', 409);
    }
    if (current.status !== 'active') {
      throw new AxiomError('state_conflict', 'Only an active authority grant may transition', 409);
    }
    if (nextStatus === 'revoked' && current.revocable !== 1) {
      throw new AxiomError('state_conflict', 'This authority grant is not directly revocable', 409);
    }
    if (nextStatus === 'superseded') {
      const replacementId = assertString(
        event.payload.superseded_by_grant_id,
        'authority superseded_by_grant_id',
        { max: 160, pattern: ID }
      );
      if (replacementId === current.grant_id) {
        throw new ValidationError('Authority grant cannot supersede itself');
      }
      const replacement = this.authorityGrantRow(replacementId);
      if (
        !replacement
        || replacement.status !== 'active'
        || replacement.subject_id !== current.subject_id
        || replacement.holder_id !== current.holder_id
        || replacement.jurisdiction_context_digest !== current.jurisdiction_context_digest
      ) {
        throw new AxiomError(
          'state_conflict',
          'Authority supersession requires a matching active replacement grant',
          409
        );
      }
    }
    this.db.prepare(`
      UPDATE human_authority_grants
      SET status = ?, status_event_id = ?, status_at = ?
      WHERE grant_id = ?
    `).run(nextStatus, event.event_id, event.occurred_at, current.grant_id);
  }

  applyAuthorityConflictOpened(event) {
    const conflict = validateAuthorityConflict(event.payload);
    if (conflict.status !== 'unresolved') {
      throw new ValidationError('New authority conflict must enter materialized state as unresolved');
    }
    if (event.subject !== conflict.conflict_id) {
      throw new ValidationError('Authority conflict event subject must equal conflict_id');
    }
    if (this.authorityConflictRow(conflict.conflict_id)) {
      throw new AxiomError('state_conflict', 'Authority conflict already exists', 409);
    }
    for (const grantId of conflict.grant_ids) {
      const grant = this.authorityGrantRow(grantId);
      if (
        !grant
        || grant.subject_id !== conflict.subject_id
        || grant.jurisdiction_context_digest !== conflict.jurisdiction_context_digest
      ) {
        throw new AxiomError(
          'state_conflict',
          'Authority conflict references a missing or mismatched grant',
          409
        );
      }
    }
    this.db.prepare(`
      INSERT INTO human_authority_conflicts(
        conflict_id, subject_id, jurisdiction_context_digest,
        effective_from, effective_until, status,
        source_event_id, status_event_id, status_at
      ) VALUES (?, ?, ?, ?, ?, 'unresolved', ?, ?, ?)
    `).run(
      conflict.conflict_id,
      conflict.subject_id,
      conflict.jurisdiction_context_digest,
      conflict.effective_from,
      conflict.effective_until,
      event.event_id,
      event.event_id,
      event.occurred_at
    );
  }

  applyAuthorityConflictTransition(event, nextStatus) {
    const transition = validateStatusTransitionPayload(
      event.payload,
      'conflict_id',
      'authority conflict transition'
    );
    if (event.subject !== transition.record_id) {
      throw new ValidationError('Authority conflict transition subject must equal conflict_id');
    }
    const current = this.authorityConflictRow(transition.record_id);
    if (!current) {
      throw new AxiomError('state_conflict', 'Authority conflict does not exist', 409);
    }
    if (current.subject_id !== transition.subject_id) {
      throw new AxiomError('state_conflict', 'Authority conflict subject_id differs from current state', 409);
    }
    if (current.status !== 'unresolved') {
      throw new AxiomError('state_conflict', 'Only an unresolved authority conflict may transition', 409);
    }
    if (nextStatus === 'superseded') {
      const replacementId = assertString(
        event.payload.superseded_by_conflict_id,
        'authority conflict superseded_by_conflict_id',
        { max: 160, pattern: ID }
      );
      if (replacementId === current.conflict_id) {
        throw new ValidationError('Authority conflict cannot supersede itself');
      }
      const replacement = this.authorityConflictRow(replacementId);
      if (
        !replacement
        || replacement.status !== 'unresolved'
        || replacement.subject_id !== current.subject_id
        || replacement.jurisdiction_context_digest !== current.jurisdiction_context_digest
      ) {
        throw new AxiomError(
          'state_conflict',
          'Conflict supersession requires a matching unresolved replacement conflict',
          409
        );
      }
    }
    this.db.prepare(`
      UPDATE human_authority_conflicts
      SET status = ?, status_event_id = ?, status_at = ?
      WHERE conflict_id = ?
    `).run(nextStatus, event.event_id, event.occurred_at, current.conflict_id);
  }

  listHumanRelationshipClaims(subjectId, { holderId } = {}) {
    const subject = assertString(subjectId, 'authority subjectId', { max: 160, pattern: ID });
    const holder = holderId === undefined
      ? null
      : assertString(holderId, 'authority holderId', { max: 160, pattern: ID });
    const rows = holder === null
      ? this.db.prepare(`
          SELECT * FROM human_relationship_claims
          WHERE subject_id = ?
          ORDER BY claim_id
        `).all(subject)
      : this.db.prepare(`
          SELECT * FROM human_relationship_claims
          WHERE subject_id = ? AND holder_id = ?
          ORDER BY claim_id
        `).all(subject, holder);
    return rows.map(row => this.currentRelationshipArtifact(row));
  }

  listHumanAuthorityGrants(subjectId, { holderId } = {}) {
    const subject = assertString(subjectId, 'authority subjectId', { max: 160, pattern: ID });
    const holder = holderId === undefined
      ? null
      : assertString(holderId, 'authority holderId', { max: 160, pattern: ID });
    const rows = holder === null
      ? this.db.prepare(`
          SELECT * FROM human_authority_grants
          WHERE subject_id = ?
          ORDER BY grant_id
        `).all(subject)
      : this.db.prepare(`
          SELECT * FROM human_authority_grants
          WHERE subject_id = ? AND holder_id = ?
          ORDER BY grant_id
        `).all(subject, holder);
    return rows.map(row => this.currentAuthorityGrantArtifact(row));
  }

  listHumanAuthorityConflicts(subjectId) {
    const subject = assertString(subjectId, 'authority subjectId', { max: 160, pattern: ID });
    const rows = this.db.prepare(`
      SELECT * FROM human_authority_conflicts
      WHERE subject_id = ?
      ORDER BY conflict_id
    `).all(subject);
    return rows.map(row => this.currentAuthorityConflictArtifact(row));
  }

  resolveStoredHumanAuthority(request) {
    const subjectId = assertString(request.subjectId, 'authority request subjectId', {
      max: 160,
      pattern: ID
    });
    const holderId = assertString(request.holderId, 'authority request holderId', {
      max: 160,
      pattern: ID
    });
    return resolveHumanAuthority({
      ...request,
      relationshipClaims: this.listHumanRelationshipClaims(subjectId, { holderId }),
      authorityGrants: this.listHumanAuthorityGrants(subjectId, { holderId }),
      conflicts: this.listHumanAuthorityConflicts(subjectId)
    });
  }

  relationshipRow(claimId) {
    return this.db.prepare(`
      SELECT * FROM human_relationship_claims WHERE claim_id = ?
    `).get(claimId);
  }

  authorityGrantRow(grantId) {
    return this.db.prepare(`
      SELECT * FROM human_authority_grants WHERE grant_id = ?
    `).get(grantId);
  }

  authorityConflictRow(conflictId) {
    return this.db.prepare(`
      SELECT * FROM human_authority_conflicts WHERE conflict_id = ?
    `).get(conflictId);
  }

  currentRelationshipArtifact(row) {
    const event = this.authoritySourceEvent(row.source_event_id, 'human.relationship.claimed');
    return validateRelationshipClaim({ ...event.payload, status: row.status });
  }

  currentAuthorityGrantArtifact(row) {
    const event = this.authoritySourceEvent(row.source_event_id, 'human.authority.granted');
    return validateAuthorityGrant({ ...event.payload, status: row.status });
  }

  currentAuthorityConflictArtifact(row) {
    const event = this.authoritySourceEvent(
      row.source_event_id,
      'human.authority.conflict.opened'
    );
    return validateAuthorityConflict({ ...event.payload, status: row.status });
  }

  authoritySourceEvent(eventId, expectedKind) {
    const row = this.db.prepare('SELECT * FROM events WHERE event_id = ?').get(eventId);
    if (!row) {
      throw new AxiomError('integrity_failure', 'Authority source event is missing', 500);
    }
    const event = this.decodeEventRow(row);
    if (event.kind !== expectedKind) {
      throw new AxiomError('integrity_failure', 'Authority source event kind is invalid', 500);
    }
    return event;
  }
}

function validateStatusTransitionPayload(raw, idField, label) {
  const payload = assertPlainObject(raw, label);
  const recordId = assertString(payload[idField], `${label}.${idField}`, {
    max: 160,
    pattern: ID
  });
  const subjectId = assertString(payload.subject_id, `${label}.subject_id`, {
    max: 160,
    pattern: ID
  });
  assertString(payload.evidence_digest, `${label}.evidence_digest`, {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  return { record_id: recordId, subject_id: subjectId };
}

import { readFileSync } from 'node:fs';

import {
  AxiomError,
  ValidationError,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import { GridStore } from './store.mjs';
import { runCirclePersistenceMigrations } from './circle-persistence-migrations.mjs';
import {
  CIRCLE_GRID_PERSISTENCE_EVENT_KIND,
  assessCirclePersistenceGridReplay,
  reconstructCircleGridPersistenceCandidate,
  validateCircleGridHeadCasPolicy,
  validateCirclePersistenceAppendInput
} from './circle-persistence-state.mjs';
import {
  getCircleLifecycleGridHeadPolicy,
  reconstructCircleMemberLifecycleGridHeadCandidate
} from '../../../packages/axiom-circle-lifecycle-grid-head/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND = getCircleLifecycleGridHeadPolicy().grid_event_kind;
const headCasPolicyUrl = new URL('../../config/circle-grid-head-cas.v0.json', import.meta.url);
const CIRCLE_GRID_HEAD_CAS_POLICY = Object.freeze(
  JSON.parse(readFileSync(headCasPolicyUrl, 'utf8'))
);
validateCircleGridHeadCasPolicy(CIRCLE_GRID_HEAD_CAS_POLICY);

export function getCircleGridHeadCasPolicy() {
  return CIRCLE_GRID_HEAD_CAS_POLICY;
}

export class CircleGridStore extends GridStore {
  initialize() {
    this.circlePersistenceReady = false;
    super.initialize();
    this.circlePersistenceMigrations = runCirclePersistenceMigrations(this.db);
    this.circlePersistenceReady = true;
    this.rebuildCirclePersistenceMaterializedState();
    this.rebuildCircleMemberLifecycleMaterializedState();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      circle_persistence_schema_version: this.circlePersistenceMigrations?.version ?? 0,
      circle_persistence_internal_projection: this.circlePersistenceReady === true,
      circle_member_lifecycle_internal_projection: this.circlePersistenceReady === true,
      circle_persistence_public_route: false,
      circle_member_lifecycle_public_route: false,
      circle_persistence_runtime_authority: false,
      circle_member_lifecycle_runtime_authority: false
    };
  }

  rebuildMaterializedState() {
    if (!this.circlePersistenceReady) return super.rebuildMaterializedState();
    this.transaction(() => this.clearCirclePersistenceMaterializedState());
    return super.rebuildMaterializedState();
  }

  rebuildCirclePersistenceMaterializedState() {
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE kind = ?
      ORDER BY seq
    `).all(CIRCLE_GRID_PERSISTENCE_EVENT_KIND);
    this.transaction(() => {
      this.db.exec('DELETE FROM circle_persistence_heads');
      for (const row of rows) {
        this.applyCirclePersistenceMaterializedEvent(this.decodeEventRow(row));
      }
    });
  }

  rebuildCircleMemberLifecycleMaterializedState() {
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE kind = ?
      ORDER BY seq
    `).all(CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND);
    this.transaction(() => {
      this.db.exec('DELETE FROM circle_member_lifecycle_heads');
      for (const row of rows) {
        this.applyCircleMemberLifecycleMaterializedEvent(this.decodeEventRow(row));
      }
    });
  }

  clearCirclePersistenceMaterializedState() {
    this.db.exec('DELETE FROM circle_persistence_heads');
    this.db.exec('DELETE FROM circle_member_lifecycle_heads');
  }

  appendEvents({ traceId, actor, events }) {
    const circleEvents = Array.isArray(events)
      ? events.filter(event => event?.kind === CIRCLE_GRID_PERSISTENCE_EVENT_KIND)
      : [];
    const lifecycleEvents = Array.isArray(events)
      ? events.filter(event => event?.kind === CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND)
      : [];
    if (!circleEvents.length && !lifecycleEvents.length) {
      return super.appendEvents({ traceId, actor, events });
    }
    if (
      !Array.isArray(events)
      || events.length !== 1
      || circleEvents.length + lifecycleEvents.length !== 1
    ) {
      throw new ValidationError(
        'Circle Grid persistence requires a single-event append with no mixed Circle event kinds'
      );
    }

    if (lifecycleEvents.length === 1) {
      return this.appendCircleMemberLifecycleEvent({ traceId, actor, rawEvent: lifecycleEvents[0] });
    }

    const rawEvent = circleEvents[0];
    const candidate = validateCirclePersistenceAppendInput(rawEvent);
    this.requireCirclePersistenceGridChain();
    this.assertCirclePersistenceProjection(candidate.circle_id);

    const existing = this.circlePersistenceEventById(candidate.event.event_id);
    if (existing) return [this.resolveCirclePersistenceReplay(rawEvent, existing)];

    try {
      return super.appendEvents({ traceId, actor, events });
    } catch (error) {
      if (error?.code !== 'state_conflict') throw error;
      const raced = this.circlePersistenceEventById(candidate.event.event_id);
      if (!raced) throw error;
      return [this.resolveCirclePersistenceReplay(rawEvent, raced)];
    }
  }

  appendCircleMemberLifecycleEvent({ traceId, actor, rawEvent }) {
    const candidate = reconstructCircleMemberLifecycleGridHeadCandidate(rawEvent);
    this.requireCirclePersistenceGridChain();
    this.assertCircleMemberLifecycleProjection(candidate.circle_id, candidate.membership_id);

    const existing = this.circlePersistenceEventById(candidate.event.event_id);
    if (existing) return [this.resolveCircleMemberLifecycleReplay(rawEvent, existing)];

    try {
      return super.appendEvents({ traceId, actor, events: [candidate.event] });
    } catch (error) {
      if (error?.code !== 'state_conflict') throw error;
      const raced = this.circlePersistenceEventById(candidate.event.event_id);
      if (!raced) throw error;
      return [this.resolveCircleMemberLifecycleReplay(rawEvent, raced)];
    }
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (!this.circlePersistenceReady) return;
    if (event.kind === CIRCLE_GRID_PERSISTENCE_EVENT_KIND) {
      this.applyCirclePersistenceMaterializedEvent(event);
    } else if (event.kind === CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND) {
      this.applyCircleMemberLifecycleMaterializedEvent(event);
    }
  }

  applyCirclePersistenceMaterializedEvent(event) {
    const candidate = reconstructCircleGridPersistenceCandidate(event);
    const payload = candidate.event.payload;
    const priorEvent = this.priorCirclePersistenceEvent(candidate.circle_id, event.seq);
    const priorCandidate = priorEvent
      ? reconstructCircleGridPersistenceCandidate(priorEvent)
      : null;
    const signedPriorHead = priorCandidate?.resulting_circle_head_digest ?? null;

    if (candidate.expected_prior_circle_head_digest !== signedPriorHead) {
      throw this.circleHeadConflict(candidate, signedPriorHead);
    }

    const current = this.db.prepare(`
      SELECT * FROM circle_persistence_heads
      WHERE circle_id = ?
    `).get(candidate.circle_id);

    if (priorEvent === null) {
      if (current) {
        throw this.circleProjectionDrift(
          candidate.circle_id,
          'Circle head projection exists without a prior signed Circle persistence event'
        );
      }
      this.db.prepare(`
        INSERT INTO circle_persistence_heads(
          circle_id,
          head_binding_digest,
          head_binding_id,
          head_record_type,
          head_record_id,
          event_id,
          event_seq,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        candidate.circle_id,
        candidate.resulting_circle_head_digest,
        candidate.binding_id,
        payload.record_type,
        payload.record_id,
        event.event_id,
        event.seq,
        event.occurred_at
      );
      return;
    }

    if (!current || !this.projectionMatchesEvent(current, priorEvent, priorCandidate)) {
      throw this.circleProjectionDrift(
        candidate.circle_id,
        'Circle head projection does not match the prior signed Circle persistence event'
      );
    }

    const updated = this.db.prepare(`
      UPDATE circle_persistence_heads
      SET head_binding_digest = ?,
          head_binding_id = ?,
          head_record_type = ?,
          head_record_id = ?,
          event_id = ?,
          event_seq = ?,
          updated_at = ?
      WHERE circle_id = ?
        AND head_binding_digest = ?
    `).run(
      candidate.resulting_circle_head_digest,
      candidate.binding_id,
      payload.record_type,
      payload.record_id,
      event.event_id,
      event.seq,
      event.occurred_at,
      candidate.circle_id,
      candidate.expected_prior_circle_head_digest
    );
    if (updated.changes !== 1) {
      throw this.circleProjectionDrift(
        candidate.circle_id,
        'Circle head projection compare-and-set changed unexpectedly inside the Grid transaction'
      );
    }
  }

  applyCircleMemberLifecycleMaterializedEvent(event) {
    const candidate = reconstructCircleMemberLifecycleGridHeadCandidate(event);
    const current = this.db.prepare(`
      SELECT * FROM circle_member_lifecycle_heads
      WHERE circle_id = ? AND membership_id = ?
    `).get(candidate.circle_id, candidate.membership_id);
    const observedHead = current?.lifecycle_head_digest ?? null;

    if (candidate.previous_grid_lifecycle_head_digest !== observedHead) {
      throw this.circleMemberLifecycleHeadConflict(candidate, observedHead);
    }

    if (!current) {
      this.db.prepare(`
        INSERT INTO circle_member_lifecycle_heads(
          circle_id,
          membership_id,
          principal_id,
          lifecycle_head_digest,
          membership_lifecycle_digest,
          credential_lifecycle_digest,
          event_id,
          event_seq,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        candidate.circle_id,
        candidate.membership_id,
        candidate.principal_id,
        candidate.resulting_grid_lifecycle_head_digest,
        candidate.membership_lifecycle_digest,
        candidate.credential_lifecycle_digest,
        event.event_id,
        event.seq,
        event.occurred_at
      );
      return;
    }

    if (current.principal_id !== candidate.principal_id) {
      throw this.circleLifecycleProjectionDrift(
        candidate.circle_id,
        candidate.membership_id,
        'Circle lifecycle head principal changed across the durable Grid history'
      );
    }

    const updated = this.db.prepare(`
      UPDATE circle_member_lifecycle_heads
      SET lifecycle_head_digest = ?,
          membership_lifecycle_digest = ?,
          credential_lifecycle_digest = ?,
          event_id = ?,
          event_seq = ?,
          updated_at = ?
      WHERE circle_id = ?
        AND membership_id = ?
        AND lifecycle_head_digest = ?
    `).run(
      candidate.resulting_grid_lifecycle_head_digest,
      candidate.membership_lifecycle_digest,
      candidate.credential_lifecycle_digest,
      event.event_id,
      event.seq,
      event.occurred_at,
      candidate.circle_id,
      candidate.membership_id,
      candidate.previous_grid_lifecycle_head_digest
    );
    if (updated.changes !== 1) {
      throw this.circleLifecycleProjectionDrift(
        candidate.circle_id,
        candidate.membership_id,
        'Circle lifecycle head compare-and-set changed unexpectedly inside the Grid transaction'
      );
    }
  }

  priorCirclePersistenceEvent(circleId, beforeSeq) {
    const row = this.db.prepare(`
      SELECT * FROM events
      WHERE kind = ?
        AND subject = ?
        AND seq < ?
      ORDER BY seq DESC
      LIMIT 1
    `).get(CIRCLE_GRID_PERSISTENCE_EVENT_KIND, circleId, beforeSeq);
    return row ? this.decodeEventRow(row) : null;
  }

  latestCirclePersistenceEvent(circleId) {
    const row = this.db.prepare(`
      SELECT * FROM events
      WHERE kind = ?
        AND subject = ?
      ORDER BY seq DESC
      LIMIT 1
    `).get(CIRCLE_GRID_PERSISTENCE_EVENT_KIND, circleId);
    return row ? this.decodeEventRow(row) : null;
  }

  latestCircleMemberLifecycleEvent(circleId, membershipId) {
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE kind = ? AND subject = ?
      ORDER BY seq DESC
    `).all(CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND, circleId);
    for (const row of rows) {
      const event = this.decodeEventRow(row);
      if (event.payload?.membership_id === membershipId) return event;
    }
    return null;
  }

  circlePersistenceEventById(eventId) {
    const row = this.db.prepare('SELECT * FROM events WHERE event_id = ?').get(eventId);
    return row ? this.decodeEventRow(row) : null;
  }

  resolveCirclePersistenceReplay(rawEvent, existing) {
    const assessment = assessCirclePersistenceGridReplay(rawEvent, existing);
    if (assessment.state === 'exact-replay') {
      this.assertCirclePersistenceProjection(existing.subject);
      return existing;
    }
    throw new AxiomError(
      'circle_persistence_event_conflict',
      'Deterministic Circle persistence event id is already bound to different Grid content',
      409,
      {
        event_id: assessment.event_id,
        expected_payload_digest: assessment.expected_payload_digest,
        observed_payload_digest: assessment.observed_payload_digest
      }
    );
  }

  resolveCircleMemberLifecycleReplay(rawEvent, existing) {
    const expected = reconstructCircleMemberLifecycleGridHeadCandidate(rawEvent);
    const observed = existing.kind === CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND
      ? reconstructCircleMemberLifecycleGridHeadCandidate(existing)
      : null;
    if (
      observed
      && existing.event_id === expected.event.event_id
      && existing.subject === expected.event.subject
      && existing.payload_digest === expected.payload_digest
      && digestObject(existing.payload) === expected.payload_digest
    ) {
      this.assertCircleMemberLifecycleProjection(expected.circle_id, expected.membership_id);
      return existing;
    }
    throw new AxiomError(
      'circle_member_lifecycle_event_conflict',
      'Deterministic Circle lifecycle head event id is already bound to different Grid content',
      409,
      {
        event_id: expected.event.event_id,
        expected_payload_digest: expected.payload_digest,
        observed_payload_digest: existing.payload_digest
      }
    );
  }

  getCirclePersistenceHead(circleId, { verifyChain = true } = {}) {
    assertString(circleId, 'circle_id', { min: 1, max: 160, pattern: ID });
    if (verifyChain) {
      this.requireCirclePersistenceGridChain();
      return this.assertCirclePersistenceProjection(circleId);
    }
    const row = this.db.prepare(`
      SELECT * FROM circle_persistence_heads
      WHERE circle_id = ?
    `).get(circleId);
    return row ? Object.freeze({ ...row }) : null;
  }

  getCircleMemberLifecycleHead(circleId, membershipId, { verifyChain = true } = {}) {
    assertString(circleId, 'circle_id', { min: 1, max: 160, pattern: ID });
    assertString(membershipId, 'membership_id', { min: 1, max: 160, pattern: ID });
    if (verifyChain) {
      this.requireCirclePersistenceGridChain();
      return this.assertCircleMemberLifecycleProjection(circleId, membershipId);
    }
    const row = this.db.prepare(`
      SELECT * FROM circle_member_lifecycle_heads
      WHERE circle_id = ? AND membership_id = ?
    `).get(circleId, membershipId);
    return row ? Object.freeze({ ...row }) : null;
  }

  assertCirclePersistenceProjection(circleId) {
    const latestEvent = this.latestCirclePersistenceEvent(circleId);
    const projection = this.db.prepare(`
      SELECT * FROM circle_persistence_heads
      WHERE circle_id = ?
    `).get(circleId);

    if (!latestEvent) {
      if (projection) {
        throw this.circleProjectionDrift(
          circleId,
          'Circle head projection exists without any signed Circle persistence event'
        );
      }
      return null;
    }

    const candidate = reconstructCircleGridPersistenceCandidate(latestEvent);
    if (!projection || !this.projectionMatchesEvent(projection, latestEvent, candidate)) {
      throw this.circleProjectionDrift(
        circleId,
        'Circle head projection does not match the latest signed Circle persistence event'
      );
    }
    return Object.freeze({ ...projection });
  }

  assertCircleMemberLifecycleProjection(circleId, membershipId) {
    const latestEvent = this.latestCircleMemberLifecycleEvent(circleId, membershipId);
    const projection = this.db.prepare(`
      SELECT * FROM circle_member_lifecycle_heads
      WHERE circle_id = ? AND membership_id = ?
    `).get(circleId, membershipId);

    if (!latestEvent) {
      if (projection) {
        throw this.circleLifecycleProjectionDrift(
          circleId,
          membershipId,
          'Circle lifecycle head projection exists without a signed lifecycle head event'
        );
      }
      return null;
    }

    const candidate = reconstructCircleMemberLifecycleGridHeadCandidate(latestEvent);
    if (!projection || !this.lifecycleProjectionMatchesEvent(projection, latestEvent, candidate)) {
      throw this.circleLifecycleProjectionDrift(
        circleId,
        membershipId,
        'Circle lifecycle head projection does not match the latest signed lifecycle head event'
      );
    }
    return Object.freeze({ ...projection });
  }

  projectionMatchesEvent(projection, event, candidate) {
    return Boolean(
      projection
      && event
      && candidate
      && projection.circle_id === candidate.circle_id
      && projection.head_binding_digest === candidate.resulting_circle_head_digest
      && projection.head_binding_id === candidate.binding_id
      && projection.head_record_type === candidate.event.payload.record_type
      && projection.head_record_id === candidate.event.payload.record_id
      && projection.event_id === event.event_id
      && projection.event_seq === event.seq
      && projection.updated_at === event.occurred_at
    );
  }

  lifecycleProjectionMatchesEvent(projection, event, candidate) {
    return Boolean(
      projection
      && event
      && candidate
      && projection.circle_id === candidate.circle_id
      && projection.membership_id === candidate.membership_id
      && projection.principal_id === candidate.principal_id
      && projection.lifecycle_head_digest === candidate.resulting_grid_lifecycle_head_digest
      && projection.membership_lifecycle_digest === candidate.membership_lifecycle_digest
      && projection.credential_lifecycle_digest === candidate.credential_lifecycle_digest
      && projection.event_id === event.event_id
      && projection.event_seq === event.seq
      && projection.updated_at === event.occurred_at
    );
  }

  requireCirclePersistenceGridChain() {
    const chain = this.verifyFullChain();
    if (!chain.valid) {
      throw new AxiomError(
        'integrity_verification_failed',
        `Grid evidence chain is invalid: ${chain.reason ?? 'unknown reason'}`,
        503
      );
    }
    return chain;
  }

  circleHeadConflict(candidate, observedHeadDigest) {
    return new AxiomError(
      'circle_persistence_head_conflict',
      'Circle persistence head changed or does not match the candidate predecessor',
      409,
      {
        circle_id: candidate.circle_id,
        expected_head_digest: candidate.expected_prior_circle_head_digest,
        observed_head_digest: observedHeadDigest,
        requested_head_digest: candidate.resulting_circle_head_digest
      }
    );
  }

  circleMemberLifecycleHeadConflict(candidate, observedHeadDigest) {
    return new AxiomError(
      'circle_member_lifecycle_head_conflict',
      'Circle member lifecycle head changed or does not match the candidate predecessor',
      409,
      {
        circle_id: candidate.circle_id,
        membership_id: candidate.membership_id,
        expected_head_digest: candidate.previous_grid_lifecycle_head_digest,
        observed_head_digest: observedHeadDigest,
        requested_head_digest: candidate.resulting_grid_lifecycle_head_digest
      }
    );
  }

  circleProjectionDrift(circleId, message) {
    return new AxiomError(
      'circle_persistence_projection_drift',
      message,
      503,
      {
        circle_id: circleId,
        authority_effect: 'none',
        runtime_authority: false
      }
    );
  }

  circleLifecycleProjectionDrift(circleId, membershipId, message) {
    return new AxiomError(
      'circle_member_lifecycle_projection_drift',
      message,
      503,
      {
        circle_id: circleId,
        membership_id: membershipId,
        authority_effect: 'none',
        runtime_authority: false
      }
    );
  }
}

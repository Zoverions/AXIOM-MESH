import { readFileSync } from 'node:fs';

import {
  AxiomError,
  ValidationError,
  assertString
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

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
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
  }

  getStatus() {
    return {
      ...super.getStatus(),
      circle_persistence_schema_version: this.circlePersistenceMigrations?.version ?? 0,
      circle_persistence_internal_projection: this.circlePersistenceReady === true,
      circle_persistence_public_route: false,
      circle_persistence_runtime_authority: false
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
      this.clearCirclePersistenceMaterializedState();
      for (const row of rows) {
        this.applyCirclePersistenceMaterializedEvent(this.decodeEventRow(row));
      }
    });
  }

  clearCirclePersistenceMaterializedState() {
    this.db.exec('DELETE FROM circle_persistence_heads');
  }

  appendEvents({ traceId, actor, events }) {
    const circleEvents = Array.isArray(events)
      ? events.filter(event => event?.kind === CIRCLE_GRID_PERSISTENCE_EVENT_KIND)
      : [];
    if (!circleEvents.length) return super.appendEvents({ traceId, actor, events });
    if (!Array.isArray(events) || events.length !== 1 || circleEvents.length !== 1) {
      throw new ValidationError(
        'Circle Grid persistence requires a single-event append with no mixed event kinds'
      );
    }

    const rawEvent = circleEvents[0];
    const candidate = validateCirclePersistenceAppendInput(rawEvent);
    this.requireCirclePersistenceGridChain();

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

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (
      !this.circlePersistenceReady
      || event.kind !== CIRCLE_GRID_PERSISTENCE_EVENT_KIND
    ) return;
    this.applyCirclePersistenceMaterializedEvent(event);
  }

  applyCirclePersistenceMaterializedEvent(event) {
    const candidate = reconstructCircleGridPersistenceCandidate(event);
    const payload = candidate.event.payload;
    const current = this.db.prepare(`
      SELECT * FROM circle_persistence_heads
      WHERE circle_id = ?
    `).get(candidate.circle_id);

    if (candidate.expected_prior_circle_head_digest === null) {
      if (current) {
        throw this.circleHeadConflict(candidate, current.head_binding_digest);
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

    if (
      !current
      || current.head_binding_digest !== candidate.expected_prior_circle_head_digest
    ) {
      throw this.circleHeadConflict(
        candidate,
        current?.head_binding_digest ?? null
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
      throw this.circleHeadConflict(
        candidate,
        this.db.prepare(`
          SELECT head_binding_digest FROM circle_persistence_heads
          WHERE circle_id = ?
        `).get(candidate.circle_id)?.head_binding_digest ?? null
      );
    }
  }

  circlePersistenceEventById(eventId) {
    const row = this.db.prepare('SELECT * FROM events WHERE event_id = ?').get(eventId);
    return row ? this.decodeEventRow(row) : null;
  }

  resolveCirclePersistenceReplay(rawEvent, existing) {
    const assessment = assessCirclePersistenceGridReplay(rawEvent, existing);
    if (assessment.state === 'exact-replay') return existing;
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

  getCirclePersistenceHead(circleId, { verifyChain = true } = {}) {
    assertString(circleId, 'circle_id', { min: 1, max: 160, pattern: ID });
    if (verifyChain) this.requireCirclePersistenceGridChain();
    const row = this.db.prepare(`
      SELECT * FROM circle_persistence_heads
      WHERE circle_id = ?
    `).get(circleId);
    return row ? Object.freeze({ ...row }) : null;
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
}

import { ValidationError } from '../lib/canonical.mjs';
import {
  assertProjectEventObservationMatchesEvent,
  normalizeProjectEvent,
  normalizeProjectEventObservation
} from '../lib/project-continuity-events.mjs';
import { normalizeSourceState } from '../lib/source-continuity.mjs';
import {
  SOURCE_STATE_RECORDED_EVENT,
  SourceContinuityGridStore
} from './source-continuity-store.mjs';

export const PROJECT_EVENT_RECORDED_EVENT = 'project.event.recorded';
export const PROJECT_EVENT_OBSERVED_EVENT = 'project.event.observed';

const PROJECT_CONTINUITY_EVENT_KINDS = Object.freeze([
  PROJECT_EVENT_RECORDED_EVENT,
  PROJECT_EVENT_OBSERVED_EVENT
]);

export class ProjectContinuityGridStore extends SourceContinuityGridStore {
  recordProjectEvent({ actor, traceId, event }) {
    const normalized = normalizeProjectEvent(event);
    if (normalized.source_state_digest !== null) {
      this.requireRecordedSourceStateDigest(normalized.source_state_digest);
    }
    if (normalized.previous_event_digest !== null) {
      this.requireProjectPredecessor(normalized);
    }

    const existing = this.projectContinuityEvents(normalized.project_id)
      .find(row => (
        row.kind === PROJECT_EVENT_RECORDED_EVENT
        && row.payload?.event?.event_digest === normalized.event_digest
      ));
    if (existing) {
      return { event: normalized, grid_event: existing, already_recorded: true };
    }

    const [gridEvent] = this.appendEvents({
      traceId,
      actor,
      events: [{
        kind: PROJECT_EVENT_RECORDED_EVENT,
        subject: normalized.event_id,
        payload: { event: normalized }
      }]
    });
    return { event: normalized, grid_event: gridEvent, already_recorded: false };
  }

  recordProjectEventObservation({ actor, traceId, observation }) {
    const normalized = normalizeProjectEventObservation(observation);
    const canonical = this.requireRecordedProjectEvent(
      normalized.project_id,
      normalized.event_digest
    );
    assertProjectEventObservationMatchesEvent(normalized, canonical);

    const existing = this.projectContinuityEvents(normalized.project_id)
      .find(row => (
        row.kind === PROJECT_EVENT_OBSERVED_EVENT
        && row.payload?.observation?.observation_digest === normalized.observation_digest
      ));
    if (existing) {
      return {
        observation: normalized,
        canonical_event: canonical,
        grid_event: existing,
        already_recorded: true
      };
    }

    const [gridEvent] = this.appendEvents({
      traceId,
      actor,
      events: [{
        kind: PROJECT_EVENT_OBSERVED_EVENT,
        subject: normalized.observation_id,
        payload: { observation: normalized }
      }]
    });
    return {
      observation: normalized,
      canonical_event: canonical,
      grid_event: gridEvent,
      already_recorded: false
    };
  }

  getProjectContinuity(projectId) {
    const events = this.projectContinuityEvents(projectId);
    const canonicalByDigest = new Map();
    const canonical = [];
    const observations = [];

    for (const gridEvent of events) {
      if (gridEvent.kind === PROJECT_EVENT_RECORDED_EVENT) {
        const event = normalizeProjectEvent(gridEvent.payload?.event);
        if (event.project_id !== projectId) {
          throw new ValidationError('project event project does not match its Grid stream');
        }
        if (event.source_state_digest !== null) {
          this.requireRecordedSourceStateDigest(event.source_state_digest, {
            beforeSeq: gridEvent.seq
          });
        }
        if (event.previous_event_digest !== null) {
          const predecessor = canonicalByDigest.get(event.previous_event_digest);
          if (!predecessor) {
            throw new ValidationError('project event predecessor is missing or not earlier in the Grid stream');
          }
          if (predecessor.event.project_object_id !== event.project_object_id) {
            throw new ValidationError('project event predecessor belongs to a different project object');
          }
        }
        if (canonicalByDigest.has(event.event_digest)) {
          throw new ValidationError('project event is duplicated in the Grid stream');
        }
        const retained = {
          event,
          event_seq: gridEvent.seq,
          event_hash: gridEvent.event_hash,
          recorded_at: gridEvent.occurred_at
        };
        canonicalByDigest.set(event.event_digest, retained);
        canonical.push(retained);
        continue;
      }

      if (gridEvent.kind === PROJECT_EVENT_OBSERVED_EVENT) {
        const observation = normalizeProjectEventObservation(gridEvent.payload?.observation);
        if (observation.project_id !== projectId) {
          throw new ValidationError('project event observation project does not match its Grid stream');
        }
        const retained = canonicalByDigest.get(observation.event_digest);
        if (!retained) {
          throw new ValidationError('project event observation references an unknown or later canonical event');
        }
        assertProjectEventObservationMatchesEvent(observation, retained.event);
        observations.push({
          observation,
          event_seq: gridEvent.seq,
          event_hash: gridEvent.event_hash,
          recorded_at: gridEvent.occurred_at
        });
      }
    }

    return {
      schema: 'axiom-project-continuity-ledger.v1',
      project_id: projectId,
      canonical_events: canonical,
      provider_observations: observations,
      canonical_event_count: canonical.length,
      provider_observation_count: observations.length,
      source_state_bindings_reverified: true,
      predecessor_bindings_reverified: true,
      history_completeness_claimed: false,
      provider_observation_grants_authority: false,
      portable_event_grants_governance_authority: false,
      portable_event_promotes_capability: false
    };
  }

  projectContinuityEvents(projectId) {
    const chain = this.verifyChain();
    if (!chain.valid) {
      throw new ValidationError(
        `project continuity requires a valid Grid chain: ${chain.reason ?? 'invalid'}`
      );
    }
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE kind IN (?, ?)
      ORDER BY seq
    `).all(...PROJECT_CONTINUITY_EVENT_KINDS);
    return rows
      .map(row => this.decodeEventRow(row))
      .filter(event => projectEventProjectId(event) === projectId);
  }

  requireRecordedProjectEvent(projectId, eventDigest, { beforeSeq = null } = {}) {
    const found = this.projectContinuityEvents(projectId)
      .filter(event => beforeSeq === null || event.seq < beforeSeq)
      .find(event => (
        event.kind === PROJECT_EVENT_RECORDED_EVENT
        && event.payload?.event?.event_digest === eventDigest
      ));
    if (!found) {
      throw new ValidationError('project event observation requires a previously recorded canonical event');
    }
    const canonical = normalizeProjectEvent(found.payload?.event);
    if (canonical.event_digest !== eventDigest) {
      throw new ValidationError('recorded project event digest is inconsistent');
    }
    return canonical;
  }

  requireProjectPredecessor(event) {
    const predecessor = this.requireRecordedProjectEvent(
      event.project_id,
      event.previous_event_digest
    );
    if (predecessor.project_object_id !== event.project_object_id) {
      throw new ValidationError('project event predecessor belongs to a different project object');
    }
    return predecessor;
  }

  requireRecordedSourceStateDigest(stateDigest, { beforeSeq = null } = {}) {
    const chain = this.verifyChain();
    if (!chain.valid) {
      throw new ValidationError(
        `project source binding requires a valid Grid chain: ${chain.reason ?? 'invalid'}`
      );
    }
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE kind = ?
      ORDER BY seq
    `).all(SOURCE_STATE_RECORDED_EVENT);
    for (const row of rows) {
      const gridEvent = this.decodeEventRow(row);
      if (beforeSeq !== null && gridEvent.seq >= beforeSeq) continue;
      const state = normalizeSourceState(gridEvent.payload?.state);
      if (state.state_digest === stateDigest) return state;
    }
    throw new ValidationError('project event requires a previously recorded source state');
  }
}

function projectEventProjectId(gridEvent) {
  if (gridEvent.kind === PROJECT_EVENT_RECORDED_EVENT) {
    return gridEvent.payload?.event?.project_id ?? null;
  }
  if (gridEvent.kind === PROJECT_EVENT_OBSERVED_EVENT) {
    return gridEvent.payload?.observation?.project_id ?? null;
  }
  return null;
}

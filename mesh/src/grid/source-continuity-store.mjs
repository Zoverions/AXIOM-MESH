import { digestObject, ValidationError } from '../lib/canonical.mjs';
import {
  normalizeSourceReplicaObservation,
  normalizeSourceState,
  normalizeSourceTransition,
  verifySourceTransition
} from '../lib/source-continuity.mjs';
import { GridStore } from './store.mjs';

export const SOURCE_STATE_RECORDED_EVENT = 'source.state.recorded';
export const SOURCE_REPLICA_OBSERVED_EVENT = 'source.replica.observed';
export const SOURCE_TRANSITION_ACCEPTED_EVENT = 'source.transition.accepted';
export const SOURCE_TRANSITION_DECISION_SCHEMA = 'axiom-source-transition-governance-decision.v1';

const SOURCE_EVENT_KINDS = Object.freeze([
  SOURCE_STATE_RECORDED_EVENT,
  SOURCE_REPLICA_OBSERVED_EVENT,
  SOURCE_TRANSITION_ACCEPTED_EVENT
]);

export class SourceContinuityGridStore extends GridStore {
  recordSourceState({ actor, traceId, state }) {
    const normalized = normalizeSourceState(state);
    const existing = this.sourceContinuityEvents(normalized.repository_id)
      .find(event => (
        event.kind === SOURCE_STATE_RECORDED_EVENT
        && event.payload?.state?.state_digest === normalized.state_digest
      ));
    if (existing) return { state: normalized, event: existing, already_recorded: true };
    const [event] = this.appendEvents({
      traceId,
      actor,
      events: [{
        kind: SOURCE_STATE_RECORDED_EVENT,
        subject: normalized.state_id,
        payload: { state: normalized }
      }]
    });
    return { state: normalized, event, already_recorded: false };
  }

  recordReplicaObservation({ actor, traceId, observation }) {
    const normalized = normalizeSourceReplicaObservation(observation);
    this.requireRecordedSourceState(
      normalized.repository_id,
      normalized.source_state_digest
    );
    const [event] = this.appendEvents({
      traceId,
      actor,
      events: [{
        kind: SOURCE_REPLICA_OBSERVED_EVENT,
        subject: normalized.observation_id,
        payload: { observation: normalized }
      }]
    });
    return { observation: normalized, event };
  }

  acceptSourceTransition({
    actor,
    traceId,
    transition,
    parentState = null,
    childState,
    governanceProposalId
  }) {
    const normalized = normalizeSourceTransition(transition);
    const child = normalizeSourceState(childState);
    const parent = parentState === null ? null : normalizeSourceState(parentState);
    verifySourceTransition({
      transition: normalized,
      parent_state: parent,
      child_state: child
    });
    this.requireRecordedSourceState(normalized.repository_id, child.state_digest);
    if (parent) this.requireRecordedSourceState(normalized.repository_id, parent.state_digest);

    const current = this.getSourceContinuity(normalized.repository_id);
    this.requireLinearTransition(normalized, current);
    const governance = this.requireVerifiedGovernanceDecision(
      governanceProposalId,
      normalized
    );
    const [event] = this.appendEvents({
      traceId,
      actor,
      events: [{
        kind: SOURCE_TRANSITION_ACCEPTED_EVENT,
        subject: normalized.transition_id,
        payload: {
          transition: normalized,
          governance_proposal_id: governanceProposalId,
          governance_decision_digest: governance.decision_digest,
          governance_verification_digest: governance.verification_digest
        }
      }]
    });
    return {
      transition: normalized,
      event,
      accepted_head: child.state_digest,
      governance
    };
  }

  getSourceContinuity(repositoryId) {
    const events = this.sourceContinuityEvents(repositoryId);
    const states = new Map();
    const replicaById = new Map();
    const accepted = [];
    let head = null;
    let sequence = -1;

    for (const event of events) {
      if (event.kind === SOURCE_STATE_RECORDED_EVENT) {
        const state = normalizeSourceState(event.payload?.state);
        if (state.repository_id !== repositoryId) {
          throw new ValidationError('source state repository does not match its event stream');
        }
        states.set(state.state_digest, state);
        continue;
      }
      if (event.kind === SOURCE_REPLICA_OBSERVED_EVENT) {
        const observation = normalizeSourceReplicaObservation(event.payload?.observation);
        if (
          observation.repository_id !== repositoryId
          || !states.has(observation.source_state_digest)
        ) {
          throw new ValidationError('source replica observation references an unknown source state');
        }
        replicaById.set(observation.replica_id, {
          ...observation,
          event_seq: event.seq,
          event_hash: event.event_hash
        });
        continue;
      }
      if (event.kind === SOURCE_TRANSITION_ACCEPTED_EVENT) {
        const transition = normalizeSourceTransition(event.payload?.transition);
        const child = states.get(transition.child_state_digest);
        const parent = transition.parent_state_digest === null
          ? null
          : states.get(transition.parent_state_digest);
        if (!child || (transition.parent_state_digest !== null && !parent)) {
          throw new ValidationError('accepted source transition references an unknown source state');
        }
        verifySourceTransition({
          transition,
          parent_state: parent,
          child_state: child
        });
        const expectedSequence = sequence + 1;
        if (transition.sequence !== expectedSequence) {
          throw new ValidationError('accepted source transition sequence is not linear');
        }
        if (sequence < 0) {
          if (transition.transition_type !== 'genesis' || transition.parent_state_digest !== null) {
            throw new ValidationError('accepted source lineage must begin with genesis');
          }
        } else if (transition.parent_state_digest !== head) {
          throw new ValidationError('accepted source transition does not extend the current accepted head');
        }
        const governance = this.requireVerifiedGovernanceDecision(
          event.payload?.governance_proposal_id,
          transition,
          { beforeSeq: event.seq }
        );
        if (
          event.payload?.governance_decision_digest !== governance.decision_digest
          || event.payload?.governance_verification_digest !== governance.verification_digest
        ) {
          throw new ValidationError('accepted source transition governance evidence is stale or substituted');
        }
        accepted.push({
          transition,
          governance_proposal_id: event.payload.governance_proposal_id,
          governance_decision_digest: governance.decision_digest,
          governance_verification_digest: governance.verification_digest,
          event_seq: event.seq,
          event_hash: event.event_hash,
          recorded_at: event.occurred_at
        });
        sequence = transition.sequence;
        head = transition.child_state_digest;
      }
    }

    return {
      schema: 'axiom-source-continuity-ledger.v1',
      repository_id: repositoryId,
      accepted_head_state_digest: head,
      accepted_sequence: sequence,
      accepted_transitions: accepted,
      states: [...states.values()],
      replicas: [...replicaById.values()].sort((a, b) => a.replica_id.localeCompare(b.replica_id)),
      replica_count: replicaById.size,
      source_events: events.length,
      authority_from_replica_observation: false
    };
  }

  sourceContinuityEvents(repositoryId) {
    const chain = this.verifyChain();
    if (!chain.valid) {
      throw new ValidationError(`source continuity requires a valid Grid chain: ${chain.reason ?? 'invalid'}`);
    }
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE kind IN (?, ?, ?)
      ORDER BY seq
    `).all(...SOURCE_EVENT_KINDS);
    return rows
      .map(row => this.decodeEventRow(row))
      .filter(event => sourceEventRepositoryId(event) === repositoryId);
  }

  requireRecordedSourceState(repositoryId, stateDigest) {
    const found = this.sourceContinuityEvents(repositoryId).some(event => (
      event.kind === SOURCE_STATE_RECORDED_EVENT
      && event.payload?.state?.state_digest === stateDigest
    ));
    if (!found) throw new ValidationError('source state must be recorded before it can be referenced');
  }

  requireLinearTransition(transition, current) {
    const expectedSequence = current.accepted_sequence + 1;
    if (transition.sequence !== expectedSequence) {
      throw new ValidationError('source transition sequence does not extend accepted lineage');
    }
    if (current.accepted_sequence < 0) {
      if (transition.transition_type !== 'genesis' || transition.parent_state_digest !== null) {
        throw new ValidationError('first accepted source transition must be genesis');
      }
      return;
    }
    if (transition.parent_state_digest !== current.accepted_head_state_digest) {
      throw new ValidationError('source transition parent is not the current accepted head');
    }
  }

  requireVerifiedGovernanceDecision(proposalId, transition, { beforeSeq = Number.MAX_SAFE_INTEGER } = {}) {
    if (typeof proposalId !== 'string' || !proposalId.length || proposalId.length > 160) {
      throw new ValidationError('source transition requires a governance proposal id');
    }
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE subject = ? AND seq < ?
        AND kind IN ('governance.proposed', 'governance.verified', 'governance.rolled-back')
      ORDER BY seq
    `).all(proposalId, beforeSeq).map(row => this.decodeEventRow(row));
    const proposed = rows.find(event => event.kind === 'governance.proposed');
    const verified = [...rows].reverse().find(event => event.kind === 'governance.verified');
    if (!proposed || !verified) {
      throw new ValidationError('source transition governance decision is not verified');
    }
    const rollbackBeforeAcceptance = rows.some(event => (
      event.kind === 'governance.rolled-back'
      && event.seq > verified.seq
    ));
    if (rollbackBeforeAcceptance) {
      throw new ValidationError('source transition governance decision was rolled back before acceptance');
    }
    const action = proposed.payload?.action;
    const decision = action?.payload;
    if (
      action?.type !== 'record.decision'
      || decision?.schema !== SOURCE_TRANSITION_DECISION_SCHEMA
      || decision?.repository_id !== transition.repository_id
      || decision?.transition_digest !== transition.transition_digest
      || decision?.decision !== 'accept'
      || decision?.authority_digest !== transition.authority_digest
      || decision?.evidence_digest !== transition.evidence_digest
    ) {
      throw new ValidationError('verified governance proposal does not authorize this exact source transition');
    }
    const decisionDigest = digestObject(decision);
    return {
      proposal_id: proposalId,
      decision_digest: decisionDigest,
      verification_digest: verified.payload?.verification_digest,
      verified_event_seq: verified.seq,
      verified_at: verified.occurred_at
    };
  }
}

function sourceEventRepositoryId(event) {
  if (event.kind === SOURCE_STATE_RECORDED_EVENT) {
    return event.payload?.state?.repository_id;
  }
  if (event.kind === SOURCE_REPLICA_OBSERVED_EVENT) {
    return event.payload?.observation?.repository_id;
  }
  if (event.kind === SOURCE_TRANSITION_ACCEPTED_EVENT) {
    return event.payload?.transition?.repository_id;
  }
  return null;
}

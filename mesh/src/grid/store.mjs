import {
  CHECKPOINT_SCHEMA,
  DEFAULT_CHECKPOINT_INTERVAL,
  GridStore as CheckpointGridStore,
  loadGridVerificationKeys,
  reencryptGridProtectedColumns
} from './_store-checkpoints.mjs';
import { AxiomError, ValidationError, canonicalJson } from '../lib/canonical.mjs';
import {
  INTENT_ACTIVATION_RECORD_KIND,
  INTENT_ATTESTATION_RECORD_KIND,
  deriveIntentGridAssessment,
  normalizeIntentActivationRecord,
  normalizeIntentAttestationRecord,
  validateActivationSupersession,
  validateAttestationAgainstActivation
} from '../lib/intent-grid-evidence.mjs';
import {
  isIntentRemediationAction,
  normalizeIntentRemediationProposal,
  validateIntentRemediationProposalAgainstState
} from '../lib/intent-remediation.mjs';

const CHECKPOINT_BOUNDARY_REASONS = new Set([
  'payload_decryption_failed',
  'payload_digest_mismatch',
  'event_hash_mismatch',
  'signature_encoding_invalid',
  'signature_mismatch'
]);

export {
  CHECKPOINT_SCHEMA,
  DEFAULT_CHECKPOINT_INTERVAL,
  loadGridVerificationKeys,
  reencryptGridProtectedColumns
};

export class GridStore extends CheckpointGridStore {
  verifyCheckpointHistory(history) {
    const result = super.verifyCheckpointHistory(history);
    if (
      !result.valid
      && typeof result.reason === 'string'
      && result.reason.startsWith('checkpoint_')
    ) {
      const establishedReason = result.reason.slice('checkpoint_'.length);
      if (CHECKPOINT_BOUNDARY_REASONS.has(establishedReason)) {
        return {
          ...result,
          reason: establishedReason,
          verification_scope: 'checkpoint_boundary'
        };
      }
    }
    return result;
  }

  appendEvents({ traceId, actor, events }) {
    if (Array.isArray(events)) {
      for (const event of events) this.preflightIntentEvidenceEvent(event, actor);
    }
    return super.appendEvents({ traceId, actor, events });
  }

  preflightIntentEvidenceEvent(rawEvent, actor) {
    if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) return;
    if (rawEvent.kind === 'governance.proposed') {
      const payload = rawEvent.payload;
      const specialAction = this.isIntentActivationAction(payload?.action)
        || isIntentRemediationAction(payload?.action);
      if (!payload || payload.proposer !== actor) {
        if (specialAction) {
          throw new ValidationError('Intent governance proposer must match the authenticated actor');
        }
        return;
      }
      if (this.isIntentActivationAction(payload.action)) {
        normalizeIntentActivationRecord(payload.action.payload.activation);
      }
      if (isIntentRemediationAction(payload.action)) {
        this.requireIntentEvidenceChain();
        const proposal = normalizeIntentRemediationProposal(payload.action.payload.remediation);
        const state = this.getIntentContractAssessmentFromVerifiedState(proposal.contract_id, {
          now: proposal.basis_evaluated_at
        });
        validateIntentRemediationProposalAgainstState(proposal, state, {
          actor,
          now: new Date().toISOString()
        });
      }
      return;
    }

    if (rawEvent.kind === 'governance.activated') {
      const proposalId = rawEvent.payload?.proposal_id;
      if (typeof proposalId !== 'string') return;
      const activationProposal = this.intentActivationProposal(proposalId);
      if (activationProposal) {
        const current = this.currentIntentActivation(activationProposal.activation.contract_id, {
          excludeProposalId: proposalId
        });
        validateActivationSupersession(
          activationProposal.activation,
          current?.activation ?? null
        );
        return;
      }
      const remediation = this.intentRemediationProposal(proposalId);
      if (remediation) {
        this.requireIntentEvidenceChain();
        if (remediation.remediation.creator !== remediation.proposer) {
          throw new ValidationError('Intent remediation creator does not match governance proposer');
        }
        const state = this.getIntentContractAssessmentFromVerifiedState(
          remediation.remediation.contract_id,
          { now: remediation.remediation.basis_evaluated_at }
        );
        validateIntentRemediationProposalAgainstState(remediation.remediation, state, {
          now: new Date().toISOString()
        });
      }
      return;
    }

    if (rawEvent.kind === 'memory.put' && rawEvent.payload?.kind === INTENT_ATTESTATION_RECORD_KIND) {
      const payload = rawEvent.payload;
      if (payload.owner !== actor) {
        throw new ValidationError('Intent evidence owner must match the authenticated actor');
      }
      if (canonicalJson(payload.metadata ?? {}) !== '{}') {
        throw new ValidationError('Intent evidence metadata must be empty; evidence belongs in the attestation');
      }
      const attestation = normalizeIntentAttestationRecord(payload.content);
      if (attestation.verifier !== actor) {
        throw new ValidationError('Intent evidence verifier must match the authenticated actor');
      }
      const current = this.currentIntentActivation(attestation.contract_id);
      if (!current) {
        throw new AxiomError(
          'intent_contract_not_active',
          'Intent evidence requires an active governance-ratified contract',
          409
        );
      }
      validateAttestationAgainstActivation(attestation, current.activation, {
        actor,
        occurredAt: new Date().toISOString()
      });
      if (typeof payload.object_id === 'string' && this.db.prepare(`
        SELECT 1 FROM memory_objects WHERE object_id = ?
      `).get(payload.object_id)) {
        throw new AxiomError(
          'intent_attestation_replayed',
          'This content-addressed Intent attestation already exists',
          409
        );
      }
      return;
    }

    if (rawEvent.kind === 'memory.tombstoned') {
      const objectId = rawEvent.payload?.object_id;
      if (typeof objectId !== 'string') return;
      const row = this.db.prepare(`
        SELECT owner, kind FROM memory_objects WHERE object_id = ? AND status = 'active'
      `).get(objectId);
      if (row?.kind === INTENT_ATTESTATION_RECORD_KIND && row.owner !== actor) {
        throw new ValidationError('Only the authenticated Intent verifier may revoke its attestation');
      }
    }
  }

  isIntentActivationAction(action) {
    return Boolean(
      action
      && typeof action === 'object'
      && !Array.isArray(action)
      && action.type === 'record.decision'
      && action.payload?.record_kind === INTENT_ACTIVATION_RECORD_KIND
      && action.payload?.activation
    );
  }

  governanceProposalAction(proposalId) {
    const row = this.db.prepare(`
      SELECT proposal_id, proposer, status, action_json, activated_at, rolled_back_at
      FROM proposals WHERE proposal_id = ?
    `).get(proposalId);
    if (!row) return null;
    return {
      ...row,
      action: this.openJson('proposals', 'action_json', row.proposal_id, row.action_json)
    };
  }

  intentActivationProposal(proposalId) {
    const row = this.governanceProposalAction(proposalId);
    if (!row || !this.isIntentActivationAction(row.action)) return null;
    return {
      proposal_id: row.proposal_id,
      proposer: row.proposer,
      status: row.status,
      activated_at: row.activated_at,
      rolled_back_at: row.rolled_back_at,
      activation: normalizeIntentActivationRecord(row.action.payload.activation)
    };
  }

  intentRemediationProposal(proposalId) {
    const row = this.governanceProposalAction(proposalId);
    if (!row || !isIntentRemediationAction(row.action)) return null;
    return {
      proposal_id: row.proposal_id,
      proposer: row.proposer,
      status: row.status,
      activated_at: row.activated_at,
      rolled_back_at: row.rolled_back_at,
      remediation: normalizeIntentRemediationProposal(row.action.payload.remediation)
    };
  }

  currentIntentActivation(contractId, { excludeProposalId } = {}) {
    const rows = this.db.prepare(`
      SELECT proposal_id, proposer, status, action_json, activated_at, rolled_back_at
      FROM proposals
      WHERE activated_at IS NOT NULL AND status IN ('active', 'verified')
      ORDER BY activated_at DESC, proposal_id DESC
    `).all();
    for (const row of rows) {
      if (excludeProposalId && row.proposal_id === excludeProposalId) continue;
      const action = this.openJson('proposals', 'action_json', row.proposal_id, row.action_json);
      if (!this.isIntentActivationAction(action)) continue;
      const activation = normalizeIntentActivationRecord(action.payload.activation);
      if (activation.contract_id !== contractId) continue;

      const proposedRow = this.db.prepare(`
        SELECT * FROM events
        WHERE kind = 'governance.proposed' AND subject = ?
        ORDER BY seq ASC LIMIT 1
      `).get(row.proposal_id);
      if (!proposedRow) {
        throw new ValidationError('Intent governance proposal has no evidence-chain proposal event');
      }
      const proposedEvent = this.decodeEventRow(proposedRow);
      if (
        proposedEvent.actor !== row.proposer
        || proposedEvent.payload.proposer !== row.proposer
        || canonicalJson(proposedEvent.payload.action) !== canonicalJson(action)
      ) {
        throw new ValidationError('Intent governance proposal materialized state does not match signed evidence');
      }

      const activationRow = this.db.prepare(`
        SELECT * FROM events
        WHERE kind = 'governance.activated' AND subject = ?
        ORDER BY seq DESC LIMIT 1
      `).get(row.proposal_id);
      if (!activationRow) {
        throw new ValidationError('Active Intent governance proposal has no activation evidence event');
      }
      const event = this.decodeEventRow(activationRow);
      if (
        event.payload.proposal_id !== row.proposal_id
        || event.payload.activated_by !== event.actor
      ) {
        throw new ValidationError('Intent governance activation actor binding is invalid');
      }
      return {
        proposal_id: row.proposal_id,
        proposer: row.proposer,
        activated_by: event.actor,
        activated_at: event.occurred_at,
        proposal_event_id: proposedEvent.event_id,
        proposal_event_hash: proposedEvent.event_hash,
        activation_event_id: event.event_id,
        activation_event_hash: event.event_hash,
        activation
      };
    }
    return null;
  }

  listIntentAttestationEvents(contractId) {
    const rows = this.db.prepare(`
      SELECT * FROM memory_objects
      WHERE kind = ? AND status = 'active'
      ORDER BY created_at, object_id
    `).all(INTENT_ATTESTATION_RECORD_KIND);
    const events = [];
    for (const row of rows) {
      const decoded = this.decodeProtectedRow(
        'memory_objects',
        'object_id',
        row,
        ['payload_json']
      );
      const record = normalizeIntentAttestationRecord(decoded.payload_json.content);
      if (record.contract_id !== contractId) continue;
      if (canonicalJson(decoded.payload_json.metadata ?? {}) !== '{}') {
        throw new ValidationError('Persisted Intent evidence contains non-empty metadata');
      }
      if (record.verifier !== row.owner) {
        throw new ValidationError('Persisted Intent evidence verifier does not match memory owner');
      }
      const eventRow = this.db.prepare(`
        SELECT * FROM events
        WHERE kind = 'memory.put' AND subject = ?
        ORDER BY seq ASC LIMIT 1
      `).get(row.object_id);
      if (!eventRow) throw new ValidationError('Intent evidence memory object has no evidence-chain event');
      const event = this.decodeEventRow(eventRow);
      if (
        event.actor !== row.owner
        || event.payload.owner !== row.owner
        || event.payload.object_id !== row.object_id
        || event.payload.kind !== row.kind
        || event.payload.content_digest !== row.content_digest
        || canonicalJson(event.payload.content) !== canonicalJson(decoded.payload_json.content)
        || canonicalJson(event.payload.metadata ?? {}) !== canonicalJson(decoded.payload_json.metadata ?? {})
      ) {
        throw new ValidationError('Intent evidence materialized state does not match signed evidence');
      }
      events.push({
        record,
        actor: event.actor,
        occurred_at: event.occurred_at,
        seq: event.seq,
        event_id: event.event_id,
        event_hash: event.event_hash,
        object_id: row.object_id
      });
    }
    return events;
  }

  requireIntentEvidenceChain() {
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

  getIntentContractAssessmentFromVerifiedState(contractId, {
    now = new Date().toISOString()
  } = {}) {
    const current = this.currentIntentActivation(contractId);
    if (!current) {
      throw new AxiomError(
        'intent_contract_not_active',
        'No active governance-ratified Intent Contract was found',
        404
      );
    }
    const derived = deriveIntentGridAssessment(
      current.activation,
      this.listIntentAttestationEvents(contractId),
      { now }
    );
    const status = this.getStatus();
    return {
      schema: 'axiom-intent-grid-state.v1',
      chain: {
        valid: true,
        verification_mode: 'full',
        last_seq: status.last_seq,
        last_hash: status.last_hash
      },
      governance: {
        proposal_id: current.proposal_id,
        proposer: current.proposer,
        activated_by: current.activated_by,
        activated_at: current.activated_at,
        proposal_event_id: current.proposal_event_id,
        proposal_event_hash: current.proposal_event_hash,
        activation_event_id: current.activation_event_id,
        activation_event_hash: current.activation_event_hash
      },
      activation: derived.activation,
      assessment: derived.assessment,
      reconciliation: derived.reconciliation,
      execution_authorized: false,
      non_claim: 'Reconciliation is advisory and cannot authorize or execute an effect in AXIOM Intent v0.2.'
    };
  }

  getIntentContractAssessment(contractId, options = {}) {
    this.requireIntentEvidenceChain();
    return this.getIntentContractAssessmentFromVerifiedState(contractId, options);
  }

  renderIntentGovernanceState(state) {
    const requirements = state.assessment.requirements.map(requirement => {
      const {
        independent_verifiers: independentVerifiers,
        failing_verifiers: failingVerifiers,
        stale_verifiers: staleVerifiers,
        future_verifiers: futureVerifiers,
        attestation_ids: ignoredAttestationIds,
        ...safe
      } = requirement;
      return {
        ...safe,
        independent_verifier_count: independentVerifiers.length,
        failing_verifier_count: failingVerifiers.length,
        stale_verifier_count: staleVerifiers.length,
        future_verifier_count: futureVerifiers.length
      };
    });
    return {
      schema: 'axiom-intent-governance-state.v1',
      contract_id: state.activation.contract_id,
      activation_digest: state.activation.activation_digest,
      contract_digest: state.activation.contract_digest,
      graph_digest: state.activation.graph_digest,
      build: state.activation.build,
      chain: state.chain,
      governance: state.governance,
      assessment: {
        schema: state.assessment.schema,
        evaluated_at: state.assessment.evaluated_at,
        summary: state.assessment.summary,
        requirements,
        rejected_attestation_count: state.assessment.rejected_attestations.length,
        source_assessment_digest: state.assessment.assessment_digest
      },
      reconciliation: state.reconciliation,
      execution_authorized: false,
      non_claim: 'This governance view is read-only; reconciliation cannot authorize or execute an effect in AXIOM Intent v0.3.'
    };
  }

  remediationProposalState(proposal) {
    try {
      const state = this.getIntentContractAssessmentFromVerifiedState(proposal.contract_id, {
        now: proposal.basis_evaluated_at
      });
      validateIntentRemediationProposalAgainstState(proposal, state, {
        now: new Date().toISOString()
      });
      return {
        current: true,
        reason: 'matches_current_authenticated_intent_state',
        execution_authorized: false
      };
    } catch (error) {
      return {
        current: false,
        reason: error?.code ?? 'stale_or_invalid_remediation_proposal',
        detail: error?.message ?? String(error),
        execution_authorized: false
      };
    }
  }

  renderIntentRemediationState(proposal, governanceStatus) {
    const state = this.remediationProposalState(proposal);
    return {
      schema: 'axiom-intent-remediation-governance-state.v1',
      remediation_proposal_id: proposal.remediation_proposal_id,
      remediation_proposal_digest: proposal.remediation_proposal_digest,
      basis_digest: proposal.basis_digest,
      contract_id: proposal.contract_id,
      activation_digest: proposal.activation_digest,
      source_assessment_digest: proposal.source_assessment_digest,
      source_reconciliation_digest: proposal.source_reconciliation_digest,
      reconciliation_state: proposal.reconciliation_state,
      action_counts: {
        autonomous: proposal.actions.filter(item => item.decision === 'autonomous').length,
        approval_required: proposal.actions.filter(item => item.decision === 'approval_required').length,
        deny: proposal.actions.filter(item => item.decision === 'deny').length
      },
      governance_status: governanceStatus,
      current: state.current,
      current_reason: state.reason,
      ...(state.current ? {} : { current_detail: state.detail }),
      execution_authorized: false,
      non_claim: 'Governance status records review/ratification only; no remediation action is executed by AXIOM Intent v0.5.'
    };
  }

  listProposals(options = {}) {
    const proposals = super.listProposals(options);
    const activeIntentProposals = proposals.filter(proposal => (
      ['active', 'verified'].includes(proposal.status)
      && this.isIntentActivationAction(proposal.action_json)
    ));
    const remediationProposals = proposals.filter(proposal => (
      isIntentRemediationAction(proposal.action_json)
    ));
    if (!activeIntentProposals.length && !remediationProposals.length) return proposals;

    this.requireIntentEvidenceChain();
    const statesByProposal = new Map();
    const contractIds = [...new Set(activeIntentProposals.map(proposal => (
      normalizeIntentActivationRecord(proposal.action_json.payload.activation).contract_id
    )))];
    for (const contractId of contractIds) {
      const fullState = this.getIntentContractAssessmentFromVerifiedState(contractId);
      statesByProposal.set(
        fullState.governance.proposal_id,
        { intent_state: this.renderIntentGovernanceState(fullState) }
      );
    }
    for (const proposal of remediationProposals) {
      const remediation = normalizeIntentRemediationProposal(
        proposal.action_json.payload.remediation
      );
      statesByProposal.set(proposal.proposal_id, {
        ...(statesByProposal.get(proposal.proposal_id) ?? {}),
        intent_remediation_state: this.renderIntentRemediationState(
          remediation,
          proposal.status
        )
      });
    }
    return proposals.map(proposal => ({
      ...proposal,
      ...(statesByProposal.get(proposal.proposal_id) ?? {})
    }));
  }
}

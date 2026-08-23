import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson
} from '../lib/canonical.mjs';
import {
  ContextAuthorityCompilerGridStore
} from './context-authority-admitted-compiler.mjs';
import {
  runContextAuthorityStateMigrations
} from './context-authority-state-migrations.mjs';

export const CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT =
  'context.authority-evidence.revoked';
export const CONTEXT_AUTHORITY_EVIDENCE_SUPERSEDED_EVENT =
  'context.authority-evidence.superseded';
export const CONTEXT_AUTHORITY_EVIDENCE_STATE_TRANSITION_SCHEMA =
  'axiom-context-authority-evidence-state-transition.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const ACTIONS = new Set(['revoked', 'superseded']);
const TRANSITION_FIELDS = Object.freeze([
  'schema',
  'evidence_id',
  'action',
  'replacement_evidence_id',
  'reason_code',
  'transitioned_by',
  'authority_effect',
  'grants_vault_access',
  'grants_execution_authority'
]);

function id(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function cloneCanonical(value, label) {
  try {
    return JSON.parse(canonicalJson(value));
  } catch {
    throw new ValidationError(`${label} must be canonical JSON`);
  }
}

function assertExactKeys(value, allowedFields, label) {
  assertPlainObject(value, label);
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of allowedFields) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} is missing required field ${key}`);
    }
  }
}

function normalizeTransitionPrincipals(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
    throw new ValidationError(
      'Context authority state transitions require 1-64 local transition principals'
    );
  }
  const principals = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const principal = id(
      value[index],
      `contextAuthorityStateTransitionPrincipals[${index}]`
    );
    if (principals.has(principal)) {
      throw new ValidationError(
        'Context authority state transition principals contain a duplicate'
      );
    }
    principals.add(principal);
  }
  return Object.freeze([...principals].sort());
}

function decodeTransition(row) {
  if (!row) return null;
  return Object.freeze({
    evidence_id: row.evidence_id,
    action: row.action,
    replacement_evidence_id: row.replacement_evidence_id,
    reason_code: row.reason_code,
    transition_event_id: row.transition_event_id,
    transitioned_by: row.transitioned_by,
    transitioned_at: row.transitioned_at,
    authority_effect: 'deny-only',
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

function transitionKind(action) {
  if (action === 'revoked') return CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT;
  if (action === 'superseded') return CONTEXT_AUTHORITY_EVIDENCE_SUPERSEDED_EVENT;
  throw new ValidationError('Context authority state transition action is invalid');
}

function actionForKind(kind) {
  if (kind === CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT) return 'revoked';
  if (kind === CONTEXT_AUTHORITY_EVIDENCE_SUPERSEDED_EVENT) return 'superseded';
  return null;
}

export class ContextAuthorityStateGridStore extends
  ContextAuthorityCompilerGridStore {
  constructor({
    contextAuthorityStateTransitionPrincipals,
    ...gridOptions
  }) {
    super(gridOptions);
    this.contextAuthorityStateTransitionPrincipals =
      normalizeTransitionPrincipals(contextAuthorityStateTransitionPrincipals);
    this.contextAuthorityStateMigrations =
      runContextAuthorityStateMigrations(this.db);
    this.contextAuthorityStateReady = true;
    this.rebuildContextAuthorityEvidenceState();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      context_authority_state_schema_version:
        this.contextAuthorityStateMigrations?.version ?? 0,
      context_authority_state_runtime:
        'append-only-terminal-deny-state-transitions',
      context_authority_state_grants_authority: false
    };
  }

  appendEvents({ traceId, actor, events }) {
    if (this.contextAuthorityStateReady && Array.isArray(events)) {
      const transitionAt = Date.now();
      for (const event of events) {
        const action = actionForKind(event?.kind);
        if (!action) continue;
        this.validateContextAuthorityStateTransitionEvent(event, actor, {
          transitionAt,
          requireNoExistingTransition: true
        });
      }
    }
    return super.appendEvents({ traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (!this.contextAuthorityStateReady) return;
    if (!actionForKind(event.kind)) return;
    this.materializeContextAuthorityEvidenceStateTransition(event);
  }

  rebuildContextAuthorityEvidenceState() {
    const rows = this.db.prepare(`
      SELECT *
      FROM events
      WHERE kind IN (?, ?)
      ORDER BY seq
    `).all(
      CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT,
      CONTEXT_AUTHORITY_EVIDENCE_SUPERSEDED_EVENT
    );

    this.transaction(() => {
      this.db.exec('DELETE FROM context_authority_evidence_state_transitions');
      for (const row of rows) {
        this.materializeContextAuthorityEvidenceStateTransition(
          this.decodeEventRow(row)
        );
      }
    });
  }

  validateContextAuthorityStateTransitionEvent(event, actor, {
    transitionAt,
    requireNoExistingTransition
  }) {
    assertPlainObject(event, 'Context authority state transition event');
    const action = actionForKind(event.kind);
    if (!action || !ACTIONS.has(action)) {
      throw new ValidationError(
        'Context authority state transition event kind is invalid'
      );
    }
    const subject = id(
      event.subject,
      'context authority state transition event subject'
    );
    const payload = cloneCanonical(
      event.payload,
      'Context authority state transition payload'
    );
    assertExactKeys(
      payload,
      TRANSITION_FIELDS,
      'Context authority state transition payload'
    );

    if (payload.schema !== CONTEXT_AUTHORITY_EVIDENCE_STATE_TRANSITION_SCHEMA) {
      throw new ValidationError(
        'Context authority state transition schema is invalid'
      );
    }
    if (payload.action !== action) {
      throw new ValidationError(
        'Context authority state transition action does not match event kind'
      );
    }
    id(payload.evidence_id, 'context authority state transition evidence_id');
    if (subject !== payload.evidence_id) {
      throw new ValidationError(
        'Context authority state transition subject must match evidence_id'
      );
    }
    id(payload.reason_code, 'context authority state transition reason_code');
    id(payload.transitioned_by, 'context authority state transition transitioned_by');
    if (payload.transitioned_by !== actor) {
      throw new ValidationError(
        'Context authority state transition actor must match transitioned_by'
      );
    }
    if (!this.contextAuthorityStateTransitionPrincipals.includes(actor)) {
      throw new AxiomError(
        'context_authority_state_transition_actor_not_allowed',
        'This local principal may not transition context authority evidence state',
        403
      );
    }
    if (
      payload.authority_effect !== 'deny-only'
      || payload.grants_vault_access !== false
      || payload.grants_execution_authority !== false
    ) {
      throw new ValidationError(
        'Context authority state transition must remain deny-only'
      );
    }

    const original = this.getContextAuthorityEvidenceAdmission(
      payload.evidence_id
    );
    if (!original) {
      throw new AxiomError(
        'context_authority_state_transition_evidence_not_admitted',
        'Only persistently admitted context authority evidence can be transitioned',
        409
      );
    }

    const transitionTime = normalizeTime(
      transitionAt,
      'context authority state transition time'
    );
    if (Date.parse(original.admitted_at) > transitionTime) {
      throw new ValidationError(
        'Context authority state transition cannot precede admission'
      );
    }

    const existing = this.getContextAuthorityEvidenceTransition(
      payload.evidence_id
    );
    if (requireNoExistingTransition && existing) {
      throw new AxiomError(
        'context_authority_state_transition_conflict',
        'Context authority evidence already has a terminal state transition',
        409
      );
    }

    if (action === 'revoked') {
      if (payload.replacement_evidence_id !== null) {
        throw new ValidationError(
          'Revoked context authority evidence cannot name a replacement'
        );
      }
    } else {
      const replacementId = id(
        payload.replacement_evidence_id,
        'context authority state transition replacement_evidence_id'
      );
      if (replacementId === payload.evidence_id) {
        throw new ValidationError(
          'Context authority evidence cannot supersede itself'
        );
      }
      const replacement = this.getContextAuthorityEvidenceAdmission(replacementId);
      if (!replacement) {
        throw new AxiomError(
          'context_authority_state_transition_replacement_not_admitted',
          'Superseding evidence must already be persistently admitted',
          409
        );
      }
      if (
        replacement.evidence_type !== original.evidence_type
        || replacement.issuer_principal_ref !== original.issuer_principal_ref
      ) {
        throw new ValidationError(
          'Superseding evidence must match the original evidence class and issuer'
        );
      }
      if (this.getContextAuthorityEvidenceTransition(replacementId)) {
        throw new AxiomError(
          'context_authority_state_transition_replacement_not_active',
          'Superseding evidence must not already be terminally transitioned',
          409
        );
      }
      const replacementIssuedAt = Date.parse(replacement.issued_at);
      const replacementExpiresAt = Date.parse(replacement.expires_at);
      if (
        !Number.isFinite(replacementIssuedAt)
        || !Number.isFinite(replacementExpiresAt)
        || replacementIssuedAt > transitionTime
        || replacementExpiresAt <= transitionTime
      ) {
        throw new ValidationError(
          'Superseding evidence must be current at the transition time'
        );
      }
    }

    return Object.freeze({ payload, original });
  }

  materializeContextAuthorityEvidenceStateTransition(event) {
    const transitionAt = Date.parse(event.occurred_at);
    if (!Number.isFinite(transitionAt)) {
      throw new ValidationError(
        'Context authority state transition event timestamp is invalid'
      );
    }
    const { payload } = this.validateContextAuthorityStateTransitionEvent(
      event,
      event.actor,
      {
        transitionAt,
        requireNoExistingTransition: true
      }
    );

    this.db.prepare(`
      INSERT INTO context_authority_evidence_state_transitions(
        evidence_id,
        action,
        replacement_evidence_id,
        reason_code,
        transition_event_id,
        transitioned_by,
        transitioned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.evidence_id,
      payload.action,
      payload.replacement_evidence_id,
      payload.reason_code,
      event.event_id,
      payload.transitioned_by,
      event.occurred_at
    );
  }

  getContextAuthorityEvidenceTransition(evidenceId) {
    const evidence = id(
      evidenceId,
      'context authority state evidence_id'
    );
    return decodeTransition(this.db.prepare(`
      SELECT *
      FROM context_authority_evidence_state_transitions
      WHERE evidence_id = ?
    `).get(evidence));
  }

  getContextAuthorityEvidenceState(evidenceId) {
    const admission = this.getContextAuthorityEvidenceAdmission(evidenceId);
    if (!admission) return null;
    const transition = this.getContextAuthorityEvidenceTransition(evidenceId);
    return Object.freeze({
      ...admission,
      current_status: transition?.action ?? 'admitted',
      transition
    });
  }

  revokeContextAuthorityEvidence({
    evidenceId,
    actor,
    traceId,
    reasonCode
  }) {
    return this.transitionContextAuthorityEvidence({
      evidenceId,
      action: 'revoked',
      replacementEvidenceId: null,
      actor,
      traceId,
      reasonCode
    });
  }

  supersedeContextAuthorityEvidence({
    evidenceId,
    replacementEvidenceId,
    actor,
    traceId,
    reasonCode
  }) {
    return this.transitionContextAuthorityEvidence({
      evidenceId,
      action: 'superseded',
      replacementEvidenceId,
      actor,
      traceId,
      reasonCode
    });
  }

  transitionContextAuthorityEvidence({
    evidenceId,
    action,
    replacementEvidenceId,
    actor,
    traceId,
    reasonCode
  }) {
    const evidence = id(evidenceId, 'context authority state evidence_id');
    const principal = id(actor, 'context authority state actor');
    id(traceId, 'context authority state trace_id');
    const reason = id(reasonCode, 'context authority state reason_code');
    if (!ACTIONS.has(action)) {
      throw new ValidationError('Context authority state transition action is invalid');
    }

    const existing = this.getContextAuthorityEvidenceTransition(evidence);
    if (existing) {
      const same =
        existing.action === action
        && existing.replacement_evidence_id === replacementEvidenceId
        && existing.reason_code === reason
        && existing.transitioned_by === principal;
      if (same) return this.getContextAuthorityEvidenceState(evidence);
      throw new AxiomError(
        'context_authority_state_transition_conflict',
        'Context authority evidence already has a different terminal state transition',
        409
      );
    }

    const payload = Object.freeze({
      schema: CONTEXT_AUTHORITY_EVIDENCE_STATE_TRANSITION_SCHEMA,
      evidence_id: evidence,
      action,
      replacement_evidence_id: replacementEvidenceId,
      reason_code: reason,
      transitioned_by: principal,
      authority_effect: 'deny-only',
      grants_vault_access: false,
      grants_execution_authority: false
    });

    const [event] = this.appendEvents({
      traceId,
      actor: principal,
      events: [{
        kind: transitionKind(action),
        subject: evidence,
        payload
      }]
    });
    const state = this.getContextAuthorityEvidenceState(evidence);
    if (!state?.transition || state.transition.transition_event_id !== event.event_id) {
      throw new ValidationError(
        'Context authority state transition did not materialize'
      );
    }
    return state;
  }

  assertContextAuthorityEvidenceAdmitted(envelope, options = {}) {
    const admitted = super.assertContextAuthorityEvidenceAdmitted(
      envelope,
      options
    );
    const transition = this.getContextAuthorityEvidenceTransition(
      admitted.evidence_id
    );
    if (!transition) return admitted;
    if (transition.action === 'revoked') {
      throw new AxiomError(
        'context_authority_evidence_revoked',
        'Persistently admitted context authority evidence is locally revoked',
        409
      );
    }
    throw new AxiomError(
      'context_authority_evidence_superseded',
      'Persistently admitted context authority evidence is locally superseded',
      409
    );
  }
}

function normalizeTime(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

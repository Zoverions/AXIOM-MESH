import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import {
  ContextAuthorityCompilerGridStore
} from './context-authority-admitted-compiler.mjs';
import {
  runContextAuthorityLifecycleMigrations
} from './context-authority-lifecycle-migrations.mjs';

export const CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT =
  'context.authority-evidence.revoked';
export const CONTEXT_AUTHORITY_EVIDENCE_SUPERSEDED_EVENT =
  'context.authority-evidence.superseded';
export const CONTEXT_AUTHORITY_EVIDENCE_LIFECYCLE_SCHEMA =
  'axiom-context-authority-evidence-lifecycle.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const LIFECYCLE_EVENT_KINDS = new Set([
  CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT,
  CONTEXT_AUTHORITY_EVIDENCE_SUPERSEDED_EVENT
]);
const LIFECYCLE_FIELDS = Object.freeze([
  'schema',
  'evidence_id',
  'transition',
  'reason_code',
  'changed_by',
  'superseded_by_evidence_id',
  'future_use_effect',
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

function exactKeys(value, fields, label) {
  assertPlainObject(value, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} is missing required field ${key}`);
    }
  }
}

function normalizeLifecycleActors(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new ValidationError(
      'Context authority lifecycle requires 1-32 locally configured actor refs'
    );
  }
  const actors = value.map((actor, index) =>
    id(actor, `contextAuthorityLifecycleActorRefs[${index}]`)
  );
  if (new Set(actors).size !== actors.length) {
    throw new ValidationError(
      'Context authority lifecycle actor refs must be unique'
    );
  }
  return Object.freeze([...actors].sort());
}

function transitionKind(transition) {
  if (transition === 'revoked') {
    return CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT;
  }
  if (transition === 'superseded') {
    return CONTEXT_AUTHORITY_EVIDENCE_SUPERSEDED_EVENT;
  }
  throw new ValidationError('Context authority lifecycle transition is invalid');
}

function decodeLifecycle(row) {
  if (!row) return null;
  return Object.freeze({
    evidence_id: row.evidence_id,
    state: row.state,
    transition_event_id: row.transition_event_id,
    changed_by: row.changed_by,
    changed_at: row.changed_at,
    reason_code: row.reason_code,
    superseded_by_evidence_id: row.superseded_by_evidence_id,
    usable_for_context_compilation: false,
    transition_grants_vault_access: false,
    transition_grants_execution_authority: false
  });
}

function eventSeqForAdmission(store, admission) {
  const row = store.db.prepare(`
    SELECT seq
    FROM events
    WHERE event_id = ?
  `).get(admission.admitted_event_id);
  if (!row || !Number.isSafeInteger(row.seq)) {
    throw new ValidationError(
      'Context authority lifecycle cannot resolve admission event ordering'
    );
  }
  return row.seq;
}

function parseTime(value, label) {
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${label} is not a valid date-time`);
  }
  return parsed;
}

export class ContextAuthorityLifecycleGridStore extends
  ContextAuthorityCompilerGridStore {
  constructor({
    contextAuthorityLifecycleActorRefs,
    ...options
  }) {
    super(options);
    this.contextAuthorityLifecycleActorRefs = normalizeLifecycleActors(
      contextAuthorityLifecycleActorRefs
    );
    this.contextAuthorityLifecycleActorSet = new Set(
      this.contextAuthorityLifecycleActorRefs
    );
    this.contextAuthorityLifecycleMigrations =
      runContextAuthorityLifecycleMigrations(this.db);
    this.contextAuthorityLifecycleReady = true;
    this.rebuildContextAuthorityLifecycleState();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      context_authority_lifecycle_schema_version:
        this.contextAuthorityLifecycleMigrations?.version ?? 0,
      context_authority_lifecycle_runtime:
        'append-only-terminal-revocation-and-supersession',
      context_authority_lifecycle_actor_count:
        this.contextAuthorityLifecycleActorRefs?.length ?? 0,
      context_authority_lifecycle_mutates_admission_history: false,
      context_authority_lifecycle_grants_authority: false
    };
  }

  appendEvents({ traceId, actor, events }) {
    if (this.contextAuthorityLifecycleReady && Array.isArray(events)) {
      const now = Date.now();
      for (const event of events) {
        if (!LIFECYCLE_EVENT_KINDS.has(event?.kind)) continue;
        this.validateContextAuthorityLifecycleEvent(event, actor, {
          occurredAtMs: now,
          eventSeq: null
        });
      }
    }
    return super.appendEvents({ traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (
      this.contextAuthorityLifecycleReady
      && LIFECYCLE_EVENT_KINDS.has(event.kind)
    ) {
      this.materializeContextAuthorityLifecycleEvent(event);
    }
  }

  rebuildContextAuthorityLifecycleState() {
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
      this.db.exec('DELETE FROM context_authority_evidence_lifecycle');
      for (const row of rows) {
        this.materializeContextAuthorityLifecycleEvent(
          this.decodeEventRow(row)
        );
      }
    });
  }

  validateContextAuthorityLifecycleEvent(event, actor, {
    occurredAtMs,
    eventSeq
  }) {
    assertPlainObject(event, 'Context authority lifecycle event');
    if (!this.contextAuthorityLifecycleActorSet.has(actor)) {
      throw new AxiomError(
        'context_authority_lifecycle_actor_denied',
        'Actor is not locally authorized to record context authority lifecycle changes',
        403
      );
    }

    const payload = cloneCanonical(
      event.payload,
      'Context authority lifecycle payload'
    );
    exactKeys(
      payload,
      LIFECYCLE_FIELDS,
      'Context authority lifecycle payload'
    );
    if (payload.schema !== CONTEXT_AUTHORITY_EVIDENCE_LIFECYCLE_SCHEMA) {
      throw new ValidationError('Context authority lifecycle schema is invalid');
    }
    const evidenceId = id(
      payload.evidence_id,
      'context authority lifecycle evidence_id'
    );
    const reasonCode = id(
      payload.reason_code,
      'context authority lifecycle reason_code'
    );
    const changedBy = id(
      payload.changed_by,
      'context authority lifecycle changed_by'
    );
    if (changedBy !== actor) {
      throw new ValidationError(
        'Context authority lifecycle actor must match changed_by'
      );
    }
    if (id(event.subject, 'context authority lifecycle subject') !== evidenceId) {
      throw new ValidationError(
        'Context authority lifecycle event subject must match evidence_id'
      );
    }
    if (event.kind !== transitionKind(payload.transition)) {
      throw new ValidationError(
        'Context authority lifecycle event kind does not match transition'
      );
    }
    if (
      payload.future_use_effect !== 'deny'
      || payload.grants_vault_access !== false
      || payload.grants_execution_authority !== false
    ) {
      throw new ValidationError(
        'Context authority lifecycle transition may only deny future use and cannot grant authority'
      );
    }

    const target = this.getContextAuthorityEvidenceAdmission(evidenceId);
    if (!target) {
      throw new AxiomError(
        'context_authority_evidence_not_admitted',
        'Lifecycle transition target has not been admitted',
        409
      );
    }
    const existing = decodeLifecycle(this.db.prepare(`
      SELECT *
      FROM context_authority_evidence_lifecycle
      WHERE evidence_id = ?
    `).get(evidenceId));
    if (existing) {
      throw new AxiomError(
        'context_authority_evidence_terminal',
        `Evidence is already terminal: ${existing.state}`,
        409
      );
    }

    if (eventSeq !== null) {
      const targetSeq = eventSeqForAdmission(this, target);
      if (targetSeq >= eventSeq) {
        throw new ValidationError(
          'Context authority lifecycle target must have been admitted earlier in the Grid chain'
        );
      }
    }

    let replacement = null;
    if (payload.transition === 'revoked') {
      if (payload.superseded_by_evidence_id !== null) {
        throw new ValidationError(
          'Revoked context authority evidence cannot name a superseding evidence_id'
        );
      }
    } else {
      const replacementId = id(
        payload.superseded_by_evidence_id,
        'context authority lifecycle superseded_by_evidence_id'
      );
      if (replacementId === evidenceId) {
        throw new ValidationError(
          'Context authority evidence cannot supersede itself'
        );
      }
      replacement = this.getContextAuthorityEvidenceAdmission(replacementId);
      if (!replacement) {
        throw new AxiomError(
          'context_authority_superseding_evidence_not_admitted',
          'Superseding evidence must already be admitted',
          409
        );
      }
      const replacementLifecycle = decodeLifecycle(this.db.prepare(`
        SELECT *
        FROM context_authority_evidence_lifecycle
        WHERE evidence_id = ?
      `).get(replacementId));
      if (replacementLifecycle) {
        throw new AxiomError(
          'context_authority_superseding_evidence_terminal',
          'Superseding evidence must still be active',
          409
        );
      }
      if (
        replacement.evidence_type !== target.evidence_type
        || replacement.issuer_principal_ref !== target.issuer_principal_ref
      ) {
        throw new ValidationError(
          'Superseding evidence must have the same evidence type and issuer as the target'
        );
      }
      if (
        parseTime(replacement.issued_at, 'superseding evidence issued_at')
        < parseTime(target.issued_at, 'target evidence issued_at')
      ) {
        throw new ValidationError(
          'Superseding evidence cannot be older than the target evidence'
        );
      }
      if (
        parseTime(replacement.issued_at, 'superseding evidence issued_at')
        > occurredAtMs
        || parseTime(replacement.expires_at, 'superseding evidence expires_at')
        <= occurredAtMs
      ) {
        throw new ValidationError(
          'Superseding evidence must be current when the transition is recorded'
        );
      }
      if (eventSeq !== null) {
        const replacementSeq = eventSeqForAdmission(this, replacement);
        if (replacementSeq >= eventSeq) {
          throw new ValidationError(
            'Superseding evidence must have been admitted earlier in the Grid chain'
          );
        }
      }
    }

    return Object.freeze({
      payload,
      target,
      replacement,
      reason_code: reasonCode
    });
  }

  materializeContextAuthorityLifecycleEvent(event) {
    const occurredAtMs = parseTime(
      event.occurred_at,
      'Context authority lifecycle event occurred_at'
    );
    const validated = this.validateContextAuthorityLifecycleEvent(
      event,
      event.actor,
      {
        occurredAtMs,
        eventSeq: event.seq
      }
    );

    this.db.prepare(`
      INSERT INTO context_authority_evidence_lifecycle(
        evidence_id,
        state,
        transition_event_id,
        changed_by,
        changed_at,
        reason_code,
        superseded_by_evidence_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      validated.payload.evidence_id,
      validated.payload.transition,
      event.event_id,
      validated.payload.changed_by,
      event.occurred_at,
      validated.payload.reason_code,
      validated.payload.superseded_by_evidence_id
    );
  }

  getContextAuthorityEvidenceLifecycle(evidenceId) {
    const evidence = id(
      evidenceId,
      'context authority lifecycle evidence_id'
    );
    const admission = this.getContextAuthorityEvidenceAdmission(evidence);
    if (!admission) return null;
    const terminal = decodeLifecycle(this.db.prepare(`
      SELECT *
      FROM context_authority_evidence_lifecycle
      WHERE evidence_id = ?
    `).get(evidence));
    if (terminal) return terminal;
    return Object.freeze({
      evidence_id: evidence,
      state: 'active',
      transition_event_id: null,
      changed_by: null,
      changed_at: null,
      reason_code: null,
      superseded_by_evidence_id: null,
      usable_for_context_compilation: true,
      transition_grants_vault_access: false,
      transition_grants_execution_authority: false
    });
  }

  revokeContextAuthorityEvidence({
    evidenceId,
    actor,
    traceId,
    reasonCode
  }) {
    const payload = {
      schema: CONTEXT_AUTHORITY_EVIDENCE_LIFECYCLE_SCHEMA,
      evidence_id: id(evidenceId, 'context authority lifecycle evidence_id'),
      transition: 'revoked',
      reason_code: id(reasonCode, 'context authority lifecycle reason_code'),
      changed_by: id(actor, 'context authority lifecycle actor'),
      superseded_by_evidence_id: null,
      future_use_effect: 'deny',
      grants_vault_access: false,
      grants_execution_authority: false
    };
    this.appendEvents({
      traceId: id(traceId, 'context authority lifecycle trace_id'),
      actor,
      events: [{
        kind: CONTEXT_AUTHORITY_EVIDENCE_REVOKED_EVENT,
        subject: payload.evidence_id,
        payload
      }]
    });
    return this.getContextAuthorityEvidenceLifecycle(payload.evidence_id);
  }

  supersedeContextAuthorityEvidence({
    evidenceId,
    supersededByEvidenceId,
    actor,
    traceId,
    reasonCode
  }) {
    const payload = {
      schema: CONTEXT_AUTHORITY_EVIDENCE_LIFECYCLE_SCHEMA,
      evidence_id: id(evidenceId, 'context authority lifecycle evidence_id'),
      transition: 'superseded',
      reason_code: id(reasonCode, 'context authority lifecycle reason_code'),
      changed_by: id(actor, 'context authority lifecycle actor'),
      superseded_by_evidence_id: id(
        supersededByEvidenceId,
        'context authority lifecycle superseded_by_evidence_id'
      ),
      future_use_effect: 'deny',
      grants_vault_access: false,
      grants_execution_authority: false
    };
    this.appendEvents({
      traceId: id(traceId, 'context authority lifecycle trace_id'),
      actor,
      events: [{
        kind: CONTEXT_AUTHORITY_EVIDENCE_SUPERSEDED_EVENT,
        subject: payload.evidence_id,
        payload
      }]
    });
    return this.getContextAuthorityEvidenceLifecycle(payload.evidence_id);
  }

  compileContextCapsuleFromAdmittedEvidence(options = {}) {
    const compilation = super.compileContextCapsuleFromAdmittedEvidence(options);
    const lifecycle = compilation.authority_evidence_admission_ids
      .map(evidenceId => this.getContextAuthorityEvidenceLifecycle(evidenceId))
      .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));

    for (const item of lifecycle) {
      if (item.state === 'revoked') {
        throw new AxiomError(
          'context_authority_evidence_revoked',
          `Context authority evidence ${item.evidence_id} has been revoked`,
          409
        );
      }
      if (item.state === 'superseded') {
        throw new AxiomError(
          'context_authority_evidence_superseded',
          `Context authority evidence ${item.evidence_id} has been superseded`,
          409
        );
      }
    }

    const lifecycleProof = lifecycle.map(item => ({
      evidence_id: item.evidence_id,
      state: item.state,
      transition_event_id: item.transition_event_id,
      superseded_by_evidence_id: item.superseded_by_evidence_id
    }));

    return Object.freeze({
      ...compilation,
      authority_evidence_lifecycle_verified: true,
      authority_evidence_lifecycle_bundle_sha256: digestObject(lifecycleProof),
      authority_evidence_lifecycle_all_active: true,
      authority_evidence_lifecycle_mutates_admission_history: false,
      authority_evidence_lifecycle_grants_authority: false,
      grants_vault_access: false,
      grants_execution_authority: false
    });
  }
}

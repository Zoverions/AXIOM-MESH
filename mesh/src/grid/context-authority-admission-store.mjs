import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson
} from '../lib/canonical.mjs';
import {
  verifyContextAuthorityEvidence
} from '../lib/context-authority-evidence.mjs';
import { GridStore } from './store.mjs';
import {
  runContextAuthorityAdmissionMigrations
} from './context-authority-admission-migrations.mjs';

export const CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT =
  'context.authority-evidence.admitted';
export const CONTEXT_AUTHORITY_EVIDENCE_ADMISSION_SCHEMA =
  'axiom-context-authority-evidence-admission.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ADMISSION_FIELDS = Object.freeze([
  'schema',
  'evidence_id',
  'evidence_type',
  'issuer_principal_ref',
  'issuer_nonce',
  'key_id',
  'payload_sha256',
  'envelope_sha256',
  'issued_at',
  'expires_at',
  'admitted_by',
  'signed_evidence',
  'authority_effect',
  'grants_vault_access',
  'grants_execution_authority'
]);

function id(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function sha256(value, label) {
  return assertString(value, label, {
    min: 64,
    max: 64,
    pattern: SHA256
  });
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

function cloneCanonical(value, label) {
  try {
    return JSON.parse(canonicalJson(value));
  } catch {
    throw new ValidationError(`${label} must be canonical JSON`);
  }
}

function normalizeTrustPins(trustPins) {
  if (!Array.isArray(trustPins) || trustPins.length < 1) {
    throw new ValidationError(
      'Context authority admission requires local trust pins'
    );
  }
  return cloneCanonical(trustPins, 'Context authority admission trust pins');
}

function normalizeLifetimeLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 86400) {
    throw new ValidationError(
      'Context authority admission evidence lifetime limit must be 1-86400 seconds'
    );
  }
  return value;
}

function validateAdmissionPayload(payload, actor, {
  trustPins,
  now,
  maxEvidenceLifetimeSeconds
}) {
  const value = cloneCanonical(payload, 'Context authority admission payload');
  assertExactKeys(
    value,
    ADMISSION_FIELDS,
    'Context authority admission payload'
  );

  if (value.schema !== CONTEXT_AUTHORITY_EVIDENCE_ADMISSION_SCHEMA) {
    throw new ValidationError('Context authority admission schema is invalid');
  }

  id(value.evidence_id, 'context authority admission evidence_id');
  id(value.evidence_type, 'context authority admission evidence_type');
  id(
    value.issuer_principal_ref,
    'context authority admission issuer_principal_ref'
  );
  id(value.issuer_nonce, 'context authority admission issuer_nonce');
  assertString(value.key_id, 'context authority admission key_id', {
    min: 1,
    max: 160
  });
  sha256(value.payload_sha256, 'context authority admission payload_sha256');
  sha256(value.envelope_sha256, 'context authority admission envelope_sha256');
  assertString(value.issued_at, 'context authority admission issued_at', {
    min: 20,
    max: 40
  });
  assertString(value.expires_at, 'context authority admission expires_at', {
    min: 20,
    max: 40
  });
  id(value.admitted_by, 'context authority admission admitted_by');
  if (value.admitted_by !== actor) {
    throw new ValidationError(
      'Context authority admission actor must match admitted_by'
    );
  }
  if (
    value.authority_effect !== 'none'
    || value.grants_vault_access !== false
    || value.grants_execution_authority !== false
  ) {
    throw new ValidationError(
      'Context authority admission cannot grant authority'
    );
  }

  const verified = verifyContextAuthorityEvidence(value.signed_evidence, {
    trustPins,
    now,
    maxEvidenceLifetimeSeconds
  });

  const expected = {
    evidence_id: verified.evidence_id,
    evidence_type: verified.evidence_type,
    issuer_principal_ref: verified.issuer_principal_ref,
    issuer_nonce: verified.nonce,
    key_id: verified.key_id,
    payload_sha256: verified.payload_sha256,
    envelope_sha256: verified.envelope_sha256,
    issued_at: verified.issued_at,
    expires_at: verified.expires_at
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) {
      throw new ValidationError(
        `Context authority admission ${key} does not match signed evidence`
      );
    }
  }

  return Object.freeze({
    payload: value,
    verified
  });
}

function validateAdmissionEvent(event, actor, options) {
  assertPlainObject(event, 'Context authority admission event');
  const subject = id(
    event.subject,
    'context authority admission event subject'
  );
  const validated = validateAdmissionPayload(event.payload, actor, options);
  if (subject !== validated.payload.evidence_id) {
    throw new ValidationError(
      'Context authority admission event subject must match evidence_id'
    );
  }
  return validated;
}

function decodeAdmission(row) {
  if (!row) return null;
  return Object.freeze({
    evidence_id: row.evidence_id,
    evidence_type: row.evidence_type,
    issuer_principal_ref: row.issuer_principal_ref,
    issuer_nonce: row.issuer_nonce,
    key_id: row.key_id,
    payload_sha256: row.payload_sha256,
    envelope_sha256: row.envelope_sha256,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    admitted_event_id: row.admitted_event_id,
    admitted_by: row.admitted_by,
    admitted_at: row.admitted_at,
    status: row.status,
    authority_effect: 'none',
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

export class ContextAuthorityAdmissionGridStore extends GridStore {
  constructor({
    contextAuthorityTrustPins,
    contextAuthorityMaxEvidenceLifetimeSeconds = 3600,
    ...gridOptions
  }) {
    super(gridOptions);
    this.contextAuthorityTrustPins = normalizeTrustPins(
      contextAuthorityTrustPins
    );
    this.contextAuthorityMaxEvidenceLifetimeSeconds = normalizeLifetimeLimit(
      contextAuthorityMaxEvidenceLifetimeSeconds
    );
    this.contextAuthorityAdmissionMigrations =
      runContextAuthorityAdmissionMigrations(this.db);
    this.contextAuthorityAdmissionReady = true;
    this.rebuildContextAuthorityAdmissionState();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      context_authority_admission_schema_version:
        this.contextAuthorityAdmissionMigrations?.version ?? 0,
      context_authority_admission_runtime:
        'verified-append-only-replay-resistant-registry'
    };
  }

  appendEvents({ traceId, actor, events }) {
    if (this.contextAuthorityAdmissionReady && Array.isArray(events)) {
      const now = Date.now();
      for (const event of events) {
        if (event?.kind !== CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT) continue;
        validateAdmissionEvent(event, actor, {
          trustPins: this.contextAuthorityTrustPins,
          now,
          maxEvidenceLifetimeSeconds:
            this.contextAuthorityMaxEvidenceLifetimeSeconds
        });
      }
    }
    return super.appendEvents({ traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (
      this.contextAuthorityAdmissionReady
      && event.kind === CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT
    ) {
      this.materializeContextAuthorityEvidenceAdmission(event);
    }
  }

  rebuildContextAuthorityAdmissionState() {
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE kind = ?
      ORDER BY seq
    `).all(CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT);

    this.transaction(() => {
      this.db.exec('DELETE FROM context_authority_evidence_admissions');
      for (const row of rows) {
        this.materializeContextAuthorityEvidenceAdmission(
          this.decodeEventRow(row)
        );
      }
    });
  }

  materializeContextAuthorityEvidenceAdmission(event) {
    const occurredAt = Date.parse(event.occurred_at);
    if (!Number.isFinite(occurredAt)) {
      throw new ValidationError(
        'Context authority admission event timestamp is invalid'
      );
    }
    const { payload } = validateAdmissionEvent(event, event.actor, {
      trustPins: this.contextAuthorityTrustPins,
      now: occurredAt,
      maxEvidenceLifetimeSeconds:
        this.contextAuthorityMaxEvidenceLifetimeSeconds
    });

    this.db.prepare(`
      INSERT INTO context_authority_evidence_admissions(
        evidence_id,
        evidence_type,
        issuer_principal_ref,
        issuer_nonce,
        key_id,
        payload_sha256,
        envelope_sha256,
        issued_at,
        expires_at,
        admitted_event_id,
        admitted_by,
        admitted_at,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admitted')
    `).run(
      payload.evidence_id,
      payload.evidence_type,
      payload.issuer_principal_ref,
      payload.issuer_nonce,
      payload.key_id,
      payload.payload_sha256,
      payload.envelope_sha256,
      payload.issued_at,
      payload.expires_at,
      event.event_id,
      payload.admitted_by,
      event.occurred_at
    );
  }

  getContextAuthorityEvidenceAdmission(evidenceId) {
    const evidence = id(
      evidenceId,
      'context authority admission evidence_id'
    );
    return decodeAdmission(this.db.prepare(`
      SELECT *
      FROM context_authority_evidence_admissions
      WHERE evidence_id = ?
    `).get(evidence));
  }

  listContextAuthorityEvidenceAdmissions({
    issuerPrincipalRef,
    evidenceType
  } = {}) {
    const clauses = [];
    const params = [];
    if (issuerPrincipalRef !== undefined) {
      clauses.push('issuer_principal_ref = ?');
      params.push(id(
        issuerPrincipalRef,
        'context authority admission issuer_principal_ref'
      ));
    }
    if (evidenceType !== undefined) {
      clauses.push('evidence_type = ?');
      params.push(id(
        evidenceType,
        'context authority admission evidence_type'
      ));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return Object.freeze(this.db.prepare(`
      SELECT *
      FROM context_authority_evidence_admissions
      ${where}
      ORDER BY admitted_at, evidence_id
    `).all(...params).map(decodeAdmission));
  }

  admitContextAuthorityEvidence({
    envelope,
    actor,
    traceId,
    now = Date.now()
  }) {
    id(actor, 'context authority admission actor');
    id(traceId, 'context authority admission trace_id');
    const verified = verifyContextAuthorityEvidence(envelope, {
      trustPins: this.contextAuthorityTrustPins,
      now,
      maxEvidenceLifetimeSeconds:
        this.contextAuthorityMaxEvidenceLifetimeSeconds
    });

    const byId = this.getContextAuthorityEvidenceAdmission(
      verified.evidence_id
    );
    if (byId) {
      if (byId.envelope_sha256 === verified.envelope_sha256) return byId;
      throw new AxiomError(
        'context_authority_evidence_id_conflict',
        'This evidence_id is already bound to different signed evidence',
        409
      );
    }

    const byNonce = decodeAdmission(this.db.prepare(`
      SELECT *
      FROM context_authority_evidence_admissions
      WHERE issuer_principal_ref = ? AND issuer_nonce = ?
    `).get(verified.issuer_principal_ref, verified.nonce));
    if (byNonce) {
      if (
        byNonce.evidence_id === verified.evidence_id
        && byNonce.envelope_sha256 === verified.envelope_sha256
      ) {
        return byNonce;
      }
      throw new AxiomError(
        'context_authority_evidence_nonce_replay',
        'This issuer nonce is already bound to previously admitted evidence',
        409
      );
    }

    const signedEvidence = cloneCanonical(
      envelope,
      'Context authority signed evidence'
    );
    const payload = Object.freeze({
      schema: CONTEXT_AUTHORITY_EVIDENCE_ADMISSION_SCHEMA,
      evidence_id: verified.evidence_id,
      evidence_type: verified.evidence_type,
      issuer_principal_ref: verified.issuer_principal_ref,
      issuer_nonce: verified.nonce,
      key_id: verified.key_id,
      payload_sha256: verified.payload_sha256,
      envelope_sha256: verified.envelope_sha256,
      issued_at: verified.issued_at,
      expires_at: verified.expires_at,
      admitted_by: actor,
      signed_evidence: signedEvidence,
      authority_effect: 'none',
      grants_vault_access: false,
      grants_execution_authority: false
    });

    const [event] = this.appendEvents({
      traceId,
      actor,
      events: [{
        kind: CONTEXT_AUTHORITY_EVIDENCE_ADMITTED_EVENT,
        subject: verified.evidence_id,
        payload
      }]
    });

    const admitted = this.getContextAuthorityEvidenceAdmission(
      verified.evidence_id
    );
    if (!admitted || admitted.admitted_event_id !== event.event_id) {
      throw new ValidationError(
        'Context authority evidence admission did not materialize'
      );
    }
    return admitted;
  }

  assertContextAuthorityEvidenceAdmitted(envelope, {
    now = Date.now()
  } = {}) {
    const verified = verifyContextAuthorityEvidence(envelope, {
      trustPins: this.contextAuthorityTrustPins,
      now,
      maxEvidenceLifetimeSeconds:
        this.contextAuthorityMaxEvidenceLifetimeSeconds
    });
    const admitted = this.getContextAuthorityEvidenceAdmission(
      verified.evidence_id
    );
    if (!admitted) {
      throw new AxiomError(
        'context_authority_evidence_not_admitted',
        'Signed context authority evidence has not been admitted',
        409
      );
    }
    if (admitted.envelope_sha256 !== verified.envelope_sha256) {
      throw new AxiomError(
        'context_authority_evidence_binding_mismatch',
        'Admitted evidence_id is bound to different signed evidence',
        409
      );
    }
    if (
      admitted.issuer_principal_ref !== verified.issuer_principal_ref
      || admitted.issuer_nonce !== verified.nonce
    ) {
      throw new AxiomError(
        'context_authority_evidence_binding_mismatch',
        'Admitted evidence issuer binding does not match signed evidence',
        409
      );
    }
    return admitted;
  }
}

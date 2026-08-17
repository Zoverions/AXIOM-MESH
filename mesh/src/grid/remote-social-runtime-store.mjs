import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_ACTION,
  REMOTE_SOCIAL_ADMISSION_DATA_SCOPE,
  REMOTE_SOCIAL_ADMISSION_PURPOSE,
  assertRemoteSocialAdmissionIntentMatchesStage,
  normalizeRemoteSocialAdmissionIntentInput,
  remoteSocialAdmissionIntentInputFromStage
} from '../lib/remote-social-admission-authority.mjs';
import { verifySocialExchangePackage } from '../lib/social-exchange-package.mjs';
import { RemoteSocialAbuseGridStore } from './remote-social-abuse-store.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_EVENT,
  REMOTE_SOCIAL_OBSERVATION_SCHEMA,
  buildRemoteSocialAdmissionRequest
} from './remote-social-admission-store.mjs';

export const REMOTE_SOCIAL_RUNTIME_ADMISSION_EVENT = 'remote.social.admitted.runtime';
export const REMOTE_SOCIAL_RUNTIME_ADMISSION_SCHEMA = 'axiom-remote-social-admission.v2';
export const REMOTE_SOCIAL_RUNTIME_STORE_SCHEMA = 'axiom-remote-social-runtime-store.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const TRUST_LABEL = /^[a-z][a-z0-9._-]{0,63}$/;

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function exactKeys(value, keys, label) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function normalizeIntentBinding(bindingInput) {
  const binding = assertPlainObject(bindingInput, 'remote social admission intent binding');
  const fields = ['action', 'input', 'purpose', 'data_scopes'];
  exactKeys(binding, fields, 'remote social admission intent binding');
  if (binding.action !== REMOTE_SOCIAL_ADMISSION_ACTION) {
    throw new ValidationError('remote social admission intent binding action is invalid');
  }
  if (binding.purpose !== REMOTE_SOCIAL_ADMISSION_PURPOSE) {
    throw new ValidationError('remote social admission intent binding purpose is invalid');
  }
  if (
    !Array.isArray(binding.data_scopes)
    || binding.data_scopes.length !== 1
    || binding.data_scopes[0] !== REMOTE_SOCIAL_ADMISSION_DATA_SCOPE
  ) {
    throw new ValidationError('remote social admission intent binding data scope is invalid');
  }
  return Object.freeze({
    action: REMOTE_SOCIAL_ADMISSION_ACTION,
    input: normalizeRemoteSocialAdmissionIntentInput(binding.input),
    purpose: REMOTE_SOCIAL_ADMISSION_PURPOSE,
    data_scopes: Object.freeze([REMOTE_SOCIAL_ADMISSION_DATA_SCOPE])
  });
}

function normalizeAdmittedObjects(input) {
  const value = assertPlainObject(input, 'remote social admitted objects');
  const keys = ['persona_projection_digests', 'publication_digests', 'transition_digests'];
  exactKeys(value, keys, 'remote social admitted objects');
  return Object.freeze({
    persona_projection_digests: normalizeDigestArray(
      value.persona_projection_digests,
      'remote social persona projection digests'
    ),
    publication_digests: normalizeDigestArray(
      value.publication_digests,
      'remote social publication digests'
    ),
    transition_digests: normalizeDigestArray(
      value.transition_digests,
      'remote social transition digests'
    )
  });
}

function normalizeDigestArray(input, label) {
  if (!Array.isArray(input) || input.length > 512) {
    throw new ValidationError(`${label} must contain at most 512 items`);
  }
  const values = input.map((value, index) => digest(value, `${label}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new ValidationError(`${label} contains duplicate digests`);
  }
  return Object.freeze(values);
}

export class RemoteSocialRuntimeGridStore extends RemoteSocialAbuseGridStore {
  getStatus() {
    return {
      ...super.getStatus(),
      remote_social_runtime_store: Object.freeze({
        schema: REMOTE_SOCIAL_RUNTIME_STORE_SCHEMA,
        activation_state: 'opt-in-local-laboratory',
        runtime_admission_schema: REMOTE_SOCIAL_RUNTIME_ADMISSION_SCHEMA,
        intent_authority_binding: 'ordinary-intent-request-digest',
        resolved_materialization_binding: 's3d-resolved-request-digest',
        requester_principal_type: 'human',
        independent_approval_required: true,
        approval_consumption: 'atomic-with-admission',
        network_egress: false,
        transport_included: false,
        public_routes: false,
        automatic_admission: false,
        automatic_follow: false,
        automatic_federation: false
      })
    };
  }

  appendEvents({ traceId, actor, events }) {
    if (Array.isArray(events)) {
      for (const event of events) {
        if (event?.kind === REMOTE_SOCIAL_RUNTIME_ADMISSION_EVENT) {
          validateRuntimeAdmissionEvent(event, actor);
        }
      }
    }
    return super.appendEvents({ traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (
      this.remoteSocialAdmissionReady
      && event.kind === REMOTE_SOCIAL_RUNTIME_ADMISSION_EVENT
    ) {
      this.materializeRuntimeAdmission(event);
    }
  }

  rebuildRemoteSocialAdmissionState() {
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE kind IN (?, ?)
      ORDER BY seq
    `).all(REMOTE_SOCIAL_ADMISSION_EVENT, REMOTE_SOCIAL_RUNTIME_ADMISSION_EVENT);
    this.transaction(() => {
      this.db.exec('DELETE FROM remote_social_admission_objects');
      this.db.exec('DELETE FROM remote_social_observations');
      this.db.exec('DELETE FROM remote_social_admissions');
      for (const row of rows) {
        const event = this.decodeEventRow(row);
        if (event.kind === REMOTE_SOCIAL_ADMISSION_EVENT) {
          super.materializeRemoteSocialAdmission(event);
        } else {
          this.materializeRuntimeAdmission(event);
        }
      }
    });
  }

  admitRemoteSocialStageWithIntent({
    owner,
    stageId,
    intent: intentInput,
    intentId,
    approvalId,
    traceId,
    now = Date.now()
  }) {
    const recipient = id(owner, 'remote social runtime admission owner');
    const stage = this.getRemoteSocialStage(recipient, stageId);
    const intent = assertPlainObject(intentInput, 'remote social runtime admission intent');
    const principal = assertPlainObject(intent.principal, 'remote social runtime admission principal');
    if (principal.type !== 'human' || principal.id !== recipient) {
      throw new AxiomError(
        'remote_social_runtime_admission_principal_unavailable',
        'Remote social runtime admission currently requires the exact human owner principal',
        409
      );
    }
    const intentIdentifier = id(intentId, 'remote social runtime admission intent_id');
    const approval = id(approvalId, 'remote social runtime admission approval_id');
    id(traceId, 'remote social runtime admission trace_id');

    const intentAuthority = assertRemoteSocialAdmissionIntentMatchesStage(intent, stage);
    const intentBinding = normalizeIntentBinding(intentAuthority.binding);
    const intentRequestDigest = digest(
      intentAuthority.intent_request_digest,
      'remote social runtime admission intent_request_digest'
    );
    if (digestObject(intentBinding) !== intentRequestDigest) {
      throw new ValidationError('remote social runtime admission intent binding digest mismatch');
    }

    const { request, request_digest: requestDigest } =
      buildRemoteSocialAdmissionRequest(stage);
    if (requestDigest === intentRequestDigest) {
      throw new ValidationError('remote social admission intent and materialization digests must remain distinct');
    }

    const admissionId = `remote_admission_${digestObject({
      schema: REMOTE_SOCIAL_RUNTIME_ADMISSION_SCHEMA,
      owner: recipient,
      stage_id: stage.stage_id,
      request_digest: requestDigest,
      intent_request_digest: intentRequestDigest
    })}`;

    const existing = this.db.prepare(`
      SELECT * FROM remote_social_admissions WHERE stage_id = ?
    `).get(stage.stage_id);
    if (existing) {
      const decoded = this.decodeAdmission(existing);
      if (
        decoded.admission_id !== admissionId
        || decoded.intent_id !== intentIdentifier
        || decoded.approval_id !== approval
        || decoded.request_digest !== requestDigest
        || decoded.summary_json?.intent_request_digest !== intentRequestDigest
      ) {
        throw new AxiomError(
          'remote_social_admission_conflict',
          'The staged remote package was already admitted under different authority',
          409
        );
      }
      return decoded;
    }

    const expiresAt = new Date(stage.import_plan_json.expires_at).valueOf();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      throw new AxiomError(
        'remote_social_import_plan_expired',
        'The remote social review plan has expired',
        409
      );
    }

    const intentRow = this.db.prepare(`
      SELECT intent_id, principal, action, status, request_digest
      FROM intents WHERE intent_id = ?
    `).get(intentIdentifier);
    if (
      !intentRow
      || intentRow.principal !== recipient
      || intentRow.action !== REMOTE_SOCIAL_ADMISSION_ACTION
      || intentRow.request_digest !== intentRequestDigest
      || intentRow.status !== 'accepted'
    ) {
      throw new AxiomError(
        'remote_social_admission_intent_unavailable',
        'An accepted intent bound to the exact remote social admission intent request is required',
        409
      );
    }

    const approvalRow = this.db.prepare(`
      SELECT * FROM approvals WHERE approval_id = ?
    `).get(approval);
    if (
      !approvalRow
      || approvalRow.status !== 'active'
      || approvalRow.requester !== recipient
      || approvalRow.approver === recipient
      || approvalRow.action !== REMOTE_SOCIAL_ADMISSION_ACTION
      || approvalRow.request_digest !== intentRequestDigest
      || new Date(approvalRow.expires_at).valueOf() <= now
    ) {
      throw new AxiomError(
        'remote_social_admission_approval_unavailable',
        'An active independent approval bound to the exact remote social admission intent request is required',
        409
      );
    }

    const payload = Object.freeze({
      schema: REMOTE_SOCIAL_RUNTIME_ADMISSION_SCHEMA,
      admission_id: admissionId,
      owner: recipient,
      stage_id: stage.stage_id,
      package_digest: stage.package_digest,
      exporter_grid_id: stage.exporter_grid_id,
      exporter_key_id: stage.exporter_key_id,
      intent_id: intentIdentifier,
      approval_id: approval,
      intent_binding: intentBinding,
      intent_request_digest: intentRequestDigest,
      request_digest: requestDigest,
      import_plan_digest: stage.import_plan_json.plan_digest,
      trust_label: stage.trust_label,
      admitted_objects: request.admitted_objects,
      remote_observation_only: true,
      local_authorship_claimed: false,
      network_effect: 'none',
      authority_effect: 'none'
    });

    this.appendEvents({
      traceId,
      actor: recipient,
      events: [
        {
          kind: 'approval.consumed',
          subject: approval,
          payload: {
            approval_id: approval,
            intent_id: intentIdentifier
          }
        },
        {
          kind: REMOTE_SOCIAL_RUNTIME_ADMISSION_EVENT,
          subject: admissionId,
          payload
        }
      ]
    });

    return this.getRemoteSocialAdmission(recipient, admissionId);
  }

  materializeRuntimeAdmission(event) {
    const payload = validateRuntimeAdmissionEvent(event, event.actor);
    const stage = this.getRemoteSocialStage(payload.owner, payload.stage_id);
    const verified = verifySocialExchangePackage(stage.package_json, {
      trustedExporterPublicKey: stage.trusted_exporter_json.public_key,
      expectedExporterGridId: stage.exporter_grid_id,
      now: new Date(event.occurred_at).valueOf()
    });
    const { request, request_digest: requestDigest } =
      buildRemoteSocialAdmissionRequest(stage);
    const expectedInput = remoteSocialAdmissionIntentInputFromStage(stage);

    if (
      verified.package_digest !== payload.package_digest
      || stage.package_digest !== payload.package_digest
      || stage.exporter_grid_id !== payload.exporter_grid_id
      || stage.exporter_key_id !== payload.exporter_key_id
      || stage.import_plan_json.plan_digest !== payload.import_plan_digest
      || stage.trust_label !== payload.trust_label
      || requestDigest !== payload.request_digest
      || canonicalJson(request.admitted_objects) !== canonicalJson(payload.admitted_objects)
      || canonicalJson(expectedInput) !== canonicalJson(payload.intent_binding.input)
      || digestObject(payload.intent_binding) !== payload.intent_request_digest
      || payload.intent_request_digest === payload.request_digest
    ) {
      throw new ValidationError('remote social runtime admission event does not match the exact staged review and intent authority');
    }

    const intentRow = this.db.prepare(`
      SELECT intent_id, principal, action, status, request_digest
      FROM intents WHERE intent_id = ?
    `).get(payload.intent_id);
    if (
      !intentRow
      || intentRow.principal !== payload.owner
      || intentRow.action !== REMOTE_SOCIAL_ADMISSION_ACTION
      || intentRow.request_digest !== payload.intent_request_digest
      || !['accepted', 'completed'].includes(intentRow.status)
    ) {
      throw new ValidationError('remote social runtime admission intent evidence is unavailable or mismatched');
    }

    const approval = this.db.prepare(`
      SELECT * FROM approvals WHERE approval_id = ?
    `).get(payload.approval_id);
    if (
      !approval
      || approval.requester !== payload.owner
      || approval.approver === payload.owner
      || approval.action !== REMOTE_SOCIAL_ADMISSION_ACTION
      || approval.request_digest !== payload.intent_request_digest
      || approval.status !== 'consumed'
      || approval.consumed_by_intent !== payload.intent_id
    ) {
      throw new ValidationError('remote social runtime admission requires consumed matching independent approval evidence');
    }

    const existing = this.db.prepare(`
      SELECT admission_id FROM remote_social_admissions WHERE stage_id = ?
    `).get(payload.stage_id);
    if (existing) {
      if (existing.admission_id !== payload.admission_id) {
        throw new ValidationError('remote social stage has conflicting admission history');
      }
      return;
    }

    const observationEntries = [
      ...verified.personas.map(object => ({
        kind: 'persona',
        digest: object.projection_digest,
        object
      })),
      ...verified.publications.map(object => ({
        kind: 'publication',
        digest: object.projection_digest,
        object
      })),
      ...verified.transitions.map(object => ({
        kind: 'transition',
        digest: object.transition_digest,
        object
      }))
    ];
    const summary = Object.freeze({
      package_digest: payload.package_digest,
      exporter_grid_id: payload.exporter_grid_id,
      exporter_key_id: payload.exporter_key_id,
      intent_request_digest: payload.intent_request_digest,
      resolved_request_digest: payload.request_digest,
      observation_counts: {
        personas: verified.personas.length,
        publications: verified.publications.length,
        transitions: verified.transitions.length
      },
      remote_observation_only: true,
      local_authorship_claimed: false,
      network_effect: 'none',
      authority_effect: 'none'
    });

    this.db.prepare(`
      INSERT INTO remote_social_admissions(
        admission_id, owner, stage_id, package_digest, exporter_grid_id,
        exporter_key_id, intent_id, approval_id, request_digest,
        import_plan_digest, trust_label, summary_json, status, admitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admitted', ?)
    `).run(
      payload.admission_id,
      payload.owner,
      payload.stage_id,
      payload.package_digest,
      payload.exporter_grid_id,
      payload.exporter_key_id,
      payload.intent_id,
      payload.approval_id,
      payload.request_digest,
      payload.import_plan_digest,
      payload.trust_label,
      this.protectJson(
        'remote_social_admissions',
        'summary_json',
        payload.admission_id,
        summary
      ),
      event.occurred_at
    );

    for (const entry of observationEntries) {
      const observationId = `remote_observation_${digestObject({
        schema: REMOTE_SOCIAL_OBSERVATION_SCHEMA,
        owner: payload.owner,
        exporter_key_id: payload.exporter_key_id,
        object_kind: entry.kind,
        object_digest: entry.digest
      })}`;
      const existingObservation = this.db.prepare(`
        SELECT * FROM remote_social_observations WHERE observation_id = ?
      `).get(observationId);
      if (!existingObservation) {
        this.db.prepare(`
          INSERT INTO remote_social_observations(
            observation_id, owner, exporter_grid_id, exporter_key_id,
            object_kind, object_digest, object_json, first_admission_id, observed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          observationId,
          payload.owner,
          payload.exporter_grid_id,
          payload.exporter_key_id,
          entry.kind,
          entry.digest,
          this.protectJson(
            'remote_social_observations',
            'object_json',
            observationId,
            entry.object
          ),
          payload.admission_id,
          event.occurred_at
        );
      } else {
        const decoded = this.openJson(
          'remote_social_observations',
          'object_json',
          observationId,
          existingObservation.object_json
        );
        if (canonicalJson(decoded) !== canonicalJson(entry.object)) {
          throw new ValidationError('remote social observation digest aliases different content');
        }
      }
      this.db.prepare(`
        INSERT INTO remote_social_admission_objects(admission_id, observation_id)
        VALUES (?, ?)
      `).run(payload.admission_id, observationId);
    }
  }
}

function validateRuntimeAdmissionEvent(eventInput, actor) {
  const event = assertPlainObject(eventInput, 'remote social runtime admission event');
  const payload = assertPlainObject(event.payload, 'remote social runtime admission payload');
  const fields = [
    'schema', 'admission_id', 'owner', 'stage_id', 'package_digest',
    'exporter_grid_id', 'exporter_key_id', 'intent_id', 'approval_id',
    'intent_binding', 'intent_request_digest', 'request_digest',
    'import_plan_digest', 'trust_label', 'admitted_objects',
    'remote_observation_only', 'local_authorship_claimed', 'network_effect',
    'authority_effect'
  ];
  exactKeys(payload, fields, 'remote social runtime admission payload');
  if (payload.schema !== REMOTE_SOCIAL_RUNTIME_ADMISSION_SCHEMA) {
    throw new ValidationError('unsupported remote social runtime admission schema');
  }
  const normalized = Object.freeze({
    schema: REMOTE_SOCIAL_RUNTIME_ADMISSION_SCHEMA,
    admission_id: id(payload.admission_id, 'remote social runtime admission admission_id'),
    owner: id(payload.owner, 'remote social runtime admission owner'),
    stage_id: id(payload.stage_id, 'remote social runtime admission stage_id'),
    package_digest: digest(payload.package_digest, 'remote social runtime admission package_digest'),
    exporter_grid_id: id(payload.exporter_grid_id, 'remote social runtime admission exporter_grid_id'),
    exporter_key_id: digest(payload.exporter_key_id, 'remote social runtime admission exporter_key_id'),
    intent_id: id(payload.intent_id, 'remote social runtime admission intent_id'),
    approval_id: id(payload.approval_id, 'remote social runtime admission approval_id'),
    intent_binding: normalizeIntentBinding(payload.intent_binding),
    intent_request_digest: digest(
      payload.intent_request_digest,
      'remote social runtime admission intent_request_digest'
    ),
    request_digest: digest(payload.request_digest, 'remote social runtime admission request_digest'),
    import_plan_digest: digest(
      payload.import_plan_digest,
      'remote social runtime admission import_plan_digest'
    ),
    trust_label: assertString(payload.trust_label, 'remote social runtime admission trust_label', {
      min: 1,
      max: 64,
      pattern: TRUST_LABEL
    }),
    admitted_objects: normalizeAdmittedObjects(payload.admitted_objects),
    remote_observation_only: payload.remote_observation_only,
    local_authorship_claimed: payload.local_authorship_claimed,
    network_effect: payload.network_effect,
    authority_effect: payload.authority_effect
  });
  if (
    normalized.remote_observation_only !== true
    || normalized.local_authorship_claimed !== false
    || normalized.network_effect !== 'none'
    || normalized.authority_effect !== 'none'
  ) {
    throw new ValidationError('remote social runtime admission must remain observation-only and non-authorizing');
  }
  if (normalized.owner !== actor) {
    throw new ValidationError('remote social runtime admission owner must match the event actor');
  }
  if (event.subject !== normalized.admission_id) {
    throw new ValidationError('remote social runtime admission event subject must equal admission_id');
  }
  if (digestObject(normalized.intent_binding) !== normalized.intent_request_digest) {
    throw new ValidationError('remote social runtime admission intent binding digest mismatch');
  }
  if (normalized.intent_request_digest === normalized.request_digest) {
    throw new ValidationError('remote social runtime admission authority digests must remain distinct');
  }
  return normalized;
}

import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson
} from '../lib/canonical.mjs';

export const REMOTE_SOCIAL_REVIEW_SCHEMA = 'axiom-remote-social-review.v1';

const OWNER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const MAX_RESPONSE_BYTES = 524_288;
const DEFAULT_LIMITS = Object.freeze({
  stages: 20,
  admissions: 50,
  observations: 100,
  follows: 100,
  retention_receipts: 50
});
const MAX_LIMITS = Object.freeze({
  stages: 50,
  admissions: 100,
  observations: 200,
  follows: 200,
  retention_receipts: 100
});
const FORBIDDEN_KEYS = new Set([
  'trusted_exporter_json',
  'package_json',
  'attestation',
  'signature',
  'controller_actor_id',
  'selective_link_commitment',
  'delegation_authority_digest',
  'source_read_token',
  'sourceReadToken',
  'authorization',
  'private_key',
  'transport_job',
  'transport_jobs',
  'ranking_score',
  'reputation_score'
]);

export function buildRemoteSocialReviewProjection(store, owner, {
  limits = DEFAULT_LIMITS
} = {}) {
  const recipient = assertString(owner, 'remote social review owner', {
    min: 1,
    max: 160,
    pattern: OWNER
  });
  requireReviewStore(store);
  const bounded = normalizeLimits(limits);

  const staged = store.listRemoteSocialStages(recipient, { limit: bounded.stages });
  const admissions = store.listRemoteSocialAdmissions(recipient, {
    limit: bounded.admissions
  });
  const observations = store.listRemoteSocialObservations(recipient, {
    limit: bounded.observations
  });
  const follows = store.listRemoteSocialFollows(recipient, { limit: bounded.follows });
  const retention = store.getRemoteSocialRetentionAssessment(recipient);
  const retentionReceipts = store.listRemoteSocialRetentionReceipts(recipient, {
    limit: bounded.retention_receipts
  });

  assertOwnedRecords(staged.stages, recipient, 'stage');
  assertOwnedRecords(admissions.admissions, recipient, 'admission');
  assertOwnedRecords(observations.observations, recipient, 'observation');
  assertOwnedRecords(follows.follows, recipient, 'follow');
  assertOwnedRecords(retentionReceipts.receipts, recipient, 'retention receipt');
  if (retention.owner !== recipient) {
    throw new ValidationError('remote social review retention owner binding is invalid');
  }

  const projection = Object.freeze({
    schema: REMOTE_SOCIAL_REVIEW_SCHEMA,
    owner: recipient,
    activation_scope: 'local-read-only-review',
    stages: Object.freeze(staged.stages.map(projectStage)),
    stages_truncated: Boolean(staged.truncated),
    admissions: Object.freeze(admissions.admissions.map(projectAdmission)),
    admissions_truncated: Boolean(admissions.truncated),
    observations: Object.freeze(observations.observations.map(projectObservation)),
    observations_truncated: Boolean(observations.truncated),
    follows: Object.freeze(follows.follows.map(projectFollow)),
    follows_truncated: Boolean(follows.truncated),
    retention: projectRetention(retention),
    retention_receipts: Object.freeze(
      retentionReceipts.receipts.map(projectRetentionReceipt)
    ),
    retention_receipts_truncated: Boolean(retentionReceipts.truncated),
    exporter_attestation_is_identity_proof: false,
    exporter_attestation_is_content_truth_proof: false,
    local_admission_is_authorship_proof: false,
    transport_state_included: false,
    ranking_state_included: false,
    mutation_effect: 'none',
    network_effect: 'none',
    recommendation_effect: 'none',
    authority_effect: 'none'
  });

  assertSafeProjection(projection, recipient);
  const bytes = Buffer.byteLength(canonicalJson(projection), 'utf8');
  if (bytes > MAX_RESPONSE_BYTES) {
    throw new AxiomError(
      'remote_social_review_response_too_large',
      'Remote social review projection exceeds the bounded response size',
      409,
      { bytes, maximum_bytes: MAX_RESPONSE_BYTES }
    );
  }
  const result = Object.freeze({ ...projection, response_bytes: bytes });
  if (Buffer.byteLength(canonicalJson(result), 'utf8') > MAX_RESPONSE_BYTES) {
    throw new AxiomError(
      'remote_social_review_response_too_large',
      'Remote social review projection exceeds the bounded response size',
      409,
      { maximum_bytes: MAX_RESPONSE_BYTES }
    );
  }
  return result;
}

function projectStage(stage) {
  const plan = assertPlainObject(stage.import_plan_json, 'remote social review import plan');
  const admitted = assertPlainObject(plan.admitted_objects, 'remote social review admitted objects');
  return Object.freeze({
    stage_id: stage.stage_id,
    package_digest: stage.package_digest,
    exporter_grid_id: stage.exporter_grid_id,
    exporter_key_id: stage.exporter_key_id,
    trust_label: stage.trust_label,
    import_plan_digest: plan.plan_digest,
    review_status: plan.status,
    requires_operator_approval: plan.requires_operator_approval,
    object_counts: Object.freeze({
      personas: countArray(admitted.persona_projection_digests),
      publications: countArray(admitted.publication_digests),
      transitions: countArray(admitted.transition_digests)
    }),
    created_at: stage.created_at,
    expires_at: stage.expires_at,
    materialization_effect: 'none',
    authority_effect: 'none'
  });
}

function projectAdmission(admission) {
  const admitted = admission.summary_json?.admitted_objects ?? {};
  return Object.freeze({
    admission_id: admission.admission_id,
    stage_id: admission.stage_id,
    package_digest: admission.package_digest,
    exporter_grid_id: admission.exporter_grid_id,
    exporter_key_id: admission.exporter_key_id,
    intent_id: admission.intent_id,
    approval_id: admission.approval_id,
    request_digest: admission.request_digest,
    import_plan_digest: admission.import_plan_digest,
    trust_label: admission.trust_label,
    object_counts: Object.freeze({
      personas: countArray(admitted.persona_projection_digests),
      publications: countArray(admitted.publication_digests),
      transitions: countArray(admitted.transition_digests)
    }),
    status: admission.status,
    admitted_at: admission.admitted_at,
    remote_observation_only: true,
    local_authorship_claimed: false,
    authority_effect: 'none'
  });
}

function projectObservation(observation) {
  const object = assertPlainObject(
    observation.object_json,
    'remote social review observation object'
  );
  const common = {
    observation_id: observation.observation_id,
    exporter_grid_id: observation.exporter_grid_id,
    exporter_key_id: observation.exporter_key_id,
    object_kind: observation.object_kind,
    object_digest: observation.object_digest,
    first_admission_id: observation.first_admission_id,
    observed_at: observation.observed_at,
    remote_observation_only: true,
    local_authorship_claimed: false
  };
  if (observation.object_kind === 'persona') {
    return Object.freeze({
      ...common,
      persona_id: object.persona_id,
      attribution_mode: object.attribution_mode,
      public_actor_link: object.public_actor_link,
      persona_status: object.status,
      authority_effect: 'none'
    });
  }
  if (observation.object_kind === 'publication') {
    return Object.freeze({
      ...common,
      publication_id: object.publication_id,
      persona_id: object.persona_id,
      persona_projection_digest: object.persona_projection_digest,
      attribution_mode: object.attribution_mode,
      public_actor_link: object.public_actor_link,
      media_type: object.content?.media_type ?? null,
      text_preview: safeTextPreview(object.content),
      discoverability: object.discoverability,
      authorship_mode: object.authorship_mode,
      created_at: object.created_at,
      supersedes_digest: object.supersedes_digest,
      authority_effect: 'none'
    });
  }
  if (observation.object_kind === 'transition') {
    return Object.freeze({
      ...common,
      action: object.action,
      publication_digest: object.publication_digest,
      persona_id: object.persona_id,
      persona_projection_digest: object.persona_projection_digest,
      reason_code: object.reason_code,
      occurred_at: object.occurred_at,
      third_party_deletion_claimed: false,
      authority_effect: 'none'
    });
  }
  throw new ValidationError('remote social review observation kind is unsupported');
}

function projectFollow(follow) {
  const trust = assertPlainObject(follow.trust_json, 'remote social review follow trust');
  if (
    trust.trust_scope !== 'exporter-attestation-only'
    || trust.content_truth_claimed !== false
    || trust.legal_identity_claimed !== false
    || trust.actor_authorship_claimed !== false
  ) {
    throw new ValidationError('remote social review follow trust exceeds the allowed scope');
  }
  return Object.freeze({
    follow_id: follow.follow_id,
    exporter_grid_id: follow.exporter_grid_id,
    exporter_key_id: follow.exporter_key_id,
    persona_projection_digest: follow.persona_projection_digest,
    persona_observation_id: follow.persona_observation_id,
    owner_trust_label: trust.owner_trust_label,
    trust_scope: 'exporter-attestation-only',
    content_truth_claimed: false,
    legal_identity_claimed: false,
    actor_authorship_claimed: false,
    status: follow.status,
    followed_at: follow.followed_at,
    unfollowed_at: follow.unfollowed_at,
    private_local_preference: true,
    recommendation_effect: 'none',
    authority_effect: 'none'
  });
}

function projectRetention(retention) {
  return Object.freeze({
    policy: retention.policy,
    stage_count: retention.stage_count,
    stage_protected_bytes: retention.stage_protected_bytes,
    admission_count: retention.admission_count,
    observation_count: retention.observation_count,
    observation_protected_bytes: retention.observation_protected_bytes,
    retention_receipt_count: retention.retention_receipt_count,
    expired_unadmitted_stage_count: retention.expired_unadmitted_stage_count,
    expired_unadmitted_protected_bytes: retention.expired_unadmitted_protected_bytes,
    violations: retention.violations,
    within_policy: retention.within_policy,
    authority_effect: 'none'
  });
}

function projectRetentionReceipt(receipt) {
  return Object.freeze({
    receipt_id: receipt.receipt_id,
    action: receipt.action,
    stage_id: receipt.stage_id,
    package_digest: receipt.package_digest,
    exporter_grid_id: receipt.exporter_grid_id,
    exporter_key_id: receipt.exporter_key_id,
    import_plan_digest: receipt.import_plan_digest,
    stage_created_at: receipt.stage_created_at,
    stage_expires_at: receipt.stage_expires_at,
    logical_bytes_reclaimed: receipt.logical_bytes_reclaimed,
    protected_bytes_reclaimed: receipt.protected_bytes_reclaimed,
    reason_code: receipt.reason_code,
    occurred_at: receipt.occurred_at,
    payload_deleted: true,
    admission_evidence_deleted: false,
    authority_effect: 'none'
  });
}

function normalizeLimits(input) {
  const value = assertPlainObject(input, 'remote social review limits');
  const output = {};
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    output[key] = boundedInteger(
      value[key] ?? DEFAULT_LIMITS[key],
      `remote social review ${key} limit`,
      1,
      MAX_LIMITS[key]
    );
  }
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) {
      throw new ValidationError(`remote social review limits contain unsupported field ${key}`);
    }
  }
  return Object.freeze(output);
}

function requireReviewStore(store) {
  if (!store || typeof store !== 'object') {
    throw new ValidationError('remote social review store is required');
  }
  for (const method of [
    'listRemoteSocialStages',
    'listRemoteSocialAdmissions',
    'listRemoteSocialObservations',
    'listRemoteSocialFollows',
    'getRemoteSocialRetentionAssessment',
    'listRemoteSocialRetentionReceipts'
  ]) {
    if (typeof store[method] !== 'function') {
      throw new ValidationError(`remote social review store is missing ${method}`);
    }
  }
}

function assertOwnedRecords(records, owner, label) {
  if (!Array.isArray(records)) {
    throw new ValidationError(`remote social review ${label} records are invalid`);
  }
  for (const record of records) {
    if (!record || record.owner !== owner) {
      throw new ValidationError(`remote social review ${label} owner binding is invalid`);
    }
  }
}

function safeTextPreview(content) {
  if (!content || content.media_type !== 'text/plain' || typeof content.text !== 'string') {
    return null;
  }
  return content.text.length <= 280 ? content.text : `${content.text.slice(0, 279)}…`;
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function boundedInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function assertSafeProjection(projection, owner) {
  if (projection.owner !== owner) {
    throw new ValidationError('remote social review projection owner binding is invalid');
  }
  inspectKeys(projection);
}

function inspectKeys(value) {
  if (Array.isArray(value)) {
    for (const item of value) inspectKeys(item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new ValidationError(
        `remote social review projection exposes forbidden field: ${key}`
      );
    }
    inspectKeys(item);
  }
}

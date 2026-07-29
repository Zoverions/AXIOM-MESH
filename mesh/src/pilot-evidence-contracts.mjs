import { canonicalJson, ValidationError } from './lib/canonical.mjs';
import {
  PILOT_CUSTODY_CONTROLS,
  PILOT_EVIDENCE_TYPES
} from './pilot-dossier.mjs';

export const PILOT_EVIDENCE_DETAIL_CONTRACT_VERSION = 2;

const IDENTIFIER = /^[a-z][a-z0-9_-]{2,95}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SERVICE_UNITS = Object.freeze([
  'gateway',
  'grid',
  'hypervisor',
  'sandbox'
]);
const SECURITY_REVIEW_SCOPE = Object.freeze([
  'container_policy',
  'kernel',
  'pilot_evidence_intake',
  'provider_boundary'
]);

export function validatePilotEvidenceDetails({
  type,
  details,
  dossier,
  policy,
  metadata
}) {
  if (!PILOT_EVIDENCE_TYPES.includes(type)) {
    throw new ValidationError(`Pilot evidence detail type is unsupported: ${type}`);
  }
  const context = { details, dossier, policy, metadata, type };
  const validators = {
    deployment_manifest: validateDeploymentManifest,
    image_provenance: validateImageProvenance,
    availability_observation: validateAvailabilityObservation,
    capacity_measurement: validateCapacityMeasurement,
    external_telemetry: validateExternalTelemetry,
    provider_assessment: validateProviderAssessment,
    custody_assessment: validateCustodyAssessment,
    scheduled_restore: validateScheduledRestore,
    credential_rotation: validateCredentialRotation,
    data_key_rotation: validateDataKeyRotation,
    credential_history_attestations: validateCredentialHistoryAttestations,
    incident_tabletop: validateIncidentTabletop,
    independent_security_review: validateIndependentSecurityReview
  };
  validators[type](context);
  return {
    valid: true,
    type,
    contract_version: PILOT_EVIDENCE_DETAIL_CONTRACT_VERSION
  };
}

function validateDeploymentManifest({ details, dossier, type }) {
  const keys = [
    'environment',
    'platform',
    'region',
    'topology',
    'service_units',
    'non_public',
    'public_ingress',
    'deny_egress',
    'resource_limits_enforced',
    'pilot_owned_receivers',
    'actual_provider_adapter',
    'scheduled_restore_from_pilot_media'
  ];
  exactObject(details, type, keys);
  const expected = Object.fromEntries(keys.map(key => [
    key,
    dossier.deployment[key]
  ]));
  requireSame(details, expected, type);
}

function validateImageProvenance({ details, dossier, type }) {
  exactObject(details, type, [
    'source_revision',
    'image_digest',
    'source_archive_sha256',
    'sbom_sha256',
    'provenance_sha256',
    'container_manifest_sha256',
    'reproducible_source_verified',
    'image_signature_verified'
  ]);
  const digests = [
    details.source_archive_sha256,
    details.sbom_sha256,
    details.provenance_sha256,
    details.container_manifest_sha256
  ];
  if (
    details.source_revision !== dossier.build.source_revision
    || details.image_digest !== dossier.build.image_digest
    || digests.some(value => !DIGEST.test(value ?? ''))
    || new Set(digests).size !== digests.length
    || details.reproducible_source_verified !== true
    || details.image_signature_verified !== true
  ) invalid(type);
}

function validateAvailabilityObservation({ details, dossier, type }) {
  exactObject(details, type, [
    'started_at',
    'ended_at',
    'duration_hours',
    'continuous',
    'availability_percent',
    'successful_intents',
    'failed_intents',
    'acknowledged_mutation_evidence_loss'
  ]);
  requireSame(details, {
    ...dossier.observation,
    availability_percent: dossier.measurements.availability_percent,
    successful_intents: dossier.measurements.successful_intents,
    failed_intents: dossier.measurements.failed_intents,
    acknowledged_mutation_evidence_loss:
      dossier.measurements.acknowledged_mutation_evidence_loss
  }, type);
}

function validateCapacityMeasurement({ details, dossier, type }) {
  exactObject(details, type, [
    'profile_id',
    'peak_concurrency',
    'successful_intents',
    'failed_intents',
    'p95_intent_latency_ms',
    'resource_limits_enforced',
    'overload_rejection_verified',
    'dependency_loss_recovery_verified',
    'saturation_within_limits'
  ]);
  if (
    !IDENTIFIER.test(details.profile_id ?? '')
    || !positiveInteger(details.peak_concurrency)
    || details.successful_intents !== dossier.measurements.successful_intents
    || details.failed_intents !== dossier.measurements.failed_intents
    || details.p95_intent_latency_ms
      !== dossier.measurements.p95_intent_latency_ms
    || details.resource_limits_enforced
      !== dossier.deployment.resource_limits_enforced
    || details.overload_rejection_verified !== true
    || details.dependency_loss_recovery_verified !== true
    || details.saturation_within_limits !== true
  ) invalid(type);
}

function validateExternalTelemetry({ details, dossier, type }) {
  exactObject(details, type, [
    'receiver_owner',
    'retention_policy_id',
    'metrics_transport_authenticated',
    'alert_transport_authenticated',
    'fixed_vocabulary_enforced',
    'sensitive_values_omitted',
    'critical_alert_ack_minutes',
    'delivery_receipts_verified'
  ]);
  if (
    !IDENTIFIER.test(details.receiver_owner ?? '')
    || !IDENTIFIER.test(details.retention_policy_id ?? '')
    || details.metrics_transport_authenticated !== true
    || details.alert_transport_authenticated !== true
    || details.fixed_vocabulary_enforced !== true
    || details.sensitive_values_omitted !== true
    || details.critical_alert_ack_minutes
      !== dossier.measurements.critical_alert_ack_minutes
    || details.delivery_receipts_verified !== true
  ) invalid(type);
}

function validateProviderAssessment({ details, dossier, type }) {
  exactObject(details, type, [
    'adapter_id',
    'adapter_sha256',
    'backend',
    'workload_identity',
    'backend_authorization_least_privilege',
    'provider_signer_pinned',
    'nonce_freshness_verified',
    'rotation_observed',
    'rollback_verified',
    'private_runtime_cleanup_verified'
  ]);
  const custodyMatch = dossier.custody.some(item => (
    ['provider_secret_signer', 'provider_policy_signer'].includes(item.control)
    && item.backend === details.backend
    && item.workload_identity === details.workload_identity
  ));
  if (
    !IDENTIFIER.test(details.adapter_id ?? '')
    || !DIGEST.test(details.adapter_sha256 ?? '')
    || !IDENTIFIER.test(details.backend ?? '')
    || !IDENTIFIER.test(details.workload_identity ?? '')
    || !custodyMatch
    || details.backend_authorization_least_privilege !== true
    || details.provider_signer_pinned !== true
    || details.nonce_freshness_verified !== true
    || details.rotation_observed !== true
    || details.rollback_verified !== true
    || details.private_runtime_cleanup_verified !== true
  ) invalid(type);
}

function validateCustodyAssessment({ details, dossier, type }) {
  exactObject(details, type, [
    'controls',
    'all_non_exportable',
    'separation_of_duties_verified'
  ]);
  if (
    !Array.isArray(details.controls)
    || canonicalJson(details.controls.map(item => item?.control))
      !== canonicalJson(PILOT_CUSTODY_CONTROLS)
  ) invalid(type);
  const expected = dossier.custody.map(item => ({
    control: item.control,
    backend: item.backend,
    custodian: item.custodian,
    workload_identity: item.workload_identity,
    exportable: item.exportable,
    rotation_observed: item.rotation_observed,
    receipt_sha256: item.receipt_sha256
  }));
  for (const item of details.controls) {
    exactObject(item, `${type}.${item?.control ?? 'unknown'}`, [
      'control',
      'backend',
      'custodian',
      'workload_identity',
      'exportable',
      'rotation_observed',
      'receipt_sha256'
    ]);
  }
  if (
    canonicalJson(details.controls) !== canonicalJson(expected)
    || details.all_non_exportable !== true
    || details.separation_of_duties_verified !== true
  ) invalid(type);
}

function validateScheduledRestore({ details, dossier, metadata, type }) {
  exactObject(details, type, [
    'media_owner',
    'backup_id',
    'backup_sha256',
    'restored_at',
    'rpo_minutes',
    'rto_minutes',
    'pilot_owned_media',
    'wrong_key_rejected',
    'state_integrity_verified',
    'rollback_verified'
  ]);
  if (
    !IDENTIFIER.test(details.media_owner ?? '')
    || !IDENTIFIER.test(details.backup_id ?? '')
    || !DIGEST.test(details.backup_sha256 ?? '')
    || details.restored_at !== metadata.observed_at
    || !canonicalTimestamp(details.restored_at)
    || details.rpo_minutes !== dossier.measurements.backup_rpo_minutes
    || details.rto_minutes !== dossier.measurements.restore_rto_minutes
    || details.pilot_owned_media !== true
    || details.wrong_key_rejected !== true
    || details.state_integrity_verified !== true
    || details.rollback_verified !== true
  ) invalid(type);
}

function validateCredentialRotation({ details, dossier, type }) {
  exactObject(details, type, [
    'custody_backend',
    'rotated_service_identities',
    'operator_token_rotated',
    'telemetry_token_rotated',
    'retired_credentials_rejected',
    'trust_lineage_verified',
    'rollback_verified',
    'secret_values_omitted'
  ]);
  const custody = dossier.custody.find(
    item => item.control === 'service_identities'
  );
  if (
    details.custody_backend !== custody?.backend
    || canonicalJson(details.rotated_service_identities)
      !== canonicalJson(SERVICE_UNITS)
    || details.operator_token_rotated !== true
    || details.telemetry_token_rotated !== true
    || details.retired_credentials_rejected !== true
    || details.trust_lineage_verified !== true
    || details.rollback_verified !== true
    || details.secret_values_omitted !== true
  ) invalid(type);
}

function validateDataKeyRotation({ details, dossier, type }) {
  exactObject(details, type, [
    'custody_backend',
    'live_state_reencrypted',
    'retained_backups_reencrypted',
    'recovery_copies_reencrypted',
    'wrong_key_rejected',
    'restore_verified',
    'interruption_recovery_verified',
    'rollback_verified',
    'old_key_retired'
  ]);
  const custody = dossier.custody.find(
    item => item.control === 'data_protection_key'
  );
  if (
    details.custody_backend !== custody?.backend
    || details.live_state_reencrypted !== true
    || details.retained_backups_reencrypted !== true
    || details.recovery_copies_reencrypted !== true
    || details.wrong_key_rejected !== true
    || details.restore_verified !== true
    || details.interruption_recovery_verified !== true
    || details.rollback_verified !== true
    || details.old_key_retired !== true
  ) invalid(type);
}

function validateCredentialHistoryAttestations({
  details,
  dossier,
  policy,
  type
}) {
  exactObject(details, type, [
    'expected_entries',
    'verified_entries',
    'not_applicable_entries',
    'pending_entries',
    'repository_reintroduced',
    'external_dispositions_complete',
    'disposition_ledger_sha256'
  ]);
  if (
    details.expected_entries
      !== policy.requirements.expected_deprecated_history_entries
    || details.expected_entries
      !== dossier.measurements.deprecated_history_entries_disposed
    || !nonNegativeInteger(details.verified_entries)
    || !nonNegativeInteger(details.not_applicable_entries)
    || details.verified_entries + details.not_applicable_entries
      !== details.expected_entries
    || details.pending_entries !== 0
    || details.repository_reintroduced !== 0
    || details.external_dispositions_complete !== true
    || !DIGEST.test(details.disposition_ledger_sha256 ?? '')
  ) invalid(type);
}

function validateIncidentTabletop({ details, policy, type }) {
  exactObject(details, type, [
    'exercise_id',
    'facilitated',
    'named_responders',
    'independent_reviewer_id',
    'notification_decisions_recorded',
    'evidence_preserved',
    'containment_verified',
    'recovery_verified',
    'communications_verified',
    'closure_verified',
    'unresolved_critical_findings',
    'unresolved_high_findings'
  ]);
  const independent = reviewer(policy, 'independent_reviewer');
  if (
    !IDENTIFIER.test(details.exercise_id ?? '')
    || details.facilitated !== true
    || !identifierArray(details.named_responders, { minimum: 2, maximum: 32 })
    || details.independent_reviewer_id !== independent.reviewer_id
    || details.notification_decisions_recorded !== true
    || details.evidence_preserved !== true
    || details.containment_verified !== true
    || details.recovery_verified !== true
    || details.communications_verified !== true
    || details.closure_verified !== true
    || details.unresolved_critical_findings !== 0
    || details.unresolved_high_findings !== 0
  ) invalid(type);
}

function validateIndependentSecurityReview({
  details,
  policy,
  metadata,
  type
}) {
  exactObject(details, type, [
    'review_id',
    'reviewer_organization',
    'reviewer_id',
    'completed_at',
    'scope',
    'report_sha256',
    'findings',
    'unresolved_critical_findings',
    'unresolved_high_findings',
    'remediation_owners_assigned',
    'residual_risk_documented'
  ]);
  exactObject(details.findings, `${type}.findings`, [
    'critical',
    'high',
    'medium',
    'low'
  ]);
  const independent = reviewer(policy, 'independent_reviewer');
  if (
    !IDENTIFIER.test(details.review_id ?? '')
    || !IDENTIFIER.test(details.reviewer_organization ?? '')
    || details.reviewer_id !== independent.reviewer_id
    || details.completed_at !== metadata.observed_at
    || !canonicalTimestamp(details.completed_at)
    || canonicalJson(details.scope) !== canonicalJson(SECURITY_REVIEW_SCOPE)
    || !DIGEST.test(details.report_sha256 ?? '')
    || Object.values(details.findings).some(value => !nonNegativeInteger(value))
    || details.unresolved_critical_findings !== 0
    || details.unresolved_high_findings !== 0
    || details.remediation_owners_assigned !== true
    || details.residual_risk_documented !== true
  ) invalid(type);
}

function reviewer(policy, role) {
  const value = policy.reviewers.find(item => item.role === role);
  if (!value) throw new ValidationError(`Pilot evidence reviewer is missing: ${role}`);
  return value;
}

function exactObject(value, type, keys) {
  if (
    !plainObject(value)
    || canonicalJson(Object.keys(value).sort())
      !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`Pilot evidence details fields are invalid: ${type}`);
}

function requireSame(actual, expected, type) {
  if (canonicalJson(actual) !== canonicalJson(expected)) invalid(type);
}

function invalid(type) {
  throw new ValidationError(`Pilot evidence details are invalid: ${type}`);
}

function identifierArray(value, { minimum, maximum }) {
  return (
    Array.isArray(value)
    && value.length >= minimum
    && value.length <= maximum
    && value.every(item => IDENTIFIER.test(item ?? ''))
    && new Set(value).size === value.length
  );
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return (
    Number.isFinite(parsed)
    && new Date(parsed).toISOString() === value
  );
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

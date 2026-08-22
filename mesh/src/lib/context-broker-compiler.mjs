import {
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  ValidationError
} from './canonical.mjs';

export const CONTEXT_REQUEST_V1_SCHEMA = 'axiom-context-request.v1';
export const VAULT_ACCESS_LEASE_V1_SCHEMA = 'axiom-vault-access-lease.v1';
export const CONTEXT_CAPSULE_V1_SCHEMA = 'axiom-context-capsule.v1';
export const CONTEXT_DISCLOSURE_POLICY_DECISION_V1_SCHEMA =
  'axiom-context-disclosure-policy-decision.v1';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const SENSITIVITY = Object.freeze({
  'ordinary-private': 0,
  sensitive: 1,
  restricted: 2,
  'critical-secret': 3
});

const REQUEST_DISCLOSURE_MODES = new Set([
  'transformed-constraint',
  'redacted',
  'aggregate',
  'derived-inference',
  'owner-approved-verbatim'
]);

const CAPSULE_DISCLOSURE_MODES = new Set([
  'verbatim-approved',
  'redacted',
  'transformed-constraint',
  'aggregate',
  'derived-inference'
]);

const REQUEST_KEYS = Object.freeze([
  'schema',
  'request_id',
  'owner_subject_ref',
  'requester_principal_ref',
  'recipient_principal_ref',
  'destination_ref',
  'purpose',
  'task_class',
  'issued_at',
  'expires_at',
  'semantic_needs',
  'retention_request',
  'requester_evidence_refs',
  'minimum_necessary_requested',
  'source_vault_selector_in_request',
  'requests_vault_mount',
  'requests_raw_vault_object',
  'grants_vault_access',
  'grants_execution_authority',
  'onward_disclosure_requested'
]);

const LEASE_KEYS = Object.freeze([
  'schema',
  'lease_id',
  'owner_subject_ref',
  'holder_principal_ref',
  'holder_runtime_ref',
  'vault_id',
  'purpose',
  'task_class',
  'issued_at',
  'expires_at',
  'allowed_operations',
  'resource_scope',
  'policy_decision_ref',
  'grant_ref',
  'owner_confirmation_ref',
  'access_receipt_reservation_ref',
  'key_handle_ref',
  'delegable',
  'usable_outside_owner_trust_domain',
  'contains_raw_key_material',
  'grants_other_vault_access',
  'grants_kernel_effect_authority',
  'permits_raw_content_export',
  'mutation_authority',
  'requires_revocation_check_before_use',
  'access_receipt_required'
]);

const CAPSULE_KEYS = Object.freeze([
  'schema',
  'capsule_id',
  'owner_subject_ref',
  'requester_principal_ref',
  'recipient_principal_ref',
  'destination_ref',
  'purpose',
  'task_class',
  'issued_at',
  'expires_at',
  'disclosures',
  'retention',
  'policy_decision_ref',
  'grant_ref',
  'access_receipt_refs',
  'local_provenance_receipt_refs',
  'minimum_necessary_policy_ref',
  'capsule_sha256',
  'grants_vault_access',
  'grants_execution_authority',
  'contains_raw_vault_object',
  'source_content_resolvable_by_recipient',
  'onward_disclosure_allowed'
]);

const CLAIM_KEYS = Object.freeze([
  'claim_id',
  'semantic_type',
  'value',
  'disclosure_type',
  'sensitivity',
  'confidence',
  'limitations',
  'source_vault_id',
  'source_resource_refs'
]);

const RECEIPT_KEYS = Object.freeze([
  'receipt_ref',
  'reservation_ref',
  'lease_id',
  'owner_subject_ref',
  'holder_principal_ref',
  'vault_id',
  'purpose',
  'task_class',
  'recorded_at',
  'committed'
]);

const POLICY_KEYS = Object.freeze([
  'schema',
  'decision_ref',
  'request_id',
  'owner_subject_ref',
  'recipient_principal_ref',
  'allowed',
  'allowed_semantic_types',
  'allowed_disclosure_modes',
  'maximum_sensitivity',
  'max_retention_seconds',
  'recipient_may_persist',
  'max_capsule_lifetime_seconds',
  'minimum_necessary_confirmed'
]);

export function validateContextRequest(request) {
  assertPlainObject(request, 'context request');
  exactKeys(
    request,
    REQUEST_KEYS,
    [
      'schema',
      'request_id',
      'owner_subject_ref',
      'requester_principal_ref',
      'recipient_principal_ref',
      'purpose',
      'task_class',
      'issued_at',
      'expires_at',
      'semantic_needs',
      'retention_request',
      'minimum_necessary_requested',
      'source_vault_selector_in_request',
      'requests_vault_mount',
      'requests_raw_vault_object',
      'grants_vault_access',
      'grants_execution_authority',
      'onward_disclosure_requested'
    ],
    'context request'
  );

  assertConst(request.schema, CONTEXT_REQUEST_V1_SCHEMA, 'context request schema');
  assertId(request.request_id, 'request_id');
  assertId(request.owner_subject_ref, 'owner_subject_ref');
  assertId(request.requester_principal_ref, 'requester_principal_ref');
  assertId(request.recipient_principal_ref, 'recipient_principal_ref');
  if (request.destination_ref !== undefined) assertId(request.destination_ref, 'destination_ref');
  assertString(request.purpose, 'purpose', { min: 1, max: 240 });
  assertString(request.task_class, 'task_class', { min: 1, max: 160 });
  const issuedAt = assertDateTime(request.issued_at, 'issued_at');
  const expiresAt = assertDateTime(request.expires_at, 'expires_at');
  if (!(issuedAt < expiresAt)) throw new ValidationError('context request expires_at must follow issued_at');

  const needs = assertArray(request.semantic_needs, 'semantic_needs', { min: 1, max: 64 });
  const semanticTypes = new Set();
  for (const [index, need] of needs.entries()) {
    assertPlainObject(need, `semantic_needs[${index}]`);
    exactKeys(
      need,
      [
        'semantic_type',
        'need',
        'required',
        'maximum_sensitivity',
        'acceptable_disclosure_modes',
        'minimum_confidence'
      ],
      [
        'semantic_type',
        'need',
        'required',
        'maximum_sensitivity',
        'acceptable_disclosure_modes'
      ],
      `semantic_needs[${index}]`
    );
    const semanticType = assertString(
      need.semantic_type,
      `semantic_needs[${index}].semantic_type`,
      { min: 1, max: 240 }
    );
    assertUnique(semanticTypes, semanticType, 'semantic need type');
    assertString(need.need, `semantic_needs[${index}].need`, { min: 1, max: 1000 });
    assertBoolean(need.required, `semantic_needs[${index}].required`);
    assertSensitivity(need.maximum_sensitivity, `semantic_needs[${index}].maximum_sensitivity`);
    assertEnumArray(
      need.acceptable_disclosure_modes,
      REQUEST_DISCLOSURE_MODES,
      `semantic_needs[${index}].acceptable_disclosure_modes`,
      { min: 1, max: 5 }
    );
    if (need.minimum_confidence !== undefined) {
      assertConfidence(need.minimum_confidence, `semantic_needs[${index}].minimum_confidence`);
    }
  }

  validateRequestRetention(request.retention_request);
  if (request.requester_evidence_refs !== undefined) {
    assertIdArray(request.requester_evidence_refs, 'requester_evidence_refs', { min: 0, max: 64 });
  }

  assertConst(request.minimum_necessary_requested, true, 'minimum_necessary_requested');
  assertConst(request.source_vault_selector_in_request, false, 'source_vault_selector_in_request');
  assertConst(request.requests_vault_mount, false, 'requests_vault_mount');
  assertConst(request.requests_raw_vault_object, false, 'requests_raw_vault_object');
  assertConst(request.grants_vault_access, false, 'context request grants_vault_access');
  assertConst(
    request.grants_execution_authority,
    false,
    'context request grants_execution_authority'
  );
  assertConst(request.onward_disclosure_requested, false, 'onward_disclosure_requested');

  return Object.freeze({
    valid: true,
    request_id: request.request_id,
    owner_subject_ref: request.owner_subject_ref,
    semantic_needs: needs.length,
    canonical_sha256: digestObject(request),
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

export function validateVaultAccessLease(lease) {
  assertPlainObject(lease, 'vault access lease');
  exactKeys(
    lease,
    LEASE_KEYS,
    [
      'schema',
      'lease_id',
      'owner_subject_ref',
      'holder_principal_ref',
      'vault_id',
      'purpose',
      'task_class',
      'issued_at',
      'expires_at',
      'allowed_operations',
      'resource_scope',
      'policy_decision_ref',
      'grant_ref',
      'access_receipt_reservation_ref',
      'delegable',
      'usable_outside_owner_trust_domain',
      'contains_raw_key_material',
      'grants_other_vault_access',
      'grants_kernel_effect_authority',
      'permits_raw_content_export',
      'mutation_authority',
      'requires_revocation_check_before_use',
      'access_receipt_required'
    ],
    'vault access lease'
  );

  assertConst(lease.schema, VAULT_ACCESS_LEASE_V1_SCHEMA, 'vault access lease schema');
  assertId(lease.lease_id, 'lease_id');
  assertId(lease.owner_subject_ref, 'lease owner_subject_ref');
  assertId(lease.holder_principal_ref, 'holder_principal_ref');
  if (lease.holder_runtime_ref !== undefined) assertId(lease.holder_runtime_ref, 'holder_runtime_ref');
  assertId(lease.vault_id, 'vault_id');
  assertString(lease.purpose, 'lease purpose', { min: 1, max: 240 });
  assertString(lease.task_class, 'lease task_class', { min: 1, max: 160 });
  const issuedAt = assertDateTime(lease.issued_at, 'lease issued_at');
  const expiresAt = assertDateTime(lease.expires_at, 'lease expires_at');
  if (!(issuedAt < expiresAt)) throw new ValidationError('vault access lease expires_at must follow issued_at');
  assertEnumArray(
    lease.allowed_operations,
    new Set(['read', 'derive']),
    'allowed_operations',
    { min: 1, max: 2 }
  );
  validateResourceScope(lease.resource_scope);
  assertId(lease.policy_decision_ref, 'lease policy_decision_ref');
  assertId(lease.grant_ref, 'lease grant_ref');
  if (lease.owner_confirmation_ref !== undefined) {
    assertId(lease.owner_confirmation_ref, 'lease owner_confirmation_ref');
  }
  assertId(lease.access_receipt_reservation_ref, 'access_receipt_reservation_ref');
  if (lease.key_handle_ref !== undefined) assertId(lease.key_handle_ref, 'key_handle_ref');

  assertConst(lease.delegable, false, 'lease delegable');
  assertConst(
    lease.usable_outside_owner_trust_domain,
    false,
    'usable_outside_owner_trust_domain'
  );
  assertConst(lease.contains_raw_key_material, false, 'contains_raw_key_material');
  assertConst(lease.grants_other_vault_access, false, 'grants_other_vault_access');
  assertConst(
    lease.grants_kernel_effect_authority,
    false,
    'grants_kernel_effect_authority'
  );
  assertConst(lease.permits_raw_content_export, false, 'permits_raw_content_export');
  assertConst(lease.mutation_authority, false, 'mutation_authority');
  assertConst(
    lease.requires_revocation_check_before_use,
    true,
    'requires_revocation_check_before_use'
  );
  assertConst(lease.access_receipt_required, true, 'access_receipt_required');

  return Object.freeze({
    valid: true,
    lease_id: lease.lease_id,
    owner_subject_ref: lease.owner_subject_ref,
    vault_id: lease.vault_id,
    canonical_sha256: digestObject(lease),
    grants_kernel_effect_authority: false,
    permits_raw_content_export: false
  });
}

export function validateContextCapsule(capsule) {
  assertPlainObject(capsule, 'context capsule');
  exactKeys(
    capsule,
    CAPSULE_KEYS,
    [
      'schema',
      'capsule_id',
      'owner_subject_ref',
      'requester_principal_ref',
      'recipient_principal_ref',
      'purpose',
      'task_class',
      'issued_at',
      'expires_at',
      'disclosures',
      'retention',
      'policy_decision_ref',
      'access_receipt_refs',
      'grants_vault_access',
      'grants_execution_authority',
      'contains_raw_vault_object',
      'source_content_resolvable_by_recipient',
      'onward_disclosure_allowed'
    ],
    'context capsule'
  );

  assertConst(capsule.schema, CONTEXT_CAPSULE_V1_SCHEMA, 'context capsule schema');
  assertId(capsule.capsule_id, 'capsule_id');
  assertId(capsule.owner_subject_ref, 'capsule owner_subject_ref');
  assertId(capsule.requester_principal_ref, 'capsule requester_principal_ref');
  assertId(capsule.recipient_principal_ref, 'capsule recipient_principal_ref');
  if (capsule.destination_ref !== undefined) assertId(capsule.destination_ref, 'capsule destination_ref');
  assertString(capsule.purpose, 'capsule purpose', { min: 1, max: 240 });
  assertString(capsule.task_class, 'capsule task_class', { min: 1, max: 160 });
  const issuedAt = assertDateTime(capsule.issued_at, 'capsule issued_at');
  const expiresAt = assertDateTime(capsule.expires_at, 'capsule expires_at');
  if (!(issuedAt < expiresAt)) throw new ValidationError('context capsule expires_at must follow issued_at');

  const disclosures = assertArray(capsule.disclosures, 'capsule disclosures', { min: 1, max: 128 });
  const claimIds = new Set();
  for (const [index, disclosure] of disclosures.entries()) {
    validateCapsuleDisclosure(disclosure, index, claimIds);
  }
  validateCapsuleRetention(capsule.retention);
  assertId(capsule.policy_decision_ref, 'capsule policy_decision_ref');
  if (capsule.grant_ref !== undefined) assertId(capsule.grant_ref, 'capsule grant_ref');
  assertIdArray(capsule.access_receipt_refs, 'capsule access_receipt_refs', { min: 1, max: 128 });
  if (capsule.local_provenance_receipt_refs !== undefined) {
    assertIdArray(
      capsule.local_provenance_receipt_refs,
      'capsule local_provenance_receipt_refs',
      { min: 0, max: 128 }
    );
  }
  if (capsule.minimum_necessary_policy_ref !== undefined) {
    assertId(capsule.minimum_necessary_policy_ref, 'minimum_necessary_policy_ref');
  }
  if (capsule.capsule_sha256 !== undefined) {
    assertSha256(capsule.capsule_sha256, 'capsule_sha256');
    const unsigned = { ...capsule };
    delete unsigned.capsule_sha256;
    if (digestObject(unsigned) !== capsule.capsule_sha256) {
      throw new ValidationError('context capsule digest does not match capsule content');
    }
  }

  assertConst(capsule.grants_vault_access, false, 'capsule grants_vault_access');
  assertConst(capsule.grants_execution_authority, false, 'capsule grants_execution_authority');
  assertConst(capsule.contains_raw_vault_object, false, 'contains_raw_vault_object');
  assertConst(
    capsule.source_content_resolvable_by_recipient,
    false,
    'source_content_resolvable_by_recipient'
  );
  assertConst(capsule.onward_disclosure_allowed, false, 'onward_disclosure_allowed');

  return Object.freeze({
    valid: true,
    capsule_id: capsule.capsule_id,
    disclosures: disclosures.length,
    canonical_sha256: capsule.capsule_sha256 ?? digestObject(capsule),
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

export function compileContextCapsule({
  request,
  leases,
  claims,
  accessReceipts,
  policyDecision,
  brokerPrincipalRef,
  capsuleId,
  issuedAt,
  localProvenanceReceiptRefs = []
}) {
  validateContextRequest(request);
  const compileTime = assertDateTime(issuedAt, 'compile issuedAt');
  if (compileTime < Date.parse(request.issued_at) || compileTime >= Date.parse(request.expires_at)) {
    throw new ValidationError('context request is not current at capsule compilation time');
  }
  const broker = assertId(brokerPrincipalRef, 'brokerPrincipalRef');
  const id = assertId(capsuleId, 'capsuleId');
  const policy = validateDisclosurePolicyDecision(policyDecision, request);
  if (policy.allowed !== true) throw new ValidationError('disclosure policy decision denied the request');

  const leaseMap = normalizeLeases(leases, request, broker, compileTime);
  const receiptIndex = normalizeAccessReceipts(accessReceipts, compileTime);
  const needs = new Map(request.semantic_needs.map(need => [need.semantic_type, need]));
  const normalizedClaims = normalizeClaims(claims);
  const disclosures = [];
  const usedLeaseIds = new Set();
  const usedReceiptRefs = new Set();
  const seenSemanticTypes = new Set();

  for (const claim of normalizedClaims) {
    const need = needs.get(claim.semantic_type);
    if (!need) {
      throw new ValidationError(
        `candidate claim ${claim.claim_id} was not requested by semantic type`
      );
    }
    assertUnique(
      seenSemanticTypes,
      claim.semantic_type,
      'compiled disclosure semantic type'
    );
    if (!policy.allowed_semantic_types.includes(claim.semantic_type)) {
      throw new ValidationError(
        `candidate claim ${claim.claim_id} semantic type is not policy-allowed`
      );
    }
    if (!policy.allowed_disclosure_modes.includes(claim.disclosure_type)) {
      throw new ValidationError(
        `candidate claim ${claim.claim_id} disclosure mode is not policy-allowed`
      );
    }
    if (!requestAllowsDisclosureMode(need, claim.disclosure_type)) {
      throw new ValidationError(
        `candidate claim ${claim.claim_id} disclosure mode exceeds the request`
      );
    }
    assertSensitivityAtMost(
      claim.sensitivity,
      need.maximum_sensitivity,
      `candidate claim ${claim.claim_id} exceeds requested sensitivity`
    );
    assertSensitivityAtMost(
      claim.sensitivity,
      policy.maximum_sensitivity,
      `candidate claim ${claim.claim_id} exceeds policy sensitivity`
    );
    enforceConfidence(need, claim);

    const operation = disclosureOperation(claim.disclosure_type);
    const lease = findAuthorizingLease({
      leaseMap,
      claim,
      operation
    });
    if (!lease) {
      throw new ValidationError(
        `candidate claim ${claim.claim_id} has no current exact-scope vault lease`
      );
    }
    if (claim.disclosure_type === 'verbatim-approved' && !lease.owner_confirmation_ref) {
      throw new ValidationError(
        `verbatim claim ${claim.claim_id} requires owner confirmation on its lease`
      );
    }

    const receipt = findCommittedReceipt(receiptIndex, lease);
    if (!receipt) {
      throw new ValidationError(
        `candidate claim ${claim.claim_id} has no committed access receipt for lease ${lease.lease_id}`
      );
    }
    usedLeaseIds.add(lease.lease_id);
    usedReceiptRefs.add(receipt.receipt_ref);

    disclosures.push({
      claim_id: claim.claim_id,
      semantic_type: claim.semantic_type,
      value: claim.value,
      disclosure_type: claim.disclosure_type,
      sensitivity: claim.sensitivity,
      confidence_required: claim.confidence !== undefined,
      ...(claim.confidence !== undefined ? { confidence: claim.confidence } : {}),
      limitations: claim.limitations
    });
  }

  for (const need of request.semantic_needs) {
    if (need.required && !seenSemanticTypes.has(need.semantic_type)) {
      throw new ValidationError(
        `required semantic need was not satisfied: ${need.semantic_type}`
      );
    }
  }
  if (disclosures.length === 0) {
    throw new ValidationError('context capsule requires at least one authorized disclosure');
  }

  const usedLeases = [...usedLeaseIds]
    .map(leaseId => leaseMap.get(leaseId))
    .sort((left, right) => left.lease_id.localeCompare(right.lease_id));
  const earliestLeaseExpiry = Math.min(
    ...usedLeases.map(lease => Date.parse(lease.expires_at))
  );
  const policyExpiry = compileTime + policy.max_capsule_lifetime_seconds * 1000;
  const capsuleExpiry = Math.min(
    Date.parse(request.expires_at),
    earliestLeaseExpiry,
    policyExpiry
  );
  if (!(compileTime < capsuleExpiry)) {
    throw new ValidationError('no positive capsule validity remains after request, lease, and policy limits');
  }

  const retentionSeconds = Math.min(
    request.retention_request.max_seconds,
    policy.max_retention_seconds
  );
  const recipientMayPersist =
    retentionSeconds > 0
    && request.retention_request.recipient_may_persist_requested === true
    && policy.recipient_may_persist === true;
  const provenanceRefs = assertIdArray(
    localProvenanceReceiptRefs,
    'localProvenanceReceiptRefs',
    { min: 0, max: 128 }
  ).sort();

  disclosures.sort((left, right) => left.semantic_type.localeCompare(right.semantic_type));
  const unsignedCapsule = {
    schema: CONTEXT_CAPSULE_V1_SCHEMA,
    capsule_id: id,
    owner_subject_ref: request.owner_subject_ref,
    requester_principal_ref: request.requester_principal_ref,
    recipient_principal_ref: request.recipient_principal_ref,
    ...(request.destination_ref !== undefined
      ? { destination_ref: request.destination_ref }
      : {}),
    purpose: request.purpose,
    task_class: request.task_class,
    issued_at: new Date(compileTime).toISOString(),
    expires_at: new Date(capsuleExpiry).toISOString(),
    disclosures,
    retention: {
      max_seconds: retentionSeconds,
      recipient_may_persist: recipientMayPersist,
      retention_class: recipientMayPersist ? 'policy-narrowed-persistable' : 'ephemeral-no-persistence'
    },
    policy_decision_ref: policy.decision_ref,
    access_receipt_refs: [...usedReceiptRefs].sort(),
    ...(provenanceRefs.length > 0
      ? { local_provenance_receipt_refs: provenanceRefs }
      : {}),
    minimum_necessary_policy_ref: policy.decision_ref,
    grants_vault_access: false,
    grants_execution_authority: false,
    contains_raw_vault_object: false,
    source_content_resolvable_by_recipient: false,
    onward_disclosure_allowed: false
  };
  const capsule = {
    ...unsignedCapsule,
    capsule_sha256: digestObject(unsignedCapsule)
  };
  validateContextCapsule(capsule);

  return deepFreeze({
    capsule,
    request_id: request.request_id,
    policy_decision_ref: policy.decision_ref,
    used_lease_ids: [...usedLeaseIds].sort(),
    used_access_receipt_refs: [...usedReceiptRefs].sort(),
    source_identifiers_in_capsule: false,
    compiler_reads_vaults: false,
    compiler_issues_leases: false,
    compiler_delivers_capsule: false,
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

function validateRequestRetention(retention) {
  assertPlainObject(retention, 'retention_request');
  exactKeys(
    retention,
    ['max_seconds', 'recipient_may_persist_requested', 'retention_reason'],
    ['max_seconds', 'recipient_may_persist_requested'],
    'retention_request'
  );
  assertInteger(retention.max_seconds, 'retention_request.max_seconds', {
    min: 0,
    max: 31536000
  });
  assertBoolean(
    retention.recipient_may_persist_requested,
    'retention_request.recipient_may_persist_requested'
  );
  if (retention.retention_reason !== undefined) {
    assertString(retention.retention_reason, 'retention_request.retention_reason', {
      min: 0,
      max: 1000
    });
  }
}

function validateResourceScope(scope) {
  assertPlainObject(scope, 'resource_scope');
  exactKeys(
    scope,
    ['wildcard_scope', 'resource_refs', 'semantic_types', 'maximum_sensitivity'],
    ['wildcard_scope'],
    'resource_scope'
  );
  assertConst(scope.wildcard_scope, false, 'resource_scope.wildcard_scope');
  if (scope.resource_refs === undefined && scope.semantic_types === undefined) {
    throw new ValidationError('resource_scope requires resource_refs or semantic_types');
  }
  if (scope.resource_refs !== undefined) {
    assertIdArray(scope.resource_refs, 'resource_scope.resource_refs', { min: 1, max: 256 });
  }
  if (scope.semantic_types !== undefined) {
    assertUniqueStringArray(scope.semantic_types, 'resource_scope.semantic_types', {
      min: 1,
      max: 128,
      itemMax: 240
    });
  }
  if (scope.maximum_sensitivity !== undefined) {
    assertSensitivity(scope.maximum_sensitivity, 'resource_scope.maximum_sensitivity');
  }
}

function validateCapsuleDisclosure(disclosure, index, claimIds) {
  assertPlainObject(disclosure, `disclosures[${index}]`);
  exactKeys(
    disclosure,
    [
      'claim_id',
      'semantic_type',
      'value',
      'disclosure_type',
      'sensitivity',
      'confidence_required',
      'confidence',
      'limitations'
    ],
    [
      'claim_id',
      'semantic_type',
      'value',
      'disclosure_type',
      'sensitivity',
      'confidence_required',
      'limitations'
    ],
    `disclosures[${index}]`
  );
  const claimId = assertId(disclosure.claim_id, `disclosures[${index}].claim_id`);
  assertUnique(claimIds, claimId, 'capsule claim_id');
  assertString(disclosure.semantic_type, `disclosures[${index}].semantic_type`, {
    min: 1,
    max: 240
  });
  validateJsonValue(disclosure.value, `disclosures[${index}].value`);
  assertEnum(
    disclosure.disclosure_type,
    CAPSULE_DISCLOSURE_MODES,
    `disclosures[${index}].disclosure_type`
  );
  assertSensitivity(disclosure.sensitivity, `disclosures[${index}].sensitivity`);
  assertBoolean(
    disclosure.confidence_required,
    `disclosures[${index}].confidence_required`
  );
  if (disclosure.confidence_required && disclosure.confidence === undefined) {
    throw new ValidationError(`disclosures[${index}] requires confidence`);
  }
  if (disclosure.confidence !== undefined) {
    assertConfidence(disclosure.confidence, `disclosures[${index}].confidence`);
  }
  assertString(disclosure.limitations, `disclosures[${index}].limitations`, {
    min: 0,
    max: 2000
  });
}

function validateCapsuleRetention(retention) {
  assertPlainObject(retention, 'capsule retention');
  exactKeys(
    retention,
    ['max_seconds', 'recipient_may_persist', 'retention_class'],
    ['max_seconds', 'recipient_may_persist'],
    'capsule retention'
  );
  assertInteger(retention.max_seconds, 'capsule retention.max_seconds', {
    min: 0,
    max: 31536000
  });
  assertBoolean(retention.recipient_may_persist, 'capsule retention.recipient_may_persist');
  if (retention.retention_class !== undefined) {
    assertString(retention.retention_class, 'capsule retention.retention_class', {
      min: 1,
      max: 160
    });
  }
}

function validateDisclosurePolicyDecision(decision, request) {
  assertPlainObject(decision, 'disclosure policy decision');
  exactKeys(decision, POLICY_KEYS, POLICY_KEYS, 'disclosure policy decision');
  assertConst(
    decision.schema,
    CONTEXT_DISCLOSURE_POLICY_DECISION_V1_SCHEMA,
    'disclosure policy decision schema'
  );
  assertId(decision.decision_ref, 'policy decision_ref');
  assertConst(decision.request_id, request.request_id, 'policy request_id');
  assertConst(
    decision.owner_subject_ref,
    request.owner_subject_ref,
    'policy owner_subject_ref'
  );
  assertConst(
    decision.recipient_principal_ref,
    request.recipient_principal_ref,
    'policy recipient_principal_ref'
  );
  assertBoolean(decision.allowed, 'policy allowed');
  const allowedSemanticTypes = assertUniqueStringArray(
    decision.allowed_semantic_types,
    'policy allowed_semantic_types',
    { min: 0, max: 64, itemMax: 240 }
  );
  const requestTypes = new Set(request.semantic_needs.map(need => need.semantic_type));
  if (allowedSemanticTypes.some(type => !requestTypes.has(type))) {
    throw new ValidationError('policy decision broadens semantic types beyond the request');
  }
  assertEnumArray(
    decision.allowed_disclosure_modes,
    CAPSULE_DISCLOSURE_MODES,
    'policy allowed_disclosure_modes',
    { min: 0, max: 5 }
  );
  assertSensitivity(decision.maximum_sensitivity, 'policy maximum_sensitivity');
  assertInteger(decision.max_retention_seconds, 'policy max_retention_seconds', {
    min: 0,
    max: 31536000
  });
  assertBoolean(decision.recipient_may_persist, 'policy recipient_may_persist');
  assertInteger(
    decision.max_capsule_lifetime_seconds,
    'policy max_capsule_lifetime_seconds',
    { min: 1, max: 31536000 }
  );
  assertConst(
    decision.minimum_necessary_confirmed,
    true,
    'policy minimum_necessary_confirmed'
  );
  return decision;
}

function normalizeLeases(leases, request, broker, compileTime) {
  const values = assertArray(leases, 'leases', { min: 1, max: 128 });
  const map = new Map();
  for (const lease of values) {
    validateVaultAccessLease(lease);
    if (map.has(lease.lease_id)) {
      throw new ValidationError(`duplicate lease_id: ${lease.lease_id}`);
    }
    if (lease.owner_subject_ref !== request.owner_subject_ref) {
      throw new ValidationError(`lease ${lease.lease_id} owner does not match context request`);
    }
    if (lease.holder_principal_ref !== broker) {
      throw new ValidationError(`lease ${lease.lease_id} holder is not the compiling broker`);
    }
    if (lease.purpose !== request.purpose || lease.task_class !== request.task_class) {
      throw new ValidationError(`lease ${lease.lease_id} purpose or task class does not match request`);
    }
    if (compileTime < Date.parse(lease.issued_at) || compileTime >= Date.parse(lease.expires_at)) {
      throw new ValidationError(`lease ${lease.lease_id} is not current at compilation time`);
    }
    map.set(lease.lease_id, lease);
  }
  return map;
}

function normalizeAccessReceipts(receipts, compileTime) {
  const values = assertArray(receipts, 'accessReceipts', { min: 1, max: 256 });
  const receiptRefs = new Set();
  const byLease = new Map();
  for (const [index, receipt] of values.entries()) {
    assertPlainObject(receipt, `accessReceipts[${index}]`);
    exactKeys(receipt, RECEIPT_KEYS, RECEIPT_KEYS, `accessReceipts[${index}]`);
    const receiptRef = assertId(receipt.receipt_ref, `accessReceipts[${index}].receipt_ref`);
    assertUnique(receiptRefs, receiptRef, 'access receipt_ref');
    assertId(receipt.reservation_ref, `accessReceipts[${index}].reservation_ref`);
    assertId(receipt.lease_id, `accessReceipts[${index}].lease_id`);
    assertId(receipt.owner_subject_ref, `accessReceipts[${index}].owner_subject_ref`);
    assertId(receipt.holder_principal_ref, `accessReceipts[${index}].holder_principal_ref`);
    assertId(receipt.vault_id, `accessReceipts[${index}].vault_id`);
    assertString(receipt.purpose, `accessReceipts[${index}].purpose`, { min: 1, max: 240 });
    assertString(receipt.task_class, `accessReceipts[${index}].task_class`, { min: 1, max: 160 });
    const recordedAt = assertDateTime(receipt.recorded_at, `accessReceipts[${index}].recorded_at`);
    if (recordedAt > compileTime) {
      throw new ValidationError(`access receipt ${receiptRef} cannot postdate capsule compilation`);
    }
    assertConst(receipt.committed, true, `access receipt ${receiptRef} committed`);
    const list = byLease.get(receipt.lease_id) ?? [];
    list.push(receipt);
    byLease.set(receipt.lease_id, list);
  }
  for (const list of byLease.values()) {
    list.sort((left, right) => left.receipt_ref.localeCompare(right.receipt_ref));
  }
  return byLease;
}

function normalizeClaims(claims) {
  const values = assertArray(claims, 'claims', { min: 1, max: 128 });
  const claimIds = new Set();
  return values.map((claim, index) => {
    assertPlainObject(claim, `claims[${index}]`);
    exactKeys(
      claim,
      CLAIM_KEYS,
      [
        'claim_id',
        'semantic_type',
        'value',
        'disclosure_type',
        'sensitivity',
        'limitations',
        'source_vault_id'
      ],
      `claims[${index}]`
    );
    const claimId = assertId(claim.claim_id, `claims[${index}].claim_id`);
    assertUnique(claimIds, claimId, 'candidate claim_id');
    assertString(claim.semantic_type, `claims[${index}].semantic_type`, {
      min: 1,
      max: 240
    });
    validateJsonValue(claim.value, `claims[${index}].value`);
    assertEnum(claim.disclosure_type, CAPSULE_DISCLOSURE_MODES, `claims[${index}].disclosure_type`);
    assertSensitivity(claim.sensitivity, `claims[${index}].sensitivity`);
    if (claim.confidence !== undefined) {
      assertConfidence(claim.confidence, `claims[${index}].confidence`);
    }
    assertString(claim.limitations, `claims[${index}].limitations`, { min: 1, max: 2000 });
    assertId(claim.source_vault_id, `claims[${index}].source_vault_id`);
    if (claim.source_resource_refs !== undefined) {
      assertIdArray(claim.source_resource_refs, `claims[${index}].source_resource_refs`, {
        min: 1,
        max: 256
      });
    }
    return claim;
  });
}

function findAuthorizingLease({ leaseMap, claim, operation }) {
  for (const lease of [...leaseMap.values()].sort(
    (left, right) => left.lease_id.localeCompare(right.lease_id)
  )) {
    if (lease.vault_id !== claim.source_vault_id) continue;
    if (!lease.allowed_operations.includes(operation)) continue;
    if (lease.resource_scope.maximum_sensitivity !== undefined) {
      if (SENSITIVITY[claim.sensitivity] > SENSITIVITY[lease.resource_scope.maximum_sensitivity]) {
        continue;
      }
    }
    if (lease.resource_scope.semantic_types !== undefined) {
      if (!lease.resource_scope.semantic_types.includes(claim.semantic_type)) continue;
    }
    if (lease.resource_scope.resource_refs !== undefined) {
      if (!claim.source_resource_refs?.length) continue;
      const allowedResources = new Set(lease.resource_scope.resource_refs);
      if (claim.source_resource_refs.some(ref => !allowedResources.has(ref))) continue;
    }
    return lease;
  }
  return null;
}

function findCommittedReceipt(receiptIndex, lease) {
  const candidates = receiptIndex.get(lease.lease_id) ?? [];
  return candidates.find(receipt => (
    receipt.reservation_ref === lease.access_receipt_reservation_ref
    && receipt.owner_subject_ref === lease.owner_subject_ref
    && receipt.holder_principal_ref === lease.holder_principal_ref
    && receipt.vault_id === lease.vault_id
    && receipt.purpose === lease.purpose
    && receipt.task_class === lease.task_class
    && Date.parse(receipt.recorded_at) >= Date.parse(lease.issued_at)
    && Date.parse(receipt.recorded_at) < Date.parse(lease.expires_at)
  )) ?? null;
}

function requestAllowsDisclosureMode(need, disclosureType) {
  const requested = disclosureType === 'verbatim-approved'
    ? 'owner-approved-verbatim'
    : disclosureType;
  return need.acceptable_disclosure_modes.includes(requested);
}

function disclosureOperation(disclosureType) {
  return disclosureType === 'verbatim-approved' || disclosureType === 'redacted'
    ? 'read'
    : 'derive';
}

function enforceConfidence(need, claim) {
  const required =
    need.minimum_confidence !== undefined
    || claim.disclosure_type === 'derived-inference';
  if (required && claim.confidence === undefined) {
    throw new ValidationError(`candidate claim ${claim.claim_id} requires confidence`);
  }
  if (
    need.minimum_confidence !== undefined
    && claim.confidence < need.minimum_confidence
  ) {
    throw new ValidationError(
      `candidate claim ${claim.claim_id} confidence is below the requested minimum`
    );
  }
}

function assertSensitivityAtMost(actual, maximum, message) {
  if (SENSITIVITY[actual] > SENSITIVITY[maximum]) throw new ValidationError(message);
}

function validateJsonValue(value, name, depth = 0) {
  if (depth > 32) throw new ValidationError(`${name} exceeds maximum JSON nesting depth`);
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.length > 16000) throw new ValidationError(`${name} string exceeds 16000 characters`);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError(`${name} must be a finite number`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 256) throw new ValidationError(`${name} array exceeds 256 items`);
    value.forEach((item, index) => validateJsonValue(item, `${name}[${index}]`, depth + 1));
    canonicalJson(value);
    return;
  }
  assertPlainObject(value, name);
  const keys = Object.keys(value);
  if (keys.length > 128) throw new ValidationError(`${name} object exceeds 128 properties`);
  for (const key of keys) validateJsonValue(value[key], `${name}.${key}`, depth + 1);
  canonicalJson(value);
}

function exactKeys(value, allowed, required, name) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${name} is missing required field ${key}`);
  }
}

function assertId(value, name) {
  return assertString(value, name, { min: 1, max: 160, pattern: ID_PATTERN });
}

function assertSha256(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: SHA256_PATTERN });
}

function assertDateTime(value, name) {
  assertString(value, name, { min: 20, max: 64, pattern: DATE_TIME_PATTERN });
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new ValidationError(`${name} is not a valid date-time`);
  return timestamp;
}

function assertArray(value, name, { min = 0, max = 256 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain ${min}-${max} items`);
  }
  return value;
}

function assertIdArray(value, name, { min = 0, max = 256 } = {}) {
  const list = assertArray(value, name, { min, max });
  const seen = new Set();
  for (const [index, entry] of list.entries()) {
    const normalized = assertId(entry, `${name}[${index}]`);
    assertUnique(seen, normalized, `${name} entry`);
  }
  return [...list];
}

function assertUniqueStringArray(
  value,
  name,
  { min = 0, max = 256, itemMax = 1024 } = {}
) {
  const list = assertArray(value, name, { min, max });
  const seen = new Set();
  for (const [index, entry] of list.entries()) {
    const normalized = assertString(entry, `${name}[${index}]`, {
      min: 1,
      max: itemMax
    });
    assertUnique(seen, normalized, `${name} entry`);
  }
  return [...list];
}

function assertEnumArray(value, allowed, name, { min = 0, max = 256 } = {}) {
  const list = assertArray(value, name, { min, max });
  const seen = new Set();
  for (const [index, entry] of list.entries()) {
    assertEnum(entry, allowed, `${name}[${index}]`);
    assertUnique(seen, entry, `${name} value`);
  }
  return [...list];
}

function assertSensitivity(value, name) {
  if (!Object.hasOwn(SENSITIVITY, value)) {
    throw new ValidationError(`${name} has an unsupported sensitivity`);
  }
  return value;
}

function assertConfidence(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError(`${name} must be finite and between zero and one`);
  }
  return value;
}

function assertInteger(value, name, { min, max }) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function assertBoolean(value, name) {
  if (typeof value !== 'boolean') throw new ValidationError(`${name} must be a boolean`);
  return value;
}

function assertConst(value, expected, name) {
  if (value !== expected) {
    throw new ValidationError(`${name} must equal ${JSON.stringify(expected)}`);
  }
  return value;
}

function assertEnum(value, allowed, name) {
  if (!allowed.has(value)) throw new ValidationError(`${name} has an unsupported value`);
  return value;
}

function assertUnique(seen, value, name) {
  if (seen.has(value)) throw new ValidationError(`duplicate ${name}: ${value}`);
  seen.add(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

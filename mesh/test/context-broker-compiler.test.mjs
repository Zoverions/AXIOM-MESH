import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileContextCapsule,
  validateContextCapsule,
  validateContextRequest,
  validateVaultAccessLease
} from '../src/lib/context-broker-compiler.mjs';

const COMPILE_TIME = '2026-08-22T17:00:00.000Z';

function baseRequest() {
  return {
    schema: 'axiom-context-request.v1',
    request_id: 'request_travel_1',
    owner_subject_ref: 'owner_1',
    requester_principal_ref: 'assistant_1',
    recipient_principal_ref: 'travel_agent_1',
    destination_ref: 'destination_travel_1',
    purpose: 'choose an accessible hotel',
    task_class: 'travel.hotel-selection',
    issued_at: '2026-08-22T16:00:00.000Z',
    expires_at: '2026-08-22T18:00:00.000Z',
    semantic_needs: [
      {
        semantic_type: 'travel.accessibility.requirements',
        need: 'minimum accommodation constraints needed to select a hotel',
        required: true,
        maximum_sensitivity: 'restricted',
        acceptable_disclosure_modes: ['transformed-constraint'],
        minimum_confidence: 0.8
      },
      {
        semantic_type: 'communication.preferred_name',
        need: 'preferred name for the booking note',
        required: false,
        maximum_sensitivity: 'sensitive',
        acceptable_disclosure_modes: ['redacted', 'owner-approved-verbatim']
      }
    ],
    retention_request: {
      max_seconds: 1200,
      recipient_may_persist_requested: true,
      retention_reason: 'complete the booking workflow'
    },
    requester_evidence_refs: ['request_evidence_1'],
    minimum_necessary_requested: true,
    source_vault_selector_in_request: false,
    requests_vault_mount: false,
    requests_raw_vault_object: false,
    grants_vault_access: false,
    grants_execution_authority: false,
    onward_disclosure_requested: false
  };
}

function baseLeases() {
  return [
    {
      schema: 'axiom-vault-access-lease.v1',
      lease_id: 'lease_accessibility_1',
      owner_subject_ref: 'owner_1',
      holder_principal_ref: 'broker_1',
      holder_runtime_ref: 'broker_runtime_1',
      vault_id: 'vault_health_1',
      purpose: 'choose an accessible hotel',
      task_class: 'travel.hotel-selection',
      issued_at: '2026-08-22T16:30:00.000Z',
      expires_at: '2026-08-22T17:30:00.000Z',
      allowed_operations: ['derive'],
      resource_scope: {
        wildcard_scope: false,
        resource_refs: ['record_accessibility_1'],
        semantic_types: ['travel.accessibility.requirements'],
        maximum_sensitivity: 'restricted'
      },
      policy_decision_ref: 'lease_policy_1',
      grant_ref: 'lease_grant_1',
      access_receipt_reservation_ref: 'reservation_accessibility_1',
      key_handle_ref: 'key_handle_accessibility_1',
      delegable: false,
      usable_outside_owner_trust_domain: false,
      contains_raw_key_material: false,
      grants_other_vault_access: false,
      grants_kernel_effect_authority: false,
      permits_raw_content_export: false,
      mutation_authority: false,
      requires_revocation_check_before_use: true,
      access_receipt_required: true
    },
    {
      schema: 'axiom-vault-access-lease.v1',
      lease_id: 'lease_name_1',
      owner_subject_ref: 'owner_1',
      holder_principal_ref: 'broker_1',
      vault_id: 'vault_identity_1',
      purpose: 'choose an accessible hotel',
      task_class: 'travel.hotel-selection',
      issued_at: '2026-08-22T16:30:00.000Z',
      expires_at: '2026-08-22T17:30:00.000Z',
      allowed_operations: ['read'],
      resource_scope: {
        wildcard_scope: false,
        resource_refs: ['record_name_1'],
        semantic_types: ['communication.preferred_name'],
        maximum_sensitivity: 'sensitive'
      },
      policy_decision_ref: 'lease_policy_2',
      grant_ref: 'lease_grant_2',
      access_receipt_reservation_ref: 'reservation_name_1',
      delegable: false,
      usable_outside_owner_trust_domain: false,
      contains_raw_key_material: false,
      grants_other_vault_access: false,
      grants_kernel_effect_authority: false,
      permits_raw_content_export: false,
      mutation_authority: false,
      requires_revocation_check_before_use: true,
      access_receipt_required: true
    }
  ];
}

function baseClaims() {
  return [
    {
      claim_id: 'claim_accessibility_1',
      semantic_type: 'travel.accessibility.requirements',
      value: {
        step_free_entry_required: true,
        elevator_required_if_room_above_ground: true
      },
      disclosure_type: 'transformed-constraint',
      sensitivity: 'sensitive',
      confidence: 0.95,
      limitations: 'Accommodation constraints only; no diagnosis or source record disclosed.',
      source_vault_id: 'vault_health_1',
      source_resource_refs: ['record_accessibility_1']
    },
    {
      claim_id: 'claim_name_1',
      semantic_type: 'communication.preferred_name',
      value: 'T.',
      disclosure_type: 'redacted',
      sensitivity: 'ordinary-private',
      limitations: 'Redacted preferred-name form for the booking note only.',
      source_vault_id: 'vault_identity_1',
      source_resource_refs: ['record_name_1']
    }
  ];
}

function baseReceipts() {
  return [
    {
      receipt_ref: 'receipt_accessibility_1',
      reservation_ref: 'reservation_accessibility_1',
      lease_id: 'lease_accessibility_1',
      owner_subject_ref: 'owner_1',
      holder_principal_ref: 'broker_1',
      vault_id: 'vault_health_1',
      purpose: 'choose an accessible hotel',
      task_class: 'travel.hotel-selection',
      recorded_at: '2026-08-22T16:50:00.000Z',
      committed: true
    },
    {
      receipt_ref: 'receipt_name_1',
      reservation_ref: 'reservation_name_1',
      lease_id: 'lease_name_1',
      owner_subject_ref: 'owner_1',
      holder_principal_ref: 'broker_1',
      vault_id: 'vault_identity_1',
      purpose: 'choose an accessible hotel',
      task_class: 'travel.hotel-selection',
      recorded_at: '2026-08-22T16:51:00.000Z',
      committed: true
    }
  ];
}

function baseRevocationChecks() {
  return [
    {
      check_ref: 'revocation_accessibility_1',
      lease_id: 'lease_accessibility_1',
      checked_at: '2026-08-22T16:40:00.000Z',
      valid_until: '2026-08-22T17:20:00.000Z',
      revoked: false
    },
    {
      check_ref: 'revocation_name_1',
      lease_id: 'lease_name_1',
      checked_at: '2026-08-22T16:40:00.000Z',
      valid_until: '2026-08-22T17:20:00.000Z',
      revoked: false
    }
  ];
}

function basePolicy() {
  return {
    schema: 'axiom-context-disclosure-policy-decision.v1',
    decision_ref: 'disclosure_policy_1',
    request_id: 'request_travel_1',
    owner_subject_ref: 'owner_1',
    recipient_principal_ref: 'travel_agent_1',
    allowed: true,
    allowed_semantic_types: [
      'travel.accessibility.requirements',
      'communication.preferred_name'
    ],
    allowed_disclosure_modes: ['transformed-constraint', 'redacted'],
    maximum_sensitivity: 'restricted',
    max_retention_seconds: 900,
    recipient_may_persist: true,
    max_capsule_lifetime_seconds: 600,
    minimum_necessary_confirmed: true
  };
}

function compile(overrides = {}) {
  return compileContextCapsule({
    request: baseRequest(),
    leases: baseLeases(),
    claims: baseClaims(),
    accessReceipts: baseReceipts(),
    revocationChecks: baseRevocationChecks(),
    policyDecision: basePolicy(),
    brokerPrincipalRef: 'broker_1',
    capsuleId: 'capsule_1',
    issuedAt: COMPILE_TIME,
    localProvenanceReceiptRefs: ['provenance_1'],
    ...overrides
  });
}

function clone(value) {
  return structuredClone(value);
}

function rejects(message) {
  return error => {
    assert.equal(error?.name, 'ValidationError');
    assert.match(error.message, message);
    return true;
  };
}

test('request and lease validators preserve the no-authority boundary', () => {
  const request = validateContextRequest(baseRequest());
  const lease = validateVaultAccessLease(baseLeases()[0]);

  assert.equal(request.valid, true);
  assert.equal(request.grants_vault_access, false);
  assert.equal(request.grants_execution_authority, false);
  assert.equal(lease.valid, true);
  assert.equal(lease.grants_kernel_effect_authority, false);
  assert.equal(lease.permits_raw_content_export, false);
});

test('compiler emits a deterministic minimized capsule and strips source identifiers', () => {
  const first = compile();
  const second = compile({
    leases: [...baseLeases()].reverse(),
    claims: [...baseClaims()].reverse(),
    accessReceipts: [...baseReceipts()].reverse(),
    revocationChecks: [...baseRevocationChecks()].reverse()
  });

  assert.deepEqual(first, second);
  assert.equal(first.capsule.capsule_sha256, second.capsule.capsule_sha256);
  assert.deepEqual(first.used_lease_ids, ['lease_accessibility_1', 'lease_name_1']);
  assert.deepEqual(
    first.used_access_receipt_refs,
    ['receipt_accessibility_1', 'receipt_name_1']
  );
  assert.deepEqual(
    first.used_revocation_check_refs,
    ['revocation_accessibility_1', 'revocation_name_1']
  );
  assert.equal(first.capsule.retention.max_seconds, 600);
  assert.equal(first.capsule.retention.recipient_may_persist, true);
  assert.equal(first.capsule.expires_at, '2026-08-22T17:10:00.000Z');
  assert.equal(first.source_identifiers_in_capsule, false);
  assert.equal(first.compiler_reads_vaults, false);
  assert.equal(first.compiler_issues_leases, false);
  assert.equal(first.compiler_delivers_capsule, false);
  assert.equal(first.grants_vault_access, false);
  assert.equal(first.grants_execution_authority, false);

  const serialized = JSON.stringify(first.capsule);
  assert.doesNotMatch(serialized, /vault_health_1|vault_identity_1/);
  assert.doesNotMatch(serialized, /record_accessibility_1|record_name_1/);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.capsule), true);
  assert.equal(Object.isFrozen(first.capsule.disclosures), true);
  assert.equal(validateContextCapsule(first.capsule).valid, true);
});

test('compiler does not mutate caller inputs', () => {
  const request = baseRequest();
  const leases = baseLeases();
  const claims = baseClaims();
  const accessReceipts = baseReceipts();
  const revocationChecks = baseRevocationChecks();
  const policyDecision = basePolicy();
  const before = clone({ request, leases, claims, accessReceipts, revocationChecks, policyDecision });

  compile({ request, leases, claims, accessReceipts, revocationChecks, policyDecision });
  assert.deepEqual(
    { request, leases, claims, accessReceipts, revocationChecks, policyDecision },
    before
  );
});

test('request cannot name a vault, request a mount, raw object, onward disclosure, or authority', () => {
  for (const [field, value] of [
    ['source_vault_selector_in_request', true],
    ['requests_vault_mount', true],
    ['requests_raw_vault_object', true],
    ['grants_vault_access', true],
    ['grants_execution_authority', true],
    ['onward_disclosure_requested', true]
  ]) {
    const request = baseRequest();
    request[field] = value;
    assert.throws(() => validateContextRequest(request), rejects(new RegExp(field)));
  }
});

test('policy may narrow but cannot broaden semantic types beyond the request', () => {
  const policyDecision = basePolicy();
  policyDecision.allowed_semantic_types.push('finance.account.balance');
  assert.throws(
    () => compile({ policyDecision }),
    rejects(/broadens semantic types beyond the request/)
  );
});

test('policy denial fails closed', () => {
  const policyDecision = basePolicy();
  policyDecision.allowed = false;
  assert.throws(
    () => compile({ policyDecision }),
    rejects(/denied the request/)
  );
});

test('candidate claim must correspond to a requested and policy-allowed semantic need', () => {
  const claims = baseClaims();
  claims[0].semantic_type = 'health.full_record';
  assert.throws(
    () => compile({ claims }),
    rejects(/was not requested by semantic type/)
  );

  const policyDecision = basePolicy();
  policyDecision.allowed_semantic_types = ['communication.preferred_name'];
  assert.throws(
    () => compile({ policyDecision }),
    rejects(/semantic type is not policy-allowed/)
  );
});

test('disclosure mode must be allowed by both request and policy', () => {
  const claims = baseClaims();
  claims[0].disclosure_type = 'derived-inference';
  assert.throws(
    () => compile({ claims }),
    rejects(/disclosure mode exceeds the request/)
  );

  const policyDecision = basePolicy();
  policyDecision.allowed_disclosure_modes = ['redacted'];
  assert.throws(
    () => compile({ policyDecision }),
    rejects(/disclosure mode is not policy-allowed/)
  );
});

test('claim sensitivity cannot exceed request, policy, or lease scope', () => {
  const request = baseRequest();
  request.semantic_needs[0].maximum_sensitivity = 'ordinary-private';
  assert.throws(
    () => compile({ request }),
    rejects(/exceeds requested sensitivity/)
  );

  const policyDecision = basePolicy();
  policyDecision.maximum_sensitivity = 'ordinary-private';
  assert.throws(
    () => compile({ policyDecision }),
    rejects(/exceeds policy sensitivity/)
  );

  const leases = baseLeases();
  leases[0].resource_scope.maximum_sensitivity = 'ordinary-private';
  assert.throws(
    () => compile({ leases }),
    rejects(/no current exact-scope vault lease/)
  );
});

test('confidence requirements fail closed for low-confidence or unscored inference', () => {
  const claims = baseClaims();
  claims[0].confidence = 0.5;
  assert.throws(
    () => compile({ claims }),
    rejects(/confidence is below the requested minimum/)
  );

  const request = baseRequest();
  delete request.semantic_needs[0].minimum_confidence;
  request.semantic_needs[0].acceptable_disclosure_modes = ['derived-inference'];
  const inferenceClaims = baseClaims();
  inferenceClaims[0].disclosure_type = 'derived-inference';
  delete inferenceClaims[0].confidence;
  const policyDecision = basePolicy();
  policyDecision.allowed_disclosure_modes.push('derived-inference');
  const leases = baseLeases();
  leases[0].allowed_operations = ['derive'];
  assert.throws(
    () => compile({ request, claims: inferenceClaims, policyDecision, leases }),
    rejects(/requires confidence/)
  );
});

test('one-vault lease scope is exact for holder, owner, purpose, resources, and operation', () => {
  const wrongHolder = baseLeases();
  wrongHolder[0].holder_principal_ref = 'other_broker';
  assert.throws(
    () => compile({ leases: wrongHolder }),
    rejects(/holder is not the compiling broker/)
  );

  const wrongOwner = baseLeases();
  wrongOwner[0].owner_subject_ref = 'owner_2';
  assert.throws(
    () => compile({ leases: wrongOwner }),
    rejects(/owner does not match context request/)
  );

  const wrongPurpose = baseLeases();
  wrongPurpose[0].purpose = 'unrelated purpose';
  assert.throws(
    () => compile({ leases: wrongPurpose }),
    rejects(/purpose or task class does not match request/)
  );

  const wrongResource = baseClaims();
  wrongResource[0].source_resource_refs = ['record_unscoped_1'];
  assert.throws(
    () => compile({ claims: wrongResource }),
    rejects(/no current exact-scope vault lease/)
  );

  const wrongOperation = baseLeases();
  wrongOperation[0].allowed_operations = ['read'];
  assert.throws(
    () => compile({ leases: wrongOperation }),
    rejects(/no current exact-scope vault lease/)
  );
});

test('verbatim disclosure requires both explicit request mode and owner confirmation', () => {
  const request = baseRequest();
  request.semantic_needs[1].acceptable_disclosure_modes = ['owner-approved-verbatim'];
  const claims = baseClaims();
  claims[1].disclosure_type = 'verbatim-approved';
  claims[1].value = 'Preferred Name';
  const policyDecision = basePolicy();
  policyDecision.allowed_disclosure_modes.push('verbatim-approved');

  assert.throws(
    () => compile({ request, claims, policyDecision }),
    rejects(/requires owner confirmation on its lease/)
  );

  const leases = baseLeases();
  leases[1].owner_confirmation_ref = 'owner_confirmation_name_1';
  const result = compile({ request, claims, policyDecision, leases });
  assert.equal(
    result.capsule.disclosures.find(item => item.semantic_type === 'communication.preferred_name')
      .disclosure_type,
    'verbatim-approved'
  );
});

test('access receipt must be committed and exactly bound to the lease reservation', () => {
  const uncommitted = baseReceipts();
  uncommitted[0].committed = false;
  assert.throws(
    () => compile({ accessReceipts: uncommitted }),
    rejects(/committed/)
  );

  const wrongReservation = baseReceipts();
  wrongReservation[0].reservation_ref = 'other_reservation';
  assert.throws(
    () => compile({ accessReceipts: wrongReservation }),
    rejects(/no committed access receipt/)
  );
});

test('revocation check must cover the actual access and current compilation time', () => {
  const noPreAccessCoverage = baseRevocationChecks();
  noPreAccessCoverage[0].checked_at = '2026-08-22T16:55:00.000Z';
  assert.throws(
    () => compile({ revocationChecks: noPreAccessCoverage }),
    rejects(/no current non-revoked lease check covering access and compilation/)
  );

  const expiredAtCompile = baseRevocationChecks();
  expiredAtCompile[0].valid_until = '2026-08-22T16:59:59.000Z';
  assert.throws(
    () => compile({ revocationChecks: expiredAtCompile }),
    rejects(/no current non-revoked lease check covering access and compilation/)
  );
});

test('a revocation after source access invalidates disclosure before compilation', () => {
  const revocationChecks = baseRevocationChecks();
  revocationChecks.push({
    check_ref: 'revocation_accessibility_revoked',
    lease_id: 'lease_accessibility_1',
    checked_at: '2026-08-22T16:59:00.000Z',
    valid_until: '2026-08-22T17:20:00.000Z',
    revoked: true
  });

  assert.throws(
    () => compile({ revocationChecks }),
    rejects(/no current non-revoked lease check covering access and compilation/)
  );
});

test('required semantic needs cannot disappear during minimization', () => {
  const claims = baseClaims().filter(
    claim => claim.semantic_type !== 'travel.accessibility.requirements'
  );
  assert.throws(
    () => compile({ claims }),
    rejects(/required semantic need was not satisfied/)
  );
});

test('retention and capsule lifetime are narrowed to request, policy, and lease limits', () => {
  const request = baseRequest();
  request.retention_request.max_seconds = 3600;
  const policyDecision = basePolicy();
  policyDecision.max_retention_seconds = 120;
  policyDecision.max_capsule_lifetime_seconds = 300;
  policyDecision.recipient_may_persist = false;

  const result = compile({ request, policyDecision });
  assert.equal(result.capsule.expires_at, '2026-08-22T17:05:00.000Z');
  assert.equal(result.capsule.retention.max_seconds, 120);
  assert.equal(result.capsule.retention.recipient_may_persist, false);
  assert.equal(result.capsule.retention.retention_class, 'ephemeral-no-persistence');
});

test('expired request or lease cannot be compiled into a capsule', () => {
  const request = baseRequest();
  request.expires_at = '2026-08-22T17:00:00.000Z';
  assert.throws(
    () => compile({ request }),
    rejects(/request is not current/)
  );

  const leases = baseLeases();
  leases[0].expires_at = '2026-08-22T17:00:00.000Z';
  assert.throws(
    () => compile({ leases }),
    rejects(/not time-current at compilation/)
  );
});

test('capsule digest detects post-compilation tampering', () => {
  const result = compile();
  const tampered = clone(result.capsule);
  tampered.disclosures[0].value = { substituted: true };
  assert.throws(
    () => validateContextCapsule(tampered),
    rejects(/digest does not match capsule content/)
  );
});

test('unknown fields fail closed on request, lease, and capsule objects', () => {
  const request = baseRequest();
  request.vault_id = 'vault_health_1';
  assert.throws(
    () => validateContextRequest(request),
    rejects(/unknown field vault_id/)
  );

  const lease = baseLeases()[0];
  lease.external_bearer_token = 'secret';
  assert.throws(
    () => validateVaultAccessLease(lease),
    rejects(/unknown field external_bearer_token/)
  );

  const capsule = clone(compile().capsule);
  capsule.source_vault_id = 'vault_health_1';
  assert.throws(
    () => validateContextCapsule(capsule),
    rejects(/unknown field source_vault_id/)
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOCAL_CONTEXT_CANDIDATE_SCHEMA,
  resolveLocalContextCandidates
} from '../src/lib/context-claim-resolution.mjs';
import { compileContextCapsule } from '../src/lib/context-broker-compiler.mjs';

const AS_OF = '2026-08-24T10:00:00.000Z';

function candidate(overrides = {}) {
  return {
    schema: LOCAL_CONTEXT_CANDIDATE_SCHEMA,
    claim_id: 'claim_accessibility_old',
    owner_subject_ref: 'owner_1',
    semantic_type: 'travel.accessibility.requirements',
    value: { step_free_entry_required: true },
    disclosure_type: 'transformed-constraint',
    sensitivity: 'sensitive',
    confidence: 0.9,
    limitations: 'Accommodation constraint only.',
    source_vault_id: 'vault_health_1',
    source_resource_refs: ['record_accessibility_1'],
    observed_at: '2026-08-23T08:00:00.000Z',
    valid_from: '2026-08-23T08:00:00.000Z',
    valid_until: null,
    supersedes: [],
    contradicts: [],
    authority_effect: 'none',
    ...overrides
  };
}

function rejects(pattern) {
  return error => {
    assert.equal(error?.name, 'ValidationError');
    assert.match(error.message, pattern);
    return true;
  };
}

test('newer explicit correction supersedes older context without rewriting history', () => {
  const older = candidate();
  const newer = candidate({
    claim_id: 'claim_accessibility_new',
    value: { step_free_entry_required: false },
    confidence: 0.98,
    observed_at: '2026-08-24T09:00:00.000Z',
    valid_from: '2026-08-24T09:00:00.000Z',
    supersedes: ['claim_accessibility_old']
  });

  const resolution = resolveLocalContextCandidates({ candidates: [older, newer], asOf: AS_OF });

  assert.deepEqual(resolution.superseded_claim_ids, ['claim_accessibility_old']);
  assert.equal(resolution.usable_claims.length, 1);
  assert.equal(resolution.usable_claims[0].claim_id, 'claim_accessibility_new');
  assert.deepEqual(resolution.usable_claims[0].value, { step_free_entry_required: false });
  assert.equal(resolution.conflicts.length, 0);
  assert.equal(resolution.authority_effect, 'none');
  assert.equal(resolution.grants_vault_access, false);
  assert.equal(resolution.grants_execution_authority, false);
});

test('explicit contradiction is withheld rather than confidence-ranked into synthetic truth', () => {
  const left = candidate({ claim_id: 'claim_left', contradicts: ['claim_right'] });
  const right = candidate({
    claim_id: 'claim_right',
    value: { step_free_entry_required: false },
    observed_at: '2026-08-24T08:30:00.000Z',
    valid_from: '2026-08-24T08:30:00.000Z',
    confidence: 0.99
  });

  const resolution = resolveLocalContextCandidates({ candidates: [right, left], asOf: AS_OF });

  assert.equal(resolution.usable_claims.length, 0);
  assert.deepEqual(resolution.conflicts, [{
    semantic_type: 'travel.accessibility.requirements',
    reason: 'explicit_contradiction',
    claim_ids: ['claim_left', 'claim_right']
  }]);
});

test('unresolved active value disagreement is withheld even without explicit contradiction metadata', () => {
  const first = candidate({ claim_id: 'claim_first' });
  const second = candidate({
    claim_id: 'claim_second',
    value: { step_free_entry_required: false },
    observed_at: '2026-08-24T09:00:00.000Z',
    valid_from: '2026-08-24T09:00:00.000Z'
  });

  const resolution = resolveLocalContextCandidates({ candidates: [first, second], asOf: AS_OF });

  assert.equal(resolution.usable_claims.length, 0);
  assert.deepEqual(resolution.conflicts, [{
    semantic_type: 'travel.accessibility.requirements',
    reason: 'active_value_disagreement',
    claim_ids: ['claim_first', 'claim_second']
  }]);
});

test('same-value compatible observations select the newest claim and retain corroboration metadata locally', () => {
  const first = candidate({ claim_id: 'claim_first' });
  const second = candidate({
    claim_id: 'claim_second',
    source_resource_refs: ['record_accessibility_2'],
    observed_at: '2026-08-24T09:00:00.000Z',
    valid_from: '2026-08-24T09:00:00.000Z'
  });

  const resolution = resolveLocalContextCandidates({ candidates: [first, second], asOf: AS_OF });

  assert.equal(resolution.usable_claims.length, 1);
  assert.equal(resolution.usable_claims[0].claim_id, 'claim_second');
  assert.deepEqual(resolution.corroboration, [{
    semantic_type: 'travel.accessibility.requirements',
    selected_claim_id: 'claim_second',
    corroborating_claim_ids: ['claim_first']
  }]);
});

test('future and expired claims stay out of the usable disclosure set', () => {
  const expired = candidate({
    claim_id: 'claim_expired',
    valid_until: '2026-08-24T09:00:00.000Z'
  });
  const future = candidate({
    claim_id: 'claim_future',
    observed_at: '2026-08-24T11:00:00.000Z',
    valid_from: '2026-08-24T11:00:00.000Z'
  });

  const resolution = resolveLocalContextCandidates({ candidates: [expired, future], asOf: AS_OF });

  assert.equal(resolution.usable_claims.length, 0);
  assert.deepEqual(
    resolution.temporally_ineligible_claim_ids,
    ['claim_expired', 'claim_future']
  );
});

test('resolver refuses silent truncation and relationship or authority widening', () => {
  assert.throws(
    () => resolveLocalContextCandidates({
      candidates: [candidate(), candidate({ claim_id: 'claim_2' })],
      asOf: AS_OF,
      maxCandidates: 1
    }),
    rejects(/refusing silent truncation/)
  );

  const crossType = candidate({
    claim_id: 'claim_cross_type',
    semantic_type: 'communication.preferred_name',
    value: 'T.',
    source_vault_id: 'vault_identity_1',
    source_resource_refs: ['record_name_1'],
    supersedes: ['claim_accessibility_old']
  });
  assert.throws(
    () => resolveLocalContextCandidates({ candidates: [candidate(), crossType], asOf: AS_OF }),
    rejects(/relationships must remain within one owner and semantic type/)
  );

  assert.throws(
    () => resolveLocalContextCandidates({
      candidates: [candidate({ authority_effect: 'execution' })],
      asOf: AS_OF
    }),
    rejects(/authority_effect must be none/)
  );
});

test('resolved claim feeds the existing lease-bound Context Capsule compiler without a new route or authority envelope', () => {
  const oldClaim = candidate();
  const newClaim = candidate({
    claim_id: 'claim_accessibility_new',
    observed_at: '2026-08-24T09:00:00.000Z',
    valid_from: '2026-08-24T09:00:00.000Z',
    supersedes: ['claim_accessibility_old']
  });
  const resolution = resolveLocalContextCandidates({ candidates: [oldClaim, newClaim], asOf: AS_OF });

  const compiled = compileContextCapsule({
    request: {
      schema: 'axiom-context-request.v1',
      request_id: 'request_travel_1',
      owner_subject_ref: 'owner_1',
      requester_principal_ref: 'assistant_1',
      recipient_principal_ref: 'travel_agent_1',
      destination_ref: 'destination_travel_1',
      purpose: 'choose an accessible hotel',
      task_class: 'travel.hotel-selection',
      issued_at: '2026-08-24T09:30:00.000Z',
      expires_at: '2026-08-24T11:00:00.000Z',
      semantic_needs: [{
        semantic_type: 'travel.accessibility.requirements',
        need: 'minimum accommodation constraints needed to select a hotel',
        required: true,
        maximum_sensitivity: 'restricted',
        acceptable_disclosure_modes: ['transformed-constraint'],
        minimum_confidence: 0.8
      }],
      retention_request: {
        max_seconds: 600,
        recipient_may_persist_requested: false,
        retention_reason: 'complete hotel selection'
      },
      requester_evidence_refs: ['request_evidence_1'],
      minimum_necessary_requested: true,
      source_vault_selector_in_request: false,
      requests_vault_mount: false,
      requests_raw_vault_object: false,
      grants_vault_access: false,
      grants_execution_authority: false,
      onward_disclosure_requested: false
    },
    leases: [{
      schema: 'axiom-vault-access-lease.v1',
      lease_id: 'lease_accessibility_1',
      owner_subject_ref: 'owner_1',
      holder_principal_ref: 'broker_1',
      holder_runtime_ref: 'broker_runtime_1',
      vault_id: 'vault_health_1',
      purpose: 'choose an accessible hotel',
      task_class: 'travel.hotel-selection',
      issued_at: '2026-08-24T09:40:00.000Z',
      expires_at: '2026-08-24T10:30:00.000Z',
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
    }],
    claims: resolution.usable_claims,
    accessReceipts: [{
      receipt_ref: 'receipt_accessibility_1',
      reservation_ref: 'reservation_accessibility_1',
      lease_id: 'lease_accessibility_1',
      owner_subject_ref: 'owner_1',
      holder_principal_ref: 'broker_1',
      vault_id: 'vault_health_1',
      purpose: 'choose an accessible hotel',
      task_class: 'travel.hotel-selection',
      recorded_at: '2026-08-24T09:50:00.000Z',
      committed: true
    }],
    revocationChecks: [{
      check_ref: 'revocation_accessibility_1',
      lease_id: 'lease_accessibility_1',
      checked_at: '2026-08-24T09:55:00.000Z',
      valid_until: '2026-08-24T10:20:00.000Z',
      revoked: false
    }],
    policyDecision: {
      schema: 'axiom-context-disclosure-policy-decision.v1',
      decision_ref: 'disclosure_policy_1',
      request_id: 'request_travel_1',
      owner_subject_ref: 'owner_1',
      recipient_principal_ref: 'travel_agent_1',
      allowed: true,
      allowed_semantic_types: ['travel.accessibility.requirements'],
      allowed_disclosure_modes: ['transformed-constraint'],
      maximum_sensitivity: 'restricted',
      max_retention_seconds: 600,
      recipient_may_persist: false,
      max_capsule_lifetime_seconds: 600,
      minimum_necessary_confirmed: true
    },
    brokerPrincipalRef: 'broker_1',
    capsuleId: 'capsule_reconciled_1',
    issuedAt: AS_OF,
    localProvenanceReceiptRefs: ['resolution_provenance_1']
  });

  assert.equal(compiled.capsule.disclosures.length, 1);
  assert.equal(compiled.capsule.disclosures[0].claim_id, 'claim_accessibility_new');
  assert.equal(compiled.grants_vault_access, false);
  assert.equal(compiled.grants_execution_authority, false);
  assert.equal(compiled.source_identifiers_in_capsule, false);
  assert.doesNotMatch(JSON.stringify(compiled.capsule), /vault_health_1|record_accessibility_1/);
});

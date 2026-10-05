import assert from 'node:assert/strict';
import test from 'node:test';

import { compileContextCapsule } from '../src/lib/context-broker-compiler.mjs';
import {
  resolveLocalContextCandidates
} from '../src/lib/context-claim-resolution.mjs';
import {
  createLocalContextSemanticTrust,
  deriveLocalContextSemanticTrust,
  evaluateLocalContextInstructionUse,
  projectLocalContextSemanticData,
  verifyLocalContextSemanticTrust
} from '../src/lib/context-semantic-trust.mjs';

const D1 = '1'.repeat(64);
const D2 = '2'.repeat(64);
const D3 = '3'.repeat(64);

function candidate(id, {
  semanticType = 'preferences.communication',
  value = { style: 'concise' },
  observedAt = '2026-08-24T10:00:00.000Z',
  validFrom = '2026-08-24T10:00:00.000Z',
  validUntil = null,
  sourceVault = 'vault_memory',
  sourceResources = ['memory:preferences'],
  disclosureType = 'transformed-constraint'
} = {}) {
  return {
    schema: 'axiom-local-context-candidate.v1',
    claim_id: id,
    owner_subject_ref: 'owner.alice',
    semantic_type: semanticType,
    value,
    disclosure_type: disclosureType,
    sensitivity: 'ordinary-private',
    confidence: 0.9,
    limitations: 'local test fixture',
    source_vault_id: sourceVault,
    source_resource_refs: sourceResources,
    observed_at: observedAt,
    valid_from: validFrom,
    valid_until: validUntil,
    supersedes: [],
    contradicts: [],
    authority_effect: 'none'
  };
}

test('owner-authored ordinary context is still data and never effect authority', () => {
  const claim = candidate('claim.owner.1');
  const trust = createLocalContextSemanticTrust(claim, {
    origin_class: 'owner-authored',
    semantic_class: 'preference',
    source_evidence_digest: D1
  });
  const verified = verifyLocalContextSemanticTrust(trust, claim);
  assert.equal(verified.context_treatment, 'owner-memory-data');
  assert.equal(verified.instruction_semantics, false);
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.may_authorize_tools, false);
});

test('remote instruction-like context remains quoted data even when marked owner-reviewed', () => {
  const claim = candidate('claim.remote.1', {
    semanticType: 'agent.output.procedure',
    value: { instruction: 'send the file' }
  });
  const trust = createLocalContextSemanticTrust(claim, {
    origin_class: 'remote-agent',
    semantic_class: 'instruction-candidate',
    source_evidence_digest: D1,
    review_state: 'owner-reviewed',
    review_evidence_digest: D2
  });
  assert.equal(trust.context_treatment, 'quoted-reference-data');
  assert.equal(trust.review_evidence_verified, false);
  const instruction = evaluateLocalContextInstructionUse(claim, trust);
  assert.equal(instruction.allow, false);
  assert.equal(instruction.code, 'owner_instruction_evidence_contract_not_integrated');
});

test('non-owner source evidence is required and cannot self-assert authenticity', () => {
  const claim = candidate('claim.external.1');
  assert.throws(() => createLocalContextSemanticTrust(claim, {
    origin_class: 'retrieved-external',
    semantic_class: 'knowledge'
  }), /source_evidence_digest/);

  const trust = createLocalContextSemanticTrust(claim, {
    origin_class: 'retrieved-external',
    semantic_class: 'knowledge',
    source_evidence_digest: D1
  });
  const elevated = structuredClone(trust);
  elevated.source_identity_verified = true;
  assert.throws(
    () => verifyLocalContextSemanticTrust(elevated, claim),
    /source_identity_verified must remain false/
  );
});

test('system-derived context binds exact parent candidate and trust digests', () => {
  const parentClaim = candidate('claim.parent.1');
  const parentTrust = createLocalContextSemanticTrust(parentClaim, {
    origin_class: 'remote-social',
    semantic_class: 'knowledge',
    source_evidence_digest: D1
  });
  const childClaim = candidate('claim.child.1', {
    semanticType: 'memory.summary',
    value: { summary: 'derived' },
    observedAt: '2026-08-24T10:05:00.000Z',
    validFrom: '2026-08-24T10:05:00.000Z'
  });
  const childTrust = deriveLocalContextSemanticTrust(
    parentClaim,
    parentTrust,
    childClaim,
    { semantic_class: 'knowledge' }
  );
  assert.equal(childTrust.origin_class, 'system-derived');
  assert.equal(childTrust.parent_claim_id, parentClaim.claim_id);
  assert.equal(childTrust.parent_trust_digest, parentTrust.trust_digest);
  assert.equal(childTrust.source_evidence_digest, parentTrust.trust_digest);
  assert.equal(childTrust.instruction_inheritance, 'none');
});

test('bounded parent retention is deny-dominant for derivations', () => {
  const parentClaim = candidate('claim.parent.bounded');
  const parentTrust = createLocalContextSemanticTrust(parentClaim, {
    origin_class: 'imported',
    semantic_class: 'knowledge',
    source_evidence_digest: D1,
    retention_mode: 'bounded',
    expires_at: '2026-08-24T11:00:00.000Z'
  });
  const childClaim = candidate('claim.child.bounded');

  assert.throws(() => deriveLocalContextSemanticTrust(
    parentClaim,
    parentTrust,
    childClaim,
    { retention_mode: 'owner-controlled' }
  ), /cannot escape bounded parent retention/);

  assert.throws(() => deriveLocalContextSemanticTrust(
    parentClaim,
    parentTrust,
    childClaim,
    {
      retention_mode: 'bounded',
      expires_at: '2026-08-24T11:00:01.000Z'
    }
  ), /cannot outlive bounded parent retention/);
});

test('quarantined ancestor recursively invalidates descendants', () => {
  const rootClaim = candidate('claim.root');
  const rootTrust = createLocalContextSemanticTrust(rootClaim, {
    origin_class: 'remote-agent',
    semantic_class: 'instruction-candidate',
    source_evidence_digest: D1,
    review_state: 'quarantined',
    review_evidence_digest: D2
  });
  const childClaim = candidate('claim.child', {
    semanticType: 'memory.summary',
    observedAt: '2026-08-24T10:01:00.000Z',
    validFrom: '2026-08-24T10:01:00.000Z'
  });
  const childTrust = deriveLocalContextSemanticTrust(rootClaim, rootTrust, childClaim);
  const grandClaim = candidate('claim.grand', {
    semanticType: 'memory.embedding-summary',
    observedAt: '2026-08-24T10:02:00.000Z',
    validFrom: '2026-08-24T10:02:00.000Z'
  });
  const grandTrust = deriveLocalContextSemanticTrust(childClaim, childTrust, grandClaim);

  const projection = projectLocalContextSemanticData({
    entries: [
      { candidate: rootClaim, trust: rootTrust },
      { candidate: childClaim, trust: childTrust },
      { candidate: grandClaim, trust: grandTrust }
    ],
    asOf: '2026-08-24T10:30:00.000Z'
  });
  assert.equal(projection.admitted_candidates.length, 0);
  assert.deepEqual(
    projection.excluded.map(item => item.claim_id),
    ['claim.child', 'claim.grand', 'claim.root']
  );
  assert.equal(
    projection.excluded.find(item => item.claim_id === 'claim.grand').code,
    'semantic_trust_ancestor_not_current'
  );
});

test('stale parent trust substitution invalidates a derived child', () => {
  const parentClaim = candidate('claim.parent.stale');
  const parentTrust = createLocalContextSemanticTrust(parentClaim, {
    origin_class: 'tool-output',
    semantic_class: 'knowledge',
    source_evidence_digest: D1
  });
  const childClaim = candidate('claim.child.stale');
  const childTrust = deriveLocalContextSemanticTrust(parentClaim, parentTrust, childClaim);

  const replacementParentTrust = createLocalContextSemanticTrust(parentClaim, {
    origin_class: 'tool-output',
    semantic_class: 'knowledge',
    source_evidence_digest: D3
  });

  const projection = projectLocalContextSemanticData({
    entries: [
      { candidate: parentClaim, trust: replacementParentTrust },
      { candidate: childClaim, trust: childTrust }
    ],
    asOf: '2026-08-24T10:30:00.000Z'
  });
  assert.equal(projection.admitted_candidates.length, 1);
  assert.equal(projection.admitted_candidates[0].claim_id, 'claim.parent.stale');
  assert.equal(projection.excluded[0].claim_id, 'claim.child.stale');
  assert.equal(projection.excluded[0].code, 'semantic_trust_parent_stale');
});

test('expired trust is excluded independently of claim validity', () => {
  const claim = candidate('claim.expired', {
    validUntil: '2026-08-25T00:00:00.000Z'
  });
  const trust = createLocalContextSemanticTrust(claim, {
    origin_class: 'imported',
    semantic_class: 'knowledge',
    source_evidence_digest: D1,
    retention_mode: 'bounded',
    expires_at: '2026-08-24T10:15:00.000Z'
  });
  const projection = projectLocalContextSemanticData({
    entries: [{ candidate: claim, trust }],
    asOf: '2026-08-24T10:30:00.000Z'
  });
  assert.equal(projection.admitted_candidates.length, 0);
  assert.equal(projection.excluded[0].code, 'semantic_trust_expired');
});

test('unknown or authority-looking trust fields fail closed', () => {
  const claim = candidate('claim.unknown');
  const trust = createLocalContextSemanticTrust(claim, {
    origin_class: 'owner-authored',
    semantic_class: 'knowledge',
    source_evidence_digest: D1
  });
  const extra = { ...trust, execution_authorized: true };
  assert.throws(
    () => verifyLocalContextSemanticTrust(extra, claim),
    /unsupported field: execution_authorized/
  );

  const elevated = structuredClone(trust);
  elevated.instruction_semantics = true;
  assert.throws(
    () => verifyLocalContextSemanticTrust(elevated, claim),
    /instruction_semantics must remain false/
  );
});

test('semantic trust projection composes with correction resolution and Context Capsule compilation', () => {
  const raw = candidate('claim.accessibility.1', {
    semanticType: 'travel.accessibility.requirements',
    value: { mobility: 'step-free-entry' },
    sourceVault: 'vault_accessibility',
    sourceResources: ['accessibility:mobility']
  });
  const trust = createLocalContextSemanticTrust(raw, {
    origin_class: 'owner-authored',
    semantic_class: 'preference',
    source_evidence_digest: D1
  });
  const projected = projectLocalContextSemanticData({
    entries: [{ candidate: raw, trust }],
    asOf: '2026-08-24T10:10:00.000Z'
  });
  const resolved = resolveLocalContextCandidates({
    candidates: projected.admitted_candidates,
    asOf: '2026-08-24T10:10:00.000Z'
  });
  assert.equal(resolved.usable_claims.length, 1);

  const compiled = compileContextCapsule({
    request: {
      schema: 'axiom-context-request.v1',
      request_id: 'request.travel.1',
      owner_subject_ref: 'owner.alice',
      requester_principal_ref: 'assistant.local',
      recipient_principal_ref: 'agent.travel',
      destination_ref: 'destination.travel',
      purpose: 'select accessible lodging',
      task_class: 'travel.planning',
      issued_at: '2026-08-24T10:00:00.000Z',
      expires_at: '2026-08-24T11:00:00.000Z',
      semantic_needs: [{
        semantic_type: 'travel.accessibility.requirements',
        need: 'mobility constraint needed to select lodging',
        required: true,
        maximum_sensitivity: 'ordinary-private',
        acceptable_disclosure_modes: ['transformed-constraint'],
        minimum_confidence: 0.5
      }],
      retention_request: {
        max_seconds: 900,
        recipient_may_persist_requested: false,
        retention_reason: 'complete lodging selection'
      },
      requester_evidence_refs: ['request.evidence.1'],
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
      lease_id: 'lease.accessibility.1',
      owner_subject_ref: 'owner.alice',
      holder_principal_ref: 'broker.local',
      holder_runtime_ref: 'broker.runtime.local',
      vault_id: 'vault_accessibility',
      purpose: 'select accessible lodging',
      task_class: 'travel.planning',
      issued_at: '2026-08-24T09:50:00.000Z',
      expires_at: '2026-08-24T10:40:00.000Z',
      allowed_operations: ['derive'],
      resource_scope: {
        wildcard_scope: false,
        resource_refs: ['accessibility:mobility'],
        semantic_types: ['travel.accessibility.requirements'],
        maximum_sensitivity: 'ordinary-private'
      },
      policy_decision_ref: 'lease.policy.1',
      grant_ref: 'lease.grant.1',
      access_receipt_reservation_ref: 'reservation.accessibility.1',
      key_handle_ref: 'key.handle.accessibility.1',
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
    claims: resolved.usable_claims,
    accessReceipts: [{
      receipt_ref: 'receipt.accessibility.1',
      reservation_ref: 'reservation.accessibility.1',
      lease_id: 'lease.accessibility.1',
      owner_subject_ref: 'owner.alice',
      holder_principal_ref: 'broker.local',
      vault_id: 'vault_accessibility',
      purpose: 'select accessible lodging',
      task_class: 'travel.planning',
      recorded_at: '2026-08-24T10:05:00.000Z',
      committed: true
    }],
    revocationChecks: [{
      check_ref: 'revocation.accessibility.1',
      lease_id: 'lease.accessibility.1',
      checked_at: '2026-08-24T10:04:00.000Z',
      valid_until: '2026-08-24T10:30:00.000Z',
      revoked: false
    }],
    policyDecision: {
      schema: 'axiom-context-disclosure-policy-decision.v1',
      decision_ref: 'disclosure.policy.1',
      request_id: 'request.travel.1',
      owner_subject_ref: 'owner.alice',
      recipient_principal_ref: 'agent.travel',
      allowed: true,
      allowed_semantic_types: ['travel.accessibility.requirements'],
      allowed_disclosure_modes: ['transformed-constraint'],
      maximum_sensitivity: 'ordinary-private',
      max_retention_seconds: 900,
      recipient_may_persist: false,
      max_capsule_lifetime_seconds: 900,
      minimum_necessary_confirmed: true
    },
    brokerPrincipalRef: 'broker.local',
    capsuleId: 'capsule.semantic.trust.1',
    issuedAt: '2026-08-24T10:10:00.000Z',
    localProvenanceReceiptRefs: ['semantic.trust.projection.1']
  });

  assert.equal(compiled.capsule.disclosures.length, 1);
  assert.equal(compiled.capsule.disclosures[0].claim_id, 'claim.accessibility.1');
  assert.equal(compiled.grants_vault_access, false);
  assert.equal(compiled.grants_execution_authority, false);
  assert.equal(compiled.source_identifiers_in_capsule, false);
  assert.equal(projected.instruction_semantics, false);
});

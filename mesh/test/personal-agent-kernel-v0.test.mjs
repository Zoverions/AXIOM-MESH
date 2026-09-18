import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assessPersonalAgentAutonomyPromotion,
  assessPersonalAgentKernelProposal,
  assessPersonalAgentMemoryCandidate,
  buildPersonalAgentKernelContinuityDescriptor,
  validatePersonalAgentKernelV0
} from '../src/lib/personal-agent-kernel-v0.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const NOW = '2026-09-18T12:30:00Z';

function validKernel() {
  return {
    schema: 'axiom-personal-agent-kernel.v0',
    kernel_id: 'personal-kernel:owner-1',
    kernel_version: '0.1.0',
    owner_subject_ref: 'subject:owner-1',
    identity_binding: {
      principal_ref: 'principal:personal-agent-1',
      personal_agent_pack_ref: 'pack:owner-1',
      personal_agent_pack_sha256: SHA_A,
      runtime_identity_is_replaceable: true,
      model_identity_is_replaceable: true,
      model_is_identity_root: false,
      runtime_is_identity_root: false
    },
    constitution: {
      constitution_id: 'constitution:owner-1',
      amendment_policy_ref: 'policy:constitution-amendment-1',
      owner_stop_right: true,
      owner_inspect_right: true,
      owner_revoke_right: true,
      owner_export_right: true,
      self_amendment_allowed: false,
      subdelegation_may_expand_authority: false,
      authority_may_be_inferred_from_knowledge: false,
      memory_may_create_authority: false,
      model_output_may_create_authority: false,
      earned_autonomy_may_create_authority: false,
      effect_requires_mesh_authority: true
    },
    authority_budgets: [
      {
        budget_id: 'budget:purchase-actions',
        dimension: 'actions',
        unit: 'count',
        ceiling: 10,
        consumed: 3,
        applies_to_capability_refs: ['capability:purchase'],
        valid_from: '2026-09-18T00:00:00Z',
        expires_at: '2026-09-19T00:00:00Z'
      },
      {
        budget_id: 'budget:purchase-cad',
        dimension: 'minor-currency-units',
        unit: 'minor-units',
        currency: 'CAD',
        ceiling: 20000,
        consumed: 5000,
        applies_to_capability_refs: ['capability:purchase'],
        valid_from: '2026-09-18T00:00:00Z',
        expires_at: '2026-09-19T00:00:00Z'
      }
    ],
    memory_immune_policy: {
      default_disposition: 'quarantine',
      require_provenance: true,
      preserve_contradictions: true,
      unverified_provenance_must_quarantine: true,
      derived_memory_requires_independent_evidence: true,
      minimum_independent_evidence_refs_for_derived: 2,
      direct_admission_source_kinds: [
        'owner-direct',
        'signed-local-artifact',
        'verified-remote-artifact'
      ],
      derived_source_kinds: [
        'agent-inference',
        'third-party',
        'imported-memory'
      ],
      quarantine_grants_authority: false,
      admission_grants_authority: false
    },
    earned_autonomy: [
      {
        capability_ref: 'capability:purchase',
        level: 'prepare',
        successful_receipts: 8,
        failed_receipts: 0,
        evidence_refs: ['receipt:1', 'receipt:2', 'receipt:3'],
        promotion_policy: {
          next_level: 'request-effect',
          minimum_successful_receipts: 10,
          maximum_failed_receipts: 1,
          minimum_evidence_refs: 3
        },
        promotion_decision_ref: 'decision:prepare-purchase',
        last_reviewed_at: '2026-09-18T08:00:00Z'
      }
    ],
    continuity: {
      personal_agent_pack_ref: 'pack:owner-1',
      personal_agent_pack_sha256: SHA_A,
      restore_policy_ref: 'policy:restore-owner-1',
      portable_across_models: true,
      portable_across_providers: true,
      portable_across_runtimes: true,
      selective_restore_required: true,
      raw_secret_material_included: false,
      import_grants_authority: false,
      restore_grants_authority: false
    },
    non_claims: {
      network_effect: false,
      storage_effect: false,
      credential_effect: false,
      execution_effect: false,
      policy_mutation_effect: false,
      capability_promotion_effect: false,
      opens_vaults: false,
      grants_execution_authority: false
    },
    created_at: '2026-09-18T08:00:00Z',
    updated_at: '2026-09-18T12:00:00Z'
  };
}

function validProposal() {
  return {
    schema: 'axiom-personal-agent-kernel-proposal.v0',
    proposal_id: 'proposal:purchase-1',
    owner_subject_ref: 'subject:owner-1',
    capability_ref: 'capability:purchase',
    purpose_ref: 'purpose:owner-requested-purchase',
    requested_autonomy_level: 'prepare',
    budget_requests: [
      {
        budget_id: 'budget:purchase-actions',
        amount: 1,
        unit: 'count'
      },
      {
        budget_id: 'budget:purchase-cad',
        amount: 2500,
        unit: 'minor-units',
        currency: 'CAD'
      }
    ],
    memory_refs: ['memory:preference-1'],
    uses_quarantined_memory: false,
    effect_requested: false
  };
}

function directMemoryCandidate() {
  return {
    schema: 'axiom-personal-agent-memory-candidate.v0',
    candidate_id: 'memory-candidate:1',
    owner_subject_ref: 'subject:owner-1',
    content_sha256: SHA_B,
    source_ref: 'source:owner-statement-1',
    source_kind: 'owner-direct',
    provenance_verified: true,
    independent_evidence_refs: [],
    contradicts_memory_refs: [],
    requested_persistence: 'durable',
    sensitivity: 'ordinary-private',
    content_embedded: false,
    secret_material_embedded: false
  };
}

function validPromotionEvidence() {
  return {
    schema: 'axiom-personal-agent-autonomy-evidence.v0',
    owner_subject_ref: 'subject:owner-1',
    capability_ref: 'capability:purchase',
    target_level: 'request-effect',
    successful_receipts: 12,
    failed_receipts: 1,
    evidence_refs: ['receipt:10', 'receipt:11', 'receipt:12'],
    at: '2026-09-18T12:15:00Z'
  };
}

function clone(value) {
  return structuredClone(value);
}

test('Personal Agent Kernel v0 is deterministic and explicitly non-authorizing', () => {
  const kernel = validKernel();
  const first = validatePersonalAgentKernelV0(kernel);
  const reordered = Object.fromEntries(Object.entries(kernel).reverse());
  const second = validatePersonalAgentKernelV0(reordered);

  assert.equal(first.valid, true);
  assert.equal(first.authority_budgets, 2);
  assert.equal(first.earned_autonomy_capabilities, 1);
  assert.equal(first.canonical_sha256, second.canonical_sha256);
  assert.equal(first.network_effect, false);
  assert.equal(first.storage_effect, false);
  assert.equal(first.credential_effect, false);
  assert.equal(first.execution_effect, false);
  assert.equal(first.policy_mutation_effect, false);
  assert.equal(first.grants_execution_authority, false);
});

test('constitution fails closed on self-amendment and inferred authority', () => {
  const selfAmending = validKernel();
  selfAmending.constitution.self_amendment_allowed = true;
  assert.throws(
    () => validatePersonalAgentKernelV0(selfAmending),
    /self_amendment_allowed/
  );

  const memoryAuthority = validKernel();
  memoryAuthority.constitution.memory_may_create_authority = true;
  assert.throws(
    () => validatePersonalAgentKernelV0(memoryAuthority),
    /memory_may_create_authority/
  );

  const modelAuthority = validKernel();
  modelAuthority.constitution.model_output_may_create_authority = true;
  assert.throws(
    () => validatePersonalAgentKernelV0(modelAuthority),
    /model_output_may_create_authority/
  );

  const unknown = validKernel();
  unknown.constitution.hidden_override = true;
  assert.throws(
    () => validatePersonalAgentKernelV0(unknown),
    /unknown field hidden_override/
  );
});

test('identity and continuity stay bound to one exact Personal Agent Pack', () => {
  const drift = validKernel();
  drift.continuity.personal_agent_pack_sha256 = SHA_B;
  assert.throws(
    () => validatePersonalAgentKernelV0(drift),
    /must match identity binding/
  );

  const modelRoot = validKernel();
  modelRoot.identity_binding.model_is_identity_root = true;
  assert.throws(
    () => validatePersonalAgentKernelV0(modelRoot),
    /model_is_identity_root/
  );

  const restoreAuthority = validKernel();
  restoreAuthority.continuity.restore_grants_authority = true;
  assert.throws(
    () => validatePersonalAgentKernelV0(restoreAuthority),
    /restore_grants_authority/
  );
});

test('authority budgets use exact units and currency semantics', () => {
  const wrongUnit = validKernel();
  wrongUnit.authority_budgets[0].unit = 'seconds';
  assert.throws(
    () => validatePersonalAgentKernelV0(wrongUnit),
    /authority_budgets\[0\]\.unit/
  );

  const missingCurrency = validKernel();
  delete missingCurrency.authority_budgets[1].currency;
  assert.throws(
    () => validatePersonalAgentKernelV0(missingCurrency),
    /currency/
  );

  const strayCurrency = validKernel();
  strayCurrency.authority_budgets[0].currency = 'CAD';
  assert.throws(
    () => validatePersonalAgentKernelV0(strayCurrency),
    /only valid for minor-currency-units/
  );
});

test('proposal assessment can pass personal policy without authorizing or executing', () => {
  const kernel = validKernel();
  const proposal = validProposal();
  const beforeKernel = clone(kernel);
  const beforeProposal = clone(proposal);

  const result = assessPersonalAgentKernelProposal(
    kernel,
    proposal,
    { at: NOW }
  );

  assert.equal(result.eligible_within_personal_policy, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.effect_requested, false);
  assert.equal(result.requires_mesh_authority_verification, false);
  assert.equal(result.mesh_authority_verified, false);
  assert.equal(result.effect_performed, false);
  assert.equal(result.grants_execution_authority, false);
  assert.deepEqual(kernel, beforeKernel);
  assert.deepEqual(proposal, beforeProposal);
});

test('effect request remains non-authorizing even at the personal request-effect level', () => {
  const kernel = validKernel();
  kernel.earned_autonomy[0].level = 'request-effect';
  kernel.earned_autonomy[0].promotion_policy = {
    next_level: 'none',
    minimum_successful_receipts: 0,
    maximum_failed_receipts: 0,
    minimum_evidence_refs: 0
  };
  kernel.earned_autonomy[0].promotion_decision_ref =
    'decision:request-effect-purchase';

  const proposal = validProposal();
  proposal.requested_autonomy_level = 'request-effect';
  proposal.effect_requested = true;

  const result = assessPersonalAgentKernelProposal(
    kernel,
    proposal,
    { at: NOW }
  );

  assert.equal(result.eligible_within_personal_policy, true);
  assert.equal(result.requires_mesh_authority_verification, true);
  assert.equal(result.mesh_authority_verified, false);
  assert.equal(result.effect_performed, false);
  assert.equal(result.grants_execution_authority, false);
});

test('proposal assessment fails closed on omitted, expired, exceeded, or mismatched budgets', () => {
  const missing = validProposal();
  missing.budget_requests = missing.budget_requests.filter(
    request => request.budget_id !== 'budget:purchase-cad'
  );
  const missingResult = assessPersonalAgentKernelProposal(
    validKernel(),
    missing,
    { at: NOW }
  );
  assert.equal(missingResult.eligible_within_personal_policy, false);
  assert.ok(
    missingResult.blockers.includes(
      'missing-applicable-budget:budget:purchase-cad'
    )
  );

  const exceeded = validProposal();
  exceeded.budget_requests[1].amount = 15001;
  const exceededResult = assessPersonalAgentKernelProposal(
    validKernel(),
    exceeded,
    { at: NOW }
  );
  assert.equal(exceededResult.eligible_within_personal_policy, false);
  assert.ok(
    exceededResult.blockers.includes(
      'budget-exceeded:budget:purchase-cad'
    )
  );

  const expiredKernel = validKernel();
  expiredKernel.authority_budgets[0].expires_at = '2026-09-18T12:00:00Z';
  const expiredResult = assessPersonalAgentKernelProposal(
    expiredKernel,
    validProposal(),
    { at: NOW }
  );
  assert.equal(expiredResult.eligible_within_personal_policy, false);
  assert.ok(
    expiredResult.blockers.includes(
      'budget-not-current:budget:purchase-actions'
    )
  );

  const wrongCurrency = validProposal();
  wrongCurrency.budget_requests[1].currency = 'USD';
  const currencyResult = assessPersonalAgentKernelProposal(
    validKernel(),
    wrongCurrency,
    { at: NOW }
  );
  assert.equal(currencyResult.eligible_within_personal_policy, false);
  assert.ok(
    currencyResult.blockers.includes(
      'budget-currency-mismatch:budget:purchase-cad'
    )
  );
});

test('proposal assessment fails closed on autonomy escalation and quarantined memory', () => {
  const escalation = validProposal();
  escalation.requested_autonomy_level = 'request-effect';
  escalation.effect_requested = true;
  const escalationResult = assessPersonalAgentKernelProposal(
    validKernel(),
    escalation,
    { at: NOW }
  );
  assert.equal(escalationResult.eligible_within_personal_policy, false);
  assert.ok(
    escalationResult.blockers.includes(
      'requested-autonomy-exceeds-earned-ceiling'
    )
  );

  const quarantine = validProposal();
  quarantine.uses_quarantined_memory = true;
  const quarantineResult = assessPersonalAgentKernelProposal(
    validKernel(),
    quarantine,
    { at: NOW }
  );
  assert.equal(quarantineResult.eligible_within_personal_policy, false);
  assert.ok(
    quarantineResult.blockers.includes(
      'quarantined-memory-cannot-support-proposal'
    )
  );
});

test('memory immune system admits provenance, quarantines uncertainty, and certifies no truth', () => {
  const direct = assessPersonalAgentMemoryCandidate(
    validKernel(),
    directMemoryCandidate()
  );
  assert.equal(direct.disposition, 'admit-durable');
  assert.equal(direct.truth_certified, false);
  assert.equal(direct.content_persisted_by_evaluator, false);
  assert.equal(direct.grants_execution_authority, false);

  const unverified = directMemoryCandidate();
  unverified.provenance_verified = false;
  const unverifiedResult = assessPersonalAgentMemoryCandidate(
    validKernel(),
    unverified
  );
  assert.equal(unverifiedResult.disposition, 'quarantine');
  assert.ok(unverifiedResult.reasons.includes('provenance-unverified'));

  const contradiction = directMemoryCandidate();
  contradiction.contradicts_memory_refs = ['memory:existing-1'];
  const contradictionResult = assessPersonalAgentMemoryCandidate(
    validKernel(),
    contradiction
  );
  assert.equal(contradictionResult.disposition, 'quarantine');
  assert.ok(
    contradictionResult.reasons.includes(
      'contradiction-requires-review'
    )
  );
});

test('derived memory requires independent evidence before durable admission', () => {
  const derived = directMemoryCandidate();
  derived.source_kind = 'agent-inference';
  derived.source_ref = 'source:agent-inference-1';
  derived.independent_evidence_refs = ['evidence:1'];

  const insufficient = assessPersonalAgentMemoryCandidate(
    validKernel(),
    derived
  );
  assert.equal(insufficient.disposition, 'quarantine');
  assert.ok(
    insufficient.reasons.includes(
      'insufficient-independent-evidence'
    )
  );

  derived.independent_evidence_refs.push('evidence:2');
  const sufficient = assessPersonalAgentMemoryCandidate(
    validKernel(),
    derived
  );
  assert.equal(sufficient.disposition, 'admit-durable');
  assert.equal(sufficient.truth_certified, false);
  assert.equal(sufficient.grants_execution_authority, false);
});

test('earned autonomy can become review-eligible but cannot self-promote', () => {
  const result = assessPersonalAgentAutonomyPromotion(
    validKernel(),
    validPromotionEvidence()
  );

  assert.equal(result.promotion_eligible_for_authorized_review, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.promotion_performed, false);
  assert.equal(result.requires_authorized_promotion_decision, true);
  assert.equal(result.policy_mutated, false);
  assert.equal(result.grants_execution_authority, false);

  const insufficient = validPromotionEvidence();
  insufficient.successful_receipts = 9;
  const insufficientResult = assessPersonalAgentAutonomyPromotion(
    validKernel(),
    insufficient
  );
  assert.equal(
    insufficientResult.promotion_eligible_for_authorized_review,
    false
  );
  assert.ok(
    insufficientResult.blockers.includes(
      'insufficient-successful-receipts'
    )
  );

  const skip = validPromotionEvidence();
  skip.target_level = 'draft';
  const skipResult = assessPersonalAgentAutonomyPromotion(
    validKernel(),
    skip
  );
  assert.equal(skipResult.promotion_eligible_for_authorized_review, false);
  assert.ok(skipResult.blockers.includes('target-level-is-not-next-level'));
});

test('continuity descriptor carries only exact bindings and no authority', () => {
  const descriptor = buildPersonalAgentKernelContinuityDescriptor(
    validKernel()
  );

  assert.equal(
    descriptor.schema,
    'axiom-personal-agent-kernel-continuity-descriptor.v0'
  );
  assert.equal(descriptor.personal_agent_pack_ref, 'pack:owner-1');
  assert.equal(descriptor.personal_agent_pack_sha256, SHA_A);
  assert.equal(descriptor.raw_secret_material_included, false);
  assert.equal(descriptor.restoration_is_authority, false);
  assert.equal(descriptor.grants_execution_authority, false);
});

test('UTC timestamps are canonical and offset timestamps are rejected', () => {
  const kernel = validKernel();
  kernel.updated_at = '2026-09-18T08:00:00-04:00';
  assert.throws(
    () => validatePersonalAgentKernelV0(kernel),
    /updated_at/
  );

  assert.throws(
    () =>
      assessPersonalAgentKernelProposal(
        validKernel(),
        validProposal(),
        { at: '2026-09-18T08:30:00-04:00' }
      ),
    /assessment time/
  );
});

test('proposal schema rejects unknown fields and duplicate budget requests', () => {
  const unknown = validProposal();
  unknown.authorization_granted = true;
  assert.throws(
    () =>
      assessPersonalAgentKernelProposal(
        validKernel(),
        unknown,
        { at: NOW }
      ),
    /unknown field authorization_granted/
  );

  const duplicate = validProposal();
  duplicate.budget_requests.push(clone(duplicate.budget_requests[0]));
  assert.throws(
    () =>
      assessPersonalAgentKernelProposal(
        validKernel(),
        duplicate,
        { at: NOW }
      ),
    /duplicate proposal budget_id/
  );
});

test('Personal Agent Kernel implementation is static and has no I/O or effect imports', () => {
  const source = readFileSync(
    new URL('../src/lib/personal-agent-kernel-v0.mjs', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(
    source,
    /from\s+['"]node:(?:fs|net|http|https|tls|dgram|dns|child_process|worker_threads)['"]/
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bWebSocket\b/);
  assert.doesNotMatch(source, /\bprocess\.env\b/);
});

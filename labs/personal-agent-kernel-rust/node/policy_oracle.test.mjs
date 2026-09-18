import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assessPersonalAgentKernelProposal
} from '../../../mesh/src/lib/personal-agent-kernel-v0.mjs';

const FIXTURE_URL = new URL('../fixtures/policy-conformance.v0.tsv', import.meta.url);
const GOLDEN_URL = new URL('../fixtures/policy-node-golden.v0.tsv', import.meta.url);
const SHA = 'a'.repeat(64);
const AT = '2026-09-18T12:30:00Z';

function parseTsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split('\t');
  return lines.map(line => {
    const values = line.split('\t');
    return Object.fromEntries(header.map((key, index) => [key, values[index]]));
  });
}

function promotionPolicy(level) {
  const levels = ['observe', 'draft', 'prepare', 'request-effect'];
  const index = levels.indexOf(level);
  assert.notEqual(index, -1);
  const next = index === levels.length - 1 ? 'none' : levels[index + 1];
  return {
    next_level: next,
    minimum_successful_receipts: next === 'none' ? 0 : 1,
    maximum_failed_receipts: 0,
    minimum_evidence_refs: next === 'none' ? 0 : 1
  };
}

function buildKernel(row) {
  const expiresAt = row.expired === '1'
    ? '2026-09-18T12:00:00Z'
    : '2026-09-19T00:00:00Z';

  return {
    schema: 'axiom-personal-agent-kernel.v0',
    kernel_id: 'personal-kernel:oracle',
    kernel_version: '0.1.0',
    owner_subject_ref: 'subject:owner-1',
    identity_binding: {
      principal_ref: 'principal:personal-agent-1',
      personal_agent_pack_ref: 'pack:owner-1',
      personal_agent_pack_sha256: SHA,
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
        expires_at: expiresAt
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
        expires_at: expiresAt
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
        level: row.kernel_autonomy,
        successful_receipts: 8,
        failed_receipts: 0,
        evidence_refs: ['receipt:1'],
        promotion_policy: promotionPolicy(row.kernel_autonomy),
        promotion_decision_ref: 'decision:oracle',
        last_reviewed_at: '2026-09-18T08:00:00Z'
      }
    ],
    continuity: {
      personal_agent_pack_ref: 'pack:owner-1',
      personal_agent_pack_sha256: SHA,
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

function buildProposal(row) {
  const budgetRequests = [];
  if (row.include_actions === '1') {
    budgetRequests.push({
      budget_id: 'budget:purchase-actions',
      amount: Number(row.action_amount),
      unit: 'count'
    });
  }
  if (row.include_cad === '1') {
    budgetRequests.push({
      budget_id: 'budget:purchase-cad',
      amount: Number(row.cad_amount),
      unit: 'minor-units',
      currency: row.cad_currency
    });
  }
  if (row.extra_budget === '1') {
    budgetRequests.push({
      budget_id: 'budget:extra',
      amount: 1,
      unit: 'count'
    });
  }

  return {
    schema: 'axiom-personal-agent-kernel-proposal.v0',
    proposal_id: 'proposal:' + row.case_id,
    owner_subject_ref: 'subject:owner-1',
    capability_ref: 'capability:purchase',
    purpose_ref: 'purpose:oracle',
    requested_autonomy_level: row.requested_autonomy,
    budget_requests: budgetRequests,
    memory_refs: [],
    uses_quarantined_memory: row.quarantined === '1',
    effect_requested: row.effect_requested === '1'
  };
}

test('Node Personal Agent Kernel v0 matches the shared policy oracle', () => {
  const rows = parseTsv(readFileSync(FIXTURE_URL, 'utf8'));
  const golden = parseTsv(readFileSync(GOLDEN_URL, 'utf8'));
  const expectedByCase = new Map(golden.map(row => [row.case_id, row]));

  assert.equal(rows.length, golden.length);

  for (const row of rows) {
    const result = assessPersonalAgentKernelProposal(
      buildKernel(row),
      buildProposal(row),
      { at: AT }
    );
    const expected = expectedByCase.get(row.case_id);
    assert.ok(expected, 'missing golden row for ' + row.case_id);

    const status = result.eligible_within_personal_policy ? 'allow' : 'deny';
    const blockers = result.blockers.length === 0 ? '-' : result.blockers.join(',');

    assert.equal(status, expected.status, row.case_id + ' status');
    assert.equal(blockers, expected.blockers, row.case_id + ' blockers');
    assert.equal(result.grants_execution_authority, false);
    assert.equal(result.effect_performed, false);
  }
});

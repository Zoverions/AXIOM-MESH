import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateNodePlacements,
  nodePlacementPolicyDigest,
  validateNodePlacementPolicy
} from '../src/lib/node-placement-policy.mjs';

const NOW = '2026-09-24T12:00:00.000Z';

function policy(overrides = {}) {
  return {
    schema:'axiom-node-placement-policy.v0',
    version:0,
    status:'inert-contract-laboratory',
    placement_id:'placement.demo.1',
    outcome_id:'outcome.demo.1',
    task_id:'task.demo.1',
    requested_egress_class:'none',
    locality_policy:'owner-local-only',
    required_residency_regions:['CA-ON'],
    required_capabilities:['compute.batch'],
    required_runtime_ids:['runtime.local'],
    required_model_refs:['model.local'],
    required_tool_refs:['tool.files'],
    minimum_evidence_level:'measured',
    minimum_security_level:2,
    require_attestation:true,
    max_latency_ms:100,
    max_cost:{currency:'CAD',max_minor_units:50},
    max_energy_millijoules:1000,
    optimization_currency:'CAD',
    preference_order:['locality','trust','latency','cost','energy'],
    grants_authority:false,
    execution_effect:'none',
    runtime_activation:false,
    ...overrides
  };
}

function candidate(node_id, overrides = {}) {
  return {
    node_id,
    locality:'owner-local',
    residency_region:'CA-ON',
    supported_egress_classes:['none','owner-lan'],
    capabilities:['compute.batch'],
    runtime_ids:['runtime.local'],
    model_refs:['model.local'],
    tool_refs:['tool.files'],
    evidence_level:'verified',
    evidence_refs:['evidence:node-profile.1'],
    security_level:3,
    attested:true,
    latency_ms:40,
    cost:{currency:'CAD',minor_units:10},
    energy_millijoules:500,
    observation_state:'current',
    observed_at:'2026-09-24T11:59:00.000Z',
    expires_at:'2026-09-24T12:05:00.000Z',
    ...overrides
  };
}

test('placement policy is deterministic and never authority', () => {
  const value = policy();
  const result = validateNodePlacementPolicy(value);
  assert.equal(result.policy_digest, nodePlacementPolicyDigest(value));
  assert.equal(result.authority_effect, 'none');
});

test('hard locality wins over a faster cheaper public provider', () => {
  const local = candidate('node.local');
  const publicNode = candidate('node.public', {
    locality:'public-provider',
    residency_region:'CA-ON',
    supported_egress_classes:['none','public-provider'],
    latency_ms:5,
    cost:{currency:'CAD',minor_units:1},
    energy_millijoules:1
  });
  const result = evaluateNodePlacements(policy(), [publicNode, local], { evaluatedAt:NOW });
  assert.equal(result.selected_node_id, 'node.local');
  assert.equal(result.eligible.length, 1);
  assert.ok(result.rejected.find(item => item.node_id === 'node.public').reasons.includes('locality-denied'));
  assert.equal(result.grants_authority, false);
});

test('soft preference order applies only after eligibility', () => {
  const local = candidate('node.local');
  const publicNode = candidate('node.public', {
    locality:'public-provider',
    supported_egress_classes:['none','public-provider'],
    latency_ms:5,
    cost:{currency:'CAD',minor_units:1},
    energy_millijoules:1
  });
  const latencyFirst = policy({
    locality_policy:'public-provider-allowed',
    preference_order:['latency','cost','locality','trust','energy']
  });
  const result = evaluateNodePlacements(latencyFirst, [local, publicNode], { evaluatedAt:NOW });
  assert.equal(result.eligible.length, 2);
  assert.equal(result.selected_node_id, 'node.public');
});

test('stale, un-attested, wrong-residency and over-budget candidates fail closed', () => {
  const candidates = [
    candidate('node.stale', { expires_at:'2026-09-24T12:00:00.000Z' }),
    candidate('node.unattested', { attested:false }),
    candidate('node.declared-only', { evidence_level:'declared' }),
    candidate('node.wrong-region', { residency_region:'US-EAST' }),
    candidate('node.expensive', { cost:{currency:'CAD',minor_units:500} })
  ];
  const result = evaluateNodePlacements(policy(), candidates, { evaluatedAt:NOW });
  assert.equal(result.selected_node_id, null);
  assert.ok(result.rejected.find(item => item.node_id === 'node.stale').reasons.includes('observation-not-current'));
  assert.ok(result.rejected.find(item => item.node_id === 'node.unattested').reasons.includes('attestation-required'));
  assert.ok(result.rejected.find(item => item.node_id === 'node.declared-only').reasons.includes('evidence-level-insufficient'));
  assert.ok(result.rejected.find(item => item.node_id === 'node.wrong-region').reasons.includes('residency-denied'));
  assert.ok(result.rejected.find(item => item.node_id === 'node.expensive').reasons.includes('cost-exceeds-limit'));
});

test('candidate ordering is stable under input permutation', () => {
  const value = policy({ locality_policy:'public-provider-allowed' });
  const a = candidate('node.a', { latency_ms:30 });
  const b = candidate('node.b', { latency_ms:30 });
  const first = evaluateNodePlacements(value, [b,a], { evaluatedAt:NOW });
  const second = evaluateNodePlacements(value, [a,b], { evaluatedAt:NOW });
  assert.deepEqual(first, second);
  assert.equal(first.selected_node_id, 'node.a');
});

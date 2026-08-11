import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNativeInvocationEnvelope } from '../src/lib/invocation-envelope.mjs';
import { buildPlan, validatePlan } from '../src/lib/plan.mjs';
import { PolicyEngine } from '../src/lib/policy.mjs';

const POLICY_DIGEST = 'b'.repeat(64);

function intent() {
  return {
    intent_id: 'intent_assurance_binding',
    principal: {
      id: 'owner.assurance-test',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    action: 'system.echo',
    input: { message: 'hello' },
    purpose: 'test.assurance',
    data_scopes: [],
    confirmations: [],
    approval_ids: []
  };
}

function decision(overrides = {}) {
  return {
    allow: true,
    risk: 'low',
    required_assurance: 'A1',
    tool: 'system.echo',
    effect: 'system.echo',
    constraints: {},
    timeout_ms: 1_000,
    requires_independent_approval: false,
    rule_id: 'policy:system.echo',
    policy_version: 'test.v1',
    policy_digest: POLICY_DIGEST,
    policy_layers: [],
    ...overrides
  };
}

test('invocation envelope durably binds the policy-required assurance tier', () => {
  const envelope = buildNativeInvocationEnvelope(intent(), decision({
    risk: 'medium',
    required_assurance: 'A2'
  }));

  assert.equal(envelope.authority.required_assurance, 'A2');
});

test('current auditable kernel path renders A2 without independent approval', () => {
  const plan = buildPlan(intent(), decision());

  assert.deepEqual(plan.assurance, {
    required: 'A1',
    achieved: 'A2',
    basis: 'auditable_kernel_path'
  });
  assert.equal(plan.capability.required_assurance, 'A1');
  assert.equal(plan.capability.achieved_assurance, 'A2');
  assert.ok(plan.steps[0].evidence_obligations.includes('required_assurance'));
  assert.ok(plan.steps[0].evidence_obligations.includes('achieved_assurance'));
  assert.doesNotThrow(() => validatePlan(plan));
});

test('independently approved execution renders A3 and binds the approval evidence', () => {
  const approval = {
    approval_id: 'approval_assurance_test',
    approver: 'owner.independent-reviewer',
    request_digest: 'c'.repeat(64),
    expires_at: '2030-01-01T00:00:00.000Z'
  };
  const plan = buildPlan(intent(), decision({
    risk: 'high',
    required_assurance: 'A3',
    requires_independent_approval: true
  }), { approval });

  assert.deepEqual(plan.assurance, {
    required: 'A3',
    achieved: 'A3',
    basis: 'independent_approval'
  });
  assert.equal(plan.approvals[0].approval_id, approval.approval_id);
  assert.doesNotThrow(() => validatePlan(plan));
});

test('plan construction refuses to render above achieved assurance', () => {
  assert.throws(
    () => buildPlan(intent(), decision({ required_assurance: 'A3' })),
    /cannot satisfy required assurance A3; current path achieves A2/
  );
});

test('current runtime denies A4 and A3 rules without an implemented A3 path', () => {
  const policy = new PolicyEngine({
    version: 'assurance-runtime-test.v1',
    actions: {
      'system.echo': {
        decision: 'allow',
        risk: 'low',
        required_assurance: 'A4',
        tool: 'system.echo'
      },
      'system.status': {
        decision: 'allow',
        risk: 'low',
        required_assurance: 'A3',
        tool: 'system.status'
      }
    }
  });

  const a4 = policy.evaluate({ action: 'system.echo', principal: intent().principal, intent: intent() });
  assert.equal(a4.allow, false);
  assert.equal(a4.code, 'assurance_unavailable');
  assert.equal(a4.runtime_max_assurance, 'A3');

  const a3WithoutApprovalPath = policy.evaluate({
    action: 'system.status',
    principal: intent().principal,
    intent: intent()
  });
  assert.equal(a3WithoutApprovalPath.allow, false);
  assert.equal(a3WithoutApprovalPath.code, 'assurance_path_unavailable');
});

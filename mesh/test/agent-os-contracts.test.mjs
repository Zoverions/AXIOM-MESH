import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessSkillInvocation,
  assessTaskResume,
  outcomeDigest,
  skillAdmissionDigest,
  taskLifecycleDigest,
  validateOutcome,
  validateSkillAdmission,
  validateTaskLifecycle
} from '../src/lib/agent-os-contracts.mjs';

const d = 'a'.repeat(64);

function outcome() {
  return {
    schema:'axiom-outcome.v0',
    version:0,
    status:'inert-contract-laboratory',
    outcome_id:'outcome.demo.1',
    owner_principal_id:'human.owner',
    intent:'Produce a verified local artifact without widening authority.',
    acceptance_criteria:['Artifact exists','Verification evidence is attached'],
    purpose_ref:'purpose.demo',
    authority_refs:['authority.demo'],
    data_classes:['project-public'],
    task_ids:['task.demo.1'],
    effect_boundaries:['none'],
    resource_envelope_ref:'resource.demo',
    cost_budget:{currency:null,max_minor_units:0},
    deadline:null,
    created_at:'2026-09-24T12:00:00.000Z',
    updated_at:'2026-09-24T12:00:00.000Z',
    completion_state:'planned',
    evidence_refs:[],
    grants_authority:false,
    execution_effect:'none',
    runtime_activation:false
  };
}

function task() {
  return {
    schema:'axiom-task-lifecycle.v0',
    version:0,
    status:'inert-contract-laboratory',
    task_id:'task.demo.1',
    outcome_id:'outcome.demo.1',
    principal_id:'human.owner',
    lifecycle_state:'running',
    created_at:'2026-09-24T12:00:00.000Z',
    updated_at:'2026-09-24T12:05:00.000Z',
    worker_ref:'agent.worker.1',
    provider_ref:'provider.local.1',
    node_ref:'node.local.1',
    authority_snapshot_ref:'authority.snapshot.2',
    authority_checked_at:'2026-09-24T12:04:00.000Z',
    budget_ref:'budget.snapshot.2',
    budget_checked_at:'2026-09-24T12:04:00.000Z',
    resume_requested:true,
    resume_from_digest:d,
    effect_state:'not-started',
    result_refs:[],
    grants_authority:false,
    execution_effect:'none',
    runtime_activation:false
  };
}

function skill() {
  return {
    schema:'axiom-skill-admission.v0',
    version:0,
    status:'inert-contract-laboratory',
    skill_id:'skill.demo.read',
    format:'agent-skills-skill-md',
    source_ref:'https://example.invalid/skill/SKILL.md',
    content_digest:d,
    provenance_refs:['source:demo'],
    declared_dependencies:[],
    requested_capabilities:['files.read'],
    filesystem:{mode:'read-only',paths:['/workspace/input.txt']},
    network:{mode:'none',destinations:[]},
    process:{mode:'none',commands:[]},
    data_classes:['project-public'],
    expected_effects:['none'],
    sandbox_profile_ref:'sandbox.readonly.v1',
    consequence_class:'C1',
    review_refs:['review:synthetic'],
    revocation_state:'active',
    currentness:{
      state:'current',
      checked_at:'2026-09-24T12:00:00.000Z',
      expires_at:'2026-09-25T12:00:00.000Z'
    },
    grants_authority:false,
    installation_effect:'none',
    runtime_activation:false
  };
}

test('outcome is deterministic and verified completion requires evidence', () => {
  const value = outcome();
  assert.equal(validateOutcome(value).outcome_digest, outcomeDigest(value));
  value.completion_state = 'completed-verified';
  assert.throws(() => validateOutcome(value), /requires evidence_refs/);
  value.evidence_refs.push('receipt:verify.1');
  assert.equal(validateOutcome(value).completion_state, 'completed-verified');
});

test('task resumption is currentness-gated and substitution fails closed', () => {
  const value = task();
  assert.equal(validateTaskLifecycle(value).task_digest, taskLifecycleDigest(value));
  const allowed = assessTaskResume(value, {
    previous_task_digest:d,
    authority_snapshot_ref:'authority.snapshot.2',
    authority_current:true,
    budget_ref:'budget.snapshot.2',
    budget_current:true
  });
  assert.equal(allowed.eligible, true);

  const revoked = assessTaskResume(value, {
    previous_task_digest:d,
    authority_snapshot_ref:'authority.snapshot.2',
    authority_current:false,
    budget_ref:'budget.snapshot.2',
    budget_current:true
  });
  assert.equal(revoked.eligible, false);
  assert.ok(revoked.reasons.includes('authority-not-current'));

  const substituted = assessTaskResume(value, {
    previous_task_digest:d,
    authority_snapshot_ref:'authority.snapshot.attacker',
    authority_current:true,
    budget_ref:'budget.snapshot.2',
    budget_current:true
  });
  assert.equal(substituted.eligible, false);
  assert.ok(substituted.reasons.includes('authority-snapshot-mismatch'));
});

test('uncertain external effect cannot be relabeled verified', () => {
  const value = task();
  value.resume_requested = false;
  value.resume_from_digest = null;
  value.lifecycle_state = 'completed-verified';
  value.effect_state = 'uncertain';
  value.result_refs = ['artifact:claimed'];
  assert.throws(() => validateTaskLifecycle(value), /pending or uncertain|uncertain effect_state/);
});

test('skill admission is deterministic but never permission', () => {
  const value = skill();
  const validated = validateSkillAdmission(value);
  assert.equal(validated.admission_digest, skillAdmissionDigest(value));
  assert.equal(validated.authority_effect, 'none');

  const admitted = assessSkillInvocation(value, {
    capability:'files.read',
    effect:'none',
    filesystem_path:'/workspace/input.txt',
    network_destination:null,
    command:null
  });
  assert.equal(admitted.admitted, true);
  assert.equal(admitted.authority_effect, 'none');
});

test('undeclared skill effects and destinations fail closed', () => {
  const value = skill();
  const network = assessSkillInvocation(value, {
    capability:'files.read',
    effect:'none',
    filesystem_path:'/workspace/input.txt',
    network_destination:'https://example.com',
    command:null
  });
  assert.equal(network.admitted, false);
  assert.ok(network.reasons.includes('network-scope-undeclared'));

  const write = assessSkillInvocation(value, {
    capability:'files.write',
    effect:'write-external',
    filesystem_path:'/workspace/output.txt',
    network_destination:null,
    command:null
  });
  assert.equal(write.admitted, false);
  assert.ok(write.reasons.includes('capability-undeclared'));
  assert.ok(write.reasons.includes('effect-undeclared'));
  assert.ok(write.reasons.includes('filesystem-scope-undeclared'));
});

test('revoked skill remains structurally valid but is not admitted for invocation', () => {
  const value = skill();
  value.revocation_state = 'revoked';
  assert.equal(validateSkillAdmission(value).valid, true);
  const decision = assessSkillInvocation(value, {
    capability:'files.read',
    effect:'none',
    filesystem_path:'/workspace/input.txt',
    network_destination:null,
    command:null
  });
  assert.equal(decision.admitted, false);
  assert.ok(decision.reasons.includes('skill-not-active'));
});

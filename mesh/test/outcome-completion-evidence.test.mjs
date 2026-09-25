import assert from 'node:assert/strict';
import test from 'node:test';

import { outcomeDigest } from '../src/lib/agent-os-contracts.mjs';
import {
  evaluateOutcomeCompletion,
  outcomeCompletionEvidenceDigest,
  validateOutcomeCompletionEvidence
} from '../src/lib/outcome-completion-evidence.mjs';

function outcome() {
  return {
    schema:'axiom-outcome.v0',
    version:0,
    status:'inert-contract-laboratory',
    outcome_id:'outcome.demo.1',
    owner_principal_id:'human.owner',
    intent:'Produce and verify one artifact.',
    acceptance_criteria:['Artifact exists','Artifact digest was verified'],
    purpose_ref:'purpose.demo',
    authority_refs:['authority.demo'],
    data_classes:['project-public'],
    task_ids:['task.demo.1'],
    effect_boundaries:['none'],
    resource_envelope_ref:null,
    cost_budget:{currency:null,max_minor_units:0},
    deadline:null,
    created_at:'2026-09-24T12:00:00.000Z',
    updated_at:'2026-09-24T12:05:00.000Z',
    completion_state:'completed-verified',
    evidence_refs:['receipt:outcome.1'],
    grants_authority:false,
    execution_effect:'none',
    runtime_activation:false
  };
}

function completion(source = outcome()) {
  return {
    schema:'axiom-outcome-completion-evidence.v0',
    version:0,
    status:'inert-evidence-laboratory',
    completion_id:'completion.demo.1',
    outcome_id:source.outcome_id,
    outcome_digest:outcomeDigest(source),
    observed_at:'2026-09-24T12:06:00.000Z',
    acceptance_results:[
      {criterion_index:0,criterion:'Artifact exists',state:'passed',evidence_refs:['artifact:file.1']},
      {criterion_index:1,criterion:'Artifact digest was verified',state:'passed',evidence_refs:['receipt:digest.1']}
    ],
    task_results:[
      {
        task_id:'task.demo.1',
        task_digest:'b'.repeat(64),
        lifecycle_state:'completed-verified',
        effect_state:'none',
        evidence_refs:['receipt:task.1']
      }
    ],
    external_effects:[],
    artifact_refs:['artifact:file.1'],
    verifier_ref:'verifier.local.1',
    conclusion:'verified',
    grants_authority:false,
    execution_effect:'none',
    external_truth_claim:false,
    runtime_activation:false
  };
}

test('verified completion binds exact Outcome and evidence', () => {
  const source = outcome();
  const record = completion(source);
  const validated = validateOutcomeCompletionEvidence(record);
  assert.equal(validated.completion_digest, outcomeCompletionEvidenceDigest(record));
  const result = evaluateOutcomeCompletion(source, record);
  assert.equal(result.verified, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.external_truth_claim, false);
});

test('outcome digest substitution is rejected', () => {
  const source = outcome();
  const record = completion(source);
  record.outcome_digest = '0'.repeat(64);
  assert.throws(() => evaluateOutcomeCompletion(source, record), /outcome_digest/);
});

test('uncertain external effect cannot be called verified', () => {
  const source = outcome();
  const record = completion(source);
  record.external_effects.push({
    effect_ref:'effect.remote.1',
    state:'uncertain',
    evidence_refs:[],
    reconciliation_ref:'status:remote.1'
  });
  assert.throws(() => evaluateOutcomeCompletion(source, record), /Verified completion requirements/);
});

test('passed criteria and verified tasks require evidence', () => {
  const source = outcome();
  const noCriterionEvidence = completion(source);
  noCriterionEvidence.acceptance_results[0].evidence_refs = [];
  assert.throws(() => evaluateOutcomeCompletion(source, noCriterionEvidence), /criterion-evidence-missing/);

  const noTaskEvidence = completion(source);
  noTaskEvidence.task_results[0].evidence_refs = [];
  assert.throws(() => evaluateOutcomeCompletion(source, noTaskEvidence), /task-evidence-missing/);
});

test('non-verified completion can preserve visible failure reasons', () => {
  const source = outcome();
  const record = completion(source);
  record.acceptance_results[1].state = 'failed';
  record.acceptance_results[1].evidence_refs = ['evidence:failure.1'];
  record.task_results[0].lifecycle_state = 'failed';
  record.task_results[0].effect_state = 'failed';
  record.conclusion = 'not-verified';
  const result = evaluateOutcomeCompletion(source, record);
  assert.equal(result.verified, false);
  assert.ok(result.reasons.includes('criterion-not-passed:1'));
  assert.ok(result.reasons.includes('task-not-verified:task.demo.1'));
});

test('completion evidence can never assert external truth or authority', () => {
  const record = completion();
  record.external_truth_claim = true;
  assert.throws(() => validateOutcomeCompletionEvidence(record), /activation\/truth boundary/);
});

test('completion cannot outrun Outcome state or chronology', () => {
  const inProgress = outcome();
  inProgress.completion_state = 'in-progress';
  inProgress.evidence_refs = [];
  const record = completion(inProgress);
  assert.throws(() => evaluateOutcomeCompletion(inProgress, record), /outcome-state-not-verified/);

  const source = outcome();
  const tooEarly = completion(source);
  tooEarly.observed_at = '2026-09-24T12:04:00.000Z';
  assert.throws(() => evaluateOutcomeCompletion(source, tooEarly), /cannot precede Outcome updated_at/);
});

import { digestObject, ValidationError } from './canonical.mjs';
import { outcomeDigest, validateOutcome } from './agent-os-contracts.mjs';

export const OUTCOME_COMPLETION_EVIDENCE_SCHEMA = 'axiom-outcome-completion-evidence.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CONCLUSIONS = new Set(['verified','not-verified','uncertain']);
const ACCEPTANCE_STATES = new Set(['passed','failed','unknown']);
const TASK_STATES = new Set(['completed-verified','completed-unverified','failed','cancelled','uncertain-effect']);
const EFFECT_STATES = new Set(['none','confirmed','uncertain','failed']);

export function validateOutcomeCompletionEvidence(document) {
  exactObject(document, 'Outcome completion evidence', [
    'schema','version','status','completion_id','outcome_id','outcome_digest','observed_at',
    'acceptance_results','task_results','external_effects','artifact_refs','verifier_ref',
    'conclusion','grants_authority','execution_effect','external_truth_claim','runtime_activation'
  ]);
  if (
    document.schema !== OUTCOME_COMPLETION_EVIDENCE_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence-laboratory'
    || document.grants_authority !== false
    || document.execution_effect !== 'none'
    || document.external_truth_claim !== false
    || document.runtime_activation !== false
  ) throw new ValidationError('Outcome completion evidence activation/truth boundary is invalid');

  id(document.completion_id, 'completion_id');
  id(document.outcome_id, 'outcome_id');
  digest(document.outcome_digest, 'outcome_digest');
  canonicalDate(document.observed_at, 'observed_at');
  validateAcceptanceResults(document.acceptance_results);
  validateTaskResults(document.task_results);
  validateExternalEffects(document.external_effects);
  refArray(document.artifact_refs, 'artifact_refs', 512);
  if (document.verifier_ref !== null) id(document.verifier_ref, 'verifier_ref');
  if (!CONCLUSIONS.has(document.conclusion)) throw new ValidationError('conclusion is invalid');
  return Object.freeze({
    valid:true,
    schema:document.schema,
    completion_id:document.completion_id,
    completion_digest:digestObject(document),
    conclusion:document.conclusion,
    grants_authority:false,
    execution_effect:'none',
    external_truth_claim:false,
    runtime_activation:false
  });
}

export function outcomeCompletionEvidenceDigest(document) {
  validateOutcomeCompletionEvidence(document);
  return digestObject(document);
}

export function evaluateOutcomeCompletion(outcome, completion) {
  validateOutcome(outcome);
  validateOutcomeCompletionEvidence(completion);
  if (completion.outcome_id !== outcome.outcome_id) throw new ValidationError('Completion outcome_id does not match Outcome');
  const expectedDigest = outcomeDigest(outcome);
  if (completion.outcome_digest !== expectedDigest) throw new ValidationError('Completion outcome_digest does not match exact Outcome');

  if (completion.acceptance_results.length !== outcome.acceptance_criteria.length) {
    throw new ValidationError('Completion acceptance_results do not cover every Outcome criterion');
  }
  for (let index = 0; index < outcome.acceptance_criteria.length; index += 1) {
    const result = completion.acceptance_results[index];
    if (result.criterion_index !== index || result.criterion !== outcome.acceptance_criteria[index]) {
      throw new ValidationError('Completion acceptance criterion binding is invalid at index ' + index);
    }
  }

  const expectedTasks = new Set(outcome.task_ids);
  const actualTasks = new Set(completion.task_results.map(item => item.task_id));
  if (
    expectedTasks.size !== actualTasks.size
    || [...expectedTasks].some(taskId => !actualTasks.has(taskId))
  ) throw new ValidationError('Completion task_results do not cover exact Outcome task_ids');

  const reasons = [];
  for (const item of completion.acceptance_results) {
    if (item.state !== 'passed') reasons.push('criterion-not-passed:' + item.criterion_index);
    if (item.state === 'passed' && item.evidence_refs.length === 0) reasons.push('criterion-evidence-missing:' + item.criterion_index);
  }
  for (const task of completion.task_results) {
    if (task.lifecycle_state !== 'completed-verified') reasons.push('task-not-verified:' + task.task_id);
    if (!['none','confirmed'].includes(task.effect_state)) reasons.push('task-effect-not-confirmed:' + task.task_id);
    if (task.lifecycle_state === 'completed-verified' && task.evidence_refs.length === 0) reasons.push('task-evidence-missing:' + task.task_id);
  }
  for (const effect of completion.external_effects) {
    if (!['none','confirmed'].includes(effect.state)) reasons.push('external-effect-not-confirmed:' + effect.effect_ref);
    if (effect.state === 'confirmed' && effect.evidence_refs.length === 0) reasons.push('external-effect-evidence-missing:' + effect.effect_ref);
  }
  if (completion.verifier_ref === null) reasons.push('verifier-missing');

  if (completion.conclusion === 'verified' && reasons.length) {
    throw new ValidationError('Verified completion requirements are not satisfied: ' + reasons.join(','));
  }
  if (completion.conclusion !== 'verified' && reasons.length === 0) {
    return Object.freeze({
      verified:false,
      conclusion:completion.conclusion,
      reasons:Object.freeze(['conclusion-not-verified']),
      completion_digest:digestObject(completion),
      grants_authority:false,
      external_truth_claim:false
    });
  }
  return Object.freeze({
    verified:completion.conclusion === 'verified',
    conclusion:completion.conclusion,
    reasons:Object.freeze(reasons),
    completion_digest:digestObject(completion),
    grants_authority:false,
    external_truth_claim:false
  });
}

function validateAcceptanceResults(value) {
  if (!Array.isArray(value) || value.length > 64) throw new ValidationError('acceptance_results are invalid');
  const seen = new Set();
  for (const item of value) {
    exactObject(item, 'Acceptance result', ['criterion_index','criterion','state','evidence_refs']);
    integer(item.criterion_index, 'criterion_index', 0, 63);
    if (seen.has(item.criterion_index)) throw new ValidationError('Duplicate criterion_index');
    seen.add(item.criterion_index);
    text(item.criterion, 'criterion', 1, 2000);
    if (!ACCEPTANCE_STATES.has(item.state)) throw new ValidationError('Acceptance result state is invalid');
    refArray(item.evidence_refs, 'Acceptance evidence_refs', 512);
  }
}

function validateTaskResults(value) {
  if (!Array.isArray(value) || value.length > 4096) throw new ValidationError('task_results are invalid');
  const seen = new Set();
  for (const item of value) {
    exactObject(item, 'Task result', ['task_id','task_digest','lifecycle_state','effect_state','evidence_refs']);
    id(item.task_id, 'task_id');
    if (seen.has(item.task_id)) throw new ValidationError('Duplicate task_id');
    seen.add(item.task_id);
    digest(item.task_digest, 'task_digest');
    if (!TASK_STATES.has(item.lifecycle_state)) throw new ValidationError('Task result lifecycle_state is invalid');
    if (!EFFECT_STATES.has(item.effect_state)) throw new ValidationError('Task result effect_state is invalid');
    refArray(item.evidence_refs, 'Task result evidence_refs', 512);
  }
}

function validateExternalEffects(value) {
  if (!Array.isArray(value) || value.length > 512) throw new ValidationError('external_effects are invalid');
  const seen = new Set();
  for (const item of value) {
    exactObject(item, 'External effect', ['effect_ref','state','evidence_refs','reconciliation_ref']);
    text(item.effect_ref, 'effect_ref', 1, 512);
    if (seen.has(item.effect_ref)) throw new ValidationError('Duplicate effect_ref');
    seen.add(item.effect_ref);
    if (!EFFECT_STATES.has(item.state)) throw new ValidationError('External effect state is invalid');
    refArray(item.evidence_refs, 'External effect evidence_refs', 512);
    if (item.reconciliation_ref !== null) text(item.reconciliation_ref, 'reconciliation_ref', 1, 512);
    if (item.state === 'uncertain' && item.reconciliation_ref === null) {
      throw new ValidationError('Uncertain external effect requires reconciliation_ref');
    }
  }
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(label + ' must be an object');
  const actual = Object.keys(value).sort().join(',');
  const expected = [...fields].sort().join(',');
  if (actual !== expected) throw new ValidationError(label + ' fields are invalid');
}
function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(label + ' is invalid');
  return value;
}
function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new ValidationError(label + ' must be a lowercase sha256 digest');
  return value;
}
function text(value, label, minimum, maximum) {
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > maximum) throw new ValidationError(label + ' has invalid length');
  return value;
}
function refArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new ValidationError(label + ' has invalid cardinality');
  const seen = new Set();
  for (const item of value) {
    text(item, label + ' item', 1, 512);
    if (seen.has(item)) throw new ValidationError(label + ' contains duplicate values');
    seen.add(item);
  }
}
function integer(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new ValidationError(label + ' is invalid');
}
function canonicalDate(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(label + ' must be a canonical ISO timestamp');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(label + ' must be a canonical ISO timestamp');
  return parsed.getTime();
}

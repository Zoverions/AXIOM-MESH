import { digestObject, ValidationError } from './canonical.mjs';

export const OUTCOME_SCHEMA = 'axiom-outcome.v0';
export const TASK_LIFECYCLE_SCHEMA = 'axiom-task-lifecycle.v0';
export const SKILL_ADMISSION_SCHEMA = 'axiom-skill-admission.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const COMPLETION_STATES = new Set(['planned','in-progress','waiting','blocked','completed-unverified','completed-verified','failed','cancelled','uncertain-effect']);
const TASK_STATES = new Set(['proposed','admitted','running','waiting-input','blocked','completed-unverified','completed-verified','failed','cancelled','uncertain-effect']);
const EFFECT_STATES = new Set(['none','not-started','pending','confirmed','uncertain']);
const EFFECTS = new Set(["none","read-external","write-external","publish-external","communication","financial","create-external-resource","delete-external-resource","physical","unknown"]);
const SKILL_FORMATS = new Set(['agent-skills-skill-md','axiom-native','other-declared']);
const FILE_MODES = new Set(['none','read-only','read-write']);
const NETWORK_MODES = new Set(['none','egress-bounded']);
const PROCESS_MODES = new Set(['none','spawn-bounded']);
const CONSEQUENCE_CLASSES = new Set(['C0','C1','C2','C3']);
const REVOCATION_STATES = new Set(['active','revoked','unknown']);
const CURRENTNESS_STATES = new Set(['current','stale','unknown']);

export function validateOutcome(document) {
  exactObject(document, 'Outcome', [
    'schema','version','status','outcome_id','owner_principal_id','intent','acceptance_criteria',
    'purpose_ref','authority_refs','data_classes','task_ids','effect_boundaries','resource_envelope_ref',
    'cost_budget','deadline','created_at','updated_at','completion_state','evidence_refs',
    'grants_authority','execution_effect','runtime_activation'
  ]);
  if (
    document.schema !== OUTCOME_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
    || document.grants_authority !== false
    || document.execution_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Outcome activation boundary is invalid');

  id(document.outcome_id, 'outcome_id');
  id(document.owner_principal_id, 'owner_principal_id');
  text(document.intent, 'intent', 1, 4000);
  uniqueTextArray(document.acceptance_criteria, 'acceptance_criteria', 1, 64, 2000);
  nullableId(document.purpose_ref, 'purpose_ref');
  idArray(document.authority_refs, 'authority_refs', 64);
  uniqueTextArray(document.data_classes, 'data_classes', 0, 64, 512);
  idArray(document.task_ids, 'task_ids', 4096);
  enumArray(document.effect_boundaries, 'effect_boundaries', EFFECTS, 1, 16);
  nullableId(document.resource_envelope_ref, 'resource_envelope_ref');
  validateCostBudget(document.cost_budget);
  const created = canonicalDate(document.created_at, 'created_at');
  const updated = canonicalDate(document.updated_at, 'updated_at');
  if (updated < created) throw new ValidationError('Outcome updated_at cannot precede created_at');
  if (document.deadline !== null && canonicalDate(document.deadline, 'deadline') < created) {
    throw new ValidationError('Outcome deadline cannot precede created_at');
  }
  if (!COMPLETION_STATES.has(document.completion_state)) {
    throw new ValidationError('Outcome completion_state is invalid');
  }
  uniqueTextArray(document.evidence_refs, 'evidence_refs', 0, 512, 512);
  if (document.completion_state === 'completed-verified' && document.evidence_refs.length === 0) {
    throw new ValidationError('Verified outcome completion requires evidence_refs');
  }
  return Object.freeze({
    valid:true,
    schema:document.schema,
    outcome_id:document.outcome_id,
    outcome_digest:digestObject(document),
    completion_state:document.completion_state,
    authority_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  });
}

export function outcomeDigest(document) {
  validateOutcome(document);
  return digestObject(document);
}

export function validateTaskLifecycle(document) {
  exactObject(document, 'Task lifecycle', [
    'schema','version','status','task_id','outcome_id','principal_id','lifecycle_state',
    'created_at','updated_at','worker_ref','provider_ref','node_ref','authority_snapshot_ref',
    'authority_checked_at','budget_ref','budget_checked_at','resume_requested','resume_from_digest',
    'effect_state','result_refs','grants_authority','execution_effect','runtime_activation'
  ]);
  if (
    document.schema !== TASK_LIFECYCLE_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
    || document.grants_authority !== false
    || document.execution_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Task lifecycle activation boundary is invalid');

  id(document.task_id, 'task_id');
  id(document.outcome_id, 'outcome_id');
  id(document.principal_id, 'principal_id');
  if (!TASK_STATES.has(document.lifecycle_state)) throw new ValidationError('Task lifecycle_state is invalid');
  const created = canonicalDate(document.created_at, 'created_at');
  const updated = canonicalDate(document.updated_at, 'updated_at');
  if (updated < created) throw new ValidationError('Task updated_at cannot precede created_at');
  nullableId(document.worker_ref, 'worker_ref');
  nullableId(document.provider_ref, 'provider_ref');
  nullableId(document.node_ref, 'node_ref');
  nullableId(document.authority_snapshot_ref, 'authority_snapshot_ref');
  nullableDate(document.authority_checked_at, 'authority_checked_at');
  nullableId(document.budget_ref, 'budget_ref');
  nullableDate(document.budget_checked_at, 'budget_checked_at');
  if (typeof document.resume_requested !== 'boolean') throw new ValidationError('resume_requested must be boolean');
  if (document.resume_from_digest !== null) digest(document.resume_from_digest, 'resume_from_digest');
  if (document.resume_requested) {
    if (
      document.resume_from_digest === null
      || document.authority_snapshot_ref === null
      || document.authority_checked_at === null
      || document.budget_ref === null
      || document.budget_checked_at === null
    ) throw new ValidationError('Task resumption requires prior digest plus current authority and budget references');
  } else if (document.resume_from_digest !== null) {
    throw new ValidationError('Non-resumed task cannot carry resume_from_digest');
  }
  if (!EFFECT_STATES.has(document.effect_state)) throw new ValidationError('Task effect_state is invalid');
  uniqueTextArray(document.result_refs, 'result_refs', 0, 512, 512);
  if (document.lifecycle_state === 'completed-verified') {
    if (document.result_refs.length === 0) throw new ValidationError('Verified task completion requires result_refs');
    if (document.effect_state === 'pending' || document.effect_state === 'uncertain') {
      throw new ValidationError('Verified task completion cannot carry pending or uncertain effect state');
    }
  }
  if (document.lifecycle_state === 'uncertain-effect' && document.effect_state !== 'uncertain') {
    throw new ValidationError('uncertain-effect lifecycle requires uncertain effect_state');
  }
  if (document.effect_state === 'uncertain' && document.lifecycle_state !== 'uncertain-effect') {
    throw new ValidationError('uncertain effect_state requires uncertain-effect lifecycle');
  }
  return Object.freeze({
    valid:true,
    schema:document.schema,
    task_id:document.task_id,
    task_digest:digestObject(document),
    lifecycle_state:document.lifecycle_state,
    authority_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  });
}

export function taskLifecycleDigest(document) {
  validateTaskLifecycle(document);
  return digestObject(document);
}

export function assessTaskResume(document, current) {
  validateTaskLifecycle(document);
  exactObject(current, 'Task resume current state', [
    'previous_task_digest','authority_snapshot_ref','authority_current','budget_ref','budget_current'
  ]);
  const reasons = [];
  if (!document.resume_requested) reasons.push('resume-not-requested');
  if (document.resume_from_digest !== current.previous_task_digest) reasons.push('prior-task-digest-mismatch');
  if (document.authority_snapshot_ref !== current.authority_snapshot_ref) reasons.push('authority-snapshot-mismatch');
  if (current.authority_current !== true) reasons.push('authority-not-current');
  if (document.budget_ref !== current.budget_ref) reasons.push('budget-ref-mismatch');
  if (current.budget_current !== true) reasons.push('budget-not-current');
  return Object.freeze({
    eligible:reasons.length === 0,
    reasons:Object.freeze(reasons),
    authority_effect:'none',
    execution_effect:'none'
  });
}

export function validateSkillAdmission(document) {
  exactObject(document, 'Skill admission', [
    'schema','version','status','skill_id','format','source_ref','content_digest','provenance_refs',
    'declared_dependencies','requested_capabilities','filesystem','network','process','data_classes',
    'expected_effects','sandbox_profile_ref','consequence_class','review_refs','revocation_state',
    'currentness','grants_authority','installation_effect','runtime_activation'
  ]);
  if (
    document.schema !== SKILL_ADMISSION_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
    || document.grants_authority !== false
    || document.installation_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Skill admission activation boundary is invalid');

  id(document.skill_id, 'skill_id');
  if (!SKILL_FORMATS.has(document.format)) throw new ValidationError('Skill format is invalid');
  text(document.source_ref, 'source_ref', 1, 2048);
  digest(document.content_digest, 'content_digest');
  uniqueTextArray(document.provenance_refs, 'provenance_refs', 0, 128, 2048);
  uniqueTextArray(document.declared_dependencies, 'declared_dependencies', 0, 64, 512);
  idArray(document.requested_capabilities, 'requested_capabilities', 64);
  validateFilesystem(document.filesystem);
  validateNetwork(document.network);
  validateProcess(document.process);
  uniqueTextArray(document.data_classes, 'data_classes', 0, 64, 512);
  enumArray(document.expected_effects, 'expected_effects', EFFECTS, 1, 16);
  id(document.sandbox_profile_ref, 'sandbox_profile_ref');
  if (!CONSEQUENCE_CLASSES.has(document.consequence_class)) throw new ValidationError('Skill consequence_class is invalid');
  uniqueTextArray(document.review_refs, 'review_refs', 0, 128, 2048);
  if (!REVOCATION_STATES.has(document.revocation_state)) throw new ValidationError('Skill revocation_state is invalid');
  validateCurrentness(document.currentness);
  return Object.freeze({
    valid:true,
    schema:document.schema,
    skill_id:document.skill_id,
    admission_digest:digestObject(document),
    revocation_state:document.revocation_state,
    currentness:document.currentness.state,
    authority_effect:'none',
    installation_effect:'none',
    runtime_activation:false
  });
}

export function skillAdmissionDigest(document) {
  validateSkillAdmission(document);
  return digestObject(document);
}

export function assessSkillInvocation(document, request) {
  validateSkillAdmission(document);
  exactObject(request, 'Skill invocation request', [
    'capability','effect','filesystem_path','network_destination','command'
  ]);
  id(request.capability, 'capability');
  if (!EFFECTS.has(request.effect)) throw new ValidationError('Skill invocation effect is invalid');
  nullableText(request.filesystem_path, 'filesystem_path', 1024);
  nullableText(request.network_destination, 'network_destination', 2048);
  nullableText(request.command, 'command', 512);

  const reasons = [];
  if (document.revocation_state !== 'active') reasons.push('skill-not-active');
  if (document.currentness.state !== 'current') reasons.push('skill-not-current');
  if (!document.requested_capabilities.includes(request.capability)) reasons.push('capability-undeclared');
  if (!document.expected_effects.includes(request.effect)) reasons.push('effect-undeclared');

  if (request.filesystem_path !== null) {
    if (document.filesystem.mode === 'none' || !document.filesystem.paths.includes(request.filesystem_path)) {
      reasons.push('filesystem-scope-undeclared');
    }
  }
  if (request.network_destination !== null) {
    if (document.network.mode === 'none' || !document.network.destinations.includes(request.network_destination)) {
      reasons.push('network-scope-undeclared');
    }
  }
  if (request.command !== null) {
    if (document.process.mode === 'none' || !document.process.commands.includes(request.command)) {
      reasons.push('process-scope-undeclared');
    }
  }

  return Object.freeze({
    admitted:reasons.length === 0,
    reasons:Object.freeze(reasons),
    authority_effect:'none',
    execution_effect:'none'
  });
}

function validateCostBudget(value) {
  exactObject(value, 'Outcome cost_budget', ['currency','max_minor_units']);
  if (!Number.isSafeInteger(value.max_minor_units) || value.max_minor_units < 0) {
    throw new ValidationError('Outcome max_minor_units must be a non-negative safe integer');
  }
  if (value.max_minor_units === 0) {
    if (value.currency !== null) throw new ValidationError('Zero outcome budget currency must be null');
  } else if (typeof value.currency !== 'string' || !CURRENCY.test(value.currency)) {
    throw new ValidationError('Positive outcome budget requires a three-letter currency');
  }
}

function validateFilesystem(value) {
  exactObject(value, 'Skill filesystem', ['mode','paths']);
  if (!FILE_MODES.has(value.mode)) throw new ValidationError('Skill filesystem mode is invalid');
  uniqueTextArray(value.paths, 'Skill filesystem paths', 0, 128, 1024);
  if (value.mode === 'none' && value.paths.length !== 0) throw new ValidationError('Filesystem mode none requires empty paths');
}

function validateNetwork(value) {
  exactObject(value, 'Skill network', ['mode','destinations']);
  if (!NETWORK_MODES.has(value.mode)) throw new ValidationError('Skill network mode is invalid');
  uniqueTextArray(value.destinations, 'Skill network destinations', 0, 128, 2048);
  if (value.mode === 'none' && value.destinations.length !== 0) throw new ValidationError('Network mode none requires empty destinations');
}

function validateProcess(value) {
  exactObject(value, 'Skill process', ['mode','commands']);
  if (!PROCESS_MODES.has(value.mode)) throw new ValidationError('Skill process mode is invalid');
  uniqueTextArray(value.commands, 'Skill process commands', 0, 128, 512);
  if (value.mode === 'none' && value.commands.length !== 0) throw new ValidationError('Process mode none requires empty commands');
}

function validateCurrentness(value) {
  exactObject(value, 'Skill currentness', ['state','checked_at','expires_at']);
  if (!CURRENTNESS_STATES.has(value.state)) throw new ValidationError('Skill currentness state is invalid');
  const checked = canonicalDate(value.checked_at, 'Skill currentness checked_at');
  if (value.state === 'current') {
    if (value.expires_at === null) throw new ValidationError('Current skill admission requires expires_at');
    const expires = canonicalDate(value.expires_at, 'Skill currentness expires_at');
    if (expires <= checked) throw new ValidationError('Skill currentness expires_at must follow checked_at');
  } else if (value.expires_at !== null) {
    throw new ValidationError('Stale or unknown skill currentness cannot claim expires_at');
  }
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(label + ' must be an object');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new ValidationError(label + ' must be a plain object');
  const actual = Object.keys(value).sort().join(',');
  const expected = [...fields].sort().join(',');
  if (actual !== expected) throw new ValidationError(label + ' fields are invalid');
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(label + ' is invalid');
  return value;
}
function nullableId(value, label) { if (value === null) return null; return id(value, label); }
function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new ValidationError(label + ' must be a lowercase sha256 digest');
  return value;
}
function text(value, label, minimum, maximum) {
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > maximum) {
    throw new ValidationError(label + ' has invalid length');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new ValidationError(label + ' contains control characters');
  return value;
}
function nullableText(value, label, maximum) { if (value === null) return null; return text(value, label, 1, maximum); }
function uniqueTextArray(value, label, minimum, maximum, itemMaximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new ValidationError(label + ' has invalid cardinality');
  const seen = new Set();
  for (const item of value) {
    text(item, label + ' item', 1, itemMaximum);
    if (seen.has(item)) throw new ValidationError(label + ' contains duplicate values');
    seen.add(item);
  }
  return value;
}
function idArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new ValidationError(label + ' has invalid cardinality');
  const seen = new Set();
  for (const item of value) {
    id(item, label + ' item');
    if (seen.has(item)) throw new ValidationError(label + ' contains duplicate values');
    seen.add(item);
  }
  return value;
}
function enumArray(value, label, allowed, minimum, maximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new ValidationError(label + ' has invalid cardinality');
  const seen = new Set();
  for (const item of value) {
    if (!allowed.has(item)) throw new ValidationError(label + ' contains invalid value');
    if (seen.has(item)) throw new ValidationError(label + ' contains duplicate values');
    seen.add(item);
  }
  return value;
}
function canonicalDate(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(label + ' must be a canonical ISO timestamp');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(label + ' must be a canonical ISO timestamp');
  }
  return parsed.getTime();
}
function nullableDate(value, label) { if (value === null) return null; return canonicalDate(value, label); }

import { digestObject, ValidationError } from './canonical.mjs';

export const DORMANT_OBLIGATION_SCHEMA = 'axiom-dormant-obligation.v0';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const TRIGGER_KINDS = new Set(['event','deadline','condition-change','protest','resource-health','maintenance','reflection']);
const PRIORITIES = new Set(['P1','P2','P3','P4']);
const STATES = new Set(['dormant','completed','cancelled','expired']);

export function validateDormantObligation(document) {
  validateShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    obligation_id: document.obligation_id,
    principal_id: document.principal_id,
    state: document.state,
    obligation_digest: digestObject(document),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function dormantObligationDigest(document) {
  validateShape(document);
  return digestObject(document);
}

export function matchDormantObligationTrigger(document, event, at) {
  validateShape(document);
  const atMs = date(at, 'at');
  const expiresMs = date(document.expires_at, 'expires_at');
  if (atMs > expiresMs) return result(false, 'expired');
  if (document.state !== 'dormant') return result(false, 'not-dormant');

  const notBeforeMs = document.not_before_at === null ? null : date(document.not_before_at, 'not_before_at');
  if (notBeforeMs !== null && atMs < notBeforeMs) return result(false, 'not-before');

  let triggerEvidenceRef = null;
  let triggerEventId = null;
  if (document.trigger.kind === 'deadline') {
    const dueMs = date(document.trigger.due_at, 'trigger.due_at');
    if (atMs < dueMs) return result(false, 'deadline-not-due');
  } else {
    validateEvent(event);
    if (event.kind !== document.trigger.kind || event.matcher_ref !== document.trigger.matcher_ref) return result(false, 'trigger-mismatch');
    const occurredMs = date(event.occurred_at, 'event.occurred_at');
    if (occurredMs > atMs) return result(false, 'event-in-future');
    if (notBeforeMs !== null && occurredMs < notBeforeMs) return result(false, 'not-before-event');
    if (occurredMs > expiresMs) return result(false, 'expired');
    triggerEvidenceRef = event.evidence_ref;
    triggerEventId = event.event_id;
  }

  const proposal = Object.freeze({
    proposal_kind: 'normal-admission-input',
    obligation_id: document.obligation_id,
    principal_id: document.principal_id,
    provenance_ref: document.provenance_ref,
    direction_ref: document.direction_ref,
    priority_class: document.priority_class,
    authority_scope_ref: document.authority_scope_ref,
    resource_profile_ref: document.resource_profile_ref,
    task_template_ref: document.task_template_ref,
    trigger_event_id: triggerEventId,
    trigger_evidence_ref: triggerEvidenceRef,
    normal_admission_required: true,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
  return Object.freeze({ matched: true, reason: 'matched', proposal });
}

function result(matched, reason) {
  return Object.freeze({ matched, reason, proposal: null });
}

function validateShape(document) {
  exactObject(document, 'Dormant obligation', [
    'schema','version','status','obligation_id','principal_id','direction_ref','provenance_ref','trigger','priority_class','authority_scope_ref','resource_profile_ref','task_template_ref','normal_readmission_required','created_at','not_before_at','expires_at','state','contains_secret_material','authority_effect','network_effect','runtime_activation'
  ]);
  if (document.schema !== DORMANT_OBLIGATION_SCHEMA || document.version !== 0 || document.status !== 'inert-contract-laboratory') {
    throw new ValidationError('Dormant obligation schema/version/status is invalid');
  }
  id(document.obligation_id, 'obligation_id');
  id(document.principal_id, 'principal_id');
  id(document.direction_ref, 'direction_ref');
  id(document.provenance_ref, 'provenance_ref');
  validateTrigger(document.trigger);
  if (!PRIORITIES.has(document.priority_class)) throw new ValidationError('priority_class is invalid');
  id(document.authority_scope_ref, 'authority_scope_ref');
  id(document.resource_profile_ref, 'resource_profile_ref');
  id(document.task_template_ref, 'task_template_ref');
  if (document.normal_readmission_required !== true) throw new ValidationError('normal_readmission_required must remain true');
  const created = date(document.created_at, 'created_at');
  const notBefore = document.not_before_at === null ? null : date(document.not_before_at, 'not_before_at');
  const expires = date(document.expires_at, 'expires_at');
  if (notBefore !== null && notBefore < created) throw new ValidationError('not_before_at cannot precede created_at');
  if (expires < created || (notBefore !== null && expires < notBefore)) throw new ValidationError('expires_at cannot precede creation/not-before bounds');
  if (!STATES.has(document.state)) throw new ValidationError('state is invalid');
  if (document.contains_secret_material !== false) throw new ValidationError('contains_secret_material must be false for v0');
  if (document.authority_effect !== 'none' || document.network_effect !== 'none' || document.runtime_activation !== false) {
    throw new ValidationError('Dormant obligation activation boundary is invalid');
  }
}

function validateTrigger(value) {
  exactObject(value, 'Dormant obligation trigger', ['kind','matcher_ref','due_at']);
  if (!TRIGGER_KINDS.has(value.kind)) throw new ValidationError('trigger kind is invalid');
  if (value.kind === 'deadline') {
    if (value.matcher_ref !== null) throw new ValidationError('deadline trigger matcher_ref must be null');
    date(value.due_at, 'trigger.due_at');
  } else {
    id(value.matcher_ref, 'trigger.matcher_ref');
    if (value.due_at !== null) throw new ValidationError('non-deadline trigger due_at must be null');
  }
}

function validateEvent(value) {
  exactObject(value, 'Trigger event', ['event_id','kind','matcher_ref','occurred_at','evidence_ref']);
  id(value.event_id, 'event.event_id');
  if (!TRIGGER_KINDS.has(value.kind) || value.kind === 'deadline') throw new ValidationError('event kind is invalid');
  id(value.matcher_ref, 'event.matcher_ref');
  date(value.occurred_at, 'event.occurred_at');
  id(value.evidence_ref, 'event.evidence_ref');
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new ValidationError(`${label} must be a plain object`);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  for (const key of fields) if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
}
function id(value, label) { if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(`${label} is invalid`); return value; }
function date(value, label) { if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`); const parsed = new Date(value); if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(`${label} must be a canonical ISO timestamp`); return parsed.getTime(); }

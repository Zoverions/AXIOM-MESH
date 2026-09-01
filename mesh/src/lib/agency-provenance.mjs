import { digestObject, ValidationError } from './canonical.mjs';

export const AGENCY_PROVENANCE_SCHEMA = 'axiom-agency-provenance.v0';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const MODES = new Set(['direct', 'delegated', 'joint', 'advisory', 'none']);
const POSITIONS = new Set(['own', 'represented', 'joint', 'none']);
const PROTEST_KINDS = new Set(['dissent', 'objection', 'blocking_protest']);
const TARGET_STAGES = new Set(['intent','cognition','decision','authorization','execution','attribution','protest','deliberation']);
const SEVERITIES = new Set(['notice','concern','high','critical']);
const REMEDIES = new Set(['record-only','explain','correct','reconsider','stay','revoke','other']);
const PROTEST_STATUSES = new Set(['open','acknowledged','resolved','rejected','withdrawn','superseded']);

export function validateAgencyProvenance(document) {
  validateShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    provenance_id: document.provenance_id,
    subject_ref: document.subject_ref,
    intent_principal_id: document.intent.principal_id,
    decision_principal_id: document.decision.principal_id,
    authorization_principal_id: document.authorization.principal_id,
    execution_principal_id: document.execution.principal_id,
    attribution_principal_id: document.attribution.principal_id,
    protest_count: document.protests.length,
    provenance_digest: digestObject(document),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function agencyProvenanceDigest(document) {
  validateShape(document);
  return digestObject(document);
}

function validateShape(document) {
  exactObject(document, 'Agency provenance', [
    'schema','version','status','provenance_id','subject_ref','intent','cognition','decision','authorization','execution','attribution','protests','created_at','updated_at','contains_secret_material','authority_effect','network_effect','runtime_activation'
  ]);
  if (document.schema !== AGENCY_PROVENANCE_SCHEMA || document.version !== 0 || document.status !== 'inert-contract-laboratory') {
    throw new ValidationError('Agency provenance schema/version/status is invalid');
  }
  id(document.provenance_id, 'provenance_id');
  id(document.subject_ref, 'subject_ref');
  validateStage(document.intent, 'intent');
  if (!Array.isArray(document.cognition) || document.cognition.length < 1 || document.cognition.length > 16) {
    throw new ValidationError('cognition must contain 1-16 stage descriptors');
  }
  for (const [index, item] of document.cognition.entries()) validateStage(item, `cognition[${index}]`);
  validateStage(document.decision, 'decision');
  validateStage(document.authorization, 'authorization');
  validateStage(document.execution, 'execution');
  validateStage(document.attribution, 'attribution');
  if (!Array.isArray(document.protests) || document.protests.length > 32) throw new ValidationError('protests must contain at most 32 items');
  const protestIds = new Set();
  for (const protest of document.protests) {
    validateProtest(protest);
    if (protestIds.has(protest.protest_id)) throw new ValidationError(`protests contains duplicate protest_id ${protest.protest_id}`);
    protestIds.add(protest.protest_id);
  }
  const created = date(document.created_at, 'created_at');
  const updated = date(document.updated_at, 'updated_at');
  if (updated < created) throw new ValidationError('updated_at cannot precede created_at');
  if (document.contains_secret_material !== false) throw new ValidationError('contains_secret_material must be false for v0');
  if (document.authority_effect !== 'none' || document.network_effect !== 'none' || document.runtime_activation !== false) {
    throw new ValidationError('Agency provenance activation boundary is invalid');
  }
}

function validateStage(value, label) {
  exactObject(value, `${label} stage`, ['principal_id','role','mode','basis_ref','claimed_position']);
  id(value.principal_id, `${label}.principal_id`);
  id(value.role, `${label}.role`);
  if (!MODES.has(value.mode)) throw new ValidationError(`${label}.mode is invalid`);
  nullableId(value.basis_ref, `${label}.basis_ref`);
  if (!POSITIONS.has(value.claimed_position)) throw new ValidationError(`${label}.claimed_position is invalid`);
  if (value.mode === 'joint' && value.claimed_position !== 'joint') throw new ValidationError(`${label} joint mode requires joint claimed_position`);
}

function validateProtest(value) {
  exactObject(value, 'Protest', ['protest_id','principal_id','kind','target_stage','target_ref','reason_code','reason_ref','severity','requested_remedy','stop_right_ref','status','created_at']);
  id(value.protest_id, 'protest_id');
  id(value.principal_id, 'protest principal_id');
  if (!PROTEST_KINDS.has(value.kind)) throw new ValidationError('protest kind is invalid');
  if (!TARGET_STAGES.has(value.target_stage)) throw new ValidationError('protest target_stage is invalid');
  id(value.target_ref, 'protest target_ref');
  id(value.reason_code, 'protest reason_code');
  nullableId(value.reason_ref, 'protest reason_ref');
  if (!SEVERITIES.has(value.severity)) throw new ValidationError('protest severity is invalid');
  if (!REMEDIES.has(value.requested_remedy)) throw new ValidationError('protest requested_remedy is invalid');
  nullableId(value.stop_right_ref, 'protest stop_right_ref');
  if (value.kind === 'blocking_protest' && value.stop_right_ref === null) {
    throw new ValidationError('blocking_protest requires an independent stop_right_ref');
  }
  if (!PROTEST_STATUSES.has(value.status)) throw new ValidationError('protest status is invalid');
  date(value.created_at, 'protest created_at');
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
function nullableId(value, label) { if (value === null) return null; return id(value, label); }
function date(value, label) { if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`); const parsed = new Date(value); if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(`${label} must be a canonical ISO timestamp`); return parsed.getTime(); }

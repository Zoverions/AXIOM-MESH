import { digestObject, ValidationError } from './canonical.mjs';
import { validateAutonomyEnvelope } from './autonomy-envelope.mjs';
import { outcomeDigest, skillAdmissionDigest, taskLifecycleDigest } from './agent-os-contracts.mjs';
import { executionRoutePolicyDigest } from './execution-route-policy.mjs';
import { taskContinuityPolicyDigest } from './task-continuity-policy.mjs';
import { validateExternalAgentIngressRequest } from './external-agent-ingress-request.mjs';
import { aiExecutionProvenanceDigest } from './ai-execution-provenance.mjs';
import { verifiedWorkGraphDigest } from './verified-work-graph.mjs';
import { validateSemanticOperationProposal } from './semantic-operation-proposal-core.mjs';
import { persistentEntityBundleDigest } from './persistent-entity-bundle.mjs';

export const SPECIALIST_HARNESS_BRIDGE_SCHEMA = 'axiom-specialist-harness-bridge.v0';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const EFFECTS = new Set(["none","read-external","write-external","publish-external","communication","financial","create-external-resource","delete-external-resource","physical"]);
const CONSEQUENCE = Object.freeze(['C0','C1','C2','C3']);
const ROUTE_CLASSES = new Set(['structured-api','mcp-tool','cli','semantic-ui','visual-computer-use']);
const ADAPTER_KINDS = new Set(['tool-harness','skill','external-agent']);
const OUTPUT_STATES = new Set(['pending','recorded']);
// A bridge never binds, names, or continues a mind, and never carries a Founder Genesis receipt.
const MIND_OR_GENESIS_FIELD = /(^|_)(mind|minds)(_|$)|genesis/i;
const MIND_OR_GENESIS_REF = /^(mind|minds|genesis|founder[-_.:]?genesis)([-_.:#/]|$)|genesis[-_.:]?receipt/i;

const HARD_ZEROS = Object.freeze({
  authority_effect: 'none',
  execution_effect: 'none',
  network_effect: 'none',
  delegation_effect: 'none',
  population_effect: 'none',
  governance_identity_effect: 'none',
  runtime_activation: false
});
const HEADER = Object.freeze({ schema: SPECIALIST_HARNESS_BRIDGE_SCHEMA, version: 0, status: 'inert-evidence-binding' });
const BODY_FIELDS = Object.freeze([
  'bridge_id','subject_principal_id','task_binding','ceiling_binding','adapter_binding','data_binding',
  'issued_at','expires_at','cancellation_handle','handoff_binding','provenance_binding','composition_binding'
]);
const TOP_LEVEL_FIELDS = Object.freeze([...Object.keys(HEADER), ...BODY_FIELDS, ...Object.keys(HARD_ZEROS)]);
const OPTION_FIELDS = new Set(['envelope','now','expectedDigest','references']);
const REFERENCE_FIELDS = new Set([
  'outcome','task_lifecycle','execution_route_policy','skill_admission','external_agent_ingress',
  'task_continuity_policy','ai_execution_provenance','verified_work_graph',
  'semantic_operation_proposal','persistent_entity_bundle'
]);

/**
 * Build an inert Specialist Harness Bridge from its body fields. Schema
 * header and hard zeros are pinned here and can never be supplied by callers.
 */
export function buildSpecialistHarnessBridge(input, options = {}) {
  rejectMindOrGenesisFields(input);
  exactObject(input, 'Specialist harness bridge input', BODY_FIELDS);
  const document = { ...HEADER, ...structuredClone(input), ...HARD_ZEROS };
  validateSpecialistHarnessBridge(document, options);
  return deepFreeze(document);
}

export function validateSpecialistHarnessBridge(document, options = {}) {
  validateOptions(options);
  rejectMindOrGenesisFields(document);
  exactObject(document, 'Specialist harness bridge', TOP_LEVEL_FIELDS);
  if (
    document.schema !== SPECIALIST_HARNESS_BRIDGE_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence-binding'
  ) throw new ValidationError('Specialist harness bridge schema/version/status is invalid');
  for (const [field, value] of Object.entries(HARD_ZEROS)) {
    if (document[field] !== value) {
      throw new ValidationError(`Specialist harness bridge hard zero ${field} is invalid`);
    }
  }

  id(document.bridge_id, 'bridge_id');
  id(document.subject_principal_id, 'subject_principal_id');
  id(document.cancellation_handle, 'cancellation_handle');
  const issued = canonicalDate(document.issued_at, 'issued_at');
  const expires = canonicalDate(document.expires_at, 'expires_at');
  if (expires <= issued) throw new ValidationError('expires_at must follow issued_at');

  validateTaskBinding(document.task_binding);
  validateCeilingBinding(document.ceiling_binding);
  validateAdapterBinding(document.adapter_binding, document.subject_principal_id);
  validateDataBinding(document.data_binding);
  exactObject(document.handoff_binding, 'handoff_binding', ['task_continuity_policy_digest']);
  digest(document.handoff_binding.task_continuity_policy_digest, 'task_continuity_policy_digest');
  exactObject(document.provenance_binding, 'provenance_binding', [
    'portable_delegation_grant_digest','ai_execution_provenance_digest','verified_work_graph_digest'
  ]);
  digest(document.provenance_binding.portable_delegation_grant_digest, 'portable_delegation_grant_digest');
  nullableDigest(document.provenance_binding.ai_execution_provenance_digest, 'ai_execution_provenance_digest');
  nullableDigest(document.provenance_binding.verified_work_graph_digest, 'verified_work_graph_digest');
  exactObject(document.composition_binding, 'composition_binding', [
    'semantic_operation_proposal_digest','persistent_entity_bundle_digest'
  ]);
  nullableDigest(document.composition_binding.semantic_operation_proposal_digest, 'semantic_operation_proposal_digest');
  nullableDigest(document.composition_binding.persistent_entity_bundle_digest, 'persistent_entity_bundle_digest');

  const bridgeDigest = digestObject(document);
  if (options.expectedDigest !== undefined) {
    digest(options.expectedDigest, 'expectedDigest');
    if (options.expectedDigest !== bridgeDigest) throw new ValidationError('Specialist harness bridge digest mismatch');
  }

  let envelopeChecked = false;
  if (options.envelope !== undefined) {
    checkEnvelope(document, issued, expires, options.envelope);
    envelopeChecked = true;
  }
  let currentnessChecked = false;
  if (options.now !== undefined) {
    const now = evaluationTime(options.now);
    if (now < issued) throw new ValidationError('Specialist harness bridge is not yet current');
    if (now >= expires) throw new ValidationError('Specialist harness bridge is expired');
    currentnessChecked = true;
  }
  const referencesChecked = options.references === undefined ? [] : checkReferences(document, options.references);

  return Object.freeze({
    valid: true,
    schema: document.schema,
    bridge_id: document.bridge_id,
    bridge_digest: bridgeDigest,
    envelope_checked: envelopeChecked,
    currentness_checked: currentnessChecked,
    references_checked: Object.freeze(referencesChecked),
    grants_authority: false,
    ...HARD_ZEROS
  });
}

export function specialistHarnessBridgeDigest(document) {
  validateSpecialistHarnessBridge(document);
  return digestObject(document);
}

function validateTaskBinding(value) {
  exactObject(value, 'task_binding', ['outcome_digest','task_lifecycle_digest']);
  digest(value.outcome_digest, 'outcome_digest');
  digest(value.task_lifecycle_digest, 'task_lifecycle_digest');
}

function validateCeilingBinding(value) {
  exactObject(value, 'ceiling_binding', [
    'autonomy_envelope_digest','capability_ids','data_classes','effect_classes',
    'consequence_ceiling','max_execution_ms','max_cost'
  ]);
  digest(value.autonomy_envelope_digest, 'autonomy_envelope_digest');
  finiteIdArray(value.capability_ids, 'capability_ids', 0, 128);
  finiteTextArray(value.data_classes, 'data_classes', 0, 128, 512);
  enumArray(value.effect_classes, 'effect_classes', EFFECTS, 1, 9);
  if (!CONSEQUENCE.includes(value.consequence_ceiling)) throw new ValidationError('consequence_ceiling is invalid');
  integer(value.max_execution_ms, 'max_execution_ms', 1, 300000);
  if (value.max_cost !== null) {
    exactObject(value.max_cost, 'max_cost', ['currency','max_minor_units']);
    if (typeof value.max_cost.currency !== 'string' || !CURRENCY.test(value.max_cost.currency)) {
      throw new ValidationError('max_cost currency is invalid');
    }
    integer(value.max_cost.max_minor_units, 'max_cost max_minor_units', 0, Number.MAX_SAFE_INTEGER);
  }
}

function validateAdapterBinding(value, subject) {
  exactObject(value, 'adapter_binding', [
    'adapter_ref','adapter_kind','execution_route_policy_digest','route_class',
    'skill_admission_digest','external_agent_ingress_digest'
  ]);
  id(value.adapter_ref, 'adapter_ref');
  if (MIND_OR_GENESIS_REF.test(value.adapter_ref)) {
    throw new ValidationError('adapter_ref cannot be a mind identity or Genesis receipt');
  }
  if (value.adapter_ref === subject) throw new ValidationError('adapter_ref cannot be the subject principal');
  if (!ADAPTER_KINDS.has(value.adapter_kind)) throw new ValidationError('adapter_kind is invalid');
  digest(value.execution_route_policy_digest, 'execution_route_policy_digest');
  if (!ROUTE_CLASSES.has(value.route_class)) throw new ValidationError('route_class is invalid');
  nullableDigest(value.skill_admission_digest, 'skill_admission_digest');
  nullableDigest(value.external_agent_ingress_digest, 'external_agent_ingress_digest');
  const skill = value.skill_admission_digest !== null;
  const ingress = value.external_agent_ingress_digest !== null;
  if (
    (value.adapter_kind === 'skill' && (!skill || ingress))
    || (value.adapter_kind === 'external-agent' && (skill || !ingress))
    || (value.adapter_kind === 'tool-harness' && (skill || ingress))
  ) throw new ValidationError('adapter_kind does not match its admission reference');
}

function validateDataBinding(value) {
  exactObject(value, 'data_binding', ['data_projection_digest','output_state','output_digest']);
  digest(value.data_projection_digest, 'data_projection_digest');
  if (!OUTPUT_STATES.has(value.output_state)) throw new ValidationError('output_state is invalid');
  nullableDigest(value.output_digest, 'output_digest');
  if ((value.output_state === 'pending') !== (value.output_digest === null)) {
    throw new ValidationError('output_digest must be null exactly while output_state is pending');
  }
}

function checkEnvelope(document, issued, expires, envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new ValidationError('Autonomy envelope must be an object');
  }
  if (envelope.delegation_allowed !== false) {
    throw new ValidationError('Specialist harness bridge is non-delegating; envelope delegation_allowed must be false');
  }
  const envelopeDigest = validateAutonomyEnvelope(envelope).envelope_digest;
  const ceiling = document.ceiling_binding;
  if (envelopeDigest !== ceiling.autonomy_envelope_digest) {
    throw new ValidationError('autonomy_envelope_digest does not match the supplied envelope');
  }
  if (envelope.subject_principal_id !== document.subject_principal_id) {
    throw new ValidationError('subject_principal_id does not match the envelope subject');
  }
  subset(ceiling.capability_ids, envelope.capability_ids, 'capability_ids');
  subset(ceiling.data_classes, envelope.data_classes, 'data_classes');
  subset(ceiling.effect_classes, envelope.effect_classes, 'effect_classes');
  if (CONSEQUENCE.indexOf(ceiling.consequence_ceiling) > CONSEQUENCE.indexOf(envelope.consequence_ceiling)) {
    throw new ValidationError('consequence_ceiling exceeds the envelope ceiling');
  }
  if (ceiling.max_execution_ms > envelope.max_execution_ms) {
    throw new ValidationError('max_execution_ms exceeds the envelope ceiling');
  }
  if (ceiling.max_cost !== null) {
    if (envelope.max_cost === null) throw new ValidationError('max_cost exceeds the envelope ceiling');
    if (ceiling.max_cost.currency !== envelope.max_cost.currency) {
      throw new ValidationError('max_cost currency does not match the envelope ceiling');
    }
    if (ceiling.max_cost.max_minor_units > envelope.max_cost.max_minor_units) {
      throw new ValidationError('max_cost exceeds the envelope ceiling');
    }
  }
  if (issued < Date.parse(envelope.active_from)) throw new ValidationError('issued_at precedes the envelope active_from');
  if (expires > Date.parse(envelope.expires_at)) throw new ValidationError('expires_at exceeds the envelope expires_at');
}

function checkReferences(document, references) {
  if (!references || typeof references !== 'object' || Array.isArray(references)) {
    throw new ValidationError('references must be an object');
  }
  for (const key of Object.keys(references)) {
    if (!REFERENCE_FIELDS.has(key)) throw new ValidationError(`references.${key} is not a supported reference`);
  }
  const checked = [];
  const bind = (key, expected, compute) => {
    if (references[key] === undefined) return;
    if (expected === null) throw new ValidationError(`references.${key} was supplied but the bridge binds no digest for it`);
    if (compute(references[key]) !== expected) throw new ValidationError(`${key} digest does not match the bridge binding`);
    checked.push(key);
  };
  bind('outcome', document.task_binding.outcome_digest, outcomeDigest);
  bind('task_lifecycle', document.task_binding.task_lifecycle_digest, taskLifecycleDigest);
  bind('execution_route_policy', document.adapter_binding.execution_route_policy_digest, value => {
    const policyDigest = executionRoutePolicyDigest(value);
    if (!value.route_order.includes(document.adapter_binding.route_class)) {
      throw new ValidationError('route_class is not permitted by the execution route policy');
    }
    return policyDigest;
  });
  bind('skill_admission', document.adapter_binding.skill_admission_digest, skillAdmissionDigest);
  bind('external_agent_ingress', document.adapter_binding.external_agent_ingress_digest,
    value => validateExternalAgentIngressRequest(value).request_digest);
  bind('task_continuity_policy', document.handoff_binding.task_continuity_policy_digest, value => {
    const policyDigest = taskContinuityPolicyDigest(value);
    if (
      value.outcome_digest !== document.task_binding.outcome_digest
      || value.task_digest !== document.task_binding.task_lifecycle_digest
    ) throw new ValidationError('task continuity policy is bound to a different outcome or task');
    return policyDigest;
  });
  bind('ai_execution_provenance', document.provenance_binding.ai_execution_provenance_digest, aiExecutionProvenanceDigest);
  bind('verified_work_graph', document.provenance_binding.verified_work_graph_digest, verifiedWorkGraphDigest);
  bind('semantic_operation_proposal', document.composition_binding.semantic_operation_proposal_digest,
    value => validateSemanticOperationProposal(value).proposal_digest);
  bind('persistent_entity_bundle', document.composition_binding.persistent_entity_bundle_digest, persistentEntityBundleDigest);
  return checked;
}

function validateOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new ValidationError('options must be an object');
  for (const key of Object.keys(options)) {
    if (!OPTION_FIELDS.has(key)) throw new ValidationError(`options.${key} is not supported`);
  }
}

function rejectMindOrGenesisFields(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectMindOrGenesisFields(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (MIND_OR_GENESIS_FIELD.test(key)) {
      throw new ValidationError(`forbidden mind or Genesis field ${path}.${key}`);
    }
    rejectMindOrGenesisFields(value[key], `${path}.${key}`);
  }
}

function subset(values, ceiling, label) {
  const allowed = new Set(ceiling);
  for (const value of values) {
    if (!allowed.has(value)) throw new ValidationError(`${label} exceeds the envelope ceiling`);
  }
}
function evaluationTime(value) {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
  if (!Number.isFinite(time)) throw new ValidationError('now is invalid');
  return time;
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
function exactObject(value,label,fields){if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(label+' must be an object');const a=Object.keys(value).sort().join(',');const e=[...fields].sort().join(',');if(a!==e)throw new ValidationError(label+' fields are invalid');}
function id(value,label){if(typeof value!=='string'||!ID.test(value))throw new ValidationError(label+' is invalid');}
function digest(value,label){if(typeof value!=='string'||!DIGEST.test(value))throw new ValidationError(label+' must be a lowercase sha256 digest');}
function nullableDigest(value,label){if(value!==null)digest(value,label);}
function finiteText(value,label,max){if(typeof value!=='string'||value.length<1||value.length>max||value==='*'||value.toLowerCase()==='all')throw new ValidationError(label+' is invalid');}
function finiteIdArray(value,label,min,max){if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' is invalid');const s=new Set();for(const item of value){id(item,label+' item');if(item.includes('*')||item.toLowerCase()==='all'||item.toLowerCase()==='administrator')throw new ValidationError(label+' contains ambient authority syntax');if(s.has(item))throw new ValidationError(label+' contains duplicate values');s.add(item);}}
function finiteTextArray(value,label,min,max,itemMax){if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' is invalid');const s=new Set();for(const item of value){finiteText(item,label+' item',itemMax);if(s.has(item))throw new ValidationError(label+' contains duplicate values');s.add(item);}}
function enumArray(value,label,allowed,min,max){if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' is invalid');const s=new Set();for(const item of value){if(!allowed.has(item))throw new ValidationError(label+' contains invalid value');if(s.has(item))throw new ValidationError(label+' contains duplicate values');s.add(item);}}
function integer(value,label,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)throw new ValidationError(label+' is invalid');}
function canonicalDate(value,label){if(typeof value!=='string'||value.length>64)throw new ValidationError(label+' must be a canonical ISO timestamp');const d=new Date(value);if(!Number.isFinite(d.getTime())||d.toISOString()!==value)throw new ValidationError(label+' must be a canonical ISO timestamp');return d.getTime();}

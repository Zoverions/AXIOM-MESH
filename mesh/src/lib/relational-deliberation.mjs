import { digestObject, ValidationError } from './canonical.mjs';

export const RELATIONAL_DELIBERATION_SCHEMA = 'axiom-relational-deliberation.v0';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const CONFIDENCE = new Set(['unknown','low','medium','high']);
const CONSEQUENCE = new Set(['low','moderate','high','critical']);
const EVIDENCE_QUALITY = new Set(['preliminary','corroborated','independent','authoritative']);
const OUTCOMES = new Set(['agreement','acknowledged-disagreement','human-decision-with-counterpart-dissent','counterpart-decision-with-human-dissent','joint-decision','deferred-pending-evidence','escalated','no-decision']);

export function validateRelationalDeliberation(document) {
  validateShape(document);
  return Object.freeze({valid:true,schema:document.schema,deliberation_id:document.deliberation_id,subject_ref:document.subject_ref,participant_count:document.participants.length,outcome:document.outcome,decision_authority_ref:document.decision_authority_ref,deliberation_digest:digestObject(document),authority_effect:'none',network_effect:'none',runtime_activation:false});
}
export function relationalDeliberationDigest(document){validateShape(document);return digestObject(document);}

function validateShape(document){
  exactObject(document,'Relational deliberation',['schema','version','status','deliberation_id','subject_ref','question','participants','positions','conflicts','stakes','unknown_refs','learning_requests','protest_refs','recommendations','decision_authority_ref','reconsideration_trigger_refs','outcome','created_at','updated_at','contains_secret_material','authority_effect','network_effect','runtime_activation']);
  if(document.schema!==RELATIONAL_DELIBERATION_SCHEMA||document.version!==0||document.status!=='inert-contract-laboratory')throw new ValidationError('Relational deliberation schema/version/status is invalid');
  id(document.deliberation_id,'deliberation_id');id(document.subject_ref,'subject_ref');
  if(typeof document.question!=='string'||document.question.length<1||document.question.length>4096)throw new ValidationError('question must contain 1-4096 characters');
  const participants=uniqueIds(document.participants,'participants',32,true);
  if(!Array.isArray(document.positions)||document.positions.length!==participants.size)throw new ValidationError('positions must contain exactly one position per participant');
  const positioned=new Set();
  for(const position of document.positions){
    exactObject(position,'Position',['principal_id','position_ref','confidence','uncertainty_ref','evidence_refs','competency_claim_refs','affected_party_standing_ref']);
    participant(position.principal_id,participants,'position principal_id');
    if(positioned.has(position.principal_id))throw new ValidationError(`positions contains duplicate participant ${position.principal_id}`);positioned.add(position.principal_id);
    id(position.position_ref,'position_ref');if(!CONFIDENCE.has(position.confidence))throw new ValidationError('position confidence is invalid');nullableId(position.uncertainty_ref,'uncertainty_ref');uniqueIds(position.evidence_refs,'evidence_refs',32,false);uniqueIds(position.competency_claim_refs,'competency_claim_refs',32,false);nullableId(position.affected_party_standing_ref,'affected_party_standing_ref');
  }
  if(!Array.isArray(document.conflicts)||document.conflicts.length>32)throw new ValidationError('conflicts must contain at most 32 items');
  for(const conflict of document.conflicts){exactObject(conflict,'Conflict',['principal_id','conflict_ref']);participant(conflict.principal_id,participants,'conflict principal_id');id(conflict.conflict_ref,'conflict_ref');}
  exactObject(document.stakes,'Stakes',['consequence_class','affected_party_refs']);if(!CONSEQUENCE.has(document.stakes.consequence_class))throw new ValidationError('stakes consequence_class is invalid');uniqueIds(document.stakes.affected_party_refs,'affected_party_refs',64,false);
  uniqueIds(document.unknown_refs,'unknown_refs',64,false);
  if(!Array.isArray(document.learning_requests)||document.learning_requests.length>32)throw new ValidationError('learning_requests must contain at most 32 items');
  for(const request of document.learning_requests){
    exactObject(request,'Learning request',['principal_id','need_ref','reason_ref','evidence_quality_required','source_refs','time_budget_seconds','cost_budget_units','delay_safe','completion_evidence_ref']);participant(request.principal_id,participants,'learning request principal_id');id(request.need_ref,'need_ref');nullableId(request.reason_ref,'reason_ref');if(!EVIDENCE_QUALITY.has(request.evidence_quality_required))throw new ValidationError('evidence_quality_required is invalid');uniqueIds(request.source_refs,'source_refs',32,false);finiteNonnegativeInteger(request.time_budget_seconds,'time_budget_seconds',604800);finiteNonnegativeInteger(request.cost_budget_units,'cost_budget_units',1000000000);if(typeof request.delay_safe!=='boolean')throw new ValidationError('delay_safe must be boolean');nullableId(request.completion_evidence_ref,'completion_evidence_ref');
  }
  uniqueIds(document.protest_refs,'protest_refs',64,false);
  if(!Array.isArray(document.recommendations)||document.recommendations.length>32)throw new ValidationError('recommendations must contain at most 32 items');
  for(const rec of document.recommendations){exactObject(rec,'Recommendation',['principal_id','recommendation_ref']);participant(rec.principal_id,participants,'recommendation principal_id');id(rec.recommendation_ref,'recommendation_ref');}
  nullableId(document.decision_authority_ref,'decision_authority_ref');uniqueIds(document.reconsideration_trigger_refs,'reconsideration_trigger_refs',64,false);if(!OUTCOMES.has(document.outcome))throw new ValidationError('outcome is invalid');
  const created=date(document.created_at,'created_at');const updated=date(document.updated_at,'updated_at');if(updated<created)throw new ValidationError('updated_at cannot precede created_at');if(document.contains_secret_material!==false)throw new ValidationError('contains_secret_material must be false for v0');
  if(document.authority_effect!=='none'||document.network_effect!=='none'||document.runtime_activation!==false)throw new ValidationError('Relational deliberation activation boundary is invalid');
}
function exactObject(value,label,fields){if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(`${label} must be an object`);const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw new ValidationError(`${label} must be a plain object`);const allowed=new Set(fields);for(const key of Object.keys(value))if(!allowed.has(key))throw new ValidationError(`${label} contains unknown field ${key}`);for(const key of fields)if(!Object.hasOwn(value,key))throw new ValidationError(`${label} is missing required field ${key}`);}
function id(value,label){if(typeof value!=='string'||!IDENTIFIER.test(value))throw new ValidationError(`${label} is invalid`);return value;}
function nullableId(value,label){if(value===null)return null;return id(value,label);}
function uniqueIds(value,label,max,nonempty){if(!Array.isArray(value)||value.length>max||(nonempty&&value.length<1))throw new ValidationError(`${label} must be ${nonempty?'a non-empty ':''}array with at most ${max} items`);const seen=new Set();for(const item of value){id(item,label);if(seen.has(item))throw new ValidationError(`${label} contains duplicate ${item}`);seen.add(item);}return seen;}
function participant(value,participants,label){id(value,label);if(!participants.has(value))throw new ValidationError(`${label} must reference a declared participant`);}
function finiteNonnegativeInteger(value,label,max){if(!Number.isSafeInteger(value)||value<0||value>max)throw new ValidationError(`${label} must be a finite non-negative integer <= ${max}`);}
function date(value,label){if(typeof value!=='string'||value.length>64)throw new ValidationError(`${label} must be a canonical ISO timestamp`);const parsed=new Date(value);if(!Number.isFinite(parsed.getTime())||parsed.toISOString()!==value)throw new ValidationError(`${label} must be a canonical ISO timestamp`);return parsed.getTime();}

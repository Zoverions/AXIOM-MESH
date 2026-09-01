import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const DISPUTE_RECORD_SCHEMA = 'axiom-dispute-record.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const STATES = new Set([
  'opened','evidence_collection','positions_recorded','mediation_active',
  'remediation_proposed','settlement_candidate','settled_by_parties',
  'escalated','withdrawn','closed_unresolved'
]);

function exact(raw, fields, label) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}
function id(value,label){return assertString(value,label,{min:1,max:192,pattern:ID});}
function digest(value,label){return assertString(value,label,{min:64,max:64,pattern:DIGEST});}
function timestamp(value,label){
  const text=assertString(value,label,{min:24,max:24});
  const d=new Date(text);
  if(Number.isNaN(d.valueOf())||d.toISOString()!==text){
    throw new ValidationError(`${label} must be canonical UTC ISO`);
  }
  return text;
}

export function validateDisputeRecord(raw) {
  const value = exact(raw, [
    'schema','dispute_id','subject_contract_digest','state','parties','claims',
    'mediator','known_facts','contested_facts','unknown_facts',
    'proposed_remedies','settlement','escalation','opened_at','authority','limitations'
  ], 'dispute record');

  if (value.schema !== DISPUTE_RECORD_SCHEMA) {
    throw new ValidationError('dispute record schema is invalid');
  }

  id(value.dispute_id,'dispute_id');
  digest(value.subject_contract_digest,'subject_contract_digest');
  const state=id(value.state,'state');
  if(!STATES.has(state)) throw new ValidationError('dispute state is invalid');

  const parties=assertStringArray(value.parties,'parties',{maxItems:128,itemMax:192});
  if(parties.length<2) throw new ValidationError('dispute requires at least two parties');
  for(const [i,p] of parties.entries()) id(p,`parties[${i}]`);

  if(!Array.isArray(value.claims)||value.claims.length===0||value.claims.length>256){
    throw new ValidationError('dispute requires 1-256 claims');
  }
  for(const [i,rawClaim] of value.claims.entries()){
    const claim=exact(rawClaim,['claim_id','claimant','statement','evidence_refs','status'],`claims[${i}]`);
    id(claim.claim_id,`claims[${i}].claim_id`);
    if(!parties.includes(claim.claimant)) throw new ValidationError('claimant must be a declared party');
    assertString(claim.statement,`claims[${i}].statement`,{min:1,max:4096});
    assertStringArray(claim.evidence_refs,`claims[${i}].evidence_refs`,{maxItems:128,itemMax:512});
    id(claim.status,`claims[${i}].status`);
  }

  if(value.mediator!==null){
    const mediator=exact(value.mediator,['mediator_id','role_basis_ref','binding_authority'], 'mediator');
    id(mediator.mediator_id,'mediator.mediator_id');
    assertString(mediator.role_basis_ref,'mediator.role_basis_ref',{min:1,max:512});
    if(mediator.binding_authority!==false){
      throw new ValidationError('mediator binding_authority must be false in this profile');
    }
  }

  for (const field of ['known_facts','contested_facts','unknown_facts']) {
    assertStringArray(value[field],field,{maxItems:256,itemMax:2048});
  }

  if(!Array.isArray(value.proposed_remedies)||value.proposed_remedies.length>128){
    throw new ValidationError('proposed_remedies must be an array with at most 128 entries');
  }
  for(const [i,rawRemedy] of value.proposed_remedies.entries()){
    const remedy=exact(rawRemedy,[
      'remedy_id','proposer','description','reversible','requires_consequential_effect','effect_authority_ref'
    ],`proposed_remedies[${i}]`);
    id(remedy.remedy_id,`proposed_remedies[${i}].remedy_id`);
    id(remedy.proposer,`proposed_remedies[${i}].proposer`);
    assertString(remedy.description,`proposed_remedies[${i}].description`,{min:1,max:4096});
    if(typeof remedy.reversible!=='boolean'||typeof remedy.requires_consequential_effect!=='boolean'){
      throw new ValidationError('remedy flags must be boolean');
    }
    if(remedy.requires_consequential_effect && remedy.effect_authority_ref===null){
      throw new ValidationError('consequential remedy requires separate effect_authority_ref');
    }
    if(remedy.effect_authority_ref!==null){
      assertString(remedy.effect_authority_ref,`proposed_remedies[${i}].effect_authority_ref`,{min:1,max:512});
    }
  }

  const settlement=exact(value.settlement,[
    'candidate_digest','accepted_by','material_change_reviewed','execution_authority_effect'
  ],'settlement');
  if(settlement.candidate_digest!==null) digest(settlement.candidate_digest,'settlement.candidate_digest');
  const acceptedBy=assertStringArray(settlement.accepted_by,'settlement.accepted_by',{maxItems:128,itemMax:192});
  for(const [i,p] of acceptedBy.entries()) id(p,`settlement.accepted_by[${i}]`);
  if(typeof settlement.material_change_reviewed!=='boolean'){
    throw new ValidationError('settlement.material_change_reviewed must be boolean');
  }
  if(settlement.execution_authority_effect!=='none'){
    throw new ValidationError('settlement execution_authority_effect must be none');
  }

  const escalation=exact(value.escalation,['target','reason','evidence_refs'],'escalation');
  if(escalation.target!==null) id(escalation.target,'escalation.target');
  if(escalation.reason!==null) assertString(escalation.reason,'escalation.reason',{min:1,max:2048});
  assertStringArray(escalation.evidence_refs,'escalation.evidence_refs',{maxItems:128,itemMax:512});

  timestamp(value.opened_at,'opened_at');

  const authority=exact(value.authority,[
    'dispute_grants_remedy_authority',
    'mediator_grants_remedy_authority',
    'settlement_grants_execution_authority'
  ],'authority');
  for(const [field,actual] of Object.entries(authority)){
    if(actual!==false) throw new ValidationError(`authority.${field} must be false`);
  }

  const limitations=assertStringArray(value.limitations,'limitations',{maxItems:64,itemMax:512});
  if(limitations.length===0) throw new ValidationError('dispute record must declare limitations');

  if(state==='settled_by_parties'){
    if(settlement.candidate_digest===null || acceptedBy.length<2){
      throw new ValidationError('settled_by_parties requires candidate and explicit party acceptance');
    }
  }

  return Object.freeze({
    valid:true,
    dispute_id:value.dispute_id,
    state,
    dispute_effect:'evidence_and_coordination_only',
    authority_effect:'none'
  });
}

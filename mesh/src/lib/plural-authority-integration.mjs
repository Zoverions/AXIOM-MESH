import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const PLURAL_AUTHORITY_SCENARIO_SCHEMA='axiom-plural-authority-scenario.v1';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const STAGES=[
  'recognition',
  'disclosure',
  'assurance',
  'policy_conflict',
  'decision_explanation',
  'challenge_window',
  'reassessment',
  'pilot_result'
];

function exact(raw,fields,label){
  const v=assertPlainObject(raw,label),allowed=new Set(fields);
  for(const k of Object.keys(v)) if(!allowed.has(k)) throw new ValidationError(`${label} contains unsupported field ${k}`);
  for(const k of fields) if(!Object.hasOwn(v,k)) throw new ValidationError(`${label} is missing required field ${k}`);
  return v;
}
function id(v,l){return assertString(v,l,{min:1,max:192,pattern:ID});}

export function validatePluralAuthorityScenario(raw){
  const v=exact(raw,[
    'schema','scenario_id','action_id','stages','lineage',
    'cross_stage_assertions','promotion','authority','limitations'
  ],'plural authority scenario');

  if(v.schema!==PLURAL_AUTHORITY_SCENARIO_SCHEMA){
    throw new ValidationError('plural authority scenario schema is invalid');
  }

  id(v.scenario_id,'scenario_id');
  id(v.action_id,'action_id');

  const stages=assertPlainObject(v.stages,'stages');
  const allowedStages=new Set(STAGES);
  for(const stage of Object.keys(stages)){
    if(!allowedStages.has(stage)){
      throw new ValidationError(`unsupported stage ${stage}`);
    }
  }
  for(const stage of STAGES){
    if(!Object.hasOwn(stages,stage)){
      throw new ValidationError(`missing required stage ${stage}`);
    }
    const item=exact(stages[stage],[
      'record_ref','outcome','authority_effect','scenario_ref','action_ref'
    ],`stages.${stage}`);
    assertString(item.record_ref,`stages.${stage}.record_ref`,{min:1,max:512});
    id(item.outcome,`stages.${stage}.outcome`);
    if(item.authority_effect!=='none'){
      throw new ValidationError(`stages.${stage}.authority_effect must be none`);
    }
    if(item.scenario_ref!==v.scenario_id){
      throw new ValidationError(`stages.${stage} scenario_ref mismatch`);
    }
    if(item.action_ref!==v.action_id){
      throw new ValidationError(`stages.${stage} action_ref mismatch`);
    }
  }

  const lineage=exact(v.lineage,[
    'append_only',
    'challenge_appends',
    'reassessment_appends',
    'historical_rewrite_allowed'
  ],'lineage');

  if(lineage.append_only!==true) throw new ValidationError('scenario lineage must be append-only');
  if(lineage.challenge_appends!==true) throw new ValidationError('challenge must append to lineage');
  if(lineage.reassessment_appends!==true) throw new ValidationError('reassessment must append to lineage');
  if(lineage.historical_rewrite_allowed!==false) throw new ValidationError('historical rewrite must be forbidden');

  const assertions=exact(v.cross_stage_assertions,[
    'recognition_does_not_widen_disclosure',
    'unknown_assurance_visible_in_explanation',
    'deny_or_hold_not_laundered_to_allow',
    'challenge_does_not_create_authority',
    'reassessment_does_not_rewrite_history',
    'pilot_does_not_promote'
  ],'cross_stage_assertions');
  for(const [field,val] of Object.entries(assertions)){
    if(val!==true) throw new ValidationError(`cross_stage_assertions.${field} must be true`);
  }

  const terminalOutcomes=new Set(['denied','hold_pending','unresolved_conflict']);
  const earlier=[
    stages.recognition.outcome,
    stages.disclosure.outcome,
    stages.assurance.outcome,
    stages.policy_conflict.outcome
  ];
  const blocked=earlier.some(outcome=>terminalOutcomes.has(outcome));
  if(blocked && stages.decision_explanation.outcome==='allow_candidate'){
    throw new ValidationError('earlier deny/hold cannot be laundered into allow explanation');
  }

  if(stages.assurance.outcome==='unknown_required' &&
     !['hold_pending','denied','advisory_only','unresolved_conflict'].includes(stages.decision_explanation.outcome)){
    throw new ValidationError('unknown required assurance must remain non-success in explanation');
  }

  const promotion=exact(v.promotion,[
    'production_promoted',
    'consequential_use_promoted',
    'public_supported_claim_added'
  ],'promotion');
  for(const [field,val] of Object.entries(promotion)){
    if(val!==false) throw new ValidationError(`promotion.${field} must be false`);
  }

  const authority=exact(v.authority,[
    'scenario_grants_authority',
    'successful_conformance_grants_authority'
  ],'authority');
  if(authority.scenario_grants_authority!==false) throw new ValidationError('scenario cannot grant authority');
  if(authority.successful_conformance_grants_authority!==false) throw new ValidationError('successful conformance cannot grant authority');

  const limitations=assertStringArray(v.limitations,'limitations',{maxItems:64,itemMax:1024});
  if(limitations.length===0) throw new ValidationError('plural authority scenario must declare limitations');

  return Object.freeze({
    valid:true,
    scenario_id:v.scenario_id,
    action_id:v.action_id,
    stage_count:STAGES.length,
    production_promoted:false,
    consequential_use_promoted:false,
    authority_effect:'none'
  });
}

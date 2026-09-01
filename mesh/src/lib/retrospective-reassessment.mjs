import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const RETROSPECTIVE_REASSESSMENT_SCHEMA =
  'axiom-retrospective-reassessment.v1';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const OUTCOMES=new Set([
  'corroborated',
  'partially_corroborated',
  'contradicted',
  'unverifiable',
  'accepted_despite_uncertainty',
  'rejected',
  'superseded_by_correction',
  'reopened_on_new_evidence'
]);
const CHALLENGE=new Set([
  'none',
  'challengeable',
  'challenged',
  'stayed',
  'appealed',
  'reversed',
  'superseded',
  'expired',
  'finalized'
]);

function exact(raw,fields,label){
  const v=assertPlainObject(raw,label), allowed=new Set(fields);
  for(const k of Object.keys(v)) if(!allowed.has(k)) throw new ValidationError(`${label} contains unsupported field ${k}`);
  for(const k of fields) if(!Object.hasOwn(v,k)) throw new ValidationError(`${label} is missing required field ${k}`);
  return v;
}
function id(v,l){return assertString(v,l,{min:1,max:192,pattern:ID});}
function digest(v,l){return assertString(v,l,{min:64,max:64,pattern:DIGEST});}
function timestamp(v,l){
  const t=assertString(v,l,{min:24,max:24});
  const d=new Date(t);
  if(Number.isNaN(d.valueOf())||d.toISOString()!==t) throw new ValidationError(`${l} must be canonical UTC ISO`);
  return t;
}

export function validateRetrospectiveReassessment(raw){
  const v=exact(raw,[
    'schema',
    'reassessment_id',
    'original_event_id',
    'original_event_digest',
    'assurance_at_execution',
    'reviewer',
    'review_authority',
    'reviewed_evidence_refs',
    'review_method',
    'reviewed_at',
    'review_assurance',
    'outcome',
    'challenge_status',
    'superseding_or_corrective_links',
    'authority',
    'limitations'
  ],'retrospective reassessment');

  if(v.schema!==RETROSPECTIVE_REASSESSMENT_SCHEMA){
    throw new ValidationError('retrospective reassessment schema is invalid');
  }

  id(v.reassessment_id,'reassessment_id');
  id(v.original_event_id,'original_event_id');
  digest(v.original_event_digest,'original_event_digest');

  const executionAssurance=assertPlainObject(v.assurance_at_execution,'assurance_at_execution');
  if(Object.keys(executionAssurance).length===0){
    throw new ValidationError('assurance_at_execution must preserve original assurance state');
  }

  const reviewer=exact(v.reviewer,['reviewer_id','reviewer_type'],'reviewer');
  id(reviewer.reviewer_id,'reviewer.reviewer_id');
  id(reviewer.reviewer_type,'reviewer.reviewer_type');

  const reviewAuthority=exact(v.review_authority,[
    'authority_type',
    'authority_ref',
    'scope'
  ],'review_authority');
  id(reviewAuthority.authority_type,'review_authority.authority_type');
  assertString(reviewAuthority.authority_ref,'review_authority.authority_ref',{min:1,max:512});
  assertString(reviewAuthority.scope,'review_authority.scope',{min:1,max:1024});

  const evidence=assertStringArray(v.reviewed_evidence_refs,'reviewed_evidence_refs',{
    maxItems:256,itemMax:512
  });
  if(evidence.length===0) throw new ValidationError('reassessment requires reviewed evidence refs');

  assertString(v.review_method,'review_method',{min:1,max:1024});
  timestamp(v.reviewed_at,'reviewed_at');

  const reviewAssurance=assertPlainObject(v.review_assurance,'review_assurance');
  if(Object.keys(reviewAssurance).length===0){
    throw new ValidationError('review_assurance must be explicit');
  }

  const outcome=id(v.outcome,'outcome');
  if(!OUTCOMES.has(outcome)) throw new ValidationError('reassessment outcome is invalid');

  const challenge=id(v.challenge_status,'challenge_status');
  if(!CHALLENGE.has(challenge)) throw new ValidationError('challenge_status is invalid');

  const links=assertStringArray(
    v.superseding_or_corrective_links,
    'superseding_or_corrective_links',
    {maxItems:128,itemMax:512}
  );

  if(outcome==='superseded_by_correction' && links.length===0){
    throw new ValidationError('superseded_by_correction requires a linked corrective record');
  }

  const authority=exact(v.authority,[
    'reassessment_grants_runtime_authority',
    'reassessment_rewrites_original_assurance',
    'reviewer_may_delete_original_event'
  ],'authority');
  if(authority.reassessment_grants_runtime_authority!==false){
    throw new ValidationError('reassessment cannot grant runtime authority');
  }
  if(authority.reassessment_rewrites_original_assurance!==false){
    throw new ValidationError('reassessment cannot rewrite original assurance');
  }
  if(authority.reviewer_may_delete_original_event!==false){
    throw new ValidationError('reviewer cannot delete original event');
  }

  const limitations=assertStringArray(v.limitations,'limitations',{maxItems:64,itemMax:1024});
  if(limitations.length===0) throw new ValidationError('reassessment must declare limitations');

  return Object.freeze({
    valid:true,
    reassessment_id:v.reassessment_id,
    original_event_id:v.original_event_id,
    outcome,
    challenge_status:challenge,
    historical_rewrite:false,
    authority_effect:'none'
  });
}

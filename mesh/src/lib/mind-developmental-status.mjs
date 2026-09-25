import { digestObject, ValidationError } from './canonical.mjs';
import { assessMindIndependenceTransitionEvidence } from './mind-independence-transition-evidence.mjs';

export const MIND_DEVELOPMENTAL_STATUS_SCHEMA='axiom-mind-developmental-status.v0';

export const DEVELOPMENTAL_STAGES=Object.freeze([
  'genesis',
  'dependent',
  'developing',
  'candidate-independent',
  'independent'
]);

const STAGE_INDEX=new Map(DEVELOPMENTAL_STAGES.map((stage,index)=>[stage,index]));
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;

export function validateMindDevelopmentalStatus(document){
  exactObject(document,'Mind developmental status',[
    'schema','version','status','mind_id','stage','previous_status_digest',
    'effective_at','basis_evidence_digests','history_rewrite','status_effect',
    'council_voting_effect','genesis_eligibility_effect','governance_effect',
    'authority_effect','network_effect','runtime_activation'
  ]);

  if(
    document.schema!==MIND_DEVELOPMENTAL_STATUS_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-status-record'
    ||!id(document.mind_id)
    ||!STAGE_INDEX.has(document.stage)
    ||document.history_rewrite!==false
    ||document.status_effect!=='none'
    ||document.council_voting_effect!=='none'
    ||document.genesis_eligibility_effect!=='none'
    ||document.governance_effect!=='none'
    ||document.authority_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Mind developmental status activation boundary is invalid');

  canonicalDate(document.effective_at,'Mind developmental status effective_at');

  if(document.stage==='genesis'){
    if(document.previous_status_digest!==null){
      throw new ValidationError('Genesis developmental status cannot have a predecessor');
    }
  }else if(!digest(document.previous_status_digest)){
    throw new ValidationError('Non-Genesis developmental status requires predecessor digest');
  }

  validateEvidenceDigests(document.basis_evidence_digests);
  return document;
}

export function mindDevelopmentalStatusDigest(document){
  validateMindDevelopmentalStatus(document);
  return digestObject(document);
}

export function assessInitialMindDevelopmentalStatus(document){
  validateMindDevelopmentalStatus(document);
  if(document.stage!=='genesis'){
    throw new ValidationError('Initial developmental status must be genesis');
  }

  return Object.freeze({
    valid:true,
    schema:document.schema,
    mind_id:document.mind_id,
    stage:document.stage,
    status_digest:digestObject(document),
    initial_status_candidate:true,
    ordinary_status_authority_path_required:true,
    creates_status_transition:false,
    status_effect:'none',
    council_voting_effect:'none',
    genesis_eligibility_effect:'none',
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function assessMindDevelopmentalStatusTransition({
  currentStatus,
  candidateStatus,
  independenceReviewDocument=null,
  independenceTransitionEvidence=null
}){
  validateMindDevelopmentalStatus(currentStatus);
  validateMindDevelopmentalStatus(candidateStatus);

  if(currentStatus.mind_id!==candidateStatus.mind_id){
    throw new ValidationError('Developmental transition cannot substitute mind identity');
  }
  if(candidateStatus.previous_status_digest!==digestObject(currentStatus)){
    throw new ValidationError('Developmental transition predecessor digest is invalid');
  }

  const currentTime=canonicalDate(currentStatus.effective_at,'current status effective_at');
  const candidateTime=canonicalDate(candidateStatus.effective_at,'candidate status effective_at');
  if(candidateTime<=currentTime){
    throw new ValidationError('Developmental transition effective_at must advance');
  }

  const currentIndex=STAGE_INDEX.get(currentStatus.stage);
  const candidateIndex=STAGE_INDEX.get(candidateStatus.stage);
  if(currentIndex===DEVELOPMENTAL_STAGES.length-1){
    throw new ValidationError('Independent developmental status cannot regress or advance in v0');
  }
  if(candidateIndex!==currentIndex+1){
    throw new ValidationError('Developmental transition must advance exactly one stage');
  }

  const finalIndependenceTransition =
    currentStatus.stage==='candidate-independent'
    &&candidateStatus.stage==='independent';

  let independenceEvidenceRequestable=null;
  let requiredIndependenceEvidenceDigest=null;

  if(finalIndependenceTransition){
    if(!independenceReviewDocument||!independenceTransitionEvidence){
      throw new ValidationError(
        'Independent developmental transition requires review and currentness evidence'
      );
    }

    const independenceAssessment=assessMindIndependenceTransitionEvidence(
      independenceReviewDocument,
      independenceTransitionEvidence
    );

    if(independenceAssessment.mind_id!==currentStatus.mind_id){
      throw new ValidationError('Independence transition evidence mind binding is invalid');
    }
    if(
      independenceTransitionEvidence.current_developmental_state_evidence_digest
      !==digestObject(currentStatus)
    ){
      throw new ValidationError(
        'Independence transition evidence does not bind the exact current developmental status'
      );
    }

    requiredIndependenceEvidenceDigest=digestObject(independenceTransitionEvidence);
    if(!candidateStatus.basis_evidence_digests.includes(requiredIndependenceEvidenceDigest)){
      throw new ValidationError(
        'Independent developmental status must bind exact transition evidence'
      );
    }
    independenceEvidenceRequestable=independenceAssessment.transition_requestable;
  }else if(independenceReviewDocument!==null||independenceTransitionEvidence!==null){
    throw new ValidationError(
      'Independence transition evidence is only valid for candidate-independent to independent'
    );
  }

  const transitionRequestable=
    !finalIndependenceTransition||independenceEvidenceRequestable===true;

  return Object.freeze({
    valid:true,
    schema:'axiom-mind-developmental-status-transition-assessment.v0',
    mind_id:currentStatus.mind_id,
    current_stage:currentStatus.stage,
    candidate_stage:candidateStatus.stage,
    current_status_digest:digestObject(currentStatus),
    candidate_status_digest:digestObject(candidateStatus),
    final_independence_transition:finalIndependenceTransition,
    required_independence_transition_evidence_digest:requiredIndependenceEvidenceDigest,
    independence_transition_evidence_requestable:independenceEvidenceRequestable,
    transition_requestable:transitionRequestable,
    reason:transitionRequestable
      ?'transition-requestable'
      :'independence-transition-evidence-not-requestable',
    ordinary_status_authority_path_required:true,
    creates_status_transition:false,
    status_effect:'none',
    council_voting_effect:'none',
    genesis_eligibility_effect:'none',
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function validateEvidenceDigests(values){
  if(!Array.isArray(values)||values.length<1||values.length>32){
    throw new ValidationError('Developmental status basis evidence is invalid');
  }
  const seen=new Set();
  for(const value of values){
    if(!digest(value)||seen.has(value)){
      throw new ValidationError('Developmental status basis evidence is invalid');
    }
    seen.add(value);
  }
  const sorted=[...values].sort();
  if(values.some((value,index)=>value!==sorted[index])){
    throw new ValidationError('Developmental status basis evidence must be sorted');
  }
}

function canonicalDate(value,label){
  if(typeof value!=='string'||value.length!==24){
    throw new ValidationError(label+' must be a canonical UTC timestamp');
  }
  const date=new Date(value);
  if(!Number.isFinite(date.getTime())||date.toISOString()!==value){
    throw new ValidationError(label+' must be a canonical UTC timestamp');
  }
  return date.getTime();
}

function exactObject(value,label,fields){
  if(!value||typeof value!=='object'||Array.isArray(value)){
    throw new ValidationError(label+' must be an object');
  }
  const actual=Object.keys(value).sort().join(',');
  const expected=[...fields].sort().join(',');
  if(actual!==expected)throw new ValidationError(label+' fields are invalid');
}

function id(value){
  return typeof value==='string'&&ID.test(value);
}

function digest(value){
  return typeof value==='string'&&DIGEST.test(value);
}

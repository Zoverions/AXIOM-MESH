import { digestObject, ValidationError } from './canonical.mjs';
import { validateCircleCorePackage } from './circle-core.mjs';

export const CIRCLE_DECISION_REQUEST_EVIDENCE_SCHEMA='axiom-circle-decision-request-evidence.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const EVIDENCE_ID=/^circle-decision-request:[a-f0-9]{64}$/;
const REQUEST_BINDING=/^circle-request:[a-f0-9]{64}$/;
const EFFECTS=new Set([
  'none','read-external','write-external','publish-external','communication',
  'financial','create-external-resource','delete-external-resource','physical'
]);
const CONSEQUENCES=new Set(['C0','C1','C2','C3']);
const BLOCKING_APPEALS=new Set(['open','accepted']);
const NONBLOCKING_APPEALS=new Set(['rejected','withdrawn']);

export function circleRequestBindingRef(descriptor){
  validateRequestDescriptor(descriptor);
  return 'circle-request:'+digestObject(descriptor);
}

export function circleDecisionRequestIdentityBody(document){
  return {
    schema:CIRCLE_DECISION_REQUEST_EVIDENCE_SCHEMA,
    version:0,
    circle_id:document.circle_id,
    proposal_id:document.proposal_id,
    decision_id:document.decision_id,
    circle_package_digest:document.circle_package_digest,
    charter_digest:document.charter_digest,
    proposal_digest:document.proposal_digest,
    decision_digest:document.decision_digest,
    current_snapshot_evidence_ref:document.current_snapshot_evidence_ref,
    current_snapshot_evidence_digest:document.current_snapshot_evidence_digest,
    request_descriptor:document.request_descriptor,
    request_digest:document.request_digest,
    proposal_request_binding_ref:document.proposal_request_binding_ref,
    requested_at:document.requested_at
  };
}

export function deriveCircleDecisionRequestEvidenceId(document){
  return 'circle-decision-request:'+digestObject(circleDecisionRequestIdentityBody(document));
}

export function validateCircleDecisionRequestEvidence(document){
  exactObject(document,'Circle decision request evidence',[
    'schema','version','status','evidence_id','circle_id','proposal_id','decision_id',
    'circle_package_digest','charter_digest','proposal_digest','decision_digest',
    'current_snapshot_evidence_ref','current_snapshot_evidence_digest',
    'request_descriptor','request_digest','proposal_request_binding_ref','requested_at',
    'ordinary_authority_path_required','creates_grant','creates_approval',
    'creates_prepared_effect','authority_effect','governance_effect','execution_effect',
    'network_effect','runtime_activation'
  ]);
  if(
    document.schema!==CIRCLE_DECISION_REQUEST_EVIDENCE_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-request-evidence'
    ||document.ordinary_authority_path_required!==true
    ||document.creates_grant!==false
    ||document.creates_approval!==false
    ||document.creates_prepared_effect!==false
    ||document.authority_effect!=='none'
    ||document.governance_effect!=='none'
    ||document.execution_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Circle decision request evidence activation boundary is invalid');

  if(typeof document.evidence_id!=='string'||!EVIDENCE_ID.test(document.evidence_id)){
    throw new ValidationError('evidence_id is invalid');
  }
  id(document.circle_id,'circle_id');
  id(document.proposal_id,'proposal_id');
  id(document.decision_id,'decision_id');
  digest(document.circle_package_digest,'circle_package_digest');
  digest(document.charter_digest,'charter_digest');
  digest(document.proposal_digest,'proposal_digest');
  digest(document.decision_digest,'decision_digest');
  id(document.current_snapshot_evidence_ref,'current_snapshot_evidence_ref');
  digest(document.current_snapshot_evidence_digest,'current_snapshot_evidence_digest');
  validateRequestDescriptor(document.request_descriptor);
  digest(document.request_digest,'request_digest');
  if(document.request_digest!==digestObject(document.request_descriptor)){
    throw new ValidationError('request_digest does not match request_descriptor');
  }
  if(typeof document.proposal_request_binding_ref!=='string'||!REQUEST_BINDING.test(document.proposal_request_binding_ref)){
    throw new ValidationError('proposal_request_binding_ref is invalid');
  }
  if(document.proposal_request_binding_ref!==circleRequestBindingRef(document.request_descriptor)){
    throw new ValidationError('proposal_request_binding_ref does not match request_descriptor');
  }
  canonicalDate(document.requested_at,'requested_at');
  if(document.evidence_id!==deriveCircleDecisionRequestEvidenceId(document)){
    throw new ValidationError('evidence_id does not match canonical request evidence identity');
  }

  return Object.freeze({
    valid:true,
    schema:document.schema,
    evidence_id:document.evidence_id,
    evidence_digest:digestObject(document),
    ordinary_authority_path_required:true,
    creates_grant:false,
    creates_approval:false,
    creates_prepared_effect:false,
    authority_effect:'none',
    governance_effect:'none',
    execution_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function circleDecisionRequestEvidenceDigest(document){
  validateCircleDecisionRequestEvidence(document);
  return digestObject(document);
}

export function assessCircleDecisionRequest({
  packageDocument,
  evidence,
  currentSnapshotEvidence
}){
  const packageResult=validateCircleCorePackage(packageDocument);
  validateCircleDecisionRequestEvidence(evidence);
  validateCurrentSnapshotEvidence(currentSnapshotEvidence);

  const reasons=[];
  const nonblockingAppeals=[];
  const requestedAt=canonicalDate(evidence.requested_at,'requested_at');

  if(packageDocument.circle.circle_id!==evidence.circle_id)reasons.push('circle-id-mismatch');
  if(packageResult.package_digest!==evidence.circle_package_digest)reasons.push('circle-package-digest-mismatch');
  if(packageResult.charter_digest!==evidence.charter_digest)reasons.push('charter-digest-mismatch');

  if(currentSnapshotEvidence.evidence_ref!==evidence.current_snapshot_evidence_ref){
    reasons.push('snapshot-evidence-ref-mismatch');
  }
  if(currentSnapshotEvidence.evidence_digest!==evidence.current_snapshot_evidence_digest){
    reasons.push('snapshot-evidence-digest-mismatch');
  }
  if(currentSnapshotEvidence.circle_id!==evidence.circle_id){
    reasons.push('snapshot-circle-mismatch');
  }
  if(currentSnapshotEvidence.package_digest!==packageResult.package_digest){
    reasons.push('snapshot-package-digest-mismatch');
  }
  if(currentSnapshotEvidence.charter_digest!==packageResult.charter_digest){
    reasons.push('snapshot-charter-digest-mismatch');
  }
  if(currentSnapshotEvidence.observed_at!==evidence.requested_at){
    reasons.push('snapshot-time-mismatch');
  }

  if(canonicalDate(packageDocument.circle.created_at,'Circle created_at')>requestedAt){
    reasons.push('circle-created-after-request');
  }
  if(canonicalDate(packageDocument.charter.effective_from,'Circle charter effective_from')>requestedAt){
    reasons.push('charter-effective-after-request');
  }

  const proposal=packageDocument.proposals.find(item=>item.proposal_id===evidence.proposal_id);
  if(!proposal){
    reasons.push('proposal-not-found');
  }else{
    if(digestObject(proposal)!==evidence.proposal_digest)reasons.push('proposal-digest-mismatch');
    if(!proposal.evidence_refs.includes(evidence.proposal_request_binding_ref)){
      reasons.push('proposal-request-binding-missing');
    }
    if(canonicalDate(proposal.created_at,'proposal created_at')>requestedAt){
      reasons.push('proposal-created-after-request');
    }
  }

  const decision=packageDocument.decisions.find(item=>item.decision_id===evidence.decision_id);
  if(!decision){
    reasons.push('decision-not-found');
  }else{
    if(decision.proposal_id!==evidence.proposal_id)reasons.push('decision-proposal-mismatch');
    if(digestObject(decision)!==evidence.decision_digest)reasons.push('decision-digest-mismatch');
    if(decision.outcome!=='accepted')reasons.push('decision-not-accepted');
    if(decision.finality!=='circle-local-accepted')reasons.push('decision-not-final');
    if(canonicalDate(decision.decided_at,'decision decided_at')>requestedAt){
      reasons.push('decision-after-request');
    }

    for(const appeal of packageDocument.appeals){
      if(appeal.target_type!=='decision'||appeal.target_id!==decision.decision_id)continue;
      const filedAt=canonicalDate(appeal.filed_at,'appeal filed_at');
      if(filedAt>requestedAt){
        reasons.push('appeal-filed-after-request:'+appeal.appeal_id);
        continue;
      }
      if(appeal.resolved_at!==null&&canonicalDate(appeal.resolved_at,'appeal resolved_at')>requestedAt){
        reasons.push('appeal-resolved-after-request:'+appeal.appeal_id);
        continue;
      }
      if(BLOCKING_APPEALS.has(appeal.status)){
        reasons.push('decision-appeal-blocking:'+appeal.status);
      }else if(NONBLOCKING_APPEALS.has(appeal.status)){
        nonblockingAppeals.push(appeal.appeal_id+':'+appeal.status);
      }
    }
  }

  return Object.freeze({
    schema:'axiom-circle-decision-request-assessment.v0',
    eligible_to_request:reasons.length===0,
    reasons:Object.freeze([...new Set(reasons)].sort()),
    nonblocking_appeals:Object.freeze([...new Set(nonblockingAppeals)].sort()),
    circle_id:evidence.circle_id,
    proposal_id:evidence.proposal_id,
    decision_id:evidence.decision_id,
    request_digest:evidence.request_digest,
    proposal_request_binding_ref:evidence.proposal_request_binding_ref,
    evidence_digest:digestObject(evidence),
    package_digest:packageResult.package_digest,
    requires_external_snapshot_verification:true,
    snapshot_verification_effect:'none',
    ordinary_authority_path_required:true,
    creates_grant:false,
    creates_approval:false,
    creates_prepared_effect:false,
    authority_effect:'none',
    governance_effect:'none',
    execution_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function validateRequestDescriptor(value){
  exactObject(value,'Circle decision request descriptor',[
    'resource','action','purpose','destination','data_classes','effect_class','consequence_class'
  ]);
  id(value.resource,'request resource');
  id(value.action,'request action');
  id(value.purpose,'request purpose');
  if(value.destination!==null)id(value.destination,'request destination');
  sortedIdArray(value.data_classes,'request data_classes',0,64);
  if(!EFFECTS.has(value.effect_class))throw new ValidationError('request effect_class is invalid');
  if(!CONSEQUENCES.has(value.consequence_class))throw new ValidationError('request consequence_class is invalid');
}

function validateCurrentSnapshotEvidence(value){
  exactObject(value,'Current Circle snapshot evidence',[
    'evidence_ref','evidence_digest','observed_at','circle_id','package_digest','charter_digest'
  ]);
  id(value.evidence_ref,'snapshot evidence_ref');
  digest(value.evidence_digest,'snapshot evidence_digest');
  canonicalDate(value.observed_at,'snapshot observed_at');
  id(value.circle_id,'snapshot circle_id');
  digest(value.package_digest,'snapshot package_digest');
  digest(value.charter_digest,'snapshot charter_digest');
}

function sortedIdArray(value,label,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max){
    throw new ValidationError(label+' has invalid cardinality');
  }
  const seen=new Set();
  for(const item of value){
    id(item,label+' item');
    if(seen.has(item))throw new ValidationError(label+' contains duplicate values');
    seen.add(item);
  }
  const sorted=[...value].sort((a,b)=>a<b?-1:a>b?1:0);
  if(value.some((item,index)=>item!==sorted[index])){
    throw new ValidationError(label+' must be sorted');
  }
}

function exactObject(value,label,fields){
  if(!value||typeof value!=='object'||Array.isArray(value)){
    throw new ValidationError(label+' must be an object');
  }
  const actual=Object.keys(value).sort().join(',');
  const expected=[...fields].sort().join(',');
  if(actual!==expected)throw new ValidationError(label+' fields are invalid');
}
function id(value,label){
  if(typeof value!=='string'||!ID.test(value))throw new ValidationError(label+' is invalid');
}
function digest(value,label){
  if(typeof value!=='string'||!DIGEST.test(value)){
    throw new ValidationError(label+' must be a lowercase sha256 digest');
  }
}
function canonicalDate(value,label){
  if(typeof value!=='string'||value.length!==24){
    throw new ValidationError(label+' must be a canonical UTC timestamp');
  }
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString()!==value){
    throw new ValidationError(label+' must be a canonical UTC timestamp');
  }
  return parsed.getTime();
}

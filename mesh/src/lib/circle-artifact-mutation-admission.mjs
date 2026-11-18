import { digestObject, ValidationError } from './canonical.mjs';
import {
  canonicalSharedArtifactDigest,
  validateCanonicalSharedArtifact
} from './canonical-shared-artifact.mjs';
import {
  assessCircleMembership,
  circleMembershipAssuranceDigest,
  validateCircleMembershipAssurance
} from './circle-membership-assurance.mjs';

export const CIRCLE_ARTIFACT_MUTATION_ADMISSION_SCHEMA='axiom-circle-artifact-mutation-admission.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;

export function validateCircleArtifactMutationAdmission(document){
  exactObject(document,'Circle artifact mutation admission',[
    'schema','version','status','admission_id','circle_id','artifact_id',
    'previous_artifact_digest','candidate_artifact_digest','membership_assurance_digest',
    'authorization_request_digest','authorization_evidence_ref','authorization_evidence_digest',
    'requested_at','authority_effect','governance_effect','artifact_effect',
    'execution_effect','network_effect','runtime_activation'
  ]);
  if(
    document.schema!==CIRCLE_ARTIFACT_MUTATION_ADMISSION_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-admission-laboratory'
    ||document.authority_effect!=='none'
    ||document.governance_effect!=='none'
    ||document.artifact_effect!=='none'
    ||document.execution_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Circle artifact mutation admission activation boundary is invalid');

  id(document.admission_id,'admission_id');
  id(document.circle_id,'circle_id');
  id(document.artifact_id,'artifact_id');
  digest(document.previous_artifact_digest,'previous_artifact_digest');
  digest(document.candidate_artifact_digest,'candidate_artifact_digest');
  digest(document.membership_assurance_digest,'membership_assurance_digest');
  digest(document.authorization_request_digest,'authorization_request_digest');
  id(document.authorization_evidence_ref,'authorization_evidence_ref');
  digest(document.authorization_evidence_digest,'authorization_evidence_digest');
  canonicalDate(document.requested_at,'requested_at');

  return Object.freeze({
    valid:true,
    schema:document.schema,
    admission_id:document.admission_id,
    admission_digest:digestObject(document),
    authority_effect:'none',
    governance_effect:'none',
    artifact_effect:'none',
    execution_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function circleArtifactMutationAdmissionDigest(document){
  validateCircleArtifactMutationAdmission(document);
  return digestObject(document);
}

export function assessCircleArtifactMutation({
  packageDocument,
  membershipAssurance,
  membershipCurrent,
  previousArtifact,
  candidateArtifact,
  admission,
  authorizationCurrent
}){
  validateCircleArtifactMutationAdmission(admission);
  validateCircleMembershipAssurance(membershipAssurance);
  const previous=validateCanonicalSharedArtifact(previousArtifact);
  const candidate=validateCanonicalSharedArtifact(candidateArtifact);
  validateAuthorizationCurrent(authorizationCurrent);

  const reasons=[];
  const membership=assessCircleMembership(
    packageDocument,
    membershipAssurance,
    membershipCurrent
  );
  if(!membership.eligible_to_participate){
    for(const reason of membership.reasons)reasons.push('membership:'+reason);
  }

  const previousDigest=canonicalSharedArtifactDigest(previousArtifact);
  const candidateDigest=canonicalSharedArtifactDigest(candidateArtifact);
  const assuranceDigest=circleMembershipAssuranceDigest(membershipAssurance);

  if(admission.circle_id!==packageDocument.circle.circle_id)reasons.push('admission-circle-mismatch');
  if(admission.artifact_id!==previous.artifact_id)reasons.push('admission-artifact-mismatch');
  if(admission.previous_artifact_digest!==previousDigest)reasons.push('previous-artifact-digest-mismatch');
  if(admission.candidate_artifact_digest!==candidateDigest)reasons.push('candidate-artifact-digest-mismatch');
  if(admission.membership_assurance_digest!==assuranceDigest)reasons.push('membership-assurance-digest-mismatch');

  if(previous.authority_domain.kind!=='circle')reasons.push('artifact-not-circle-domain');
  if(previous.authority_domain.ref!==admission.circle_id)reasons.push('artifact-circle-mismatch');
  if(candidate.authority_domain.kind!=='circle')reasons.push('candidate-not-circle-domain');
  if(candidate.authority_domain.ref!==admission.circle_id)reasons.push('candidate-circle-mismatch');

  assertArtifactIdentityStable(previousArtifact,candidateArtifact);

  if(candidateArtifact.revisions.length!==previousArtifact.revisions.length+1){
    throw new ValidationError('Circle artifact candidate must append exactly one revision');
  }
  for(let index=0;index<previousArtifact.revisions.length;index+=1){
    if(digestObject(previousArtifact.revisions[index])!==digestObject(candidateArtifact.revisions[index])){
      throw new ValidationError(`Circle artifact prior revision ${index} is immutable`);
    }
  }

  const appended=candidateArtifact.revisions[candidateArtifact.revisions.length-1];
  if(appended.actor_principal!==membershipAssurance.principal_id){
    reasons.push('revision-actor-membership-mismatch');
  }
  if(appended.authorization.request_digest!==admission.authorization_request_digest){
    reasons.push('authorization-request-digest-mismatch');
  }
  if(appended.authorization.evidence_ref!==admission.authorization_evidence_ref){
    reasons.push('authorization-evidence-ref-mismatch');
  }
  if(appended.authorization.evidence_digest!==admission.authorization_evidence_digest){
    reasons.push('authorization-evidence-digest-mismatch');
  }

  if(authorizationCurrent.request_digest!==admission.authorization_request_digest){
    reasons.push('current-authorization-request-mismatch');
  }
  if(authorizationCurrent.evidence_ref!==admission.authorization_evidence_ref){
    reasons.push('current-authorization-ref-mismatch');
  }
  if(authorizationCurrent.evidence_digest!==admission.authorization_evidence_digest){
    reasons.push('current-authorization-digest-mismatch');
  }
  if(authorizationCurrent.current!==true)reasons.push('authorization-not-current');

  const requestedAt=canonicalDate(admission.requested_at,'requested_at');
  const membershipAssessedAt=canonicalDate(membershipCurrent.assessed_at,'membership assessed_at');
  if(membershipAssessedAt!==requestedAt)reasons.push('membership-assessment-time-mismatch');
  const previousUpdatedAt=canonicalDate(previousArtifact.updated_at,'previous artifact updated_at');
  const appendedAt=canonicalDate(appended.occurred_at,'appended revision occurred_at');
  if(requestedAt<previousUpdatedAt)reasons.push('request-predates-artifact-head');
  if(appendedAt!==requestedAt)reasons.push('revision-time-mismatch');
  const verifiedAt=canonicalDate(authorizationCurrent.verified_at,'authorization verified_at');
  const expiresAt=canonicalDate(authorizationCurrent.expires_at,'authorization expires_at');
  if(verifiedAt>requestedAt)reasons.push('authorization-verified-after-request');
  if(expiresAt<=requestedAt)reasons.push('authorization-expired');

  return Object.freeze({
    schema:'axiom-circle-artifact-mutation-assessment.v0',
    eligible_for_revision_admission:reasons.length===0,
    reasons:Object.freeze(reasons),
    circle_id:admission.circle_id,
    artifact_id:admission.artifact_id,
    appended_revision_id:appended.revision_id,
    candidate_state:candidate.state,
    candidate_heads:Object.freeze([...candidate.current_heads]),
    admission_digest:digestObject(admission),
    previous_artifact_digest:previousDigest,
    candidate_artifact_digest:candidateDigest,
    membership_assurance_digest:assuranceDigest,
    requires_external_authorization_verification:true,
    authorization_verification_effect:'none',
    authority_effect:'none',
    governance_effect:'none',
    artifact_effect:'none',
    execution_effect:'none',
    network_effect:'none'
  });
}

function assertArtifactIdentityStable(previous,candidate){
  for(const field of [
    'schema','version','status','artifact_id','owner_ref','content_type','created_at',
    'authority_effect','network_effect','runtime_activation'
  ]){
    if(previous[field]!==candidate[field]){
      throw new ValidationError(`Circle artifact ${field} is immutable across revision admission`);
    }
  }
  if(digestObject(previous.authority_domain)!==digestObject(candidate.authority_domain)){
    throw new ValidationError('Circle artifact authority_domain is immutable across revision admission');
  }
  if(digestObject(previous.sharing)!==digestObject(candidate.sharing)){
    throw new ValidationError('Circle artifact sharing state is outside revision admission and must remain unchanged');
  }
}

function validateAuthorizationCurrent(value){
  exactObject(value,'Circle artifact authorization currentness',[
    'request_digest','evidence_ref','evidence_digest','current','verified_at','expires_at'
  ]);
  digest(value.request_digest,'authorization current request_digest');
  id(value.evidence_ref,'authorization current evidence_ref');
  digest(value.evidence_digest,'authorization current evidence_digest');
  if(typeof value.current!=='boolean')throw new ValidationError('authorization current flag must be boolean');
  const verified=canonicalDate(value.verified_at,'authorization verified_at');
  const expires=canonicalDate(value.expires_at,'authorization expires_at');
  if(expires<=verified)throw new ValidationError('authorization expires_at must follow verified_at');
}

function exactObject(value,label,fields){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(label+' must be an object');
  const actual=Object.keys(value).sort().join(',');
  const expected=[...fields].sort().join(',');
  if(actual!==expected)throw new ValidationError(label+' fields are invalid');
}
function id(value,label){if(typeof value!=='string'||!ID.test(value))throw new ValidationError(label+' is invalid');}
function digest(value,label){if(typeof value!=='string'||!DIGEST.test(value))throw new ValidationError(label+' must be a lowercase sha256 digest');}
function canonicalDate(value,label){
  if(typeof value!=='string'||value.length>64)throw new ValidationError(label+' must be a canonical ISO timestamp');
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString()!==value)throw new ValidationError(label+' must be a canonical ISO timestamp');
  return parsed.getTime();
}

import { digestObject, ValidationError } from './canonical.mjs';
import {
  assessAgreementEvidence,
  validateAgreementRecord
} from './agreement-record.mjs';
import { validateCircleCorePackage } from './circle-core.mjs';
import {
  assessCircleMembership,
  circleMembershipAssuranceDigest,
  validateCircleMembershipAssurance
} from './circle-membership-assurance.mjs';

export const CIRCLE_COMMITMENT_ADMISSION_SCHEMA='axiom-circle-commitment-admission.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const AGREEMENT_ID=/^agreement:[a-f0-9]{64}$/;
const ADMISSION_ID=/^circle-commitment:[a-f0-9]{64}$/;

export function normalizeCircleMembershipContext(value){
  exactObject(value,'Circle commitment membership context',[
    'assessed_at','principal_id','presented_device_ref',
    'verified_current_device_refs','verified_current_consent_receipt_refs'
  ]);
  canonicalDate(value.assessed_at,'membership context assessed_at');
  id(value.principal_id,'membership context principal_id');
  if(value.presented_device_ref!==null)id(value.presented_device_ref,'membership context presented_device_ref');
  const devices=sortedUniqueIds(value.verified_current_device_refs,'membership context verified_current_device_refs',0,64);
  const consents=sortedUniqueIds(value.verified_current_consent_receipt_refs,'membership context verified_current_consent_receipt_refs',0,128);
  return Object.freeze({
    assessed_at:value.assessed_at,
    principal_id:value.principal_id,
    presented_device_ref:value.presented_device_ref,
    verified_current_device_refs:Object.freeze(devices),
    verified_current_consent_receipt_refs:Object.freeze(consents)
  });
}

export function circleMembershipContextDigest(value){
  return digestObject(normalizeCircleMembershipContext(value));
}

export function circleCommitmentIdentityBody(document){
  return {
    schema:CIRCLE_COMMITMENT_ADMISSION_SCHEMA,
    version:0,
    circle_id:document.circle_id,
    charter_digest_at_recording:document.charter_digest_at_recording,
    agreement_id:document.agreement_id,
    agreement_digest:document.agreement_digest,
    historical_circle_package_digest:document.historical_circle_package_digest,
    historical_circle_snapshot_evidence_ref:document.historical_circle_snapshot_evidence_ref,
    historical_circle_snapshot_evidence_digest:document.historical_circle_snapshot_evidence_digest,
    recorded_at:document.recorded_at,
    party_bindings:document.party_bindings.map(binding=>({...binding}))
  };
}

export function deriveCircleCommitmentAdmissionId(document){
  return 'circle-commitment:'+digestObject(circleCommitmentIdentityBody(document));
}

export function validateCircleCommitmentAdmission(document){
  exactObject(document,'Circle commitment admission',[
    'schema','version','status','admission_id','circle_id','charter_digest_at_recording',
    'agreement_id','agreement_digest','historical_circle_package_digest',
    'historical_circle_snapshot_evidence_ref','historical_circle_snapshot_evidence_digest',
    'recorded_at','party_bindings','authority_effect','governance_effect','enforcement_effect',
    'execution_effect','payment_effect','settlement_effect','network_effect','runtime_activation'
  ]);
  if(
    document.schema!==CIRCLE_COMMITMENT_ADMISSION_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-circle-commitment-admission'
    ||document.authority_effect!=='none'
    ||document.governance_effect!=='none'
    ||document.enforcement_effect!=='none'
    ||document.execution_effect!=='none'
    ||document.payment_effect!=='none'
    ||document.settlement_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Circle commitment admission authority boundary is invalid');

  if(typeof document.admission_id!=='string'||!ADMISSION_ID.test(document.admission_id)){
    throw new ValidationError('Circle commitment admission_id is invalid');
  }
  id(document.circle_id,'circle_id');
  digest(document.charter_digest_at_recording,'charter_digest_at_recording');
  if(typeof document.agreement_id!=='string'||!AGREEMENT_ID.test(document.agreement_id)){
    throw new ValidationError('agreement_id is invalid');
  }
  digest(document.agreement_digest,'agreement_digest');
  digest(document.historical_circle_package_digest,'historical_circle_package_digest');
  id(document.historical_circle_snapshot_evidence_ref,'historical_circle_snapshot_evidence_ref');
  digest(document.historical_circle_snapshot_evidence_digest,'historical_circle_snapshot_evidence_digest');
  canonicalDate(document.recorded_at,'recorded_at');
  validatePartyBindings(document.party_bindings);

  const expected=deriveCircleCommitmentAdmissionId(document);
  if(document.admission_id!==expected){
    throw new ValidationError('Circle commitment admission_id does not match canonical identity');
  }

  return Object.freeze({
    valid:true,
    schema:document.schema,
    admission_id:document.admission_id,
    admission_digest:digestObject(document),
    authority_effect:'none',
    governance_effect:'none',
    enforcement_effect:'none',
    execution_effect:'none',
    payment_effect:'none',
    settlement_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function assessCircleCommitmentAdmission({
  admission,
  agreementEvidenceInput,
  historicalCirclePackage,
  historicalCircleSnapshotEvidence,
  partyMembershipEvidence
}){
  validateCircleCommitmentAdmission(admission);
  validateAgreementRecord(agreementEvidenceInput.agreement);
  const agreementAssessment=assessAgreementEvidence(agreementEvidenceInput);
  const packageResult=validateCircleCorePackage(historicalCirclePackage);
  validateHistoricalSnapshotEvidence(historicalCircleSnapshotEvidence);

  if(!Array.isArray(partyMembershipEvidence)||partyMembershipEvidence.length>64){
    throw new ValidationError('partyMembershipEvidence must contain at most 64 entries');
  }

  const agreement=agreementEvidenceInput.agreement;
  const reasons=[];
  if(!agreementAssessment.recorded_commitment_valid){
    for(const reason of agreementAssessment.recorded_reasons){
      reasons.push('agreement:'+reason);
    }
  }
  if(admission.agreement_id!==agreement.agreement_id)reasons.push('agreement-id-mismatch');
  if(admission.agreement_digest!==digestObject(agreement))reasons.push('agreement-digest-mismatch');
  if(admission.recorded_at!==agreement.recorded_at)reasons.push('agreement-recorded-at-mismatch');

  if(historicalCirclePackage.circle.circle_id!==admission.circle_id){
    reasons.push('historical-circle-id-mismatch');
  }
  if(packageResult.charter_digest!==admission.charter_digest_at_recording){
    reasons.push('historical-charter-digest-mismatch');
  }
  if(packageResult.package_digest!==admission.historical_circle_package_digest){
    reasons.push('historical-circle-package-digest-mismatch');
  }
  if(historicalCircleSnapshotEvidence.evidence_ref!==admission.historical_circle_snapshot_evidence_ref){
    reasons.push('historical-snapshot-evidence-ref-mismatch');
  }
  if(historicalCircleSnapshotEvidence.evidence_digest!==admission.historical_circle_snapshot_evidence_digest){
    reasons.push('historical-snapshot-evidence-digest-mismatch');
  }
  if(historicalCircleSnapshotEvidence.circle_id!==admission.circle_id){
    reasons.push('historical-snapshot-circle-mismatch');
  }
  if(historicalCircleSnapshotEvidence.package_digest!==packageResult.package_digest){
    reasons.push('historical-snapshot-package-digest-mismatch');
  }
  if(historicalCircleSnapshotEvidence.charter_digest!==packageResult.charter_digest){
    reasons.push('historical-snapshot-charter-digest-mismatch');
  }

  const recordedAt=canonicalDate(agreement.recorded_at,'agreement recorded_at');
  if(canonicalDate(historicalCircleSnapshotEvidence.observed_at,'historical snapshot observed_at')!==recordedAt){
    reasons.push('historical-snapshot-time-mismatch');
  }
  if(canonicalDate(historicalCirclePackage.circle.created_at,'historical circle created_at')>recordedAt){
    reasons.push('circle-created-after-agreement');
  }
  if(canonicalDate(historicalCirclePackage.charter.effective_from,'historical charter effective_from')>recordedAt){
    reasons.push('charter-effective-after-agreement');
  }

  const bindings=new Map(admission.party_bindings.map(binding=>[binding.principal_id,binding]));
  const evidenceByPrincipal=new Map();
  for(const evidence of partyMembershipEvidence){
    exactObject(evidence,'Circle commitment party membership evidence',[
      'principal_id','assurance','current','context_evidence_ref','context_evidence_digest'
    ]);
    id(evidence.principal_id,'party membership evidence principal_id');
    id(evidence.context_evidence_ref,'party membership context_evidence_ref');
    digest(evidence.context_evidence_digest,'party membership context_evidence_digest');
    if(evidenceByPrincipal.has(evidence.principal_id)){
      throw new ValidationError('Duplicate party membership evidence principal');
    }
    evidenceByPrincipal.set(evidence.principal_id,evidence);
  }

  if(!sameSet([...bindings.keys()],agreement.parties)){
    reasons.push('party-binding-set-mismatch');
  }
  if(!sameSet([...evidenceByPrincipal.keys()],agreement.parties)){
    reasons.push('party-membership-evidence-set-mismatch');
  }

  const partyResults=[];
  for(const principal of agreement.parties){
    const binding=bindings.get(principal);
    const evidence=evidenceByPrincipal.get(principal);
    const partyReasons=[];
    if(!binding){
      partyReasons.push('binding-missing');
    }
    if(!evidence){
      partyReasons.push('membership-evidence-missing');
    }else{
      validateCircleMembershipAssurance(evidence.assurance);
      const normalizedCurrent=normalizeCircleMembershipContext(evidence.current);
      if(evidence.assurance.principal_id!==principal)partyReasons.push('assurance-principal-mismatch');
      if(evidence.current.principal_id!==principal)partyReasons.push('context-principal-mismatch');
      if(evidence.current.assessed_at!==agreement.recorded_at){
        partyReasons.push('historical-membership-time-mismatch');
      }
      if(binding){
        if(binding.membership_assurance_digest!==circleMembershipAssuranceDigest(evidence.assurance)){
          partyReasons.push('membership-assurance-digest-mismatch');
        }
        if(binding.membership_context_digest!==digestObject(normalizedCurrent)){
          partyReasons.push('membership-context-digest-mismatch');
        }
        if(binding.membership_context_evidence_ref!==evidence.context_evidence_ref){
          partyReasons.push('membership-context-evidence-ref-mismatch');
        }
        if(binding.membership_context_evidence_digest!==evidence.context_evidence_digest){
          partyReasons.push('membership-context-evidence-digest-mismatch');
        }
      }
      const assessed=assessCircleMembership(
        historicalCirclePackage,
        evidence.assurance,
        evidence.current
      );
      if(!assessed.eligible_to_participate){
        for(const reason of assessed.reasons)partyReasons.push('membership:'+reason);
      }
    }
    for(const reason of partyReasons)reasons.push(principal+':'+reason);
    partyResults.push(Object.freeze({
      principal_id:principal,
      historically_eligible:partyReasons.length===0,
      reasons:Object.freeze(partyReasons)
    }));
  }

  return Object.freeze({
    schema:'axiom-circle-commitment-admission-assessment.v0',
    historical_circle_commitment_admissible:reasons.length===0,
    reasons:Object.freeze(reasons),
    circle_id:admission.circle_id,
    agreement_id:admission.agreement_id,
    admission_digest:digestObject(admission),
    historical_circle_package_digest:packageResult.package_digest,
    parties:Object.freeze(partyResults),
    requires_external_historical_circle_snapshot_verification:true,
    historical_snapshot_verification_effect:'none',
    requires_external_agreement_evidence_verification:true,
    agreement_evidence_verification_effect:'none',
    authority_effect:'none',
    governance_effect:'none',
    enforcement_effect:'none',
    execution_effect:'none',
    payment_effect:'none',
    settlement_effect:'none',
    network_effect:'none'
  });
}

function validateHistoricalSnapshotEvidence(value){
  exactObject(value,'Historical Circle snapshot evidence',[
    'evidence_ref','evidence_digest','observed_at','circle_id','package_digest','charter_digest'
  ]);
  id(value.evidence_ref,'historical snapshot evidence_ref');
  digest(value.evidence_digest,'historical snapshot evidence_digest');
  canonicalDate(value.observed_at,'historical snapshot observed_at');
  id(value.circle_id,'historical snapshot circle_id');
  digest(value.package_digest,'historical snapshot package_digest');
  digest(value.charter_digest,'historical snapshot charter_digest');
}

function validatePartyBindings(value){
  if(!Array.isArray(value)||value.length<2||value.length>64){
    throw new ValidationError('party_bindings must contain 2-64 entries');
  }
  let previous=null;
  const seen=new Set();
  for(const binding of value){
    exactObject(binding,'Circle commitment party binding',[
      'principal_id','membership_assurance_digest','membership_context_digest',
      'membership_context_evidence_ref','membership_context_evidence_digest'
    ]);
    id(binding.principal_id,'party binding principal_id');
    digest(binding.membership_assurance_digest,'party binding membership_assurance_digest');
    digest(binding.membership_context_digest,'party binding membership_context_digest');
    id(binding.membership_context_evidence_ref,'party binding membership_context_evidence_ref');
    digest(binding.membership_context_evidence_digest,'party binding membership_context_evidence_digest');
    if(seen.has(binding.principal_id))throw new ValidationError('party_bindings contains duplicate principal');
    if(previous!==null&&binding.principal_id<=previous)throw new ValidationError('party_bindings must be sorted by principal_id');
    seen.add(binding.principal_id);
    previous=binding.principal_id;
  }
}

function sortedUniqueIds(value,label,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max){
    throw new ValidationError(label+' has invalid cardinality');
  }
  const normalized=[];
  const seen=new Set();
  for(const item of value){
    id(item,label+' item');
    if(seen.has(item))throw new ValidationError(label+' contains duplicate values');
    seen.add(item);
    normalized.push(item);
  }
  return normalized.sort((a,b)=>a<b?-1:a>b?1:0);
}

function sameSet(left,right){
  if(left.length!==right.length)return false;
  const set=new Set(left);
  return right.every(value=>set.has(value));
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
  if(typeof value!=='string'||value.length!==24)throw new ValidationError(label+' must be a canonical UTC timestamp');
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString()!==value)throw new ValidationError(label+' must be a canonical UTC timestamp');
  return parsed.getTime();
}

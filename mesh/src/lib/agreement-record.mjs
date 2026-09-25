import { digestObject, ValidationError } from './canonical.mjs';

export const AGREEMENT_RECORD_SCHEMA='axiom-agreement-record.v0';
export const AGREEMENT_ACCEPTANCE_EVIDENCE_SCHEMA='axiom-agreement-acceptance-evidence.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const AGREEMENT_ID=/^agreement:[a-f0-9]{64}$/;
const ACCEPTANCE_ID=/^acceptance:[a-f0-9]{64}$/;

export function agreementIdentityBody(document){
  return {
    schema:AGREEMENT_RECORD_SCHEMA,
    version:0,
    parties:[...document.parties],
    body_digest:document.body_digest,
    recorded_at:document.recorded_at,
    context_tags:[...document.context_tags],
    supersedes:[...document.supersedes],
    acceptance_policy:{...document.acceptance_policy}
  };
}

export function deriveAgreementId(document){
  return 'agreement:'+digestObject(agreementIdentityBody(document));
}

export function acceptanceIdentityBody(document){
  return {
    schema:AGREEMENT_ACCEPTANCE_EVIDENCE_SCHEMA,
    version:0,
    agreement_id:document.agreement_id,
    body_digest:document.body_digest,
    principal_id:document.principal_id,
    consent_id:document.consent_id,
    consent_grant_statement_digest:document.consent_grant_statement_digest,
    consent_grant_evidence_ref:document.consent_grant_evidence_ref,
    consent_grant_evidence_digest:document.consent_grant_evidence_digest,
    observed_at:document.observed_at
  };
}

export function deriveAcceptanceId(document){
  return 'acceptance:'+digestObject(acceptanceIdentityBody(document));
}

export function validateAgreementRecord(document){
  exactObject(document,'Agreement record',[
    'schema','version','status','agreement_id','parties','body_digest','recorded_at',
    'context_tags','supersedes','acceptance_policy','contains_private_body',
    'authority_effect','enforcement_effect','legal_validity_claimed','payment_effect',
    'settlement_effect','network_effect','runtime_activation'
  ]);
  if(
    document.schema!==AGREEMENT_RECORD_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-commitment-evidence'
    ||document.contains_private_body!==false
    ||document.authority_effect!=='none'
    ||document.enforcement_effect!=='none'
    ||document.legal_validity_claimed!==false
    ||document.payment_effect!=='none'
    ||document.settlement_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Agreement record non-enforcement boundary is invalid');

  if(typeof document.agreement_id!=='string'||!AGREEMENT_ID.test(document.agreement_id)){
    throw new ValidationError('agreement_id is invalid');
  }
  sortedIdArray(document.parties,'parties',2,64);
  digest(document.body_digest,'body_digest');
  canonicalDate(document.recorded_at,'recorded_at');
  sortedIdArray(document.context_tags,'context_tags',0,32);
  sortedAgreementArray(document.supersedes,'supersedes',0,64);
  validateAcceptancePolicy(document.acceptance_policy,document.body_digest);
  if(document.supersedes.includes(document.agreement_id)){
    throw new ValidationError('Agreement cannot supersede itself');
  }
  const expected=deriveAgreementId(document);
  if(document.agreement_id!==expected){
    throw new ValidationError('agreement_id does not match canonical agreement identity');
  }

  return Object.freeze({
    valid:true,
    schema:document.schema,
    agreement_id:document.agreement_id,
    agreement_digest:digestObject(document),
    authority_effect:'none',
    enforcement_effect:'none',
    legal_validity_claimed:false,
    payment_effect:'none',
    settlement_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function validateAgreementAcceptanceEvidence(document){
  exactObject(document,'Agreement acceptance evidence',[
    'schema','version','status','acceptance_id','agreement_id','body_digest',
    'principal_id','consent_id','consent_grant_statement_digest',
    'consent_grant_evidence_ref','consent_grant_evidence_digest','observed_at',
    'evidence_refs','authority_effect','enforcement_effect','consent_effect',
    'network_effect','runtime_activation'
  ]);
  if(
    document.schema!==AGREEMENT_ACCEPTANCE_EVIDENCE_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-acceptance-evidence'
    ||document.authority_effect!=='none'
    ||document.enforcement_effect!=='none'
    ||document.consent_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Agreement acceptance evidence authority boundary is invalid');

  if(typeof document.acceptance_id!=='string'||!ACCEPTANCE_ID.test(document.acceptance_id)){
    throw new ValidationError('acceptance_id is invalid');
  }
  if(typeof document.agreement_id!=='string'||!AGREEMENT_ID.test(document.agreement_id)){
    throw new ValidationError('acceptance agreement_id is invalid');
  }
  digest(document.body_digest,'acceptance body_digest');
  id(document.principal_id,'acceptance principal_id');
  id(document.consent_id,'acceptance consent_id');
  digest(document.consent_grant_statement_digest,'consent_grant_statement_digest');
  id(document.consent_grant_evidence_ref,'consent_grant_evidence_ref');
  digest(document.consent_grant_evidence_digest,'consent_grant_evidence_digest');
  canonicalDate(document.observed_at,'acceptance observed_at');
  refArray(document.evidence_refs,'acceptance evidence_refs',1,64);

  const expected=deriveAcceptanceId(document);
  if(document.acceptance_id!==expected){
    throw new ValidationError('acceptance_id does not match canonical acceptance identity');
  }
  return Object.freeze({
    valid:true,
    schema:document.schema,
    acceptance_id:document.acceptance_id,
    acceptance_digest:digestObject(document),
    authority_effect:'none',
    enforcement_effect:'none',
    consent_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function normalizedConsentGrantStatement(value){
  exactObject(value,'Consent grant statement',[
    'consent_id','subject','controller','purpose','scopes','expires_at','created_at',
    'evidence_ref','evidence_digest'
  ]);
  id(value.consent_id,'consent grant consent_id');
  id(value.subject,'consent grant subject');
  id(value.controller,'consent grant controller');
  text(value.purpose,'consent grant purpose',1,512);
  sortedTextArray(value.scopes,'consent grant scopes',1,64,160);
  const created=canonicalDate(value.created_at,'consent grant created_at');
  const expires=canonicalDate(value.expires_at,'consent grant expires_at');
  if(expires<=created)throw new ValidationError('Consent grant expires_at must follow created_at');
  id(value.evidence_ref,'consent grant evidence_ref');
  digest(value.evidence_digest,'consent grant evidence_digest');
  return Object.freeze({
    consent_id:value.consent_id,
    subject:value.subject,
    controller:value.controller,
    purpose:value.purpose,
    scopes:Object.freeze([...value.scopes]),
    expires_at:value.expires_at,
    created_at:value.created_at,
    evidence_ref:value.evidence_ref,
    evidence_digest:value.evidence_digest
  });
}

export function consentGrantStatementDigest(value){
  const statement=normalizedConsentGrantStatement(value);
  return digestObject({
    consent_id:statement.consent_id,
    subject:statement.subject,
    controller:statement.controller,
    purpose:statement.purpose,
    scopes:statement.scopes,
    expires_at:statement.expires_at,
    created_at:statement.created_at
  });
}

export function assessAgreementEvidence({
  agreement,
  acceptances,
  consentGrantStatements,
  currentConsentObservations,
  assessedAt
}){
  validateAgreementRecord(agreement);
  canonicalDate(assessedAt,'assessedAt');
  if(!Array.isArray(acceptances)||acceptances.length>64){
    throw new ValidationError('acceptances must contain at most 64 records');
  }
  if(!Array.isArray(consentGrantStatements)||consentGrantStatements.length>64){
    throw new ValidationError('consentGrantStatements must contain at most 64 records');
  }
  if(!Array.isArray(currentConsentObservations)||currentConsentObservations.length>64){
    throw new ValidationError('currentConsentObservations must contain at most 64 records');
  }

  const acceptanceByPrincipal=new Map();
  for(const acceptance of acceptances){
    validateAgreementAcceptanceEvidence(acceptance);
    if(acceptanceByPrincipal.has(acceptance.principal_id)){
      throw new ValidationError('Duplicate agreement acceptance principal');
    }
    acceptanceByPrincipal.set(acceptance.principal_id,acceptance);
  }

  const grantsById=new Map();
  for(const raw of consentGrantStatements){
    const grant=normalizedConsentGrantStatement(raw);
    if(grantsById.has(grant.consent_id))throw new ValidationError('Duplicate consent grant statement');
    grantsById.set(grant.consent_id,grant);
  }

  const currentById=new Map();
  for(const raw of currentConsentObservations){
    const observation=validateCurrentConsentObservation(raw);
    if(currentById.has(observation.record.consent_id)){
      throw new ValidationError('Duplicate current consent observation');
    }
    currentById.set(observation.record.consent_id,observation);
  }

  const recordedReasons=[];
  const currentReasons=[];
  const partyResults=[];
  const partySet=new Set(agreement.parties);
  for(const principal of acceptanceByPrincipal.keys()){
    if(!partySet.has(principal))recordedReasons.push('outsider-acceptance:'+principal);
  }

  const agreementRecordedAt=canonicalDate(agreement.recorded_at,'agreement recorded_at');
  const assessed=canonicalDate(assessedAt,'assessedAt');
  const assessmentPredatesAgreement=assessed<agreementRecordedAt;
  if(assessmentPredatesAgreement){
    recordedReasons.push('assessment-predates-agreement');
    currentReasons.push('assessment-predates-agreement');
  }

  for(const principal of agreement.parties){
    const acceptance=acceptanceByPrincipal.get(principal);
    const partyRecorded=[];
    const partyCurrent=[];
    if(assessmentPredatesAgreement)partyRecorded.push('assessment-predates-agreement');
    if(!acceptance){
      partyRecorded.push('acceptance-missing');
      recordedReasons.push('acceptance-missing:'+principal);
      partyResults.push(resultForParty(principal,null,partyRecorded,partyCurrent));
      continue;
    }
    if(acceptance.agreement_id!==agreement.agreement_id){
      partyRecorded.push('agreement-id-mismatch');
    }
    if(acceptance.body_digest!==agreement.body_digest){
      partyRecorded.push('body-digest-mismatch');
    }
    const grant=grantsById.get(acceptance.consent_id);
    if(!grant){
      partyRecorded.push('consent-grant-missing');
    }else{
      const grantDigest=consentGrantStatementDigest(grant);
      if(grantDigest!==acceptance.consent_grant_statement_digest){
        partyRecorded.push('consent-grant-statement-digest-mismatch');
      }
      if(grant.evidence_ref!==acceptance.consent_grant_evidence_ref){
        partyRecorded.push('consent-grant-evidence-ref-mismatch');
      }
      if(grant.evidence_digest!==acceptance.consent_grant_evidence_digest){
        partyRecorded.push('consent-grant-evidence-digest-mismatch');
      }
      if(grant.subject!==principal)partyRecorded.push('consent-subject-mismatch');
      if(grant.controller!==agreement.acceptance_policy.controller){
        partyRecorded.push('consent-controller-mismatch');
      }
      if(grant.purpose!==agreement.acceptance_policy.purpose){
        partyRecorded.push('consent-purpose-mismatch');
      }
      if(!grant.scopes.includes(agreement.acceptance_policy.required_scope)){
        partyRecorded.push('consent-scope-mismatch');
      }

      const observed=canonicalDate(acceptance.observed_at,'acceptance observed_at');
      const grantCreated=canonicalDate(grant.created_at,'consent grant created_at');
      const grantExpires=canonicalDate(grant.expires_at,'consent grant expires_at');
      if(observed<grantCreated)partyRecorded.push('acceptance-before-consent-grant');
      if(observed>=grantExpires)partyRecorded.push('acceptance-after-consent-expiry');
      if(observed>agreementRecordedAt)partyRecorded.push('acceptance-after-agreement-recorded');
      if(grantExpires<=agreementRecordedAt)partyRecorded.push('consent-expired-before-agreement-recorded');

      const observation=currentById.get(grant.consent_id);
      if(!observation){
        partyRecorded.push('current-consent-record-missing-for-history-check');
        partyCurrent.push('current-consent-missing');
      }else{
        const consentObservedAt=canonicalDate(observation.observed_at,'current consent observed_at');
        // Historical coverage and present currentness are different questions.
        if(consentObservedAt<agreementRecordedAt){
          partyRecorded.push('consent-observation-predates-recording');
        }
        if(consentObservedAt>assessed){
          partyRecorded.push('consent-observation-after-assessment');
        }
        if(consentObservedAt!==assessed){
          partyCurrent.push('current-consent-observation-time-mismatch');
        }
        const current=observation.record;
        const bindingMatches=currentMatchesGrant(current,grant);
        if(!bindingMatches){
          partyRecorded.push('current-consent-binding-mismatch-for-history-check');
          partyCurrent.push('current-consent-binding-mismatch');
        }
        if(current.revoked_at!==null){
          const revokedAt=canonicalDate(current.revoked_at,'current consent revoked_at');
          if(revokedAt<=agreementRecordedAt){
            partyRecorded.push('consent-revoked-before-agreement-recorded');
          }
          if(revokedAt<=assessed)partyCurrent.push('current-consent-revoked');
        }
        if(current.status!=='active')partyCurrent.push('current-consent-not-active:'+current.status);
        if(canonicalDate(current.expires_at,'current consent expires_at')<=assessed){
          partyCurrent.push('current-consent-expired');
        }
        if(assessmentPredatesAgreement){
          partyCurrent.push('assessment-predates-agreement');
        }
      }
    }

    for(const reason of partyRecorded)recordedReasons.push(principal+':'+reason);
    for(const reason of partyCurrent)currentReasons.push(principal+':'+reason);
    partyResults.push(resultForParty(principal,acceptance.acceptance_id,partyRecorded,partyCurrent));
  }

  return Object.freeze({
    schema:'axiom-agreement-evidence-assessment.v0',
    agreement_id:agreement.agreement_id,
    agreement_digest:digestObject(agreement),
    recorded_commitment_valid:recordedReasons.length===0,
    all_acceptances_current:recordedReasons.length===0&&currentReasons.length===0,
    recorded_reasons:Object.freeze(recordedReasons),
    currentness_reasons:Object.freeze(currentReasons),
    parties:Object.freeze(partyResults),
    historical_acceptance_survives_later_revocation:true,
    requires_external_grid_evidence_verification:true,
    grid_evidence_verification_effect:'none',
    absolute_time_truth_claimed:false,
    legal_validity_claimed:false,
    authority_effect:'none',
    enforcement_effect:'none',
    payment_effect:'none',
    settlement_effect:'none',
    network_effect:'none'
  });
}

export function verifyAgreementLineage(records){
  if(!Array.isArray(records)||records.length<1||records.length>4096){
    throw new ValidationError('Agreement lineage must contain 1-4096 records');
  }
  const byId=new Map();
  for(const record of records){
    validateAgreementRecord(record);
    if(byId.has(record.agreement_id))throw new ValidationError('Duplicate agreement_id in lineage');
    byId.set(record.agreement_id,record);
  }
  const edges=new Map();
  for(const record of records){
    edges.set(record.agreement_id,[...record.supersedes]);
    const recordedAt=canonicalDate(record.recorded_at,'agreement recorded_at');
    for(const priorId of record.supersedes){
      const prior=byId.get(priorId);
      if(!prior)throw new ValidationError('Agreement lineage missing superseded record '+priorId);
      if(canonicalDate(prior.recorded_at,'prior agreement recorded_at')>recordedAt){
        throw new ValidationError('Agreement cannot supersede a later recorded agreement');
      }
    }
  }
  detectCycles(edges);
  const ordered=[...records].sort((a,b)=>a.agreement_id.localeCompare(b.agreement_id));
  return Object.freeze({
    valid:true,
    schema:'axiom-agreement-lineage-verification.v0',
    agreements:records.length,
    lineage_digest:digestObject(ordered),
    authority_effect:'none',
    enforcement_effect:'none',
    network_effect:'none'
  });
}

function validateAcceptancePolicy(value,bodyDigest){
  exactObject(value,'Agreement acceptance_policy',['mechanism','controller','purpose','required_scope']);
  if(value.mechanism!=='grid-consent-record')throw new ValidationError('Agreement acceptance mechanism is invalid');
  id(value.controller,'acceptance policy controller');
  if(value.purpose!=='agreement.acceptance.v0')throw new ValidationError('Agreement acceptance purpose is invalid');
  const expected='agreement-body:'+bodyDigest+':accept';
  if(value.required_scope!==expected)throw new ValidationError('Agreement acceptance required_scope is not body-bound');
}

function validateCurrentConsentObservation(value){
  exactObject(value,'Current consent observation',[
    'observed_at','evidence_ref','evidence_digest','record'
  ]);
  const observed=canonicalDate(value.observed_at,'current consent observation observed_at');
  id(value.evidence_ref,'current consent observation evidence_ref');
  digest(value.evidence_digest,'current consent observation evidence_digest');
  const record=validateCurrentConsentRecord(value.record);
  if(canonicalDate(record.created_at,'current consent created_at')>observed){
    throw new ValidationError('Current consent observation cannot precede record created_at');
  }
  if(record.revoked_at!==null&&canonicalDate(record.revoked_at,'current consent revoked_at')>observed){
    throw new ValidationError('Current consent observation cannot precede record revoked_at');
  }
  return Object.freeze({
    observed_at:value.observed_at,
    evidence_ref:value.evidence_ref,
    evidence_digest:value.evidence_digest,
    record
  });
}

function validateCurrentConsentRecord(value){
  exactObject(value,'Current consent record',[
    'consent_id','subject','controller','purpose','scopes_json','expires_at',
    'status','created_at','revoked_at'
  ]);
  id(value.consent_id,'current consent_id');
  id(value.subject,'current consent subject');
  id(value.controller,'current consent controller');
  text(value.purpose,'current consent purpose',1,512);
  sortedTextArray(value.scopes_json,'current consent scopes_json',1,64,160);
  const created=canonicalDate(value.created_at,'current consent created_at');
  const expires=canonicalDate(value.expires_at,'current consent expires_at');
  if(expires<=created)throw new ValidationError('Current consent expires_at must follow created_at');
  if(!['active','revoked'].includes(value.status))throw new ValidationError('Current consent status is invalid');
  if(value.revoked_at!==null){
    const revoked=canonicalDate(value.revoked_at,'current consent revoked_at');
    if(revoked<created)throw new ValidationError('Current consent revoked_at cannot precede created_at');
  }
  if(value.status==='active'&&value.revoked_at!==null)throw new ValidationError('Active current consent cannot have revoked_at');
  if(value.status==='revoked'&&value.revoked_at===null)throw new ValidationError('Revoked current consent requires revoked_at');
  return value;
}

function currentMatchesGrant(current,grant){
  return current.consent_id===grant.consent_id
    &&current.subject===grant.subject
    &&current.controller===grant.controller
    &&current.purpose===grant.purpose
    &&sameArray(current.scopes_json,grant.scopes)
    &&current.expires_at===grant.expires_at
    &&current.created_at===grant.created_at;
}

function resultForParty(principal,acceptanceId,recorded,current){
  return Object.freeze({
    principal_id:principal,
    acceptance_id:acceptanceId,
    recorded_acceptance_valid:recorded.length===0,
    currently_active:recorded.length===0&&current.length===0,
    recorded_reasons:Object.freeze([...recorded]),
    currentness_reasons:Object.freeze([...current])
  });
}

function detectCycles(edges){
  const visiting=new Set();
  const visited=new Set();
  function visit(id){
    if(visiting.has(id))throw new ValidationError('Agreement lineage contains a cycle');
    if(visited.has(id))return;
    visiting.add(id);
    for(const prior of edges.get(id)??[])visit(prior);
    visiting.delete(id);
    visited.add(id);
  }
  for(const id of edges.keys())visit(id);
}

function exactObject(value,label,fields){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(label+' must be an object');
  const actual=Object.keys(value).sort().join(',');
  const expected=[...fields].sort().join(',');
  if(actual!==expected)throw new ValidationError(label+' fields are invalid');
}
function id(value,label){if(typeof value!=='string'||!ID.test(value))throw new ValidationError(label+' is invalid');}
function digest(value,label){if(typeof value!=='string'||!DIGEST.test(value))throw new ValidationError(label+' must be a lowercase sha256 digest');}
function text(value,label,min,max){if(typeof value!=='string'||value.length<min||value.length>max)throw new ValidationError(label+' is invalid');}
function canonicalDate(value,label){
  if(typeof value!=='string'||value.length!==24)throw new ValidationError(label+' must be a canonical UTC timestamp');
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString()!==value)throw new ValidationError(label+' must be a canonical UTC timestamp');
  return parsed.getTime();
}
function sortedIdArray(value,label,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' has invalid cardinality');
  for(const item of value)id(item,label+' item');
  uniqueSorted(value,label);
}
function sortedTextArray(value,label,min,max,itemMax){
  if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' has invalid cardinality');
  for(const item of value)text(item,label+' item',1,itemMax);
  uniqueSorted(value,label);
}
function sortedAgreementArray(value,label,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' has invalid cardinality');
  for(const item of value){
    if(typeof item!=='string'||!AGREEMENT_ID.test(item))throw new ValidationError(label+' item is invalid');
  }
  uniqueSorted(value,label);
}
function refArray(value,label,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' has invalid cardinality');
  const seen=new Set();
  for(const item of value){
    text(item,label+' item',1,512);
    if(seen.has(item))throw new ValidationError(label+' contains duplicate values');
    seen.add(item);
  }
}
function uniqueSorted(value,label){
  if(new Set(value).size!==value.length)throw new ValidationError(label+' contains duplicate values');
  const sorted=[...value].sort((a,b)=>a<b?-1:a>b?1:0);
  if(value.some((item,index)=>item!==sorted[index]))throw new ValidationError(label+' must be sorted');
}
function sameArray(left,right){
  return left.length===right.length&&left.every((item,index)=>item===right[index]);
}

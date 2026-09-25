import { canonicalize, digestObject, ValidationError } from './canonical.mjs';
import { assessAgreementEvidence } from './agreement-record.mjs';
import { validateCircleCorePackage } from './circle-core.mjs';
import { assessCircleMembership } from './circle-membership-assurance.mjs';
import { assessCircleCommitmentAdmission, normalizeCircleMembershipContext } from './circle-commitment-admission.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
// Only absent/temporally incomplete evidence is uncertainty. Other assessor
// findings remain negative even when an observation is also missing or stale.
const CONSENT_UNCERTAINTY_REASONS = new Set([
  'current-consent-missing',
  'current-consent-observation-time-mismatch',
  'current-consent-record-missing-for-history-check',
  'consent-observation-predates-recording',
  'consent-observation-after-assessment'
]);

/**
 * Read-only comparison of retained historical evidence and a separate present
 * observation. Supported means supported by supplied evidence, not authorized
 * or externally authenticated. This function never rewrites either snapshot.
 */
export function assessCircleCommitmentStatus(raw){
  const input=canonicalize(raw);
  exactObject(input,'Circle commitment status input',[
    'historicalInput','currentCircleEvidence','currentAgreementEvidenceInput','assessedAt'
  ]);
  exactObject(input.historicalInput,'Historical commitment input',[
    'admission','agreementEvidenceInput','historicalCirclePackage',
    'historicalCircleSnapshotEvidence','partyMembershipEvidence'
  ]);
  const historical=assessCircleCommitmentAdmission(input.historicalInput);
  const source=input.historicalInput.agreementEvidenceInput;
  const assessed=canonicalDate(input.assessedAt,'status assessedAt');
  if(assessed<canonicalDate(source.assessedAt,'historical assessment time')){
    throw new ValidationError('Status assessment predates the retained historical evaluation');
  }
  const parties=source.agreement.parties;
  const circleId=input.historicalInput.admission.circle_id;
  const membershipByPrincipal=new Map();
  const reviewReasons=[];
  let currentCharter=null;

  if(input.currentCircleEvidence!==null){
    const supplied=input.currentCircleEvidence;
    exactObject(supplied,'Current Circle evidence',[
      'packageDocument','snapshotEvidence','partyMembershipEvidence'
    ]);
    const checked=validateCircleCorePackage(supplied.packageDocument);
    const snapshot=supplied.snapshotEvidence;
    validateCurrentSnapshotEvidence(snapshot);
    if(checked.circle_id!==circleId||snapshot.circle_id!==circleId
      ||snapshot.package_digest!==checked.package_digest
      ||snapshot.charter_digest!==checked.charter_digest
      ||snapshot.observed_at!==input.assessedAt){
      throw new ValidationError('Current Circle snapshot identity, digest or time mismatch');
    }
    if(canonicalDate(supplied.packageDocument.circle.created_at,'current circle created_at')>assessed
      ||canonicalDate(supplied.packageDocument.charter.effective_from,'current charter effective_from')>assessed){
      throw new ValidationError('Current Circle chronology exceeds the assessment instant');
    }
    currentCharter=checked.charter_digest;
    if(!Array.isArray(supplied.partyMembershipEvidence)||supplied.partyMembershipEvidence.length>64){
      throw new ValidationError('Current membership evidence must contain at most 64 entries');
    }
    for(const evidence of supplied.partyMembershipEvidence){
      exactObject(evidence,'Current membership evidence',[
        'principal_id','assurance','current','context_evidence_ref','context_evidence_digest'
      ]);
      id(evidence.principal_id,'Current membership principal');
      id(evidence.context_evidence_ref,'Current membership evidence_ref');
      digest(evidence.context_evidence_digest,'Current membership evidence_digest');
      if(!parties.includes(evidence.principal_id)||membershipByPrincipal.has(evidence.principal_id)){
        throw new ValidationError('Current membership evidence has a duplicate or outsider principal');
      }
      const context=normalizeCircleMembershipContext(evidence.current);
      if(context.assessed_at!==input.assessedAt){
        throw new ValidationError('Current membership time does not match status assessment');
      }
      if(context.principal_id!==evidence.principal_id||evidence.assurance.principal_id!==evidence.principal_id){
        throw new ValidationError('Current membership principal binding mismatch');
      }
      const member=assessCircleMembership(supplied.packageDocument,evidence.assurance,context);
      membershipByPrincipal.set(evidence.principal_id,statusSupport(
        member.eligible_to_participate?'supported':'not-supported',member.reasons
      ));
    }
    // Explicitly dated contradictory evidence is surfaced, never silently used
    // to mutate the retained historical package. This is not a completeness proof.
    const recorded=canonicalDate(source.agreement.recorded_at,'agreement recorded_at');
    for(const old of input.historicalInput.partyMembershipEvidence){
      const membershipId=old.assurance.membership_id;
      const record=supplied.packageDocument.memberships.find(item=>(
        item.membership_id===membershipId&&item.principal_id===old.principal_id
      ));
      // A current snapshot may establish a negative for the exact historical
      // membership without supplemental device/consent context. It cannot
      // establish a positive, or override a separately assessed new membership.
      if(!membershipByPrincipal.has(old.principal_id)){
        const negative=[];
        if(record&&record.status!=='active'
          &&canonicalDate(record.status_effective_at,'current membership status time')<=assessed){
          negative.push('membership-not-active:'+record.status);
        }
        for(const exit of supplied.packageDocument.exits){
          if(exit.membership_id===membershipId&&exit.principal_id===old.principal_id
            &&canonicalDate(exit.effective_at,'current exit effective_at')<=assessed){
            negative.push('effective-exit:'+exit.kind);
          }
        }
        if(negative.length){
          membershipByPrincipal.set(old.principal_id,statusSupport('not-supported',[
            ...negative,'current-membership-evidence-missing'
          ]));
        }
      }
      if(record&&record.status!=='active'
        &&canonicalDate(record.status_effective_at,'current membership status time')<=recorded){
        reviewReasons.push(old.principal_id+':membership-inactive-before-recording');
      }
      if(supplied.packageDocument.exits.some(exit=>(
        exit.membership_id===membershipId&&exit.principal_id===old.principal_id
        &&canonicalDate(exit.effective_at,'current exit effective_at')<=recorded
      ))){
        reviewReasons.push(old.principal_id+':exit-before-recording');
      }
    }
  }

  const consentByPrincipal=new Map();
  if(input.currentAgreementEvidenceInput!==null){
    const supplied=input.currentAgreementEvidenceInput;
    exactObject(supplied,'Current agreement evidence input',[
      'agreement','acceptances','consentGrantStatements','currentConsentObservations','assessedAt'
    ]);
    if(digestObject(supplied.agreement)!==digestObject(source.agreement)
      ||statusSetDigest(supplied.acceptances,'principal_id')!==statusSetDigest(source.acceptances,'principal_id')
      ||statusSetDigest(supplied.consentGrantStatements,'consent_id')!==statusSetDigest(source.consentGrantStatements,'consent_id')){
      throw new ValidationError('Current agreement immutable evidence does not match the historical record');
    }
    if(supplied.assessedAt!==input.assessedAt){
      throw new ValidationError('Current agreement assessment time mismatch');
    }
    const agreement=assessAgreementEvidence(supplied);
    for(const party of agreement.parties){
      const reasons=[...party.recorded_reasons,...party.currentness_reasons];
      const acceptance=supplied.acceptances.find(item=>item.principal_id===party.principal_id);
      const grant=supplied.consentGrantStatements.find(item=>(
        item.consent_id===acceptance?.consent_id&&item.subject===party.principal_id
      ));
      // The exact immutable grant already fixes expiry; an omitted current row
      // cannot extend it. No positive currentness is borrowed from that grant.
      if(grant&&canonicalDate(grant.expires_at,'consent grant expires_at')<=assessed){
        reasons.push('current-consent-expired');
      }
      const negative=reasons.some(reason=>!CONSENT_UNCERTAINTY_REASONS.has(reason));
      const state=negative?'not-supported':reasons.length?'unknown':party.currently_active?'supported':'not-supported';
      consentByPrincipal.set(party.principal_id,statusSupport(state,reasons));
    }
    reviewReasons.push(...agreement.recorded_reasons.filter(reason=>(
      reason.endsWith(':consent-revoked-before-agreement-recorded')
    )));
  }

  const rows=parties.map(principal=>Object.freeze({
    principal_id:principal,
    membership:membershipByPrincipal.get(principal)??statusSupport('unknown',['current-membership-evidence-missing']),
    consent:consentByPrincipal.get(principal)??statusSupport('unknown',['current-consent-evidence-missing'])
  }));
  const states=rows.flatMap(row=>[row.membership.status,row.consent.status]);
  const support=states.includes('not-supported')?'not-supported':states.includes('unknown')?'unknown':'supported';
  const result={
    schema:'axiom-circle-commitment-status.v0',
    assessed_at:input.assessedAt,
    historical,
    historical_review_required:reviewReasons.length>0,
    historical_review_reasons:Object.freeze([...new Set(reviewReasons)].sort()),
    current:Object.freeze({
      support_status:support,
      charter_changed:currentCharter===null?null:currentCharter!==input.historicalInput.admission.charter_digest_at_recording,
      parties:Object.freeze(rows)
    }),
    input_digest:digestObject(input),
    requires_external_evidence_verification:true,
    evidence_verification_effect:'none',
    authority_effect:'none',governance_effect:'none',enforcement_effect:'none',
    execution_effect:'none',payment_effect:'none',settlement_effect:'none',
    network_effect:'none',runtime_activation:false
  };
  return Object.freeze({...result,status_digest:digestObject(result)});
}

function statusSupport(status,reasons){
  return Object.freeze({status,reasons:Object.freeze([...new Set(reasons)].sort())});
}

function statusSetDigest(value,key){
  if(!Array.isArray(value)||value.length>64){
    throw new ValidationError('Current agreement immutable evidence must contain at most 64 records');
  }
  for(const record of value){
    if(!record||typeof record!=='object'||Array.isArray(record)){
      throw new ValidationError('Current agreement immutable evidence record is invalid');
    }
    id(record[key],'Current agreement immutable evidence key');
  }
  return digestObject([...value].sort((left,right)=>left[key]<right[key]?-1:left[key]>right[key]?1:0));
}

function validateCurrentSnapshotEvidence(value){
  exactObject(value,'Current Circle snapshot',[
    'evidence_ref','evidence_digest','observed_at','circle_id','package_digest','charter_digest'
  ]);
  id(value.evidence_ref,'Current Circle snapshot evidence_ref');
  digest(value.evidence_digest,'Current Circle snapshot evidence_digest');
  canonicalDate(value.observed_at,'Current Circle snapshot observed_at');
  id(value.circle_id,'Current Circle snapshot circle_id');
  digest(value.package_digest,'Current Circle snapshot package_digest');
  digest(value.charter_digest,'Current Circle snapshot charter_digest');
}

function exactObject(value,label,fields){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(label+' must be an object');
  const actual=Object.keys(value).sort().join(',');
  if(actual!==[...fields].sort().join(','))throw new ValidationError(label+' fields are invalid');
}
function id(value,label){
  if(typeof value!=='string'||!ID.test(value))throw new ValidationError(label+' is invalid');
}
function digest(value,label){
  if(typeof value!=='string'||!DIGEST.test(value))throw new ValidationError(label+' must be a lowercase sha256 digest');
}
function canonicalDate(value,label){
  if(typeof value!=='string'||value.length!==24)throw new ValidationError(label+' must be a canonical UTC timestamp');
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString()!==value)throw new ValidationError(label+' must be a canonical UTC timestamp');
  return parsed.getTime();
}

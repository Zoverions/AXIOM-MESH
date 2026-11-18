import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  assessAgreementEvidence,
  consentGrantStatementDigest,
  deriveAcceptanceId,
  deriveAgreementId
} from '../src/lib/agreement-record.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_EXIT_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_SCHEMA,
  validateCircleCorePackage
} from '../src/lib/circle-core.mjs';
import { circleMembershipAssuranceDigest } from '../src/lib/circle-membership-assurance.mjs';
import {
  assessCircleCommitmentAdmission,
  circleMembershipContextDigest,
  deriveCircleCommitmentAdmissionId,
  validateCircleCommitmentAdmission
} from '../src/lib/circle-commitment-admission.mjs';

const BODY='a'.repeat(64);

function agreement(){
  const value={
    schema:'axiom-agreement-record.v0',version:0,status:'inert-commitment-evidence',
    agreement_id:'agreement:'+'0'.repeat(64),
    parties:['human.alice','human.bob'],
    body_digest:BODY,
    recorded_at:'2026-09-24T12:00:00.000Z',
    context_tags:['circle.team'],
    supersedes:[],
    acceptance_policy:{
      mechanism:'grid-consent-record',
      controller:'service.agreement-recorder',
      purpose:'agreement.acceptance.v0',
      required_scope:'agreement-body:'+BODY+':accept'
    },
    contains_private_body:false,
    authority_effect:'none',enforcement_effect:'none',legal_validity_claimed:false,
    payment_effect:'none',settlement_effect:'none',network_effect:'none',runtime_activation:false
  };
  value.agreement_id=deriveAgreementId(value);
  return value;
}

function consentGrant(principal,index){
  return {
    consent_id:'consent.party.'+index,
    subject:principal,
    controller:'service.agreement-recorder',
    purpose:'agreement.acceptance.v0',
    scopes:['agreement-body:'+BODY+':accept'],
    expires_at:'2026-10-24T12:00:00.000Z',
    created_at:'2026-09-24T11:50:00.000Z',
    evidence_ref:'event:consent-'+index,
    evidence_digest:String(index).repeat(64)
  };
}

function acceptance(a,grant,index){
  const value={
    schema:'axiom-agreement-acceptance-evidence.v0',version:0,status:'inert-acceptance-evidence',
    acceptance_id:'acceptance:'+'0'.repeat(64),
    agreement_id:a.agreement_id,body_digest:a.body_digest,principal_id:grant.subject,
    consent_id:grant.consent_id,consent_grant_statement_digest:consentGrantStatementDigest(grant),
    consent_grant_evidence_ref:grant.evidence_ref,consent_grant_evidence_digest:grant.evidence_digest,
    observed_at:'2026-09-24T11:55:00.000Z',evidence_refs:['evidence:acceptance-'+index],
    authority_effect:'none',enforcement_effect:'none',consent_effect:'none',
    network_effect:'none',runtime_activation:false
  };
  value.acceptance_id=deriveAcceptanceId(value);
  return value;
}

function currentConsent(grant,recordOverrides={}){
  return {
    observed_at:'2026-09-24T12:30:00.000Z',
    evidence_ref:'snapshot:'+grant.consent_id,
    evidence_digest:'e'.repeat(64),
    record:{
      consent_id:grant.consent_id,subject:grant.subject,controller:grant.controller,
      purpose:grant.purpose,scopes_json:[...grant.scopes],expires_at:grant.expires_at,
      status:'active',created_at:grant.created_at,revoked_at:null,...recordOverrides
    }
  };
}

function circleFixture(){
  const circle={
    schema:CIRCLE_SCHEMA,circle_id:'circle.team.1',name:'Team One',
    purpose:'Coordinate shared work.',created_by:'human.owner',
    created_at:'2026-09-20T12:00:00.000Z',trust_anchor_id:'anchor.team.1',
    participation_model:'voluntary',member_state_ownership:'independent-node',
    policy_floor:'raise-only',authority_effect:'none',network_effect:'none',runtime_activation:false
  };
  const charter={
    schema:CIRCLE_CHARTER_SCHEMA,circle_id:circle.circle_id,version:1,
    effective_from:'2026-09-20T12:00:00.000Z',supersedes_digest:null,
    roles:[{
      role_id:'member',label:'Member',
      declared_modes:['propose','deliberate','evidence','observe'],
      execution_authority:false
    }],
    decision_rule:{quorum_basis_points:5000,approval_basis_points:6000,abstention_counts_toward_quorum:true},
    appeal_enabled:true,member_exit_enabled:true,execution_authority:false,authority_effect:'none'
  };
  const charterDigest=digestObject(charter);
  const invitations=[];
  const memberships=[];
  for(const [index,principal] of ['human.alice','human.bob'].entries()){
    const invitation={
      schema:CIRCLE_INVITATION_SCHEMA,invitation_id:'invite.'+(index+1),circle_id:circle.circle_id,
      invited_principal:principal,membership_class:'member',role_ids:['member'],
      issued_by:'human.owner',issued_at:'2026-09-20T12:01:00.000Z',
      expires_at:'2026-09-27T12:01:00.000Z',charter_digest:charterDigest,
      one_use:true,authority_effect:'none'
    };
    invitations.push(invitation);
    memberships.push({
      schema:CIRCLE_MEMBERSHIP_SCHEMA,membership_id:'membership.'+(index+1),
      circle_id:circle.circle_id,invitation_id:invitation.invitation_id,
      principal_id:principal,role_ids:['member'],
      accepted_at:'2026-09-20T12:02:00.000Z',status:'active',
      status_effective_at:'2026-09-20T12:02:00.000Z',
      member_state_ownership:'independent-node',disclosure_profile:'selective',
      authority_effect:'none',network_effect:'none'
    });
  }
  const packageDocument={
    schema:CIRCLE_CORE_PACKAGE_SCHEMA,version:0,status:'inert-contract-laboratory',
    circle,charter,invitations,memberships,proposals:[],tasks:[],decisions:[],
    appeals:[],exits:[],exports:[],authority_effect:'none',network_effect:'none',
    runtime_activation:false
  };
  return {packageDocument,charterDigest};
}

function membershipEvidence(packageDocument,charterDigest,membership){
  const assurance={
    schema:'axiom-circle-membership-assurance.v0',version:0,status:'inert-assurance-laboratory',
    assurance_id:'assurance.'+membership.principal_id,
    circle_id:packageDocument.circle.circle_id,membership_id:membership.membership_id,
    principal_id:membership.principal_id,membership_digest:digestObject(membership),
    charter_digest:charterDigest,role_ids:['member'],
    device_policy:{mode:'optional',device_refs:[]},required_consent_receipt_refs:[],
    evidence_refs:['evidence:'+membership.membership_id],
    valid_from:membership.accepted_at,expires_at:'2026-10-20T12:02:00.000Z',
    contains_secret_material:false,authority_effect:'none',governance_effect:'none',
    execution_effect:'none',network_effect:'none',runtime_activation:false
  };
  const current={
    assessed_at:'2026-09-24T12:00:00.000Z',
    principal_id:membership.principal_id,presented_device_ref:null,
    verified_current_device_refs:[],verified_current_consent_receipt_refs:[]
  };
  return {
    principal_id:membership.principal_id,
    assurance,
    current,
    context_evidence_ref:'snapshot:membership-'+membership.membership_id,
    context_evidence_digest:'f'.repeat(64)
  };
}

function fixture(){
  const a=agreement();
  const ga=consentGrant('human.alice',1);
  const gb=consentGrant('human.bob',2);
  const agreementEvidenceInput={
    agreement:a,
    acceptances:[acceptance(a,ga,1),acceptance(a,gb,2)],
    consentGrantStatements:[ga,gb],
    currentConsentObservations:[currentConsent(ga),currentConsent(gb)],
    assessedAt:'2026-09-24T12:30:00.000Z'
  };
  assert.equal(assessAgreementEvidence(agreementEvidenceInput).recorded_commitment_valid,true);

  const {packageDocument,charterDigest}=circleFixture();
  const partyMembershipEvidence=packageDocument.memberships
    .map(membership=>membershipEvidence(packageDocument,charterDigest,membership));
  const packageResult=validateCircleCorePackage(packageDocument);
  const partyBindings=partyMembershipEvidence.map(item=>({
    principal_id:item.principal_id,
    membership_assurance_digest:circleMembershipAssuranceDigest(item.assurance),
    membership_context_digest:circleMembershipContextDigest(item.current),
    membership_context_evidence_ref:item.context_evidence_ref,
    membership_context_evidence_digest:item.context_evidence_digest
  })).sort((x,y)=>x.principal_id.localeCompare(y.principal_id));

  const admission={
    schema:'axiom-circle-commitment-admission.v0',version:0,
    status:'inert-circle-commitment-admission',
    admission_id:'circle-commitment:'+'0'.repeat(64),
    circle_id:packageDocument.circle.circle_id,
    charter_digest_at_recording:charterDigest,
    agreement_id:a.agreement_id,
    agreement_digest:digestObject(a),
    historical_circle_package_digest:packageResult.package_digest,
    historical_circle_snapshot_evidence_ref:'snapshot:circle-team-1',
    historical_circle_snapshot_evidence_digest:'d'.repeat(64),
    recorded_at:a.recorded_at,
    party_bindings:partyBindings,
    authority_effect:'none',governance_effect:'none',enforcement_effect:'none',
    execution_effect:'none',payment_effect:'none',settlement_effect:'none',
    network_effect:'none',runtime_activation:false
  };
  admission.admission_id=deriveCircleCommitmentAdmissionId(admission);
  const historicalCircleSnapshotEvidence={
    evidence_ref:admission.historical_circle_snapshot_evidence_ref,
    evidence_digest:admission.historical_circle_snapshot_evidence_digest,
    observed_at:a.recorded_at,
    circle_id:packageDocument.circle.circle_id,
    package_digest:packageResult.package_digest,
    charter_digest:charterDigest
  };
  return {
    admission,
    agreementEvidenceInput,
    historicalCirclePackage:packageDocument,
    historicalCircleSnapshotEvidence,
    partyMembershipEvidence
  };
}

test('valid historical Circle commitment admission remains evidence only',()=>{
  const f=fixture();
  assert.equal(validateCircleCommitmentAdmission(f.admission).valid,true);
  const result=assessCircleCommitmentAdmission(f);
  assert.equal(result.historical_circle_commitment_admissible,true);
  assert.deepEqual(result.reasons,[]);
  assert.equal(result.requires_external_historical_circle_snapshot_verification,true);
  assert.equal(result.historical_snapshot_verification_effect,'none');
  assert.equal(result.requires_external_agreement_evidence_verification,true);
  assert.equal(result.authority_effect,'none');
  assert.equal(result.governance_effect,'none');
  assert.equal(result.enforcement_effect,'none');
  assert.equal(result.payment_effect,'none');
  assert.equal(result.settlement_effect,'none');
});

test('historical membership evidence must be at the exact agreement timestamp',()=>{
  const f=fixture();
  f.partyMembershipEvidence[0].current.assessed_at='2026-09-24T12:01:00.000Z';
  const result=assessCircleCommitmentAdmission(f);
  assert.equal(result.historical_circle_commitment_admissible,false);
  assert.ok(result.reasons.includes('human.alice:historical-membership-time-mismatch'));
  assert.ok(result.reasons.includes('human.alice:membership-context-digest-mismatch'));
});

test('exit effective before recording invalidates historical Circle participation',()=>{
  const f=fixture();
  const membership=f.historicalCirclePackage.memberships[0];
  f.historicalCirclePackage.exits.push({
    schema:CIRCLE_EXIT_SCHEMA,exit_id:'exit.alice',circle_id:f.historicalCirclePackage.circle.circle_id,
    membership_id:membership.membership_id,principal_id:membership.principal_id,
    initiated_by:membership.principal_id,kind:'voluntary-exit',
    effective_at:'2026-09-24T11:59:00.000Z',reason_code:'member-choice',
    future_obligation_effect:'ends-except-explicit-post-exit-rules',
    history_rewrite:false,authority_effect:'none'
  });
  const historical=validateCircleCorePackage(f.historicalCirclePackage);
  f.admission.historical_circle_package_digest=historical.package_digest;
  f.historicalCircleSnapshotEvidence.package_digest=historical.package_digest;
  f.admission.admission_id=deriveCircleCommitmentAdmissionId(f.admission);
  const result=assessCircleCommitmentAdmission(f);
  assert.equal(result.historical_circle_commitment_admissible,false);
  assert.ok(result.reasons.some(reason=>reason.includes('effective-exit:voluntary-exit')));
});

test('agreement acceptance later revoked stays historically valid for Circle admission',()=>{
  const f=fixture();
  f.agreementEvidenceInput.currentConsentObservations[0].record.status='revoked';
  f.agreementEvidenceInput.currentConsentObservations[0].record.revoked_at='2026-09-24T12:15:00.000Z';
  const agreementAssessment=assessAgreementEvidence(f.agreementEvidenceInput);
  assert.equal(agreementAssessment.recorded_commitment_valid,true);
  assert.equal(agreementAssessment.all_acceptances_current,false);
  assert.equal(assessCircleCommitmentAdmission(f).historical_circle_commitment_admissible,true);
});

test('wrong Circle charter or historical package binding fails closed',()=>{
  const charter=fixture();
  charter.admission.charter_digest_at_recording='c'.repeat(64);
  charter.admission.admission_id=deriveCircleCommitmentAdmissionId(charter.admission);
  assert.ok(
    assessCircleCommitmentAdmission(charter).reasons.includes('historical-charter-digest-mismatch')
  );

  const pkg=fixture();
  pkg.admission.historical_circle_package_digest='d'.repeat(64);
  pkg.admission.admission_id=deriveCircleCommitmentAdmissionId(pkg.admission);
  assert.ok(
    assessCircleCommitmentAdmission(pkg).reasons.includes('historical-circle-package-digest-mismatch')
  );
});

test('agreement parties and Circle party bindings must match exactly',()=>{
  const f=fixture();
  f.admission.party_bindings=[
    f.admission.party_bindings[0],
    {
      ...f.admission.party_bindings[1],
      principal_id:'human.mallory'
    }
  ].sort((a,b)=>a.principal_id.localeCompare(b.principal_id));
  f.admission.admission_id=deriveCircleCommitmentAdmissionId(f.admission);
  const result=assessCircleCommitmentAdmission(f);
  assert.equal(result.historical_circle_commitment_admissible,false);
  assert.ok(result.reasons.includes('party-binding-set-mismatch'));
});

test('agreement evidence failure propagates without becoming Circle authority',()=>{
  const f=fixture();
  f.agreementEvidenceInput.acceptances.pop();
  const result=assessCircleCommitmentAdmission(f);
  assert.equal(result.historical_circle_commitment_admissible,false);
  assert.ok(result.reasons.some(reason=>reason.startsWith('agreement:acceptance-missing:')));
  assert.equal(result.authority_effect,'none');
});

test('Circle commitment admission identity is content-addressed and fields are closed',()=>{
  const f=fixture();
  f.admission.agreement_digest='f'.repeat(64);
  assert.throws(()=>validateCircleCommitmentAdmission(f.admission),/admission_id does not match/);

  const extra=fixture();
  extra.admission.execution_authority=true;
  assert.throws(()=>validateCircleCommitmentAdmission(extra.admission),/fields are invalid/);
});

test('historical membership context evidence is bound exactly',()=>{
  const f=fixture();
  f.partyMembershipEvidence[0].context_evidence_digest='c'.repeat(64);
  const result=assessCircleCommitmentAdmission(f);
  assert.equal(result.historical_circle_commitment_admissible,false);
  assert.ok(result.reasons.includes('human.alice:membership-context-evidence-digest-mismatch'));
});

test('historical Circle snapshot evidence must bind exact package and recording time',()=>{
  const digestMismatch=fixture();
  digestMismatch.historicalCircleSnapshotEvidence.package_digest='c'.repeat(64);
  const first=assessCircleCommitmentAdmission(digestMismatch);
  assert.equal(first.historical_circle_commitment_admissible,false);
  assert.ok(first.reasons.includes('historical-snapshot-package-digest-mismatch'));

  const timeMismatch=fixture();
  timeMismatch.historicalCircleSnapshotEvidence.observed_at='2026-09-24T12:01:00.000Z';
  const second=assessCircleCommitmentAdmission(timeMismatch);
  assert.equal(second.historical_circle_commitment_admissible,false);
  assert.ok(second.reasons.includes('historical-snapshot-time-mismatch'));
});

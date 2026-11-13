import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_SCHEMA,
  validateCircleCorePackage
} from '../src/lib/circle-core.mjs';
import { circleMembershipAssuranceDigest } from '../src/lib/circle-membership-assurance.mjs';
import { INFORMATION_RIGHTS_SCHEMA } from '../src/domain/information-rights.mjs';
import { INFORMATION_ACCESS_DECISION_SCHEMA } from '../src/domain/information-access-decision.mjs';
import {
  assessCircleSelectiveDisclosure,
  circleDisclosureConsentMatrixDigest,
  circleDisclosureConsentScope,
  circleSelectiveDisclosureEvidenceDigest,
  deriveCircleSelectiveDisclosureEvidenceId,
  validateCircleSelectiveDisclosureEvidence
} from '../src/lib/circle-selective-disclosure-consent.mjs';

const ASSESSED_AT='2026-09-25T12:00:00.000Z';
const OBJECT_DIGEST='a'.repeat(64);

function circleFixture() {
  const circle={
    schema:CIRCLE_SCHEMA,
    circle_id:'circle.team.1',
    name:'Team One',
    purpose:'Coordinate a bounded shared research project.',
    created_by:'human.owner',
    created_at:'2026-09-20T12:00:00.000Z',
    trust_anchor_id:'anchor.team.1',
    participation_model:'voluntary',
    member_state_ownership:'independent-node',
    policy_floor:'raise-only',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  const charter={
    schema:CIRCLE_CHARTER_SCHEMA,
    circle_id:circle.circle_id,
    version:1,
    effective_from:'2026-09-20T12:00:00.000Z',
    supersedes_digest:null,
    roles:[{
      role_id:'member',
      label:'Member',
      declared_modes:['propose','deliberate','evidence','observe'],
      execution_authority:false
    }],
    decision_rule:{
      quorum_basis_points:5000,
      approval_basis_points:6000,
      abstention_counts_toward_quorum:true
    },
    appeal_enabled:true,
    member_exit_enabled:true,
    execution_authority:false,
    authority_effect:'none'
  };
  const charterDigest=digestObject(charter);
  const invitation={
    schema:CIRCLE_INVITATION_SCHEMA,
    invitation_id:'invite.owner.1',
    circle_id:circle.circle_id,
    invited_principal:'human.owner',
    membership_class:'member',
    role_ids:['member'],
    issued_by:'human.owner',
    issued_at:'2026-09-20T12:01:00.000Z',
    expires_at:'2026-09-27T12:01:00.000Z',
    charter_digest:charterDigest,
    one_use:true,
    authority_effect:'none'
  };
  const membership={
    schema:CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id:'membership.owner.1',
    circle_id:circle.circle_id,
    invitation_id:invitation.invitation_id,
    principal_id:'human.owner',
    role_ids:['member'],
    accepted_at:'2026-09-20T12:02:00.000Z',
    status:'active',
    status_effective_at:'2026-09-20T12:02:00.000Z',
    member_state_ownership:'independent-node',
    disclosure_profile:'selective',
    authority_effect:'none',
    network_effect:'none'
  };
  const packageDocument={
    schema:CIRCLE_CORE_PACKAGE_SCHEMA,
    version:0,
    status:'inert-contract-laboratory',
    circle,
    charter,
    invitations:[invitation],
    memberships:[membership],
    proposals:[],
    tasks:[],
    decisions:[],
    appeals:[],
    exits:[],
    exports:[],
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  const packageResult=validateCircleCorePackage(packageDocument);
  const membershipAssurance={
    schema:'axiom-circle-membership-assurance.v0',
    version:0,
    status:'inert-assurance-laboratory',
    assurance_id:'membership-assurance.owner.1',
    circle_id:circle.circle_id,
    membership_id:membership.membership_id,
    principal_id:membership.principal_id,
    membership_digest:digestObject(membership),
    charter_digest:packageResult.charter_digest,
    role_ids:['member'],
    device_policy:{mode:'optional',device_refs:[]},
    required_consent_receipt_refs:[],
    evidence_refs:['evidence:membership.owner.1'],
    valid_from:'2026-09-20T12:02:00.000Z',
    expires_at:'2026-10-20T12:02:00.000Z',
    contains_secret_material:false,
    authority_effect:'none',
    governance_effect:'none',
    execution_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  const membershipCurrent={
    assessed_at:ASSESSED_AT,
    principal_id:'human.owner',
    presented_device_ref:null,
    verified_current_device_refs:[],
    verified_current_consent_receipt_refs:[]
  };
  return {packageDocument,packageResult,membershipAssurance,membershipCurrent};
}

function rightsFixture({
  subjects=['human.subject-a'],
  controllers=['human.controller-a'],
  recipients=['human.recipient']
}={}) {
  return {
    schema:INFORMATION_RIGHTS_SCHEMA,
    object_ref:'artifact:shared.1',
    information_class:'research-note',
    sensitivity_class:'member-private',
    relationships:{
      subjects,
      originators:['human.owner'],
      custodians:['circle.team.1'],
      controllers,
      affected_parties:[],
      beneficiaries:[],
      permitted_recipients:recipients,
      reviewers:[],
      auditors:[],
      decision_users:[],
      challengers:subjects,
      disclosure_authorities:['policy:circle-disclosure'],
      retention_authorities:['policy:circle-retention']
    },
    authority_basis:['policy:circle-disclosure'],
    allowed_purposes:['research-share'],
    forbidden_purposes:['advertising'],
    policy_refs:{
      access:['policy:circle-access'],
      disclosure:['policy:circle-disclosure'],
      retention:['policy:circle-retention'],
      challenge:['policy:circle-challenge'],
      correction:[],
      export:['policy:circle-export'],
      deletion:[]
    },
    projection_profiles:['projection:research-summary'],
    jurisdiction_context:[],
    provenance_refs:['evidence:artifact.1'],
    evidence_refs:[],
    state:{retention:'active',challenge:'none',supersession:'current'},
    created_at:'2026-09-24T09:00:00.000Z',
    reviewed_at:'2026-09-25T11:30:00.000Z'
  };
}

function accessDecision(request) {
  return {
    schema:INFORMATION_ACCESS_DECISION_SCHEMA,
    decision_id:'access-decision:circle-share.1',
    requester:request.recipient_principal_id,
    object_ref:request.object_ref,
    purpose:request.purpose,
    right:request.right,
    decision:'allow',
    authority_ref:'policy:circle-disclosure',
    object_digest:request.object_digest,
    issued_at:'2026-09-25T11:50:00.000Z',
    expires_at:'2026-09-25T12:10:00.000Z',
    verifier_ref:'verifier:circle-disclosure-policy',
    verifier_version:'1.0.0',
    reason_codes:['exact-policy-match']
  };
}

function grant({subject,controller,purpose,scope,index}) {
  return {
    consent_id:'consent.share.'+index,
    subject,
    controller,
    purpose,
    scopes:[scope],
    expires_at:'2026-09-25T13:00:00.000Z',
    created_at:'2026-09-25T11:40:00.000Z',
    evidence_ref:'event:consent-granted-'+index,
    evidence_digest:String(index).repeat(64)
  };
}

function currentObservation(grantStatement,index) {
  return {
    observed_at:ASSESSED_AT,
    evidence_ref:'snapshot:consent-'+index,
    evidence_digest:'e'.repeat(64),
    record:{
      consent_id:grantStatement.consent_id,
      subject:grantStatement.subject,
      controller:grantStatement.controller,
      purpose:grantStatement.purpose,
      scopes_json:[...grantStatement.scopes],
      expires_at:grantStatement.expires_at,
      status:'active',
      created_at:grantStatement.created_at,
      revoked_at:null
    }
  };
}

function fixture(options={}) {
  const circle=circleFixture();
  const rights=rightsFixture(options.rights);
  const request={
    requester_principal_id:'human.owner',
    recipient_principal_id:'human.recipient',
    object_ref:rights.object_ref,
    object_digest:OBJECT_DIGEST,
    purpose:'research-share',
    right:'receive-projection',
    projection_profile_ref:'projection:research-summary',
    assessed_at:ASSESSED_AT
  };
  const scope=circleDisclosureConsentScope({
    circle_id:circle.packageDocument.circle.circle_id,
    object_ref:request.object_ref,
    object_digest:request.object_digest,
    recipient_principal_id:request.recipient_principal_id,
    purpose:request.purpose,
    right:request.right,
    projection_profile_ref:request.projection_profile_ref
  });
  const consentPairs=[];
  let index=1;
  for(const subject of rights.relationships.subjects){
    for(const controller of rights.relationships.controllers){
      const grantStatement=grant({
        subject,controller,purpose:request.purpose,scope,index
      });
      consentPairs.push({
        subject,
        controller,
        grant:grantStatement,
        current:currentObservation(grantStatement,index)
      });
      index+=1;
    }
  }
  const decision=accessDecision(request);
  const decisionVerification={
    decision_digest:digestObject(decision),
    evidence_ref:'evidence:access-decision.1',
    evidence_digest:'d'.repeat(64),
    observed_at:ASSESSED_AT
  };
  const snapshotEvidence={
    evidence_ref:'snapshot:circle-disclosure.1',
    evidence_digest:'c'.repeat(64),
    observed_at:ASSESSED_AT,
    circle_id:circle.packageDocument.circle.circle_id,
    package_digest:circle.packageResult.package_digest,
    charter_digest:circle.packageResult.charter_digest
  };
  const evidence={
    schema:'axiom-circle-selective-disclosure-consent-evidence.v0',
    version:0,
    status:'inert-disclosure-admission',
    evidence_id:'circle-disclosure-consent:'+'0'.repeat(64),
    circle_id:circle.packageDocument.circle.circle_id,
    requester_principal_id:request.requester_principal_id,
    membership_assurance_digest:circleMembershipAssuranceDigest(circle.membershipAssurance),
    membership_context_digest:digestObject(circle.membershipCurrent),
    circle_package_digest:circle.packageResult.package_digest,
    circle_snapshot_evidence_ref:snapshotEvidence.evidence_ref,
    circle_snapshot_evidence_digest:snapshotEvidence.evidence_digest,
    object_ref:request.object_ref,
    object_digest:request.object_digest,
    information_rights_digest:digestObject(rights),
    recipient_principal_id:request.recipient_principal_id,
    purpose:request.purpose,
    right:request.right,
    projection_profile_ref:request.projection_profile_ref,
    access_decision_digest:digestObject(decision),
    access_decision_verification_ref:decisionVerification.evidence_ref,
    access_decision_verification_digest:decisionVerification.evidence_digest,
    consent_scope:scope,
    consent_matrix_digest:circleDisclosureConsentMatrixDigest(consentPairs),
    assessed_at:ASSESSED_AT,
    requires_external_snapshot_verification:true,
    requires_external_membership_evidence_verification:true,
    requires_external_access_decision_verification:true,
    requires_external_consent_evidence_verification:true,
    creates_disclosure:false,
    creates_export_bundle:false,
    creates_grant:false,
    authority_effect:'none',
    governance_effect:'none',
    disclosure_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  evidence.evidence_id=deriveCircleSelectiveDisclosureEvidenceId(evidence);
  return {
    packageDocument:circle.packageDocument,
    membershipAssurance:circle.membershipAssurance,
    membershipCurrent:circle.membershipCurrent,
    rightsEnvelope:rights,
    accessDecision:decision,
    accessDecisionVerification:decisionVerification,
    consentPairs,
    snapshotEvidence,
    evidence
  };
}

function assess(f){return assessCircleSelectiveDisclosure(f);}

function refreshEvidence(f) {
  f.evidence.membership_assurance_digest=circleMembershipAssuranceDigest(f.membershipAssurance);
  f.evidence.membership_context_digest=digestObject(f.membershipCurrent);
  f.evidence.circle_package_digest=validateCircleCorePackage(f.packageDocument).package_digest;
  f.snapshotEvidence.package_digest=f.evidence.circle_package_digest;
  f.snapshotEvidence.charter_digest=validateCircleCorePackage(f.packageDocument).charter_digest;
  f.evidence.information_rights_digest=digestObject(f.rightsEnvelope);
  f.evidence.access_decision_digest=digestObject(f.accessDecision);
  f.accessDecisionVerification.decision_digest=f.evidence.access_decision_digest;
  f.evidence.consent_matrix_digest=circleDisclosureConsentMatrixDigest(f.consentPairs);
  f.evidence.evidence_id=deriveCircleSelectiveDisclosureEvidenceId(f.evidence);
}

test('valid Circle disclosure evidence requires both recipient access and complete subject-controller consent',()=>{
  const f=fixture();
  const validated=validateCircleSelectiveDisclosureEvidence(f.evidence);
  assert.equal(validated.evidence_digest,circleSelectiveDisclosureEvidenceDigest(f.evidence));
  const result=assess(f);
  assert.equal(result.eligible_for_disclosure_review,true);
  assert.deepEqual(result.reasons,[]);
  assert.equal(result.required_consent_pairs,1);
  assert.equal(result.satisfied_consent_pairs,1);
  assert.equal(result.requires_external_snapshot_verification,true);
  assert.equal(result.requires_external_membership_evidence_verification,true);
  assert.equal(result.requires_external_access_decision_verification,true);
  assert.equal(result.requires_external_consent_evidence_verification,true);
  assert.equal(result.creates_disclosure,false);
  assert.equal(result.creates_export_bundle,false);
  assert.equal(result.creates_grant,false);
  assert.equal(result.authority_effect,'none');
  assert.equal(result.disclosure_effect,'none');
  assert.equal(result.network_effect,'none');
  assert.equal(result.runtime_activation,false);
});

test('recipient access decision cannot substitute for missing subject-controller consent',()=>{
  const f=fixture();
  f.consentPairs=[];
  refreshEvidence(f);
  const result=assess(f);
  assert.equal(result.eligible_for_disclosure_review,false);
  assert.ok(result.reasons.includes('consent-pair-missing:human.subject-a|human.controller-a'));
});

test('complete Cartesian subject-controller consent matrix is required',()=>{
  const f=fixture({rights:{
    subjects:['human.subject-a','human.subject-b'],
    controllers:['human.controller-a','human.controller-b']
  }});
  assert.equal(f.consentPairs.length,4);
  f.consentPairs.pop();
  refreshEvidence(f);
  const result=assess(f);
  assert.equal(result.eligible_for_disclosure_review,false);
  assert.equal(result.required_consent_pairs,4);
  assert.equal(result.satisfied_consent_pairs,3);
  assert.ok(result.reasons.some(reason=>reason.startsWith('consent-pair-missing:')));
});

test('extra or duplicate consent evidence is rejected instead of broadening the matrix',()=>{
  const extra=fixture();
  const grantStatement=grant({
    subject:'human.outsider',controller:'human.controller-a',
    purpose:'research-share',scope:extra.evidence.consent_scope,index:9
  });
  extra.consentPairs.push({
    subject:'human.outsider',
    controller:'human.controller-a',
    grant:grantStatement,
    current:currentObservation(grantStatement,9)
  });
  refreshEvidence(extra);
  assert.ok(assess(extra).reasons.includes('unexpected-consent-pair:human.outsider|human.controller-a'));

  const duplicate=fixture();
  duplicate.consentPairs.push(structuredClone(duplicate.consentPairs[0]));
  assert.throws(()=>circleDisclosureConsentMatrixDigest(duplicate.consentPairs),/duplicate consent pair/i);
});

test('purpose recipient and disclosure policy must be compatible with information rights',()=>{
  const purpose=fixture();
  purpose.evidence.purpose='advertising';
  purpose.accessDecision.purpose='advertising';
  purpose.evidence.access_decision_digest=digestObject(purpose.accessDecision);
  purpose.accessDecisionVerification.decision_digest=purpose.evidence.access_decision_digest;
  purpose.evidence.evidence_id=deriveCircleSelectiveDisclosureEvidenceId(purpose.evidence);
  const purposeResult=assess(purpose);
  assert.ok(purposeResult.reasons.includes('purpose-not-allowed'));
  assert.ok(purposeResult.reasons.includes('purpose-forbidden'));

  const recipient=fixture();
  recipient.rightsEnvelope.relationships.permitted_recipients=[];
  refreshEvidence(recipient);
  assert.ok(assess(recipient).reasons.includes('recipient-not-permitted'));

  const policy=fixture();
  policy.accessDecision.authority_ref='policy:other';
  refreshEvidence(policy);
  assert.ok(assess(policy).reasons.includes('access-authority-not-declared-for-disclosure'));
});

test('access decision must be exact active allow evidence for the recipient',()=>{
  const denied=fixture();
  denied.accessDecision.decision='deny';
  refreshEvidence(denied);
  assert.ok(assess(denied).reasons.includes('access-decision-not-active-or-exact'));

  const expired=fixture();
  expired.accessDecision.expires_at=ASSESSED_AT;
  refreshEvidence(expired);
  assert.ok(assess(expired).reasons.includes('access-decision-not-active-or-exact'));

  const wrongRecipient=fixture();
  wrongRecipient.accessDecision.requester='human.attacker';
  refreshEvidence(wrongRecipient);
  assert.ok(assess(wrongRecipient).reasons.includes('access-decision-not-active-or-exact'));
});

test('access-decision verification evidence must bind exact decision and assessment time',()=>{
  const digest=fixture();
  digest.accessDecisionVerification.decision_digest='b'.repeat(64);
  assert.ok(assess(digest).reasons.includes('access-decision-verification-decision-mismatch'));

  const evidence=fixture();
  evidence.accessDecisionVerification.evidence_digest='f'.repeat(64);
  assert.ok(assess(evidence).reasons.includes('access-decision-verification-digest-mismatch'));

  const time=fixture();
  time.accessDecisionVerification.observed_at='2026-09-25T11:59:59.000Z';
  assert.ok(assess(time).reasons.includes('access-decision-verification-time-mismatch'));
});

test('projection disclosure requires an explicit allowed projection profile',()=>{
  const missing=fixture();
  missing.evidence.projection_profile_ref=null;
  missing.evidence.evidence_id=deriveCircleSelectiveDisclosureEvidenceId(missing.evidence);
  assert.ok(assess(missing).reasons.includes('projection-profile-required'));

  const unknown=fixture();
  unknown.evidence.projection_profile_ref='projection:unknown';
  unknown.evidence.evidence_id=deriveCircleSelectiveDisclosureEvidenceId(unknown.evidence);
  assert.ok(assess(unknown).reasons.includes('projection-profile-not-allowed'));

  const exportCase=fixture();
  exportCase.evidence.right='export';
  exportCase.evidence.projection_profile_ref='projection:research-summary';
  exportCase.accessDecision.right='export';
  refreshEvidence(exportCase);
  assert.ok(assess(exportCase).reasons.includes('projection-profile-not-allowed-for-export'));
});

test('consent grant must bind exact subject controller purpose and disclosure scope',()=>{
  const subject=fixture();
  subject.consentPairs[0].grant.subject='human.other';
  subject.consentPairs[0].current.record.subject='human.other';
  refreshEvidence(subject);
  assert.ok(assess(subject).reasons.includes('consent-pair-missing:human.subject-a|human.controller-a'));

  const purpose=fixture();
  purpose.consentPairs[0].grant.purpose='other-purpose';
  purpose.consentPairs[0].current.record.purpose='other-purpose';
  refreshEvidence(purpose);
  assert.ok(assess(purpose).reasons.includes('consent-purpose-mismatch:human.subject-a|human.controller-a'));

  const scope=fixture();
  scope.consentPairs[0].grant.scopes=['circle-disclosure:'+'f'.repeat(64)];
  scope.consentPairs[0].current.record.scopes_json=[...scope.consentPairs[0].grant.scopes];
  refreshEvidence(scope);
  assert.ok(assess(scope).reasons.includes('consent-scope-mismatch:human.subject-a|human.controller-a'));
});

test('revoked expired stale or grant-mismatched consent fails closed',()=>{
  const revoked=fixture();
  Object.assign(revoked.consentPairs[0].current.record,{
    status:'revoked',revoked_at:'2026-09-25T11:59:00.000Z'
  });
  refreshEvidence(revoked);
  assert.ok(assess(revoked).reasons.includes('consent-not-active:human.subject-a|human.controller-a'));

  const expired=fixture();
  expired.consentPairs[0].grant.expires_at=ASSESSED_AT;
  expired.consentPairs[0].current.record.expires_at=ASSESSED_AT;
  refreshEvidence(expired);
  assert.ok(assess(expired).reasons.includes('consent-expired:human.subject-a|human.controller-a'));

  const stale=fixture();
  stale.consentPairs[0].current.observed_at='2026-09-25T11:59:59.000Z';
  refreshEvidence(stale);
  assert.ok(assess(stale).reasons.includes('consent-observation-time-mismatch:human.subject-a|human.controller-a'));

  const mismatch=fixture();
  mismatch.consentPairs[0].current.record.controller='human.other-controller';
  refreshEvidence(mismatch);
  assert.ok(assess(mismatch).reasons.includes('consent-current-binding-mismatch:human.subject-a|human.controller-a'));
});

test('current Circle requester membership and snapshot must bind the disclosure assessment',()=>{
  const membership=fixture();
  membership.membershipCurrent.principal_id='human.attacker';
  refreshEvidence(membership);
  assert.ok(assess(membership).reasons.some(reason=>reason.startsWith('membership:')));

  const snapshot=fixture();
  snapshot.snapshotEvidence.package_digest='f'.repeat(64);
  assert.ok(assess(snapshot).reasons.includes('snapshot-package-digest-mismatch'));

  const time=fixture();
  time.snapshotEvidence.observed_at='2026-09-25T11:59:59.000Z';
  assert.ok(assess(time).reasons.includes('snapshot-time-mismatch'));
});

test('challenged superseded or deleted information is not silently disclosed',()=>{
  const challenge=fixture();
  challenge.rightsEnvelope.state.challenge='open';
  refreshEvidence(challenge);
  assert.ok(assess(challenge).reasons.includes('information-challenge-open'));

  const superseded=fixture();
  superseded.rightsEnvelope.state.supersession='superseded';
  refreshEvidence(superseded);
  assert.ok(assess(superseded).reasons.includes('information-not-current'));

  const deleted=fixture();
  deleted.rightsEnvelope.state.retention='deleted';
  refreshEvidence(deleted);
  assert.ok(assess(deleted).reasons.includes('information-not-retained'));
});

test('closed disclosure evidence cannot smuggle effects authority or raw payload',()=>{
  const extra=fixture();
  extra.evidence.payload='secret';
  assert.throws(()=>validateCircleSelectiveDisclosureEvidence(extra.evidence),/fields are invalid/);

  const effect=fixture();
  effect.evidence.creates_disclosure=true;
  assert.throws(()=>validateCircleSelectiveDisclosureEvidence(effect.evidence),/activation boundary/);
});

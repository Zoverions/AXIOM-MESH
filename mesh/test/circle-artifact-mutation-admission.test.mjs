import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { canonicalSharedArtifactDigest } from '../src/lib/canonical-shared-artifact.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_EXIT_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import { circleMembershipAssuranceDigest } from '../src/lib/circle-membership-assurance.mjs';
import {
  assessCircleArtifactMutation,
  circleArtifactMutationAdmissionDigest,
  validateCircleArtifactMutationAdmission
} from '../src/lib/circle-artifact-mutation-admission.mjs';

const REQUEST='a'.repeat(64);
const EVIDENCE='b'.repeat(64);

function contentDigest(payload){
  return digestObject({content_type:'text/plain',payload});
}
function authorization(){
  return {request_digest:REQUEST,evidence_ref:'receipt:artifact.1',evidence_digest:EVIDENCE};
}
function revision(overrides={}){
  return {
    revision_id:'rev:1',
    parents:[],
    operation:'put',
    actor_principal:'human.member',
    actor_kind:'human',
    authorization:authorization(),
    payload:'hello',
    content_digest:contentDigest('hello'),
    resolves:[],
    work_graph:null,
    occurred_at:'2026-09-24T11:00:00.000Z',
    ...overrides
  };
}

function fixture(){
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
    roles:[{role_id:'member',label:'Member',declared_modes:['propose','deliberate','evidence','observe'],execution_authority:false}],
    decision_rule:{quorum_basis_points:5000,approval_basis_points:6000,abstention_counts_toward_quorum:true},
    appeal_enabled:true,member_exit_enabled:true,execution_authority:false,authority_effect:'none'
  };
  const charterDigest=digestObject(charter);
  const invitation={
    schema:CIRCLE_INVITATION_SCHEMA,invitation_id:'invite.member.1',circle_id:circle.circle_id,
    invited_principal:'human.member',membership_class:'member',role_ids:['member'],
    issued_by:'human.owner',issued_at:'2026-09-20T12:01:00.000Z',
    expires_at:'2026-09-27T12:01:00.000Z',charter_digest:charterDigest,
    one_use:true,authority_effect:'none'
  };
  const membership={
    schema:CIRCLE_MEMBERSHIP_SCHEMA,membership_id:'membership.member.1',circle_id:circle.circle_id,
    invitation_id:invitation.invitation_id,principal_id:'human.member',role_ids:['member'],
    accepted_at:'2026-09-20T12:02:00.000Z',status:'active',
    status_effective_at:'2026-09-20T12:02:00.000Z',
    member_state_ownership:'independent-node',disclosure_profile:'selective',
    authority_effect:'none',network_effect:'none'
  };
  const packageDocument={
    schema:CIRCLE_CORE_PACKAGE_SCHEMA,version:0,status:'inert-contract-laboratory',
    circle,charter,invitations:[invitation],memberships:[membership],
    proposals:[],tasks:[],decisions:[],appeals:[],exits:[],exports:[],
    authority_effect:'none',network_effect:'none',runtime_activation:false
  };
  const membershipAssurance={
    schema:'axiom-circle-membership-assurance.v0',version:0,status:'inert-assurance-laboratory',
    assurance_id:'membership-assurance.member.1',circle_id:circle.circle_id,
    membership_id:membership.membership_id,principal_id:membership.principal_id,
    membership_digest:digestObject(membership),charter_digest:charterDigest,role_ids:['member'],
    device_policy:{mode:'optional',device_refs:[]},required_consent_receipt_refs:[],
    evidence_refs:['evidence:membership.1'],valid_from:'2026-09-20T12:02:00.000Z',
    expires_at:'2026-10-20T12:02:00.000Z',contains_secret_material:false,
    authority_effect:'none',governance_effect:'none',execution_effect:'none',
    network_effect:'none',runtime_activation:false
  };
  const membershipCurrent={
    assessed_at:'2026-09-24T12:00:00.000Z',principal_id:'human.member',
    presented_device_ref:null,verified_current_device_refs:[],
    verified_current_consent_receipt_refs:[]
  };
  const previousArtifact={
    schema:'axiom-canonical-shared-artifact.v0',version:0,status:'inert-shared-artifact-contract',
    artifact_id:'artifact:circle.1',owner_ref:'human.owner',
    authority_domain:{kind:'circle',ref:circle.circle_id},content_type:'text/plain',
    revisions:[revision()],current_heads:['rev:1'],state:'active',
    current_content_digest:contentDigest('hello'),
    sharing:{state:'private',projection_refs:[]},
    created_at:'2026-09-24T11:00:00.000Z',updated_at:'2026-09-24T11:00:00.000Z',
    authority_effect:'none',network_effect:'none',runtime_activation:false
  };
  const candidateArtifact=structuredClone(previousArtifact);
  candidateArtifact.revisions.push(revision({
    revision_id:'rev:2',parents:['rev:1'],payload:'member edit',
    content_digest:contentDigest('member edit'),occurred_at:'2026-09-24T12:00:00.000Z'
  }));
  candidateArtifact.current_heads=['rev:2'];
  candidateArtifact.current_content_digest=contentDigest('member edit');
  candidateArtifact.updated_at='2026-09-24T12:00:00.000Z';

  const admission={
    schema:'axiom-circle-artifact-mutation-admission.v0',version:0,status:'inert-admission-laboratory',
    admission_id:'artifact-admission.1',circle_id:circle.circle_id,
    artifact_id:previousArtifact.artifact_id,
    previous_artifact_digest:canonicalSharedArtifactDigest(previousArtifact),
    candidate_artifact_digest:canonicalSharedArtifactDigest(candidateArtifact),
    membership_assurance_digest:circleMembershipAssuranceDigest(membershipAssurance),
    authorization_request_digest:REQUEST,authorization_evidence_ref:'receipt:artifact.1',
    authorization_evidence_digest:EVIDENCE,requested_at:'2026-09-24T12:00:00.000Z',
    authority_effect:'none',governance_effect:'none',artifact_effect:'none',
    execution_effect:'none',network_effect:'none',runtime_activation:false
  };
  const authorizationCurrent={
    request_digest:REQUEST,evidence_ref:'receipt:artifact.1',evidence_digest:EVIDENCE,
    current:true,verified_at:'2026-09-24T11:59:00.000Z',expires_at:'2026-09-24T12:05:00.000Z'
  };
  return {packageDocument,membershipAssurance,membershipCurrent,previousArtifact,candidateArtifact,admission,authorizationCurrent};
}

function assess(f){
  return assessCircleArtifactMutation(f);
}

test('valid Circle revision admission stays evidence-only',()=>{
  const f=fixture();
  const validated=validateCircleArtifactMutationAdmission(f.admission);
  assert.equal(validated.admission_digest,circleArtifactMutationAdmissionDigest(f.admission));
  const result=assess(f);
  assert.equal(result.eligible_for_revision_admission,true);
  assert.deepEqual(result.reasons,[]);
  assert.equal(result.candidate_state,'active');
  assert.equal(result.authority_effect,'none');
  assert.equal(result.artifact_effect,'none');
  assert.equal(result.execution_effect,'none');
});

test('wrong authority domain or Circle ref is denied',()=>{
  const owner=fixture();
  owner.previousArtifact.authority_domain={kind:'owner',ref:'human.owner'};
  owner.candidateArtifact.authority_domain={kind:'owner',ref:'human.owner'};
  owner.admission.previous_artifact_digest=canonicalSharedArtifactDigest(owner.previousArtifact);
  owner.admission.candidate_artifact_digest=canonicalSharedArtifactDigest(owner.candidateArtifact);
  const ownerResult=assess(owner);
  assert.ok(ownerResult.reasons.includes('artifact-not-circle-domain'));

  const wrong=fixture();
  wrong.previousArtifact.authority_domain.ref='circle.other';
  wrong.candidateArtifact.authority_domain.ref='circle.other';
  wrong.admission.previous_artifact_digest=canonicalSharedArtifactDigest(wrong.previousArtifact);
  wrong.admission.candidate_artifact_digest=canonicalSharedArtifactDigest(wrong.candidateArtifact);
  const wrongResult=assess(wrong);
  assert.ok(wrongResult.reasons.includes('artifact-circle-mismatch'));
});

test('revision actor must be the currently assured member',()=>{
  const f=fixture();
  f.candidateArtifact.revisions[1].actor_principal='human.attacker';
  f.admission.candidate_artifact_digest=canonicalSharedArtifactDigest(f.candidateArtifact);
  const result=assess(f);
  assert.equal(result.eligible_for_revision_admission,false);
  assert.ok(result.reasons.includes('revision-actor-membership-mismatch'));
});

test('inactive or expired membership blocks new revision but preserves prior history',()=>{
  const f=fixture();
  f.packageDocument.memberships[0].status='exited';
  f.packageDocument.memberships[0].status_effective_at='2026-09-24T11:30:00.000Z';
  f.membershipAssurance.membership_digest=digestObject(f.packageDocument.memberships[0]);
  f.admission.membership_assurance_digest=circleMembershipAssuranceDigest(f.membershipAssurance);
  const result=assess(f);
  assert.equal(result.eligible_for_revision_admission,false);
  assert.ok(result.reasons.includes('membership:membership-not-active:exited'));
  assert.equal(f.previousArtifact.revisions[0].actor_principal,'human.member');
});

test('old revision mutation and owner substitution are rejected structurally',()=>{
  const history=fixture();
  history.candidateArtifact.revisions[0].payload='rewritten history';
  history.candidateArtifact.revisions[0].content_digest=contentDigest('rewritten history');
  history.admission.candidate_artifact_digest=canonicalSharedArtifactDigest(history.candidateArtifact);
  assert.throws(()=>assess(history),/prior revision 0 is immutable/);

  const owner=fixture();
  owner.candidateArtifact.owner_ref='human.attacker';
  owner.admission.candidate_artifact_digest=canonicalSharedArtifactDigest(owner.candidateArtifact);
  assert.throws(()=>assess(owner),/owner_ref is immutable/);
});

test('stale-parent concurrent edit remains visible as conflict rather than last-write-wins',()=>{
  const f=fixture();
  const concurrent=structuredClone(f.candidateArtifact);
  concurrent.revisions.push(revision({
    revision_id:'rev:3',parents:['rev:1'],payload:'concurrent stale edit',
    content_digest:contentDigest('concurrent stale edit'),occurred_at:'2026-09-24T12:01:00.000Z'
  }));
  concurrent.current_heads=['rev:2','rev:3'];
  concurrent.state='conflict';
  concurrent.current_content_digest=null;
  concurrent.updated_at='2026-09-24T12:01:00.000Z';

  // Evaluate rev:3 against the artifact state that already contains rev:2.
  const previous=structuredClone(f.candidateArtifact);
  const admission={...f.admission,
    previous_artifact_digest:canonicalSharedArtifactDigest(previous),
    candidate_artifact_digest:canonicalSharedArtifactDigest(concurrent),
    requested_at:'2026-09-24T12:01:00.000Z'
  };
  const auth={...f.authorizationCurrent,
    verified_at:'2026-09-24T12:00:30.000Z',
    expires_at:'2026-09-24T12:06:00.000Z'
  };
  const result=assessCircleArtifactMutation({
    ...f,
    membershipCurrent:{...f.membershipCurrent,assessed_at:'2026-09-24T12:01:00.000Z'},
    previousArtifact:previous,
    candidateArtifact:concurrent,
    admission,
    authorizationCurrent:auth
  });
  assert.equal(result.eligible_for_revision_admission,true);
  assert.equal(result.candidate_state,'conflict');
  assert.deepEqual(result.candidate_heads,['rev:2','rev:3']);
});

test('partial conflict resolution is rejected by canonical artifact semantics',()=>{
  const f=fixture();
  const previous=structuredClone(f.candidateArtifact);
  previous.revisions.push(revision({
    revision_id:'rev:3',parents:['rev:1'],payload:'conflicting edit',
    content_digest:contentDigest('conflicting edit'),occurred_at:'2026-09-24T12:01:00.000Z'
  }));
  previous.current_heads=['rev:2','rev:3'];
  previous.state='conflict';
  previous.current_content_digest=null;
  previous.updated_at='2026-09-24T12:01:00.000Z';

  const candidate=structuredClone(previous);
  candidate.revisions.push(revision({
    revision_id:'rev:4',parents:['rev:2'],operation:'resolve',resolves:['rev:2'],
    payload:'partial resolve',content_digest:contentDigest('partial resolve'),
    occurred_at:'2026-09-24T12:02:00.000Z'
  }));
  candidate.current_heads=['rev:3','rev:4'];
  candidate.state='conflict';
  candidate.updated_at='2026-09-24T12:02:00.000Z';
  assert.throws(()=>canonicalSharedArtifactDigest(candidate),/resolution|every current head|at least two/);
});

test('authorization evidence must exactly match and remain current',()=>{
  const mismatch=fixture();
  mismatch.authorizationCurrent.evidence_digest='c'.repeat(64);
  const mismatchResult=assess(mismatch);
  assert.ok(mismatchResult.reasons.includes('current-authorization-digest-mismatch'));

  const stale=fixture();
  stale.authorizationCurrent.current=false;
  assert.ok(assess(stale).reasons.includes('authorization-not-current'));

  const expired=fixture();
  expired.authorizationCurrent.expires_at='2026-09-24T12:00:00.000Z';
  assert.ok(assess(expired).reasons.includes('authorization-expired'));
});

test('membership assurance substitution is denied',()=>{
  const f=fixture();
  f.admission.membership_assurance_digest='d'.repeat(64);
  assert.ok(assess(f).reasons.includes('membership-assurance-digest-mismatch'));
});

test('admission time binds the exact appended revision and current artifact head',()=>{
  const mismatch=fixture();
  mismatch.admission.requested_at='2026-09-24T12:00:01.000Z';
  assert.ok(assess(mismatch).reasons.includes('revision-time-mismatch'));

  const backdated=fixture();
  backdated.admission.requested_at='2026-09-24T10:59:59.000Z';
  assert.ok(assess(backdated).reasons.includes('request-predates-artifact-head'));
  assert.ok(assess(backdated).reasons.includes('revision-time-mismatch'));
});

test('membership currentness cannot be borrowed from another assessment time',()=>{
  const future=fixture();
  future.membershipCurrent.assessed_at='2026-09-24T12:01:00.000Z';
  assert.ok(assess(future).reasons.includes('membership-assessment-time-mismatch'));

  const past=fixture();
  past.membershipCurrent.assessed_at='2026-09-24T11:59:00.000Z';
  assert.ok(assess(past).reasons.includes('membership-assessment-time-mismatch'));
});

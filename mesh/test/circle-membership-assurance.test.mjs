import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_EXIT_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  assessCircleMembership,
  circleMembershipAssuranceDigest,
  validateCircleMembershipAssurance
} from '../src/lib/circle-membership-assurance.mjs';

const NOW='2026-09-24T12:00:00.000Z';

function fixture(){
  const circle={
    schema:CIRCLE_SCHEMA,
    circle_id:'circle.team.1',
    name:'Team One',
    purpose:'Coordinate a bounded project team.',
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
    roles:[
      {
        role_id:'member',
        label:'Member',
        declared_modes:['propose','deliberate','evidence','vote','appeal','observe'],
        execution_authority:false
      },
      {
        role_id:'reviewer',
        label:'Reviewer',
        declared_modes:['evidence','review','appeal','observe'],
        execution_authority:false
      }
    ],
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
    invitation_id:'invite.member.1',
    circle_id:circle.circle_id,
    invited_principal:'human.member',
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
    membership_id:'membership.member.1',
    circle_id:circle.circle_id,
    invitation_id:invitation.invitation_id,
    principal_id:'human.member',
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
  const assurance={
    schema:'axiom-circle-membership-assurance.v0',
    version:0,
    status:'inert-assurance-laboratory',
    assurance_id:'membership-assurance.member.1',
    circle_id:circle.circle_id,
    membership_id:membership.membership_id,
    principal_id:membership.principal_id,
    membership_digest:digestObject(membership),
    charter_digest:charterDigest,
    role_ids:['member'],
    device_policy:{mode:'required',device_refs:['device.phone.1']},
    required_consent_receipt_refs:['consent.circle.1'],
    evidence_refs:['evidence:membership.1','evidence:device.1'],
    valid_from:'2026-09-20T12:02:00.000Z',
    expires_at:'2026-10-20T12:02:00.000Z',
    contains_secret_material:false,
    authority_effect:'none',
    governance_effect:'none',
    execution_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  const current={
    assessed_at:NOW,
    principal_id:'human.member',
    presented_device_ref:'device.phone.1',
    verified_current_device_refs:['device.phone.1'],
    verified_current_consent_receipt_refs:['consent.circle.1']
  };
  return {packageDocument,assurance,current};
}

test('valid membership assurance remains participation evidence, not authority',()=>{
  const {packageDocument,assurance,current}=fixture();
  const validated=validateCircleMembershipAssurance(assurance);
  assert.equal(validated.assurance_digest,circleMembershipAssuranceDigest(assurance));
  const result=assessCircleMembership(packageDocument,assurance,current);
  assert.equal(result.eligible_to_participate,true);
  assert.deepEqual(result.reasons,[]);
  assert.equal(result.evidence_inputs_verified_elsewhere,true);
  assert.equal(result.authority_effect,'none');
  assert.equal(result.governance_effect,'none');
  assert.equal(result.execution_effect,'none');
  assert.equal(result.network_effect,'none');
});

test('role escalation and membership/charter substitution fail closed',()=>{
  const role=fixture();
  role.assurance.role_ids=['member','reviewer'];
  assert.ok(assessCircleMembership(role.packageDocument,role.assurance,role.current).reasons.includes('role-set-mismatch'));

  const membership=fixture();
  membership.assurance.membership_digest='0'.repeat(64);
  assert.ok(assessCircleMembership(membership.packageDocument,membership.assurance,membership.current).reasons.includes('membership-digest-mismatch'));

  const charter=fixture();
  charter.assurance.charter_digest='1'.repeat(64);
  assert.ok(assessCircleMembership(charter.packageDocument,charter.assurance,charter.current).reasons.includes('charter-digest-mismatch'));
});

test('revoked suspended and exited membership never remains eligible',()=>{
  for(const status of ['revoked','suspended','exited']){
    const f=fixture();
    f.packageDocument.memberships[0].status=status;
    f.packageDocument.memberships[0].status_effective_at='2026-09-23T12:00:00.000Z';
    f.assurance.membership_digest=digestObject(f.packageDocument.memberships[0]);
    const result=assessCircleMembership(f.packageDocument,f.assurance,f.current);
    assert.equal(result.eligible_to_participate,false);
    assert.ok(result.reasons.includes('membership-not-active:'+status));
  }
});

test('effective exit wins over a stale active membership status',()=>{
  const f=fixture();
  f.packageDocument.exits.push({
    schema:CIRCLE_EXIT_SCHEMA,
    exit_id:'exit.member.1',
    circle_id:f.packageDocument.circle.circle_id,
    membership_id:f.packageDocument.memberships[0].membership_id,
    principal_id:f.packageDocument.memberships[0].principal_id,
    initiated_by:'human.member',
    kind:'voluntary-exit',
    effective_at:'2026-09-23T12:00:00.000Z',
    reason_code:'member-choice',
    future_obligation_effect:'ends-except-explicit-post-exit-rules',
    history_rewrite:false,
    authority_effect:'none'
  });
  const result=assessCircleMembership(f.packageDocument,f.assurance,f.current);
  assert.equal(result.eligible_to_participate,false);
  assert.ok(result.reasons.includes('effective-exit:voluntary-exit'));
});

test('cross-Circle and principal substitution fail closed',()=>{
  const cross=fixture();
  cross.assurance.circle_id='circle.other';
  const result=assessCircleMembership(cross.packageDocument,cross.assurance,cross.current);
  assert.equal(result.eligible_to_participate,false);
  assert.ok(result.reasons.includes('circle-mismatch'));

  const principal=fixture();
  principal.current.principal_id='human.attacker';
  const denied=assessCircleMembership(principal.packageDocument,principal.assurance,principal.current);
  assert.equal(denied.eligible_to_participate,false);
  assert.ok(denied.reasons.includes('principal-mismatch'));
});

test('required device must be assured and independently current',()=>{
  const missing=fixture();
  missing.current.presented_device_ref=null;
  assert.ok(assessCircleMembership(missing.packageDocument,missing.assurance,missing.current).reasons.includes('device-required'));

  const unassured=fixture();
  unassured.current.presented_device_ref='device.other';
  unassured.current.verified_current_device_refs.push('device.other');
  assert.ok(assessCircleMembership(unassured.packageDocument,unassured.assurance,unassured.current).reasons.includes('device-not-assured'));

  const removed=fixture();
  removed.current.verified_current_device_refs=[];
  assert.ok(assessCircleMembership(removed.packageDocument,removed.assurance,removed.current).reasons.includes('device-not-current'));
});

test('required consent currentness and finite assurance expiry fail closed',()=>{
  const consent=fixture();
  consent.current.verified_current_consent_receipt_refs=[];
  assert.ok(
    assessCircleMembership(consent.packageDocument,consent.assurance,consent.current)
      .reasons.includes('consent-not-current:consent.circle.1')
  );

  const expired=fixture();
  expired.assurance.expires_at='2026-09-24T12:00:00.000Z';
  assert.ok(assessCircleMembership(expired.packageDocument,expired.assurance,expired.current).reasons.includes('assurance-expired'));
});

test('optional device policy remains device-aware without requiring a device',()=>{
  const f=fixture();
  f.assurance.device_policy={mode:'optional',device_refs:['device.phone.1']};
  f.current.presented_device_ref=null;
  assert.equal(assessCircleMembership(f.packageDocument,f.assurance,f.current).eligible_to_participate,true);
});

test('future membership status or assurance is not treated as current',()=>{
  const status=fixture();
  status.packageDocument.memberships[0].status_effective_at='2026-09-25T12:00:00.000Z';
  status.assurance.membership_digest=digestObject(status.packageDocument.memberships[0]);
  assert.ok(assessCircleMembership(status.packageDocument,status.assurance,status.current).reasons.includes('membership-status-not-current'));

  const future=fixture();
  future.assurance.valid_from='2026-09-25T12:00:00.000Z';
  assert.ok(assessCircleMembership(future.packageDocument,future.assurance,future.current).reasons.includes('assurance-not-active-yet'));
});

test('assurance cannot claim a validity period before membership acceptance',()=>{
  const f=fixture();
  f.assurance.valid_from='2026-09-20T12:01:30.000Z';
  const result=assessCircleMembership(f.packageDocument,f.assurance,f.current);
  assert.equal(result.eligible_to_participate,false);
  assert.ok(result.reasons.includes('assurance-predates-membership'));
});

test('required device policy is structurally finite',()=>{
  const f=fixture();
  f.assurance.device_policy={mode:'required',device_refs:[]};
  assert.throws(()=>validateCircleMembershipAssurance(f.assurance),/needs at least one device_ref/);
});

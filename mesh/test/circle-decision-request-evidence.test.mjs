import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_APPEAL_SCHEMA,
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_DECISION_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA,
  CIRCLE_SCHEMA,
  validateCircleCorePackage
} from '../src/lib/circle-core.mjs';
import {
  assessCircleDecisionRequest,
  circleDecisionRequestEvidenceDigest,
  circleRequestBindingRef,
  deriveCircleDecisionRequestEvidenceId,
  validateCircleDecisionRequestEvidence
} from '../src/lib/circle-decision-request-evidence.mjs';

const REQUESTED_AT='2026-09-25T12:00:00.000Z';

function fixture() {
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
      declared_modes:['propose','deliberate','evidence','vote','approve','appeal','observe'],
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
  const requestDescriptor={
    resource:'resource:research-package',
    action:'research.publish',
    purpose:'circle-approved-release',
    destination:'destination:repository',
    data_classes:['member-private'],
    effect_class:'publish-external',
    consequence_class:'C2'
  };
  const proposal={
    schema:CIRCLE_PROPOSAL_SCHEMA,
    proposal_id:'proposal.publish.1',
    circle_id:circle.circle_id,
    charter_digest:charterDigest,
    proposer:'human.owner',
    title:'Request publication through ordinary AXIOM authority',
    summary:'Approve requesting publication of the exact bound research package. This is not execution authority.',
    created_at:'2026-09-24T11:00:00.000Z',
    closes_at:'2026-09-25T11:00:00.000Z',
    status:'closed',
    evidence_refs:[circleRequestBindingRef(requestDescriptor)],
    execution_effect:'none',
    authority_effect:'none'
  };
  const decision={
    schema:CIRCLE_DECISION_SCHEMA,
    decision_id:'decision.publish.1',
    circle_id:circle.circle_id,
    proposal_id:proposal.proposal_id,
    charter_digest:charterDigest,
    outcome:'accepted',
    decided_at:'2026-09-25T11:30:00.000Z',
    participant_receipts:['receipt:vote.1'],
    finality:'circle-local-accepted',
    runtime_authority:false,
    authority_effect:'none'
  };
  const packageDocument={
    schema:CIRCLE_CORE_PACKAGE_SCHEMA,
    version:0,
    status:'inert-contract-laboratory',
    circle,
    charter,
    invitations:[invitation],
    memberships:[membership],
    proposals:[proposal],
    tasks:[],
    decisions:[decision],
    appeals:[],
    exits:[],
    exports:[],
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  const packageResult=validateCircleCorePackage(packageDocument);
  const evidence={
    schema:'axiom-circle-decision-request-evidence.v0',
    version:0,
    status:'inert-request-evidence',
    evidence_id:'circle-decision-request:'+'0'.repeat(64),
    circle_id:circle.circle_id,
    proposal_id:proposal.proposal_id,
    decision_id:decision.decision_id,
    circle_package_digest:packageResult.package_digest,
    charter_digest:packageResult.charter_digest,
    proposal_digest:digestObject(proposal),
    decision_digest:digestObject(decision),
    current_snapshot_evidence_ref:'snapshot:circle-team-1',
    current_snapshot_evidence_digest:'e'.repeat(64),
    request_descriptor:requestDescriptor,
    request_digest:digestObject(requestDescriptor),
    proposal_request_binding_ref:circleRequestBindingRef(requestDescriptor),
    requested_at:REQUESTED_AT,
    ordinary_authority_path_required:true,
    creates_grant:false,
    creates_approval:false,
    creates_prepared_effect:false,
    authority_effect:'none',
    governance_effect:'none',
    execution_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  evidence.evidence_id=deriveCircleDecisionRequestEvidenceId(evidence);
  const currentSnapshotEvidence={
    evidence_ref:evidence.current_snapshot_evidence_ref,
    evidence_digest:evidence.current_snapshot_evidence_digest,
    observed_at:REQUESTED_AT,
    circle_id:circle.circle_id,
    package_digest:packageResult.package_digest,
    charter_digest:packageResult.charter_digest
  };
  return {packageDocument,evidence,currentSnapshotEvidence};
}

function refresh(f, { refreshEvidenceId=true } = {}) {
  const checked=validateCircleCorePackage(f.packageDocument);
  f.evidence.circle_package_digest=checked.package_digest;
  f.currentSnapshotEvidence.package_digest=checked.package_digest;
  f.currentSnapshotEvidence.charter_digest=checked.charter_digest;
  if(refreshEvidenceId) f.evidence.evidence_id=deriveCircleDecisionRequestEvidenceId(f.evidence);
}

function assess(f) {
  return assessCircleDecisionRequest(f);
}

function addAppeal(f,status,filedAt='2026-09-25T11:45:00.000Z') {
  f.packageDocument.appeals.push({
    schema:CIRCLE_APPEAL_SCHEMA,
    appeal_id:'appeal.publish.1',
    circle_id:f.packageDocument.circle.circle_id,
    target_type:'decision',
    target_id:f.packageDocument.decisions[0].decision_id,
    filed_by:'human.owner',
    reason:'Request review before any ordinary AXIOM request is submitted.',
    filed_at:filedAt,
    status,
    resolved_at:status==='open'?null:'2026-09-25T11:50:00.000Z',
    authority_effect:'none'
  });
  refresh(f);
}

test('accepted final Circle decision is only evidence for an ordinary AXIOM request',()=>{
  const f=fixture();
  const validated=validateCircleDecisionRequestEvidence(f.evidence);
  assert.equal(validated.evidence_digest,circleDecisionRequestEvidenceDigest(f.evidence));
  const result=assess(f);
  assert.equal(result.eligible_to_request,true);
  assert.deepEqual(result.reasons,[]);
  assert.equal(result.ordinary_authority_path_required,true);
  assert.equal(result.creates_grant,false);
  assert.equal(result.creates_approval,false);
  assert.equal(result.creates_prepared_effect,false);
  assert.equal(result.authority_effect,'none');
  assert.equal(result.governance_effect,'none');
  assert.equal(result.execution_effect,'none');
  assert.equal(result.network_effect,'none');
  assert.equal(result.runtime_activation,false);
});

test('rejected no-quorum and withdrawn decisions cannot support a request',()=>{
  for(const outcome of ['rejected','no-quorum','withdrawn']){
    const f=fixture();
    f.packageDocument.decisions[0].outcome=outcome;
    f.evidence.decision_digest=digestObject(f.packageDocument.decisions[0]);
    refresh(f);
    const result=assess(f);
    assert.equal(result.eligible_to_request,false);
    assert.ok(result.reasons.includes('decision-not-accepted'));
  }
});

test('provisional Circle decision cannot support an ordinary AXIOM request',()=>{
  const f=fixture();
  f.packageDocument.decisions[0].finality='circle-local-provisional';
  f.evidence.decision_digest=digestObject(f.packageDocument.decisions[0]);
  refresh(f);
  const result=assess(f);
  assert.equal(result.eligible_to_request,false);
  assert.ok(result.reasons.includes('decision-not-final'));
});

test('open or accepted appeal blocks request eligibility',()=>{
  for(const status of ['open','accepted']){
    const f=fixture();
    addAppeal(f,status);
    const result=assess(f);
    assert.equal(result.eligible_to_request,false);
    assert.ok(result.reasons.includes('decision-appeal-blocking:'+status));
  }
});

test('rejected or withdrawn appeal remains visible but does not block request eligibility',()=>{
  for(const status of ['rejected','withdrawn']){
    const f=fixture();
    addAppeal(f,status);
    const result=assess(f);
    assert.equal(result.eligible_to_request,true);
    assert.ok(result.nonblocking_appeals.includes('appeal.publish.1:'+status));
  }
});

test('future-dated appeal cannot participate in a current snapshot',()=>{
  const f=fixture();
  addAppeal(f,'open','2026-09-26T12:00:00.000Z');
  const result=assess(f);
  assert.equal(result.eligible_to_request,false);
  assert.ok(result.reasons.includes('appeal-filed-after-request:appeal.publish.1'));
});

test('charter replacement invalidates evidence tied to the earlier decision context',()=>{
  const f=fixture();
  const oldCharterDigest=f.evidence.charter_digest;
  f.packageDocument.charter.version=2;
  f.packageDocument.charter.supersedes_digest=oldCharterDigest;
  f.packageDocument.charter.effective_from='2026-09-25T11:40:00.000Z';
  const newCharterDigest=digestObject(f.packageDocument.charter);
  f.packageDocument.invitations[0].charter_digest=newCharterDigest;
  f.packageDocument.proposals[0].charter_digest=newCharterDigest;
  f.packageDocument.decisions[0].charter_digest=newCharterDigest;
  refresh(f);
  const result=assess(f);
  assert.equal(result.eligible_to_request,false);
  assert.ok(result.reasons.includes('charter-digest-mismatch'));
  assert.ok(result.reasons.includes('proposal-digest-mismatch'));
  assert.ok(result.reasons.includes('decision-digest-mismatch'));
});

test('action resource or effect laundering loses the proposal request binding',()=>{
  for(const mutate of [
    descriptor=>{descriptor.action='research.delete';},
    descriptor=>{descriptor.resource='resource:other-package';},
    descriptor=>{descriptor.effect_class='delete-external-resource';}
  ]){
    const f=fixture();
    mutate(f.evidence.request_descriptor);
    f.evidence.request_digest=digestObject(f.evidence.request_descriptor);
    f.evidence.proposal_request_binding_ref=circleRequestBindingRef(f.evidence.request_descriptor);
    f.evidence.evidence_id=deriveCircleDecisionRequestEvidenceId(f.evidence);
    const result=assess(f);
    assert.equal(result.eligible_to_request,false);
    assert.ok(result.reasons.includes('proposal-request-binding-missing'));
  }
});

test('current snapshot evidence must bind exact Circle package charter and request time',()=>{
  const ref=fixture();
  ref.currentSnapshotEvidence.evidence_ref='snapshot:attacker';
  assert.ok(assess(ref).reasons.includes('snapshot-evidence-ref-mismatch'));

  const digest=fixture();
  digest.currentSnapshotEvidence.evidence_digest='d'.repeat(64);
  assert.ok(assess(digest).reasons.includes('snapshot-evidence-digest-mismatch'));

  const time=fixture();
  time.currentSnapshotEvidence.observed_at='2026-09-25T11:59:59.000Z';
  assert.ok(assess(time).reasons.includes('snapshot-time-mismatch'));

  const pkg=fixture();
  pkg.currentSnapshotEvidence.package_digest='c'.repeat(64);
  assert.ok(assess(pkg).reasons.includes('snapshot-package-digest-mismatch'));
});

test('decision cannot postdate the request evidence',()=>{
  const f=fixture();
  f.packageDocument.decisions[0].decided_at='2026-09-25T12:01:00.000Z';
  f.evidence.decision_digest=digestObject(f.packageDocument.decisions[0]);
  refresh(f);
  const result=assess(f);
  assert.equal(result.eligible_to_request,false);
  assert.ok(result.reasons.includes('decision-after-request'));
});

test('request evidence is closed and cannot smuggle authority or execution fields',()=>{
  const extra=fixture();
  extra.evidence.execution_authority=true;
  assert.throws(()=>validateCircleDecisionRequestEvidence(extra.evidence),/fields are invalid/);

  const grant=fixture();
  grant.evidence.creates_grant=true;
  assert.throws(()=>validateCircleDecisionRequestEvidence(grant.evidence),/activation boundary/);
});

test('request descriptor requires finite canonical data classes and effect vocabulary',()=>{
  const unsorted=fixture();
  unsorted.evidence.request_descriptor.data_classes=['z-private','a-private'];
  unsorted.evidence.request_digest=digestObject(unsorted.evidence.request_descriptor);
  unsorted.evidence.proposal_request_binding_ref=circleRequestBindingRef(unsorted.evidence.request_descriptor);
  unsorted.evidence.evidence_id=deriveCircleDecisionRequestEvidenceId(unsorted.evidence);
  assert.throws(()=>validateCircleDecisionRequestEvidence(unsorted.evidence),/data_classes must be sorted/);

  const badEffect=fixture();
  badEffect.evidence.request_descriptor.effect_class='unbounded-power';
  badEffect.evidence.request_digest=digestObject(badEffect.evidence.request_descriptor);
  badEffect.evidence.evidence_id=deriveCircleDecisionRequestEvidenceId(badEffect.evidence);
  assert.throws(()=>validateCircleDecisionRequestEvidence(badEffect.evidence),/effect_class is invalid/);
});

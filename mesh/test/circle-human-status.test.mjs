import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_APPEAL_SCHEMA,
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_DECISION_SCHEMA,
  CIRCLE_EXIT_SCHEMA,
  CIRCLE_EXPORT_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA,
  CIRCLE_SCHEMA,
  CIRCLE_TASK_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  projectCircleHumanStatus,
  CIRCLE_HUMAN_STATUS_SCHEMA
} from '../src/lib/circle-human-status.mjs';

const NOW='2026-09-25T12:00:00.000Z';

function contentDigest(payload) {
  return digestObject({content_type:'text/plain',payload});
}

function authorization(seed='b') {
  return {
    request_digest:'a'.repeat(64),
    evidence_ref:'receipt:'+seed,
    evidence_digest:seed.repeat(64)
  };
}

function activeArtifact(overrides={}) {
  return {
    schema:'axiom-canonical-shared-artifact.v0',
    version:0,
    status:'inert-shared-artifact-contract',
    artifact_id:'artifact:circle-work.1',
    owner_ref:'human.owner',
    authority_domain:{kind:'circle',ref:'circle.team.1'},
    content_type:'text/plain',
    revisions:[{
      revision_id:'rev:1',
      parents:[],
      operation:'put',
      actor_principal:'human.owner',
      actor_kind:'human',
      authorization:authorization(),
      payload:'initial',
      content_digest:contentDigest('initial'),
      resolves:[],
      work_graph:null,
      occurred_at:'2026-09-24T10:00:00.000Z'
    }],
    current_heads:['rev:1'],
    state:'active',
    current_content_digest:contentDigest('initial'),
    sharing:{state:'private',projection_refs:[]},
    created_at:'2026-09-24T10:00:00.000Z',
    updated_at:'2026-09-24T10:00:00.000Z',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false,
    ...overrides
  };
}

function conflictArtifact() {
  const value=activeArtifact();
  value.revisions.push(
    {
      revision_id:'rev:2',
      parents:['rev:1'],
      operation:'put',
      actor_principal:'human.owner',
      actor_kind:'human',
      authorization:authorization('c'),
      payload:'branch one',
      content_digest:contentDigest('branch one'),
      resolves:[],
      work_graph:null,
      occurred_at:'2026-09-24T10:10:00.000Z'
    },
    {
      revision_id:'rev:3',
      parents:['rev:1'],
      operation:'put',
      actor_principal:'agent.helper.1',
      actor_kind:'agent',
      authorization:authorization('d'),
      payload:'branch two',
      content_digest:contentDigest('branch two'),
      resolves:[],
      work_graph:null,
      occurred_at:'2026-09-24T10:11:00.000Z'
    }
  );
  value.current_heads=['rev:2','rev:3'];
  value.state='conflict';
  value.current_content_digest=null;
  value.updated_at='2026-09-24T10:11:00.000Z';
  return value;
}

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
      declared_modes:['propose','deliberate','evidence','vote','approve','review','appeal','observe'],
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
    expires_at:'2026-09-30T12:01:00.000Z',
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
  const proposal={
    schema:CIRCLE_PROPOSAL_SCHEMA,
    proposal_id:'proposal.publish.1',
    circle_id:circle.circle_id,
    charter_digest:charterDigest,
    proposer:'human.owner',
    title:'Publish a bounded research package',
    summary:'Circle-local decision evidence only; external publication remains separately authorized.',
    created_at:'2026-09-24T11:00:00.000Z',
    closes_at:'2026-09-26T11:00:00.000Z',
    status:'closed',
    evidence_refs:[],
    execution_effect:'none',
    authority_effect:'none'
  };
  const task={
    schema:CIRCLE_TASK_SCHEMA,
    task_id:'task.review.1',
    circle_id:circle.circle_id,
    proposal_id:proposal.proposal_id,
    assigned_membership_id:membership.membership_id,
    description:'Review the bounded package.',
    created_at:'2026-09-24T11:05:00.000Z',
    due_at:'2026-09-27T11:05:00.000Z',
    status:'open',
    evidence_refs:[],
    execution_authority:false,
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
  const exportRecord={
    schema:CIRCLE_EXPORT_SCHEMA,
    export_id:'circle-export.owner.1',
    circle_id:circle.circle_id,
    exported_by:'human.owner',
    exported_at:'2026-09-25T11:45:00.000Z',
    disclosure_class:'member-private',
    included_record_digests:[digestObject(proposal),digestObject(decision)].sort(),
    portable_authority:false,
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
    proposals:[proposal],
    tasks:[task],
    decisions:[decision],
    appeals:[],
    exits:[],
    exports:[exportRecord],
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  return {
    packageDocument,
    artifacts:[activeArtifact()],
    assessedAt:NOW
  };
}

function project(f) {
  return projectCircleHumanStatus(f);
}

function addAppeal(f,status) {
  f.packageDocument.appeals.push({
    schema:CIRCLE_APPEAL_SCHEMA,
    appeal_id:'appeal.decision.1',
    circle_id:f.packageDocument.circle.circle_id,
    target_type:'decision',
    target_id:f.packageDocument.decisions[0].decision_id,
    filed_by:'human.owner',
    reason:'Request explicit review before relying on the decision.',
    filed_at:'2026-09-25T11:40:00.000Z',
    status,
    resolved_at:status==='open'?null:'2026-09-25T11:50:00.000Z',
    authority_effect:'none'
  });
}

function addExit(f,kind='voluntary-exit') {
  f.packageDocument.exits.push({
    schema:CIRCLE_EXIT_SCHEMA,
    exit_id:'exit.owner.1',
    circle_id:f.packageDocument.circle.circle_id,
    membership_id:f.packageDocument.memberships[0].membership_id,
    principal_id:f.packageDocument.memberships[0].principal_id,
    initiated_by:f.packageDocument.memberships[0].principal_id,
    kind,
    effective_at:'2026-09-25T11:00:00.000Z',
    reason_code:kind==='revocation'?'policy-revocation':'member-choice',
    future_obligation_effect:'ends-except-explicit-post-exit-rules',
    history_rewrite:false,
    authority_effect:'none'
  });
}

test('projection is deterministic read-only status with no authority or mutation effects',()=>{
  const f=fixture();
  const before=digestObject(f);
  const result=project(f);
  assert.equal(result.schema,CIRCLE_HUMAN_STATUS_SCHEMA);
  assert.equal(result.assessed_at,NOW);
  assert.equal(result.circle.circle_id,'circle.team.1');
  assert.equal(result.circle.charter_version,1);
  assert.equal(result.circle.policy_floor,'raise-only');
  assert.equal(result.memberships[0].current_state,'active');
  assert.equal(result.decisions[0].outcome,'accepted');
  assert.equal(result.exports[0].portable_authority,false);
  assert.equal(result.artifacts[0].state,'active');
  assert.deepEqual(result.warnings,[]);
  assert.equal(result.authority_effect,'none');
  assert.equal(result.governance_effect,'none');
  assert.equal(result.execution_effect,'none');
  assert.equal(result.network_effect,'none');
  assert.equal(result.runtime_activation,false);
  assert.equal(result.creates_membership,false);
  assert.equal(result.creates_decision,false);
  assert.equal(result.resolves_conflict,false);
  assert.equal(result.creates_export,false);
  assert.equal(digestObject(f),before);
  assert.equal(project(f).status_digest,result.status_digest);
});

test('effective exit overrides stale active membership without rewriting membership history',()=>{
  const f=fixture();
  addExit(f,'voluntary-exit');
  const result=project(f);
  const member=result.memberships[0];
  assert.equal(member.membership_status,'active');
  assert.equal(member.current_state,'exited');
  assert.equal(member.current_since,'2026-09-25T11:00:00.000Z');
  assert.deepEqual(member.effective_exit_ids,['exit.owner.1']);
  assert.ok(result.warnings.includes('effective-exit:membership.owner.1:voluntary-exit'));
});

test('revocation is visible as a negative current participation state',()=>{
  const f=fixture();
  addExit(f,'revocation');
  const result=project(f);
  assert.equal(result.memberships[0].current_state,'revoked');
  assert.ok(result.warnings.includes('effective-exit:membership.owner.1:revocation'));
});

test('blocking and nonblocking decision appeals remain visibly distinct',()=>{
  const blocking=fixture();
  addAppeal(blocking,'open');
  const b=project(blocking);
  assert.deepEqual(b.decisions[0].blocking_appeals,['appeal.decision.1:open']);
  assert.deepEqual(b.decisions[0].nonblocking_appeals,[]);
  assert.ok(b.warnings.includes('decision-blocked-by-appeal:decision.publish.1'));

  const nonblocking=fixture();
  addAppeal(nonblocking,'rejected');
  const n=project(nonblocking);
  assert.deepEqual(n.decisions[0].blocking_appeals,[]);
  assert.deepEqual(n.decisions[0].nonblocking_appeals,['appeal.decision.1:rejected']);
  assert.ok(!n.warnings.includes('decision-blocked-by-appeal:decision.publish.1'));
});

test('artifact conflict remains explicit with every current head and no invented current content',()=>{
  const f=fixture();
  f.artifacts=[conflictArtifact()];
  const result=project(f);
  assert.equal(result.artifacts[0].state,'conflict');
  assert.deepEqual(result.artifacts[0].current_heads,['rev:2','rev:3']);
  assert.equal(result.artifacts[0].current_content_digest,null);
  assert.deepEqual(result.artifacts[0].actor_principals,['agent.helper.1','human.owner']);
  assert.ok(result.warnings.includes('artifact-conflict:artifact:circle-work.1'));
  assert.equal(result.counts.artifact_conflicts,1);
  assert.equal(result.resolves_conflict,false);
});

test('artifact from another authority domain or Circle is rejected',()=>{
  const owner=fixture();
  owner.artifacts=[activeArtifact({authority_domain:{kind:'owner',ref:'human.owner'}})];
  assert.throws(()=>project(owner),/exact Circle authority domain/);

  const other=fixture();
  other.artifacts=[activeArtifact({authority_domain:{kind:'circle',ref:'circle.other'}})];
  assert.throws(()=>project(other),/exact Circle authority domain/);
});

test('future deadlines are allowed but future occurrence or effective timestamps fail closed',()=>{
  assert.doesNotThrow(()=>project(fixture()),'future proposal closes_at and task due_at are allowed');

  const cases=[
    ['circle created_at',f=>{f.packageDocument.circle.created_at='2026-09-26T12:00:00.000Z';}],
    ['charter effective_from',f=>{
      f.packageDocument.charter.version=2;
      f.packageDocument.charter.effective_from='2026-09-26T12:00:00.000Z';
      f.packageDocument.charter.supersedes_digest=digestObject({...f.packageDocument.charter,version:1,effective_from:'2026-09-20T12:00:00.000Z',supersedes_digest:null});
      const d=digestObject(f.packageDocument.charter);
      f.packageDocument.invitations[0].charter_digest=d;
      f.packageDocument.proposals[0].charter_digest=d;
      f.packageDocument.decisions[0].charter_digest=d;
    }],
    ['invitation issued_at',f=>{f.packageDocument.invitations[0].issued_at='2026-09-26T12:00:00.000Z';f.packageDocument.memberships[0].accepted_at='2026-09-26T12:01:00.000Z';f.packageDocument.memberships[0].status_effective_at='2026-09-26T12:01:00.000Z';}],
    ['membership status_effective_at',f=>{f.packageDocument.memberships[0].status_effective_at='2026-09-26T12:00:00.000Z';}],
    ['proposal created_at',f=>{f.packageDocument.proposals[0].created_at='2026-09-26T10:00:00.000Z';f.packageDocument.proposals[0].closes_at='2026-09-27T10:00:00.000Z';}],
    ['task created_at',f=>{f.packageDocument.tasks[0].created_at='2026-09-26T10:00:00.000Z';f.packageDocument.tasks[0].due_at='2026-09-27T10:00:00.000Z';}],
    ['decision decided_at',f=>{f.packageDocument.decisions[0].decided_at='2026-09-26T10:00:00.000Z';}],
    ['appeal filed_at',f=>{addAppeal(f,'open');f.packageDocument.appeals[0].filed_at='2026-09-26T10:00:00.000Z';}],
    ['exit effective_at',f=>{addExit(f);f.packageDocument.exits[0].effective_at='2026-09-26T10:00:00.000Z';}],
    ['export exported_at',f=>{f.packageDocument.exports[0].exported_at='2026-09-26T10:00:00.000Z';}],
    ['artifact updated_at',f=>{f.artifacts[0].revisions[0].occurred_at='2026-09-26T10:00:00.000Z';f.artifacts[0].created_at='2026-09-26T10:00:00.000Z';f.artifacts[0].updated_at='2026-09-26T10:00:00.000Z';}]
  ];
  for(const [label,mutate] of cases){
    const f=fixture();
    mutate(f);
    assert.throws(()=>project(f),/exceeds assessed_at/,label);
  }
});

test('stored non-active membership remains visibly negative without requiring an exit record',()=>{
  for(const status of ['suspended','revoked','exited']){
    const f=fixture();
    f.packageDocument.memberships[0].status=status;
    f.packageDocument.memberships[0].status_effective_at='2026-09-25T10:00:00.000Z';
    const result=project(f);
    assert.equal(result.memberships[0].current_state,status);
    assert.ok(result.warnings.includes('membership-not-active:membership.owner.1:'+status));
  }
});

test('projection sorts rows and exposes aggregate conflict/currentness counts',()=>{
  const f=fixture();
  const second=activeArtifact({artifact_id:'artifact:aaa.1'});
  f.artifacts=[f.artifacts[0],second].reverse();
  addExit(f);
  addAppeal(f,'accepted');
  const result=project(f);
  assert.deepEqual(result.artifacts.map(item=>item.artifact_id),['artifact:aaa.1','artifact:circle-work.1']);
  assert.equal(result.counts.memberships,1);
  assert.equal(result.counts.inactive_memberships,1);
  assert.equal(result.counts.decisions,1);
  assert.equal(result.counts.blocked_decisions,1);
  assert.equal(result.counts.artifacts,2);
  assert.equal(result.counts.artifact_conflicts,0);
  assert.equal(result.counts.exports,1);
});

import { canonicalize, digestObject, ValidationError } from './canonical.mjs';
import { validateCircleCorePackage } from './circle-core.mjs';
import { validateCanonicalSharedArtifact } from './canonical-shared-artifact.mjs';

export const CIRCLE_HUMAN_STATUS_SCHEMA='axiom-circle-human-status.v0';

const BLOCKING_APPEAL_STATUSES=new Set(['open','accepted']);
const NONBLOCKING_APPEAL_STATUSES=new Set(['rejected','withdrawn']);

export function projectCircleHumanStatus(raw){
  const input=canonicalize(raw);
  exactObject(input,'Circle human status input',['packageDocument','artifacts','assessedAt']);

  const assessedMs=canonicalDate(input.assessedAt,'assessedAt');
  const packageResult=validateCircleCorePackage(input.packageDocument);
  if(!Array.isArray(input.artifacts)||input.artifacts.length>4096){
    throw new ValidationError('Circle human status artifacts must contain at most 4096 entries');
  }

  assertNotFuture(input.packageDocument.circle.created_at,'Circle created_at',assessedMs);
  assertNotFuture(input.packageDocument.charter.effective_from,'Circle charter effective_from',assessedMs);

  const warnings=[];
  const membershipRows=projectMemberships(input.packageDocument,assessedMs,warnings);
  const proposalRows=projectProposals(input.packageDocument,assessedMs);
  const taskRows=projectTasks(input.packageDocument,assessedMs);
  const appealRows=projectAppeals(input.packageDocument,assessedMs);
  const decisionRows=projectDecisions(input.packageDocument,assessedMs,appealRows,warnings);
  const exportRows=projectExports(input.packageDocument,assessedMs);
  const artifactRows=projectArtifacts(
    input.artifacts,
    input.packageDocument.circle.circle_id,
    assessedMs,
    warnings
  );

  const sortedWarnings=[...new Set(warnings)].sort();
  const counts=Object.freeze({
    memberships:membershipRows.length,
    inactive_memberships:membershipRows.filter(item=>item.current_state!=='active').length,
    proposals:proposalRows.length,
    tasks:taskRows.length,
    decisions:decisionRows.length,
    blocked_decisions:decisionRows.filter(item=>item.blocking_appeals.length>0).length,
    appeals:appealRows.length,
    exports:exportRows.length,
    artifacts:artifactRows.length,
    artifact_conflicts:artifactRows.filter(item=>item.state==='conflict').length
  });

  const result={
    schema:CIRCLE_HUMAN_STATUS_SCHEMA,
    assessed_at:input.assessedAt,
    circle:Object.freeze({
      circle_id:input.packageDocument.circle.circle_id,
      name:input.packageDocument.circle.name,
      purpose:input.packageDocument.circle.purpose,
      participation_model:input.packageDocument.circle.participation_model,
      member_state_ownership:input.packageDocument.circle.member_state_ownership,
      policy_floor:input.packageDocument.circle.policy_floor,
      charter_version:input.packageDocument.charter.version,
      charter_digest:packageResult.charter_digest
    }),
    memberships:Object.freeze(membershipRows),
    proposals:Object.freeze(proposalRows),
    tasks:Object.freeze(taskRows),
    decisions:Object.freeze(decisionRows),
    appeals:Object.freeze(appealRows),
    exports:Object.freeze(exportRows),
    artifacts:Object.freeze(artifactRows),
    counts,
    warnings:Object.freeze(sortedWarnings),
    package_digest:packageResult.package_digest,
    input_digest:digestObject(input),
    requires_external_evidence_verification:true,
    evidence_verification_effect:'none',
    creates_membership:false,
    creates_decision:false,
    resolves_conflict:false,
    creates_export:false,
    authority_effect:'none',
    governance_effect:'none',
    execution_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  return Object.freeze({...result,status_digest:digestObject(result)});
}

function projectMemberships(packageDocument,assessedMs,warnings){
  const exitsByMembership=new Map();
  for(const exit of packageDocument.exits){
    assertNotFuture(exit.effective_at,'Circle exit effective_at',assessedMs);
    const list=exitsByMembership.get(exit.membership_id)??[];
    list.push(exit);
    exitsByMembership.set(exit.membership_id,list);
  }

  const rows=[];
  for(const invitation of packageDocument.invitations){
    assertNotFuture(invitation.issued_at,'Circle invitation issued_at',assessedMs);
  }

  for(const membership of packageDocument.memberships){
    assertNotFuture(membership.accepted_at,'Circle membership accepted_at',assessedMs);
    assertNotFuture(
      membership.status_effective_at,
      'Circle membership status_effective_at',
      assessedMs
    );
    const exits=[...(exitsByMembership.get(membership.membership_id)??[])].sort((left,right)=>(
      canonicalDate(left.effective_at,'Circle exit effective_at')
      -canonicalDate(right.effective_at,'Circle exit effective_at')
      ||left.exit_id.localeCompare(right.exit_id)
    ));

    let currentState=membership.status;
    let currentSince=membership.status_effective_at;
    if(exits.length){
      const first=exits[0];
      currentState=first.kind==='revocation'?'revoked':'exited';
      currentSince=first.effective_at;
      for(const exit of exits){
        warnings.push('effective-exit:'+membership.membership_id+':'+exit.kind);
      }
    }
    if(membership.status!=='active'){
      warnings.push(
        'membership-not-active:'+membership.membership_id+':'+membership.status
      );
    }

    rows.push(Object.freeze({
      membership_id:membership.membership_id,
      principal_id:membership.principal_id,
      role_ids:Object.freeze([...membership.role_ids].sort()),
      membership_status:membership.status,
      membership_status_effective_at:membership.status_effective_at,
      current_state:currentState,
      current_since:currentSince,
      effective_exit_ids:Object.freeze(exits.map(item=>item.exit_id)),
      disclosure_profile:membership.disclosure_profile
    }));
  }
  return rows.sort((a,b)=>a.membership_id.localeCompare(b.membership_id));
}

function projectProposals(packageDocument,assessedMs){
  return packageDocument.proposals.map(item=>{
    assertNotFuture(item.created_at,'Circle proposal created_at',assessedMs);
    canonicalDate(item.closes_at,'Circle proposal closes_at');
    return Object.freeze({
      proposal_id:item.proposal_id,
      proposer:item.proposer,
      title:item.title,
      status:item.status,
      created_at:item.created_at,
      closes_at:item.closes_at,
      evidence_ref_count:item.evidence_refs.length,
      execution_effect:item.execution_effect,
      authority_effect:item.authority_effect
    });
  }).sort((a,b)=>a.proposal_id.localeCompare(b.proposal_id));
}

function projectTasks(packageDocument,assessedMs){
  return packageDocument.tasks.map(item=>{
    assertNotFuture(item.created_at,'Circle task created_at',assessedMs);
    if(item.due_at!==null)canonicalDate(item.due_at,'Circle task due_at');
    return Object.freeze({
      task_id:item.task_id,
      proposal_id:item.proposal_id,
      assigned_membership_id:item.assigned_membership_id,
      description:item.description,
      status:item.status,
      created_at:item.created_at,
      due_at:item.due_at,
      evidence_ref_count:item.evidence_refs.length,
      execution_authority:item.execution_authority,
      authority_effect:item.authority_effect
    });
  }).sort((a,b)=>a.task_id.localeCompare(b.task_id));
}

function projectAppeals(packageDocument,assessedMs){
  return packageDocument.appeals.map(item=>{
    assertNotFuture(item.filed_at,'Circle appeal filed_at',assessedMs);
    if(item.resolved_at!==null){
      assertNotFuture(item.resolved_at,'Circle appeal resolved_at',assessedMs);
    }
    return Object.freeze({
      appeal_id:item.appeal_id,
      target_type:item.target_type,
      target_id:item.target_id,
      filed_by:item.filed_by,
      status:item.status,
      filed_at:item.filed_at,
      resolved_at:item.resolved_at,
      authority_effect:item.authority_effect
    });
  }).sort((a,b)=>a.appeal_id.localeCompare(b.appeal_id));
}

function projectDecisions(packageDocument,assessedMs,appealRows,warnings){
  return packageDocument.decisions.map(item=>{
    assertNotFuture(item.decided_at,'Circle decision decided_at',assessedMs);
    const linked=appealRows.filter(appeal=>(
      appeal.target_type==='decision'&&appeal.target_id===item.decision_id
    ));
    const blocking=linked
      .filter(appeal=>BLOCKING_APPEAL_STATUSES.has(appeal.status))
      .map(appeal=>appeal.appeal_id+':'+appeal.status)
      .sort();
    const nonblocking=linked
      .filter(appeal=>NONBLOCKING_APPEAL_STATUSES.has(appeal.status))
      .map(appeal=>appeal.appeal_id+':'+appeal.status)
      .sort();
    if(blocking.length){
      warnings.push('decision-blocked-by-appeal:'+item.decision_id);
    }
    return Object.freeze({
      decision_id:item.decision_id,
      proposal_id:item.proposal_id,
      outcome:item.outcome,
      finality:item.finality,
      decided_at:item.decided_at,
      participant_receipt_count:item.participant_receipts.length,
      blocking_appeals:Object.freeze(blocking),
      nonblocking_appeals:Object.freeze(nonblocking),
      runtime_authority:item.runtime_authority,
      authority_effect:item.authority_effect
    });
  }).sort((a,b)=>a.decision_id.localeCompare(b.decision_id));
}

function projectExports(packageDocument,assessedMs){
  return packageDocument.exports.map(item=>{
    assertNotFuture(item.exported_at,'Circle export exported_at',assessedMs);
    return Object.freeze({
      export_id:item.export_id,
      exported_by:item.exported_by,
      exported_at:item.exported_at,
      disclosure_class:item.disclosure_class,
      included_record_count:item.included_record_digests.length,
      portable_authority:item.portable_authority,
      authority_effect:item.authority_effect,
      network_effect:item.network_effect
    });
  }).sort((a,b)=>a.export_id.localeCompare(b.export_id));
}

function projectArtifacts(artifacts,circleId,assessedMs,warnings){
  const seen=new Set();
  const rows=[];
  for(const artifact of artifacts){
    const summary=validateCanonicalSharedArtifact(artifact);
    if(seen.has(summary.artifact_id)){
      throw new ValidationError('Duplicate Circle human status artifact_id: '+summary.artifact_id);
    }
    seen.add(summary.artifact_id);
    if(summary.authority_domain.kind!=='circle'||summary.authority_domain.ref!==circleId){
      throw new ValidationError('Circle human status artifact must belong to exact Circle authority domain');
    }
    assertNotFuture(artifact.created_at,'canonical shared artifact.created_at',assessedMs);
    assertNotFuture(artifact.updated_at,'canonical shared artifact.updated_at',assessedMs);
    for(const revision of artifact.revisions){
      assertNotFuture(revision.occurred_at,'canonical shared artifact revision occurred_at',assessedMs);
    }
    const actors=[...new Set(artifact.revisions.map(item=>item.actor_principal))].sort();
    if(summary.state==='conflict'){
      warnings.push('artifact-conflict:'+summary.artifact_id);
    }
    rows.push(Object.freeze({
      artifact_id:summary.artifact_id,
      owner_ref:summary.owner_ref,
      state:summary.state,
      current_heads:Object.freeze([...summary.current_heads]),
      current_content_digest:summary.current_content_digest,
      revision_count:summary.revision_count,
      actor_principals:Object.freeze(actors),
      artifact_digest:summary.artifact_digest,
      authority_effect:summary.authority_effect,
      network_effect:summary.network_effect,
      runtime_activation:summary.runtime_activation
    }));
  }
  return rows.sort((a,b)=>a.artifact_id.localeCompare(b.artifact_id));
}

function assertNotFuture(value,label,assessedMs){
  if(canonicalDate(value,label)>assessedMs){
    throw new ValidationError(label+' exceeds assessed_at');
  }
}

function exactObject(value,label,fields){
  if(!value||typeof value!=='object'||Array.isArray(value)){
    throw new ValidationError(label+' must be an object');
  }
  const actual=Object.keys(value).sort().join(',');
  const expected=[...fields].sort().join(',');
  if(actual!==expected)throw new ValidationError(label+' fields are invalid');
}

function canonicalDate(value,label){
  if(typeof value!=='string'||value.length!==24){
    throw new ValidationError(label+' must be a canonical UTC timestamp');
  }
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString()!==value){
    throw new ValidationError(label+' must be a canonical UTC timestamp');
  }
  return parsed.getTime();
}

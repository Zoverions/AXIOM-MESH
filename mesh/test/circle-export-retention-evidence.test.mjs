import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_DECISION_SCHEMA,
  CIRCLE_EXIT_SCHEMA,
  CIRCLE_EXPORT_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA,
  CIRCLE_SCHEMA,
  validateCircleCorePackage
} from '../src/lib/circle-core.mjs';
import {
  assessCircleExportRetention,
  circleExportRecordObservationsDigest,
  circleExportRetentionEvidenceDigest,
  deriveCircleExportRetentionEvidenceId,
  validateCircleExportRetentionEvidence
} from '../src/lib/circle-export-retention-evidence.mjs';

const EXPORTED_AT='2026-09-25T12:00:00.000Z';

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
      declared_modes:['propose','deliberate','evidence','vote','appeal','observe'],
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
  const proposal={
    schema:CIRCLE_PROPOSAL_SCHEMA,
    proposal_id:'proposal.before-exit.1',
    circle_id:circle.circle_id,
    charter_digest:charterDigest,
    proposer:'human.owner',
    title:'Retain a bounded pre-exit proposal',
    summary:'Historical Circle record that may be considered for a separately authorized export.',
    created_at:'2026-09-24T10:00:00.000Z',
    closes_at:'2026-09-25T10:00:00.000Z',
    status:'closed',
    evidence_refs:[],
    execution_effect:'none',
    authority_effect:'none'
  };
  const decision={
    schema:CIRCLE_DECISION_SCHEMA,
    decision_id:'decision.before-exit.1',
    circle_id:circle.circle_id,
    proposal_id:proposal.proposal_id,
    charter_digest:charterDigest,
    outcome:'accepted',
    decided_at:'2026-09-25T10:30:00.000Z',
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
    exported_at:EXPORTED_AT,
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
    tasks:[],
    decisions:[decision],
    appeals:[],
    exits:[],
    exports:[exportRecord],
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  const packageResult=validateCircleCorePackage(packageDocument);
  const recordObservations=[
    {
      record_digest:digestObject(proposal),
      evidence_ref:'observation:proposal-before-exit',
      evidence_digest:'1'.repeat(64),
      observed_at:'2026-09-24T10:00:00.000Z'
    },
    {
      record_digest:digestObject(decision),
      evidence_ref:'observation:decision-before-exit',
      evidence_digest:'2'.repeat(64),
      observed_at:'2026-09-25T10:30:00.000Z'
    }
  ];
  const evidence={
    schema:'axiom-circle-export-retention-evidence.v0',
    version:0,
    status:'inert-retention-evidence',
    evidence_id:'circle-export-retention:'+'0'.repeat(64),
    circle_id:circle.circle_id,
    export_id:exportRecord.export_id,
    membership_id:membership.membership_id,
    exporter_principal_id:membership.principal_id,
    circle_package_digest:packageResult.package_digest,
    export_record_digest:digestObject(exportRecord),
    membership_digest:digestObject(membership),
    snapshot_evidence_ref:'snapshot:circle-export-1',
    snapshot_evidence_digest:'e'.repeat(64),
    record_observations_digest:circleExportRecordObservationsDigest(recordObservations),
    history_retention_only:true,
    requires_external_snapshot_verification:true,
    requires_external_record_evidence_verification:true,
    requires_disclosure_authorization:true,
    portable_authority:false,
    authority_effect:'none',
    governance_effect:'none',
    export_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  evidence.evidence_id=deriveCircleExportRetentionEvidenceId(evidence);
  const snapshotEvidence={
    evidence_ref:evidence.snapshot_evidence_ref,
    evidence_digest:evidence.snapshot_evidence_digest,
    observed_at:EXPORTED_AT,
    circle_id:circle.circle_id,
    package_digest:packageResult.package_digest,
    charter_digest:packageResult.charter_digest
  };
  return {packageDocument,evidence,snapshotEvidence,recordObservations};
}

function refresh(f,{refreshEvidenceId=true}={}) {
  const checked=validateCircleCorePackage(f.packageDocument);
  const exportRecord=f.packageDocument.exports.find(item=>item.export_id===f.evidence.export_id);
  const membership=f.packageDocument.memberships.find(item=>item.membership_id===f.evidence.membership_id);
  f.evidence.circle_package_digest=checked.package_digest;
  f.evidence.export_record_digest=exportRecord?digestObject(exportRecord):f.evidence.export_record_digest;
  f.evidence.membership_digest=membership?digestObject(membership):f.evidence.membership_digest;
  f.snapshotEvidence.package_digest=checked.package_digest;
  f.snapshotEvidence.charter_digest=checked.charter_digest;
  f.evidence.record_observations_digest=circleExportRecordObservationsDigest(f.recordObservations);
  if(refreshEvidenceId) f.evidence.evidence_id=deriveCircleExportRetentionEvidenceId(f.evidence);
}

function assess(f) {
  return assessCircleExportRetention(f);
}

function observe(f,record,observedAt,evidenceDigit='9') {
  f.recordObservations.push({
    record_digest:digestObject(record),
    evidence_ref:'observation:'+record.schema+':'+f.recordObservations.length,
    evidence_digest:evidenceDigit.repeat(64),
    observed_at:observedAt
  });
}

// A second member who stays in standing. Circle Core judges standing at the
// time of each act, so records the exporter could not have made after
// leaving are made by this member instead.
function addPeer(f) {
  const invitation={
    ...structuredClone(f.packageDocument.invitations[0]),
    invitation_id:'invite.peer.1',
    invited_principal:'human.peer'
  };
  f.packageDocument.invitations.push(invitation);
  f.packageDocument.memberships.push({
    ...structuredClone(f.packageDocument.memberships[0]),
    membership_id:'membership.peer.1',
    invitation_id:invitation.invitation_id,
    principal_id:'human.peer',
    accepted_at:'2026-09-20T12:03:00.000Z',
    status_effective_at:'2026-09-20T12:03:00.000Z'
  });
}

function addExit(f,effectiveAt='2026-09-25T11:00:00.000Z') {
  f.packageDocument.exits.push({
    schema:CIRCLE_EXIT_SCHEMA,
    exit_id:'exit.owner.1',
    circle_id:f.packageDocument.circle.circle_id,
    membership_id:f.packageDocument.memberships[0].membership_id,
    principal_id:f.packageDocument.memberships[0].principal_id,
    initiated_by:f.packageDocument.memberships[0].principal_id,
    kind:'voluntary-exit',
    effective_at:effectiveAt,
    reason_code:'member-choice',
    future_obligation_effect:'ends-except-explicit-post-exit-rules',
    history_rewrite:false,
    authority_effect:'none'
  });
}

test('active member history is eligible only for separate disclosure review',()=>{
  const f=fixture();
  const validated=validateCircleExportRetentionEvidence(f.evidence);
  assert.equal(validated.evidence_digest,circleExportRetentionEvidenceDigest(f.evidence));
  const result=assess(f);
  assert.equal(result.eligible_for_disclosure_review,true);
  assert.equal(result.retention_state,'active-member-history');
  assert.equal(result.participation_cutoff_at,null);
  assert.equal(result.requires_disclosure_authorization,true);
  assert.equal(result.requires_external_snapshot_verification,true);
  assert.equal(result.snapshot_verification_effect,'none');
  assert.equal(result.requires_external_record_evidence_verification,true);
  assert.equal(result.record_evidence_verification_effect,'none');
  assert.equal(result.portable_authority,false);
  assert.equal(result.authority_effect,'none');
  assert.equal(result.governance_effect,'none');
  assert.equal(result.export_effect,'none');
  assert.equal(result.network_effect,'none');
  assert.equal(result.runtime_activation,false);
});

test('post-exit export may retain only records at or before the participation cutoff',()=>{
  const f=fixture();
  addExit(f);
  f.packageDocument.exports[0].included_record_digests.push(digestObject(f.packageDocument.exits[0]));
  f.packageDocument.exports[0].included_record_digests.sort();
  observe(f,f.packageDocument.exits[0],'2026-09-25T11:00:00.000Z','3');
  refresh(f);
  const result=assess(f);
  assert.equal(result.eligible_for_disclosure_review,true);
  assert.equal(result.retention_state,'post-participation-history');
  assert.equal(result.participation_cutoff_at,'2026-09-25T11:00:00.000Z');
  assert.ok(result.included_records.some(item=>item.kind==='exit'));
});

test('post-exit records cannot be laundered into retained history',()=>{
  const f=fixture();
  addPeer(f);
  addExit(f);
  const later={
    ...structuredClone(f.packageDocument.proposals[0]),
    proposer:'human.peer',
    proposal_id:'proposal.after-exit.1',
    title:'Post-exit proposal',
    created_at:'2026-09-25T11:30:00.000Z',
    closes_at:'2026-09-26T11:30:00.000Z'
  };
  f.packageDocument.proposals.push(later);
  f.packageDocument.exports[0].included_record_digests.push(digestObject(later));
  f.packageDocument.exports[0].included_record_digests.sort();
  observe(f,later,'2026-09-25T11:30:00.000Z','4');
  refresh(f);
  const result=assess(f);
  assert.equal(result.eligible_for_disclosure_review,false);
  assert.ok(result.reasons.some(reason=>reason.startsWith('record-after-participation-cutoff:')));
});

test('record created after export snapshot is rejected even for an active member',()=>{
  const f=fixture();
  const future={
    ...structuredClone(f.packageDocument.proposals[0]),
    proposal_id:'proposal.after-export.1',
    title:'Future proposal',
    created_at:'2026-09-25T12:30:00.000Z',
    closes_at:'2026-09-26T12:30:00.000Z'
  };
  f.packageDocument.proposals.push(future);
  f.packageDocument.exports[0].included_record_digests.push(digestObject(future));
  f.packageDocument.exports[0].included_record_digests.sort();
  observe(f,future,'2026-09-25T12:30:00.000Z','5');
  refresh(f);
  const result=assess(f);
  assert.equal(result.eligible_for_disclosure_review,false);
  assert.ok(result.reasons.some(reason=>reason.startsWith('record-after-export:')));
});

test('unknown included digest fails closed',()=>{
  const f=fixture();
  f.packageDocument.exports[0].included_record_digests.push('c'.repeat(64));
  f.packageDocument.exports[0].included_record_digests.sort();
  f.recordObservations.push({
    record_digest:'c'.repeat(64),
    evidence_ref:'observation:unknown',
    evidence_digest:'6'.repeat(64),
    observed_at:'2026-09-25T10:00:00.000Z'
  });
  refresh(f);
  const result=assess(f);
  assert.equal(result.eligible_for_disclosure_review,false);
  assert.ok(result.reasons.includes('included-record-not-found:'+'c'.repeat(64)));
});

test('exporter must bind exact historical membership and principal',()=>{
  const f=fixture();
  f.evidence.exporter_principal_id='human.attacker';
  f.evidence.evidence_id=deriveCircleExportRetentionEvidenceId(f.evidence);
  assert.ok(assess(f).reasons.includes('exporter-principal-mismatch'));

  const missing=fixture();
  missing.evidence.membership_id='membership.missing';
  missing.evidence.evidence_id=deriveCircleExportRetentionEvidenceId(missing.evidence);
  assert.ok(assess(missing).reasons.includes('membership-not-found'));
});

test('membership cannot begin after the export timestamp',()=>{
  const f=fixture();
  addPeer(f);
  f.packageDocument.invitations[0].issued_at='2026-09-25T12:01:00.000Z';
  f.packageDocument.invitations[0].expires_at='2026-09-27T12:01:00.000Z';
  f.packageDocument.memberships[0].accepted_at='2026-09-25T12:02:00.000Z';
  f.packageDocument.memberships[0].status_effective_at='2026-09-25T12:02:00.000Z';
  f.packageDocument.proposals[0].proposer='human.peer';
  refresh(f);
  const result=assess(f);
  assert.equal(result.eligible_for_disclosure_review,false);
  assert.ok(result.reasons.includes('membership-after-export'));
});

test('snapshot evidence must bind exact export-time Circle package and charter',()=>{
  const ref=fixture();
  ref.snapshotEvidence.evidence_ref='snapshot:attacker';
  assert.ok(assess(ref).reasons.includes('snapshot-evidence-ref-mismatch'));

  const digest=fixture();
  digest.snapshotEvidence.evidence_digest='d'.repeat(64);
  assert.ok(assess(digest).reasons.includes('snapshot-evidence-digest-mismatch'));

  const time=fixture();
  time.snapshotEvidence.observed_at='2026-09-25T11:59:59.000Z';
  assert.ok(assess(time).reasons.includes('snapshot-time-mismatch'));

  const pkg=fixture();
  pkg.snapshotEvidence.package_digest='f'.repeat(64);
  assert.ok(assess(pkg).reasons.includes('snapshot-package-digest-mismatch'));
});

test('export record and package digests are exact-bound',()=>{
  const exportDigest=fixture();
  exportDigest.evidence.export_record_digest='a'.repeat(64);
  exportDigest.evidence.evidence_id=deriveCircleExportRetentionEvidenceId(exportDigest.evidence);
  assert.ok(assess(exportDigest).reasons.includes('export-record-digest-mismatch'));

  const packageDigest=fixture();
  packageDigest.evidence.circle_package_digest='b'.repeat(64);
  packageDigest.evidence.evidence_id=deriveCircleExportRetentionEvidenceId(packageDigest.evidence);
  assert.ok(assess(packageDigest).reasons.includes('circle-package-digest-mismatch'));
});

test('portable authority or hidden export effects remain structurally impossible',()=>{
  const f=fixture();
  f.packageDocument.exports[0].portable_authority=true;
  assert.throws(()=>assess(f),/Circle export is invalid/);

  const extra=fixture();
  extra.evidence.recipient_authority='grant:anything';
  assert.throws(()=>validateCircleExportRetentionEvidence(extra.evidence),/fields are invalid/);

  const effect=fixture();
  effect.evidence.export_effect='create-bundle';
  assert.throws(()=>validateCircleExportRetentionEvidence(effect.evidence),/activation boundary/);
});


test('every included record requires exact historical observation evidence',()=>{
  const f=fixture();
  f.recordObservations=f.recordObservations.filter(item=>(
    item.record_digest!==digestObject(f.packageDocument.decisions[0])
  ));
  refresh(f);
  const result=assess(f);
  assert.equal(result.eligible_for_disclosure_review,false);
  assert.ok(result.reasons.includes(
    'record-observation-missing:'+digestObject(f.packageDocument.decisions[0])
  ));
});

test('record observation evidence is digest-bound and cannot be substituted',()=>{
  const f=fixture();
  f.evidence.record_observations_digest='7'.repeat(64);
  f.evidence.evidence_id=deriveCircleExportRetentionEvidenceId(f.evidence);
  assert.ok(assess(f).reasons.includes('record-observations-digest-mismatch'));

  const ref=fixture();
  ref.recordObservations[0].evidence_ref='observation:attacker';
  assert.ok(assess(ref).reasons.includes('record-observations-digest-mismatch'));
});

test('post-exit export rejects an exact record version observed only after exit',()=>{
  const f=fixture();
  addExit(f);
  f.recordObservations[0].observed_at='2026-09-25T11:01:00.000Z';
  refresh(f);
  const result=assess(f);
  assert.equal(result.eligible_for_disclosure_review,false);
  assert.ok(result.reasons.some(reason=>reason.startsWith(
    'record-observed-after-participation-cutoff:'
  )));
});

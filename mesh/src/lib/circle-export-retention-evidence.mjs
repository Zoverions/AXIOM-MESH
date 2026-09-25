import { digestObject, ValidationError } from './canonical.mjs';
import { validateCircleCorePackage } from './circle-core.mjs';

export const CIRCLE_EXPORT_RETENTION_EVIDENCE_SCHEMA='axiom-circle-export-retention-evidence.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const EVIDENCE_ID=/^circle-export-retention:[a-f0-9]{64}$/;

export function circleExportRetentionIdentityBody(document){
  return {
    schema:CIRCLE_EXPORT_RETENTION_EVIDENCE_SCHEMA,
    version:0,
    circle_id:document.circle_id,
    export_id:document.export_id,
    membership_id:document.membership_id,
    exporter_principal_id:document.exporter_principal_id,
    circle_package_digest:document.circle_package_digest,
    export_record_digest:document.export_record_digest,
    membership_digest:document.membership_digest,
    snapshot_evidence_ref:document.snapshot_evidence_ref,
    snapshot_evidence_digest:document.snapshot_evidence_digest,
    record_observations_digest:document.record_observations_digest
  };
}

export function deriveCircleExportRetentionEvidenceId(document){
  return 'circle-export-retention:'+digestObject(circleExportRetentionIdentityBody(document));
}

export function validateCircleExportRetentionEvidence(document){
  exactObject(document,'Circle export retention evidence',[
    'schema','version','status','evidence_id','circle_id','export_id','membership_id',
    'exporter_principal_id','circle_package_digest','export_record_digest','membership_digest',
    'snapshot_evidence_ref','snapshot_evidence_digest','record_observations_digest',
    'history_retention_only','requires_disclosure_authorization',
    'requires_external_snapshot_verification','requires_external_record_evidence_verification',
    'portable_authority',
    'authority_effect','governance_effect','export_effect','network_effect','runtime_activation'
  ]);
  if(
    document.schema!==CIRCLE_EXPORT_RETENTION_EVIDENCE_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-retention-evidence'
    ||document.history_retention_only!==true
    ||document.requires_disclosure_authorization!==true
    ||document.requires_external_snapshot_verification!==true
    ||document.requires_external_record_evidence_verification!==true
    ||document.portable_authority!==false
    ||document.authority_effect!=='none'
    ||document.governance_effect!=='none'
    ||document.export_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Circle export retention evidence activation boundary is invalid');

  if(typeof document.evidence_id!=='string'||!EVIDENCE_ID.test(document.evidence_id)){
    throw new ValidationError('evidence_id is invalid');
  }
  id(document.circle_id,'circle_id');
  id(document.export_id,'export_id');
  id(document.membership_id,'membership_id');
  id(document.exporter_principal_id,'exporter_principal_id');
  digest(document.circle_package_digest,'circle_package_digest');
  digest(document.export_record_digest,'export_record_digest');
  digest(document.membership_digest,'membership_digest');
  id(document.snapshot_evidence_ref,'snapshot_evidence_ref');
  digest(document.snapshot_evidence_digest,'snapshot_evidence_digest');
  digest(document.record_observations_digest,'record_observations_digest');

  if(document.evidence_id!==deriveCircleExportRetentionEvidenceId(document)){
    throw new ValidationError('evidence_id does not match canonical retention evidence identity');
  }

  return Object.freeze({
    valid:true,
    schema:document.schema,
    evidence_id:document.evidence_id,
    evidence_digest:digestObject(document),
    history_retention_only:true,
    requires_disclosure_authorization:true,
    requires_external_snapshot_verification:true,
    requires_external_record_evidence_verification:true,
    portable_authority:false,
    authority_effect:'none',
    governance_effect:'none',
    export_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function circleExportRetentionEvidenceDigest(document){
  validateCircleExportRetentionEvidence(document);
  return digestObject(document);
}

export function circleExportRecordObservationsDigest(observations){
  return digestObject(normalizeRecordObservations(observations));
}

export function assessCircleExportRetention({
  packageDocument,
  evidence,
  snapshotEvidence,
  recordObservations
}){
  const packageResult=validateCircleCorePackage(packageDocument);
  validateCircleExportRetentionEvidence(evidence);
  validateSnapshotEvidence(snapshotEvidence);
  const observations=normalizeRecordObservations(recordObservations);

  const reasons=[];
  if(packageDocument.circle.circle_id!==evidence.circle_id)reasons.push('circle-id-mismatch');
  if(packageResult.package_digest!==evidence.circle_package_digest){
    reasons.push('circle-package-digest-mismatch');
  }
  if(circleExportRecordObservationsDigest(observations)!==evidence.record_observations_digest){
    reasons.push('record-observations-digest-mismatch');
  }

  const exportRecord=packageDocument.exports.find(item=>item.export_id===evidence.export_id);
  const membership=packageDocument.memberships.find(item=>item.membership_id===evidence.membership_id);

  let exportAt=null;
  let cutoffAt=null;
  if(!exportRecord){
    reasons.push('export-record-not-found');
  }else{
    exportAt=canonicalDate(exportRecord.exported_at,'Circle export exported_at');
    if(exportRecord.circle_id!==evidence.circle_id)reasons.push('export-circle-mismatch');
    if(exportRecord.exported_by!==evidence.exporter_principal_id){
      reasons.push('exporter-principal-mismatch');
    }
    if(digestObject(exportRecord)!==evidence.export_record_digest){
      reasons.push('export-record-digest-mismatch');
    }
  }

  if(!membership){
    reasons.push('membership-not-found');
  }else{
    if(membership.circle_id!==evidence.circle_id)reasons.push('membership-circle-mismatch');
    if(membership.principal_id!==evidence.exporter_principal_id){
      reasons.push('exporter-principal-mismatch');
    }
    if(digestObject(membership)!==evidence.membership_digest){
      reasons.push('membership-digest-mismatch');
    }
    if(exportAt!==null){
      const acceptedAt=canonicalDate(membership.accepted_at,'Circle membership accepted_at');
      const statusEffectiveAt=canonicalDate(
        membership.status_effective_at,
        'Circle membership status_effective_at'
      );
      if(acceptedAt>exportAt)reasons.push('membership-after-export');
      if(statusEffectiveAt>exportAt)reasons.push('membership-status-after-export');

      const cutoffCandidates=[];
      if(membership.status!=='active'&&statusEffectiveAt<=exportAt){
        cutoffCandidates.push(statusEffectiveAt);
      }
      for(const exit of packageDocument.exits){
        if(exit.membership_id!==membership.membership_id)continue;
        const effectiveAt=canonicalDate(exit.effective_at,'Circle exit effective_at');
        if(effectiveAt<=exportAt)cutoffCandidates.push(effectiveAt);
      }
      if(cutoffCandidates.length){
        cutoffAt=Math.min(...cutoffCandidates);
      }
    }
  }

  if(snapshotEvidence.evidence_ref!==evidence.snapshot_evidence_ref){
    reasons.push('snapshot-evidence-ref-mismatch');
  }
  if(snapshotEvidence.evidence_digest!==evidence.snapshot_evidence_digest){
    reasons.push('snapshot-evidence-digest-mismatch');
  }
  if(snapshotEvidence.circle_id!==evidence.circle_id)reasons.push('snapshot-circle-mismatch');
  if(snapshotEvidence.package_digest!==packageResult.package_digest){
    reasons.push('snapshot-package-digest-mismatch');
  }
  if(snapshotEvidence.charter_digest!==packageResult.charter_digest){
    reasons.push('snapshot-charter-digest-mismatch');
  }
  if(exportRecord&&snapshotEvidence.observed_at!==exportRecord.exported_at){
    reasons.push('snapshot-time-mismatch');
  }

  const inventory=buildRecordInventory(packageDocument);
  const observationByDigest=new Map(observations.map(item=>[item.record_digest,item]));
  const includedSet=new Set(exportRecord?.included_record_digests??[]);
  for(const observation of observations){
    if(!includedSet.has(observation.record_digest)){
      reasons.push('record-observation-not-in-export:'+observation.record_digest);
    }
  }

  const includedRecords=[];
  if(exportRecord&&exportAt!==null){
    for(const recordDigest of exportRecord.included_record_digests){
      const matches=inventory.get(recordDigest)??[];
      if(matches.length===0){
        reasons.push('included-record-not-found:'+recordDigest);
        continue;
      }
      if(matches.length>1){
        reasons.push('included-record-ambiguous:'+recordDigest);
        continue;
      }
      const record=matches[0];
      const recordAt=canonicalDate(record.effective_at,'Circle record effective_at');
      if(recordAt>exportAt){
        reasons.push('record-after-export:'+recordDigest);
      }
      if(cutoffAt!==null&&recordAt>cutoffAt){
        reasons.push('record-after-participation-cutoff:'+recordDigest);
      }

      const observation=observationByDigest.get(recordDigest);
      if(!observation){
        reasons.push('record-observation-missing:'+recordDigest);
      }else{
        const observedAt=canonicalDate(observation.observed_at,'Circle record observation observed_at');
        if(observedAt>exportAt){
          reasons.push('record-observed-after-export:'+recordDigest);
        }
        if(cutoffAt!==null&&observedAt>cutoffAt){
          reasons.push('record-observed-after-participation-cutoff:'+recordDigest);
        }
      }

      includedRecords.push(Object.freeze({
        digest:recordDigest,
        kind:record.kind,
        record_id:record.record_id,
        effective_at:record.effective_at,
        observed_at:observation?.observed_at??null
      }));
    }
  }

  const uniqueReasons=[...new Set(reasons)].sort();
  return Object.freeze({
    schema:'axiom-circle-export-retention-assessment.v0',
    eligible_for_disclosure_review:uniqueReasons.length===0,
    reasons:Object.freeze(uniqueReasons),
    circle_id:evidence.circle_id,
    export_id:evidence.export_id,
    membership_id:evidence.membership_id,
    exporter_principal_id:evidence.exporter_principal_id,
    retention_state:cutoffAt===null?'active-member-history':'post-participation-history',
    participation_cutoff_at:cutoffAt===null?null:new Date(cutoffAt).toISOString(),
    included_records:Object.freeze(includedRecords),
    evidence_digest:digestObject(evidence),
    package_digest:packageResult.package_digest,
    record_observations_digest:circleExportRecordObservationsDigest(observations),
    requires_external_snapshot_verification:true,
    snapshot_verification_effect:'none',
    requires_external_record_evidence_verification:true,
    record_evidence_verification_effect:'none',
    requires_disclosure_authorization:true,
    portable_authority:false,
    authority_effect:'none',
    governance_effect:'none',
    export_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function buildRecordInventory(packageDocument){
  const records=[
    recordEntry('circle',packageDocument.circle.circle_id,packageDocument.circle,packageDocument.circle.created_at),
    recordEntry(
      'charter',
      packageDocument.charter.circle_id+':charter:'+packageDocument.charter.version,
      packageDocument.charter,
      packageDocument.charter.effective_from
    )
  ];

  for(const item of packageDocument.invitations){
    records.push(recordEntry('invitation',item.invitation_id,item,item.issued_at));
  }
  for(const item of packageDocument.memberships){
    records.push(recordEntry(
      'membership',
      item.membership_id,
      item,
      laterTimestamp(item.accepted_at,item.status_effective_at)
    ));
  }
  for(const item of packageDocument.proposals){
    records.push(recordEntry('proposal',item.proposal_id,item,item.created_at));
  }
  for(const item of packageDocument.tasks){
    records.push(recordEntry('task',item.task_id,item,item.created_at));
  }
  for(const item of packageDocument.decisions){
    records.push(recordEntry('decision',item.decision_id,item,item.decided_at));
  }
  for(const item of packageDocument.appeals){
    records.push(recordEntry(
      'appeal',
      item.appeal_id,
      item,
      item.resolved_at===null?item.filed_at:laterTimestamp(item.filed_at,item.resolved_at)
    ));
  }
  for(const item of packageDocument.exits){
    records.push(recordEntry('exit',item.exit_id,item,item.effective_at));
  }
  for(const item of packageDocument.exports){
    records.push(recordEntry('export',item.export_id,item,item.exported_at));
  }

  const inventory=new Map();
  for(const record of records){
    const list=inventory.get(record.digest)??[];
    list.push(record);
    inventory.set(record.digest,list);
  }
  return inventory;
}

function recordEntry(kind,recordId,record,effectiveAt){
  canonicalDate(effectiveAt,'Circle record effective_at');
  return Object.freeze({
    kind,
    record_id:recordId,
    digest:digestObject(record),
    effective_at:effectiveAt
  });
}

function normalizeRecordObservations(value){
  if(!Array.isArray(value)||value.length>4096){
    throw new ValidationError('Circle record observations must contain at most 4096 entries');
  }
  const seen=new Set();
  const normalized=value.map(item=>{
    exactObject(item,'Circle record observation',[
      'record_digest','evidence_ref','evidence_digest','observed_at'
    ]);
    digest(item.record_digest,'record observation record_digest');
    id(item.evidence_ref,'record observation evidence_ref');
    digest(item.evidence_digest,'record observation evidence_digest');
    canonicalDate(item.observed_at,'record observation observed_at');
    if(seen.has(item.record_digest)){
      throw new ValidationError('Duplicate Circle record observation digest');
    }
    seen.add(item.record_digest);
    return Object.freeze({...item});
  });
  return Object.freeze(normalized.sort((a,b)=>a.record_digest.localeCompare(b.record_digest)));
}

function validateSnapshotEvidence(value){
  exactObject(value,'Circle export snapshot evidence',[
    'evidence_ref','evidence_digest','observed_at','circle_id','package_digest','charter_digest'
  ]);
  id(value.evidence_ref,'snapshot evidence_ref');
  digest(value.evidence_digest,'snapshot evidence_digest');
  canonicalDate(value.observed_at,'snapshot observed_at');
  id(value.circle_id,'snapshot circle_id');
  digest(value.package_digest,'snapshot package_digest');
  digest(value.charter_digest,'snapshot charter_digest');
}

function laterTimestamp(left,right){
  const leftMs=canonicalDate(left,'timestamp');
  const rightMs=canonicalDate(right,'timestamp');
  return leftMs>=rightMs?left:right;
}

function exactObject(value,label,fields){
  if(!value||typeof value!=='object'||Array.isArray(value)){
    throw new ValidationError(label+' must be an object');
  }
  const actual=Object.keys(value).sort().join(',');
  const expected=[...fields].sort().join(',');
  if(actual!==expected)throw new ValidationError(label+' fields are invalid');
}
function id(value,label){
  if(typeof value!=='string'||!ID.test(value))throw new ValidationError(label+' is invalid');
}
function digest(value,label){
  if(typeof value!=='string'||!DIGEST.test(value)){
    throw new ValidationError(label+' must be a lowercase sha256 digest');
  }
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

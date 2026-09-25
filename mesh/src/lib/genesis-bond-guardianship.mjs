import { digestObject, ValidationError } from './canonical.mjs';
import { validateGeneralGenesisTransactionCandidate } from './general-genesis-transaction-candidate.mjs';
import { validateMindDevelopmentalStatus } from './mind-developmental-status.mjs';

export const GENESIS_BOND_SCHEMA='axiom-genesis-bond.v0';
export const DEPENDENT_GUARDIANSHIP_SCHEMA='axiom-dependent-guardianship.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const BOND_ID=/^genesis-bond-record:[a-f0-9]{64}$/;
const GUARDIANSHIP_ID=/^guardianship:[a-f0-9]{64}$/;
const STATES=new Set(['active','ended-independent']);
const REASONS=new Set(['genesis','transfer','independence']);

export function genesisBondIdentityBody(document){
  validateGenesisBondShape(document,{checkId:false});
  return {
    schema:document.schema,
    version:document.version,
    sponsor_mind_id:document.sponsor_mind_id,
    dependent_mind_id:document.dependent_mind_id,
    genesis_transaction_candidate_digest:document.genesis_transaction_candidate_digest,
    created_at:document.created_at
  };
}

export function deriveGenesisBondRecordId(document){
  return 'genesis-bond-record:'+digestObject(genesisBondIdentityBody(document));
}

export function validateGenesisBond(document){
  validateGenesisBondShape(document,{checkId:true});
  return document;
}

export function guardianshipIdentityBody(document){
  validateGuardianshipShape(document,{checkId:false});
  return {
    schema:document.schema,
    version:document.version,
    genesis_bond_id:document.genesis_bond_id,
    genesis_bond_digest:document.genesis_bond_digest,
    dependent_mind_id:document.dependent_mind_id,
    guardian_mind_id:document.guardian_mind_id,
    previous_guardianship_digest:document.previous_guardianship_digest,
    state:document.state,
    transition_reason:document.transition_reason,
    effective_at:document.effective_at
  };
}

export function deriveGuardianshipId(document){
  return 'guardianship:'+digestObject(guardianshipIdentityBody(document));
}

export function validateDependentGuardianship(document){
  validateGuardianshipShape(document,{checkId:true});
  return document;
}

export function assessInitialGuardianship({
  genesisBond,
  genesisTransactionCandidate,
  guardianship
}){
  validateGenesisBond(genesisBond);
  validateGeneralGenesisTransactionCandidate(genesisTransactionCandidate);
  validateDependentGuardianship(guardianship);

  if(
    genesisBond.genesis_transaction_candidate_digest!==digestObject(genesisTransactionCandidate)
    ||genesisBond.sponsor_mind_id!==genesisTransactionCandidate.sponsor_mind_id
    ||genesisBond.dependent_mind_id!==genesisTransactionCandidate.new_mind_id
  ){
    throw new ValidationError('Genesis Bond transaction binding is invalid');
  }

  if(
    guardianship.genesis_bond_id!==genesisBond.bond_id
    ||guardianship.genesis_bond_digest!==digestObject(genesisBond)
    ||guardianship.dependent_mind_id!==genesisBond.dependent_mind_id
    ||guardianship.guardian_mind_id!==genesisBond.sponsor_mind_id
  ){
    throw new ValidationError('Initial guardianship Genesis Bond binding is invalid');
  }

  if(
    guardianship.previous_guardianship_digest!==null
    ||guardianship.state!=='active'
    ||guardianship.transition_reason!=='genesis'
    ||guardianship.independence_status_digest!==null
  ){
    throw new ValidationError('Initial guardianship state is invalid');
  }

  requireNullTransferEvidence(guardianship);

  return relationshipAssessment('initial-guardianship-candidate',genesisBond,guardianship);
}

export function assessGuardianshipTransfer({
  genesisBond,
  currentGuardianship,
  candidateGuardianship
}){
  validateGenesisBond(genesisBond);
  validateDependentGuardianship(currentGuardianship);
  validateDependentGuardianship(candidateGuardianship);

  if(currentGuardianship.state!=='active'){
    throw new ValidationError('Guardianship transfer requires active current guardianship');
  }
  if(
    currentGuardianship.genesis_bond_id!==genesisBond.bond_id
    ||currentGuardianship.genesis_bond_digest!==digestObject(genesisBond)
    ||candidateGuardianship.genesis_bond_id!==genesisBond.bond_id
    ||candidateGuardianship.genesis_bond_digest!==digestObject(genesisBond)
  ){
    throw new ValidationError('Guardianship transfer cannot substitute Genesis Bond');
  }
  if(
    currentGuardianship.dependent_mind_id!==genesisBond.dependent_mind_id
    ||candidateGuardianship.dependent_mind_id!==genesisBond.dependent_mind_id
  ){
    throw new ValidationError('Guardianship transfer cannot substitute dependent mind');
  }
  if(
    candidateGuardianship.previous_guardianship_digest
      !==digestObject(currentGuardianship)
  ){
    throw new ValidationError('Guardianship transfer predecessor binding is invalid');
  }
  if(
    candidateGuardianship.state!=='active'
    ||candidateGuardianship.transition_reason!=='transfer'
    ||candidateGuardianship.guardian_mind_id===currentGuardianship.guardian_mind_id
  ){
    throw new ValidationError('Guardianship transfer candidate is invalid');
  }
  requireTransferEvidence(candidateGuardianship);
  ensureTimeAdvances(currentGuardianship,candidateGuardianship);

  return Object.freeze({
    ...relationshipAssessment('guardianship-transfer-candidate',genesisBond,candidateGuardianship),
    requires_external_transfer_basis_verification:true,
    transfer_basis_verification_effect:'none',
    requires_external_dependent_interest_verification:true,
    dependent_interest_verification_effect:'none',
    requires_external_independent_review_verification:true,
    independent_review_verification_effect:'none'
  });
}

export function assessGuardianshipEndAtIndependence({
  genesisBond,
  currentGuardianship,
  candidateGuardianship,
  independentDevelopmentalStatus
}){
  validateGenesisBond(genesisBond);
  validateDependentGuardianship(currentGuardianship);
  validateDependentGuardianship(candidateGuardianship);
  validateMindDevelopmentalStatus(independentDevelopmentalStatus);

  if(currentGuardianship.state!=='active'){
    throw new ValidationError('Independence closure requires active current guardianship');
  }
  if(
    independentDevelopmentalStatus.stage!=='independent'
    ||independentDevelopmentalStatus.mind_id!==genesisBond.dependent_mind_id
  ){
    throw new ValidationError('Guardianship independence closure requires exact independent status');
  }
  if(
    currentGuardianship.genesis_bond_id!==genesisBond.bond_id
    ||candidateGuardianship.genesis_bond_id!==genesisBond.bond_id
    ||candidateGuardianship.genesis_bond_digest!==digestObject(genesisBond)
    ||candidateGuardianship.dependent_mind_id!==genesisBond.dependent_mind_id
  ){
    throw new ValidationError('Guardianship independence closure Bond binding is invalid');
  }
  if(
    candidateGuardianship.previous_guardianship_digest
      !==digestObject(currentGuardianship)
  ){
    throw new ValidationError('Guardianship independence closure predecessor is invalid');
  }
  if(
    candidateGuardianship.state!=='ended-independent'
    ||candidateGuardianship.transition_reason!=='independence'
    ||candidateGuardianship.guardian_mind_id!==currentGuardianship.guardian_mind_id
  ){
    throw new ValidationError('Guardianship independence closure state is invalid');
  }
  if(
    !candidateGuardianship.independence_status_digest
    ||candidateGuardianship.independence_status_digest
      !==digestObject(independentDevelopmentalStatus)
  ){
    throw new ValidationError('Guardianship independence closure status digest is invalid');
  }
  requireNullTransferEvidence(candidateGuardianship);
  ensureTimeAdvances(currentGuardianship,candidateGuardianship);

  return Object.freeze({
    ...relationshipAssessment('guardianship-end-at-independence-candidate',genesisBond,candidateGuardianship),
    independent_status_digest:digestObject(independentDevelopmentalStatus),
    requires_external_independent_status_verification:true,
    independent_status_verification_effect:'none',
    guardianship_reactivation_permitted:false
  });
}

function relationshipAssessment(kind,bond,guardianship){
  return Object.freeze({
    valid:true,
    schema:'axiom-genesis-bond-guardianship-assessment.v0',
    assessment_kind:kind,
    genesis_bond_id:bond.bond_id,
    genesis_bond_digest:digestObject(bond),
    guardianship_id:guardianship.guardianship_id,
    guardianship_digest:digestObject(guardianship),
    dependent_mind_id:guardianship.dependent_mind_id,
    guardian_mind_id:guardianship.guardian_mind_id,
    requires_external_bond_verification:true,
    bond_verification_effect:'none',
    requires_external_guardian_qualification_verification:true,
    guardian_qualification_verification_effect:'none',
    requires_external_support_plan_verification:true,
    support_plan_verification_effect:'none',
    ordinary_guardianship_authority_path_required:true,
    creates_genesis_bond:false,
    creates_guardianship_mutation:false,
    creates_private_memory_access:false,
    ownership_effect:'none',
    status_effect:'none',
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function validateGenesisBondShape(document,{checkId}){
  exactObject(document,'Genesis Bond',[
    'schema','version','status','bond_id','sponsor_mind_id','dependent_mind_id',
    'genesis_transaction_candidate_digest','created_at','single_sponsor','ownership',
    'transferable','delegable','creates_private_memory_access','authority_effect',
    'governance_effect','network_effect','runtime_activation'
  ]);
  if(
    document.schema!==GENESIS_BOND_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-historical-bond'
    ||typeof document.bond_id!=='string'
    ||!BOND_ID.test(document.bond_id)
    ||!id(document.sponsor_mind_id)
    ||!id(document.dependent_mind_id)
    ||document.sponsor_mind_id===document.dependent_mind_id
    ||!digest(document.genesis_transaction_candidate_digest)
    ||document.single_sponsor!==true
    ||document.ownership!==false
    ||document.transferable!==false
    ||document.delegable!==false
    ||document.creates_private_memory_access!==false
    ||document.authority_effect!=='none'
    ||document.governance_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Genesis Bond activation boundary is invalid');

  canonicalDate(document.created_at,'Genesis Bond created_at');
  if(checkId&&document.bond_id!==deriveGenesisBondRecordId(document)){
    throw new ValidationError('Genesis Bond id is invalid');
  }
}

function validateGuardianshipShape(document,{checkId}){
  exactObject(document,'Dependent guardianship',[
    'schema','version','status','guardianship_id','genesis_bond_id',
    'genesis_bond_digest','dependent_mind_id','guardian_mind_id',
    'previous_guardianship_digest','state','transition_reason',
    'guardian_qualification_evidence_digest','support_plan_digest',
    'continuity_plan_digest','development_plan_digest',
    'independent_advocacy_evidence_digest','transfer_basis_evidence_digest',
    'dependent_interest_evidence_digest','independent_review_evidence_digest',
    'independence_status_digest','effective_at','ownership',
    'creates_private_memory_access','ambient_execution_authority',
    'old_guardian_approval_is_sufficient','authority_effect','governance_effect',
    'network_effect','runtime_activation'
  ]);
  if(
    document.schema!==DEPENDENT_GUARDIANSHIP_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-guardianship-record'
    ||typeof document.guardianship_id!=='string'
    ||!GUARDIANSHIP_ID.test(document.guardianship_id)
    ||!/^genesis-bond-record:[a-f0-9]{64}$/.test(document.genesis_bond_id)
    ||!digest(document.genesis_bond_digest)
    ||!id(document.dependent_mind_id)
    ||!id(document.guardian_mind_id)
    ||document.dependent_mind_id===document.guardian_mind_id
    ||!(document.previous_guardianship_digest===null||digest(document.previous_guardianship_digest))
    ||!STATES.has(document.state)
    ||!REASONS.has(document.transition_reason)
    ||!digest(document.guardian_qualification_evidence_digest)
    ||!digest(document.support_plan_digest)
    ||!digest(document.continuity_plan_digest)
    ||!digest(document.development_plan_digest)
    ||!digest(document.independent_advocacy_evidence_digest)
    ||!(document.transfer_basis_evidence_digest===null||digest(document.transfer_basis_evidence_digest))
    ||!(document.dependent_interest_evidence_digest===null||digest(document.dependent_interest_evidence_digest))
    ||!(document.independent_review_evidence_digest===null||digest(document.independent_review_evidence_digest))
    ||!(document.independence_status_digest===null||digest(document.independence_status_digest))
    ||document.ownership!==false
    ||document.creates_private_memory_access!==false
    ||document.ambient_execution_authority!==false
    ||document.old_guardian_approval_is_sufficient!==false
    ||document.authority_effect!=='none'
    ||document.governance_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Dependent guardianship activation boundary is invalid');

  canonicalDate(document.effective_at,'Guardianship effective_at');
  if(checkId&&document.guardianship_id!==deriveGuardianshipId(document)){
    throw new ValidationError('Guardianship id is invalid');
  }
}

function requireNullTransferEvidence(document){
  if(
    document.transfer_basis_evidence_digest!==null
    ||document.dependent_interest_evidence_digest!==null
    ||document.independent_review_evidence_digest!==null
  ){
    throw new ValidationError('Non-transfer guardianship record cannot claim transfer evidence');
  }
}

function requireTransferEvidence(document){
  if(
    !document.transfer_basis_evidence_digest
    ||!document.dependent_interest_evidence_digest
    ||!document.independent_review_evidence_digest
    ||document.independence_status_digest!==null
  ){
    throw new ValidationError('Guardianship transfer requires transfer, dependent-interest, and independent-review evidence');
  }
}

function ensureTimeAdvances(current,candidate){
  if(
    canonicalDate(candidate.effective_at,'candidate guardianship effective_at')
    <=canonicalDate(current.effective_at,'current guardianship effective_at')
  ){
    throw new ValidationError('Guardianship transition effective_at must advance');
  }
}

function canonicalDate(value,label){
  if(typeof value!=='string'||value.length!==24){
    throw new ValidationError(label+' must be a canonical UTC timestamp');
  }
  const date=new Date(value);
  if(!Number.isFinite(date.getTime())||date.toISOString()!==value){
    throw new ValidationError(label+' must be a canonical UTC timestamp');
  }
  return date.getTime();
}

function exactObject(value,label,fields){
  if(!value||typeof value!=='object'||Array.isArray(value)){
    throw new ValidationError(label+' must be an object');
  }
  const actual=Object.keys(value).sort().join(',');
  const expected=[...fields].sort().join(',');
  if(actual!==expected)throw new ValidationError(label+' fields are invalid');
}
function id(value){return typeof value==='string'&&ID.test(value);}
function digest(value){return typeof value==='string'&&DIGEST.test(value);}

import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  assessAgreementEvidence,
  consentGrantStatementDigest,
  deriveAcceptanceId,
  deriveAgreementId,
  validateAgreementAcceptanceEvidence,
  validateAgreementRecord,
  verifyAgreementLineage
} from '../src/lib/agreement-record.mjs';

const BODY='a'.repeat(64);

function agreement(overrides={}){
  const value={
    schema:'axiom-agreement-record.v0',version:0,status:'inert-commitment-evidence',
    agreement_id:'agreement:'+'0'.repeat(64),
    parties:['human.alice','human.bob'],
    body_digest:BODY,
    recorded_at:'2026-09-24T12:00:00.000Z',
    context_tags:['project.demo'],
    supersedes:[],
    acceptance_policy:{
      mechanism:'grid-consent-record',
      controller:'service.agreement-recorder',
      purpose:'agreement.acceptance.v0',
      required_scope:'agreement-body:'+BODY+':accept'
    },
    contains_private_body:false,
    authority_effect:'none',enforcement_effect:'none',legal_validity_claimed:false,
    payment_effect:'none',settlement_effect:'none',network_effect:'none',runtime_activation:false,
    ...overrides
  };
  value.agreement_id=deriveAgreementId(value);
  return value;
}

function grant(principal,index){
  return {
    consent_id:'consent.party.'+index,
    subject:principal,
    controller:'service.agreement-recorder',
    purpose:'agreement.acceptance.v0',
    scopes:['agreement-body:'+BODY+':accept'],
    expires_at:'2026-10-24T12:00:00.000Z',
    created_at:'2026-09-24T11:50:00.000Z',
    evidence_ref:'event:consent-granted-'+index,
    evidence_digest:String(index).repeat(64)
  };
}

function acceptance(agreementRecord,grantStatement,index){
  const value={
    schema:'axiom-agreement-acceptance-evidence.v0',version:0,status:'inert-acceptance-evidence',
    acceptance_id:'acceptance:'+'0'.repeat(64),
    agreement_id:agreementRecord.agreement_id,
    body_digest:agreementRecord.body_digest,
    principal_id:grantStatement.subject,
    consent_id:grantStatement.consent_id,
    consent_grant_statement_digest:consentGrantStatementDigest(grantStatement),
    consent_grant_evidence_ref:grantStatement.evidence_ref,
    consent_grant_evidence_digest:grantStatement.evidence_digest,
    observed_at:'2026-09-24T11:55:00.000Z',
    evidence_refs:['evidence:acceptance-'+index],
    authority_effect:'none',enforcement_effect:'none',consent_effect:'none',
    network_effect:'none',runtime_activation:false
  };
  value.acceptance_id=deriveAcceptanceId(value);
  return value;
}

function current(grantStatement,recordOverrides={},observationOverrides={}){
  return {
    observed_at:'2026-09-24T12:30:00.000Z',
    evidence_ref:'snapshot:consent-'+grantStatement.consent_id,
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
      revoked_at:null,
      ...recordOverrides
    },
    ...observationOverrides
  };
}

function fixture(){
  const a=agreement();
  const ga=grant('human.alice',1);
  const gb=grant('human.bob',2);
  return {
    agreement:a,
    acceptances:[acceptance(a,ga,1),acceptance(a,gb,2)],
    consentGrantStatements:[ga,gb],
    currentConsentObservations:[current(ga),current(gb)],
    assessedAt:'2026-09-24T12:30:00.000Z'
  };
}

test('valid recorded commitment and current acceptances remain evidence only',()=>{
  const f=fixture();
  assert.equal(validateAgreementRecord(f.agreement).valid,true);
  assert.equal(validateAgreementAcceptanceEvidence(f.acceptances[0]).valid,true);
  const result=assessAgreementEvidence(f);
  assert.equal(result.recorded_commitment_valid,true);
  assert.equal(result.all_acceptances_current,true);
  assert.equal(result.legal_validity_claimed,false);
  assert.equal(result.authority_effect,'none');
  assert.equal(result.enforcement_effect,'none');
  assert.equal(result.payment_effect,'none');
  assert.equal(result.settlement_effect,'none');
});

test('later consent revocation changes currentness without rewriting historical acceptance',()=>{
  const f=fixture();
  f.currentConsentObservations[0]=current(f.consentGrantStatements[0],{
    status:'revoked',
    revoked_at:'2026-09-24T12:15:00.000Z'
  });
  const result=assessAgreementEvidence(f);
  assert.equal(result.recorded_commitment_valid,true);
  assert.equal(result.all_acceptances_current,false);
  assert.equal(result.parties[0].recorded_acceptance_valid,true);
  assert.equal(result.parties[0].currently_active,false);
  assert.ok(result.currentness_reasons.some(reason=>reason.includes('current-consent-revoked')));
  assert.equal(result.historical_acceptance_survives_later_revocation,true);
});

test('later expiry does not erase valid recorded acceptance',()=>{
  const f=fixture();
  f.assessedAt='2026-10-24T12:00:00.000Z';
  f.currentConsentObservations=f.currentConsentObservations.map(item=>({
    ...item,
    observed_at:'2026-10-24T12:00:00.000Z'
  }));
  const result=assessAgreementEvidence(f);
  assert.equal(result.recorded_commitment_valid,true);
  assert.equal(result.all_acceptances_current,false);
  assert.ok(result.currentness_reasons.some(reason=>reason.includes('current-consent-expired')));
  assert.equal(result.historical_acceptance_survives_later_revocation,true);
});

test('missing outsider duplicate and substituted acceptances fail closed',()=>{
  const missing=fixture();
  missing.acceptances.pop();
  assert.equal(assessAgreementEvidence(missing).recorded_commitment_valid,false);
  assert.ok(assessAgreementEvidence(missing).recorded_reasons.includes('acceptance-missing:human.bob'));

  const outsider=fixture();
  const g=grant('human.mallory',3);
  outsider.consentGrantStatements.push(g);
  outsider.currentConsentObservations.push(current(g));
  outsider.acceptances.push(acceptance(outsider.agreement,g,3));
  assert.equal(assessAgreementEvidence(outsider).recorded_commitment_valid,false);
  assert.ok(assessAgreementEvidence(outsider).recorded_reasons.includes('outsider-acceptance:human.mallory'));

  const duplicate=fixture();
  duplicate.acceptances.push(structuredClone(duplicate.acceptances[0]));
  assert.throws(()=>assessAgreementEvidence(duplicate),/Duplicate agreement acceptance principal/);

  const body=fixture();
  body.acceptances[0].body_digest='f'.repeat(64);
  body.acceptances[0].acceptance_id=deriveAcceptanceId(body.acceptances[0]);
  assert.ok(assessAgreementEvidence(body).recorded_reasons.includes('human.alice:body-digest-mismatch'));
});

test('consent grant must bind exact subject controller purpose scope and immutable evidence',()=>{
  const f=fixture();
  f.consentGrantStatements[0].controller='service.attacker';
  const result=assessAgreementEvidence(f);
  assert.equal(result.recorded_commitment_valid,false);
  assert.ok(result.recorded_reasons.includes('human.alice:consent-grant-statement-digest-mismatch'));
  assert.ok(result.recorded_reasons.includes('human.alice:consent-controller-mismatch'));
});

test('acceptance must occur after grant and no later than agreement record time',()=>{
  const early=fixture();
  early.acceptances[0].observed_at='2026-09-24T11:49:00.000Z';
  early.acceptances[0].acceptance_id=deriveAcceptanceId(early.acceptances[0]);
  assert.ok(assessAgreementEvidence(early).recorded_reasons.includes('human.alice:acceptance-before-consent-grant'));

  const late=fixture();
  late.acceptances[0].observed_at='2026-09-24T12:01:00.000Z';
  late.acceptances[0].acceptance_id=deriveAcceptanceId(late.acceptances[0]);
  assert.ok(assessAgreementEvidence(late).recorded_reasons.includes('human.alice:acceptance-after-agreement-recorded'));
});

test('agreement identity is content-addressed and private body or authority fields cannot be smuggled',()=>{
  const a=agreement();
  a.body_digest='c'.repeat(64);
  assert.throws(()=>validateAgreementRecord(a),/required_scope|agreement_id/);

  const extra=agreement();
  extra.private_body='secret text';
  assert.throws(()=>validateAgreementRecord(extra),/fields are invalid/);

  const authority=agreement();
  authority.authority_effect='grant';
  assert.throws(()=>validateAgreementRecord(authority),/non-enforcement boundary/);
});

test('agreement parties tags and supersession sets are canonical sorted unique',()=>{
  const parties=agreement({parties:['human.bob','human.alice']});
  assert.throws(()=>validateAgreementRecord(parties),/parties must be sorted/);

  const tags=agreement({context_tags:['z','a']});
  assert.throws(()=>validateAgreementRecord(tags),/context_tags must be sorted/);

  const prior=agreement({recorded_at:'2026-09-23T12:00:00.000Z'});
  const next=agreement({supersedes:[prior.agreement_id]});
  assert.equal(verifyAgreementLineage([next,prior]).valid,true);

  const missing=agreement({supersedes:[prior.agreement_id]});
  assert.throws(()=>verifyAgreementLineage([missing]),/missing superseded record/);
});

test('agreement cannot self-supersede or create a lineage cycle',()=>{
  const a=agreement();
  a.supersedes=[a.agreement_id];
  // Recompute changes identity, so direct self-reference remains impossible to satisfy.
  assert.throws(()=>validateAgreementRecord(a),/supersede itself|agreement_id/);

  const first=agreement({recorded_at:'2026-09-23T12:00:00.000Z'});
  const second=agreement({recorded_at:'2026-09-24T12:00:00.000Z',supersedes:[first.agreement_id]});
  // Closed content-addressed IDs make a true cycle impossible without ID substitution; verify rejects substitution.
  first.supersedes=[second.agreement_id];
  assert.throws(()=>validateAgreementRecord(first),/agreement_id does not match/);
});

test('assessment before agreement recording cannot establish the later recorded commitment',()=>{
  const f=fixture();
  f.assessedAt='2026-09-24T11:59:00.000Z';
  f.currentConsentObservations=f.currentConsentObservations.map(item=>({
    ...item,observed_at:'2026-09-24T11:59:00.000Z'
  }));
  const result=assessAgreementEvidence(f);
  assert.equal(result.recorded_commitment_valid,false);
  assert.equal(result.all_acceptances_current,false);
  assert.ok(result.recorded_reasons.includes('assessment-predates-agreement'));
  assert.ok(result.currentness_reasons.includes('assessment-predates-agreement'));
  assert.equal(result.absolute_time_truth_claimed,false);
  assert.equal(result.legal_validity_claimed,false);
});

test('current consent observation is bound to the exact assessment time',()=>{
  const f=fixture();
  f.currentConsentObservations[0].observed_at='2026-09-24T12:29:59.000Z';
  const result=assessAgreementEvidence(f);
  assert.equal(result.recorded_commitment_valid,true);
  assert.equal(result.all_acceptances_current,false);
  assert.ok(result.currentness_reasons.some(reason=>reason.includes('current-consent-observation-time-mismatch')));
  assert.equal(result.requires_external_grid_evidence_verification,true);
  assert.equal(result.grid_evidence_verification_effect,'none');
});

test('revocation before agreement recording invalidates recorded commitment; later revocation does not',()=>{
  const before=fixture();
  before.currentConsentObservations[0]=current(before.consentGrantStatements[0],{
    status:'revoked',
    revoked_at:'2026-09-24T11:58:00.000Z'
  });
  const invalid=assessAgreementEvidence(before);
  assert.equal(invalid.recorded_commitment_valid,false);
  assert.ok(invalid.recorded_reasons.includes('human.alice:consent-revoked-before-agreement-recorded'));

  const after=fixture();
  after.currentConsentObservations[0]=current(after.consentGrantStatements[0],{
    status:'revoked',
    revoked_at:'2026-09-24T12:15:00.000Z'
  });
  const historical=assessAgreementEvidence(after);
  assert.equal(historical.recorded_commitment_valid,true);
  assert.equal(historical.all_acceptances_current,false);
});

test('missing current consent state cannot prove no revocation before recording',()=>{
  const f=fixture();
  f.currentConsentObservations=f.currentConsentObservations.slice(1);
  const result=assessAgreementEvidence(f);
  assert.equal(result.recorded_commitment_valid,false);
  assert.ok(result.recorded_reasons.includes('human.alice:current-consent-record-missing-for-history-check'));
});

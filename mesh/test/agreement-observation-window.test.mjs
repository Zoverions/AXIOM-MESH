import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessAgreementEvidence,
  consentGrantStatementDigest,
  deriveAcceptanceId,
  deriveAgreementId
} from '../src/lib/agreement-record.mjs';

function fixture() {
  const bodyDigest = 'a'.repeat(64);
  const agreement = {
    schema: 'axiom-agreement-record.v0', version: 0, status: 'inert-commitment-evidence',
    agreement_id: '', parties: ['human.alice', 'human.bob'], body_digest: bodyDigest,
    recorded_at: '2026-09-24T12:00:00.000Z', context_tags: [], supersedes: [],
    acceptance_policy: {
      mechanism: 'grid-consent-record', controller: 'service.recorder',
      purpose: 'agreement.acceptance.v0', required_scope: `agreement-body:${bodyDigest}:accept`
    },
    contains_private_body: false, authority_effect: 'none', enforcement_effect: 'none',
    legal_validity_claimed: false, payment_effect: 'none', settlement_effect: 'none',
    network_effect: 'none', runtime_activation: false
  };
  agreement.agreement_id = deriveAgreementId(agreement);
  const consentGrantStatements = agreement.parties.map((subject, index) => ({
    consent_id: `consent.${index}`, subject, controller: agreement.acceptance_policy.controller,
    purpose: agreement.acceptance_policy.purpose, scopes: [agreement.acceptance_policy.required_scope],
    expires_at: '2026-10-24T12:00:00.000Z', created_at: '2026-09-24T11:50:00.000Z',
    evidence_ref: `event:grant.${index}`, evidence_digest: String(index + 1).repeat(64)
  }));
  const acceptances = consentGrantStatements.map(grant => {
    const acceptance = {
      schema: 'axiom-agreement-acceptance-evidence.v0', version: 0,
      status: 'inert-acceptance-evidence', acceptance_id: '',
      agreement_id: agreement.agreement_id, body_digest: bodyDigest,
      principal_id: grant.subject, consent_id: grant.consent_id,
      consent_grant_statement_digest: consentGrantStatementDigest(grant),
      consent_grant_evidence_ref: grant.evidence_ref, consent_grant_evidence_digest: grant.evidence_digest,
      observed_at: '2026-09-24T11:55:00.000Z', evidence_refs: ['evidence:acceptance'],
      authority_effect: 'none', enforcement_effect: 'none', consent_effect: 'none',
      network_effect: 'none', runtime_activation: false
    };
    acceptance.acceptance_id = deriveAcceptanceId(acceptance);
    return acceptance;
  });
  const currentConsentObservations = consentGrantStatements.map(grant => ({
    observed_at: '2026-09-24T12:30:00.000Z', evidence_ref: `snapshot:${grant.consent_id}`,
    evidence_digest: 'e'.repeat(64), record: {
      consent_id: grant.consent_id, subject: grant.subject, controller: grant.controller,
      purpose: grant.purpose, scopes_json: [...grant.scopes], expires_at: grant.expires_at,
      status: 'active', created_at: grant.created_at, revoked_at: null
    }
  }));
  return { agreement, acceptances, consentGrantStatements, currentConsentObservations,
    assessedAt: '2026-09-24T12:30:00.000Z' };
}

function assertHistoryDenied(result, reason) {
  assert.equal(result.recorded_commitment_valid, false);
  assert.equal(result.all_acceptances_current, false);
  assert.equal(result.parties[0].recorded_acceptance_valid, false);
  assert.ok(result.recorded_reasons.includes(`human.alice:${reason}`));
}

test('current evidence spanning recording time preserves conditional historical validity', () => {
  const result = assessAgreementEvidence(fixture());
  assert.equal(result.recorded_commitment_valid, true);
  assert.equal(result.all_acceptances_current, true);
  assert.equal(result.requires_external_grid_evidence_verification, true);
  assert.equal(result.grid_evidence_verification_effect, 'none');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.enforcement_effect, 'none');
});

test('pre-recording consent observation cannot establish history through recording', () => {
  const input = fixture();
  input.currentConsentObservations[0].observed_at = '2026-09-24T11:57:00.000Z';
  assertHistoryDenied(assessAgreementEvidence(input), 'consent-observation-predates-recording');
});

test('future consent observation cannot establish historical validity at assessment', () => {
  const input = fixture();
  input.currentConsentObservations[0].observed_at = '2026-09-24T12:31:00.000Z';
  assertHistoryDenied(assessAgreementEvidence(input), 'consent-observation-after-assessment');
});

test('observation covering recording but not assessment proves no present currentness', () => {
  const input = fixture();
  input.currentConsentObservations[0].observed_at = '2026-09-24T12:29:59.000Z';
  const result = assessAgreementEvidence(input);
  assert.equal(result.recorded_commitment_valid, true);
  assert.equal(result.all_acceptances_current, false);
  assert.ok(result.currentness_reasons.includes('human.alice:current-consent-observation-time-mismatch'));
});

test('assessment before recording also denies each party historical result', () => {
  const input = fixture();
  input.assessedAt = '2026-09-24T11:59:00.000Z';
  for (const observation of input.currentConsentObservations) observation.observed_at = input.assessedAt;
  const result = assessAgreementEvidence(input);
  assert.equal(result.recorded_commitment_valid, false);
  assert.ok(result.parties.every(party => party.recorded_acceptance_valid === false));
});

test('a materialized consent observation cannot precede its grant creation', () => {
  const input = fixture();
  input.currentConsentObservations[0].observed_at = '2026-09-24T11:49:00.000Z';
  assert.throws(() => assessAgreementEvidence(input), /observation.*precede.*created_at/);
});

test('a materialized revoked status cannot precede its revocation event', () => {
  const input = fixture();
  input.currentConsentObservations[0].record.status = 'revoked';
  input.currentConsentObservations[0].record.revoked_at = '2026-09-24T12:31:00.000Z';
  assert.throws(() => assessAgreementEvidence(input), /observation.*precede.*revoked_at/);
});

test('later revocation leaves historical evidence intact and denies present currentness', () => {
  const input = fixture();
  input.currentConsentObservations[0].record.status = 'revoked';
  input.currentConsentObservations[0].record.revoked_at = '2026-09-24T12:15:00.000Z';
  const result = assessAgreementEvidence(input);
  assert.equal(result.recorded_commitment_valid, true);
  assert.equal(result.all_acceptances_current, false);
});

test('revocation at recording time denies historical acceptance', () => {
  const input = fixture();
  input.currentConsentObservations[0].record.status = 'revoked';
  input.currentConsentObservations[0].record.revoked_at = input.agreement.recorded_at;
  assertHistoryDenied(assessAgreementEvidence(input), 'consent-revoked-before-agreement-recorded');
});

test('observation exactly at recording time can establish history but not later currentness', () => {
  const input = fixture();
  for (const observation of input.currentConsentObservations) observation.observed_at = input.agreement.recorded_at;
  const result = assessAgreementEvidence(input);
  assert.equal(result.recorded_commitment_valid, true);
  assert.equal(result.all_acceptances_current, false);
});

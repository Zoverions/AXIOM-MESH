import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  buildDelegatedConsentReceipt,
  evaluateDelegatedConsent,
  loadHumanDelegatedConsentContract,
  validateDelegatedConsentReceipt
} from '../src/authority/human-delegated-consent.mjs';

const now = '2026-08-11T10:00:00.000Z';
const expiry = '2026-09-01T00:00:00.000Z';
const REVOCATION = 'f'.repeat(64);

function authorityFacts(overrides = {}) {
  return {
    schema: 'axiom-human-authority-facts.v1',
    contract_id: 'axiom.human-authority',
    contract_version: '1.0.0',
    grant_id: 'authority_guardian_child_education_1',
    relationship_claim_id: 'relationship_guardian_child_1',
    subject_id: 'learner.child.1',
    holder_id: 'adult.guardian.1',
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    data_scopes: ['learning-progress:read', 'learning-progress:write'],
    authority_source: 'guardian',
    assurance: 'A3',
    relationship_assurance: 'A3',
    jurisdiction_context_digest: 'c'.repeat(64),
    grant_evidence_digest: 'a'.repeat(64),
    relationship_evidence_digest: 'b'.repeat(64),
    grant_effective_until: '2026-12-31T00:00:00.000Z',
    relationship_effective_until: '2027-01-01T00:00:00.000Z',
    resolved_at: now,
    ...overrides
  };
}

function authority(overrides = {}) {
  const facts = authorityFacts(overrides);
  return {
    allow: true,
    facts,
    authority_digest: digestObject(facts)
  };
}

function issue({ authorityResolution = authority(), principal, dataScopes, expiresAt, ...overrides } = {}) {
  return buildDelegatedConsentReceipt({
    principal: principal ?? { id: 'adult.guardian.1', type: 'human' },
    authority: authorityResolution,
    consentId: overrides.consentId ?? 'delegated_consent_1',
    controller: overrides.controller ?? 'capsule:axiom.education',
    purpose: overrides.purpose ?? 'learning-progress-recording',
    action: overrides.action ?? 'education.learner.event.append',
    dataScopes: dataScopes ?? ['learning-progress:write'],
    expiresAt: expiresAt ?? expiry,
    revocationHandleHash: overrides.revocationHandleHash ?? REVOCATION,
    now: overrides.now ?? now
  });
}

function evaluate(receipt, authorityResolution = authority(), overrides = {}) {
  return evaluateDelegatedConsent({
    receipt,
    authority: authorityResolution,
    subjectId: overrides.subjectId ?? 'learner.child.1',
    holderId: overrides.holderId ?? 'adult.guardian.1',
    controller: overrides.controller ?? 'capsule:axiom.education',
    purpose: overrides.purpose ?? 'learning-progress-recording',
    action: overrides.action ?? 'education.learner.event.append',
    dataScopes: overrides.dataScopes ?? ['learning-progress:write'],
    now: overrides.now ?? '2026-08-12T10:00:00.000Z'
  });
}

test('delegated consent contract keeps direct self-consent separate and current authority mandatory', async () => {
  const contract = await loadHumanDelegatedConsentContract();
  assert.equal(contract.receipt_schema, 'axiom-human-delegated-consent.v1');
  assert.ok(contract.core_invariants.includes('direct-self-consent-remains-separate'));
  assert.ok(contract.core_invariants.includes('current-authority-denial-dominates-unexpired-consent'));
});

test('human holder can issue a narrower receipt bound to one exact authority digest', () => {
  const result = issue();
  assert.equal(result.allow, true);
  assert.equal(result.receipt.subject_id, 'learner.child.1');
  assert.equal(result.receipt.holder_id, 'adult.guardian.1');
  assert.equal(result.receipt.authority_grant_id, 'authority_guardian_child_education_1');
  assert.deepEqual(result.receipt.data_scopes, ['learning-progress:write']);
  assert.equal(result.receipt.authority_digest, authority().authority_digest);
  assert.equal(validateDelegatedConsentReceipt(result.receipt).status, 'active');
});

test('machine, service, wrong holder and mismatched request cannot issue delegated consent', () => {
  assert.throws(
    () => issue({ principal: { id: 'adult.guardian.1', type: 'service' } }),
    /Only a human authority holder/
  );
  const wrongHolder = issue({ principal: { id: 'adult.guardian.2', type: 'human' } });
  assert.equal(wrongHolder.code, 'delegated_consent_holder_mismatch');
  const wrongController = issue({ controller: 'capsule:other' });
  assert.equal(wrongController.code, 'delegated_consent_authority_mismatch');
  const wrongPurpose = issue({ purpose: 'portfolio-export' });
  assert.equal(wrongPurpose.code, 'delegated_consent_authority_mismatch');
  const wrongAction = issue({ action: 'education.portfolio.export' });
  assert.equal(wrongAction.code, 'delegated_consent_authority_mismatch');
});

test('delegated consent may narrow but never expand current authority data scopes', () => {
  const narrowed = issue({ dataScopes: ['learning-progress:write'] });
  assert.equal(narrowed.allow, true);
  const expanded = issue({ dataScopes: ['learning-progress:write', 'portfolio:export'] });
  assert.equal(expanded.code, 'delegated_consent_scope_denied');
});

test('delegated consent cannot outlive relationship or authority expiry', () => {
  const shortAuthority = authority({
    grant_effective_until: '2026-08-20T00:00:00.000Z',
    relationship_effective_until: '2026-08-25T00:00:00.000Z'
  });
  const tooLong = issue({
    authorityResolution: shortAuthority,
    expiresAt: '2026-08-21T00:00:00.000Z'
  });
  assert.equal(tooLong.code, 'delegated_consent_outlives_authority');
  const bounded = issue({
    authorityResolution: shortAuthority,
    expiresAt: '2026-08-20T00:00:00.000Z'
  });
  assert.equal(bounded.allow, true);
});

test('current authority denial dominates an otherwise active unexpired receipt', () => {
  const receipt = issue().receipt;
  const denied = evaluate(receipt, {
    allow: false,
    code: 'authority_grant_inactive',
    reason: 'The selected authority grant is revoked.'
  });
  assert.equal(denied.allow, false);
  assert.equal(denied.code, 'authority_grant_inactive');
});

test('stale authority digest, cross-child and cross-holder substitution fail closed', () => {
  const receipt = issue().receipt;
  const refreshed = authority({ resolved_at: '2026-08-12T09:59:59.000Z' });
  const stale = evaluate(receipt, refreshed);
  assert.equal(stale.code, 'delegated_consent_authority_stale');

  const crossChild = evaluate(receipt, authority(), { subjectId: 'learner.child.2' });
  assert.equal(crossChild.code, 'delegated_consent_request_mismatch');
  const crossHolder = evaluate(receipt, authority(), { holderId: 'adult.guardian.2' });
  assert.equal(crossHolder.code, 'delegated_consent_request_mismatch');
});

test('revoked, expired and insufficient-scope receipts fail closed at use time', () => {
  const active = issue().receipt;
  const revoked = { ...active, status: 'revoked' };
  assert.equal(evaluate(revoked).code, 'delegated_consent_inactive');
  assert.equal(evaluate(active, authority(), { now: '2026-10-01T00:00:00.000Z' }).code, 'delegated_consent_inactive');
  assert.equal(
    evaluate(active, authority(), { dataScopes: ['learning-progress:read'] }).code,
    'delegated_consent_scope_denied'
  );
});

test('receipt authority and revocation bindings are tamper evident', () => {
  const receipt = issue().receipt;
  const wrongGrant = { ...receipt, authority_grant_id: 'authority_other' };
  assert.equal(evaluate(wrongGrant).code, 'delegated_consent_authority_stale');
  const wrongDigest = { ...receipt, authority_digest: '0'.repeat(64) };
  assert.equal(evaluate(wrongDigest).code, 'delegated_consent_authority_stale');
  assert.throws(
    () => validateDelegatedConsentReceipt({ ...receipt, revocation_handle_hash: 'bad' }),
    /invalid format|at least 64/
  );
});

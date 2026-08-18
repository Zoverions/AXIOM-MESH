import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  loadAndVerifyAgentTrustPromotionLedger,
  normalizeAgentTrustPromotionLedger,
  verifyAgentTrustPromotionLedger
} from '../src/lib/agent-trust-promotion-ledger.mjs';

const ledgerUrl = new URL('../../agent-commons/agent-trust-promotion-ledger.json', import.meta.url);

async function ledger() {
  return JSON.parse(await readFile(ledgerUrl, 'utf8'));
}

test('A11a promotion ledger verifies current ATP laboratories while promoting none of them', async () => {
  const result = await loadAndVerifyAgentTrustPromotionLedger();
  assert.equal(result.valid, true);
  assert.equal(result.gates_tracked, 10);
  assert.equal(result.in_candidate_tree, 9);
  assert.equal(result.separate_branch, 1);
  assert.equal(result.promotion_ready, 0);
  assert.equal(result.authoritative_registry_entries_present, 0);
  assert.equal(result.independent_reviews_complete, 0);
  assert.equal(result.production_marketing_claims_allowed, false);
  assert.equal(result.authoritative_registry_mutated_by_laboratory, false);
  assert.match(result.ledger_digest, /^[a-f0-9]{64}$/);
});

test('A11a refuses production claims for a non-promoted laboratory', async () => {
  const raw = await ledger();
  raw.entries[0].production_claims_allowed = true;
  assert.throws(
    () => normalizeAgentTrustPromotionLedger(raw),
    /non-promoted capability cannot allow production claims/
  );
});

test('A11a refuses promotion-ready status without independent review', async () => {
  const raw = await ledger();
  const a1 = raw.entries[0];
  a1.promotion_ready = true;
  a1.laboratory_state = 'green';
  a1.authoritative_registry_present = true;
  a1.exact_registry_evidence_binding_complete = true;
  a1.production_claims_allowed = true;
  a1.blockers = [];
  raw.production_marketing_claims_allowed = true;
  assert.throws(
    () => normalizeAgentTrustPromotionLedger(raw),
    /promotion-ready capability lacks independent review/
  );
});

test('A11a refuses promotion-ready status with unresolved blockers', async () => {
  const raw = await ledger();
  const a1 = raw.entries[0];
  a1.promotion_ready = true;
  a1.laboratory_state = 'green';
  a1.independent_review_complete = true;
  a1.independent_review_evidence_paths = ['docs/security/CURRENT-BUILD-THREAT-MODEL.md'];
  a1.authoritative_registry_present = true;
  a1.exact_registry_evidence_binding_complete = true;
  a1.production_claims_allowed = true;
  raw.production_marketing_claims_allowed = true;
  assert.throws(
    () => normalizeAgentTrustPromotionLedger(raw),
    /promotion-ready capability cannot retain blockers/
  );
});

test('A11a shape can represent a future fully gated promotion instead of hard-coding permanent denial', async () => {
  const raw = await ledger();
  const a1 = raw.entries[0];
  a1.promotion_ready = true;
  a1.laboratory_state = 'green';
  a1.independent_review_complete = true;
  a1.independent_review_evidence_paths = ['docs/security/CURRENT-BUILD-THREAT-MODEL.md'];
  a1.authoritative_registry_present = true;
  a1.exact_registry_evidence_binding_complete = true;
  a1.production_claims_allowed = true;
  a1.blockers = [];
  raw.production_marketing_claims_allowed = true;
  const normalized = normalizeAgentTrustPromotionLedger(raw);
  assert.equal(normalized.entries[0].promotion_ready, true);
  assert.equal(normalized.production_marketing_claims_allowed, true);
});

test('A11a live repository check catches false claims that an ATP capability is already in the authoritative registry', async () => {
  const raw = await ledger();
  raw.entries[0].authoritative_registry_present = true;
  assert.rejects(
    () => verifyAgentTrustPromotionLedger(raw),
    /ledger says registry present but agents\.trust\.machine-identity is absent/
  );
});

test('A11a requires in-tree implementation validation tests threat model runbook and verifier/conformance paths', async () => {
  for (const field of [
    'implementation_paths',
    'strict_validation_paths',
    'test_paths',
    'threat_model_paths',
    'runbook_paths',
    'verifier_or_conformance_paths'
  ]) {
    const raw = await ledger();
    raw.entries[0][field] = [];
    assert.throws(
      () => normalizeAgentTrustPromotionLedger(raw),
      new RegExp(`${field} must contain 1-64 values`)
    );
  }
});

test('A11a separately green A7 branch cannot be promotion-ready or lose its composition blocker', async () => {
  const raw = await ledger();
  raw.entries[6].promotion_ready = true;
  raw.entries[6].laboratory_state = 'green';
  raw.entries[6].independent_review_complete = true;
  raw.entries[6].independent_review_evidence_paths = ['docs/security/CURRENT-BUILD-THREAT-MODEL.md'];
  raw.entries[6].authoritative_registry_present = true;
  raw.entries[6].exact_registry_evidence_binding_complete = true;
  raw.entries[6].production_claims_allowed = true;
  raw.entries[6].blockers = [];
  raw.production_marketing_claims_allowed = true;
  assert.throws(
    () => normalizeAgentTrustPromotionLedger(raw),
    /separate branch cannot be promotion-ready|separate branch must be labelled separate-branch-green/
  );

  const missingCompositionBlocker = await ledger();
  missingCompositionBlocker.entries[6].blockers = missingCompositionBlocker.entries[6].blockers
    .filter(item => item !== 'separate-branch-not-composed');
  await assert.rejects(
    () => verifyAgentTrustPromotionLedger(missingCompositionBlocker),
    /separate branch must explicitly block on composition/
  );
});

test('A11a repository verifier fails closed on missing evidence paths', async () => {
  const raw = await ledger();
  raw.entries[1].threat_model_paths = ['agent-commons/does-not-exist.json'];
  await assert.rejects(
    () => verifyAgentTrustPromotionLedger(raw),
    /does not exist: agent-commons\/does-not-exist\.json/
  );
});

test('A11a repository paths cannot escape the repository root', async () => {
  const raw = await ledger();
  raw.entries[0].implementation_paths = ['../outside.mjs'];
  assert.throws(
    () => normalizeAgentTrustPromotionLedger(raw),
    /implementation_paths\[0\] does not match required format|invalid/
  );
});

test('A11a documentation alone and laboratory registry mutation can never satisfy promotion', async () => {
  const docs = await ledger();
  docs.documentation_alone_satisfies_promotion = true;
  assert.throws(
    () => normalizeAgentTrustPromotionLedger(docs),
    /documentation alone cannot satisfy promotion/
  );

  const registry = await ledger();
  registry.authoritative_registry_mutated_by_laboratory = true;
  assert.throws(
    () => normalizeAgentTrustPromotionLedger(registry),
    /laboratory may not mutate authoritative registry merely by recording promotion state/
  );
});

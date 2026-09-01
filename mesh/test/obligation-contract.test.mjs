import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateObligationContract } from '../src/lib/obligation-contract.mjs';
import { assessObligation } from '../src/lib/obligation-assessment.mjs';

const exampleUrl = new URL('../../agent-commons/examples/obligation-contract.v1.json', import.meta.url);

test('obligation contract is structurally useful but non-authoritative', async () => {
  const contract = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = validateObligationContract(contract);
  assert.equal(result.valid, true);
  assert.equal(result.status, 'active_obligation_set');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.automatic_execution, false);
});

test('contract cannot directly enable automatic execution', async () => {
  const contract = JSON.parse(await readFile(exampleUrl, 'utf8'));
  contract.obligations[0].automatic_execution = true;
  assert.throws(() => validateObligationContract(contract), /cannot directly enable automatic execution/);
});

test('contract rejects unknown settlement state', async () => {
  const contract = JSON.parse(await readFile(exampleUrl, 'utf8'));
  contract.status = 'invented_state';
  assert.throws(() => validateObligationContract(contract), /status is invalid/);
});

test('contract validates canonical timestamps and ordering', async () => {
  const invalid = JSON.parse(await readFile(exampleUrl, 'utf8'));
  invalid.context.effective_from = 'not-a-time';
  assert.throws(() => validateObligationContract(invalid), /canonical UTC ISO/);

  const reversed = JSON.parse(await readFile(exampleUrl, 'utf8'));
  reversed.context.expires_at = '2026-08-31T13:20:00.000Z';
  assert.throws(() => validateObligationContract(reversed), /must be after/);

  const badDeadline = JSON.parse(await readFile(exampleUrl, 'utf8'));
  badDeadline.obligations[0].deadline = 'tomorrow';
  assert.throws(() => validateObligationContract(badDeadline), /canonical UTC ISO/);
});

test('breach claim cannot directly mint remedy authority and retains evidence', async () => {
  const contract = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = assessObligation(contract.obligations[0], {
    obligation_id: 'obligation:deliver-report',
    status: 'failed',
    evidence_refs: ['evidence:late-delivery'],
    reviewed: false
  });
  assert.equal(result.state, 'claimed_breach');
  assert.deepEqual(result.evidence_refs, ['evidence:late-delivery']);
  assert.equal(result.remedy_authority_effect, 'none');
});

test('dispute blocks automatic remedy and retains evidence', async () => {
  const contract = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = assessObligation(contract.obligations[0], {
    obligation_id: 'obligation:deliver-report',
    status: 'disputed',
    evidence_refs: ['evidence:counterclaim'],
    reviewed: true
  });
  assert.equal(result.state, 'in_dispute');
  assert.deepEqual(result.evidence_refs, ['evidence:counterclaim']);
  assert.equal(result.remedy_authority_effect, 'none');
});

test('assessment rejects malformed obligation IDs', async () => {
  const contract = JSON.parse(await readFile(exampleUrl, 'utf8'));
  contract.obligations[0].obligation_id = 'bad id with spaces';
  assert.throws(
    () => assessObligation(contract.obligations[0], {
      obligation_id: 'bad id with spaces',
      status: 'unknown',
      evidence_refs: [],
      reviewed: true
    }),
    /pattern/
  );
});

test('fulfilled obligation requires evidence', async () => {
  const contract = JSON.parse(await readFile(exampleUrl, 'utf8'));
  assert.throws(
    () => assessObligation(contract.obligations[0], {
      obligation_id: 'obligation:deliver-report',
      status: 'fulfilled',
      evidence_refs: [],
      reviewed: true
    }),
    /requires evidence/
  );
});

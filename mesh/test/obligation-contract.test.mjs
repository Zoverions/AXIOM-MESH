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
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.automatic_execution, false);
});

test('contract cannot directly enable automatic execution', async () => {
  const contract = JSON.parse(await readFile(exampleUrl, 'utf8'));
  contract.obligations[0].automatic_execution = true;
  assert.throws(() => validateObligationContract(contract), /cannot directly enable automatic execution/);
});

test('breach claim cannot directly mint remedy authority', async () => {
  const contract = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = assessObligation(contract.obligations[0], {
    obligation_id: 'obligation:deliver-report',
    status: 'failed',
    evidence_refs: ['evidence:late-delivery'],
    reviewed: false
  });
  assert.equal(result.state, 'claimed_breach');
  assert.equal(result.remedy_authority_effect, 'none');
});

test('dispute blocks automatic remedy', async () => {
  const contract = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = assessObligation(contract.obligations[0], {
    obligation_id: 'obligation:deliver-report',
    status: 'disputed',
    evidence_refs: ['evidence:counterclaim'],
    reviewed: true
  });
  assert.equal(result.state, 'in_dispute');
  assert.equal(result.remedy_authority_effect, 'none');
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

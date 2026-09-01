import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateNegotiationMessage } from '../src/lib/negotiation-message.mjs';
import { assessAmendmentMateriality } from '../src/lib/amendment-materiality.mjs';

const exampleUrl = new URL('../../agent-commons/examples/negotiation-message.v1.json', import.meta.url);

test('negotiation messages remain non-authoritative', async () => {
  const message = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = validateNegotiationMessage(message, {
    now: new Date('2026-09-01T14:00:00.000Z')
  });
  assert.equal(result.valid, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.negotiation_effect, 'proposal_or_acceptance_evidence_only');
});

test('partial acceptance requires explicit term IDs', async () => {
  const message = JSON.parse(await readFile(exampleUrl, 'utf8'));
  message.message_type = 'partial_acceptance';
  assert.throws(
    () => validateNegotiationMessage(message),
    /requires explicit accepted_term_ids/
  );
});

test('settlement acceptance cannot grant effect authority', async () => {
  const message = JSON.parse(await readFile(exampleUrl, 'utf8'));
  message.message_type = 'settlement_acceptance';
  message.accepted_term_ids = ['term:deadline'];
  message.authority.settlement_grants_effect_authority = true;
  assert.throws(
    () => validateNegotiationMessage(message),
    /settlement_grants_effect_authority/
  );
});

test('material amendment requires renewed acceptance from affected parties', () => {
  const result = assessAmendmentMateriality({
    base_contract_digest: 'a'.repeat(64),
    proposed_contract_digest: 'b'.repeat(64),
    changed_dimensions: ['deadline','data_scope'],
    affected_party_ids: ['party:provider','party:recipient']
  });
  assert.equal(result.material, true);
  assert.deepEqual(result.renewed_acceptance_required_from, ['party:provider','party:recipient']);
  assert.equal(result.authority_effect, 'none');
});

test('material amendment with no affected parties fails closed', () => {
  assert.throws(
    () => assessAmendmentMateriality({
      base_contract_digest: 'a'.repeat(64),
      proposed_contract_digest: 'b'.repeat(64),
      changed_dimensions: ['remedy'],
      affected_party_ids: []
    }),
    /requires explicit affected_party_ids/
  );
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateNegotiationMessage } from '../src/lib/negotiation-message.mjs';
import { assessAmendmentMateriality } from '../src/lib/amendment-materiality.mjs';

const exampleUrl = new URL('../../agent-commons/examples/negotiation-message.v1.json', import.meta.url);
const profileUrl = new URL('../../agent-commons/negotiation-and-amendment-profile.v1.json', import.meta.url);

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

test('accepted term IDs must use canonical ID grammar', async () => {
  const message = JSON.parse(await readFile(exampleUrl, 'utf8'));
  message.message_type = 'partial_acceptance';
  message.accepted_term_ids = ['bad id with spaces'];
  assert.throws(
    () => validateNegotiationMessage(message),
    /accepted_term_ids/
  );
});

test('accepted term IDs must be unique', async () => {
  const message = JSON.parse(await readFile(exampleUrl, 'utf8'));
  message.message_type = 'partial_acceptance';
  message.accepted_term_ids = ['term:deadline', 'term:deadline'];
  assert.throws(
    () => validateNegotiationMessage(message),
    /accepted_term_ids must be unique/
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

test('negotiation validity window must be strictly ordered', async () => {
  const zero = JSON.parse(await readFile(exampleUrl, 'utf8'));
  zero.expires_at = zero.issued_at;
  assert.throws(
    () => validateNegotiationMessage(zero, { now: new Date('2026-09-01T13:40:00.000Z') }),
    /expires_at must be after issued_at/
  );

  const inverted = JSON.parse(await readFile(exampleUrl, 'utf8'));
  inverted.expires_at = '2026-09-01T13:40:00.000Z';
  assert.throws(
    () => validateNegotiationMessage(inverted, { now: new Date('2026-09-01T13:30:00.000Z') }),
    /expires_at must be after issued_at/
  );
});

test('future-issued negotiation message is not yet current', async () => {
  const message = JSON.parse(await readFile(exampleUrl, 'utf8'));
  message.issued_at = '2026-09-02T13:50:00.000Z';
  message.expires_at = '2026-09-03T13:50:00.000Z';
  const result = validateNegotiationMessage(message, {
    now: new Date('2026-09-01T14:00:00.000Z')
  });
  assert.equal(result.valid, false);
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

test('changed contract digest cannot omit changed dimensions', () => {
  assert.throws(
    () => assessAmendmentMateriality({
      base_contract_digest: 'a'.repeat(64),
      proposed_contract_digest: 'b'.repeat(64),
      changed_dimensions: [],
      affected_party_ids: []
    }),
    /changed_dimensions/
  );
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

test('affected party IDs must use canonical ID grammar', () => {
  assert.throws(
    () => assessAmendmentMateriality({
      base_contract_digest: 'a'.repeat(64),
      proposed_contract_digest: 'b'.repeat(64),
      changed_dimensions: ['deadline'],
      affected_party_ids: ['bad id with spaces']
    }),
    /affected_party_ids/
  );
});

test('affected party IDs must be unique', () => {
  assert.throws(
    () => assessAmendmentMateriality({
      base_contract_digest: 'a'.repeat(64),
      proposed_contract_digest: 'b'.repeat(64),
      changed_dimensions: ['deadline'],
      affected_party_ids: ['party:provider', 'party:provider']
    }),
    /affected_party_ids must be unique/
  );
});

test('negotiation profile fixes the message-type vocabulary and non-authority principles', async () => {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  assert.equal(profile.schema, 'axiom-negotiation-and-amendment-profile.v1');
  assert.deepEqual(profile.message_types, [
    'offer','counteroffer','clarification_request','partial_acceptance','conditional_acceptance',
    'rejection','withdrawal','reservation','amendment_proposal','amendment_acceptance',
    'mediation_proposal','settlement_proposal','settlement_acceptance'
  ]);
  assert.ok(profile.principles.includes('negotiation is communication, not authority'));
  assert.ok(profile.principles.includes('settlement acceptance does not itself authorize payments, transfers, releases, suspensions, or other consequential effects'));
});

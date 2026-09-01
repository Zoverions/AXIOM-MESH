import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateDisputeRecord } from '../src/lib/dispute-record.mjs';

const exampleUrl = new URL('../../agent-commons/examples/dispute-record.v1.json', import.meta.url);

test('dispute and mediation remain non-authoritative', async () => {
  const record=JSON.parse(await readFile(exampleUrl,'utf8'));
  const result=validateDisputeRecord(record);
  assert.equal(result.valid,true);
  assert.equal(result.state,'mediation_active');
  assert.equal(result.authority_effect,'none');
});

test('mediator cannot silently gain binding authority', async () => {
  const record=JSON.parse(await readFile(exampleUrl,'utf8'));
  record.mediator.binding_authority=true;
  assert.throws(()=>validateDisputeRecord(record),/binding_authority/);
});

test('consequential remedy requires separate authority reference', async () => {
  const record=JSON.parse(await readFile(exampleUrl,'utf8'));
  record.proposed_remedies[0].requires_consequential_effect=true;
  assert.throws(()=>validateDisputeRecord(record),/separate effect_authority_ref/);
});

test('settled state requires explicit party acceptance', async () => {
  const record=JSON.parse(await readFile(exampleUrl,'utf8'));
  record.state='settled_by_parties';
  record.settlement.candidate_digest='b'.repeat(64);
  record.settlement.accepted_by=['party:provider'];
  assert.throws(()=>validateDisputeRecord(record),/explicit party acceptance/);
});

test('settlement never carries execution authority', async () => {
  const record=JSON.parse(await readFile(exampleUrl,'utf8'));
  record.settlement.execution_authority_effect='bounded';
  assert.throws(()=>validateDisputeRecord(record),/must be none/);
});

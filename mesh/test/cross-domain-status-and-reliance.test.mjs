import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  validateCrossDomainStatusEvent,
  validateRecognitionRelianceReceipt
} from '../src/lib/cross-domain-status-and-reliance.mjs';

const eventUrl=new URL('../../agent-commons/examples/cross-domain-status-event.v1.json',import.meta.url);
const receiptUrl=new URL('../../agent-commons/examples/recognition-reliance-receipt.v1.json',import.meta.url);

test('remote status events remain evidence, not local authority', async()=>{
  const event=JSON.parse(await readFile(eventUrl,'utf8'));
  const r=validateCrossDomainStatusEvent(event);
  assert.equal(r.valid,true);
  assert.equal(r.status,'compromised');
  assert.equal(r.authority_effect,'none');
  assert.equal(r.historical_rewrite,false);
});

test('status events cannot rewrite history or mint remedy authority', async()=>{
  for(const field of ['event_grants_local_authority','event_grants_remedy_authority','event_rewrites_historical_receipts']){
    const event=JSON.parse(await readFile(eventUrl,'utf8'));
    event.authority[field]=true;
    assert.throws(()=>validateCrossDomainStatusEvent(event),/cannot|rewrite/);
  }
});

test('reliance receipt preserves historical decision while annotating later compromise', async()=>{
  const receipt=JSON.parse(await readFile(receiptUrl,'utf8'));
  const r=validateRecognitionRelianceReceipt(receipt);
  assert.equal(r.valid,true);
  assert.equal(r.historical_decision,'accepted_as_prerequisite_evidence');
  assert.equal(r.historical_rewrite,false);
  assert.equal(r.authority_effect,'none');
  assert.equal(receipt.later_status_annotations[0].future_reliance_effect,'deny_pending_revalidation');
});

test('reliance receipt cannot be replayed as authority', async()=>{
  const receipt=JSON.parse(await readFile(receiptUrl,'utf8'));
  receipt.authority.receipt_is_reusable_grant=true;
  assert.throws(()=>validateRecognitionRelianceReceipt(receipt),/cannot be a reusable grant/);
});

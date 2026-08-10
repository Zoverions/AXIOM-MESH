import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  buildMachineIntentReceipt,
  validateMachineIntentReceipt,
  verifyMachineIntentReceipt
} from '../src/lib/machine-receipt.mjs';

function gridIdentity() {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    'grid',
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function fixture({ status = 'completed' } = {}) {
  const invocationDigest = '1'.repeat(64);
  const authorityDigest = '2'.repeat(64);
  const requestDigest = '3'.repeat(64);
  const inputDigest = '4'.repeat(64);
  const intentId = `intent_${'5'.repeat(64)}`;
  const principal = 'agent.receipt-test';
  const traceId = 'trace.receipt-test';
  const result = {
    message: 'verified output', intent_id: intentId, trace_id: traceId, status: 'completed',
    evidence: { invocation_digest: invocationDigest, machine_authority_digest: authorityDigest }
  };
  const error = { code: 'policy_denied', message: 'denied for test' };
  const intent = {
    intent_id: intentId, trace_id: traceId, principal, action: 'system.echo', risk: 'low', status,
    input_digest: inputDigest, request_digest: requestDigest,
    result_json: status === 'completed' ? result : null,
    error_json: status === 'completed' ? null : error,
    created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:01.000Z'
  };
  const acceptedPayload = {
    intent_id: intentId, principal, action: 'system.echo', input_digest: inputDigest,
    request_digest: requestDigest, invocation_digest: invocationDigest,
    machine_authority: { authority_digest: authorityDigest }
  };
  const terminalPayload = status === 'completed' ? { intent_id: intentId, result } : { intent_id: intentId, error };
  const events = [
    { seq: 10, event_id: 'evt.accepted', trace_id: traceId, actor: principal, kind: 'intent.accepted', subject: intentId, occurred_at: '2026-08-10T00:00:00.000Z', payload: acceptedPayload, payload_digest: digestObject(acceptedPayload), event_hash: '6'.repeat(64), signature: { key_id: 'grid:test' } },
    { seq: 11, event_id: 'evt.terminal', trace_id: traceId, actor: principal, kind: `intent.${status}`, subject: intentId, occurred_at: '2026-08-10T00:00:01.000Z', payload: terminalPayload, payload_digest: digestObject(terminalPayload), event_hash: '7'.repeat(64), signature: { key_id: 'grid:test' } }
  ];
  const chain = { valid: true, events: 11, head: '8'.repeat(64), verification_mode: 'checkpoint', prefix_assurance: 'signed_checkpoint', verified_events: 1, verified_from_seq: 11, verified_through_seq: 11, checkpoint_count: 1, checkpoint_seq: 10, full_verification_required_for_checkpointed_prefix_revalidation: true };
  return { intent, events, chain, result, error };
}

test('machine receipt binds intent, terminal evidence, chain assurance, and Grid attestation', () => {
  const identity = gridIdentity(); const { intent, events, chain, result } = fixture();
  const receipt = buildMachineIntentReceipt({ intent, events, chain, identity, kernelVersion: '0.12.0-dev.3' });
  assert.equal(receipt.schema, 'axiom-machine-intent-receipt.v1');
  assert.equal(receipt.statement.intent.intent_id, intent.intent_id);
  assert.equal(receipt.statement.outcome.result_digest, digestObject(result));
  assert.equal(receipt.statement.authority.invocation_digest, '1'.repeat(64));
  assert.equal(receipt.statement.authority.machine_authority_digest, '2'.repeat(64));
  assert.deepEqual(receipt.statement.evidence_events.map(item => item.seq), [10, 11]);
  assert.equal(receipt.statement.chain.prefix_assurance, 'signed_checkpoint');
  assert.match(receipt.receipt_digest, /^[a-f0-9]{64}$/);
  assert.equal(validateMachineIntentReceipt(receipt), receipt);
  const verified = verifyMachineIntentReceipt(receipt, identity.publicKey);
  assert.equal(verified.valid, true); assert.equal(verified.intent_id, intent.intent_id);
});

test('machine receipt verifies denied terminal evidence without exposing raw error', () => {
  const identity = gridIdentity(); const { intent, events, chain, error } = fixture({ status: 'denied' });
  const receipt = buildMachineIntentReceipt({ intent, events, chain, identity, kernelVersion: '0.12.0-dev.3' });
  assert.equal(receipt.statement.outcome.error_digest, digestObject(error));
  assert.equal(JSON.stringify(receipt).includes('denied for test'), false);
  assert.equal(verifyMachineIntentReceipt(receipt, identity.publicKey).valid, true);
});

test('machine receipt fails closed on incomplete, mismatched, or nonterminal evidence', () => {
  const identity = gridIdentity(); const { intent, events, chain } = fixture();
  assert.throws(() => buildMachineIntentReceipt({ intent: { ...intent, status: 'accepted' }, events, chain, identity, kernelVersion: '0.12.0-dev.3' }), error => error.code === 'receipt_not_ready' && error.status === 409);
  assert.throws(() => buildMachineIntentReceipt({ intent, events: [events[0]], chain, identity, kernelVersion: '0.12.0-dev.3' }), error => error.code === 'receipt_evidence_incomplete' && error.status === 409);
  const altered = structuredClone(events); altered[1].payload.result.message = 'substituted';
  assert.throws(() => buildMachineIntentReceipt({ intent, events: altered, chain, identity, kernelVersion: '0.12.0-dev.3' }), error => error.code === 'receipt_evidence_mismatch' && error.status === 409);
  assert.throws(() => buildMachineIntentReceipt({ intent, events, chain: { valid: false, reason: 'signature_mismatch' }, identity, kernelVersion: '0.12.0-dev.3' }), error => error.code === 'integrity_verification_failed' && error.status === 503);
});

test('machine receipt digest and Grid signature detect substitution', () => {
  const identity = gridIdentity(); const { intent, events, chain } = fixture();
  const receipt = buildMachineIntentReceipt({ intent, events, chain, identity, kernelVersion: '0.12.0-dev.3' });
  const tamperedDigest = structuredClone(receipt); tamperedDigest.statement.intent.action = 'system.hash';
  assert.throws(() => validateMachineIntentReceipt(tamperedDigest), /digest does not match/);
  const tamperedSignature = structuredClone(receipt); tamperedSignature.statement.intent.action = 'system.hash';
  const envelope = { schema: tamperedSignature.schema, statement: tamperedSignature.statement, attestation: tamperedSignature.attestation };
  tamperedSignature.receipt_digest = digestObject(envelope);
  assert.equal(verifyMachineIntentReceipt(tamperedSignature, identity.publicKey).valid, false);
});

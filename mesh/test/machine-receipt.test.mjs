import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { ValidationError, digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  buildMachineIntentReceipt,
  validateMachineIntentReceipt,
  verifyMachineIntentReceipt
} from '../src/lib/machine-receipt.mjs';
import {
  containerPaths,
  label,
  propertyPaths,
  withAccessorAt,
  withProxyAt
} from '../test-support/hostile-plain-data.mjs';

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
  assert.deepEqual(validateMachineIntentReceipt(receipt), receipt);
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

function isDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function nullPrototypeCopy(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(nullPrototypeCopy);
  const copy = Object.create(null);
  for (const key of Object.keys(value)) copy[key] = nullPrototypeCopy(value[key]);
  return copy;
}

function signedReceipt(options) {
  const identity = gridIdentity();
  const { intent, events, chain } = fixture(options);
  return { identity, receipt: buildMachineIntentReceipt({ intent, events, chain, identity, kernelVersion: '0.12.0-dev.3' }) };
}

test('validate returns a deep-frozen snapshot, never the caller object', () => {
  const { identity, receipt } = signedReceipt();
  const validated = validateMachineIntentReceipt(receipt);
  assert.notEqual(validated, receipt);
  assert.notEqual(validated.statement, receipt.statement);
  assert.deepEqual(validated, receipt);
  assert.equal(isDeepFrozen(validated), true);
  assert.equal(Object.isFrozen(receipt), false, 'the caller object is not frozen in place');
  receipt.statement.intent.status = 'failed';
  assert.equal(validated.statement.intent.status, 'completed', 'later caller writes do not reach the snapshot');
  // A frozen snapshot validates again to an equal (fresh) frozen snapshot.
  const again = validateMachineIntentReceipt(validated);
  assert.notEqual(again, validated);
  assert.deepEqual(again, validated);
  assert.equal(verifyMachineIntentReceipt(validated, identity.publicKey).valid, true);
});

test('a Proxy or accessor anywhere in the receipt is rejected before any trap or getter runs', () => {
  const { identity, receipt } = signedReceipt();
  const runs = [
    ['validate', value => validateMachineIntentReceipt(value)],
    ['verify', value => verifyMachineIntentReceipt(value, identity.publicKey)]
  ];
  let checked = 0;
  for (const [name, run] of runs) {
    for (const path of containerPaths(receipt)) {
      const counter = { traps: 0 };
      assert.throws(
        () => run(withProxyAt(receipt, path, counter)),
        error => error instanceof ValidationError && /must be plain data/.test(error.message) && /Proxy/.test(error.message),
        `${name} Proxy at ${label(path)}`
      );
      assert.equal(counter.traps, 0, `${name} Proxy at ${label(path)} ran a trap`);
      checked += 1;
    }
    for (const path of propertyPaths(receipt)) {
      const counter = { getters: 0 };
      assert.throws(
        () => run(withAccessorAt(receipt, path, counter)),
        error => error instanceof ValidationError && /must be plain data/.test(error.message) && /accessor/.test(error.message),
        `${name} accessor at ${label(path)}`
      );
      assert.equal(counter.getters, 0, `${name} accessor at ${label(path)} ran its getter`);
      checked += 1;
    }
  }
  assert.ok(checked > 100, `expected to cover every position, covered ${checked}`);
});

test('a key option that rewrites the raw receipt during verification cannot change the verified result', () => {
  const { identity, receipt } = signedReceipt();
  const raw = structuredClone(receipt);
  let keyReads = 0;
  const hostileKey = {
    format: 'pem',
    get key() {
      keyReads += 1;
      raw.statement.intent.status = 'failed';
      raw.statement.intent.intent_id = 'intent_forged';
      raw.statement.chain.prefix_assurance = 'full_chain';
      raw.receipt_digest = 'f'.repeat(64);
      return identity.publicKey.export({ type: 'spki', format: 'pem' });
    }
  };
  const verified = verifyMachineIntentReceipt(raw, hostileKey);
  assert.ok(keyReads > 0, 'the key getter ran after the snapshot');
  assert.equal(verified.valid, true);
  assert.equal(verified.status, 'completed');
  assert.equal(verified.intent_id, receipt.statement.intent.intent_id);
  assert.equal(verified.prefix_assurance, 'signed_checkpoint');
  assert.equal(verified.receipt_digest, receipt.receipt_digest);
});

test('hidden, symbol, non-plain, cyclic and function receipt state fails as plain-data ValidationError', () => {
  const { receipt } = signedReceipt();
  const hidden = structuredClone(receipt);
  Object.defineProperty(hidden, 'mind_id', { value: 'x', enumerable: false, configurable: true, writable: true });
  const symbolKeyed = structuredClone(receipt);
  symbolKeyed.statement[Symbol('shadow')] = 'x';
  class Statement {}
  const nonPlain = { ...receipt, statement: Object.assign(new Statement(), receipt.statement) };
  const cyclic = structuredClone(receipt);
  cyclic.statement.chain.self = cyclic.statement.chain;
  const functionValued = structuredClone(receipt);
  functionValued.statement.outcome.result_digest = () => receipt.statement.outcome.result_digest;
  const cases = [
    ['hidden', hidden, /non-enumerable/],
    ['symbolKeyed', symbolKeyed, /symbol key/],
    ['nonPlain', nonPlain, /non-plain prototype/],
    ['cyclic', cyclic, /is cyclic/],
    ['functionValued', functionValued, /is a function/]
  ];
  for (const [name, value, reason] of cases) {
    assert.throws(
      () => validateMachineIntentReceipt(value),
      error => error instanceof ValidationError && /must be plain data/.test(error.message) && reason.test(error.message),
      name
    );
  }
});

test('plain, JSON, structuredClone and null-prototype receipts behave as before', () => {
  for (const status of ['completed', 'denied']) {
    const { identity, receipt } = signedReceipt({ status });
    for (const [name, value] of [
      ['plain', receipt],
      ['json', JSON.parse(JSON.stringify(receipt))],
      ['structuredClone', structuredClone(receipt)],
      ['nullPrototype', nullPrototypeCopy(receipt)]
    ]) {
      assert.deepEqual({ ...validateMachineIntentReceipt(value) }, { ...value }, `${status} ${name} validate`);
      assert.equal(verifyMachineIntentReceipt(value, identity.publicKey).valid, true, `${status} ${name} verify`);
    }
  }
  const { receipt } = signedReceipt();
  for (const bad of [null, undefined, 'receipt', 7, []]) {
    assert.throws(() => validateMachineIntentReceipt(bad), /Machine intent receipt must be an object/);
  }
  assert.throws(() => validateMachineIntentReceipt({ ...receipt, schema: 'x' }), /schema is invalid/);
  assert.throws(() => validateMachineIntentReceipt({ ...receipt, verification: {} }), /digest does not match|statement-bound/);
  assert.throws(() => validateMachineIntentReceipt({ ...receipt, receipt_digest: 'nope' }), /digest is invalid/);
});

import assert from 'node:assert/strict';
import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { ValidationError, digestObject } from '../src/lib/canonical.mjs';
import { normalizeDelegationAuthority } from '../src/lib/delegation-graph.mjs';
import { createDelegationRootAttestation } from '../src/lib/delegation-root-attestation.mjs';
import {
  createPortableDelegationGrant,
  verifyPortableDelegationGrant
} from '../src/lib/delegation-portable-grant.mjs';
import {
  containerPaths,
  countingProxy,
  label,
  propertyPaths,
  withAccessorAt,
  withProxyAt
} from '../test-support/hostile-plain-data.mjs';

const T0 = '2026-08-27T20:00:00.000Z';
const T1 = '2026-08-27T21:00:00.000Z';
const T2 = '2026-08-27T22:00:00.000Z';
const T3 = '2026-08-27T23:00:00.000Z';

function fixture() {
  const signer = generateKeyPairSync('ed25519');
  const root = normalizeDelegationAuthority({
    schema: 'axiom-delegation-authority.v1',
    holder: 'owner.alice',
    actions: ['system.echo'],
    purposes: ['test.conformance'],
    data_scopes: [],
    destinations: ['local'],
    budgets: {
      max_requests_per_minute: 2,
      max_concurrent_requests: 1,
      max_execution_ms: 2000,
      max_request_bytes: 2048,
      max_response_bytes: 2048
    },
    required_assurance: 'A2',
    independent_approval_required: true,
    delegation: { allowed: true, max_depth: 1 },
    expires_at: '2026-08-28T00:00:00.000Z'
  });
  const rootBinding = {
    schema: 'axiom-delegation-root-binding.v1',
    root_holder: root.holder,
    root_authority_digest: root.authority_digest,
    execution_authority_granted: false,
    authority_effect: 'none'
  };
  rootBinding.binding_digest = digestObject(rootBinding);
  const attestation = createDelegationRootAttestation({
    root_binding: rootBinding,
    signer_id: root.holder,
    signer_private_key: signer.privateKey,
    issued_at: T0
  });
  const { authority_digest: _rootDigest, ...rootAuthorityFields } = root;
  const grant = {
    schema: 'axiom-delegation-grant.v1',
    id: 'grant.alice-reader',
    delegator: root.holder,
    delegate: 'agent.reader',
    parent_grant_id: null,
    issued_at: T1,
    authority: {
      ...rootAuthorityFields,
      holder: 'agent.reader',
      actions: ['system.echo'],
      budgets: { ...root.budgets, max_requests_per_minute: 1 },
      delegation: { allowed: false, max_depth: 0 },
      expires_at: T3
    }
  };
  const sign = (changes = {}) => createPortableDelegationGrant({
    root_authority: root,
    root_attestation: attestation,
    grant,
    signer_private_key: signer.privateKey,
    audience_id: 'verifier.example',
    signed_at: T2,
    ...changes
  });
  const verify = (proof, changes = {}) => verifyPortableDelegationGrant(proof, {
    root_authority: root,
    root_attestation: attestation,
    trusted_root_public_key: signer.publicKey,
    expected_root_binding_digest: rootBinding.binding_digest,
    expected_audience_id: 'verifier.example',
    now: T2,
    ...changes
  });
  return { signer, root, rootBinding, attestation, grant, sign, verify };
}

test('pinned one-hop signed provenance verifies without granting runtime or global currentness', () => {
  const f = fixture();
  const proof = f.sign();
  const result = f.verify(proof);
  assert.equal(result.valid, true);
  assert.equal(result.grant.delegate, 'agent.reader');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_authority_granted, false);
  assert.equal(result.global_currentness_claimed, false);
  assert.equal(result.revocation_currentness_claimed, false);
  assert.equal(result.chain_resolution.execution_authority_granted, false);
});

test('wrong audience, substituted owner key and rewritten delegate are rejected', () => {
  const f = fixture();
  const proof = f.sign();
  assert.throws(() => f.verify(proof, { expected_audience_id: 'verifier.other' }), /audience/i);
  const substitute = generateKeyPairSync('ed25519');
  assert.throws(() => f.verify(proof, { trusted_root_public_key: substitute.publicKey }), /key substitution|signature/i);
  const forged = structuredClone(proof);
  forged.grant.delegate = 'agent.attacker';
  forged.grant.authority.holder = 'agent.attacker';
  assert.throws(() => f.verify(forged), /digest|signature|binding/i);
  const inflated = structuredClone(proof);
  inflated.statement.authority_effect = 'execute';
  assert.throws(() => f.verify(inflated), /cannot claim execution or global currentness/i);
  const brokenSignature = structuredClone(proof);
  brokenSignature.signer_signature = `${proof.signer_signature[0] === 'A' ? 'B' : 'A'}${proof.signer_signature.slice(1)}`;
  const { proof_digest: _proofDigest, ...signed } = brokenSignature;
  brokenSignature.proof_digest = digestObject(signed);
  assert.throws(() => f.verify(brokenSignature), /signature is invalid/i);
  assert.throws(() => f.verify(proof, { expected_root_binding_digest: 'f'.repeat(64) }), /binding/i);
  const { authority_digest: _rootDigest, ...rootFields } = f.root;
  const substitutedRoot = normalizeDelegationAuthority({
    ...rootFields,
    independent_approval_required: false
  });
  assert.throws(() => f.verify(proof, { root_authority: substitutedRoot }), /root authority digest mismatch/i);
});

test('owner signature cannot turn an attenuated grant into wider authority or a child hop', () => {
  const f = fixture();
  assert.throws(() => f.sign({ grant: {
    ...f.grant,
    authority: { ...f.grant.authority, actions: ['system.echo', 'memory.read'] }
  } }), /expands actions/i);
  assert.throws(() => f.sign({ grant: { ...f.grant, parent_grant_id: 'grant.other' } }), /one-hop|parent/i);
});

test('future signing, expiry, and supplied revocation fail closed without implying revocation completeness', () => {
  const f = fixture();
  const proof = f.sign();
  assert.throws(() => f.verify(proof, { now: T1 }), /future|not active/i);
  assert.throws(() => f.verify(proof, { now: '2026-08-28T00:01:00.000Z' }), /expired/i);
  assert.throws(() => f.verify(proof, {
    revocations: [{
      schema: 'axiom-delegation-revocation.v1',
      id: 'revoke.reader',
      grant_id: f.grant.id,
      revoked_by: f.root.holder,
      revoked_at: T2,
      reason: 'local observed revocation'
    }]
  }), /revoked/i);
});

function nullPrototypeCopy(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(nullPrototypeCopy);
  const copy = Object.create(null);
  for (const key of Object.keys(value)) copy[key] = nullPrototypeCopy(value[key]);
  return copy;
}

test('P4: a lying Proxy cannot show the pinned audience to the check while the signature covers another', () => {
  const f = fixture();
  const proof = f.sign();
  const otherAudience = 'audience.not-signed-for';
  assert.throws(
    () => f.verify(proof, { expected_audience_id: otherAudience }),
    /audience does not match pinned verifier/
  );
  const counter = { traps: 0 };
  const lying = countingProxy({ ...proof.statement }, counter, { audience_id: otherAudience });
  assert.throws(
    () => f.verify({ ...proof, statement: lying }, { expected_audience_id: otherAudience }),
    error => error instanceof ValidationError && /plain data/.test(error.message)
  );
  assert.equal(counter.traps, 0, 'the Proxy must be rejected before any trap runs');
});

test('P4: a flipping audience getter is rejected cleanly without running the getter', () => {
  const f = fixture();
  const proof = f.sign();
  const otherAudience = 'audience.not-signed-for';
  const statement = { ...proof.statement };
  let reads = 0;
  Object.defineProperty(statement, 'audience_id', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1;
      return reads === 1 ? otherAudience : proof.statement.audience_id;
    }
  });
  assert.throws(
    () => f.verify({ ...proof, statement }, { expected_audience_id: otherAudience }),
    error => error instanceof ValidationError && /accessor/.test(error.message)
  );
  assert.equal(reads, 0);
});

test('a Proxy or accessor anywhere in the proof or root evidence is rejected before any trap or getter runs', () => {
  const f = fixture();
  const proof = f.sign();
  const positions = [
    ['proof', proof, (value) => f.verify(value)],
    ['root_attestation', f.attestation, (value) => f.verify(proof, { root_attestation: value })],
    ['root_authority', f.root, (value) => f.verify(proof, { root_authority: value })]
  ];
  let checked = 0;
  for (const [name, document, run] of positions) {
    for (const path of containerPaths(document)) {
      const counter = { traps: 0 };
      assert.throws(
        () => run(withProxyAt(document, path, counter)),
        error => error instanceof ValidationError && /Proxy/.test(error.message),
        `${name} Proxy at ${label(path)}`
      );
      assert.equal(counter.traps, 0, `${name} Proxy at ${label(path)} ran a trap`);
      checked += 1;
    }
    for (const path of propertyPaths(document)) {
      const counter = { getters: 0 };
      assert.throws(
        () => run(withAccessorAt(document, path, counter)),
        error => error instanceof ValidationError && /accessor/.test(error.message),
        `${name} accessor at ${label(path)}`
      );
      assert.equal(counter.getters, 0, `${name} accessor at ${label(path)} ran its getter`);
      checked += 1;
    }
  }
  assert.ok(checked > 60, `expected to cover every position, covered ${checked}`);
});

test('hidden, symbol, non-plain and cyclic proof state is rejected as plain-data failure, never a raw TypeError', () => {
  const f = fixture();
  const proof = f.sign();
  const hidden = structuredClone(proof);
  Object.defineProperty(hidden.statement, 'audience_id', {
    value: proof.statement.audience_id, enumerable: false, configurable: true, writable: true
  });
  const symbolKeyed = structuredClone(proof);
  symbolKeyed.grant[Symbol('shadow')] = 'x';
  class Statement {}
  const nonPlain = { ...proof, statement: Object.assign(new Statement(), proof.statement) };
  const cyclic = structuredClone(proof);
  cyclic.grant.authority.self = cyclic.grant.authority;
  const customArrayProperty = structuredClone(proof);
  customArrayProperty.grant.authority.actions.extra = 'x';
  const sparse = structuredClone(proof);
  sparse.grant.authority.actions = new Array(1);
  const outOfRangeIndex = structuredClone(proof);
  outOfRangeIndex.grant.authority.actions = [];
  outOfRangeIndex.grant.authority.actions.length = 1;
  outOfRangeIndex.grant.authority.actions['4294967295'] = 'system.echo';
  const functionValued = structuredClone(proof);
  functionValued.statement.audience_id = () => proof.statement.audience_id;
  const cases = [
    ['hidden', hidden, /non-enumerable/],
    ['symbolKeyed', symbolKeyed, /symbol key/],
    ['nonPlain', nonPlain, /non-plain prototype/],
    ['cyclic', cyclic, /is cyclic/],
    ['customArrayProperty', customArrayProperty, /custom array property/],
    ['sparse', sparse, /sparse array/],
    ['outOfRangeIndex', outOfRangeIndex, /custom array property 4294967295/],
    ['functionValued', functionValued, /is a function/]
  ];
  for (const [name, value, reason] of cases) {
    assert.throws(
      () => f.verify(value),
      error => error instanceof ValidationError && /must be plain data/.test(error.message)
        && reason.test(error.message),
      name
    );
  }
  const revocationCounter = { traps: 0 };
  assert.throws(
    () => f.verify(proof, { revocations: countingProxy([], revocationCounter) }),
    error => error instanceof ValidationError && /Proxy/.test(error.message)
  );
  assert.equal(revocationCounter.traps, 0);
});

test('plain JSON, structured clones and null-prototype copies of a valid proof still verify', () => {
  const f = fixture();
  const proof = f.sign();
  assert.equal(f.verify(JSON.parse(JSON.stringify(proof))).valid, true);
  assert.equal(f.verify(structuredClone(proof)).valid, true);
  assert.equal(f.verify(nullPrototypeCopy(proof)).valid, true);
  assert.equal(f.verify(proof, { root_attestation: nullPrototypeCopy(f.attestation) }).valid, true);
});

test('create reads the root attestation once and rejects a hostile root attestation', () => {
  const f = fixture();
  const counter = { getters: 0 };
  assert.throws(
    () => f.sign({ root_attestation: withAccessorAt(f.attestation, ['statement', 'root_binding_digest'], counter) }),
    error => error instanceof ValidationError && /accessor/.test(error.message)
  );
  assert.equal(counter.getters, 0);
  const proxyCounter = { traps: 0 };
  assert.throws(
    () => f.sign({ root_attestation: withProxyAt(f.attestation, ['statement'], proxyCounter) }),
    error => error instanceof ValidationError && /Proxy/.test(error.message)
  );
  assert.equal(proxyCounter.traps, 0);
  const grantCounter = { getters: 0 };
  assert.throws(
    () => f.sign({ grant: withAccessorAt(f.grant, ['authority', 'actions', '0'], grantCounter) }),
    error => error instanceof ValidationError && /accessor/.test(error.message)
  );
  assert.equal(grantCounter.getters, 0);
  const authorityCounter = { traps: 0 };
  assert.throws(
    () => f.sign({ root_authority: withProxyAt(f.root, ['budgets'], authorityCounter) }),
    error => error instanceof ValidationError && /Proxy/.test(error.message)
  );
  assert.equal(authorityCounter.traps, 0);
});

test('caller options that rewrite the raw proof mid-verify cannot redirect the audience check', () => {
  const f = fixture();
  const input = structuredClone(f.sign());
  let rewrites = 0;
  // `now` is coerced after the snapshot and before the audience check.
  const now = {
    [Symbol.toPrimitive]() {
      rewrites += 1;
      input.statement.audience_id = 'verifier.other';
      return T2;
    }
  };
  assert.throws(
    () => f.verify(input, { expected_audience_id: 'verifier.other', now }),
    /audience does not match pinned verifier/
  );
  assert.ok(rewrites > 0, 'the option hook must have run');
  assert.equal(input.statement.audience_id, 'verifier.other');
});

test('over-deep and shared-reference blow-up proofs are rejected cleanly by the snapshot limits', () => {
  const f = fixture();
  const proof = f.sign();
  let deep = {};
  const deepRoot = deep;
  for (let index = 0; index < 65; index += 1) {
    deep.x = {};
    deep = deep.x;
  }
  assert.throws(
    () => f.verify({ ...proof, statement: { ...proof.statement, extra: deepRoot } }),
    error => error instanceof ValidationError && /exceeds the depth bound/.test(error.message)
  );
  let dag = { leaf: true };
  for (let index = 0; index < 22; index += 1) dag = { a: dag, b: dag };
  assert.throws(
    () => f.verify({ ...proof, statement: { ...proof.statement, extra: dag } }),
    error => error instanceof ValidationError && /exceeds the node budget/.test(error.message)
  );
});

test('caller options that rewrite the raw root attestation cannot change the binding create signs against', () => {
  const f = fixture();
  const rootAttestation = structuredClone(f.attestation);
  const signerKey = createPrivateKey(f.signer.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  let rewrites = 0;
  // The signer key is read after the snapshot and before the binding lookup.
  Object.defineProperty(signerKey, 'type', {
    configurable: true,
    get() {
      rewrites += 1;
      rootAttestation.statement.root_binding_digest = 'e'.repeat(64);
      return 'private';
    }
  });
  const proof = f.sign({ root_attestation: rootAttestation, signer_private_key: signerKey });
  assert.ok(rewrites > 0, 'the option hook must have run');
  assert.equal(proof.statement.root_binding_digest, f.rootBinding.binding_digest);
  assert.equal(f.verify(proof).valid, true);
});

function withOwnProto(value, path, injected) {
  // JSON.parse creates an own "__proto__" data key; plain assignment would not.
  const copy = structuredClone(value);
  let holder = copy;
  for (const key of path) holder = holder[key];
  const text = JSON.stringify(holder).replace(/^\{/, `{"__proto__":${JSON.stringify(injected)},`);
  const replaced = JSON.parse(text);
  if (path.length === 0) return replaced;
  let parent = copy;
  for (const key of path.slice(0, -1)) parent = parent[key];
  parent[path.at(-1)] = replaced;
  return copy;
}

test('an own __proto__ key (JSON.parse) in the proof or its root attestation is rejected, never applied as a prototype', () => {
  const f = fixture();
  const proof = f.sign();
  assert.equal(f.verify(JSON.parse(JSON.stringify(proof))).valid, true);
  for (const path of [[], ['statement'], ['grant'], ['grant', 'authority']]) {
    const tampered = withOwnProto(proof, path, { audience_id: 'verifier.example', valid: true });
    assert.equal(Object.hasOwn(path.reduce((node, key) => node[key], tampered), '__proto__'), true);
    assert.throws(() => f.verify(tampered), ValidationError, `proof ${path.join('.') || '<root>'}`);
  }
  for (const path of [[], ['statement']]) {
    const attestation = withOwnProto(f.attestation, path, { signer_id: 'owner.alice' });
    assert.throws(() => f.verify(proof, { root_attestation: attestation }), ValidationError, `attestation ${path.join('.') || '<root>'}`);
  }
});

test('bigint, symbol, undefined and non-finite proof values are plain-data ValidationErrors, never a raw TypeError', () => {
  const f = fixture();
  const proof = f.sign();
  for (const [label, value] of [['bigint', 1n], ['symbol', Symbol('x')], ['undefined', undefined], ['NaN', Number.NaN], ['Infinity', Infinity]]) {
    const tampered = structuredClone(proof);
    tampered.statement.audience_id = value;
    assert.throws(() => f.verify(tampered), error => error instanceof ValidationError && /must be plain data/.test(error.message), label);
  }
});

import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PraxisRuntimeError } from '../../labs/praxis/index.mjs';
import {
  createNullifierRegistry,
  signAttestation,
  verifyAttestation
} from '../../labs/praxis/attestation.mjs';
import { NULLIFIER_SPEND_SCHEMA, openDurableNullifierStore } from '../src/lib/nullifier-store.mjs';

// The durable store the Praxis attestation gate's host injects into its
// nullifier registry (labs/praxis/ATTESTATION-GATE.md, "Next steps" 2).

const NOW = 1_700_000_000_000;
const nullifier = () => `sha256:${randomBytes(32).toString('hex')}`;

async function storePath(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-nullifier-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'gate', 'nullifiers.jsonl');
}

test('a spent attestation stays spent across restarts of the gate host', async t => {
  const path = await storePath(t);
  const attestor = generateKeyPairSync('ed25519');
  const options = registry => ({
    trustedKeys: { 'attest:tests': attestor.publicKey },
    trustedAttestorsByKind: {
      'tests-reproduced': ['attest:tests'],
      'adversarial-review': ['attest:tests'],
      'protected-ci': ['attest:tests'],
      'scope-honesty': ['attest:tests']
    },
    nullifiers: registry,
    now: NOW
  });
  const attestation = signAttestation({
    attestor: 'attest:tests',
    subject: 'tests:nullifier-store',
    kind: 'tests-reproduced',
    mergeTarget: `pr:1821@sha256:${'a'.repeat(64)}`,
    claims: { tests_passed: 1, tests_failed: 0, tests_total: 1 },
    nonClaims: ['provider_identity'],
    nullifier: nullifier(),
    issuedAtMs: NOW - 1_000,
    expiresAtMs: NOW + 60_000,
    evidenceRefs: ['evidence:synthetic']
  }, attestor.privateKey);

  const first = openDurableNullifierStore(path);
  verifyAttestation(attestation, options(createNullifierRegistry({ store: first })));
  assert.equal(first.size, 1);
  first.close();

  // A new process: the replay is refused from what is on disk.
  const second = openDurableNullifierStore(path);
  assert.throws(
    () => verifyAttestation(attestation, options(createNullifierRegistry({ store: second }))),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_REPLAY'
  );
  second.close();
  if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('the store is hash-linked, and any edit, removal, reorder or repeat fails closed', async t => {
  const path = await storePath(t);
  const store = openDurableNullifierStore(path);
  const spent = [nullifier(), nullifier(), nullifier()];
  for (const [index, value] of spent.entries()) store.set(value, NOW + index);
  assert.deepEqual(store.head().seq, 3);
  store.close();
  const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
  assert.deepEqual(JSON.parse(lines[0]), {
    schema: NULLIFIER_SPEND_SCHEMA, seq: 1, nullifier: spent[0], spent_at_ms: NOW, previous: null
  });

  const refuses = (content, pattern) => {
    writeFileSync(path, content);
    assert.throws(() => openDurableNullifierStore(path), pattern);
  };
  const edited = JSON.stringify({ ...JSON.parse(lines[1]), nullifier: nullifier() });
  refuses([lines[0], edited, lines[2], ''].join('\n'), /line 3 does not continue the chain/);
  refuses([lines[0], lines[2], ''].join('\n'), /line 2 does not continue the chain/);
  refuses([lines[1], lines[0], lines[2], ''].join('\n'), /line 1 does not continue the chain/);
  refuses([lines[0], 'not json', lines[2], ''].join('\n'), /line 2 is malformed/);
  refuses([lines[0], ` ${lines[1]}`, lines[2], ''].join('\n'), /line 2 does not continue the chain/);
  const repeat = JSON.stringify({
    schema: NULLIFIER_SPEND_SCHEMA, seq: 2, nullifier: spent[0], spent_at_ms: NOW,
    previous: JSON.parse(lines[1]).previous
  });
  // A line that repeats a nullifier must also link correctly to be reached.
  const { canonicalJson, sha256 } = await import('../src/lib/canonical.mjs');
  const relinked = canonicalJson({ ...JSON.parse(repeat), previous: sha256(lines[0]) });
  refuses([lines[0], relinked, ''].join('\n'), /spends .* twice/);
  // Correctly linked, but numbered out of order.
  refuses([lines[0], canonicalJson({ ...JSON.parse(lines[1]), seq: 5 }), ''].join('\n'), /line 2 does not continue the chain/);

  // Restored, it opens and keeps all three.
  writeFileSync(path, `${lines.join('\n')}\n`);
  const reopened = openDurableNullifierStore(path);
  assert.ok(spent.every(value => reopened.has(value)));
  reopened.close();
});

test('a spend cut short by a crash was never acknowledged and is dropped on open', async t => {
  const path = await storePath(t);
  const store = openDurableNullifierStore(path);
  const kept = nullifier();
  store.set(kept, NOW);
  const head = store.head();
  store.close();
  const torn = nullifier();
  appendFileSync(path, `{"schema":"${NULLIFIER_SPEND_SCHEMA}","seq":2,"nullifier":"${torn}"`);

  const reopened = openDurableNullifierStore(path);
  assert.equal(reopened.has(kept), true);
  assert.equal(reopened.has(torn), false);
  assert.deepEqual(reopened.head(), head);
  reopened.set(torn, NOW + 1);
  reopened.close();
  // The file is whole again: every line ends, and it reopens.
  assert.ok(readFileSync(path, 'utf8').endsWith('\n'));
  const again = openDurableNullifierStore(path);
  assert.equal(again.size, 2);
  again.close();
});

test('a recorded head detects spends removed from the end', async t => {
  const path = await storePath(t);
  const store = openDurableNullifierStore(path);
  store.set(nullifier(), NOW);
  store.set(nullifier(), NOW + 1);
  const recorded = store.head();
  store.set(nullifier(), NOW + 2);
  store.close();

  // Grown since the head was recorded: still holds it.
  openDurableNullifierStore(path, { expectedHead: recorded }).close();
  const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
  writeFileSync(path, `${lines.slice(0, 1).join('\n')}\n`);
  // The file alone cannot tell; the recorded head can.
  openDurableNullifierStore(path).close();
  assert.throws(() => openDurableNullifierStore(path, { expectedHead: recorded }), /behind its recorded head/);
  assert.throws(
    () => openDurableNullifierStore(path, { expectedHead: { seq: 1, digest: 'f'.repeat(64) } }),
    /does not match its recorded head/
  );
  assert.throws(() => openDurableNullifierStore(path, { expectedHead: { seq: 1, digest: 'x' } }), /head is invalid/);
  assert.throws(() => openDurableNullifierStore(path, { expectedHead: { seq: 1, digest: null } }), /head is invalid/);
  openDurableNullifierStore(path, { expectedHead: { seq: 0, digest: null } }).close();
});

test('one process holds the store; values are checked; a closed store refuses use', async t => {
  const path = await storePath(t);
  const store = openDurableNullifierStore(path);
  assert.throws(() => openDurableNullifierStore(path), /in use by another process/);
  const value = nullifier();
  store.set(value, NOW);
  assert.throws(() => store.set(value, NOW), /already been spent/);
  assert.throws(() => store.set('sha256:abc', NOW), /Nullifier is invalid/);
  assert.throws(() => store.set(nullifier(), 1.5), /spend time is invalid/);
  assert.throws(() => store.set(nullifier(), -1), /spend time is invalid/);
  assert.equal(store.size, 1, 'refused spends write nothing');
  store.close();
  assert.throws(() => store.has(value), /closed/);

  // A lock left by a process that no longer runs is taken over.
  writeFileSync(`${path}.lock`, JSON.stringify({ pid: 2 ** 31 - 2 }));
  const taken = openDurableNullifierStore(path);
  assert.equal(taken.has(value), true);
  taken.close();
  // A lock held by a live process is not.
  writeFileSync(`${path}.lock`, JSON.stringify({ pid: process.pid }));
  assert.throws(() => openDurableNullifierStore(path), /in use by another process/);
});

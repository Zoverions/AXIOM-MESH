import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';

import { openPublicWitnessDurableStore } from '../src/lib/public-witness-durable-store.mjs';
import {
  PUBLIC_WITNESS_PROCESS_CONFIG_SCHEMA,
  PUBLIC_WITNESS_PROCESS_REQUEST_SCHEMA,
  loadPublicWitnessProcessRuntime,
  runPublicWitnessStdio
} from '../src/public-witness-service.mjs';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  };
}

async function processFixture({ maxRequestBytes = 512 } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-witness-hardening-'));
  const witness = keys();
  const keyPath = join(dir, 'witness-key.pem');
  const statePath = join(dir, 'witness-state.jsonl');
  const configPath = join(dir, 'witness-config.json');
  await writeFile(keyPath, witness.privateKey, { encoding: 'utf8', mode: 0o600 });
  await writeFile(configPath, JSON.stringify({
    schema: PUBLIC_WITNESS_PROCESS_CONFIG_SCHEMA,
    domain_id: 'axiom.social.public.v1',
    witness_id: 'witness-hardening-one',
    witness_private_key_path: './witness-key.pem',
    state_path: './witness-state.jsonl',
    max_artifacts: null,
    max_conflicts: null,
    max_state_bytes: null,
    max_record_bytes: null,
    max_request_bytes: maxRequestBytes
  }), 'utf8');
  return {
    dir,
    witness,
    keyPath,
    statePath,
    configPath,
    runtime: await loadPublicWitnessProcessRuntime(configPath)
  };
}

function snapshotRequest(index) {
  return JSON.stringify({
    schema: PUBLIC_WITNESS_PROCESS_REQUEST_SCHEMA,
    request_id: `snapshot-${index}`,
    operation: 'snapshot',
    payload: {}
  });
}

test('durable store does not expose witness secret or mutable internal collections as public fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-witness-private-fields-'));
  const witness = keys();
  const store = await openPublicWitnessDurableStore({
    statePath: join(dir, 'state.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-private-fields',
    witnessPrivateKey: witness.privateKey
  });
  assert.equal('witnessPrivateKey' in store, false);
  assert.equal('records' in store, false);
  assert.equal('core' in store, false);
  assert.equal('statePath' in store, false);
  assert.deepEqual(Object.keys(store), []);
  assert.match(store.witnessPublicKey, /BEGIN PUBLIC KEY/);
});

test('one large input chunk containing many individually bounded requests is processed without treating the chunk as one request', async () => {
  const data = await processFixture({ maxRequestBytes: 512 });
  const requests = Array.from({ length: 12 }, (_, index) => snapshotRequest(index + 1));
  const chunk = `${requests.join('\n')}\n`;
  assert.ok(Buffer.byteLength(chunk, 'utf8') > data.runtime.config.max_request_bytes);
  assert.ok(requests.every(item => Buffer.byteLength(item, 'utf8') <= data.runtime.config.max_request_bytes));

  let outputText = '';
  const output = new Writable({
    write(bytes, _encoding, callback) {
      outputText += bytes.toString();
      callback();
    }
  });
  await runPublicWitnessStdio(data.runtime, {
    input: Readable.from([Buffer.from(chunk)]),
    output
  });
  const responses = outputText.trim().split('\n').map(JSON.parse);
  assert.equal(responses.length, requests.length);
  assert.equal(responses.every(item => item.ok === true), true);
});

test('oversized config and witness-key files are rejected before runtime activation', async () => {
  const data = await processFixture();
  await writeFile(data.configPath, 'x'.repeat(64 * 1024 + 1), 'utf8');
  await assert.rejects(
    () => loadPublicWitnessProcessRuntime(data.configPath),
    /config file exceeds configured byte limit/
  );

  const fresh = await processFixture();
  await writeFile(fresh.keyPath, 'x'.repeat(64 * 1024 + 1), 'utf8');
  await assert.rejects(
    () => loadPublicWitnessProcessRuntime(fresh.configPath),
    /private key file exceeds configured byte limit/
  );
});

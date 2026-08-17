import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import { createPublicPersonaProjection } from '../src/lib/social-publication.mjs';
import { createPersonaSigningCredential } from '../src/lib/persona-journal-credential.mjs';
import {
  PUBLIC_WITNESS_PROCESS_CONFIG_SCHEMA,
  PUBLIC_WITNESS_PROCESS_REQUEST_SCHEMA,
  PUBLIC_WITNESS_PROCESS_RESPONSE_SCHEMA,
  handlePublicWitnessProcessRequest,
  loadPublicWitnessProcessRuntime,
  normalizePublicWitnessProcessConfig,
  runPublicWitnessStdio
} from '../src/public-witness-service.mjs';

const T0 = '2026-08-17T18:00:00.000Z';
const T1 = '2026-08-17T18:01:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

async function runtimeFixture(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-witness-process-'));
  const witness = keys();
  const keyPath = join(dir, 'witness-key.pem');
  const statePath = join(dir, 'witness-state.jsonl');
  const configPath = join(dir, 'witness-config.json');
  await writeFile(keyPath, witness.privateKey, { encoding: 'utf8', mode: 0o600 });
  const config = {
    schema: PUBLIC_WITNESS_PROCESS_CONFIG_SCHEMA,
    domain_id: 'axiom.social.public.v1',
    witness_id: 'witness-process-one',
    witness_private_key_path: './witness-key.pem',
    state_path: './witness-state.jsonl',
    max_artifacts: null,
    max_conflicts: null,
    max_state_bytes: null,
    max_record_bytes: null,
    max_request_bytes: 1024 * 1024,
    ...overrides
  };
  await writeFile(configPath, JSON.stringify(config), 'utf8');
  const runtime = await loadPublicWitnessProcessRuntime(configPath);
  return { dir, witness, keyPath, statePath, configPath, config, runtime };
}

function credentialFixture() {
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-process-witness',
    controller_actor_id: 'actor-private-process-witness',
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: T0,
    status: 'active'
  };
  const projection = createPublicPersonaProjection(persona);
  const root = keys();
  const journal = keys();
  const credential = createPersonaSigningCredential({
    personaId: projection.persona_id,
    personaProjectionDigest: projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: journal.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  return { persona, projection, root, journal, credential };
}

function request(requestId, operation, payload) {
  return {
    schema: PUBLIC_WITNESS_PROCESS_REQUEST_SCHEMA,
    request_id: requestId,
    operation,
    payload
  };
}

test('standalone process runtime loads a separate key/state config and exposes bounded non-network operations', async () => {
  const data = await runtimeFixture();
  const credential = credentialFixture();
  const observed = await handlePublicWitnessProcessRequest(data.runtime, request(
    'observe-one',
    'observe-credential',
    {
      credential: credential.credential,
      trusted_persona_root_public_key: credential.root.publicKey,
      observed_at: T1
    }
  ));
  assert.equal(observed.schema, PUBLIC_WITNESS_PROCESS_RESPONSE_SCHEMA);
  assert.equal(observed.ok, true);
  assert.equal(observed.result.observation.statement.network_effect, 'none');
  assert.ok(observed.result.durable_record);

  const snapshot = await handlePublicWitnessProcessRequest(data.runtime, request('snapshot-one', 'snapshot', {}));
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.result.durable_record_count, 1);
  assert.equal(snapshot.result.global_currentness_claimed, false);
  assert.equal(snapshot.result.finality_claimed, false);

  const verified = await handlePublicWitnessProcessRequest(data.runtime, request('verify-one', 'verify-state', {}));
  assert.equal(verified.ok, true);
  assert.equal(verified.result.valid, true);
  assert.equal(verified.result.network_effect, 'none');
  assert.ok((await readFile(data.statePath, 'utf8')).length > 0);
});

test('stdio protocol handles independent requests without opening a network transport', async () => {
  const data = await runtimeFixture();
  const input = Readable.from([
    'not-json\n',
    `${JSON.stringify(request('snapshot-two', 'snapshot', {}))}\n`,
    `${JSON.stringify(request('conflicts-two', 'list-conflicts', {}))}\n`
  ]);
  let outputText = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      outputText += chunk.toString();
      callback();
    }
  });
  await runPublicWitnessStdio(data.runtime, { input, output });
  const lines = outputText.trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].ok, false);
  assert.equal(lines[0].request_id, 'invalid-request');
  assert.equal(lines[1].request_id, 'snapshot-two');
  assert.equal(lines[1].ok, true);
  assert.deepEqual(lines[2].result, []);
});

test('process config is exact, resolves local paths, and refuses key/state aliasing', async () => {
  const data = await runtimeFixture();
  const normalized = normalizePublicWitnessProcessConfig(data.config, data.configPath);
  assert.equal(normalized.schema, PUBLIC_WITNESS_PROCESS_CONFIG_SCHEMA);
  assert.equal(normalized.witness_private_key_path, data.keyPath);
  assert.equal(normalized.state_path, data.statePath);
  assert.throws(
    () => normalizePublicWitnessProcessConfig({
      ...data.config,
      state_path: './witness-key.pem'
    }, data.configPath),
    /key path and state path must be distinct/
  );
  assert.throws(
    () => normalizePublicWitnessProcessConfig({
      ...data.config,
      extra: true
    }, data.configPath),
    /fields are invalid/
  );
});

test('stdio request-size and incomplete-record boundaries fail closed', async () => {
  const data = await runtimeFixture({ max_request_bytes: 64 });
  const oversized = Readable.from([Buffer.alloc(65, 0x61)]);
  const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  await assert.rejects(() => runPublicWitnessStdio(data.runtime, { input: oversized, output: sink }), /exceeds configured byte limit/);

  const fresh = await runtimeFixture();
  const incomplete = Readable.from([JSON.stringify(request('snapshot-three', 'snapshot', {}))]);
  await assert.rejects(() => runPublicWitnessStdio(fresh.runtime, { input: incomplete, output: sink }), /incomplete request/);
});

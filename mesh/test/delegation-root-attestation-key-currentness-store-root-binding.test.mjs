import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  openDelegationRootAttestationKeyCurrentnessStore
} from '../src/lib/delegation-root-attestation-key-currentness-store.mjs';

const ROOT_BINDING_DIGEST = 'a'.repeat(64);
const ROOT_AUTHORITY_DIGEST = 'b'.repeat(64);
const ROOT_HOLDER = 'owner.alice';

async function tempState(t, suffix) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-delegation-currentness-root-binding-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  return join(dir, suffix);
}

function trustOptions(statePath) {
  const controller = generateKeyPairSync('ed25519');
  return {
    statePath,
    trustedControllerPublicKey: controller.publicKey,
    expectedRootBindingDigest: ROOT_BINDING_DIGEST,
    expectedRootAuthorityDigest: ROOT_AUTHORITY_DIGEST,
    expectedRootHolder: ROOT_HOLDER
  };
}

test('durable currentness store requires an expected root binding digest at open', async t => {
  const statePath = await tempState(t, 'binding.jsonl');
  const options = trustOptions(statePath);
  delete options.expectedRootBindingDigest;

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(options),
    /expected root binding digest.*required|requires.*root binding/i
  );
});

test('durable currentness store requires an expected root authority digest at open', async t => {
  const statePath = await tempState(t, 'authority.jsonl');
  const options = trustOptions(statePath);
  delete options.expectedRootAuthorityDigest;

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(options),
    /expected root authority digest.*required|requires.*root authority/i
  );
});

test('durable currentness store requires an expected root holder at open', async t => {
  const statePath = await tempState(t, 'holder.jsonl');
  const options = trustOptions(statePath);
  delete options.expectedRootHolder;

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(options),
    /expected root holder.*required|requires.*root holder/i
  );
});

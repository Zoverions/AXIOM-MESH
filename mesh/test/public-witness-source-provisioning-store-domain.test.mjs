import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openPublicWitnessReceiverStore } from '../src/lib/public-witness-receiver-store.mjs';
import { openPublicWitnessSourceProvisioningApplicationStore } from '../src/lib/public-witness-source-provisioning-store.mjs';

function key() {
  return generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

test('provisioning application refuses a receiver from another domain', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-domain-'));
  const witness = key();
  const operatorPair = generateKeyPairSync('ed25519');
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.other.v1',
    witnessId: 'domain-witness',
    witnessPrivateKey: witness
  });
  await assert.rejects(
    openPublicWitnessSourceProvisioningApplicationStore({
      statePath: join(dir, 'application.jsonl'),
      receiverStore: receiver,
      domainId: 'axiom.social.public.v1',
      operatorId: 'domain-operator',
      trustedOperatorPublicKey: operatorPair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      provisionerId: 'domain-provisioner',
      provisionerPrivateKey: key()
    }),
    /receiver belongs to a different domain/
  );
});

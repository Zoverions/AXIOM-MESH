import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openPublicWitnessReceiverStore } from '../src/lib/public-witness-receiver-store.mjs';
import { createPublicWitnessSourceProvisioningCommand } from '../src/lib/public-witness-source-provisioning.mjs';
import { openPublicWitnessSourceProvisioningApplicationStore } from '../src/lib/public-witness-source-provisioning-store.mjs';
import { createPublicWitnessSourceAdmission } from '../src/lib/public-witness-transfer.mjs';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

test('exact command replay after linkage does not append another application or receiver record', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-link-replay-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'link-replay-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'link-replay-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission,
    operatorId: 'link-replay-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'link-replay-command',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath: join(dir, 'application.jsonl'),
    receiverStore: receiver,
    domainId: 'axiom.social.public.v1',
    operatorId: 'link-replay-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'link-replay-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  await store.apply(command, { appliedAt: '2026-08-17T23:01:00.000Z' });
  const appCount = store.snapshot().durable_record_count;
  const receiverCount = receiver.snapshot().durable_record_count;
  const replay = await store.apply(command, { appliedAt: '2026-08-17T23:02:00.000Z' });
  assert.equal(replay.status, 'replay');
  assert.equal(store.snapshot().durable_record_count, appCount);
  assert.equal(receiver.snapshot().durable_record_count, receiverCount);
});

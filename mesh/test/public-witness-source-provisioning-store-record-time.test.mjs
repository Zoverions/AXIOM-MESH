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

test('application journal refuses time regression on later commands', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-record-time-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source1 = keys();
  const source2 = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'record-time-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission1 = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'record-time-source-one',
    sourcePublicKey: source1.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const admission2 = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'record-time-source-two',
    sourcePublicKey: source2.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command1 = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission1,
    operatorId: 'record-time-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'record-time-command-one',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  const command2 = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission2,
    operatorId: 'record-time-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'record-time-command-two',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath: join(dir, 'application.jsonl'),
    receiverStore: receiver,
    domainId: 'axiom.social.public.v1',
    operatorId: 'record-time-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'record-time-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  await store.apply(command1, { appliedAt: '2026-08-17T23:03:00.000Z' });
  const before = receiver.snapshot().durable_record_count;
  await assert.rejects(
    store.apply(command2, { appliedAt: '2026-08-17T23:02:00.000Z' }),
    /record time cannot move backward/
  );
  assert.equal(receiver.snapshot().durable_record_count, before);
  assert.equal(receiver.getSourceAdmission(admission2.admission_digest), null);
});

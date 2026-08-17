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

test('known local linkage-capacity exhaustion fails before W2c2 mutation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-capacity-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'capacity-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'capacity-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission,
    operatorId: 'capacity-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'capacity-command',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });

  const statePath = join(dir, 'application.jsonl');
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath,
    receiverStore: receiver,
    domainId: 'axiom.social.public.v1',
    operatorId: 'capacity-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'capacity-provisioner',
    provisionerPrivateKey: provisioner.privateKey,
    maxStateBytes: 7000,
    maxRecordBytes: 6000
  });
  const before = receiver.snapshot().durable_record_count;
  await assert.rejects(
    store.apply(command, { appliedAt: '2026-08-17T23:01:00.000Z' }),
    /lacks reserved capacity for linkage|state capacity is exhausted/
  );
  assert.equal(receiver.snapshot().durable_record_count, before);
  assert.equal(receiver.getSourceAdmission(admission.admission_digest), null);
});

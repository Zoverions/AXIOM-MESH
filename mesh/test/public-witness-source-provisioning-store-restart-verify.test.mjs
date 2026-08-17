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

test('fully linked application restarts and re-verifies without replaying the receiver effect', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-restart-verify-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'restart-verify-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'restart-verify-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission,
    operatorId: 'restart-verify-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'restart-verify-command',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  const statePath = join(dir, 'application.jsonl');
  const options = {
    statePath,
    receiverStore: receiver,
    domainId: 'axiom.social.public.v1',
    operatorId: 'restart-verify-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'restart-verify-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  };
  const store = await openPublicWitnessSourceProvisioningApplicationStore(options);
  await store.apply(command, { appliedAt: '2026-08-17T23:01:00.000Z' });
  const receiverCount = receiver.snapshot().durable_record_count;
  const restarted = await openPublicWitnessSourceProvisioningApplicationStore(options);
  const verified = await restarted.verifyState();
  assert.equal(verified.valid, true);
  assert.equal(verified.linked_command_count, 1);
  assert.equal(verified.reconciliation_required_count, 0);
  assert.equal(receiver.snapshot().durable_record_count, receiverCount);
});

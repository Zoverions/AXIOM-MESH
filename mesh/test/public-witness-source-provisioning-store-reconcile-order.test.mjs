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

test('reconciliation time cannot predate the durable effect-ready attempt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-reconcile-order-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'reconcile-order-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'reconcile-order-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission,
    operatorId: 'reconcile-order-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'reconcile-order-command',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  const facade = {
    snapshot: () => receiver.snapshot(),
    getSourceAdmission: value => receiver.getSourceAdmission(value),
    admitSource: async (value, options) => {
      await receiver.admitSource(value, options);
      throw new Error('crash window');
    }
  };
  const statePath = join(dir, 'application.jsonl');
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath,
    receiverStore: facade,
    domainId: 'axiom.social.public.v1',
    operatorId: 'reconcile-order-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'reconcile-order-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  await assert.rejects(
    store.apply(command, { appliedAt: '2026-08-17T23:02:00.000Z' }),
    /crash window/
  );
  const restarted = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath,
    receiverStore: receiver,
    domainId: 'axiom.social.public.v1',
    operatorId: 'reconcile-order-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'reconcile-order-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  await assert.rejects(
    restarted.reconcilePending({ reconciledAt: '2026-08-17T23:01:00.000Z' }),
    /cannot predate effect-ready/
  );
  assert.equal(restarted.snapshot().reconciliation_required_count, 1);
});

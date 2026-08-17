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

test('authorization-only state cannot reconcile a later bypass admission as if d2 had made it effect-ready', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-no-posthoc-ready-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'no-posthoc-ready-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'no-posthoc-ready-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission,
    operatorId: 'no-posthoc-ready-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'no-posthoc-ready-command',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });

  let firstLookup = true;
  const facade = {
    snapshot: () => receiver.snapshot(),
    getSourceAdmission: value => {
      if (firstLookup) {
        firstLookup = false;
        return null;
      }
      throw new Error('stop after authorization retention');
    },
    admitSource: (...args) => receiver.admitSource(...args)
  };
  const statePath = join(dir, 'application.jsonl');
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath,
    receiverStore: facade,
    domainId: 'axiom.social.public.v1',
    operatorId: 'no-posthoc-ready-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'no-posthoc-ready-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  await assert.rejects(
    store.apply(command, { appliedAt: '2026-08-17T23:01:00.000Z' }),
    /stop after authorization retention/
  );
  assert.equal(store.snapshot().authorized_only_count, 1);
  assert.equal(store.snapshot().ready_pending_count, 0);

  await receiver.admitSource(admission, { admittedAt: '2026-08-17T23:02:00.000Z' });
  await assert.rejects(
    openPublicWitnessSourceProvisioningApplicationStore({
      statePath,
      receiverStore: receiver,
      domainId: 'axiom.social.public.v1',
      operatorId: 'no-posthoc-ready-operator',
      trustedOperatorPublicKey: operator.publicKey,
      provisionerId: 'no-posthoc-ready-provisioner',
      provisionerPrivateKey: provisioner.privateKey
    }),
    /without prior durable effect-ready authorization/
  );
});

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

test('linked application evidence refuses a receiver snapshot rolled back below the observed post-effect record count', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-link-head-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'link-head-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'link-head-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission,
    operatorId: 'link-head-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'link-head-command',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  const statePath = join(dir, 'application.jsonl');
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath,
    receiverStore: receiver,
    domainId: 'axiom.social.public.v1',
    operatorId: 'link-head-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'link-head-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  await store.apply(command, { appliedAt: '2026-08-17T23:01:00.000Z' });
  const realSnapshot = receiver.snapshot();
  const rolledBackFacade = {
    snapshot: () => ({
      ...realSnapshot,
      durable_record_count: realSnapshot.durable_record_count - 1,
      last_record_digest: null
    }),
    getSourceAdmission: value => receiver.getSourceAdmission(value),
    admitSource: (...args) => receiver.admitSource(...args)
  };
  await assert.rejects(
    openPublicWitnessSourceProvisioningApplicationStore({
      statePath,
      receiverStore: rolledBackFacade,
      domainId: 'axiom.social.public.v1',
      operatorId: 'link-head-operator',
      trustedOperatorPublicKey: operator.publicKey,
      provisionerId: 'link-head-provisioner',
      provisionerPrivateKey: provisioner.privateKey
    }),
    /rolled back below linked evidence|head\/count are inconsistent/
  );
});

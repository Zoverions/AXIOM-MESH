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

test('one source epoch cannot be authorized to two different source keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-epoch-conflict-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source1 = keys();
  const source2 = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'epoch-conflict-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission1 = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'epoch-conflict-source',
    sourcePublicKey: source1.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const admission2 = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'epoch-conflict-source',
    sourcePublicKey: source2.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const first = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission1,
    operatorId: 'epoch-conflict-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'epoch-conflict-one',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  const second = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission2,
    operatorId: 'epoch-conflict-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'epoch-conflict-two',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  const facade = {
    snapshot: () => receiver.snapshot(),
    getSourceAdmission: value => receiver.getSourceAdmission(value),
    admitSource: async () => { throw new Error('hold first effect'); }
  };
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath: join(dir, 'application.jsonl'),
    receiverStore: facade,
    domainId: 'axiom.social.public.v1',
    operatorId: 'epoch-conflict-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'epoch-conflict-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  await assert.rejects(store.apply(first, { appliedAt: '2026-08-17T23:01:00.000Z' }), /hold first effect/);
  await assert.rejects(
    store.apply(second, { appliedAt: '2026-08-17T23:02:00.000Z' }),
    /source epoch is already bound/
  );
  assert.equal(receiver.getSourceAdmission(admission1.admission_digest), null);
  assert.equal(receiver.getSourceAdmission(admission2.admission_digest), null);
});

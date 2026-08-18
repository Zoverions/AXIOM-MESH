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

test('effect-ready attempts cannot be created outside the operator authorization window', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-window-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'window-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'window-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission,
    operatorId: 'window-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'window-command',
    authorizedAt: '2026-08-17T23:01:00.000Z',
    expiresAt: '2026-08-17T23:03:00.000Z'
  });
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath: join(dir, 'application.jsonl'),
    receiverStore: receiver,
    domainId: 'axiom.social.public.v1',
    operatorId: 'window-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'window-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  await assert.rejects(
    store.apply(command, { appliedAt: '2026-08-17T23:00:30.000Z' }),
    /not authorized yet/
  );
  await assert.rejects(
    store.apply(command, { appliedAt: '2026-08-17T23:03:00.000Z' }),
    /expired/
  );
  assert.equal(store.snapshot().durable_record_count, 0);
  assert.equal(receiver.getSourceAdmission(admission.admission_digest), null);
});

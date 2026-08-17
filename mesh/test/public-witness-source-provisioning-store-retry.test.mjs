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

function wrap(receiver, admitSource) {
  return {
    snapshot: () => receiver.snapshot(),
    getSourceAdmission: value => receiver.getSourceAdmission(value),
    admitSource
  };
}

test('a failed ready attempt may retry with a fresh in-window attempt without re-authorizing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-retry-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'retry-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'retry-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission,
    operatorId: 'retry-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'retry-command',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  let fail = true;
  const receiverFacade = wrap(receiver, async (value, options) => {
    if (fail) throw new Error('transient receiver failure');
    return receiver.admitSource(value, options);
  });
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath: join(dir, 'application.jsonl'),
    receiverStore: receiverFacade,
    domainId: 'axiom.social.public.v1',
    operatorId: 'retry-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'retry-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  await assert.rejects(
    store.apply(command, { appliedAt: '2026-08-17T23:01:00.000Z' }),
    /transient receiver failure/
  );
  assert.equal(store.getCommandStatus(command.command_digest).ready_attempt_count, 1);
  fail = false;
  const applied = await store.apply(command, { appliedAt: '2026-08-17T23:02:00.000Z' });
  assert.equal(applied.status, 'applied');
  const status = store.getCommandStatus(command.command_digest);
  assert.equal(status.ready_attempt_count, 2);
  assert.equal(status.linked, true);
  assert.deepEqual(receiver.getSourceAdmission(admission.admission_digest), admission);
});

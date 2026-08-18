import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { appendFile, mkdtemp } from 'node:fs/promises';
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

test('detectable external application-journal drift fails before a new receiver mutation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-drift-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source1 = keys();
  const source2 = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'drift-witness',
    witnessPrivateKey: witness.privateKey
  });
  const statePath = join(dir, 'application.jsonl');
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath,
    receiverStore: receiver,
    domainId: 'axiom.social.public.v1',
    operatorId: 'drift-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'drift-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  const admission1 = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'drift-source',
    sourcePublicKey: source1.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command1 = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission1,
    operatorId: 'drift-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'drift-one',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  await store.apply(command1, { appliedAt: '2026-08-17T23:01:00.000Z' });

  const admission2 = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'drift-source',
    sourcePublicKey: source2.publicKey,
    sourceEpoch: 2,
    validFrom: '2026-08-17T23:02:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command2 = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission2,
    operatorId: 'drift-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'drift-two',
    previousAdmissionDigest: admission1.admission_digest,
    authorizedAt: '2026-08-17T23:02:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  await appendFile(statePath, '{}\n', 'utf8');
  const before = receiver.snapshot().durable_record_count;
  await assert.rejects(
    store.apply(command2, { appliedAt: '2026-08-17T23:03:00.000Z' }),
    /state changed outside active store|noncanonical|schema is unsupported/
  );
  assert.equal(receiver.snapshot().durable_record_count, before);
  assert.equal(receiver.getSourceAdmission(admission2.admission_digest), null);
});

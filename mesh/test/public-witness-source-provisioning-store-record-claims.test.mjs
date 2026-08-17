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

test('every durable application record keeps the same narrow authority and no-network boundary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-record-claims-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'record-claims-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'record-claims-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission,
    operatorId: 'record-claims-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'record-claims-command',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  const statePath = join(dir, 'application.jsonl');
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath,
    receiverStore: receiver,
    domainId: 'axiom.social.public.v1',
    operatorId: 'record-claims-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'record-claims-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  await store.apply(command, { appliedAt: '2026-08-17T23:01:00.000Z' });
  const text = await import('node:fs/promises').then(fs => fs.readFile(statePath, 'utf8'));
  const records = text.trimEnd().split('\n').map(line => JSON.parse(line));
  assert.equal(records.length, 3);
  for (const record of records) {
    assert.equal(record.statement.operator_authorization_required, true);
    assert.equal(record.statement.remote_self_provisioning_allowed, false);
    assert.equal(record.statement.receiver_mutation_scope, 'exact-authorized-source-admission');
    assert.equal(record.statement.persona_root_trust_effect, 'none');
    assert.equal(record.statement.social_authority_effect, 'none');
    assert.equal(record.statement.capability_promotion_effect, 'none');
    assert.equal(record.statement.finality_claimed, false);
    assert.equal(record.statement.authority_effect, 'w2c2-source-admission-only');
    assert.equal(record.statement.network_effect, 'none');
  }
});

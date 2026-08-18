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

test('application snapshot truthfully claims a bounded receiver effect without network, persona, social, finality, or promotion authority', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-provisioning-claims-'));
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'claims-witness',
    witnessPrivateKey: witness.privateKey
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'claims-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission,
    operatorId: 'claims-operator',
    operatorPrivateKey: operator.privateKey,
    commandId: 'claims-command',
    authorizedAt: '2026-08-17T23:00:00.000Z',
    expiresAt: '2026-08-17T23:10:00.000Z'
  });
  const store = await openPublicWitnessSourceProvisioningApplicationStore({
    statePath: join(dir, 'application.jsonl'),
    receiverStore: receiver,
    domainId: 'axiom.social.public.v1',
    operatorId: 'claims-operator',
    trustedOperatorPublicKey: operator.publicKey,
    provisionerId: 'claims-provisioner',
    provisionerPrivateKey: provisioner.privateKey
  });
  const snapshot = store.snapshot();
  assert.equal(snapshot.operator_authorization_required, true);
  assert.equal(snapshot.remote_self_provisioning_allowed, false);
  assert.equal(snapshot.receiver_mutation_scope, 'exact-authorized-source-admission');
  assert.equal(snapshot.persona_root_trust_effect, 'none');
  assert.equal(snapshot.social_authority_effect, 'none');
  assert.equal(snapshot.capability_promotion_effect, 'none');
  assert.equal(snapshot.finality_claimed, false);
  assert.equal(snapshot.authority_effect, 'w2c2-source-admission-only');
  assert.equal(snapshot.network_effect, 'none');

  await store.apply(command, { appliedAt: '2026-08-17T23:01:00.000Z' });
  const applied = store.snapshot();
  assert.equal(applied.linked_command_count, 1);
  assert.equal(applied.authority_effect, 'w2c2-source-admission-only');
  assert.equal(applied.network_effect, 'none');
});

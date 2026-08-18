import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  openPublicWitnessReceiverStore
} from '../src/lib/public-witness-receiver-store.mjs';
import {
  createPublicWitnessSourceProvisioningCommand
} from '../src/lib/public-witness-source-provisioning.mjs';
import {
  openPublicWitnessSourceProvisioningApplicationStore
} from '../src/lib/public-witness-source-provisioning-store.mjs';
import {
  createPublicWitnessSourceAdmission
} from '../src/lib/public-witness-transfer.mjs';

const DOMAIN = 'axiom.social.public.v1';
const OPERATOR_ID = 'operator-provisioning';
const PROVISIONER_ID = 'provisioner-local';
const T0 = '2026-08-17T23:00:00.000Z';
const T1 = '2026-08-17T23:01:00.000Z';
const T2 = '2026-08-17T23:02:00.000Z';
const T3 = '2026-08-17T23:03:00.000Z';
const T4 = '2026-08-17T23:04:00.000Z';
const T5 = '2026-08-17T23:05:00.000Z';
const TEND = '2026-08-18T00:00:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-source-provisioning-'));
  const receiverPath = join(dir, 'receiver.jsonl');
  const applicationPath = join(dir, 'provisioning.jsonl');
  const witness = keys();
  const operator = keys();
  const provisioner = keys();
  const source1 = keys();
  const source2 = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: receiverPath,
    domainId: DOMAIN,
    witnessId: 'witness-provisioning',
    witnessPrivateKey: witness.privateKey
  });
  const admission1 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-provisioning-one',
    sourcePublicKey: source1.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  const admission2 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-provisioning-one',
    sourcePublicKey: source2.publicKey,
    sourceEpoch: 2,
    validFrom: T2,
    expiresAt: TEND
  });
  const command1 = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission1,
    operatorId: OPERATOR_ID,
    operatorPrivateKey: operator.privateKey,
    commandId: 'provision-source-epoch-1',
    authorizedAt: T0,
    expiresAt: T4
  });
  const command2 = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission2,
    operatorId: OPERATOR_ID,
    operatorPrivateKey: operator.privateKey,
    commandId: 'provision-source-epoch-2',
    previousAdmissionDigest: admission1.admission_digest,
    authorizedAt: T2,
    expiresAt: T5
  });
  return {
    dir,
    receiverPath,
    applicationPath,
    witness,
    operator,
    provisioner,
    source1,
    source2,
    receiver,
    admission1,
    admission2,
    command1,
    command2
  };
}

async function openApplication(data, receiver = data.receiver, overrides = {}) {
  return openPublicWitnessSourceProvisioningApplicationStore({
    statePath: data.applicationPath,
    receiverStore: receiver,
    domainId: DOMAIN,
    operatorId: OPERATOR_ID,
    trustedOperatorPublicKey: data.operator.publicKey,
    provisionerId: PROVISIONER_ID,
    provisionerPrivateKey: data.provisioner.privateKey,
    ...overrides
  });
}

function receiverWrapper(receiver, admitSource) {
  return {
    snapshot: () => receiver.snapshot(),
    getSourceAdmission: digest => receiver.getSourceAdmission(digest),
    admitSource
  };
}

test('authorization and effect-ready records are durable before W2c2 source admission', async () => {
  const data = await fixture();
  const wrapped = receiverWrapper(data.receiver, async (admission, options) => {
    const text = await readFile(data.applicationPath, 'utf8');
    const records = text.trimEnd().split('\n').map(line => JSON.parse(line));
    assert.equal(records.length, 2);
    assert.equal(records[0].statement.record_kind, 'authorization-retained');
    assert.equal(records[0].payload.command.command_digest, data.command1.command_digest);
    assert.equal(records[1].statement.record_kind, 'effect-ready');
    assert.equal(records[1].payload.command_digest, data.command1.command_digest);
    assert.equal(data.receiver.getSourceAdmission(data.admission1.admission_digest), null);
    return data.receiver.admitSource(admission, options);
  });
  const store = await openApplication(data, wrapped);
  const result = await store.apply(data.command1, { appliedAt: T1 });
  assert.equal(result.status, 'applied');
  assert.equal(result.receiver_status, 'admitted');
  assert.deepEqual(data.receiver.getSourceAdmission(data.admission1.admission_digest), data.admission1);
  const snapshot = store.snapshot();
  assert.equal(snapshot.durable_record_count, 3);
  assert.equal(snapshot.command_count, 1);
  assert.equal(snapshot.linked_command_count, 1);
  assert.equal(snapshot.authorized_only_count, 0);
  assert.equal(snapshot.ready_pending_count, 0);
  assert.equal(snapshot.reconciliation_required_count, 0);
  assert.equal(snapshot.remote_self_provisioning_allowed, false);
  assert.equal(snapshot.authority_effect, 'w2c2-source-admission-only');
  assert.equal(snapshot.network_effect, 'none');
});

test('crash after W2c2 admission but before linkage reconciles after restart without a second admission', async () => {
  const data = await fixture();
  const crashAfterEffect = receiverWrapper(data.receiver, async (admission, options) => {
    await data.receiver.admitSource(admission, options);
    throw new Error('simulated crash after receiver commit');
  });
  const store = await openApplication(data, crashAfterEffect);
  await assert.rejects(
    store.apply(data.command1, { appliedAt: T1 }),
    /simulated crash after receiver commit/
  );
  assert.deepEqual(data.receiver.getSourceAdmission(data.admission1.admission_digest), data.admission1);
  assert.equal(store.snapshot().durable_record_count, 2);
  assert.equal(store.snapshot().ready_pending_count, 1);

  const restarted = await openApplication(data, data.receiver);
  assert.equal(restarted.snapshot().reconciliation_required_count, 1);
  const receiverRecordsBefore = data.receiver.snapshot().durable_record_count;
  const reconciled = await restarted.reconcilePending({ reconciledAt: T5 });
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].command_digest, data.command1.command_digest);
  assert.equal(data.receiver.snapshot().durable_record_count, receiverRecordsBefore);
  assert.equal(restarted.snapshot().linked_command_count, 1);
  assert.equal(restarted.snapshot().reconciliation_required_count, 0);

  const replay = await restarted.apply(data.command1, { appliedAt: T3 });
  assert.equal(replay.status, 'replay');
  assert.equal(data.receiver.snapshot().durable_record_count, receiverRecordsBefore);
});

test('an admission retained before authorization cannot be legitimized post hoc', async () => {
  const data = await fixture();
  await data.receiver.admitSource(data.admission1, { admittedAt: T1 });
  const store = await openApplication(data);
  await assert.rejects(
    store.apply(data.command1, { appliedAt: T2 }),
    /post-hoc authorization/
  );
  assert.equal((await readFile(data.applicationPath, 'utf8')).length, 0);
});

test('a failed effect leaves durable effect-ready evidence but expiry prevents a later new attempt', async () => {
  const data = await fixture();
  const failBeforeEffect = receiverWrapper(data.receiver, async () => {
    throw new Error('receiver unavailable before admission');
  });
  const store = await openApplication(data, failBeforeEffect);
  await assert.rejects(
    store.apply(data.command1, { appliedAt: T1 }),
    /receiver unavailable before admission/
  );
  assert.equal(store.snapshot().durable_record_count, 2);
  assert.equal(store.snapshot().ready_pending_count, 1);
  assert.equal(data.receiver.getSourceAdmission(data.admission1.admission_digest), null);

  const restarted = await openApplication(data, data.receiver);
  await assert.rejects(
    restarted.apply(data.command1, { appliedAt: T5 }),
    /expired/
  );
  const reconciled = await restarted.reconcilePending({ reconciledAt: T5 });
  assert.equal(reconciled.length, 0);
  assert.equal(data.receiver.getSourceAdmission(data.admission1.admission_digest), null);
  assert.equal(restarted.snapshot().durable_record_count, 2);
});

test('source rotation requires retained exact predecessor and W2c2 remains the epoch oracle', async () => {
  const data = await fixture();
  const store = await openApplication(data);
  await store.apply(data.command1, { appliedAt: T1 });
  const rotated = await store.apply(data.command2, { appliedAt: T3 });
  assert.equal(rotated.status, 'applied');
  assert.deepEqual(data.receiver.getSourceAdmission(data.admission2.admission_digest), data.admission2);

  const otherSource = keys();
  const admission3 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-provisioning-two',
    sourcePublicKey: otherSource.publicKey,
    sourceEpoch: 2,
    validFrom: T2,
    expiresAt: TEND
  });
  const badPrevious = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: admission3,
    operatorId: OPERATOR_ID,
    operatorPrivateKey: data.operator.privateKey,
    commandId: 'missing-exact-prior',
    previousAdmissionDigest: 'a'.repeat(64),
    authorizedAt: T2,
    expiresAt: T5
  });
  await assert.rejects(
    store.apply(badPrevious, { appliedAt: T3 }),
    /previous admission is not retained/
  );
});

test('different commands cannot claim the same admission or source epoch', async () => {
  const data = await fixture();
  const failBeforeEffect = receiverWrapper(data.receiver, async () => {
    throw new Error('hold effect');
  });
  const store = await openApplication(data, failBeforeEffect);
  await assert.rejects(store.apply(data.command1, { appliedAt: T1 }), /hold effect/);

  const duplicate = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: data.admission1,
    operatorId: OPERATOR_ID,
    operatorPrivateKey: data.operator.privateKey,
    commandId: 'second-command-same-admission',
    authorizedAt: T0,
    expiresAt: T4
  });
  await assert.rejects(
    store.apply(duplicate, { appliedAt: T2 }),
    /admission is already bound|source epoch is already bound/
  );
});

test('restart rejects provisioner-key substitution, tamper, and truncation', async () => {
  const data = await fixture();
  const store = await openApplication(data);
  await store.apply(data.command1, { appliedAt: T1 });
  await store.verifyState();

  const wrongProvisioner = keys();
  await assert.rejects(
    openApplication(data, data.receiver, { provisionerPrivateKey: wrongProvisioner.privateKey }),
    /provisioner key substitution|provisioner signature is invalid/
  );

  const original = await readFile(data.applicationPath, 'utf8');
  const lines = original.trimEnd().split('\n');
  const first = JSON.parse(lines[0]);
  first.statement.provisioner_id = 'tampered-provisioner';
  lines[0] = JSON.stringify(first);
  const tamperedPath = join(data.dir, 'tampered.jsonl');
  await writeFile(tamperedPath, `${lines.join('\n')}\n`, 'utf8');
  await assert.rejects(
    openPublicWitnessSourceProvisioningApplicationStore({
      statePath: tamperedPath,
      receiverStore: data.receiver,
      domainId: DOMAIN,
      operatorId: OPERATOR_ID,
      trustedOperatorPublicKey: data.operator.publicKey,
      provisionerId: PROVISIONER_ID,
      provisionerPrivateKey: data.provisioner.privateKey
    }),
    /noncanonical|statement digest mismatch|signature is invalid|different provisioner/
  );

  const truncatedPath = join(data.dir, 'truncated.jsonl');
  await writeFile(truncatedPath, original.slice(0, -1), 'utf8');
  await assert.rejects(
    openPublicWitnessSourceProvisioningApplicationStore({
      statePath: truncatedPath,
      receiverStore: data.receiver,
      domainId: DOMAIN,
      operatorId: OPERATOR_ID,
      trustedOperatorPublicKey: data.operator.publicKey,
      provisionerId: PROVISIONER_ID,
      provisionerPrivateKey: data.provisioner.privateKey
    }),
    /truncated/
  );
});

test('operator substitution cannot authorize provisioning and the provisioner key is not operator authority', async () => {
  const data = await fixture();
  const store = await openApplication(data);
  const wrongOperatorCommand = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: data.admission1,
    operatorId: OPERATOR_ID,
    operatorPrivateKey: data.provisioner.privateKey,
    commandId: 'wrong-authority-key',
    authorizedAt: T0,
    expiresAt: T4
  });
  await assert.rejects(
    store.apply(wrongOperatorCommand, { appliedAt: T1 }),
    /operator key substitution|operator signature is invalid/
  );
  assert.equal(data.receiver.getSourceAdmission(data.admission1.admission_digest), null);
  assert.equal((await readFile(data.applicationPath, 'utf8')).length, 0);
});

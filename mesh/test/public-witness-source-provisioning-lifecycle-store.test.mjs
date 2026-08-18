import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  openPublicWitnessReceiverStore
} from '../src/lib/public-witness-receiver-store.mjs';
import {
  PUBLIC_WITNESS_SERVICE_KEY_ROLES,
  createPublicWitnessServiceKeyCredential,
  createPublicWitnessServiceKeyRevocation,
  publicWitnessServiceKeyId
} from '../src/lib/public-witness-service-key-lifecycle.mjs';
import {
  createPublicWitnessSourceProvisioningCommandWithKeyLifecycle
} from '../src/lib/public-witness-source-provisioning-key-lifecycle.mjs';
import {
  openPublicWitnessSourceProvisioningLifecycleApplicationStore
} from '../src/lib/public-witness-source-provisioning-lifecycle-store.mjs';
import {
  createPublicWitnessSourceAdmission
} from '../src/lib/public-witness-transfer.mjs';

const DOMAIN = 'axiom.social.public.v1';
const OPERATOR_ID = 'operator-lifecycle';
const PROVISIONER_ID = 'provisioner-lifecycle';
const T0 = '2026-08-17T23:00:00.000Z';
const T1 = '2026-08-17T23:01:00.000Z';
const T2 = '2026-08-17T23:02:00.000Z';
const T4 = '2026-08-17T23:04:00.000Z';
const T5 = '2026-08-17T23:05:00.000Z';
const T6 = '2026-08-17T23:06:00.000Z';
const T8 = '2026-08-17T23:08:00.000Z';
const T10 = '2026-08-17T23:10:00.000Z';
const TEND = '2026-08-17T23:20:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function credential({
  root,
  operational,
  role,
  principalId,
  epoch = 1,
  activatedAt = T0,
  predecessor = null,
  kind = 'initial',
  disposition = null
}) {
  return createPublicWitnessServiceKeyCredential({
    domainId: DOMAIN,
    role,
    principalId,
    roleRootPrivateKey: root.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: epoch,
    activatedAt,
    transitionKind: kind,
    predecessorCredential: predecessor,
    predecessorDisposition: disposition
  });
}

async function fixture({ operatorRotation = null, provisionerRotation = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-source-provisioning-lifecycle-'));
  const receiverPath = join(dir, 'receiver.jsonl');
  const applicationPath = join(dir, 'provisioning.jsonl');
  const witness = keys();
  const operatorRoot = keys();
  const provisionerRoot = keys();
  const operator1 = keys();
  const operator2 = keys();
  const provisioner1 = keys();
  const provisioner2 = keys();
  const source1 = keys();
  const source2 = keys();
  const receiver = await openPublicWitnessReceiverStore({
    statePath: receiverPath,
    domainId: DOMAIN,
    witnessId: 'witness-lifecycle',
    witnessPrivateKey: witness.privateKey
  });
  const op1 = credential({
    root: operatorRoot,
    operational: operator1,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: OPERATOR_ID
  });
  let op2 = null;
  if (operatorRotation !== null) {
    op2 = credential({
      root: operatorRoot,
      operational: operator2,
      role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
      principalId: OPERATOR_ID,
      epoch: 2,
      activatedAt: T5,
      predecessor: op1,
      kind: operatorRotation.kind,
      disposition: operatorRotation.disposition
    });
  }
  const prov1 = credential({
    root: provisionerRoot,
    operational: provisioner1,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: PROVISIONER_ID
  });
  const prov2 = provisionerRotation
    ? credential({
      root: provisionerRoot,
      operational: provisioner2,
      role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
      principalId: PROVISIONER_ID,
      epoch: 2,
      activatedAt: T5,
      predecessor: prov1,
      kind: 'rotation',
      disposition: 'retired'
    })
    : null;
  const admission1 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-lifecycle-one',
    sourcePublicKey: source1.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  const admission2 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-lifecycle-two',
    sourcePublicKey: source2.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  return {
    dir,
    receiverPath,
    applicationPath,
    receiver,
    operatorRoot,
    provisionerRoot,
    operator1,
    operator2,
    provisioner1,
    provisioner2,
    op1,
    op2,
    prov1,
    prov2,
    admission1,
    admission2
  };
}

function operatorPath(data) {
  return data.op2 ? [data.op1, data.op2] : [data.op1];
}

function provisionerPath(data) {
  return data.prov2 ? [data.prov1, data.prov2] : [data.prov1];
}

function command(data, {
  admission,
  operatorKey = data.operator1,
  commandId,
  authorizedAt,
  expiresAt,
  path = operatorPath(data)
}) {
  return createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
    sourceAdmission: admission,
    operatorId: OPERATOR_ID,
    operatorPrivateKey: operatorKey.privateKey,
    operatorCredentialPath: path,
    trustedOperatorRoleRootPublicKey: data.operatorRoot.publicKey,
    commandId,
    authorizedAt,
    expiresAt
  });
}

async function openStore(data, provisionerKey, overrides = {}) {
  return openPublicWitnessSourceProvisioningLifecycleApplicationStore({
    statePath: data.applicationPath,
    receiverStore: data.receiver,
    domainId: DOMAIN,
    operatorId: OPERATOR_ID,
    operatorCredentialPath: operatorPath(data),
    trustedOperatorRoleRootPublicKey: data.operatorRoot.publicKey,
    provisionerId: PROVISIONER_ID,
    provisionerPrivateKey: provisionerKey.privateKey,
    provisionerCredentialPath: provisionerPath(data),
    trustedProvisionerRoleRootPublicKey: data.provisionerRoot.publicKey,
    ...overrides
  });
}

function receiverWrapper(receiver, admitSource) {
  return {
    snapshot: () => receiver.snapshot(),
    getSourceAdmission: value => receiver.getSourceAdmission(value),
    admitSource
  };
}

function parseJournal(text) {
  return text.trimEnd().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

test('restart cuts over to the successor provisioner key without rewriting historical d2 records', async () => {
  const data = await fixture();
  const firstCommand = command(data, {
    admission: data.admission1,
    commandId: 'before-provisioner-rotation',
    authorizedAt: T0,
    expiresAt: T4
  });
  const firstStore = await openStore(data, data.provisioner1);
  await firstStore.apply(firstCommand, { appliedAt: T1 });
  const firstBytes = await readFile(data.applicationPath, 'utf8');
  const firstRecords = parseJournal(firstBytes);
  assert.equal(firstRecords.length, 3);
  assert.ok(firstRecords.every(record => record.statement.provisioner_key_id === publicWitnessServiceKeyId(data.provisioner1.publicKey)));

  const secondCommand = command(data, {
    admission: data.admission2,
    commandId: 'after-provisioner-rotation',
    authorizedAt: T6,
    expiresAt: T10
  });
  const restarted = await openStore(data, data.provisioner2);
  const result = await restarted.apply(secondCommand, { appliedAt: T6 });
  assert.equal(result.status, 'applied');
  const allBytes = await readFile(data.applicationPath, 'utf8');
  assert.ok(allBytes.startsWith(firstBytes));
  const records = parseJournal(allBytes);
  assert.equal(records.length, 6);
  assert.ok(records.slice(0, 3).every(record => record.statement.provisioner_key_id === publicWitnessServiceKeyId(data.provisioner1.publicKey)));
  assert.ok(records.slice(3).every(record => record.statement.provisioner_key_id === publicWitnessServiceKeyId(data.provisioner2.publicKey)));
  assert.ok(records.every(record => !Object.hasOwn(record, 'provisioner_credential_digest')));
  const snapshot = restarted.snapshot();
  assert.equal(snapshot.current_provisioner_key_epoch, 2);
  assert.equal(snapshot.highest_provisioner_key_epoch_observed, 2);
  assert.equal(snapshot.historical_records_resigned, false);
  assert.equal(snapshot.signer_cutover_requires_reopen, true);
  assert.equal((await restarted.verifyState()).valid, true);
});

test('crash-window reconciliation may cross a provisioner rotation without replaying W2c2 admission', async () => {
  const data = await fixture();
  const firstCommand = command(data, {
    admission: data.admission1,
    commandId: 'crash-before-link',
    authorizedAt: T0,
    expiresAt: T4
  });
  let receiverCalls = 0;
  const crashingReceiver = receiverWrapper(data.receiver, async (admission, options) => {
    receiverCalls += 1;
    await data.receiver.admitSource(admission, options);
    throw new Error('simulated crash after receiver commit');
  });
  const firstStore = await openStore(data, data.provisioner1, { receiverStore: crashingReceiver });
  await assert.rejects(firstStore.apply(firstCommand, { appliedAt: T1 }), /simulated crash/);
  assert.equal(receiverCalls, 1);
  const before = await readFile(data.applicationPath, 'utf8');
  const beforeRecords = parseJournal(before);
  assert.equal(beforeRecords.length, 2);
  assert.ok(beforeRecords.every(record => record.statement.provisioner_key_id === publicWitnessServiceKeyId(data.provisioner1.publicKey)));

  const restarted = await openStore(data, data.provisioner2);
  const receiverCountBefore = data.receiver.snapshot().durable_record_count;
  const reconciled = await restarted.reconcilePending({ reconciledAt: T6 });
  assert.equal(reconciled.length, 1);
  assert.equal(data.receiver.snapshot().durable_record_count, receiverCountBefore);
  assert.equal(receiverCalls, 1);
  const records = parseJournal(await readFile(data.applicationPath, 'utf8'));
  assert.equal(records.length, 3);
  assert.equal(records[2].statement.provisioner_key_id, publicWitnessServiceKeyId(data.provisioner2.publicKey));
  assert.equal(records[2].payload.link_mode, 'restart-reconciliation');
});

test('stale provisioner writer fails before durable authorization or receiver mutation', async () => {
  const data = await fixture();
  const lateCommand = command(data, {
    admission: data.admission1,
    commandId: 'stale-provisioner-writer',
    authorizedAt: T6,
    expiresAt: T10
  });
  const staleStore = await openStore(data, data.provisioner1);
  await assert.rejects(
    staleStore.apply(lateCommand, { appliedAt: T6 }),
    /stale after successor activation/
  );
  assert.equal((await readFile(data.applicationPath, 'utf8')).length, 0);
  assert.equal(data.receiver.getSourceAdmission(data.admission1.admission_digest), null);
});

test('explicit provisioner revocation prevents future appends without invalidating earlier records', async () => {
  const data = await fixture({ provisionerRotation: false });
  const early = command(data, {
    admission: data.admission1,
    commandId: 'before-provisioner-revocation',
    authorizedAt: T0,
    expiresAt: T4
  });
  const store = await openStore(data, data.provisioner1);
  await store.apply(early, { appliedAt: T1 });
  const earlierBytes = await readFile(data.applicationPath, 'utf8');
  const revocation = createPublicWitnessServiceKeyRevocation(data.prov1, {
    trustedRoleRootPublicKey: data.provisionerRoot.publicKey,
    roleRootPrivateKey: data.provisionerRoot.privateKey,
    effectiveAt: T5,
    reasonCode: 'compromised'
  });
  const late = command(data, {
    admission: data.admission2,
    commandId: 'after-provisioner-revocation',
    authorizedAt: T6,
    expiresAt: T10
  });
  const revokedStore = await openStore(data, data.provisioner1, {
    provisionerRevocations: [revocation]
  });
  assert.equal((await revokedStore.verifyState()).valid, true);
  await assert.rejects(revokedStore.apply(late, { appliedAt: T6 }), /revoked at requested time/);
  assert.equal(await readFile(data.applicationPath, 'utf8'), earlierBytes);
  assert.equal(data.receiver.getSourceAdmission(data.admission2.admission_digest), null);
});

test('operator compromise recovery blocks a new effect before application-journal mutation', async () => {
  const data = await fixture({
    operatorRotation: { kind: 'recovery', disposition: 'compromised' },
    provisionerRotation: false
  });
  const preCompromise = command(data, {
    admission: data.admission1,
    commandId: 'pre-compromise-command',
    authorizedAt: T2,
    expiresAt: T8
  });
  const store = await openStore(data, data.provisioner1);
  await assert.rejects(
    store.apply(preCompromise, { appliedAt: T6 }),
    /revoked or compromised for new effects/
  );
  assert.equal((await readFile(data.applicationPath, 'utf8')).length, 0);
  assert.equal(data.receiver.getSourceAdmission(data.admission1.admission_digest), null);
});

test('routine operator rotation preserves a pre-issued bounded command while new operator epoch is accepted', async () => {
  const data = await fixture({
    operatorRotation: { kind: 'rotation', disposition: 'retired' },
    provisionerRotation: false
  });
  const preRotation = command(data, {
    admission: data.admission1,
    commandId: 'pre-rotation-command',
    authorizedAt: T2,
    expiresAt: T8
  });
  const store = await openStore(data, data.provisioner1);
  const first = await store.apply(preRotation, { appliedAt: T6 });
  assert.equal(first.status, 'applied');

  const newEpochCommand = command(data, {
    admission: data.admission2,
    operatorKey: data.operator2,
    commandId: 'new-operator-epoch-command',
    authorizedAt: T6,
    expiresAt: T10
  });
  const second = await store.apply(newEpochCommand, { appliedAt: T6 });
  assert.equal(second.status, 'applied');
  const snapshot = store.snapshot();
  assert.equal(snapshot.highest_operator_key_epoch_observed, 2);
  assert.equal(snapshot.network_effect, 'none');
  assert.equal(snapshot.capability_promotion_effect, 'none');
});

test('operator and provisioner role roots cannot collapse in lifecycle-aware application state', async () => {
  const data = await fixture({ provisionerRotation: false });
  const sharedRoot = keys();
  const operator = keys();
  const provisioner = keys();
  const op = credential({
    root: sharedRoot,
    operational: operator,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: OPERATOR_ID
  });
  const prov = credential({
    root: sharedRoot,
    operational: provisioner,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: PROVISIONER_ID
  });
  await assert.rejects(
    openPublicWitnessSourceProvisioningLifecycleApplicationStore({
      statePath: join(data.dir, 'collapsed-roots.jsonl'),
      receiverStore: data.receiver,
      domainId: DOMAIN,
      operatorId: OPERATOR_ID,
      operatorCredentialPath: [op],
      trustedOperatorRoleRootPublicKey: sharedRoot.publicKey,
      provisionerId: PROVISIONER_ID,
      provisionerPrivateKey: provisioner.privateKey,
      provisionerCredentialPath: [prov],
      trustedProvisionerRoleRootPublicKey: sharedRoot.publicKey
    }),
    /role roots must remain distinct/
  );
});

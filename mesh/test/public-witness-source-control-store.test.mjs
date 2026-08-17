import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PublicWitnessAuthenticatedIngress } from '../src/lib/public-witness-live-ingress.mjs';
import { openPublicWitnessReceiverStore } from '../src/lib/public-witness-receiver-store.mjs';
import {
  createPublicWitnessSourceControl
} from '../src/lib/public-witness-source-control.mjs';
import {
  openPublicWitnessSourceControlStore,
  verifyPublicWitnessSourceControlRecord
} from '../src/lib/public-witness-source-control-store.mjs';
import { createPublicWitnessSourceAdmission } from '../src/lib/public-witness-transfer.mjs';
import { sha256 } from '../src/lib/canonical.mjs';

const DOMAIN = 'axiom.social.public.v1';
const T0 = '2026-08-17T23:00:00.000Z';
const T1 = '2026-08-17T23:01:00.000Z';
const T2 = '2026-08-17T23:02:00.000Z';
const T3 = '2026-08-17T23:03:00.000Z';
const T4 = '2026-08-17T23:04:00.000Z';
const TEND = '2026-08-17T23:10:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function keyId(publicKey) {
  return sha256(createPublicKey(publicKey).export({ type: 'spki', format: 'pem' }).toString());
}

function fixture() {
  const source1 = keys();
  const source2 = keys();
  const witness = keys();
  const operator = keys();
  const root = keys();
  const admission1 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-applied-control',
    sourcePublicKey: source1.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  const admission2 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-applied-control',
    sourcePublicKey: source2.publicKey,
    sourceEpoch: 2,
    validFrom: T3,
    expiresAt: TEND
  });
  const genesis = createPublicWitnessSourceControl({
    sourceAdmission: admission1,
    certificateSha256: 'a'.repeat(64),
    operation: 'admit',
    effectiveAt: T0
  });
  const certRotation = createPublicWitnessSourceControl({
    sourceAdmission: admission1,
    certificateSha256: 'b'.repeat(64),
    operation: 'rotate-certificate',
    effectiveAt: T1,
    previousControl: genesis
  });
  const disabled = createPublicWitnessSourceControl({
    sourceAdmission: admission1,
    operation: 'disable',
    effectiveAt: T2,
    previousControl: certRotation,
    disableReason: 'operator-disable'
  });
  const sourceRotation = createPublicWitnessSourceControl({
    sourceAdmission: admission2,
    certificateSha256: 'c'.repeat(64),
    operation: 'rotate-source',
    effectiveAt: T3,
    previousControl: disabled
  });
  return { source1, source2, witness, operator, root, admission1, admission2, genesis, certRotation, disabled, sourceRotation };
}

async function stores(data, { admitSecond = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-source-control-store-'));
  const receiverPath = join(dir, 'receiver.jsonl');
  const controlPath = join(dir, 'controls.jsonl');
  const receiver = await openPublicWitnessReceiverStore({
    statePath: receiverPath,
    domainId: DOMAIN,
    witnessId: 'witness-applied-control',
    witnessPrivateKey: data.witness.privateKey
  });
  await receiver.admitSource(data.admission1, { admittedAt: T0 });
  if (admitSecond) await receiver.admitSource(data.admission2, { admittedAt: T3 });
  const controls = await openPublicWitnessSourceControlStore({
    statePath: controlPath,
    receiverStore: receiver,
    domainId: DOMAIN,
    operatorId: 'operator-applied-control',
    operatorPrivateKey: data.operator.privateKey
  });
  return { dir, receiverPath, controlPath, receiver, controls };
}

test('durable source-control store signs exact applied controls, replays idempotently, and survives restart', async () => {
  const data = fixture();
  const { controlPath, receiver, controls } = await stores(data);
  const applied = await controls.applyControl(data.genesis, { appliedAt: T0 });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.durable_record.statement.control_digest, data.genesis.control_digest);
  assert.equal(applied.durable_record.statement.local_operator_signature_claimed, true);
  assert.equal(applied.durable_record.statement.receiver_mutation_claimed, false);
  assert.equal(applied.durable_record.statement.authority_effect, 'none');
  assert.equal(applied.durable_record.statement.network_effect, 'none');
  assert.equal(controls.snapshot().active_source_count, 1);
  const bytes = (await stat(controlPath)).size;

  const replay = await controls.applyControl(data.genesis, { appliedAt: T1 });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.durable_record, null);
  assert.equal((await stat(controlPath)).size, bytes);

  const reopened = await openPublicWitnessSourceControlStore({
    statePath: controlPath,
    receiverStore: receiver,
    domainId: DOMAIN,
    operatorId: 'operator-applied-control',
    operatorPrivateKey: data.operator.privateKey
  });
  assert.equal((await reopened.verifyState()).valid, true);
  assert.equal(reopened.getCurrentControl(data.admission1.source_id).control_digest, data.genesis.control_digest);
  assert.deepEqual(reopened.resolveSourceBinding({
    certificate_sha256: 'a'.repeat(64),
    source_id: data.admission1.source_id,
    source_epoch: 1
  }), {
    certificate_sha256: 'a'.repeat(64),
    source_id: data.admission1.source_id,
    source_epoch: 1
  });
});

test('one running ingress consults durable applied control on every request, so rotation and disable take effect without reconstruction', async () => {
  const data = fixture();
  const { receiver, controls } = await stores(data);
  await controls.applyControl(data.genesis, { appliedAt: T0 });

  let receiverCalls = 0;
  const mockReceiver = {
    async receiveTransfer() {
      receiverCalls += 1;
      return {
        status: 'received',
        transfer_digest: 'd'.repeat(64),
        transfer_receipt: { receipt_digest: 'e'.repeat(64) },
        source_equivocation_evidence: null,
        observation_status: 'pending-observation'
      };
    }
  };
  let now = Date.parse(T0);
  const ingress = new PublicWitnessAuthenticatedIngress({
    receiverStore: mockReceiver,
    sourceBindingResolver: value => controls.resolveSourceBinding(value),
    personaRoots: [{ key_id: keyId(data.root.publicKey), public_key: data.root.publicKey }],
    clock: () => now,
    perClientBurst: 32
  });
  const request = epoch => ({
    transfer: { statement: { source_id: data.admission1.source_id, source_epoch: epoch } },
    persona_root_key_id: keyId(data.root.publicKey)
  });

  const first = await ingress.accept({ certificate_sha256: 'a'.repeat(64), request: request(1) });
  assert.equal(first.status, 'received');
  assert.equal(first.source_binding_source, 'local-dynamic-resolver');
  assert.equal(receiverCalls, 1);

  now = Date.parse(T1);
  await controls.applyControl(data.certRotation, { appliedAt: T1 });
  await assert.rejects(
    () => ingress.accept({ certificate_sha256: 'a'.repeat(64), request: request(1) }),
    /transport identity is not bound/
  );
  await ingress.accept({ certificate_sha256: 'b'.repeat(64), request: request(1) });
  assert.equal(receiverCalls, 2);

  now = Date.parse(T2);
  await controls.applyControl(data.disabled, { appliedAt: T2 });
  assert.equal(controls.snapshot().disabled_source_count, 1);
  await assert.rejects(
    () => ingress.accept({ certificate_sha256: 'b'.repeat(64), request: request(1) }),
    /transport identity is not bound/
  );
  assert.equal(receiverCalls, 2);

  await receiver.admitSource(data.admission2, { admittedAt: T3 });
  now = Date.parse(T3);
  await controls.applyControl(data.sourceRotation, { appliedAt: T3 });
  await assert.rejects(
    () => ingress.accept({ certificate_sha256: 'b'.repeat(64), request: request(1) }),
    /transport identity is not bound/
  );
  await ingress.accept({ certificate_sha256: 'c'.repeat(64), request: request(2) });
  assert.equal(receiverCalls, 3);
});

test('applied control fails closed before persistence when effective time or W2c2 retention is missing', async () => {
  const data = fixture();
  const { controlPath, controls } = await stores(data);
  await assert.rejects(
    () => controls.applyControl(data.genesis, { appliedAt: '2026-08-17T22:59:00.000Z' }),
    /before control effective time/
  );
  assert.equal((await stat(controlPath)).size, 0);
  await controls.applyControl(data.genesis, { appliedAt: T0 });
  await controls.applyControl(data.certRotation, { appliedAt: T1 });
  await controls.applyControl(data.disabled, { appliedAt: T2 });
  const bytes = (await stat(controlPath)).size;
  await assert.rejects(
    () => controls.applyControl(data.sourceRotation, { appliedAt: T3 }),
    /not exactly retained by W2c2/
  );
  assert.equal((await stat(controlPath)).size, bytes);
});

test('durable source-control restart rejects wrong operator key, tamper, and noncanonical state', async () => {
  const data = fixture();
  const { controlPath, receiver, controls } = await stores(data);
  const applied = await controls.applyControl(data.genesis, { appliedAt: T0 });
  assert.equal(verifyPublicWitnessSourceControlRecord(applied.durable_record, {
    trustedOperatorPublicKey: data.operator.publicKey,
    expectedDomainId: DOMAIN,
    expectedOperatorId: 'operator-applied-control'
  }).record_digest, applied.durable_record.record_digest);

  const wrongOperator = keys();
  await assert.rejects(
    () => openPublicWitnessSourceControlStore({
      statePath: controlPath,
      receiverStore: receiver,
      domainId: DOMAIN,
      operatorId: 'operator-applied-control',
      operatorPrivateKey: wrongOperator.privateKey
    }),
    /operator key substitution|operator signature is invalid/
  );

  const original = await readFile(controlPath, 'utf8');
  const parsed = JSON.parse(original.trim());
  parsed.control.certificate_sha256 = 'f'.repeat(64);
  await writeFile(controlPath, `${JSON.stringify(parsed)}\n`, 'utf8');
  await assert.rejects(
    () => openPublicWitnessSourceControlStore({
      statePath: controlPath,
      receiverStore: receiver,
      domainId: DOMAIN,
      operatorId: 'operator-applied-control',
      operatorPrivateKey: data.operator.privateKey
    }),
    /noncanonical record|digest mismatch/
  );
});

test('dynamic resolver fails closed if it returns a binding different from the exact presented certificate/source/epoch', async () => {
  const data = fixture();
  let receiverCalls = 0;
  const ingress = new PublicWitnessAuthenticatedIngress({
    receiverStore: { async receiveTransfer() { receiverCalls += 1; return { status: 'received', transfer_digest: 'd'.repeat(64), transfer_receipt: {} }; } },
    sourceBindingResolver: () => ({
      certificate_sha256: 'b'.repeat(64),
      source_id: data.admission1.source_id,
      source_epoch: 1
    }),
    personaRoots: [{ key_id: keyId(data.root.publicKey), public_key: data.root.publicKey }],
    clock: () => Date.parse(T0)
  });
  await assert.rejects(
    () => ingress.accept({
      certificate_sha256: 'a'.repeat(64),
      request: {
        transfer: { statement: { source_id: data.admission1.source_id, source_epoch: 1 } },
        persona_root_key_id: keyId(data.root.publicKey)
      }
    }),
    /resolver returned a mismatched transport binding/
  );
  assert.equal(receiverCalls, 0);
});

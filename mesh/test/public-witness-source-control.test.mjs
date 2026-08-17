import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openPublicWitnessReceiverStore } from '../src/lib/public-witness-receiver-store.mjs';
import {
  createPublicWitnessSourceControl,
  projectPublicWitnessSourceControlToIngressTrustEntry,
  validatePublicWitnessSourceControl,
  validatePublicWitnessSourceControlTransition,
  verifyPublicWitnessSourceControlAgainstReceiver
} from '../src/lib/public-witness-source-control.mjs';
import { createPublicWitnessSourceAdmission } from '../src/lib/public-witness-transfer.mjs';

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

function fixture() {
  const source1 = keys();
  const source2 = keys();
  const source3 = keys();
  const witness = keys();
  const admission1 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-control-one',
    sourcePublicKey: source1.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  const admission2 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-control-one',
    sourcePublicKey: source2.publicKey,
    sourceEpoch: 2,
    validFrom: T3,
    expiresAt: TEND
  });
  const admission3 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-control-one',
    sourcePublicKey: source3.publicKey,
    sourceEpoch: 3,
    validFrom: T4,
    expiresAt: TEND
  });
  return { source1, source2, source3, witness, admission1, admission2, admission3 };
}

function genesis(data, certificate = 'a'.repeat(64)) {
  return createPublicWitnessSourceControl({
    sourceAdmission: data.admission1,
    certificateSha256: certificate,
    operation: 'admit',
    effectiveAt: T0
  });
}

async function receiver(data, { admitSecond = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-source-control-'));
  const store = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: DOMAIN,
    witnessId: 'witness-source-control',
    witnessPrivateKey: data.witness.privateKey
  });
  await store.admitSource(data.admission1, { admittedAt: T0 });
  if (admitSecond) await store.admitSource(data.admission2, { admittedAt: T3 });
  return store;
}

test('source control genesis is content-addressed local operator input and projects one exact ingress binding', () => {
  const data = fixture();
  const control = genesis(data);
  const verified = validatePublicWitnessSourceControl(control);
  assert.equal(verified.operation, 'admit');
  assert.equal(verified.control_sequence, 1);
  assert.equal(verified.previous_control_digest, null);
  assert.equal(verified.source_epoch, 1);
  assert.equal(verified.source_status, 'active');
  assert.equal(verified.local_operator_input, true);
  assert.equal(verified.remote_self_provisioning_allowed, false);
  assert.equal(verified.receiver_mutation_claimed, false);
  assert.equal(verified.persona_root_trust_effect, 'none');
  assert.equal(verified.social_authority_effect, 'none');
  assert.equal(verified.finality_claimed, false);
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.network_effect, 'none');
  assert.deepEqual(projectPublicWitnessSourceControlToIngressTrustEntry(control), {
    certificate_sha256: 'a'.repeat(64),
    admission: data.admission1
  });
});

test('certificate rotation retains exact source admission while changing only transport binding', () => {
  const data = fixture();
  const first = genesis(data);
  const second = createPublicWitnessSourceControl({
    sourceAdmission: data.admission1,
    certificateSha256: 'b'.repeat(64),
    operation: 'rotate-certificate',
    effectiveAt: T1,
    previousControl: first
  });
  validatePublicWitnessSourceControlTransition(first, second);
  assert.equal(second.control_sequence, 2);
  assert.equal(second.previous_control_digest, first.control_digest);
  assert.equal(second.source_admission_digest, first.source_admission_digest);
  assert.equal(second.source_epoch, first.source_epoch);
  assert.equal(second.certificate_sha256, 'b'.repeat(64));
  assert.throws(
    () => createPublicWitnessSourceControl({
      sourceAdmission: data.admission1,
      certificateSha256: 'a'.repeat(64),
      operation: 'rotate-certificate',
      effectiveAt: T1,
      previousControl: first
    }),
    /must change certificate digest/
  );
});

test('disable contracts ingress trust and a disabled source can return only through the next source epoch', () => {
  const data = fixture();
  const first = genesis(data);
  const disabled = createPublicWitnessSourceControl({
    sourceAdmission: data.admission1,
    operation: 'disable',
    effectiveAt: T2,
    previousControl: first,
    disableReason: 'suspected-key-compromise'
  });
  assert.equal(disabled.source_status, 'disabled');
  assert.equal(disabled.certificate_sha256, null);
  assert.equal(disabled.disable_reason, 'suspected-key-compromise');
  assert.equal(projectPublicWitnessSourceControlToIngressTrustEntry(disabled), null);
  assert.throws(
    () => createPublicWitnessSourceControl({
      sourceAdmission: data.admission1,
      certificateSha256: 'b'.repeat(64),
      operation: 'rotate-certificate',
      effectiveAt: T3,
      previousControl: disabled
    }),
    /can return only through source rotation/
  );
  assert.throws(
    () => createPublicWitnessSourceControl({
      sourceAdmission: data.admission1,
      certificateSha256: 'b'.repeat(64),
      operation: 'rotate-source',
      effectiveAt: T3,
      previousControl: disabled
    }),
    /must advance exactly one epoch/
  );
  const returned = createPublicWitnessSourceControl({
    sourceAdmission: data.admission2,
    certificateSha256: 'c'.repeat(64),
    operation: 'rotate-source',
    effectiveAt: T3,
    previousControl: disabled
  });
  assert.equal(returned.source_epoch, 2);
  assert.equal(returned.source_status, 'active');
  assert.equal(returned.previous_control_digest, disabled.control_digest);
  assert.deepEqual(projectPublicWitnessSourceControlToIngressTrustEntry(returned), {
    certificate_sha256: 'c'.repeat(64),
    admission: data.admission2
  });
});

test('source control rejects skipped epochs, same-epoch source replacement, backward time, and tampered predecessor history', () => {
  const data = fixture();
  const first = genesis(data);
  assert.throws(
    () => createPublicWitnessSourceControl({
      sourceAdmission: data.admission2,
      certificateSha256: 'b'.repeat(64),
      operation: 'rotate-certificate',
      effectiveAt: T3,
      previousControl: first
    }),
    /must retain the exact source admission/
  );
  assert.throws(
    () => createPublicWitnessSourceControl({
      sourceAdmission: data.admission3,
      certificateSha256: 'c'.repeat(64),
      operation: 'rotate-source',
      effectiveAt: T4,
      previousControl: first
    }),
    /must advance exactly one epoch/
  );
  assert.throws(
    () => createPublicWitnessSourceControl({
      sourceAdmission: data.admission1,
      certificateSha256: 'd'.repeat(64),
      operation: 'rotate-certificate',
      effectiveAt: T0,
      previousControl: first
    }),
    /effective time must advance/
  );
  const second = createPublicWitnessSourceControl({
    sourceAdmission: data.admission2,
    certificateSha256: 'b'.repeat(64),
    operation: 'rotate-source',
    effectiveAt: T3,
    previousControl: first
  });
  const tampered = structuredClone(second);
  tampered.previous_control_digest = 'f'.repeat(64);
  assert.throws(() => validatePublicWitnessSourceControl(tampered), /digest mismatch/);
});

test('disable reason is bounded and genesis cannot begin disabled or at a non-first epoch', () => {
  const data = fixture();
  assert.throws(
    () => createPublicWitnessSourceControl({
      sourceAdmission: data.admission1,
      operation: 'disable',
      effectiveAt: T1,
      disableReason: 'remote-requested-disable'
    }),
    /disable reason is unsupported/
  );
  assert.throws(
    () => createPublicWitnessSourceControl({
      sourceAdmission: data.admission1,
      operation: 'disable',
      effectiveAt: T1,
      disableReason: 'operator-disable'
    }),
    /genesis must admit source epoch 1/
  );
  assert.throws(
    () => createPublicWitnessSourceControl({
      sourceAdmission: data.admission2,
      certificateSha256: 'b'.repeat(64),
      operation: 'admit',
      effectiveAt: T3
    }),
    /genesis must admit source epoch 1/
  );
});

test('receiver binding proves exact W2c2 retention without mutating receiver state', async () => {
  const data = fixture();
  const store = await receiver(data);
  const first = genesis(data);
  const before = store.snapshot();
  const verification = verifyPublicWitnessSourceControlAgainstReceiver({ receiverStore: store, control: first });
  assert.equal(verification.receiver_mutation, false);
  assert.equal(verification.source_admission_digest, data.admission1.admission_digest);
  assert.deepEqual(store.snapshot(), before);
  const rotated = createPublicWitnessSourceControl({
    sourceAdmission: data.admission2,
    certificateSha256: 'b'.repeat(64),
    operation: 'rotate-source',
    effectiveAt: T3,
    previousControl: first
  });
  assert.throws(
    () => verifyPublicWitnessSourceControlAgainstReceiver({ receiverStore: store, control: rotated }),
    /not exactly retained by W2c2/
  );
  const storeWithRotation = await receiver(data, { admitSecond: true });
  const rotatedBefore = storeWithRotation.snapshot();
  const rotatedVerification = verifyPublicWitnessSourceControlAgainstReceiver({
    receiverStore: storeWithRotation,
    control: rotated
  });
  assert.equal(rotatedVerification.source_epoch, 2);
  assert.equal(rotatedVerification.receiver_mutation, false);
  assert.deepEqual(storeWithRotation.snapshot(), rotatedBefore);
});

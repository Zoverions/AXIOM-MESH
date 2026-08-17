import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createPublicWitnessSourceProvisioningCommand,
  verifyPublicWitnessSourceProvisioningCommand
} from '../src/lib/public-witness-source-provisioning.mjs';
import { createPublicWitnessSourceAdmission } from '../src/lib/public-witness-transfer.mjs';

const DOMAIN = 'axiom.social.public.v1';
const T0 = '2026-08-17T23:00:00.000Z';
const T1 = '2026-08-17T23:01:00.000Z';
const T2 = '2026-08-17T23:02:00.000Z';
const T3 = '2026-08-17T23:03:00.000Z';
const TEND = '2026-08-17T23:30:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function fixture() {
  const operator = keys();
  const source1 = keys();
  const source2 = keys();
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
    validFrom: T1,
    expiresAt: TEND
  });
  return { operator, source1, source2, admission1, admission2 };
}

test('genesis provisioning command binds one exact source admission and narrow local trust effect', () => {
  const data = fixture();
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: data.admission1,
    operatorId: 'operator-provisioning',
    operatorPrivateKey: data.operator.privateKey,
    commandId: 'provision-source-epoch-1',
    authorizedAt: T0,
    expiresAt: T2
  });
  const verified = verifyPublicWitnessSourceProvisioningCommand(command, {
    trustedOperatorPublicKey: data.operator.publicKey,
    expectedDomainId: DOMAIN,
    expectedOperatorId: 'operator-provisioning',
    now: Date.parse(T1)
  });
  assert.equal(verified.statement.source_epoch, 1);
  assert.equal(verified.statement.previous_admission_digest, null);
  assert.equal(verified.statement.source_admission_digest, data.admission1.admission_digest);
  assert.equal(verified.statement.receiver_action, 'admit-exact-source-epoch');
  assert.equal(verified.statement.local_operator_authorization_claimed, true);
  assert.equal(verified.statement.remote_self_provisioning_allowed, false);
  assert.equal(verified.statement.source_trust_effect, 'authorize-exact-local-source-admission');
  assert.equal(verified.statement.persona_root_trust_effect, 'none');
  assert.equal(verified.statement.social_authority_effect, 'none');
  assert.equal(verified.statement.capability_promotion_effect, 'none');
  assert.equal(verified.statement.finality_claimed, false);
  assert.equal(verified.statement.authority_effect, 'w2c2-source-admission-only');
  assert.equal(verified.statement.network_effect, 'none');
});

test('source rotation authorization requires the exact previous admission digest', () => {
  const data = fixture();
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: data.admission2,
    operatorId: 'operator-provisioning',
    operatorPrivateKey: data.operator.privateKey,
    commandId: 'provision-source-epoch-2',
    previousAdmissionDigest: data.admission1.admission_digest,
    authorizedAt: T1,
    expiresAt: T3
  });
  const verified = verifyPublicWitnessSourceProvisioningCommand(command, {
    trustedOperatorPublicKey: data.operator.publicKey,
    now: Date.parse(T2)
  });
  assert.equal(verified.statement.source_epoch, 2);
  assert.equal(verified.statement.previous_admission_digest, data.admission1.admission_digest);
  assert.equal(verified.statement.source_admission_digest, data.admission2.admission_digest);

  assert.throws(
    () => createPublicWitnessSourceProvisioningCommand({
      sourceAdmission: data.admission2,
      operatorId: 'operator-provisioning',
      operatorPrivateKey: data.operator.privateKey,
      commandId: 'missing-prior',
      authorizedAt: T1,
      expiresAt: T3
    }),
    /later epochs require one|previousAdmissionDigest/
  );
  assert.throws(
    () => createPublicWitnessSourceProvisioningCommand({
      sourceAdmission: data.admission1,
      operatorId: 'operator-provisioning',
      operatorPrivateKey: data.operator.privateKey,
      commandId: 'genesis-with-prior',
      previousAdmissionDigest: data.admission2.admission_digest,
      authorizedAt: T0,
      expiresAt: T2
    }),
    /epoch 1 requires null predecessor|genesis cannot name/
  );
});

test('operator key substitution, signature tamper, admission substitution, and statement tamper fail closed', () => {
  const data = fixture();
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: data.admission1,
    operatorId: 'operator-provisioning',
    operatorPrivateKey: data.operator.privateKey,
    commandId: 'provision-source-epoch-1',
    authorizedAt: T0,
    expiresAt: T2
  });
  const otherOperator = keys();
  assert.throws(
    () => verifyPublicWitnessSourceProvisioningCommand(command, {
      trustedOperatorPublicKey: otherOperator.publicKey,
      now: Date.parse(T1)
    }),
    /operator key substitution|operator signature is invalid/
  );

  const signatureTamper = structuredClone(command);
  signatureTamper.operator_signature = `${command.operator_signature.slice(0, -1)}${command.operator_signature.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(
    () => verifyPublicWitnessSourceProvisioningCommand(signatureTamper, {
      trustedOperatorPublicKey: data.operator.publicKey,
      now: Date.parse(T1)
    }),
    /operator signature is invalid|command digest mismatch/
  );

  const admissionTamper = structuredClone(command);
  admissionTamper.source_admission = data.admission2;
  assert.throws(
    () => verifyPublicWitnessSourceProvisioningCommand(admissionTamper, {
      trustedOperatorPublicKey: data.operator.publicKey,
      now: Date.parse(T1)
    }),
    /does not bind the exact source admission/
  );

  const statementTamper = structuredClone(command);
  statementTamper.statement.command_id = 'different-command';
  assert.throws(
    () => verifyPublicWitnessSourceProvisioningCommand(statementTamper, {
      trustedOperatorPublicKey: data.operator.publicKey,
      now: Date.parse(T1)
    }),
    /statement digest mismatch/
  );
});

test('provisioning authorization is short lived, must be active, and cannot outlive source admission validity', () => {
  const data = fixture();
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: data.admission1,
    operatorId: 'operator-provisioning',
    operatorPrivateKey: data.operator.privateKey,
    commandId: 'time-bound-command',
    authorizedAt: T1,
    expiresAt: T2
  });
  assert.throws(
    () => verifyPublicWitnessSourceProvisioningCommand(command, {
      trustedOperatorPublicKey: data.operator.publicKey,
      now: Date.parse(T0)
    }),
    /not authorized yet/
  );
  assert.throws(
    () => verifyPublicWitnessSourceProvisioningCommand(command, {
      trustedOperatorPublicKey: data.operator.publicKey,
      now: Date.parse(T2)
    }),
    /expired/
  );

  assert.throws(
    () => createPublicWitnessSourceProvisioningCommand({
      sourceAdmission: data.admission1,
      operatorId: 'operator-provisioning',
      operatorPrivateKey: data.operator.privateKey,
      commandId: 'too-long-command',
      authorizedAt: T0,
      expiresAt: '2026-08-18T00:01:00.000Z'
    }),
    /lifetime is invalid|cannot outlive/
  );

  const shortAdmission = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'short-source',
    sourcePublicKey: data.source1.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: T2
  });
  assert.throws(
    () => createPublicWitnessSourceProvisioningCommand({
      sourceAdmission: shortAdmission,
      operatorId: 'operator-provisioning',
      operatorPrivateKey: data.operator.privateKey,
      commandId: 'outlive-admission',
      authorizedAt: T1,
      expiresAt: T3
    }),
    /cannot outlive source admission validity/
  );
});

test('source key possession is not operator authorization and remote self provisioning remains impossible in the wire object', () => {
  const data = fixture();
  const command = createPublicWitnessSourceProvisioningCommand({
    sourceAdmission: data.admission1,
    operatorId: 'operator-provisioning',
    operatorPrivateKey: data.operator.privateKey,
    commandId: 'operator-authorized',
    authorizedAt: T0,
    expiresAt: T2
  });
  assert.throws(
    () => verifyPublicWitnessSourceProvisioningCommand(command, {
      trustedOperatorPublicKey: data.source1.publicKey,
      now: Date.parse(T1)
    }),
    /operator key substitution|operator signature is invalid/
  );

  const elevated = structuredClone(command);
  elevated.statement.remote_self_provisioning_allowed = true;
  assert.throws(
    () => verifyPublicWitnessSourceProvisioningCommand(elevated, {
      trustedOperatorPublicKey: data.operator.publicKey,
      now: Date.parse(T1)
    }),
    /invalid authority or non-claim boundary/
  );

  const widened = structuredClone(command);
  widened.statement.authority_effect = 'grid-authority';
  assert.throws(
    () => verifyPublicWitnessSourceProvisioningCommand(widened, {
      trustedOperatorPublicKey: data.operator.publicKey,
      now: Date.parse(T1)
    }),
    /invalid authority or non-claim boundary/
  );
});

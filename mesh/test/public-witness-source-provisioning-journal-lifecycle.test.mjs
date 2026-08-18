import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign
} from 'node:crypto';
import test from 'node:test';

import {
  canonicalJson,
  digestObject,
  sha256
} from '../src/lib/canonical.mjs';
import {
  PUBLIC_WITNESS_SOURCE_PROVISIONING_APPLICATION_RECORD_SCHEMA
} from '../src/lib/public-witness-source-provisioning-store.mjs';
import {
  PUBLIC_WITNESS_SERVICE_KEY_ROLES,
  createPublicWitnessServiceKeyCredential,
  createPublicWitnessServiceKeyRevocation
} from '../src/lib/public-witness-service-key-lifecycle.mjs';
import {
  createPublicWitnessSourceProvisioningCommandWithKeyLifecycle
} from '../src/lib/public-witness-source-provisioning-key-lifecycle.mjs';
import {
  assertPublicWitnessProvisionerSigningKeyCurrent,
  verifyPublicWitnessSourceProvisioningApplicationJournalWithKeyLifecycle,
  verifyPublicWitnessSourceProvisioningApplicationRecordWithKeyLifecycle
} from '../src/lib/public-witness-source-provisioning-journal-lifecycle.mjs';
import { createPublicWitnessSourceAdmission } from '../src/lib/public-witness-transfer.mjs';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function keyId(publicKey) {
  return sha256(publicKey);
}

function credential({ root, operational, role, principalId, epoch = 1, activatedAt, predecessor = null, kind = 'initial', disposition = null }) {
  return createPublicWitnessServiceKeyCredential({
    domainId: 'axiom.social.public.v1',
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

function admission(sourceId, sourceKeys) {
  return createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId,
    sourcePublicKey: sourceKeys.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-17T22:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z'
  });
}

function appRecord({
  provisioner,
  provisionerId = 'provisioner-a',
  sequence,
  previousRecordDigest,
  kind,
  payload,
  recordedAt
}) {
  const statement = Object.freeze({
    domain_id: 'axiom.social.public.v1',
    provisioner_id: provisionerId,
    provisioner_key_id: keyId(provisioner.publicKey),
    sequence,
    previous_record_digest: previousRecordDigest,
    record_kind: kind,
    payload_digest: digestObject(payload),
    recorded_at: recordedAt,
    operator_authorization_required: true,
    remote_self_provisioning_allowed: false,
    receiver_mutation_scope: 'exact-authorized-source-admission',
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    capability_promotion_effect: 'none',
    finality_claimed: false,
    authority_effect: 'w2c2-source-admission-only',
    network_effect: 'none'
  });
  const statementDigest = digestObject(statement);
  const signature = sign(
    null,
    Buffer.from(canonicalJson(statement)),
    provisioner.privateKey
  ).toString('base64url');
  const body = Object.freeze({
    schema: PUBLIC_WITNESS_SOURCE_PROVISIONING_APPLICATION_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    payload,
    provisioner_signature: signature
  });
  return Object.freeze({ ...body, record_digest: digestObject(body) });
}

function linkedTriplet({ command, provisioner, startSequence, previousRecordDigest, recordedAt, receiverBaseCount }) {
  const authorization = appRecord({
    provisioner,
    sequence: startSequence,
    previousRecordDigest,
    kind: 'authorization-retained',
    payload: Object.freeze({ command }),
    recordedAt
  });
  const ready = appRecord({
    provisioner,
    sequence: startSequence + 1,
    previousRecordDigest: authorization.record_digest,
    kind: 'effect-ready',
    payload: Object.freeze({
      command_digest: command.command_digest,
      attempt: 1,
      intended_admitted_at: recordedAt,
      receiver_record_count_before: receiverBaseCount,
      receiver_head_before: receiverBaseCount === 0 ? null : 'a'.repeat(64)
    }),
    recordedAt
  });
  const link = appRecord({
    provisioner,
    sequence: startSequence + 2,
    previousRecordDigest: ready.record_digest,
    kind: 'admission-linked',
    payload: Object.freeze({
      command_digest: command.command_digest,
      ready_record_digest: ready.record_digest,
      source_admission_digest: command.source_admission.admission_digest,
      receiver_record_count_after: receiverBaseCount + 1,
      receiver_head_after: 'b'.repeat(64),
      link_mode: 'direct'
    }),
    recordedAt
  });
  return [authorization, ready, link];
}

test('journal verifies historical operator and provisioner records across routine key rotations', () => {
  const operatorRoot = keys();
  const provisionerRoot = keys();
  const operator1 = keys();
  const operator2 = keys();
  const provisioner1 = keys();
  const provisioner2 = keys();
  const source1 = keys();
  const source2 = keys();

  const op1 = credential({
    root: operatorRoot,
    operational: operator1,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a',
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const op2 = credential({
    root: operatorRoot,
    operational: operator2,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a',
    epoch: 2,
    activatedAt: '2026-08-17T22:10:00.000Z',
    predecessor: op1,
    kind: 'rotation',
    disposition: 'retired'
  });
  const prov1 = credential({
    root: provisionerRoot,
    operational: provisioner1,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a',
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const prov2 = credential({
    root: provisionerRoot,
    operational: provisioner2,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a',
    epoch: 2,
    activatedAt: '2026-08-17T22:10:00.000Z',
    predecessor: prov1,
    kind: 'rotation',
    disposition: 'retired'
  });

  const command1 = createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
    sourceAdmission: admission('source-one', source1),
    operatorId: 'operator-a',
    operatorPrivateKey: operator1.privateKey,
    operatorCredentialPath: [op1, op2],
    trustedOperatorRoleRootPublicKey: operatorRoot.publicKey,
    commandId: 'command-one',
    authorizedAt: '2026-08-17T22:01:00.000Z',
    expiresAt: '2026-08-17T22:09:00.000Z'
  });
  const first = linkedTriplet({
    command: command1,
    provisioner: provisioner1,
    startSequence: 1,
    previousRecordDigest: null,
    recordedAt: '2026-08-17T22:02:00.000Z',
    receiverBaseCount: 0
  });
  const command2 = createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
    sourceAdmission: admission('source-two', source2),
    operatorId: 'operator-a',
    operatorPrivateKey: operator2.privateKey,
    operatorCredentialPath: [op1, op2],
    trustedOperatorRoleRootPublicKey: operatorRoot.publicKey,
    commandId: 'command-two',
    authorizedAt: '2026-08-17T22:11:00.000Z',
    expiresAt: '2026-08-17T22:19:00.000Z'
  });
  const second = linkedTriplet({
    command: command2,
    provisioner: provisioner2,
    startSequence: 4,
    previousRecordDigest: first.at(-1).record_digest,
    recordedAt: '2026-08-17T22:12:00.000Z',
    receiverBaseCount: 1
  });

  const result = verifyPublicWitnessSourceProvisioningApplicationJournalWithKeyLifecycle(
    [...first, ...second],
    {
      operatorCredentialPath: [op1, op2],
      trustedOperatorRoleRootPublicKey: operatorRoot.publicKey,
      expectedOperatorId: 'operator-a',
      provisionerCredentialPath: [prov1, prov2],
      trustedProvisionerRoleRootPublicKey: provisionerRoot.publicKey,
      expectedProvisionerId: 'provisioner-a',
      expectedDomainId: 'axiom.social.public.v1'
    }
  );
  assert.equal(result.valid, true);
  assert.equal(result.linked_command_count, 2);
  assert.equal(result.highest_operator_key_epoch_observed, 2);
  assert.equal(result.highest_provisioner_key_epoch_observed, 2);
  assert.equal(result.wall_clock_signing_time_proved, false);
  assert.equal(result.globally_current_key_state_claimed, false);
});

test('stale provisioner key cannot append a record at or after successor activation', () => {
  const root = keys();
  const provisioner1 = keys();
  const provisioner2 = keys();
  const prov1 = credential({
    root,
    operational: provisioner1,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a',
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const prov2 = credential({
    root,
    operational: provisioner2,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a',
    epoch: 2,
    activatedAt: '2026-08-17T22:10:00.000Z',
    predecessor: prov1,
    kind: 'rotation',
    disposition: 'retired'
  });
  const record = appRecord({
    provisioner: provisioner1,
    sequence: 1,
    previousRecordDigest: null,
    kind: 'effect-ready',
    payload: Object.freeze({
      command_digest: '1'.repeat(64),
      attempt: 1,
      intended_admitted_at: '2026-08-17T22:10:00.000Z',
      receiver_record_count_before: 0,
      receiver_head_before: null
    }),
    recordedAt: '2026-08-17T22:10:00.000Z'
  });
  assert.throws(() => verifyPublicWitnessSourceProvisioningApplicationRecordWithKeyLifecycle(record, {
    provisionerCredentialPath: [prov1, prov2],
    trustedProvisionerRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedProvisionerId: 'provisioner-a'
  }), /stale after successor activation/);
});

test('operator compromise recovery invalidates a later effect-ready attempt without rewriting earlier authorization', () => {
  const operatorRoot = keys();
  const provisionerRoot = keys();
  const operator1 = keys();
  const operator2 = keys();
  const provisioner = keys();
  const source = keys();
  const op1 = credential({
    root: operatorRoot,
    operational: operator1,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a',
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const op2 = credential({
    root: operatorRoot,
    operational: operator2,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a',
    epoch: 2,
    activatedAt: '2026-08-17T22:05:00.000Z',
    predecessor: op1,
    kind: 'recovery',
    disposition: 'compromised'
  });
  const prov = credential({
    root: provisionerRoot,
    operational: provisioner,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a',
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
    sourceAdmission: admission('source-one', source),
    operatorId: 'operator-a',
    operatorPrivateKey: operator1.privateKey,
    operatorCredentialPath: [op1],
    trustedOperatorRoleRootPublicKey: operatorRoot.publicKey,
    commandId: 'pre-recovery-command',
    authorizedAt: '2026-08-17T22:01:00.000Z',
    expiresAt: '2026-08-17T22:10:00.000Z'
  });
  const authorization = appRecord({
    provisioner,
    sequence: 1,
    previousRecordDigest: null,
    kind: 'authorization-retained',
    payload: Object.freeze({ command }),
    recordedAt: '2026-08-17T22:02:00.000Z'
  });
  const ready = appRecord({
    provisioner,
    sequence: 2,
    previousRecordDigest: authorization.record_digest,
    kind: 'effect-ready',
    payload: Object.freeze({
      command_digest: command.command_digest,
      attempt: 1,
      intended_admitted_at: '2026-08-17T22:06:00.000Z',
      receiver_record_count_before: 0,
      receiver_head_before: null
    }),
    recordedAt: '2026-08-17T22:06:00.000Z'
  });
  assert.throws(() => verifyPublicWitnessSourceProvisioningApplicationJournalWithKeyLifecycle(
    [authorization, ready],
    {
      operatorCredentialPath: [op1, op2],
      trustedOperatorRoleRootPublicKey: operatorRoot.publicKey,
      expectedOperatorId: 'operator-a',
      provisionerCredentialPath: [prov],
      trustedProvisionerRoleRootPublicKey: provisionerRoot.publicKey,
      expectedProvisionerId: 'provisioner-a',
      expectedDomainId: 'axiom.social.public.v1'
    }
  ), /revoked or compromised for new effects/);
});

test('explicit provisioner revocation rejects later journal evidence from that key', () => {
  const root = keys();
  const provisioner = keys();
  const prov = credential({
    root,
    operational: provisioner,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a',
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const revocation = createPublicWitnessServiceKeyRevocation(prov, {
    trustedRoleRootPublicKey: root.publicKey,
    roleRootPrivateKey: root.privateKey,
    effectiveAt: '2026-08-17T22:05:00.000Z',
    reasonCode: 'compromised'
  });
  const record = appRecord({
    provisioner,
    sequence: 1,
    previousRecordDigest: null,
    kind: 'effect-ready',
    payload: Object.freeze({
      command_digest: '1'.repeat(64),
      attempt: 1,
      intended_admitted_at: '2026-08-17T22:06:00.000Z',
      receiver_record_count_before: 0,
      receiver_head_before: null
    }),
    recordedAt: '2026-08-17T22:06:00.000Z'
  });
  assert.throws(() => verifyPublicWitnessSourceProvisioningApplicationRecordWithKeyLifecycle(record, {
    provisionerCredentialPath: [prov],
    provisionerRevocations: [revocation],
    trustedProvisionerRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedProvisionerId: 'provisioner-a'
  }), /revoked at requested time/);
});

test('operator and provisioner role roots cannot collapse into one trust root', () => {
  const sharedRoot = keys();
  const operator = keys();
  const provisioner = keys();
  const op = credential({
    root: sharedRoot,
    operational: operator,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a',
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const prov = credential({
    root: sharedRoot,
    operational: provisioner,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a',
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  assert.throws(() => verifyPublicWitnessSourceProvisioningApplicationJournalWithKeyLifecycle([], {
    operatorCredentialPath: [op],
    trustedOperatorRoleRootPublicKey: sharedRoot.publicKey,
    expectedOperatorId: 'operator-a',
    provisionerCredentialPath: [prov],
    trustedProvisionerRoleRootPublicKey: sharedRoot.publicKey,
    expectedProvisionerId: 'provisioner-a',
    expectedDomainId: 'axiom.social.public.v1'
  }), /role roots must remain distinct/);
});

test('current provisioner private key must match a live credential and stale signer is rejected', () => {
  const root = keys();
  const firstKey = keys();
  const secondKey = keys();
  const first = credential({
    root,
    operational: firstKey,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a',
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const second = credential({
    root,
    operational: secondKey,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a',
    epoch: 2,
    activatedAt: '2026-08-17T22:10:00.000Z',
    predecessor: first,
    kind: 'rotation',
    disposition: 'retired'
  });
  assert.equal(assertPublicWitnessProvisionerSigningKeyCurrent({
    provisionerPrivateKey: secondKey.privateKey,
    provisionerCredentialPath: [first, second],
    trustedProvisionerRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedProvisionerId: 'provisioner-a',
    at: '2026-08-17T22:10:00.000Z'
  }).valid, true);
  assert.throws(() => assertPublicWitnessProvisionerSigningKeyCurrent({
    provisionerPrivateKey: firstKey.privateKey,
    provisionerCredentialPath: [first, second],
    trustedProvisionerRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedProvisionerId: 'provisioner-a',
    at: '2026-08-17T22:10:00.000Z'
  }), /stale after successor activation/);
});

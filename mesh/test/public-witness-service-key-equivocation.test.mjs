import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  PUBLIC_WITNESS_SERVICE_KEY_ROLES,
  createPublicWitnessServiceKeyCredential,
  createPublicWitnessServiceKeyRevocation
} from '../src/lib/public-witness-service-key-lifecycle.mjs';
import {
  PUBLIC_WITNESS_SERVICE_KEY_CONFLICT_SCHEMA,
  inspectPublicWitnessServiceKeyPathAgainstObservationSnapshot,
  openPublicWitnessServiceKeyObservationStore
} from '../src/lib/public-witness-service-key-observation-store.mjs';
import {
  createPublicWitnessSourceProvisioningCommandWithKeyLifecycle,
  verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle
} from '../src/lib/public-witness-source-provisioning-key-lifecycle.mjs';
import { createPublicWitnessSourceAdmission } from '../src/lib/public-witness-transfer.mjs';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function initialCredential({ root, operational, role, principalId }) {
  return createPublicWitnessServiceKeyCredential({
    domainId: 'axiom.social.public.v1',
    role,
    principalId,
    roleRootPrivateKey: root.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    activatedAt: '2026-08-18T10:00:00.000Z'
  });
}

function successorCredential({
  root,
  operational,
  role,
  principalId,
  predecessor,
  activatedAt,
  kind,
  disposition
}) {
  return createPublicWitnessServiceKeyCredential({
    domainId: 'axiom.social.public.v1',
    role,
    principalId,
    roleRootPrivateKey: root.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: predecessor.statement.key_epoch + 1,
    activatedAt,
    transitionKind: kind,
    predecessorCredential: predecessor,
    predecessorDisposition: disposition
  });
}

async function fixture(t, {
  role = PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
  principalId = 'operator-equivocation'
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-service-key-equivocation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = keys();
  const firstKey = keys();
  const branchAKey = keys();
  const branchBKey = keys();
  const first = initialCredential({ root, operational: firstKey, role, principalId });
  const branchA = successorCredential({
    root,
    operational: branchAKey,
    role,
    principalId,
    predecessor: first,
    activatedAt: '2026-08-18T10:10:00.000Z',
    kind: 'rotation',
    disposition: 'retired'
  });
  const branchB = successorCredential({
    root,
    operational: branchBKey,
    role,
    principalId,
    predecessor: first,
    activatedAt: '2026-08-18T10:11:00.000Z',
    kind: 'recovery',
    disposition: 'compromised'
  });
  const statePath = join(directory, 'service-key-observations.jsonl');
  const store = await openPublicWitnessServiceKeyObservationStore({
    statePath,
    trustedRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedRole: role,
    expectedPrincipalId: principalId
  });
  return {
    directory,
    statePath,
    root,
    firstKey,
    branchAKey,
    branchBKey,
    first,
    branchA,
    branchB,
    store,
    role,
    principalId
  };
}

async function observeFork(state) {
  await state.store.observeCredential(state.first, {
    observedAt: '2026-08-18T10:01:00.000Z'
  });
  await state.store.observeCredential(state.branchA, {
    observedAt: '2026-08-18T10:12:00.000Z'
  });
  return state.store.observeCredential(state.branchB, {
    observedAt: '2026-08-18T10:13:00.000Z'
  });
}

test('two root-valid successors from one predecessor are retained as credential-epoch equivocation', async t => {
  const state = await fixture(t);
  const result = await observeFork(state);
  assert.equal(result.status, 'observed');
  assert.equal(result.conflicts.length, 1);

  const [conflict] = result.conflicts;
  assert.equal(conflict.schema, PUBLIC_WITNESS_SERVICE_KEY_CONFLICT_SCHEMA);
  assert.equal(conflict.statement.conflict_kind, 'credential-epoch');
  assert.equal(conflict.statement.position_kind, 'credential-epoch');
  assert.equal(conflict.statement.position, 2);
  assert.equal(conflict.statement.predecessor_credential_digest, state.first.credential_digest);
  assert.deepEqual(
    conflict.statement.artifact_digests,
    [state.branchA.credential_digest, state.branchB.credential_digest].sort()
  );
  assert.equal(conflict.statement.preferred_artifact_digest, null);
  assert.equal(conflict.statement.conflict_observed, true);
  assert.equal(conflict.statement.truth_resolution_claimed, false);
  assert.equal(conflict.statement.legal_identity_claimed, false);
  assert.equal(conflict.statement.globally_current_key_state_claimed, false);
  assert.equal(conflict.statement.finality_claimed, false);
  assert.equal(conflict.statement.authority_effect, 'none');
  assert.equal(conflict.statement.network_effect, 'none');

  assert.equal(state.store.getCredential(state.branchA.credential_digest).credential_digest, state.branchA.credential_digest);
  assert.equal(state.store.getCredential(state.branchB.credential_digest).credential_digest, state.branchB.credential_digest);
});

test('same successor replay is idempotent and does not create a second durable record', async t => {
  const state = await fixture(t);
  await state.store.observeCredential(state.first, {
    observedAt: '2026-08-18T10:01:00.000Z'
  });
  const firstObservation = await state.store.observeCredential(state.branchA, {
    observedAt: '2026-08-18T10:12:00.000Z'
  });
  const before = state.store.snapshot();
  const replay = await state.store.observeCredential(structuredClone(state.branchA), {
    observedAt: '2026-08-18T10:14:00.000Z'
  });
  const after = state.store.snapshot();

  assert.equal(firstObservation.status, 'observed');
  assert.equal(replay.status, 'replay');
  assert.equal(replay.durable_record, null);
  assert.equal(after.durable_record_count, before.durable_record_count);
  assert.equal(after.durable_last_record_digest, before.durable_last_record_digest);
  assert.equal(after.unresolved_conflict_count, 0);
});

test('fork survives durable-store restart with both successor artifacts preserved', async t => {
  const state = await fixture(t);
  await observeFork(state);
  const before = state.store.snapshot();

  const reopened = await openPublicWitnessServiceKeyObservationStore({
    statePath: state.statePath,
    trustedRoleRootPublicKey: state.root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedRole: state.role,
    expectedPrincipalId: state.principalId
  });
  const after = reopened.snapshot();

  assert.equal((await reopened.verifyState()).valid, true);
  assert.equal(after.unresolved_conflict_count, 1);
  assert.deepEqual(after.conflicts, before.conflicts);
  assert.equal(reopened.getCredential(state.branchA.credential_digest).credential_digest, state.branchA.credential_digest);
  assert.equal(reopened.getCredential(state.branchB.credential_digest).credential_digest, state.branchB.credential_digest);
  assert.equal(after.globally_current_key_state_claimed, false);
});

test('revocation and later recovery never erase an already observed fork', async t => {
  const state = await fixture(t);
  await observeFork(state);
  const conflictDigest = state.store.listConflicts()[0].conflict_digest;

  const revocation = createPublicWitnessServiceKeyRevocation(state.branchB, {
    trustedRoleRootPublicKey: state.root.publicKey,
    roleRootPrivateKey: state.root.privateKey,
    effectiveAt: '2026-08-18T10:20:00.000Z',
    reasonCode: 'compromised'
  });
  await state.store.observeRevocation(revocation, {
    observedAt: '2026-08-18T10:21:00.000Z'
  });

  const recoveredKey = keys();
  const recovered = successorCredential({
    root: state.root,
    operational: recoveredKey,
    role: state.role,
    principalId: state.principalId,
    predecessor: state.branchA,
    activatedAt: '2026-08-18T10:22:00.000Z',
    kind: 'recovery',
    disposition: 'compromised'
  });
  await state.store.observeCredential(recovered, {
    observedAt: '2026-08-18T10:23:00.000Z'
  });

  const snapshot = state.store.snapshot();
  assert.equal(snapshot.unresolved_conflict_count, 1);
  assert.equal(snapshot.conflicts[0].conflict_digest, conflictDigest);
  assert.equal(snapshot.credential_digests.includes(recovered.credential_digest), true);
  assert.equal(snapshot.revocation_digests.includes(revocation.revocation_digest), true);
  assert.equal(snapshot.conflicts[0].statement.preferred_artifact_digest, null);
});

test('path inspection reports unresolved local fork uncertainty and never claims current authority', async t => {
  const state = await fixture(t);
  await observeFork(state);
  const snapshot = state.store.snapshot();

  assert.throws(() => inspectPublicWitnessServiceKeyPathAgainstObservationSnapshot(
    [state.first, state.branchA],
    snapshot,
    {
      trustedRoleRootPublicKey: state.root.publicKey,
      expectedDomainId: 'axiom.social.public.v1',
      expectedRole: state.role,
      expectedPrincipalId: state.principalId
    }
  ), error => {
    assert.match(error.message, /successor equivocation is unresolved/);
    assert.equal(error.details.key_state_uncertain, true);
    assert.equal(error.details.conflict_observed, true);
    assert.equal(error.details.conflict_kind, 'credential-epoch');
    assert.equal(error.details.preferred_artifact_digest, null);
    assert.equal(error.details.globally_current_key_state_claimed, false);
    return true;
  });
});

test('source provisioning refuses a caller-selected operator branch when durable observation shows a fork', async t => {
  const state = await fixture(t);
  await state.store.observeCredential(state.first, {
    observedAt: '2026-08-18T10:01:00.000Z'
  });
  await state.store.observeCredential(state.branchA, {
    observedAt: '2026-08-18T10:12:00.000Z'
  });
  const cleanSnapshot = state.store.snapshot();
  const source = keys();
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'equivocation-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: '2026-08-18T10:00:00.000Z',
    expiresAt: '2026-08-18T12:00:00.000Z'
  });
  const path = [state.first, state.branchA];
  const command = createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
    sourceAdmission: admission,
    operatorId: state.principalId,
    operatorPrivateKey: state.branchAKey.privateKey,
    operatorCredentialPath: path,
    operatorKeyObservationSnapshot: cleanSnapshot,
    trustedOperatorRoleRootPublicKey: state.root.publicKey,
    commandId: 'fork-aware-command',
    authorizedAt: '2026-08-18T10:15:00.000Z',
    expiresAt: '2026-08-18T10:30:00.000Z'
  });
  const clean = verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle(command, {
    operatorCredentialPath: path,
    operatorKeyObservationSnapshot: cleanSnapshot,
    trustedOperatorRoleRootPublicKey: state.root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedOperatorId: state.principalId,
    now: Date.parse('2026-08-18T10:16:00.000Z')
  });
  assert.equal(clean.operator_successor_equivocation_checked, true);
  assert.equal(clean.operator_successor_equivocation_observed, false);
  assert.equal(clean.globally_current_key_state_claimed, false);

  await state.store.observeCredential(state.branchB, {
    observedAt: '2026-08-18T10:17:00.000Z'
  });
  const forkedSnapshot = state.store.snapshot();
  assert.throws(() => verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle(command, {
    operatorCredentialPath: path,
    operatorKeyObservationSnapshot: forkedSnapshot,
    trustedOperatorRoleRootPublicKey: state.root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedOperatorId: state.principalId,
    now: Date.parse('2026-08-18T10:18:00.000Z')
  }), error => {
    assert.match(error.message, /successor equivocation is unresolved/);
    assert.equal(error.details.key_state_uncertain, true);
    assert.equal(error.details.conflict_observed, true);
    assert.equal(error.details.globally_current_key_state_claimed, false);
    return true;
  });
});

test('provisioner successor forks use the same evidence-first conflict vocabulary as persona credential epochs', async t => {
  const state = await fixture(t, {
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-equivocation'
  });
  await observeFork(state);
  const [conflict] = state.store.listConflicts();

  const personaCompatibleCore = {
    conflict_kind: conflict.statement.conflict_kind,
    position_kind: conflict.statement.position_kind,
    position: conflict.statement.position,
    artifact_digests: conflict.statement.artifact_digests,
    preferred_artifact_digest: conflict.statement.preferred_artifact_digest,
    conflict_observed: conflict.statement.conflict_observed,
    truth_resolution_claimed: conflict.statement.truth_resolution_claimed,
    legal_identity_claimed: conflict.statement.legal_identity_claimed,
    finality_claimed: conflict.statement.finality_claimed,
    authority_effect: conflict.statement.authority_effect,
    network_effect: conflict.statement.network_effect
  };
  assert.deepEqual(personaCompatibleCore, {
    conflict_kind: 'credential-epoch',
    position_kind: 'credential-epoch',
    position: 2,
    artifact_digests: [state.branchA.credential_digest, state.branchB.credential_digest].sort(),
    preferred_artifact_digest: null,
    conflict_observed: true,
    truth_resolution_claimed: false,
    legal_identity_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  assert.equal(conflict.statement.role, PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER);
  assert.equal(conflict.statement.globally_current_key_state_claimed, false);
});

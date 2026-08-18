import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  PUBLIC_WITNESS_SERVICE_KEY_ROLES,
  createPublicWitnessServiceKeyCredential
} from '../src/lib/public-witness-service-key-lifecycle.mjs';
import {
  openPublicWitnessServiceKeyObservationStore
} from '../src/lib/public-witness-service-key-observation-store.mjs';
import {
  assertPublicWitnessProvisionerSigningKeyCurrent
} from '../src/lib/public-witness-source-provisioning-journal-lifecycle.mjs';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function credential({ root, operational, epoch, predecessor = null, kind = 'initial', disposition = null, activatedAt }) {
  return createPublicWitnessServiceKeyCredential({
    domainId: 'axiom.social.public.v1',
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-fork-aware',
    roleRootPrivateKey: root.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: epoch,
    activatedAt,
    transitionKind: kind,
    predecessorCredential: predecessor,
    predecessorDisposition: disposition
  });
}

test('provisioner signing-key currentness fails closed when local W2 observation has a successor fork', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-provisioner-fork-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = keys();
  const firstKey = keys();
  const branchAKey = keys();
  const branchBKey = keys();
  const first = credential({
    root,
    operational: firstKey,
    epoch: 1,
    activatedAt: '2026-08-18T10:00:00.000Z'
  });
  const branchA = credential({
    root,
    operational: branchAKey,
    epoch: 2,
    predecessor: first,
    kind: 'rotation',
    disposition: 'retired',
    activatedAt: '2026-08-18T10:10:00.000Z'
  });
  const branchB = credential({
    root,
    operational: branchBKey,
    epoch: 2,
    predecessor: first,
    kind: 'recovery',
    disposition: 'compromised',
    activatedAt: '2026-08-18T10:11:00.000Z'
  });
  const store = await openPublicWitnessServiceKeyObservationStore({
    statePath: join(directory, 'provisioner-observations.jsonl'),
    trustedRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    expectedPrincipalId: 'provisioner-fork-aware'
  });
  await store.observeCredential(first, { observedAt: '2026-08-18T10:01:00.000Z' });
  await store.observeCredential(branchA, { observedAt: '2026-08-18T10:12:00.000Z' });

  const clean = assertPublicWitnessProvisionerSigningKeyCurrent({
    provisionerPrivateKey: branchAKey.privateKey,
    provisionerCredentialPath: [first, branchA],
    provisionerKeyObservationStore: store,
    trustedProvisionerRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedProvisionerId: 'provisioner-fork-aware',
    at: '2026-08-18T10:15:00.000Z'
  });
  assert.equal(clean.successor_equivocation_checked, true);
  assert.equal(clean.successor_equivocation_observed, false);
  assert.equal(clean.globally_current_key_state_claimed, false);

  await store.observeCredential(branchB, { observedAt: '2026-08-18T10:16:00.000Z' });
  assert.throws(() => assertPublicWitnessProvisionerSigningKeyCurrent({
    provisionerPrivateKey: branchAKey.privateKey,
    provisionerCredentialPath: [first, branchA],
    provisionerKeyObservationStore: store,
    trustedProvisionerRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedProvisionerId: 'provisioner-fork-aware',
    at: '2026-08-18T10:17:00.000Z'
  }), error => {
    assert.match(error.message, /successor equivocation is unresolved/);
    assert.equal(error.details.key_state_uncertain, true);
    assert.equal(error.details.conflict_observed, true);
    assert.equal(error.details.globally_current_key_state_claimed, false);
    return true;
  });
});

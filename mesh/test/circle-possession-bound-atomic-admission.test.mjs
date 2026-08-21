import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { LifecycleGuardedCircleGridStore } from '../src/grid/circle-lifecycle-guarded-store.mjs';
import { getCircleGridPersistencePolicy } from '../src/grid/circle-persistence-state.mjs';
import {
  attestCircleCredentialPossession,
  circleCredentialPublicKeyFingerprint,
  createCircleCredentialPossessionChallenge,
  signCircleCredentialPossessionChallenge
} from '../src/grid/circle-credential-possession-attestation.mjs';
import {
  commitCirclePersistenceWithPossessionBoundAtomicAdmission,
  getCirclePossessionBoundAtomicAdmissionPolicy,
  issueCirclePossessionBoundAtomicCapability,
  prepareCirclePossessionBoundAtomicAdmission,
  validateCirclePossessionBoundAtomicAdmissionPolicy,
  verifyCirclePossessionBoundAtomicCapability,
  verifyCirclePossessionBoundAtomicReceipt
} from '../src/grid/circle-possession-bound-atomic-admission.mjs';
import { buildCircleGridPersistenceCandidate } from '../../packages/axiom-circle-grid-persistence/index.mjs';
import { buildCircleMemberLifecycleGridHeadCandidate } from '../../packages/axiom-circle-lifecycle-grid-head/index.mjs';
import {
  FIXTURE_CIRCLE_ID,
  FIXTURE_CREDENTIAL_ID,
  FIXTURE_MEMBERSHIP_ID,
  FIXTURE_NOW,
  FIXTURE_PRINCIPAL,
  buildLifecycleGridFixtureInput,
  lifecycleCharter,
  lifecycleCharterHistory,
  lifecycleCirclePackage,
  lifecycleCredentialHistory,
  lifecycleEvent,
  lifecycleHistoricalLedger,
  lifecycleMembership,
  lifecycleMembershipHistory,
  loadCircleLifecycleFixturePolicies
} from './helpers/circle-lifecycle-grid-fixture.mjs';

const NOW_SECONDS = Math.floor(FIXTURE_NOW.valueOf() / 1000);
const INTENT_DIGEST = digestObject({ schema: 'test-possession-bound-intent.v0', action: 'persist-invitation' });
const PLAN_DIGEST = digestObject({ schema: 'test-possession-bound-plan.v0', step: 'prove-then-commit' });
const POLICY_DIGEST = digestObject({ schema: 'test-possession-bound-policy.v0', decision: 'bounded-allow' });

function credentialKeyPair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    fingerprint: circleCredentialPublicKeyFingerprint(pair.publicKey)
  };
}

function credentialLifecycleWithKey(keyPair) {
  const base = lifecycleCredentialHistory();
  return lifecycleCredentialHistory({
    credentials: [{
      ...base.credentials[0],
      public_key_fingerprint: keyPair.fingerprint
    }]
  });
}

function secondInvitation() {
  return {
    schema: 'axiom-circle-invitation.v0',
    invitation_id: 'invite.lifecycle.beta.possession-bound',
    circle_id: FIXTURE_CIRCLE_ID,
    invited_principal: 'human.lifecycle.beta',
    membership_class: 'member',
    role_ids: ['member'],
    issued_by: FIXTURE_PRINCIPAL,
    issued_at: '2026-08-20T12:10:00.000Z',
    expires_at: '2026-08-20T12:40:00.000Z',
    charter_digest: digestObject(lifecycleCharter()),
    one_use: true,
    authority_effect: 'none'
  };
}

function ledgerWithSecondInvitation() {
  const ledger = structuredClone(lifecycleHistoricalLedger());
  const previous = ledger.bindings.at(-1);
  const record = secondInvitation();
  const binding = {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: 'binding.invite.lifecycle.beta.possession-bound',
    circle_id: FIXTURE_CIRCLE_ID,
    record_type: 'invitation',
    record_id: record.invitation_id,
    record_digest: digestObject(record),
    record,
    event_time: record.issued_at,
    bound_at: '2026-08-20T12:10:10.000Z',
    previous_binding_digest: digestObject(previous),
    basis_binding_id: null,
    binding_mode: 'resolve-at-event',
    governing_charter_digest: digestObject(lifecycleCharter()),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  ledger.bindings.push(binding);
  return { ledger, binding };
}

function memberContext(credentialLifecycle, membershipLifecycle = lifecycleMembershipHistory()) {
  return {
    schema: 'axiom-circle-record-member-context.v0',
    circle_id: FIXTURE_CIRCLE_ID,
    membership_id: FIXTURE_MEMBERSHIP_ID,
    principal_id: FIXTURE_PRINCIPAL,
    membership_lifecycle: membershipLifecycle,
    credential_lifecycle: credentialLifecycle,
    credential_id: FIXTURE_CREDENTIAL_ID
  };
}

async function createStore(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-possession-bound-'));
  const hypervisor = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const grid = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new LifecycleGuardedCircleGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity: grid,
    protector,
    checkpointInterval: 10_000
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return { dataDir, hypervisor, grid, protector, store };
}

function eventCount(store) {
  return Number(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count);
}

async function buildAuthorizedFixture(t) {
  const runtime = await createStore(t);
  const policies = await loadCircleLifecycleFixturePolicies();
  const keyPair = credentialKeyPair();
  const credentialLifecycle = credentialLifecycleWithKey(keyPair);
  const { ledger, binding } = ledgerWithSecondInvitation();
  const circlePackage = lifecycleCirclePackage();
  const charterLifecycle = lifecycleCharterHistory();
  const membershipLifecycle = lifecycleMembershipHistory();
  const authorizationInput = {
    ...policies,
    circlePackage,
    charterLifecycle,
    historicalLedger: ledger,
    bindingId: binding.binding_id,
    authenticatedPrincipal: FIXTURE_PRINCIPAL,
    memberContexts: [memberContext(credentialLifecycle, membershipLifecycle)],
    participantAttestations: [],
    hypervisorPublicKey: null,
    now: FIXTURE_NOW
  };

  const persistencePolicy = getCircleGridPersistencePolicy();
  for (const [index, historicalBinding] of ledger.bindings.slice(0, 2).entries()) {
    const prior = index === 0 ? null : digestObject(ledger.bindings[index - 1]);
    const candidate = buildCircleGridPersistenceCandidate(
      persistencePolicy,
      policies.historicalBindingPolicy,
      policies.charterPolicy,
      circlePackage,
      charterLifecycle,
      ledger,
      {
        bindingId: historicalBinding.binding_id,
        expectedPriorCircleHeadDigest: prior,
        now: FIXTURE_NOW
      }
    );
    runtime.store.appendEvents({
      traceId: `possession_bound_seed_${index + 1}`,
      actor: FIXTURE_PRINCIPAL,
      events: [candidate.event]
    });
  }

  const target = buildCircleGridPersistenceCandidate(
    persistencePolicy,
    policies.historicalBindingPolicy,
    policies.charterPolicy,
    circlePackage,
    charterLifecycle,
    ledger,
    {
      bindingId: binding.binding_id,
      expectedPriorCircleHeadDigest: digestObject(ledger.bindings[1]),
      now: FIXTURE_NOW
    }
  );

  const lifecycleInput = await buildLifecycleGridFixtureInput({
    credentialLifecycle,
    historicalLedger: ledger,
    circlePackage,
    charterLifecycle
  });
  const lifecycleCandidate = buildCircleMemberLifecycleGridHeadCandidate(lifecycleInput);
  runtime.store.appendEvents({
    traceId: 'possession_bound_lifecycle_seed',
    actor: FIXTURE_PRINCIPAL,
    events: [lifecycleCandidate.event]
  });
  const lifecycleHead = runtime.store.getCircleMemberLifecycleHead(FIXTURE_CIRCLE_ID, FIXTURE_MEMBERSHIP_ID);

  return {
    ...runtime,
    ...policies,
    keyPair,
    credentialLifecycle,
    membershipLifecycle,
    ledger,
    binding,
    circlePackage,
    charterLifecycle,
    authorizationInput,
    target,
    lifecycleHead,
    lifecycleCandidate
  };
}

function prepare(fixture) {
  return prepareCirclePossessionBoundAtomicAdmission({
    actor: FIXTURE_PRINCIPAL,
    event: fixture.target.event,
    authorizationInput: fixture.authorizationInput,
    lifecycleHeads: [fixture.lifecycleHead],
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST
  });
}

function possessionAttestation(fixture, prepared, {
  requestDigest = prepared.possession_request_digest,
  lifecycleHead = fixture.lifecycleHead,
  challengeNowSeconds = NOW_SECONDS,
  nowSeconds = challengeNowSeconds + 1
} = {}) {
  const challenge = createCircleCredentialPossessionChallenge(fixture.hypervisor, {
    circleId: FIXTURE_CIRCLE_ID,
    membershipId: FIXTURE_MEMBERSHIP_ID,
    principalId: FIXTURE_PRINCIPAL,
    credentialId: FIXTURE_CREDENTIAL_ID,
    requestDigest,
    lifecycleHead,
    nowSeconds: challengeNowSeconds,
    ttlSeconds: 20
  });
  const response = signCircleCredentialPossessionChallenge(
    challenge,
    fixture.keyPair.privateKey,
    fixture.keyPair.publicKey,
    {
      hypervisorPublicKey: fixture.hypervisor.publicKey,
      nowSeconds,
      maxTtlSeconds: 20
    }
  );
  return attestCircleCredentialPossession(fixture.hypervisor, {
    challenge,
    response,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    credentialPolicy: fixture.credentialPolicy,
    circlePackage: fixture.circlePackage,
    credentialLifecycle: fixture.credentialLifecycle,
    lifecycleHead,
    nowSeconds,
    maxTtlSeconds: 20
  });
}

function issue(fixture, attestation, nowSeconds = NOW_SECONDS + 2) {
  return issueCirclePossessionBoundAtomicCapability(fixture.hypervisor, {
    actor: FIXTURE_PRINCIPAL,
    event: fixture.target.event,
    authorizationInput: fixture.authorizationInput,
    lifecycleHeads: [fixture.lifecycleHead],
    possessionAttestations: [attestation],
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    nowSeconds,
    ttlSeconds: 30,
    possessionMaxAgeSeconds: 60
  });
}

test('possession-bound atomic admission policy is exact, inert, and non-authorizing', () => {
  const policy = getCirclePossessionBoundAtomicAdmissionPolicy();
  assert.equal(validateCirclePossessionBoundAtomicAdmissionPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.requirements.every_credential_backed_authorization_evidence_requires_possession_attestation, true);
  assert.equal(policy.requirements.attestation_exact_lifecycle_head_matches_atomic_guard, true);
  assert.equal(policy.requirements.possession_attestations_reverified_at_grid_commit, true);
  assert.equal(policy.requirements.challenge_single_use_persisted, false);
  assert.equal(policy.requirements.runtime_authority, false);
});

test('preparation exposes one exact required credential and one request digest before capability issuance', async t => {
  const fixture = await buildAuthorizedFixture(t);
  const prepared = prepare(fixture);
  assert.equal(prepared.required_credentials.length, 1);
  assert.equal(prepared.required_credentials[0].membership_id, FIXTURE_MEMBERSHIP_ID);
  assert.equal(prepared.required_credentials[0].credential_id, FIXTURE_CREDENTIAL_ID);
  assert.equal(prepared.required_credentials[0].lifecycle_head_digest, fixture.lifecycleHead.lifecycle_head_digest);
  assert.equal(prepared.required_credentials[0].credential_lifecycle_digest, fixture.lifecycleHead.credential_lifecycle_digest);
  assert.match(prepared.possession_request_digest, /^[a-f0-9]{64}$/);
});

test('single Hypervisor capability binds possession evidence and commits through the same lifecycle-head CAS', async t => {
  const fixture = await buildAuthorizedFixture(t);
  const prepared = prepare(fixture);
  const authNowSeconds = Math.floor(Date.now() / 1000);
  const attestation = possessionAttestation(fixture, prepared, {
    challengeNowSeconds: authNowSeconds - 2,
    nowSeconds: authNowSeconds - 1
  });
  const issued = issue(fixture, attestation, authNowSeconds);
  const verified = verifyCirclePossessionBoundAtomicCapability(
    issued.capability,
    fixture.hypervisor.publicKey,
    {
      actor: FIXTURE_PRINCIPAL,
      event: fixture.target.event,
      authorization: issued.authorization,
      lifecycleGuardSet: issued.lifecycle_guard_set,
      possessionAttestations: [attestation],
      nowSeconds: authNowSeconds,
      maxTtlSeconds: 30,
      possessionMaxAgeSeconds: 60
    }
  );
  assert.equal(verified.claims.constraints.possession_attestation_count, 1);
  assert.equal(verified.claims.constraints.required_credential_count, 1);
  assert.equal(verified.claims.constraints.all_required_credential_possession_observed, true);
  assert.equal(verified.claims.constraints.atomic_lifecycle_cas, true);
  assert.equal(verified.claims.constraints.lifecycle_guard_set_digest, issued.claims.constraints.lifecycle_guard_set_digest);

  const committed = commitCirclePersistenceWithPossessionBoundAtomicAdmission({
    store: fixture.store,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    capability: issued.capability,
    authorization: issued.authorization,
    lifecycleGuardSet: issued.lifecycle_guard_set,
    possessionAttestations: [attestation],
    actor: FIXTURE_PRINCIPAL,
    event: fixture.target.event,
    nowSeconds: authNowSeconds,
    maxTtlSeconds: 30,
    possessionMaxAgeSeconds: 60
  });
  assert.equal(committed.all_required_credential_possession_observed, true);
  assert.equal(fixture.store.getCirclePersistenceHead(FIXTURE_CIRCLE_ID).head_binding_digest, fixture.target.binding_digest);
  assert.equal(fixture.store.verifyFullChain().valid, true);

  const receipt = verifyCirclePossessionBoundAtomicReceipt(committed.receipt, {
    gridPublicKey: fixture.grid.publicKey,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    capability: issued.capability,
    authorization: issued.authorization,
    lifecycleGuardSet: issued.lifecycle_guard_set,
    possessionAttestations: [attestation],
    actor: FIXTURE_PRINCIPAL,
    event: fixture.target.event,
    gridEvent: committed.event,
    chainVerification: fixture.store.verifyFullChain(),
    maxTtlSeconds: 30,
    possessionMaxAgeSeconds: 60
  });
  assert.equal(receipt.chain_verified, true);
  assert.equal(receipt.lifecycle_head_cas_bound, true);
  assert.equal(receipt.possession_evidence_bound, true);
});

test('missing or wrong-request possession evidence fails before capability issuance', async t => {
  const fixture = await buildAuthorizedFixture(t);
  const prepared = prepare(fixture);
  assert.throws(
    () => issueCirclePossessionBoundAtomicCapability(fixture.hypervisor, {
      actor: FIXTURE_PRINCIPAL,
      event: fixture.target.event,
      authorizationInput: fixture.authorizationInput,
      lifecycleHeads: [fixture.lifecycleHead],
      possessionAttestations: [],
      intentDigest: INTENT_DIGEST,
      planDigest: PLAN_DIGEST,
      policyDigest: POLICY_DIGEST,
      hypervisorPublicKey: fixture.hypervisor.publicKey,
      nowSeconds: NOW_SECONDS + 2,
      ttlSeconds: 30
    }),
    /exactly one possession attestation per required credential/
  );

  const wrong = possessionAttestation(fixture, prepared, { requestDigest: 'f'.repeat(64) });
  assert.throws(
    () => issue(fixture, wrong),
    error => error?.code === 'circle_possession_attestation_context_mismatch'
  );
});

test('lifecycle head advance after possession-bound issuance rolls back the entire Circle append', async t => {
  const fixture = await buildAuthorizedFixture(t);
  const prepared = prepare(fixture);
  const attestation = possessionAttestation(fixture, prepared);
  const issued = issue(fixture, attestation);

  const narrow = lifecycleEvent({
    kind: 'role-narrow',
    at: '2026-08-20T13:00:10.000Z',
    roleIds: []
  });
  const narrowedMembershipLifecycle = lifecycleMembershipHistory([narrow]);
  const narrowedCirclePackage = lifecycleCirclePackage(lifecycleMembership({ roleIds: [] }));
  const narrowedInput = await buildLifecycleGridFixtureInput({
    credentialLifecycle: fixture.credentialLifecycle,
    historicalLedger: fixture.ledger,
    circlePackage: narrowedCirclePackage,
    charterLifecycle: fixture.charterLifecycle,
    membershipLifecycle: narrowedMembershipLifecycle,
    previousGridLifecycleHeadDigest: fixture.lifecycleHead.lifecycle_head_digest,
    now: new Date('2026-08-20T13:00:11.000Z')
  });
  const narrowed = buildCircleMemberLifecycleGridHeadCandidate(narrowedInput);
  fixture.store.appendEvents({
    traceId: 'possession_bound_lifecycle_advance',
    actor: FIXTURE_PRINCIPAL,
    events: [narrowed.event]
  });
  const before = eventCount(fixture.store);
  assert.throws(
    () => commitCirclePersistenceWithPossessionBoundAtomicAdmission({
      store: fixture.store,
      hypervisorPublicKey: fixture.hypervisor.publicKey,
      capability: issued.capability,
      authorization: issued.authorization,
      lifecycleGuardSet: issued.lifecycle_guard_set,
      possessionAttestations: [attestation],
      actor: FIXTURE_PRINCIPAL,
      event: fixture.target.event,
      nowSeconds: NOW_SECONDS + 11,
      maxTtlSeconds: 30,
      possessionMaxAgeSeconds: 60
    }),
    error => error?.code === 'circle_admission_lifecycle_head_conflict' && error.status === 409
  );
  assert.equal(eventCount(fixture.store), before);
  assert.equal(fixture.store.getCirclePersistenceHead(FIXTURE_CIRCLE_ID).head_binding_digest, digestObject(fixture.ledger.bindings[1]));
});

test('attested credential lifecycle must be the same lifecycle state protected by the atomic guard', async t => {
  const fixture = await buildAuthorizedFixture(t);
  const prepared = prepare(fixture);
  const attestation = possessionAttestation(fixture, prepared);
  const tampered = structuredClone(attestation);
  tampered.statement.credential_lifecycle_digest = 'e'.repeat(64);
  tampered.signature = fixture.hypervisor.signObject(tampered.statement);
  assert.throws(
    () => issue(fixture, tampered),
    error => error?.code === 'circle_possession_attestation_lifecycle_mismatch' && error.status === 409
  );
});

test('creator bootstrap has an exact zero-credential, zero-attestation path without fabricating possession', async t => {
  const runtime = await createStore(t);
  const policies = await loadCircleLifecycleFixturePolicies();
  const ledger = lifecycleHistoricalLedger();
  const firstBinding = ledger.bindings[0];
  const circlePackage = lifecycleCirclePackage();
  const charterLifecycle = lifecycleCharterHistory();
  const authorizationInput = {
    ...policies,
    circlePackage,
    charterLifecycle,
    historicalLedger: ledger,
    bindingId: firstBinding.binding_id,
    authenticatedPrincipal: FIXTURE_PRINCIPAL,
    memberContexts: [],
    participantAttestations: [],
    hypervisorPublicKey: null,
    now: FIXTURE_NOW
  };
  const event = buildCircleGridPersistenceCandidate(
    getCircleGridPersistencePolicy(),
    policies.historicalBindingPolicy,
    policies.charterPolicy,
    circlePackage,
    charterLifecycle,
    ledger,
    {
      bindingId: firstBinding.binding_id,
      expectedPriorCircleHeadDigest: null,
      now: FIXTURE_NOW
    }
  ).event;
  const prepared = prepareCirclePossessionBoundAtomicAdmission({
    actor: FIXTURE_PRINCIPAL,
    event,
    authorizationInput,
    lifecycleHeads: [],
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST
  });
  assert.equal(prepared.required_credentials.length, 0);
  assert.equal(prepared.lifecycle_guard_set.guards.length, 0);

  const issued = issueCirclePossessionBoundAtomicCapability(runtime.hypervisor, {
    actor: FIXTURE_PRINCIPAL,
    event,
    authorizationInput,
    lifecycleHeads: [],
    possessionAttestations: [],
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    hypervisorPublicKey: runtime.hypervisor.publicKey,
    nowSeconds: NOW_SECONDS,
    ttlSeconds: 30
  });
  assert.equal(issued.possession_attestation_set.required_credential_count, 0);
  assert.equal(issued.possession_attestation_set.attestation_count, 0);
  assert.equal(issued.claims.constraints.all_required_credential_possession_observed, true);
  assert.equal(issued.claims.constraints.required_credential_count, 0);

  assert.throws(
    () => issueCirclePossessionBoundAtomicCapability(runtime.hypervisor, {
      actor: FIXTURE_PRINCIPAL,
      event,
      authorizationInput,
      lifecycleHeads: [],
      possessionAttestations: [{ statement: { circle_id: FIXTURE_CIRCLE_ID } }],
      intentDigest: INTENT_DIGEST,
      planDigest: PLAN_DIGEST,
      policyDigest: POLICY_DIGEST,
      hypervisorPublicKey: runtime.hypervisor.publicKey,
      nowSeconds: NOW_SECONDS,
      ttlSeconds: 30
    }),
    /exactly one possession attestation per required credential/
  );
});
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { LifecycleGuardedCircleGridStore } from '../src/grid/circle-lifecycle-guarded-store.mjs';
import { getCircleGridPersistencePolicy } from '../src/grid/circle-persistence-state.mjs';
import {
  commitCirclePersistenceWithAuthorizedLifecycleCas,
  deriveCircleAuthorizedLifecycleCasTraceId,
  getCircleAuthorizedGridAdmissionLifecycleCasPolicy,
  issueCircleAuthorizedLifecycleCasCapability,
  validateCircleAuthorizedGridAdmissionLifecycleCasPolicy,
  verifyCircleAuthorizedLifecycleCasCapability,
  verifyCircleAuthorizedLifecycleCasReceipt
} from '../src/grid/circle-authorized-admission-lifecycle-cas.mjs';
import {
  digestCircleAdmissionLifecycleGuardSet
} from '../src/grid/circle-admission-lifecycle-guards.mjs';
import { getCircleAuthorizedGridAdmissionPolicy } from '../src/grid/circle-authorized-admission.mjs';
import {
  buildCircleGridPersistenceCandidate
} from '../../packages/axiom-circle-grid-persistence/index.mjs';
import {
  buildCircleMemberLifecycleGridHeadCandidate
} from '../../packages/axiom-circle-lifecycle-grid-head/index.mjs';
import {
  FIXTURE_CIRCLE_ID,
  FIXTURE_CREDENTIAL_ID,
  FIXTURE_MEMBERSHIP_ID,
  FIXTURE_NOW,
  FIXTURE_PRINCIPAL,
  buildLifecycleGridFixtureInput,
  lifecycleCharter,
  lifecycleCirclePackage,
  lifecycleCredentialHistory,
  lifecycleEvent,
  lifecycleHistoricalLedger,
  lifecycleMembership,
  lifecycleMembershipHistory,
  loadCircleLifecycleFixturePolicies
} from './helpers/circle-lifecycle-grid-fixture.mjs';

const SECOND_INVITATION_ID = 'invite.lifecycle.beta';
const INTENT_DIGEST = digestObject({ schema: 'test-intent.v0', action: 'circle-lifecycle-cas-admit' });
const PLAN_DIGEST = digestObject({ schema: 'test-plan.v0', step: 'atomic-lifecycle-head-cas' });
const POLICY_DIGEST = digestObject({ schema: 'test-policy.v0', decision: 'allow-inert-circle-cas' });

function secondInvitation() {
  return {
    schema: 'axiom-circle-invitation.v0',
    invitation_id: SECOND_INVITATION_ID,
    circle_id: FIXTURE_CIRCLE_ID,
    invited_principal: 'human.lifecycle.beta',
    membership_class: 'member',
    role_ids: ['member'],
    issued_by: FIXTURE_PRINCIPAL,
    issued_at: '2026-08-20T12:10:00.000Z',
    expires_at: '2026-08-20T13:30:00.000Z',
    charter_digest: digestObject(lifecycleCharter()),
    one_use: true,
    authority_effect: 'none'
  };
}

function extendedHistoricalLedger() {
  const base = lifecycleHistoricalLedger();
  const previous = base.bindings.at(-1);
  const invitation = secondInvitation();
  const binding = {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: 'binding.invite.lifecycle.beta',
    circle_id: FIXTURE_CIRCLE_ID,
    record_type: 'invitation',
    record_id: invitation.invitation_id,
    record_digest: digestObject(invitation),
    record: invitation,
    event_time: invitation.issued_at,
    bound_at: '2026-08-20T12:10:10.000Z',
    previous_binding_digest: digestObject(previous),
    basis_binding_id: null,
    binding_mode: 'resolve-at-event',
    governing_charter_digest: digestObject(lifecycleCharter()),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  return {
    value: {
      ...base,
      bindings: [...base.bindings, binding]
    },
    invitationBinding: base.bindings[0],
    membershipBinding: base.bindings[1],
    targetBinding: binding
  };
}

function memberContext({ membershipLifecycle = lifecycleMembershipHistory(), credentialLifecycle = lifecycleCredentialHistory() } = {}) {
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

async function authorizationFixture({ membershipLifecycle = lifecycleMembershipHistory(), circlePackage = lifecycleCirclePackage() } = {}) {
  const policies = await loadCircleLifecycleFixturePolicies();
  const history = extendedHistoricalLedger();
  return {
    policies,
    history,
    circlePackage,
    input: {
      eligibilityPolicy: policies.memberEligibilityPolicy,
      charterPolicy: policies.charterPolicy,
      historicalBindingPolicy: policies.historicalBindingPolicy,
      credentialPolicy: policies.credentialPolicy,
      circlePackage,
      charterLifecycle: (await buildLifecycleGridFixtureInput()).charterLifecycle,
      historicalLedger: history.value,
      bindingId: history.targetBinding.binding_id,
      authenticatedPrincipal: FIXTURE_PRINCIPAL,
      memberContexts: [memberContext({ membershipLifecycle })],
      participantAttestations: [],
      hypervisorPublicKey: null,
      now: FIXTURE_NOW
    }
  };
}

function persistenceCandidate(fixture, binding) {
  return buildCircleGridPersistenceCandidate(
    getCircleGridPersistencePolicy(),
    fixture.policies.historicalBindingPolicy,
    fixture.policies.charterPolicy,
    fixture.circlePackage,
    fixture.input.charterLifecycle,
    fixture.history.value,
    {
      bindingId: binding.binding_id,
      expectedPriorCircleHeadDigest: binding.previous_binding_digest,
      now: FIXTURE_NOW
    }
  );
}

function targetPersistenceCandidate(fixture) {
  return persistenceCandidate(fixture, fixture.history.targetBinding);
}

function seedCirclePredecessors(store, fixture) {
  for (const [index, binding] of [fixture.history.invitationBinding, fixture.history.membershipBinding].entries()) {
    const candidate = persistenceCandidate(fixture, binding);
    store.appendEvents({
      traceId: `circle_cas_seed_predecessor_${index + 1}`,
      actor: FIXTURE_PRINCIPAL,
      events: [candidate.event]
    });
  }
}

async function createGridFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-lifecycle-cas-'));
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

async function seedLifecycleHead(store) {
  const input = await buildLifecycleGridFixtureInput();
  const candidate = buildCircleMemberLifecycleGridHeadCandidate(input);
  store.appendEvents({
    traceId: 'circle_cas_lifecycle_genesis',
    actor: FIXTURE_PRINCIPAL,
    events: [candidate.event]
  });
  return {
    candidate,
    snapshot: store.getCircleMemberLifecycleHead(FIXTURE_CIRCLE_ID, FIXTURE_MEMBERSHIP_ID)
  };
}

async function advanceLifecycleHeadWithRoleNarrow(store, previousHeadDigest) {
  const narrow = lifecycleEvent({
    kind: 'role-narrow',
    at: '2026-08-20T12:20:00.000Z',
    roleIds: []
  });
  const input = await buildLifecycleGridFixtureInput({
    circlePackage: lifecycleCirclePackage(lifecycleMembership({ roleIds: [] })),
    membershipLifecycle: lifecycleMembershipHistory([narrow]),
    previousGridLifecycleHeadDigest: previousHeadDigest
  });
  const candidate = buildCircleMemberLifecycleGridHeadCandidate(input);
  store.appendEvents({
    traceId: 'circle_cas_lifecycle_narrow',
    actor: FIXTURE_PRINCIPAL,
    events: [candidate.event]
  });
  return candidate;
}

function eventCount(store) {
  return Number(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count);
}

test('lifecycle CAS admission policy is exact, inert, and parent-bound', async () => {
  const policy = getCircleAuthorizedGridAdmissionLifecycleCasPolicy();
  assert.equal(validateCircleAuthorizedGridAdmissionLifecycleCasPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.requirements.lifecycle_head_check_and_circle_commit_share_one_grid_transaction, true);
  assert.equal(policy.requirements.guard_set_digest_bound_into_single_hypervisor_capability, true);
  assert.equal(policy.requirements.credential_possession_proved, false);

  const source = await readFile(new URL('../src/grid/circle-authorized-admission-lifecycle-cas.mjs', import.meta.url), 'utf8');
  assert.match(source, /getCircleAuthorizedGridAdmissionPolicy/);
  const gridServer = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  const hypervisorServer = await readFile(new URL('../src/hypervisor/server.mjs', import.meta.url), 'utf8');
  for (const runtimeSource of [gridServer, hypervisorServer]) {
    assert.doesNotMatch(runtimeSource, /circle-authorized-admission-lifecycle-cas\.mjs/);
    assert.doesNotMatch(runtimeSource, /LifecycleGuardedCircleGridStore/);
  }
});

test('one Hypervisor capability binds exact authorization lifecycle contexts to current Grid heads', async t => {
  const fixture = await authorizationFixture();
  const candidate = targetPersistenceCandidate(fixture);
  const { hypervisor, store } = await createGridFixture(t);
  const lifecycle = await seedLifecycleHead(store);
  const nowSeconds = Math.floor(Date.now() / 1000);

  const issued = issueCircleAuthorizedLifecycleCasCapability(hypervisor, {
    actor: FIXTURE_PRINCIPAL,
    event: candidate.event,
    authorizationInput: fixture.input,
    lifecycleHeads: [lifecycle.snapshot],
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });
  assert.equal(issued.lifecycle_guard_set.guards.length, 1);
  assert.equal(issued.lifecycle_guard_set.guards[0].membership_id, FIXTURE_MEMBERSHIP_ID);
  assert.equal(issued.lifecycle_guard_set.guards[0].expected_lifecycle_head_digest, lifecycle.candidate.resulting_grid_lifecycle_head_digest);
  assert.equal(
    issued.claims.constraints.lifecycle_guard_set_digest,
    digestCircleAdmissionLifecycleGuardSet(issued.lifecycle_guard_set)
  );
  assert.equal(issued.claims.constraints.parent_authorized_admission_policy_digest, digestObject(getCircleAuthorizedGridAdmissionPolicy()));
  assert.equal(issued.claims.constraints.atomic_lifecycle_cas, true);

  const verified = verifyCircleAuthorizedLifecycleCasCapability(issued.capability, hypervisor.publicKey, {
    actor: FIXTURE_PRINCIPAL,
    event: candidate.event,
    authorization: issued.authorization,
    lifecycleGuardSet: issued.lifecycle_guard_set,
    nowSeconds,
    maxTtlSeconds: 120
  });
  assert.equal(verified.claims.constraints.lifecycle_guard_count, 1);
});

test('lifecycle CAS commits authorized Circle record and signs guard-bound receipt', async t => {
  const fixture = await authorizationFixture();
  const candidate = targetPersistenceCandidate(fixture);
  const { hypervisor, grid, store } = await createGridFixture(t);
  const lifecycle = await seedLifecycleHead(store);
  seedCirclePredecessors(store, fixture);
  const nowSeconds = Math.floor(Date.now() / 1000);

  const issued = issueCircleAuthorizedLifecycleCasCapability(hypervisor, {
    actor: FIXTURE_PRINCIPAL,
    event: candidate.event,
    authorizationInput: fixture.input,
    lifecycleHeads: [lifecycle.snapshot],
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });
  const committed = commitCirclePersistenceWithAuthorizedLifecycleCas({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    authorization: issued.authorization,
    lifecycleGuardSet: issued.lifecycle_guard_set,
    actor: FIXTURE_PRINCIPAL,
    event: candidate.event,
    nowSeconds,
    maxTtlSeconds: 120
  });
  assert.equal(committed.event.trace_id, deriveCircleAuthorizedLifecycleCasTraceId(issued.capability));
  assert.equal(committed.receipt.statement.atomic_lifecycle_cas, true);
  assert.equal(committed.receipt.statement.lifecycle_guard_set_digest, digestCircleAdmissionLifecycleGuardSet(issued.lifecycle_guard_set));
  assert.equal(store.getCirclePersistenceHead(FIXTURE_CIRCLE_ID).head_binding_digest, candidate.binding_digest);
  assert.equal(eventCount(store), 4);

  const verifiedReceipt = verifyCircleAuthorizedLifecycleCasReceipt(committed.receipt, {
    gridPublicKey: grid.publicKey,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    authorization: issued.authorization,
    lifecycleGuardSet: issued.lifecycle_guard_set,
    actor: FIXTURE_PRINCIPAL,
    event: candidate.event,
    gridEvent: committed.event,
    chainVerification: store.verifyFullChain(),
    maxTtlSeconds: 120
  });
  assert.equal(verifiedReceipt.receipt_digest, committed.receipt_digest);
  assert.equal(verifiedReceipt.lifecycle_head_cas_bound, true);
});

test('lifecycle head advance between authorization and commit rolls back the entire Circle append', async t => {
  const fixture = await authorizationFixture();
  const candidate = targetPersistenceCandidate(fixture);
  const { hypervisor, store } = await createGridFixture(t);
  const lifecycle = await seedLifecycleHead(store);
  seedCirclePredecessors(store, fixture);
  const nowSeconds = Math.floor(Date.now() / 1000);

  const issued = issueCircleAuthorizedLifecycleCasCapability(hypervisor, {
    actor: FIXTURE_PRINCIPAL,
    event: candidate.event,
    authorizationInput: fixture.input,
    lifecycleHeads: [lifecycle.snapshot],
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });

  const narrowed = await advanceLifecycleHeadWithRoleNarrow(
    store,
    lifecycle.candidate.resulting_grid_lifecycle_head_digest
  );
  const countBeforeCommit = eventCount(store);
  assert.throws(
    () => commitCirclePersistenceWithAuthorizedLifecycleCas({
      store,
      hypervisorPublicKey: hypervisor.publicKey,
      capability: issued.capability,
      authorization: issued.authorization,
      lifecycleGuardSet: issued.lifecycle_guard_set,
      actor: FIXTURE_PRINCIPAL,
      event: candidate.event,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    error => error?.code === 'circle_admission_lifecycle_head_conflict' && error.status === 409
  );
  assert.equal(eventCount(store), countBeforeCommit);
  assert.equal(
    store.getCirclePersistenceHead(FIXTURE_CIRCLE_ID).head_binding_digest,
    digestObject(fixture.history.membershipBinding)
  );
  assert.equal(
    store.getCircleMemberLifecycleHead(FIXTURE_CIRCLE_ID, FIXTURE_MEMBERSHIP_ID).lifecycle_head_digest,
    narrowed.resulting_grid_lifecycle_head_digest
  );
});

test('current Grid head cannot be substituted for a different authorization lifecycle context', async t => {
  const fixture = await authorizationFixture();
  const candidate = targetPersistenceCandidate(fixture);
  const { hypervisor, store } = await createGridFixture(t);
  const lifecycle = await seedLifecycleHead(store);
  await advanceLifecycleHeadWithRoleNarrow(store, lifecycle.candidate.resulting_grid_lifecycle_head_digest);
  const current = store.getCircleMemberLifecycleHead(FIXTURE_CIRCLE_ID, FIXTURE_MEMBERSHIP_ID);
  const nowSeconds = Math.floor(Date.now() / 1000);

  assert.throws(
    () => issueCircleAuthorizedLifecycleCasCapability(hypervisor, {
      actor: FIXTURE_PRINCIPAL,
      event: candidate.event,
      authorizationInput: fixture.input,
      lifecycleHeads: [current],
      intentDigest: INTENT_DIGEST,
      planDigest: PLAN_DIGEST,
      policyDigest: POLICY_DIGEST,
      nowSeconds,
      ttlSeconds: 120
    }),
    error => error?.code === 'circle_lifecycle_guard_context_mismatch' && error.status === 409
  );
});

test('exact retained admission replay remains historical after later lifecycle narrowing', async t => {
  const fixture = await authorizationFixture();
  const candidate = targetPersistenceCandidate(fixture);
  const { hypervisor, store } = await createGridFixture(t);
  const lifecycle = await seedLifecycleHead(store);
  seedCirclePredecessors(store, fixture);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = issueCircleAuthorizedLifecycleCasCapability(hypervisor, {
    actor: FIXTURE_PRINCIPAL,
    event: candidate.event,
    authorizationInput: fixture.input,
    lifecycleHeads: [lifecycle.snapshot],
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });
  const first = commitCirclePersistenceWithAuthorizedLifecycleCas({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    authorization: issued.authorization,
    lifecycleGuardSet: issued.lifecycle_guard_set,
    actor: FIXTURE_PRINCIPAL,
    event: candidate.event,
    nowSeconds,
    maxTtlSeconds: 120
  });

  await advanceLifecycleHeadWithRoleNarrow(store, lifecycle.candidate.resulting_grid_lifecycle_head_digest);
  const beforeReplay = eventCount(store);
  const replay = commitCirclePersistenceWithAuthorizedLifecycleCas({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    authorization: issued.authorization,
    lifecycleGuardSet: issued.lifecycle_guard_set,
    actor: FIXTURE_PRINCIPAL,
    event: structuredClone(candidate.event),
    nowSeconds,
    maxTtlSeconds: 120
  });
  assert.equal(replay.event.seq, first.event.seq);
  assert.equal(eventCount(store), beforeReplay);
});

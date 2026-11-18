import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { getCircleGridPersistencePolicy } from '../src/grid/circle-persistence-state.mjs';
import { LifecycleGuardedCircleGridStore } from '../src/grid/circle-lifecycle-guarded-store.mjs';
import {
  commitCirclePersistenceWithAuthorizedLifecycleCas,
  issueCircleAuthorizedLifecycleCasCapability
} from '../src/grid/circle-authorized-admission-lifecycle-cas.mjs';
import { buildCircleGridPersistenceCandidate } from '../../packages/axiom-circle-grid-persistence/index.mjs';
import {
  FIXTURE_NOW,
  FIXTURE_PRINCIPAL,
  buildLifecycleGridFixtureInput,
  lifecycleCirclePackage,
  lifecycleHistoricalLedger,
  loadCircleLifecycleFixturePolicies
} from './helpers/circle-lifecycle-grid-fixture.mjs';

const INTENT_DIGEST = digestObject({ schema: 'test-intent.v0', action: 'circle-bootstrap-cas' });
const PLAN_DIGEST = digestObject({ schema: 'test-plan.v0', step: 'bootstrap-without-member-head' });
const POLICY_DIGEST = digestObject({ schema: 'test-policy.v0', decision: 'allow-inert-bootstrap' });

async function bootstrapFixture() {
  const policies = await loadCircleLifecycleFixturePolicies();
  const common = await buildLifecycleGridFixtureInput();
  const historicalLedger = lifecycleHistoricalLedger();
  const circlePackage = lifecycleCirclePackage();
  const invitationBinding = historicalLedger.bindings[0];
  const authorizationInput = {
    eligibilityPolicy: policies.memberEligibilityPolicy,
    charterPolicy: policies.charterPolicy,
    historicalBindingPolicy: policies.historicalBindingPolicy,
    credentialPolicy: policies.credentialPolicy,
    circlePackage,
    charterLifecycle: common.charterLifecycle,
    historicalLedger,
    bindingId: invitationBinding.binding_id,
    authenticatedPrincipal: FIXTURE_PRINCIPAL,
    memberContexts: [],
    participantAttestations: [],
    hypervisorPublicKey: null,
    now: FIXTURE_NOW
  };
  const candidate = buildCircleGridPersistenceCandidate(
    getCircleGridPersistencePolicy(),
    policies.historicalBindingPolicy,
    policies.charterPolicy,
    circlePackage,
    common.charterLifecycle,
    historicalLedger,
    {
      bindingId: invitationBinding.binding_id,
      expectedPriorCircleHeadDigest: null,
      now: FIXTURE_NOW
    }
  );
  return { authorizationInput, candidate };
}

async function createStore(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-bootstrap-cas-'));
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
  return { hypervisor, store };
}

test('creator bootstrap binds an exact empty lifecycle guard set and can commit no prior member head', async t => {
  const fixture = await bootstrapFixture();
  const { hypervisor, store } = await createStore(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = issueCircleAuthorizedLifecycleCasCapability(hypervisor, {
    actor: FIXTURE_PRINCIPAL,
    event: fixture.candidate.event,
    authorizationInput: fixture.authorizationInput,
    lifecycleHeads: [],
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });

  assert.equal(issued.authorization.assessment.authorization_mode, 'creator-bootstrap-first-invitation');
  assert.equal(issued.authorization.eligibility_evidence.items.length, 0);
  assert.equal(issued.lifecycle_guard_set.guards.length, 0);
  assert.equal(issued.claims.constraints.lifecycle_guard_count, 0);

  const committed = commitCirclePersistenceWithAuthorizedLifecycleCas({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    authorization: issued.authorization,
    lifecycleGuardSet: issued.lifecycle_guard_set,
    actor: FIXTURE_PRINCIPAL,
    event: fixture.candidate.event,
    nowSeconds,
    maxTtlSeconds: 120
  });
  assert.equal(committed.receipt.statement.lifecycle_guard_count, 0);
  assert.equal(committed.receipt.statement.atomic_lifecycle_cas, true);
  assert.equal(store.getCirclePersistenceHead(fixture.candidate.circle_id).head_binding_digest, fixture.candidate.binding_digest);
});

test('creator bootstrap rejects a fabricated lifecycle head because authorization requires none', async t => {
  const fixture = await bootstrapFixture();
  const { hypervisor } = await createStore(t);
  const fakeHead = {
    circle_id: fixture.candidate.circle_id,
    membership_id: 'membership.fabricated',
    principal_id: FIXTURE_PRINCIPAL,
    lifecycle_head_digest: 'a'.repeat(64),
    membership_lifecycle_digest: 'b'.repeat(64),
    credential_lifecycle_digest: 'c'.repeat(64),
    event_id: 'circle_lifecycle_head_fabricated',
    event_seq: 1,
    updated_at: '2026-08-20T12:05:00.000Z'
  };
  assert.throws(
    () => issueCircleAuthorizedLifecycleCasCapability(hypervisor, {
      actor: FIXTURE_PRINCIPAL,
      event: fixture.candidate.event,
      authorizationInput: fixture.authorizationInput,
      lifecycleHeads: [fakeHead],
      intentDigest: INTENT_DIGEST,
      planDigest: PLAN_DIGEST,
      policyDigest: POLICY_DIGEST,
      nowSeconds: Math.floor(Date.now() / 1000),
      ttlSeconds: 120
    }),
    /exactly one Grid head for every authorization membership/
  );
});

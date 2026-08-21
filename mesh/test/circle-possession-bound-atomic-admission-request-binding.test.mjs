import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { getCircleGridPersistencePolicy } from '../src/grid/circle-persistence-state.mjs';
import {
  prepareCirclePossessionBoundAtomicAdmission
} from '../src/grid/circle-possession-bound-atomic-admission.mjs';
import { buildCircleGridPersistenceCandidate } from '../../packages/axiom-circle-grid-persistence/index.mjs';
import {
  FIXTURE_NOW,
  FIXTURE_PRINCIPAL,
  lifecycleCharterHistory,
  lifecycleCirclePackage,
  lifecycleHistoricalLedger,
  loadCircleLifecycleFixturePolicies
} from './helpers/circle-lifecycle-grid-fixture.mjs';

const INTENT_A = digestObject({ schema: 'request-binding-intent.v0', value: 'a' });
const INTENT_B = digestObject({ schema: 'request-binding-intent.v0', value: 'b' });
const PLAN_A = digestObject({ schema: 'request-binding-plan.v0', value: 'a' });
const PLAN_B = digestObject({ schema: 'request-binding-plan.v0', value: 'b' });
const POLICY_A = digestObject({ schema: 'request-binding-policy.v0', value: 'a' });
const POLICY_B = digestObject({ schema: 'request-binding-policy.v0', value: 'b' });

async function bootstrapFixture() {
  const policies = await loadCircleLifecycleFixturePolicies();
  const circlePackage = lifecycleCirclePackage();
  const charterLifecycle = lifecycleCharterHistory();
  const historicalLedger = lifecycleHistoricalLedger();
  const binding = historicalLedger.bindings[0];
  const event = buildCircleGridPersistenceCandidate(
    getCircleGridPersistencePolicy(),
    policies.historicalBindingPolicy,
    policies.charterPolicy,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    {
      bindingId: binding.binding_id,
      expectedPriorCircleHeadDigest: null,
      now: FIXTURE_NOW
    }
  ).event;
  const authorizationInput = {
    ...policies,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    bindingId: binding.binding_id,
    authenticatedPrincipal: FIXTURE_PRINCIPAL,
    memberContexts: [],
    participantAttestations: [],
    hypervisorPublicKey: null,
    now: FIXTURE_NOW
  };
  return { event, authorizationInput };
}

function prepare(fixture, { intent = INTENT_A, plan = PLAN_A, policy = POLICY_A } = {}) {
  return prepareCirclePossessionBoundAtomicAdmission({
    actor: FIXTURE_PRINCIPAL,
    event: fixture.event,
    authorizationInput: fixture.authorizationInput,
    lifecycleHeads: [],
    intentDigest: intent,
    planDigest: plan,
    policyDigest: policy
  });
}

test('possession request digest binds upstream intent, plan, and policy even when Circle event and authorization are unchanged', async () => {
  const fixture = await bootstrapFixture();
  const base = prepare(fixture);
  const changedIntent = prepare(fixture, { intent: INTENT_B });
  const changedPlan = prepare(fixture, { plan: PLAN_B });
  const changedPolicy = prepare(fixture, { policy: POLICY_B });

  assert.equal(base.required_credentials.length, 0);
  assert.equal(base.lifecycle_guard_set.guards.length, 0);
  assert.notEqual(base.possession_request_digest, changedIntent.possession_request_digest);
  assert.notEqual(base.possession_request_digest, changedPlan.possession_request_digest);
  assert.notEqual(base.possession_request_digest, changedPolicy.possession_request_digest);
  assert.notEqual(changedIntent.possession_request_digest, changedPlan.possession_request_digest);
  assert.notEqual(changedPlan.possession_request_digest, changedPolicy.possession_request_digest);
});

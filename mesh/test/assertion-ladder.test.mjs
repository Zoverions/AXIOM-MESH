import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AssertionLadderError,
  canRenderAs,
  createAssertionEvent,
  defineAssertionLadder,
  resolvePolicyDeclaredTier
} from '../../packages/axiom-assertion-ladder/index.mjs';
import {
  ASSURANCE_LADDER,
  ASSURANCE_TIER_IDS
} from '../../packages/axiom-assertion-ladder/assurance-tiers.mjs';

test('an assertion cannot render above the state actually achieved', () => {
  assert.equal(canRenderAs(ASSURANCE_LADDER, 'A1', 'A1'), true);
  assert.equal(canRenderAs(ASSURANCE_LADDER, 'A1', 'A0'), true);
  assert.equal(canRenderAs(ASSURANCE_LADDER, 'A1', 'A2'), false);
  assert.equal(canRenderAs(ASSURANCE_LADDER, 'A4', 'A6'), false);
  assert.equal(canRenderAs(ASSURANCE_LADDER, 'A6', 'A3'), true);
});

test('events carry explicit not-yet states', () => {
  const event = createAssertionEvent({
    ladder: ASSURANCE_LADDER,
    subject_id: 'intent:test',
    state: 'A2',
    evidence: ['receipt:approval']
  });

  assert.deepEqual(event.not_yet, ['A3', 'A4', 'A5', 'A6']);
  assert.equal(event.state_rank, 2);
});

test('upgrades are new monotonic events and downgrade mutation is denied', () => {
  const local = createAssertionEvent({
    ladder: ASSURANCE_LADDER,
    subject_id: 'record:1',
    state: 'A1'
  });
  const anchored = createAssertionEvent({
    ladder: ASSURANCE_LADDER,
    subject_id: 'record:1',
    state: 'A4',
    previous: local,
    evidence: ['anchor:public-checkpoint']
  });

  assert.equal(anchored.previous_state, 'A1');
  assert.equal(anchored.state, 'A4');

  assert.throws(
    () => createAssertionEvent({
      ladder: ASSURANCE_LADDER,
      subject_id: 'record:1',
      state: 'A2',
      previous: anchored
    }),
    error => error instanceof AssertionLadderError && error.code === 'NON_MONOTONIC_TRANSITION'
  );
});

test('policy declares assurance tier; caller override is denied', () => {
  assert.equal(resolvePolicyDeclaredTier({
    policy_tier: 'A3',
    allowed_tiers: ASSURANCE_TIER_IDS
  }), 'A3');

  assert.throws(
    () => resolvePolicyDeclaredTier({
      policy_tier: 'A3',
      caller_tier: 'A1',
      allowed_tiers: ASSURANCE_TIER_IDS
    }),
    error => error instanceof AssertionLadderError && error.code === 'CALLER_TIER_OVERRIDE_DENIED'
  );
});

test('the generic ladder also represents capability and evidence state machines', () => {
  const capability = defineAssertionLadder({
    schema: 'axiom-assertion-ladder.v1',
    ladder_id: 'example.capability',
    version: '1.0.0',
    states: [
      { id: 'built', rank: 0 },
      { id: 'enabled', rank: 1 },
      { id: 'exposed', rank: 2 },
      { id: 'promoted', rank: 3 },
      { id: 'marketed', rank: 4 }
    ],
    failure_states: ['revoked']
  });

  assert.equal(canRenderAs(capability, 'built', 'marketed'), false);
  assert.equal(canRenderAs(capability, 'marketed', 'built'), true);
  assert.equal(canRenderAs(capability, 'revoked', 'built'), false);
});

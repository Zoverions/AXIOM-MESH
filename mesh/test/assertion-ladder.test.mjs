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
import {
  PUBLIC_ORDERING_LADDER,
  VALUE_SETTLEMENT_LADDER,
  composeAssuranceState
} from '../../packages/axiom-assertion-ladder/external-effect-states.mjs';

test('an assurance assertion cannot render above the state actually achieved', () => {
  assert.equal(canRenderAs(ASSURANCE_LADDER, 'A1', 'A1'), true);
  assert.equal(canRenderAs(ASSURANCE_LADDER, 'A1', 'A0'), true);
  assert.equal(canRenderAs(ASSURANCE_LADDER, 'A1', 'A2'), false);
  assert.equal(canRenderAs(ASSURANCE_LADDER, 'A4', 'A3'), true);
});

test('events carry explicit not-yet states', () => {
  const event = createAssertionEvent({
    ladder: ASSURANCE_LADDER,
    subject_id: 'intent:test',
    state: 'A2',
    evidence: ['receipt:policy-and-execution']
  });
  assert.deepEqual(event.not_yet, ['A3', 'A4']);
  assert.equal(event.state_rank, 2);
});

test('upgrades are new monotonic events and downgrade mutation is denied', () => {
  const attributable = createAssertionEvent({
    ladder: ASSURANCE_LADDER,
    subject_id: 'record:1',
    state: 'A1'
  });
  const independentlyVerified = createAssertionEvent({
    ladder: ASSURANCE_LADDER,
    subject_id: 'record:1',
    state: 'A3',
    previous: attributable,
    evidence: ['verifier:independent-review']
  });
  assert.equal(independentlyVerified.previous_state, 'A1');
  assert.equal(independentlyVerified.state, 'A3');
  assert.throws(
    () => createAssertionEvent({
      ladder: ASSURANCE_LADDER,
      subject_id: 'record:1',
      state: 'A2',
      previous: independentlyVerified
    }),
    error => error instanceof AssertionLadderError && error.code === 'NON_MONOTONIC_TRANSITION'
  );
});

test('policy declares assurance tier and caller override is denied', () => {
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

test('public ordering and value settlement remain separate from assurance', () => {
  assert.equal(canRenderAs(PUBLIC_ORDERING_LADDER, 'unanchored', 'anchored'), false);
  assert.equal(canRenderAs(PUBLIC_ORDERING_LADDER, 'anchored', 'unanchored'), true);
  const composed = composeAssuranceState({
    assurance: 'A3',
    public_ordering: 'anchored',
    value_settlement: 'not_submitted'
  });
  assert.deepEqual(composed, {
    schema: 'axiom-composed-assurance-state.v1',
    assurance: 'A3',
    public_ordering: 'anchored',
    value_settlement: 'not_submitted'
  });
});

test('a shape-correct transaction identifier cannot advance settlement state by itself', () => {
  const local = createAssertionEvent({
    ladder: VALUE_SETTLEMENT_LADDER,
    subject_id: 'payment:1',
    state: 'not_submitted',
    metadata: { transaction_hash: `0x${'a'.repeat(64)}` }
  });
  assert.equal(canRenderAs(VALUE_SETTLEMENT_LADDER, local.state, 'confirmed'), false);
  assert.deepEqual(local.not_yet, ['submitted', 'confirmed', 'finalized']);
});

test('the generic ladder also represents capability state machines', () => {
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

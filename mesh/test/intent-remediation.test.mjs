import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIntentRemediationProposal,
  normalizeIntentRemediationProposal,
  remediationGovernanceAction,
  validateIntentRemediationProposalAgainstState
} from '../src/lib/intent-remediation.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);
const EVALUATED = '2026-08-10T20:00:00.000Z';
const CREATED = '2026-08-10T20:00:01.000Z';

function actions() {
  return [
    {
      action: 'repo.code.modify',
      decision: 'autonomous',
      reason: 'autonomous',
      triggered_by: ['INV-SAFETY']
    },
    {
      action: 'repo.production.promote',
      decision: 'approval_required',
      reason: 'approval_required',
      triggered_by: ['OBJ-DELIVERY']
    },
    {
      action: 'tests.weaken-for-pass',
      decision: 'deny',
      reason: 'forbidden',
      triggered_by: ['INV-SAFETY']
    }
  ];
}

function governanceState({ proposedActions = actions(), state = 'blocked' } = {}) {
  return {
    schema: 'axiom-intent-governance-state.v1',
    contract_id: 'fixture-intent',
    activation_digest: A,
    contract_digest: B,
    graph_digest: C,
    build: { build_digest: D },
    assessment: {
      evaluated_at: EVALUATED,
      source_assessment_digest: E
    },
    reconciliation: {
      state,
      reconciliation_digest: F,
      violations: ['INV-SAFETY'],
      unknowns: ['OBJ-DELIVERY'],
      proposed_actions: proposedActions
    },
    execution_authorized: false
  };
}

function fullState({ proposedActions = actions(), assessmentDigest = E, reconciliationDigest = F } = {}) {
  return {
    schema: 'axiom-intent-grid-state.v1',
    activation: {
      contract_id: 'fixture-intent',
      activation_digest: A,
      contract_digest: B,
      graph_digest: C,
      build: { build_digest: D }
    },
    assessment: {
      evaluated_at: EVALUATED,
      assessment_digest: assessmentDigest
    },
    reconciliation: {
      state: 'blocked',
      reconciliation_digest: reconciliationDigest,
      violations: ['INV-SAFETY'],
      unknowns: ['OBJ-DELIVERY'],
      proposed_actions: proposedActions
    },
    execution_authorized: false
  };
}

test('remediation proposal is deterministic, content-addressed, and explicitly non-executing', () => {
  const first = buildIntentRemediationProposal(governanceState(), {
    creator: 'human:operator',
    created_at: CREATED,
    expires_at: '2026-08-11T20:00:00.000Z'
  });
  const reordered = governanceState({ proposedActions: actions().reverse() });
  const second = buildIntentRemediationProposal(reordered, {
    creator: 'human:operator',
    created_at: CREATED,
    expires_at: '2026-08-11T20:00:00.000Z'
  });
  assert.equal(first.remediation_proposal_digest, second.remediation_proposal_digest);
  assert.equal(first.remediation_proposal_id, second.remediation_proposal_id);
  assert.equal(first.execution_authorized, false);
  assert.deepEqual(first.actions.map(item => item.decision), [
    'autonomous',
    'approval_required',
    'deny'
  ]);
  assert.equal(normalizeIntentRemediationProposal(first).basis_digest, first.basis_digest);
});

test('denied actions cannot be cherry-picked out of a proposal that claims the current state', () => {
  const incompleteState = governanceState({
    proposedActions: actions().filter(item => item.decision !== 'deny')
  });
  const incomplete = buildIntentRemediationProposal(incompleteState, {
    creator: 'human:operator',
    created_at: CREATED
  });
  assert.throws(
    () => validateIntentRemediationProposalAgainstState(
      incomplete,
      fullState(),
      { actor: 'human:operator', now: CREATED }
    ),
    /no longer matches the current authenticated Intent state/
  );
});

test('stale assessment or reconciliation digests invalidate remediation proposal', () => {
  const proposal = buildIntentRemediationProposal(governanceState(), {
    creator: 'human:operator',
    created_at: CREATED
  });
  assert.throws(
    () => validateIntentRemediationProposalAgainstState(
      proposal,
      fullState({ assessmentDigest: '1'.repeat(64) }),
      { actor: 'human:operator', now: CREATED }
    ),
    /no longer matches/
  );
  assert.throws(
    () => validateIntentRemediationProposalAgainstState(
      proposal,
      fullState({ reconciliationDigest: '2'.repeat(64) }),
      { actor: 'human:operator', now: CREATED }
    ),
    /no longer matches/
  );
});

test('creator binding and converged-state prohibition fail closed', () => {
  const proposal = buildIntentRemediationProposal(governanceState(), {
    creator: 'human:operator',
    created_at: CREATED
  });
  assert.throws(
    () => validateIntentRemediationProposalAgainstState(
      proposal,
      fullState(),
      { actor: 'human:other', now: CREATED }
    ),
    /creator must match/
  );
  assert.throws(
    () => buildIntentRemediationProposal(governanceState({ state: 'converged' }), {
      creator: 'human:operator',
      created_at: CREATED
    }),
    /converged Intent state has no remediation proposal/
  );
});

test('governance action records ratification only and cannot imply execution', () => {
  const proposal = buildIntentRemediationProposal(governanceState(), {
    creator: 'human:operator',
    created_at: CREATED
  });
  const action = remediationGovernanceAction(proposal);
  assert.equal(action.type, 'record.decision');
  assert.equal(action.payload.record_kind, 'intent.remediation.proposed');
  assert.equal(action.payload.remediation.execution_authorized, false);
  assert.match(action.rollback.description, /no remediation action is executed/i);
});

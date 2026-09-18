import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOperationCandidateSelectionProposal,
  validateOperationCandidateSelectionProposal,
  verifyOperationCandidateSelectionProposal
} from '../src/lib/operation-candidate-selection.mjs';

const A = 'a'.repeat(64);
const F = 'f'.repeat(64);

function candidate(operationId, manifestDigest, { deterministicMatch = false } = {}) {
  return {
    operationId,
    manifestDigest,
    eligible: true,
    eligibilityReason: 'eligible',
    deterministicMatch
  };
}

function policy(overrides = {}) {
  return {
    minimumSupport: 0.55,
    singleSelectSupport: 0.9,
    topK: 1,
    contextBudget: 1,
    fallbackBehavior: 'retain-eligible',
    ...overrides
  };
}

function trustedInput(overrides = {}) {
  return {
    taskPurposeDigest: F,
    candidates: [candidate('operation.primary', A, { deterministicMatch: true })],
    semanticEvidence: [],
    policy: policy(),
    ...overrides
  };
}

test('untrusted selection proposals require exact trusted-input recomputation', () => {
  const input = trustedInput();
  const proposal = createOperationCandidateSelectionProposal(input);

  assert.throws(
    () => validateOperationCandidateSelectionProposal(proposal),
    /trusted inputs are required/i
  );
  assert.equal(
    validateOperationCandidateSelectionProposal(proposal, input).trusted_input_match,
    true
  );
  assert.equal(
    verifyOperationCandidateSelectionProposal(proposal, input).trusted_input_match,
    true
  );

  const changed = trustedInput({
    candidates: [candidate('operation.other', A, { deterministicMatch: true })]
  });
  assert.throws(
    () => validateOperationCandidateSelectionProposal(proposal, changed),
    /does not match trusted inputs/i
  );
});

test('malformed cyclic semantic evidence is classified invalid before bounded input hashing', () => {
  const primary = candidate('operation.primary', A);
  const cyclicObservation = {};
  cyclicObservation.self = cyclicObservation;

  const result = createOperationCandidateSelectionProposal({
    taskPurposeDigest: F,
    candidates: [primary],
    semanticEvidence: [{
      operationId: primary.operationId,
      manifestDigest: primary.manifestDigest,
      observation: cyclicObservation,
      providerProfile: {},
      questionSchema: {}
    }],
    policy: policy()
  });

  assert.equal(result.selection_mode, 'fallback-retain-eligible');
  assert.deepEqual(result.uncertainty_reasons, ['invalid-semantic-evidence']);
  assert.deepEqual(result.selected.map(item => item.operation_id), ['operation.primary']);
  assert.equal(result.validated_semantic_evidence.length, 0);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject, ValidationError } from '../src/lib/canonical.mjs';
import { PolicyEngine } from '../src/lib/policy.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';
import {
  COGNITIVE_SELECTION_AUTHORIZATION_ACTION,
  COGNITIVE_SELECTION_AUTHORIZATION_DECISION_SCHEMA,
  COGNITIVE_SELECTION_AUTHORIZATION_OUTPUT_SCHEMA,
  buildCognitiveSelectionAuthorizationIntent,
  buildCognitiveSelectionAuthorizationOutput,
  validateCognitiveSelectionAuthorizationResult
} from '../src/lib/cognitive-selection-authorization.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);
const DIGEST_E = 'e'.repeat(64);
const DIGEST_F = 'f'.repeat(64);

function validProposal(overrides = {}) {
  const proposal = {
    valid: true,
    schema: 'axiom-cognitive-selection-proposal.v0',
    version: 0,
    status: 'inert-selection-proposal',
    request_id: 'eligibility.authz.request',
    request_digest: DIGEST_A,
    policy_id: 'cognitive.selection.policy.authz',
    policy_digest: DIGEST_B,
    eligibility_report_digest: DIGEST_C,
    evaluated_profiles: 1,
    eligible_profiles: 1,
    rejected_profiles: [],
    ranked_candidates: [{
      rank: 1,
      profile_id: 'cognitive.example.local',
      offering_ref: 'local/model-example',
      profile_digest: DIGEST_D,
      criterion_values: [{ field: 'economics.cost_class', value: 'low' }]
    }],
    recommendation_made: true,
    recommended_profile_id: 'cognitive.example.local',
    recommended_profile_digest: DIGEST_D,
    ranking_applied: true,
    winner_selected: false,
    requires_gateway_authorization: true,
    execution_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'proposal-only'
  };
  return { ...proposal, ...overrides };
}

function validCompletedResult(proposal = validProposal()) {
  const output = buildCognitiveSelectionAuthorizationOutput(proposal);
  return {
    ...output,
    intent_id: `intent_${DIGEST_E}`,
    trace_id: 'trace_authorization_example',
    status: 'completed',
    evidence: {
      plan_digest: DIGEST_A,
      invocation_digest: DIGEST_B,
      capability_consumption_receipt_digest: DIGEST_C,
      effect_destination: 'local',
      execution_digest: digestObject({ output }),
      policy_digest: DIGEST_F
    }
  };
}

test('builds an inert gateway intent bound to the exact proposal', () => {
  const proposal = validProposal();
  const intent = buildCognitiveSelectionAuthorizationIntent(proposal, {
    purpose: 'operator-cognitive-selection',
    confirmations: ['confirm:cognitive.selection.authorize'],
    approval_ids: ['approval_example']
  });

  assert.equal(COGNITIVE_SELECTION_AUTHORIZATION_ACTION, 'cognitive.selection.authorize');
  assert.deepEqual(intent, {
    action: 'cognitive.selection.authorize',
    input: { proposal },
    purpose: 'operator-cognitive-selection',
    data_scopes: [],
    confirmations: ['confirm:cognitive.selection.authorize'],
    approval_ids: ['approval_example']
  });
  assert.notStrictEqual(intent.input.proposal, proposal);
  assert.deepEqual(proposal, validProposal());
});

test('rejects proposal boundary widening before creating an authorization intent', () => {
  for (const proposal of [
    validProposal({ winner_selected: true }),
    validProposal({ runtime_activation: true }),
    validProposal({ authority_effect: 'grant' }),
    validProposal({ network_effect: 'provider-egress' }),
    validProposal({ credential_visibility: 'provider' }),
    validProposal({ selection_effect: 'winner' }),
    validProposal({ requires_gateway_authorization: false })
  ]) {
    assert.throws(
      () => buildCognitiveSelectionAuthorizationIntent(proposal),
      ValidationError
    );
  }
});

test('rejects proposals without an exact recommendation to authorize', () => {
  assert.throws(
    () => buildCognitiveSelectionAuthorizationIntent(validProposal({
      recommendation_made: false,
      recommended_profile_id: null,
      recommended_profile_digest: null,
      ranked_candidates: []
    })),
    /recommendation/
  );
});

test('sandbox authorization builtin produces output only and never a mutation or query', () => {
  const proposal = validProposal();
  const intent = {
    action: COGNITIVE_SELECTION_AUTHORIZATION_ACTION,
    input: { proposal },
    principal: { id: 'principal.operator' }
  };
  const result = executeBuiltin({
    tool: 'builtin.cognitive-selection-authorize',
    intent
  });

  assert.deepEqual(result, {
    output: buildCognitiveSelectionAuthorizationOutput(proposal)
  });
  assert.equal(Object.hasOwn(result, 'mutation'), false);
  assert.equal(Object.hasOwn(result, 'query'), false);
  assert.equal(result.output.schema, COGNITIVE_SELECTION_AUTHORIZATION_OUTPUT_SCHEMA);
  assert.equal(result.output.selection_effect, 'authorization-output-only');
  assert.equal(result.output.selection_applied, false);
  assert.equal(result.output.cognitive_execution_authorized, false);
  assert.equal(result.output.provider_invocation_authorized, false);
  assert.equal(result.output.network_effect, 'none');
  assert.equal(result.output.credential_visibility, 'none');
  assert.equal(result.output.runtime_activation, false);
});

test('active policy exposes a scope-gated side-effect-free selection authorization action', async () => {
  const policy = JSON.parse(await readFile(new URL('../config/policy.json', import.meta.url), 'utf8'));
  const rule = policy.actions[COGNITIVE_SELECTION_AUTHORIZATION_ACTION];
  assert.deepEqual(rule, {
    decision: 'allow',
    risk: 'medium',
    required_scopes: ['cognitive:select'],
    tool: 'builtin.cognitive-selection-authorize'
  });

  const engine = new PolicyEngine(policy);
  const intent = { confirmations: [] };
  const denied = engine.evaluate({
    action: COGNITIVE_SELECTION_AUTHORIZATION_ACTION,
    principal: { id: 'principal.no-scope', scopes: [] },
    intent
  });
  assert.equal(denied.allow, false);
  assert.equal(denied.code, 'insufficient_scope');

  const allowed = engine.evaluate({
    action: COGNITIVE_SELECTION_AUTHORIZATION_ACTION,
    principal: { id: 'principal.with-scope', scopes: ['cognitive:select'] },
    intent
  });
  assert.equal(allowed.allow, true);
  assert.equal(allowed.risk, 'medium');
  assert.equal(allowed.tool, 'builtin.cognitive-selection-authorize');
  assert.equal(allowed.requires_independent_approval, false);
});

test('validates a completed gateway authorization result into a non-executing selection decision', () => {
  const proposal = validProposal();
  const result = validCompletedResult(proposal);
  const decision = validateCognitiveSelectionAuthorizationResult(result, proposal);

  assert.equal(decision.valid, true);
  assert.equal(decision.schema, COGNITIVE_SELECTION_AUTHORIZATION_DECISION_SCHEMA);
  assert.equal(decision.version, 0);
  assert.equal(decision.status, 'authorized');
  assert.equal(decision.authorization_intent_completed, true);
  assert.equal(decision.proposal_digest, digestObject(proposal));
  assert.equal(decision.recommended_profile_id, proposal.recommended_profile_id);
  assert.equal(decision.recommended_profile_digest, proposal.recommended_profile_digest);
  assert.equal(decision.intent_id, result.intent_id);
  assert.equal(decision.trace_id, result.trace_id);
  assert.equal(decision.policy_digest, DIGEST_F);
  assert.equal(decision.effect_destination, 'local');
  assert.equal(decision.selection_authorized, true);
  assert.equal(decision.selection_applied, false);
  assert.equal(decision.cognitive_execution_authorized, false);
  assert.equal(decision.provider_invocation_authorized, false);
  assert.equal(decision.network_effect, 'none');
  assert.equal(decision.credential_visibility, 'none');
  assert.equal(decision.runtime_activation, false);
  assert.match(decision.gateway_contract_digest, /^[a-f0-9]{64}$/);
  assert.match(decision.authorization_evidence_digest, /^[a-f0-9]{64}$/);
  assert.match(decision.decision_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.evidence), true);
});

test('fails closed when completed evidence is not bound to the exact authorization output', () => {
  const proposal = validProposal();
  const tampered = validCompletedResult(proposal);
  tampered.recommended_profile_id = 'cognitive.example.other';
  assert.throws(
    () => validateCognitiveSelectionAuthorizationResult(tampered, proposal),
    /authorization output|recommendation|execution digest/
  );
});

test('fails closed on incomplete, remote-effect, or malformed gateway authorization evidence', () => {
  const proposal = validProposal();
  const incomplete = validCompletedResult(proposal);
  incomplete.status = 'pending';
  assert.throws(
    () => validateCognitiveSelectionAuthorizationResult(incomplete, proposal),
    /completed/
  );

  const remote = validCompletedResult(proposal);
  remote.evidence.effect_destination = 'provider-remote';
  assert.throws(
    () => validateCognitiveSelectionAuthorizationResult(remote, proposal),
    /local/
  );

  const badPolicyDigest = validCompletedResult(proposal);
  badPolicyDigest.evidence.policy_digest = 'not-a-digest';
  assert.throws(
    () => validateCognitiveSelectionAuthorizationResult(badPolicyDigest, proposal),
    ValidationError
  );
});

test('authorization contract source contains no network, credential, provider, or process execution surface', async () => {
  const source = await readFile(
    new URL('../src/lib/cognitive-selection-authorization.mjs', import.meta.url),
    'utf8'
  );
  for (const forbidden of [
    'node:fs',
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'node:dns',
    'node:child_process',
    'node:worker_threads',
    'provider-runtime',
    'transport-credentials',
    'credentialStore',
    'credentialProvider',
    'wallet',
    'secret',
    'signedFetch',
    'fetch('
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden authorization surface: ${forbidden}`);
  }
  assert.equal(source.includes("'./canonical.mjs'"), true);
  assert.equal(source.includes("'./cognitive-selection-proposal.mjs'"), true);
  assert.equal(source.includes("'./gateway-client-contract.mjs'"), true);
});

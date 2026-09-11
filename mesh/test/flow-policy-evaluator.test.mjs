import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { canonicalJson } from '../src/lib/canonical.mjs';
import {
  FLOW_CONTEXT_SCHEMA,
  contractDigest,
  verifyFlowContext
} from '../src/lib/agent-containment-contracts.mjs';
import {
  deriveFlowContext,
  evaluateProtectedEgress
} from '../src/lib/flow-policy-evaluator.mjs';

const POLICY = `sha256:${'1'.repeat(64)}`;
const ALT_POLICY = `sha256:${'9'.repeat(64)}`;
const SOURCE_A = `sha256:${'a'.repeat(64)}`;
const SOURCE_B = `sha256:${'b'.repeat(64)}`;
const SOURCE_C = `sha256:${'c'.repeat(64)}`;
const SURROGATE = `sha256:${'6'.repeat(64)}`;
const APPROVAL = `sha256:${'7'.repeat(64)}`;
const T0 = '2026-09-10T18:00:00.000Z';
const T1 = '2026-09-10T18:01:00.000Z';

function signedFlow(overrides = {}) {
  const raw = {
    schema: FLOW_CONTEXT_SCHEMA,
    flow_context_id: 'flow:parent',
    principal: 'principal:agent',
    runtime_identity: 'runtime:parent',
    root_task_id: 'task:root',
    parent_flow_contexts: [],
    lineage_depth: 0,
    observed_data_classes: ['public'],
    observed_authority_classes: [],
    owner_or_domain_scopes: ['owner:a'],
    purpose_scopes: ['research'],
    source_commitments: [SOURCE_A],
    created_at: T0,
    updated_at: T0,
    policy_profile_digest: POLICY,
    ...overrides
  };
  return { ...raw, flow_digest: contractDigest(raw, 'flow_digest') };
}

function childInput(parents, overrides = {}) {
  return {
    id: 'flow:child',
    principal: 'principal:agent',
    runtime_identity: 'runtime:child',
    root_task_id: 'task:root',
    parents,
    observed_data_classes: [],
    observed_authority_classes: [],
    owner_or_domain_scopes: [],
    purpose_scopes: [],
    source_commitments: [],
    created_at: T1,
    updated_at: T1,
    policy_profile_digest: POLICY,
    ...overrides
  };
}

function egressRequest(overrides = {}) {
  return {
    schema: 'axiom-flow-egress-request.v0',
    action: 'document.read',
    provider_or_connector: 'connector:fixture',
    destination: 'https://example.invalid/api',
    purpose: 'research',
    requires_credential: false,
    ...overrides
  };
}

function egressPolicy(overrides = {}) {
  return {
    schema: 'axiom-flow-egress-policy.v0',
    policy_profile_digest: POLICY,
    allowed_actions: ['document.read'],
    allowed_providers_or_connectors: ['connector:fixture'],
    allowed_destinations: ['https://example.invalid/api'],
    allowed_purposes: ['research'],
    allowed_data_classes: ['public'],
    approval_required_for_data_classes: [],
    credential_surrogate_required: false,
    ...overrides
  };
}

function decision(flow, request = egressRequest(), policy = egressPolicy()) {
  return evaluateProtectedEgress({ flow_context: flow, request, policy });
}

test('a child cannot shed an owner-private restriction inherited from its parent', () => {
  const parent = signedFlow({ observed_data_classes: ['owner_private'] });
  const child = deriveFlowContext(childInput([parent], {
    observed_data_classes: ['public']
  }));
  assert.deepEqual(child.observed_data_classes, ['owner_private', 'public']);
  assert.equal(child.lineage_depth, 1);
  assert.deepEqual(child.parent_flow_contexts, [{
    flow_context_id: parent.flow_context_id,
    flow_digest: parent.flow_digest
  }]);
  assert.equal(verifyFlowContext(child).flow_digest, child.flow_digest);
});

test('multi-parent composition unions restrictions instead of selecting a least-restrictive parent', () => {
  const first = signedFlow({
    flow_context_id: 'flow:first',
    observed_data_classes: ['public'],
    owner_or_domain_scopes: ['owner:a'],
    purpose_scopes: ['research'],
    source_commitments: [SOURCE_A]
  });
  const second = signedFlow({
    flow_context_id: 'flow:second',
    observed_data_classes: ['secret'],
    observed_authority_classes: ['credential'],
    owner_or_domain_scopes: ['owner:b'],
    purpose_scopes: ['support'],
    source_commitments: [SOURCE_B]
  });
  const child = deriveFlowContext(childInput([first, second], {
    observed_data_classes: ['shared_private'],
    owner_or_domain_scopes: ['owner:c'],
    purpose_scopes: ['analysis'],
    source_commitments: [SOURCE_C]
  }));
  assert.deepEqual(child.observed_data_classes, ['public', 'secret', 'shared_private']);
  assert.deepEqual(child.observed_authority_classes, ['credential']);
  assert.deepEqual(child.owner_or_domain_scopes, ['owner:a', 'owner:b', 'owner:c']);
  assert.deepEqual(child.purpose_scopes, ['analysis', 'research', 'support']);
  assert.deepEqual(child.source_commitments, [SOURCE_A, SOURCE_B, SOURCE_C]);
});

test('runtime replacement cannot reset inherited restrictions', () => {
  const parent = signedFlow({
    runtime_identity: 'runtime:old',
    observed_data_classes: ['regulated_or_restricted'],
    observed_authority_classes: ['authentication_factor']
  });
  const child = deriveFlowContext(childInput([parent], {
    runtime_identity: 'runtime:new'
  }));
  assert.equal(child.runtime_identity, 'runtime:new');
  assert.deepEqual(child.observed_data_classes, ['regulated_or_restricted']);
  assert.deepEqual(child.observed_authority_classes, ['authentication_factor']);
});

test('set-like restrictions are duplicate-free and deterministically code-unit sorted', () => {
  const first = signedFlow({
    flow_context_id: 'flow:z',
    observed_data_classes: ['public', 'secret'],
    owner_or_domain_scopes: ['owner:z', 'owner:a'],
    purpose_scopes: ['zeta', 'alpha'],
    source_commitments: [SOURCE_B, SOURCE_A]
  });
  const second = signedFlow({
    flow_context_id: 'flow:a',
    observed_data_classes: ['secret'],
    owner_or_domain_scopes: ['owner:a'],
    purpose_scopes: ['alpha'],
    source_commitments: [SOURCE_A]
  });
  const child = deriveFlowContext(childInput([first, second], {
    observed_data_classes: ['public'],
    owner_or_domain_scopes: ['owner:z'],
    purpose_scopes: ['zeta'],
    source_commitments: [SOURCE_B]
  }));
  assert.deepEqual(child.observed_data_classes, ['public', 'secret']);
  assert.deepEqual(child.owner_or_domain_scopes, ['owner:a', 'owner:z']);
  assert.deepEqual(child.purpose_scopes, ['alpha', 'zeta']);
  assert.deepEqual(child.source_commitments, [SOURCE_A, SOURCE_B]);
  assert.deepEqual(child.parent_flow_contexts.map(item => item.flow_context_id), ['flow:z', 'flow:a']);
});

test('all parents must bind the same root task and policy profile', () => {
  const valid = signedFlow({ flow_context_id: 'flow:valid' });
  const wrongTask = signedFlow({ flow_context_id: 'flow:task', root_task_id: 'task:other' });
  const wrongPolicy = signedFlow({
    flow_context_id: 'flow:policy',
    policy_profile_digest: ALT_POLICY
  });
  assert.throws(() => deriveFlowContext(childInput([valid, wrongTask])), /root task|root_task/i);
  assert.throws(() => deriveFlowContext(childInput([valid, wrongPolicy])), /policy/i);
});

test('parent and lineage ceilings fail closed', () => {
  const nineParents = Array.from({ length: 9 }, (_, index) => signedFlow({
    flow_context_id: `flow:${index}`,
    source_commitments: [`sha256:${String(index).padStart(64, '0')}`]
  }));
  assert.throws(() => deriveFlowContext(childInput(nineParents)), /parent/i);

  const depth16 = signedFlow({
    flow_context_id: 'flow:depth16',
    lineage_depth: 16
  });
  assert.throws(() => deriveFlowContext(childInput([depth16])), /lineage/i);
});

test('invalid parent digests fail before composition', () => {
  const parent = signedFlow();
  assert.throws(() => deriveFlowContext(childInput([{
    ...parent,
    flow_digest: `sha256:${'f'.repeat(64)}`
  }])), /digest/i);
});

test('root FlowContext derivation is deterministic and verified', () => {
  const input = childInput([], {
    observed_data_classes: ['public'],
    owner_or_domain_scopes: ['owner:a'],
    purpose_scopes: ['research'],
    source_commitments: [SOURCE_A]
  });
  const first = deriveFlowContext(input);
  const second = deriveFlowContext({
    ...input,
    observed_data_classes: ['public'],
    source_commitments: [SOURCE_A]
  });
  assert.equal(first.lineage_depth, 0);
  assert.deepEqual(first.parent_flow_contexts, []);
  assert.equal(first.flow_digest, second.flow_digest);
  assert.equal(verifyFlowContext(first).flow_digest, first.flow_digest);
});

test('public exact policy allows only as non-authorizing eligibility evidence', () => {
  const result = decision(signedFlow());
  assert.equal(result.decision, 'allow');
  assert.deepEqual(result.reason_codes, ['allow']);
  assert.equal(result.schema, 'axiom-flow-evaluation.v0');
  assert.equal(Object.isFrozen(result), true);
});

test('owner-private data is denied by public-only policy and allowed only by an explicit compatible policy', () => {
  const flow = signedFlow({ observed_data_classes: ['owner_private'] });
  assert.deepEqual(decision(flow).reason_codes, ['data_class_not_allowed']);
  assert.deepEqual(decision(flow, egressRequest(), egressPolicy({
    allowed_data_classes: ['owner_private', 'public']
  })).reason_codes, ['allow']);
});

test('authority-bearing material always makes protected egress ineligible', () => {
  const flow = signedFlow({ observed_authority_classes: ['credential'] });
  assert.deepEqual(decision(flow).reason_codes, ['authority_bearing_material_observed']);
});

test('action provider destination and purpose must each match exactly', () => {
  const flow = signedFlow();
  assert.deepEqual(decision(flow, egressRequest({ action: 'document.write' })).reason_codes, ['action_not_allowed']);
  assert.deepEqual(decision(flow, egressRequest({ provider_or_connector: 'connector:other' })).reason_codes, ['provider_not_allowed']);
  assert.deepEqual(decision(flow, egressRequest({ destination: 'https://other.invalid/api' })).reason_codes, ['destination_not_allowed']);
  assert.deepEqual(decision(flow, egressRequest({ purpose: 'other' })).reason_codes, ['purpose_not_allowed']);
});

test('credential-surrogate requirement is explicit and digest presence is sufficient only for that gate', () => {
  const flow = signedFlow();
  const policy = egressPolicy({ credential_surrogate_required: true });
  const required = egressRequest({ requires_credential: true });
  assert.deepEqual(decision(flow, required, policy).reason_codes, ['credential_surrogate_required']);
  assert.deepEqual(decision(flow, {
    ...required,
    credential_surrogate_digest: SURROGATE
  }, policy).reason_codes, ['allow']);
});

test('private classes can require a separate approval-challenge digest', () => {
  const flow = signedFlow({ observed_data_classes: ['owner_private'] });
  const policy = egressPolicy({
    allowed_data_classes: ['owner_private'],
    approval_required_for_data_classes: ['owner_private']
  });
  assert.deepEqual(decision(flow, egressRequest(), policy).reason_codes, ['approval_required']);
  assert.deepEqual(decision(flow, egressRequest({ approval_challenge_digest: APPROVAL }), policy).reason_codes, ['allow']);
});

test('policy profile mismatch denies before every weaker eligibility reason', () => {
  const flow = signedFlow({
    observed_data_classes: ['secret'],
    observed_authority_classes: ['credential']
  });
  const request = egressRequest({
    action: 'document.write',
    provider_or_connector: 'connector:other',
    destination: 'https://other.invalid/api',
    purpose: 'other',
    requires_credential: true
  });
  const policy = egressPolicy({
    policy_profile_digest: ALT_POLICY,
    approval_required_for_data_classes: ['secret'],
    credential_surrogate_required: true
  });
  assert.deepEqual(decision(flow, request, policy).reason_codes, [
    'policy_profile_mismatch',
    'authority_bearing_material_observed',
    'action_not_allowed',
    'provider_not_allowed',
    'destination_not_allowed',
    'purpose_not_allowed',
    'data_class_not_allowed',
    'credential_surrogate_required',
    'approval_required'
  ]);
});

test('request and policy validation are closed, bounded, exact, and deterministic', () => {
  const flow = signedFlow();
  assert.throws(() => decision(flow, { ...egressRequest(), surprise: true }), /unsupported|unknown/i);
  assert.throws(() => decision(flow, egressRequest(), { ...egressPolicy(), surprise: true }), /unsupported|unknown/i);
  assert.throws(() => decision(flow, egressRequest({ action: '*' })), /wildcard|glob|exact/i);
  assert.throws(() => decision(flow, egressRequest(), egressPolicy({ allowed_destinations: ['https://*.invalid/api'] })), /wildcard|glob|exact/i);
  assert.throws(() => decision(flow, egressRequest(), egressPolicy({ allowed_actions: [] })), /empty|at least one/i);
  assert.throws(() => decision(flow, egressRequest(), egressPolicy({ allowed_actions: ['document.read', 'document.read'] })), /duplicate/i);
  assert.throws(() => decision(flow, egressRequest(), egressPolicy({ allowed_data_classes: ['unknown'] })), /data class/i);
  const first = decision(flow);
  const second = decision(flow);
  assert.equal(canonicalJson(first), canonicalJson(second));
});

test('language-neutral evaluator vectors cover the required matrix deterministically', async () => {
  const url = new URL('../fixtures/agent-containment/flow-evaluator-v0.vectors.json', import.meta.url);
  const corpus = JSON.parse(await readFile(url, 'utf8'));
  assert.equal(corpus.schema, 'axiom-flow-evaluator-vectors.v0');
  assert.equal(corpus.vectors.length, 13);

  const names = new Set(corpus.vectors.map(vector => vector.name));
  assert.equal(names.size, corpus.vectors.length);
  for (const requiredName of [
    'public-exact-allow',
    'private-compatible-allow',
    'policy-profile-mismatch',
    'authority-bearing-material',
    'action-not-allowed',
    'provider-not-allowed',
    'destination-not-allowed',
    'purpose-not-allowed',
    'data-class-not-allowed',
    'credential-surrogate-required',
    'approval-required',
    'two-parent-restriction-union',
    'runtime-replacement-retains-restriction'
  ]) {
    assert.equal(names.has(requiredName), true, requiredName);
  }

  const coveredReasons = new Set();
  for (const vector of corpus.vectors) {
    const input = {
      flow_context: vector.flow_context,
      request: vector.request,
      policy: vector.policy
    };
    const first = evaluateProtectedEgress(input);
    const second = evaluateProtectedEgress(input);
    assert.equal(first.decision, vector.expected.decision, vector.name);
    assert.deepEqual(first.reason_codes, vector.expected.reason_codes, vector.name);
    assert.equal(canonicalJson(first), canonicalJson(second), vector.name);
    for (const reason of vector.expected.reason_codes) coveredReasons.add(reason);
  }

  assert.deepEqual([...coveredReasons].sort(), [
    'action_not_allowed',
    'allow',
    'approval_required',
    'authority_bearing_material_observed',
    'credential_surrogate_required',
    'data_class_not_allowed',
    'destination_not_allowed',
    'policy_profile_mismatch',
    'provider_not_allowed',
    'purpose_not_allowed'
  ]);
  const union = corpus.vectors.find(vector => vector.name === 'two-parent-restriction-union');
  assert.equal(union.flow_context.parent_flow_contexts.length, 2);
  assert.deepEqual(union.flow_context.observed_data_classes, ['owner_private', 'public']);
  const replacement = corpus.vectors.find(vector => vector.name === 'runtime-replacement-retains-restriction');
  assert.equal(replacement.flow_context.runtime_identity, 'runtime:new');
  assert.deepEqual(replacement.flow_context.observed_data_classes, ['owner_private']);
});

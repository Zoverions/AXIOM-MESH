import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FLOW_CONTEXT_SCHEMA,
  contractDigest,
  verifyFlowContext
} from '../src/lib/agent-containment-contracts.mjs';
import { deriveFlowContext } from '../src/lib/flow-policy-evaluator.mjs';

const POLICY = `sha256:${'1'.repeat(64)}`;
const SOURCE_A = `sha256:${'a'.repeat(64)}`;
const SOURCE_B = `sha256:${'b'.repeat(64)}`;
const SOURCE_C = `sha256:${'c'.repeat(64)}`;
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
    policy_profile_digest: `sha256:${'9'.repeat(64)}`
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

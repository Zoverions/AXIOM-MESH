import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as contracts from '../src/lib/agent-containment-contracts.mjs';
import * as evaluator from '../src/lib/flow-policy-evaluator.mjs';
import {
  FLOW_CONTEXT_SCHEMA,
  FLOW_RECEIPT_SCHEMA,
  contractDigest,
  verifyFlowReceipt
} from '../src/lib/agent-containment-contracts.mjs';
import {
  deriveFlowContext,
  evaluateProtectedEgress
} from '../src/lib/flow-policy-evaluator.mjs';

const POLICY = `sha256:${'1'.repeat(64)}`;
const SOURCE = `sha256:${'a'.repeat(64)}`;
const SURROGATE = `sha256:${'6'.repeat(64)}`;
const APPROVAL = `sha256:${'7'.repeat(64)}`;
const T0 = '2026-09-10T18:00:00.000Z';
const T1 = '2026-09-10T18:01:00.000Z';

function signedFlow(overrides = {}) {
  const raw = {
    schema: FLOW_CONTEXT_SCHEMA,
    flow_context_id: 'flow:boundary',
    principal: 'principal:agent',
    runtime_identity: 'runtime:fixture',
    root_task_id: 'task:root',
    parent_flow_contexts: [],
    lineage_depth: 0,
    observed_data_classes: ['public'],
    observed_authority_classes: [],
    owner_or_domain_scopes: ['owner:fixture'],
    purpose_scopes: ['research'],
    source_commitments: [SOURCE],
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

function request(overrides = {}) {
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

function policy(overrides = {}) {
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

function evaluate(flow, requestOverrides = {}, policyOverrides = {}) {
  return evaluateProtectedEgress({
    flow_context: flow,
    request: request(requestOverrides),
    policy: policy(policyOverrides)
  });
}

test('private parent restrictions survive a public child', () => {
  const parent = signedFlow({ observed_data_classes: ['owner_private'] });
  const child = deriveFlowContext(childInput([parent], {
    observed_data_classes: ['public']
  }));
  assert.deepEqual(child.observed_data_classes, ['owner_private', 'public']);
});

test('authority-bearing parent restrictions survive a clean child', () => {
  const parent = signedFlow({ observed_authority_classes: ['credential'] });
  const child = deriveFlowContext(childInput([parent]));
  assert.deepEqual(child.observed_authority_classes, ['credential']);
  assert.deepEqual(evaluate(child).reason_codes, ['authority_bearing_material_observed']);
});

test('runtime replacement cannot reset inherited flow restrictions', () => {
  const parent = signedFlow({
    runtime_identity: 'runtime:old',
    observed_data_classes: ['regulated_or_restricted'],
    observed_authority_classes: ['authentication_factor']
  });
  const child = deriveFlowContext(childInput([parent], { runtime_identity: 'runtime:new' }));
  assert.equal(child.runtime_identity, 'runtime:new');
  assert.deepEqual(child.observed_data_classes, ['regulated_or_restricted']);
  assert.deepEqual(child.observed_authority_classes, ['authentication_factor']);
});

test('containment APIs expose no declassification or restriction-clearing primitive', () => {
  const exported = [...Object.keys(contracts), ...Object.keys(evaluator)];
  const forbidden = exported.filter(name => (
    /declass/i.test(name)
    || /redact.*clear/i.test(name)
    || /summar.*clear/i.test(name)
    || /clear.*(?:flow|restriction|taint|data|authority)/i.test(name)
    || /reset.*(?:flow|restriction|taint|data|authority)/i.test(name)
  ));
  assert.deepEqual(forbidden, []);
});

test('an allowed destination cannot override a disallowed data class', () => {
  const result = evaluate(signedFlow({ observed_data_classes: ['owner_private'] }));
  assert.equal(result.decision, 'deny');
  assert.deepEqual(result.reason_codes, ['data_class_not_allowed']);
});

test('a credential surrogate digest cannot override independent denials', () => {
  const flow = signedFlow({ observed_data_classes: ['owner_private'] });
  const result = evaluate(flow, {
    action: 'document.write',
    provider_or_connector: 'connector:other',
    destination: 'https://other.invalid/api',
    purpose: 'support',
    requires_credential: true,
    credential_surrogate_digest: SURROGATE
  }, {
    credential_surrogate_required: true
  });
  assert.equal(result.decision, 'deny');
  assert.deepEqual(result.reason_codes, [
    'action_not_allowed',
    'provider_not_allowed',
    'destination_not_allowed',
    'purpose_not_allowed',
    'data_class_not_allowed'
  ]);
});

test('an approval challenge digest cannot override independent denials', () => {
  const flow = signedFlow({ observed_data_classes: ['owner_private'] });
  const result = evaluate(flow, {
    action: 'document.write',
    destination: 'https://other.invalid/api',
    purpose: 'support',
    approval_challenge_digest: APPROVAL
  }, {
    approval_required_for_data_classes: ['owner_private']
  });
  assert.equal(result.decision, 'deny');
  assert.deepEqual(result.reason_codes, [
    'action_not_allowed',
    'destination_not_allowed',
    'purpose_not_allowed',
    'data_class_not_allowed'
  ]);
});

test('unknown data and authority classes fail before egress evaluation', () => {
  const unknownData = signedFlow({ observed_data_classes: ['future_unknown'] });
  const unknownAuthority = signedFlow({ observed_authority_classes: ['ambient_root'] });
  assert.throws(() => evaluate(unknownData), /data class/i);
  assert.throws(() => evaluate(unknownAuthority), /authority class/i);
});

test('missing or substituted flow digests fail before egress evaluation', () => {
  const flow = signedFlow();
  const { flow_digest: omitted, ...missing } = flow;
  assert.equal(typeof omitted, 'string');
  assert.throws(() => evaluate(missing), /flow_digest|missing required/i);
  assert.throws(() => evaluate({
    ...flow,
    flow_digest: `sha256:${'f'.repeat(64)}`
  }), /digest mismatch/i);
});

test('parent-count and lineage-depth ceilings remain fail closed', () => {
  const parents = Array.from({ length: 9 }, (_, index) => signedFlow({
    flow_context_id: `flow:${index}`
  }));
  assert.throws(() => deriveFlowContext(childInput(parents)), /parent count/i);
  const deepest = signedFlow({ lineage_depth: 16 });
  assert.throws(() => deriveFlowContext(childInput([deepest])), /lineage depth/i);
});

test('FlowReceipt rejects raw protected payload fields', () => {
  const raw = {
    schema: FLOW_RECEIPT_SCHEMA,
    receipt_id: 'receipt:boundary',
    flow_context_digest: signedFlow().flow_digest,
    principal: 'principal:agent',
    runtime_identity: 'runtime:fixture',
    data_class_summary: ['owner_private'],
    authority_class_summary: [],
    purpose: 'research',
    destination: 'https://example.invalid/api',
    provider_or_connector: 'connector:fixture',
    action: 'document.read',
    policy_profile_digest: POLICY,
    decision: 'deny',
    reason_codes: ['data_class_not_allowed'],
    evaluated_at: T1,
    raw_payload: 'protected-content-must-not-appear'
  };
  const receipt = { ...raw, receipt_digest: contractDigest(raw, 'receipt_digest') };
  assert.throws(() => verifyFlowReceipt(receipt), /unsupported field raw_payload/i);
});

test('wildcard and glob policy values cannot create ambient matching authority', () => {
  const flow = signedFlow();
  assert.throws(() => evaluate(flow, {}, { allowed_actions: ['document.*'] }), /wildcard|glob/i);
  assert.throws(() => evaluate(flow, {}, { allowed_providers_or_connectors: ['connector:*'] }), /wildcard|glob/i);
  assert.throws(() => evaluate(flow, {}, { allowed_destinations: ['https://*.invalid/api'] }), /wildcard|glob/i);
  assert.throws(() => evaluate(flow, {}, { allowed_purposes: ['*'] }), /wildcard|glob/i);
});

test('evaluator output carries eligibility evidence only and no authority-producing fields', () => {
  const result = evaluate(signedFlow());
  const forbiddenKey = /capability|grant|approval|prepared|credential|token|network|execute|effect/i;
  assert.deepEqual(Object.keys(result).filter(key => forbiddenKey.test(key)), []);
  assert.deepEqual(Object.keys(result).sort(), [
    'decision',
    'flow_context_digest',
    'policy_profile_digest',
    'reason_codes',
    'request_digest',
    'schema'
  ]);
});

test('containment production modules import only approved pure contract helpers', async () => {
  const files = [
    ['agent-containment-contracts.mjs', new Set(['./canonical.mjs'])],
    ['flow-policy-evaluator.mjs', new Set(['./canonical.mjs', './agent-containment-contracts.mjs'])]
  ];
  for (const [name, allowed] of files) {
    const source = await readFile(new URL(`../src/lib/${name}`, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
    assert.deepEqual(new Set(imports), allowed, name);
    assert.equal(/capabilities\.json|capability-registry|capabilityRegistry/.test(source), false, name);
  }
});

test('agent-containment fixtures are synthetic and contain no credential-shaped secrets', async () => {
  const source = await readFile(
    new URL('../fixtures/agent-containment/flow-evaluator-v0.vectors.json', import.meta.url),
    'utf8'
  );
  for (const pattern of [
    /ghp_[A-Za-z0-9]{20,}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /sk-[A-Za-z0-9]{20,}/,
    /Bearer\s+[A-Za-z0-9._-]{20,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
  ]) {
    assert.equal(pattern.test(source), false, String(pattern));
  }
});

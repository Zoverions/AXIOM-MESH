import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AUTHORITY_CLASSES,
  CREDENTIAL_SURROGATE_SCHEMA,
  DATA_CLASSES,
  FLOW_CONTEXT_SCHEMA,
  FLOW_RECEIPT_SCHEMA,
  TRUSTED_APPROVAL_CHALLENGE_SCHEMA,
  contractDigest,
  verifyCredentialSurrogate,
  verifyFlowContext,
  verifyFlowReceipt,
  verifyTrustedApprovalChallenge
} from '../src/lib/agent-containment-contracts.mjs';

const NOW = '2026-09-10T18:05:00.000Z';
const ISSUED = '2026-09-10T18:00:00.000Z';
const EXPIRES_10 = '2026-09-10T18:10:00.000Z';
const POLICY = `sha256:${'1'.repeat(64)}`;
const REQUEST = `sha256:${'2'.repeat(64)}`;
const PREPARED = `sha256:${'3'.repeat(64)}`;
const SOURCE = `sha256:${'4'.repeat(64)}`;

function withDigest(value, field) {
  return { ...value, [field]: contractDigest(value, field) };
}

function flow(overrides = {}) {
  const raw = {
    schema: FLOW_CONTEXT_SCHEMA,
    flow_context_id: 'flow:root',
    principal: 'principal:agent',
    runtime_identity: 'runtime:fixture',
    root_task_id: 'task:1',
    parent_flow_contexts: [],
    lineage_depth: 0,
    observed_data_classes: ['public'],
    observed_authority_classes: [],
    owner_or_domain_scopes: ['owner:fixture'],
    purpose_scopes: ['research'],
    source_commitments: [SOURCE],
    created_at: ISSUED,
    updated_at: ISSUED,
    policy_profile_digest: POLICY,
    ...overrides
  };
  return withDigest(raw, 'flow_digest');
}

function surrogate(overrides = {}) {
  const raw = {
    schema: CREDENTIAL_SURROGATE_SCHEMA,
    surrogate_id: 'surrogate:1',
    credential_class: 'credential',
    principal: 'principal:agent',
    provider_or_connector: 'connector:fixture',
    exact_action: 'document.read',
    purpose: 'research',
    exact_destination: 'https://example.invalid/api',
    allowed_data_classes: ['public'],
    issued_at: ISSUED,
    expires_at: EXPIRES_10,
    single_use: true,
    prepared_effect_digest: PREPARED,
    policy_profile_digest: POLICY,
    ...overrides
  };
  return withDigest(raw, 'surrogate_digest');
}

function challenge(overrides = {}) {
  const raw = {
    schema: TRUSTED_APPROVAL_CHALLENGE_SCHEMA,
    challenge_id: 'challenge:1',
    principal: 'principal:agent',
    requested_action: 'document.read',
    provider_or_connector: 'connector:fixture',
    exact_destination: 'https://example.invalid/api',
    observed_data_classes: ['owner_private'],
    purpose: 'research',
    external_transfer: true,
    reversibility: 'reversible',
    request_digest: REQUEST,
    policy_profile_digest: POLICY,
    issued_at: ISSUED,
    expires_at: EXPIRES_10,
    ...overrides
  };
  return withDigest(raw, 'challenge_digest');
}

function receipt(overrides = {}) {
  const raw = {
    schema: FLOW_RECEIPT_SCHEMA,
    receipt_id: 'receipt:1',
    flow_context_digest: `sha256:${'5'.repeat(64)}`,
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
    evaluated_at: NOW,
    ...overrides
  };
  return withDigest(raw, 'receipt_digest');
}

test('contract identities and closed class vocabularies are exact', () => {
  assert.equal(FLOW_CONTEXT_SCHEMA, 'axiom-flow-context.v0');
  assert.equal(CREDENTIAL_SURROGATE_SCHEMA, 'axiom-credential-surrogate.v0');
  assert.equal(TRUSTED_APPROVAL_CHALLENGE_SCHEMA, 'axiom-trusted-approval-challenge.v0');
  assert.equal(FLOW_RECEIPT_SCHEMA, 'axiom-flow-receipt.v0');
  assert.deepEqual(DATA_CLASSES, [
    'public', 'owner_private', 'shared_private',
    'regulated_or_restricted', 'secret', 'authority_bearing_secret'
  ]);
  assert.deepEqual(AUTHORITY_CLASSES, [
    'credential', 'authentication_factor', 'recovery_material', 'signing_key',
    'session_authority', 'payment_authority', 'device_enrollment', 'other_authority_bearing'
  ]);
});

test('FlowContext is closed, bounded, and self-digesting', () => {
  const value = flow();
  assert.equal(verifyFlowContext(value).flow_digest, value.flow_digest);
  assert.throws(() => verifyFlowContext({ ...value, surprise: true }), /unsupported field/);
  assert.throws(() => verifyFlowContext({ ...value, observed_data_classes: ['unknown'] }), /data class/);
  assert.throws(() => verifyFlowContext({ ...value, observed_data_classes: ['public', 'public'] }), /duplicate/);
  assert.throws(() => verifyFlowContext({ ...value, lineage_depth: 17 }), /lineage depth/);
  assert.throws(() => verifyFlowContext({ ...value, flow_digest: `sha256:${'f'.repeat(64)}` }), /digest/);
});

test('FlowContext validates parent references and monotonic timestamps', () => {
  const parents = Array.from({ length: 8 }, (_, index) => ({
    flow_context_id: `flow:parent:${index}`,
    flow_digest: `sha256:${String(index).padStart(64, '0')}`
  }));
  assert.equal(verifyFlowContext(flow({ parent_flow_contexts: parents, lineage_depth: 1 })).parent_flow_contexts.length, 8);
  assert.throws(() => verifyFlowContext(flow({
    parent_flow_contexts: [...parents, { flow_context_id: 'flow:extra', flow_digest: SOURCE }],
    lineage_depth: 1
  })), /parent/);
  assert.throws(() => verifyFlowContext(flow({ updated_at: '2026-09-10T17:59:59.000Z' })), /updated_at/);
});

test('CredentialSurrogate is exact, single-use, short-lived, and current', () => {
  const value = surrogate();
  assert.equal(verifyCredentialSurrogate(value, { now: NOW }).surrogate_digest, value.surrogate_digest);
  assert.throws(() => verifyCredentialSurrogate(surrogate({ single_use: false }), { now: NOW }), /single_use/);
  assert.throws(() => verifyCredentialSurrogate(surrogate({ expires_at: '2026-09-10T18:15:00.001Z' }), { now: NOW }), /15 minutes|lifetime/);
  assert.throws(() => verifyCredentialSurrogate(surrogate(), { now: '2026-09-10T18:10:00.001Z' }), /expired/);
  assert.throws(() => verifyCredentialSurrogate({ ...value, exact_action: '*' }, { now: NOW }), /wildcard|exact/);
});

test('TrustedApprovalChallenge is exact, short-lived, and current', () => {
  const value = challenge();
  assert.equal(verifyTrustedApprovalChallenge(value, { now: NOW }).challenge_digest, value.challenge_digest);
  assert.throws(() => verifyTrustedApprovalChallenge(challenge({ expires_at: '2026-09-10T18:10:00.001Z' }), { now: NOW }), /10 minutes|lifetime/);
  assert.throws(() => verifyTrustedApprovalChallenge(challenge(), { now: '2026-09-10T18:10:00.001Z' }), /expired/);
  assert.throws(() => verifyTrustedApprovalChallenge(challenge({ reversibility: 'magic' }), { now: NOW }), /reversibility/);
});

test('FlowReceipt is closed and cannot carry raw protected content', () => {
  const value = receipt();
  assert.equal(verifyFlowReceipt(value).receipt_digest, value.receipt_digest);
  for (const [field, secret] of [
    ['raw_payload', 'private text'], ['credential', 'secret'], ['token', 'secret'],
    ['otp', '123456'], ['prompt', 'private prompt']
  ]) {
    assert.throws(() => verifyFlowReceipt({ ...value, [field]: secret }), /unsupported field/);
  }
});

test('contract digest is canonical and mutation-sensitive', () => {
  const left = { schema: 'fixture', b: 2, a: 1 };
  const right = { a: 1, b: 2, schema: 'fixture' };
  assert.equal(contractDigest(left, 'digest'), contractDigest(right, 'digest'));
  assert.notEqual(contractDigest(left, 'digest'), contractDigest({ ...left, b: 3 }, 'digest'));
});

test('the four language-neutral JSON schemas are closed and identify their contracts', async () => {
  const cases = [
    ['flow-context.v0.schema.json', FLOW_CONTEXT_SCHEMA],
    ['credential-surrogate.v0.schema.json', CREDENTIAL_SURROGATE_SCHEMA],
    ['trusted-approval-challenge.v0.schema.json', TRUSTED_APPROVAL_CHALLENGE_SCHEMA],
    ['flow-receipt.v0.schema.json', FLOW_RECEIPT_SCHEMA]
  ];
  for (const [filename, identity] of cases) {
    const url = new URL(`../../docs/architecture/contracts/${filename}`, import.meta.url);
    const schema = JSON.parse(await readFile(url, 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.schema.const, identity);
  }
});

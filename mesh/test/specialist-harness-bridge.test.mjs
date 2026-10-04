import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

import { assertHostileInputContract } from '../test-support/hostile-input-contract.mjs';

import { autonomyEnvelopeDigest } from '../src/lib/autonomy-envelope.mjs';
import { ValidationError } from '../src/lib/canonical.mjs';
import { outcomeDigest, taskLifecycleDigest } from '../src/lib/agent-os-contracts.mjs';
import { executionRoutePolicyDigest } from '../src/lib/execution-route-policy.mjs';
import { taskContinuityPolicyDigest } from '../src/lib/task-continuity-policy.mjs';
import * as workGraph from '../src/lib/verified-work-graph.mjs';
import * as proposals from '../src/lib/semantic-operation-proposal.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  SPECIALIST_HARNESS_BRIDGE_CONSEQUENCE_ORDER,
  SPECIALIST_HARNESS_BRIDGE_EFFECT_CLASSES,
  SPECIALIST_HARNESS_BRIDGE_SCHEMA,
  buildSpecialistHarnessBridge,
  specialistHarnessBridgeDigest,
  validateSpecialistHarnessBridge
} from '../src/lib/specialist-harness-bridge.mjs';

const D = c => c.repeat(64);
const NOW = '2026-09-24T13:00:00.000Z';

function envelope(overrides = {}) {
  return {
    schema: 'axiom-autonomy-envelope.v0', version: 0, status: 'inert-owner-ceiling',
    envelope_id: 'autonomy.demo.1', owner_principal_id: 'owner.alice', subject_principal_id: 'agent.helper.1',
    authority_snapshot_ref: 'authority.snapshot.1', authority_digest: D('a'),
    active_from: '2026-09-24T12:00:00.000Z', expires_at: '2026-09-25T12:00:00.000Z',
    actions: ['memory.read', 'message.send'], purposes: ['assist.personal'],
    destinations: ['local'], capability_ids: ['files.read', 'messages.send'],
    data_classes: ['owner-private', 'contact-message'],
    effect_classes: ['none', 'read-external'], consequence_ceiling: 'C2', max_execution_ms: 5000,
    max_cost: { currency: 'CAD', max_minor_units: 100 },
    confirmation_floor: 'human-before-C2-C3', independent_approval_floor: 'inherit-existing',
    delegation_allowed: false, wildcard_authority: false, grants_authority: false,
    execution_effect: 'none', runtime_activation: false, ...overrides
  };
}

function outcome() {
  return {
    schema: 'axiom-outcome.v0', version: 0, status: 'inert-contract-laboratory',
    outcome_id: 'outcome.demo.1', owner_principal_id: 'owner.alice',
    intent: 'Summarize a bounded local corpus without widening authority.',
    acceptance_criteria: ['Summary exists'], purpose_ref: 'assist.personal', authority_refs: ['authority.snapshot.1'],
    data_classes: ['owner-private'], task_ids: ['task.demo.1'], effect_boundaries: ['none'],
    resource_envelope_ref: null, cost_budget: { currency: null, max_minor_units: 0 }, deadline: null,
    created_at: '2026-09-24T12:00:00.000Z', updated_at: '2026-09-24T12:00:00.000Z',
    completion_state: 'planned', evidence_refs: [],
    grants_authority: false, execution_effect: 'none', runtime_activation: false
  };
}

function task() {
  return {
    schema: 'axiom-task-lifecycle.v0', version: 0, status: 'inert-contract-laboratory',
    task_id: 'task.demo.1', outcome_id: 'outcome.demo.1', principal_id: 'owner.alice',
    lifecycle_state: 'admitted', created_at: '2026-09-24T12:00:00.000Z', updated_at: '2026-09-24T12:00:00.000Z',
    worker_ref: null, provider_ref: null, node_ref: null, authority_snapshot_ref: null,
    authority_checked_at: null, budget_ref: null, budget_checked_at: null,
    resume_requested: false, resume_from_digest: null, effect_state: 'not-started', result_refs: [],
    grants_authority: false, execution_effect: 'none', runtime_activation: false
  };
}

function routePolicy(overrides = {}) {
  return {
    schema: 'axiom-execution-route-policy.v0', version: 0, status: 'inert-contract-laboratory',
    routing_id: 'route.demo.1', outcome_id: 'outcome.demo.1', task_id: 'task.demo.1',
    operation_digest: D('c'), authority_snapshot_ref: 'authority.snapshot.1',
    effect_class: 'none', consequence_class: 'C1', required_capabilities: ['files.read'],
    route_order: ['structured-api', 'mcp-tool'], allow_visual_fallback: false,
    postcondition_required: true, reconciliation_required: true,
    grants_authority: false, execution_effect: 'none', runtime_activation: false, ...overrides
  };
}

function continuityPolicy(overrides = {}) {
  return {
    schema: 'axiom-task-continuity-policy.v0', version: 0, status: 'inert-contract-laboratory',
    continuity_id: 'continuity.demo.1', outcome_id: 'outcome.demo.1', task_id: 'task.demo.1',
    outcome_digest: outcomeDigest(outcome()), task_digest: taskLifecycleDigest(task()),
    authority_snapshot_ref: 'authority.snapshot.1', budget_ref: 'budget.snapshot.1',
    mode: 'stop-on-loss', max_degraded_duration_ms: 0,
    allowed_local_capabilities: ['files.read'], allowed_data_classes: ['owner-private'],
    expires_at: '2026-09-25T12:00:00.000Z',
    grants_authority: false, execution_effect: 'none', runtime_activation: false, ...overrides
  };
}

function input(overrides = {}) {
  return {
    bridge_id: 'bridge.demo.1',
    subject_principal_id: 'agent.helper.1',
    task_binding: { outcome_digest: outcomeDigest(outcome()), task_lifecycle_digest: taskLifecycleDigest(task()) },
    ceiling_binding: {
      autonomy_envelope_digest: autonomyEnvelopeDigest(envelope()),
      capability_ids: ['files.read'], data_classes: ['owner-private'], effect_classes: ['none'],
      consequence_ceiling: 'C1', max_execution_ms: 2000, max_cost: { currency: 'CAD', max_minor_units: 50 }
    },
    adapter_binding: {
      adapter_ref: 'harness.summarizer.1', adapter_kind: 'tool-harness',
      execution_route_policy_digest: executionRoutePolicyDigest(routePolicy()), route_class: 'mcp-tool',
      skill_admission_digest: null, external_agent_ingress_digest: null
    },
    data_binding: { data_projection_digest: D('d'), output_state: 'pending', output_digest: null },
    issued_at: '2026-09-24T12:30:00.000Z',
    expires_at: '2026-09-24T18:00:00.000Z',
    cancellation_handle: 'cancel.bridge.demo.1',
    handoff_binding: { task_continuity_policy_digest: taskContinuityPolicyDigest(continuityPolicy()) },
    provenance_binding: {
      portable_delegation_grant_digest: D('e'), ai_execution_provenance_digest: null, verified_work_graph_digest: null
    },
    composition_binding: { semantic_operation_proposal_digest: null, persistent_entity_bundle_digest: null },
    ...overrides
  };
}

const bridge = () => structuredClone(buildSpecialistHarnessBridge(input()));
const withBridge = (mutate) => { const b = bridge(); mutate(b); return b; };
const withCeiling = (patch) => withBridge(b => Object.assign(b.ceiling_binding, patch));

test('a valid bridge is inert, non-delegating and binds its full envelope-checked context', () => {
  const b = buildSpecialistHarnessBridge(input());
  assert.equal(b.schema, SPECIALIST_HARNESS_BRIDGE_SCHEMA);
  assert.ok(Object.isFrozen(b) && Object.isFrozen(b.ceiling_binding));
  const result = validateSpecialistHarnessBridge(b, {
    envelope: envelope(),
    now: NOW,
    references: {
      outcome: outcome(), task_lifecycle: task(), execution_route_policy: routePolicy(),
      task_continuity_policy: continuityPolicy()
    }
  });
  assert.equal(result.valid, true);
  assert.equal(result.envelope_checked, true);
  assert.equal(result.currentness_checked, true);
  assert.deepEqual([...result.references_checked].sort(), [
    'execution_route_policy', 'outcome', 'task_continuity_policy', 'task_lifecycle'
  ]);
  assert.equal(result.grants_authority, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.delegation_effect, 'none');
  assert.equal(result.population_effect, 'none');
  assert.equal(result.governance_identity_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal('mind_id' in b, false);
});

test('a recorded output is bound by digest and still grants no authority', () => {
  const b = buildSpecialistHarnessBridge(input({
    data_binding: { data_projection_digest: D('d'), output_state: 'recorded', output_digest: D('f') }
  }));
  const result = validateSpecialistHarnessBridge(b, { envelope: envelope(), now: NOW });
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.grants_authority, false);
  assert.throws(() => buildSpecialistHarnessBridge(input({
    data_binding: { data_projection_digest: D('d'), output_state: 'recorded', output_digest: null }
  })), /output_digest must be null exactly while output_state is pending/);
  assert.throws(() => buildSpecialistHarnessBridge(input({
    data_binding: { data_projection_digest: D('d'), output_state: 'pending', output_digest: D('f') }
  })), /output_digest must be null exactly while output_state is pending/);
});

test('bridge digest round-trips through canonical JSON and expected digest binding', () => {
  const b = bridge();
  const digest = specialistHarnessBridgeDigest(b);
  assert.match(digest, /^[a-f0-9]{64}$/);
  const roundTripped = JSON.parse(JSON.stringify(b));
  assert.equal(specialistHarnessBridgeDigest(roundTripped), digest);
  assert.equal(validateSpecialistHarnessBridge(roundTripped, { expectedDigest: digest }).bridge_digest, digest);
});

test('tampering with any bound digest is detected against the expected bridge digest', () => {
  const b = bridge();
  const digest = specialistHarnessBridgeDigest(b);
  const tampered = withBridge(x => { x.data_binding.data_projection_digest = D('9'); });
  assert.notEqual(specialistHarnessBridgeDigest(tampered), digest);
  assert.throws(() => validateSpecialistHarnessBridge(tampered, { expectedDigest: digest }), /digest mismatch/);
  const retargeted = withBridge(x => { x.adapter_binding.adapter_ref = 'harness.other.1'; });
  assert.throws(() => validateSpecialistHarnessBridge(retargeted, { expectedDigest: digest }), /digest mismatch/);
});

for (const [field, flipped] of [
  ['authority_effect', 'grant'],
  ['execution_effect', 'execute'],
  ['network_effect', 'egress'],
  ['delegation_effect', 'delegate'],
  ['population_effect', 'increase'],
  ['governance_identity_effect', 'create'],
  ['runtime_activation', true]
]) {
  test(`hard zero ${field} flipped fails closed`, () => {
    const b = withBridge(x => { x[field] = flipped; });
    assert.throws(() => validateSpecialistHarnessBridge(b), new RegExp(`hard zero ${field} is invalid`));
    assert.throws(() => buildSpecialistHarnessBridge({ ...input(), [field]: flipped }), /fields are invalid/);
  });
}

for (const [label, patch, pattern] of [
  ['capability', { capability_ids: ['files.read', 'files.write'] }, /capability_ids exceeds the envelope ceiling/],
  ['effect', { effect_classes: ['none', 'write-external'] }, /effect_classes exceeds the envelope ceiling/],
  ['data class', { data_classes: ['owner-private', 'third-party-private'] }, /data_classes exceeds the envelope ceiling/],
  ['consequence', { consequence_ceiling: 'C3' }, /consequence_ceiling exceeds the envelope ceiling/],
  ['time', { max_execution_ms: 5001 }, /max_execution_ms exceeds the envelope ceiling/],
  ['cost', { max_cost: { currency: 'CAD', max_minor_units: 101 } }, /max_cost exceeds the envelope ceiling/],
  ['cost currency', { max_cost: { currency: 'USD', max_minor_units: 1 } }, /max_cost currency does not match/]
]) {
  test(`${label} ceiling widened beyond the envelope fails closed`, () => {
    const b = withCeiling(patch);
    assert.equal(validateSpecialistHarnessBridge(b).valid, true, 'structurally valid on its own');
    assert.throws(() => validateSpecialistHarnessBridge(b, { envelope: envelope() }), pattern);
  });
}

test('any cost when the envelope permits no cost fails closed', () => {
  const e = envelope({ max_cost: null });
  const b = withCeiling({ autonomy_envelope_digest: autonomyEnvelopeDigest(e) });
  assert.throws(() => validateSpecialistHarnessBridge(b, { envelope: e }), /max_cost exceeds the envelope ceiling/);
  const free = withCeiling({ autonomy_envelope_digest: autonomyEnvelopeDigest(e), max_cost: null });
  assert.equal(validateSpecialistHarnessBridge(free, { envelope: e }).envelope_checked, true);
});

test('expiry after the envelope expiry fails closed', () => {
  const b = withBridge(x => { x.expires_at = '2026-09-25T12:00:00.001Z'; });
  assert.throws(() => validateSpecialistHarnessBridge(b, { envelope: envelope() }), /expires_at exceeds the envelope expires_at/);
  const early = withBridge(x => { x.issued_at = '2026-09-24T11:59:59.999Z'; });
  assert.throws(() => validateSpecialistHarnessBridge(early, { envelope: envelope() }), /issued_at precedes the envelope active_from/);
});

test('an envelope with delegation_allowed true is rejected', () => {
  const e = envelope({ delegation_allowed: true });
  assert.throws(() => validateSpecialistHarnessBridge(bridge(), { envelope: e }), /non-delegating/);
  assert.throws(() => validateSpecialistHarnessBridge(bridge(), { envelope: envelope({ delegation_allowed: 'false' }) }), /non-delegating/);
});

test('a mismatched or invalid envelope is rejected', () => {
  const other = envelope({ envelope_id: 'autonomy.demo.2' });
  assert.throws(() => validateSpecialistHarnessBridge(bridge(), { envelope: other }), /autonomy_envelope_digest does not match/);
  const wrongDigest = withCeiling({ autonomy_envelope_digest: D('0') });
  assert.throws(() => validateSpecialistHarnessBridge(wrongDigest, { envelope: envelope() }), /autonomy_envelope_digest does not match/);
  assert.throws(() => validateSpecialistHarnessBridge(bridge(), { envelope: envelope({ grants_authority: true }) }), /authority boundary is invalid/);
  const otherSubject = envelope({ subject_principal_id: 'agent.other.1' });
  const b = withCeiling({ autonomy_envelope_digest: autonomyEnvelopeDigest(otherSubject) });
  assert.throws(() => validateSpecialistHarnessBridge(b, { envelope: otherSubject }), /subject_principal_id does not match/);
});

test('an expired or not-yet-current bridge is rejected with injected time', () => {
  const b = bridge();
  assert.throws(() => validateSpecialistHarnessBridge(b, { now: '2026-09-24T18:00:00.000Z' }), /expired/);
  assert.throws(() => validateSpecialistHarnessBridge(b, { now: new Date('2026-09-26T00:00:00.000Z') }), /expired/);
  assert.throws(() => validateSpecialistHarnessBridge(b, { now: Date.parse('2026-09-24T12:29:59.999Z') }), /not yet current/);
  assert.throws(() => validateSpecialistHarnessBridge(b, { now: 'not-a-time' }), /now is invalid/);
  assert.throws(() => buildSpecialistHarnessBridge(input({ expires_at: '2026-09-24T12:30:00.000Z' })), /expires_at must follow issued_at/);
});

test('mind_id, mind continuation and Founder Genesis receipt fields are rejected', () => {
  for (const key of ['mind_id', 'mind_continuation', 'continues_mind', 'founder_genesis_receipt', 'genesis_receipt_digest']) {
    assert.throws(() => validateSpecialistHarnessBridge({ ...bridge(), [key]: 'x' }), /forbidden mind or Genesis field/, key);
    assert.throws(() => buildSpecialistHarnessBridge({ ...input(), [key]: 'x' }), /forbidden mind or Genesis field/, key);
  }
  const nested = withBridge(x => { x.adapter_binding.mind_id = 'digital.founder.1'; });
  assert.throws(() => validateSpecialistHarnessBridge(nested), /forbidden mind or Genesis field \$\.adapter_binding\.mind_id/);
  const provenance = withBridge(x => { x.provenance_binding.genesis_receipt_digest = D('1'); });
  assert.throws(() => validateSpecialistHarnessBridge(provenance), /forbidden mind or Genesis field/);
});

test('adapter identity cannot be a mind identity, Genesis receipt or the subject', () => {
  for (const ref of ['mind:digital.founder.1', 'genesis.receipt.1', 'founder-genesis:slot.1', 'receipt.genesis-receipt.1']) {
    const b = withBridge(x => { x.adapter_binding.adapter_ref = ref; });
    assert.throws(() => validateSpecialistHarnessBridge(b), /adapter_ref cannot be a mind identity or Genesis receipt/, ref);
  }
  const self = withBridge(x => { x.adapter_binding.adapter_ref = x.subject_principal_id; });
  assert.throws(() => validateSpecialistHarnessBridge(self), /adapter_ref cannot be the subject principal/);
});

test('unknown fields are rejected at every level', () => {
  assert.throws(() => validateSpecialistHarnessBridge({ ...bridge(), grants_authority: true }), /fields are invalid/);
  assert.throws(() => validateSpecialistHarnessBridge({ ...bridge(), extra: 1 }), /fields are invalid/);
  for (const section of ['task_binding', 'ceiling_binding', 'adapter_binding', 'data_binding', 'handoff_binding', 'provenance_binding', 'composition_binding']) {
    const b = withBridge(x => { x[section].unexpected = null; });
    assert.throws(() => validateSpecialistHarnessBridge(b), new RegExp(`${section} fields are invalid`), section);
  }
  const cost = withCeiling({ max_cost: { currency: 'CAD', max_minor_units: 1, overdraft: true } });
  assert.throws(() => validateSpecialistHarnessBridge(cost), /max_cost fields are invalid/);
  assert.throws(() => validateSpecialistHarnessBridge(bridge(), { delegate: true }), /options\.delegate is not supported/);
});

test('missing required references fail closed', () => {
  for (const [section, field] of [
    ['task_binding', 'outcome_digest'],
    ['task_binding', 'task_lifecycle_digest'],
    ['ceiling_binding', 'autonomy_envelope_digest'],
    ['adapter_binding', 'execution_route_policy_digest'],
    ['adapter_binding', 'route_class'],
    ['data_binding', 'data_projection_digest'],
    ['handoff_binding', 'task_continuity_policy_digest'],
    ['provenance_binding', 'portable_delegation_grant_digest']
  ]) {
    const missing = withBridge(x => { delete x[section][field]; });
    assert.throws(() => validateSpecialistHarnessBridge(missing), /fields are invalid/, field);
    const nulled = withBridge(x => { x[section][field] = null; });
    assert.throws(() => validateSpecialistHarnessBridge(nulled), /invalid|digest/, field);
  }
  for (const field of ['cancellation_handle', 'issued_at', 'expires_at', 'subject_principal_id']) {
    const missing = withBridge(x => { delete x[field]; });
    assert.throws(() => validateSpecialistHarnessBridge(missing), /fields are invalid/, field);
  }
});

test('adapter kind must match exactly one admission reference', () => {
  const skill = buildSpecialistHarnessBridge(input({
    adapter_binding: { ...input().adapter_binding, adapter_kind: 'skill', skill_admission_digest: D('2') }
  }));
  assert.equal(validateSpecialistHarnessBridge(skill).valid, true);
  const agent = buildSpecialistHarnessBridge(input({
    adapter_binding: { ...input().adapter_binding, adapter_kind: 'external-agent', external_agent_ingress_digest: D('3') }
  }));
  assert.equal(validateSpecialistHarnessBridge(agent).valid, true);
  for (const patch of [
    { adapter_kind: 'skill' },
    { adapter_kind: 'external-agent' },
    { skill_admission_digest: D('2') },
    { adapter_kind: 'skill', skill_admission_digest: D('2'), external_agent_ingress_digest: D('3') }
  ]) {
    assert.throws(() => buildSpecialistHarnessBridge(input({
      adapter_binding: { ...input().adapter_binding, ...patch }
    })), /adapter_kind does not match its admission reference/);
  }
});

test('supplied referenced contracts must validate and match their bound digests', () => {
  const b = bridge();
  const other = { ...outcome(), intent: 'A different objective.' };
  assert.throws(() => validateSpecialistHarnessBridge(b, { references: { outcome: other } }), /outcome digest does not match/);
  assert.throws(() => validateSpecialistHarnessBridge(b, { references: { task_lifecycle: { ...task(), grants_authority: true } } }), /activation boundary is invalid/);
  const narrowRoutes = routePolicy({ route_order: ['structured-api'] });
  const narrow = withBridge(x => { x.adapter_binding.execution_route_policy_digest = executionRoutePolicyDigest(narrowRoutes); });
  assert.throws(() => validateSpecialistHarnessBridge(narrow, { references: { execution_route_policy: narrowRoutes } }), /route_class is not permitted/);
  const detached = continuityPolicy({ task_digest: D('4') });
  const handoff = withBridge(x => { x.handoff_binding.task_continuity_policy_digest = taskContinuityPolicyDigest(detached); });
  assert.throws(() => validateSpecialistHarnessBridge(handoff, { references: { task_continuity_policy: detached } }), /bound to a different outcome or task/);
  assert.throws(() => validateSpecialistHarnessBridge(b, { references: { skill_admission: {} } }), /bridge binds no digest/);
  assert.throws(() => validateSpecialistHarnessBridge(b, { references: { founder_genesis_receipt: {} } }), /forbidden mind or Genesis field|not a supported reference/);
  assert.throws(() => validateSpecialistHarnessBridge(b, { references: { authority_grant: {} } }), /not a supported reference/);
});

test('wildcard ceilings are rejected structurally', () => {
  assert.throws(() => validateSpecialistHarnessBridge(withCeiling({ capability_ids: ['*'] })), /invalid|ambient authority/);
  assert.throws(() => validateSpecialistHarnessBridge(withCeiling({ capability_ids: ['administrator'] })), /ambient authority syntax/);
  assert.throws(() => validateSpecialistHarnessBridge(withCeiling({ data_classes: ['all'] })), /invalid/);
  assert.throws(() => validateSpecialistHarnessBridge(withCeiling({ effect_classes: ['unknown'] })), /invalid value/);
});

const withRef = ref => withBridge(x => { x.adapter_binding.adapter_ref = ref; });
const MIND_REF = /adapter_ref cannot be a mind identity or Genesis receipt/;
const FORBIDDEN = /forbidden mind or Genesis field/;

test('adapter_ref name guard rejects mind or Genesis tokens at any segment boundary', () => {
  for (const ref of [
    'x/genesis', 'x/mind', 'urn:mind:x', 'urn:genesis:x', 'did:mind:x', 'agent:mind:1',
    'MIND', 'minds.pool', 'tool#mind', 'a_mind_b', 'agent.mind-1', 'mind1', 'agentMind',
    'mindId', 'ABCMind', 'genesisX', 'genesis', 'x.GENESIS.y', 'founder_genesis', 'founder-genesis:slot.1',
    'receipt.genesis-receipt.1', 'genesis_receipt'
  ]) {
    assert.throws(() => validateSpecialistHarnessBridge(withRef(ref)), MIND_REF, ref);
  }
});

test('adapter_ref name guard keeps ordinary names that merely contain "mind"', () => {
  for (const ref of [
    'tool:code-review', 'skill:lint', 'reminder-bot', 'mastermind-tool', 'mindful.notes',
    'mindx', 'harness.summarizer.1', 'remind:daily'
  ]) {
    assert.equal(validateSpecialistHarnessBridge(withRef(ref)).valid, true, ref);
  }
  const skill = buildSpecialistHarnessBridge(input({
    adapter_binding: { ...input().adapter_binding, adapter_ref: 'skill:lint', adapter_kind: 'skill', skill_admission_digest: D('2') }
  }));
  assert.equal(validateSpecialistHarnessBridge(skill).valid, true);
});

test('camelCase and kebab-case mind or Genesis keys are rejected at every depth', () => {
  for (const key of ['mindId', 'mindContinuation', 'mind-id', 'genesisReceipt', 'continuesMind', 'MIND', 'minds', 'x.mind']) {
    assert.throws(() => validateSpecialistHarnessBridge({ ...bridge(), [key]: 'x' }), FORBIDDEN, key);
    assert.throws(() => buildSpecialistHarnessBridge({ ...input(), [key]: 'x' }), FORBIDDEN, key);
    const nested = withBridge(x => { x.data_binding[key] = 'x'; });
    assert.throws(() => validateSpecialistHarnessBridge(nested), FORBIDDEN, key);
  }
});

test('homoglyph, zero-width, __proto__ and constructor keys are rejected by closed objects', () => {
  for (const key of ['m\u0456nd_id', 'mind\u200b_id', '\u200bbridge_id', 'bridge_id\u200d', '__proto__', 'constructor', 'prototype']) {
    const top = { ...bridge() };
    Object.defineProperty(top, key, { value: 'x', enumerable: true, configurable: true, writable: true });
    assert.throws(() => validateSpecialistHarnessBridge(top), /fields are invalid|forbidden mind or Genesis field/, JSON.stringify(key));
    const nested = withBridge(x => {
      Object.defineProperty(x.ceiling_binding, key, { value: 'x', enumerable: true, configurable: true, writable: true });
    });
    assert.throws(() => validateSpecialistHarnessBridge(nested), /ceiling_binding fields are invalid|forbidden mind or Genesis field/, JSON.stringify(key));
  }
  const parsed = JSON.parse(`{"__proto__":{"grants_authority":true},${JSON.stringify(bridge()).slice(1)}`);
  assert.equal(Object.hasOwn(parsed, '__proto__'), true);
  assert.throws(() => validateSpecialistHarnessBridge(parsed), /fields are invalid/);
  const input2 = JSON.parse(`{"constructor":{},${JSON.stringify(input()).slice(1)}`);
  assert.throws(() => buildSpecialistHarnessBridge(input2), /fields are invalid/);
});

test('effect and consequence enums stay in parity with the Autonomy Envelope schema', () => {
  const envelopeSchema = JSON.parse(readFileSync(new URL('../config/autonomy-envelope-v0.schema.json', import.meta.url), 'utf8'));
  const bridgeSchema = JSON.parse(readFileSync(new URL('../config/specialist-harness-bridge-v0.schema.json', import.meta.url), 'utf8'));
  const bridgeCeiling = bridgeSchema.properties.ceiling_binding.properties;
  assert.deepEqual([...SPECIALIST_HARNESS_BRIDGE_EFFECT_CLASSES], envelopeSchema.properties.effect_classes.items.enum);
  assert.deepEqual([...SPECIALIST_HARNESS_BRIDGE_CONSEQUENCE_ORDER], envelopeSchema.properties.consequence_ceiling.enum);
  assert.deepEqual(bridgeCeiling.effect_classes.items.enum, envelopeSchema.properties.effect_classes.items.enum);
  assert.deepEqual(bridgeCeiling.consequence_ceiling.enum, envelopeSchema.properties.consequence_ceiling.enum);
  for (const effect of SPECIALIST_HARNESS_BRIDGE_EFFECT_CLASSES) {
    assert.equal(validateSpecialistHarnessBridge(withCeiling({ effect_classes: [effect] })).valid, true, effect);
  }
  for (const level of SPECIALIST_HARNESS_BRIDGE_CONSEQUENCE_ORDER) {
    assert.equal(validateSpecialistHarnessBridge(withCeiling({ consequence_ceiling: level })).valid, true, level);
  }
  assert.throws(() => validateSpecialistHarnessBridge(withCeiling({ consequence_ceiling: 'C4' })), /consequence_ceiling is invalid/);
});

test('#1891 name guard matches irregular mixed-case mind tokens case-insensitively', () => {
  for (const ref of ['MiNd', 'MINDx', 'mINd', 'agent:MiNd:1', 'x/MINDx', 'reMinder', 'miNDful']) {
    assert.throws(() => validateSpecialistHarnessBridge(withRef(ref)), MIND_REF, ref);
  }
  for (const key of ['MiNd', 'MINDx', 'mINd_id']) {
    assert.throws(() => validateSpecialistHarnessBridge({ ...bridge(), [key]: 'x' }), FORBIDDEN, key);
  }
  for (const ref of ['Reminder', 'MASTERMIND', 'Mindful', 'reminder-bot', 'mastermind-tool']) {
    assert.equal(validateSpecialistHarnessBridge(withRef(ref)).valid, true, ref);
  }
});

test('#1891 a deceptive non-throwing Proxy cannot hide mind_id from validate()', () => {
  const target = { ...bridge(), mind_id: 'digital.founder.1' };
  let reads = 0;
  const deceptive = new Proxy(target, {
    // Hide mind_id while the validator looks, then reveal it afterwards.
    ownKeys(object) {
      reads += 1;
      return Reflect.ownKeys(object).filter(key => key !== 'mind_id');
    },
    getOwnPropertyDescriptor(object, key) {
      return key === 'mind_id' ? undefined : Reflect.getOwnPropertyDescriptor(object, key);
    }
  });
  assert.equal(Object.keys(deceptive).includes('mind_id'), false);
  assert.throws(() => validateSpecialistHarnessBridge(deceptive), err => err instanceof ValidationError && /failing closed/.test(err.message));
  assert.equal(reads, 1, 'the validator never walked the Proxy');
  assert.equal(target.mind_id, 'digital.founder.1');
});

// Extract `const NAME = wrapper([...])` from module source. The declaration
// must start a line (so a `// const NAME=...` comment cannot satisfy it) and
// appear exactly once; multi-line arrays, single or double quotes, and a
// trailing comma are tolerated. Anything else inside the array fails closed.
function runtimeStringArray(source, name, wrapper) {
  const escapedWrapper = wrapper.split('.').join('\\.');
  const declaration = new RegExp(`^[ \\t]*(?:export[ \\t]+)?const[ \\t]+${name}\\s*=\\s*${escapedWrapper}\\(\\s*\\[([^\\]]*)\\]\\s*\\)`, 'gm');
  const matches = [...source.matchAll(declaration)];
  assert.equal(matches.length, 1, `exactly one line-anchored ${name} declaration must exist in autonomy-envelope.mjs`);
  const body = matches[0][1];
  const items = [...body.matchAll(/(['"])([^'"\\\n]*)\1/g)].map(found => found[2]);
  const residue = body.split(/(['"])[^'"\\\n]*\1/).filter((part, index) => index % 2 === 0).join('');
  assert.match(residue, /^[\s,]*$/, `${name} array must contain only string literals`);
  assert.ok(items.length > 0, `${name} array must not be empty`);
  return items;
}

test('#1891 runtime enum extraction is line-anchored and tolerates harmless reformatting', () => {
  const formatted = "const EFFECTS = new Set([\n  'none',\n  \"read-external\",\n]);\n";
  assert.deepEqual(runtimeStringArray(formatted, 'EFFECTS', 'new Set'), ['none', 'read-external']);
  const commentedOnly = "// const EFFECTS=new Set([\"none\"]);\nconst OTHER=1;\n";
  assert.throws(() => runtimeStringArray(commentedOnly, 'EFFECTS', 'new Set'), /exactly one/);
  const duplicated = 'const EFFECTS=new Set(["none"]);\nconst EFFECTS=new Set(["x"]);\n';
  assert.throws(() => runtimeStringArray(duplicated, 'EFFECTS', 'new Set'), /exactly one/);
  const computed = 'const EFFECTS=new Set(["none", ...more]);\n';
  assert.throws(() => runtimeStringArray(computed, 'EFFECTS', 'new Set'), /only string literals/);
});

test('#1891 validate() still rejects non-plain data on the original document, not only on its clone', () => {
  const nonEnumerable = bridge();
  Object.defineProperty(nonEnumerable, 'mind_id', { value: 'digital.founder.1', enumerable: false });
  const flipping = bridge();
  const benign = structuredClone(flipping.adapter_binding);
  const hostile = { ...benign, adapter_ref: 'agent:mind:1' };
  let flipReads = 0;
  Object.defineProperty(flipping, 'adapter_binding', {
    get() { flipReads += 1; return flipReads === 1 ? benign : hostile; },
    enumerable: true
  });
  const symbolKey = bridge();
  symbolKey[Symbol('mind_id')] = 'digital.founder.1';
  class BridgeRecord {}
  const classInstance = Object.assign(new BridgeRecord(), bridge());
  const stable = bridge();
  const stableBinding = stable.adapter_binding;
  Object.defineProperty(stable, 'adapter_binding', { get: () => stableBinding, enumerable: true });
  const cases = [
    ['non-enumerable mind_id', nonEnumerable],
    ['getter that flips between reads', flipping],
    ['symbol key', symbolKey],
    ['class instance', classInstance],
    ['stable getter', stable]
  ];
  for (const [label, document] of cases) {
    assert.throws(() => validateSpecialistHarnessBridge(document), err => err instanceof ValidationError && /failing closed/.test(err.message), label);
  }
  assert.equal(validateSpecialistHarnessBridge(bridge()).valid, true, 'plain data still validates');
});

test('#1891 bridge enums stay in parity with the autonomy-envelope runtime constants', () => {
  const source = readFileSync(new URL('../src/lib/autonomy-envelope.mjs', import.meta.url), 'utf8');
  const envelopeEffects = runtimeStringArray(source, 'EFFECTS', 'new Set');
  const envelopeConsequence = runtimeStringArray(source, 'CONSEQUENCE', 'Object.freeze');
  assert.deepEqual([...SPECIALIST_HARNESS_BRIDGE_EFFECT_CLASSES], envelopeEffects);
  assert.deepEqual([...SPECIALIST_HARNESS_BRIDGE_CONSEQUENCE_ORDER], envelopeConsequence);
  // Behavioral parity against the runtime validator itself.
  for (const effect of SPECIALIST_HARNESS_BRIDGE_EFFECT_CLASSES) {
    assert.match(autonomyEnvelopeDigest(envelope({ effect_classes: [effect] })), /^[a-f0-9]{64}$/, effect);
  }
  for (const level of SPECIALIST_HARNESS_BRIDGE_CONSEQUENCE_ORDER) {
    assert.match(autonomyEnvelopeDigest(envelope({ consequence_ceiling: level })), /^[a-f0-9]{64}$/, level);
  }
  assert.throws(() => autonomyEnvelopeDigest(envelope({ effect_classes: ['teleport'] })), ValidationError);
  assert.throws(() => autonomyEnvelopeDigest(envelope({ consequence_ceiling: 'C4' })), ValidationError);
});

test('cyclic input fails closed with a ValidationError', () => {
  const top = bridge();
  top.self = top;
  assert.throws(() => validateSpecialistHarnessBridge(top), ValidationError);
  const nested = bridge();
  nested.data_binding.loop = nested.data_binding;
  assert.throws(() => validateSpecialistHarnessBridge(nested), err => err instanceof ValidationError && /cyclic/.test(err.message));
  const cyclicInput = input();
  cyclicInput.ceiling_binding.capability_ids.push(cyclicInput.ceiling_binding);
  assert.throws(() => buildSpecialistHarnessBridge(cyclicInput), ValidationError);
  const options = { references: {} };
  options.references.outcome = options;
  assert.throws(() => validateSpecialistHarnessBridge(bridge(), options), ValidationError);
});

test('throwing getters and proxies fail closed with a ValidationError', () => {
  const boom = () => { throw new TypeError('boom'); };
  const top = bridge();
  Object.defineProperty(top, 'bridge_id', { get: boom, enumerable: true });
  assert.throws(() => validateSpecialistHarnessBridge(top), err => err instanceof ValidationError && /failing closed/.test(err.message));
  const nested = bridge();
  Object.defineProperty(nested.ceiling_binding, 'max_cost', { get: boom, enumerable: true });
  assert.throws(() => validateSpecialistHarnessBridge(nested), ValidationError);
  const built = input();
  Object.defineProperty(built, 'issued_at', { get: boom, enumerable: true });
  assert.throws(() => buildSpecialistHarnessBridge(built), ValidationError);
  const env = envelope();
  Object.defineProperty(env, 'delegation_allowed', { get: boom, enumerable: true });
  assert.throws(() => validateSpecialistHarnessBridge(bridge(), { envelope: env }), ValidationError);
  const proxy = new Proxy(bridge(), { ownKeys: boom });
  assert.throws(() => validateSpecialistHarnessBridge(proxy), ValidationError);
  const options = {};
  Object.defineProperty(options, 'now', { get: boom, enumerable: true });
  assert.throws(() => validateSpecialistHarnessBridge(bridge(), options), ValidationError);
});

test('delegation_allowed missing, null, 0 or "false" is rejected before the envelope validator runs', () => {
  for (const [label, mutate] of [
    ['missing', e => { delete e.delegation_allowed; }],
    ['null', e => { e.delegation_allowed = null; }],
    ['0', e => { e.delegation_allowed = 0; }],
    ['"false"', e => { e.delegation_allowed = 'false'; }]
  ]) {
    const e = envelope();
    mutate(e);
    assert.throws(() => validateSpecialistHarnessBridge(bridge(), { envelope: e }), /non-delegating/, label);
    // An accessor probe can no longer observe ordering: the options snapshot
    // rejects the accessor itself before any envelope check, without calling it.
    let reached = false;
    const schema = e.schema;
    Object.defineProperty(e, 'schema', { get() { reached = true; return schema; }, enumerable: true });
    assert.throws(() => validateSpecialistHarnessBridge(bridge(), { envelope: e }), ValidationError, label);
    assert.equal(reached, false, `envelope getter must not run (${label})`);
  }
});

test('non-canonical timestamps fail and the active_from boundary passes', () => {
  for (const value of [
    '2026-09-24T12:30:00.000+00:00', '2026-09-24T08:30:00.000-04:00', '2026-09-24T12:30:00Z',
    '2026-09-24 12:30:00.000Z', '2026-09-24T12:30:00.000', '2026-02-30T12:30:00.000Z', '2026-09-24',
    '', 'not-a-time', 1790253000000, null
  ]) {
    for (const field of ['issued_at', 'expires_at']) {
      const b = withBridge(x => { x[field] = value; });
      assert.throws(() => validateSpecialistHarnessBridge(b), /canonical ISO timestamp/, `${field}=${value}`);
    }
  }
  const boundary = withBridge(x => { x.issued_at = '2026-09-24T12:00:00.000Z'; x.expires_at = '2026-09-25T12:00:00.000Z'; });
  assert.equal(validateSpecialistHarnessBridge(boundary, { envelope: envelope() }).envelope_checked, true);
  assert.equal(validateSpecialistHarnessBridge(boundary, { now: '2026-09-24T12:00:00.000Z' }).currentness_checked, true);
});

test('zero and negative-zero cost fail against an envelope that permits no cost', () => {
  const e = envelope({ max_cost: null });
  const zero = withCeiling({ autonomy_envelope_digest: autonomyEnvelopeDigest(e), max_cost: { currency: 'CAD', max_minor_units: 0 } });
  assert.throws(() => validateSpecialistHarnessBridge(zero, { envelope: e }), /max_cost exceeds the envelope ceiling/);
  const negativeZero = withCeiling({ autonomy_envelope_digest: autonomyEnvelopeDigest(e), max_cost: { currency: 'CAD', max_minor_units: -0 } });
  assert.throws(() => validateSpecialistHarnessBridge(negativeZero, { envelope: e }), /max_cost/);
  assert.throws(() => validateSpecialistHarnessBridge(negativeZero), /max_cost max_minor_units is invalid/);
  for (const units of [-1, 0.5, '0', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateSpecialistHarnessBridge(withCeiling({ max_cost: { currency: 'CAD', max_minor_units: units } })), /max_minor_units is invalid/, String(units));
  }
});

test('currency must be three uppercase letters', () => {
  for (const currency of ['cad', 'Cad', 'CA', 'CADD', ' CAD', null, 124]) {
    assert.throws(() => validateSpecialistHarnessBridge(withCeiling({ max_cost: { currency, max_minor_units: 1 } })), /max_cost currency is invalid/, String(currency));
  }
});

test('digest fields reject uppercase hex, prefixes and wrong lengths', () => {
  for (const value of ['A'.repeat(64), `sha256:${'a'.repeat(64)}`, 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), '', 42]) {
    for (const [section, field] of [
      ['task_binding', 'outcome_digest'], ['ceiling_binding', 'autonomy_envelope_digest'],
      ['adapter_binding', 'execution_route_policy_digest'], ['data_binding', 'data_projection_digest'],
      ['handoff_binding', 'task_continuity_policy_digest'], ['provenance_binding', 'portable_delegation_grant_digest'],
      ['provenance_binding', 'ai_execution_provenance_digest'], ['composition_binding', 'persistent_entity_bundle_digest']
    ]) {
      const b = withBridge(x => { x[section][field] = value; });
      assert.throws(() => validateSpecialistHarnessBridge(b), /must be a lowercase sha256 digest/, `${field}=${value}`);
    }
  }
  assert.throws(() => validateSpecialistHarnessBridge(bridge(), { expectedDigest: 'A'.repeat(64) }), /must be a lowercase sha256 digest/);
});

test('values exactly equal to every envelope ceiling pass', () => {
  const e = envelope();
  const b = withBridge(x => {
    Object.assign(x.ceiling_binding, {
      capability_ids: [...e.capability_ids], data_classes: [...e.data_classes], effect_classes: [...e.effect_classes],
      consequence_ceiling: e.consequence_ceiling, max_execution_ms: e.max_execution_ms, max_cost: { ...e.max_cost }
    });
    x.issued_at = e.active_from;
    x.expires_at = e.expires_at;
  });
  const result = validateSpecialistHarnessBridge(b, { envelope: e });
  assert.equal(result.valid, true);
  assert.equal(result.envelope_checked, true);
  const free = envelope({ max_cost: { currency: 'CAD', max_minor_units: 0 } });
  const freeBridge = withCeiling({ autonomy_envelope_digest: autonomyEnvelopeDigest(free), max_cost: { currency: 'CAD', max_minor_units: 0 } });
  assert.equal(validateSpecialistHarnessBridge(freeBridge, { envelope: free }).envelope_checked, true);
});

test('without an envelope no ceiling is checked and envelope_checked is false', () => {
  const wide = withCeiling({ capability_ids: ['files.write'], consequence_ceiling: 'C3', max_execution_ms: 300000 });
  const result = validateSpecialistHarnessBridge(wide);
  assert.equal(result.valid, true);
  assert.equal(result.envelope_checked, false);
  assert.throws(() => validateSpecialistHarnessBridge(wide, { envelope: envelope() }), /exceeds the envelope ceiling/);
});

for (const field of ['authority_effect', 'execution_effect', 'network_effect', 'delegation_effect', 'population_effect', 'governance_identity_effect', 'runtime_activation']) {
  test(`hard zero ${field} null, missing or wrong type fails closed`, () => {
    const wrongType = field === 'runtime_activation' ? ['false', 0, null, {}] : [false, 0, null, ['none'], 'None', 'none '];
    for (const value of wrongType) {
      const b = withBridge(x => { x[field] = value; });
      assert.throws(() => validateSpecialistHarnessBridge(b), new RegExp(`hard zero ${field} is invalid`), JSON.stringify(value));
    }
    const missing = withBridge(x => { delete x[field]; });
    assert.throws(() => validateSpecialistHarnessBridge(missing), /fields are invalid/);
  });
}

// AT-5: options, envelope and references are plain data read once; no getter
// or Proxy trap runs and hidden, symbol or accessor state is a ValidationError.
test('AT-5: accessor, non-enumerable or Proxy envelope and hidden-key references are rejected with ValidationError', () => {
  let calls = 0;
  const env = envelope();
  const counted = (value) => new Proxy(value, { get(target, key, receiver) { calls += 1; return Reflect.get(target, key, receiver); } });
  const hostile = {
    'accessor envelope': Object.defineProperty({ now: NOW }, 'envelope', { get() { calls += 1; return env; }, enumerable: true }),
    'non-enumerable envelope': Object.defineProperty({ now: NOW }, 'envelope', { value: env, enumerable: false }),
    'Proxy envelope': { envelope: counted(envelope()), now: NOW },
    'references with hidden mind_id': {
      envelope: envelope(), now: NOW,
      references: Object.defineProperty({ outcome: outcome() }, 'mind_id', { value: 'hidden', enumerable: false })
    },
    'symbol-keyed options': { envelope: envelope(), now: NOW, [Symbol('extra')]: true },
    'Proxy now': { envelope: envelope(), now: counted(new Date(NOW)) }
  };
  assert.equal(validateSpecialistHarnessBridge(bridge(), { envelope: envelope(), now: NOW, references: { outcome: outcome() } }).valid, true);
  assert.equal(validateSpecialistHarnessBridge(bridge(), { envelope: envelope(), now: new Date(NOW) }).valid, true);
  for (const [label, options] of Object.entries(hostile)) {
    assert.throws(() => validateSpecialistHarnessBridge(bridge(), options), ValidationError, label);
  }
  assert.equal(calls, 0, 'no getter or trap ran');
});

test('AT-5: a getter inside the bridge document is never called', () => {
  let calls = 0;
  const document = bridge();
  const value = document.bridge_id;
  Object.defineProperty(document, 'bridge_id', { get() { calls += 1; return value; }, enumerable: true });
  assert.throws(() => validateSpecialistHarnessBridge(document), err => err instanceof ValidationError && /failing closed/.test(err.message));
  assert.equal(calls, 0);
});

test('hostile-input contract: validateSpecialistHarnessBridge rejects every hostile variant with ValidationError', async () => {
  await assertHostileInputContract({
    name: 'validateSpecialistHarnessBridge',
    fn: validateSpecialistHarnessBridge,
    validArgs: () => [bridge(), {
      envelope: envelope(),
      now: NOW,
      references: {
        outcome: outcome(),
        task_lifecycle: task(),
        execution_route_policy: routePolicy(),
        task_continuity_policy: continuityPolicy()
      }
    }],
    // Absent options and references are undefined; the remaining paths are
    // nullable fields of the bridge and of the referenced documents' schemas.
    nullablePaths: [
      /^arg0\..*_digest$/,
      'arg0.ceiling_binding.max_cost',
      /^arg1(\.(envelope|now|references|references\.[a-z_]+))?$/,
      /^arg1\.references\.outcome\.(cost_budget\.currency|deadline|resource_envelope_ref)$/,
      /^arg1\.references\.task_lifecycle\.(authority_checked_at|authority_snapshot_ref|budget_checked_at|budget_ref|node_ref|provider_ref|resume_from_digest|worker_ref)$/
    ],
    maxPaths: 1000
  }, assert);
});

// --- Reference snapshot budgets follow each reference schema's own maxima ---
// Literals, not the module constants, so these tests also run unchanged against
// trees that predate the constants.
const WORK_GRAPH_MAX_PLAIN_VALUES = 1 + 11 + 4096 * (1 + 10 + 256);

function workGraphNode(index, dependencies) {
  return {
    node_id: `n${index}`, kind: index === 0 ? 'goal' : 'task', label: `node ${index}`, state: 'proposed',
    dependencies, artifact_digest: null, verification_result: 'not-applicable',
    verifier_ref: null, verification_evidence_digest: null, lineage_ref: null
  };
}

function workGraphDocument(nodes) {
  return {
    schema: workGraph.VERIFIED_WORK_GRAPH_SCHEMA, version: '0.1.0', status: 'inert-evidence',
    graph_id: 'graph.max', subject_ref: 'subject.max', nodes, created_at: '2026-09-24T12:00:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', execution_authority: false
  };
}

// Node i depends on the (up to) maxDependencies nodes before it: acyclic, one goal.
function maxWorkGraph(nodeCount, maxDependencies) {
  const nodes = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const dependencies = [];
    if (index > 0) for (let prior = Math.max(0, index - maxDependencies); prior < index; prior += 1) dependencies.push(`n${prior}`);
    nodes.push(workGraphNode(index, dependencies));
  }
  return workGraphDocument(nodes);
}

function plainValueCount(value) {
  if (value === null || typeof value !== 'object') return 1;
  let count = 1;
  for (const item of Object.values(value)) count += plainValueCount(item);
  return count;
}

const withWorkGraphDigest = digest => withBridge(b => { b.provenance_binding.verified_work_graph_digest = digest; });
const checkWorkGraph = (b, graph) => validateSpecialistHarnessBridge(b, {
  envelope: envelope(), now: NOW, references: { verified_work_graph: graph }
});

test('B-1: a schema-maximum verified work graph reference (4096 nodes, up to 256 dependencies) is accepted', () => {
  const graph = maxWorkGraph(4096, 256);
  const values = plainValueCount(graph);
  assert.ok(values > 50_000, `fixture must exceed the default snapshot budget (${values})`);
  assert.ok(values <= WORK_GRAPH_MAX_PLAIN_VALUES);
  const result = checkWorkGraph(withWorkGraphDigest(workGraph.verifiedWorkGraphDigest(graph)), graph);
  assert.equal(result.valid, true);
  assert.deepEqual([...result.references_checked], ['verified_work_graph']);
  assert.equal(result.grants_authority, false);
});

test('B-1: the work-graph snapshot budget is the schema maximum, derived from the schema constants', () => {
  assert.equal(workGraph.VERIFIED_WORK_GRAPH_MAX_NODES, 4096);
  assert.equal(workGraph.VERIFIED_WORK_GRAPH_MAX_DEPENDENCIES, 256);
  // 1 root + 11 top-level values; per node 1 object + 10 values + 256 dependency strings.
  assert.equal(workGraph.VERIFIED_WORK_GRAPH_MAX_PLAIN_VALUES, WORK_GRAPH_MAX_PLAIN_VALUES);
  // The schema itself still refuses a 257th dependency and a 4097th node.
  const tooManyDependencies = maxWorkGraph(300, 256);
  tooManyDependencies.nodes[299].dependencies = Array.from({ length: 257 }, (_, index) => `n${index}`);
  assert.throws(() => workGraph.validateVerifiedWorkGraph(tooManyDependencies), /dependencies/);
  assert.throws(() => workGraph.validateVerifiedWorkGraph(maxWorkGraph(4097, 1)), /1-4096 nodes/);
});

test('B-1: a reference over its schema budget is a ValidationError; one at the budget still meets its schema validator', () => {
  // One shared node object and one shared 256-dependency array, 4096 times:
  // exactly the schema-maximum count of values on the snapshot's per-path count.
  const node = workGraphNode(1, Array.from({ length: 256 }, (_, index) => `d${index}`));
  const atBudget = workGraphDocument(new Array(4096).fill(node));
  assert.equal(plainValueCount(atBudget), WORK_GRAPH_MAX_PLAIN_VALUES);
  const b = withWorkGraphDigest(D('9'));
  // It fits the snapshot, so the work-graph schema validator runs on the copy and rejects it.
  assert.throws(() => checkWorkGraph(b, atBudget), error => error instanceof ValidationError
    && /duplicate node/.test(error.message) && !/plain data/.test(error.message));
  const overBudget = workGraphDocument(new Array(4096).fill(node));
  overBudget.subject_ref = [0];
  assert.equal(plainValueCount(overBudget), WORK_GRAPH_MAX_PLAIN_VALUES + 1);
  assert.throws(() => checkWorkGraph(b, overBudget), error => error instanceof ValidationError
    && /references\.verified_work_graph must be plain data; .* exceeds the node budget/.test(error.message));
  // The raised budget belongs to verified_work_graph alone; other references keep 50,000.
  const bigOutcome = { ...outcome(), task_ids: new Array(50_000).fill('task.demo.1') };
  assert.throws(() => validateSpecialistHarnessBridge(bridge(), { references: { outcome: bigOutcome } }),
    error => error instanceof ValidationError && /references\.outcome must be plain data; .* exceeds the node budget/.test(error.message));
});

test('B-1: a small schema-invalid work graph inside the budget is still rejected by the work-graph validator', () => {
  const graph = maxWorkGraph(8, 2);
  const digest = workGraph.verifiedWorkGraphDigest(graph);
  const b = withWorkGraphDigest(digest);
  assert.deepEqual([...checkWorkGraph(b, graph).references_checked], ['verified_work_graph']);
  const unknownDependency = structuredClone(graph);
  unknownDependency.nodes[7].dependencies = ['n6', 'missing'];
  assert.throws(() => checkWorkGraph(b, unknownDependency), error => error instanceof ValidationError && !/plain data/.test(error.message));
  const twoGoals = structuredClone(graph);
  twoGoals.nodes[7] = workGraphNode(0, []);
  twoGoals.nodes[7].node_id = 'n7';
  assert.throws(() => checkWorkGraph(b, twoGoals), /exactly one goal/);
});

function deepArgumentProposal(levels) {
  const provider = {
    provider_ref: 'provider.bridge.deep', profile_ref: 'profile.bridge.deep', artifact_ref: 'artifact.bridge.deep',
    runtime_ref: 'runtime.bridge.deep', revision_evidence: 'content-addressed', provider_mode: 'owner-local'
  };
  const manifest = proposals.createInertOperationManifestFixture();
  const candidates = manifest.operations.map(entry => ({ operation_id: entry.operation_id, eligible: true, eligibility_reason: 'eligible' }));
  const providerResult = proposals.normalizeGenericProviderResult({
    calls: [{ operation_id: manifest.operations[0].operation_id, arguments: { settings: 1 }, confidence: 0.8 }],
    suppressed: [], confidence: 0.8, latency_ms: 1, usage_evidence: null, explanation: null
  });
  const proposal = structuredClone(proposals.createSemanticOperationProposal({
    provider, manifest, candidates, request_digest: D('a'), state_digest: D('b'), state_classification: 'internal',
    candidate_mode: 'eligible-only', provider_result: providerResult, expected_provider_identity: provider,
    locality_policy: 'any', calibration_report_ref: null
  }));
  let value = 1;
  for (let index = 0; index < levels; index += 1) value = [value];
  (proposal.withheld[0] ?? proposal.proposed[0]).arguments = { settings: value };
  const { proposal_digest: _ignored, ...payload } = proposal;
  // Past the canonical depth guard no digest exists; a placeholder keeps the
  // document well-formed so the depth bound, not the digest, is what rejects it.
  try {
    proposal.proposal_digest = digestObject(payload);
  } catch (error) {
    if (!(error instanceof TypeError) || levels + 4 <= 2048) throw error;
    proposal.proposal_digest = D('9');
  }
  return proposal;
}

function nestingDepth(value) {
  // Container levels from the root, counted independently of the code under test.
  if (value === null || typeof value !== 'object') return 0;
  let deepest = 0;
  for (const item of Object.values(value)) deepest = Math.max(deepest, nestingDepth(item));
  return deepest + 1;
}

function bridgeFor(proposal) {
  return withBridge(x => { x.composition_binding.semantic_operation_proposal_digest = proposal.proposal_digest; });
}

test('B-1 contract depth: a parsed proposal at the 1,400-level bound passes both validators', () => {
  // deepArgumentProposal nests the argument value four levels below the root.
  const proposal = JSON.parse(JSON.stringify(deepArgumentProposal(1396)));
  assert.equal(nestingDepth(proposal), 1400);
  assert.equal(proposals.validateSemanticOperationProposal(proposal).valid, true);
  const result = validateSpecialistHarnessBridge(bridgeFor(proposal), { references: { semantic_operation_proposal: proposal } });
  assert.deepEqual([...result.references_checked], ['semantic_operation_proposal']);
});

test('B-1 contract depth: a parsed proposal one level over the bound, or deeper, is a ValidationError on both validators', () => {
  // 1397 is bound + 1; 1829 was the deepest Windows CI accepted; 2044 was the
  // deepest the canonical guard alone admitted; 2045, 2100, 3000 and 3200 are
  // Verifier's cases (all within 65,536 bytes).
  for (const levels of [1397, 1829, 1996, 2044, 2045, 2100, 3000, 3200]) {
    const proposal = JSON.parse(JSON.stringify(deepArgumentProposal(levels)));
    assert.equal(nestingDepth(proposal), levels + 4);
    assert.ok(Buffer.byteLength(JSON.stringify(proposal)) <= proposals.SEMANTIC_OPERATION_PROPOSAL_MAX_SERIALIZED_BYTES);
    assert.throws(() => proposals.validateSemanticOperationProposal(proposal),
      error => error instanceof ValidationError && /semantic operation proposal nesting exceeds 1400 levels/.test(error.message),
      `validator at ${levels}`);
    assert.throws(() => validateSpecialistHarnessBridge(bridgeFor(proposal), { references: { semantic_operation_proposal: proposal } }),
      error => error instanceof ValidationError && /exceeds the depth bound/.test(error.message),
      `bridge at ${levels}`);
  }
});

test('B-1 contract depth: the proposal reference snapshot budget is the contract bound, not the byte-derived 32,768', async () => {
  const source = readFileSync(new URL('../src/lib/specialist-harness-bridge.mjs', import.meta.url), 'utf8');
  assert.match(source, /semantic_operation_proposal: Object\.freeze\(\{ maxDepth: CANONICAL_JSON_MAX_CONTRACT_DEPTH - 1 \}\)/);
  const { CANONICAL_JSON_MAX_CONTRACT_DEPTH, CANONICAL_JSON_MAX_DEPTH } = await import('../src/lib/canonical.mjs');
  assert.equal(CANONICAL_JSON_MAX_CONTRACT_DEPTH, 1400);
  assert.equal(proposals.SEMANTIC_OPERATION_PROPOSAL_MAX_DEPTH, CANONICAL_JSON_MAX_CONTRACT_DEPTH);
  assert.ok(CANONICAL_JSON_MAX_DEPTH - CANONICAL_JSON_MAX_CONTRACT_DEPTH >= 32, 'headroom for wrappers');
});

// Builds the parsed JSON for a proposal whose document nests `depth` levels,
// without recursing (JSON.stringify could not serialize 32,004 levels).
function deepProposalJson(depth) {
  const text = JSON.stringify(deepArgumentProposal(1));
  const levels = depth - 4;
  const marker = '"settings":[1]';
  assert.equal(text.split(marker).length, 2);
  const proposal = JSON.parse(text.replace(marker, `"settings":${'['.repeat(levels)}1${']'.repeat(levels)}`));
  // A real digest where canonical JSON can compute one (up to 2,048 levels),
  // so only the depth bound stands between such a document and acceptance.
  const { proposal_digest: _stale, ...payload } = proposal;
  try { proposal.proposal_digest = digestObject(payload); } catch { /* past the canonical guard or the stack: stale digest */ }
  return proposal;
}

function iterativeDepth(value) {
  let deepest = 0;
  const pending = [[value, 1]];
  while (pending.length) {
    const [node, level] = pending.pop();
    if (node === null || typeof node !== 'object') continue;
    deepest = Math.max(deepest, level);
    for (const item of Object.values(node)) pending.push([item, level + 1]);
  }
  return deepest;
}

// Counts the reflective reads the depth walk (Reflect.ownKeys and
// Object.getOwnPropertyDescriptor, once per entered node and key), the
// canonicalizer (Object.getOwnPropertyNames) and the argument copy
// (structuredClone) make during one synchronous call.
function countReads(callback) {
  const counts = { ownKeys: 0, descriptors: 0, canonicalRecords: 0, structuredClone: 0 };
  const originals = {
    ownKeys: Reflect.ownKeys, descriptor: Object.getOwnPropertyDescriptor,
    names: Object.getOwnPropertyNames, clone: globalThis.structuredClone
  };
  Reflect.ownKeys = function ownKeys(target) { counts.ownKeys += 1; return originals.ownKeys(target); };
  Object.getOwnPropertyDescriptor = function getOwnPropertyDescriptor(target, key) {
    counts.descriptors += 1;
    return originals.descriptor(target, key);
  };
  Object.getOwnPropertyNames = function getOwnPropertyNames(target) { counts.canonicalRecords += 1; return originals.names(target); };
  globalThis.structuredClone = function structuredClone(...args) { counts.structuredClone += 1; return originals.clone(...args); };
  let outcome;
  try {
    outcome = { value: callback() };
  } catch (error) {
    outcome = { error };
  } finally {
    Reflect.ownKeys = originals.ownKeys;
    Object.getOwnPropertyDescriptor = originals.descriptor;
    Object.getOwnPropertyNames = originals.names;
    globalThis.structuredClone = originals.clone;
  }
  return { ...outcome, counts };
}

test('R-C: parsed JSON deeper than the 1,400-level bound is a ValidationError before any digest or structuredClone copy', () => {
  for (const depth of [1401, 2049, 3000, 10_000, 32_004]) {
    const proposal = deepProposalJson(depth);
    assert.equal(iterativeDepth(proposal), depth);
    const { error, counts } = countReads(() => proposals.validateSemanticOperationProposal(proposal));
    assert.ok(error instanceof ValidationError && error.message === 'semantic operation proposal nesting exceeds 1400 levels',
      `validator at ${depth}: ${error?.name} ${error?.message}`);
    // No canonicalize (digest) and no argument copy ran.
    assert.equal(counts.canonicalRecords, 0, `digest at ${depth}`);
    assert.equal(counts.structuredClone, 0, `copy at ${depth}`);
    assert.throws(() => validateSpecialistHarnessBridge(bridgeFor(proposal), { references: { semantic_operation_proposal: proposal } }),
      error => error instanceof ValidationError && /exceeds the depth bound/.test(error.message), `bridge at ${depth}`);
  }
  // At the bound the same construction is accepted (digest recomputed for it).
  const atBound = JSON.parse(JSON.stringify(deepArgumentProposal(1396)));
  assert.equal(iterativeDepth(atBound), 1400);
  assert.equal(proposals.validateSemanticOperationProposal(atBound).valid, true);
});

test('R-C: non-JSON values and unknown fields are rejected without walking their contents', () => {
  const baseline = countReads(() => proposals.validateSemanticOperationProposal(deepArgumentProposal(1)));
  assert.equal(baseline.value?.valid, true, String(baseline.error));
  const many = () => Array.from({ length: 1_000_000 }, () => ({}));
  const big = many();
  const { proxy: revoked, revoke } = Proxy.revocable({}, {});
  revoke();
  let trapCalls = 0;
  const trapping = new Proxy(big, Object.fromEntries(
    ['get', 'has', 'ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf'].map(name => [name, (...args) => { trapCalls += 1; return Reflect[name](...args); }])
  ));
  class Holder { constructor() { this.items = big; } }
  class Items extends Array {}
  const subclassed = Items.from(big);
  const overProxy = Object.create(trapping);
  overProxy.items = big;
  const getter = Object.defineProperty({}, 'items', { enumerable: true, get() { trapCalls += 1; return big; } });
  const argument = value => proposal => { (proposal.withheld[0] ?? proposal.proposed[0]).arguments = { settings: value }; };
  const cases = {
    'Uint8Array(1e7) argument': argument(new Uint8Array(10_000_000)),
    'unknown document field holding 1e6 objects': proposal => { proposal.extra = many(); },
    'unknown entry field holding 1e6 objects': proposal => { (proposal.withheld[0] ?? proposal.proposed[0]).extra = big; },
    'Map of 1e6 entries': argument(new Map(big.map((item, index) => [index, item]))),
    'Set of 1e6 objects': argument(new Set(big)),
    'class instance holding 1e6 objects': argument(new Holder()),
    'Array subclass of 1e6 objects': argument(subclassed),
    'Proxy over 1e6 objects': argument(trapping),
    'revoked Proxy': argument(revoked),
    'record whose prototype is a Proxy': argument(overProxy),
    'getter returning 1e6 objects': argument(getter)
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const proposal = deepArgumentProposal(1);
    mutate(proposal);
    trapCalls = 0;
    const { error, counts } = countReads(() => proposals.validateSemanticOperationProposal(proposal));
    // A ValidationError: unknown fields from the field-set checks, non-JSON
    // values from the fail-closed depth walk (#1927; was CanonicalJsonError).
    assert.ok(error instanceof ValidationError, `${name}: ${error}`);
    assert.equal(trapCalls, 0, `${name}: caller code ran`);
    // No more reflective reads than a small valid proposal needs: the 1e6 or
    // 1e7 contents were never entered.
    for (const key of ['ownKeys', 'descriptors', 'canonicalRecords']) {
      assert.ok(counts[key] <= baseline.counts[key], `${name}: ${key} ${counts[key]} > baseline ${baseline.counts[key]}`);
    }
  }
});

test('R-C/B-1: the depth walk fails closed on any non-JSON object, at the root or below, without entering it', async () => {
  const { assertContractDepth } = await import('../src/lib/canonical.mjs');
  let deep = 1;
  for (let index = 0; index < 5000; index += 1) deep = [deep];
  class Holder { constructor() { this.items = deep; } }
  class Items extends Array {}
  const foreign = vm.runInNewContext('({ record: {}, list: [] })');
  // Non-JSON containers are never treated as leaves: each is a ValidationError
  // the moment the walk meets it, before any of its keys are read.
  const nonJson = [new Holder(), Items.of(deep), new Map([[1, deep]]), new Set([deep]), new Uint8Array(4), new Date(0),
    Object.assign(Object.create(new Proxy({}, {})), { items: deep }), Object.assign(Object.create(Object.create(null)), { items: deep }),
    Object.assign(foreign.record, { items: deep }), foreign.list];
  for (const leaf of nonJson) {
    const label = Object.prototype.toString.call(leaf);
    const nested = countReads(() => assertContractDepth({ leaf }, 'doc'));
    assert.ok(nested.error instanceof ValidationError && /^doc must be plain JSON data \(found a non-JSON object\)$/.test(nested.error.message), label);
    assert.equal(nested.counts.ownKeys, 1, `${label}: only the parent's keys are read`);
    const root = countReads(() => assertContractDepth(leaf, 'doc'));
    assert.ok(root.error instanceof ValidationError && /found a non-JSON object/.test(root.error.message), `${label} as root`);
    assert.equal(root.counts.ownKeys, 0, `${label}: rejected before its keys are read`);
  }
  // JSON containers are walked: plain records, null-prototype records, arrays.
  for (const container of [{ items: deep }, Object.assign(Object.create(null), { items: deep }), [deep]]) {
    assert.throws(() => assertContractDepth({ container }, 'doc'), error => error instanceof ValidationError && /nesting exceeds 1400/.test(error.message));
    assert.throws(() => assertContractDepth(container, 'doc'), error => error instanceof ValidationError && /nesting exceeds 1400/.test(error.message));
  }
});

// The shapes Verifier found bypassing the bound at a6ffa6fe (#1927 B-1, B-2),
// each applied to a proposal whose arguments nest `levels` below the root.
function wrapperShapes() {
  const foreign = () => vm.runInNewContext('({ Object, Array })');
  class Klass {}
  class Items extends Array {}
  const copy = (target, source) => Object.assign(target, source);
  const entry = proposal => proposal.withheld[0] ? ['withheld', 0] : ['proposed', 0];
  return {
    // B-1: non-plain document roots.
    'root with a class prototype': p => Object.setPrototypeOf(p, Klass.prototype),
    'root with a cross-realm Object.prototype': p => Object.setPrototypeOf(p, foreign().Object.prototype),
    'root = Object.create(Object.create(null))': p => Object.setPrototypeOf(p, Object.create(null)),
    'root that is a Proxy': p => new Proxy(p, {}),
    // B-2: non-plain wrappers above the arguments.
    'entry that is a class instance': p => { const [l, i] = entry(p); p[l][i] = copy(new Klass(), p[l][i]); return p; },
    'entry that is cross-realm': p => { const [l, i] = entry(p); p[l][i] = copy(new (foreign().Object)(), p[l][i]); return p; },
    'entry that is a Proxy': p => { const [l, i] = entry(p); p[l][i] = new Proxy(p[l][i], {}); return p; },
    'entry with an accessor arguments': p => {
      const [l, i] = entry(p); const value = p[l][i].arguments;
      Object.defineProperty(p[l][i], 'arguments', { enumerable: true, get: () => value }); return p;
    },
    'arguments that are cross-realm': p => { const [l, i] = entry(p); p[l][i].arguments = copy(new (foreign().Object)(), p[l][i].arguments); return p; },
    'arguments = Object.create(Object.create(null))': p => { const [l, i] = entry(p); p[l][i].arguments = copy(Object.create(Object.create(null)), p[l][i].arguments); return p; },
    'arguments with a Proxy prototype': p => { const [l, i] = entry(p); p[l][i].arguments = copy(Object.create(new Proxy({}, {})), p[l][i].arguments); return p; },
    'list that is an Array subclass': p => { const [l] = entry(p); p[l] = Items.from(p[l]); return p; },
    'list that is cross-realm': p => { const [l] = entry(p); const list = new (foreign().Array)(); list.push(...p[l]); p[l] = list; return p; },
    'list with an accessor index': p => { const [l] = entry(p); const item = p[l][0]; Object.defineProperty(p[l], 0, { enumerable: true, get: () => item }); return p; }
  };
}

test('#1927 B-1/B-2: non-plain roots and wrappers cannot carry a parsed proposal past the bound (1,401 levels, default stack)', () => {
  for (const [name, wrap] of Object.entries(wrapperShapes())) {
    for (const depth of [1401, 2048]) {
      const proposal = wrap(deepProposalJson(depth));
      const { error, counts } = countReads(() => proposals.validateSemanticOperationProposal(proposal));
      assert.ok(error instanceof ValidationError && /must be plain JSON data/.test(error.message), `${name} at ${depth}: ${error?.name} ${error?.message}`);
      assert.equal(counts.structuredClone, 0, `${name}: no argument copy`);
      assert.equal(counts.canonicalRecords, 0, `${name}: no digest`);
    }
  }
});

test('#1927 residual (a): no caller getter or Proxy trap runs before the proposal is rejected', () => {
  let calls = 0;
  const counting = target => new Proxy(target, Object.fromEntries(
    ['get', 'has', 'ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf'].map(name => [name, (...args) => { calls += 1; return Reflect[name](...args); }])
  ));
  const getter = (object, key) => {
    const value = object[key];
    Object.defineProperty(object, key, { enumerable: true, configurable: true, get() { calls += 1; return value; } });
    return object;
  };
  const entry = proposal => proposal.withheld[0] ? ['withheld', 0] : ['proposed', 0];
  const cases = {
    'root field getter': p => getter(p, 'candidate_mode'),
    'root list getter': p => getter(p, entry(p)[0]),
    'provider field getter': p => { getter(p.provider, 'provider_ref'); return p; },
    'list index getter': p => { getter(p[entry(p)[0]], 0); return p; },
    'entry field getter': p => { const [l, i] = entry(p); getter(p[l][i], 'operation_id'); return p; },
    'arguments value getter': p => { const [l, i] = entry(p); getter(p[l][i].arguments, 'settings'); return p; },
    'counting Proxy root': p => counting(p),
    'counting Proxy provider': p => { p.provider = counting(p.provider); return p; },
    'counting Proxy list': p => { const [l] = entry(p); p[l] = counting(p[l]); return p; },
    'counting Proxy entry': p => { const [l, i] = entry(p); p[l][i] = counting(p[l][i]); return p; }
  };
  for (const [name, wrap] of Object.entries(cases)) {
    for (const depth of [5, 1401]) {
      const proposal = wrap(deepProposalJson(depth));
      calls = 0;
      assert.throws(() => proposals.validateSemanticOperationProposal(proposal),
        error => error instanceof ValidationError && /must be plain JSON data/.test(error.message), `${name} at ${depth}`);
      assert.equal(calls, 0, `${name} at ${depth}: caller code ran`);
    }
  }
});

test('#1927 B-1/B-2: the same shapes give a ValidationError, never a raw RangeError, at --stack-size=500 (1,700 and 2,000 levels)', () => {
  const source = readFileSync(new URL(import.meta.url), 'utf8')
    .replace("import test from 'node:test';", 'const test = () => {};')
    .replaceAll("from '../", `from '${new URL('../', import.meta.url).href}`);
  const script = `${source}
const results = {};
for (const [name, wrap] of Object.entries(wrapperShapes())) {
  for (const depth of [1700, 2000]) {
    try { proposals.validateSemanticOperationProposal(wrap(deepProposalJson(depth))); results[name + '@' + depth] = 'accepted'; }
    catch (error) { results[name + '@' + depth] = (error instanceof ValidationError ? 'ValidationError: ' : String(error?.name) + ': ') + String(error?.message).slice(0, 80); }
  }
}
process.stdout.write(JSON.stringify(results));
`;
  // Written to a file: the script is longer than Windows allows on a command line.
  const directory = mkdtempSync(join(tmpdir(), 'axiom-1927-'));
  const file = join(directory, 'stack-500.mjs');
  let output;
  try {
    writeFileSync(file, script);
    output = execFileSync(process.execPath, ['--stack-size=500', file], { encoding: 'utf8', maxBuffer: 1 << 24 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const results = JSON.parse(output);
  assert.equal(Object.keys(results).length, Object.keys(wrapperShapes()).length * 2);
  for (const [key, outcome] of Object.entries(results)) {
    assert.match(outcome, /^ValidationError: .*must be plain JSON data/, key);
  }
});

test('B-1: a semantic operation proposal with argument nesting deeper than 64 is accepted as before', () => {
  for (const levels of [100, 1000]) {
    const proposal = deepArgumentProposal(levels);
    const digest = proposals.validateSemanticOperationProposal(proposal).proposal_digest;
    const b = withBridge(x => { x.composition_binding.semantic_operation_proposal_digest = digest; });
    const result = validateSpecialistHarnessBridge(b, { references: { semantic_operation_proposal: proposal } });
    assert.deepEqual([...result.references_checked], ['semantic_operation_proposal'], String(levels));
  }
  // The proposal's own 65,536-byte bound still applies to the snapshot copy.
  const oversized = deepArgumentProposal(1);
  (oversized.withheld[0] ?? oversized.proposed[0]).arguments = { settings: 'x'.repeat(70_000) };
  const b = withBridge(x => { x.composition_binding.semantic_operation_proposal_digest = D('8'); });
  assert.throws(() => validateSpecialistHarnessBridge(b, { references: { semantic_operation_proposal: oversized } }),
    error => error instanceof ValidationError && !/plain data/.test(error.message));
});

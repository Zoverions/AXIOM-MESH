import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { autonomyEnvelopeDigest } from '../src/lib/autonomy-envelope.mjs';
import { ValidationError } from '../src/lib/canonical.mjs';
import { outcomeDigest, taskLifecycleDigest } from '../src/lib/agent-os-contracts.mjs';
import { executionRoutePolicyDigest } from '../src/lib/execution-route-policy.mjs';
import { taskContinuityPolicyDigest } from '../src/lib/task-continuity-policy.mjs';
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
    let reached = false;
    const schema = e.schema;
    Object.defineProperty(e, 'schema', { get() { reached = true; return schema; }, enumerable: true });
    assert.throws(() => validateSpecialistHarnessBridge(bridge(), { envelope: e }), /non-delegating/, label);
    assert.equal(reached, false, `envelope validator must not be reached (${label})`);
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

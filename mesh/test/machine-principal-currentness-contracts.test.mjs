import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';

const D = char => char.repeat(64);

function authority() {
  const profile = {
    id: 'agent.currentness.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-25T18:00:00.000Z',
    runtime: {
      id: 'runtime.currentness.local.1',
      kind: 'local-process',
      software_digest: D('a')
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 1_000,
        max_request_bytes: 32_768,
        max_response_bytes: 131_072
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  };
  return {
    schema: 'axiom-machine-principal.v1',
    ...profile,
    authority_digest: digestObject(profile)
  };
}

function mutationAuthorization(overrides = {}) {
  return {
    schema: 'axiom-machine-principal-mutation-authorization.v1',
    actor_id: 'owner.alice',
    target_principal_id: 'agent.currentness.1',
    target_principal_type: 'agent',
    root_authority_digest: D('1'),
    predecessor_lifecycle_seq: 1,
    predecessor_lifecycle_head_digest: D('2'),
    predecessor_authority_digest: D('3'),
    transition_kind: 'narrow',
    successor_authority_digest: D('4'),
    reason: 'owner-request',
    policy_version: '2026-08-16.1',
    policy_digest: D('5'),
    operation: 'machine.principal.lifecycle.mutate',
    intent_id: 'intent_' + D('6'),
    issued_at: '2026-09-25T17:00:00.000Z',
    effective_at: '2026-09-25T17:00:00.000Z',
    expires_at: '2026-09-25T17:00:30.000Z',
    command_id: 'machine_cmd_' + D('7'),
    ...overrides
  };
}

function transition(overrides = {}) {
  return {
    schema: 'axiom-machine-principal-lifecycle-transition.v1',
    principal_id: 'agent.currentness.1',
    principal_type: 'agent',
    root_authority_digest: D('1'),
    predecessor_lifecycle_seq: 1,
    predecessor_lifecycle_head_digest: D('2'),
    predecessor_authority_digest: D('3'),
    successor_lifecycle_seq: 2,
    successor_status: 'narrowed',
    successor_authority_digest: authority().authority_digest,
    successor_authority: authority(),
    command_id: 'machine_cmd_' + D('7'),
    command_digest: D('8'),
    mutation_authorization_digest: D('9'),
    actor_id: 'owner.alice',
    policy_version: '2026-08-16.1',
    policy_digest: D('5'),
    reason: 'owner-request',
    effective_at: '2026-09-25T17:00:00.000Z',
    ...overrides
  };
}

function projection(overrides = {}) {
  return {
    schema: 'axiom-machine-principal-currentness-projection.v1',
    principal_id: 'agent.currentness.1',
    principal_type: 'agent',
    root_authority_digest: D('1'),
    retained_status: 'narrowed',
    effective_status: 'narrowed',
    lifecycle_seq: 2,
    lifecycle_head_event_id: 'evt_machine_currentness_2',
    lifecycle_head_event_hash: D('a'),
    lifecycle_head_digest: D('b'),
    effective_authority_digest: authority().authority_digest,
    effective_authority: authority(),
    grid_chain_seq: 42,
    grid_chain_head: D('c'),
    observed_at: '2026-09-25T17:00:01.000Z',
    authority_effect: 'none',
    ...overrides
  };
}

function release(overrides = {}) {
  return {
    schema: 'axiom-machine-effect-release.v1',
    release_id: 'machine_release_' + D('d'),
    principal_id: 'agent.currentness.1',
    principal_type: 'agent',
    capability_id: 'cap_currentness_1',
    execution_attempt_id: 'attempt_currentness_1',
    sandbox_execution_epoch: 'sandbox_epoch_currentness_1',
    intent_id: 'intent_' + D('6'),
    plan_digest: D('e'),
    action: 'system.echo',
    destination: 'local',
    root_authority_digest: D('1'),
    lifecycle_seq: 2,
    lifecycle_head_digest: D('b'),
    effective_authority_digest: D('4'),
    consumption_receipt_digest: D('f'),
    released_at: '2026-09-25T17:00:02.000Z',
    authority_effect: 'exact-machine-effect-release',
    ...overrides
  };
}

async function contracts() {
  return import('../src/lib/machine-principal-currentness.mjs');
}

test('machine currentness v1 publishes fixed schema and event identifiers', async () => {
  const mod = await contracts();

  assert.equal(
    mod.MACHINE_MUTATION_AUTHORIZATION_SCHEMA,
    'axiom-machine-principal-mutation-authorization.v1'
  );
  assert.equal(
    mod.MACHINE_LIFECYCLE_TRANSITION_SCHEMA,
    'axiom-machine-principal-lifecycle-transition.v1'
  );
  assert.equal(
    mod.MACHINE_CURRENTNESS_PROJECTION_SCHEMA,
    'axiom-machine-principal-currentness-projection.v1'
  );
  assert.equal(
    mod.MACHINE_EFFECT_RELEASE_SCHEMA,
    'axiom-machine-effect-release.v1'
  );
  assert.deepEqual(mod.MACHINE_CURRENTNESS_EVENT_KINDS, [
    'machine.currentness.compromised',
    'machine.currentness.expired',
    'machine.currentness.initialized',
    'machine.currentness.narrowed',
    'machine.currentness.revoked'
  ]);
});

test('mutation authorization normalizer preserves exact signed mutation bindings', async () => {
  const mod = await contracts();
  const normalized = mod.normalizeMachineMutationAuthorization(
    mutationAuthorization()
  );

  assert.equal(normalized.actor_id, 'owner.alice');
  assert.equal(normalized.target_principal_id, 'agent.currentness.1');
  assert.equal(normalized.transition_kind, 'narrow');
  assert.equal(normalized.policy_version, '2026-08-16.1');
  assert.equal(normalized.policy_digest, D('5'));
  assert.equal(normalized.command_id, 'machine_cmd_' + D('7'));
  assert.ok(Object.isFrozen(normalized));
});

test('mutation authorization supports initialization with explicit null predecessor', async () => {
  const mod = await contracts();
  const normalized = mod.normalizeMachineMutationAuthorization(
    mutationAuthorization({
      predecessor_lifecycle_seq: null,
      predecessor_lifecycle_head_digest: null,
      predecessor_authority_digest: null,
      transition_kind: 'initialize',
      successor_authority_digest: D('1'),
      operation: 'machine.principal.lifecycle.initialize'
    })
  );

  assert.equal(normalized.predecessor_lifecycle_seq, null);
  assert.equal(normalized.transition_kind, 'initialize');
});

test('mutation authorization rejects unknown fields malformed time and invalid transition bindings', async () => {
  const mod = await contracts();

  assert.throws(
    () => mod.normalizeMachineMutationAuthorization({
      ...mutationAuthorization(),
      injected_authority: true
    }),
    /fields|unknown|unsupported/i
  );

  assert.throws(
    () => mod.normalizeMachineMutationAuthorization(
      mutationAuthorization({ expires_at: 'not-a-time' })
    ),
    /expires_at|timestamp|date/i
  );

  assert.throws(
    () => mod.normalizeMachineMutationAuthorization(
      mutationAuthorization({
        transition_kind: 'initialize',
        operation: 'machine.principal.lifecycle.mutate'
      })
    ),
    /operation|initialize|transition/i
  );
});

test('lifecycle transition normalizer binds predecessor successor command and policy evidence', async () => {
  const mod = await contracts();
  const normalized = mod.normalizeMachineLifecycleTransition(transition());

  assert.equal(normalized.predecessor_lifecycle_seq, 1);
  assert.equal(normalized.successor_lifecycle_seq, 2);
  assert.equal(normalized.successor_status, 'narrowed');
  assert.equal(normalized.command_digest, D('8'));
  assert.equal(normalized.mutation_authorization_digest, D('9'));
  assert.ok(Object.isFrozen(normalized));
});

test('lifecycle transition rejects skipped sequence and unknown fields', async () => {
  const mod = await contracts();

  assert.throws(
    () => mod.normalizeMachineLifecycleTransition(
      transition({ successor_lifecycle_seq: 3 })
    ),
    /sequence|successor/i
  );

  assert.throws(
    () => mod.normalizeMachineLifecycleTransition({
      ...transition(),
      ambient_authority: 'no'
    }),
    /fields|unknown|unsupported/i
  );
});

test('currentness projection separates retained status from effective natural expiry', async () => {
  const mod = await contracts();
  const normalized = mod.normalizeMachineCurrentnessProjection(
    projection({
      retained_status: 'narrowed',
      effective_status: 'expired'
    })
  );

  assert.equal(normalized.retained_status, 'narrowed');
  assert.equal(normalized.effective_status, 'expired');
  assert.equal(normalized.authority_effect, 'none');
  assert.ok(Object.isFrozen(normalized));
});

test('currentness projection rejects zero sequence malformed chain binding and authority-bearing claim', async () => {
  const mod = await contracts();

  assert.throws(
    () => mod.normalizeMachineCurrentnessProjection(
      projection({ lifecycle_seq: 0 })
    ),
    /lifecycle_seq|sequence/i
  );

  assert.throws(
    () => mod.normalizeMachineCurrentnessProjection(
      projection({ grid_chain_head: 'not-a-digest' })
    ),
    /grid_chain_head|digest/i
  );

  assert.throws(
    () => mod.normalizeMachineCurrentnessProjection(
      projection({ authority_effect: 'grant' })
    ),
    /authority_effect|none/i
  );
});

test('effect release normalizer binds exact capability attempt epoch and currentness', async () => {
  const mod = await contracts();
  const normalized = mod.normalizeMachineEffectRelease(release());

  assert.equal(normalized.capability_id, 'cap_currentness_1');
  assert.equal(normalized.execution_attempt_id, 'attempt_currentness_1');
  assert.equal(normalized.sandbox_execution_epoch, 'sandbox_epoch_currentness_1');
  assert.equal(normalized.lifecycle_seq, 2);
  assert.equal(normalized.authority_effect, 'exact-machine-effect-release');
  assert.ok(Object.isFrozen(normalized));
});

test('effect release rejects missing attempt and unknown fields', async () => {
  const mod = await contracts();

  const missingAttempt = release();
  delete missingAttempt.execution_attempt_id;
  assert.throws(
    () => mod.normalizeMachineEffectRelease(missingAttempt),
    /execution_attempt_id|fields/i
  );

  assert.throws(
    () => mod.normalizeMachineEffectRelease({
      ...release(),
      reusable_bearer: true
    }),
    /fields|unknown|unsupported/i
  );
});

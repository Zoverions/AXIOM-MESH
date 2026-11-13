import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AUTHORITY_VERIFIABILITY_NOTICE,
  AUTHORITY_VERIFIABILITY_SCHEMA,
  evaluateAuthorityVerifiability
} from '../src/lib/authority-verifiability-gate.mjs';

const POLICY_DIGEST = 'a'.repeat(64);

function request(overrides = {}) {
  return {
    request_id: 'verify.request.1',
    principal_id: 'agent.verify.1',
    action: 'system.echo',
    risk: 'low',
    effect_destination: 'local',
    authority_level: 1,
    autonomy_level: 1,
    novelty_signals: [],
    external_agent_interaction: false,
    self_modification: false,
    ...overrides
  };
}

function evidence(overrides = {}) {
  return {
    policy_binding_digest: POLICY_DIGEST,
    identity_current: true,
    delegation_current: true,
    evidence_bound: true,
    monitorability_level: 1,
    independent_monitor: false,
    independent_evaluator: false,
    human_authorization_present: false,
    rollback_available: false,
    rollback_tested: false,
    ...overrides
  };
}

test('low-risk bounded authority is eligible when V1 evidence is sufficient', () => {
  const result = evaluateAuthorityVerifiability({ request: request(), evidence: evidence() });

  assert.equal(result.schema, AUTHORITY_VERIFIABILITY_SCHEMA);
  assert.equal(result.notice, AUTHORITY_VERIFIABILITY_NOTICE);
  assert.equal(result.decision, 'eligible');
  assert.equal(result.requirements.monitorability_level, 1);
  assert.equal(result.requirements.max_lease_ms, 900_000);
  assert.equal(result.semantics.grants_execution_authority, false);
  assert.equal(result.semantics.mints_capability, false);
  assert.equal(result.semantics.requires_downstream_authorization, true);
  assert.match(result.decision_digest, /^[a-f0-9]{64}$/);
});

test('novel authority holds when monitorability is below the escalated requirement', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ novelty_signals: ['tool'] }),
    evidence: evidence({ monitorability_level: 1 })
  });

  assert.equal(result.decision, 'hold');
  assert.equal(result.requirements.monitorability_level, 2);
  assert.deepEqual(result.reasons, ['monitorability_below_requirement']);
});

test('three novelty signals escalate monitorability by two classes', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ novelty_signals: ['counterparty', 'environment', 'tool'] }),
    evidence: evidence({ monitorability_level: 2 })
  });

  assert.equal(result.requirements.monitorability_level, 3);
  assert.equal(result.decision, 'hold');
});

test('external-agent interaction denies inconsistent omission of counterparty novelty', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ external_agent_interaction: true }),
    evidence: evidence({ monitorability_level: 2, independent_monitor: true })
  });

  assert.equal(result.decision, 'deny');
  assert.deepEqual(result.reasons, ['counterparty_novelty_signal_required']);
});

test('external-agent interaction holds without an independent monitor', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({
      novelty_signals: ['counterparty'],
      external_agent_interaction: true
    }),
    evidence: evidence({ monitorability_level: 2 })
  });

  assert.equal(result.decision, 'hold');
  assert.deepEqual(result.reasons, ['independent_monitor_required']);
});

test('high authority holds without an independent monitor', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ risk: 'high', authority_level: 4 }),
    evidence: evidence({ monitorability_level: 3 })
  });

  assert.equal(result.decision, 'hold');
  assert.ok(result.reasons.includes('independent_monitor_required'));
});

test('critical authority denies without independent evaluator and human authorization', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ risk: 'critical', authority_level: 4, autonomy_level: 4 }),
    evidence: evidence({ monitorability_level: 4, independent_monitor: true })
  });

  assert.equal(result.decision, 'deny');
  assert.deepEqual(result.reasons, [
    'human_authorization_required',
    'independent_evaluator_required'
  ]);
});

test('critical authority is eligible only after all v0 verifiability gates pass', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ risk: 'critical', authority_level: 4, autonomy_level: 4 }),
    evidence: evidence({
      monitorability_level: 4,
      independent_monitor: true,
      independent_evaluator: true,
      human_authorization_present: true
    })
  });

  assert.equal(result.decision, 'eligible');
  assert.equal(result.requirements.max_lease_ms, 15_000);
  assert.equal(result.semantics.authority_effect, 'none');
});

test('self-modification requires V4, independent monitor/evaluator, human authorization and tested rollback', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ self_modification: true }),
    evidence: evidence({ monitorability_level: 4, independent_monitor: true })
  });

  assert.equal(result.decision, 'deny');
  assert.equal(result.requirements.monitorability_level, 4);
  assert.equal(result.requirements.max_lease_ms, 15_000);
  assert.deepEqual(result.reasons, [
    'human_authorization_required',
    'independent_evaluator_required',
    'rollback_available_required',
    'rollback_test_required'
  ]);
});

test('self-modification becomes eligible only with independent evaluation and tested rollback evidence', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ self_modification: true }),
    evidence: evidence({
      monitorability_level: 4,
      independent_monitor: true,
      independent_evaluator: true,
      human_authorization_present: true,
      rollback_available: true,
      rollback_tested: true
    })
  });

  assert.equal(result.decision, 'eligible');
  assert.equal(result.requirements.independent_evaluator_required, true);
  assert.equal(result.requirements.rollback_tested_required, true);
});

test('stale or unbound authority evidence is denied with explicit reasons', () => {
  const cases = [
    [{ identity_current: false }, 'identity_currentness_required'],
    [{ delegation_current: false }, 'delegation_currentness_required'],
    [{ evidence_bound: false }, 'evidence_binding_required']
  ];

  for (const [patch, reason] of cases) {
    const result = evaluateAuthorityVerifiability({
      request: request(),
      evidence: evidence(patch)
    });
    assert.equal(result.decision, 'deny');
    assert.deepEqual(result.reasons, [reason]);
  }
});

test('novelty signals must be sorted, unique and known', () => {
  for (const noveltySignals of [
    ['tool', 'environment'],
    ['tool', 'tool'],
    ['unknown-signal']
  ]) {
    assert.throws(
      () => evaluateAuthorityVerifiability({
        request: request({ novelty_signals: noveltySignals }),
        evidence: evidence()
      }),
      /novelty/
    );
  }
});

test('unknown request and evidence fields fail closed', () => {
  assert.throws(
    () => evaluateAuthorityVerifiability({
      request: request({ surprise: true }),
      evidence: evidence()
    }),
    /unsupported field/
  );

  assert.throws(
    () => evaluateAuthorityVerifiability({
      request: request(),
      evidence: evidence({ surprise: true })
    }),
    /unsupported field/
  );
});

test('decision digest changes when bound evidence changes', () => {
  const first = evaluateAuthorityVerifiability({ request: request(), evidence: evidence() });
  const second = evaluateAuthorityVerifiability({
    request: request(),
    evidence: evidence({ policy_binding_digest: 'b'.repeat(64) })
  });

  assert.notEqual(first.decision_digest, second.decision_digest);
});

test('v0 source remains effect-inert and non-authorizing', async () => {
  const source = await readFile(
    new URL('../src/lib/authority-verifiability-gate.mjs', import.meta.url),
    'utf8'
  );

  for (const forbidden of [
    'child_process',
    'node:net',
    'node:http',
    'node:https',
    'node:fs',
    'createCapability',
    'consumeCapability',
    'executeTool',
    'createMachineIdentityCredential',
    'PolicyEngine'
  ]) {
    assert.equal(source.includes(forbidden), false, `source must not include ${forbidden}`);
  }
});

test('published schema preserves the non-authorizing v0 boundary', async () => {
  const raw = await readFile(
    new URL('../../agent-commons/contracts/authority-verifiability-decision.v1.schema.json', import.meta.url),
    'utf8'
  );
  const schema = JSON.parse(raw);

  assert.equal(schema.$id, 'https://axiom.invalid/contracts/authority-verifiability-decision.v1.schema.json');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.decision.enum, ['deny', 'hold', 'eligible']);
  assert.equal(schema.properties.semantics.properties.grants_execution_authority.const, false);
  assert.equal(schema.properties.semantics.properties.mints_capability.const, false);
  assert.equal(schema.properties.semantics.properties.requires_downstream_authorization.const, true);
  assert.equal(schema.properties.decision_digest.pattern, '^[a-f0-9]{64}$');
});

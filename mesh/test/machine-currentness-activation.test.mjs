import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { meshConfig } from '../src/lib/config.mjs';
import {
  createMachineCurrentnessActivationGate
} from '../src/hypervisor/machine-currentness-activation.mjs';

const D = character => character.repeat(64);
const R = character => character.repeat(40);

function report(runtimeGeneration = 'runtime_generation_test_0123456789') {
  const body = {
    schema: 'axiom-machine-currentness-production-preflight-report.v1',
    ready: true,
    blockers: [],
    runtime_generation: runtimeGeneration,
    source_revision: R('a'),
    policy_version: 'policy.test.v1',
    policy_digest: D('b'),
    grid_snapshot: {
      schema_version: 12,
      last_seq: 7,
      last_hash: D('c'),
      snapshot_digest: digestObject({
        schema_version: 12,
        last_seq: 7,
        last_hash: D('c')
      })
    },
    configured_principal_count: 0,
    retained_projection_count: 0,
    configured_set_digest: D('d'),
    retained_set_digest: D('d'),
    evaluation: { schema: 'axiom-machine-currentness-production-preflight-evaluation.v1' },
    semantics: {
      production_activation_authorized: false,
      registry_mutation_authorized: false,
      grid_mutation_authorized: false,
      execution_authorized: false,
      deployment_authorized: false,
      promotion_authorized: false,
      authority_effect: 'none'
    }
  };
  return { ...body, report_digest: digestObject(body) };
}

function currentGrid() {
  return {
    mode: 'single-node-transparency-log',
    consensus: false,
    schema_version: 12,
    last_seq: 7,
    last_hash: D('c')
  };
}

test('one exact current-generation report activates enforcement once without granting authority', () => {
  const gate = createMachineCurrentnessActivationGate({
    enabled: true,
    expectedSourceRevision: R('a'),
    runtimeGeneration: 'runtime_generation_test_0123456789'
  });
  assert.equal(gate.ready, false);
  assert.throws(() => gate.assertEffective(), error => (
    error?.code === 'machine_currentness_preflight_required'
  ));

  const candidate = report(gate.runtimeGeneration);
  gate.recordPreflight(candidate);
  const activation = gate.activate({
    reportDigest: candidate.report_digest,
    policyVersion: 'policy.test.v1',
    policyDigest: D('b'),
    gridStatus: currentGrid()
  });

  assert.equal(gate.ready, true);
  assert.equal(gate.assertEffective(), activation);
  assert.equal(activation.schema, 'axiom-machine-currentness-enforcement-activation.v1');
  assert.equal(activation.runtime_generation, gate.runtimeGeneration);
  assert.equal(activation.report_digest, candidate.report_digest);
  assert.equal(activation.enforcement_effect, 'enabled');
  assert.equal(activation.authority_effect, 'none');
  assert.match(activation.activation_digest, /^[a-f0-9]{64}$/);
  assert.throws(
    () => gate.activate({
      reportDigest: candidate.report_digest,
      policyVersion: 'policy.test.v1',
      policyDigest: D('b'),
      gridStatus: currentGrid()
    }),
    error => error?.code === 'machine_currentness_preflight_replayed'
  );
});

test('wrong revision policy Grid head substitution and prior-generation replay fail closed', () => {
  const cases = [
    {
      name: 'source revision',
      configure: { expectedSourceRevision: R('e') },
      expected: 'machine_currentness_preflight_wrong_revision'
    },
    {
      name: 'policy digest',
      activate: { policyDigest: D('e') },
      expected: 'machine_currentness_preflight_wrong_policy'
    },
    {
      name: 'Grid head',
      activate: { gridStatus: { ...currentGrid(), last_seq: 8, last_hash: D('e') } },
      expected: 'machine_currentness_preflight_stale_grid'
    },
    {
      name: 'report substitution',
      activate: { reportDigest: D('e') },
      expected: 'machine_currentness_preflight_substituted'
    }
  ];

  for (const current of cases) {
    const gate = createMachineCurrentnessActivationGate({
      enabled: true,
      expectedSourceRevision: current.configure?.expectedSourceRevision ?? R('a'),
      runtimeGeneration: 'runtime_generation_test_0123456789'
    });
    const candidate = report(gate.runtimeGeneration);
    gate.recordPreflight(candidate);
    assert.throws(
      () => gate.activate({
        reportDigest: candidate.report_digest,
        policyVersion: 'policy.test.v1',
        policyDigest: D('b'),
        gridStatus: currentGrid(),
        ...current.activate
      }),
      error => error?.code === current.expected,
      current.name
    );
    assert.equal(gate.ready, false);
  }

  const restarted = createMachineCurrentnessActivationGate({
    enabled: true,
    expectedSourceRevision: R('a'),
    runtimeGeneration: 'runtime_generation_restart_9876543210'
  });
  const old = report('runtime_generation_test_0123456789');
  assert.throws(
    () => restarted.recordPreflight(old),
    error => error?.code === 'machine_currentness_preflight_wrong_generation'
  );
  assert.equal(restarted.ready, false);
});

test('disabled development gate remains a no-op without creating activation evidence', () => {
  const gate = createMachineCurrentnessActivationGate({ enabled: false });
  assert.equal(gate.ready, true);
  assert.equal(gate.assertEffective(), null);
  assert.throws(
    () => gate.recordPreflight(report('runtime_generation_test_0123456789')),
    error => error?.code === 'machine_currentness_preflight_not_required'
  );
});

test('production enforcement requires an exact source revision and cannot disable preflight activation', () => {
  const production = {
    environment: 'production',
    autoBootstrap: false,
    internalTlsEnabled: true,
    transportDir: '/tmp/axiom-test-transport',
    hypervisorUrl: 'https://hypervisor.internal',
    sandboxUrl: 'https://sandbox.internal',
    gridUrl: 'https://grid.internal',
    machineCurrentnessEnforcement: true
  };
  assert.throws(
    () => meshConfig(production),
    /source revision/i
  );
  const config = meshConfig({
    ...production,
    machineCurrentnessSourceRevision: R('a'),
    machineCurrentnessPreflightRequired: false
  });
  assert.equal(config.machineCurrentnessSourceRevision, R('a'));
  assert.equal(config.machineCurrentnessPreflightRequired, true);

  const development = meshConfig({
    environment: 'test',
    machineCurrentnessEnforcement: true
  });
  assert.equal(development.machineCurrentnessPreflightRequired, false);
});

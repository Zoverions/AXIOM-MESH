import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PolicyEngine,
  mergeDenyDominantPolicy,
  validatePolicy
} from '../src/lib/policy.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { buildMachineDiscovery } from '../src/lib/machine-discovery.mjs';
import {
  createIncidentPlan,
  loadIncidentResponsePolicy
} from '../src/incident-response.mjs';
import {
  loadEducationContract,
  validateEducationIntent
} from '../src/domain/education-contract.mjs';

function allowedRule(overrides = {}) {
  return {
    decision: 'allow',
    risk: 'low',
    required_scopes: ['intent:execute'],
    tool: 'builtin.echo',
    ...overrides
  };
}

function machineDefinition(overrides = {}) {
  return {
    id: 'agent.audit-hardening',
    type: 'agent',
    sponsor: 'owner.audit-hardening',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.audit-hardening',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 1_000,
        max_request_bytes: 8_192,
        max_response_bytes: 16_384
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    ...overrides
  };
}

function machine(overrides = {}) {
  return normalizeMachinePrincipalDefinition(machineDefinition(overrides));
}

test('policy and machine action identifiers reject prototype collisions', () => {
  assert.throws(() => validatePolicy({
    version: 'prototype-collision',
    actions: {
      constructor: allowedRule()
    }
  }), /prototype|reserved|action/i);

  const definition = machineDefinition();
  definition.constraints.actions = ['constructor'];
  assert.throws(
    () => normalizeMachinePrincipalDefinition(definition),
    /prototype|reserved|actions/i
  );
});

test('policy risk validation rejects inherited Object prototype names', () => {
  assert.throws(() => validatePolicy({
    version: 'prototype-risk',
    actions: {
      'system.echo': allowedRule({ risk: 'constructor' })
    }
  }), /Invalid risk/);
});

test('machine scope grammar rejects unsupported glob syntax', () => {
  const definition = machineDefinition();
  definition.id = 'agent.glob-scope';
  definition.sponsor = 'owner.glob-scope';
  definition.runtime.id = 'runtime.glob-scope';
  definition.runtime.software_digest = 'b'.repeat(64);
  definition.scopes = ['audit:*'];
  assert.throws(
    () => normalizeMachinePrincipalDefinition(definition),
    /wildcard scope|glob/i
  );
});

test('explicit policy denial precedes missing-scope diagnostics', () => {
  const engine = new PolicyEngine({
    version: 'deny-before-scope',
    actions: {
      'system.echo': {
        decision: 'deny',
        risk: 'high',
        required_scopes: ['secret:scope'],
        code: 'policy_denied',
        reason: 'Explicitly disabled.'
      }
    }
  });
  const result = engine.evaluate({
    action: 'system.echo',
    principal: { scopes: [] },
    intent: {}
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'policy_denied');
  assert.equal(Object.hasOwn(result, 'missing_scopes'), false);
  assert.doesNotMatch(result.reason, /secret:scope/);
});

test('deny-dominant merge returns a policy that passes full validation', () => {
  const merged = mergeDenyDominantPolicy([
    {
      version: 'base',
      actions: {
        'system.echo': allowedRule()
      }
    },
    {
      version: 'overlay',
      actions: {
        'system.echo': allowedRule({
          risk: 'high',
          requires_independent_approval: true,
          required_confirmations: 1,
          required_confirmation_values: ['confirm:system.echo']
        })
      }
    }
  ]);
  assert.doesNotThrow(() => validatePolicy(merged));
  assert.equal(merged.actions['system.echo'].risk, 'high');
  assert.equal(merged.actions['system.echo'].requires_independent_approval, true);
});

test('machine discovery never resolves inherited policy action properties', () => {
  const principal = machine();
  const engine = new PolicyEngine({
    version: 'discovery-own-only',
    actions: {
      'system.echo': allowedRule()
    }
  });

  // Simulate a corrupted already-normalized principal so this test exercises
  // discovery's own-property boundary rather than only principal validation.
  principal.constraints.actions = ['constructor', 'system.echo'];
  const discovery = buildMachineDiscovery({
    principal,
    policy: engine,
    kernelVersion: '0.12.0-dev.3'
  });
  assert.deepEqual(discovery.actions.map(item => item.id), ['system.echo']);
});

test('education intent validation rejects inherited contract action properties', async () => {
  const contract = await loadEducationContract();
  assert.throws(
    () => validateEducationIntent(contract, 'constructor', {}),
    /unknown education action constructor/
  );
});

test('incident plans reject inherited action-map names after canonical validation', async () => {
  const policy = await loadIncidentResponsePolicy();
  const severity = policy.severities['SEV-1'];
  const roles = Object.fromEntries(policy.required_roles.map(role => [
    role,
    `exercise-role:${role.replaceAll('_', '-')}`
  ]));

  assert.throws(() => createIncidentPlan(policy, {
    incidentId: 'incident_abcdefgh',
    sourceRevision: 'a'.repeat(40),
    declaredAt: '2026-08-10T00:00:00.000Z',
    signals: [severity.triggers[0]],
    affectedAssetClasses: ['service_identity'],
    roles,
    actions: [...severity.required_actions, 'constructor']
  }), /Incident plan action is unknown: constructor/);
});

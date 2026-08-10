import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PolicyEngine,
  mergeDenyDominantPolicy,
  validatePolicy
} from '../src/lib/policy.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { buildMachineDiscovery } from '../src/lib/machine-discovery.mjs';
import { createIncidentPlan } from '../src/incident-response.mjs';

function allowedRule(overrides = {}) {
  return {
    decision: 'allow',
    risk: 'low',
    required_scopes: ['intent:execute'],
    tool: 'builtin.echo',
    ...overrides
  };
}

function machine(overrides = {}) {
  return normalizeMachinePrincipalDefinition({
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
  });
}

test('policy and machine action identifiers reject prototype collisions', () => {
  assert.throws(() => validatePolicy({
    version: 'prototype-collision',
    actions: {
      constructor: allowedRule()
    }
  }), /prototype|reserved|action/i);

  assert.throws(() => machine({
    constraints: {
      ...machine().constraints,
      actions: ['constructor']
    }
  }), /prototype|reserved|actions/i);
});

test('machine scope grammar rejects unsupported glob syntax', () => {
  assert.throws(() => normalizeMachinePrincipalDefinition({
    id: 'agent.glob-scope',
    type: 'agent',
    sponsor: 'owner.glob-scope',
    roles: ['researcher'],
    scopes: ['audit:*'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.glob-scope',
      kind: 'local-process',
      software_digest: 'b'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      delegation: { allowed: false, max_depth: 0 }
    }
  }), /wildcard scope|glob/i);
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
  const policyObject = {
    version: 'discovery-own-only',
    actions: {
      'system.echo': allowedRule()
    }
  };
  const engine = new PolicyEngine(policyObject);
  principal.constraints.actions = ['constructor', 'system.echo'];
  const discovery = buildMachineDiscovery({
    principal,
    policy: engine,
    kernelVersion: '0.12.0-dev.3'
  });
  assert.deepEqual(discovery.actions.map(item => item.id), ['system.echo']);
});

test('incident plans reject inherited action-map names', () => {
  const policy = {
    schema: 'axiom-incident-response-policy.v1',
    version: 1,
    severity_order: ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'],
    required_roles: [
      'incident_commander',
      'security_lead',
      'operations_lead',
      'communications_lead',
      'evidence_custodian',
      'independent_reviewer'
    ],
    closure_requirements: [
      'containment_verified',
      'recovery_verified',
      'evidence_manifested',
      'communications_recorded',
      'retrospective_scheduled',
      'independent_review_required'
    ],
    actions: {
      declare_incident: {
        category: 'communicate',
        authority_effect: 'communicate',
        owner_role: 'incident_commander'
      }
    },
    severities: {
      'SEV-1': { label: 'critical', activation_minutes: 1, containment_target_minutes: 1, update_interval_minutes: 1, triggers: ['evidence_integrity_failure'], required_actions: ['declare_incident'] },
      'SEV-2': { label: 'high', activation_minutes: 2, containment_target_minutes: 2, update_interval_minutes: 2, triggers: ['sev2_signal'], required_actions: ['declare_incident'] },
      'SEV-3': { label: 'moderate', activation_minutes: 3, containment_target_minutes: 3, update_interval_minutes: 3, triggers: ['sev3_signal'], required_actions: ['declare_incident'] },
      'SEV-4': { label: 'low', activation_minutes: 4, containment_target_minutes: 4, update_interval_minutes: 4, triggers: ['sev4_signal'], required_actions: ['declare_incident'] }
    },
    frameworks: {
      nist: 'NIST CSF 2.0',
      iso: 'ISO/IEC 27035'
    }
  };

  // This fixture is deliberately incomplete for the full policy validator; the
  // assertion targets the map-access rule directly through createIncidentPlan.
  assert.throws(() => createIncidentPlan(policy, {
    incidentId: 'incident_abcdefgh',
    sourceRevision: 'a'.repeat(40),
    declaredAt: '2026-08-10T00:00:00.000Z',
    signals: ['evidence_integrity_failure'],
    affectedAssetClasses: ['service_identity'],
    roles: {
      incident_commander: 'exercise-role:commander',
      security_lead: 'exercise-role:security',
      operations_lead: 'exercise-role:operations',
      communications_lead: 'exercise-role:communications',
      evidence_custodian: 'exercise-role:evidence',
      independent_reviewer: 'exercise-role:reviewer'
    },
    actions: ['constructor']
  }), /unknown|missing required actions|invalid/i);
});

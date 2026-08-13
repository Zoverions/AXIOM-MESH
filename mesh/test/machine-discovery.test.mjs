import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import {
  buildMachineDiscovery,
  MACHINE_DISCOVERY_NOTICE,
  validateMachineDiscovery
} from '../src/lib/machine-discovery.mjs';
import { mergeDenyDominantPolicy, PolicyEngine } from '../src/lib/policy.mjs';

function machine({
  actions = ['system.echo', 'system.hash'],
  scopes = ['intent:execute'],
  destinations = ['local']
} = {}) {
  return normalizeMachinePrincipalDefinition({
    id: 'agent.discovery-test',
    type: 'agent',
    sponsor: 'owner.discovery-test',
    roles: ['researcher'],
    scopes,
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.discovery-test',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions,
      purposes: ['research.read', 'test.conformance'],
      destinations,
      budgets: {
        max_requests_per_minute: 12,
        max_concurrent_requests: 2,
        max_execution_ms: 1_500,
        max_request_bytes: 8_192,
        max_response_bytes: 16_384
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  });
}

function engine(policy = basePolicy()) {
  return new PolicyEngine(policy, {
    layers: [{ order: 0, version: policy.version, digest: 'b'.repeat(64) }]
  });
}

function basePolicy() {
  return {
    version: 'discovery-test-v1',
    defaults: {},
    actions: {
      'system.echo': {
        decision: 'allow',
        risk: 'low',
        required_scopes: ['intent:execute'],
        tool: 'builtin.echo',
        timeout_ms: 5_000
      },
      'system.hash': {
        decision: 'allow',
        risk: 'high',
        required_scopes: ['intent:execute'],
        required_confirmations: 1,
        required_confirmation_values: ['confirm:system.hash'],
        requires_independent_approval: true,
        tool: 'builtin.hash',
        timeout_ms: 2_000
      },
      'memory.put': {
        decision: 'allow',
        risk: 'medium',
        required_scopes: ['memory:write'],
        tool: 'builtin.validate-mutation'
      },
      'ai.infer': {
        decision: 'allow',
        risk: 'medium',
        required_scopes: ['intent:execute'],
        tool: 'provider.openai'
      },
      'chain.submit': {
        decision: 'deny',
        risk: 'critical',
        required_scopes: ['intent:execute'],
        reason: 'disabled'
      }
    }
  };
}

test('machine discovery exposes only requestable intersection and never grants authority', () => {
  const discovery = buildMachineDiscovery({
    principal: machine({ actions: ['system.echo', 'system.hash', 'memory.put', 'ai.infer', 'chain.submit'] }),
    policy: engine(),
    kernelVersion: '0.12.0-dev.3'
  });

  assert.equal(discovery.schema, 'axiom-machine-discovery.v1');
  assert.equal(discovery.notice, MACHINE_DISCOVERY_NOTICE);
  assert.deepEqual(discovery.actions.map(action => action.id), ['system.echo', 'system.hash']);
  assert.deepEqual(discovery.purposes, ['research.read', 'test.conformance']);
  assert.deepEqual(discovery.destinations, ['local']);
  assert.equal(discovery.principal.id, 'agent.discovery-test');
  assert.equal(discovery.principal.sponsor, 'owner.discovery-test');
  assert.match(discovery.principal.authority_digest, /^[a-f0-9]{64}$/);
  assert.equal(discovery.limits.max_execution_ms, 1_500);
  assert.equal(discovery.limits.delegation_allowed, false);
  assert.equal(discovery.actions[0].effect_destination, 'local');
  assert.equal(discovery.actions[0].timeout_ms, 1_500);
  assert.equal(discovery.actions[1].requires_independent_approval, true);
  assert.deepEqual(discovery.actions[1].required_confirmation_values, ['confirm:system.hash']);
  assert.match(discovery.digest, /^[a-f0-9]{64}$/);
  assert.equal(validateMachineDiscovery(discovery), discovery);
  assert.deepEqual(Object.keys(discovery.policy).sort(), ['digest', 'version']);
  assert.equal(JSON.stringify(discovery).includes('Bearer '), false);
  assert.equal(JSON.stringify(discovery).includes('memory.put'), false);
  assert.equal(JSON.stringify(discovery).includes('provider.openai'), false);
  assert.equal(JSON.stringify(discovery).includes('chain.submit'), false);
});

test('machine discovery removes actions blocked by active deny-dominant overlay', () => {
  const base = basePolicy();
  const overlay = {
    version: 'overlay-deny-hash',
    defaults: {},
    actions: {
      'system.hash': {
        decision: 'deny',
        risk: 'high',
        reason: 'temporarily disabled'
      }
    }
  };
  const merged = mergeDenyDominantPolicy([base, overlay]);
  const discovery = buildMachineDiscovery({
    principal: machine(),
    policy: new PolicyEngine(merged, {
      layers: [
        { order: 0, version: base.version, digest: digestObject(base) },
        { order: 1, version: overlay.version, digest: digestObject(overlay) }
      ]
    }),
    kernelVersion: '0.12.0-dev.3'
  });
  assert.deepEqual(discovery.actions.map(action => action.id), ['system.echo']);
  assert.match(discovery.policy.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(discovery.policy).sort(), ['digest', 'version']);
});

test('machine discovery omits actions outside scope or destination ceiling', () => {
  const noScope = buildMachineDiscovery({
    principal: machine({ scopes: ['audit:read'] }),
    policy: engine(),
    kernelVersion: '0.12.0-dev.3'
  });
  assert.deepEqual(noScope.actions, []);

  const noDestination = buildMachineDiscovery({
    principal: machine({ destinations: [] }),
    policy: engine(),
    kernelVersion: '0.12.0-dev.3'
  });
  assert.deepEqual(noDestination.actions, []);
});

test('machine discovery rejects non-machine principals and tampered digests', () => {
  assert.throws(
    () => buildMachineDiscovery({
      principal: {
        id: 'human.discovery-test',
        type: 'human',
        scopes: ['*']
      },
      policy: engine(),
      kernelVersion: '0.12.0-dev.3'
    }),
    /constrained machine principal/
  );

  const discovery = buildMachineDiscovery({
    principal: machine(),
    policy: engine(),
    kernelVersion: '0.12.0-dev.3'
  });
  const tampered = structuredClone(discovery);
  tampered.actions = [];
  assert.throws(() => validateMachineDiscovery(tampered), /digest is invalid/);
});
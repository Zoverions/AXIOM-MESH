import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeApiPrincipalRegistry } from '../src/lib/principal-registry.mjs';

const HUMAN_TOKEN = 'h'.repeat(40);
const AGENT_TOKEN = 'a'.repeat(40);
const SERVICE_TOKEN = 's'.repeat(40);
const MACHINE_SERVICE_TOKEN = 'm'.repeat(40);

function machineFields(overrides = {}) {
  return {
    sponsor: 'owner.alice',
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.local.1',
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
        max_execution_ms: 2_000,
        max_request_bytes: 32_768,
        max_response_bytes: 65_536
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    ...overrides
  };
}

function registry() {
  return {
    [HUMAN_TOKEN]: {
      id: 'owner.alice',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [AGENT_TOKEN]: {
      id: 'agent.fixture.1',
      type: 'agent',
      roles: ['researcher'],
      scopes: ['intent:execute'],
      ...machineFields()
    },
    [SERVICE_TOKEN]: {
      id: 'production-telemetry-relay',
      type: 'service',
      roles: ['telemetry-relay'],
      scopes: ['telemetry:collect']
    }
  };
}

test('API registry constrains agents while preserving least-privilege infrastructure services', () => {
  const principals = normalizeApiPrincipalRegistry(registry(), {
    now: new Date('2026-08-09T20:00:00.000Z')
  });
  const values = [...principals.values()];
  const human = values.find(item => item.id === 'owner.alice');
  const agent = values.find(item => item.id === 'agent.fixture.1');
  const service = values.find(item => item.id === 'production-telemetry-relay');

  assert.deepEqual(human, {
    id: 'owner.alice',
    type: 'human',
    roles: ['administrator'],
    scopes: ['*']
  });
  assert.equal(agent.schema, 'axiom-machine-principal.v1');
  assert.equal(agent.sponsor, 'owner.alice');
  assert.equal(agent.constraints.delegation.allowed, false);
  assert.deepEqual(service, {
    id: 'production-telemetry-relay',
    type: 'service',
    roles: ['telemetry-relay'],
    scopes: ['telemetry:collect']
  });
});

test('agent API principals cannot use the legacy unconstrained shape', () => {
  const entries = registry();
  entries[AGENT_TOKEN] = {
    id: 'agent.fixture.1',
    type: 'agent',
    roles: ['researcher'],
    scopes: ['intent:execute']
  };
  assert.throws(
    () => normalizeApiPrincipalRegistry(entries, {
      now: new Date('2026-08-09T20:00:00.000Z')
    }),
    /sponsor/
  );
});

test('services can explicitly opt into the constrained machine profile', () => {
  const entries = registry();
  entries[MACHINE_SERVICE_TOKEN] = {
    id: 'service.external.1',
    type: 'service',
    roles: ['provider-adapter'],
    scopes: ['intent:execute'],
    ...machineFields({
      runtime: {
        id: 'runtime.provider.1',
        kind: 'container',
        software_digest: 'b'.repeat(64)
      }
    })
  };
  const principals = normalizeApiPrincipalRegistry(entries, {
    now: new Date('2026-08-09T20:00:00.000Z')
  });
  const service = [...principals.values()].find(item => item.id === 'service.external.1');
  assert.equal(service.schema, 'axiom-machine-principal.v1');
  assert.equal(service.type, 'service');
  assert.equal(service.runtime.kind, 'container');
});

test('machine sponsors must be configured human principals', () => {
  const entries = registry();
  entries[AGENT_TOKEN] = {
    ...entries[AGENT_TOKEN],
    sponsor: 'service.not-human'
  };
  assert.throws(
    () => normalizeApiPrincipalRegistry(entries, {
      now: new Date('2026-08-09T20:00:00.000Z')
    }),
    /known human principal/
  );
});

test('duplicate principal ids are rejected across different bearer tokens', () => {
  const entries = registry();
  entries['d'.repeat(40)] = {
    id: 'owner.alice',
    type: 'human',
    roles: [],
    scopes: ['audit:read']
  };
  assert.throws(
    () => normalizeApiPrincipalRegistry(entries),
    /Duplicate API principal id/
  );
});

test('human principals cannot smuggle machine authority fields', () => {
  const entries = registry();
  entries[HUMAN_TOKEN] = {
    ...entries[HUMAN_TOKEN],
    sponsor: 'owner.alice'
  };
  assert.throws(
    () => normalizeApiPrincipalRegistry(entries),
    /Human API principals cannot declare machine-authority fields/
  );
});

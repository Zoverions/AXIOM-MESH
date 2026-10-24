import assert from 'node:assert/strict';
import test from 'node:test';

const NOW = new Date('2026-09-25T17:00:00.000Z');

function fixture(overrides = {}) {
  return {
    id: 'agent.currentness.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute', 'memory:read'],
    lifetime: 'session',
    expires_at: '2026-09-25T18:00:00.000Z',
    runtime: {
      id: 'runtime.currentness.local.1',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['memory.read', 'system.echo'],
      purposes: ['research.assist', 'test.conformance'],
      destinations: ['local', 'provider:fixture'],
      budgets: {
        max_requests_per_minute: 30,
        max_concurrent_requests: 2,
        max_execution_ms: 5_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    ...overrides
  };
}

async function principalModule() {
  return import('../src/lib/machine-principal.mjs');
}

async function attenuationModule() {
  return import('../src/lib/machine-principal-attenuation.mjs');
}

test('historical machine authority snapshots normalize after expiry while liveness fails separately', async () => {
  const principal = await principalModule();
  const attenuation = await attenuationModule();

  assert.equal(typeof principal.normalizeMachinePrincipalAuthoritySnapshot, 'function');
  assert.equal(typeof attenuation.assertMachineAuthorityTimeActive, 'function');

  const expired = fixture({ expires_at: '2026-09-25T16:59:59.000Z' });

  assert.throws(
    () => principal.normalizeMachinePrincipalDefinition(expired, { now: NOW }),
    /expires_at must be in the future/
  );

  const snapshot = principal.normalizeMachinePrincipalAuthoritySnapshot(expired);
  assert.equal(snapshot.expires_at, '2026-09-25T16:59:59.000Z');
  assert.match(snapshot.authority_digest, /^[a-f0-9]{64}$/);

  assert.throws(
    () => attenuation.assertMachineAuthorityTimeActive(snapshot, NOW),
    /expired/i
  );
});

test('machine authority snapshot normalization rejects unknown authority fields', async () => {
  const principal = await principalModule();

  assert.throws(
    () => principal.normalizeMachinePrincipalAuthoritySnapshot({
      ...fixture(),
      unexpected_authority: true
    }),
    /fields|unsupported|unexpected/i
  );

  assert.throws(
    () => principal.normalizeMachinePrincipalAuthoritySnapshot({
      ...fixture(),
      runtime: {
        ...fixture().runtime,
        ambient_socket: '/tmp/unsafe.sock'
      }
    }),
    /fields|unsupported|unexpected/i
  );

  assert.throws(
    () => principal.normalizeMachinePrincipalAuthoritySnapshot({
      ...fixture(),
      constraints: {
        ...fixture().constraints,
        ambient_network: true
      }
    }),
    /fields|unsupported|unexpected/i
  );
});

test('machine authority snapshots canonicalize set ordering and preserve digest validation', async () => {
  const principal = await principalModule();

  const left = principal.normalizeMachinePrincipalAuthoritySnapshot(fixture());
  const right = principal.normalizeMachinePrincipalAuthoritySnapshot(fixture({
    roles: ['researcher', 'researcher'],
    scopes: ['memory:read', 'intent:execute'],
    constraints: {
      ...fixture().constraints,
      actions: ['system.echo', 'memory.read', 'system.echo'],
      purposes: ['test.conformance', 'research.assist'],
      destinations: ['provider:fixture', 'local']
    }
  }));

  assert.equal(left.authority_digest, right.authority_digest);

  assert.throws(
    () => principal.normalizeMachinePrincipalAuthoritySnapshot({
      ...left,
      authority_digest: 'f'.repeat(64)
    }),
    /authority_digest does not match normalized authority/
  );
});

test('strict same-principal attenuation may reduce sets budgets and expiry', async () => {
  const principal = await principalModule();
  const attenuation = await attenuationModule();

  const predecessor = principal.normalizeMachinePrincipalAuthoritySnapshot(fixture());
  const successor = attenuation.assertMachineAuthorityAttenuation(
    predecessor,
    {
      ...predecessor,
      scopes: ['intent:execute'],
      expires_at: '2026-09-25T17:30:00.000Z',
      constraints: {
        ...predecessor.constraints,
        actions: ['system.echo'],
        purposes: ['test.conformance'],
        destinations: ['local'],
        budgets: {
          max_requests_per_minute: 10,
          max_concurrent_requests: 1,
          max_execution_ms: 1_000,
          max_request_bytes: 32_768,
          max_response_bytes: 131_072
        }
      }
    },
    { now: NOW }
  );

  assert.deepEqual(successor.scopes, ['intent:execute']);
  assert.deepEqual(successor.constraints.actions, ['system.echo']);
  assert.equal(successor.expires_at, '2026-09-25T17:30:00.000Z');
  assert.notEqual(successor.authority_digest, predecessor.authority_digest);
});

test('attenuation rejects widening in every set authority dimension', async () => {
  const principal = await principalModule();
  const attenuation = await attenuationModule();
  const predecessor = principal.normalizeMachinePrincipalAuthoritySnapshot(fixture());

  const widened = [
    { label: 'roles', value: { ...predecessor, roles: [...predecessor.roles, 'auditor'] } },
    { label: 'scopes', value: { ...predecessor, scopes: [...predecessor.scopes, 'audit:read'] } },
    {
      label: 'actions',
      value: {
        ...predecessor,
        constraints: {
          ...predecessor.constraints,
          actions: [...predecessor.constraints.actions, 'system.hash']
        }
      }
    },
    {
      label: 'purposes',
      value: {
        ...predecessor,
        constraints: {
          ...predecessor.constraints,
          purposes: [...predecessor.constraints.purposes, 'finance.transfer']
        }
      }
    },
    {
      label: 'destinations',
      value: {
        ...predecessor,
        constraints: {
          ...predecessor.constraints,
          destinations: [...predecessor.constraints.destinations, 'provider:other']
        }
      }
    }
  ];

  for (const item of widened) {
    assert.throws(
      () => attenuation.assertMachineAuthorityAttenuation(predecessor, item.value, { now: NOW }),
      new RegExp(item.label, 'i')
    );
  }
});

test('attenuation rejects budget increases expiry extension and lifetime-class changes', async () => {
  const principal = await principalModule();
  const attenuation = await attenuationModule();
  const predecessor = principal.normalizeMachinePrincipalAuthoritySnapshot(fixture());

  assert.throws(
    () => attenuation.assertMachineAuthorityAttenuation(predecessor, {
      ...predecessor,
      constraints: {
        ...predecessor.constraints,
        budgets: {
          ...predecessor.constraints.budgets,
          max_execution_ms: predecessor.constraints.budgets.max_execution_ms + 1
        }
      }
    }, { now: NOW }),
    /max_execution_ms|budget|increase/i
  );

  assert.throws(
    () => attenuation.assertMachineAuthorityAttenuation(predecessor, {
      ...predecessor,
      expires_at: '2026-09-25T18:30:00.000Z'
    }, { now: NOW }),
    /expiry|expires_at|extend/i
  );

  assert.throws(
    () => attenuation.assertMachineAuthorityAttenuation(predecessor, {
      ...predecessor,
      lifetime: 'ephemeral'
    }, { now: NOW }),
    /lifetime/i
  );
});

test('attenuation rejects sponsor runtime and delegation substitution', async () => {
  const principal = await principalModule();
  const attenuation = await attenuationModule();
  const predecessor = principal.normalizeMachinePrincipalAuthoritySnapshot(fixture());

  const substitutions = [
    {
      pattern: /sponsor/i,
      value: { ...predecessor, sponsor: 'owner.mallory' }
    },
    {
      pattern: /runtime/i,
      value: {
        ...predecessor,
        runtime: { ...predecessor.runtime, id: 'runtime.currentness.other' }
      }
    },
    {
      pattern: /delegation/i,
      value: {
        ...predecessor,
        constraints: {
          ...predecessor.constraints,
          delegation: { allowed: true, max_depth: 1 }
        }
      }
    }
  ];

  for (const item of substitutions) {
    assert.throws(
      () => attenuation.assertMachineAuthorityAttenuation(predecessor, item.value, { now: NOW }),
      item.pattern
    );
  }
});

test('narrow transition must strictly reduce authority', async () => {
  const principal = await principalModule();
  const attenuation = await attenuationModule();
  const predecessor = principal.normalizeMachinePrincipalAuthoritySnapshot(fixture());

  assert.throws(
    () => attenuation.assertMachineAuthorityAttenuation(
      predecessor,
      structuredClone(predecessor),
      { now: NOW }
    ),
    /strictly reduce|unchanged|narrow/i
  );
});

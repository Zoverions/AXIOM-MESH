import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateMachineIntent,
  machinePrincipalAuthorityFacts,
  normalizeMachinePrincipalDefinition
} from '../src/lib/machine-principal.mjs';

const humanSponsors = new Set(['owner.alice', 'owner.bob']);

function fixture(overrides = {}) {
  return {
    id: 'agent.researcher.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.hermes.local.1',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo', 'memory.read'],
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

test('machine principal v1 canonicalizes authority and binds a human sponsor', () => {
  const principal = normalizeMachinePrincipalDefinition(fixture(), {
    knownHumanPrincipals: humanSponsors,
    now: new Date('2026-08-09T20:00:00.000Z')
  });
  assert.equal(principal.schema, 'axiom-machine-principal.v1');
  assert.equal(principal.type, 'agent');
  assert.equal(principal.sponsor, 'owner.alice');
  assert.equal(principal.runtime.kind, 'local-process');
  assert.deepEqual(principal.constraints.actions, ['memory.read', 'system.echo']);
  assert.deepEqual(principal.constraints.purposes, ['research.assist', 'test.conformance']);
  assert.match(principal.authority_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(machinePrincipalAuthorityFacts(principal), {
    principal_id: 'agent.researcher.1',
    principal_type: 'agent',
    sponsor: 'owner.alice',
    lifetime: 'session',
    runtime_id: 'runtime.hermes.local.1',
    runtime_kind: 'local-process',
    authority_digest: principal.authority_digest,
    delegation_allowed: false,
    max_delegation_depth: 0
  });
});

test('machine principal authority digest is stable across unordered sets', () => {
  const left = normalizeMachinePrincipalDefinition(fixture(), {
    knownHumanPrincipals: humanSponsors,
    now: new Date('2026-08-09T20:00:00.000Z')
  });
  const right = normalizeMachinePrincipalDefinition(fixture({
    roles: ['researcher', 'researcher'],
    scopes: ['intent:execute', 'intent:execute'],
    constraints: {
      ...fixture().constraints,
      actions: ['memory.read', 'system.echo', 'memory.read'],
      purposes: ['test.conformance', 'research.assist'],
      destinations: ['provider:fixture', 'local']
    }
  }), {
    knownHumanPrincipals: humanSponsors,
    now: new Date('2026-08-09T20:00:00.000Z')
  });
  assert.equal(left.authority_digest, right.authority_digest);
});

test('machine principal v1 revalidates supplied authority digests at use time', () => {
  const principal = normalizeMachinePrincipalDefinition(fixture(), {
    knownHumanPrincipals: humanSponsors,
    now: new Date('2026-08-09T20:00:00.000Z')
  });
  const tampered = {
    ...principal,
    authority_digest: 'f'.repeat(64)
  };
  assert.throws(
    () => evaluateMachineIntent(tampered, {
      action: 'system.echo',
      purpose: 'test.conformance',
      destination: 'local'
    }),
    /authority_digest does not match normalized authority/
  );
  assert.throws(
    () => machinePrincipalAuthorityFacts(tampered),
    /authority_digest does not match normalized authority/
  );
  assert.throws(
    () => normalizeMachinePrincipalDefinition({
      ...principal,
      schema: 'axiom-machine-principal.v2'
    }),
    /schema is unsupported/
  );
});

test('machine principal v1 rejects ambient authority and invalid sponsorship', () => {
  const options = {
    knownHumanPrincipals: humanSponsors,
    now: new Date('2026-08-09T20:00:00.000Z')
  };
  assert.throws(
    () => normalizeMachinePrincipalDefinition(fixture({ scopes: ['*'] }), options),
    /wildcard scope/
  );
  assert.throws(
    () => normalizeMachinePrincipalDefinition(fixture({ roles: ['administrator'] }), options),
    /administrator role/
  );
  assert.throws(
    () => normalizeMachinePrincipalDefinition(fixture({ sponsor: 'owner.unknown' }), options),
    /known human principal/
  );
  assert.throws(
    () => normalizeMachinePrincipalDefinition({ ...fixture(), type: 'human' }, options),
    /agent or service/
  );
});

test('machine principal v1 requires explicit action and purpose ceilings', () => {
  const options = {
    knownHumanPrincipals: humanSponsors,
    now: new Date('2026-08-09T20:00:00.000Z')
  };
  assert.throws(
    () => normalizeMachinePrincipalDefinition(fixture({
      constraints: { ...fixture().constraints, actions: [] }
    }), options),
    /actions must contain/
  );
  assert.throws(
    () => normalizeMachinePrincipalDefinition(fixture({
      constraints: { ...fixture().constraints, purposes: [] }
    }), options),
    /purposes must contain/
  );
  assert.throws(
    () => normalizeMachinePrincipalDefinition(fixture({
      constraints: {
        ...fixture().constraints,
        delegation: { allowed: true, max_depth: 1 }
      }
    }), options),
    /does not permit delegation/
  );
});

test('machine intent evaluation is fail-closed across action purpose destination and budgets', () => {
  const principal = normalizeMachinePrincipalDefinition(fixture(), {
    knownHumanPrincipals: humanSponsors,
    now: new Date('2026-08-09T20:00:00.000Z')
  });
  const allowed = evaluateMachineIntent(principal, {
    action: 'system.echo',
    purpose: 'test.conformance',
    destination: 'local',
    request_bytes: 10_000,
    requested_execution_ms: 1_000
  });
  assert.equal(allowed.allow, true);
  assert.equal(allowed.sponsor, 'owner.alice');
  assert.equal(allowed.authority_digest, principal.authority_digest);

  assert.equal(evaluateMachineIntent(principal, {
    action: 'system.delete',
    purpose: 'test.conformance'
  }).code, 'machine_action_denied');
  assert.equal(evaluateMachineIntent(principal, {
    action: 'system.echo',
    purpose: 'finance.transfer'
  }).code, 'machine_purpose_denied');
  assert.equal(evaluateMachineIntent(principal, {
    action: 'system.echo',
    purpose: 'test.conformance',
    destination: 'https://untrusted.example'
  }).code, 'machine_destination_denied');
  assert.equal(evaluateMachineIntent(principal, {
    action: 'system.echo',
    purpose: 'test.conformance',
    request_bytes: 65_537
  }).code, 'machine_request_budget_exceeded');
  assert.equal(evaluateMachineIntent(principal, {
    action: 'system.echo',
    purpose: 'test.conformance',
    requested_execution_ms: 5_001
  }).code, 'machine_execution_budget_exceeded');
});

test('non-persistent machine principals expire explicitly and persistent principals do not', () => {
  const options = {
    knownHumanPrincipals: humanSponsors,
    now: new Date('2026-08-09T20:00:00.000Z')
  };
  assert.throws(
    () => normalizeMachinePrincipalDefinition(fixture({
      expires_at: '2026-08-09T19:59:59.000Z'
    }), options),
    /must be in the future/
  );
  assert.throws(
    () => normalizeMachinePrincipalDefinition(fixture({
      lifetime: 'persistent',
      expires_at: '2099-01-01T00:00:00.000Z'
    }), options),
    /must not set expires_at/
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DELEGATION_AUTHORITY_SCHEMA,
  DELEGATION_GRANT_SCHEMA,
  DELEGATION_REVOCATION_SCHEMA,
  assertDelegationAttenuates,
  normalizeDelegationAuthority,
  normalizeDelegationGrant,
  resolveDelegationChain
} from '../src/lib/delegation-graph.mjs';

const NOW = new Date('2026-08-27T22:00:00.000Z');

function budgets(overrides = {}) {
  return {
    max_requests_per_minute: 60,
    max_concurrent_requests: 4,
    max_execution_ms: 10_000,
    max_request_bytes: 262_144,
    max_response_bytes: 1_048_576,
    ...overrides
  };
}

function authority(holder, overrides = {}) {
  return {
    schema: DELEGATION_AUTHORITY_SCHEMA,
    holder,
    actions: ['memory.read', 'system.echo'],
    purposes: ['research.assist', 'test.conformance'],
    data_scopes: ['project.notes', 'project.public'],
    destinations: ['local', 'provider:fixture'],
    budgets: budgets(),
    required_assurance: 'A2',
    independent_approval_required: false,
    delegation: { allowed: true, max_depth: 3 },
    expires_at: '2026-09-30T00:00:00.000Z',
    ...overrides
  };
}

function grant(id, delegator, delegate, parentGrantId, authorityOverrides = {}, overrides = {}) {
  return {
    schema: DELEGATION_GRANT_SCHEMA,
    id,
    delegator,
    delegate,
    parent_grant_id: parentGrantId,
    issued_at: '2026-08-27T20:00:00.000Z',
    authority: authority(delegate, authorityOverrides),
    ...overrides
  };
}

test('delegation authority canonicalizes finite exact authority and produces a stable digest', () => {
  const left = normalizeDelegationAuthority(authority('owner.alice'));
  const right = normalizeDelegationAuthority(authority('owner.alice', {
    actions: ['system.echo', 'memory.read', 'system.echo'],
    purposes: ['test.conformance', 'research.assist'],
    data_scopes: ['project.public', 'project.notes'],
    destinations: ['provider:fixture', 'local']
  }));
  assert.equal(left.authority_digest, right.authority_digest);
  assert.match(left.authority_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(left.actions, ['memory.read', 'system.echo']);
  assert.throws(
    () => normalizeDelegationAuthority(authority('owner.alice', { actions: ['*'] })),
    /invalid value|wildcard authority/
  );
});

test('attenuation permits equal-or-narrower authority but never expansion', () => {
  const parent = authority('owner.alice');
  const child = authority('agent.chief', {
    actions: ['memory.read'],
    purposes: ['research.assist'],
    data_scopes: ['project.public'],
    destinations: ['local'],
    budgets: budgets({
      max_requests_per_minute: 30,
      max_concurrent_requests: 2,
      max_execution_ms: 5_000,
      max_request_bytes: 131_072,
      max_response_bytes: 524_288
    }),
    required_assurance: 'A3',
    independent_approval_required: true,
    delegation: { allowed: true, max_depth: 2 },
    expires_at: '2026-09-20T00:00:00.000Z'
  });
  const normalized = assertDelegationAttenuates(parent, child);
  assert.equal(normalized.holder, 'agent.chief');

  assert.throws(
    () => assertDelegationAttenuates(parent, {
      ...child,
      actions: ['memory.read', 'system.delete']
    }),
    /expands actions/
  );
  assert.throws(
    () => assertDelegationAttenuates(parent, {
      ...child,
      budgets: budgets({ max_execution_ms: 20_000 })
    }),
    /expands budget max_execution_ms/
  );
  assert.throws(
    () => assertDelegationAttenuates(parent, {
      ...child,
      required_assurance: 'A1'
    }),
    /lower the required assurance floor/
  );
});

test('subdelegation must be explicit and remaining depth can only decrease', () => {
  const parent = authority('owner.alice', {
    delegation: { allowed: false, max_depth: 0 }
  });
  assert.throws(
    () => assertDelegationAttenuates(parent, authority('agent.chief', {
      delegation: { allowed: false, max_depth: 0 }
    })),
    /does not permit subdelegation/
  );

  const depthOne = authority('owner.alice', {
    delegation: { allowed: true, max_depth: 1 }
  });
  assert.throws(
    () => assertDelegationAttenuates(depthOne, authority('agent.chief', {
      delegation: { allowed: true, max_depth: 1 }
    })),
    /exceeds parent delegation depth/
  );
  assert.doesNotThrow(
    () => assertDelegationAttenuates(depthOne, authority('agent.chief', {
      delegation: { allowed: false, max_depth: 0 }
    }))
  );
});

test('chain resolution reconstructs human to agent to subagent provenance without granting execution authority', () => {
  const root = authority('owner.alice');
  const chief = grant('grant.chief', 'owner.alice', 'agent.chief', null, {
    actions: ['memory.read', 'system.echo'],
    purposes: ['research.assist'],
    data_scopes: ['project.notes', 'project.public'],
    destinations: ['local'],
    budgets: budgets({ max_requests_per_minute: 40, max_concurrent_requests: 3 }),
    delegation: { allowed: true, max_depth: 2 },
    expires_at: '2026-09-20T00:00:00.000Z'
  });
  const researcher = grant('grant.researcher', 'agent.chief', 'agent.researcher', 'grant.chief', {
    actions: ['memory.read'],
    purposes: ['research.assist'],
    data_scopes: ['project.public'],
    destinations: ['local'],
    budgets: budgets({
      max_requests_per_minute: 20,
      max_concurrent_requests: 1,
      max_execution_ms: 5_000,
      max_request_bytes: 131_072,
      max_response_bytes: 524_288
    }),
    required_assurance: 'A3',
    delegation: { allowed: true, max_depth: 1 },
    expires_at: '2026-09-10T00:00:00.000Z'
  });

  const resolved = resolveDelegationChain({
    root_authority: root,
    grants: [researcher, chief],
    target_grant_id: 'grant.researcher',
    now: NOW
  });
  assert.equal(resolved.execution_authority_granted, false);
  assert.equal(resolved.effective_authority.holder, 'agent.researcher');
  assert.deepEqual(
    resolved.chain.map(entry => [entry.delegator, entry.delegate]),
    [
      ['owner.alice', 'agent.chief'],
      ['agent.chief', 'agent.researcher']
    ]
  );
  assert.match(resolved.chain_digest, /^[a-f0-9]{64}$/);
});

test('revoking an upstream grant invalidates all descendant chains', () => {
  const chief = grant('grant.chief', 'owner.alice', 'agent.chief', null, {
    delegation: { allowed: true, max_depth: 2 },
    expires_at: '2026-09-20T00:00:00.000Z'
  });
  const researcher = grant('grant.researcher', 'agent.chief', 'agent.researcher', 'grant.chief', {
    actions: ['memory.read'],
    purposes: ['research.assist'],
    data_scopes: ['project.public'],
    destinations: ['local'],
    delegation: { allowed: true, max_depth: 1 },
    expires_at: '2026-09-10T00:00:00.000Z'
  });
  const revocation = {
    schema: DELEGATION_REVOCATION_SCHEMA,
    id: 'revoke.chief',
    grant_id: 'grant.chief',
    revoked_by: 'owner.alice',
    revoked_at: '2026-08-27T21:00:00.000Z',
    reason: 'operator revocation'
  };
  assert.throws(
    () => resolveDelegationChain({
      root_authority: authority('owner.alice'),
      grants: [chief, researcher],
      revocations: [revocation],
      target_grant_id: 'grant.researcher',
      now: NOW
    }),
    /grant is revoked/
  );
});

test('cycles, confused parentage, stale grants, and unauthorized revocations fail closed', () => {
  const root = authority('owner.alice');
  const first = grant('grant.one', 'agent.two', 'agent.one', 'grant.two', {
    delegation: { allowed: true, max_depth: 2 }
  });
  const second = grant('grant.two', 'agent.one', 'agent.two', 'grant.one', {
    delegation: { allowed: true, max_depth: 2 }
  });
  assert.throws(
    () => resolveDelegationChain({
      root_authority: root,
      grants: [first, second],
      target_grant_id: 'grant.one',
      now: NOW
    }),
    /contains a cycle/
  );

  const chief = grant('grant.chief', 'owner.alice', 'agent.chief', null, {
    delegation: { allowed: true, max_depth: 2 },
    expires_at: '2026-09-20T00:00:00.000Z'
  });
  const confused = grant('grant.confused', 'agent.other', 'agent.worker', 'grant.chief', {
    actions: ['memory.read'],
    purposes: ['research.assist'],
    data_scopes: ['project.public'],
    destinations: ['local'],
    delegation: { allowed: false, max_depth: 0 },
    expires_at: '2026-09-10T00:00:00.000Z'
  });
  assert.throws(
    () => resolveDelegationChain({
      root_authority: root,
      grants: [chief, confused],
      target_grant_id: 'grant.confused',
      now: NOW
    }),
    /delegator must equal parent delegate/
  );

  const stale = grant('grant.stale', 'owner.alice', 'agent.stale', null, {
    delegation: { allowed: false, max_depth: 0 },
    expires_at: '2026-08-27T21:30:00.000Z'
  }, {
    issued_at: '2026-08-27T20:00:00.000Z'
  });
  assert.throws(
    () => resolveDelegationChain({
      root_authority: root,
      grants: [stale],
      target_grant_id: 'grant.stale',
      now: NOW
    }),
    /authority is expired/
  );

  assert.throws(
    () => resolveDelegationChain({
      root_authority: root,
      grants: [chief],
      revocations: [{
        schema: DELEGATION_REVOCATION_SCHEMA,
        id: 'revoke.bad',
        grant_id: 'grant.chief',
        revoked_by: 'agent.other',
        revoked_at: '2026-08-27T21:00:00.000Z',
        reason: 'not authorized'
      }],
      target_grant_id: 'grant.chief',
      now: NOW
    }),
    /must be issued by the grant delegator/
  );
});

test('supplied digests are revalidated instead of trusted', () => {
  const normalized = normalizeDelegationGrant(grant(
    'grant.chief',
    'owner.alice',
    'agent.chief',
    null,
    { delegation: { allowed: false, max_depth: 0 } }
  ));
  assert.throws(
    () => normalizeDelegationGrant({ ...normalized, grant_digest: 'f'.repeat(64) }),
    /grant_digest does not match normalized grant/
  );
});

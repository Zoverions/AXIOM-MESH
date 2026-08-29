import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DELEGATION_AUTHORITY_SCHEMA,
  DELEGATION_GRANT_SCHEMA,
  DELEGATION_REVOCATION_SCHEMA
} from '../src/lib/delegation-graph.mjs';
import {
  appendDelegationGrant,
  appendDelegationRevocation
} from '../src/lib/delegation-ledger.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const NOW = new Date('2026-08-28T03:30:00.000Z');

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

function grant(id, delegator, delegate, parentGrantId, authorityOverrides = {}) {
  return {
    schema: DELEGATION_GRANT_SCHEMA,
    id,
    delegator,
    delegate,
    parent_grant_id: parentGrantId,
    issued_at: '2026-08-28T03:00:00.000Z',
    authority: authority(delegate, authorityOverrides)
  };
}

function revocation(id, grantId, revokedBy) {
  return {
    schema: DELEGATION_REVOCATION_SCHEMA,
    id,
    grant_id: grantId,
    revoked_by: revokedBy,
    revoked_at: '2026-08-28T03:20:00.000Z',
    reason: 'operator revocation'
  };
}

async function request(base, token, path, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json'
    }
  });
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(payload));
  return payload;
}

async function startStack(t, dataDir, apiTokens) {
  const lease = await reserveProductionPortBlock('delegation inspector route test');
  const basePort = lease.base_port;
  const stack = await startDevelopmentStack({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 1_000,
    rateLimitRefillPerSecond: 1_000,
    apiTokens
  });
  t.after(async () => {
    try {
      await stack.stop();
    } finally {
      await lease.release();
    }
  });
  return `http://127.0.0.1:${basePort}`;
}

test('Gateway delegation inspector exposes owner-scoped non-executing chain evidence', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-delegation-inspector-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const ownerId = 'principal-delegation-owner';
  const outsiderId = 'principal-delegation-outsider';
  const ownerToken = `delegation-owner-${'o'.repeat(40)}`;
  const outsiderToken = `delegation-outsider-${'x'.repeat(40)}`;
  const rootAuthority = authority(ownerId);
  const rootPath = join(dataDir, 'delegation-root-authority.json');
  const ledgerPath = join(dataDir, 'delegation-ledger.jsonl');
  await writeFile(rootPath, `${JSON.stringify(rootAuthority)}\n`, 'utf8');

  await appendDelegationGrant({
    ledger_path: ledgerPath,
    root_authority: rootAuthority,
    grant: grant('grant.chief', ownerId, 'agent.chief', null, {
      delegation: { allowed: true, max_depth: 2 },
      expires_at: '2026-09-20T00:00:00.000Z'
    }),
    now: NOW
  });
  await appendDelegationGrant({
    ledger_path: ledgerPath,
    root_authority: rootAuthority,
    grant: grant('grant.researcher', 'agent.chief', 'agent.researcher', 'grant.chief', {
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
      delegation: { allowed: false, max_depth: 0 },
      expires_at: '2026-09-10T00:00:00.000Z'
    }),
    now: NOW
  });
  await appendDelegationGrant({
    ledger_path: ledgerPath,
    root_authority: rootAuthority,
    grant: grant('grant.revoked', ownerId, 'agent.revoked', null, {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      data_scopes: ['project.public'],
      destinations: ['local'],
      delegation: { allowed: false, max_depth: 0 },
      expires_at: '2026-09-15T00:00:00.000Z'
    }),
    now: NOW
  });
  await appendDelegationRevocation({
    ledger_path: ledgerPath,
    revocation: revocation('revoke.revoked', 'grant.revoked', ownerId)
  });

  const gateway = await startStack(t, dataDir, {
    [ownerToken]: {
      id: ownerId,
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [outsiderToken]: {
      id: outsiderId,
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    }
  });

  const snapshot = await request(gateway, ownerToken, '/v1/delegations');
  assert.equal(snapshot.schema, 'axiom-delegation-inspector.v1');
  assert.equal(snapshot.owner, ownerId);
  assert.equal(snapshot.configured, true);
  assert.equal(snapshot.execution_authority_granted, false);
  assert.equal(snapshot.root_authority.holder, ownerId);
  assert.equal(snapshot.ledger.grant_count, 3);
  assert.equal(snapshot.ledger.revocation_count, 1);
  assert.match(snapshot.digest, /^[a-f0-9]{64}$/);

  const researcher = snapshot.grants.find(item => item.id === 'grant.researcher');
  assert.equal(researcher.lifecycle.state, 'active');
  assert.equal(researcher.current_resolution.execution_authority_granted, false);
  assert.deepEqual(researcher.current_resolution.chain.map(item => item.delegate), [
    'agent.chief',
    'agent.researcher'
  ]);
  assert.deepEqual(researcher.current_resolution.effective_authority.actions, ['memory.read']);
  assert.equal(researcher.current_resolution.effective_authority.budgets.max_concurrent_requests, 1);

  const revoked = snapshot.grants.find(item => item.id === 'grant.revoked');
  assert.equal(revoked.lifecycle.state, 'revoked');
  assert.equal(revoked.current_resolution, null);
  assert.equal(revoked.lifecycle.revocation_id, 'revoke.revoked');

  const outsider = await request(gateway, outsiderToken, '/v1/delegations', 403);
  assert.equal(outsider.error.code, 'forbidden');
});

test('Gateway delegation inspector returns a safe empty state before delegation is configured', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-delegation-empty-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const token = `delegation-empty-${'e'.repeat(40)}`;
  const gateway = await startStack(t, dataDir, {
    [token]: {
      id: 'principal-delegation-empty',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    }
  });

  const snapshot = await request(gateway, token, '/v1/delegations');
  assert.equal(snapshot.schema, 'axiom-delegation-inspector.v1');
  assert.equal(snapshot.configured, false);
  assert.equal(snapshot.root_authority, null);
  assert.deepEqual(snapshot.grants, []);
  assert.deepEqual(snapshot.revocations, []);
  assert.equal(snapshot.ledger.grant_count, 0);
  assert.equal(snapshot.execution_authority_granted, false);
});

test('Gateway delegation inspector fails closed when ledger history lacks root authority', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-delegation-orphaned-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const ownerId = 'principal-delegation-orphaned';
  const token = `delegation-orphaned-${'z'.repeat(40)}`;
  const rootAuthority = authority(ownerId);
  await appendDelegationGrant({
    ledger_path: join(dataDir, 'delegation-ledger.jsonl'),
    root_authority: rootAuthority,
    grant: grant('grant.orphaned', ownerId, 'agent.orphaned', null, {
      delegation: { allowed: false, max_depth: 0 }
    }),
    now: NOW
  });
  const gateway = await startStack(t, dataDir, {
    [token]: {
      id: ownerId,
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    }
  });

  const response = await request(gateway, token, '/v1/delegations', 503);
  assert.equal(response.error.code, 'dependency_unavailable');
});

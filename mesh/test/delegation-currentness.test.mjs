import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
  appendDelegationRevocation,
  projectDelegationLedger
} from '../src/lib/delegation-ledger.mjs';

const HISTORICAL_NOW = new Date('2026-08-27T20:30:00.000Z');
const CURRENT_NOW = new Date('2026-08-27T22:00:00.000Z');

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
    issued_at: '2026-08-27T20:00:00.000Z',
    authority: authority(delegate, authorityOverrides)
  };
}

function revocation(id, grantId, revokedBy) {
  return {
    schema: DELEGATION_REVOCATION_SCHEMA,
    id,
    grant_id: grantId,
    revoked_by: revokedBy,
    revoked_at: '2026-08-27T21:00:00.000Z',
    reason: 'fresher authority currentness revocation'
  };
}

async function withLedger(run) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-delegation-currentness-'));
  const ledgerPath = join(root, 'delegation.jsonl');
  try {
    return await run(ledgerPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('RT-DELEGATION-CURRENTNESS-001: offline-valid delegation remains evidence, not current effect authority', async () => {
  const profile = JSON.parse(await readFile(
    new URL('./fixtures/rt-delegation-currentness-001.json', import.meta.url),
    'utf8'
  ));
  assert.equal(profile.schema, 'axiom-rt-delegation-currentness-001.v1');
  assert.equal(profile.target, 'RT-DELEGATION-CURRENTNESS-001');
  assert.deepEqual(
    profile.cases.map(item => item.id),
    [
      'cached-valid-projection-remains-non-authorizing',
      'revocation-invalidates-current-projection',
      'root-narrowing-invalidates-old-binding'
    ]
  );

  await withLedger(async ledgerPath => {
    const rootAuthority = authority('owner.alice');
    await appendDelegationGrant({
      ledger_path: ledgerPath,
      root_authority: rootAuthority,
      grant: grant('grant.chief', 'owner.alice', 'agent.chief', null, {
        actions: ['memory.read', 'system.echo'],
        purposes: ['research.assist'],
        data_scopes: ['project.public'],
        destinations: ['local'],
        delegation: { allowed: true, max_depth: 2 },
        expires_at: '2026-09-20T00:00:00.000Z'
      }),
      now: HISTORICAL_NOW
    });
    await appendDelegationGrant({
      ledger_path: ledgerPath,
      root_authority: rootAuthority,
      grant: grant('grant.worker', 'agent.chief', 'agent.worker', 'grant.chief', {
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
      now: HISTORICAL_NOW
    });

    const historicalProjection = await projectDelegationLedger({
      ledger_path: ledgerPath,
      root_authority: rootAuthority,
      target_grant_id: 'grant.worker',
      now: HISTORICAL_NOW
    });
    assert.equal(historicalProjection.execution_authority_granted, false);
    assert.equal(historicalProjection.chain_resolution.execution_authority_granted, false);
    assert.equal(
      historicalProjection.chain_resolution.effective_authority.holder,
      'agent.worker'
    );
    assert.match(historicalProjection.projection_digest, /^[a-f0-9]{64}$/);

    const narrowedRoot = authority('owner.alice', {
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
      delegation: { allowed: true, max_depth: 2 },
      expires_at: '2026-09-20T00:00:00.000Z'
    });
    await assert.rejects(
      projectDelegationLedger({
        ledger_path: ledgerPath,
        root_authority: narrowedRoot,
        target_grant_id: 'grant.worker',
        now: HISTORICAL_NOW
      }),
      /root authority does not match ledger binding/i
    );

    await appendDelegationRevocation({
      ledger_path: ledgerPath,
      revocation: revocation('revoke.chief', 'grant.chief', 'owner.alice')
    });

    assert.equal(historicalProjection.execution_authority_granted, false);
    assert.equal(historicalProjection.chain_resolution.execution_authority_granted, false);

    await assert.rejects(
      projectDelegationLedger({
        ledger_path: ledgerPath,
        root_authority: rootAuthority,
        target_grant_id: 'grant.worker',
        now: CURRENT_NOW
      }),
      /grant is revoked/i
    );
  });
});

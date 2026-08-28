import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  DELEGATION_AUTHORITY_SCHEMA,
  DELEGATION_GRANT_SCHEMA,
  DELEGATION_REVOCATION_SCHEMA
} from '../src/lib/delegation-graph.mjs';
import {
  DELEGATION_LEDGER_ENTRY_SCHEMA,
  DELEGATION_LEDGER_PROJECTION_SCHEMA,
  DELEGATION_LEDGER_SCHEMA,
  appendDelegationGrant,
  appendDelegationRevocation,
  projectDelegationLedger,
  readDelegationLedger
} from '../src/lib/delegation-ledger.mjs';

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
    reason: 'operator revocation'
  };
}

async function withLedger(run) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-delegation-ledger-'));
  const ledgerPath = join(root, 'delegation.jsonl');
  try {
    return await run(ledgerPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('ledger appends normalized grants and revocations into an integrity-linked JSONL history', async () => {
  await withLedger(async ledgerPath => {
    const rootAuthority = authority('owner.alice');
    const chief = grant('grant.chief', 'owner.alice', 'agent.chief', null, {
      delegation: { allowed: true, max_depth: 2 },
      expires_at: '2026-09-20T00:00:00.000Z'
    });

    const first = await appendDelegationGrant({
      ledger_path: ledgerPath,
      root_authority: rootAuthority,
      grant: chief,
      now: NOW
    });
    const second = await appendDelegationRevocation({
      ledger_path: ledgerPath,
      revocation: revocation('revoke.chief', 'grant.chief', 'owner.alice')
    });

    assert.equal(first.schema, DELEGATION_LEDGER_ENTRY_SCHEMA);
    assert.equal(first.sequence, 1);
    assert.equal(first.kind, 'grant');
    assert.equal(first.previous_entry_digest, null);
    assert.match(first.entry_digest, /^[a-f0-9]{64}$/);
    assert.equal(second.sequence, 2);
    assert.equal(second.previous_entry_digest, first.entry_digest);

    const ledger = await readDelegationLedger({ ledger_path: ledgerPath });
    assert.equal(ledger.schema, DELEGATION_LEDGER_SCHEMA);
    assert.equal(ledger.entries.length, 2);
    assert.equal(ledger.grants.length, 1);
    assert.equal(ledger.revocations.length, 1);
    assert.equal(ledger.head_entry_digest, second.entry_digest);
    assert.equal(ledger.execution_authority_granted, false);
    assert.match(ledger.ledger_digest, /^[a-f0-9]{64}$/);

    const text = await readFile(ledgerPath, 'utf8');
    assert.equal(text.trim().split('\n').length, 2);
  });
});

test('grant append validates the full current chain and rejects authority expansion', async () => {
  await withLedger(async ledgerPath => {
    const rootAuthority = authority('owner.alice');
    await appendDelegationGrant({
      ledger_path: ledgerPath,
      root_authority: rootAuthority,
      grant: grant('grant.chief', 'owner.alice', 'agent.chief', null, {
        actions: ['memory.read'],
        purposes: ['research.assist'],
        data_scopes: ['project.public'],
        destinations: ['local'],
        delegation: { allowed: true, max_depth: 2 },
        expires_at: '2026-09-20T00:00:00.000Z'
      }),
      now: NOW
    });

    await assert.rejects(
      appendDelegationGrant({
        ledger_path: ledgerPath,
        root_authority: rootAuthority,
        grant: grant('grant.worker', 'agent.chief', 'agent.worker', 'grant.chief', {
          actions: ['memory.read', 'system.echo'],
          purposes: ['research.assist'],
          data_scopes: ['project.public'],
          destinations: ['local'],
          delegation: { allowed: false, max_depth: 0 },
          expires_at: '2026-09-10T00:00:00.000Z'
        }),
        now: NOW
      }),
      /expands actions/
    );

    const ledger = await readDelegationLedger({ ledger_path: ledgerPath });
    assert.equal(ledger.entries.length, 1);
  });
});

test('projection resolves persisted provenance but remains explicitly non-executing', async () => {
  await withLedger(async ledgerPath => {
    const rootAuthority = authority('owner.alice');
    await appendDelegationGrant({
      ledger_path: ledgerPath,
      root_authority: rootAuthority,
      grant: grant('grant.chief', 'owner.alice', 'agent.chief', null, {
        actions: ['memory.read'],
        purposes: ['research.assist'],
        data_scopes: ['project.public'],
        destinations: ['local'],
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

    const projection = await projectDelegationLedger({
      ledger_path: ledgerPath,
      root_authority: rootAuthority,
      target_grant_id: 'grant.researcher',
      now: NOW
    });
    assert.equal(projection.schema, DELEGATION_LEDGER_PROJECTION_SCHEMA);
    assert.equal(projection.execution_authority_granted, false);
    assert.equal(projection.chain_resolution.execution_authority_granted, false);
    assert.deepEqual(
      projection.chain_resolution.chain.map(entry => [entry.delegator, entry.delegate]),
      [
        ['owner.alice', 'agent.chief'],
        ['agent.chief', 'agent.researcher']
      ]
    );
    assert.match(projection.projection_digest, /^[a-f0-9]{64}$/);
  });
});

test('ledger replay fails closed on tampering, malformed lines, and duplicate record ids', async () => {
  await withLedger(async ledgerPath => {
    const rootAuthority = authority('owner.alice');
    const chief = grant('grant.chief', 'owner.alice', 'agent.chief', null, {
      delegation: { allowed: false, max_depth: 0 }
    });
    await appendDelegationGrant({
      ledger_path: ledgerPath,
      root_authority: rootAuthority,
      grant: chief,
      now: NOW
    });

    await assert.rejects(
      appendDelegationGrant({
        ledger_path: ledgerPath,
        root_authority: rootAuthority,
        grant: chief,
        now: NOW
      }),
      /duplicate delegation grant id/i
    );

    const [line] = (await readFile(ledgerPath, 'utf8')).trim().split('\n');
    const entry = JSON.parse(line);
    entry.sequence = 9;
    await writeFile(ledgerPath, `${JSON.stringify(entry)}\n`, 'utf8');
    await assert.rejects(
      readDelegationLedger({ ledger_path: ledgerPath }),
      /sequence|digest/i
    );

    await writeFile(ledgerPath, '{not-json}\n', 'utf8');
    await assert.rejects(
      readDelegationLedger({ ledger_path: ledgerPath }),
      /invalid JSON/i
    );
  });
});

test('persisted revocation invalidates descendant projections and unauthorized revocation is never appended', async () => {
  await withLedger(async ledgerPath => {
    const rootAuthority = authority('owner.alice');
    await appendDelegationGrant({
      ledger_path: ledgerPath,
      root_authority: rootAuthority,
      grant: grant('grant.chief', 'owner.alice', 'agent.chief', null, {
        delegation: { allowed: true, max_depth: 2 },
        expires_at: '2026-09-20T00:00:00.000Z'
      }),
      now: NOW
    });
    await appendDelegationGrant({
      ledger_path: ledgerPath,
      root_authority: rootAuthority,
      grant: grant('grant.worker', 'agent.chief', 'agent.worker', 'grant.chief', {
        actions: ['memory.read'],
        purposes: ['research.assist'],
        data_scopes: ['project.public'],
        destinations: ['local'],
        delegation: { allowed: false, max_depth: 0 },
        expires_at: '2026-09-10T00:00:00.000Z'
      }),
      now: NOW
    });

    await assert.rejects(
      appendDelegationRevocation({
        ledger_path: ledgerPath,
        revocation: revocation('revoke.bad', 'grant.chief', 'agent.other')
      }),
      /grant delegator/
    );

    await appendDelegationRevocation({
      ledger_path: ledgerPath,
      revocation: revocation('revoke.chief', 'grant.chief', 'owner.alice')
    });
    await assert.rejects(
      projectDelegationLedger({
        ledger_path: ledgerPath,
        root_authority: rootAuthority,
        target_grant_id: 'grant.worker',
        now: NOW
      }),
      /grant is revoked/
    );

    const ledger = await readDelegationLedger({ ledger_path: ledgerPath });
    assert.equal(ledger.revocations.length, 1);
    assert.equal(ledger.revocations[0].id, 'revoke.chief');
  });
});

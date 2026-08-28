import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DELEGATION_AUTHORITY_SCHEMA,
  DELEGATION_GRANT_SCHEMA,
  DELEGATION_REVOCATION_SCHEMA
} from '../src/lib/delegation-graph.mjs';
import {
  DELEGATION_DURABLE_RECORD_SCHEMA,
  DELEGATION_EVIDENCE_PROJECTION_SCHEMA,
  openDelegationDurableStore
} from '../src/lib/delegation-durable-store.mjs';

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

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-delegation-store-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  return { dir, statePath: join(dir, 'delegation.jsonl') };
}

async function seededStore(t) {
  const { statePath } = await fixture(t);
  const store = await openDelegationDurableStore({ statePath });
  const root = await store.trustRoot(authority('owner.alice'), {
    committedAt: '2026-08-27T19:00:00.000Z'
  });
  const chief = grant('grant.chief', 'owner.alice', 'agent.chief', null, {
    delegation: { allowed: true, max_depth: 2 },
    expires_at: '2026-09-20T00:00:00.000Z'
  });
  await store.appendGrant(root.authority.authority_digest, chief, {
    committedAt: '2026-08-27T20:00:00.000Z'
  });
  return { store, statePath, root, chief };
}

test('durable delegation records survive reopen and project evidence without granting authority', async t => {
  const { store, statePath, root } = await seededStore(t);
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
    delegation: { allowed: false, max_depth: 0 },
    expires_at: '2026-09-10T00:00:00.000Z'
  });
  await store.appendGrant(root.authority.authority_digest, researcher, {
    committedAt: '2026-08-27T20:01:00.000Z'
  });

  const projection = store.projectEvidence({
    rootAuthorityDigest: root.authority.authority_digest,
    evaluatedAt: NOW
  });
  assert.equal(projection.schema, DELEGATION_EVIDENCE_PROJECTION_SCHEMA);
  assert.equal(projection.execution_authority_granted, false);
  assert.equal(projection.authority_effect, 'none');
  assert.deepEqual(projection.grants.map(item => item.id), ['grant.chief', 'grant.researcher']);
  assert.match(projection.projection_digest, /^[a-f0-9]{64}$/);

  const reopened = await openDelegationDurableStore({ statePath });
  const reopenedProjection = reopened.projectEvidence({
    rootAuthorityDigest: root.authority.authority_digest,
    evaluatedAt: NOW
  });
  assert.equal(reopenedProjection.projection_digest, projection.projection_digest);
  const resolved = reopened.resolve({
    rootAuthorityDigest: root.authority.authority_digest,
    targetGrantId: 'grant.researcher',
    now: NOW
  });
  assert.equal(resolved.execution_authority_granted, false);
  assert.equal(resolved.effective_authority.holder, 'agent.researcher');
  assert.deepEqual(await reopened.verifyState(), {
    valid: true,
    records: 3,
    roots: 1,
    grants: 2,
    revocations: 0,
    execution_authority_granted: false,
    authority_effect: 'none'
  });
});

test('appendGrant validates parentage and attenuation before persisting', async t => {
  const { store, statePath, root } = await seededStore(t);
  const before = await readFile(statePath, 'utf8');
  const expanded = grant('grant.expanded', 'agent.chief', 'agent.worker', 'grant.chief', {
    actions: ['memory.read', 'system.delete'],
    delegation: { allowed: false, max_depth: 0 }
  });
  await assert.rejects(
    store.appendGrant(root.authority.authority_digest, expanded, {
      committedAt: '2026-08-27T20:02:00.000Z'
    }),
    /expands actions/
  );
  assert.equal(await readFile(statePath, 'utf8'), before);
});

test('revocation is append-only, propagates through resolution, and rejects unauthorized issuers', async t => {
  const { store, statePath, root } = await seededStore(t);
  const unauthorized = {
    schema: DELEGATION_REVOCATION_SCHEMA,
    id: 'revoke.bad',
    grant_id: 'grant.chief',
    revoked_by: 'agent.other',
    revoked_at: '2026-08-27T21:00:00.000Z',
    reason: 'not the delegator'
  };
  const before = await readFile(statePath, 'utf8');
  await assert.rejects(
    store.appendRevocation(root.authority.authority_digest, unauthorized, {
      committedAt: '2026-08-27T21:00:01.000Z'
    }),
    /grant delegator/
  );
  assert.equal(await readFile(statePath, 'utf8'), before);

  const revocation = {
    ...unauthorized,
    id: 'revoke.chief',
    revoked_by: 'owner.alice',
    reason: 'operator revocation'
  };
  const committed = await store.appendRevocation(root.authority.authority_digest, revocation, {
    committedAt: '2026-08-27T21:00:01.000Z'
  });
  assert.equal(committed.record.schema, DELEGATION_DURABLE_RECORD_SCHEMA);
  assert.equal(committed.record.execution_authority_granted, false);
  await assert.rejects(
    async () => store.resolve({
      rootAuthorityDigest: root.authority.authority_digest,
      targetGrantId: 'grant.chief',
      now: NOW
    }),
    /grant is revoked/
  );
});

test('reopen fails closed on tampering, non-canonical lines, and incomplete tails', async t => {
  const { statePath } = await fixture(t);
  const store = await openDelegationDurableStore({ statePath });
  await store.trustRoot(authority('owner.alice'), {
    committedAt: '2026-08-27T19:00:00.000Z'
  });
  const canonical = await readFile(statePath, 'utf8');
  const record = JSON.parse(canonical.trimEnd());
  record.sequence = 2;
  await writeFile(statePath, `${JSON.stringify(record)}\n`, 'utf8');
  await assert.rejects(openDelegationDurableStore({ statePath }), /canonical JSON|digest|sequence|predecessor/);

  await writeFile(statePath, canonical.trimEnd(), 'utf8');
  await assert.rejects(openDelegationDurableStore({ statePath }), /incomplete trailing record/);
});

test('state path must be a regular non-symlink file', async t => {
  const { dir } = await fixture(t);
  const target = join(dir, 'target.jsonl');
  const link = join(dir, 'link.jsonl');
  await writeFile(target, '', 'utf8');
  await symlink(target, link);
  await assert.rejects(
    openDelegationDurableStore({ statePath: link }),
    /regular non-symlink file/
  );
});
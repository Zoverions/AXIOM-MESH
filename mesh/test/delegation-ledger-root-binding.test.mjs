import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, digestObject } from '../src/lib/canonical.mjs';
import {
  DELEGATION_AUTHORITY_SCHEMA,
  DELEGATION_GRANT_SCHEMA,
  normalizeDelegationGrant
} from '../src/lib/delegation-graph.mjs';
import {
  appendDelegationGrant,
  projectDelegationLedger,
  readDelegationLedger
} from '../src/lib/delegation-ledger.mjs';

const NOW = new Date('2026-08-27T22:00:00.000Z');
const ROOT_BINDING_SCHEMA = 'axiom-delegation-root-binding.v1';

function authority(holder, overrides = {}) {
  return {
    schema: DELEGATION_AUTHORITY_SCHEMA,
    holder,
    actions: ['memory.read', 'system.echo'],
    purposes: ['research.assist'],
    data_scopes: ['project.public'],
    destinations: ['local'],
    budgets: {
      max_requests_per_minute: 60,
      max_concurrent_requests: 4,
      max_execution_ms: 10_000,
      max_request_bytes: 262_144,
      max_response_bytes: 1_048_576
    },
    required_assurance: 'A2',
    independent_approval_required: false,
    delegation: { allowed: true, max_depth: 2 },
    expires_at: '2026-09-30T00:00:00.000Z',
    ...overrides
  };
}

function grant({
  id = 'grant.reader',
  delegator = 'owner.alice',
  delegate = 'agent.reader',
  parentGrantId = null,
  delegation = { allowed: false, max_depth: 0 }
} = {}) {
  return {
    schema: DELEGATION_GRANT_SCHEMA,
    id,
    delegator,
    delegate,
    parent_grant_id: parentGrantId,
    issued_at: '2026-08-27T20:00:00.000Z',
    authority: authority(delegate, {
      actions: ['memory.read'],
      delegation,
      expires_at: '2026-09-10T00:00:00.000Z'
    })
  };
}

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-delegation-root-binding-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  return { ledgerPath: join(dir, 'delegation.jsonl') };
}

async function seedRootedLedger(ledgerPath, root = authority('owner.alice')) {
  return appendDelegationGrant({
    ledger_path: ledgerPath,
    root_authority: root,
    grant: grant(),
    now: NOW
  });
}

function legacyEntry(rawGrant) {
  const record = normalizeDelegationGrant(rawGrant);
  const core = {
    schema: 'axiom-delegation-ledger-entry.v1',
    sequence: 1,
    kind: 'grant',
    record,
    previous_entry_digest: null
  };
  return {
    ...core,
    entry_digest: digestObject(core)
  };
}

test('first grant registers a canonical root binding and chains sequence one to it', async t => {
  const { ledgerPath } = await fixture(t);
  const root = authority('owner.alice');
  const first = await seedRootedLedger(ledgerPath, root);

  const lines = (await readFile(ledgerPath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  const binding = JSON.parse(lines[0]);
  assert.equal(canonicalJson(binding), lines[0]);
  assert.equal(binding.schema, ROOT_BINDING_SCHEMA);
  assert.equal(binding.root_holder, 'owner.alice');
  assert.match(binding.root_authority_digest, /^[a-f0-9]{64}$/);
  assert.match(binding.binding_digest, /^[a-f0-9]{64}$/);
  assert.equal(binding.execution_authority_granted, false);
  assert.equal(binding.authority_effect, 'none');
  assert.equal(first.previous_entry_digest, binding.binding_digest);

  const ledger = await readDelegationLedger({
    ledger_path: ledgerPath,
    root_authority: root
  });
  assert.equal(ledger.root_bound, true);
  assert.equal(ledger.root_binding.schema, ROOT_BINDING_SCHEMA);
  assert.equal(ledger.root_authority_digest, binding.root_authority_digest);
  assert.equal(ledger.execution_authority_granted, false);
  assert.equal(ledger.authority_effect, 'none');
});

test('a rooted ledger rejects substitution of a different root authority', async t => {
  const { ledgerPath } = await fixture(t);
  const root = authority('owner.alice');
  await seedRootedLedger(ledgerPath, root);
  const substitutedRoot = authority('owner.alice', {
    destinations: ['local', 'provider:fixture']
  });

  await assert.rejects(
    projectDelegationLedger({
      ledger_path: ledgerPath,
      root_authority: substitutedRoot,
      target_grant_id: 'grant.reader',
      now: NOW
    }),
    /root authority.*binding|binding.*root authority/i
  );

  await assert.rejects(
    appendDelegationGrant({
      ledger_path: ledgerPath,
      root_authority: substitutedRoot,
      grant: grant({
        id: 'grant.second',
        delegate: 'agent.second'
      }),
      now: NOW
    }),
    /root authority.*binding|binding.*root authority/i
  );

  const ledger = await readDelegationLedger({ ledger_path: ledgerPath });
  assert.equal(ledger.grants.length, 1);
});

test('root binding tampering fails closed before delegation history is accepted', async t => {
  const { ledgerPath } = await fixture(t);
  await seedRootedLedger(ledgerPath);
  const lines = (await readFile(ledgerPath, 'utf8')).trim().split('\n');
  const binding = JSON.parse(lines[0]);
  binding.root_authority_digest = '0'.repeat(64);
  lines[0] = canonicalJson(binding);
  await writeFile(ledgerPath, `${lines.join('\n')}\n`, 'utf8');

  await assert.rejects(
    readDelegationLedger({ ledger_path: ledgerPath }),
    /root binding.*digest|binding digest/i
  );
});

test('legacy unbound ledgers remain inspectable but cannot be silently adopted by a root', async t => {
  const { ledgerPath } = await fixture(t);
  const legacy = legacyEntry(grant());
  await writeFile(ledgerPath, `${canonicalJson(legacy)}\n`, 'utf8');

  const ledger = await readDelegationLedger({ ledger_path: ledgerPath });
  assert.equal(ledger.root_bound, false);
  assert.equal(ledger.root_binding, null);
  assert.equal(ledger.root_authority_digest, null);
  assert.equal(ledger.grants.length, 1);

  await assert.rejects(
    projectDelegationLedger({
      ledger_path: ledgerPath,
      root_authority: authority('owner.alice'),
      target_grant_id: 'grant.reader',
      now: NOW
    }),
    /unbound|migration/i
  );

  await assert.rejects(
    appendDelegationGrant({
      ledger_path: ledgerPath,
      root_authority: authority('owner.alice'),
      grant: grant({ id: 'grant.second', delegate: 'agent.second' }),
      now: NOW
    }),
    /unbound|migration/i
  );
});

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DELEGATION_AUTHORITY_SCHEMA,
  DELEGATION_GRANT_SCHEMA
} from '../src/lib/delegation-graph.mjs';
import {
  appendDelegationGrant,
  projectDelegationLedger,
  readDelegationLedger
} from '../src/lib/delegation-ledger.mjs';

const NOW = new Date('2026-08-27T22:00:00.000Z');

function rootAuthority() {
  return {
    schema: DELEGATION_AUTHORITY_SCHEMA,
    holder: 'owner.alice',
    actions: ['memory.read'],
    purposes: ['research.assist'],
    data_scopes: ['project.public'],
    destinations: ['local'],
    budgets: {
      max_requests_per_minute: 20,
      max_concurrent_requests: 1,
      max_execution_ms: 5_000,
      max_request_bytes: 131_072,
      max_response_bytes: 524_288
    },
    required_assurance: 'A2',
    independent_approval_required: false,
    delegation: { allowed: true, max_depth: 1 },
    expires_at: '2026-09-30T00:00:00.000Z'
  };
}

function grant() {
  return {
    schema: DELEGATION_GRANT_SCHEMA,
    id: 'grant.reader',
    delegator: 'owner.alice',
    delegate: 'agent.reader',
    parent_grant_id: null,
    issued_at: '2026-08-27T20:00:00.000Z',
    authority: {
      ...rootAuthority(),
      holder: 'agent.reader',
      delegation: { allowed: false, max_depth: 0 },
      expires_at: '2026-09-10T00:00:00.000Z'
    }
  };
}

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-delegation-ledger-durability-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  return { dir, ledgerPath: join(dir, 'delegation.jsonl') };
}

async function seed(ledgerPath) {
  return appendDelegationGrant({
    ledger_path: ledgerPath,
    root_authority: rootAuthority(),
    grant: grant(),
    now: NOW
  });
}

test('ledger and projection explicitly declare no runtime authority effect', async t => {
  const { ledgerPath } = await fixture(t);
  await seed(ledgerPath);

  const ledger = await readDelegationLedger({ ledger_path: ledgerPath });
  assert.equal(ledger.execution_authority_granted, false);
  assert.equal(ledger.authority_effect, 'none');

  const projection = await projectDelegationLedger({
    ledger_path: ledgerPath,
    root_authority: rootAuthority(),
    target_grant_id: 'grant.reader',
    now: NOW
  });
  assert.equal(projection.execution_authority_granted, false);
  assert.equal(projection.authority_effect, 'none');
});

test('ledger rejects an incomplete trailing record instead of accepting a torn append', async t => {
  const { ledgerPath } = await fixture(t);
  await seed(ledgerPath);
  const text = await readFile(ledgerPath, 'utf8');
  assert.ok(text.endsWith('\n'));
  await writeFile(ledgerPath, text.slice(0, -1), 'utf8');

  await assert.rejects(
    readDelegationLedger({ ledger_path: ledgerPath }),
    /incomplete trailing record/i
  );
});

test('ledger path must resolve to a regular non-symlink file', async t => {
  const { dir } = await fixture(t);
  const target = join(dir, 'target.jsonl');
  const link = join(dir, 'link.jsonl');
  await writeFile(target, '', 'utf8');
  await symlink(target, link);

  await assert.rejects(
    readDelegationLedger({ ledger_path: link }),
    /regular non-symlink file/i
  );
  await assert.rejects(
    appendDelegationGrant({
      ledger_path: link,
      root_authority: rootAuthority(),
      grant: grant(),
      now: NOW
    }),
    /regular non-symlink file/i
  );
});

test('ledger enforces configurable state and entry byte bounds', async t => {
  const { ledgerPath } = await fixture(t);
  await seed(ledgerPath);
  const size = Buffer.byteLength(await readFile(ledgerPath, 'utf8'), 'utf8');

  await assert.rejects(
    readDelegationLedger({
      ledger_path: ledgerPath,
      max_state_bytes: size - 1
    }),
    /state exceeds configured byte limit/i
  );

  await assert.rejects(
    readDelegationLedger({
      ledger_path: ledgerPath,
      max_entry_bytes: 64
    }),
    /entry 1 exceeds configured byte limit/i
  );
});

test('ledger implementation uses an explicitly synced file handle for append durability', async () => {
  const source = await readFile(new URL('../src/lib/delegation-ledger.mjs', import.meta.url), 'utf8');
  assert.match(source, /await\s+handle\.sync\(\)/);
  assert.doesNotMatch(source, /\bappendFile\s*\(/);
});

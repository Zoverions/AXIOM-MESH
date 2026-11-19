import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

const D = character => character.repeat(64);
const PRINCIPAL = 'agent.currentness.grid.1';
const ACTOR = 'owner.alice';

function authority(overrides = {}) {
  const profile = {
    id: PRINCIPAL,
    type: 'agent',
    sponsor: ACTOR,
    roles: ['researcher'],
    scopes: ['intent:execute', 'memory:read'],
    lifetime: 'session',
    expires_at: '2027-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.currentness.grid.1',
      kind: 'local-process',
      software_digest: D('a')
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 30_000,
        max_request_bytes: 32_768,
        max_response_bytes: 131_072
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    ...overrides
  };
  return {
    schema: 'axiom-machine-principal.v1',
    ...profile,
    authority_digest: digestObject(profile)
  };
}

function mutation({
  intentCharacter,
  transitionKind,
  root,
  current = null,
  successor = null,
  effectiveAt = '2026-11-19T09:55:00.000Z'
}) {
  const intentId = `intent_${D(intentCharacter)}`;
  const authorization = {
    schema: 'axiom-machine-principal-mutation-authorization.v1',
    actor_id: ACTOR,
    target_principal_id: PRINCIPAL,
    target_principal_type: 'agent',
    root_authority_digest: root.authority_digest,
    predecessor_lifecycle_seq: current?.lifecycle_seq ?? null,
    predecessor_lifecycle_head_digest: current?.lifecycle_head_digest ?? null,
    predecessor_authority_digest: current?.effective_authority_digest ?? null,
    transition_kind: transitionKind,
    successor_authority_digest: successor?.authority_digest ?? null,
    reason: 'bounded-test',
    policy_version: '2026-11-19.1',
    policy_digest: D('9'),
    operation: transitionKind === 'initialize'
      ? 'machine.principal.lifecycle.initialize'
      : 'machine.principal.lifecycle.mutate',
    intent_id: intentId,
    issued_at: effectiveAt,
    effective_at: effectiveAt,
    expires_at: '2026-11-20T09:55:30.000Z',
    command_id: `machine_cmd_${sha256(intentId)}`
  };
  const authorizationDigest = digestObject(authorization);
  const status = {
    initialize: 'active',
    narrow: 'narrowed',
    revoke: 'revoked',
    compromise: 'compromised',
    expire: 'expired'
  }[transitionKind];
  const transition = {
    schema: 'axiom-machine-principal-lifecycle-transition.v1',
    principal_id: PRINCIPAL,
    principal_type: 'agent',
    root_authority_digest: root.authority_digest,
    predecessor_lifecycle_seq: current?.lifecycle_seq ?? null,
    predecessor_lifecycle_head_digest: current?.lifecycle_head_digest ?? null,
    predecessor_authority_digest: current?.effective_authority_digest ?? null,
    successor_lifecycle_seq: (current?.lifecycle_seq ?? 0) + 1,
    successor_status: status,
    successor_authority_digest: successor?.authority_digest ?? null,
    successor_authority: successor,
    command_id: authorization.command_id,
    command_digest: authorizationDigest,
    mutation_authorization_digest: authorizationDigest,
    actor_id: ACTOR,
    policy_version: authorization.policy_version,
    policy_digest: authorization.policy_digest,
    reason: authorization.reason,
    effective_at: effectiveAt
  };
  return { authorization, transition };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-currentness-grid-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new GridStore({ path, dataDir, identity, protector });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    path,
    dataDir,
    identity,
    protector,
    get store() { return store; },
    restart() {
      store.close();
      store = new GridStore({ path, dataDir, identity, protector });
      return store;
    }
  };
}

test('migration 12 creates event-derived machine currentness tables', async t => {
  const f = await fixture(t);
  const tables = new Set(f.store.db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  ).all().map(row => row.name));

  assert.equal(f.store.getStatus().schema_version, 12);
  assert.equal(tables.has('machine_principal_lifecycle_heads'), true);
  assert.equal(tables.has('machine_principal_mutation_commands'), true);
  assert.equal(tables.has('machine_effect_releases'), true);
});

test('machine currentness initializes once, replays exactly, and survives restart', async t => {
  const f = await fixture(t);
  const root = authority();
  const command = mutation({
    intentCharacter: '1',
    transitionKind: 'initialize',
    root,
    successor: root
  });

  assert.throws(
    () => f.store.getMachineCurrentness(PRINCIPAL),
    error => error?.code === 'machine_currentness_not_found'
  );

  const initialized = f.store.commitMachineCurrentnessMutation({
    traceId: 'trace:machine-currentness:init',
    actor: ACTOR,
    ...command
  });
  const lastSeq = f.store.getStatus().last_seq;
  const replayed = f.store.commitMachineCurrentnessMutation({
    traceId: 'trace:machine-currentness:replay',
    actor: ACTOR,
    ...command
  });

  assert.equal(initialized.retained_status, 'active');
  assert.equal(initialized.lifecycle_seq, 1);
  assert.equal(initialized.effective_authority_digest, root.authority_digest);
  assert.equal(initialized.authority_effect, 'none');
  assert.deepEqual(replayed, initialized);
  assert.equal(replayed.lifecycle_head_event_id, initialized.lifecycle_head_event_id);
  assert.equal(replayed.lifecycle_head_event_hash, initialized.lifecycle_head_event_hash);
  assert.equal(f.store.getStatus().last_seq, lastSeq);

  const substitutedTransition = structuredClone(command);
  substitutedTransition.transition.reason = 'different-transition-bytes';
  assert.throws(
    () => f.store.commitMachineCurrentnessMutation({
      traceId: 'trace:machine-currentness:transition-conflict',
      actor: ACTOR,
      ...substitutedTransition
    }),
    error => error?.code === 'machine_currentness_command_conflict'
  );

  f.store.rebuildMaterializedState();
  const rebuilt = f.store.getMachineCurrentness(PRINCIPAL);
  assert.equal(rebuilt.lifecycle_head_event_id, initialized.lifecycle_head_event_id);
  assert.equal(rebuilt.lifecycle_head_event_hash, initialized.lifecycle_head_event_hash);
  assert.equal(rebuilt.lifecycle_head_digest, initialized.lifecycle_head_digest);

  const naturallyExpired = f.store.getMachineCurrentness(PRINCIPAL, {
    observedAt: '2027-01-01T00:00:00.001Z'
  });
  assert.equal(naturallyExpired.retained_status, 'active');
  assert.equal(naturallyExpired.effective_status, 'expired');
  assert.equal(naturallyExpired.authority_effect, 'none');

  f.restart();
  const restarted = f.store.getMachineCurrentness(PRINCIPAL);
  assert.equal(restarted.lifecycle_head_event_id, initialized.lifecycle_head_event_id);
  assert.equal(restarted.lifecycle_head_event_hash, initialized.lifecycle_head_event_hash);
  assert.equal(restarted.lifecycle_head_digest, initialized.lifecycle_head_digest);
});

test('machine currentness rejects command substitution, stale mutation, and terminal reactivation', async t => {
  const f = await fixture(t);
  const root = authority();
  const initialize = mutation({
    intentCharacter: '2',
    transitionKind: 'initialize',
    root,
    successor: root
  });
  const current = f.store.commitMachineCurrentnessMutation({
    traceId: 'trace:machine-currentness:init-guarded',
    actor: ACTOR,
    ...initialize
  });

  const substituted = structuredClone(initialize);
  substituted.authorization.reason = 'different-bytes';
  assert.throws(
    () => f.store.commitMachineCurrentnessMutation({
      traceId: 'trace:machine-currentness:command-conflict',
      actor: ACTOR,
      ...substituted
    }),
    error => error?.code === 'machine_currentness_command_conflict'
  );

  const narrowedAuthority = authority({ scopes: ['intent:execute'] });
  const wrongRoot = authority({ scopes: ['memory:read'] });
  const wrongRootMutation = mutation({
    intentCharacter: '8',
    transitionKind: 'narrow',
    root: wrongRoot,
    current,
    successor: wrongRoot
  });
  assert.throws(
    () => f.store.commitMachineCurrentnessMutation({
      traceId: 'trace:machine-currentness:root-mismatch',
      actor: ACTOR,
      ...wrongRootMutation
    }),
    error => error?.code === 'machine_currentness_root_mismatch'
  );

  for (const [intentCharacter, successor] of [
    ['d', root],
    ['e', authority({ scopes: ['audit:read', 'intent:execute', 'memory:read'] })]
  ]) {
    const invalidAttenuation = mutation({
      intentCharacter,
      transitionKind: 'narrow',
      root,
      current,
      successor
    });
    assert.throws(
      () => f.store.commitMachineCurrentnessMutation({
        traceId: `trace:machine-currentness:attenuation-${intentCharacter}`,
        actor: ACTOR,
        ...invalidAttenuation
      }),
      /attenuation|widen|strict/i
    );
  }

  const narrow = mutation({
    intentCharacter: '3',
    transitionKind: 'narrow',
    root,
    current,
    successor: narrowedAuthority
  });
  const narrowed = f.store.commitMachineCurrentnessMutation({
    traceId: 'trace:machine-currentness:narrow',
    actor: ACTOR,
    ...narrow
  });
  assert.equal(narrowed.retained_status, 'narrowed');
  assert.equal(narrowed.lifecycle_seq, 2);

  const stale = mutation({
    intentCharacter: '4',
    transitionKind: 'narrow',
    root,
    current,
    successor: narrowedAuthority
  });
  assert.throws(
    () => f.store.commitMachineCurrentnessMutation({
      traceId: 'trace:machine-currentness:stale',
      actor: ACTOR,
      ...stale
    }),
    error => error?.code === 'machine_currentness_stale'
  );

  const revoke = mutation({
    intentCharacter: '5',
    transitionKind: 'revoke',
    root,
    current: narrowed,
    successor: null
  });
  const revoked = f.store.commitMachineCurrentnessMutation({
    traceId: 'trace:machine-currentness:revoke',
    actor: ACTOR,
    ...revoke
  });
  assert.equal(revoked.retained_status, 'revoked');
  assert.equal(revoked.effective_authority, null);

  const reactivate = mutation({
    intentCharacter: '6',
    transitionKind: 'narrow',
    root,
    current: {
      ...revoked,
      effective_authority_digest: narrowed.effective_authority_digest
    },
    successor: narrowedAuthority
  });
  assert.throws(
    () => f.store.commitMachineCurrentnessMutation({
      traceId: 'trace:machine-currentness:reactivate',
      actor: ACTOR,
      ...reactivate
    }),
    error => error?.code === 'machine_currentness_terminal'
  );
});

test('independent Grid connections allow only one exact-predecessor successor', async t => {
  const f = await fixture(t);
  const root = authority();
  const initialized = f.store.commitMachineCurrentnessMutation({
    traceId: 'trace:machine-currentness:concurrency-init',
    actor: ACTOR,
    ...mutation({
      intentCharacter: 'a',
      transitionKind: 'initialize',
      root,
      successor: root
    })
  });
  const second = new GridStore({
    path: f.path,
    dataDir: f.dataDir,
    identity: f.identity,
    protector: f.protector
  });
  t.after(() => second.close());
  const successor = authority({ scopes: ['intent:execute'] });
  const winner = mutation({
    intentCharacter: 'b',
    transitionKind: 'narrow',
    root,
    current: initialized,
    successor
  });
  const loser = mutation({
    intentCharacter: 'c',
    transitionKind: 'narrow',
    root,
    current: initialized,
    successor
  });

  const committed = f.store.commitMachineCurrentnessMutation({
    traceId: 'trace:machine-currentness:concurrency-winner',
    actor: ACTOR,
    ...winner
  });
  assert.equal(committed.lifecycle_seq, 2);
  assert.throws(
    () => second.commitMachineCurrentnessMutation({
      traceId: 'trace:machine-currentness:concurrency-loser',
      actor: ACTOR,
      ...loser
    }),
    error => error?.code === 'machine_currentness_stale'
  );
  assert.equal(second.getMachineCurrentness(PRINCIPAL).lifecycle_seq, 2);
});

test('invalid lifecycle successor rolls back the event and materialized state together', async t => {
  const f = await fixture(t);
  const root = authority();
  const initialize = mutation({
    intentCharacter: '7',
    transitionKind: 'initialize',
    root,
    successor: root
  });
  const before = f.store.getStatus();
  const invalid = structuredClone(initialize);
  invalid.transition.root_authority_digest = D('8');

  assert.throws(
    () => f.store.commitMachineCurrentnessMutation({
      traceId: 'trace:machine-currentness:rollback',
      actor: ACTOR,
      ...invalid
    }),
    /root|digest|binding/i
  );
  assert.deepEqual(f.store.getStatus(), before);
  assert.throws(
    () => f.store.getMachineCurrentness(PRINCIPAL),
    error => error?.code === 'machine_currentness_not_found'
  );
});

test('initialization binds the exact active root authority', async t => {
  const f = await fixture(t);
  const root = authority();
  const differentRoot = authority({ scopes: ['intent:execute'] });
  const mismatched = mutation({
    intentCharacter: 'f',
    transitionKind: 'initialize',
    root: differentRoot,
    successor: root
  });
  assert.throws(
    () => f.store.commitMachineCurrentnessMutation({
      traceId: 'trace:machine-currentness:init-root-mismatch',
      actor: ACTOR,
      ...mismatched
    }),
    /exact root authority/i
  );

  const expiredRoot = authority({ expires_at: '2026-01-01T00:00:00.000Z' });
  const expired = mutation({
    intentCharacter: '0',
    transitionKind: 'initialize',
    root: expiredRoot,
    successor: expiredRoot
  });
  assert.throws(
    () => f.store.commitMachineCurrentnessMutation({
      traceId: 'trace:machine-currentness:init-expired',
      actor: ACTOR,
      ...expired
    }),
    /expired/i
  );
  assert.equal(f.store.getStatus().last_seq, 0);
});

test('generic Grid append cannot forge machine currentness events', async t => {
  const f = await fixture(t);
  const root = authority();
  const command = mutation({
    intentCharacter: '9',
    transitionKind: 'initialize',
    root,
    successor: root
  });

  assert.throws(
    () => f.store.appendEvents({
      traceId: 'trace:machine-currentness:generic-forgery',
      actor: ACTOR,
      events: [{
        kind: 'machine.currentness.initialized',
        subject: PRINCIPAL,
        payload: command
      }]
    }),
    /atomic mutation boundary/i
  );
  assert.equal(f.store.getStatus().last_seq, 0);
});

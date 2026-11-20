import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { closeTransportPools, signedFetch } from '../src/lib/client.mjs';
import { meshConfig } from '../src/lib/config.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';
import { createGridService } from '../src/grid/server.mjs';

const D = character => character.repeat(64);
const PRINCIPAL = 'agent.currentness.route.1';
const ACTOR = 'owner.alice';

function authority(expiresAt, id = PRINCIPAL) {
  const profile = {
    id,
    type: 'agent',
    sponsor: ACTOR,
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: expiresAt,
    runtime: {
      id: 'runtime.currentness.route.1',
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
    }
  };
  return {
    schema: 'axiom-machine-principal.v1',
    ...profile,
    authority_digest: digestObject(profile)
  };
}

function initialization(root, { intentCharacter = '1' } = {}) {
  const issuedAt = new Date(Date.now() - 1_000).toISOString();
  const effectiveAt = issuedAt;
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const intentId = `intent_${D(intentCharacter)}`;
  const authorization = {
    schema: 'axiom-machine-principal-mutation-authorization.v1',
    actor_id: ACTOR,
    target_principal_id: root.id,
    target_principal_type: 'agent',
    root_authority_digest: root.authority_digest,
    predecessor_lifecycle_seq: null,
    predecessor_lifecycle_head_digest: null,
    predecessor_authority_digest: null,
    transition_kind: 'initialize',
    successor_authority_digest: root.authority_digest,
    reason: 'bounded-route-test',
    policy_version: 'route-test.v1',
    policy_digest: D('9'),
    operation: 'machine.principal.lifecycle.initialize',
    intent_id: intentId,
    issued_at: issuedAt,
    effective_at: effectiveAt,
    expires_at: expiresAt,
    command_id: `machine_cmd_${sha256(intentId)}`
  };
  const authorizationDigest = digestObject(authorization);
  const transition = {
    schema: 'axiom-machine-principal-lifecycle-transition.v1',
    principal_id: root.id,
    principal_type: 'agent',
    root_authority_digest: root.authority_digest,
    predecessor_lifecycle_seq: null,
    predecessor_lifecycle_head_digest: null,
    predecessor_authority_digest: null,
    successor_lifecycle_seq: 1,
    successor_status: 'active',
    successor_authority_digest: root.authority_digest,
    successor_authority: root,
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

async function initializeViaRoute(fixtureValue, root, intentCharacter) {
  const command = initialization(root, { intentCharacter });
  const authorization = command.authorization;
  return signedFetch(
    fixtureValue.hypervisor,
    'grid',
    `${fixtureValue.config.urls.grid}/internal/v1/machine-currentness/mutate`,
    {
      method: 'POST',
      traceId: `trace_machine_currentness_list_${root.id}`,
      body: {
        actor: ACTOR,
        authorization,
        authorization_signature: fixtureValue.hypervisor.signObject(authorization),
        transition: command.transition
      }
    }
  );
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-currentness-routes-'));
  const portLease = await reserveProductionPortBlock('machine currentness route test');
  const basePort = portLease.base_port;
  const config = meshConfig({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`
  });
  const hypervisor = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const gateway = await ensureMeshIdentity(dataDir, 'gateway', { create: true });
  await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const grid = await createGridService(config);
  await grid.start();
  t.after(async () => {
    closeTransportPools();
    try {
      await grid.stop().catch(() => {});
    } finally {
      await portLease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  return { config, gateway, grid, hypervisor };
}

test('Grid currentness routes require Hypervisor and exact signed mutation bindings', async t => {
  const f = await fixture(t);
  const now = Date.now();
  const root = authority(new Date(now + 3_600_000).toISOString());
  const command = initialization(root);
  const mutateUrl = `${f.config.urls.grid}/internal/v1/machine-currentness/mutate`;
  const readUrl = `${f.config.urls.grid}/internal/v1/machine-currentness/${PRINCIPAL}`;

  await assert.rejects(
    () => signedFetch(f.gateway, 'grid', readUrl, {
      traceId: 'trace_machine_currentness_wrong_reader'
    }),
    error => error?.status === 403
  );
  await assert.rejects(
    () => signedFetch(f.gateway, 'grid', mutateUrl, {
      method: 'POST',
      traceId: 'trace_machine_currentness_wrong_mutator',
      body: {}
    }),
    error => error?.status === 403
  );

  const body = {
    actor: ACTOR,
    authorization: command.authorization,
    authorization_signature: f.hypervisor.signObject(command.authorization),
    transition: command.transition
  };
  const committed = await signedFetch(f.hypervisor, 'grid', mutateUrl, {
    method: 'POST',
    traceId: 'trace_machine_currentness_initialize',
    body
  });
  assert.equal(committed.schema, 'axiom-machine-principal-currentness-projection.v1');
  assert.equal(committed.lifecycle_seq, 1);
  assert.equal(committed.authority_effect, 'none');

  const read = await signedFetch(f.hypervisor, 'grid', readUrl, {
    traceId: 'trace_machine_currentness_read'
  });
  assert.equal(read.principal_id, PRINCIPAL);
  assert.equal(read.lifecycle_head_digest, committed.lifecycle_head_digest);

  for (const [label, changed] of [
    ['actor substitution', { ...body, actor: 'owner.mallory' }],
    ['signature substitution', {
      ...body,
      authorization_signature: f.gateway.signObject(command.authorization)
    }],
    ['unsigned authorization', { ...body, authorization_signature: null }],
    ['transition substitution', {
      ...body,
      transition: { ...command.transition, actor_id: 'owner.mallory' }
    }],
    ['unknown request field', { ...body, extra: true }]
  ]) {
    await assert.rejects(
      () => signedFetch(f.hypervisor, 'grid', mutateUrl, {
        method: 'POST',
        traceId: `trace_machine_currentness_${label.replaceAll(' ', '_')}`,
        body: changed
      }),
      error => error?.status === 400 || error?.status === 403,
      label
    );
  }

  await assert.rejects(
    () => signedFetch(f.hypervisor, 'grid', `${f.config.urls.grid}/internal/v1/commit`, {
      method: 'POST',
      traceId: 'trace_machine_currentness_generic_forgery',
      body: {
        actor: ACTOR,
        principal: ACTOR,
        events: [{
          kind: 'machine.currentness.initialized',
          subject: PRINCIPAL,
          payload: {
            authorization: command.authorization,
            transition: command.transition
          }
        }]
      }
    }),
    error => error?.code === 'validation_error'
  );
});

test('Grid exposes deterministic Hypervisor-only retained currentness pages without mutation', async t => {
  const f = await fixture(t);
  const listUrl = `${f.config.urls.grid}/internal/v1/machine-currentness`;

  await assert.rejects(
    () => signedFetch(f.gateway, 'grid', `${listUrl}?limit=2`, {
      traceId: 'trace_machine_currentness_list_wrong_reader'
    }),
    error => error?.status === 403
  );

  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  await initializeViaRoute(f, authority(expiresAt, 'agent.currentness.list.c'), '4');
  await initializeViaRoute(f, authority(expiresAt, 'agent.currentness.list.a'), '5');
  await initializeViaRoute(f, authority(expiresAt, 'agent.currentness.list.b'), '6');
  const committedSeq = f.grid.store.getStatus().last_seq;

  const first = await signedFetch(f.hypervisor, 'grid', `${listUrl}?limit=2`, {
    traceId: 'trace_machine_currentness_list_first'
  });
  assert.deepEqual(first.items.map(item => item.principal_id), [
    'agent.currentness.list.a',
    'agent.currentness.list.b'
  ]);
  assert.equal(first.page.limit, 2);
  assert.equal(first.page.has_more, true);
  assert.equal(typeof first.page.next_cursor, 'string');
  assert.equal(first.items.every(item => item.authority_effect === 'none'), true);

  const second = await signedFetch(
    f.hypervisor,
    'grid',
    `${listUrl}?limit=2&cursor=${encodeURIComponent(first.page.next_cursor)}`,
    { traceId: 'trace_machine_currentness_list_second' }
  );
  assert.deepEqual(second.items.map(item => item.principal_id), [
    'agent.currentness.list.c'
  ]);
  assert.deepEqual(second.page, {
    limit: 2,
    has_more: false,
    next_cursor: null
  });

  for (const query of [
    'limit=0',
    'limit=101',
    'limit=01',
    'limit=1&limit=2',
    'cursor=not-canonical',
    'extra=true'
  ]) {
    await assert.rejects(
      () => signedFetch(f.hypervisor, 'grid', `${listUrl}?${query}`, {
        traceId: `trace_machine_currentness_list_invalid_${query.replaceAll('=', '_')}`
      }),
      error => error?.status === 400,
      query
    );
  }
  assert.equal(f.grid.store.getStatus().last_seq, committedSeq);
});

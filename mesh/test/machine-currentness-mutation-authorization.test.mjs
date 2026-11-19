import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity, verifyObjectSignature } from '../src/lib/identity.mjs';

const NOW = '2026-11-19T16:45:00.000Z';
const D = character => character.repeat(64);

function identity() {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    'hypervisor',
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function authority(overrides = {}) {
  const profile = {
    id: 'agent.currentness.authorized.1',
    type: 'agent',
    sponsor: 'human.owner',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2027-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.currentness.authorized.1',
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

function currentness(root) {
  return {
    schema: 'axiom-machine-principal-currentness-projection.v1',
    principal_id: root.id,
    principal_type: root.type,
    root_authority_digest: root.authority_digest,
    retained_status: 'active',
    effective_status: 'active',
    lifecycle_seq: 1,
    lifecycle_head_event_id: 'evt_machine_currentness_1',
    lifecycle_head_event_hash: D('b'),
    lifecycle_head_digest: D('c'),
    effective_authority_digest: root.authority_digest,
    effective_authority: root,
    grid_chain_seq: 4,
    grid_chain_head: D('d'),
    observed_at: NOW,
    authority_effect: 'none'
  };
}

async function loadModule() {
  return import('../src/lib/machine-principal-mutation-authorization.mjs');
}

test('Hypervisor signs an exact 30-second lifecycle authorization bound to accepted intent and policy', async () => {
  const { buildMachineMutationAuthorization, verifyMachineMutationAuthorization } = await loadModule();
  const signer = identity();
  const root = authority();
  const intentId = `intent_${D('1')}`;
  const built = buildMachineMutationAuthorization(signer, {
    actor: { id: 'human.owner', type: 'human' },
    target_root: root,
    currentness: currentness(root),
    transition_kind: 'revoke',
    reason: 'incident-response',
    policy: { version: '2026-11-19.1', digest: D('9') },
    intent_id: intentId,
    issued_at: NOW
  });

  assert.deepEqual(built.statement, {
    schema: 'axiom-machine-principal-mutation-authorization.v1',
    actor_id: 'human.owner',
    target_principal_id: root.id,
    target_principal_type: 'agent',
    root_authority_digest: root.authority_digest,
    predecessor_lifecycle_seq: 1,
    predecessor_lifecycle_head_digest: D('c'),
    predecessor_authority_digest: root.authority_digest,
    transition_kind: 'revoke',
    successor_authority_digest: null,
    reason: 'incident-response',
    policy_version: '2026-11-19.1',
    policy_digest: D('9'),
    operation: 'machine.principal.lifecycle.mutate',
    intent_id: intentId,
    issued_at: NOW,
    effective_at: NOW,
    expires_at: '2026-11-19T16:45:30.000Z',
    command_id: `machine_cmd_${sha256(intentId)}`
  });
  assert.equal(built.digest, digestObject(built.statement));
  assert.equal(verifyObjectSignature(built.statement, built.signature, signer.publicKey), true);
  assert.deepEqual(
    verifyMachineMutationAuthorization(built, {
      hypervisorPublicKey: signer.publicKey,
      now: new Date('2026-11-19T16:45:29.999Z')
    }),
    built.statement
  );
});

test('verification rejects any changed binding, substitute signature, digest, or expiry', async () => {
  const { buildMachineMutationAuthorization, verifyMachineMutationAuthorization } = await loadModule();
  const signer = identity();
  const substitute = identity();
  const root = authority();
  const built = buildMachineMutationAuthorization(signer, {
    actor: { id: 'human.owner', type: 'human' },
    target_root: root,
    currentness: currentness(root),
    transition_kind: 'narrow',
    successor_authority: authority({ expires_at: '2026-12-01T00:00:00.000Z' }),
    reason: 'least-privilege',
    policy: { version: '2026-11-19.1', digest: D('9') },
    intent_id: `intent_${D('2')}`,
    issued_at: NOW
  });

  const mutations = [
    value => { value.statement.actor_id = 'human.attacker'; },
    value => { value.statement.target_principal_id = 'agent.substitute'; },
    value => { value.statement.predecessor_lifecycle_head_digest = D('e'); },
    value => { value.statement.successor_authority_digest = D('f'); },
    value => { value.statement.transition_kind = 'revoke'; },
    value => { value.statement.policy_version = 'substitute'; },
    value => { value.statement.policy_digest = D('0'); },
    value => { value.statement.intent_id = `intent_${D('3')}`; },
    value => { value.statement.expires_at = '2026-11-19T16:46:00.000Z'; },
    value => { value.digest = D('7'); },
    value => { value.signature = substitute.signObject(value.statement); }
  ];

  for (const mutate of mutations) {
    const changed = structuredClone(built);
    mutate(changed);
    assert.throws(
      () => verifyMachineMutationAuthorization(changed, {
        hypervisorPublicKey: signer.publicKey,
        now: new Date('2026-11-19T16:45:10.000Z')
      })
    );
  }

  assert.throws(
    () => verifyMachineMutationAuthorization(built, {
      hypervisorPublicKey: signer.publicKey,
      now: new Date('2026-11-19T16:45:30.000Z')
    }),
    /expired/
  );
});

test('initialization has a null predecessor and must bind the configured root as successor', async () => {
  const { buildMachineMutationAuthorization } = await loadModule();
  const root = authority();
  const built = buildMachineMutationAuthorization(identity(), {
    actor: { id: 'human.owner', type: 'human' },
    target_root: root,
    currentness: null,
    transition_kind: 'initialize',
    reason: 'establish-retained-head',
    policy: { version: '2026-11-19.1', digest: D('9') },
    intent_id: `intent_${D('4')}`,
    issued_at: NOW
  });

  assert.equal(built.statement.predecessor_lifecycle_seq, null);
  assert.equal(built.statement.predecessor_lifecycle_head_digest, null);
  assert.equal(built.statement.predecessor_authority_digest, null);
  assert.equal(built.statement.successor_authority_digest, root.authority_digest);
  assert.equal(built.statement.operation, 'machine.principal.lifecycle.initialize');
});

test('retained currentness from a different configured root fails closed', async () => {
  const { buildMachineMutationAuthorization } = await loadModule();
  const root = authority();
  const substitutedRoot = authority({ expires_at: '2026-12-01T00:00:00.000Z' });

  assert.throws(
    () => buildMachineMutationAuthorization(identity(), {
      actor: { id: 'human.owner', type: 'human' },
      target_root: substitutedRoot,
      currentness: currentness(root),
      transition_kind: 'revoke',
      reason: 'registry-drift',
      policy: { version: '2026-11-19.1', digest: D('9') },
      intent_id: `intent_${D('5')}`,
      issued_at: NOW
    }),
    /does not bind the configured root/
  );
});

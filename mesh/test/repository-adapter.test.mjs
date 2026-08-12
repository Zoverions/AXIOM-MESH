import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  SOURCE_CONTENT_ADDRESS_PROFILE,
  SOURCE_STATE_SCHEMA,
  normalizeSourceState
} from '../src/lib/source-continuity.mjs';
import {
  REPOSITORY_ADAPTER_OPERATION_SCHEMA,
  REPOSITORY_ADAPTER_SCHEMA,
  authorizeRepositoryAdapterOperation,
  buildRepositoryAdapterReplicaObservation,
  normalizeRepositoryAdapterDescriptor,
  normalizeRepositoryAdapterOperation,
  repositoryAdapterSupports
} from '../src/lib/repository-adapter.mjs';

const oid = value => sha256(value).slice(0, 40);

function sourceState() {
  return normalizeSourceState({
    schema: SOURCE_STATE_SCHEMA,
    repository_id: 'axiom-mesh',
    vcs: 'git',
    object_format: 'sha1',
    commit_oid: oid('adapter-source-commit'),
    tree_oid: oid('adapter-source-tree'),
    source_manifest_digest: sha256('adapter-source-manifest'),
    build: {
      kernel_version: '0.12.0-dev.3',
      capability_registry_digest: sha256('adapter-registry'),
      capability_evidence_digest: sha256('adapter-evidence'),
      release_boundary_digest: sha256('adapter-release')
    },
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

function descriptor(overrides = {}) {
  return normalizeRepositoryAdapterDescriptor({
    schema: REPOSITORY_ADAPTER_SCHEMA,
    adapter_id: 'mirror.github.primary',
    repository_id: 'axiom-mesh',
    transport: 'github',
    locator: 'github:Zoverions/AXIOM-MESH',
    vcs: 'git',
    object_format: 'sha1',
    operations: [
      'base.observe',
      'file.observe',
      'candidate.compare',
      'branch.ensure',
      'file.write',
      'review.ensure',
      'mirror.fetch',
      'mirror.publish'
    ],
    source_identity_authority: false,
    lineage_acceptance_authority: false,
    credentials_are_identity: false,
    provider_metadata_is_authority: false,
    operation_authority_required: true,
    ...overrides
  });
}

function operation(adapter, overrides = {}) {
  return normalizeRepositoryAdapterOperation({
    schema: REPOSITORY_ADAPTER_OPERATION_SCHEMA,
    adapter_digest: adapter.descriptor_digest,
    repository_id: adapter.repository_id,
    operation: 'base.observe',
    authority_digest: sha256('adapter-operation-authority'),
    request_digest: sha256('adapter-operation-request'),
    issued_at: '2026-08-11T16:30:00.000Z',
    expires_at: '2026-08-11T16:35:00.000Z',
    ...overrides
  });
}

test('GitHub and bare Git adapters can represent one logical repository without becoming its identity', () => {
  const github = descriptor();
  const bare = descriptor({
    adapter_id: 'mirror.offline.bare',
    transport: 'bare_git',
    locator: 'file:offline-bare-axiom-mesh',
    operations: ['base.observe', 'file.observe', 'candidate.compare', 'mirror.fetch', 'mirror.publish']
  });

  assert.equal(github.repository_id, 'axiom-mesh');
  assert.equal(bare.repository_id, 'axiom-mesh');
  assert.notEqual(github.descriptor_digest, bare.descriptor_digest);
  assert.equal(github.source_identity_authority, false);
  assert.equal(bare.lineage_acceptance_authority, false);
  assert.equal(github.credentials_are_identity, false);
});

test('changing provider locator changes adapter identity but not source identity', () => {
  const state = sourceState();
  const first = descriptor();
  const moved = descriptor({ locator: 'github:example-mirror/AXIOM-MESH' });

  assert.notEqual(first.descriptor_digest, moved.descriptor_digest);
  assert.equal(state.repository_id, first.repository_id);
  assert.equal(state.repository_id, moved.repository_id);
  assert.equal(sourceState().state_digest, state.state_digest);
});

test('adapter descriptor cannot claim source, lineage, credential, or provider authority', () => {
  for (const override of [
    { source_identity_authority: true },
    { lineage_acceptance_authority: true },
    { credentials_are_identity: true },
    { provider_metadata_is_authority: true },
    { operation_authority_required: false }
  ]) {
    assert.throws(() => descriptor(override), /authority boundary is weakened/);
  }
});

test('operation admission enforces adapter capability ceiling but does not itself authorize execution', () => {
  const adapter = descriptor({
    operations: ['base.observe', 'file.observe', 'mirror.fetch']
  });
  const requested = operation(adapter);
  const decision = authorizeRepositoryAdapterOperation({
    descriptor: adapter,
    operation: requested,
    now: '2026-08-11T16:31:00.000Z'
  });
  assert.equal(decision.allowed_by_adapter_ceiling, true);
  assert.equal(decision.execution_authorized, false);
  assert.equal(decision.authority_digest, requested.authority_digest);

  assert.throws(() => authorizeRepositoryAdapterOperation({
    descriptor: adapter,
    operation: operation(adapter, { operation: 'file.write' }),
    now: '2026-08-11T16:31:00.000Z'
  }), /exceeds the adapter capability ceiling/);
});

test('operation binding fails on adapter substitution, repository substitution, and expiry', () => {
  const adapter = descriptor({ operations: ['base.observe'] });
  const requested = operation(adapter);
  const substituted = descriptor({
    adapter_id: 'mirror.github.secondary',
    locator: 'github:secondary/AXIOM-MESH',
    operations: ['base.observe']
  });

  assert.throws(() => authorizeRepositoryAdapterOperation({
    descriptor: substituted,
    operation: requested,
    now: '2026-08-11T16:31:00.000Z'
  }), /different adapter/);

  assert.throws(() => authorizeRepositoryAdapterOperation({
    descriptor: adapter,
    operation: operation(adapter, { repository_id: 'other-repository' }),
    now: '2026-08-11T16:31:00.000Z'
  }), /different repository/);

  assert.throws(() => authorizeRepositoryAdapterOperation({
    descriptor: adapter,
    operation: requested,
    now: '2026-08-11T16:36:00.000Z'
  }), /expired/);
});

test('adapter-derived replica observation remains non-authoritative', () => {
  const state = sourceState();
  const adapter = descriptor();
  const observation = buildRepositoryAdapterReplicaObservation({
    descriptor: adapter,
    source_state: state,
    observed_commit_oid: state.commit_oid,
    object_complete: true,
    digest_verified: true,
    status: 'reachable',
    observed_at: '2026-08-11T16:32:00.000Z'
  });

  assert.equal(observation.repository_id, state.repository_id);
  assert.equal(observation.source_state_digest, state.state_digest);
  assert.equal(observation.replica_id, adapter.adapter_id);
  assert.equal(observation.transport, 'github');
  assert.equal(observation.non_authoritative, true);
});

test('adapter/source Git object format mismatch fails closed', () => {
  const state = sourceState();
  const sha256Adapter = descriptor({
    object_format: 'sha256',
    operations: ['base.observe']
  });
  assert.throws(() => buildRepositoryAdapterReplicaObservation({
    descriptor: sha256Adapter,
    source_state: state,
    observed_commit_oid: null,
    object_complete: false,
    digest_verified: false,
    status: 'unavailable'
  }), /object formats differ/);
});

test('adapter capability introspection is bounded to the protocol vocabulary', () => {
  const adapter = descriptor({ operations: ['base.observe', 'mirror.fetch'] });
  assert.equal(repositoryAdapterSupports(adapter, 'base.observe'), true);
  assert.equal(repositoryAdapterSupports(adapter, 'file.write'), false);
  assert.equal(repositoryAdapterSupports(adapter, 'arbitrary.shell'), false);
});

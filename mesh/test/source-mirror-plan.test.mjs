import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { MeshIdentity } from '../src/lib/identity.mjs';
import { sha256 } from '../src/lib/canonical.mjs';
import {
  REPOSITORY_ADAPTER_OPERATION_SCHEMA,
  REPOSITORY_ADAPTER_SCHEMA,
  normalizeRepositoryAdapterDescriptor,
  normalizeRepositoryAdapterOperation
} from '../src/lib/repository-adapter.mjs';
import {
  SOURCE_CONTENT_ADDRESS_PROFILE,
  SOURCE_STATE_SCHEMA,
  normalizeSourceState
} from '../src/lib/source-continuity.mjs';
import {
  SOURCE_MIRROR_REF_NAMESPACE,
  buildSourceMirrorPlan,
  sourceMirrorAcceptedRef,
  verifySourceMirrorPlan
} from '../src/lib/source-mirror-plan.mjs';

const NOW = '2026-08-11T17:00:00.000Z';
const EXPIRES = '2026-08-11T17:05:00.000Z';

function identity() {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    'repository-operator',
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function sourceState() {
  return normalizeSourceState({
    schema: SOURCE_STATE_SCHEMA,
    repository_id: 'axiom-mesh',
    vcs: 'git',
    object_format: 'sha1',
    commit_oid: 'a'.repeat(40),
    tree_oid: 'b'.repeat(40),
    source_manifest_digest: sha256('mirror-plan-manifest'),
    build: {
      kernel_version: '0.12.0-dev.3',
      capability_registry_digest: sha256('mirror-plan-registry'),
      capability_evidence_digest: sha256('mirror-plan-evidence'),
      release_boundary_digest: sha256('mirror-plan-release')
    },
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

function adapter({ id, transport, locator, operations }) {
  return normalizeRepositoryAdapterDescriptor({
    schema: REPOSITORY_ADAPTER_SCHEMA,
    adapter_id: id,
    repository_id: 'axiom-mesh',
    transport,
    locator,
    vcs: 'git',
    object_format: 'sha1',
    operations,
    source_identity_authority: false,
    lineage_acceptance_authority: false,
    credentials_are_identity: false,
    provider_metadata_is_authority: false,
    operation_authority_required: true
  });
}

function operation(descriptor, operationName, requestDigest, authorityDigest) {
  return normalizeRepositoryAdapterOperation({
    schema: REPOSITORY_ADAPTER_OPERATION_SCHEMA,
    adapter_digest: descriptor.descriptor_digest,
    repository_id: descriptor.repository_id,
    operation: operationName,
    authority_digest: authorityDigest,
    request_digest: requestDigest,
    issued_at: NOW,
    expires_at: EXPIRES
  });
}

function fixture() {
  const operator = identity();
  const state = sourceState();
  const source = adapter({
    id: 'source.local.working',
    transport: 'local_git',
    locator: 'local:axiom-working-source',
    operations: ['base.observe', 'mirror.publish']
  });
  const target = adapter({
    id: 'mirror.local.archive',
    transport: 'bare_git',
    locator: 'local:axiom-accepted-archive',
    operations: ['base.observe', 'mirror.fetch']
  });
  const requestDigest = sha256('mirror exact accepted source state');
  const authorityDigest = sha256('governed mirror authority placeholder');
  const sourceOperation = operation(source, 'mirror.publish', requestDigest, authorityDigest);
  const targetOperation = operation(target, 'mirror.fetch', requestDigest, authorityDigest);
  return { operator, state, source, target, sourceOperation, targetOperation };
}

test('accepted source state maps to deterministic immutable mirror ref and non-executing signed plan', () => {
  const f = fixture();
  const plan = buildSourceMirrorPlan({
    identity: f.operator,
    source_state: f.state,
    source_adapter: f.source,
    target_adapter: f.target,
    source_operation: f.sourceOperation,
    target_operation: f.targetOperation,
    planned_at: NOW,
    expires_at: EXPIRES
  });
  const verified = verifySourceMirrorPlan(plan, {
    operatorPublicKey: f.operator.publicKey,
    now: '2026-08-11T17:01:00.000Z'
  });

  assert.equal(
    verified.target_ref,
    `${SOURCE_MIRROR_REF_NAMESPACE}/${f.state.state_digest}`
  );
  assert.equal(verified.target_ref, sourceMirrorAcceptedRef(f.state.state_digest));
  assert.equal(verified.expected_commit_oid, f.state.commit_oid);
  assert.equal(verified.retention_mode, 'append_only_accepted_state_refs');
  assert.equal(verified.delete_allowed, false);
  assert.equal(verified.force_update_allowed, false);
  assert.equal(verified.execution_authorized, false);
  assert.equal(verified.provider_api_required, false);
  assert.equal(verified.network_required, false);
  assert.match(verified.plan_id, /^source-mirror-plan:[a-f0-9]{64}$/);
});

test('mirror plan contains opaque adapter locators and no filesystem execution path', () => {
  const f = fixture();
  const plan = buildSourceMirrorPlan({
    identity: f.operator,
    source_state: f.state,
    source_adapter: f.source,
    target_adapter: f.target,
    source_operation: f.sourceOperation,
    target_operation: f.targetOperation,
    planned_at: NOW,
    expires_at: EXPIRES
  });
  const serialized = JSON.stringify(plan);
  assert.equal(serialized.includes('/tmp/'), false);
  assert.equal(serialized.includes('C:\\'), false);
  assert.equal(serialized.includes('github.com'), false);
  assert.equal(Object.hasOwn(plan, 'source_path'), false);
  assert.equal(Object.hasOwn(plan, 'target_path'), false);
});

test('mirror plan refuses same-adapter copy, remote-provider source, or non-bare target', () => {
  const f = fixture();
  const base = {
    identity: f.operator,
    source_state: f.state,
    source_adapter: f.source,
    target_adapter: f.target,
    source_operation: f.sourceOperation,
    target_operation: f.targetOperation,
    planned_at: NOW,
    expires_at: EXPIRES
  };

  assert.throws(() => buildSourceMirrorPlan({
    ...base,
    target_adapter: f.source,
    target_operation: operation(
      f.source,
      'mirror.fetch',
      f.sourceOperation.request_digest,
      f.sourceOperation.authority_digest
    )
  }), /distinct source and target adapters|capability ceiling/);

  const github = adapter({
    id: 'source.github',
    transport: 'github',
    locator: 'github:Zoverions/AXIOM-MESH',
    operations: ['mirror.publish']
  });
  assert.throws(() => buildSourceMirrorPlan({
    ...base,
    source_adapter: github,
    source_operation: operation(
      github,
      'mirror.publish',
      f.sourceOperation.request_digest,
      f.sourceOperation.authority_digest
    )
  }), /source adapter must be local Git/);

  const workingTarget = adapter({
    id: 'target.working',
    transport: 'local_git',
    locator: 'local:target-working',
    operations: ['mirror.fetch']
  });
  assert.throws(() => buildSourceMirrorPlan({
    ...base,
    target_adapter: workingTarget,
    target_operation: operation(
      workingTarget,
      'mirror.fetch',
      f.sourceOperation.request_digest,
      f.sourceOperation.authority_digest
    )
  }), /target adapter must be bare Git/);
});

test('source and target mirror operations must bind the same request and authority', () => {
  const f = fixture();
  assert.throws(() => buildSourceMirrorPlan({
    identity: f.operator,
    source_state: f.state,
    source_adapter: f.source,
    target_adapter: f.target,
    source_operation: f.sourceOperation,
    target_operation: operation(
      f.target,
      'mirror.fetch',
      sha256('different request'),
      f.sourceOperation.authority_digest
    ),
    planned_at: NOW,
    expires_at: EXPIRES
  }), /one exact request/);

  assert.throws(() => buildSourceMirrorPlan({
    identity: f.operator,
    source_state: f.state,
    source_adapter: f.source,
    target_adapter: f.target,
    source_operation: f.sourceOperation,
    target_operation: operation(
      f.target,
      'mirror.fetch',
      f.sourceOperation.request_digest,
      sha256('different authority')
    ),
    planned_at: NOW,
    expires_at: EXPIRES
  }), /one exact authority/);
});

test('signed mirror plan rejects ref, commit, adapter, safety-flag, and signature substitution', () => {
  const f = fixture();
  const plan = buildSourceMirrorPlan({
    identity: f.operator,
    source_state: f.state,
    source_adapter: f.source,
    target_adapter: f.target,
    source_operation: f.sourceOperation,
    target_operation: f.targetOperation,
    planned_at: NOW,
    expires_at: EXPIRES
  });
  const verify = candidate => verifySourceMirrorPlan(candidate, {
    operatorPublicKey: f.operator.publicKey,
    now: '2026-08-11T17:01:00.000Z'
  });

  assert.throws(() => verify({ ...plan, target_ref: 'refs/heads/main' }), /target ref|content-addressed|signature/);
  assert.throws(() => verify({ ...plan, expected_commit_oid: 'c'.repeat(40) }), /expected commit|content-addressed|signature/);
  assert.throws(() => verify({ ...plan, delete_allowed: true }), /safety boundary|content-addressed|signature/);
  assert.throws(() => verify({
    ...plan,
    target_adapter: { ...plan.target_adapter, locator: 'local:substituted' }
  }), /descriptor digest|content-addressed|signature/);
  assert.throws(() => verify({
    ...plan,
    attestation: { ...plan.attestation, signature: 'AAAA' }
  }), /signature is invalid/);
});

test('mirror plan expires and cannot become execution authority through extra fields', () => {
  const f = fixture();
  const plan = buildSourceMirrorPlan({
    identity: f.operator,
    source_state: f.state,
    source_adapter: f.source,
    target_adapter: f.target,
    source_operation: f.sourceOperation,
    target_operation: f.targetOperation,
    planned_at: NOW,
    expires_at: EXPIRES
  });
  assert.throws(() => verifySourceMirrorPlan(plan, {
    operatorPublicKey: f.operator.publicKey,
    now: '2026-08-11T17:06:00.000Z'
  }), /expired/);
  assert.throws(() => verifySourceMirrorPlan({
    ...plan,
    durable_execution_authorized: true
  }, {
    operatorPublicKey: f.operator.publicKey,
    now: '2026-08-11T17:01:00.000Z'
  }), /unsupported fields/);
});

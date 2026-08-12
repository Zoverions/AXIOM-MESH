import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOURCE_CONTENT_ADDRESS_PROFILE,
  SOURCE_REPLICA_OBSERVATION_SCHEMA,
  SOURCE_STATE_SCHEMA,
  SOURCE_TRANSITION_SCHEMA,
  normalizeSourceReplicaObservation,
  normalizeSourceState,
  normalizeSourceTransition,
  verifySourceTransition
} from '../src/lib/source-continuity.mjs';

const D = value => value.repeat(64).slice(0, 64);
const OID = value => value.repeat(40).slice(0, 40);

function buildBinding(overrides = {}) {
  return {
    kernel_version: '0.12.0-dev.3',
    capability_registry_digest: D('a'),
    capability_evidence_digest: D('b'),
    release_boundary_digest: D('c'),
    ...overrides
  };
}

function sourceState(overrides = {}) {
  return normalizeSourceState({
    schema: SOURCE_STATE_SCHEMA,
    repository_id: 'axiom-mesh',
    vcs: 'git',
    object_format: 'sha1',
    commit_oid: OID('1'),
    tree_oid: OID('2'),
    source_manifest_digest: D('d'),
    build: buildBinding(),
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE,
    ...overrides
  });
}

function replica(state, overrides = {}) {
  return normalizeSourceReplicaObservation({
    schema: SOURCE_REPLICA_OBSERVATION_SCHEMA,
    repository_id: state.repository_id,
    source_state_digest: state.state_digest,
    replica_id: 'replica.primary',
    transport: 'github',
    locator: 'github:Zoverions/AXIOM-MESH',
    object_format: state.object_format,
    observed_commit_oid: state.commit_oid,
    object_complete: true,
    digest_verified: true,
    status: 'reachable',
    observed_at: '2026-08-11T16:00:00.000Z',
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE,
    ...overrides
  });
}

test('source identity is provider-independent and content-addressed', () => {
  const state = sourceState();
  assert.equal(state.repository_id, 'axiom-mesh');
  assert.match(state.state_digest, /^[a-f0-9]{64}$/);
  assert.equal(state.state_id, `source-state:${state.state_digest}`);
  assert.equal(Object.hasOwn(state, 'provider'), false);
  assert.equal(Object.hasOwn(state, 'repository_url'), false);

  assert.throws(() => normalizeSourceState({
    ...state,
    provider: 'github'
  }), /unsupported fields/);
});

test('independent replicas observe one source state without becoming lineage authority', () => {
  const state = sourceState();
  const github = replica(state);
  const radicle = replica(state, {
    replica_id: 'replica.radicle',
    transport: 'radicle',
    locator: 'rad:example-source-id'
  });
  const local = replica(state, {
    replica_id: 'replica.local',
    transport: 'bare_git',
    locator: 'file:offline-bare-mirror'
  });

  assert.equal(github.source_state_digest, state.state_digest);
  assert.equal(radicle.source_state_digest, state.state_digest);
  assert.equal(local.source_state_digest, state.state_digest);
  assert.equal(github.non_authoritative, true);
  assert.equal(radicle.non_authoritative, true);
  assert.notEqual(github.observation_digest, radicle.observation_digest);
  assert.equal(state.state_digest, sourceState().state_digest);

  assert.throws(() => normalizeSourceReplicaObservation({
    ...github,
    accepted: true
  }), /unsupported fields/);
});

test('accepted lineage transition binds exact parent and child but grants no authority by structure', () => {
  const parent = sourceState();
  const child = sourceState({
    commit_oid: OID('3'),
    tree_oid: OID('4'),
    source_manifest_digest: D('e')
  });
  const transition = normalizeSourceTransition({
    schema: SOURCE_TRANSITION_SCHEMA,
    repository_id: 'axiom-mesh',
    parent_state_digest: parent.state_digest,
    child_state_digest: child.state_digest,
    transition_type: 'advance',
    sequence: 1,
    authority_digest: D('f'),
    evidence_digest: D('0'),
    accepted_at: '2026-08-11T16:01:00.000Z',
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });

  const result = verifySourceTransition({
    transition,
    parent_state: parent,
    child_state: child
  });
  assert.equal(result.valid, true);
  assert.equal(result.authority_granted_by_structure, false);
  assert.equal(result.child_state_digest, child.state_digest);

  assert.throws(() => verifySourceTransition({
    transition,
    parent_state: parent,
    child_state: sourceState({ commit_oid: OID('5'), tree_oid: OID('6') })
  }), /child state binding is invalid/);
});

test('rollback is an explicit new transition rather than a history rewrite', () => {
  const oldState = sourceState();
  const currentState = sourceState({
    commit_oid: OID('7'),
    tree_oid: OID('8'),
    source_manifest_digest: D('1')
  });
  const rollback = normalizeSourceTransition({
    schema: SOURCE_TRANSITION_SCHEMA,
    repository_id: 'axiom-mesh',
    parent_state_digest: currentState.state_digest,
    child_state_digest: oldState.state_digest,
    transition_type: 'rollback',
    sequence: 2,
    authority_digest: D('2'),
    evidence_digest: D('3'),
    accepted_at: '2026-08-11T16:02:00.000Z',
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });

  assert.equal(rollback.parent_state_digest, currentState.state_digest);
  assert.equal(rollback.child_state_digest, oldState.state_digest);
  assert.notEqual(rollback.parent_state_digest, rollback.child_state_digest);
});

test('Git object format is explicit and SHA-256 object ids are supported without changing provider semantics', () => {
  const state = sourceState({
    object_format: 'sha256',
    commit_oid: D('4'),
    tree_oid: D('5')
  });
  assert.equal(state.object_format, 'sha256');
  assert.equal(state.commit_oid.length, 64);

  assert.throws(() => sourceState({
    object_format: 'sha256',
    commit_oid: OID('6'),
    tree_oid: OID('7')
  }), /commit_oid/);
});

test('unavailable replicas cannot claim observed or verified objects', () => {
  const state = sourceState();
  const unavailable = replica(state, {
    status: 'unavailable',
    observed_commit_oid: null,
    object_complete: false,
    digest_verified: false
  });
  assert.equal(unavailable.status, 'unavailable');

  assert.throws(() => replica(state, {
    status: 'unavailable',
    observed_commit_oid: null,
    object_complete: true,
    digest_verified: true
  }), /unavailable source replica/);
});

test('genesis transition is uniquely sequence zero with no parent', () => {
  const state = sourceState();
  const genesis = normalizeSourceTransition({
    schema: SOURCE_TRANSITION_SCHEMA,
    repository_id: state.repository_id,
    parent_state_digest: null,
    child_state_digest: state.state_digest,
    transition_type: 'genesis',
    sequence: 0,
    authority_digest: D('7'),
    evidence_digest: D('8'),
    accepted_at: '2026-08-11T16:03:00.000Z',
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
  assert.equal(genesis.parent_state_digest, null);

  assert.throws(() => normalizeSourceTransition({
    ...genesis,
    transition_id: undefined,
    transition_digest: undefined,
    sequence: 1
  }), /genesis source transition/);
});

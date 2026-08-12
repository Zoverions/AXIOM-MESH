import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  SOURCE_CONTENT_ADDRESS_PROFILE,
  SOURCE_REPLICA_OBSERVATION_SCHEMA,
  SOURCE_STATE_SCHEMA,
  normalizeSourceReplicaObservation,
  normalizeSourceState
} from '../src/lib/source-continuity.mjs';
import {
  SOURCE_REPLICA_PLACEMENT_SCHEMA,
  SOURCE_REPLICATION_POLICY_SCHEMA,
  evaluateSourceReplicationReadiness,
  normalizeSourceReplicaPlacement,
  normalizeSourceReplicationPolicy
} from '../src/lib/source-replication-diversity.mjs';

const NOW = '2026-08-12T10:00:00.000Z';
const FRESH = '2026-08-12T09:55:00.000Z';
const OLDER = '2026-08-12T09:40:00.000Z';
const STALE = '2026-08-12T07:00:00.000Z';

function sourceState({ manifest = 'manifest-a', commit = '1'.repeat(40) } = {}) {
  return normalizeSourceState({
    schema: SOURCE_STATE_SCHEMA,
    repository_id: 'axiom-mesh',
    vcs: 'git',
    object_format: 'sha1',
    commit_oid: commit,
    tree_oid: '2'.repeat(40),
    source_manifest_digest: sha256(manifest),
    build: {
      kernel_version: '0.12.0-dev.4',
      capability_registry_digest: 'a'.repeat(64),
      capability_evidence_digest: 'b'.repeat(64),
      release_boundary_digest: 'c'.repeat(64)
    },
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

function observation(state, replicaId, {
  transport = 'bare_git',
  status = 'reachable',
  observedAt = FRESH,
  commit = state.commit_oid,
  complete = status !== 'unavailable',
  verified = status === 'reachable'
} = {}) {
  return normalizeSourceReplicaObservation({
    schema: SOURCE_REPLICA_OBSERVATION_SCHEMA,
    repository_id: state.repository_id,
    source_state_digest: state.state_digest,
    replica_id: replicaId,
    transport,
    locator: `opaque-replica:${replicaId}`,
    object_format: state.object_format,
    observed_commit_oid: status === 'unavailable' ? null : commit,
    object_complete: complete,
    digest_verified: verified,
    status,
    observed_at: observedAt,
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

function placement(state, replicaId, {
  classes = [],
  storage = null,
  operator = null,
  provider = null,
  network = null,
  jurisdiction = null,
  assurance = 'independent_attested',
  verified = true,
  observedAt = FRESH
} = {}) {
  return normalizeSourceReplicaPlacement({
    schema: SOURCE_REPLICA_PLACEMENT_SCHEMA,
    repository_id: state.repository_id,
    source_state_digest: state.state_digest,
    replica_id: replicaId,
    availability_classes: classes,
    domains: { storage, operator, provider, network, jurisdiction },
    assurance,
    evidence_digest: sha256(`placement:${replicaId}:${storage}:${provider}:${observedAt}`),
    evidence_verified: verified,
    observed_at: observedAt,
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

function policy(state, overrides = {}) {
  return normalizeSourceReplicationPolicy({
    schema: SOURCE_REPLICATION_POLICY_SCHEMA,
    source_state_digest: state.state_digest,
    minimum_verified_replicas: 2,
    maximum_observation_age_seconds: 3_600,
    maximum_unhealthy_replicas: 0,
    required_transports: [],
    required_availability_classes: [],
    minimum_placement_assurance: 'independent_attested',
    minimum_distinct_domains: {
      storage: 0,
      operator: 0,
      provider: 0,
      network: 0,
      jurisdiction: 0
    },
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE,
    ...overrides
  });
}

test('two different replica URLs do not prove provider failure-domain diversity', () => {
  const state = sourceState();
  const rules = policy(state, {
    required_transports: ['bare_git', 'local_git'],
    minimum_distinct_domains: {
      storage: 2,
      operator: 2,
      provider: 2,
      network: 0,
      jurisdiction: 0
    }
  });
  const observations = [
    observation(state, 'replica-a', { transport: 'local_git' }),
    observation(state, 'replica-b', { transport: 'bare_git' })
  ];
  const placements = [
    placement(state, 'replica-a', {
      storage: 'storage-a', operator: 'operator-a', provider: 'provider-shared'
    }),
    placement(state, 'replica-b', {
      storage: 'storage-b', operator: 'operator-b', provider: 'provider-shared'
    })
  ];

  const result = evaluateSourceReplicationReadiness({
    source_state: state,
    policy: rules,
    observations,
    placements,
    now: NOW
  });
  assert.equal(result.healthy_verified_replicas, 2);
  assert.equal(result.distinct_domains.storage, 2);
  assert.equal(result.distinct_domains.operator, 2);
  assert.equal(result.distinct_domains.provider, 1);
  assert.deepEqual(result.low_diversity_domain_requirements, ['provider']);
  assert.equal(result.readiness, 'replicated_low_diversity');
  assert.equal(result.replica_locator_counted_as_failure_domain_evidence, false);
});

test('missing externally verified placement evidence produces continuity_unverified', () => {
  const state = sourceState();
  const rules = policy(state, {
    minimum_distinct_domains: {
      storage: 2,
      operator: 0,
      provider: 2,
      network: 0,
      jurisdiction: 0
    }
  });
  const result = evaluateSourceReplicationReadiness({
    source_state: state,
    policy: rules,
    observations: [
      observation(state, 'replica-a'),
      observation(state, 'replica-b')
    ],
    placements: [
      placement(state, 'replica-a', {
        storage: 'storage-a', provider: 'provider-a', verified: false
      })
    ],
    now: NOW
  });
  assert.equal(result.qualified_placement_evidence, 0);
  assert.deepEqual(result.unverified_domain_requirements, ['provider', 'storage']);
  assert.equal(result.readiness, 'continuity_unverified');
});

test('diversified exact replicas satisfy an explicit continuity policy', () => {
  const state = sourceState();
  const rules = policy(state, {
    minimum_verified_replicas: 3,
    maximum_unhealthy_replicas: 1,
    required_transports: ['bare_git', 'local_git', 'radicle'],
    required_availability_classes: ['offline', 'p2p', 'self_hosted'],
    minimum_distinct_domains: {
      storage: 3,
      operator: 2,
      provider: 2,
      network: 2,
      jurisdiction: 2
    }
  });
  const observations = [
    observation(state, 'replica-local', { transport: 'local_git' }),
    observation(state, 'replica-self', { transport: 'bare_git' }),
    observation(state, 'replica-p2p', { transport: 'radicle' }),
    observation(state, 'replica-old', { status: 'unavailable', verified: false, complete: false })
  ];
  const placements = [
    placement(state, 'replica-local', {
      classes: ['local', 'offline'],
      storage: 'storage-local',
      operator: 'operator-owner',
      provider: 'provider-local',
      network: 'network-local',
      jurisdiction: 'jurisdiction-ca'
    }),
    placement(state, 'replica-self', {
      classes: ['self_hosted'],
      storage: 'storage-self',
      operator: 'operator-owner',
      provider: 'provider-self',
      network: 'network-self',
      jurisdiction: 'jurisdiction-ca'
    }),
    placement(state, 'replica-p2p', {
      classes: ['p2p'],
      storage: 'storage-p2p',
      operator: 'operator-peer',
      provider: 'provider-p2p',
      network: 'network-p2p',
      jurisdiction: 'jurisdiction-eu'
    })
  ];

  const result = evaluateSourceReplicationReadiness({
    source_state: state,
    policy: rules,
    observations,
    placements,
    now: NOW
  });
  assert.equal(result.readiness, 'continuity_ready');
  assert.equal(result.policy_satisfied, true);
  assert.equal(result.healthy_verified_replicas, 3);
  assert.equal(result.unhealthy_or_stale_replicas, 1);
  assert.deepEqual(result.missing_required_transports, []);
  assert.deepEqual(result.missing_required_availability_classes, []);
  assert.deepEqual(result.distinct_domains, {
    storage: 3,
    operator: 2,
    provider: 3,
    network: 3,
    jurisdiction: 2
  });
  assert.equal(result.authority_granted, false);
  assert.equal(result.accepted_lineage_changed, false);
  assert.equal(result.replica_consensus_grants_lineage_authority, false);
});

test('latest replica observation wins and historical observations cannot inflate count', () => {
  const state = sourceState();
  const rules = policy(state, { minimum_verified_replicas: 2 });
  const result = evaluateSourceReplicationReadiness({
    source_state: state,
    policy: rules,
    observations: [
      observation(state, 'replica-a', { observedAt: OLDER }),
      observation(state, 'replica-a', {
        status: 'unavailable', observedAt: FRESH, verified: false, complete: false
      }),
      observation(state, 'replica-b')
    ],
    now: NOW
  });
  assert.equal(result.latest_replica_observations, 2);
  assert.equal(result.healthy_verified_replicas, 1);
  assert.equal(result.unhealthy_or_stale_replicas, 1);
  assert.deepEqual(result.healthy_replica_ids, ['replica-b']);
  assert.deepEqual(result.unhealthy_replica_ids, ['replica-a']);
  assert.equal(result.readiness, 'under_replicated');
});

test('same-time contradictory observations fail closed as ambiguous', () => {
  const state = sourceState();
  const first = observation(state, 'replica-a');
  const second = observation(state, 'replica-a', {
    status: 'divergent',
    commit: '3'.repeat(40),
    verified: false
  });
  assert.throws(
    () => evaluateSourceReplicationReadiness({
      source_state: state,
      policy: policy(state, { minimum_verified_replicas: 1 }),
      observations: [first, second],
      now: NOW
    }),
    /ambiguous same-time records/
  );
});

test('stale exact replica evidence does not count as current durability', () => {
  const state = sourceState();
  const result = evaluateSourceReplicationReadiness({
    source_state: state,
    policy: policy(state, {
      minimum_verified_replicas: 1,
      maximum_observation_age_seconds: 1_800
    }),
    observations: [observation(state, 'replica-a', { observedAt: STALE })],
    now: NOW
  });
  assert.equal(result.healthy_verified_replicas, 0);
  assert.equal(result.unhealthy_or_stale_replicas, 1);
  assert.equal(result.readiness, 'unreplicated');
});

test('otherwise diverse replicas become degraded when unhealthy ceiling is exceeded', () => {
  const state = sourceState();
  const result = evaluateSourceReplicationReadiness({
    source_state: state,
    policy: policy(state, {
      maximum_unhealthy_replicas: 0,
      required_transports: ['bare_git', 'local_git']
    }),
    observations: [
      observation(state, 'replica-a', { transport: 'local_git' }),
      observation(state, 'replica-b', { transport: 'bare_git' }),
      observation(state, 'replica-c', {
        status: 'compromised', verified: false, complete: true
      })
    ],
    now: NOW
  });
  assert.equal(result.healthy_verified_replicas, 2);
  assert.equal(result.unhealthy_or_stale_replicas, 1);
  assert.equal(result.readiness, 'degraded');
});

test('assessment is order-independent and content-addressed', () => {
  const state = sourceState();
  const rules = policy(state);
  const observations = [
    observation(state, 'replica-a', { transport: 'local_git' }),
    observation(state, 'replica-b', { transport: 'bare_git' })
  ];
  const first = evaluateSourceReplicationReadiness({
    source_state: state,
    policy: rules,
    observations,
    now: NOW
  });
  const second = evaluateSourceReplicationReadiness({
    source_state: state,
    policy: rules,
    observations: [...observations].reverse(),
    now: NOW
  });
  assert.deepEqual(first, second);
  assert.match(first.assessment_id, /^source-replication-assessment:[a-f0-9]{64}$/);
  assert.match(first.assessment_digest, /^[a-f0-9]{64}$/);
});

test('policy, observations, placements, and time are bound to the exact source state', () => {
  const state = sourceState();
  const other = sourceState({ manifest: 'manifest-b', commit: '4'.repeat(40) });
  const rules = policy(state, { minimum_verified_replicas: 1 });
  assert.throws(
    () => evaluateSourceReplicationReadiness({
      source_state: other,
      policy: rules,
      observations: [],
      now: NOW
    }),
    /policy is bound to a different source state/
  );
  assert.throws(
    () => evaluateSourceReplicationReadiness({
      source_state: state,
      policy: rules,
      observations: [observation(other, 'replica-other')],
      now: NOW
    }),
    /observation belongs to a different source state/
  );
  assert.throws(
    () => evaluateSourceReplicationReadiness({
      source_state: state,
      policy: rules,
      observations: [observation(state, 'replica-a', { observedAt: '2026-08-12T10:01:00.000Z' })],
      now: NOW
    }),
    /cannot be observed in the future/
  );
});

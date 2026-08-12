import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  PROJECT_EVENT_SCHEMA,
  normalizeProjectEvent
} from '../src/lib/project-continuity-events.mjs';
import {
  RELEASE_ARTIFACT_OBSERVATION_SCHEMA,
  RELEASE_CONTINUITY_MANIFEST_SCHEMA,
  evaluateReleaseContinuity,
  normalizeReleaseArtifactObservation,
  normalizeReleaseContinuityManifest,
  releaseManifestProjectContent
} from '../src/lib/release-artifact-continuity.mjs';
import { SOURCE_CONTENT_ADDRESS_PROFILE } from '../src/lib/source-continuity.mjs';

const SOURCE_STATE = 'a'.repeat(64);
const NOW = '2026-08-12T14:00:00.000Z';
const FRESH = '2026-08-12T13:55:00.000Z';
const STALE = '2026-08-10T13:00:00.000Z';

function artifact({
  id,
  kind,
  bytes,
  required = false,
  minimumCopies = 1,
  storageClasses = [],
  platform = null,
  sbom = null,
  provenance = null,
  signatures = []
}) {
  return {
    artifact_id: id,
    kind,
    media_type: kind === 'container_image' ? 'application/vnd.oci.image.manifest.v1+json' : 'application/octet-stream',
    sha256: sha256(bytes),
    byte_length: Buffer.byteLength(bytes),
    platform,
    required_for_reconstruction: required,
    minimum_verified_copies: minimumCopies,
    required_storage_classes: storageClasses,
    source_state_digest: SOURCE_STATE,
    evidence_refs: {
      sbom_artifact_id: sbom,
      provenance_artifact_id: provenance,
      signature_artifact_ids: signatures
    }
  };
}

function manifest(overrides = {}) {
  const artifacts = [
    artifact({
      id: 'artifact:source',
      kind: 'source_archive',
      bytes: 'source archive bytes',
      required: true,
      minimumCopies: 2,
      storageClasses: ['offline_archive', 'object_store'],
      sbom: 'artifact:sbom',
      provenance: 'artifact:provenance',
      signatures: ['artifact:signature']
    }),
    artifact({
      id: 'artifact:binary-linux-amd64',
      kind: 'binary',
      bytes: 'linux executable bytes',
      required: true,
      minimumCopies: 2,
      storageClasses: ['object_store', 'p2p'],
      platform: 'linux/amd64',
      sbom: 'artifact:sbom',
      provenance: 'artifact:provenance',
      signatures: ['artifact:signature']
    }),
    artifact({
      id: 'artifact:sbom',
      kind: 'sbom',
      bytes: 'sbom bytes',
      required: true,
      minimumCopies: 1,
      storageClasses: ['object_store']
    }),
    artifact({
      id: 'artifact:provenance',
      kind: 'provenance',
      bytes: 'provenance bytes',
      required: true,
      minimumCopies: 1,
      storageClasses: ['object_store']
    }),
    artifact({
      id: 'artifact:signature',
      kind: 'signature',
      bytes: 'signature bytes',
      required: true,
      minimumCopies: 1,
      storageClasses: ['offline_archive']
    }),
    artifact({
      id: 'artifact:docs',
      kind: 'documentation',
      bytes: 'release notes',
      required: false,
      minimumCopies: 1,
      storageClasses: ['forge_release']
    })
  ];
  return normalizeReleaseContinuityManifest({
    schema: RELEASE_CONTINUITY_MANIFEST_SCHEMA,
    project_id: 'axiom-mesh',
    release_id: 'release:axiom-mesh:0.12.0-dev.4',
    version: '0.12.0-dev.4',
    channel: 'development',
    created_at: '2026-08-12T13:30:00.000Z',
    source_state_digest: SOURCE_STATE,
    artifacts,
    provider_release_is_identity: false,
    production_promotion_claimed: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE,
    ...overrides
  });
}

function findArtifact(release, artifactId) {
  const found = release.artifacts.find(item => item.artifact_id === artifactId);
  assert.ok(found, `missing fixture artifact ${artifactId}`);
  return found;
}

function observation(release, artifactId, replicaId, {
  storageClass = 'object_store',
  locator = `opaque:${replicaId}`,
  status = 'reachable',
  observedAt = FRESH,
  observedSha256,
  observedByteLength,
  complete,
  verified
} = {}) {
  const target = findArtifact(release, artifactId);
  const unavailable = status === 'unavailable';
  return normalizeReleaseArtifactObservation({
    schema: RELEASE_ARTIFACT_OBSERVATION_SCHEMA,
    project_id: release.project_id,
    release_manifest_digest: release.manifest_digest,
    artifact_id: target.artifact_id,
    expected_artifact_sha256: target.sha256,
    expected_byte_length: target.byte_length,
    replica_id: replicaId,
    storage_class: storageClass,
    locator,
    observed_sha256: unavailable ? null : (observedSha256 ?? target.sha256),
    observed_byte_length: unavailable ? null : (observedByteLength ?? target.byte_length),
    object_complete: unavailable ? false : (complete ?? true),
    digest_verified: unavailable ? false : (verified ?? true),
    status,
    observed_at: observedAt,
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

function readyObservations(release) {
  return [
    observation(release, 'artifact:source', 'source-offline', { storageClass: 'offline_archive' }),
    observation(release, 'artifact:source', 'source-object', { storageClass: 'object_store' }),
    observation(release, 'artifact:binary-linux-amd64', 'binary-object', { storageClass: 'object_store' }),
    observation(release, 'artifact:binary-linux-amd64', 'binary-p2p', { storageClass: 'p2p' }),
    observation(release, 'artifact:sbom', 'sbom-object', { storageClass: 'object_store' }),
    observation(release, 'artifact:provenance', 'provenance-object', { storageClass: 'object_store' }),
    observation(release, 'artifact:signature', 'signature-offline', { storageClass: 'offline_archive' })
  ];
}

test('release manifest is provider-independent, deterministic, and content-addressed', () => {
  const first = manifest();
  const second = manifest({ artifacts: [...manifest().artifacts].reverse() });
  assert.deepEqual(first, second);
  assert.match(first.manifest_id, /^release-continuity-manifest:[a-f0-9]{64}$/);
  assert.match(first.manifest_digest, /^[a-f0-9]{64}$/);
  assert.equal(first.provider_release_is_identity, false);
  assert.equal(first.production_promotion_claimed, false);
  assert.equal('provider' in first, false);
  assert.equal('release_url' in first, false);
});

test('provider release fields cannot be laundered into release identity', () => {
  assert.throws(
    () => manifest({ provider: 'github' }),
    /unsupported fields: provider/
  );
  assert.throws(
    () => manifest({ release_url: 'https://github.com/Zoverions/AXIOM-MESH/releases/tag/dev4' }),
    /unsupported fields: release_url/
  );
  assert.throws(
    () => manifest({ provider_release_is_identity: true }),
    /claim boundary is weakened/
  );
  assert.throws(
    () => manifest({ production_promotion_claimed: true }),
    /claim boundary is weakened/
  );
});

test('all artifacts are exactly source-bound and at least one must be reconstruction-required', () => {
  const release = manifest();
  const changed = structuredClone(release.artifacts);
  changed[0].source_state_digest = 'b'.repeat(64);
  assert.throws(
    () => manifest({ artifacts: changed }),
    /different source state/
  );

  const optional = release.artifacts.map(item => ({ ...item, required_for_reconstruction: false }));
  assert.throws(
    () => manifest({ artifacts: optional }),
    /at least one reconstruction-required artifact/
  );
});

test('SBOM, provenance, and signature relationships require existing artifacts of the correct kinds', () => {
  const release = manifest();
  const missing = release.artifacts.filter(item => item.artifact_id !== 'artifact:sbom');
  assert.throws(
    () => manifest({ artifacts: missing }),
    /evidence target artifact:sbom is missing/
  );

  const wrongKind = structuredClone(release.artifacts);
  wrongKind.find(item => item.artifact_id === 'artifact:sbom').kind = 'documentation';
  assert.throws(
    () => manifest({ artifacts: wrongKind }),
    /must have kind sbom/
  );

  const self = structuredClone(release.artifacts);
  self.find(item => item.artifact_id === 'artifact:source').evidence_refs.signature_artifact_ids = ['artifact:source'];
  assert.throws(
    () => manifest({ artifacts: self }),
    /cannot cite itself as evidence/
  );
});

test('exact diversified artifact observations satisfy release continuity without granting promotion', () => {
  const release = manifest();
  const result = evaluateReleaseContinuity({
    manifest: release,
    observations: readyObservations(release),
    now: NOW,
    maximum_observation_age_seconds: 3_600
  });
  assert.equal(result.readiness, 'release_continuity_ready');
  assert.equal(result.policy_satisfied, true);
  assert.equal(result.provider_release_page_grants_release_identity, false);
  assert.equal(result.replica_consensus_grants_release_authority, false);
  assert.equal(result.production_promotion_granted, false);
  assert.equal(result.manifest_identity_changed, false);
  assert.ok(result.artifact_assessments.filter(item => item.required_for_reconstruction)
    .every(item => item.status === 'ready'));
});

test('GitHub release page copies alone cannot satisfy archive and storage-class requirements', () => {
  const release = manifest();
  const observations = release.artifacts
    .filter(item => item.required_for_reconstruction)
    .flatMap(item => [
      observation(release, item.artifact_id, `${item.artifact_id}:gh1`, { storageClass: 'forge_release' }),
      observation(release, item.artifact_id, `${item.artifact_id}:gh2`, { storageClass: 'forge_release' })
    ]);
  const result = evaluateReleaseContinuity({
    manifest: release,
    observations,
    now: NOW,
    maximum_observation_age_seconds: 3_600
  });
  assert.equal(result.readiness, 'release_low_storage_diversity');
  const source = result.artifact_assessments.find(item => item.artifact_id === 'artifact:source');
  assert.equal(source.healthy_verified_copies, 2);
  assert.deepEqual(source.observed_storage_classes, ['forge_release']);
  assert.deepEqual(source.missing_required_storage_classes, ['object_store', 'offline_archive']);
});

test('different URLs in the same storage class do not create storage-class diversity', () => {
  const release = manifest();
  const rows = readyObservations(release).filter(row => row.artifact_id !== 'artifact:source');
  rows.push(
    observation(release, 'artifact:source', 'object-a', {
      storageClass: 'object_store', locator: 'https://store-a.invalid/source'
    }),
    observation(release, 'artifact:source', 'object-b', {
      storageClass: 'object_store', locator: 'https://store-b.invalid/source'
    })
  );
  const result = evaluateReleaseContinuity({
    manifest: release,
    observations: rows,
    now: NOW,
    maximum_observation_age_seconds: 3_600
  });
  const source = result.artifact_assessments.find(item => item.artifact_id === 'artifact:source');
  assert.equal(source.healthy_verified_copies, 2);
  assert.deepEqual(source.observed_storage_classes, ['object_store']);
  assert.deepEqual(source.missing_required_storage_classes, ['offline_archive']);
  assert.equal(result.readiness, 'release_low_storage_diversity');
});

test('missing required artifact observations remain continuity-unverified rather than invented availability', () => {
  const release = manifest();
  const result = evaluateReleaseContinuity({
    manifest: release,
    observations: [],
    now: NOW,
    maximum_observation_age_seconds: 3_600
  });
  assert.equal(result.readiness, 'release_continuity_unverified');
  assert.equal(result.policy_satisfied, false);
  assert.ok(result.artifact_assessments.filter(item => item.required_for_reconstruction)
    .every(item => item.status === 'continuity_unverified'));
});

test('one verified copy where two are required is under-replicated even when its storage class is correct', () => {
  const release = manifest();
  const rows = readyObservations(release).filter(
    row => !(row.artifact_id === 'artifact:source' && row.replica_id === 'source-object')
  );
  const result = evaluateReleaseContinuity({
    manifest: release,
    observations: rows,
    now: NOW,
    maximum_observation_age_seconds: 3_600
  });
  const source = result.artifact_assessments.find(item => item.artifact_id === 'artifact:source');
  assert.equal(source.healthy_verified_copies, 1);
  assert.equal(source.status, 'under_replicated');
  assert.equal(result.readiness, 'release_under_replicated');
});

test('stale, divergent, unavailable, and compromised observations do not count as exact copies', () => {
  const release = manifest();
  const rows = readyObservations(release).filter(row => row.artifact_id !== 'artifact:source');
  rows.push(
    observation(release, 'artifact:source', 'stale-source', {
      storageClass: 'offline_archive', observedAt: STALE
    }),
    observation(release, 'artifact:source', 'divergent-source', {
      storageClass: 'object_store', status: 'divergent',
      observedSha256: 'f'.repeat(64), verified: false
    }),
    observation(release, 'artifact:source', 'unavailable-source', {
      storageClass: 'offline_archive', status: 'unavailable'
    }),
    observation(release, 'artifact:source', 'compromised-source', {
      storageClass: 'object_store', status: 'compromised', verified: false
    })
  );
  const result = evaluateReleaseContinuity({
    manifest: release,
    observations: rows,
    now: NOW,
    maximum_observation_age_seconds: 3_600
  });
  const source = result.artifact_assessments.find(item => item.artifact_id === 'artifact:source');
  assert.equal(source.healthy_verified_copies, 0);
  assert.equal(source.unhealthy_or_stale_copies, 4);
  assert.equal(source.status, 'under_replicated');
  assert.equal(result.readiness, 'release_under_replicated');
});

test('extra compromised replica degrades an otherwise policy-satisfied required artifact without changing manifest identity', () => {
  const release = manifest();
  const rows = [
    ...readyObservations(release),
    observation(release, 'artifact:source', 'source-compromised', {
      storageClass: 'forge_release', status: 'compromised', verified: false
    })
  ];
  const result = evaluateReleaseContinuity({
    manifest: release,
    observations: rows,
    now: NOW,
    maximum_observation_age_seconds: 3_600
  });
  const source = result.artifact_assessments.find(item => item.artifact_id === 'artifact:source');
  assert.equal(source.healthy_verified_copies, 2);
  assert.equal(source.unhealthy_or_stale_copies, 1);
  assert.equal(source.status, 'degraded');
  assert.equal(result.readiness, 'release_degraded');
  assert.equal(result.release_manifest_digest, release.manifest_digest);
  assert.equal(result.manifest_identity_changed, false);
});

test('latest observation per artifact replica wins and history cannot inflate copy count', () => {
  const release = manifest();
  const rows = readyObservations(release).filter(row => row.artifact_id !== 'artifact:source');
  rows.push(
    observation(release, 'artifact:source', 'source-one', {
      storageClass: 'offline_archive', observedAt: '2026-08-12T13:40:00.000Z'
    }),
    observation(release, 'artifact:source', 'source-one', {
      storageClass: 'offline_archive', observedAt: FRESH, status: 'unavailable'
    }),
    observation(release, 'artifact:source', 'source-two', { storageClass: 'object_store' })
  );
  const result = evaluateReleaseContinuity({
    manifest: release,
    observations: rows,
    now: NOW,
    maximum_observation_age_seconds: 3_600
  });
  const source = result.artifact_assessments.find(item => item.artifact_id === 'artifact:source');
  assert.equal(source.latest_replica_observations, 2);
  assert.equal(source.healthy_verified_copies, 1);
  assert.deepEqual(source.healthy_replica_ids, ['source-two']);
  assert.deepEqual(source.unhealthy_replica_ids, ['source-one']);
});

test('same-time contradictory artifact observations fail closed', () => {
  const release = manifest();
  const first = observation(release, 'artifact:source', 'source-one', {
    storageClass: 'offline_archive'
  });
  const second = observation(release, 'artifact:source', 'source-one', {
    storageClass: 'offline_archive', status: 'divergent',
    observedSha256: 'f'.repeat(64), verified: false
  });
  assert.throws(
    () => evaluateReleaseContinuity({
      manifest: release,
      observations: [first, second],
      now: NOW,
      maximum_observation_age_seconds: 3_600
    }),
    /contradictory same-time observations/
  );
});

test('future observations and expected-byte substitution fail closed', () => {
  const release = manifest();
  assert.throws(
    () => evaluateReleaseContinuity({
      manifest: release,
      observations: [observation(release, 'artifact:source', 'future', {
        observedAt: '2026-08-12T14:00:01.000Z'
      })],
      now: NOW,
      maximum_observation_age_seconds: 3_600
    }),
    /cannot be in the future/
  );

  const target = findArtifact(release, 'artifact:source');
  assert.throws(
    () => evaluateReleaseContinuity({
      manifest: release,
      observations: [{
        ...observation(release, 'artifact:source', 'substituted'),
        expected_artifact_sha256: 'f'.repeat(64)
      }],
      now: NOW,
      maximum_observation_age_seconds: 3_600
    }),
    /expected bytes do not match the manifest|digest does not match canonical content/
  );
  assert.match(target.sha256, /^[a-f0-9]{64}$/);
});

test('provider locator changes alter only observation identity, never release manifest identity', () => {
  const release = manifest();
  const first = observation(release, 'artifact:source', 'provider-copy', {
    storageClass: 'forge_release', locator: 'https://github.com/release/source.tar'
  });
  const second = observation(release, 'artifact:source', 'provider-copy-other', {
    storageClass: 'forge_release', locator: 'https://forgejo.example.invalid/release/source.tar'
  });
  assert.equal(first.release_manifest_digest, release.manifest_digest);
  assert.equal(second.release_manifest_digest, release.manifest_digest);
  assert.notEqual(first.observation_digest, second.observation_digest);
  assert.equal(release.provider_release_is_identity, false);
});

test('release manifest binds directly into portable release.published project evidence', () => {
  const release = manifest();
  const content = releaseManifestProjectContent(release);
  const projectEvent = normalizeProjectEvent({
    schema: PROJECT_EVENT_SCHEMA,
    project_id: release.project_id,
    project_object_id: release.release_id,
    object_kind: 'release',
    event_kind: 'release.published',
    occurred_at: release.created_at,
    time_assurance: 'axiom_observed',
    actor: { actor_id: null, actor_binding_digest: null },
    content,
    source_state_digest: release.source_state_digest,
    previous_event_digest: null,
    related_object_ids: release.artifacts.map(item => item.artifact_id),
    ci_outcome: null,
    governance_authority_granted: false,
    capability_promotion: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
  assert.equal(projectEvent.source_state_digest, release.source_state_digest);
  assert.deepEqual(projectEvent.related_object_ids, release.artifacts.map(item => item.artifact_id).sort());
  assert.equal(projectEvent.governance_authority_granted, false);
  assert.equal(projectEvent.capability_promotion, false);
});

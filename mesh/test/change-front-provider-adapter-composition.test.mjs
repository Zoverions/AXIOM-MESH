import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSURANCE_EVIDENCE_SCHEMA,
  CHANGE_FRONT_SCHEMA,
  normalizeAssuranceEvidence,
  normalizeChangeFront
} from '../src/lib/assurance-graph.mjs';
import {
  CHANGE_FRONT_PROVIDER_CAPTURE_SCHEMA,
  adaptChangeFrontProviderCapture
} from '../src/lib/change-front-provider-adapter.mjs';
import {
  SOURCE_CONTENT_ADDRESS_PROFILE,
  SOURCE_STATE_SCHEMA,
  normalizeSourceState
} from '../src/lib/source-continuity.mjs';

const D0 = '0'.repeat(64);
const D1 = '1'.repeat(64);
const D2 = '2'.repeat(64);
const D3 = '3'.repeat(64);
const D4 = '4'.repeat(64);
const D5 = '5'.repeat(64);
const COMMIT = 'a'.repeat(40);

function state() {
  return normalizeSourceState({
    schema: SOURCE_STATE_SCHEMA,
    repository_id: 'axiom-mesh',
    vcs: 'git',
    object_format: 'sha1',
    commit_oid: COMMIT,
    tree_oid: 'b'.repeat(40),
    source_manifest_digest: D1,
    build: {
      kernel_version: '0.12.0-dev.3',
      capability_registry_digest: D2,
      capability_evidence_digest: D3,
      release_boundary_digest: D4
    },
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

function normalizedFront(sourceState) {
  return normalizeChangeFront({
    schema: CHANGE_FRONT_SCHEMA,
    front_id: 'front.composition',
    repository_id: 'axiom-mesh',
    base_state_digest: D0,
    head_state_digest: sourceState.state_digest,
    lifecycle: 'active',
    merge_eligible: false,
    depends_on: [],
    supersedes: [],
    replaces: [],
    claim_boundary_digest: D5,
    provider_observations: []
  });
}

function normalizedEvidence(sourceState) {
  return normalizeAssuranceEvidence({
    schema: ASSURANCE_EVIDENCE_SCHEMA,
    evidence_id: 'evidence.composition',
    front_id: 'front.composition',
    source_state_digest: sourceState.state_digest,
    evidence_class: 'independently_verified',
    basis_kind: 'local_bytes',
    subject: 'source.local-git-verification',
    result: 'pass',
    evidence_payload_digest: D5,
    environment_digest: D4,
    observed_at: '2026-08-13T08:00:00.000Z',
    current_for_front: true,
    non_authorizing: true
  });
}

function capture() {
  return {
    schema: CHANGE_FRONT_PROVIDER_CAPTURE_SCHEMA,
    provider: 'github',
    repository_id: 'axiom-mesh',
    locator: 'https://github.example/Zoverions/AXIOM-MESH/pull/1059',
    branch: 'architecture/assurance-graph-a1-provider-observation-20260813',
    review_id: '1059',
    external_revision: COMMIT,
    observed_at: '2026-08-13T08:01:00.000Z',
    provider_authenticity_verified: true,
    provider_evidence_digest: D3,
    checks: [],
    non_authoritative: true
  };
}

test('A1 accepts normalized A0 front and evidence artifacts and re-verifies their digests', () => {
  const sourceState = state();
  const front = normalizedFront(sourceState);
  const evidence = normalizedEvidence(sourceState);
  const result = adaptChangeFrontProviderCapture({
    front,
    source_state: sourceState,
    source_evidence: evidence,
    capture: capture()
  });

  assert.equal(result.front.front_digest, front.front_digest);
  assert.equal(result.source_evidence.evidence_digest, evidence.evidence_digest);
  assert.equal(result.provider_metadata_authoritative, false);
  assert.equal(result.merge_authority_granted, false);
});

test('A1 rejects tampered derived authority markers on normalized A0 artifacts', () => {
  const sourceState = state();
  const front = normalizedFront(sourceState);
  const evidence = normalizedEvidence(sourceState);

  assert.throws(() => adaptChangeFrontProviderCapture({
    front: { ...front, merge_authority_granted: true },
    source_state: sourceState,
    source_evidence: evidence,
    capture: capture()
  }), /cannot grant merge authority/);

  assert.throws(() => adaptChangeFrontProviderCapture({
    front,
    source_state: sourceState,
    source_evidence: { ...evidence, authority_granted: true },
    capture: capture()
  }), /cannot grant authority/);

  assert.throws(() => adaptChangeFrontProviderCapture({
    front,
    source_state: sourceState,
    source_evidence: { ...evidence, evidence_digest: D0 },
    capture: capture()
  }), /evidence digest does not match/);
});

test('A1 rejects unknown projected fields and malformed supplied A0 digests', () => {
  const sourceState = state();
  const front = normalizedFront(sourceState);
  const evidence = normalizedEvidence(sourceState);

  assert.throws(() => adaptChangeFrontProviderCapture({
    front: { ...front, capability_promotion_granted: true },
    source_state: sourceState,
    source_evidence: evidence,
    capture: capture()
  }), /change front contains unsupported fields/);

  assert.throws(() => adaptChangeFrontProviderCapture({
    front,
    source_state: sourceState,
    source_evidence: { ...evidence, merge_authority_granted: true },
    capture: capture()
  }), /source verification evidence contains unsupported fields/);

  assert.throws(() => adaptChangeFrontProviderCapture({
    front: { ...front, front_digest: '' },
    source_state: sourceState,
    source_evidence: evidence,
    capture: capture()
  }), /front_digest/);

  assert.throws(() => adaptChangeFrontProviderCapture({
    front,
    source_state: sourceState,
    source_evidence: { ...evidence, evidence_digest: '' },
    capture: capture()
  }), /evidence_digest/);
});

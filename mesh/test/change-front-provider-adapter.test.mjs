import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSURANCE_EVIDENCE_SCHEMA,
  CHANGE_FRONT_SCHEMA,
  normalizeAssuranceEvidence
} from '../src/lib/assurance-graph.mjs';
import {
  CHANGE_FRONT_PROVIDER_CAPTURE_SCHEMA,
  adaptChangeFrontProviderCapture,
  normalizeChangeFrontProviderCapture
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
const TREE = 'b'.repeat(40);

function sourceState(overrides = {}) {
  return normalizeSourceState({
    schema: SOURCE_STATE_SCHEMA,
    repository_id: 'axiom-mesh',
    vcs: 'git',
    object_format: 'sha1',
    commit_oid: COMMIT,
    tree_oid: TREE,
    source_manifest_digest: D1,
    build: {
      kernel_version: '0.12.0-dev.3',
      capability_registry_digest: D2,
      capability_evidence_digest: D3,
      release_boundary_digest: D4
    },
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE,
    ...overrides
  });
}

function front(state, overrides = {}) {
  return {
    schema: CHANGE_FRONT_SCHEMA,
    front_id: 'front.provider-test',
    repository_id: 'axiom-mesh',
    base_state_digest: D0,
    head_state_digest: state.state_digest,
    lifecycle: 'active',
    merge_eligible: false,
    depends_on: [],
    supersedes: [],
    replaces: [],
    claim_boundary_digest: D5,
    provider_observations: [],
    ...overrides
  };
}

function sourceEvidence(state, { current = true, result = 'pass', basis = 'local_bytes' } = {}) {
  return normalizeAssuranceEvidence({
    schema: ASSURANCE_EVIDENCE_SCHEMA,
    evidence_id: `evidence.source.${state.state_digest.slice(0, 12)}`,
    front_id: 'front.provider-test',
    source_state_digest: state.state_digest,
    evidence_class: 'independently_verified',
    basis_kind: basis,
    subject: 'source.local-git-verification',
    result,
    evidence_payload_digest: D5,
    environment_digest: D4,
    observed_at: '2026-08-13T07:35:00.000Z',
    current_for_front: current,
    non_authorizing: true
  });
}

function capture(overrides = {}) {
  return {
    schema: CHANGE_FRONT_PROVIDER_CAPTURE_SCHEMA,
    provider: 'github',
    repository_id: 'axiom-mesh',
    locator: 'https://github.example/Zoverions/AXIOM-MESH/pull/1057',
    branch: 'architecture/assurance-graph-a0-20260813',
    review_id: '1057',
    external_revision: COMMIT,
    observed_at: '2026-08-13T07:36:00.000Z',
    provider_authenticity_verified: true,
    provider_evidence_digest: D3,
    checks: [{
      name: 'Clean Kernel',
      result: 'success',
      external_run_id: '31677949560',
      external_revision: COMMIT,
      observed_at: '2026-08-13T07:36:00.000Z',
      provider_evidence_digest: D2
    }],
    non_authoritative: true,
    ...overrides
  };
}

test('provider capture binds an external revision to independently verified local source state', () => {
  const state = sourceState();
  const adapted = adaptChangeFrontProviderCapture({
    front: front(state),
    source_state: state,
    source_evidence: sourceEvidence(state),
    capture: capture()
  });

  assert.equal(adapted.head_matches_front, true);
  assert.equal(adapted.checks_all_success, true);
  assert.equal(adapted.checks_complete, true);
  assert.equal(adapted.provider_authenticity_verified, true);
  assert.equal(adapted.provider_metadata_authoritative, false);
  assert.equal(adapted.source_identity_derived_from_provider, false);
  assert.equal(adapted.merge_authority_granted, false);
  assert.equal(adapted.capability_promotion_granted, false);
  assert.equal(adapted.provider_mutation_performed, false);
  assert.equal(adapted.network_access_performed_by_adapter, false);
  assert.equal(adapted.provider_evidence.evidence_class, 'authenticated_assertion');
  assert.equal(adapted.provider_evidence.basis_kind, 'provider_report');
  assert.equal(adapted.provider_evidence.authority_granted, false);
  assert.equal(adapted.provider_observation.non_authoritative, true);
  assert.match(adapted.adaptation_digest, /^[a-f0-9]{64}$/);
});

test('provider revision substitution cannot bind to another verified source commit', () => {
  const state = sourceState();
  assert.throws(() => adaptChangeFrontProviderCapture({
    front: front(state),
    source_state: state,
    source_evidence: sourceEvidence(state),
    capture: capture({ external_revision: 'c'.repeat(40), checks: [] })
  }), /does not match the independently verified source-state commit/);
});

test('provider checks must be bound to the captured exact revision', () => {
  assert.throws(() => normalizeChangeFrontProviderCapture(capture({
    checks: [{
      name: 'Clean Kernel',
      result: 'success',
      external_run_id: '1',
      external_revision: 'c'.repeat(40),
      observed_at: '2026-08-13T07:36:00.000Z',
      provider_evidence_digest: D2
    }]
  })), /not bound to the captured external revision/);
});

test('unverified provider capture remains observation only and cannot manufacture provider evidence', () => {
  const state = sourceState();
  const adapted = adaptChangeFrontProviderCapture({
    front: front(state),
    source_state: state,
    source_evidence: sourceEvidence(state),
    capture: capture({ provider_authenticity_verified: false })
  });

  assert.equal(adapted.provider_evidence, null);
  assert.equal(adapted.provider_authenticity_verified, false);
  assert.equal(adapted.provider_metadata_authoritative, false);
  assert.equal(adapted.merge_authority_granted, false);
});

test('stale but verified source/provider observation is retained as non-current evidence', () => {
  const state = sourceState();
  const staleFront = front(state, { head_state_digest: 'f'.repeat(64) });
  const adapted = adaptChangeFrontProviderCapture({
    front: staleFront,
    source_state: state,
    source_evidence: sourceEvidence(state, { current: false }),
    capture: capture()
  });

  assert.equal(adapted.head_matches_front, false);
  assert.equal(adapted.provider_evidence.current_for_front, false);
  assert.equal(adapted.provider_evidence.authority_granted, false);
});

test('source evidence must prove local bytes and exact current-head semantics', () => {
  const state = sourceState();
  assert.throws(() => adaptChangeFrontProviderCapture({
    front: front(state),
    source_state: state,
    source_evidence: sourceEvidence(state, { basis: 'signed_artifact' }),
    capture: capture()
  }), /must be based on local bytes/);

  assert.throws(() => adaptChangeFrontProviderCapture({
    front: front(state),
    source_state: state,
    source_evidence: sourceEvidence(state, { result: 'fail' }),
    capture: capture()
  }), /requires passing source verification evidence/);

  assert.throws(() => adaptChangeFrontProviderCapture({
    front: front(state),
    source_state: state,
    source_evidence: sourceEvidence(state, { current: false }),
    capture: capture()
  }), /current_for_front does not match/);
});

test('provider capture is content-addressed and explicitly non-authoritative', () => {
  const normalized = normalizeChangeFrontProviderCapture(capture());
  assert.equal(normalized.non_authoritative, true);
  assert.match(normalized.capture_digest, /^[a-f0-9]{64}$/);
  assert.throws(
    () => normalizeChangeFrontProviderCapture(capture({ capture_digest: D0 })),
    /capture digest is invalid/
  );
  assert.throws(
    () => normalizeChangeFrontProviderCapture(capture({ non_authoritative: false })),
    /must remain non-authoritative/
  );
});

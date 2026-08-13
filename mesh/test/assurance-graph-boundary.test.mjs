import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSURANCE_EVIDENCE_SCHEMA,
  ASSURANCE_GRAPH_SCHEMA,
  CHANGE_FRONT_PROVIDER_OBSERVATION_SCHEMA,
  CHANGE_FRONT_SCHEMA,
  normalizeAssuranceEvidence,
  normalizeChangeFront,
  verifyAssuranceGraph
} from '../src/lib/assurance-graph.mjs';
import { ValidationError } from '../src/lib/canonical.mjs';

const D0 = '0'.repeat(64);
const D1 = '1'.repeat(64);
const D2 = '2'.repeat(64);
const D3 = '3'.repeat(64);

function front(overrides = {}) {
  return {
    schema: CHANGE_FRONT_SCHEMA,
    front_id: 'front.feature',
    repository_id: 'axiom-mesh',
    base_state_digest: D0,
    head_state_digest: D1,
    lifecycle: 'active',
    merge_eligible: false,
    depends_on: [],
    supersedes: [],
    replaces: [],
    claim_boundary_digest: D2,
    provider_observations: [],
    ...overrides
  };
}

function provider() {
  return {
    schema: CHANGE_FRONT_PROVIDER_OBSERVATION_SCHEMA,
    provider: 'github',
    locator: 'https://github.example/Zoverions/AXIOM-MESH/pull/1',
    branch: 'feature/example',
    review_id: '1',
    observed_at: '2026-08-13T07:00:00.000Z',
    non_authoritative: true
  };
}

function evidence(overrides = {}) {
  return {
    schema: ASSURANCE_EVIDENCE_SCHEMA,
    evidence_id: 'evidence.example',
    front_id: 'front.feature',
    source_state_digest: D1,
    evidence_class: 'independently_verified',
    basis_kind: 'signed_artifact',
    subject: 'workflow.clean-kernel',
    result: 'pass',
    evidence_payload_digest: D2,
    environment_digest: D3,
    observed_at: '2026-08-13T07:05:00.000Z',
    current_for_front: true,
    non_authorizing: true,
    ...overrides
  };
}

test('provider observation collection type errors are named validation failures', () => {
  assert.throws(
    () => normalizeChangeFront(front({ provider_observations: { provider: 'github' } })),
    error => error instanceof ValidationError && /provider_observations must be an array/.test(error.message)
  );
});

test('provider metadata cannot be attached to non-provider evidence bases', () => {
  assert.throws(
    () => normalizeAssuranceEvidence(evidence({ provider_observation: provider() })),
    /only valid for provider_report evidence/
  );
});

test('provider-report evidence cannot omit its provider observation', () => {
  assert.throws(
    () => normalizeAssuranceEvidence(evidence({
      evidence_class: 'authenticated_assertion',
      basis_kind: 'provider_report'
    })),
    /requires provider observation metadata/
  );
});

test('front and graph content-address tampering fails closed', () => {
  assert.throws(
    () => normalizeChangeFront(front({ front_digest: D3 })),
    /front digest does not match/
  );

  const valid = verifyAssuranceGraph({
    schema: ASSURANCE_GRAPH_SCHEMA,
    repository_id: 'axiom-mesh',
    fronts: [front()],
    evidence: [evidence()]
  });
  assert.throws(() => verifyAssuranceGraph({
    schema: ASSURANCE_GRAPH_SCHEMA,
    repository_id: 'axiom-mesh',
    fronts: [front()],
    evidence: [evidence()],
    graph_digest: valid.graph_digest === D3 ? D2 : D3
  }), /graph digest does not match/);
});

test('duplicate logical front and evidence identities are rejected', () => {
  assert.throws(() => verifyAssuranceGraph({
    schema: ASSURANCE_GRAPH_SCHEMA,
    repository_id: 'axiom-mesh',
    fronts: [front(), front()],
    evidence: []
  }), /change front ids must be unique/);

  assert.throws(() => verifyAssuranceGraph({
    schema: ASSURANCE_GRAPH_SCHEMA,
    repository_id: 'axiom-mesh',
    fronts: [front()],
    evidence: [evidence(), evidence()]
  }), /assurance evidence ids must be unique/);
});

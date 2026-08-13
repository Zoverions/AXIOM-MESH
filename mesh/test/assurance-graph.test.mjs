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

const D0 = '0'.repeat(64);
const D1 = '1'.repeat(64);
const D2 = '2'.repeat(64);
const D3 = '3'.repeat(64);
const D4 = '4'.repeat(64);
const D5 = '5'.repeat(64);
const D6 = '6'.repeat(64);
const REPOSITORY = 'axiom-mesh';

function provider(overrides = {}) {
  return {
    schema: CHANGE_FRONT_PROVIDER_OBSERVATION_SCHEMA,
    provider: 'github',
    locator: 'https://github.example/Zoverions/AXIOM-MESH/pull/1',
    branch: 'feature/example',
    review_id: '1',
    observed_at: '2026-08-13T07:00:00.000Z',
    non_authoritative: true,
    ...overrides
  };
}

function front({
  frontId = 'front.main',
  base = D0,
  head = D0,
  lifecycle = 'current-main',
  mergeEligible = false,
  dependsOn = [],
  supersedes = [],
  replaces = [],
  providerObservations = []
} = {}) {
  return {
    schema: CHANGE_FRONT_SCHEMA,
    front_id: frontId,
    repository_id: REPOSITORY,
    base_state_digest: base,
    head_state_digest: head,
    lifecycle,
    merge_eligible: mergeEligible,
    depends_on: dependsOn,
    supersedes,
    replaces,
    claim_boundary_digest: D6,
    provider_observations: providerObservations
  };
}

function evidence({
  evidenceId = 'evidence.clean',
  frontId = 'front.feature',
  source = D2,
  evidenceClass = 'independently_verified',
  basisKind = 'signed_artifact',
  result = 'pass',
  current = true,
  providerObservation
} = {}) {
  return {
    schema: ASSURANCE_EVIDENCE_SCHEMA,
    evidence_id: evidenceId,
    front_id: frontId,
    source_state_digest: source,
    evidence_class: evidenceClass,
    basis_kind: basisKind,
    subject: 'workflow.clean-kernel',
    result,
    evidence_payload_digest: D5,
    environment_digest: D4,
    observed_at: '2026-08-13T07:05:00.000Z',
    current_for_front: current,
    non_authorizing: true,
    ...(providerObservation ? { provider_observation: providerObservation } : {})
  };
}

function graph({ fronts, evidence: evidenceItems = [] }) {
  return {
    schema: ASSURANCE_GRAPH_SCHEMA,
    repository_id: REPOSITORY,
    fronts,
    evidence: evidenceItems
  };
}

test('provider observations never become change-front authority identity', () => {
  const first = normalizeChangeFront(front({
    frontId: 'front.feature',
    base: D0,
    head: D1,
    lifecycle: 'active',
    providerObservations: [provider()]
  }));
  const moved = normalizeChangeFront(front({
    frontId: 'front.feature',
    base: D0,
    head: D1,
    lifecycle: 'active',
    providerObservations: [provider({
      locator: 'https://another-forge.example/project/review/99',
      provider: 'other',
      branch: 'mirrored-feature',
      review_id: '99'
    })]
  }));

  assert.equal(first.front_digest, moved.front_digest);
  assert.equal(first.provider_metadata_in_authority_identity, false);
  assert.equal(first.merge_authority_granted, false);
  assert.notEqual(
    first.provider_observations[0].observation_digest,
    moved.provider_observations[0].observation_digest
  );
});

test('provider observations must remain explicitly non-authoritative', () => {
  assert.throws(() => normalizeChangeFront(front({
    frontId: 'front.feature',
    base: D0,
    head: D1,
    lifecycle: 'active',
    providerObservations: [provider({ non_authoritative: false })]
  })), /non-authoritative/);
});

test('evidence-only and other terminal/non-merge fronts cannot claim merge eligibility', () => {
  for (const lifecycle of [
    'current-main',
    'research',
    'evidence-only',
    'superseded',
    'rebuild-required'
  ]) {
    assert.throws(() => normalizeChangeFront(front({
      frontId: `front.${lifecycle}`,
      base: lifecycle === 'current-main' ? D1 : D0,
      head: D1,
      lifecycle,
      mergeEligible: true
    })), /never be merge-eligible/);
  }
});

test('dependency expected-head binding detects a moved dependency', () => {
  assert.throws(() => verifyAssuranceGraph(graph({
    fronts: [
      front(),
      front({
        frontId: 'front.parent',
        base: D0,
        head: D1,
        lifecycle: 'active'
      }),
      front({
        frontId: 'front.child',
        base: D1,
        head: D2,
        lifecycle: 'stack-child',
        dependsOn: [{
          front_id: 'front.parent',
          expected_head_state_digest: D3
        }]
      })
    ]
  })), /moved from the expected head/);
});

test('change-front dependency cycles fail closed', () => {
  assert.throws(() => verifyAssuranceGraph(graph({
    fronts: [
      front({
        frontId: 'front.a',
        base: D0,
        head: D1,
        lifecycle: 'stack-child',
        dependsOn: [{ front_id: 'front.b', expected_head_state_digest: D2 }]
      }),
      front({
        frontId: 'front.b',
        base: D1,
        head: D2,
        lifecycle: 'stack-child',
        dependsOn: [{ front_id: 'front.a', expected_head_state_digest: D1 }]
      })
    ]
  })), /dependency cycle/);
});

test('current evidence is stale when its source state is not the front head', () => {
  assert.throws(() => verifyAssuranceGraph(graph({
    fronts: [front({
      frontId: 'front.feature',
      base: D0,
      head: D2,
      lifecycle: 'active'
    })],
    evidence: [evidence({ source: D1, current: true })]
  })), /stale for current front head/);
});

test('historical negative evidence remains addressable without becoming current truth', () => {
  const verified = verifyAssuranceGraph(graph({
    fronts: [front({
      frontId: 'front.feature',
      base: D0,
      head: D2,
      lifecycle: 'active'
    })],
    evidence: [evidence({
      evidenceId: 'evidence.failed-earlier-head',
      source: D1,
      result: 'fail',
      current: false
    })]
  }));

  assert.equal(verified.evidence[0].negative_evidence, true);
  assert.equal(verified.evidence[0].current_for_front, false);
  assert.equal(verified.evidence[0].authority_granted, false);
});

test('asserted or provider-reported facts cannot masquerade as measured evidence', () => {
  assert.throws(() => normalizeAssuranceEvidence(evidence({
    evidenceClass: 'measured',
    basisKind: 'signed_artifact'
  })), /cannot use basis/);

  assert.throws(() => normalizeAssuranceEvidence(evidence({
    evidenceClass: 'measured',
    basisKind: 'provider_report',
    providerObservation: provider()
  })), /cannot use basis/);
});

test('provider-reported evidence stays an authenticated assertion and non-authorizing', () => {
  const normalized = normalizeAssuranceEvidence(evidence({
    evidenceClass: 'authenticated_assertion',
    basisKind: 'provider_report',
    providerObservation: provider()
  }));
  assert.equal(normalized.evidence_class, 'authenticated_assertion');
  assert.equal(normalized.provider_observation.non_authoritative, true);
  assert.equal(normalized.authority_granted, false);
});

test('valid graph binds current exact-head evidence without granting merge or promotion authority', () => {
  const main = front();
  const feature = front({
    frontId: 'front.feature',
    base: D0,
    head: D2,
    lifecycle: 'active',
    mergeEligible: true,
    dependsOn: [{
      front_id: 'front.main',
      expected_head_state_digest: D0
    }],
    providerObservations: [provider()]
  });
  const result = verifyAssuranceGraph(graph({
    fronts: [feature, main],
    evidence: [evidence()]
  }));

  assert.equal(result.valid, true);
  assert.equal(result.provider_observations_grant_authority, false);
  assert.equal(result.merge_authority_granted, false);
  assert.equal(result.capability_promotion_granted, false);
  assert.match(result.graph_digest, /^[a-f0-9]{64}$/);
});

test('graph digest is stable across input ordering and provider relocation', () => {
  const main = front();
  const featureA = front({
    frontId: 'front.feature',
    base: D0,
    head: D2,
    lifecycle: 'active',
    dependsOn: [{ front_id: 'front.main', expected_head_state_digest: D0 }],
    providerObservations: [provider()]
  });
  const featureB = front({
    frontId: 'front.feature',
    base: D0,
    head: D2,
    lifecycle: 'active',
    dependsOn: [{ front_id: 'front.main', expected_head_state_digest: D0 }],
    providerObservations: [provider({
      locator: 'https://mirror.example/reviews/feature',
      provider: 'other',
      review_id: 'feature-copy'
    })]
  });

  const first = verifyAssuranceGraph(graph({
    fronts: [main, featureA],
    evidence: [evidence()]
  }));
  const second = verifyAssuranceGraph(graph({
    fronts: [featureB, main],
    evidence: [evidence()]
  }));

  // Evidence includes its provider observation digest only when one is supplied;
  // the feature's provider location itself is intentionally absent from front identity.
  assert.equal(first.fronts.find(item => item.front_id === 'front.feature').front_digest,
    second.fronts.find(item => item.front_id === 'front.feature').front_digest);
  assert.equal(first.graph_digest, second.graph_digest);
});

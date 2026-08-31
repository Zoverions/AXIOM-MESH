import assert from 'node:assert/strict';
import test from 'node:test';

const MODULE_URL = new URL('../src/lib/discovery-challenge-fabric.mjs', import.meta.url);

const ZERO_BOUNDARY = Object.freeze({
  authority_effect: 'none',
  runtime_effect: 'none',
  capability_promotion: false,
  canonical_truth_effect: 'none',
  mutation_effect: 'none'
});

async function loadDcf() {
  return import(MODULE_URL.href);
}

function validSource(overrides = {}) {
  return {
    schema: 'axiom-discovery-source-envelope.v0',
    source_id: 'source:formal:memory-origin',
    captured_at: '2026-08-31T15:00:00.000Z',
    source_class: 'formal',
    title: 'Origin-bound memory authority research',
    locator: 'https://example.invalid/paper/memory-origin',
    publisher_or_origin: 'example-research-group',
    published_at: '2026-08-30T12:00:00.000Z',
    content_digest: 'a'.repeat(64),
    upstream_refs: [],
    evidence_status: 'fetched',
    sensitivity: 'public',
    notes: 'public deterministic test fixture',
    ...ZERO_BOUNDARY,
    ...overrides
  };
}

function suspicionLane(status, summary, sourceRefs = []) {
  return { status, source_refs: sourceRefs, summary };
}

function validCandidate(overrides = {}) {
  return {
    schema: 'axiom-discovery-insight-candidate.v0',
    candidate_id: 'candidate:financial-crisis-causation',
    summary: 'A future financial cyberattack could be exploited to accelerate digital settlement policy.',
    candidate_type: 'hypothesis',
    source_refs: ['source:formal:memory-origin'],
    evidence_strength: 'mixed',
    claim_confidence: 'low',
    independent_lineage_count: 1,
    novelty_status: 'partially-new',
    counterevidence_refs: [],
    uncertainties: [
      'No direct evidence currently links a beneficiary to causing the triggering event.'
    ],
    suspicion_decomposition: {
      observation: suspicionLane(
        'supported',
        'Financial authorities maintain cyber-continuity and emergency settlement plans.',
        ['source:formal:memory-origin']
      ),
      incentive: suspicionLane(
        'supported',
        'Some actors could benefit from faster adoption of a preferred settlement architecture.'
      ),
      capability: suspicionLane('unknown', 'Specific causal capability is not established.'),
      opportunity: suspicionLane('unknown', 'Specific access or opportunity is not established.'),
      preparation: suspicionLane(
        'supported',
        'Relevant emergency mechanisms can exist before an incident.'
      ),
      response: suspicionLane(
        'supported',
        'Institutions could use a real crisis to accelerate an existing policy preference.'
      ),
      causation: suspicionLane(
        'unknown',
        'No evidence currently establishes that a beneficiary caused or engineered the event.'
      )
    },
    adversarial_openness: {
      strongest_supporting_case: 'Existing incentives and prepared mechanisms make post-crisis policy acceleration plausible.',
      strongest_opposing_case: 'Preparedness and benefit are expected even when the triggering event is entirely external.',
      best_alternative_explanation: 'Authorities could simply be using pre-existing continuity tools during a genuine attack.',
      disconfirming_evidence_sought: 'Independent forensic attribution showing a different actor caused the attack.',
      prediction_or_test: 'Causation confidence should change only when event-specific attribution evidence appears.',
      prior_or_framing_risk: 'Suspicion of institutional self-interest can cause benefit to be mistaken for perpetration.',
      confidence_update: 'unchanged'
    },
    ...ZERO_BOUNDARY,
    ...overrides
  };
}

function validBlindspot(overrides = {}) {
  return {
    schema: 'axiom-blindspot-record.v0',
    blindspot_id: 'blindspot:protocol-composition-owner',
    candidate_ref: 'candidate:financial-crisis-causation',
    blindspot_class: 'unowned-boundary',
    description: 'Cross-layer security can fail even when each protocol validates locally.',
    affected_domain: 'protocol',
    current_assumption_or_gap: 'No named component currently owns all composed authorization transitions.',
    known_owner: null,
    urgency: 'high',
    review_state: 'unreviewed',
    ...ZERO_BOUNDARY,
    ...overrides
  };
}

function validImpact(overrides = {}) {
  return {
    schema: 'axiom-architecture-impact-record.v0',
    impact_id: 'impact:state-survivability',
    candidate_ref: 'candidate:financial-crisis-causation',
    blindspot_refs: ['blindspot:protocol-composition-owner'],
    affected_paths: ['docs/architecture/SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md'],
    affected_requirements: ['GRID-05'],
    affected_invariants: ['Suspicion is a research trigger, not a conclusion.'],
    impact_class: ['test', 'research-needed'],
    proposed_actions: [
      'Test whether independently recoverable state remains reconstructable after primary-custodian failure.'
    ],
    required_falsification: [
      'Demonstrate that existing independent evidence already guarantees reconstruction under the modeled failure.'
    ],
    risk_if_ignored: 'high',
    implementation_status: 'not-authorized',
    ...ZERO_BOUNDARY,
    ...overrides
  };
}

function validDisposition(overrides = {}) {
  return {
    schema: 'axiom-discovery-review-disposition.v0',
    disposition_id: 'disposition:state-survivability-test',
    impact_ref: 'impact:state-survivability',
    reviewer_identity: 'reviewer:owner',
    reviewed_at: '2026-08-31T15:30:00.000Z',
    decision: 'create-test-proposal',
    rationale: 'The defensive test follows from the observed cyber-recovery risk without assuming a speculative perpetrator.',
    next_locator: null,
    ...ZERO_BOUNDARY,
    ...overrides
  };
}

function clone(value) {
  return structuredClone(value);
}

test('DCF v0 exports five zero-authority contract surfaces', async () => {
  const dcf = await loadDcf();

  assert.equal(dcf.DISCOVERY_SOURCE_ENVELOPE_SCHEMA, 'axiom-discovery-source-envelope.v0');
  assert.equal(dcf.DISCOVERY_INSIGHT_CANDIDATE_SCHEMA, 'axiom-discovery-insight-candidate.v0');
  assert.equal(dcf.BLINDSPOT_RECORD_SCHEMA, 'axiom-blindspot-record.v0');
  assert.equal(dcf.ARCHITECTURE_IMPACT_RECORD_SCHEMA, 'axiom-architecture-impact-record.v0');
  assert.equal(dcf.DISCOVERY_REVIEW_DISPOSITION_SCHEMA, 'axiom-discovery-review-disposition.v0');

  assert.equal(typeof dcf.validateDiscoverySourceEnvelope, 'function');
  assert.equal(typeof dcf.validateDiscoveryInsightCandidate, 'function');
  assert.equal(typeof dcf.validateBlindspotRecord, 'function');
  assert.equal(typeof dcf.validateArchitectureImpactRecord, 'function');
  assert.equal(typeof dcf.validateDiscoveryReviewDisposition, 'function');
  assert.equal(typeof dcf.summarizeSuspicionDecomposition, 'function');
});

test('source envelope validates bounded provenance without mutating the source', async () => {
  const dcf = await loadDcf();
  const source = validSource();
  const before = clone(source);

  assert.equal(dcf.validateDiscoverySourceEnvelope(source), true);
  assert.deepEqual(source, before);
});

test('source envelope fails closed on unknown fields, self-lineage, invalid digest, or widened effects', async () => {
  const dcf = await loadDcf();

  assert.throws(
    () => dcf.validateDiscoverySourceEnvelope(validSource({ unexpected: true })),
    /unsupported field/i
  );
  assert.throws(
    () => dcf.validateDiscoverySourceEnvelope(validSource({
      upstream_refs: ['source:formal:memory-origin']
    })),
    /upstream|lineage|self/i
  );
  assert.throws(
    () => dcf.validateDiscoverySourceEnvelope(validSource({ content_digest: 'ABC' })),
    /digest|sha-256/i
  );
  assert.throws(
    () => dcf.validateDiscoverySourceEnvelope(validSource({ authority_effect: 'proposal' })),
    /authority/i
  );
  assert.throws(
    () => dcf.validateDiscoverySourceEnvelope(validSource({ runtime_effect: 'execute' })),
    /runtime/i
  );
  assert.throws(
    () => dcf.validateDiscoverySourceEnvelope(validSource({ capability_promotion: true })),
    /capability/i
  );
  assert.throws(
    () => dcf.validateDiscoverySourceEnvelope(validSource({ mutation_effect: 'write' })),
    /mutation/i
  );
});

test('candidate preserves hypothesis, uncertainty, negative evidence, and independent confidence dimensions', async () => {
  const dcf = await loadDcf();
  const hypothesis = validCandidate();
  const before = clone(hypothesis);

  assert.equal(dcf.validateDiscoveryInsightCandidate(hypothesis), true);
  assert.deepEqual(hypothesis, before);
  assert.equal(hypothesis.candidate_type, 'hypothesis');
  assert.equal(hypothesis.evidence_strength, 'mixed');
  assert.equal(hypothesis.claim_confidence, 'low');

  const negative = validCandidate({
    candidate_id: 'candidate:not-reproduced',
    summary: 'A previously reported behavior was not reproduced under the reviewed conditions.',
    candidate_type: 'negative-result',
    evidence_strength: 'moderate',
    claim_confidence: 'medium',
    suspicion_decomposition: undefined,
    adversarial_openness: undefined
  });
  delete negative.suspicion_decomposition;
  delete negative.adversarial_openness;

  assert.equal(dcf.validateDiscoveryInsightCandidate(negative), true);
  assert.equal(negative.candidate_type, 'negative-result');
});

test('candidate rejects self-counterevidence, impossible lineage count, and silent authority widening', async () => {
  const dcf = await loadDcf();

  assert.throws(
    () => dcf.validateDiscoveryInsightCandidate(validCandidate({
      counterevidence_refs: ['candidate:financial-crisis-causation']
    })),
    /counterevidence|self/i
  );
  assert.throws(
    () => dcf.validateDiscoveryInsightCandidate(validCandidate({
      independent_lineage_count: 2
    })),
    /lineage/i
  );
  assert.throws(
    () => dcf.validateDiscoveryInsightCandidate(validCandidate({
      canonical_truth_effect: 'accepted'
    })),
    /truth|canonical/i
  );
});

test('suspicion decomposition keeps benefit preparation response and causation independent', async () => {
  const dcf = await loadDcf();
  const candidate = validCandidate();
  const before = clone(candidate);

  assert.equal(dcf.validateDiscoveryInsightCandidate(candidate), true);
  const summary = dcf.summarizeSuspicionDecomposition(candidate);

  assert.equal(summary.present, true);
  assert.equal(summary.investigation_signal, true);
  assert.equal(summary.causation_status, 'unknown');
  assert.deepEqual(summary.causation_source_refs, []);
  assert.equal(
    summary.strongest_opposing_case,
    candidate.adversarial_openness.strongest_opposing_case
  );
  assert.equal(
    summary.best_alternative_explanation,
    candidate.adversarial_openness.best_alternative_explanation
  );
  assert.equal(summary.causation_inferred_from_other_lanes, false);
  assert.equal(Object.isFrozen(summary), true);
  assert.deepEqual(candidate, before);
});

test('direct causation evidence is representable only in the causation lane itself', async () => {
  const dcf = await loadDcf();
  const candidate = validCandidate();
  candidate.suspicion_decomposition.causation = suspicionLane(
    'supported',
    'A separately reviewed forensic source directly attributes the event.',
    ['source:formal:memory-origin']
  );

  assert.equal(dcf.validateDiscoveryInsightCandidate(candidate), true);
  const summary = dcf.summarizeSuspicionDecomposition(candidate);
  assert.equal(summary.causation_status, 'supported');
  assert.deepEqual(summary.causation_source_refs, ['source:formal:memory-origin']);
});

test('suspicion and adversarial-openness objects are closed and complete when supplied', async () => {
  const dcf = await loadDcf();
  const missingCausation = validCandidate();
  delete missingCausation.suspicion_decomposition.causation;
  assert.throws(
    () => dcf.validateDiscoveryInsightCandidate(missingCausation),
    /causation|required|missing/i
  );

  const extraLane = validCandidate();
  extraLane.suspicion_decomposition.intent = suspicionLane('supported', 'Invented lane.');
  assert.throws(
    () => dcf.validateDiscoveryInsightCandidate(extraLane),
    /unsupported field|intent/i
  );

  const badChallenge = validCandidate();
  badChallenge.adversarial_openness.confidence_update = 'confirmed';
  assert.throws(
    () => dcf.validateDiscoveryInsightCandidate(badChallenge),
    /confidence_update|confidence update/i
  );
});

test('blindspot record represents an unowned boundary without claiming an owner or effect', async () => {
  const dcf = await loadDcf();
  const blindspot = validBlindspot();
  const before = clone(blindspot);

  assert.equal(dcf.validateBlindspotRecord(blindspot), true);
  assert.equal(blindspot.known_owner, null);
  assert.equal(blindspot.blindspot_class, 'unowned-boundary');
  assert.deepEqual(blindspot, before);
});

test('architecture impact remains descriptive and not authorized even for a high-risk hypothesis', async () => {
  const dcf = await loadDcf();
  const impact = validImpact();
  const before = clone(impact);

  assert.equal(dcf.validateArchitectureImpactRecord(impact), true);
  assert.equal(impact.implementation_status, 'not-authorized');
  assert.deepEqual(impact.impact_class, ['test', 'research-needed']);
  assert.deepEqual(impact, before);

  assert.throws(
    () => dcf.validateArchitectureImpactRecord(validImpact({
      implementation_status: 'approved'
    })),
    /implementation|authorized/i
  );
});

test('review disposition records a governance proposal but cannot perform the effect', async () => {
  const dcf = await loadDcf();
  const disposition = validDisposition();
  const before = clone(disposition);

  assert.equal(dcf.validateDiscoveryReviewDisposition(disposition), true);
  assert.equal(disposition.decision, 'create-test-proposal');
  assert.equal(disposition.next_locator, null);
  assert.equal(disposition.authority_effect, 'none');
  assert.equal(disposition.runtime_effect, 'none');
  assert.equal(disposition.capability_promotion, false);
  assert.equal(disposition.mutation_effect, 'none');
  assert.deepEqual(disposition, before);

  assert.throws(
    () => dcf.validateDiscoveryReviewDisposition(validDisposition({
      mutation_effect: 'create-issue'
    })),
    /mutation/i
  );
});

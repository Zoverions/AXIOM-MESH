import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { assertHostileInputContract } from '../test-support/hostile-input-contract.mjs';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  computeBoundedDecisionQuestionSchemaDigest
} from '../src/lib/bounded-decision-question-schema.mjs';
import {
  normalizeBoundedDecisionProviderResult
} from '../src/lib/bounded-decision-observation.mjs';
import {
  OPERATION_CANDIDATE_STATE_SCHEMA,
  computeOperationCandidateStateDigest,
  createOperationCandidateSelectionProposal
} from '../src/lib/operation-candidate-selection.mjs';
import {
  composeProposalWithOfferDigest,
  composeProposalWithSelectionDigest,
  computeCandidateSetDigest,
  createInertOperationManifestFixture,
  createSemanticOperationProposal,
  normalizeGenericProviderResult,
  validateSemanticOperationProposalShape
} from '../src/lib/semantic-operation-proposal.mjs';
import { externalOperationOfferDigest } from '../src/lib/external-operation-offer.mjs';
import {
  OPERATION_PROPOSAL_BINDING_LIMITS,
  OPERATION_PROPOSAL_BINDING_REASONS,
  OPERATION_PROPOSAL_BINDING_SCHEMA,
  validateOperationProposalBinding,
  verifyOperationProposalBinding
} from '../src/lib/operation-proposal-binding.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);
const ZERO = '0'.repeat(64);
const READ = 'op.inert.read_status';
const TAGS = 'op.inert.list_tags';
const MODE = 'op.inert.set_mode';

const HARD_ZEROS = Object.freeze({
  authority_effect: 'none',
  assurance_effect: 'none',
  currentness_effect: 'none',
  execution_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  authorization_result: 'not-evaluated'
});

// ---------------------------------------------------------------- selection

function providerProfile() {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.operation-candidate.v1',
    catalog_entry_id: 'provider:operation-candidate-test',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: E,
    offering_ref: 'model.operation-candidate-test',
    offering_version_or_revision: 'model.operation-candidate-test-2026-09-18',
    offering_revision_evidence: 'provider-versioned',
    provider_mode: 'provider-remote',
    supported_question_kinds: ['binary-probability'],
    max_questions_per_request: 64,
    max_choice_cardinality: 64,
    max_score_levels: 10,
    type_guarantee: 'provider-native-closed-set',
    probability_support: 'full-distribution',
    latency_class: 'interactive',
    calibration_claim: 'local-experimental',
    retention_posture_ref: 'posture.retention.reviewed.v1',
    training_use_posture_ref: 'posture.training.reviewed.v1',
    created_at: '2026-09-18T14:30:00.000Z',
    review_at: '2026-10-18T14:30:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none'
  };
}

function relevanceQuestion() {
  const question = {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.operation-candidate.relevance.v1',
    question_kind: 'binary-probability',
    instructions: 'Estimate whether this already-eligible operation is relevant to the task.',
    purpose: 'operation-candidate-relevance',
    domain: 'agent.operation.candidate.relevance',
    state_contract_ref: OPERATION_CANDIDATE_STATE_SCHEMA,
    known_limitations: [
      'Relevance is evidence for context selection only and cannot create operation eligibility or authority.'
    ],
    created_at: '2026-09-18T14:31:00.000Z',
    true_meaning: 'The operation is relevant to the task after deterministic eligibility filtering.',
    false_meaning: 'The operation is not relevant enough to include in the bounded task context.',
    schema_digest: ZERO
  };
  question.schema_digest = computeBoundedDecisionQuestionSchemaDigest(question);
  return question;
}

function semanticEvidence(candidate, support) {
  const stateDigest = computeOperationCandidateStateDigest({
    taskPurposeDigest: F,
    operationId: candidate.operationId,
    manifestDigest: candidate.manifestDigest
  });
  const profile = providerProfile();
  const question = relevanceQuestion();
  const observation = normalizeBoundedDecisionProviderResult({
    observation_id: 'observation.' + candidate.operationId,
    state_digest: stateDigest,
    state_classification: 'confidential',
    observed_at: '2026-09-18T14:32:00.000Z',
    latency_ms: 12,
    answer: { kind: 'binary-probability', p_true: support },
    probability_evidence: null,
    provider_confidence: null,
    usage_evidence: {
      input_units: 64,
      output_units: 1,
      compute_class: null,
      provider_report_ref: 'usage.operation-candidate-test.v1'
    },
    calibration_report_ref: null,
    transport_evidence_ref: 'transport.operation-candidate-test.v1'
  }, profile, question);
  return {
    operationId: candidate.operationId,
    manifestDigest: candidate.manifestDigest,
    observation,
    providerProfile: profile,
    questionSchema: question
  };
}

// ---------------------------------------------------------------- proposal

function provider(overrides = {}) {
  return {
    provider_ref: 'provider.semantic-op.fixture',
    profile_ref: 'profile.semantic-op.local.v0',
    artifact_ref: 'artifact.semantic-op.fixture.v0',
    runtime_ref: 'runtime.semantic-op.fixture.v0',
    revision_evidence: 'content-addressed',
    provider_mode: 'owner-local',
    ...overrides
  };
}

function proposalCandidates(trustedCandidates) {
  return trustedCandidates.map((candidate) => ({
    operation_id: candidate.operationId,
    eligible: candidate.eligible,
    eligibility_reason: candidate.eligibilityReason
  }));
}

function makeProposal({
  manifest,
  candidates,
  calls,
  providerIdentity = provider(),
  candidateMode = 'eligible-only',
  providerResult
}) {
  const result = providerResult ?? normalizeGenericProviderResult({
    calls,
    suppressed: [],
    confidence: null,
    latency_ms: 5,
    usage_evidence: null,
    explanation: null
  });
  return createSemanticOperationProposal({
    provider: providerIdentity,
    manifest,
    candidates,
    request_digest: A,
    state_digest: B,
    state_classification: 'confidential',
    candidate_mode: candidateMode,
    provider_result: result,
    expected_provider_identity: providerIdentity,
    locality_policy: 'any',
    calibration_report_ref: null
  });
}

/**
 * Builds a consistent manifest / selection / proposal world.
 * support: operation_id -> p_true; ops missing from support get no evidence.
 */
function world({
  deny = [],
  support = { [READ]: 0.95, [TAGS]: 0.2, [MODE]: 0.2, 'op.inert.echo_flag': 0.2, 'op.inert.score_hint': 0.2 },
  calls = [{ operation_id: READ, arguments: { target: 'workspace' }, confidence: 0.9 }],
  policy = {},
  manifestDigestOverride = {},
  proposalCandidatesOverride = null,
  providerIdentity,
  candidateMode,
  providerResult
} = {}) {
  const manifest = createInertOperationManifestFixture();
  const denied = new Set(deny);
  const candidates = manifest.operations.map((operation) => ({
    operationId: operation.operation_id,
    manifestDigest: manifestDigestOverride[operation.operation_id] ?? manifest.manifest_digest,
    eligible: !denied.has(operation.operation_id),
    eligibilityReason: denied.has(operation.operation_id) ? 'policy-denied' : 'eligible',
    deterministicMatch: false
  }));
  const evidence = candidates
    .filter((candidate) => Object.hasOwn(support, candidate.operationId))
    .map((candidate) => semanticEvidence(candidate, support[candidate.operationId]));
  const selectionInput = {
    taskPurposeDigest: F,
    candidates,
    semanticEvidence: evidence,
    policy: {
      minimumSupport: 0.55,
      singleSelectSupport: 0.9,
      topK: 2,
      contextBudget: 5,
      fallbackBehavior: 'retain-eligible',
      ...policy
    }
  };
  const selection = createOperationCandidateSelectionProposal(selectionInput);
  const proposal = makeProposal({
    manifest,
    candidates: proposalCandidatesOverride ?? proposalCandidates(candidates),
    calls,
    providerIdentity,
    candidateMode,
    providerResult
  });
  return {
    manifest,
    selection_trusted_input: selectionInput,
    selection,
    proposal
  };
}

function reason(document) {
  return document.rejection_reason;
}

function expectRejected(trusted, expected) {
  const document = verifyOperationProposalBinding(trusted);
  assert.equal(document.binding_status, 'rejected', `expected rejection ${expected}`);
  assert.equal(reason(document), expected);
  assert.deepEqual(document.bound_operations, []);
  for (const [field, value] of Object.entries(HARD_ZEROS)) {
    assert.equal(document[field], value);
  }
  assert.equal(validateOperationProposalBinding(document).valid, true);
  return document;
}

/** Recomputes proposal_digest after a forgery, so shape validation still passes. */
function resealProposal(document) {
  const copy = structuredClone(document);
  delete copy.proposal_digest;
  return { ...copy, proposal_digest: digestObject(copy) };
}

function resealBinding(document) {
  const copy = structuredClone(document);
  delete copy.binding_digest;
  return { ...copy, binding_digest: digestObject(copy) };
}

// ---------------------------------------------------------------- offers

const offerFixture = (name) => JSON.parse(readFileSync(
  new URL(`./fixtures/external-operation-offer/${name}`, import.meta.url),
  'utf8'
));

function constraintsFor(offer, overrides = {}) {
  return {
    evaluated_at: '2026-09-16T20:01:00.000Z',
    required_axiom_action: offer.operation.axiom_action,
    expected_effect_class: offer.operation.effect_class,
    verified_effect: {
      axiom_action: offer.operation.axiom_action,
      schema_sha256: offer.operation.schema_sha256,
      provider_ref: offer.operation.provider_ref,
      effect_class: offer.operation.effect_class,
      evidence_digest: E
    },
    allowed_broker_destinations: offer.topology.broker_destination === null
      ? []
      : [offer.topology.broker_destination],
    allowed_provider_destinations: offer.topology.provider_destination === null
      ? []
      : [offer.topology.provider_destination],
    allowed_data_classes: [
      ...offer.operation.input_data_classes,
      ...offer.operation.output_data_classes
    ],
    max_spend: { amount_minor_units: 25, currency: 'USD' },
    require_current_offer: true,
    ...overrides
  };
}

function freeOfferEntry(operationId = READ) {
  const offer = offerFixture('offer-free-read.json');
  const catalog = offerFixture('catalog-synthetic-search.json');
  return {
    operation_id: operationId,
    offer_digest: externalOperationOfferDigest(offer),
    offer,
    catalog_entry: catalog,
    constraints: constraintsFor(offer)
  };
}

function paidOfferEntry(maxSpend) {
  const paid = offerFixture('offer-paid-read.json');
  const catalog = offerFixture('catalog-synthetic-search.json');
  catalog.entry_id = paid.catalog_entry.entry_id;
  catalog.subject.subject_id = paid.catalog_entry.entry_id;
  catalog.requested_access.actions = [paid.operation.axiom_action];
  catalog.requested_access.destinations = [paid.topology.provider_destination];
  catalog.requested_access.data_classes = [
    ...paid.operation.input_data_classes,
    ...paid.operation.output_data_classes
  ];
  catalog.requested_access.resource_bounds.cost_ceiling = { amount_minor_units: 25, currency: 'USD' };
  paid.catalog_entry.entry_digest = digestObject(catalog);
  return {
    operation_id: READ,
    offer_digest: externalOperationOfferDigest(paid),
    offer: paid,
    catalog_entry: catalog,
    constraints: constraintsFor(paid, { max_spend: maxSpend })
  };
}

// ================================================================ GREEN

test('GREEN: manifest + semantic-single selection on op.inert.read_status + proposal -> bound', () => {
  const trusted = world();
  assert.equal(trusted.selection.selection_mode, 'semantic-single');
  assert.deepEqual(trusted.selection.selected.map((item) => item.operation_id), [READ]);

  const document = verifyOperationProposalBinding(trusted);
  assert.equal(document.schema, OPERATION_PROPOSAL_BINDING_SCHEMA);
  assert.equal(document.binding_status, 'bound');
  assert.equal(document.rejection_reason, null);
  assert.equal(document.operation_manifest_digest, trusted.manifest.manifest_digest);
  assert.equal(document.proposal_candidate_set_digest, trusted.proposal.candidate_set_digest);
  assert.equal(document.selection_candidate_set_digest, trusted.selection.candidate_set_digest);
  assert.equal(document.selection_proposal_digest, trusted.selection.proposal_digest);
  assert.equal(document.proposal_digest, trusted.proposal.proposal_digest);
  assert.equal(document.proposal_id, trusted.proposal.proposal_id);
  assert.equal(document.selection_mode, 'semantic-single');
  assert.deepEqual(document.bound_operations, [{
    operation_id: READ,
    arguments_digest: digestObject({ target: 'workspace' }),
    offer_digest: null
  }]);
  for (const [field, value] of Object.entries(HARD_ZEROS)) {
    assert.equal(document[field], value, field);
  }
  assert.equal(Object.isFrozen(document), true);
  assert.equal(validateOperationProposalBinding(document).valid, true);

  // deterministic
  assert.equal(verifyOperationProposalBinding(world()).binding_digest, document.binding_digest);
});

test('GREEN: binding_digest is order-independent (key order, candidate order, evidence order, offers order)', () => {
  const calls = [
    { operation_id: READ, arguments: { target: 'workspace' }, confidence: 0.8 },
    { operation_id: TAGS, arguments: { limit: 3 }, confidence: 0.7 }
  ];
  const support = { [READ]: 0.8, [TAGS]: 0.7, [MODE]: 0.2, 'op.inert.echo_flag': 0.2, 'op.inert.score_hint': 0.2 };
  const base = world({ calls, support });
  assert.equal(base.selection.selection_mode, 'semantic-top-k');
  const offers = [freeOfferEntry(READ), freeOfferEntry(TAGS)];
  const first = verifyOperationProposalBinding({ ...base, offers });
  assert.equal(first.binding_status, 'bound');
  assert.equal(first.bound_operations.length, 2);
  assert.ok(first.bound_operations.every((entry) => entry.offer_digest !== null));

  const shuffledInput = {
    policy: { ...base.selection_trusted_input.policy },
    semanticEvidence: [...base.selection_trusted_input.semanticEvidence].reverse(),
    candidates: [...base.selection_trusted_input.candidates].reverse(),
    taskPurposeDigest: F
  };
  const second = verifyOperationProposalBinding({
    offers: [...offers].reverse(),
    proposal: base.proposal,
    selection: base.selection,
    selection_trusted_input: shuffledInput,
    manifest: base.manifest
  });
  assert.equal(second.binding_digest, first.binding_digest);

  // Reversing the provider's declared call order changes the proposal digest
  // (declared order is preserved) but not the canonical bound_operations.
  const reversed = world({ calls: [...calls].reverse(), support });
  const third = verifyOperationProposalBinding({ ...reversed, offers });
  assert.deepEqual(third.bound_operations, first.bound_operations);
});

test('GREEN: supplied eligible offer binds its recomputed digest', () => {
  const entry = freeOfferEntry();
  const document = verifyOperationProposalBinding({ ...world(), offers: [entry] });
  assert.equal(document.binding_status, 'bound');
  assert.equal(document.bound_operations[0].offer_digest, digestObject(entry.offer));
});

// ================================================================ RED

test('RED 1: tampered manifest carrying the old digest -> manifest-digest-mismatch', () => {
  const base = world();
  const operations = structuredClone(base.manifest.operations);
  operations[0].description = 'Tampered after digest';
  const tampered = { ...base.manifest, operations };

  // [O0 gap, P1] createSemanticOperationProposal only format-checks manifest_digest.
  const o0 = makeProposal({
    manifest: tampered,
    candidates: proposalCandidates(base.selection_trusted_input.candidates),
    calls: [{ operation_id: READ, arguments: { target: 'workspace' }, confidence: 0.9 }]
  });
  assert.equal(o0.operation_manifest_digest, base.manifest.manifest_digest);

  expectRejected({ ...base, manifest: tampered, proposal: o0 }, 'manifest-digest-mismatch');
});

test('RED 1b: proposal bound to a different manifest -> proposal-manifest-digest-mismatch', () => {
  const base = world();
  const otherManifest = createInertOperationManifestFixture({
    operations: base.manifest.operations.slice(0, 3).map((operation) => structuredClone(operation))
  });
  const proposal = makeProposal({
    manifest: otherManifest,
    candidates: otherManifest.operations.map((operation) => ({
      operation_id: operation.operation_id,
      eligible: true,
      eligibility_reason: 'eligible'
    })),
    calls: [{ operation_id: READ, arguments: { target: 'workspace' }, confidence: 0.9 }]
  });
  expectRejected({ ...base, proposal }, 'proposal-manifest-digest-mismatch');
});

test('RED 2: proposed op not in selection.selected -> operation-not-selected', () => {
  const trusted = world({ calls: [{ operation_id: TAGS, arguments: { limit: 2 }, confidence: 0.99 }] });
  assert.equal(trusted.proposal.proposed[0].operation_id, TAGS);
  // [O0 gap, P2] the selection compose helper only checks digest format.
  const o0 = composeProposalWithSelectionDigest(trusted.proposal, trusted.selection.proposal_digest);
  assert.equal(o0.selection_digest, trusted.selection.proposal_digest);
  expectRejected(trusted, 'operation-not-selected');
});

test('RED 3: deterministic-ineligible op at confidence 0.99 is never bound', () => {
  const base = world({ deny: [TAGS] });
  assert.equal(base.proposal.proposed.length, 1);
  // Forge: splice the ineligible op into proposed at 0.99 and reseal the digest.
  const forged = resealProposal({
    ...base.proposal,
    proposed: [
      ...structuredClone(base.proposal.proposed),
      { operation_id: TAGS, arguments: { limit: 1 }, confidence: 0.99, status: 'proposed', order_index: 1 }
    ]
  });
  // [O0 gap] shape validation and the compose helper accept the forgery.
  assert.doesNotThrow(() => validateSemanticOperationProposalShape(forged));
  assert.doesNotThrow(() => composeProposalWithSelectionDigest(forged, base.selection.proposal_digest));
  expectRejected({ ...base, proposal: forged }, 'operation-deterministic-ineligible');
});

test('RED 4: candidate list with one eligible flag flipped -> candidate-set-digest-mismatch', () => {
  const base = world({ deny: [MODE] });
  const flipped = proposalCandidates(base.selection_trusted_input.candidates).map((candidate) =>
    candidate.operation_id === MODE
      ? { ...candidate, eligible: true, eligibility_reason: 'eligible' }
      : candidate
  );
  const proposal = makeProposal({
    manifest: base.manifest,
    candidates: flipped,
    calls: [{ operation_id: READ, arguments: { target: 'workspace' }, confidence: 0.9 }]
  });
  assert.notEqual(proposal.candidate_set_digest, base.proposal.candidate_set_digest);
  // [O0 gap, P2]
  assert.doesNotThrow(() => composeProposalWithSelectionDigest(proposal, base.selection.proposal_digest));
  expectRejected({ ...base, proposal }, 'candidate-set-digest-mismatch');
});

test('RED 5: selection that does not recompute from trusted input -> selection-not-recomputed', () => {
  const base = world();
  const other = world({ support: { [READ]: 0.2, [TAGS]: 0.95, [MODE]: 0.2, 'op.inert.echo_flag': 0.2, 'op.inert.score_hint': 0.2 } });
  expectRejected({ ...base, selection: other.selection }, 'selection-not-recomputed');

  const tampered = structuredClone(base.selection);
  tampered.recommended_action = 'escalate';
  expectRejected({ ...base, selection: tampered }, 'selection-not-recomputed');
});

test('RED 6: per-candidate manifest_digest mismatch -> candidate-manifest-digest-mismatch', () => {
  const trusted = world({ manifestDigestOverride: { [TAGS]: C } });
  expectRejected(trusted, 'candidate-manifest-digest-mismatch');
});

test('RED 6b: candidate manifest_digest checks cover trusted candidates and selection entries separately', () => {
  const base = world();
  // Trusted candidate drifts while the supplied selection is still the good one.
  const drifted = world({ manifestDigestOverride: { [TAGS]: C } });
  expectRejected(
    { ...base, selection_trusted_input: drifted.selection_trusted_input },
    'candidate-manifest-digest-mismatch'
  );
  // Selection entry drifts while trusted candidates are good.
  const forgedSelection = structuredClone(base.selection);
  forgedSelection.withheld[0].manifest_digest = C;
  expectRejected({ ...base, selection: forgedSelection }, 'candidate-manifest-digest-mismatch');
});

test('RED 7: descriptive-discovery -> discovery-mode-not-bindable', () => {
  const trusted = world({ candidateMode: 'descriptive-discovery' });
  expectRejected(trusted, 'discovery-mode-not-bindable');

  // [O0 gap, Copilot] descriptive-discovery skips eligibility, so O0 proposes an ineligible op.
  const denied = world({
    deny: [READ],
    candidateMode: 'descriptive-discovery'
  });
  assert.equal(denied.proposal.proposed[0].operation_id, READ);
  const rejected = verifyOperationProposalBinding(denied);
  assert.equal(rejected.binding_status, 'rejected');
  assert.equal(rejected.rejection_reason, 'discovery-mode-not-bindable');
});

test('RED 8: offer whose quote exceeds the spend ceiling -> offer-ineligible', () => {
  const entry = paidOfferEntry({ amount_minor_units: 10, currency: 'USD' });
  // [O0 gap, P2] the offer compose helper only checks digest format.
  assert.doesNotThrow(() => composeProposalWithOfferDigest(world().proposal, entry.offer_digest));
  const document = expectRejected({ ...world(), offers: [entry] }, 'offer-ineligible');
  assert.ok(document.offer_rejection_reasons.includes('quote-exceeds-spend-ceiling'));
});

test('RED 9: offer mutated after its digest was recorded -> offer-digest-mismatch', () => {
  const entry = freeOfferEntry();
  const trusted = world();
  const recorded = composeProposalWithOfferDigest(trusted.proposal, entry.offer_digest);
  entry.offer.operation.description = 'Mutated after the digest was recorded.';
  // [O0 gap, P2] the recorded compose binding still validates.
  assert.doesNotThrow(() => composeProposalWithOfferDigest(trusted.proposal, recorded.offer_digest));
  expectRejected({ ...trusted, offers: [entry] }, 'offer-digest-mismatch');
});

test('RED 10: stale catalog entry_digest -> offer-ineligible (catalog-binding-invalid)', () => {
  const entry = freeOfferEntry();
  // The catalog changed after the offer pinned its entry_digest.
  entry.catalog_entry.requested_access.actions = [
    ...entry.catalog_entry.requested_access.actions,
    'external.search.extra'
  ];
  const document = expectRejected({ ...world(), offers: [entry] }, 'offer-ineligible');
  assert.deepEqual(document.offer_rejection_reasons, ['catalog-binding-invalid']);
});

test('RED 11: unresolved fallback is never bound', () => {
  const retained = world({ support: {} });
  assert.equal(retained.selection.selection_mode, 'fallback-retain-eligible');
  assert.equal(retained.selection.unresolved, true);
  const document = verifyOperationProposalBinding(retained);
  assert.equal(document.binding_status, 'unresolved-deliberation');
  assert.notEqual(document.binding_status, 'bound');
  assert.equal(validateOperationProposalBinding(document).valid, true);

  const escalated = world({ support: {}, policy: { fallbackBehavior: 'escalate' } });
  assert.equal(escalated.selection.selection_mode, 'fallback-escalate');
  expectRejected(escalated, 'operation-not-selected');

  const ineligible = world({ support: {}, deny: [TAGS] });
  const forged = resealProposal({
    ...ineligible.proposal,
    proposed: [
      { operation_id: TAGS, arguments: {}, confidence: 0.99, status: 'proposed', order_index: 0 }
    ]
  });
  expectRejected({ ...ineligible, proposal: forged }, 'operation-deterministic-ineligible');
});

test('RED 12: validator rejects any flipped hard zero, unknown fields and non-plain data', () => {
  const document = verifyOperationProposalBinding(world());
  const flips = {
    authority_effect: 'granted',
    assurance_effect: 'assured',
    currentness_effect: 'current',
    execution_effect: 'execute',
    network_effect: 'egress',
    runtime_activation: true,
    authorization_result: 'allowed'
  };
  for (const [field, value] of Object.entries(flips)) {
    const flipped = resealBinding({ ...structuredClone(document), [field]: value });
    assert.throws(() => validateOperationProposalBinding(flipped), new RegExp(field), field);
  }
  assert.throws(
    () => validateOperationProposalBinding(resealBinding({ ...structuredClone(document), grants_authority: true })),
    /unknown field grants_authority/
  );
  const boundExtra = structuredClone(document);
  boundExtra.bound_operations[0].confidence = 0.99;
  assert.throws(() => validateOperationProposalBinding(resealBinding(boundExtra)), /unknown field confidence/);

  const hidden = structuredClone(document);
  Object.defineProperty(hidden, 'authority', { value: 'granted', enumerable: false });
  assert.throws(() => validateOperationProposalBinding(hidden), /non-enumerable/);
  const symbol = structuredClone(document);
  symbol[Symbol('authority')] = 'granted';
  assert.throws(() => validateOperationProposalBinding(symbol), /symbol/);

  const statusLie = resealBinding({ ...structuredClone(document), binding_status: 'abstained' });
  assert.throws(() => validateOperationProposalBinding(statusLie), /cardinality/);
  const digestLie = { ...structuredClone(document), binding_digest: A };
  assert.throws(() => validateOperationProposalBinding(digestLie), /binding_digest is invalid/);
});

test('RED 13: more than 32 candidates or more than 32 proposed ops', () => {
  assert.equal(OPERATION_PROPOSAL_BINDING_LIMITS.max_candidates, 32);
  assert.equal(OPERATION_PROPOSAL_BINDING_LIMITS.max_proposed_operations, 32);
  const base = world();
  const many = Array.from({ length: 33 }, (_, index) => ({
    operationId: `op.inert.generated_${index}`,
    manifestDigest: base.manifest.manifest_digest,
    eligible: true,
    eligibilityReason: 'eligible',
    deterministicMatch: false
  }));
  expectRejected({
    ...base,
    selection_trusted_input: { ...base.selection_trusted_input, candidates: many }
  }, 'candidate-limit-exceeded');

  const proposed = Array.from({ length: 33 }, (_, index) => ({
    operation_id: READ,
    arguments: { target: `t${index}` },
    confidence: null,
    status: 'proposed',
    order_index: Math.min(index, 32)
  }));
  expectRejected({ ...base, proposal: { ...base.proposal, proposed } }, 'proposed-limit-exceeded');
});

test('RED 14: two providers with the same op and args give identical bound_operations and authority fields', () => {
  const first = verifyOperationProposalBinding(world());
  const second = verifyOperationProposalBinding(world({
    providerIdentity: provider({
      provider_ref: 'provider.semantic-op.other',
      artifact_ref: 'artifact.semantic-op.other.v0'
    })
  }));
  assert.equal(first.binding_status, 'bound');
  assert.equal(second.binding_status, 'bound');
  assert.notEqual(first.proposal_id, second.proposal_id);
  assert.deepEqual(second.bound_operations, first.bound_operations);
  for (const field of Object.keys(HARD_ZEROS)) {
    assert.equal(second[field], first[field]);
  }
});

test('RED 15: failure proposals from two providers get distinct proposal_ids (provider in preimage)', () => {
  const failed = normalizeGenericProviderResult({ calls: null });
  const one = world({ providerResult: failed });
  const two = world({
    providerResult: failed,
    providerIdentity: provider({ provider_ref: 'provider.semantic-op.other' })
  });
  assert.notEqual(one.proposal.proposal_id, two.proposal.proposal_id);

  // The O0 preimage (no provider) collided for these two providers.
  const legacy = (proposal) => `semantic_operation_proposal_${digestObject({
    operation_manifest_digest: proposal.operation_manifest_digest,
    candidate_set_digest: proposal.candidate_set_digest,
    request_digest: proposal.request_digest,
    state_digest: proposal.state_digest,
    failure_reason: 'provider-failure'
  })}`;
  assert.equal(legacy(one.proposal), legacy(two.proposal));
  assert.notEqual(one.proposal.proposal_id, legacy(one.proposal));

  // Pinned failure-path digests (updated in this PR for the provider-bound preimage).
  assert.equal(
    one.proposal.proposal_id,
    `semantic_operation_proposal_${digestObject({
      provider: provider(),
      operation_manifest_digest: one.proposal.operation_manifest_digest,
      candidate_set_digest: one.proposal.candidate_set_digest,
      request_digest: A,
      state_digest: B,
      failure_reason: 'provider-failure'
    })}`
  );
  assert.equal(one.proposal.proposal_id, PINNED_FAILURE_PROPOSAL_ID);
  assert.equal(one.proposal.proposal_digest, PINNED_FAILURE_PROPOSAL_DIGEST);

  // A failure proposal has zero proposed ops -> explicit abstention, never bound.
  const document = verifyOperationProposalBinding(one);
  assert.equal(document.binding_status, 'abstained');
  assert.deepEqual(document.bound_operations, []);
});

test('RED 16: proposal carrying a non-enumerable extra field, a symbol key, an accessor or a Proxy is rejected', () => {
  const base = world();
  const variants = {};

  variants.nonEnumerable = { ...base.proposal };
  Object.defineProperty(variants.nonEnumerable, 'authority_grant', { value: 'granted', enumerable: false });

  variants.symbol = { ...base.proposal };
  variants.symbol[Symbol('authority')] = 'granted';

  let reads = 0;
  variants.accessor = { ...base.proposal };
  Object.defineProperty(variants.accessor, 'candidate_mode', {
    enumerable: true,
    get() {
      reads += 1;
      return 'eligible-only';
    }
  });

  variants.nestedAccessor = { ...base.proposal, proposed: [{ ...base.proposal.proposed[0] }] };
  Object.defineProperty(variants.nestedAccessor.proposed[0], 'operation_id', {
    enumerable: true,
    get() {
      reads += 1;
      return READ;
    }
  });

  variants.proxy = new Proxy({ ...base.proposal }, {});
  variants.classInstance = Object.assign(Object.create({ inherited: true }), base.proposal);

  // [O0 gap] the O0 shape validator accepts every top-level variant (its
  // closed-key check uses Object.keys and never inspects descriptors or Proxies).
  for (const [name, proposal] of Object.entries(variants)) {
    if (name === 'nestedAccessor') continue;
    assert.doesNotThrow(() => validateSemanticOperationProposalShape(proposal), name);
  }
  reads = 0;
  for (const [name, proposal] of Object.entries(variants)) {
    const document = verifyOperationProposalBinding({ ...base, proposal });
    assert.equal(document.binding_status, 'rejected', name);
    assert.equal(document.rejection_reason, 'input-not-plain-data', name);
  }
  assert.equal(reads, 0, 'the verifier never runs a caller getter');

  const hiddenTop = { ...base };
  Object.defineProperty(hiddenTop, 'authority', { value: 'granted', enumerable: false });
  expectRejected(hiddenTop, 'input-not-plain-data');
  const cyclic = structuredClone(base.selection_trusted_input);
  cyclic.policy.self = cyclic.policy;
  expectRejected({ ...base, selection_trusted_input: cyclic }, 'input-not-plain-data');
});

test('closed reason codes and malformed inputs fail closed without throwing', () => {
  assert.equal(new Set(OPERATION_PROPOSAL_BINDING_REASONS).size, OPERATION_PROPOSAL_BINDING_REASONS.length);
  expectRejected(null, 'input-malformed');
  expectRejected({ ...world(), extra: true }, 'input-malformed');
  const base = world();
  expectRejected({ ...base, offers: [freeOfferEntry(TAGS)] }, 'offer-operation-not-proposed');
  expectRejected({ ...base, offers: [freeOfferEntry(), freeOfferEntry()] }, 'offer-duplicate');
  const malformed = freeOfferEntry();
  delete malformed.offer_digest;
  expectRejected({ ...base, offers: [malformed] }, 'offer-malformed');
});

const PINNED_FAILURE_PROPOSAL_ID =
  'semantic_operation_proposal_0dafa16b95dbe9759f80cabb310ec81dc15c9427369da01fedb770bfa1981ea0';
const PINNED_FAILURE_PROPOSAL_DIGEST =
  'ad0ee1b0d3f8591ade3469a944db2f8603deb943440956b67b5e9d23e9c221d4';

test('bound, unresolved and abstained outputs conform to the wire schema', () => {
  const schema = JSON.parse(readFileSync(
    new URL('../../docs/architecture/contracts/operation-proposal-binding.v0.schema.json', import.meta.url),
    'utf8'
  ));
  const documents = [
    verifyOperationProposalBinding({ ...world(), offers: [freeOfferEntry()] }),
    verifyOperationProposalBinding(world({ support: {} })),
    verifyOperationProposalBinding(world({ providerResult: normalizeGenericProviderResult({ calls: null }) }))
  ];
  assert.deepEqual(documents.map((document) => document.binding_status), ['bound', 'unresolved-deliberation', 'abstained']);
  for (const document of documents) {
    assert.deepEqual(Object.keys(document).sort(), [...schema.required].sort());
    assert.doesNotThrow(() => conformsToSchema(schema, document), document.binding_status);
  }
});

function conformsToSchema(schema, value, path = '$') {
  if (schema.anyOf) {
    const ok = schema.anyOf.some((branch) => {
      try {
        conformsToSchema(branch, value, path);
        return true;
      } catch {
        return false;
      }
    });
    if (!ok) throw new Error(`${path} matches no anyOf branch`);
    return;
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) throw new Error(`${path} const`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path} enum`);
  if (schema.type === 'null' && value !== null) throw new Error(`${path} null`);
  if (schema.type === 'string') {
    if (typeof value !== 'string') throw new Error(`${path} string`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw new Error(`${path} pattern`);
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`${path} array`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw new Error(`${path} maxItems`);
    value.forEach((item, index) => conformsToSchema(schema.items, item, `${path}[${index}]`));
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} object`);
    for (const key of schema.required) {
      if (!Object.hasOwn(value, key)) throw new Error(`${path}.${key} required`);
    }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw new Error(`${path}.${key} additional`);
      conformsToSchema(schema.properties[key], value[key], `${path}.${key}`);
    }
  }
}

test('B-1: non-object top-level inputs are rejected as input-malformed and never throw', () => {
  const base = world();
  for (const bad of [null, 1, [], 'selection', true]) {
    expectRejected({ ...base, selection: bad }, 'input-malformed');
    expectRejected({ ...base, proposal: bad }, 'input-malformed');
    expectRejected({ ...base, manifest: bad }, 'input-malformed');
    expectRejected({ ...base, selection_trusted_input: bad }, 'input-malformed');
    if (!Array.isArray(bad)) {
      expectRejected({
        ...base,
        selection_trusted_input: { ...base.selection_trusted_input, candidates: bad }
      }, 'input-malformed');
      expectRejected({ ...base, proposal: { ...base.proposal, proposed: bad } }, 'input-malformed');
    }
    expectRejected({
      ...base,
      selection_trusted_input: { ...base.selection_trusted_input, candidates: [bad] }
    }, 'input-malformed');
    expectRejected({ ...base, offers: bad === null || Array.isArray(bad) ? 'offers' : bad }, 'input-malformed');
    expectRejected({ ...base, offers: [bad] }, 'offer-malformed');
  }
  expectRejected(1, 'input-malformed');
  expectRejected([], 'input-malformed');
});

test('NB-1 (i): manifest with flipped hard zeros is rejected even though the digest preimage does not cover them', () => {
  const base = world();
  const manifest = { ...base.manifest, authority_effect: 'granted', runtime_activation: true };
  // The manifest digest preimage is {schema, version, status, operations} only.
  assert.equal(
    digestObject({
      schema: manifest.schema,
      version: manifest.version,
      status: manifest.status,
      operations: manifest.operations
    }),
    manifest.manifest_digest
  );
  expectRejected({ ...base, manifest }, 'manifest-invalid');
  expectRejected({ ...base, manifest: { ...base.manifest, selection_effect: 'authorize' } }, 'manifest-invalid');
});

test('NB-1 (ii): ghost op outside the manifest with a resealed proposal and matching selection -> candidate-not-in-manifest', () => {
  const base = world();
  const GHOST = 'op.inert.ghost';
  const candidates = [
    ...base.selection_trusted_input.candidates,
    {
      operationId: GHOST,
      manifestDigest: base.manifest.manifest_digest,
      eligible: true,
      eligibilityReason: 'eligible',
      deterministicMatch: false
    }
  ];
  const support = { [GHOST]: 0.97 };
  const selectionInput = {
    ...base.selection_trusted_input,
    candidates,
    semanticEvidence: candidates.map((candidate) =>
      semanticEvidence(candidate, support[candidate.operationId] ?? 0.2))
  };
  const selection = createOperationCandidateSelectionProposal(selectionInput);
  assert.deepEqual(selection.selected.map((item) => item.operation_id), [GHOST]);
  const proposal = resealProposal({
    ...base.proposal,
    candidate_set_digest: computeCandidateSetDigest(proposalCandidates(candidates)),
    proposed: [{ operation_id: GHOST, arguments: {}, confidence: 0.99, status: 'proposed', order_index: 0 }]
  });
  assert.doesNotThrow(() => validateSemanticOperationProposalShape(proposal));
  expectRejected(
    { ...base, selection_trusted_input: selectionInput, selection, proposal },
    'candidate-not-in-manifest'
  );
});

test('NB-2: resealed proposal with arguments invalid against the manifest -> proposal-arguments-invalid', () => {
  const base = world();
  const forge = (args) => resealProposal({
    ...base.proposal,
    proposed: [{ ...structuredClone(base.proposal.proposed[0]), arguments: args }]
  });
  const evil = forge({ target: 'EVIL', extra_arg: 'x' });
  // [O0 gap] the O0 shape validator accepts the forged arguments.
  assert.doesNotThrow(() => validateSemanticOperationProposalShape(evil));
  expectRejected({ ...base, proposal: evil }, 'proposal-arguments-invalid');
  expectRejected({ ...base, proposal: forge({}) }, 'proposal-arguments-invalid');
  expectRejected({ ...base, proposal: forge({ target: 5 }) }, 'proposal-arguments-invalid');
  // The valid arguments still bind.
  assert.equal(verifyOperationProposalBinding(base).binding_status, 'bound');
});

test('NB-2: nested object arguments are checked with the O0 nested validator', () => {
  const nestedOps = [
    {
      operation_id: 'op.inert.configure',
      description: 'Configure inert nested options',
      arguments: {
        options: {
          type: 'object',
          required: true,
          enum_values: null,
          properties: {
            mode: { type: 'enum', required: true, enum_values: ['observe', 'idle'], properties: null }
          }
        }
      }
    },
    ...createInertOperationManifestFixture().operations.slice(0, 2).map((operation) => structuredClone(operation))
  ];
  const manifest = createInertOperationManifestFixture({ operations: nestedOps });
  const candidates = manifest.operations.map((operation) => ({
    operationId: operation.operation_id,
    manifestDigest: manifest.manifest_digest,
    eligible: true,
    eligibilityReason: 'eligible',
    deterministicMatch: false
  }));
  const selectionInput = {
    taskPurposeDigest: F,
    candidates,
    semanticEvidence: candidates.map((candidate) =>
      semanticEvidence(candidate, candidate.operationId === 'op.inert.configure' ? 0.95 : 0.2)),
    policy: { minimumSupport: 0.55, singleSelectSupport: 0.9, topK: 2, contextBudget: 5, fallbackBehavior: 'retain-eligible' }
  };
  const selection = createOperationCandidateSelectionProposal(selectionInput);
  const proposal = makeProposal({
    manifest,
    candidates: proposalCandidates(candidates),
    calls: [{ operation_id: 'op.inert.configure', arguments: { options: { mode: 'observe' } }, confidence: 0.9 }]
  });
  const trusted = { manifest, selection_trusted_input: selectionInput, selection, proposal };
  assert.equal(verifyOperationProposalBinding(trusted).binding_status, 'bound');
  const forged = resealProposal({
    ...proposal,
    proposed: [{ ...structuredClone(proposal.proposed[0]), arguments: { options: { mode: 'EVIL' } } }]
  });
  expectRejected({ ...trusted, proposal: forged }, 'proposal-arguments-invalid');
});

test('NB-4: the validator checks internal consistency only; a hand-built bound document validates', () => {
  const genuine = verifyOperationProposalBinding(world());
  const handBuilt = resealBinding({
    ...structuredClone(genuine),
    operation_manifest_digest: C,
    proposal_digest: A,
    bound_operations: [{ operation_id: 'op.inert.anything', arguments_digest: B, offer_digest: null }]
  });
  // Documented limit: consumers must re-run verifyOperationProposalBinding.
  assert.equal(validateOperationProposalBinding(handBuilt).valid, true);
  assert.notEqual(handBuilt.binding_digest, genuine.binding_digest);
});

// AT-7 anchor: these validators already meet the hostile-input contract and
// must stay green. Nullable paths are the schema's own nullable fields.
test('AT-7: verifyOperationProposalBinding and validateOperationProposalBinding meet the hostile-input contract', async () => {
  const document = verifyOperationProposalBinding(world());
  await assertHostileInputContract({
    name: 'verifyOperationProposalBinding',
    fn: verifyOperationProposalBinding,
    style: 'returns',
    isRejected: (result) => result?.binding_status === 'rejected',
    validArgs: () => [world()],
    nullablePaths: [
      'arg0.proposal.usage_evidence',
      'arg0.proposal.calibration_report_ref',
      'arg0.proposal.explanation',
      /^arg0\.selection_trusted_input\.semanticEvidence\.\d+\.observation\.(provider_confidence|calibration_report_ref)$/
    ]
  }, assert);
  await assertHostileInputContract({
    name: 'validateOperationProposalBinding',
    fn: validateOperationProposalBinding,
    validArgs: () => [structuredClone(document)],
    nullablePaths: ['arg0.rejection_reason', /^arg0\.bound_operations\.\d+\.offer_digest$/]
  }, assert);
});

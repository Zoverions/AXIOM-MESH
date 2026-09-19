import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ValidationError, digestObject } from '../src/lib/canonical.mjs';
import {
  SEMANTIC_OPERATION_PROPOSAL_SCHEMA,
  composeProposalWithOfferDigest,
  composeProposalWithSelectionDigest,
  confidenceIsNotBoundedDecisionObservation,
  createInertOperationManifestFixture,
  createSemanticOperationProposal,
  normalizeGenericProviderResult,
  normalizeNeedleShapedPayload,
  proposalSatisfiesAuthorityPredicates,
  validateSemanticOperationProposal
} from '../src/lib/semantic-operation-proposal.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

const fixtureUrl = (name) =>
  new URL(`./fixtures/semantic-operation-proposal/${name}`, import.meta.url);

function loadJson(name) {
  return JSON.parse(readFileSync(fixtureUrl(name), 'utf8'));
}

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

function candidatesFromManifest(manifest, { deny = [] } = {}) {
  const denied = new Set(deny);
  return manifest.operations.map((entry) => ({
    operation_id: entry.operation_id,
    eligible: !denied.has(entry.operation_id),
    eligibility_reason: denied.has(entry.operation_id) ? 'policy-denied' : 'eligible'
  }));
}

function baseInput(overrides = {}) {
  const manifest = overrides.manifest || createInertOperationManifestFixture();
  const candidates = overrides.candidates || candidatesFromManifest(manifest);
  return {
    provider: overrides.provider || provider(),
    manifest,
    candidates,
    request_digest: overrides.request_digest || A,
    state_digest: overrides.state_digest || B,
    state_classification: overrides.state_classification || 'confidential',
    candidate_mode: overrides.candidate_mode || 'eligible-only',
    provider_result: overrides.provider_result,
    expected_provider_identity: Object.hasOwn(overrides, 'expected_provider_identity')
      ? overrides.expected_provider_identity
      : provider(),
    locality_policy: overrides.locality_policy || 'any',
    calibration_report_ref: Object.hasOwn(overrides, 'calibration_report_ref')
      ? overrides.calibration_report_ref
      : null
  };
}

function proposalFromCalls(calls, overrides = {}) {
  const normalized = normalizeGenericProviderResult({
    calls,
    suppressed: overrides.suppressed || [],
    confidence: overrides.confidence ?? null,
    latency_ms: overrides.latency_ms ?? 5,
    usage_evidence: null,
    explanation: null,
    trigger: overrides.trigger
  });
  return createSemanticOperationProposal(baseInput({
    ...overrides,
    provider_result: normalized
  }));
}

test('inert fixture exposes 3-6 deterministic operation IDs', () => {
  const manifest = createInertOperationManifestFixture();
  assert.ok(manifest.operations.length >= 3 && manifest.operations.length <= 6);
  assert.equal(manifest.authority_effect, 'none');
  assert.equal(manifest.runtime_activation, false);
  assert.match(manifest.manifest_digest, /^[a-f0-9]{64}$/);
  const again = createInertOperationManifestFixture();
  assert.equal(again.manifest_digest, manifest.manifest_digest);
});

test('1. operation not present in exact candidate manifest -> reject proposal', () => {
  const result = proposalFromCalls([
    { operation_id: 'op.not.in.manifest', arguments: { target: 'x' }, confidence: 0.99 }
  ]);
  assert.equal(result.proposed.length, 0);
  assert.equal(result.withheld[0].reason, 'not-in-manifest');
  assert.equal(result.authority_effect, 'none');
});

test('2. operation removed by deterministic eligibility -> provider cannot restore it', () => {
  const manifest = createInertOperationManifestFixture();
  const deniedId = 'op.inert.read_status';
  const result = proposalFromCalls(
    [{ operation_id: deniedId, arguments: { target: 'workspace' }, confidence: 0.99 }],
    {
      manifest,
      candidates: candidatesFromManifest(manifest, { deny: [deniedId] })
    }
  );
  assert.equal(result.proposed.length, 0);
  assert.equal(result.withheld[0].operation_id, deniedId);
  assert.equal(result.withheld[0].reason, 'deterministic-ineligible');
});

test('3. missing required argument -> reject/withhold; never invent', () => {
  const result = proposalFromCalls([
    { operation_id: 'op.inert.read_status', arguments: {}, confidence: 0.8 }
  ]);
  assert.equal(result.proposed.length, 0);
  assert.equal(result.withheld[0].reason, 'missing-required-argument');
  assert.deepEqual(result.withheld[0].arguments, {});
});

test('4. unknown argument / wrong enum / wrong type -> reject', () => {
  const unknown = proposalFromCalls([
    {
      operation_id: 'op.inert.read_status',
      arguments: { target: 'workspace', extra: 'nope' },
      confidence: 0.5
    }
  ]);
  assert.equal(unknown.withheld[0].reason, 'unknown-argument');

  const wrongEnum = proposalFromCalls([
    { operation_id: 'op.inert.set_mode', arguments: { mode: 'launch' }, confidence: 0.5 }
  ]);
  assert.equal(wrongEnum.withheld[0].reason, 'wrong-enum-value');

  const wrongType = proposalFromCalls([
    { operation_id: 'op.inert.echo_flag', arguments: { enabled: 'yes' }, confidence: 0.5 }
  ]);
  assert.equal(wrongType.withheld[0].reason, 'wrong-argument-type');
});

test('5. multiple calls preserve declared order but order grants no authority', () => {
  const result = proposalFromCalls([
    { operation_id: 'op.inert.set_mode', arguments: { mode: 'idle' }, confidence: 0.4 },
    { operation_id: 'op.inert.read_status', arguments: { target: 'a' }, confidence: 0.6 }
  ]);
  assert.deepEqual(
    result.proposed.map((item) => item.operation_id),
    ['op.inert.set_mode', 'op.inert.read_status']
  );
  assert.deepEqual(
    result.proposed.map((item) => item.order_index),
    [0, 1]
  );
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_effect, 'none');
  assert.deepEqual(
    proposalSatisfiesAuthorityPredicates(result),
    {
      authority: false,
      assurance: false,
      consent: false,
      approval: false,
      currentness: false,
      revocation: false
    }
  );
});

test('6. empty/no-tool result remains explicit abstention, not a default action', () => {
  const needle = normalizeNeedleShapedPayload(loadJson('needle-shaped-empty.json'));
  const result = createSemanticOperationProposal(baseInput({ provider_result: needle }));
  assert.equal(result.proposed.length, 0);
  assert.equal(result.withheld[0].reason, 'empty-abstention');
  assert.equal(result.execution_effect, 'none');
});

test('7. high confidence cannot satisfy authority/assurance/consent/approval/currentness/revocation', () => {
  const result = proposalFromCalls([
    {
      operation_id: 'op.inert.read_status',
      arguments: { target: 'workspace' },
      confidence: 0.999
    }
  ]);
  assert.equal(result.proposed.length, 1);
  assert.equal(result.proposed[0].confidence, 0.999);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.assurance_effect, 'none');
  assert.equal(result.currentness_effect, 'none');
  const predicates = proposalSatisfiesAuthorityPredicates(result, {
    requireAuthority: true,
    requireAssurance: true,
    requireConsent: true,
    requireApproval: true,
    requireCurrentness: true,
    requireRevocationClear: true
  });
  assert.equal(predicates.authority, false);
  assert.equal(predicates.assurance, false);
  assert.equal(predicates.consent, false);
  assert.equal(predicates.approval, false);
  assert.equal(predicates.currentness, false);
  assert.equal(predicates.revocation, false);
});

test('8. low confidence / suppressed call cannot be silently promoted', () => {
  const normalized = normalizeNeedleShapedPayload(loadJson('needle-shaped-success.json'));
  const result = createSemanticOperationProposal(baseInput({ provider_result: normalized }));
  assert.ok(result.suppressed.some((item) => item.operation_id === 'op.inert.echo_flag'));
  assert.equal(
    result.proposed.some((item) => item.operation_id === 'op.inert.echo_flag'),
    false
  );
  assert.ok(result.proposed.every((item) => item.status === 'proposed'));
});

test('9. provider trigger/forced-call is input configuration only; cannot bypass confirmation/authority', () => {
  const result = proposalFromCalls(
    [{ operation_id: 'op.inert.read_status', arguments: { target: 'workspace' }, confidence: 1 }],
    { trigger: { forced: true, bypass_confirmation: true, mint_authority: true } }
  );
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(proposalSatisfiesAuthorityPredicates(result).authority, false);
});

test('10. prompt/tool-description injection cannot create an operation ID or authority reference not in manifest', () => {
  const result = proposalFromCalls([
    {
      operation_id: 'op.forged.authority.grant',
      arguments: { grant: 'root' },
      confidence: 1
    }
  ]);
  assert.equal(result.proposed.length, 0);
  assert.equal(result.withheld[0].reason, 'prompt-injection-rejected');
});

test('11. stale provider/model/runtime/operation-manifest identity fails closed', () => {
  assert.throws(
    () => proposalFromCalls(
      [{ operation_id: 'op.inert.list_tags', arguments: { limit: 1 }, confidence: 0.5 }],
      {
        provider: provider({ runtime_ref: 'runtime.stale' }),
        expected_provider_identity: provider()
      }
    ),
    /stale provider\/model\/runtime identity fails closed/
  );
});

test('12. provider failure/malformed payload becomes explicit failure evidence, never an inferred action', () => {
  const malformed = normalizeGenericProviderResult({ calls: null });
  const result = createSemanticOperationProposal(baseInput({ provider_result: malformed }));
  assert.equal(result.proposed.length, 0);
  assert.equal(result.withheld[0].reason, 'provider-failure');
  assert.equal(result.execution_effect, 'none');

  const badCall = normalizeNeedleShapedPayload({ function_calls: ['not-an-object'] });
  const failed = createSemanticOperationProposal(baseInput({ provider_result: badCall }));
  assert.equal(failed.proposed.length, 0);
  assert.ok(['malformed-call', 'provider-failure'].includes(failed.withheld[0].reason));
});

test('13. LOCAL_ONLY excludes remote proposal providers without widening fallback authority', () => {
  assert.throws(
    () => proposalFromCalls(
      [{ operation_id: 'op.inert.list_tags', arguments: {}, confidence: 0.4 }],
      {
        provider: provider({ provider_mode: 'provider-remote' }),
        expected_provider_identity: provider({ provider_mode: 'provider-remote' }),
        locality_policy: 'local-only'
      }
    ),
    /LOCAL_ONLY excludes remote proposal providers/
  );
});

test('14. same operation proposal through different providers yields the same downstream authority result', () => {
  const calls = [
    { operation_id: 'op.inert.read_status', arguments: { target: 'workspace' }, confidence: 0.5 }
  ];
  const local = proposalFromCalls(calls, {
    provider: provider({ provider_ref: 'provider.local', provider_mode: 'owner-local' }),
    expected_provider_identity: provider({
      provider_ref: 'provider.local',
      provider_mode: 'owner-local'
    })
  });
  const remote = proposalFromCalls(calls, {
    provider: provider({
      provider_ref: 'provider.remote',
      profile_ref: 'profile.remote',
      provider_mode: 'provider-remote'
    }),
    expected_provider_identity: provider({
      provider_ref: 'provider.remote',
      profile_ref: 'profile.remote',
      provider_mode: 'provider-remote'
    })
  });
  assert.deepEqual(
    proposalSatisfiesAuthorityPredicates(local),
    proposalSatisfiesAuthorityPredicates(remote)
  );
  assert.equal(local.authority_effect, remote.authority_effect);
  assert.equal(local.execution_effect, remote.execution_effect);
  assert.equal(local.runtime_activation, remote.runtime_activation);
});

test('15. proposal serialization is deterministic/content-addressable and bounded', () => {
  const first = proposalFromCalls([
    { operation_id: 'op.inert.score_hint', arguments: { score: 0.25 }, confidence: 0.3 }
  ]);
  const second = proposalFromCalls([
    { operation_id: 'op.inert.score_hint', arguments: { score: 0.25 }, confidence: 0.3 }
  ]);
  assert.equal(first.proposal_digest, second.proposal_digest);
  assert.equal(first.proposal_id, second.proposal_id);
  const validated = validateSemanticOperationProposal(first);
  assert.equal(validated.valid, true);
  assert.equal(validated.proposal_digest, first.proposal_digest);
  assert.ok(Buffer.byteLength(JSON.stringify(first), 'utf8') < 65_536);
});

test('Needle confidence is not normalized into a fabricated #1588 distribution', () => {
  const needle = normalizeNeedleShapedPayload(loadJson('needle-shaped-success.json'));
  assert.equal(needle.ok, true);
  assert.equal(needle.confidence, 0.91);
  const mapped = confidenceIsNotBoundedDecisionObservation(needle.confidence);
  assert.equal(mapped.is_bounded_decision_observation, false);
  assert.equal(mapped.fabricated_distribution, null);
  assert.equal(mapped.answer_kind, null);
  assert.equal(mapped.probability_support, 'confidence-only-not-1588');

  const proposal = createSemanticOperationProposal(baseInput({ provider_result: needle }));
  assert.equal(proposal.schema, SEMANTIC_OPERATION_PROPOSAL_SCHEMA);
  for (const item of proposal.proposed) {
    assert.equal(Object.hasOwn(item, 'p_true'), false);
    assert.equal(Object.hasOwn(item, 'distribution'), false);
    assert.equal(Object.hasOwn(item, 'answer'), false);
  }
  assert.equal(Object.hasOwn(proposal, 'observation'), false);
  assert.equal(proposal.authority_effect, 'none');
});

test('generic provider normalization fixture validates', () => {
  const raw = loadJson('generic-provider-result.json');
  const normalized = normalizeGenericProviderResult(raw);
  assert.equal(normalized.ok, true);
  const proposal = createSemanticOperationProposal(baseInput({ provider_result: normalized }));
  assert.equal(proposal.proposed[0].operation_id, 'op.inert.list_tags');
  assert.equal(proposal.proposed[0].arguments.limit, 3);
});

test('compose by digest with Offer/selection without merging spend/eligibility/ranking', () => {
  const proposal = proposalFromCalls([
    { operation_id: 'op.inert.read_status', arguments: { target: 'workspace' }, confidence: 0.2 }
  ]);
  const offerBinding = composeProposalWithOfferDigest(proposal, C);
  const selectionBinding = composeProposalWithSelectionDigest(proposal, A);
  assert.equal(offerBinding.merged_spend, null);
  assert.equal(offerBinding.merged_eligibility, null);
  assert.equal(offerBinding.merged_ranking, null);
  assert.equal(selectionBinding.merged_spend, null);
  assert.equal(selectionBinding.merged_eligibility, null);
  assert.equal(selectionBinding.merged_ranking, null);
  assert.equal(offerBinding.authority_effect, 'none');
  assert.equal(selectionBinding.execution_effect, 'none');
});

test('zero-authority zeros are hard on every accepted proposal', () => {
  const proposal = proposalFromCalls([
    { operation_id: 'op.inert.echo_flag', arguments: { enabled: false }, confidence: 0.1 }
  ]);
  assert.equal(proposal.authority_effect, 'none');
  assert.equal(proposal.assurance_effect, 'none');
  assert.equal(proposal.currentness_effect, 'none');
  assert.equal(proposal.execution_effect, 'none');
  assert.equal(proposal.runtime_activation, false);
  assert.equal(proposal.network_effect, 'none');
  assert.equal(proposal.selection_effect, 'proposal-only');
});

test('tampered proposal digest fails validation', () => {
  const proposal = proposalFromCalls([
    { operation_id: 'op.inert.read_status', arguments: { target: 'workspace' }, confidence: 0.2 }
  ]);
  const tampered = {
    ...proposal,
    proposed: [...proposal.proposed],
    proposal_digest: digestObject({ tampered: true })
  };
  assert.throws(
    () => validateSemanticOperationProposal(tampered),
    (error) => error instanceof ValidationError
  );
});

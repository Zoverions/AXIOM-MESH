import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { computeBehavioralAssuranceProfileDigest } from '../src/lib/behavioral-assurance-profile.mjs';
import {
  computeResponseAssuranceEnvelopeDigest,
  resolveResponseAssuranceEnvelope,
  validateResponseAssuranceEnvelope
} from '../src/lib/response-assurance-envelope.mjs';
import * as research from '../src/lib/research-capsule-contracts.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);
const ZERO = '0'.repeat(64);

function profile() {
  const item = {
    schema: 'axiom-behavioral-assurance-profile.v0',
    version: 0,
    status: 'inert-behavioral-assurance-evidence',
    profile_id: 'behavior.profile.claim-bind.v1',
    subject: {
      subject_kind: 'agent-harness',
      subject_id: 'agent.claim-bind.v1',
      subject_digest: A,
      provider_model_revision: 'fixture-model-2026-09-16',
      binding_strength: 'exact-artifact',
      instruction_policy_digest: B,
      context_memory_policy_digest: C,
      tool_policy_digest: D,
      sampling_configuration_digest: E,
      environment_harness_digest: F
    },
    populations: [{
      population_id: 'population.research.qa.v1',
      population_digest: A,
      domain: 'research-question-answering',
      task_family: 'source-grounded-analysis',
      consequence_class: 'informational',
      evaluation_period: {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-15T00:00:00.000Z'
      },
      sample_count: 500,
      minimum_sample_count: 100,
      sample_sufficiency: 'sufficient',
      inclusion_criteria: ['independently checked research QA'],
      exclusion_criteria: [],
      verification_sources: [{
        source_id: 'deterministic.source-checker.v1',
        source_digest: B,
        source_class: 'deterministic-checker',
        independence_group: 'checker-a'
      }],
      rubric_refs: [{ rubric_id: 'rubric.source-support.v1', rubric_digest: C }],
      dimensions: [{
        dimension_id: 'source-provenance-fidelity',
        evidence_state: 'accepted-evidence',
        metric_kind: 'rate',
        value: 0.99,
        sample_count: 500,
        calibration_ref: null,
        calibration_digest: null,
        calibration_state: 'not-applicable'
      }],
      incident_events: [],
      known_limitations: [],
      distribution_shift_notes: []
    }],
    created_at: '2026-09-16T22:00:00.000Z',
    valid_until: '2026-10-16T22:00:00.000Z',
    profile_digest: ZERO,
    authority_effect: 'none',
    assurance_effect: 'evidence-only',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };
  item.profile_digest = computeBehavioralAssuranceProfileDigest(item);
  return item;
}

function envelope(profileDocument, claimAdjudicationDigest = null) {
  const item = {
    schema: 'axiom-response-assurance-envelope.v0',
    version: 0,
    status: 'inert-response-assurance-evidence',
    envelope_id: 'response.assurance.claim-bind.v1',
    response_digest: B,
    task: {
      purpose: 'research-support',
      domain: 'research-question-answering',
      consequence_class: 'informational'
    },
    producer: {
      subject_id: profileDocument.subject.subject_id,
      subject_digest: profileDocument.subject.subject_digest,
      environment_harness_digest: profileDocument.subject.environment_harness_digest
    },
    profile_binding: {
      profile_id: profileDocument.profile_id,
      profile_digest: profileDocument.profile_digest,
      population_id: profileDocument.populations[0].population_id
    },
    deterministic_checks: [{
      check_id: 'source.digest.check.v1',
      check_digest: C,
      result: 'PASS'
    }],
    semantic_observations: [{
      observation_schema: 'axiom-bounded-decision-observation.v0',
      observation_id: 'decision-observation.source-support.v1',
      observation_digest: D,
      calibration_report_schema: 'axiom-bounded-decision-calibration-report.v0',
      calibration_report_id: 'calibration.semantic-source-support.v1',
      calibration_report_digest: E,
      calibration_state: 'reviewed',
      evidence_state: 'accepted-evidence'
    }],
    verifiers: [{
      verifier_id: 'verifier.alpha.v1',
      verifier_digest: E,
      source_class: 'semantic-verifier',
      independence_group: 'semantic-lineage-a',
      result: 'supports'
    }, {
      verifier_id: 'checker.beta.v1',
      verifier_digest: F,
      source_class: 'deterministic-checker',
      independence_group: 'deterministic-lineage-b',
      result: 'supports'
    }],
    claimed_independent_confirmations: 2,
    claim_adjudication_digest: claimAdjudicationDigest,
    surfaced_because: 'research-mode',
    unresolved_unknowns: [],
    observed_at: '2026-09-16T22:30:00.000Z',
    envelope_digest: ZERO,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };
  item.envelope_digest = computeResponseAssuranceEnvelopeDigest(item);
  return item;
}

function materializeCase(raw) {
  const sourceManifest = {
    ...raw.source_manifest,
    manifest_digest: research.researchContractDigest(raw.source_manifest, 'manifest_digest')
  };
  const projectionBase = {
    ...raw.knowledge_projection,
    source_manifest_digest: sourceManifest.manifest_digest
  };
  const knowledgeProjection = {
    ...projectionBase,
    projection_digest: research.researchContractDigest(projectionBase, 'projection_digest')
  };
  const entry = knowledgeProjection.entries[0];
  const adjudicationBase = {
    ...raw.adjudication,
    source_manifest_digest: sourceManifest.manifest_digest,
    knowledge_projection_digest: knowledgeProjection.projection_digest,
    entry_id: entry.entry_id,
    entry_content_digest: entry.content_digest
  };
  const adjudication = {
    ...adjudicationBase,
    adjudication_digest: research.researchContractDigest(adjudicationBase, 'adjudication_digest')
  };
  return { sourceManifest, knowledgeProjection, adjudication };
}

function redigest(adjudication) {
  const copy = { ...adjudication };
  delete copy.adjudication_digest;
  return {
    ...copy,
    adjudication_digest: research.researchContractDigest(copy, 'adjudication_digest')
  };
}

async function loadFixtureAdjudication(statusOverrides = {}) {
  const vectors = JSON.parse(await readFile(new URL(
    '../fixtures/research-capsules/research-claim-adjudication-v0.vectors.json',
    import.meta.url
  ), 'utf8'));
  const fixture = materializeCase(vectors.cases[0]);
  if (Object.keys(statusOverrides).length === 0) return fixture;
  const adjudication = redigest({ ...fixture.adjudication, ...statusOverrides });
  return { ...fixture, adjudication };
}

test('response assurance may bind claim adjudication by exact digest without granting authority', async () => {
  const p = profile();
  const supported = await loadFixtureAdjudication({
    status: 'supported',
    correction_summary: null
  });
  const item = envelope(p, supported.adjudication.adjudication_digest);
  assert.equal(validateResponseAssuranceEnvelope(item).valid, true);

  const resolved = resolveResponseAssuranceEnvelope(item, p, {
    now: '2026-09-16T23:00:00.000Z',
    claimAdjudication: supported.adjudication,
    knowledgeProjection: supported.knowledgeProjection,
    sourceManifest: supported.sourceManifest
  });
  assert.equal(resolved.status, 'supported');
  assert.equal(resolved.claim_adjudication_status, 'supported');
  assert.ok(resolved.reason_codes.includes('claim-adjudication-supported'));
  assert.equal(resolved.authority_effect, 'none');
  assert.equal(Object.hasOwn(resolved, 'authorized'), false);
  assert.equal(Object.hasOwn(resolved, 'safe_to_execute'), false);
});

test('insufficient claim adjudication forces unknown or caveat interpretation', async () => {
  const p = profile();
  const fixture = await loadFixtureAdjudication({
    status: 'insufficient_evidence',
    correction_summary: null,
    evidence_refs: [],
    evidence_digests: []
  });
  const item = envelope(p, fixture.adjudication.adjudication_digest);
  const resolved = resolveResponseAssuranceEnvelope(item, p, {
    now: '2026-09-16T23:00:00.000Z',
    claimAdjudication: fixture.adjudication
  });
  assert.equal(resolved.status, 'insufficient-evidence');
  assert.equal(resolved.claim_adjudication_status, 'insufficient_evidence');
  assert.ok(resolved.reason_codes.includes('claim-adjudication-insufficient-evidence'));
});

test('adverse claim adjudication never resolves as supported or authorizing', async () => {
  const p = profile();
  for (const [status, correction_summary, expected] of [
    ['contested', null, 'conflicting-evidence'],
    ['unsupported', null, 'insufficient-evidence'],
    ['corrected', 'Negative-gradient steps decrease the objective under the standard convention.', 'supported-with-caveats']
  ]) {
    const fixture = await loadFixtureAdjudication({ status, correction_summary });
    const item = envelope(p, fixture.adjudication.adjudication_digest);
    const resolved = resolveResponseAssuranceEnvelope(item, p, {
      now: '2026-09-16T23:00:00.000Z',
      claimAdjudication: fixture.adjudication,
      knowledgeProjection: fixture.knowledgeProjection,
      sourceManifest: fixture.sourceManifest
    });
    assert.equal(resolved.status, expected, status);
    assert.notEqual(resolved.status, 'supported');
    assert.equal(resolved.authority_effect, 'none');
    assert.equal(Object.hasOwn(resolved, 'authorized'), false);
    assert.equal(Object.hasOwn(resolved, 'safe_to_execute'), false);
  }
});

test('claim adjudication digest mismatch fails closed as invalid evidence', async () => {
  const p = profile();
  const fixture = await loadFixtureAdjudication({
    status: 'supported',
    correction_summary: null
  });
  const item = envelope(p, fixture.adjudication.adjudication_digest);
  const other = redigest({
    ...fixture.adjudication,
    adjudication_id: 'adjudication:other'
  });
  const resolved = resolveResponseAssuranceEnvelope(item, p, {
    now: '2026-09-16T23:00:00.000Z',
    claimAdjudication: other
  });
  assert.equal(resolved.status, 'invalid-evidence');
  assert.ok(resolved.reason_codes.includes('claim-adjudication-digest-mismatch'));
});

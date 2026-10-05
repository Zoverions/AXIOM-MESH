import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  DemandEvidenceError,
  evaluateDemandEvidence,
  verifyDemandEvidence
} from '../src/check-demand-evidence.mjs';

const EVALUATION_TIME = new Date('2026-09-18T23:59:59Z');
const OWNED_REF = 'docs/growth/owned-experiments/probe.json';

function observation(id, overrides = {}) {
  return {
    id,
    source_url: `https://example.com/${id}`,
    source_kind: 'firsthand_report',
    published_at: '2026-09-18',
    independence_group: id,
    payer_confirmed: false,
    pain_tags: ['context_loss'],
    desired_outcome_tags: ['portable_context'],
    commitment: 'none',
    owned_experiment_ref: null,
    summary: 'Independent firsthand evidence describing a recurring continuity problem.',
    ...overrides
  };
}

function packageFixture(observations, declaredStatus, overrides = {}) {
  return {
    schema: 'axiom-demand-evidence.v0',
    gate_version: 'axiom-demand-gate.v0',
    hypothesis_id: 'majik.multi-ai-continuity.v0',
    created_at: '2026-09-18',
    persona: 'A high-usage professional who relies on paid AI products for ongoing project work.',
    problem_hypothesis: 'Provider-bound memory and fragmented subscriptions force users to carry context manually between tools.',
    offer_probe: 'A user-controlled continuity layer that can hand bounded project state to multiple approved AI providers.',
    declared_status: declaredStatus,
    observations,
    ...overrides
  };
}

function externalProbeEvidence() {
  return [
    observation('a', { payer_confirmed: true }),
    observation('b', { payer_confirmed: true }),
    observation('c', { source_kind: 'firsthand_request' }),
    observation('d', { source_kind: 'firsthand_request' })
  ];
}

function ownedEvidence(commitments) {
  return commitments.map((commitment, index) => observation(`owned-${index}`, {
    source_url: `https://majik.ca/early-access/response/owned-${index}`,
    source_kind: 'owned_experiment',
    commitment,
    owned_experiment_ref: OWNED_REF
  }));
}

function trustedOwned(observations) {
  return new Map([[
    OWNED_REF,
    { observation_ids: new Set(observations.map(item => item.id)) }
  ]]);
}

test('independent paid-user pain can clear PROBE without implying BUILD', () => {
  const result = evaluateDemandEvidence(
    packageFixture(externalProbeEvidence(), 'PROBE'),
    { evaluationTime: EVALUATION_TIME }
  );
  assert.equal(result.status, 'PROBE');
  assert.equal(result.metrics.payer_confirmed_groups, 2);
  assert.equal(result.metrics.top_pain_independent_groups, 4);
  assert.equal(result.metrics.owned_paid_groups, 0);
});

test('secondary snapshots do not satisfy the strong independent evidence threshold', () => {
  const observations = [
    observation('a', { payer_confirmed: true }),
    observation('b', { payer_confirmed: true }),
    observation('c', { source_kind: 'secondary_snapshot' }),
    observation('d', { source_kind: 'secondary_snapshot' })
  ];
  const result = evaluateDemandEvidence(
    packageFixture(observations, 'DISCOVERY'),
    { evaluationTime: EVALUATION_TIME }
  );
  assert.equal(result.status, 'DISCOVERY');
  assert.equal(result.metrics.strong_independent_groups, 2);
});

test('one source URL cannot masquerade as multiple independence groups', () => {
  const shared = 'https://example.com/shared-thread';
  const fixture = packageFixture([
    observation('a', { source_url: shared, independence_group: 'group-a' }),
    observation('b', { source_url: shared, independence_group: 'group-b' }),
    observation('c'),
    observation('d')
  ], 'DISCOVERY');
  assert.throws(
    () => evaluateDemandEvidence(fixture, { evaluationTime: EVALUATION_TIME }),
    /maps to multiple independence groups/
  );
});

test('owned high-intent evidence is required for VALIDATE and must be trusted', () => {
  const owned = ownedEvidence(['waitlist', 'waitlist', 'stated_switch', 'stated_switch', 'stated_switch']);
  const fixture = packageFixture([...externalProbeEvidence(), ...owned], 'VALIDATE');

  assert.throws(
    () => evaluateDemandEvidence(fixture, { evaluationTime: EVALUATION_TIME }),
    /not backed by its trusted experiment receipt/
  );

  const result = evaluateDemandEvidence(fixture, {
    evaluationTime: EVALUATION_TIME,
    trustedOwnedExperiments: trustedOwned(owned)
  });
  assert.equal(result.status, 'VALIDATE');
  assert.equal(result.metrics.owned_intent_groups, 5);
  assert.equal(result.metrics.owned_high_intent_groups, 2);
});

test('BUILD requires three owned paid commitments', () => {
  const owned = ownedEvidence([
    'paid_preorder',
    'paid_preorder',
    'paid_pilot',
    'waitlist',
    'waitlist'
  ]);
  const result = evaluateDemandEvidence(
    packageFixture([...externalProbeEvidence(), ...owned], 'BUILD'),
    {
      evaluationTime: EVALUATION_TIME,
      trustedOwnedExperiments: trustedOwned(owned)
    }
  );
  assert.equal(result.status, 'BUILD');
  assert.equal(result.metrics.owned_paid_groups, 3);
});

test('future-dated packages and observations fail closed', () => {
  assert.throws(
    () => evaluateDemandEvidence(
      packageFixture(externalProbeEvidence(), 'PROBE', { created_at: '2026-09-19' }),
      { evaluationTime: EVALUATION_TIME }
    ),
    /created_at cannot be in the future/
  );

  const observations = externalProbeEvidence();
  observations[0] = observation('future', {
    payer_confirmed: true,
    published_at: '2026-09-19'
  });
  assert.throws(
    () => evaluateDemandEvidence(
      packageFixture(observations, 'PROBE'),
      { evaluationTime: EVALUATION_TIME }
    ),
    /future-dated/
  );
});

test('declared status cannot overstate the computed evidence state', () => {
  assert.throws(
    () => evaluateDemandEvidence(packageFixture([
      observation('a', { payer_confirmed: true }),
      observation('b')
    ], 'BUILD'), { evaluationTime: EVALUATION_TIME }),
    DemandEvidenceError
  );
});

test('unknown fields fail closed', () => {
  const fixture = packageFixture(externalProbeEvidence(), 'PROBE');
  fixture.authority = 'build';
  assert.throws(
    () => evaluateDemandEvidence(fixture, { evaluationTime: EVALUATION_TIME }),
    /unknown field authority/
  );
});

test('verifyDemandEvidence exercises the checked evidence directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-demand-evidence-'));
  try {
    const evidenceDir = join(root, 'docs', 'growth', 'evidence');
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(
      join(evidenceDir, 'probe.json'),
      JSON.stringify(packageFixture(externalProbeEvidence(), 'PROBE')),
      'utf8'
    );
    const result = await verifyDemandEvidence(root, { evaluationTime: EVALUATION_TIME });
    assert.equal(result.valid, true);
    assert.equal(result.packages.length, 1);
    assert.equal(result.packages[0].status, 'PROBE');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('verifyDemandEvidence requires a separate owned experiment provenance receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-owned-demand-'));
  try {
    const evidenceDir = join(root, 'docs', 'growth', 'evidence');
    const receiptDir = join(root, 'docs', 'growth', 'owned-experiments');
    await mkdir(evidenceDir, { recursive: true });
    await mkdir(receiptDir, { recursive: true });

    const owned = ownedEvidence([
      'waitlist',
      'waitlist',
      'stated_switch',
      'stated_switch',
      'stated_switch'
    ]);
    await writeFile(
      join(evidenceDir, 'validate.json'),
      JSON.stringify(packageFixture([...externalProbeEvidence(), ...owned], 'VALIDATE')),
      'utf8'
    );

    await assert.rejects(
      () => verifyDemandEvidence(root, { evaluationTime: EVALUATION_TIME }),
      /owned experiment receipt .* could not be read/
    );

    await writeFile(
      join(receiptDir, 'probe.json'),
      JSON.stringify({
        schema: 'axiom-owned-demand-experiment.v0',
        experiment_id: 'majik-continuity-probe-001',
        campaign_id: 'ua-2026-09-18-majik-continuity-demand',
        created_at: '2026-09-18',
        owner_repo: 'Zoverions/AXIOM-MESH',
        collection_surface: 'https://majik.ca/early-access',
        observation_ids: owned.map(item => item.id)
      }),
      'utf8'
    );

    const result = await verifyDemandEvidence(root, { evaluationTime: EVALUATION_TIME });
    assert.equal(result.packages[0].status, 'VALIDATE');
    assert.equal(result.packages[0].metrics.owned_intent_groups, 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

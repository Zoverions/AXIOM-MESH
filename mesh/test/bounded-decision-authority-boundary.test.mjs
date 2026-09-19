import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPlan } from '../src/lib/plan.mjs';

const MODULES = [
  'bounded-decision-provider-profile.mjs',
  'bounded-decision-question-schema.mjs',
  'bounded-decision-observation.mjs',
  'bounded-decision-calibration-report.mjs',
  'bounded-decision-interpretation.mjs',
  'bounded-decision-cua-s1-forms-adapter.mjs'
];

function intent() {
  return {
    intent_id: 'intent_bounded_decision_authority_boundary',
    principal: {
      id: 'owner.bounded-decision-test',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    action: 'system.echo',
    input: { message: 'hello' },
    purpose: 'test.bounded-decision-authority',
    data_scopes: [],
    confirmations: [],
    approval_ids: []
  };
}

function decision(overrides = {}) {
  return {
    allow: true,
    risk: 'low',
    required_assurance: 'A1',
    achievable_assurance: 'A2',
    tool: 'system.echo',
    effect: 'system.echo',
    constraints: {},
    timeout_ms: 1_000,
    requires_independent_approval: false,
    rule_id: 'policy:system.echo',
    policy_version: 'test.v1',
    policy_digest: 'b'.repeat(64),
    policy_layers: [],
    ...overrides
  };
}

test('near-certain bounded model evidence cannot promote AXIOM assurance', () => {
  const highConfidenceEvidence = {
    provider_confidence: 0.999999,
    probability_evidence: [{ value: true, probability: 0.999999 }]
  };
  assert.ok(highConfidenceEvidence.provider_confidence > 0.99);
  assert.throws(
    () => buildPlan(intent(), decision({
      risk: 'high',
      required_assurance: 'A3',
      requires_independent_approval: true
    })),
    /cannot satisfy required assurance A3; current path achieves A2/
  );
  assert.equal(Object.hasOwn(highConfidenceEvidence, 'achieved_assurance'), false);
});

test('Slice A production modules import no effectful execution network credential or payment surfaces', async () => {
  const forbiddenImports = [
    /from\s+['"]node:(?:fs(?:\/promises)?|net|http|https|child_process)['"]/,
    /from\s+['"][^'"]*(?:provider-client|credential-broker|token-broker|wallet|payment)['"]/,
    /from\s+['"][^'"]*(?:grid\/store|grid\/backup)['"]/,
    /from\s+['"][^'"]*identity\.mjs['"]/,
    /from\s+['"][^'"]*(?:gateway|hypervisor|sandbox)\.mjs['"]/,
    /issueCapability|grantCapability|mintCapability/
  ];

  for (const file of MODULES) {
    const source = await readFile(new URL(`../src/lib/${file}`, import.meta.url), 'utf8');
    for (const pattern of forbiddenImports) {
      assert.doesNotMatch(source, pattern, `${file} must remain inert: ${pattern}`);
    }
  }
});

test('capability registry does not claim an implemented bounded-decision runtime capability', async () => {
  const registry = JSON.parse(await readFile(
    new URL('../config/capabilities.json', import.meta.url),
    'utf8'
  ));
  const implementedBounded = registry.capabilities.filter(item =>
    item.status === 'implemented'
    && /bounded[- ]decision|system[- ]one|jev|cua[- ]?s1/i.test(`${item.id} ${item.summary ?? ''}`)
  );
  assert.deepEqual(implementedBounded, []);

  const aiProviders = registry.capabilities.find(item => item.id === 'ai.providers');
  assert.equal(aiProviders?.status, 'adapter_required');
});

test('axiom-plan.v1 remains unchanged and contains no bounded-decision authority fields', async () => {
  const source = await readFile(new URL('../src/lib/plan.mjs', import.meta.url), 'utf8');
  assert.match(source, /version:\s*'axiom-plan\.v1'/);
  assert.doesNotMatch(source, /bounded[-_ ]decision|boundedDecision|provider_confidence|probability_evidence/i);
  assert.match(source, /A3 plan assurance requires a recorded independent approval/);
});

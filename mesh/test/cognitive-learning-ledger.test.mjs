import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  COGNITIVE_LEARNING_LEDGER_SCHEMA,
  cognitiveLearningRecordDigest,
  validateCognitiveLearningRecord
} from '../src/lib/cognitive-learning-ledger.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);

function validRecord() {
  return {
    schema: 'axiom-cognitive-learning-ledger.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    learning_record_id: 'learning.project.context.v1',
    principal_id: 'agent.personal.primary',
    composition_id: 'composition.personal.primary',
    composition_digest: DIGEST_A,
    source_evidence: [
      { ref: 'evidence.project.raw.v1', digest: DIGEST_A, evidence_class: 'captured' }
    ],
    derived_artifact: { ref: 'artifact.project.summary.v1', digest: DIGEST_B },
    learning_class: 'semantic',
    representation_class: 'lossy',
    current_tier: 'retrievable-memory',
    proposed_target_tier: 'semantic-consolidation',
    proposal_reason: 'Repeated reconstruction indicates durable semantic value.',
    expected_reuse: { class: 'recurring', estimated_uses: 50 },
    resource_costs: [
      { cost_class: 'create', basis: 'estimated', amount: 250000, unit: 'microcad', source_ref: 'estimate.local.v1' },
      { cost_class: 'per-use', basis: 'unknown', amount: null, unit: null, source_ref: null }
    ],
    policy_utility: {
      privacy: 'positive',
      sovereignty: 'positive',
      latency: 'positive',
      quality: 'neutral',
      resilience: 'positive'
    },
    evaluation_evidence: [
      { ref: 'evaluation.project.summary.v1', digest: DIGEST_C }
    ],
    promotion_state: 'evaluated',
    predecessor_records: [],
    successor_records: [],
    created_at: '2026-08-30T22:00:00.000Z',
    updated_at: '2026-08-30T22:00:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('validates an inert learning record and produces a deterministic digest', () => {
  const record = validRecord();
  const result = validateCognitiveLearningRecord(record);
  assert.equal(COGNITIVE_LEARNING_LEDGER_SCHEMA, record.schema);
  assert.equal(result.valid, true);
  assert.equal(result.learning_record_id, record.learning_record_id);
  assert.equal(result.record_digest, cognitiveLearningRecordDigest(record));
  assert.match(result.record_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.source_evidence, 1);
  assert.equal(result.resource_cost_observations, 2);
  assert.equal(result.known_resource_cost_observations, 1);
  assert.equal(result.unknown_resource_cost_observations, 1);
  assert.equal(result.evaluation_evidence, 1);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.training_effect, 'none');
  assert.equal(result.spend_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(Object.isFrozen(result), true);
});

test('digest is deterministic across object key order', () => {
  const first = validRecord();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(cognitiveLearningRecordDigest(first), cognitiveLearningRecordDigest(second));
});

test('unknown and credential-like fields fail closed', () => {
  const top = validRecord();
  top.api_key = 'nope';
  assert.throws(() => validateCognitiveLearningRecord(top), /unknown field/i);

  const source = validRecord();
  source.source_evidence[0].refresh_token = 'nope';
  assert.throws(() => validateCognitiveLearningRecord(source), /unknown field/i);

  const cost = validRecord();
  cost.resource_costs[0].cookie = 'nope';
  assert.throws(() => validateCognitiveLearningRecord(cost), /unknown field/i);
});

test('invalid enums and noncanonical timestamps fail closed', () => {
  const learning = validRecord();
  learning.learning_class = 'magic';
  assert.throws(() => validateCognitiveLearningRecord(learning), /learning_class/i);

  const timestamp = validRecord();
  timestamp.updated_at = '2026-08-30 22:00:00Z';
  assert.throws(() => validateCognitiveLearningRecord(timestamp), /updated_at/i);
});

test('requires a principal or exact paired composition binding', () => {
  const unbound = validRecord();
  unbound.principal_id = null;
  unbound.composition_id = null;
  unbound.composition_digest = null;
  assert.throws(() => validateCognitiveLearningRecord(unbound), /binding/i);

  const missingDigest = validRecord();
  missingDigest.composition_digest = null;
  assert.throws(() => validateCognitiveLearningRecord(missingDigest), /composition/i);

  const missingId = validRecord();
  missingId.composition_id = null;
  assert.throws(() => validateCognitiveLearningRecord(missingId), /composition/i);

  const principalOnly = validRecord();
  principalOnly.composition_id = null;
  principalOnly.composition_digest = null;
  assert.doesNotThrow(() => validateCognitiveLearningRecord(principalOnly));
});

test('source evidence is bounded and duplicate refs fail closed', () => {
  const none = validRecord();
  none.source_evidence = [];
  assert.throws(() => validateCognitiveLearningRecord(none), /source_evidence/i);

  const duplicate = validRecord();
  duplicate.source_evidence.push({ ...duplicate.source_evidence[0], digest: DIGEST_B });
  assert.throws(() => validateCognitiveLearningRecord(duplicate), /duplicate.*ref/i);
});

test('exact-retained requires content identity to retained source evidence', () => {
  const exact = validRecord();
  exact.representation_class = 'exact-retained';
  exact.derived_artifact.digest = DIGEST_A;
  assert.doesNotThrow(() => validateCognitiveLearningRecord(exact));

  const falseExact = validRecord();
  falseExact.representation_class = 'exact-retained';
  assert.throws(() => validateCognitiveLearningRecord(falseExact), /exact-retained/i);

  const lossy = validRecord();
  lossy.representation_class = 'lossy';
  assert.doesNotThrow(() => validateCognitiveLearningRecord(lossy));
});

test('expected reuse keeps unknown distinct from bounded numeric estimates', () => {
  const unknown = validRecord();
  unknown.expected_reuse = { class: 'unknown', estimated_uses: null };
  assert.doesNotThrow(() => validateCognitiveLearningRecord(unknown));

  const contradictory = validRecord();
  contradictory.expected_reuse = { class: 'unknown', estimated_uses: 3 };
  assert.throws(() => validateCognitiveLearningRecord(contradictory), /estimated_uses/i);

  const unsafe = validRecord();
  unsafe.expected_reuse.estimated_uses = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => validateCognitiveLearningRecord(unsafe), /estimated_uses/i);
});

test('resource costs preserve basis, amount, and unit without implicit aggregation', () => {
  const knownWithoutAmount = validRecord();
  knownWithoutAmount.resource_costs[0].amount = null;
  assert.throws(() => validateCognitiveLearningRecord(knownWithoutAmount), /amount/i);

  const knownWithoutUnit = validRecord();
  knownWithoutUnit.resource_costs[0].unit = null;
  assert.throws(() => validateCognitiveLearningRecord(knownWithoutUnit), /unit/i);

  const unknownWithAmount = validRecord();
  unknownWithAmount.resource_costs[1].amount = 1;
  assert.throws(() => validateCognitiveLearningRecord(unknownWithAmount), /unknown.*amount/i);

  const unknownWithUnit = validRecord();
  unknownWithUnit.resource_costs[1].unit = 'tokens';
  assert.throws(() => validateCognitiveLearningRecord(unknownWithUnit), /unknown.*unit/i);

  const negative = validRecord();
  negative.resource_costs[0].amount = -1;
  assert.throws(() => validateCognitiveLearningRecord(negative), /amount/i);

  const record = validRecord();
  assert.equal(Object.hasOwn(record, 'aggregate_score'), false);
  assert.ok(record.resource_costs);
  assert.ok(record.policy_utility);
});

test('policy utility descriptors fail closed on unsupported values', () => {
  const record = validRecord();
  record.policy_utility.privacy = 'priceless';
  assert.throws(() => validateCognitiveLearningRecord(record), /privacy/i);
});

test('identity-kernel target requires stronger explicit evaluation evidence', () => {
  const weak = validRecord();
  weak.proposed_target_tier = 'identity-kernel';
  assert.throws(() => validateCognitiveLearningRecord(weak), /identity-kernel/i);

  const strong = validRecord();
  strong.proposed_target_tier = 'identity-kernel';
  strong.evaluation_evidence.push({ ref: 'evaluation.continuity.v1', digest: DIGEST_A });
  assert.doesNotThrow(() => validateCognitiveLearningRecord(strong));
});

test('duplicate evaluation and lineage refs fail closed and self-lineage is forbidden', () => {
  const evalDuplicate = validRecord();
  evalDuplicate.evaluation_evidence.push({ ...evalDuplicate.evaluation_evidence[0], digest: DIGEST_A });
  assert.throws(() => validateCognitiveLearningRecord(evalDuplicate), /duplicate.*evaluation/i);

  const predecessorDuplicate = validRecord();
  predecessorDuplicate.predecessor_records = ['learning.old.v1', 'learning.old.v1'];
  assert.throws(() => validateCognitiveLearningRecord(predecessorDuplicate), /duplicate.*predecessor/i);

  const selfPredecessor = validRecord();
  selfPredecessor.predecessor_records = [selfPredecessor.learning_record_id];
  assert.throws(() => validateCognitiveLearningRecord(selfPredecessor), /self/i);

  const selfSuccessor = validRecord();
  selfSuccessor.successor_records = [selfSuccessor.learning_record_id];
  assert.throws(() => validateCognitiveLearningRecord(selfSuccessor), /self/i);
});

test('activation and authority boundaries fail closed', () => {
  for (const [field, bad] of [
    ['contains_secret_material', true],
    ['authority_effect', 'grant'],
    ['network_effect', 'fetch'],
    ['training_effect', 'train'],
    ['spend_effect', 'charge'],
    ['runtime_activation', true]
  ]) {
    const record = validRecord();
    record[field] = bad;
    assert.throws(() => validateCognitiveLearningRecord(record), /boundary/i);
  }
});

test('validation does not mutate deeply frozen input', () => {
  const record = deepFreeze(validRecord());
  assert.doesNotThrow(() => validateCognitiveLearningRecord(record));
});

test('validator module imports only canonical helper', async () => {
  const sourceUrl = new URL('../src/lib/cognitive-learning-ledger.mjs', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['./canonical.mjs']);
});

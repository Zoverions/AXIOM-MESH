import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  COGNITIVE_LEARNING_LEDGER_SCHEMA,
  cognitiveLearningLedgerDigest,
  validateCognitiveLearningLedger
} from '../src/lib/cognitive-learning-ledger.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);

function validLedger() {
  return {
    schema: 'axiom-cognitive-learning-ledger.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    record_id: 'learning.project.consolidation.001',
    principal_ref: 'agent.personal.primary',
    composition_ref: 'composition.personal.primary',
    learning_class: 'semantic',
    representation_class: 'mixed',
    current_tier: 1,
    proposed_target_tier: 2,
    proposal_reason: 'Repeated project reconstruction justifies a provenance-linked semantic consolidation candidate.',
    source_evidence: [
      { ref: 'evidence.project.session.001', digest: DIGEST_A },
      { ref: 'evidence.project.session.002', digest: DIGEST_B }
    ],
    derived_artifacts: [
      { ref: 'artifact.semantic.project-state.v1', digest: DIGEST_C, representation_class: 'lossy' }
    ],
    expected_reuse: { class: 'recurring', estimated_uses: 250 },
    resource_costs: [
      { kind: 'create', amount: 12000, unit: 'tokens', basis: 'estimated' },
      { kind: 'validate', amount: 0.08, unit: 'USD', basis: 'estimated' },
      { kind: 'store', amount: 'unknown', unit: 'byte-month', basis: 'unknown' }
    ],
    policy_utility: [
      { dimension: 'reuse', value: 'strong-positive', rationale: 'Avoid repeated reconstruction of the same project state.' },
      { dimension: 'privacy', value: 'positive', rationale: 'Reduces repeated disclosure of retained history to external models.' },
      { dimension: 'sovereignty', value: 'positive', rationale: 'Retains useful project state in an owner-controlled artifact.' }
    ],
    evaluation_refs: [{ ref: 'evaluation.semantic.project-state.v1', digest: DIGEST_A }],
    promotion_state: 'evaluated',
    predecessor_refs: [],
    successor_refs: [],
    created_at: '2026-08-30T22:00:00.000Z',
    updated_at: '2026-08-30T22:00:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_authorization: 'none',
    runtime_activation: false
  };
}
function deepFreeze(value) { if (value && typeof value === 'object') { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }

test('validates an inert learning ledger record and produces a deterministic digest', () => { const ledger = validLedger(); const result = validateCognitiveLearningLedger(ledger); assert.equal(COGNITIVE_LEARNING_LEDGER_SCHEMA, ledger.schema); assert.equal(result.valid, true); assert.equal(result.record_id, ledger.record_id); assert.equal(result.learning_class, 'semantic'); assert.equal(result.ledger_digest, cognitiveLearningLedgerDigest(ledger)); assert.match(result.ledger_digest, /^[a-f0-9]{64}$/); assert.equal(result.contains_secret_material, false); assert.equal(result.authority_effect, 'none'); assert.equal(result.network_effect, 'none'); assert.equal(result.training_effect, 'none'); assert.equal(result.spend_authorization, 'none'); assert.equal(result.runtime_activation, false); assert.equal(Object.isFrozen(result), true); });
test('digest is deterministic across object key order', () => { const first = validLedger(); const second = Object.fromEntries(Object.entries(first).reverse()); assert.equal(cognitiveLearningLedgerDigest(first), cognitiveLearningLedgerDigest(second)); });
test('unknown and credential-like fields fail closed at top and nested levels', () => { const top = validLedger(); top.api_key = 'forbidden'; assert.throws(() => validateCognitiveLearningLedger(top), /unknown field/i); const evidence = validLedger(); evidence.source_evidence[0].token = 'forbidden'; assert.throws(() => validateCognitiveLearningLedger(evidence), /unknown field/i); const cost = validLedger(); cost.resource_costs[0].credential = 'forbidden'; assert.throws(() => validateCognitiveLearningLedger(cost), /unknown field/i); });
test('invalid enums, tiers, identifiers, digests, and timestamps fail closed', () => { const learningClass = validLedger(); learningClass.learning_class = 'mystical'; assert.throws(() => validateCognitiveLearningLedger(learningClass), /learning_class/i); const tier = validLedger(); tier.proposed_target_tier = 7; assert.throws(() => validateCognitiveLearningLedger(tier), /proposed_target_tier/i); const identifier = validLedger(); identifier.record_id = 'bad id with spaces'; assert.throws(() => validateCognitiveLearningLedger(identifier), /record_id/i); const digest = validLedger(); digest.source_evidence[0].digest = 'abc'; assert.throws(() => validateCognitiveLearningLedger(digest), /digest/i); const timestamp = validLedger(); timestamp.updated_at = '2026-08-30 22:00:00Z'; assert.throws(() => validateCognitiveLearningLedger(timestamp), /updated_at/i); });
test('duplicate evidence, evaluation, and lineage references fail closed', () => { const evidence = validLedger(); evidence.source_evidence.push({ ...evidence.source_evidence[0] }); assert.throws(() => validateCognitiveLearningLedger(evidence), /duplicate.*source_evidence/i); const evaluation = validLedger(); evaluation.evaluation_refs.push({ ...evaluation.evaluation_refs[0] }); assert.throws(() => validateCognitiveLearningLedger(evaluation), /duplicate.*evaluation_refs/i); const predecessor = validLedger(); predecessor.predecessor_refs = [{ ref: 'learning.previous.1', digest: DIGEST_A },{ ref: 'learning.previous.1', digest: DIGEST_B }]; assert.throws(() => validateCognitiveLearningLedger(predecessor), /duplicate.*predecessor_refs/i); });
test('lossy learning requires retained source evidence', () => { const ledger = validLedger(); ledger.representation_class = 'lossy'; ledger.source_evidence = []; assert.throws(() => validateCognitiveLearningLedger(ledger), /lossy.*source/i); });
test('identity-tier proposals require evaluation evidence', () => { const ledger = validLedger(); ledger.proposed_target_tier = 5; ledger.evaluation_refs = []; assert.throws(() => validateCognitiveLearningLedger(ledger), /identity.*evaluation/i); });
test('base-model proposals require evaluation evidence and cannot be accepted in v0', () => { const noEvaluation = validLedger(); noEvaluation.proposed_target_tier = 6; noEvaluation.evaluation_refs = []; assert.throws(() => validateCognitiveLearningLedger(noEvaluation), /base-model.*evaluation/i); const accepted = validLedger(); accepted.proposed_target_tier = 6; accepted.promotion_state = 'accepted'; assert.throws(() => validateCognitiveLearningLedger(accepted), /base-model.*accepted/i); });
test('resource costs require non-negative finite amounts or explicit unknown with explicit units', () => { const negative = validLedger(); negative.resource_costs[0].amount = -1; assert.throws(() => validateCognitiveLearningLedger(negative), /amount/i); const infinity = validLedger(); infinity.resource_costs[0].amount = Infinity; assert.throws(() => validateCognitiveLearningLedger(infinity), /amount/i); const missingUnit = validLedger(); missingUnit.resource_costs[0].unit = ''; assert.throws(() => validateCognitiveLearningLedger(missingUnit), /unit/i); const unknownObserved = validLedger(); unknownObserved.resource_costs[0].amount = 'unknown'; unknownObserved.resource_costs[0].basis = 'observed'; assert.throws(() => validateCognitiveLearningLedger(unknownObserved), /unknown.*basis/i); });
test('unlike resource units remain separate observations', () => { const ledger = validLedger(); const result = validateCognitiveLearningLedger(ledger); assert.equal(result.resource_cost_observations, 3); assert.deepEqual(result.resource_cost_units, ['USD', 'byte-month', 'tokens']); assert.equal(Object.isFrozen(result.resource_cost_units), true); });
test('policy utility dimensions are unique and use the exact qualitative domain', () => { const duplicate = validLedger(); duplicate.policy_utility.push({ dimension: 'privacy', value: 'positive', rationale: 'duplicate dimension must fail' }); assert.throws(() => validateCognitiveLearningLedger(duplicate), /duplicate.*policy_utility/i); const invalidValue = validLedger(); invalidValue.policy_utility[0].value = 'worth-37-dollars'; assert.throws(() => validateCognitiveLearningLedger(invalidValue), /policy_utility.*value/i); });
test('updated_at cannot precede created_at', () => { const ledger = validLedger(); ledger.updated_at = '2026-08-30T21:59:59.000Z'; assert.throws(() => validateCognitiveLearningLedger(ledger), /updated_at.*precede/i); });
test('validation does not mutate deeply frozen input', () => { const ledger = deepFreeze(validLedger()); assert.doesNotThrow(() => validateCognitiveLearningLedger(ledger)); });
test('validator module imports only canonical helpers', async () => { const sourceUrl = new URL('../src/lib/cognitive-learning-ledger.mjs', import.meta.url); const source = await readFile(sourceUrl, 'utf8'); const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort(); assert.deepEqual(imports, ['./canonical.mjs']); });
test('zero-effect boundaries fail closed', () => { const mutations = [['contains_secret_material', true],['authority_effect', 'grant'],['network_effect', 'fetch'],['training_effect', 'train'],['spend_authorization', 'approved'],['runtime_activation', true]]; for (const [field, value] of mutations) { const ledger = validLedger(); ledger[field] = value; assert.throws(() => validateCognitiveLearningLedger(ledger), /boundary|activation|effect|authorization/i); } });

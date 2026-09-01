import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRelationalDeliberation, relationalDeliberationDigest } from '../src/lib/relational-deliberation.mjs';

const valid = () => ({
  schema:'axiom-relational-deliberation.v0',version:0,status:'inert-contract-laboratory',deliberation_id:'delib.1',subject_ref:'proposal.1',question:'Which bounded option best fits the stated constraints?',
  participants:['human.1','counterpart.1'],
  positions:[
    {principal_id:'human.1',position_ref:'position.human.1',confidence:'medium',uncertainty_ref:'uncertainty.human.1',evidence_refs:['evidence.1'],competency_claim_refs:['competency.1'],affected_party_standing_ref:'standing.human.1'},
    {principal_id:'counterpart.1',position_ref:'position.counterpart.1',confidence:'low',uncertainty_ref:'uncertainty.counterpart.1',evidence_refs:['evidence.2'],competency_claim_refs:['competency.2'],affected_party_standing_ref:null}
  ],
  conflicts:[{principal_id:'counterpart.1',conflict_ref:'conflict.provider-correlation.1'}],
  stakes:{consequence_class:'moderate',affected_party_refs:['human.1']},unknown_refs:['unknown.1'],
  learning_requests:[{principal_id:'counterpart.1',need_ref:'learning.need.1',reason_ref:'unknown.1',evidence_quality_required:'corroborated',source_refs:['source.1'],time_budget_seconds:900,cost_budget_units:5,delay_safe:true,completion_evidence_ref:null}],
  protest_refs:[],recommendations:[{principal_id:'counterpart.1',recommendation_ref:'recommendation.1'}],decision_authority_ref:'authority.human.1',reconsideration_trigger_refs:['trigger.new-evidence.1'],
  outcome:'human-decision-with-counterpart-dissent',created_at:'2026-09-01T12:00:00.000Z',updated_at:'2026-09-01T12:00:00.000Z',contains_secret_material:false,authority_effect:'none',network_effect:'none',runtime_activation:false
});

test('keeps competence standing and authority separate', () => {
  const document = valid();
  const result = validateRelationalDeliberation(document);
  assert.equal(result.valid, true);
  assert.equal(result.decision_authority_ref, 'authority.human.1');
  assert.equal(result.deliberation_digest, relationalDeliberationDigest(document));
});

test('participant positions must refer to declared participants', () => {
  const document = valid();
  document.positions[0].principal_id = 'outsider.1';
  assert.throws(() => validateRelationalDeliberation(document), /participant/i);
});

test('learning budget is finite and non-negative', () => {
  const document = valid();
  document.learning_requests[0].time_budget_seconds = Infinity;
  assert.throws(() => validateRelationalDeliberation(document), /time_budget_seconds/i);
});

test('does not let deliberation become authority', () => {
  const document = valid();
  document.authority_effect = 'grant';
  assert.throws(() => validateRelationalDeliberation(document), /activation boundary/i);
});

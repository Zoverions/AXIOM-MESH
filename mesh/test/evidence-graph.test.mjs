import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVIDENCE_ASSERTION_SCHEMA,
  EVIDENCE_LINK_SCHEMA,
  EVIDENCE_REVIEW_SCHEMA,
  buildEvidenceContext,
  validateEvidenceAssertion,
  validateEvidenceLink,
  validateEvidenceReviewState
} from '../src/domain/evidence-graph.mjs';

const at = '2026-09-03T12:00:00.000Z';
function node(id, type, proposition) {
  return { schema:EVIDENCE_ASSERTION_SCHEMA, assertion_id:id, type, proposition, source_ref:'principal:reviewer', epistemic_state:type === 'challenge' ? 'disputed':'asserted', purpose_scope:['investigation'], provenance_refs:['artifact:source-1'], created_at:at };
}
function link(id, from_ref, to_ref, relation) {
  return { schema:EVIDENCE_LINK_SCHEMA, link_id:id, from_ref, to_ref, relation, asserted_by:'principal:reviewer', created_at:at };
}

test('evidence context preserves support, contradiction, alternatives, and challenge around a hypothesis', () => {
  const assertions=[node('assertion:h','hypothesis','Hypothesis A'),node('assertion:s','evidence-item','Supports A'),node('assertion:c','counterevidence','Conflicts with A'),node('assertion:a','alternative-explanation','Alternative B'),node('assertion:q','challenge','A is disputed')];
  const links=[link('link:s','assertion:s','assertion:h','supports'),link('link:c','assertion:c','assertion:h','contradicts'),link('link:a','assertion:a','assertion:h','alternative-to'),link('link:q','assertion:q','assertion:h','challenged-by')];
  const result=buildEvidenceContext({assertions,links,focus_ids:['assertion:h']});
  assert.deepEqual(new Set(result.assertions.map(item=>item.assertion_id)),new Set(assertions.map(item=>item.assertion_id)));
  assert.deepEqual(new Set(result.links.map(item=>item.relation)),new Set(['supports','contradicts','alternative-to','challenged-by']));
});

test('review state never promotes availability or machine review into human review', () => {
  const review=validateEvidenceReviewState({ schema:EVIDENCE_REVIEW_SCHEMA, object_ref:'artifact:1', known:true, acquired:true, integrity_verified:true, indexed:true, machine_reviewed:true, human_reviewed:false, relied_upon:false, disclosed:true, challenged:false, updated_at:at });
  assert.equal(review.machine_reviewed,true); assert.equal(review.human_reviewed,false); assert.equal(review.disclosed,true); assert.equal(review.relied_upon,false);
});

test('evidence schemas reject truth and execution-authority shortcuts', () => {
  assert.throws(()=>validateEvidenceAssertion({...node('assertion:x','assertion','X'),truth:true}),/unknown field truth/);
  assert.throws(()=>validateEvidenceAssertion({...node('assertion:x','assertion','X'),execution_authority:['effect:x']}),/execution authority/);
  assert.throws(()=>validateEvidenceLink({...link('link:x','assertion:x','assertion:y','proves')}),/relation/);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeBoundedDecisionQuestionSchemaDigest
} from '../src/lib/bounded-decision-question-schema.mjs';

const ZERO = '0'.repeat(64);

function choiceSchema(options, other_option_policy = 'forbidden') {
  const document = {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.forbidden-policy.v1',
    question_kind: 'choice',
    instructions: 'Choose exactly one declared option.',
    purpose: 'closed-set',
    domain: 'forbidden-policy-domain',
    state_contract_ref: 'state.contract.forbidden.v1',
    known_limitations: [],
    created_at: '2026-09-16T20:00:00.000Z',
    options,
    other_option_policy,
    schema_digest: ZERO
  };
  document.schema_digest = computeBoundedDecisionQuestionSchemaDigest(document);
  return document;
}

test('forbidden other_option_policy rejects other, none, and forbidden option ids', () => {
  const ok = choiceSchema([
    { option_id: 'yes', description: 'Supported.' },
    { option_id: 'no', description: 'Not supported.' }
  ]);
  assert.match(ok.schema_digest, /^[0-9a-f]{64}$/);

  for (const option_id of ['other', 'none', 'forbidden']) {
    assert.throws(
      () => choiceSchema([
        { option_id: 'yes', description: 'Supported.' },
        { option_id, description: 'Fallback.' }
      ]),
      /forbidden other_option_policy|fallback option/i
    );
  }
});

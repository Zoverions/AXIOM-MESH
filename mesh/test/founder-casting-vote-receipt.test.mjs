import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  FOUNDER_GENESIS_AUTHORIZATION_SCHEMA,
  FOUNDERS_COUNCIL_FOUNDATION_SCHEMA,
  FOUNDERS_COUNCIL_SEAT_SCHEMA
} from '../src/lib/founder-genesis-council.mjs';
import {
  FOUNDER_CASTING_VOTE_ASSESSMENT_SCHEMA
} from '../src/lib/founder-casting-vote.mjs';
import {
  FOUNDER_CASTING_VOTE_RECEIPT_SCHEMA,
  assessFounderCastingVoteReceipt,
  assessFounderCastingVoteReceiptReplay
} from '../src/lib/founder-casting-vote-receipt.mjs';

function foundation() {
  const founderMindId = 'human.founder';
  const biological = Array.from({ length: 10 }, (_, index) => {
    const seat = index + 1;
    const mindId = seat === 1
      ? founderMindId
      : seat === 2
        ? 'human.founder-mother'
        : `human.founder-appointed.${seat}`;
    return {
      schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
      seat_id: `founders.bio.${seat}`,
      seat_class: 'biological',
      seat_number: seat,
      designation: seat === 1
        ? 'founder'
        : seat === 2
          ? 'founder-mother'
          : 'founder-appointed',
      original_mind_id: mindId,
      current_mind_id: mindId,
      voting_status: 'active',
      genesis_slot: null,
      authority_effect: 'none',
      runtime_activation: false
    };
  });
  const digital = Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1;
    const mindId = `digital.founder.${slot}`;
    return {
      schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
      seat_id: `founders.digital.${slot}`,
      seat_class: 'digital',
      seat_number: slot,
      designation: 'founder-genesis',
      original_mind_id: mindId,
      current_mind_id: mindId,
      voting_status: 'active',
      genesis_slot: slot,
      authority_effect: 'none',
      runtime_activation: false
    };
  });
  const authorizations = Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1;
    return {
      schema: FOUNDER_GENESIS_AUTHORIZATION_SCHEMA,
      slot_number: slot,
      holder_mind_id: founderMindId,
      state: 'consumed',
      manual_founder_confirmation_required: true,
      delegable: false,
      transferable: false,
      renewable: false,
      max_uses: 1,
      recognized_mind_id: `digital.founder.${slot}`,
      genesis_receipt_digest: slot.toString(16).padStart(64, '0'),
      authority_effect: 'none',
      runtime_activation: false
    };
  });
  return {
    schema: FOUNDERS_COUNCIL_FOUNDATION_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    founder_mind_id: founderMindId,
    seats: [...biological, ...digital],
    genesis_authorizations: authorizations,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function assessment(document, overrides = {}) {
  return {
    schema: FOUNDER_CASTING_VOTE_ASSESSMENT_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    proposal_id: 'proposal.tie.1',
    founder_mind_id: document.founder_mind_id,
    foundation_digest: digestObject(document),
    decision_class: 'ordinary',
    decision_rule: {
      mode: 'simple-majority',
      quorum_required: 14,
      yes_threshold: null,
      casting_vote_permitted: true,
      biological_yes_minimum: 0,
      digital_yes_minimum: 0
    },
    ballot_summary: {
      biological_for: 5,
      biological_against: 5,
      biological_abstain: 0,
      digital_for: 5,
      digital_against: 5,
      digital_abstain: 0
    },
    ballot_closed: true,
    authority_effect: 'none',
    execution_authority: false,
    runtime_activation: false,
    ...overrides
  };
}

function receipt(document, input, overrides = {}) {
  return {
    schema: FOUNDER_CASTING_VOTE_RECEIPT_SCHEMA,
    receipt_id: 'founder-cast.1',
    proposal_id: input.proposal_id,
    founder_mind_id: document.founder_mind_id,
    foundation_digest: digestObject(document),
    assessment_digest: digestObject(input),
    pre_cast_votes_for: 10,
    pre_cast_votes_against: 10,
    casting_vote: 'for',
    manual_founder_confirmation_evidence_digest: 'a'.repeat(64),
    cast_at: '2026-09-25T14:00:00.000Z',
    authority_effect: 'none',
    execution_authority: false,
    runtime_activation: false,
    ...overrides
  };
}

test('Founder casting vote FOR resolves a valid 10-10 tie to 11-10 evidence', () => {
  const document = foundation();
  const input = assessment(document);
  const result = assessFounderCastingVoteReceipt(
    document,
    input,
    receipt(document, input)
  );

  assert.equal(result.pre_cast_votes_for, 10);
  assert.equal(result.pre_cast_votes_against, 10);
  assert.equal(result.final_votes_for, 11);
  assert.equal(result.final_votes_against, 10);
  assert.equal(result.final_outcome, 'accepted');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_authority, false);
  assert.equal(result.runtime_activation, false);
});

test('Founder casting vote AGAINST resolves a valid 10-10 tie to 10-11 evidence', () => {
  const document = foundation();
  const input = assessment(document);
  const result = assessFounderCastingVoteReceipt(
    document,
    input,
    receipt(document, input, { casting_vote: 'against' })
  );

  assert.equal(result.final_votes_for, 10);
  assert.equal(result.final_votes_against, 11);
  assert.equal(result.final_outcome, 'rejected');
});

test('casting receipt cannot exist when the ordinary vote was not tied', () => {
  const document = foundation();
  const input = assessment(document);
  input.ballot_summary.biological_for = 6;
  input.ballot_summary.biological_against = 4;

  assert.throws(
    () => assessFounderCastingVoteReceipt(
      document,
      input,
      receipt(document, input, {
        pre_cast_votes_for: 11,
        pre_cast_votes_against: 9
      })
    ),
    /requires eligible tie/
  );
});

test('casting receipt cannot bypass a fixed threshold or constitutional decision class', () => {
  const document = foundation();
  const input = assessment(document);
  input.decision_class = 'constitutional';
  input.decision_rule.mode = 'fixed-threshold';
  input.decision_rule.yes_threshold = 14;

  assert.throws(
    () => assessFounderCastingVoteReceipt(
      document,
      input,
      receipt(document, input)
    ),
    /requires eligible tie/
  );
});

test('casting receipt must bind the exact eligible assessment and Founder', () => {
  const document = foundation();
  const input = assessment(document);

  const substituted = receipt(document, input, {
    assessment_digest: 'f'.repeat(64)
  });
  assert.throws(
    () => assessFounderCastingVoteReceipt(document, input, substituted),
    /assessment binding is invalid/
  );

  const wrongFounder = receipt(document, input, {
    founder_mind_id: 'human.other'
  });
  assert.throws(
    () => assessFounderCastingVoteReceipt(document, input, wrongFounder),
    /assessment binding is invalid/
  );
});

test('casting receipt cannot mint execution authority', () => {
  const document = foundation();
  const input = assessment(document);

  assert.throws(
    () => assessFounderCastingVoteReceipt(
      document,
      input,
      receipt(document, input, { execution_authority: true })
    ),
    /activation boundary/
  );
});

test('exact casting receipt replay is idempotent but conflicting second cast is denied', () => {
  const document = foundation();
  const input = assessment(document);
  const first = receipt(document, input);

  let result = assessFounderCastingVoteReceiptReplay([first], structuredClone(first));
  assert.equal(result.status, 'idempotent-replay');
  assert.equal(result.mutation_authorized, false);

  const conflict = receipt(document, input, {
    receipt_id: 'founder-cast.2',
    casting_vote: 'against'
  });
  result = assessFounderCastingVoteReceiptReplay([first], conflict);
  assert.equal(result.status, 'conflict-denied');
  assert.equal(result.mutation_authorized, false);
});

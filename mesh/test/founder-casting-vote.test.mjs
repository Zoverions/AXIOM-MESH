import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  FOUNDER_GENESIS_AUTHORIZATION_SCHEMA,
  FOUNDERS_COUNCIL_FOUNDATION_SCHEMA,
  FOUNDERS_COUNCIL_SEAT_SCHEMA
} from '../src/lib/founder-genesis-council.mjs';
import {
  FOUNDER_CASTING_VOTE_ASSESSMENT_SCHEMA,
  assessFounderCastingVote
} from '../src/lib/founder-casting-vote.mjs';

function fullFoundation() {
  const founderMindId = 'human.founder';
  const biological = [
    {
      schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
      seat_id: 'founders.bio.1',
      seat_class: 'biological',
      seat_number: 1,
      designation: 'founder',
      original_mind_id: founderMindId,
      current_mind_id: founderMindId,
      voting_status: 'active',
      genesis_slot: null,
      authority_effect: 'none',
      runtime_activation: false
    },
    {
      schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
      seat_id: 'founders.bio.2',
      seat_class: 'biological',
      seat_number: 2,
      designation: 'founder-mother',
      original_mind_id: 'human.founder-mother',
      current_mind_id: 'human.founder-mother',
      voting_status: 'active',
      genesis_slot: null,
      authority_effect: 'none',
      runtime_activation: false
    },
    ...Array.from({ length: 8 }, (_, index) => {
      const mindId = `human.founder-appointed.${index + 3}`;
      return {
        schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
        seat_id: `founders.bio.${index + 3}`,
        seat_class: 'biological',
        seat_number: index + 3,
        designation: 'founder-appointed',
        original_mind_id: mindId,
        current_mind_id: mindId,
        voting_status: 'active',
        genesis_slot: null,
        authority_effect: 'none',
        runtime_activation: false
      };
    })
  ];

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
      genesis_receipt_digest: index.toString(16).padStart(64, '0'),
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

function assessment(foundation) {
  return {
    schema: FOUNDER_CASTING_VOTE_ASSESSMENT_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    proposal_id: 'proposal.founding.1',
    founder_mind_id: foundation.founder_mind_id,
    foundation_digest: digestObject(foundation),
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
    runtime_activation: false
  };
}

test('Founder casting vote is eligible only for a valid full-Council ordinary tie', () => {
  const foundation = fullFoundation();
  const result = assessFounderCastingVote(foundation, assessment(foundation));

  assert.equal(result.full_original_council_active, true);
  assert.equal(result.active_voters, 20);
  assert.equal(result.votes_for, 10);
  assert.equal(result.votes_against, 10);
  assert.equal(result.quorum_satisfied, true);
  assert.equal(result.pre_cast_outcome, 'tie');
  assert.equal(result.casting_vote_eligible, true);
  assert.equal(result.reason, 'eligible');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_authority, false);
  assert.equal(result.runtime_activation, false);
});

test('Founder casting vote is unavailable before all twenty original voters are active', () => {
  const foundation = fullFoundation();
  foundation.seats.find(seat => seat.seat_id === 'founders.digital.10').voting_status = 'developing';

  const input = assessment(foundation);
  const result = assessFounderCastingVote(foundation, input);

  assert.equal(result.full_original_council_active, false);
  assert.equal(result.casting_vote_eligible, false);
  assert.equal(result.reason, 'full-original-council-not-active');
});

test('Founder casting vote cannot repair a missing fixed threshold or supermajority', () => {
  const foundation = fullFoundation();
  const input = assessment(foundation);
  input.decision_class = 'constitutional';
  input.decision_rule.mode = 'fixed-threshold';
  input.decision_rule.yes_threshold = 14;
  input.ballot_summary.biological_for = 6;
  input.ballot_summary.biological_against = 4;
  input.ballot_summary.digital_for = 7;
  input.ballot_summary.digital_against = 3;

  const result = assessFounderCastingVote(foundation, input);

  assert.equal(result.votes_for, 13);
  assert.equal(result.votes_against, 7);
  assert.equal(result.pre_cast_outcome, 'rejected');
  assert.equal(result.casting_vote_eligible, false);
  assert.equal(result.reason, 'decision-class-does-not-permit-casting-vote');
});

test('Founder casting vote cannot repair biological or digital yes minima', () => {
  const foundation = fullFoundation();
  const input = assessment(foundation);
  input.decision_rule.biological_yes_minimum = 6;

  const result = assessFounderCastingVote(foundation, input);

  assert.equal(result.pre_cast_outcome, 'protected-minimum-failed');
  assert.equal(result.biological_yes_minimum_satisfied, false);
  assert.equal(result.casting_vote_eligible, false);
  assert.equal(result.reason, 'biological-yes-minimum-not-satisfied');
});

test('Founder casting vote cannot lower quorum', () => {
  const foundation = fullFoundation();
  const input = assessment(foundation);
  input.ballot_summary = {
    biological_for: 3,
    biological_against: 3,
    biological_abstain: 0,
    digital_for: 3,
    digital_against: 3,
    digital_abstain: 0
  };

  const result = assessFounderCastingVote(foundation, input);

  assert.equal(result.participation, 12);
  assert.equal(result.quorum_satisfied, false);
  assert.equal(result.pre_cast_outcome, 'no-quorum');
  assert.equal(result.casting_vote_eligible, false);
  assert.equal(result.reason, 'quorum-not-satisfied');
});

test('Founder casting vote is unavailable when the ordinary vote is not tied', () => {
  const foundation = fullFoundation();
  const input = assessment(foundation);
  input.ballot_summary.biological_for = 6;
  input.ballot_summary.biological_against = 4;

  const result = assessFounderCastingVote(foundation, input);

  assert.equal(result.pre_cast_outcome, 'accepted');
  assert.equal(result.casting_vote_eligible, false);
  assert.equal(result.reason, 'ordinary-vote-is-not-tied');
});

test('Founder casting vote cannot be assessed before ballot closure', () => {
  const foundation = fullFoundation();
  const input = assessment(foundation);
  input.ballot_closed = false;

  const result = assessFounderCastingVote(foundation, input);

  assert.equal(result.casting_vote_eligible, false);
  assert.equal(result.reason, 'ordinary-ballot-not-closed');
});

test('Founder casting vote rejects stale or substituted foundation binding', () => {
  const foundation = fullFoundation();
  const input = assessment(foundation);
  input.foundation_digest = 'f'.repeat(64);

  assert.throws(
    () => assessFounderCastingVote(foundation, input),
    /foundation digest is invalid/
  );
});

test('Founder casting-vote assessment cannot mint runtime or execution authority', () => {
  const foundation = fullFoundation();

  const runtime = assessment(foundation);
  runtime.runtime_activation = true;
  assert.throws(
    () => assessFounderCastingVote(foundation, runtime),
    /activation boundary/
  );

  const execution = assessment(foundation);
  execution.execution_authority = true;
  assert.throws(
    () => assessFounderCastingVote(foundation, execution),
    /activation boundary/
  );

  const authority = assessment(foundation);
  authority.authority_effect = 'grant';
  assert.throws(
    () => assessFounderCastingVote(foundation, authority),
    /activation boundary/
  );
});

test('Founder casting-vote ballot cannot exceed substrate or active-electorate ceilings', () => {
  const foundation = fullFoundation();
  const input = assessment(foundation);
  input.ballot_summary.biological_for = 10;
  input.ballot_summary.biological_against = 1;

  assert.throws(
    () => assessFounderCastingVote(foundation, input),
    /substrate seat ceiling/
  );
});

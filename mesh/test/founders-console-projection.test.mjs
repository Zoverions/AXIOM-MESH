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
  GOVERNANCE_AUTHORITY_RECORD_SCHEMA,
  GOVERNANCE_ERA_AUTHORITY_PACKAGE_SCHEMA
} from '../src/lib/governance-era-authority.mjs';
import {
  FOUNDERS_CONSOLE_PROJECTION_SCHEMA,
  buildFoundersConsoleProjection,
  validateFoundersConsoleProjection
} from '../src/lib/founders-console-projection.mjs';

function foundation({ full = false } = {}) {
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
      const mindId = full ? `human.founder-appointed.${index + 3}` : null;
      return {
        schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
        seat_id: `founders.bio.${index + 3}`,
        seat_class: 'biological',
        seat_number: index + 3,
        designation: 'founder-appointed',
        original_mind_id: mindId,
        current_mind_id: mindId,
        voting_status: full ? 'active' : 'reserved',
        genesis_slot: null,
        authority_effect: 'none',
        runtime_activation: false
      };
    })
  ];

  const digital = Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1;
    const occupied = full || slot === 1;
    const mindId = occupied ? `digital.founder.${slot}` : null;
    return {
      schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
      seat_id: `founders.digital.${slot}`,
      seat_class: 'digital',
      seat_number: slot,
      designation: 'founder-genesis',
      original_mind_id: mindId,
      current_mind_id: mindId,
      voting_status: full ? 'active' : occupied ? 'developing' : 'reserved',
      genesis_slot: slot,
      authority_effect: 'none',
      runtime_activation: false
    };
  });

  const authorizations = Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1;
    const occupied = full || slot === 1;
    return {
      schema: FOUNDER_GENESIS_AUTHORIZATION_SCHEMA,
      slot_number: slot,
      holder_mind_id: founderMindId,
      state: occupied ? 'consumed' : 'unused',
      manual_founder_confirmation_required: true,
      delegable: false,
      transferable: false,
      renewable: false,
      max_uses: 1,
      recognized_mind_id: occupied ? `digital.founder.${slot}` : null,
      genesis_receipt_digest: occupied ? slot.toString(16).padStart(64, '0') : null,
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

function castingAssessment(document) {
  return {
    schema: FOUNDER_CASTING_VOTE_ASSESSMENT_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    proposal_id: 'proposal.1',
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
    runtime_activation: false
  };
}

function eraPackage() {
  return {
    schema: GOVERNANCE_ERA_AUTHORITY_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    current_era: 'founding-stewardship',
    transition: {
      candidate_era: 'distributed-settlement',
      schedule_digest: 'a'.repeat(64),
      required_continuous_days: 180,
      observed_continuous_days: 120,
      required_attestations: 2,
      attestation_digests: ['b'.repeat(64), 'c'.repeat(64)],
      challenge_status: 'none',
      gates: [
        {
          gate_id: 'population',
          status: 'satisfied',
          evidence_digest: 'd'.repeat(64)
        }
      ]
    },
    authority_records: [
      {
        schema: GOVERNANCE_AUTHORITY_RECORD_SCHEMA,
        authority_id: 'founders-council.general-rulemaking',
        holder_id: 'circle.founders-council',
        domain: 'axiom-governance',
        minimum_era: 'founding-stewardship',
        maximum_era: 'founding-stewardship',
        delegable: false,
        execution_binding: false,
        requires_local_authority_evaluation: true,
        authority_effect: 'none',
        runtime_activation: false
      }
    ],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

test('Founders Console projection derives reserve and Council state without an action surface', () => {
  const document = foundation();
  const projection = buildFoundersConsoleProjection({ foundationDocument: document });

  assert.equal(projection.schema, FOUNDERS_CONSOLE_PROJECTION_SCHEMA);
  assert.equal(projection.council.total_original_seats, 20);
  assert.equal(projection.council.active_biological_voters, 2);
  assert.equal(projection.council.active_digital_voters, 0);
  assert.equal(projection.council.full_original_council_active, false);
  assert.equal(projection.founder_genesis.total_slots, 10);
  assert.equal(projection.founder_genesis.consumed_slots, 1);
  assert.equal(projection.founder_genesis.remaining_slots, 9);
  assert.equal(projection.action_surface, 'none');
  assert.equal(projection.credential_material, 'none');
  assert.equal(projection.authority_effect, 'none');
  assert.equal(projection.network_effect, 'none');
  assert.equal(projection.runtime_activation, false);
  assert.equal(validateFoundersConsoleProjection(projection), projection);
});

test('Founders Console projection can explain an eligible Founder casting vote without executing it', () => {
  const document = foundation({ full: true });
  const projection = buildFoundersConsoleProjection({
    foundationDocument: document,
    castingAssessment: castingAssessment(document)
  });

  assert.equal(projection.council.active_voters, 20);
  assert.equal(projection.council.full_original_council_active, true);
  assert.equal(projection.casting_vote.assessed, true);
  assert.equal(projection.casting_vote.eligible, true);
  assert.equal(projection.casting_vote.reason, 'eligible');
  assert.equal(projection.casting_vote.pre_cast_outcome, 'tie');
  assert.equal(projection.action_surface, 'none');
});

test('Founders Console projection exposes governance-era explanation with no execution binding', () => {
  const projection = buildFoundersConsoleProjection({
    foundationDocument: foundation(),
    eraAuthorityPackage: eraPackage()
  });

  assert.equal(projection.governance_era.assessed, true);
  assert.equal(projection.governance_era.current_era, 'founding-stewardship');
  assert.equal(projection.governance_era.candidate_era, 'distributed-settlement');
  assert.equal(projection.governance_era.transition_eligible, false);
  assert.equal(
    projection.governance_era.transition_reason,
    'continuous-duration-not-satisfied'
  );
  assert.deepEqual(projection.governance_era.authority_windows, [
    {
      authority_id: 'founders-council.general-rulemaking',
      era_window_satisfied: true,
      reason: 'era-window-satisfied',
      execution_binding: false
    }
  ]);
});

test('projection does not expose raw Genesis authorization policy or receipt digests', () => {
  const projection = buildFoundersConsoleProjection({
    foundationDocument: foundation()
  });
  const encoded = JSON.stringify(projection);

  assert.equal(encoded.includes('manual_founder_confirmation_required'), false);
  assert.equal(encoded.includes('genesis_receipt_digest'), false);
  assert.equal(encoded.includes('candidate_package_digest'), false);
  assert.equal(encoded.includes('authorization_effect'), false);
});

test('projection rejects substituted casting-vote foundation binding', () => {
  const document = foundation({ full: true });
  const assessment = castingAssessment(document);
  assessment.foundation_digest = 'f'.repeat(64);

  assert.throws(
    () => buildFoundersConsoleProjection({
      foundationDocument: document,
      castingAssessment: assessment
    }),
    /foundation digest is invalid/
  );
});

test('projection digest detects presentation tampering', () => {
  const projection = structuredClone(buildFoundersConsoleProjection({
    foundationDocument: foundation()
  }));
  projection.founder_genesis.remaining_slots = 99;

  assert.throws(
    () => validateFoundersConsoleProjection(projection),
    /projection digest is invalid/
  );
});

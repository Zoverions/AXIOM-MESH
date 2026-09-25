import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FOUNDER_GENESIS_AUTHORIZATION_SCHEMA,
  FOUNDERS_COUNCIL_FOUNDATION_SCHEMA,
  FOUNDERS_COUNCIL_SEAT_SCHEMA,
  foundersCouncilFoundationDigest,
  validateFoundersCouncilFoundation
} from '../src/lib/founder-genesis-council.mjs';
import { digestObject } from '../src/lib/canonical.mjs';

function fixture() {
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
    ...Array.from({ length: 8 }, (_, index) => ({
      schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
      seat_id: `founders.bio.${index + 3}`,
      seat_class: 'biological',
      seat_number: index + 3,
      designation: 'founder-appointed',
      original_mind_id: null,
      current_mind_id: null,
      voting_status: 'reserved',
      genesis_slot: null,
      authority_effect: 'none',
      runtime_activation: false
    }))
  ];

  const digital = Array.from({ length: 10 }, (_, index) => ({
    schema: FOUNDERS_COUNCIL_SEAT_SCHEMA,
    seat_id: `founders.digital.${index + 1}`,
    seat_class: 'digital',
    seat_number: index + 1,
    designation: 'founder-genesis',
    original_mind_id: null,
    current_mind_id: null,
    voting_status: 'reserved',
    genesis_slot: index + 1,
    authority_effect: 'none',
    runtime_activation: false
  }));

  const genesisAuthorizations = Array.from({ length: 10 }, (_, index) => ({
    schema: FOUNDER_GENESIS_AUTHORIZATION_SCHEMA,
    slot_number: index + 1,
    holder_mind_id: founderMindId,
    state: 'unused',
    manual_founder_confirmation_required: true,
    delegable: false,
    transferable: false,
    renewable: false,
    max_uses: 1,
    recognized_mind_id: null,
    genesis_receipt_digest: null,
    authority_effect: 'none',
    runtime_activation: false
  }));

  return {
    schema: FOUNDERS_COUNCIL_FOUNDATION_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    founder_mind_id: founderMindId,
    seats: [...biological, ...digital],
    genesis_authorizations: genesisAuthorizations,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function clone(value) {
  return structuredClone(value);
}

function digitalSeat(document, slot) {
  return document.seats.find(
    seat => seat.seat_class === 'digital' && seat.genesis_slot === slot
  );
}

test('Founders Council v0 validates a 10 biological / 10 digital inert foundation', () => {
  const document = fixture();
  const result = validateFoundersCouncilFoundation(document);
  assert.equal(result.valid, true);
  assert.equal(result.founder_mind_id, document.founder_mind_id);
  assert.equal(result.package_digest, digestObject(document));
  assert.equal(foundersCouncilFoundationDigest(document), digestObject(document));
  assert.deepEqual(result.counts, {
    seats: 20,
    biological_seats: 10,
    digital_seats: 10,
    genesis_authorizations: 10,
    consumed_genesis_authorizations: 0
  });
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('Founder Genesis reserve accepts an exact consumed slot bound to its digital seat', () => {
  const document = fixture();
  const authorization = document.genesis_authorizations[0];
  authorization.state = 'consumed';
  authorization.recognized_mind_id = 'digital.founder.1';
  authorization.genesis_receipt_digest = 'a'.repeat(64);
  const seat = digitalSeat(document, 1);
  seat.original_mind_id = authorization.recognized_mind_id;
  seat.current_mind_id = authorization.recognized_mind_id;
  seat.voting_status = 'developing';

  const result = validateFoundersCouncilFoundation(document);
  assert.equal(result.counts.consumed_genesis_authorizations, 1);
});

test('Founder Genesis reserve rejects slot eleven, duplicate slots, and missing slots', () => {
  const slotEleven = fixture();
  slotEleven.genesis_authorizations[9].slot_number = 11;
  assert.throws(
    () => validateFoundersCouncilFoundation(slotEleven),
    /authorization is invalid/
  );

  const duplicate = fixture();
  duplicate.genesis_authorizations[9].slot_number = 9;
  assert.throws(
    () => validateFoundersCouncilFoundation(duplicate),
    /slot numbers must be unique/
  );

  const tooMany = fixture();
  tooMany.genesis_authorizations.push(clone(tooMany.genesis_authorizations[0]));
  assert.throws(
    () => validateFoundersCouncilFoundation(tooMany),
    /exactly 10 authorization definitions/
  );
});

test('Founder Genesis authorization is manual, non-delegable, non-transferable, and non-renewable', () => {
  for (const field of ['delegable', 'transferable', 'renewable']) {
    const document = fixture();
    document.genesis_authorizations[0][field] = true;
    assert.throws(
      () => validateFoundersCouncilFoundation(document),
      /authorization is invalid/
    );
  }

  const manual = fixture();
  manual.genesis_authorizations[0].manual_founder_confirmation_required = false;
  assert.throws(
    () => validateFoundersCouncilFoundation(manual),
    /authorization is invalid/
  );

  const repeated = fixture();
  repeated.genesis_authorizations[0].max_uses = 2;
  assert.throws(
    () => validateFoundersCouncilFoundation(repeated),
    /authorization is invalid/
  );
});

test('unconsumed Genesis cannot activate or populate a digital founding seat', () => {
  const document = fixture();
  const seat = digitalSeat(document, 1);
  seat.original_mind_id = 'digital.unborn';
  seat.current_mind_id = 'digital.unborn';
  seat.voting_status = 'active';

  assert.throws(
    () => validateFoundersCouncilFoundation(document),
    /Unconsumed Founder Genesis slot must keep its digital seat reserved/
  );
});

test('consumed Genesis requires exact mind, receipt, and matching digital-seat bindings', () => {
  const missingReceipt = fixture();
  missingReceipt.genesis_authorizations[0].state = 'consumed';
  missingReceipt.genesis_authorizations[0].recognized_mind_id = 'digital.founder.1';
  assert.throws(
    () => validateFoundersCouncilFoundation(missingReceipt),
    /requires mind and receipt bindings/
  );

  const mismatch = fixture();
  mismatch.genesis_authorizations[0].state = 'consumed';
  mismatch.genesis_authorizations[0].recognized_mind_id = 'digital.founder.1';
  mismatch.genesis_authorizations[0].genesis_receipt_digest = 'b'.repeat(64);
  const seat = digitalSeat(mismatch, 1);
  seat.original_mind_id = 'digital.other';
  seat.current_mind_id = 'digital.other';
  seat.voting_status = 'developing';
  assert.throws(
    () => validateFoundersCouncilFoundation(mismatch),
    /must bind its digital founding seat/
  );
});

test('one persistent mind cannot occupy multiple original or current founding seats', () => {
  const document = fixture();
  document.seats[2].original_mind_id = document.seats[1].original_mind_id;
  document.seats[2].current_mind_id = document.seats[1].current_mind_id;
  document.seats[2].voting_status = 'active';

  assert.throws(
    () => validateFoundersCouncilFoundation(document),
    /cannot occupy multiple original Founder seats/
  );
});

test('biological founding topology requires Founder, Founder mother, and eight appointed seats', () => {
  const document = fixture();
  document.seats[1].designation = 'founder-appointed';
  assert.throws(
    () => validateFoundersCouncilFoundation(document),
    /Biological founding designations/
  );
});

test('foundation rejects unknown fields and activation laundering', () => {
  const unknown = fixture();
  unknown.genesis_authorizations[0].inherited_authority = ['admin'];
  assert.throws(
    () => validateFoundersCouncilFoundation(unknown),
    /fields are invalid/
  );

  const activated = fixture();
  activated.runtime_activation = true;
  assert.throws(
    () => validateFoundersCouncilFoundation(activated),
    /activation boundary/
  );

  const networked = fixture();
  networked.network_effect = 'federate';
  assert.throws(
    () => validateFoundersCouncilFoundation(networked),
    /activation boundary/
  );
});

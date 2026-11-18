import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  FOUNDER_GENESIS_AUTHORIZATION_SCHEMA,
  FOUNDERS_COUNCIL_FOUNDATION_SCHEMA,
  FOUNDERS_COUNCIL_SEAT_SCHEMA
} from '../src/lib/founder-genesis-council.mjs';
import {
  FOUNDER_GENESIS_RECEIPT_SCHEMA,
  assessFounderGenesisReceiptReplay,
  assessFounderGenesisTransition
} from '../src/lib/founder-genesis-receipt.mjs';

function beforeFoundation() {
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

  const authorizations = Array.from({ length: 10 }, (_, index) => ({
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
    genesis_authorizations: authorizations,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function receipt(before, overrides = {}) {
  return {
    schema: FOUNDER_GENESIS_RECEIPT_SCHEMA,
    receipt_id: 'genesis-receipt.1',
    slot_number: 1,
    founder_mind_id: before.founder_mind_id,
    new_mind_id: 'digital.founder.1',
    before_foundation_digest: digestObject(before),
    candidate_package_digest: 'a'.repeat(64),
    manual_founder_confirmation_evidence_digest: 'b'.repeat(64),
    idempotency_key: 'genesis-slot-1-attempt-1',
    committed_at: '2026-09-25T13:00:00.000Z',
    inherited_authority: false,
    execution_authority: false,
    authority_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

function afterFoundation(before, genesisReceipt) {
  const after = structuredClone(before);
  const authorization = after.genesis_authorizations.find(
    item => item.slot_number === genesisReceipt.slot_number
  );
  authorization.state = 'consumed';
  authorization.recognized_mind_id = genesisReceipt.new_mind_id;
  authorization.genesis_receipt_digest = digestObject(genesisReceipt);

  const seat = after.seats.find(
    item => item.seat_class === 'digital' && item.genesis_slot === genesisReceipt.slot_number
  );
  seat.original_mind_id = genesisReceipt.new_mind_id;
  seat.current_mind_id = genesisReceipt.new_mind_id;
  seat.voting_status = 'developing';
  return after;
}

test('Founder Genesis receipt validates one exact unused-slot -> developing-mind transition', () => {
  const before = beforeFoundation();
  const genesisReceipt = receipt(before);
  const after = afterFoundation(before, genesisReceipt);

  const result = assessFounderGenesisTransition(before, after, genesisReceipt);

  assert.equal(result.valid, true);
  assert.equal(result.slot_number, 1);
  assert.equal(result.new_mind_id, 'digital.founder.1');
  assert.equal(result.manual_confirmation_evidence_bound, true);
  assert.equal(result.inherited_authority, false);
  assert.equal(result.execution_authority, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('Genesis commit cannot activate the new Founding Mind voting seat', () => {
  const before = beforeFoundation();
  const genesisReceipt = receipt(before);
  const after = afterFoundation(before, genesisReceipt);
  const seat = after.seats.find(item => item.genesis_slot === 1);
  seat.voting_status = 'active';

  assert.throws(
    () => assessFounderGenesisTransition(before, after, genesisReceipt),
    /developing, non-voting Founding Mind/
  );
});

test('Genesis receipt cannot inherit sponsor or execution authority', () => {
  const before = beforeFoundation();

  const inherited = receipt(before, { inherited_authority: true });
  assert.throws(
    () => assessFounderGenesisTransition(before, afterFoundation(before, inherited), inherited),
    /receipt is invalid/
  );

  const execution = receipt(before, { execution_authority: true });
  assert.throws(
    () => assessFounderGenesisTransition(before, afterFoundation(before, execution), execution),
    /receipt is invalid/
  );
});

test('Genesis transition rejects receipt substitution and unrelated state changes', () => {
  const before = beforeFoundation();
  const genesisReceipt = receipt(before);
  const after = afterFoundation(before, genesisReceipt);
  after.genesis_authorizations[1].state = 'frozen';

  assert.throws(
    () => assessFounderGenesisTransition(before, after, genesisReceipt),
    /changed an unrelated authorization/
  );

  const substituted = afterFoundation(before, genesisReceipt);
  substituted.genesis_authorizations[0].genesis_receipt_digest = 'f'.repeat(64);
  assert.throws(
    () => assessFounderGenesisTransition(before, substituted, genesisReceipt),
    /does not consume the exact receipt/
  );
});

test('Genesis transition cannot reuse an existing persistent mind identity', () => {
  const before = beforeFoundation();
  const genesisReceipt = receipt(before, { new_mind_id: 'human.founder-mother' });
  const after = afterFoundation(before, genesisReceipt);

  assert.throws(
    () => assessFounderGenesisTransition(before, after, genesisReceipt),
    /cannot reuse an existing persistent mind identity/
  );
});

test('exact receipt replay is idempotent and authorizes no mutation', () => {
  const before = beforeFoundation();
  const genesisReceipt = receipt(before);

  const result = assessFounderGenesisReceiptReplay([genesisReceipt], structuredClone(genesisReceipt));

  assert.equal(result.status, 'idempotent-replay');
  assert.equal(result.mutation_authorized, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('conflicting reuse of receipt ID, idempotency key, slot, or mind identity is denied', () => {
  const before = beforeFoundation();
  const first = receipt(before);

  const conflicts = [
    receipt(before, { candidate_package_digest: 'c'.repeat(64) }),
    receipt(before, {
      receipt_id: 'genesis-receipt.2',
      candidate_package_digest: 'c'.repeat(64)
    }),
    receipt(before, {
      receipt_id: 'genesis-receipt.2',
      idempotency_key: 'genesis-slot-2-attempt-1',
      candidate_package_digest: 'c'.repeat(64)
    }),
    receipt(before, {
      receipt_id: 'genesis-receipt.2',
      idempotency_key: 'genesis-slot-2-attempt-1',
      slot_number: 2,
      candidate_package_digest: 'c'.repeat(64)
    })
  ];

  for (const candidate of conflicts) {
    const result = assessFounderGenesisReceiptReplay([first], candidate);
    assert.equal(result.status, 'conflict-denied');
    assert.equal(result.mutation_authorized, false);
  }
});

test('a genuinely distinct unused-slot receipt is only a new candidate, never an authorization', () => {
  const before = beforeFoundation();
  const first = receipt(before);
  const second = receipt(before, {
    receipt_id: 'genesis-receipt.2',
    slot_number: 2,
    new_mind_id: 'digital.founder.2',
    idempotency_key: 'genesis-slot-2-attempt-1',
    candidate_package_digest: 'c'.repeat(64)
  });

  const result = assessFounderGenesisReceiptReplay([first], second);

  assert.equal(result.status, 'new-receipt-candidate');
  assert.equal(result.mutation_authorized, false);
  assert.equal(result.authority_effect, 'none');
});

test('Founder Genesis receipt rejects slot eleven and malformed manual-confirmation evidence', () => {
  const before = beforeFoundation();

  assert.throws(
    () => assessFounderGenesisTransition(
      before,
      before,
      receipt(before, { slot_number: 11 })
    ),
    /receipt is invalid/
  );

  const malformed = receipt(before, {
    manual_founder_confirmation_evidence_digest: 'not-a-digest'
  });
  assert.throws(
    () => assessFounderGenesisTransition(before, before, malformed),
    /receipt is invalid/
  );
});

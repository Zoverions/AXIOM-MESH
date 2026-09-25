import { digestObject, ValidationError } from './canonical.mjs';

export const FOUNDERS_COUNCIL_FOUNDATION_SCHEMA = 'axiom-founders-council-foundation.v0';
export const FOUNDERS_COUNCIL_SEAT_SCHEMA = 'axiom-founders-council-seat.v0';
export const FOUNDER_GENESIS_AUTHORIZATION_SCHEMA = 'axiom-founder-genesis-authorization.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SEAT_CLASSES = new Set(['biological', 'digital']);
const BIOLOGICAL_DESIGNATIONS = new Set(['founder', 'founder-mother', 'founder-appointed']);
const VOTING_STATUSES = new Set(['reserved', 'developing', 'active', 'inactive']);
const AUTHORIZATION_STATES = new Set(['unused', 'pending', 'consumed', 'frozen']);

export function validateFoundersCouncilFoundation(document) {
  exactObject(document, 'Founders Council foundation', [
    'schema',
    'version',
    'status',
    'founder_mind_id',
    'seats',
    'genesis_authorizations',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);
  if (
    document.schema !== FOUNDERS_COUNCIL_FOUNDATION_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
    || !id(document.founder_mind_id)
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Founders Council foundation activation boundary is invalid');

  if (!Array.isArray(document.seats) || document.seats.length !== 20) {
    throw new ValidationError('Founders Council foundation requires exactly 20 seat definitions');
  }
  if (!Array.isArray(document.genesis_authorizations) || document.genesis_authorizations.length !== 10) {
    throw new ValidationError('Founder Genesis reserve requires exactly 10 authorization definitions');
  }

  const seats = document.seats.map(seat => validateSeat(seat));
  const authorizations = document.genesis_authorizations.map(record => (
    validateAuthorization(record, document.founder_mind_id)
  ));

  validateSeatTopology(seats, document.founder_mind_id);
  validateAuthorizationTopology(authorizations);
  validateDigitalSeatBindings(seats, authorizations);

  return Object.freeze({
    valid: true,
    schema: document.schema,
    founder_mind_id: document.founder_mind_id,
    package_digest: digestObject(document),
    counts: Object.freeze({
      seats: seats.length,
      biological_seats: seats.filter(seat => seat.seat_class === 'biological').length,
      digital_seats: seats.filter(seat => seat.seat_class === 'digital').length,
      genesis_authorizations: authorizations.length,
      consumed_genesis_authorizations: authorizations.filter(item => item.state === 'consumed').length
    }),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function foundersCouncilFoundationDigest(document) {
  validateFoundersCouncilFoundation(document);
  return digestObject(document);
}

function validateSeat(seat) {
  exactObject(seat, 'Founders Council seat', [
    'schema',
    'seat_id',
    'seat_class',
    'seat_number',
    'designation',
    'original_mind_id',
    'current_mind_id',
    'voting_status',
    'genesis_slot',
    'authority_effect',
    'runtime_activation'
  ]);
  if (
    seat.schema !== FOUNDERS_COUNCIL_SEAT_SCHEMA
    || !id(seat.seat_id)
    || !SEAT_CLASSES.has(seat.seat_class)
    || !Number.isSafeInteger(seat.seat_number)
    || seat.seat_number < 1
    || seat.seat_number > 10
    || !VOTING_STATUSES.has(seat.voting_status)
    || seat.authority_effect !== 'none'
    || seat.runtime_activation !== false
  ) throw new ValidationError('Founders Council seat is invalid');

  if (!(seat.original_mind_id === null || id(seat.original_mind_id))) {
    throw new ValidationError('Founders Council seat original_mind_id is invalid');
  }
  if (!(seat.current_mind_id === null || id(seat.current_mind_id))) {
    throw new ValidationError('Founders Council seat current_mind_id is invalid');
  }

  if (seat.seat_class === 'biological') {
    if (
      !BIOLOGICAL_DESIGNATIONS.has(seat.designation)
      || seat.genesis_slot !== null
      || seat.voting_status === 'developing'
    ) throw new ValidationError('Biological Founders Council seat is invalid');
  } else if (
    seat.designation !== 'founder-genesis'
    || !Number.isSafeInteger(seat.genesis_slot)
    || seat.genesis_slot < 1
    || seat.genesis_slot > 10
  ) {
    throw new ValidationError('Digital Founders Council seat is invalid');
  }

  if (seat.original_mind_id === null && seat.current_mind_id !== null) {
    throw new ValidationError('Current Council holder requires an original mind binding in foundation v0');
  }
  if (
    seat.original_mind_id !== null
    && seat.current_mind_id !== null
    && seat.original_mind_id !== seat.current_mind_id
  ) {
    throw new ValidationError('Foundation v0 does not encode successor seat occupancy');
  }
  if (seat.original_mind_id === null && seat.voting_status !== 'reserved') {
    throw new ValidationError('Unbound Founders Council seat must remain reserved');
  }

  return seat;
}

function validateAuthorization(record, founderMindId) {
  exactObject(record, 'Founder Genesis authorization', [
    'schema',
    'slot_number',
    'holder_mind_id',
    'state',
    'manual_founder_confirmation_required',
    'delegable',
    'transferable',
    'renewable',
    'max_uses',
    'recognized_mind_id',
    'genesis_receipt_digest',
    'authority_effect',
    'runtime_activation'
  ]);
  if (
    record.schema !== FOUNDER_GENESIS_AUTHORIZATION_SCHEMA
    || !Number.isSafeInteger(record.slot_number)
    || record.slot_number < 1
    || record.slot_number > 10
    || record.holder_mind_id !== founderMindId
    || !AUTHORIZATION_STATES.has(record.state)
    || record.manual_founder_confirmation_required !== true
    || record.delegable !== false
    || record.transferable !== false
    || record.renewable !== false
    || record.max_uses !== 1
    || record.authority_effect !== 'none'
    || record.runtime_activation !== false
  ) throw new ValidationError('Founder Genesis authorization is invalid');

  const consumed = record.state === 'consumed';
  if (consumed) {
    if (!id(record.recognized_mind_id) || !DIGEST.test(record.genesis_receipt_digest ?? '')) {
      throw new ValidationError('Consumed Founder Genesis authorization requires mind and receipt bindings');
    }
  } else if (record.recognized_mind_id !== null || record.genesis_receipt_digest !== null) {
    throw new ValidationError('Unconsumed Founder Genesis authorization cannot claim a Genesis result');
  }

  return record;
}

function validateSeatTopology(seats, founderMindId) {
  const seatIds = new Set();
  const classNumbers = new Set();
  const originalMindIds = new Set();
  const currentMindIds = new Set();
  let biological = 0;
  let digital = 0;
  let founderDesignations = 0;
  let motherDesignations = 0;
  let appointedDesignations = 0;

  for (const seat of seats) {
    if (seatIds.has(seat.seat_id)) throw new ValidationError('Founders Council seat IDs must be unique');
    seatIds.add(seat.seat_id);

    const classNumber = `${seat.seat_class}:${seat.seat_number}`;
    if (classNumbers.has(classNumber)) {
      throw new ValidationError('Founders Council seat numbers must be unique within each class');
    }
    classNumbers.add(classNumber);

    if (seat.original_mind_id !== null) {
      if (originalMindIds.has(seat.original_mind_id)) {
        throw new ValidationError('One persistent mind cannot occupy multiple original Founder seats');
      }
      originalMindIds.add(seat.original_mind_id);
    }
    if (seat.current_mind_id !== null) {
      if (currentMindIds.has(seat.current_mind_id)) {
        throw new ValidationError('One persistent mind cannot hold multiple current Founder seats');
      }
      currentMindIds.add(seat.current_mind_id);
    }

    if (seat.seat_class === 'biological') {
      biological += 1;
      if (seat.designation === 'founder') founderDesignations += 1;
      if (seat.designation === 'founder-mother') motherDesignations += 1;
      if (seat.designation === 'founder-appointed') appointedDesignations += 1;
    } else {
      digital += 1;
      if (seat.genesis_slot !== seat.seat_number) {
        throw new ValidationError('Digital founding seat must bind the matching Genesis slot number');
      }
    }
  }

  if (biological !== 10 || digital !== 10) {
    throw new ValidationError('Founders Council requires exactly 10 biological and 10 digital seats');
  }
  if (founderDesignations !== 1 || motherDesignations !== 1 || appointedDesignations !== 8) {
    throw new ValidationError('Biological founding designations must be Founder, Founder mother, and eight Founder-appointed seats');
  }

  const founderSeat = seats.find(seat => seat.designation === 'founder');
  if (
    founderSeat.original_mind_id !== founderMindId
    || founderSeat.current_mind_id !== founderMindId
    || founderSeat.voting_status !== 'active'
  ) throw new ValidationError('Founder must occupy one active biological founding seat');

  const motherSeat = seats.find(seat => seat.designation === 'founder-mother');
  if (
    !id(motherSeat.original_mind_id)
    || motherSeat.current_mind_id !== motherSeat.original_mind_id
  ) throw new ValidationError('Founder mother seat requires one persistent mind binding');
}

function validateAuthorizationTopology(authorizations) {
  const slots = new Set();
  for (const record of authorizations) {
    if (slots.has(record.slot_number)) {
      throw new ValidationError('Founder Genesis slot numbers must be unique');
    }
    slots.add(record.slot_number);
  }
  for (let slot = 1; slot <= 10; slot += 1) {
    if (!slots.has(slot)) throw new ValidationError(`Founder Genesis slot ${slot} is missing`);
  }
}

function validateDigitalSeatBindings(seats, authorizations) {
  const digitalBySlot = new Map(
    seats.filter(seat => seat.seat_class === 'digital').map(seat => [seat.genesis_slot, seat])
  );

  for (const authorization of authorizations) {
    const seat = digitalBySlot.get(authorization.slot_number);
    if (!seat) throw new ValidationError('Founder Genesis authorization lacks a matching digital seat');

    if (authorization.state === 'consumed') {
      if (
        seat.original_mind_id !== authorization.recognized_mind_id
        || seat.current_mind_id !== authorization.recognized_mind_id
        || !['developing', 'active', 'inactive'].includes(seat.voting_status)
      ) {
        throw new ValidationError('Consumed Founder Genesis authorization must bind its digital founding seat');
      }
    } else if (
      seat.original_mind_id !== null
      || seat.current_mind_id !== null
      || seat.voting_status !== 'reserved'
    ) {
      throw new ValidationError('Unconsumed Founder Genesis slot must keep its digital seat reserved');
    }
  }
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function id(value) {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

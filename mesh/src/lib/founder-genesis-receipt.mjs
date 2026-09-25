import { digestObject, ValidationError } from './canonical.mjs';
import {
  validateFoundersCouncilFoundation
} from './founder-genesis-council.mjs';

export const FOUNDER_GENESIS_RECEIPT_SCHEMA = 'axiom-founder-genesis-receipt.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function validateFounderGenesisReceipt(receipt) {
  exactObject(receipt, 'Founder Genesis receipt', [
    'schema',
    'receipt_id',
    'slot_number',
    'founder_mind_id',
    'new_mind_id',
    'before_foundation_digest',
    'candidate_package_digest',
    'manual_founder_confirmation_evidence_digest',
    'idempotency_key',
    'committed_at',
    'inherited_authority',
    'execution_authority',
    'authority_effect',
    'runtime_activation'
  ]);

  if (
    receipt.schema !== FOUNDER_GENESIS_RECEIPT_SCHEMA
    || !id(receipt.receipt_id)
    || !integerBetween(receipt.slot_number, 1, 10)
    || !id(receipt.founder_mind_id)
    || !id(receipt.new_mind_id)
    || !digest(receipt.before_foundation_digest)
    || !digest(receipt.candidate_package_digest)
    || !digest(receipt.manual_founder_confirmation_evidence_digest)
    || !id(receipt.idempotency_key)
    || receipt.inherited_authority !== false
    || receipt.execution_authority !== false
    || receipt.authority_effect !== 'none'
    || receipt.runtime_activation !== false
  ) {
    throw new ValidationError('Founder Genesis receipt is invalid');
  }

  const committed = new Date(receipt.committed_at);
  if (Number.isNaN(committed.valueOf()) || committed.toISOString() !== receipt.committed_at) {
    throw new ValidationError('Founder Genesis receipt committed_at is invalid');
  }

  return receipt;
}

export function assessFounderGenesisTransition(beforeDocument, afterDocument, receipt) {
  const before = validateFoundersCouncilFoundation(beforeDocument);
  const after = validateFoundersCouncilFoundation(afterDocument);
  validateFounderGenesisReceipt(receipt);

  if (before.founder_mind_id !== after.founder_mind_id) {
    throw new ValidationError('Founder Genesis transition cannot substitute the Founder identity');
  }
  if (
    receipt.founder_mind_id !== before.founder_mind_id
    || receipt.before_foundation_digest !== before.package_digest
  ) {
    throw new ValidationError('Founder Genesis receipt foundation binding is invalid');
  }

  validateTopLevelContinuity(beforeDocument, afterDocument);

  const beforeAuthorization = authorizationFor(beforeDocument, receipt.slot_number);
  const afterAuthorization = authorizationFor(afterDocument, receipt.slot_number);
  const beforeSeat = digitalSeatFor(beforeDocument, receipt.slot_number);
  const afterSeat = digitalSeatFor(afterDocument, receipt.slot_number);

  if (!['unused', 'pending'].includes(beforeAuthorization.state)) {
    throw new ValidationError('Founder Genesis transition requires an unconsumed authorization');
  }
  if (
    beforeAuthorization.recognized_mind_id !== null
    || beforeAuthorization.genesis_receipt_digest !== null
  ) {
    throw new ValidationError('Founder Genesis transition before-state is already bound');
  }

  const receiptDigest = digestObject(receipt);
  if (
    afterAuthorization.state !== 'consumed'
    || afterAuthorization.recognized_mind_id !== receipt.new_mind_id
    || afterAuthorization.genesis_receipt_digest !== receiptDigest
  ) {
    throw new ValidationError('Founder Genesis transition after-state does not consume the exact receipt');
  }

  if (
    beforeSeat.original_mind_id !== null
    || beforeSeat.current_mind_id !== null
    || beforeSeat.voting_status !== 'reserved'
  ) {
    throw new ValidationError('Founder Genesis transition requires a reserved digital founding seat');
  }
  if (
    afterSeat.original_mind_id !== receipt.new_mind_id
    || afterSeat.current_mind_id !== receipt.new_mind_id
    || afterSeat.voting_status !== 'developing'
  ) {
    throw new ValidationError('Founder Genesis transition must create a developing, non-voting Founding Mind');
  }

  const existingMindIds = new Set(
    beforeDocument.seats.flatMap(seat => [seat.original_mind_id, seat.current_mind_id])
      .filter(value => value !== null)
  );
  if (existingMindIds.has(receipt.new_mind_id)) {
    throw new ValidationError('Founder Genesis transition cannot reuse an existing persistent mind identity');
  }

  validateUnchangedAuthorizations(beforeDocument, afterDocument, receipt.slot_number);
  validateUnchangedSeats(beforeDocument, afterDocument, receipt.slot_number);
  validateAuthorizationStaticFields(beforeAuthorization, afterAuthorization);
  validateSeatStaticFields(beforeSeat, afterSeat);

  return Object.freeze({
    valid: true,
    receipt_id: receipt.receipt_id,
    receipt_digest: receiptDigest,
    slot_number: receipt.slot_number,
    founder_mind_id: receipt.founder_mind_id,
    new_mind_id: receipt.new_mind_id,
    before_foundation_digest: before.package_digest,
    after_foundation_digest: after.package_digest,
    manual_confirmation_evidence_bound: true,
    inherited_authority: false,
    execution_authority: false,
    authority_effect: 'none',
    runtime_activation: false
  });
}

export function assessFounderGenesisReceiptReplay(existingReceipts, candidateReceipt) {
  if (!Array.isArray(existingReceipts) || existingReceipts.length > 10) {
    throw new ValidationError('Founder Genesis receipt history is invalid');
  }
  const candidate = validateFounderGenesisReceipt(candidateReceipt);
  const candidateDigest = digestObject(candidate);

  const seenDigests = new Set();
  for (const existing of existingReceipts) {
    validateFounderGenesisReceipt(existing);
    const existingDigest = digestObject(existing);
    if (seenDigests.has(existingDigest)) {
      throw new ValidationError('Founder Genesis receipt history contains duplicate receipt records');
    }
    seenDigests.add(existingDigest);

    if (existingDigest === candidateDigest) {
      return replayResult('idempotent-replay', candidate);
    }

    if (
      existing.receipt_id === candidate.receipt_id
      || existing.idempotency_key === candidate.idempotency_key
      || existing.slot_number === candidate.slot_number
      || existing.new_mind_id === candidate.new_mind_id
    ) {
      return replayResult('conflict-denied', candidate);
    }
  }

  return replayResult('new-receipt-candidate', candidate);
}

function replayResult(status, candidate) {
  return Object.freeze({
    valid: true,
    status,
    receipt_id: candidate.receipt_id,
    slot_number: candidate.slot_number,
    new_mind_id: candidate.new_mind_id,
    mutation_authorized: false,
    authority_effect: 'none',
    runtime_activation: false
  });
}

function validateTopLevelContinuity(before, after) {
  for (const field of [
    'schema',
    'version',
    'status',
    'founder_mind_id',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]) {
    if (before[field] !== after[field]) {
      throw new ValidationError(`Founder Genesis transition cannot change foundation field ${field}`);
    }
  }
}

function validateUnchangedAuthorizations(before, after, slotNumber) {
  const beforeBySlot = new Map(before.genesis_authorizations.map(item => [item.slot_number, item]));
  const afterBySlot = new Map(after.genesis_authorizations.map(item => [item.slot_number, item]));

  for (let slot = 1; slot <= 10; slot += 1) {
    if (slot === slotNumber) continue;
    if (digestObject(beforeBySlot.get(slot)) !== digestObject(afterBySlot.get(slot))) {
      throw new ValidationError('Founder Genesis transition changed an unrelated authorization');
    }
  }
}

function validateUnchangedSeats(before, after, slotNumber) {
  const beforeById = new Map(before.seats.map(item => [item.seat_id, item]));
  const afterById = new Map(after.seats.map(item => [item.seat_id, item]));

  for (const [seatId, beforeSeat] of beforeById) {
    const afterSeat = afterById.get(seatId);
    if (!afterSeat) throw new ValidationError('Founder Genesis transition removed a Council seat');

    if (beforeSeat.seat_class === 'digital' && beforeSeat.genesis_slot === slotNumber) continue;

    if (digestObject(beforeSeat) !== digestObject(afterSeat)) {
      throw new ValidationError('Founder Genesis transition changed an unrelated Council seat');
    }
  }
}

function validateAuthorizationStaticFields(before, after) {
  for (const field of [
    'schema',
    'slot_number',
    'holder_mind_id',
    'manual_founder_confirmation_required',
    'delegable',
    'transferable',
    'renewable',
    'max_uses',
    'authority_effect',
    'runtime_activation'
  ]) {
    if (before[field] !== after[field]) {
      throw new ValidationError(`Founder Genesis transition changed authorization field ${field}`);
    }
  }
}

function validateSeatStaticFields(before, after) {
  for (const field of [
    'schema',
    'seat_id',
    'seat_class',
    'seat_number',
    'designation',
    'genesis_slot',
    'authority_effect',
    'runtime_activation'
  ]) {
    if (before[field] !== after[field]) {
      throw new ValidationError(`Founder Genesis transition changed seat field ${field}`);
    }
  }
}

function authorizationFor(document, slotNumber) {
  const record = document.genesis_authorizations.find(item => item.slot_number === slotNumber);
  if (!record) throw new ValidationError('Founder Genesis receipt names an unknown authorization slot');
  return record;
}

function digitalSeatFor(document, slotNumber) {
  const seat = document.seats.find(
    item => item.seat_class === 'digital' && item.genesis_slot === slotNumber
  );
  if (!seat) throw new ValidationError('Founder Genesis receipt names an unknown digital seat');
  return seat;
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

function integerBetween(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function id(value) {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function digest(value) {
  return typeof value === 'string' && DIGEST.test(value);
}

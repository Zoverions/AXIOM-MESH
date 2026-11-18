import {
  AxiomError,
  ValidationError,
  digestObject
} from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';
import {
  verifyCircleGridAdmissionReceipt as verifyBaseCircleGridAdmissionReceipt
} from './circle-admission-implementation.mjs';

export * from './circle-admission-implementation.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const EVENT_KEYS = Object.freeze([
  'seq', 'event_id', 'trace_id', 'actor', 'kind', 'subject', 'occurred_at',
  'payload_digest', 'prev_hash', 'event_hash', 'signature'
]);

export function verifyCircleGridAdmissionReceipt(receiptInput, options = {}) {
  validateSignedGridAdmissionEvent(options.gridEvent, options.gridPublicKey);
  return verifyBaseCircleGridAdmissionReceipt(receiptInput, options);
}

function validateSignedGridAdmissionEvent(gridEvent, gridPublicKey) {
  if (!gridEvent || typeof gridEvent !== 'object' || Array.isArray(gridEvent)) {
    throw new ValidationError('Circle Grid admission Grid event is invalid');
  }
  const actualKeys = Object.keys(gridEvent).filter(key => key !== 'payload').sort();
  const expectedKeys = [...EVENT_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new ValidationError('Circle Grid admission Grid event fields are invalid');
  }
  if (
    !Number.isSafeInteger(gridEvent.seq)
    || gridEvent.seq < 1
    || typeof gridEvent.event_id !== 'string'
    || typeof gridEvent.trace_id !== 'string'
    || typeof gridEvent.actor !== 'string'
    || typeof gridEvent.kind !== 'string'
    || typeof gridEvent.subject !== 'string'
    || !canonicalTimestamp(gridEvent.occurred_at)
    || !DIGEST.test(gridEvent.payload_digest ?? '')
    || !DIGEST.test(gridEvent.prev_hash ?? '')
    || !DIGEST.test(gridEvent.event_hash ?? '')
  ) {
    throw new ValidationError('Circle Grid admission Grid event envelope is invalid');
  }
  if (
    Object.hasOwn(gridEvent, 'payload')
    && digestObject(gridEvent.payload) !== gridEvent.payload_digest
  ) {
    throw new AxiomError(
      'circle_persistence_admission_grid_event_invalid',
      'Circle Grid admission Grid event payload digest is invalid',
      503
    );
  }
  const expectedEventHash = digestObject({
    seq: gridEvent.seq,
    event_id: gridEvent.event_id,
    trace_id: gridEvent.trace_id,
    actor: gridEvent.actor,
    kind: gridEvent.kind,
    subject: gridEvent.subject,
    occurred_at: gridEvent.occurred_at,
    payload_digest: gridEvent.payload_digest,
    prev_hash: gridEvent.prev_hash
  });
  if (gridEvent.event_hash !== expectedEventHash) {
    throw new AxiomError(
      'circle_persistence_admission_grid_event_invalid',
      'Circle Grid admission Grid event hash does not match its envelope',
      503
    );
  }
  if (
    !gridPublicKey
    || !verifyObjectSignature(
      { event_hash: gridEvent.event_hash },
      gridEvent.signature,
      gridPublicKey
    )
  ) {
    throw new AxiomError(
      'circle_persistence_admission_grid_event_invalid',
      'Circle Grid admission Grid event signature is invalid',
      503
    );
  }
  return true;
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

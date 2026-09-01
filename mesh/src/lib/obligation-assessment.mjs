import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

const STATES = new Set([
  'pending','fulfilled','failed','unknown','disputed','cure_pending','waived','terminated'
]);

export function assessObligation(rawObligation, rawObservation) {
  const obligation = assertPlainObject(rawObligation, 'obligation');
  const observation = assertPlainObject(rawObservation, 'observation');

  const obligationId = assertString(obligation.obligation_id, 'obligation.obligation_id', {
    min: 1, max: 192
  });
  if (observation.obligation_id !== obligationId) {
    throw new ValidationError('observation obligation_id mismatch');
  }

  const status = assertString(observation.status, 'observation.status', { min: 1, max: 32 });
  if (!STATES.has(status)) throw new ValidationError('observation status is invalid');

  const evidenceRefs = assertStringArray(observation.evidence_refs, 'observation.evidence_refs', {
    maxItems: 128, itemMax: 512
  });

  if (status === 'fulfilled' && evidenceRefs.length === 0) {
    throw new ValidationError('fulfilled obligation requires evidence');
  }

  if (status === 'failed' && observation.reviewed !== true) {
    return Object.freeze({
      obligation_id: obligationId,
      state: 'claimed_breach',
      remedy_authority_effect: 'none',
      reason: 'breach_claim_requires_review'
    });
  }

  if (status === 'disputed') {
    return Object.freeze({
      obligation_id: obligationId,
      state: 'in_dispute',
      remedy_authority_effect: 'none',
      reason: 'dispute_blocks_automatic_remedy'
    });
  }

  return Object.freeze({
    obligation_id: obligationId,
    state: status,
    evidence_refs: Object.freeze([...evidenceRefs]),
    remedy_authority_effect: 'none'
  });
}

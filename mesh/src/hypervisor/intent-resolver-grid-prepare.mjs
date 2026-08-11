import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import { signedFetch } from '../lib/client.mjs';
import {
  buildExternalEffectPreparedEvent
} from '../lib/external-effect-outbox.mjs';
import {
  buildResolvedIntentPreparedRepositoryDocsEffect,
  buildResolvedIntentTargetAuthorization,
  verifyResolvedIntentPreparedRepositoryDocsEffect
} from '../lib/intent-resolver-prepared-effect.mjs';

export const INTENT_RESOLVER_GRID_PREPARATION_SCHEMA =
  'axiom-intent-resolver-grid-preparation.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

function id(value, name, max = 192) {
  return assertString(value, name, { min: 1, max, pattern: ID });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function requireHypervisor(identity) {
  if (!identity?.keyId?.startsWith('hypervisor:') || typeof identity.signObject !== 'function') {
    throw new ValidationError('Grid-backed resolver preparation requires Hypervisor identity');
  }
  return identity;
}

function normalizedGridUrl(value) {
  const url = new URL(assertString(value, 'gridUrl', { min: 1, max: 2048 }));
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ValidationError('Grid URL must use http or https');
  }
  return url.toString().replace(/\/$/, '');
}

function requireExactApprovalId(request, approvalId) {
  const ids = Array.isArray(request?.approval_ids) ? request.approval_ids : [];
  if (ids.length !== 1 || ids[0] !== approvalId) {
    throw new ValidationError('resolved target request must name exactly the Grid approval being consumed');
  }
}

function approvalConsumedEvent(approval, intentId) {
  return {
    kind: 'approval.consumed',
    subject: id(approval.approval_id, 'approval_id'),
    payload: {
      approval_id: approval.approval_id,
      intent_id: id(intentId, 'intent_id', 160),
      approver: id(approval.approver, 'approval.approver', 160)
    }
  };
}

function verifyAppendedEvent(raw, expected, index) {
  const event = assertPlainObject(raw, `Grid appended event[${index}]`);
  if (event.kind !== expected.kind || event.subject !== expected.subject) {
    throw new ValidationError('Grid appended event does not match requested transition');
  }
  if (digest(event.payload_digest, 'Grid event payload_digest') !== digestObject(expected.payload)) {
    throw new ValidationError('Grid appended event payload digest does not match requested transition');
  }
  id(event.event_id, 'Grid event_id');
  digest(event.event_hash, 'Grid event_hash');
  if (!Number.isSafeInteger(event.seq) || event.seq <= 0) {
    throw new ValidationError('Grid appended event sequence is invalid');
  }
  return event;
}

function verifyAtomicCommitEvidence(response, expectedEvents) {
  const value = assertPlainObject(response, 'Grid commit response');
  if (!Array.isArray(value.events) || value.events.length !== expectedEvents.length) {
    throw new ValidationError('Grid atomic resolver preparation returned unexpected event count');
  }
  const events = value.events.map((event, index) => (
    verifyAppendedEvent(event, expectedEvents[index], index)
  ));
  for (let index = 1; index < events.length; index += 1) {
    if (events[index].seq !== events[index - 1].seq + 1) {
      throw new ValidationError('Grid atomic resolver preparation events are not contiguous');
    }
    if (events[index].prev_hash !== events[index - 1].event_hash) {
      throw new ValidationError('Grid atomic resolver preparation events are not hash-linked');
    }
  }
  return events;
}

/**
 * Hypervisor-only preparation coordinator.
 *
 * The approval record is fetched over the existing signed Hypervisor -> Grid
 * service channel. The approval consumption and external.effect.prepared event
 * are then submitted in one Grid commit, so a concurrent/replayed approval
 * failure rolls the entire preparation transition back.
 *
 * This function prepares durable state only. It does not call the repository
 * operator and does not execute an external effect.
 */
export async function prepareResolvedRepositoryEffectWithGridApproval({
  identity,
  gridUrl,
  traceId,
  approval_id,
  handoff,
  resolution,
  eligibility,
  operatorPublicKey,
  policy,
  principal,
  request,
  intent_id,
  machine_authority_digest = null,
  one_use_nonce,
  prepared_at = new Date().toISOString(),
  expires_at
}) {
  const hypervisor = requireHypervisor(identity);
  const base = normalizedGridUrl(gridUrl);
  const approvalId = id(approval_id, 'approval_id');
  const targetRequest = assertPlainObject(request, 'resolved target request');
  requireExactApprovalId(targetRequest, approvalId);

  const approval = await signedFetch(
    hypervisor,
    'grid',
    `${base}/internal/v1/approval/${encodeURIComponent(approvalId)}`,
    { traceId }
  );

  const authorization = buildResolvedIntentTargetAuthorization({
    identity: hypervisor,
    handoff,
    resolution,
    eligibility,
    operatorPublicKey,
    policy,
    principal,
    request: targetRequest,
    approval,
    now: prepared_at
  });
  const binding = buildResolvedIntentPreparedRepositoryDocsEffect({
    identity: hypervisor,
    authorization,
    handoff,
    resolution,
    eligibility,
    operatorPublicKey,
    policy,
    principal,
    request: targetRequest,
    approval,
    intent_id,
    machine_authority_digest,
    one_use_nonce,
    prepared_at,
    expires_at
  });
  const preparedEvent = buildExternalEffectPreparedEvent(binding.prepared_effect);
  const consumedEvent = approvalConsumedEvent(approval, intent_id);
  const expectedEvents = [consumedEvent, preparedEvent];

  let committed;
  try {
    committed = await signedFetch(
      hypervisor,
      'grid',
      `${base}/internal/v1/commit`,
      {
        method: 'POST',
        traceId,
        body: {
          actor: id(principal?.id, 'principal.id', 160),
          principal: id(principal?.id, 'principal.id', 160),
          events: expectedEvents
        }
      }
    );
  } catch (error) {
    if (error?.code === 'approval_unavailable') {
      throw new AxiomError(
        'resolver_approval_unavailable',
        'The resolved-target approval was already consumed, expired, or unavailable; no external effect was prepared.',
        409,
        { approval_id: approvalId }
      );
    }
    throw error;
  }

  const gridEvents = verifyAtomicCommitEvidence(committed, expectedEvents);
  const verifiedBinding = verifyResolvedIntentPreparedRepositoryDocsEffect(binding, {
    authorization,
    handoff,
    resolution,
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey,
    policy,
    principal,
    request: targetRequest,
    approval,
    now: prepared_at
  });

  return {
    schema: INTENT_RESOLVER_GRID_PREPARATION_SCHEMA,
    approval_id: approvalId,
    approval_consumed_event: gridEvents[0],
    prepared_event: gridEvents[1],
    authorization,
    binding: verifiedBinding,
    effect_id: verifiedBinding.prepared_effect.effect_id,
    effect_digest: verifiedBinding.prepared_effect.effect_digest,
    durable_preparation_observed: true,
    approval_consumed_observed: true,
    external_effect_executed: false,
    merge_performed: false,
    non_claim: 'Grid durably consumed one approval and recorded one prepared effect atomically. The repository operator has not been called and no external effect has executed.'
  };
}

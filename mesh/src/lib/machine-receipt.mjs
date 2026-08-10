import {
  AxiomError,
  ValidationError,
  digestObject
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';

export const MACHINE_INTENT_RECEIPT_SCHEMA = 'axiom-machine-intent-receipt.v1';
export const MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA = 'axiom-machine-intent-receipt-statement.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const TERMINAL_STATUS = new Set(['completed', 'denied', 'failed']);

export function buildMachineIntentReceipt({
  intent,
  events,
  chain,
  identity,
  kernelVersion
}) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    throw new ValidationError('Machine receipt intent is invalid');
  }
  if (!TERMINAL_STATUS.has(intent.status)) {
    throw new AxiomError(
      'receipt_not_ready',
      'Intent has not reached a terminal evidence state',
      409
    );
  }
  if (!Array.isArray(events)) {
    throw new ValidationError('Machine receipt events are invalid');
  }
  if (!chain?.valid) {
    throw new AxiomError(
      'integrity_verification_failed',
      'Grid evidence chain is not currently verifiable',
      503
    );
  }
  if (!identity || typeof identity.signObject !== 'function') {
    throw new ValidationError('Machine receipt requires a signing identity');
  }
  if (typeof kernelVersion !== 'string' || !kernelVersion.length) {
    throw new ValidationError('Machine receipt requires a kernel version');
  }

  const acceptedEvents = events.filter(event => event.kind === 'intent.accepted');
  const terminalKind = `intent.${intent.status}`;
  const terminalEvents = events.filter(event => event.kind === terminalKind);
  if (acceptedEvents.length !== 1 || terminalEvents.length !== 1 || events.length !== 2) {
    throw new AxiomError(
      'receipt_evidence_incomplete',
      'Intent receipt requires exactly one accepted and one terminal event',
      409
    );
  }
  const accepted = acceptedEvents[0];
  const terminal = terminalEvents[0];
  if (
    accepted.seq >= terminal.seq
    || accepted.subject !== intent.intent_id
    || terminal.subject !== intent.intent_id
    || accepted.actor !== intent.principal
    || terminal.actor !== intent.principal
    || accepted.trace_id !== intent.trace_id
    || terminal.trace_id !== intent.trace_id
  ) {
    throw new AxiomError(
      'receipt_evidence_mismatch',
      'Intent receipt event identity does not match the materialized intent',
      409
    );
  }

  const acceptedPayload = accepted.payload;
  if (
    acceptedPayload?.intent_id !== intent.intent_id
    || acceptedPayload?.principal !== intent.principal
    || acceptedPayload?.action !== intent.action
    || acceptedPayload?.input_digest !== intent.input_digest
    || acceptedPayload?.request_digest !== intent.request_digest
    || !DIGEST.test(acceptedPayload?.invocation_digest ?? '')
    || !DIGEST.test(acceptedPayload?.machine_authority?.authority_digest ?? '')
  ) {
    throw new AxiomError(
      'receipt_evidence_mismatch',
      'Accepted intent evidence does not match the materialized machine intent',
      409
    );
  }
  if (terminal.payload?.intent_id !== intent.intent_id) {
    throw new AxiomError(
      'receipt_evidence_mismatch',
      'Terminal intent evidence does not match the materialized intent',
      409
    );
  }

  const outcome = terminalOutcome(intent, terminal.payload, acceptedPayload);
  const statement = {
    schema: MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA,
    kernel_version: kernelVersion,
    intent: {
      intent_id: intent.intent_id,
      trace_id: intent.trace_id,
      principal: intent.principal,
      action: intent.action,
      risk: intent.risk,
      status: intent.status,
      input_digest: intent.input_digest,
      request_digest: intent.request_digest,
      created_at: intent.created_at,
      updated_at: intent.updated_at
    },
    authority: {
      invocation_digest: acceptedPayload.invocation_digest,
      machine_authority_digest: acceptedPayload.machine_authority.authority_digest
    },
    outcome,
    evidence_events: [accepted, terminal].map(eventAnchor),
    chain: chainAnchor(chain),
    verification: {
      owner_bound: true,
      request_bound: true,
      terminal_bound: true,
      event_signatures_and_hashes_verified: true,
      chain_verified: true
    }
  };
  const attestation = identity.signObject(statement);
  const envelope = {
    schema: MACHINE_INTENT_RECEIPT_SCHEMA,
    statement,
    attestation
  };
  return {
    ...envelope,
    receipt_digest: digestObject(envelope)
  };
}

export function validateMachineIntentReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new ValidationError('Machine intent receipt must be an object');
  }
  if (receipt.schema !== MACHINE_INTENT_RECEIPT_SCHEMA) {
    throw new ValidationError('Machine intent receipt schema is invalid');
  }
  if (receipt.statement?.schema !== MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA) {
    throw new ValidationError('Machine intent receipt statement schema is invalid');
  }
  if (!DIGEST.test(receipt.receipt_digest ?? '')) {
    throw new ValidationError('Machine intent receipt digest is invalid');
  }
  const { receipt_digest: _receiptDigest, ...envelope } = receipt;
  if (digestObject(envelope) !== receipt.receipt_digest) {
    throw new ValidationError('Machine intent receipt digest does not match the envelope');
  }
  if (receipt.verification !== undefined) {
    throw new ValidationError('Machine intent receipt verification facts must be statement-bound');
  }
  return receipt;
}

export function verifyMachineIntentReceipt(receipt, gridPublicKey) {
  validateMachineIntentReceipt(receipt);
  if (!gridPublicKey) throw new ValidationError('Grid verification key is required');
  return {
    valid: verifyObjectSignature(receipt.statement, receipt.attestation, gridPublicKey),
    receipt_digest: receipt.receipt_digest,
    intent_id: receipt.statement.intent.intent_id,
    status: receipt.statement.intent.status,
    verification_mode: receipt.statement.chain.verification_mode,
    prefix_assurance: receipt.statement.chain.prefix_assurance
  };
}

function terminalOutcome(intent, payload, acceptedPayload) {
  if (intent.status === 'completed') {
    if (!intent.result_json || !payload?.result) {
      throw new AxiomError('receipt_evidence_incomplete', 'Completed intent result evidence is missing', 409);
    }
    const materializedDigest = digestObject(intent.result_json);
    const eventDigest = digestObject(payload.result);
    if (materializedDigest !== eventDigest) {
      throw new AxiomError('receipt_evidence_mismatch', 'Completed intent result does not match terminal evidence', 409);
    }
    if (
      payload.result.evidence?.invocation_digest !== acceptedPayload.invocation_digest
      || payload.result.evidence?.machine_authority_digest
        !== acceptedPayload.machine_authority.authority_digest
    ) {
      throw new AxiomError('receipt_evidence_mismatch', 'Completed result authority evidence does not match acceptance', 409);
    }
    return {
      kind: 'intent.completed',
      result_digest: materializedDigest,
      terminal_payload_digest: eventDigest
    };
  }

  if (!intent.error_json || !payload?.error) {
    throw new AxiomError('receipt_evidence_incomplete', 'Terminal intent error evidence is missing', 409);
  }
  const materializedDigest = digestObject(intent.error_json);
  const eventDigest = digestObject(payload.error);
  if (materializedDigest !== eventDigest) {
    throw new AxiomError('receipt_evidence_mismatch', 'Intent error does not match terminal evidence', 409);
  }
  return {
    kind: `intent.${intent.status}`,
    error_digest: materializedDigest,
    terminal_payload_digest: digestObject(payload)
  };
}

function eventAnchor(event) {
  if (
    !Number.isSafeInteger(event.seq)
    || event.seq < 1
    || !DIGEST.test(event.payload_digest ?? '')
    || !DIGEST.test(event.event_hash ?? '')
    || typeof event.signature?.key_id !== 'string'
  ) {
    throw new AxiomError('receipt_evidence_mismatch', 'Intent event anchor is invalid', 409);
  }
  return {
    seq: event.seq,
    event_id: event.event_id,
    kind: event.kind,
    occurred_at: event.occurred_at,
    payload_digest: event.payload_digest,
    event_hash: event.event_hash,
    signer_key_id: event.signature.key_id
  };
}

function chainAnchor(chain) {
  if (!DIGEST.test(chain.head ?? '')) {
    throw new AxiomError('receipt_evidence_mismatch', 'Grid verification head is invalid', 409);
  }
  return {
    valid: true,
    head: chain.head,
    events: chain.events,
    verification_mode: chain.verification_mode,
    prefix_assurance: chain.prefix_assurance,
    verified_events: chain.verified_events,
    verified_from_seq: chain.verified_from_seq,
    verified_through_seq: chain.verified_through_seq,
    checkpoint_count: chain.checkpoint_count,
    checkpoint_seq: chain.checkpoint_seq,
    full_verification_required_for_checkpointed_prefix_revalidation:
      chain.full_verification_required_for_checkpointed_prefix_revalidation
  };
}

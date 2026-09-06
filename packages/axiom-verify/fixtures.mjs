import { digestObject } from './canonical.mjs';
import { generateEd25519Identity, signObject } from './crypto.mjs';
import {
  MACHINE_INTENT_RECEIPT_SCHEMA,
  MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA
} from './schemas.mjs';

/**
 * Build a signed machine-receipt-like fixture for offline Verify tests.
 * Not a Mesh authority client; fixture-only helper for the experimental scaffold.
 */
export function createSignedReceiptFixture(overrides = {}) {
  const identity = overrides.identity ?? generateEd25519Identity('grid');
  const intentId = overrides.intent_id ?? `intent_${'a'.repeat(64)}`;
  const statement = {
    schema: MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA,
    kernel_version: overrides.kernel_version ?? '0.12.0-dev.3',
    intent: {
      intent_id: intentId,
      trace_id: overrides.trace_id ?? 'trace.verify-fixture',
      principal: overrides.principal ?? 'agent.verify-fixture',
      action: overrides.action ?? 'system.echo',
      risk: 'low',
      status: overrides.status ?? 'completed',
      input_digest: '1'.repeat(64),
      request_digest: '2'.repeat(64),
      created_at: '2026-09-05T00:00:00.000Z',
      updated_at: '2026-09-05T00:00:01.000Z'
    },
    authority: {
      invocation_digest: '3'.repeat(64),
      machine_authority_digest: '4'.repeat(64)
    },
    outcome: {
      kind: 'intent.completed',
      result_digest: '5'.repeat(64),
      terminal_payload_digest: '6'.repeat(64)
    },
    evidence_events: [
      {
        seq: 10,
        event_id: 'evt.accepted',
        kind: 'intent.accepted',
        occurred_at: '2026-09-05T00:00:00.000Z',
        payload_digest: '7'.repeat(64),
        event_hash: '8'.repeat(64),
        signer_key_id: identity.keyId
      },
      {
        seq: 11,
        event_id: 'evt.terminal',
        kind: 'intent.completed',
        occurred_at: '2026-09-05T00:00:01.000Z',
        payload_digest: '9'.repeat(64),
        event_hash: 'a'.repeat(64),
        signer_key_id: identity.keyId
      }
    ],
    chain: {
      valid: true,
      head: 'b'.repeat(64),
      events: 11,
      verification_mode: 'checkpoint',
      prefix_assurance: 'signed_checkpoint',
      verified_events: 1,
      verified_from_seq: 11,
      verified_through_seq: 11,
      checkpoint_count: 1,
      checkpoint_seq: 10,
      full_verification_required_for_checkpointed_prefix_revalidation: true
    },
    verification: {
      owner_bound: true,
      request_bound: true,
      terminal_bound: true,
      event_signatures_and_hashes_verified: true,
      chain_verified: true
    }
  };

  const attestation = signObject(statement, identity);
  const envelope = {
    schema: MACHINE_INTENT_RECEIPT_SCHEMA,
    statement,
    attestation
  };
  const receipt = {
    ...envelope,
    receipt_digest: digestObject(envelope)
  };

  return {
    identity,
    publicKeyPem: identity.publicPem,
    receipt
  };
}

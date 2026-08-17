import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  AgentTestSessionLifecycleLedger,
  restoreAgentTestSessionLifecycleLedger,
  verifyAgentTestSessionLifecycleEvent
} from '../src/lib/agent-test-session-lifecycle.mjs';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function authorization() {
  return {
    schema: 'axiom-agent-test-session-authorization.v1',
    authorization_id: 'session-auth:key-binding:001',
    repository: 'Zoverions/AXIOM-MESH',
    sponsor: { type: 'human', id: 'sponsor:key-binding', approval_ref: 'approval:issue:1112' },
    subject: { type: 'machine', id: 'agent:key-binding' },
    challenge: {
      challenge_id: 'infra:key-binding:test',
      offer_id: 'offer:key-binding:test',
      node_profile_sha256: 'a'.repeat(64)
    },
    attestation: {
      attestation_id: 'attestation:key-binding:001',
      key_fingerprint_sha256: 'b'.repeat(64)
    },
    timing: {
      issued_at: '2026-08-18T12:00:00.000Z',
      not_before: '2026-08-18T12:01:00.000Z',
      expires_at: '2026-08-18T12:06:00.000Z',
      maximum_duration_seconds: 300
    },
    scope: {
      allowed_operations: ['run-tests'],
      network: { mode: 'none', allowed_origins: [] },
      filesystem_scope: 'disposable-workspace-only',
      credentials_allowed: false,
      secret_access_allowed: false,
      interactive_shell_allowed: false,
      unbounded_remote_shell_allowed: false
    },
    revocation: {
      revocable: true,
      one_time: true,
      fail_closed_on_unknown: true,
      revocation_ref: 'revocation:key-binding:001'
    },
    effects: {
      effect_reachable: false,
      production_enrollment: false,
      persistent_remote_administration: false,
      credentials_issued: false,
      secrets_accessed: false,
      firmware_changed: false,
      boot_chain_changed: false,
      purchase_performed: false,
      destructive_action_performed: false,
      permanent_system_mutation: false,
      deployment_authority: false,
      capability_promoted: false
    }
  };
}

test('lifecycle evidence cannot be verified or restored under a substituted ledger key', () => {
  const original = keys();
  const substitute = keys();
  const ledger = new AgentTestSessionLifecycleLedger({
    ledgerId: 'session-ledger:key-binding:001',
    ledgerPrivateKey: original.privateKey
  });
  const issued = ledger.issue(authorization(), {
    eventId: 'event:key-binding:issued',
    occurredAt: '2026-08-18T12:00:00.000Z',
    now: new Date('2026-08-18T12:01:00.000Z')
  });

  assert.throws(
    () => verifyAgentTestSessionLifecycleEvent(issued.event, {
      trustedLedgerPublicKey: substitute.publicKey
    }),
    /ledger key does not match|signature is invalid/
  );

  const transcript = ledger.exportTranscript();
  assert.throws(
    () => restoreAgentTestSessionLifecycleLedger(transcript, {
      ledgerPrivateKey: substitute.privateKey
    }),
    /ledger key does not match|signature is invalid|restore key/
  );

  const restored = restoreAgentTestSessionLifecycleLedger(transcript, {
    ledgerPrivateKey: original.privateKey
  });
  assert.equal(restored.status, 'issued');
});

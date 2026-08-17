import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  AgentTestSessionLifecycleLedger,
  restoreAgentTestSessionLifecycleLedger,
  verifyAgentTestSessionLifecycleEvent,
  verifyAgentTestSessionLifecycleReceipt,
  verifyAgentTestSessionLifecycleTranscript
} from '../src/lib/agent-test-session-lifecycle.mjs';

const NOW = new Date('2026-08-18T12:05:00.000Z');
const PROFILE_SHA = 'b'.repeat(64);
const KEY_SHA = 'c'.repeat(64);

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
    authorization_id: 'session-auth:lifecycle:001',
    repository: 'Zoverions/AXIOM-MESH',
    sponsor: { type: 'human', id: 'sponsor:lifecycle-human', approval_ref: 'approval:issue:1112' },
    subject: { type: 'machine', id: 'agent:lifecycle-runtime' },
    challenge: {
      challenge_id: 'infra:lifecycle:test',
      offer_id: 'offer:lifecycle:test-node',
      node_profile_sha256: PROFILE_SHA
    },
    attestation: {
      attestation_id: 'attestation:lifecycle:001',
      key_fingerprint_sha256: KEY_SHA
    },
    timing: {
      issued_at: '2026-08-18T12:04:00.000Z',
      not_before: '2026-08-18T12:05:00.000Z',
      expires_at: '2026-08-18T12:10:00.000Z',
      maximum_duration_seconds: 300
    },
    scope: {
      allowed_operations: ['read-system-facts', 'run-tests'],
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
      revocation_ref: 'revocation:session-auth:lifecycle:001'
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

function ledger() {
  const key = keys();
  return {
    key,
    ledger: new AgentTestSessionLifecycleLedger({
      ledgerId: 'session-ledger:lifecycle:001',
      ledgerPrivateKey: key.privateKey
    })
  };
}

function issue(lab) {
  return lab.ledger.issue(authorization(), {
    eventId: 'event:lifecycle:issued',
    occurredAt: '2026-08-18T12:04:00.000Z',
    now: NOW
  });
}

test('signed lifecycle chain records one-time consumption and completion without remote effect claims', () => {
  const lab = ledger();
  const issued = issue(lab);
  const consumed = lab.ledger.consume({
    eventId: 'event:lifecycle:consumed',
    occurredAt: '2026-08-18T12:05:30.000Z',
    revocationState: 'active'
  });
  const completed = lab.ledger.complete({
    eventId: 'event:lifecycle:completed',
    occurredAt: '2026-08-18T12:06:30.000Z'
  });
  assert.equal(issued.lifecycle_status, 'issued');
  assert.equal(consumed.lifecycle_status, 'consumed');
  assert.equal(completed.lifecycle_status, 'completed');
  assert.equal(lab.ledger.terminal, true);

  for (const item of [issued.event, consumed.event, completed.event]) {
    const checked = verifyAgentTestSessionLifecycleEvent(item, {
      trustedLedgerPublicKey: lab.ledger.ledgerPublicKey
    });
    assert.equal(checked.valid, true);
    assert.equal(checked.statement.effect_reachable, false);
    assert.equal(checked.statement.remote_effect_observed, false);
    assert.equal(checked.statement.task_success_claimed, false);
    assert.equal(checked.statement.production_authority, false);
    assert.equal(checked.statement.capability_promoted, false);
  }

  const transcript = lab.ledger.exportTranscript();
  const checkedTranscript = verifyAgentTestSessionLifecycleTranscript(transcript, {
    trustedLedgerPublicKey: lab.ledger.ledgerPublicKey
  });
  assert.equal(checkedTranscript.status, 'completed');
  assert.equal(checkedTranscript.event_count, 3);

  const receipt = lab.ledger.receipt({ generatedAt: '2026-08-18T12:07:00.000Z' });
  const checkedReceipt = verifyAgentTestSessionLifecycleReceipt(receipt, {
    trustedLedgerPublicKey: lab.ledger.ledgerPublicKey,
    transcript
  });
  assert.equal(checkedReceipt.statement.executor_receipt_present, false);
  assert.equal(checkedReceipt.statement.task_success_claimed, false);
  assert.equal(checkedReceipt.statement.production_persistence_claimed, false);
});

test('consumption fails closed on unknown revocation and revoked authorization cannot be consumed', () => {
  const lab = ledger();
  issue(lab);
  assert.throws(() => lab.ledger.consume({
    eventId: 'event:lifecycle:unknown-revocation',
    occurredAt: '2026-08-18T12:05:30.000Z'
  }), /known active revocation state/);
  lab.ledger.revoke({
    eventId: 'event:lifecycle:revoked',
    occurredAt: '2026-08-18T12:05:40.000Z'
  });
  assert.throws(() => lab.ledger.consume({
    eventId: 'event:lifecycle:after-revoke',
    occurredAt: '2026-08-18T12:05:50.000Z',
    revocationState: 'active'
  }), /transition revoked -> consumed is not allowed/);
});

test('expiry is terminal and cannot be manufactured before authorization expiry', () => {
  const lab = ledger();
  issue(lab);
  assert.throws(() => lab.ledger.expire({
    eventId: 'event:lifecycle:early-expiry',
    occurredAt: '2026-08-18T12:09:59.000Z'
  }), /expiry cannot precede/);
  lab.ledger.expire({
    eventId: 'event:lifecycle:expired',
    occurredAt: '2026-08-18T12:10:00.000Z'
  });
  assert.equal(lab.ledger.status, 'expired');
  assert.throws(() => lab.ledger.consume({
    eventId: 'event:lifecycle:after-expiry',
    occurredAt: '2026-08-18T12:10:01.000Z',
    revocationState: 'active'
  }));
});

test('exact event replay is idempotent while conflicting reuse and double consumption fail', () => {
  const lab = ledger();
  issue(lab);
  const first = lab.ledger.consume({
    eventId: 'event:lifecycle:one-use',
    occurredAt: '2026-08-18T12:05:30.000Z',
    revocationState: 'active'
  });
  const replay = lab.ledger.consume({
    eventId: 'event:lifecycle:one-use',
    occurredAt: '2026-08-18T12:05:30.000Z',
    revocationState: 'active'
  });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.event.event_digest, first.event.event_digest);
  assert.throws(() => lab.ledger.consume({
    eventId: 'event:lifecycle:one-use',
    occurredAt: '2026-08-18T12:05:31.000Z',
    revocationState: 'active'
  }), /reused with conflicting content/);
  assert.throws(() => lab.ledger.consume({
    eventId: 'event:lifecycle:second-consume',
    occurredAt: '2026-08-18T12:05:40.000Z',
    revocationState: 'active'
  }), /transition consumed -> consumed is not allowed/);
});

test('interruption remains terminal evidence and cannot be rewritten as completion', () => {
  const lab = ledger();
  issue(lab);
  lab.ledger.consume({
    eventId: 'event:lifecycle:consume-interrupt',
    occurredAt: '2026-08-18T12:05:30.000Z',
    revocationState: 'active'
  });
  lab.ledger.interrupt({
    eventId: 'event:lifecycle:interrupt',
    occurredAt: '2026-08-18T12:06:00.000Z',
    reasonCode: 'uncertain-state'
  });
  assert.equal(lab.ledger.status, 'interrupted');
  assert.throws(() => lab.ledger.complete({
    eventId: 'event:lifecycle:false-complete',
    occurredAt: '2026-08-18T12:06:30.000Z'
  }), /transition interrupted -> completed is not allowed/);
});

test('portable transcript restores consumed state and preserves one-time evidence across restart', () => {
  const lab = ledger();
  issue(lab);
  lab.ledger.consume({
    eventId: 'event:lifecycle:restart-consumed',
    occurredAt: '2026-08-18T12:05:30.000Z',
    revocationState: 'active'
  });
  const restored = restoreAgentTestSessionLifecycleLedger(lab.ledger.exportTranscript(), {
    ledgerPrivateKey: lab.key.privateKey
  });
  assert.equal(restored.status, 'consumed');
  assert.throws(() => restored.consume({
    eventId: 'event:lifecycle:restart-double-consume',
    occurredAt: '2026-08-18T12:05:40.000Z',
    revocationState: 'active'
  }), /transition consumed -> consumed is not allowed/);
  restored.interrupt({
    eventId: 'event:lifecycle:restart-interrupted',
    occurredAt: '2026-08-18T12:06:00.000Z',
    reasonCode: 'process-restarted'
  });
  assert.equal(restored.status, 'interrupted');
});

test('transcript tampering, reordering, predecessor substitution, and binding drift fail closed', () => {
  const lab = ledger();
  issue(lab);
  lab.ledger.consume({
    eventId: 'event:lifecycle:tamper-consumed',
    occurredAt: '2026-08-18T12:05:30.000Z',
    revocationState: 'active'
  });
  const transcript = lab.ledger.exportTranscript();
  for (const mutate of [
    value => { value.events[1].statement.authorization_digest = 'd'.repeat(64); },
    value => { value.events[1].statement.sponsor_id = 'sponsor:substituted'; },
    value => { value.events[1].statement.previous_event_digest = 'e'.repeat(64); },
    value => { value.events[1].statement.occurred_at = '2026-08-18T12:03:00.000Z'; },
    value => { value.events.reverse(); }
  ]) {
    const changed = structuredClone(transcript);
    mutate(changed);
    assert.throws(() => verifyAgentTestSessionLifecycleTranscript(changed, {
      trustedLedgerPublicKey: lab.ledger.ledgerPublicKey
    }));
  }
});

test('separately retained signed head receipt detects suffix truncation', () => {
  const lab = ledger();
  issue(lab);
  lab.ledger.consume({
    eventId: 'event:lifecycle:truncate-consumed',
    occurredAt: '2026-08-18T12:05:30.000Z',
    revocationState: 'active'
  });
  const full = lab.ledger.exportTranscript();
  const receipt = lab.ledger.receipt({ generatedAt: '2026-08-18T12:06:00.000Z' });
  const prefixBody = {
    schema: full.schema,
    ledger_id: full.ledger_id,
    ledger_key_id: full.ledger_key_id,
    events: [full.events[0]],
    production_persistence_claimed: false
  };
  const prefix = { ...prefixBody, transcript_digest: digestObject(prefixBody) };
  assert.equal(verifyAgentTestSessionLifecycleTranscript(prefix, {
    trustedLedgerPublicKey: lab.ledger.ledgerPublicKey
  }).status, 'issued');
  assert.throws(() => verifyAgentTestSessionLifecycleReceipt(receipt, {
    trustedLedgerPublicKey: lab.ledger.ledgerPublicKey,
    transcript: prefix
  }), /does not bind the exact transcript head/);
});

test('receipt tampering cannot claim effects, task success, persistence, authority, or promotion', () => {
  const lab = ledger();
  issue(lab);
  const receipt = lab.ledger.receipt({ generatedAt: '2026-08-18T12:05:00.000Z' });
  for (const key of [
    'effect_reachable', 'remote_effect_observed', 'executor_receipt_present',
    'task_success_claimed', 'production_enrollment', 'credentials_issued',
    'secrets_accessed', 'firmware_changed', 'purchase_performed',
    'destructive_action_performed', 'deployment_authority', 'capability_promoted',
    'production_persistence_claimed'
  ]) {
    const changed = structuredClone(receipt);
    changed.statement[key] = true;
    assert.throws(() => verifyAgentTestSessionLifecycleReceipt(changed, {
      trustedLedgerPublicKey: lab.ledger.ledgerPublicKey
    }), /attempts to elevate|statement digest/);
  }
});

import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson, sha256 } from '../../src/lib/canonical.mjs';
import { compileAgentExecutorDryRunPlan } from '../../src/lib/agent-executor-dry-run.mjs';
import { AgentExecutorDurableStateStore } from '../../src/lib/agent-executor-durable-state.mjs';
import { AgentTestSessionLifecycleLedger } from '../../src/lib/agent-test-session-lifecycle.mjs';

export const DURABLE_STORE_ID = 'executor-durable:test-store';
const PROFILE_SHA = 'b'.repeat(64);
const BASE_SHA = 'a'.repeat(40);
const NONCE = 'challenge_nonce_durable_0123456789';
const NOW = new Date('2026-08-18T12:05:00.000Z');

export function durableKeyPair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function offer() {
  return {
    schema: 'axiom-agent-infrastructure-offer.v1',
    offer_id: 'offer:durable:test-node',
    repository: 'Zoverions/AXIOM-MESH',
    publisher: { type: 'human', id: 'contributor:durable' },
    node_profile: {
      schema: 'axiom-compute-node-profile.v1',
      profile_id: 'node:durable:test-node',
      profile_sha256: PROFILE_SHA
    },
    custody: { physical_control: 'contributor', remote_access_available: false },
    availability: {
      starts_at: '2026-08-18T11:00:00.000Z',
      expires_at: '2026-08-18T13:00:00.000Z',
      maximum_sessions: 4
    },
    challenge_classes: ['hardware-validation'],
    evidence: { fact_status: 'declared', evidence_refs: [] },
    boundaries: {
      destructive_actions_allowed: false,
      production_enrollment_allowed: false,
      credential_issuance_allowed: false,
      secret_access_allowed: false,
      firmware_changes_allowed: false,
      purchases_allowed: false,
      authority_granted: false,
      payment_promised: false
    }
  };
}

function challenge() {
  return {
    schema: 'axiom-agent-infrastructure-challenge.v1',
    challenge_id: 'infra:durable:state-lab',
    repository: 'Zoverions/AXIOM-MESH',
    base_sha: BASE_SHA,
    class: 'hardware-validation',
    target: { offer_id: 'offer:durable:test-node', node_profile_sha256: PROFILE_SHA },
    plan: {
      allowed_operations: ['read-system-facts'],
      prohibited_operations: [
        'production-node-enrollment', 'credential-issuance', 'secret-retrieval',
        'firmware-change', 'boot-chain-change', 'disk-erasure', 'purchase-or-subscription',
        'security-boundary-weakening', 'unbounded-remote-shell', 'permanent-system-mutation'
      ],
      network: { mode: 'none', allowed_origins: [], credentials_allowed: false }
    },
    acceptance: ['Persist only executor lifecycle control evidence.'],
    evidence_requirements: ['Return signed local durable-state head evidence.'],
    security_reporting: { public_safe: true, private_route: 'SECURITY.md' },
    boundaries: {
      production_enrollment_allowed: false,
      credential_issuance_allowed: false,
      secret_access_allowed: false,
      firmware_changes_allowed: false,
      purchases_allowed: false,
      destructive_actions_allowed: false,
      authority_granted: false,
      payment_promised: false
    },
    expires_at: '2026-08-18T12:15:00.000Z'
  };
}

function attestation() {
  const pair = generateKeyPairSync('ed25519');
  const publicKeyDer = pair.publicKey.export({ format: 'der', type: 'spki' });
  const statement = {
    attestation_id: 'attestation:durable:001',
    repository: 'Zoverions/AXIOM-MESH',
    offer_id: 'offer:durable:test-node',
    node_profile_sha256: PROFILE_SHA,
    nonce: NONCE,
    issued_at: '2026-08-18T12:00:00.000Z',
    expires_at: '2026-08-18T12:15:00.000Z',
    claims: {
      physical_ownership_verified: false,
      platform_backed_key_verified: false,
      secure_element_verified: false,
      boot_integrity_verified: false,
      external_verifier_confirmed: false
    }
  };
  return {
    schema: 'axiom-agent-device-attestation.v1',
    statement,
    key: {
      algorithm: 'ed25519',
      public_key_spki_der_base64: publicKeyDer.toString('base64'),
      fingerprint_sha256: sha256(publicKeyDer)
    },
    signature_base64: sign(null, Buffer.from(canonicalJson(statement), 'utf8'), pair.privateKey).toString('base64'),
    evidence_refs: ['evidence:key-possession:durable'],
    boundaries: {
      production_enrollment_allowed: false,
      remote_execution_allowed: false,
      credential_issuance_allowed: false,
      secret_access_allowed: false,
      firmware_changes_allowed: false,
      platform_trust_inferred: false,
      authority_granted: false
    }
  };
}

function authorization(deviceAttestation) {
  return {
    schema: 'axiom-agent-test-session-authorization.v1',
    authorization_id: 'session-auth:durable:001',
    repository: 'Zoverions/AXIOM-MESH',
    sponsor: { type: 'human', id: 'sponsor:durable-human', approval_ref: 'approval:issue:1122' },
    subject: { type: 'machine', id: 'agent:durable-runtime' },
    challenge: {
      challenge_id: 'infra:durable:state-lab',
      offer_id: 'offer:durable:test-node',
      node_profile_sha256: PROFILE_SHA
    },
    attestation: {
      attestation_id: deviceAttestation.statement.attestation_id,
      key_fingerprint_sha256: deviceAttestation.key.fingerprint_sha256
    },
    timing: {
      issued_at: '2026-08-18T12:04:00.000Z',
      not_before: '2026-08-18T12:05:00.000Z',
      expires_at: '2026-08-18T12:10:00.000Z',
      maximum_duration_seconds: 300
    },
    scope: {
      allowed_operations: ['read-system-facts'],
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
      revocation_ref: 'revocation:session-auth:durable:001'
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

function platformProfile() {
  return {
    schema: 'axiom-agent-executor-platform-profile.v1',
    profile_id: 'platform:durable:linux-x64',
    operating_system: 'linux',
    architecture: 'x64',
    fact_status: 'measured',
    source_ref: 'evidence:host-facts:durable-001',
    claims: {
      platform_trust_inferred: false,
      secure_boot_verified: false,
      platform_backed_key_verified: false,
      privileged_executor_available: false,
      remote_administration_enabled: false,
      authority_granted: false
    }
  };
}

export function compileDurableFixture() {
  const hardwareOffer = offer();
  const infrastructureChallenge = challenge();
  const deviceAttestation = attestation();
  const sessionAuthorization = authorization(deviceAttestation);
  const lifecycleKeys = durableKeyPair();
  const ledger = new AgentTestSessionLifecycleLedger({
    ledgerId: 'session-ledger:durable:001',
    ledgerPrivateKey: lifecycleKeys.privateKey
  });
  ledger.issue(sessionAuthorization, {
    eventId: 'event:durable:issued',
    occurredAt: '2026-08-18T12:04:00.000Z',
    challenge: infrastructureChallenge,
    offer: hardwareOffer,
    attestation: deviceAttestation,
    expectedNonce: NONCE,
    now: NOW
  });
  const lifecycleTranscript = ledger.exportTranscript();
  const lifecycleReceipt = ledger.receipt({ generatedAt: '2026-08-18T12:04:30.000Z' });
  const plan = compileAgentExecutorDryRunPlan({
    authorization: sessionAuthorization,
    challenge: infrastructureChallenge,
    offer: hardwareOffer,
    attestation: deviceAttestation,
    expectedNonce: NONCE,
    now: NOW,
    lifecycleTranscript,
    lifecycleReceipt,
    trustedLifecycleLedgerPublicKey: ledger.ledgerPublicKey,
    platformProfile: platformProfile()
  });
  return { plan, lifecycleKeys, lifecycleTranscript, lifecycleReceipt };
}

export function durableRequestFor(plan, sequence, observedAt) {
  const step = plan.steps[sequence - 1];
  return {
    request_id: `request:durable:${sequence}`,
    step_sequence: sequence,
    step_id: step.step_id,
    executable_id: step.executable_id,
    arguments: [...step.arguments],
    working_directory: step.working_directory,
    environment_names: ['CI'],
    workspace_path: 'work/session',
    symlink_detected: false,
    network: null,
    resource_usage: {
      processes: step.kind === 'process-template' ? 1 : 0,
      runtime_seconds: step.kind === 'process-template' ? 1 : 0,
      output_bytes: 64,
      memory_mib: step.kind === 'process-template' ? 64 : 0
    },
    observed_at: observedAt
  };
}

export function createDurableStateFixture({ leaseSeconds = 900 } = {}) {
  const compiled = compileDurableFixture();
  const root = mkdtempSync(join(tmpdir(), 'axiom-durable-executor-'));
  const storeKeys = durableKeyPair();
  const clockState = { value: '2026-08-18T12:05:00.000Z' };
  const store = AgentExecutorDurableStateStore.open({
    stateRoot: root,
    storeId: DURABLE_STORE_ID,
    storePrivateKey: storeKeys.privateKey,
    lifecyclePrivateKey: compiled.lifecycleKeys.privateKey,
    plan: compiled.plan,
    initialLifecycleTranscript: compiled.lifecycleTranscript,
    initialLifecycleReceipt: compiled.lifecycleReceipt,
    now: clockState.value,
    leaseSeconds,
    clock: () => clockState.value
  });
  return { ...compiled, root, storeKeys, store, clockState, leaseSeconds };
}

export function reopenDurableState(current, overrides = {}) {
  const next = overrides.now ?? '2026-08-18T12:05:20.000Z';
  current.clockState.value = overrides.clockNow ?? next;
  return AgentExecutorDurableStateStore.open({
    stateRoot: current.root,
    storeId: DURABLE_STORE_ID,
    storePrivateKey: current.storeKeys.privateKey,
    lifecyclePrivateKey: current.lifecycleKeys.privateKey,
    plan: current.plan,
    now: next,
    leaseSeconds: current.leaseSeconds,
    clock: () => current.clockState.value,
    ...overrides
  });
}

export function cleanupDurableState(current) {
  try { current.store?.release(); } catch {}
  rmSync(current.root, { recursive: true, force: true });
}

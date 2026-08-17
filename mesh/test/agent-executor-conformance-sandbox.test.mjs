import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import { compileAgentExecutorDryRunPlan } from '../src/lib/agent-executor-dry-run.mjs';
import {
  AGENT_EXECUTOR_CONFORMANCE_POLICY_DIGEST,
  AgentExecutorConformanceSandbox,
  verifyAgentExecutorConformanceReceipt
} from '../src/lib/agent-executor-conformance-sandbox.mjs';
import { AgentTestSessionLifecycleLedger } from '../src/lib/agent-test-session-lifecycle.mjs';

const PROFILE_SHA = 'b'.repeat(64);
const BASE_SHA = 'a'.repeat(40);
const NONCE = 'challenge_nonce_conformance_0123456789';
const NOW = new Date('2026-08-18T12:05:00.000Z');

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function offer() {
  return {
    schema: 'axiom-agent-infrastructure-offer.v1',
    offer_id: 'offer:conformance:test-node',
    repository: 'Zoverions/AXIOM-MESH',
    publisher: { type: 'human', id: 'contributor:conformance' },
    node_profile: {
      schema: 'axiom-compute-node-profile.v1',
      profile_id: 'node:conformance:test-node',
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

function challenge({ operations, network }) {
  return {
    schema: 'axiom-agent-infrastructure-challenge.v1',
    challenge_id: 'infra:conformance:virtual-sandbox',
    repository: 'Zoverions/AXIOM-MESH',
    base_sha: BASE_SHA,
    class: 'hardware-validation',
    target: { offer_id: 'offer:conformance:test-node', node_profile_sha256: PROFILE_SHA },
    plan: {
      allowed_operations: operations,
      prohibited_operations: [
        'production-node-enrollment',
        'credential-issuance',
        'secret-retrieval',
        'firmware-change',
        'boot-chain-change',
        'disk-erasure',
        'purchase-or-subscription',
        'security-boundary-weakening',
        'unbounded-remote-shell',
        'permanent-system-mutation'
      ],
      network: {
        mode: network.mode,
        allowed_origins: network.allowed_origins,
        credentials_allowed: false
      }
    },
    acceptance: ['Exercise only synthetic executor-conformance effects.'],
    evidence_requirements: ['Return a signed virtual conformance receipt.'],
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
    attestation_id: 'attestation:conformance:001',
    repository: 'Zoverions/AXIOM-MESH',
    offer_id: 'offer:conformance:test-node',
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
    evidence_refs: ['evidence:key-possession:conformance'],
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

function authorization({ operations, network, deviceAttestation }) {
  return {
    schema: 'axiom-agent-test-session-authorization.v1',
    authorization_id: 'session-auth:conformance:001',
    repository: 'Zoverions/AXIOM-MESH',
    sponsor: { type: 'human', id: 'sponsor:conformance-human', approval_ref: 'approval:issue:1119' },
    subject: { type: 'machine', id: 'agent:conformance-runtime' },
    challenge: {
      challenge_id: 'infra:conformance:virtual-sandbox',
      offer_id: 'offer:conformance:test-node',
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
      allowed_operations: operations,
      network,
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
      revocation_ref: 'revocation:session-auth:conformance:001'
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
    profile_id: 'platform:conformance:linux-x64',
    operating_system: 'linux',
    architecture: 'x64',
    fact_status: 'measured',
    source_ref: 'evidence:host-facts:conformance-001',
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

function fixture({
  operations = ['read-system-facts', 'install-test-dependencies', 'collect-sanitized-logs'],
  network = { mode: 'bounded-public-read', allowed_origins: ['https://registry.npmjs.org'] },
  resolutionSnapshot = { 'https://registry.npmjs.org': ['104.16.24.34', '104.16.25.34'] }
} = {}) {
  const hardwareOffer = offer();
  const infrastructureChallenge = challenge({ operations, network });
  const deviceAttestation = attestation();
  const sessionAuthorization = authorization({ operations, network, deviceAttestation });
  const ledgerKeys = keys();
  const ledger = new AgentTestSessionLifecycleLedger({
    ledgerId: 'session-ledger:conformance:001',
    ledgerPrivateKey: ledgerKeys.privateKey
  });
  ledger.issue(sessionAuthorization, {
    eventId: 'event:conformance:issued',
    occurredAt: '2026-08-18T12:04:00.000Z',
    challenge: infrastructureChallenge,
    offer: hardwareOffer,
    attestation: deviceAttestation,
    expectedNonce: NONCE,
    now: NOW
  });
  const compiledLifecycleReceipt = ledger.receipt({ generatedAt: '2026-08-18T12:04:30.000Z' });
  const plan = compileAgentExecutorDryRunPlan({
    authorization: sessionAuthorization,
    challenge: infrastructureChallenge,
    offer: hardwareOffer,
    attestation: deviceAttestation,
    expectedNonce: NONCE,
    now: NOW,
    lifecycleTranscript: ledger.exportTranscript(),
    lifecycleReceipt: compiledLifecycleReceipt,
    trustedLifecycleLedgerPublicKey: ledger.ledgerPublicKey,
    platformProfile: platformProfile()
  });
  const executorKeys = keys();
  const sandbox = new AgentExecutorConformanceSandbox({
    plan,
    lifecycleLedger: ledger,
    compiledLifecycleReceipt,
    trustedLifecycleLedgerPublicKey: ledger.ledgerPublicKey,
    executorId: 'executor:conformance:lab-001',
    executorPrivateKey: executorKeys.privateKey,
    startedAt: '2026-08-18T12:05:00.000Z',
    resolutionSnapshot
  });
  return { plan, ledger, compiledLifecycleReceipt, executorKeys, sandbox, resolutionSnapshot };
}

function requestFor(plan, sequence, observedAt, overrides = {}) {
  const step = plan.steps[sequence - 1];
  const sessionNetwork = step.network_mode === 'session-policy' && plan.network.mode !== 'none'
    ? {
        origin: plan.network.allowed_origins[0],
        method: 'GET',
        resolved_addresses: ['104.16.24.34', '104.16.25.34'],
        redirect_target: null
      }
    : null;
  return {
    request_id: `request:conformance:${sequence}`,
    step_sequence: sequence,
    step_id: step.step_id,
    executable_id: step.executable_id,
    arguments: [...step.arguments],
    working_directory: step.working_directory,
    environment_names: ['CI'],
    workspace_path: 'work/session',
    symlink_detected: false,
    network: sessionNetwork,
    resource_usage: {
      processes: step.kind === 'process-template' ? 1 : 0,
      runtime_seconds: step.kind === 'process-template' ? 1 : 0,
      output_bytes: 64,
      memory_mib: step.kind === 'process-template' ? 64 : 0
    },
    observed_at: observedAt,
    ...overrides
  };
}

function runAll(sandbox, plan) {
  for (let sequence = 1; sequence <= plan.steps.length; sequence += 1) {
    const result = sandbox.admit(requestFor(plan, sequence, `2026-08-18T12:05:${String(sequence * 5).padStart(2, '0')}.000Z`));
    assert.equal(result.decision, 'admitted');
  }
}

test('virtual sandbox consumes lifecycle before first admission and emits a signed no-effect conformance receipt', () => {
  const current = fixture();
  assert.equal(current.ledger.status, 'issued');
  const first = current.sandbox.admit(requestFor(current.plan, 1, '2026-08-18T12:05:05.000Z'));
  assert.equal(first.decision, 'admitted');
  assert.equal(current.ledger.status, 'consumed');

  for (let sequence = 2; sequence <= current.plan.steps.length; sequence += 1) {
    assert.equal(
      current.sandbox.admit(requestFor(current.plan, sequence, `2026-08-18T12:05:${String(sequence * 5).padStart(2, '0')}.000Z`)).decision,
      'admitted'
    );
  }
  current.sandbox.complete({ eventId: 'event:conformance:completed', occurredAt: '2026-08-18T12:06:00.000Z' });
  const receipt = current.sandbox.receipt({ finishedAt: '2026-08-18T12:06:00.000Z' });
  const verified = verifyAgentExecutorConformanceReceipt(receipt, {
    trustedExecutorPublicKey: current.sandbox.executorPublicKey,
    plan: current.plan
  });

  assert.equal(verified.valid, true);
  assert.equal(verified.statement.status, 'completed');
  assert.equal(verified.statement.lifecycle_status, 'completed');
  assert.equal(verified.statement.sandbox_policy_digest, AGENT_EXECUTOR_CONFORMANCE_POLICY_DIGEST);
  assert.equal(verified.statement.virtual_effects_only, true);
  assert.equal(verified.statement.real_effect_observed, false);
  assert.equal(verified.statement.task_success_claimed, false);
  assert.equal(verified.statement.process_spawned, false);
  assert.equal(verified.statement.network_performed, false);
  assert.equal(verified.statement.capability_promoted, false);
  assert.ok(verified.statement.lifecycle_consumption_event_digest);
});

test('sandbox source imports no host process, filesystem, DNS, network, service or remote-shell effect module', async () => {
  const source = await readFile(new URL('../src/lib/agent-executor-conformance-sandbox.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    'node:child_process', 'node:fs', 'node:dns', 'node:http', 'node:https', 'node:net',
    'node:dgram', 'node:tls', 'node:worker_threads', 'spawn(', 'exec(', 'execFile(', 'fetch('
  ]) {
    assert.equal(source.includes(forbidden), false, `virtual sandbox must not contain ${forbidden}`);
  }
});

test('arbitrary executable, PATH poisoning and argv substitution fail closed before lifecycle consumption', () => {
  for (const mutate of [
    request => { request.executable_id = 'arbitrary-shell'; },
    request => { request.environment_names = ['CI', 'PATH']; },
    request => { request.arguments = [...request.arguments, '; rm -rf /']; }
  ]) {
    const current = fixture();
    const request = requestFor(current.plan, 1, '2026-08-18T12:05:05.000Z');
    mutate(request);
    const result = current.sandbox.admit(request);
    assert.equal(result.decision, 'denied');
    assert.equal(current.ledger.status, 'issued');
    const receipt = current.sandbox.receipt({ finishedAt: '2026-08-18T12:05:06.000Z' });
    assert.equal(receipt.statement.status, 'denied');
    assert.equal(receipt.statement.lifecycle_consumption_event_digest, null);
  }
});

test('path traversal, absolute path and synthetic symlink escape fail closed', () => {
  for (const mutate of [
    request => { request.workspace_path = 'work/session/../host'; },
    request => { request.workspace_path = '/etc'; },
    request => { request.symlink_detected = true; }
  ]) {
    const current = fixture();
    const request = requestFor(current.plan, 1, '2026-08-18T12:05:05.000Z');
    mutate(request);
    assert.equal(current.sandbox.admit(request).decision, 'denied');
    assert.equal(current.ledger.status, 'issued');
  }
});

test('network origin substitution and DNS rebinding are denied and interrupt after prior consumption', () => {
  const current = fixture();
  assert.equal(current.sandbox.admit(requestFor(current.plan, 1, '2026-08-18T12:05:05.000Z')).decision, 'admitted');
  assert.equal(current.sandbox.admit(requestFor(current.plan, 2, '2026-08-18T12:05:10.000Z')).decision, 'admitted');
  const networkSequence = current.plan.steps.find(step => step.network_mode === 'session-policy').sequence;
  assert.equal(networkSequence, 3);
  const rebound = requestFor(current.plan, networkSequence, '2026-08-18T12:05:15.000Z');
  rebound.network.resolved_addresses = ['93.184.216.34'];
  const denied = current.sandbox.admit(rebound);
  assert.equal(denied.decision, 'denied');
  assert.equal(denied.observation.reason_code, 'dns-rebinding-detected');
  assert.equal(current.ledger.status, 'interrupted');
  assert.throws(
    () => current.sandbox.complete({ eventId: 'event:illegal:complete', occurredAt: '2026-08-18T12:05:20.000Z' }),
    /terminal/
  );
});

test('public-read snapshots reject local/private addresses and owner-LAN rejects public fallback', () => {
  assert.throws(
    () => fixture({ resolutionSnapshot: { 'https://registry.npmjs.org': ['127.0.0.1'] } }),
    /local\/private address/
  );

  assert.throws(
    () => fixture({
      operations: ['read-system-facts'],
      network: { mode: 'owner-lan', allowed_origins: ['http://192.168.1.10:8080'] },
      resolutionSnapshot: { 'http://192.168.1.10:8080': ['93.184.216.34'] }
    }),
    /public address for owner-LAN/
  );
});

test('credentialed URL shape remains rejected by the compiler without committing credential-shaped fixture text', () => {
  const credentialed = ['https://user', 'runtime-only', '@example.com'].join(':');
  assert.throws(
    () => fixture({
      operations: ['read-system-facts'],
      network: { mode: 'bounded-public-read', allowed_origins: [credentialed] },
      resolutionSnapshot: {}
    }),
    /credentials|origin/
  );
});

test('resource ceilings deny before the virtual effect and preserve one-time lifecycle state', () => {
  const current = fixture();
  const request = requestFor(current.plan, 1, '2026-08-18T12:05:05.000Z');
  request.resource_usage.memory_mib = current.plan.resources.max_memory_mib + 1;
  const denied = current.sandbox.admit(request);
  assert.equal(denied.decision, 'denied');
  assert.equal(denied.observation.reason_code, 'memory-ceiling');
  assert.equal(current.ledger.status, 'issued');
});

test('stale/consumed lifecycle state cannot instantiate a sandbox for an issued plan', () => {
  const current = fixture();
  current.ledger.consume({
    eventId: 'event:conformance:preconsumed',
    occurredAt: '2026-08-18T12:05:01.000Z',
    revocationState: 'active'
  });
  const executorKeys = keys();
  assert.throws(
    () => new AgentExecutorConformanceSandbox({
      plan: current.plan,
      lifecycleLedger: current.ledger,
      compiledLifecycleReceipt: current.compiledLifecycleReceipt,
      trustedLifecycleLedgerPublicKey: current.ledger.ledgerPublicKey,
      executorId: 'executor:conformance:stale',
      executorPrivateKey: executorKeys.privateKey,
      startedAt: '2026-08-18T12:05:02.000Z',
      resolutionSnapshot: current.resolutionSnapshot
    })
  );
});

test('step replay, reordering and plan hazard-marker substitution fail closed', () => {
  const current = fixture();
  const outOfOrder = requestFor(current.plan, 2, '2026-08-18T12:05:05.000Z');
  assert.equal(current.sandbox.admit(outOfOrder).observation.reason_code, 'step-order-violation');

  const mutatedPlan = structuredClone(fixture().plan);
  const build = mutatedPlan.steps.find(step => step.operation_id === 'run-build');
  if (build) build.repository_code_execution = false;
  else mutatedPlan.steps[0].direct_shell_requested = true;
  const another = fixture();
  assert.throws(
    () => new AgentExecutorConformanceSandbox({
      plan: mutatedPlan,
      lifecycleLedger: another.ledger,
      compiledLifecycleReceipt: another.compiledLifecycleReceipt,
      trustedLifecycleLedgerPublicKey: another.ledger.ledgerPublicKey,
      executorId: 'executor:conformance:mutated-plan',
      executorPrivateKey: another.executorKeys.privateKey,
      startedAt: '2026-08-18T12:05:00.000Z',
      resolutionSnapshot: another.resolutionSnapshot
    })
  );
});

test('interruption is terminal and cannot be rewritten as completion', () => {
  const current = fixture();
  assert.equal(current.sandbox.admit(requestFor(current.plan, 1, '2026-08-18T12:05:05.000Z')).decision, 'admitted');
  current.sandbox.interrupt({
    eventId: 'event:conformance:manual-interrupt',
    occurredAt: '2026-08-18T12:05:10.000Z',
    reasonCode: 'operator-interrupted'
  });
  assert.equal(current.ledger.status, 'interrupted');
  assert.throws(
    () => current.sandbox.complete({ eventId: 'event:conformance:rewrite', occurredAt: '2026-08-18T12:05:11.000Z' }),
    /terminal/
  );
  const receipt = current.sandbox.receipt({ finishedAt: '2026-08-18T12:05:10.000Z' });
  assert.equal(receipt.statement.status, 'interrupted');
});

test('receipt tampering, signer substitution and authority/effect claim elevation are rejected', () => {
  const current = fixture({ operations: ['read-system-facts'] });
  runAll(current.sandbox, current.plan);
  current.sandbox.complete({ eventId: 'event:conformance:complete-short', occurredAt: '2026-08-18T12:06:00.000Z' });
  const receipt = current.sandbox.receipt({ finishedAt: '2026-08-18T12:06:00.000Z' });
  assert.equal(
    verifyAgentExecutorConformanceReceipt(receipt, {
      trustedExecutorPublicKey: current.sandbox.executorPublicKey,
      plan: current.plan
    }).valid,
    true
  );

  const wrongKeys = keys();
  assert.throws(
    () => verifyAgentExecutorConformanceReceipt(receipt, {
      trustedExecutorPublicKey: wrongKeys.publicKey,
      plan: current.plan
    }),
    /signer substitution/
  );

  for (const mutate of [
    value => { value.statement.task_success_claimed = true; },
    value => { value.statement.real_effect_observed = true; },
    value => { value.statement.remote_execution = true; },
    value => { value.statement.capability_promoted = true; },
    value => { value.statement.plan_digest = 'f'.repeat(64); }
  ]) {
    const changed = structuredClone(receipt);
    mutate(changed);
    assert.throws(
      () => verifyAgentExecutorConformanceReceipt(changed, {
        trustedExecutorPublicKey: current.sandbox.executorPublicKey,
        plan: current.plan
      })
    );
  }
});

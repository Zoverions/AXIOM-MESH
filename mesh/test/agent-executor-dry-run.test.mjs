import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson, digestObject, sha256 } from '../src/lib/canonical.mjs';
import {
  AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST,
  compileAgentExecutorDryRunPlan,
  validateAgentExecutorDryRunPlan,
  validateAgentExecutorPlatformProfile,
  verifyAgentExecutorDryRunPlan
} from '../src/lib/agent-executor-dry-run.mjs';
import { AgentTestSessionLifecycleLedger } from '../src/lib/agent-test-session-lifecycle.mjs';

const PROFILE_SHA = 'b'.repeat(64);
const BASE_SHA = 'a'.repeat(40);
const NONCE = 'challenge_nonce_0123456789ABCDEF';
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
    offer_id: 'offer:dry-run:test-node',
    repository: 'Zoverions/AXIOM-MESH',
    publisher: { type: 'human', id: 'contributor:dry-run' },
    node_profile: {
      schema: 'axiom-compute-node-profile.v1',
      profile_id: 'node:dry-run:test-node',
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
    challenge_id: 'infra:dry-run:bounded-plan',
    repository: 'Zoverions/AXIOM-MESH',
    base_sha: BASE_SHA,
    class: 'hardware-validation',
    target: { offer_id: 'offer:dry-run:test-node', node_profile_sha256: PROFILE_SHA },
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
    acceptance: ['Compile an inert exact authorization projection.'],
    evidence_requirements: ['Return canonical dry-run plan evidence.'],
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
    attestation_id: 'attestation:dry-run:001',
    repository: 'Zoverions/AXIOM-MESH',
    offer_id: 'offer:dry-run:test-node',
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
    evidence_refs: ['evidence:key-possession:dry-run'],
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
    authorization_id: 'session-auth:dry-run:001',
    repository: 'Zoverions/AXIOM-MESH',
    sponsor: { type: 'human', id: 'sponsor:dry-run-human', approval_ref: 'approval:issue:1116' },
    subject: { type: 'machine', id: 'agent:dry-run-runtime' },
    challenge: {
      challenge_id: 'infra:dry-run:bounded-plan',
      offer_id: 'offer:dry-run:test-node',
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
      revocation_ref: 'revocation:session-auth:dry-run:001'
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

function platformProfile(overrides = {}) {
  return {
    schema: 'axiom-agent-executor-platform-profile.v1',
    profile_id: 'platform:dry-run:macos-arm64',
    operating_system: 'macos',
    architecture: 'arm64',
    fact_status: 'measured',
    source_ref: 'evidence:host-facts:dry-run-001',
    claims: {
      platform_trust_inferred: false,
      secure_boot_verified: false,
      platform_backed_key_verified: false,
      privileged_executor_available: false,
      remote_administration_enabled: false,
      authority_granted: false
    },
    ...overrides
  };
}

function readyFixture({
  operations = ['read-system-facts', 'install-test-dependencies', 'run-build', 'run-tests', 'collect-sanitized-logs'],
  network = {
    mode: 'bounded-public-read',
    allowed_origins: ['https://registry.npmjs.org', 'https://github.com']
  },
  profile = platformProfile()
} = {}) {
  const hardwareOffer = offer();
  const infrastructureChallenge = challenge({ operations, network });
  const deviceAttestation = attestation();
  const sessionAuthorization = authorization({ operations, network, deviceAttestation });
  const ledgerKeys = keys();
  const ledger = new AgentTestSessionLifecycleLedger({
    ledgerId: 'session-ledger:dry-run:001',
    ledgerPrivateKey: ledgerKeys.privateKey
  });
  ledger.issue(sessionAuthorization, {
    eventId: 'event:dry-run:issued',
    occurredAt: '2026-08-18T12:04:00.000Z',
    challenge: infrastructureChallenge,
    offer: hardwareOffer,
    attestation: deviceAttestation,
    expectedNonce: NONCE,
    now: NOW
  });
  const lifecycleTranscript = ledger.exportTranscript();
  const lifecycleReceipt = ledger.receipt({ generatedAt: '2026-08-18T12:04:30.000Z' });
  const inputs = {
    authorization: sessionAuthorization,
    challenge: infrastructureChallenge,
    offer: hardwareOffer,
    attestation: deviceAttestation,
    expectedNonce: NONCE,
    now: NOW,
    lifecycleTranscript,
    lifecycleReceipt,
    trustedLifecycleLedgerPublicKey: ledger.ledgerPublicKey,
    platformProfile: profile
  };
  return {
    hardwareOffer,
    infrastructureChallenge,
    deviceAttestation,
    sessionAuthorization,
    ledger,
    ledgerKeys,
    lifecycleTranscript,
    lifecycleReceipt,
    profile,
    inputs
  };
}

test('dry-run compiler emits deterministic inert plan bound to authorization, lifecycle head, hardware and platform facts', () => {
  const fixture = readyFixture();
  const first = compileAgentExecutorDryRunPlan(fixture.inputs);
  const second = compileAgentExecutorDryRunPlan(fixture.inputs);

  assert.deepEqual(second, first);
  assert.equal(first.plan_digest, second.plan_digest);
  assert.equal(first.compiler.policy_digest, AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST);
  assert.equal(first.bindings.authorization_digest, digestObject(fixture.sessionAuthorization));
  assert.equal(first.bindings.lifecycle_head_event_digest, fixture.lifecycleTranscript.events[0].event_digest);
  assert.equal(first.bindings.lifecycle_receipt_digest, fixture.lifecycleReceipt.receipt_digest);
  assert.equal(first.bindings.node_profile_sha256, PROFILE_SHA);
  assert.equal(first.platform.operating_system, 'macos');
  assert.equal(first.platform.architecture, 'arm64');
  assert.equal(first.platform.fact_status, 'measured');
  assert.equal(first.platform.platform_trust_inferred, false);

  assert.deepEqual(first.network.allowed_origins, ['https://github.com', 'https://registry.npmjs.org']);
  assert.deepEqual(first.network.methods, ['GET', 'HEAD']);
  assert.equal(first.network.redirects_allowed, false);
  assert.equal(first.network.credentials_allowed, false);
  assert.equal(first.network.dns_rebinding_protection_required, true);
  assert.equal(first.network.resolution_policy, 'resolve-and-pin-public');

  assert.equal(first.workspace.root, 'work/session');
  assert.equal(first.workspace.relative_only, true);
  assert.equal(first.workspace.traversal_allowed, false);
  assert.equal(first.workspace.symlink_following_allowed, false);
  assert.equal(first.environment.path_override_allowed, false);
  assert.equal(first.environment.secret_values_allowed, false);

  assert.deepEqual(
    first.steps.map(step => step.step_id),
    [
      'read-system-facts:node-version',
      'read-system-facts:platform-arch',
      'install-test-dependencies:npm-ci',
      'run-build:npm-script',
      'run-tests:npm-script',
      'collect-sanitized-logs:builtin'
    ]
  );
  assert.equal(first.steps.find(step => step.operation_id === 'run-build').repository_code_execution, true);
  assert.equal(first.steps.find(step => step.operation_id === 'run-build').tool_may_invoke_repository_shell, true);
  assert.equal(first.steps.every(step => step.direct_shell_requested === false), true);
  assert.equal(first.steps.every(step => step.elevated_privileges_requested === false), true);
  assert.equal(first.steps.every(step => step.persistent_process_requested === false), true);

  assert.equal(first.lifecycle.status_required, 'issued');
  assert.equal(first.lifecycle.consume_before_first_effect, true);
  assert.equal(first.lifecycle.global_currentness_claimed, false);
  assert.equal(first.evidence.task_success_claimed, false);
  assert.equal(first.effects.effect_reachable, false);
  assert.equal(first.effects.process_spawned, false);
  assert.equal(first.effects.filesystem_mutated, false);
  assert.equal(first.effects.network_performed, false);
  assert.equal(first.effects.capability_promoted, false);

  assert.equal(validateAgentExecutorDryRunPlan(first).valid, true);
  assert.equal(verifyAgentExecutorDryRunPlan(first, fixture.inputs).exact_input_binding, true);
});

test('compiler source is structurally non-executing and imports no effect-capable host modules', async () => {
  const source = await readFile(new URL('../src/lib/agent-executor-dry-run.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    "node:child_process",
    "node:fs",
    "node:http",
    "node:https",
    "node:net",
    "node:dgram",
    "node:tls",
    "node:worker_threads",
    'spawn(',
    'exec(',
    'execFile(',
    'fetch('
  ]) {
    assert.equal(source.includes(forbidden), false, `dry-run compiler must not contain ${forbidden}`);
  }
});

test('long-lived local service execution is rejected pending a separate service/sandbox profile', () => {
  const fixture = readyFixture({
    operations: ['read-system-facts', 'start-local-test-services']
  });
  assert.throws(
    () => compileAgentExecutorDryRunPlan(fixture.inputs),
    /rejects start-local-test-services/
  );
});

test('compiler rejects stale, consumed, revoked, expired or otherwise non-issued lifecycle heads', () => {
  for (const transition of ['consumed', 'revoked']) {
    const fixture = readyFixture();
    if (transition === 'consumed') {
      fixture.ledger.consume({
        eventId: 'event:dry-run:consumed',
        occurredAt: '2026-08-18T12:05:30.000Z',
        revocationState: 'active'
      });
    } else {
      fixture.ledger.revoke({
        eventId: 'event:dry-run:revoked',
        occurredAt: '2026-08-18T12:05:30.000Z'
      });
    }
    const changed = {
      ...fixture.inputs,
      lifecycleTranscript: fixture.ledger.exportTranscript(),
      lifecycleReceipt: fixture.ledger.receipt({ generatedAt: '2026-08-18T12:05:40.000Z' })
    };
    assert.throws(
      () => compileAgentExecutorDryRunPlan(changed),
      /requires an unconsumed issued lifecycle head/
    );
  }
});

test('authorization, sponsor, subject and lifecycle substitution fail exact binding', () => {
  const fixture = readyFixture();
  for (const mutate of [
    value => { value.authorization_id = 'session-auth:substituted'; },
    value => { value.sponsor.id = 'sponsor:substituted'; },
    value => { value.subject.id = 'agent:substituted'; },
    value => { value.attestation.key_fingerprint_sha256 = 'd'.repeat(64); }
  ]) {
    const changedAuthorization = structuredClone(fixture.sessionAuthorization);
    mutate(changedAuthorization);
    assert.throws(
      () => compileAgentExecutorDryRunPlan({ ...fixture.inputs, authorization: changedAuthorization })
    );
  }

  const changedTranscript = structuredClone(fixture.lifecycleTranscript);
  changedTranscript.events[0].statement.authorization_digest = 'e'.repeat(64);
  assert.throws(
    () => compileAgentExecutorDryRunPlan({ ...fixture.inputs, lifecycleTranscript: changedTranscript })
  );
});

test('platform profile cannot self-upgrade platform trust, privilege, remote administration or authority', () => {
  const valid = validateAgentExecutorPlatformProfile(platformProfile());
  assert.equal(valid.fact_status, 'measured');
  assert.equal(valid.claims.platform_trust_inferred, false);

  for (const key of [
    'platform_trust_inferred',
    'secure_boot_verified',
    'platform_backed_key_verified',
    'privileged_executor_available',
    'remote_administration_enabled',
    'authority_granted'
  ]) {
    const profile = platformProfile();
    profile.claims[key] = true;
    assert.throws(
      () => validateAgentExecutorPlatformProfile(profile),
      /attempts to elevate/
    );
  }
});

test('bounded-public-read network compiler rejects credentialed, non-canonical, insecure and local/private origins', () => {
  const credentialedOrigin = ['https://', 'sample-user', ':', 'sample-passphrase', '@example.com'].join('');
  for (const origin of [
    credentialedOrigin,
    'https://example.com/path',
    'https://example.com?x=1',
    'http://example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://10.0.0.1',
    'https://192.168.1.10',
    'https://[::1]'
  ]) {
    const fixture = readyFixture({
      operations: ['read-system-facts'],
      network: { mode: 'bounded-public-read', allowed_origins: [origin] }
    });
    assert.throws(
      () => compileAgentExecutorDryRunPlan(fixture.inputs),
      /network origin|bounded-public-read origin/
    );
  }
});

test('owner-lan remains exact-origin and no-credential while recording pinning/redirect restrictions', () => {
  const fixture = readyFixture({
    operations: ['read-system-facts'],
    network: { mode: 'owner-lan', allowed_origins: ['http://192.168.1.10:8080'] }
  });
  const plan = compileAgentExecutorDryRunPlan(fixture.inputs);
  assert.deepEqual(plan.network.allowed_origins, ['http://192.168.1.10:8080']);
  assert.equal(plan.network.resolution_policy, 'resolve-and-pin-owner-lan');
  assert.equal(plan.network.redirects_allowed, false);
  assert.equal(plan.network.credentials_allowed, false);
  assert.equal(plan.network.dynamic_origin_discovery_allowed, false);
});

test('plan validator rejects arbitrary executable, argv, path, env, lifecycle-script, shell, privilege and persistence elevation', () => {
  const fixture = readyFixture();
  const plan = compileAgentExecutorDryRunPlan(fixture.inputs);
  const mutations = [
    value => { value.steps[0].executable_id = 'sh'; },
    value => { value.steps[0].arguments = ['--version', '; rm -rf /']; },
    value => { value.steps[0].working_directory = '../host'; },
    value => { value.environment.allowed_names = ['CI', 'AWS_SECRET_ACCESS_KEY']; },
    value => { value.steps[2].package_lifecycle_scripts_allowed = true; },
    value => { value.steps[2].direct_shell_requested = true; },
    value => { value.steps[2].elevated_privileges_requested = true; },
    value => { value.steps[2].persistent_process_requested = true; },
    value => { value.workspace.symlink_following_allowed = true; },
    value => { value.network.redirects_allowed = true; }
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(plan);
    mutate(changed);
    assert.throws(() => validateAgentExecutorDryRunPlan(changed));
  }
});

test('plan validator rejects resource, compiler, effect, success and digest elevation', () => {
  const fixture = readyFixture();
  const plan = compileAgentExecutorDryRunPlan(fixture.inputs);
  for (const mutate of [
    value => { value.resources.max_memory_mib = 8192; },
    value => { value.resources.max_processes = 100; },
    value => { value.compiler.version = 2; },
    value => { value.compiler.process_spawn_available = true; },
    value => { value.evidence.task_success_claimed = true; },
    value => { value.effects.effect_reachable = true; },
    value => { value.effects.credentials_retrieved = true; },
    value => { value.effects.production_enrollment = true; },
    value => { value.effects.firmware_changed = true; },
    value => { value.effects.capability_promoted = true; },
    value => { value.plan_digest = 'f'.repeat(64); }
  ]) {
    const changed = structuredClone(plan);
    mutate(changed);
    assert.throws(() => validateAgentExecutorDryRunPlan(changed));
  }
});

test('exact-input verifier rejects plan substitution even when substituted plan is independently well formed', () => {
  const firstFixture = readyFixture();
  const firstPlan = compileAgentExecutorDryRunPlan(firstFixture.inputs);

  const secondProfile = platformProfile({
    profile_id: 'platform:dry-run:linux-x64',
    operating_system: 'linux',
    architecture: 'x64',
    fact_status: 'declared',
    source_ref: 'evidence:declared:linux-x64'
  });
  const secondFixture = readyFixture({ profile: secondProfile });
  const secondPlan = compileAgentExecutorDryRunPlan(secondFixture.inputs);
  assert.equal(validateAgentExecutorDryRunPlan(secondPlan).valid, true);
  assert.notEqual(secondPlan.plan_digest, firstPlan.plan_digest);
  assert.throws(
    () => verifyAgentExecutorDryRunPlan(secondPlan, firstFixture.inputs),
    /does not match the exact validated inputs/
  );
});

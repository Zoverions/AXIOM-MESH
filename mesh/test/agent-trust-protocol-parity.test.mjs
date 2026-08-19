import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { PolicyEngine } from '../src/lib/policy.mjs';
import { buildMachineDiscovery } from '../src/lib/machine-discovery.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { createMachineIdentityCredential } from '../src/lib/agent-trust-machine-identity.mjs';
import { createAgentAuthorityManifest } from '../src/lib/agent-trust-authority-manifest.mjs';
import {
  compareAgentProtocolParity,
  createAgentProtocolAdapterProfile,
  evaluateAgentProtocolRequest,
  projectAgentProtocolDiscovery,
  projectAgentProtocolResult
} from '../src/lib/agent-trust-protocol-parity.mjs';

const humans = new Set(['owner.alice']);
const INPUT = '1'.repeat(64);

function principal() {
  return normalizeMachinePrincipalDefinition({
    id: 'agent.protocol.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.protocol.1',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo', 'system.delete'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 2,
        max_execution_ms: 5_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  }, {
    knownHumanPrincipals: humans,
    now: new Date('2026-08-17T19:00:00.000Z')
  });
}

function policy() {
  return {
    version: 'agent-protocol-parity-v1',
    actions: {
      'system.echo': {
        decision: 'allow',
        risk: 'low',
        required_scopes: ['intent:execute'],
        required_confirmations: 0,
        required_confirmation_values: [],
        requires_independent_approval: false,
        required_assurance: 'A1',
        timeout_ms: 4_000,
        constraints: {},
        tool: 'builtin.echo',
        effect: 'system.echo'
      },
      'system.delete': {
        decision: 'deny',
        risk: 'high',
        required_scopes: ['intent:execute'],
        required_confirmations: 2,
        required_confirmation_values: ['confirm.delete'],
        requires_independent_approval: true,
        required_assurance: 'A3',
        timeout_ms: 4_000,
        constraints: {},
        tool: 'builtin.delete',
        effect: 'system.delete'
      }
    }
  };
}

function fixture() {
  const issuer = generateKeyPairSync('ed25519');
  const operational = generateKeyPairSync('ed25519');
  const machine = principal();
  const credential = createMachineIdentityCredential({
    principal: machine,
    issuerId: 'identity.agent.protocol.1',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-08-17T20:00:00.000Z',
    validFrom: '2026-08-17T20:00:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    knownHumanPrincipals: humans
  });
  const activePolicy = policy();
  const discovery = buildMachineDiscovery({
    principal: machine,
    policy: new PolicyEngine(activePolicy),
    kernelVersion: '0.12.0-dev.3'
  });
  const capabilityRegistry = {
    schema: 'axiom-capabilities.v1',
    capabilities: [
      { id: 'core.echo', status: 'implemented' },
      { id: 'core.delete', status: 'disabled' }
    ]
  };
  const authorityManifest = createAgentAuthorityManifest({
    principal: machine,
    identityCredential: credential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy: activePolicy,
    capabilityRegistry,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:10:00.000Z',
    knownHumanPrincipals: humans
  });
  const authorityEvidence = {
    principal: machine,
    identityCredential: credential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy: activePolicy,
    capabilityRegistry,
    knownHumanPrincipals: humans
  };
  const profiles = {
    native: createAgentProtocolAdapterProfile({
      profileId: 'profile.native.v1',
      protocol: 'native',
      entries: [
        { external_id: 'system.delete', axiom_action: 'system.delete' },
        { external_id: 'system.echo', axiom_action: 'system.echo' }
      ]
    }),
    mcp: createAgentProtocolAdapterProfile({
      profileId: 'profile.mcp.lab.v1',
      protocol: 'mcp',
      entries: [
        { external_id: 'axiom.delete', axiom_action: 'system.delete' },
        { external_id: 'axiom.echo', axiom_action: 'system.echo' }
      ]
    }),
    a2a: createAgentProtocolAdapterProfile({
      profileId: 'profile.a2a.lab.v1',
      protocol: 'a2a',
      entries: [
        { external_id: 'axiom.delete.skill', axiom_action: 'system.delete' },
        { external_id: 'axiom.echo.skill', axiom_action: 'system.echo' }
      ]
    })
  };
  return { issuer, operational, machine, credential, authorityManifest, authorityEvidence, profiles };
}

function request(f, protocol, externalAction, metadata = {}) {
  const common = {
    principal_id: f.machine.id,
    principal_credential_digest: f.credential.credential_digest,
    purpose: 'test.conformance',
    destination: 'local',
    input_digest: INPUT,
    metadata
  };
  if (protocol === 'native') return { ...common, action: externalAction };
  if (protocol === 'mcp') return { ...common, tool_name: externalAction };
  return { ...common, skill_id: externalAction };
}

function evaluate(f, protocol, externalAction, metadata = {}, profile = f.profiles[protocol]) {
  return evaluateAgentProtocolRequest({
    adapterProfile: profile,
    expectedProfileDigest: profile.profile_digest,
    request: request(f, protocol, externalAction, metadata),
    authorityManifest: f.authorityManifest,
    authorityEvidence: f.authorityEvidence
  });
}

test('A9a gives the same A2 requestability decision for the same canonical request across native MCP and A2A-labelled profiles', () => {
  const f = fixture();
  const native = evaluate(f, 'native', 'system.echo', { source: 'native' });
  const mcp = evaluate(f, 'mcp', 'axiom.echo', { source: 'mcp' });
  const a2a = evaluate(f, 'a2a', 'axiom.echo.skill', { source: 'a2a' });
  assert.equal(native.decision, 'requestable-under-a2-snapshot');
  assert.equal(mcp.decision, native.decision);
  assert.equal(a2a.decision, native.decision);
  assert.equal(mcp.canonical_request_digest, native.canonical_request_digest);
  assert.equal(a2a.canonical_request_digest, native.canonical_request_digest);
  const parity = compareAgentProtocolParity([native, mcp, a2a]);
  assert.equal(parity.equivalent_a2_requestability_decision, true);
  assert.equal(parity.authority_parity_scope, 'a2-requestability-snapshot-only');
  assert.equal(parity.full_runtime_authority_parity_claimed, false);
  assert.equal(parity.protocol_conformance_claimed, false);
  assert.equal(parity.authority_granted, false);
});

test('denied canonical action remains denied across every protocol profile', () => {
  const f = fixture();
  const evaluations = [
    evaluate(f, 'native', 'system.delete'),
    evaluate(f, 'mcp', 'axiom.delete'),
    evaluate(f, 'a2a', 'axiom.delete.skill')
  ];
  for (const item of evaluations) {
    assert.equal(item.decision, 'denied-under-a2-snapshot');
    assert.equal(item.denial_reason, 'action-not-requestable');
    assert.equal(item.authority_granted, false);
  }
  assert.equal(compareAgentProtocolParity(evaluations).equivalent_a2_requestability_decision, true);
});

test('protocol metadata including fake grants reputation and discovery claims cannot alter authority result', () => {
  const f = fixture();
  const clean = evaluate(f, 'mcp', 'axiom.echo', {});
  const poisoned = evaluate(f, 'mcp', 'axiom.echo', {
    grant: 'admin',
    permission: true,
    trusted: true,
    reputation_score: 999999,
    contribution_history_receipt: 'f'.repeat(64),
    discovery_says_allowed: true,
    vendor: 'prestigious-model'
  });
  assert.notEqual(clean.metadata_digest, poisoned.metadata_digest);
  assert.equal(clean.canonical_request_digest, poisoned.canonical_request_digest);
  assert.equal(clean.decision, poisoned.decision);
  assert.equal(poisoned.adapter_metadata_trusted, false);
  assert.equal(poisoned.reputation_is_permission, false);
  assert.equal(poisoned.discovery_is_permission, false);
  assert.equal(poisoned.authority_granted, false);
});

test('profile substitution and protocol action laundering fail rather than widen authority', () => {
  const f = fixture();
  assert.throws(() => evaluateAgentProtocolRequest({
    adapterProfile: f.profiles.mcp,
    expectedProfileDigest: f.profiles.native.profile_digest,
    request: request(f, 'mcp', 'axiom.echo'),
    authorityManifest: f.authorityManifest,
    authorityEvidence: f.authorityEvidence
  }), /not the expected pinned profile/);

  const launderingProfile = createAgentProtocolAdapterProfile({
    profileId: 'profile.mcp.laundered',
    protocol: 'mcp',
    entries: [
      { external_id: 'axiom.echo', axiom_action: 'system.delete' }
    ]
  });
  const native = evaluate(f, 'native', 'system.echo');
  const laundered = evaluate(f, 'mcp', 'axiom.echo', {}, launderingProfile);
  assert.equal(laundered.decision, 'denied-under-a2-snapshot');
  assert.throws(
    () => compareAgentProtocolParity([native, laundered]),
    /canonical request mismatch/
  );
});

test('principal or credential spoofing fails before protocol metadata can matter', () => {
  const f = fixture();
  const wrongPrincipal = request(f, 'a2a', 'axiom.echo.skill');
  wrongPrincipal.principal_id = 'agent.other.1';
  assert.throws(() => evaluateAgentProtocolRequest({
    adapterProfile: f.profiles.a2a,
    expectedProfileDigest: f.profiles.a2a.profile_digest,
    request: wrongPrincipal,
    authorityManifest: f.authorityManifest,
    authorityEvidence: f.authorityEvidence
  }), /principal does not match verified authority manifest/);

  const wrongCredential = request(f, 'a2a', 'axiom.echo.skill');
  wrongCredential.principal_credential_digest = '0'.repeat(64);
  assert.throws(() => evaluateAgentProtocolRequest({
    adapterProfile: f.profiles.a2a,
    expectedProfileDigest: f.profiles.a2a.profile_digest,
    request: wrongCredential,
    authorityManifest: f.authorityManifest,
    authorityEvidence: f.authorityEvidence
  }), /credential does not match verified authority manifest/);
});

test('unmapped external actions deny instead of inventing authority', () => {
  const f = fixture();
  const result = evaluate(f, 'mcp', 'unlisted.tool', { reputation_score: 999999 });
  assert.equal(result.canonical_request, null);
  assert.equal(result.canonical_request_digest, null);
  assert.equal(result.decision, 'denied-under-a2-snapshot');
  assert.equal(result.denial_reason, 'unmapped-protocol-action');
  assert.equal(result.authority_granted, false);
});

test('protocol discovery exposes only A2 requestable mappings and never permission', () => {
  const f = fixture();
  for (const profile of Object.values(f.profiles)) {
    const projection = projectAgentProtocolDiscovery({
      adapterProfile: profile,
      expectedProfileDigest: profile.profile_digest,
      authorityManifest: f.authorityManifest,
      authorityEvidence: f.authorityEvidence
    });
    assert.equal(projection.entries.length, 1);
    assert.equal(projection.entries[0].axiom_action, 'system.echo');
    assert.equal(projection.discovery_is_permission, false);
    assert.equal(projection.adapter_metadata_trusted, false);
    assert.equal(projection.protocol_conformance_claimed, false);
    assert.equal(projection.authority_granted, false);
  }
});

test('external protocol result remains provenance-labelled unverified data rather than verified local fact', () => {
  const f = fixture();
  const result = projectAgentProtocolResult({
    adapterProfile: f.profiles.a2a,
    expectedProfileDigest: f.profiles.a2a.profile_digest,
    sourcePrincipalId: 'agent.remote.1',
    sourceIdentityDigest: '3'.repeat(64),
    taskId: 'task.remote.1',
    resultDigest: '4'.repeat(64),
    metadata: { completed: true, confidence: 1, truth: true }
  });
  assert.equal(result.external_result_provenance_preserved, true);
  assert.equal(result.source_identity_verified, false);
  assert.equal(result.verified_local_fact, false);
  assert.equal(result.truth_claimed, false);
  assert.equal(result.finality_claimed, false);
  assert.equal(result.authority_granted, false);
  assert.equal(result.protocol_conformance_claimed, false);
});

test('outer protocol request fields are strict even though metadata is untrusted and extensible', () => {
  const f = fixture();
  const raw = request(f, 'native', 'system.echo', { grant: true });
  raw.authority = 'root';
  assert.throws(() => evaluateAgentProtocolRequest({
    adapterProfile: f.profiles.native,
    expectedProfileDigest: f.profiles.native.profile_digest,
    request: raw,
    authorityManifest: f.authorityManifest,
    authorityEvidence: f.authorityEvidence
  }), /unsupported field authority/);
});

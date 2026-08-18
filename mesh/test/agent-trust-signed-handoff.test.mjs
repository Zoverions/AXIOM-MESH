import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { PolicyEngine } from '../src/lib/policy.mjs';
import { buildMachineDiscovery } from '../src/lib/machine-discovery.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { createMachineIdentityCredential } from '../src/lib/agent-trust-machine-identity.mjs';
import { createAgentAuthorityManifest } from '../src/lib/agent-trust-authority-manifest.mjs';
import {
  createAgentSignedHandoff,
  verifyAgentSignedHandoff
} from '../src/lib/agent-trust-signed-handoff.mjs';

const humans = new Set(['owner.alice']);
const INPUT = '1'.repeat(64);
const CONTEXT_A = '2'.repeat(64);
const CONTEXT_B = '3'.repeat(64);

function principal() {
  return normalizeMachinePrincipalDefinition({
    id: 'agent.sender.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.sender.1',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo', 'system.hash'],
      purposes: ['research.assist', 'test.conformance'],
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

function policy(version = 'handoff-fixture-v1') {
  return {
    version,
    actions: {
      'system.echo': {
        decision: 'allow',
        risk: 'low',
        required_scopes: ['intent:execute'],
        required_confirmations: 1,
        required_confirmation_values: ['confirm.echo'],
        requires_independent_approval: false,
        required_assurance: 'A1',
        timeout_ms: 4_000,
        constraints: {},
        tool: 'builtin.echo',
        effect: 'system.echo'
      },
      'system.hash': {
        decision: 'deny',
        risk: 'high',
        required_scopes: ['intent:execute'],
        required_confirmations: 2,
        required_confirmation_values: ['confirm.hash'],
        requires_independent_approval: true,
        required_assurance: 'A3',
        timeout_ms: 5_000,
        constraints: {},
        tool: 'builtin.hash',
        effect: 'system.hash'
      }
    }
  };
}

function capabilities(extra = []) {
  return {
    schema: 'axiom-capabilities.v1',
    capabilities: [
      { id: 'core.echo', status: 'implemented' },
      { id: 'core.hash', status: 'implemented' },
      ...extra
    ]
  };
}

function fixture() {
  const issuer = generateKeyPairSync('ed25519');
  const operational = generateKeyPairSync('ed25519');
  const machine = principal();
  const identityCredential = createMachineIdentityCredential({
    principal: machine,
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-08-17T20:00:00.000Z',
    validFrom: '2026-08-17T20:00:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    knownHumanPrincipals: humans
  });
  const activePolicy = policy();
  const engine = new PolicyEngine(activePolicy);
  const discovery = buildMachineDiscovery({
    principal: machine,
    policy: engine,
    kernelVersion: '0.12.0-dev.3'
  });
  const capabilityRegistry = capabilities();
  const authorityManifest = createAgentAuthorityManifest({
    principal: machine,
    identityCredential,
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
    identityCredential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy: activePolicy,
    capabilityRegistry,
    knownHumanPrincipals: humans
  };
  return {
    issuer,
    operational,
    machine,
    identityCredential,
    activePolicy,
    discovery,
    capabilityRegistry,
    authorityManifest,
    authorityEvidence
  };
}

function create(f = fixture(), overrides = {}) {
  return createAgentSignedHandoff({
    handoffId: 'handoff.fixture.1',
    parentTaskId: 'task.parent.1',
    recipientPrincipalId: 'agent.recipient.1',
    intendedExecutorId: 'executor.recipient.1',
    identityCredential: f.identityCredential,
    trustedIssuerPublicKey: f.issuer.publicKey,
    authorityManifest: f.authorityManifest,
    authorityEvidence: f.authorityEvidence,
    operationalPrivateKey: f.operational.privateKey,
    action: 'system.echo',
    purpose: 'test.conformance',
    destination: 'local',
    inputDigest: INPUT,
    contextDigests: [CONTEXT_B, CONTEXT_A, CONTEXT_A],
    evidenceObligations: ['effect.receipt', 'tests.pass'],
    expectedOutputClasses: ['artifact.patch', 'receipt'],
    resourceCeiling: {
      max_requests_per_minute: 5,
      max_concurrent_requests: 1,
      max_execution_ms: 3_000,
      max_request_bytes: 32_768,
      max_response_bytes: 131_072
    },
    notBefore: '2026-08-17T20:02:00.000Z',
    expiresAt: '2026-08-17T20:06:00.000Z',
    nonce: 'nonce.fixture.1',
    idempotencyKey: 'idem.fixture.1',
    ...overrides
  });
}

function evidence(f) {
  return {
    identityCredential: f.identityCredential,
    trustedIssuerPublicKey: f.issuer.publicKey,
    authorityManifest: f.authorityManifest,
    authorityEvidence: f.authorityEvidence
  };
}

test('A4a signs a portable task handoff proposal with the A1 operational key and A2 authority snapshot', () => {
  const f = fixture();
  const handoff = create(f);
  const verified = verifyAgentSignedHandoff(handoff, {
    ...evidence(f),
    expectedRecipientPrincipalId: 'agent.recipient.1',
    expectedExecutorId: 'executor.recipient.1',
    expectedInputDigest: INPUT,
    expectedParentTaskId: 'task.parent.1'
  });

  assert.equal(verified.statement.sender_principal_id, 'agent.sender.1');
  assert.equal(verified.statement.recipient_principal_id, 'agent.recipient.1');
  assert.equal(verified.statement.authority_manifest_digest, f.authorityManifest.manifest_digest);
  assert.equal(verified.statement.sender_credential_digest, f.identityCredential.credential_digest);
  assert.deepEqual(verified.statement.context_digests, [CONTEXT_A, CONTEXT_B]);
  assert.equal(verified.statement.handoff_is_authorization, false);
  assert.equal(verified.statement.execution_authorized, false);
  assert.equal(verified.statement.delegation_authorization_claimed, false);
  assert.equal(verified.statement.recipient_must_revalidate, true);
  assert.equal(verified.statement.global_currentness_claimed, false);
  assert.equal(verified.statement.protocol_switch_can_expand_authority, false);
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.delegation_chain_head_digest, null);
  assert.equal(verified.statement.remaining_delegation_depth, 0);
  assert.match(verified.handoff_digest, /^[a-f0-9]{64}$/);
});

test('cross-agent delivery remains a signed proposal and never becomes delegation authority', () => {
  const f = fixture();
  const handoff = create(f, {
    recipientPrincipalId: 'agent.other-vendor.1',
    intendedExecutorId: 'runtime.other-vendor.1'
  });
  const verified = verifyAgentSignedHandoff(handoff, evidence(f));
  assert.equal(verified.statement.recipient_principal_id, 'agent.other-vendor.1');
  assert.equal(verified.statement.intended_executor_id, 'runtime.other-vendor.1');
  assert.equal(verified.statement.delegation_authorization_claimed, false);
  assert.equal(verified.statement.execution_authorized, false);
});

test('handoff creation rejects an operational key that does not match the A1 credential', () => {
  const f = fixture();
  const wrong = generateKeyPairSync('ed25519');
  assert.throws(
    () => create(f, { operationalPrivateKey: wrong.privateKey }),
    /operational private key does not match identity credential/
  );
});

test('handoff rejects actions purposes and destinations outside the A2 passport', () => {
  const f = fixture();
  assert.throws(() => create(f, { action: 'system.hash' }), /action is not requestable/);
  assert.throws(() => create(f, { purpose: 'finance.transfer' }), /purpose exceeds bound manifest/);
  assert.throws(() => create(f, { destination: 'provider:evil' }), /destination exceeds bound manifest/);
});

test('handoff resource ceilings cannot exceed machine budget or action timeout', () => {
  const f = fixture();
  assert.throws(() => create(f, {
    resourceCeiling: {
      max_requests_per_minute: 11,
      max_concurrent_requests: 1,
      max_execution_ms: 3_000,
      max_request_bytes: 32_768,
      max_response_bytes: 131_072
    }
  }), /max_requests_per_minute exceeds authority manifest/);

  assert.throws(() => create(f, {
    resourceCeiling: {
      max_requests_per_minute: 5,
      max_concurrent_requests: 1,
      max_execution_ms: 4_001,
      max_request_bytes: 32_768,
      max_response_bytes: 131_072
    }
  }), /execution ceiling exceeds action timeout/);
});

test('handoff is short lived and cannot escape the bound passport window', () => {
  const f = fixture();
  assert.throws(() => create(f, {
    notBefore: '2026-08-17T20:02:00.000Z',
    expiresAt: '2026-08-17T20:07:01.000Z'
  }), /five minute laboratory ceiling/);

  assert.throws(() => create(f, {
    notBefore: '2026-08-17T20:00:59.000Z',
    expiresAt: '2026-08-17T20:05:00.000Z'
  }), /starts before authority manifest/);

  assert.throws(() => create(f, {
    notBefore: '2026-08-17T20:06:00.000Z',
    expiresAt: '2026-08-17T20:10:01.000Z'
  }), /outlives authority manifest/);
});

test('statement tamper signer substitution and digest substitution fail closed', () => {
  const f = fixture();
  const handoff = create(f);

  const tampered = structuredClone(handoff);
  tampered.statement.input_digest = '9'.repeat(64);
  assert.throws(
    () => verifyAgentSignedHandoff(tampered, evidence(f)),
    /statement digest mismatch/
  );

  const wrongIdentity = fixture();
  assert.throws(
    () => verifyAgentSignedHandoff(handoff, evidence(wrongIdentity)),
    /does not reproduce|identity credential does not match|sender signature is invalid/
  );

  assert.throws(
    () => verifyAgentSignedHandoff({ ...handoff, handoff_digest: 'f'.repeat(64) }, evidence(f)),
    /handoff_digest mismatch/
  );
});

test('handoff cannot self-assert an authority-bearing delegation chain or execution authority', () => {
  const f = fixture();
  const handoff = create(f);

  const delegation = structuredClone(handoff);
  delegation.statement.delegation_chain_head_digest = 'd'.repeat(64);
  assert.throws(
    () => verifyAgentSignedHandoff(delegation, evidence(f)),
    /cannot claim an authority-bearing delegation chain/
  );

  const executable = structuredClone(handoff);
  executable.statement.execution_authorized = true;
  assert.throws(
    () => verifyAgentSignedHandoff(executable, evidence(f)),
    /execution_authorized must remain false/
  );

  const depth = structuredClone(handoff);
  depth.statement.remaining_delegation_depth = 1;
  assert.throws(
    () => verifyAgentSignedHandoff(depth, evidence(f)),
    /remaining_delegation_depth must remain zero/
  );
});

test('receiver executor input and causal-parent substitution can be independently checked', () => {
  const f = fixture();
  const handoff = create(f);
  assert.throws(() => verifyAgentSignedHandoff(handoff, {
    ...evidence(f), expectedRecipientPrincipalId: 'agent.attacker.1'
  }), /recipient mismatch/);
  assert.throws(() => verifyAgentSignedHandoff(handoff, {
    ...evidence(f), expectedExecutorId: 'executor.attacker.1'
  }), /intended executor mismatch/);
  assert.throws(() => verifyAgentSignedHandoff(handoff, {
    ...evidence(f), expectedInputDigest: 'e'.repeat(64)
  }), /input digest mismatch/);
  assert.throws(() => verifyAgentSignedHandoff(handoff, {
    ...evidence(f), expectedParentTaskId: 'task.other.1'
  }), /parent task mismatch/);
});

test('policy or capability-registry drift invalidates the bound authority evidence', () => {
  const f = fixture();
  const handoff = create(f);
  const driftedPolicy = { ...f.authorityEvidence, policy: policy('handoff-fixture-v2') };
  assert.throws(() => verifyAgentSignedHandoff(handoff, {
    ...evidence(f), authorityEvidence: driftedPolicy
  }), /machine discovery does not match the supplied policy snapshot|does not reproduce/);

  const driftedCapabilities = {
    ...f.authorityEvidence,
    capabilityRegistry: capabilities([{ id: 'extra.fixture', status: 'implemented' }])
  };
  assert.throws(() => verifyAgentSignedHandoff(handoff, {
    ...evidence(f), authorityEvidence: driftedCapabilities
  }), /does not reproduce/);
});

test('unknown fields fail closed', () => {
  const f = fixture();
  const handoff = create(f);
  assert.throws(
    () => verifyAgentSignedHandoff({ ...handoff, magic: true }, evidence(f)),
    /unsupported field magic/
  );

  const statementExtra = structuredClone(handoff);
  statementExtra.statement.magic = true;
  statementExtra.statement_digest = digestObject(statementExtra.statement);
  assert.throws(
    () => verifyAgentSignedHandoff(statementExtra, evidence(f)),
    /unsupported field magic/
  );
});

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { PolicyEngine } from '../src/lib/policy.mjs';
import { buildMachineDiscovery } from '../src/lib/machine-discovery.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { createMachineIdentityCredential } from '../src/lib/agent-trust-machine-identity.mjs';
import {
  AGENT_AUTHORITY_MANIFEST_NOTICE,
  createAgentAuthorityManifest,
  verifyAgentAuthorityManifest
} from '../src/lib/agent-trust-authority-manifest.mjs';

const humans = new Set(['owner.alice']);

function principalDefinition(overrides = {}) {
  return {
    id: 'agent.researcher.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.fixture.1',
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
    },
    ...overrides
  };
}

function policy(overrides = {}) {
  return {
    version: 'agent-trust-fixture-v1',
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
        decision: 'allow',
        risk: 'high',
        required_scopes: ['intent:execute'],
        required_confirmations: 2,
        required_confirmation_values: ['confirm.hash'],
        requires_independent_approval: true,
        required_assurance: 'A3',
        timeout_ms: 8_000,
        constraints: {},
        tool: 'builtin.hash',
        effect: 'system.hash'
      }
    },
    ...overrides
  };
}

function capabilityRegistry(extra = []) {
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
  const principal = normalizeMachinePrincipalDefinition(principalDefinition(), {
    knownHumanPrincipals: humans,
    now: new Date('2026-08-17T19:00:00.000Z')
  });
  const identityCredential = createMachineIdentityCredential({
    principal,
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
    principal,
    policy: engine,
    kernelVersion: '0.12.0-dev.3'
  });
  const capabilities = capabilityRegistry();
  return { issuer, operational, principal, identityCredential, activePolicy, discovery, capabilities };
}

function create(f = fixture()) {
  return createAgentAuthorityManifest({
    principal: f.principal,
    identityCredential: f.identityCredential,
    trustedIssuerPublicKey: f.issuer.publicKey,
    discovery: f.discovery,
    policy: f.activePolicy,
    capabilityRegistry: f.capabilities,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:10:00.000Z',
    knownHumanPrincipals: humans
  });
}

function verificationEvidence(f) {
  return {
    principal: f.principal,
    identityCredential: f.identityCredential,
    trustedIssuerPublicKey: f.issuer.publicKey,
    discovery: f.discovery,
    policy: f.activePolicy,
    capabilityRegistry: f.capabilities,
    knownHumanPrincipals: humans
  };
}

test('A2 authority manifest binds identity, principal ceilings, policy floors and capability context without granting authority', () => {
  const f = fixture();
  const manifest = create(f);
  const verified = verifyAgentAuthorityManifest(manifest, verificationEvidence(f));

  assert.equal(verified.notice, AGENT_AUTHORITY_MANIFEST_NOTICE);
  assert.equal(verified.principal.id, 'agent.researcher.1');
  assert.equal(verified.identity.credential_digest, f.identityCredential.credential_digest);
  assert.equal(verified.principal.principal_authority_digest, f.principal.authority_digest);
  assert.equal(verified.evaluation.policy_digest, new PolicyEngine(f.activePolicy).digest);
  assert.equal(verified.evaluation.capability_registry_digest, digestObject(f.capabilities));
  assert.deepEqual(verified.authority.delegation, { allowed: false, max_depth: 0 });
  assert.deepEqual(verified.authority.requestable_actions.map(item => ({
    id: item.id,
    assurance: item.required_assurance,
    confirmations: item.required_confirmations,
    independent: item.requires_independent_approval,
    timeout: item.timeout_ms
  })), [
    { id: 'system.echo', assurance: 'A1', confirmations: 1, independent: false, timeout: 4_000 },
    { id: 'system.hash', assurance: 'A3', confirmations: 2, independent: true, timeout: 5_000 }
  ]);
  assert.equal(verified.semantics.bearer_token, false);
  assert.equal(verified.semantics.presentation_grants_authority, false);
  assert.equal(verified.semantics.execution_authorized, false);
  assert.equal(verified.semantics.delegation_authorized, false);
  assert.equal(verified.semantics.requires_live_revalidation, true);
  assert.equal(verified.semantics.authority_effect, 'none');
  assert.match(verified.manifest_digest, /^[a-f0-9]{64}$/);
});

test('recomputed manifest digest cannot launder a widened action or budget', () => {
  const f = fixture();
  const manifest = create(f);

  const widenedAction = structuredClone(manifest);
  widenedAction.authority.requestable_actions.push({
    id: 'system.zzz',
    risk: 'low',
    effect_destination: 'local',
    required_assurance: 'A1',
    required_confirmations: 0,
    required_confirmation_values: [],
    requires_independent_approval: false,
    timeout_ms: 1_000
  });
  const { manifest_digest: ignoredA, ...bodyA } = widenedAction;
  widenedAction.manifest_digest = digestObject(bodyA);
  assert.throws(
    () => verifyAgentAuthorityManifest(widenedAction, verificationEvidence(f)),
    /does not reproduce from its bound evidence/
  );

  const widenedBudget = structuredClone(manifest);
  widenedBudget.authority.budgets.max_execution_ms = 50_000;
  const { manifest_digest: ignoredB, ...bodyB } = widenedBudget;
  widenedBudget.manifest_digest = digestObject(bodyB);
  assert.throws(
    () => verifyAgentAuthorityManifest(widenedBudget, verificationEvidence(f)),
    /does not reproduce from its bound evidence/
  );
});

test('forged discovery digest cannot invent requestability outside policy and principal evidence', () => {
  const f = fixture();
  const forged = structuredClone(f.discovery);
  forged.actions.push({
    id: 'system.zzz',
    risk: 'low',
    effect_destination: 'local',
    required_confirmations: 0,
    required_confirmation_values: [],
    requires_independent_approval: false,
    timeout_ms: 1_000
  });
  const { digest: ignored, ...document } = forged;
  forged.digest = digestObject(document);

  assert.throws(() => createAgentAuthorityManifest({
    principal: f.principal,
    identityCredential: f.identityCredential,
    trustedIssuerPublicKey: f.issuer.publicKey,
    discovery: forged,
    policy: f.activePolicy,
    capabilityRegistry: f.capabilities,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:10:00.000Z',
    knownHumanPrincipals: humans
  }), /requestability does not reproduce from policy and principal/);
});

test('passport verification rejects policy and capability-registry substitution', () => {
  const f = fixture();
  const manifest = create(f);

  const changedPolicy = policy({ version: 'agent-trust-fixture-v2' });
  assert.throws(
    () => verifyAgentAuthorityManifest(manifest, {
      ...verificationEvidence(f),
      policy: changedPolicy
    }),
    /machine discovery does not match the supplied policy snapshot/
  );

  assert.throws(
    () => verifyAgentAuthorityManifest(manifest, {
      ...verificationEvidence(f),
      capabilityRegistry: capabilityRegistry([{ id: 'extra.fixture', status: 'implemented' }])
    }),
    /does not reproduce from its bound evidence/
  );
});

test('identity binding prevents a passport from projecting a different principal authority', () => {
  const f = fixture();
  const alteredPrincipal = normalizeMachinePrincipalDefinition(principalDefinition({
    constraints: {
      ...principalDefinition().constraints,
      actions: ['system.echo', 'system.hash', 'system.zzz']
    }
  }), {
    knownHumanPrincipals: humans,
    now: new Date('2026-08-17T19:00:00.000Z')
  });

  assert.throws(() => createAgentAuthorityManifest({
    principal: alteredPrincipal,
    identityCredential: f.identityCredential,
    trustedIssuerPublicKey: f.issuer.publicKey,
    discovery: f.discovery,
    policy: f.activePolicy,
    capabilityRegistry: f.capabilities,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:10:00.000Z',
    knownHumanPrincipals: humans
  }), /principal definition mismatch|authority digest does not match principal/);
});

test('authority manifest cannot self-enable delegation or bearer semantics even with a recomputed digest', () => {
  const f = fixture();
  const manifest = create(f);

  const delegated = structuredClone(manifest);
  delegated.authority.delegation = { allowed: true, max_depth: 1 };
  const { manifest_digest: ignoredA, ...bodyA } = delegated;
  delegated.manifest_digest = digestObject(bodyA);
  assert.throws(
    () => verifyAgentAuthorityManifest(delegated, verificationEvidence(f)),
    /cannot enable delegation/
  );

  const bearer = structuredClone(manifest);
  bearer.semantics.bearer_token = true;
  const { manifest_digest: ignoredB, ...bodyB } = bearer;
  bearer.manifest_digest = digestObject(bodyB);
  assert.throws(
    () => verifyAgentAuthorityManifest(bearer, verificationEvidence(f)),
    /widen the non-authorizing boundary/
  );
});

test('authority manifest lifetime is short and cannot exceed identity or principal validity', () => {
  const f = fixture();
  assert.throws(() => createAgentAuthorityManifest({
    principal: f.principal,
    identityCredential: f.identityCredential,
    trustedIssuerPublicKey: f.issuer.publicKey,
    discovery: f.discovery,
    policy: f.activePolicy,
    capabilityRegistry: f.capabilities,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:17:00.000Z',
    knownHumanPrincipals: humans
  }), /15 minute laboratory ceiling/);

  assert.throws(() => createAgentAuthorityManifest({
    principal: f.principal,
    identityCredential: f.identityCredential,
    trustedIssuerPublicKey: f.issuer.publicKey,
    discovery: f.discovery,
    policy: f.activePolicy,
    capabilityRegistry: f.capabilities,
    createdAt: '2026-08-25T19:58:00.000Z',
    expiresAt: '2026-08-25T20:01:00.000Z',
    knownHumanPrincipals: humans
  }), /cannot outlive the identity credential/);
});

test('unknown fields fail closed', () => {
  const f = fixture();
  const manifest = create(f);
  const extra = structuredClone(manifest);
  extra.magic_authority = true;
  assert.throws(
    () => verifyAgentAuthorityManifest(extra, verificationEvidence(f)),
    /unsupported field magic_authority/
  );
});

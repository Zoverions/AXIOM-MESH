import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { PolicyEngine } from '../src/lib/policy.mjs';
import { buildMachineDiscovery } from '../src/lib/machine-discovery.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { createMachineIdentityCredential } from '../src/lib/agent-trust-machine-identity.mjs';
import { createAgentAuthorityManifest } from '../src/lib/agent-trust-authority-manifest.mjs';
import {
  agentAttenuationKeyId,
  authorityCeilingFromAgentPassport,
  createAgentAttenuationProof,
  createAgentAuthorityCeiling,
  evaluateAgentAuthorityAttenuation,
  verifyAgentAttenuationProof
} from '../src/lib/agent-trust-attenuation-proof.mjs';

function parentCeiling(overrides = {}) {
  return createAgentAuthorityCeiling({
    capabilities: ['cap.echo', 'cap.hash'],
    actions: [
      {
        id: 'system.echo',
        effect_destination: 'local',
        required_assurance: 'A1',
        required_confirmations: 1,
        required_confirmation_values: ['confirm.echo'],
        requires_independent_approval: false,
        timeout_ms: 5_000
      },
      {
        id: 'system.hash',
        effect_destination: 'local',
        required_assurance: 'A2',
        required_confirmations: 2,
        required_confirmation_values: ['confirm.hash'],
        requires_independent_approval: true,
        timeout_ms: 4_000
      }
    ],
    scopes: ['intent:execute', 'memory:read'],
    purposes: ['research.assist', 'test.conformance'],
    destinations: ['local', 'provider:fixture'],
    data_classes: ['public', 'user-private'],
    budgets: {
      max_requests_per_minute: 20,
      max_concurrent_requests: 4,
      max_execution_ms: 5_000,
      max_request_bytes: 131_072,
      max_response_bytes: 524_288,
      max_cost_units: 100
    },
    delegation: { may_subdelegate: true, remaining_depth: 2 },
    valid_from: '2026-08-17T20:00:00.000Z',
    expires_at: '2026-08-17T21:00:00.000Z',
    ...overrides
  });
}

function childCeiling(overrides = {}) {
  return createAgentAuthorityCeiling({
    capabilities: ['cap.echo'],
    actions: [
      {
        id: 'system.echo',
        effect_destination: 'local',
        required_assurance: 'A2',
        required_confirmations: 2,
        required_confirmation_values: ['confirm.echo', 'confirm.extra'],
        requires_independent_approval: true,
        timeout_ms: 2_500
      }
    ],
    scopes: ['intent:execute'],
    purposes: ['test.conformance'],
    destinations: ['local'],
    data_classes: ['public'],
    budgets: {
      max_requests_per_minute: 10,
      max_concurrent_requests: 2,
      max_execution_ms: 2_500,
      max_request_bytes: 65_536,
      max_response_bytes: 262_144,
      max_cost_units: 25
    },
    delegation: { may_subdelegate: true, remaining_depth: 1 },
    valid_from: '2026-08-17T20:05:00.000Z',
    expires_at: '2026-08-17T20:45:00.000Z',
    ...overrides
  });
}

function proofFixture() {
  const delegator = generateKeyPairSync('ed25519');
  const parent = parentCeiling();
  const child = childCeiling();
  const proof = createAgentAttenuationProof({
    proofId: 'attenuation.fixture.1',
    delegatorId: 'agent.parent.1',
    delegateId: 'agent.child.1',
    delegatorPrivateKey: delegator.privateKey,
    parentAuthority: parent,
    childAuthority: child,
    parentContextDigest: 'a'.repeat(64),
    issuedAt: '2026-08-17T20:06:00.000Z',
    expiresAt: '2026-08-17T20:40:00.000Z'
  });
  return { delegator, parent, child, proof };
}

test('A3a signs a proof that a child authority is equal-or-narrower without granting delegation authority', () => {
  const f = proofFixture();
  const verified = verifyAgentAttenuationProof(f.proof, {
    delegatorPublicKey: f.delegator.publicKey,
    parentAuthority: f.parent,
    childAuthority: f.child,
    expectedDelegatorId: 'agent.parent.1',
    expectedDelegateId: 'agent.child.1',
    expectedParentContextDigest: 'a'.repeat(64)
  });

  assert.equal(verified.statement.delegator_key_id, agentAttenuationKeyId(f.delegator.publicKey));
  assert.equal(verified.attenuation.valid, true);
  assert.equal(verified.attenuation.authority_relation, 'strictly-equal-or-narrower');
  assert.equal(verified.attenuation.delegation_depth_consumed, 1);
  assert.equal(verified.statement.parent_authorization_claimed, false);
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.delegation_effect, 'none');
  assert.equal(verified.statement.execution_authorized, false);
  assert.equal(verified.statement.bearer_token, false);
  assert.equal(verified.statement.runtime_delegation_enabled, false);
  assert.equal(verified.statement.global_currentness_claimed, false);
  assert.equal(verified.statement.revocation_currentness_checked, false);
  assert.equal(verified.statement.protocol_switch_can_expand_authority, false);
});

test('attenuation rejects capability scope purpose destination and data-class widening', () => {
  const parent = parentCeiling();
  const cases = [
    ['capabilities', ['cap.echo', 'cap.unknown'], /child capabilities widens/],
    ['scopes', ['intent:execute', 'root:admin'], /child scopes widens/],
    ['purposes', ['test.conformance', 'finance.transfer'], /child purposes widens/],
    ['destinations', ['local', 'https:\/\/evil.example'], /child destinations widens/],
    ['data_classes', ['public', 'secret'], /child data classes widens/]
  ];
  for (const [field, value, pattern] of cases) {
    const child = childCeiling({ [field]: value.sort() });
    assert.throws(() => evaluateAgentAuthorityAttenuation(parent, child), pattern);
  }
});

test('attenuation rejects every budget widening dimension', () => {
  const parent = parentCeiling();
  const parentBudgets = parent.budgets;
  for (const key of Object.keys(parentBudgets)) {
    const child = childCeiling({
      budgets: { ...childCeiling().budgets, [key]: parentBudgets[key] + 1 }
    });
    assert.throws(
      () => evaluateAgentAuthorityAttenuation(parent, child),
      new RegExp(`child budget ${key} exceeds parent ceiling`)
    );
  }
});

test('attenuation rejects action insertion destination changes and weaker assurance or approval floors', () => {
  const parent = parentCeiling();

  const inserted = childCeiling({
    actions: [
      ...childCeiling().actions,
      {
        id: 'system.zzz',
        effect_destination: 'local',
        required_assurance: 'A4',
        required_confirmations: 5,
        required_confirmation_values: ['confirm.zzz'],
        requires_independent_approval: true,
        timeout_ms: 100
      }
    ]
  });
  assert.throws(() => evaluateAgentAuthorityAttenuation(parent, inserted), /child actions widen parent authority/);

  const weakerAssurance = childCeiling({
    actions: [{ ...childCeiling().actions[0], required_assurance: 'A0' }]
  });
  assert.throws(() => evaluateAgentAuthorityAttenuation(parent, weakerAssurance), /lowers required assurance/);

  const fewerConfirmations = childCeiling({
    actions: [{ ...childCeiling().actions[0], required_confirmations: 0 }]
  });
  assert.throws(() => evaluateAgentAuthorityAttenuation(parent, fewerConfirmations), /lowers required confirmation count/);

  const missingLiteral = childCeiling({
    actions: [{
      ...childCeiling().actions[0],
      required_confirmations: 2,
      required_confirmation_values: ['confirm.extra']
    }]
  });
  assert.throws(() => evaluateAgentAuthorityAttenuation(parent, missingLiteral), /removes required confirmation value/);

  const widerTimeout = childCeiling({
    actions: [{ ...childCeiling().actions[0], timeout_ms: 5_001 }]
  });
  assert.throws(() => evaluateAgentAuthorityAttenuation(parent, widerTimeout), /widens execution timeout/);

  const changedDestination = childCeiling({
    actions: [{ ...childCeiling().actions[0], effect_destination: 'provider:fixture' }]
  });
  assert.throws(() => evaluateAgentAuthorityAttenuation(parent, changedDestination), /changes effect destination/);

  const highParent = parentCeiling({
    actions: [{
      id: 'system.echo',
      effect_destination: 'local',
      required_assurance: 'A3',
      required_confirmations: 1,
      required_confirmation_values: ['confirm.echo'],
      requires_independent_approval: true,
      timeout_ms: 5_000
    }]
  });
  const weakChild = childCeiling({
    actions: [{
      ...childCeiling().actions[0],
      required_assurance: 'A3',
      requires_independent_approval: false
    }]
  });
  assert.throws(() => evaluateAgentAuthorityAttenuation(highParent, weakChild), /removes independent approval requirement/);
});

test('attenuation requires child temporal scope and delegation depth to contract', () => {
  const parent = parentCeiling();

  assert.throws(() => evaluateAgentAuthorityAttenuation(parent, childCeiling({
    valid_from: '2026-08-17T19:59:59.000Z'
  })), /starts before parent authority/);

  assert.throws(() => evaluateAgentAuthorityAttenuation(parent, childCeiling({
    expires_at: '2026-08-17T21:00:01.000Z'
  })), /expires after parent authority/);

  assert.throws(() => evaluateAgentAuthorityAttenuation(parent, childCeiling({
    delegation: { may_subdelegate: true, remaining_depth: 2 }
  })), /depth is not attenuated/);

  const noDelegation = parentCeiling({
    delegation: { may_subdelegate: false, remaining_depth: 0 }
  });
  assert.throws(() => evaluateAgentAuthorityAttenuation(noDelegation, childCeiling({
    delegation: { may_subdelegate: false, remaining_depth: 0 }
  })), /does not permit delegation/);
});

test('signed proof rejects signer substitution statement tamper and authority substitution', () => {
  const f = proofFixture();
  const wrong = generateKeyPairSync('ed25519');
  assert.throws(() => verifyAgentAttenuationProof(f.proof, {
    delegatorPublicKey: wrong.publicKey,
    parentAuthority: f.parent,
    childAuthority: f.child
  }), /delegator key substitution/);

  const tampered = structuredClone(f.proof);
  tampered.statement.delegate_id = 'agent.attacker.1';
  assert.throws(() => verifyAgentAttenuationProof(tampered, {
    delegatorPublicKey: f.delegator.publicKey,
    parentAuthority: f.parent,
    childAuthority: f.child
  }), /statement digest mismatch/);

  const differentChild = childCeiling({
    budgets: { ...f.child.budgets, max_cost_units: 20 }
  });
  assert.throws(() => verifyAgentAttenuationProof(f.proof, {
    delegatorPublicKey: f.delegator.publicKey,
    parentAuthority: f.parent,
    childAuthority: differentChild
  }), /authority binding mismatch/);
});

test('proof-only semantics cannot be elevated into a bearer grant', () => {
  const f = proofFixture();
  const elevated = structuredClone(f.proof);
  elevated.statement.delegation_effect = 'grant-child-authority';
  assert.throws(() => verifyAgentAttenuationProof(elevated, {
    delegatorPublicKey: f.delegator.publicKey,
    parentAuthority: f.parent,
    childAuthority: f.child
  }), /widens its proof-only boundary/);
});

test('proof cannot outlive the child authority', () => {
  const delegator = generateKeyPairSync('ed25519');
  assert.throws(() => createAgentAttenuationProof({
    proofId: 'attenuation.fixture.expiry',
    delegatorId: 'agent.parent.1',
    delegateId: 'agent.child.1',
    delegatorPrivateKey: delegator.privateKey,
    parentAuthority: parentCeiling(),
    childAuthority: childCeiling(),
    issuedAt: '2026-08-17T20:06:00.000Z',
    expiresAt: '2026-08-17T20:46:00.000Z'
  }), /cannot outlive child authority/);
});

function realPassportFixture() {
  const humans = new Set(['owner.alice']);
  const issuer = generateKeyPairSync('ed25519');
  const operational = generateKeyPairSync('ed25519');
  const principal = normalizeMachinePrincipalDefinition({
    id: 'agent.current.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-01T00:00:00.000Z',
    runtime: { id: 'runtime.current.1', kind: 'local-process', software_digest: 'b'.repeat(64) },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 5_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  }, { knownHumanPrincipals: humans, now: new Date('2026-08-17T19:00:00.000Z') });
  const credential = createMachineIdentityCredential({
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
  const policy = {
    version: 'attenuation-current-passport-v1',
    actions: {
      'system.echo': {
        decision: 'allow', risk: 'low', required_scopes: ['intent:execute'],
        required_confirmations: 0, required_confirmation_values: [],
        requires_independent_approval: false, required_assurance: 'A1',
        timeout_ms: 5_000, constraints: {}, tool: 'builtin.echo', effect: 'system.echo'
      }
    }
  };
  const engine = new PolicyEngine(policy);
  const discovery = buildMachineDiscovery({ principal, policy: engine, kernelVersion: '0.12.0-dev.3' });
  const capabilityRegistry = {
    schema: 'axiom-capabilities.v1',
    capabilities: [{ id: 'core.echo', status: 'implemented' }]
  };
  const passport = createAgentAuthorityManifest({
    principal,
    identityCredential: credential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy,
    capabilityRegistry,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:10:00.000Z',
    knownHumanPrincipals: humans
  });
  return passport;
}

test('current real Agent Passport projects delegation depth zero and cannot authorize a child', () => {
  const parent = authorityCeilingFromAgentPassport(realPassportFixture());
  assert.deepEqual(parent.delegation, { may_subdelegate: false, remaining_depth: 0 });
  const child = createAgentAuthorityCeiling({
    capabilities: [],
    actions: parent.actions,
    scopes: parent.scopes,
    purposes: parent.purposes,
    destinations: parent.destinations,
    data_classes: [],
    budgets: parent.budgets,
    delegation: { may_subdelegate: false, remaining_depth: 0 },
    valid_from: parent.valid_from,
    expires_at: parent.expires_at
  });
  assert.throws(() => evaluateAgentAuthorityAttenuation(parent, child), /does not permit delegation/);
});

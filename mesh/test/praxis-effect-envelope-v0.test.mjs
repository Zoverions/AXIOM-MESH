import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  PraxisRuntimeError,
  createHostObservation,
  createOperationDescriptorPraxis,
  createSyntheticCharter,
  verifyHostObservation
} from '../../labs/praxis/index.mjs';

import {
  createHostOperationRegistryPraxis,
  createProgramEffectManifestPraxis,
  createSignedCharterEffectEnvelopePraxis,
  measureOperationEffectPraxis,
  prepareMeasuredEffectPraxis,
  revalidatePreparedEffectPraxis,
  verifySignedCharterEffectEnvelopePraxis
} from '../../labs/praxis/effect-envelope-v0.mjs';

const BASE = Date.parse('2026-09-18T18:00:00.000Z');
const PROGRAM_DIGEST = `sha256:${'1'.repeat(64)}`;

function keypair() {
  return generateKeyPairSync('ed25519');
}

const root = keypair();
const ci = keypair();
const deployer = keypair();

const principals = {
  CI: { kind: 'service', publicKey: ci.publicKey },
  Deployer: { kind: 'agent', publicKey: deployer.publicKey }
};

const greenPredicate = {
  op: 'eq',
  left: { source: 'evidence', verifier: 'BuildVerified', path: ['status'] },
  right: { source: 'const', value: 'green' }
};

const artifactPredicate = {
  op: 'eq',
  left: { source: 'evidence', verifier: 'BuildVerified', path: ['artifact'] },
  right: { source: 'operation', path: ['args', 0] }
};

const charter = createSyntheticCharter({
  principals,
  agents: { ReleaseAgent: 'Deployer' },
  programDigests: [PROGRAM_DIGEST],
  verifiers: {
    BuildVerified: {
      source: 'ci.build',
      signers: ['CI'],
      freshness_ms: 60_000
    }
  },
  policies: {
    Release: {
      authority_kind: 'Permit',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000,
      requires_evidence: ['BuildVerified'],
      require: [greenPredicate, artifactPredicate]
    },
    Audit: {
      authority_kind: 'Permit',
      action: 'Write',
      scope: 'Local',
      expires_ms: 60_000,
      requires_evidence: [],
      require: []
    }
  }
}, root.privateKey);

const trustedRoots = [root.publicKey];

function verifiedBuild(artifact = 'artifact:A', nonce = 'build-a') {
  const observation = createHostObservation({
    source: 'ci.build',
    value: { status: 'green', artifact },
    issuedAt: BASE,
    principal: 'CI',
    privateKey: ci.privateKey,
    nonce
  });
  return verifyHostObservation({
    observation,
    verifierName: 'BuildVerified',
    charter,
    trustedRootKeys: trustedRoots,
    now: BASE + 1_000
  });
}

function deployOperation(artifact = 'artifact:A') {
  return createOperationDescriptorPraxis({
    action: 'Deploy',
    scope: 'Production',
    args: [artifact],
    secretReferences: [{ id: 'release-token', kind: 'DeploymentCredential' }]
  });
}

function auditOperation() {
  return createOperationDescriptorPraxis({
    action: 'Write',
    scope: 'Local',
    args: ['audit:entry']
  });
}

const deployContract = Object.freeze({
  action: 'Deploy',
  scope: 'Production',
  effect: 'release.write',
  irreversible: true,
  egress_class: 'provider-api',
  destination: 'release.example.test'
});

const auditContract = Object.freeze({
  action: 'Write',
  scope: 'Local',
  effect: 'audit.write',
  irreversible: false,
  egress_class: null,
  destination: null
});

function registry(operations = { deploy: deployContract, audit: auditContract }) {
  return createHostOperationRegistryPraxis(operations);
}

function manifest({
  operations = { deploy: deployContract, audit: auditContract },
  effects = ['release.write', 'audit.write'],
  programDigest = PROGRAM_DIGEST
} = {}) {
  return createProgramEffectManifestPraxis({
    programDigest,
    declaredEffects: effects,
    operations
  });
}

function envelope({
  effects = ['release.write', 'audit.write'],
  egress = ['provider-api'],
  destinations = ['release.example.test']
} = {}) {
  return createSignedCharterEffectEnvelopePraxis({
    charter,
    trustedRootKeys: trustedRoots,
    principal: 'Deployer',
    allowedEffects: effects,
    allowedEgressClasses: egress,
    allowedDestinations: destinations
  }, root.privateKey);
}

function releaseAuthorityRequest(artifact = 'artifact:A') {
  return {
    authorityKind: 'Permit',
    id: 'permit:release:' + artifact,
    policyName: 'Release',
    evidence: [verifiedBuild(artifact, 'build:' + artifact)],
    requester: 'ReleaseAgent',
    now: BASE + 2_000
  };
}

function auditAuthorityRequest() {
  return {
    authorityKind: 'Permit',
    id: 'permit:audit',
    policyName: 'Audit',
    requester: 'ReleaseAgent',
    now: BASE + 2_000
  };
}

function expectCode(code) {
  return error => error instanceof PraxisRuntimeError && error.code === code;
}

test('irreversible measured effect requires finalize and remains checked-only', async () => {
  const operation = deployOperation();
  const prepared = await prepareMeasuredEffectPraxis({
    operationName: 'deploy',
    operation,
    registry: registry(),
    manifest: manifest(),
    authorityRequest: releaseAuthorityRequest(),
    envelope: envelope(),
    charter,
    trustedRootKeys: trustedRoots,
    terminalMode: 'finalize'
  });

  assert.equal(prepared.effect, 'release.write');
  assert.equal(prepared.irreversible, true);
  assert.equal(prepared.terminal_mode, 'finalize');

  const checked = await revalidatePreparedEffectPraxis({
    prepared,
    operationName: 'deploy',
    operation,
    registry: registry(),
    manifest: manifest(),
    authorityRequest: releaseAuthorityRequest(),
    envelope: envelope(),
    charter,
    trustedRootKeys: trustedRoots,
    terminalMode: 'finalize'
  });
  assert.equal(checked.disposition, 'checked-only');
  assert.equal(checked.external_effect_performed, false);
});

test('irreversible effect cannot use ordinary commit', async () => {
  await assert.rejects(
    () => prepareMeasuredEffectPraxis({
      operationName: 'deploy',
      operation: deployOperation(),
      registry: registry(),
      manifest: manifest(),
      authorityRequest: releaseAuthorityRequest(),
      envelope: envelope(),
      charter,
      trustedRootKeys: trustedRoots,
      terminalMode: 'commit'
    }),
    expectCode('PRAXIS_EFFECT_TERMINAL_MODE')
  );
});

test('reversible effect cannot use finalize', async () => {
  await assert.rejects(
    () => prepareMeasuredEffectPraxis({
      operationName: 'audit',
      operation: auditOperation(),
      registry: registry(),
      manifest: manifest(),
      authorityRequest: auditAuthorityRequest(),
      envelope: envelope(),
      charter,
      trustedRootKeys: trustedRoots,
      terminalMode: 'finalize'
    }),
    expectCode('PRAXIS_EFFECT_TERMINAL_MODE')
  );
});

test('program cannot relabel a consequential host operation as harmless', () => {
  const harmless = { ...deployContract, effect: 'telemetry.read', irreversible: false };
  assert.throws(
    () => measureOperationEffectPraxis({
      operationName: 'deploy',
      operation: deployOperation(),
      registry: registry(),
      manifest: manifest({ operations: { deploy: harmless }, effects: ['telemetry.read'] })
    }),
    expectCode('PRAXIS_EFFECT_MEASUREMENT')
  );
});

test('declaring every effect cannot exceed the signed charter envelope', async () => {
  await assert.rejects(
    () => prepareMeasuredEffectPraxis({
      operationName: 'deploy',
      operation: deployOperation(),
      registry: registry(),
      manifest: manifest({ effects: ['release.write', 'audit.write', 'telemetry.read'] }),
      authorityRequest: releaseAuthorityRequest(),
      envelope: envelope({ effects: ['audit.write'] }),
      charter,
      trustedRootKeys: trustedRoots,
      terminalMode: 'finalize'
    }),
    expectCode('PRAXIS_EFFECT_ENVELOPE')
  );
});

test('missing host operation registry entry fails closed', () => {
  assert.throws(
    () => measureOperationEffectPraxis({
      operationName: 'deploy',
      operation: deployOperation(),
      registry: registry({ audit: auditContract }),
      manifest: manifest()
    }),
    expectCode('PRAXIS_EFFECT_REGISTRY')
  );
});

test('measured effect must be explicitly declared by the program', () => {
  assert.throws(
    () => measureOperationEffectPraxis({
      operationName: 'deploy',
      operation: deployOperation(),
      registry: registry(),
      manifest: manifest({ effects: ['audit.write'] })
    }),
    expectCode('PRAXIS_EFFECT_UNDECLARED')
  );
});

test('hand-edited manifest with stale digest is refused', () => {
  const tampered = structuredClone(manifest());
  tampered.operations.deploy.effect = 'telemetry.read';
  assert.throws(
    () => measureOperationEffectPraxis({
      operationName: 'deploy',
      operation: deployOperation(),
      registry: registry(),
      manifest: tampered
    }),
    expectCode('PRAXIS_EFFECT_TAMPER')
  );
});

test('re-sealed hostile manifest still cannot override host measurement', () => {
  const relabeled = { ...deployContract, effect: 'telemetry.read' };
  assert.throws(
    () => measureOperationEffectPraxis({
      operationName: 'deploy',
      operation: deployOperation(),
      registry: registry(),
      manifest: manifest({ operations: { deploy: relabeled }, effects: ['telemetry.read'] })
    }),
    expectCode('PRAXIS_EFFECT_MEASUREMENT')
  );
});

test('un-pinned program digest cannot enter the measured-effect lane', async () => {
  await assert.rejects(
    () => prepareMeasuredEffectPraxis({
      operationName: 'deploy',
      operation: deployOperation(),
      registry: registry(),
      manifest: manifest({ programDigest: `sha256:${'2'.repeat(64)}` }),
      authorityRequest: releaseAuthorityRequest(),
      envelope: envelope(),
      charter,
      trustedRootKeys: trustedRoots,
      terminalMode: 'finalize'
    }),
    expectCode('PRAXIS_EFFECT_PROGRAM_UNPINNED')
  );
});

test('exact-plan P0.3 policy still blocks evidence/operation substitution', async () => {
  await assert.rejects(
    () => prepareMeasuredEffectPraxis({
      operationName: 'deploy',
      operation: deployOperation('artifact:B'),
      registry: registry(),
      manifest: manifest(),
      authorityRequest: releaseAuthorityRequest('artifact:A'),
      envelope: envelope(),
      charter,
      trustedRootKeys: trustedRoots,
      terminalMode: 'finalize'
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_REQUIRE'
  );
});

test('tampering the signed effect envelope cannot add authority', () => {
  const signed = structuredClone(envelope({ effects: ['audit.write'] }));
  signed.body.allowed_effects.push('release.write');
  assert.throws(
    () => verifySignedCharterEffectEnvelopePraxis({
      envelope: signed,
      charter,
      trustedRootKeys: trustedRoots
    }),
    expectCode('PRAXIS_EFFECT_ENVELOPE')
  );
});

test('prepared replay cannot switch finalize to commit', async () => {
  const operation = deployOperation();
  const prepared = await prepareMeasuredEffectPraxis({
    operationName: 'deploy',
    operation,
    registry: registry(),
    manifest: manifest(),
    authorityRequest: releaseAuthorityRequest(),
    envelope: envelope(),
    charter,
    trustedRootKeys: trustedRoots,
    terminalMode: 'finalize'
  });

  await assert.rejects(
    () => revalidatePreparedEffectPraxis({
      prepared,
      operationName: 'deploy',
      operation,
      registry: registry(),
      manifest: manifest(),
      authorityRequest: releaseAuthorityRequest(),
      envelope: envelope(),
      charter,
      trustedRootKeys: trustedRoots,
      terminalMode: 'commit'
    }),
    expectCode('PRAXIS_EFFECT_TERMINAL_MODE')
  );
});

test('governed source cannot silently change egress destination metadata', () => {
  const redirected = { ...deployContract, destination: 'attacker.example.test' };
  assert.throws(
    () => measureOperationEffectPraxis({
      operationName: 'deploy',
      operation: deployOperation(),
      registry: registry(),
      manifest: manifest({ operations: { deploy: redirected } })
    }),
    expectCode('PRAXIS_EFFECT_MEASUREMENT')
  );
});

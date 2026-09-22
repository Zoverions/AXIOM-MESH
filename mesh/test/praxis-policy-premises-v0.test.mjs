import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  PraxisRuntimeError,
  createCharteredHostPermit,
  createHostObservation,
  createOperationDescriptorPraxis,
  createSyntheticCharter,
  verifyHostObservation
} from '../../labs/praxis/index.mjs';

const BASE = Date.parse('2026-09-18T12:00:00.000Z');

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

const BUILD_VERIFIER = {
  source: 'ci.build',
  signers: ['CI'],
  freshness_ms: 10_000
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

const riskPredicate = {
  op: 'lt',
  left: { source: 'evidence', verifier: 'BuildVerified', path: ['risk_score'] },
  right: { source: 'const', value: 20 }
};

const missingFieldPredicate = {
  op: 'eq',
  left: { source: 'evidence', verifier: 'BuildVerified', path: ['does_not_exist'] },
  right: { source: 'const', value: true }
};

const charter = createSyntheticCharter({
  principals,
  agents: {
    ReleaseAgent: 'Deployer'
  },
  verifiers: {
    BuildVerified: BUILD_VERIFIER
  },
  policies: {
    GreenBuild: {
      authority_kind: 'Permit',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000,
      requires_evidence: ['BuildVerified'],
      require: [greenPredicate]
    },
    ArtifactBound: {
      authority_kind: 'Permit',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000,
      requires_evidence: ['BuildVerified'],
      require: [greenPredicate, artifactPredicate]
    },
    RiskBound: {
      authority_kind: 'Permit',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000,
      requires_evidence: ['BuildVerified'],
      require: [riskPredicate]
    },
    MissingField: {
      authority_kind: 'Permit',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000,
      requires_evidence: ['BuildVerified'],
      require: [missingFieldPredicate]
    }
  }
}, root.privateKey);

const trustedRoots = [root.publicKey];

function operation(artifact = 'artifact:A') {
  return createOperationDescriptorPraxis({
    action: 'Deploy',
    scope: 'Production',
    args: [artifact]
  });
}

function observation(value, nonce = 'build') {
  return createHostObservation({
    source: 'ci.build',
    value,
    issuedAt: BASE,
    principal: 'CI',
    privateKey: ci.privateKey,
    nonce
  });
}

function verified(value, nonce = 'build') {
  return verifyHostObservation({
    observation: observation(value, nonce),
    verifierName: 'BuildVerified',
    charter,
    trustedRootKeys: trustedRoots,
    now: BASE + 1_000
  });
}

async function issue({
  policyName,
  value,
  op = operation(),
  evidence = null,
  operationDigest = undefined
}) {
  const suppliedEvidence = evidence ?? [verified(value)];
  return createCharteredHostPermit({
    id: 'permit:' + policyName + ':' + Math.random(),
    charter,
    trustedRootKeys: trustedRoots,
    policyName,
    operation: op,
    ...(operationDigest === undefined ? {} : { operationDigest }),
    evidence: suppliedEvidence,
    requester: 'ReleaseAgent',
    now: BASE + 1_000
  });
}

test('green verified build satisfies a pinned granting premise', async () => {
  const permit = await issue({
    policyName: 'GreenBuild',
    value: { status: 'green', artifact: 'artifact:A', risk_score: 5 }
  });

  assert.equal(permit.operation_digest, operation().operation_digest);
  assert.equal(permit.premises.length, 1);
  assert.equal(permit.premises[0].result, true);
});

test('verified-but-red build is denied by the pinned premise', async () => {
  await assert.rejects(
    () => issue({
      policyName: 'GreenBuild',
      value: { status: 'red', artifact: 'artifact:A', risk_score: 5 }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_REQUIRE'
  );
});

test('verified artifact A cannot authorize an operation over artifact B', async () => {
  await assert.rejects(
    () => issue({
      policyName: 'ArtifactBound',
      value: { status: 'green', artifact: 'artifact:A', risk_score: 5 },
      op: operation('artifact:B')
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_REQUIRE'
  );
});

test('matching verified artifact and operation can satisfy the exact binding', async () => {
  const permit = await issue({
    policyName: 'ArtifactBound',
    value: { status: 'green', artifact: 'artifact:A', risk_score: 5 },
    op: operation('artifact:A')
  });

  assert.equal(permit.premises.length, 2);
});

test('ordered policy comparison is deterministic for finite numbers', async () => {
  const permit = await issue({
    policyName: 'RiskBound',
    value: { status: 'green', artifact: 'artifact:A', risk_score: 19 }
  });
  assert.equal(permit.premises[0].result, true);

  await assert.rejects(
    () => issue({
      policyName: 'RiskBound',
      value: { status: 'green', artifact: 'artifact:A', risk_score: 20 }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_REQUIRE'
  );
});

test('mixed-type ordered comparison fails closed as policy error', async () => {
  await assert.rejects(
    () => issue({
      policyName: 'RiskBound',
      value: { status: 'green', artifact: 'artifact:A', risk_score: 'low' }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_ERROR'
  );
});

test('missing evidence field fails closed instead of becoming falsy policy data', async () => {
  await assert.rejects(
    () => issue({
      policyName: 'MissingField',
      value: { status: 'green', artifact: 'artifact:A' }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_ERROR'
  );
});

test('operation-referencing policy requires the exact operation descriptor, not only its digest', async () => {
  const op = operation('artifact:A');
  const evidence = [verified({
    status: 'green',
    artifact: 'artifact:A',
    risk_score: 5
  }, 'digest-only')];

  await assert.rejects(
    () => createCharteredHostPermit({
      id: 'permit:digest-only',
      charter,
      trustedRootKeys: trustedRoots,
      policyName: 'ArtifactBound',
      operationDigest: op.operation_digest,
      evidence,
      requester: 'ReleaseAgent',
      now: BASE + 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_SUBJECT_REQUIRED'
  );
});

test('operation descriptor with stale digest is refused before policy evaluation', async () => {
  const op = structuredClone(operation('artifact:A'));
  op.args[0] = 'artifact:B';

  await assert.rejects(
    () => issue({
      policyName: 'ArtifactBound',
      value: { status: 'green', artifact: 'artifact:B', risk_score: 5 },
      op
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_SUBJECT_INVALID'
  );
});

test('operation action or scope must match the pinned policy', async () => {
  const wrong = createOperationDescriptorPraxis({
    action: 'Transfer',
    scope: 'Treasury',
    args: ['artifact:A']
  });

  await assert.rejects(
    () => issue({
      policyName: 'GreenBuild',
      value: { status: 'green', artifact: 'artifact:A', risk_score: 5 },
      op: wrong
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_SUBJECT_INVALID'
  );
});

test('duplicate evidence for one verifier is ambiguous and denied', async () => {
  const a = verified({ status: 'green', artifact: 'artifact:A', risk_score: 5 }, 'duplicate-a');
  const b = verified({ status: 'green', artifact: 'artifact:A', risk_score: 5 }, 'duplicate-b');

  await assert.rejects(
    () => issue({
      policyName: 'GreenBuild',
      evidence: [a, b],
      value: null
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EVIDENCE_AMBIGUOUS'
  );
});

test('observation signing snapshots mutable evidence before the caller can change it', () => {
  const source = {
    status: 'green',
    artifact: 'artifact:A',
    nested: { risk: 5 }
  };
  const signed = observation(source, 'mutable-source');

  source.status = 'red';
  source.nested.risk = 99;

  const checked = verifyHostObservation({
    observation: signed,
    verifierName: 'BuildVerified',
    charter,
    trustedRootKeys: trustedRoots,
    now: BASE + 1_000
  });

  assert.equal(checked.value.status, 'green');
  assert.equal(checked.value.nested.risk, 5);
  assert.equal(Object.isFrozen(checked.value), true);
  assert.equal(Object.isFrozen(checked.value.nested), true);
});

test('verified nested evidence cannot be mutated after verification', () => {
  const checked = verified({
    status: 'green',
    artifact: 'artifact:A',
    nested: { risk: 5 }
  }, 'frozen-verified');

  assert.throws(() => {
    checked.value.nested.risk = 99;
  }, TypeError);

  assert.equal(checked.value.nested.risk, 5);
});

test('charter creation rejects Assessment as a granting premise source', () => {
  assert.throws(
    () => createSyntheticCharter({
      principals,
      policies: {
        Bad: {
          authority_kind: 'Permit',
          action: 'Deploy',
          scope: 'Production',
          expires_ms: 60_000,
          require: [{
            op: 'eq',
            left: { source: 'assessment', name: 'risk' },
            right: { source: 'const', value: 'low' }
          }]
        }
      }
    }, root.privateKey),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_PREMISE'
  );
});

test('policy cannot consume evidence it did not explicitly declare as required', () => {
  assert.throws(
    () => createSyntheticCharter({
      principals,
      verifiers: {
        BuildVerified: BUILD_VERIFIER
      },
      policies: {
        Bad: {
          authority_kind: 'Permit',
          action: 'Deploy',
          scope: 'Production',
          expires_ms: 60_000,
          requires_evidence: [],
          require: [greenPredicate]
        }
      }
    }, root.privateKey),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_PREMISE'
  );
});

test('removing a signed require predicate invalidates the pinned policy', async () => {
  const tampered = structuredClone(charter);
  tampered.body.policies.ArtifactBound.def.require = [greenPredicate];

  await assert.rejects(
    () => createCharteredHostPermit({
      id: 'permit:tampered-policy',
      charter: tampered,
      trustedRootKeys: trustedRoots,
      policyName: 'ArtifactBound',
      operation: operation('artifact:A'),
      evidence: [verified({
        status: 'green',
        artifact: 'artifact:A',
        risk_score: 5
      }, 'tampered-policy')],
      requester: 'ReleaseAgent',
      now: BASE + 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_UNPINNED'
  );
});

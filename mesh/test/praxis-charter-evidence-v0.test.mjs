import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  PraxisRuntimeError,
  compile,
  createApprovalRequest,
  createCharteredHostPermit,
  createCharteredHostQuorum,
  createHostObservation,
  createSyntheticCharter,
  irDigestPraxis,
  operationDigestPraxis,
  run,
  signApprovalRequest,
  verifyHostObservation,
  verifySyntheticCharter
} from '../../labs/praxis/index.mjs';

const BASE = Date.parse('2026-09-18T12:00:00.000Z');
const PREPARATION_DIGEST = 'sha256:' + 'c'.repeat(64);

function keypair() {
  return generateKeyPairSync('ed25519');
}

const root = keypair();
const operator = keypair();
const security = keypair();
const provider = keypair();
const deployer = keypair();
const ci = keypair();

const principals = {
  Operator: { kind: 'human', publicKey: operator.publicKey },
  Security: { kind: 'human', publicKey: security.publicKey },
  Provider: { kind: 'agent', publicKey: provider.publicKey },
  Deployer: { kind: 'agent', publicKey: deployer.publicKey },
  CI: { kind: 'service', publicKey: ci.publicKey }
};

const charter = createSyntheticCharter({
  principals,
  agents: {
    ReleaseAgent: 'Deployer'
  },
  policies: {
    EvidencePermit: {
      authority_kind: 'Permit',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000,
      requires_evidence: ['BuildVerified']
    },
    ProductionRelease: {
      authority_kind: 'Quorum',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000,
      requires_evidence: ['BuildVerified'],
      members: ['Operator', 'Security', 'Provider'],
      threshold: 2,
      humans: 1,
      advisor: 'RiskAdvisor'
    },
    HumanGuarded: {
      authority_kind: 'Quorum',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000,
      requires_evidence: ['BuildVerified'],
      members: ['Provider', 'Deployer', 'Security'],
      threshold: 2,
      humans: 1
    }
  },
  verifiers: {
    BuildVerified: {
      source: 'ci.build',
      signers: ['CI'],
      freshness_ms: 10_000
    },
    RuntimeBuild: {
      source: 'op:build',
      signers: ['CI'],
      freshness_ms: 10_000
    }
  }
}, root.privateKey);

const trustedRoots = [root.publicKey];
const DEPLOY_DIGEST = operationDigestPraxis({
  action: 'Deploy',
  scope: 'Production',
  args: ['artifact']
});
const OTHER_DEPLOY_DIGEST = operationDigestPraxis({
  action: 'Deploy',
  scope: 'Production',
  args: ['other-artifact']
});

function buildObservation({
  source = 'ci.build',
  value = 'artifact',
  issuedAt = BASE,
  principal = 'CI',
  privateKey = ci.privateKey,
  nonce = 'fixture-observation'
} = {}) {
  return createHostObservation({
    source,
    value,
    issuedAt,
    principal,
    privateKey,
    nonce
  });
}

function verifiedBuild({
  observation = buildObservation(),
  now = BASE + 1_000,
  verifierName = 'BuildVerified'
} = {}) {
  return verifyHostObservation({
    observation,
    verifierName,
    charter,
    trustedRootKeys: trustedRoots,
    now
  });
}

function releaseRequest({
  evidence,
  requester = 'ReleaseAgent',
  operationDigest = DEPLOY_DIGEST,
  nonce = 'release-request',
  expiresAt = BASE + 30_000,
  policyName = 'ProductionRelease'
}) {
  return createApprovalRequest({
    charter,
    policyName,
    operationDigest,
    evidence,
    requester,
    nonce,
    expiresAt
  });
}

function approval(request, principal, privateKey) {
  return signApprovalRequest({ request, principal, privateKey });
}

function allowAdvisor() {
  return {
    RiskAdvisor: async () => ({ ok: true, deny: false })
  };
}

function durablePreparer(advance = null) {
  return async request => {
    advance?.();
    return {
      ok: true,
      evidence: {
        durable: true,
        operation_digest: request.operation.operation_digest,
        preparation_digest: PREPARATION_DIGEST
      }
    };
  };
}

async function completedExecutor(request) {
  return {
    status: 'completed',
    receipt: {
      operation_digest: request.operation.operation_digest,
      preparation_digest: request.preparation.preparation_digest,
      executor: 'synthetic-charter-test'
    }
  };
}

async function durableCompleter(request) {
  return {
    ok: true,
    evidence: {
      durable: true,
      operation_digest: request.operation_digest,
      preparation_digest: request.preparation_digest,
      completion_ref: 'synthetic:charter-test'
    }
  };
}

const RELEASE_SOURCE = [
  'requires quorum gate: Deploy @ Production threshold 2 of Operator, Security, Provider;',
  'op release = Deploy("artifact") @ Production;',
  'authorize release using gate as armed;',
  'prepare armed as prepared;',
  'commit prepared as receipt;'
].join('\n');

test('signed charter can pin the exact reviewed IR while hostile resealed IR is refused', async () => {
  const source = [
    'op release = Deploy("artifact") @ Production;'
  ].join('\n');
  const reviewed = compile(source);
  const pinnedCharter = createSyntheticCharter({
    principals,
    programDigests: [reviewed.digest]
  }, root.privateKey);

  const accepted = await run(source, {
    charter: pinnedCharter,
    trustedCharterKeys: trustedRoots
  });
  assert.equal(accepted.values.release.kind, 'Operation');

  const edited = structuredClone(reviewed);
  edited.instructions.find(instruction => instruction.op === 'PLAN').args = [
    { kind: 'literal', value: 'artifact:unreviewed' }
  ];
  edited.digest = irDigestPraxis(edited);

  await assert.rejects(
    () => run(edited, {
      charter: pinnedCharter,
      trustedCharterKeys: trustedRoots
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_PROGRAM_UNPINNED'
  );
});

test('signed synthetic charter verifies against its trusted root', () => {
  const result = verifySyntheticCharter(charter, trustedRoots);
  assert.equal(result.digest, charter.digest);
  assert.equal(result.body.policies.ProductionRelease.def.threshold, 2);
});

test('editing a charter-pinned policy is refused even before signature trust can help it', () => {
  const forged = structuredClone(charter);
  forged.body.policies.ProductionRelease.def.threshold = 1;

  assert.throws(
    () => verifySyntheticCharter(forged, trustedRoots),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_UNPINNED'
  );
});

test('one public key cannot occupy multiple charter principal seats', () => {
  assert.throws(
    () => createSyntheticCharter({
      principals: {
        A: { kind: 'human', publicKey: operator.publicKey },
        B: { kind: 'human', publicKey: operator.publicKey }
      }
    }, root.privateKey),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_CHARTER_KEYS'
  );
});

test('signed observation becomes verified evidence only under its pinned origin and signer', () => {
  const verified = verifiedBuild();
  assert.equal(verified.kind, 'Verified');
  assert.equal(verified.value, 'artifact');
  assert.equal(verified.provenance, 'ci.build');
  assert.equal(verified.verifier_name, 'BuildVerified');
  assert.equal(verified.valid_until_ms, BASE + 10_000);
});

test('wrong-origin signed observation cannot be laundered through a runtime verifier', () => {
  const echo = buildObservation({ source: 'op:echo', nonce: 'echo' });

  assert.throws(
    () => verifyHostObservation({
      observation: echo,
      verifierName: 'RuntimeBuild',
      charter,
      trustedRootKeys: trustedRoots,
      now: BASE + 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_VERIFIER_ORIGIN'
  );
});

test('verified evidence expires and cannot be re-verified after freshness', () => {
  assert.throws(
    () => verifyHostObservation({
      observation: buildObservation(),
      verifierName: 'BuildVerified',
      charter,
      trustedRootKeys: trustedRoots,
      now: BASE + 10_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EVIDENCE_STALE'
  );
});

test('runtime source verification consumes the signed observation without a requester-supplied granting callback', async () => {
  const observation = buildObservation();
  const source = [
    'observe build = "artifact" from "ci.build";',
    'verify checked = build with BuildVerified;'
  ].join('\n');

  const result = await run(source, {
    observations: { 'ci.build': observation },
    charter,
    trustedCharterKeys: trustedRoots,
    now: BASE + 1_000
  });

  assert.equal(result.values.checked.kind, 'Verified');
  assert.equal(result.values.checked.verifier_name, 'BuildVerified');
});

test('legacy program-asserted Verified data cannot satisfy chartered authority evidence', async () => {
  const source = [
    'observe build = "artifact" from "ci.build";',
    'verify checked = build with BuildVerified;'
  ].join('\n');

  const legacy = await run(source, {
    verifiers: {
      BuildVerified: async () => ({ ok: true, evidence: 'legacy-host-callback' })
    },
    now: BASE + 1_000
  });

  assert.equal(legacy.values.checked.kind, 'Verified');

  await assert.rejects(
    () => createCharteredHostPermit({
      id: 'permit:legacy-assertion',
      charter,
      trustedRootKeys: trustedRoots,
      policyName: 'EvidencePermit',
      operationDigest: DEPLOY_DIGEST,
      evidence: [legacy.values.checked],
      requester: 'ReleaseAgent',
      now: BASE + 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EVIDENCE_REQUIRED'
  );
});

test('an Assessment object cannot satisfy an authority evidence premise', async () => {
  await assert.rejects(
    () => createCharteredHostPermit({
      id: 'permit:assessment',
      charter,
      trustedRootKeys: trustedRoots,
      policyName: 'EvidencePermit',
      operationDigest: DEPLOY_DIGEST,
      evidence: [{ kind: 'Assessment', value: 'low' }],
      requester: 'ReleaseAgent',
      now: BASE + 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EVIDENCE_REQUIRED'
  );
});

test('pinned advisor is fail-closed when missing and can only veto', async () => {
  const evidence = [verifiedBuild()];
  const request = releaseRequest({ evidence });
  const approvals = [
    approval(request, 'Operator', operator.privateKey),
    approval(request, 'Security', security.privateKey)
  ];

  await assert.rejects(
    () => createCharteredHostQuorum({
      id: 'quorum:no-advisor',
      charter,
      trustedRootKeys: trustedRoots,
      policyName: 'ProductionRelease',
      operationDigest: DEPLOY_DIGEST,
      evidence,
      requester: 'ReleaseAgent',
      request,
      approvals,
      now: BASE + 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_ADVISOR_REQUIRED'
  );

  await assert.rejects(
    () => createCharteredHostQuorum({
      id: 'quorum:veto',
      charter,
      trustedRootKeys: trustedRoots,
      policyName: 'ProductionRelease',
      operationDigest: DEPLOY_DIGEST,
      evidence,
      requester: 'ReleaseAgent',
      request,
      approvals,
      advisors: {
        RiskAdvisor: async () => ({ ok: true, deny: true })
      },
      now: BASE + 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_POLICY_VETO'
  );
});

test('cryptographic quorum binds the exact plan, evidence, requester, nonce and expiry', async () => {
  const evidence = [verifiedBuild()];
  const request = releaseRequest({ evidence, nonce: 'exact-request' });
  const gate = await createCharteredHostQuorum({
    id: 'quorum:release',
    charter,
    trustedRootKeys: trustedRoots,
    policyName: 'ProductionRelease',
    operationDigest: DEPLOY_DIGEST,
    evidence,
    requester: 'ReleaseAgent',
    request,
    approvals: [
      approval(request, 'Operator', operator.privateKey),
      approval(request, 'Security', security.privateKey)
    ],
    advisors: allowAdvisor(),
    now: BASE + 1_000
  });

  const result = await run(RELEASE_SOURCE, {
    authorities: { gate },
    charter,
    trustedCharterKeys: trustedRoots,
    now: BASE + 2_000,
    preparer: durablePreparer(),
    executor: completedExecutor,
    completer: durableCompleter
  });

  assert.equal(result.values.receipt.kind, 'Receipt');
  assert.equal(result.values.gate.policy_name, 'ProductionRelease');
  assert.deepEqual(result.values.gate.approved_by, ['Operator', 'Security']);
});

test('approval signatures cannot replay onto another plan', async () => {
  const evidence = [verifiedBuild()];
  const request = releaseRequest({ evidence, nonce: 'plan-a' });
  const approvals = [
    approval(request, 'Operator', operator.privateKey),
    approval(request, 'Security', security.privateKey)
  ];

  await assert.rejects(
    () => createCharteredHostQuorum({
      id: 'quorum:replay',
      charter,
      trustedRootKeys: trustedRoots,
      policyName: 'ProductionRelease',
      operationDigest: OTHER_DEPLOY_DIGEST,
      evidence,
      requester: 'ReleaseAgent',
      request,
      approvals,
      advisors: allowAdvisor(),
      now: BASE + 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_QUORUM'
  );
});

test('requester cannot approve its own authority request', async () => {
  const evidence = [verifiedBuild()];
  const request = releaseRequest({
    evidence,
    requester: 'Operator',
    nonce: 'self-approval'
  });

  await assert.rejects(
    () => createCharteredHostQuorum({
      id: 'quorum:self',
      charter,
      trustedRootKeys: trustedRoots,
      policyName: 'ProductionRelease',
      operationDigest: DEPLOY_DIGEST,
      evidence,
      requester: 'Operator',
      request,
      approvals: [
        approval(request, 'Operator', operator.privateKey),
        approval(request, 'Security', security.privateKey)
      ],
      advisors: allowAdvisor(),
      now: BASE + 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_QUORUM'
  );
});

test('human-minimum quorum cannot be satisfied by two AI principals', async () => {
  const evidence = [verifiedBuild()];
  const request = createApprovalRequest({
    charter,
    policyName: 'HumanGuarded',
    operationDigest: DEPLOY_DIGEST,
    evidence,
    requester: 'Operator',
    nonce: 'human-minimum',
    expiresAt: BASE + 30_000
  });

  await assert.rejects(
    () => createCharteredHostQuorum({
      id: 'quorum:agents-only',
      charter,
      trustedRootKeys: trustedRoots,
      policyName: 'HumanGuarded',
      operationDigest: DEPLOY_DIGEST,
      evidence,
      requester: 'Operator',
      request,
      approvals: [
        approval(request, 'Provider', provider.privateKey),
        approval(request, 'Deployer', deployer.privateKey)
      ],
      now: BASE + 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_QUORUM'
  );
});

test('tampered approval signature is refused', async () => {
  const evidence = [verifiedBuild()];
  const request = releaseRequest({ evidence, nonce: 'bad-signature' });
  const bad = {
    ...approval(request, 'Operator', operator.privateKey),
    signature: Buffer.from('not-a-valid-ed25519-signature').toString('base64')
  };

  await assert.rejects(
    () => createCharteredHostQuorum({
      id: 'quorum:bad-signature',
      charter,
      trustedRootKeys: trustedRoots,
      policyName: 'ProductionRelease',
      operationDigest: DEPLOY_DIGEST,
      evidence,
      requester: 'ReleaseAgent',
      request,
      approvals: [
        bad,
        approval(request, 'Security', security.privateKey)
      ],
      advisors: allowAdvisor(),
      now: BASE + 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_QUORUM'
  );
});

test('governed IR cannot weaken a chartered 2-of-3 quorum to 1-of-3', async () => {
  const evidence = [verifiedBuild()];
  const request = releaseRequest({ evidence, nonce: 'weakened-ir' });
  const gate = await createCharteredHostQuorum({
    id: 'quorum:pinned',
    charter,
    trustedRootKeys: trustedRoots,
    policyName: 'ProductionRelease',
    operationDigest: DEPLOY_DIGEST,
    evidence,
    requester: 'ReleaseAgent',
    request,
    approvals: [
      approval(request, 'Operator', operator.privateKey),
      approval(request, 'Security', security.privateKey)
    ],
    advisors: allowAdvisor(),
    now: BASE + 1_000
  });
  const weakened = [
    'requires quorum gate: Deploy @ Production threshold 1 of Operator, Security, Provider;',
    'op release = Deploy("artifact") @ Production;',
    'authorize release using gate as armed;'
  ].join('\n');

  await assert.rejects(
    () => run(weakened, {
      authorities: { gate },
      charter,
      trustedCharterKeys: trustedRoots,
      now: BASE + 2_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_QUORUM_MISMATCH'
  );
});

test('chartered authority cannot be used without its trusted charter', async () => {
  const evidence = [verifiedBuild()];
  const permit = await createCharteredHostPermit({
    id: 'permit:chartered',
    charter,
    trustedRootKeys: trustedRoots,
    policyName: 'EvidencePermit',
    operationDigest: DEPLOY_DIGEST,
    evidence,
    requester: 'ReleaseAgent',
    now: BASE + 1_000
  });
  const source = [
    'requires permit p: Deploy @ Production;',
    'op release = Deploy("artifact") @ Production;',
    'authorize release using p as armed;'
  ].join('\n');

  await assert.rejects(
    () => run(source, {
      authorities: { p: permit },
      now: BASE + 2_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_CHARTER_REQUIRED'
  );
});

test('evidence freshness is re-checked immediately before synthetic execution', async () => {
  const evidence = [verifiedBuild()];
  const request = releaseRequest({
    evidence,
    nonce: 'stale-at-commit',
    expiresAt: BASE + 50_000
  });
  const gate = await createCharteredHostQuorum({
    id: 'quorum:stale-at-commit',
    charter,
    trustedRootKeys: trustedRoots,
    policyName: 'ProductionRelease',
    operationDigest: DEPLOY_DIGEST,
    evidence,
    requester: 'ReleaseAgent',
    request,
    approvals: [
      approval(request, 'Operator', operator.privateKey),
      approval(request, 'Security', security.privateKey)
    ],
    advisors: allowAdvisor(),
    now: BASE + 1_000
  });

  let nowMs = BASE + 2_000;
  let executorCalls = 0;
  await assert.rejects(
    () => run(RELEASE_SOURCE, {
      authorities: { gate },
      charter,
      trustedCharterKeys: trustedRoots,
      now: () => nowMs,
      preparer: durablePreparer(() => {
        nowMs = BASE + 11_000;
      }),
      executor: async requestBody => {
        executorCalls += 1;
        return completedExecutor(requestBody);
      },
      completer: durableCompleter
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EVIDENCE_STALE'
  );

  assert.equal(executorCalls, 0);
});

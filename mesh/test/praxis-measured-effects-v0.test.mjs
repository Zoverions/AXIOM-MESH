import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  PraxisRuntimeError,
  PraxisTypeError,
  compile,
  createCharteredHostPermit,
  createHostOperationRegistry,
  createHostPermit,
  createHostPreparedRef,
  createHostSecretRef,
  createOperationDescriptorPraxis,
  createSyntheticCharter,
  irDigestPraxis,
  run
} from '../../labs/praxis/index.mjs';

const PREPARATION_DIGEST = 'sha256:' + 'd'.repeat(64);

function keypair() {
  return generateKeyPairSync('ed25519');
}

const root = keypair();
const deployer = keypair();

const principals = {
  Deployer: { kind: 'agent', publicKey: deployer.publicKey }
};

const registry = createHostOperationRegistry({
  Deploy: {
    action: 'Deploy',
    scope: 'Production',
    effect: 'deploy_release',
    irreversible: false,
    egress: 'provider:prod'
  },
  Destroy: {
    action: 'Destroy',
    scope: 'Production',
    effect: 'destructive_delete',
    irreversible: true,
    egress: 'provider:prod'
  },
  Sign: {
    action: 'Sign',
    scope: 'Local',
    effect: 'sign_artifact',
    irreversible: false,
    egress: null
  }
});

const charter = createSyntheticCharter({
  principals,
  agents: {
    ReleaseAgent: 'Deployer'
  },
  effectEnvelopes: {
    Deployer: ['deploy_release', 'destructive_delete', 'sign_artifact']
  },
  policies: {
    DeployPolicy: {
      authority_kind: 'Permit',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000
    },
    DestroyPolicy: {
      authority_kind: 'Permit',
      action: 'Destroy',
      scope: 'Production',
      expires_ms: 60_000
    },
    SignPolicy: {
      authority_kind: 'Permit',
      action: 'Sign',
      scope: 'Local',
      expires_ms: 60_000
    }
  }
}, root.privateKey);

const restrictedCharter = createSyntheticCharter({
  principals,
  agents: {
    ReleaseAgent: 'Deployer'
  },
  effectEnvelopes: {
    Deployer: ['deploy_release']
  },
  policies: {
    DestroyPolicy: {
      authority_kind: 'Permit',
      action: 'Destroy',
      scope: 'Production',
      expires_ms: 60_000
    }
  }
}, root.privateKey);

const noEnvelopeCharter = createSyntheticCharter({
  principals,
  agents: {
    ReleaseAgent: 'Deployer'
  },
  policies: {
    DeployPolicy: {
      authority_kind: 'Permit',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000
    }
  }
}, root.privateKey);

const trustedRoots = [root.publicKey];

function measuredOperation({
  action = 'Deploy',
  scope = 'Production',
  args = ['artifact'],
  effect = 'deploy_release',
  irreversible = false,
  egress = 'provider:prod',
  hostOperation = action,
  secretReferences = []
} = {}) {
  return createOperationDescriptorPraxis({
    action,
    scope,
    args,
    effect,
    irreversible,
    egress,
    hostOperation,
    secretReferences
  });
}

async function permitFor({
  policyName = 'DeployPolicy',
  operation = measuredOperation(),
  activeCharter = charter
} = {}) {
  return createCharteredHostPermit({
    id: 'permit:' + policyName + ':' + Math.random(),
    charter: activeCharter,
    trustedRootKeys: trustedRoots,
    policyName,
    operation,
    requester: 'ReleaseAgent',
    now: 1_000
  });
}

function durablePreparer() {
  return async request => ({
    ok: true,
    evidence: {
      durable: true,
      operation_digest: request.operation.operation_digest,
      preparation_digest: PREPARATION_DIGEST
    }
  });
}

function executor(counter = null) {
  return async request => {
    if (counter) counter.count += 1;
    return {
      status: 'completed',
      receipt: {
        operation_digest: request.operation.operation_digest,
        preparation_digest: request.preparation.preparation_digest,
        ...(request.operation.effect === undefined ? {} : { finality: request.finality }),
        executor: 'synthetic-measured-effect-test'
      }
    };
  };
}

function completer() {
  return async request => ({
    ok: true,
    evidence: {
      durable: true,
      operation_digest: request.operation_digest,
      preparation_digest: request.preparation_digest,
      ...(request.finality === undefined ? {} : { finality: request.finality }),
      completion_ref: 'synthetic:measured-effect-test'
    }
  });
}

function craft(source, mutate) {
  const ir = structuredClone(compile(source));
  mutate(ir);
  ir.digest = irDigestPraxis(ir);
  return ir;
}

const DEPLOY_SOURCE = [
  'requires permit gate: Deploy @ Production;',
  'op release = Deploy("artifact") @ Production effect deploy_release egress "provider:prod";',
  'authorize release using gate as armed;',
  'prepare armed as prepared;',
  'commit prepared as receipt;'
].join('\n');

const DESTROY_SOURCE = [
  'requires permit gate: Destroy @ Production;',
  'op erase = Destroy("artifact") @ Production effect destructive_delete irreversible egress "provider:prod";',
  'authorize erase using gate as armed;',
  'prepare armed as prepared;',
  'finalize prepared as receipt;'
].join('\n');

test('measured reversible effect commits under matching registry and charter envelope', async () => {
  const operation = measuredOperation();
  const gate = await permitFor({ operation });

  const result = await run(DEPLOY_SOURCE, {
    authorities: { gate },
    charter,
    trustedCharterKeys: trustedRoots,
    hostOperations: registry,
    now: 2_000,
    preparer: durablePreparer(),
    executor: executor(),
    completer: completer()
  });

  assert.equal(result.values.release.effect, 'deploy_release');
  assert.equal(result.values.release.irreversible, false);
  assert.equal(result.values.receipt.finality, 'commit');
});

test('measured irreversible effect requires finalize and succeeds with matching envelope', async () => {
  const operation = measuredOperation({
    action: 'Destroy',
    effect: 'destructive_delete',
    irreversible: true
  });
  const gate = await permitFor({
    policyName: 'DestroyPolicy',
    operation
  });

  const result = await run(DESTROY_SOURCE, {
    authorities: { gate },
    charter,
    trustedCharterKeys: trustedRoots,
    hostOperations: registry,
    now: 2_000,
    preparer: durablePreparer(),
    executor: executor(),
    completer: completer()
  });

  assert.equal(result.values.erase.irreversible, true);
  assert.equal(result.values.receipt.finality, 'finalize');
});

test('source cannot relabel a host-measured destructive effect as harmless', async () => {
  const source = [
    'op erase = Destroy("artifact") @ Production effect harmless egress "provider:prod";'
  ].join('\n');

  await assert.rejects(
    () => run(source, { hostOperations: registry }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_LINK_MISMATCH'
  );
});

test('source-declared measured effect requires a host registry', async () => {
  await assert.rejects(
    () => run('op release = Deploy("artifact") @ Production effect deploy_release egress "provider:prod";'),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_OPERATION_REQUIRED'
  );
});

test('host registry missing an effectful operation fails closed', async () => {
  const empty = createHostOperationRegistry({});

  await assert.rejects(
    () => run(
      'op release = Deploy("artifact") @ Production effect deploy_release egress "provider:prod";',
      { hostOperations: empty }
    ),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_OPERATION_REQUIRED'
  );
});

test('host operation registry rejects hidden or incomplete contract fields', () => {
  assert.throws(
    () => createHostOperationRegistry({
      Deploy: {
        action: 'Deploy',
        scope: 'Production',
        effect: 'deploy_release',
        irreversible: false,
        egress: 'provider:prod',
        hidden_authority: true
      }
    }),
    TypeError
  );

  assert.throws(
    () => createHostOperationRegistry({
      Deploy: {
        action: 'Deploy',
        scope: 'Production',
        effect: 'deploy_release',
        egress: 'provider:prod'
      }
    }),
    TypeError
  );

  assert.throws(
    () => createHostOperationRegistry({
      Deploy: {
        action: 'Deploy',
        scope: 'Production',
        effect: 'deploy_release',
        irreversible: false
      }
    }),
    TypeError
  );
});

test('measured operation descriptor requires explicit finality and egress metadata', () => {
  assert.throws(
    () => createOperationDescriptorPraxis({
      action: 'Deploy',
      scope: 'Production',
      args: ['artifact'],
      effect: 'deploy_release',
      egress: 'provider:prod'
    }),
    TypeError
  );

  assert.throws(
    () => createOperationDescriptorPraxis({
      action: 'Deploy',
      scope: 'Production',
      args: ['artifact'],
      effect: 'deploy_release',
      irreversible: false
    }),
    TypeError
  );
});

test('ambiguous host operation mapping fails closed', async () => {
  const ambiguous = createHostOperationRegistry({
    DeployPrimary: {
      action: 'Deploy',
      scope: 'Production',
      effect: 'deploy_release',
      irreversible: false,
      egress: 'provider:prod'
    },
    DeploySecondary: {
      action: 'Deploy',
      scope: 'Production',
      effect: 'deploy_release_backup',
      irreversible: false,
      egress: 'provider:backup'
    }
  });

  await assert.rejects(
    () => run(
      'op release = Deploy("artifact") @ Production effect deploy_release egress "provider:prod";',
      { hostOperations: ambiguous }
    ),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_OPERATION_AMBIGUOUS'
  );
});

test('host action/scope/effect/egress contract mismatch fails at link time', async () => {
  const wrong = createHostOperationRegistry({
    Deploy: {
      action: 'Deploy',
      scope: 'Production',
      effect: 'deploy_release',
      irreversible: false,
      egress: 'provider:staging'
    }
  });

  await assert.rejects(
    () => run(
      'op release = Deploy("artifact") @ Production effect deploy_release egress "provider:prod";',
      { hostOperations: wrong }
    ),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_LINK_MISMATCH'
  );
});

test('measured effects cannot execute under raw laboratory authority', async () => {
  const operation = measuredOperation();
  const gate = createHostPermit({
    id: 'permit:raw-measured',
    action: 'Deploy',
    scope: 'Production',
    operationDigest: operation.operation_digest
  });
  let prepareCalls = 0;

  await assert.rejects(
    () => run(DEPLOY_SOURCE, {
      authorities: { gate },
      hostOperations: registry,
      now: 2_000,
      preparer: async request => {
        prepareCalls += 1;
        return durablePreparer()(request);
      }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EFFECT_AUTHORITY_REQUIRED'
  );

  assert.equal(prepareCalls, 0);
});

test('measured chartered authority requires an explicit requester effect envelope', async () => {
  await assert.rejects(
    () => createCharteredHostPermit({
      id: 'permit:no-effect-envelope',
      charter: noEnvelopeCharter,
      trustedRootKeys: trustedRoots,
      policyName: 'DeployPolicy',
      operation: measuredOperation(),
      requester: 'ReleaseAgent',
      now: 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EFFECT_ENVELOPE_REQUIRED'
  );
});

test('signed effect envelope cannot downgrade to digest-only or unmeasured authority', async () => {
  const unmeasured = createOperationDescriptorPraxis({
    action: 'Deploy',
    scope: 'Production',
    args: ['artifact']
  });

  await assert.rejects(
    () => createCharteredHostPermit({
      id: 'permit:unmeasured-downgrade',
      charter,
      trustedRootKeys: trustedRoots,
      policyName: 'DeployPolicy',
      operation: unmeasured,
      requester: 'ReleaseAgent',
      now: 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EFFECT_REQUIRED'
  );

  await assert.rejects(
    () => createCharteredHostPermit({
      id: 'permit:digest-only-downgrade',
      charter,
      trustedRootKeys: trustedRoots,
      policyName: 'DeployPolicy',
      operationDigest: unmeasured.operation_digest,
      requester: 'ReleaseAgent',
      now: 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EFFECT_REQUIRED'
  );
});

test('charter effect envelope is a hard upper bound even when source declares the real effect', async () => {
  const operation = measuredOperation({
    action: 'Destroy',
    effect: 'destructive_delete',
    irreversible: true
  });

  await assert.rejects(
    () => permitFor({
      policyName: 'DestroyPolicy',
      operation,
      activeCharter: restrictedCharter
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EFFECT_ENVELOPE'
  );
});

test('tampering a signed charter to widen its effect envelope is refused', async () => {
  const tampered = structuredClone(restrictedCharter);
  tampered.body.effect_envelopes.Deployer.push('destructive_delete');
  tampered.body.effect_envelopes.Deployer.sort();

  await assert.rejects(
    () => createCharteredHostPermit({
      id: 'permit:tampered-envelope',
      charter: tampered,
      trustedRootKeys: trustedRoots,
      policyName: 'DestroyPolicy',
      operation: measuredOperation({
        action: 'Destroy',
        effect: 'destructive_delete',
        irreversible: true
      }),
      requester: 'ReleaseAgent',
      now: 1_000
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_CHARTER_SIGNATURE'
  );
});

test('compiler rejects commit for statically declared irreversible effect', () => {
  assert.throws(
    () => compile([
      'requires permit gate: Destroy @ Production;',
      'op erase = Destroy("artifact") @ Production effect destructive_delete irreversible egress "provider:prod";',
      'authorize erase using gate as armed;',
      'prepare armed as prepared;',
      'commit prepared as receipt;'
    ].join('\n')),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE'
  );
});

test('compiler rejects finalize for statically reversible effect', () => {
  assert.throws(
    () => compile([
      'requires permit gate: Deploy @ Production;',
      'op release = Deploy("artifact") @ Production effect deploy_release egress "provider:prod";',
      'authorize release using gate as armed;',
      'prepare armed as prepared;',
      'finalize prepared as receipt;'
    ].join('\n')),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_FINALIZE_REQUIRES_IRREVERSIBLE'
  );
});

test('hostile resealed IR cannot switch irreversible finalize to commit', async () => {
  const ir = craft(DESTROY_SOURCE, module => {
    module.instructions.find(instruction => instruction.op === 'FINALIZE').op = 'COMMIT';
  });
  const gate = await permitFor({
    policyName: 'DestroyPolicy',
    operation: measuredOperation({
      action: 'Destroy',
      effect: 'destructive_delete',
      irreversible: true
    })
  });
  const calls = { count: 0 };

  await assert.rejects(
    () => run(ir, {
      authorities: { gate },
      charter,
      trustedCharterKeys: trustedRoots,
      hostOperations: registry,
      now: 2_000,
      preparer: durablePreparer(),
      executor: executor(calls),
      completer: completer()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE'
  );

  assert.equal(calls.count, 0);
});

test('hostile resealed IR cannot relabel measured effect or finality metadata', async () => {
  const source = [
    'op erase = Destroy("artifact") @ Production effect destructive_delete irreversible egress "provider:prod";'
  ].join('\n');
  const ir = craft(source, module => {
    const plan = module.instructions.find(instruction => instruction.op === 'PLAN');
    plan.declared_effect = 'deploy_release';
    plan.declared_irreversible = false;
  });

  await assert.rejects(
    () => run(ir, { hostOperations: registry }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_LINK_MISMATCH'
  );
});

test('secret egress declaration cannot disagree with host measurement', async () => {
  const source = [
    'requires secret key: SigningCredential;',
    'op sign = Sign("digest") @ Local effect sign_artifact egress "remote:signer" using secrets key;'
  ].join('\n');

  await assert.rejects(
    () => run(source, {
      hostOperations: registry,
      secrets: {
        key: createHostSecretRef({
          id: 'secret:signing',
          kind: 'SigningCredential'
        })
      }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_LINK_MISMATCH'
  );
});

test('executor receipt must preserve measured terminal finality', async () => {
  const gate = await permitFor({
    policyName: 'DestroyPolicy',
    operation: measuredOperation({
      action: 'Destroy',
      effect: 'destructive_delete',
      irreversible: true
    })
  });

  await assert.rejects(
    () => run(DESTROY_SOURCE, {
      authorities: { gate },
      charter,
      trustedCharterKeys: trustedRoots,
      hostOperations: registry,
      now: 2_000,
      preparer: durablePreparer(),
      executor: async request => ({
        status: 'completed',
        receipt: {
          operation_digest: request.operation.operation_digest,
          preparation_digest: request.preparation.preparation_digest,
          finality: 'commit'
        }
      }),
      completer: completer()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EXTERNAL_RECEIPT_UNVERIFIED'
  );
});

test('completion evidence must preserve measured terminal finality', async () => {
  const gate = await permitFor({
    policyName: 'DestroyPolicy',
    operation: measuredOperation({
      action: 'Destroy',
      effect: 'destructive_delete',
      irreversible: true
    })
  });

  await assert.rejects(
    () => run(DESTROY_SOURCE, {
      authorities: { gate },
      charter,
      trustedCharterKeys: trustedRoots,
      hostOperations: registry,
      now: 2_000,
      preparer: durablePreparer(),
      executor: executor(),
      completer: async request => ({
        ok: true,
        evidence: {
          durable: true,
          operation_digest: request.operation_digest,
          preparation_digest: request.preparation_digest,
          finality: 'commit'
        }
      })
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_COMPLETION_EVIDENCE_INVALID'
  );
});

test('prepared replay cannot change irreversible finalize into commit and requires registry', async () => {
  const gate = await permitFor({
    policyName: 'DestroyPolicy',
    operation: measuredOperation({
      action: 'Destroy',
      effect: 'destructive_delete',
      irreversible: true
    })
  });

  const prepareOnly = [
    'requires permit gate: Destroy @ Production;',
    'op erase = Destroy("artifact") @ Production effect destructive_delete irreversible egress "provider:prod";',
    'authorize erase using gate as armed;',
    'prepare armed as prepared;'
  ].join('\n');

  const preparedRun = await run(prepareOnly, {
    authorities: { gate },
    charter,
    trustedCharterKeys: trustedRoots,
    hostOperations: registry,
    now: 2_000,
    preparer: durablePreparer()
  });
  const prepared = preparedRun.values.prepared;
  const ref = createHostPreparedRef({
    id: 'prepared:irreversible',
    action: 'Destroy',
    scope: 'Production',
    operation: prepared.operation,
    authority: prepared.authority,
    preparation: prepared.preparation
  });

  const commitReplay = [
    'requires prepared prior: Destroy @ Production;',
    'commit prior as receipt;'
  ].join('\n');

  let calls = 0;
  await assert.rejects(
    () => run(commitReplay, {
      prepared: { prior: ref },
      charter,
      trustedCharterKeys: trustedRoots,
      hostOperations: registry,
      now: 2_000,
      executor: async request => {
        calls += 1;
        return executor()(request);
      },
      completer: completer()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE'
  );
  assert.equal(calls, 0);

  const finalizeReplay = [
    'requires prepared prior: Destroy @ Production;',
    'finalize prior as receipt;'
  ].join('\n');

  await assert.rejects(
    () => run(finalizeReplay, {
      prepared: { prior: ref },
      charter,
      trustedCharterKeys: trustedRoots,
      now: 2_000,
      executor: executor(),
      completer: completer()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_OPERATION_REQUIRED'
  );

  const result = await run(finalizeReplay, {
    prepared: { prior: ref },
    charter,
    trustedCharterKeys: trustedRoots,
    hostOperations: registry,
    now: 2_000,
    executor: executor(),
    completer: completer()
  });

  assert.equal(result.values.receipt.finality, 'finalize');
});

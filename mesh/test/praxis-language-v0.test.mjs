import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PraxisRuntimeError,
  PraxisTypeError,
  compile,
  createHostLease,
  createHostPermit,
  createHostPreparedRef,
  createHostQuorum,
  createHostSecretRef,
  run
} from '../../labs/praxis/index.mjs';

const PREPARATION_DIGEST = `sha256:${'a'.repeat(64)}`;

const minimal = `
requires permit deploy_prod: Deploy @ Production;
op release = Deploy("artifact:sha256:abc") @ Production;
authorize release using deploy_prod as armed_release;
prepare armed_release as prepared_release;
commit prepared_release as release_receipt;
`;

function durablePreparer(order = null) {
  return async request => {
    order?.push('prepare');
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

function completedExecutor(order = null) {
  return async request => {
    order?.push('execute');
    return {
      status: 'completed',
      receipt: {
        operation_digest: request.operation.operation_digest,
        preparation_digest: request.preparation.preparation_digest,
        executor: 'synthetic-test-only'
      }
    };
  };
}

function durableCompleter(order = null) {
  return async request => {
    order?.push('complete');
    return {
      ok: true,
      evidence: {
        durable: true,
        operation_digest: request.operation_digest,
        preparation_digest: request.preparation_digest,
        completion_ref: 'synthetic:test'
      }
    };
  };
}

test('Praxis compiles knowledge/operation/authority/preparation stages into inspectable IR', () => {
  const ir = compile(`
requires permit deploy_prod: Deploy @ Production;
observe source = "sha256:abc" from "git:main";
verify verified_source = source with GitIntegrity;
assess candidate = verified_source with ReleasePolicy;
op release = Deploy(verified_source) @ Production;
authorize release using deploy_prod as armed_release;
prepare armed_release as prepared_release;
commit prepared_release as receipt;
`);

  assert.equal(ir.schema, 'praxis-ir.v0');
  assert.deepEqual(
    ir.instructions.map(instruction => instruction.op),
    [
      'REQUIRE_PERMIT',
      'OBSERVE',
      'VERIFY',
      'ASSESS',
      'PLAN',
      'AUTHORIZE',
      'PREPARE',
      'COMMIT'
    ]
  );
  assert.deepEqual(ir.required_permits, [{
    name: 'deploy_prod',
    authority_kind: 'Permit',
    action: 'Deploy',
    scope: 'Production'
  }]);
  assert.equal(ir.bindings.candidate.kind, 'Assessment');
  assert.equal(ir.bindings.release.kind, 'Operation');
  assert.equal(ir.bindings.armed_release.kind, 'AuthorizedOperation');
  assert.equal(ir.bindings.prepared_release.kind, 'PreparedOperation');
  assert.equal(ir.bindings.receipt.kind, 'Receipt');
});

test('Praxis rejects commit before durable preparation', () => {
  assert.throws(
    () => compile(`
requires permit deploy_prod: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using deploy_prod as armed;
commit armed as receipt;
`),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_COMMIT_REQUIRES_PREPARATION'
  );
});

test('Praxis rejects preparing an inert operation', () => {
  assert.throws(
    () => compile(`
op release = Deploy("artifact") @ Production;
prepare release as prepared;
`),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_PREPARE_REQUIRES_AUTHORITY'
  );
});

test('Praxis does not permit an assessment to become authority', () => {
  assert.throws(
    () => compile(`
observe evidence = "safe" from "fixture";
assess opinion = evidence with SafetyModel;
op release = Deploy(evidence) @ Production;
authorize release using opinion as armed;
`),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_AUTHORIZE_REQUIRES_PERMIT'
  );
});

test('Praxis rejects action or scope substitution', () => {
  assert.throws(
    () => compile(`
requires permit staging_restart: Restart @ Staging;
op release = Deploy("artifact") @ Production;
authorize release using staging_restart as armed;
`),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_AUTHORITY_MISMATCH'
  );
});

test('Praxis rejects static reuse of linear authority', () => {
  assert.throws(
    () => compile(`
requires permit deploy_prod: Deploy @ Production;
op first = Deploy("one") @ Production;
op second = Deploy("two") @ Production;
authorize first using deploy_prod as first_armed;
authorize second using deploy_prod as second_armed;
`),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_LINEAR_AUTHORITY_REUSE'
  );
});

test('Praxis rejects authority smuggling through operation arguments', () => {
  assert.throws(
    () => compile(`
requires permit deploy_prod: Deploy @ Production;
op leak = Log(deploy_prod) @ Audit;
`),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_AUTHORITY_EXFILTRATION'
  );
});

test('Praxis models secrets as opaque references, not ordinary values', async () => {
  const source = `
requires secret stripe_key: PaymentCredential;
op charge = Charge("order:123") @ Payments using secrets stripe_key;
`;
  const ir = compile(source);

  assert.deepEqual(ir.required_secrets, [{
    name: 'stripe_key',
    secret_kind: 'PaymentCredential'
  }]);
  assert.deepEqual(
    ir.instructions.map(instruction => instruction.op),
    ['REQUIRE_SECRET', 'PLAN']
  );

  const secretRef = createHostSecretRef({
    id: 'surrogate:stripe-production',
    kind: 'PaymentCredential'
  });
  const result = await run(source, {
    secrets: { stripe_key: secretRef }
  });

  assert.equal(result.values.stripe_key.kind, 'SecretRef');
  assert.equal(result.values.stripe_key.secret_ref_id, 'surrogate:stripe-production');
  assert.equal(Object.hasOwn(result.values.stripe_key, 'value'), false);
  assert.deepEqual(result.values.charge.secret_references, [{
    binding: 'stripe_key',
    secret_ref_id: 'surrogate:stripe-production',
    secret_kind: 'PaymentCredential'
  }]);
});

test('Praxis rejects secret references as ordinary operation arguments', () => {
  assert.throws(
    () => compile(`
requires secret stripe_key: PaymentCredential;
op leak = Log(stripe_key) @ Audit;
`),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_SECRET_EXFILTRATION'
  );
});

test('Praxis rejects forged or wrong-kind secret references from the host', async () => {
  const source = `
requires secret stripe_key: PaymentCredential;
op charge = Charge("order") @ Payments using secrets stripe_key;
`;

  await assert.rejects(
    () => run(source, {
      secrets: {
        stripe_key: {
          schema: 'praxis-host-secret-ref.v0',
          id: 'forged',
          kind: 'PaymentCredential'
        }
      }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_SECRET_REQUIRED'
  );

  const wrongKind = createHostSecretRef({
    id: 'surrogate:wrong',
    kind: 'SigningCredential'
  });
  await assert.rejects(
    () => run(source, {
      secrets: { stripe_key: wrongKind }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_SECRET_KIND_MISMATCH'
  );
});

test('Praxis refuses to execute when durable preparation is unavailable', async () => {
  const permit = createHostPermit({
    id: 'permit:no-preparer',
    action: 'Deploy',
    scope: 'Production'
  });

  await assert.rejects(
    () => run(minimal, {
      authorities: { deploy_prod: permit }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_PREPARER_REQUIRED'
  );
});

test('Praxis does not invoke the executor when durable preparation fails', async () => {
  const permit = createHostPermit({
    id: 'permit:prepare-fail',
    action: 'Deploy',
    scope: 'Production'
  });
  let executorCalls = 0;

  await assert.rejects(
    () => run(minimal, {
      authorities: { deploy_prod: permit },
      preparer: async () => {
        throw new Error('synthetic persistence loss');
      },
      executor: async () => {
        executorCalls += 1;
        return { status: 'uncertain' };
      },
      completer: durableCompleter()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_PREPARATION_UNCOMMITTED'
      && error.details?.executor_invoked === false
  );
  assert.equal(executorCalls, 0);
});

test('Praxis commit fails closed without an injected host executor after preparation', async () => {
  const permit = createHostPermit({
    id: 'permit:no-executor',
    action: 'Deploy',
    scope: 'Production'
  });

  await assert.rejects(
    () => run(minimal, {
      authorities: { deploy_prod: permit },
      preparer: durablePreparer()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EXECUTOR_REQUIRED'
  );
});

test('Praxis leaves an uncertain external outcome in prepared state', async () => {
  const permit = createHostPermit({
    id: 'permit:uncertain',
    action: 'Deploy',
    scope: 'Production'
  });

  await assert.rejects(
    () => run(minimal, {
      authorities: { deploy_prod: permit },
      preparer: durablePreparer(),
      executor: async () => ({ status: 'uncertain' }),
      completer: durableCompleter()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EXTERNAL_OUTCOME_UNCERTAIN'
      && error.details?.state === 'prepared'
      && error.details?.preparation_digest === PREPARATION_DIGEST
      && error.details?.completion_committed === false
  );
});

test('Praxis leaves an unverified receipt in prepared state', async () => {
  const permit = createHostPermit({
    id: 'permit:bad-receipt',
    action: 'Deploy',
    scope: 'Production'
  });

  await assert.rejects(
    () => run(minimal, {
      authorities: { deploy_prod: permit },
      preparer: durablePreparer(),
      executor: async request => ({
        status: 'completed',
        receipt: {
          operation_digest: request.operation.operation_digest,
          preparation_digest: `sha256:${'b'.repeat(64)}`
        }
      }),
      completer: durableCompleter()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EXTERNAL_RECEIPT_UNVERIFIED'
      && error.details?.state === 'prepared'
  );
});

test('Praxis keeps verified-but-uncommitted completion bound to the same preparation', async () => {
  const permit = createHostPermit({
    id: 'permit:completion-fail',
    action: 'Deploy',
    scope: 'Production'
  });

  await assert.rejects(
    () => run(minimal, {
      authorities: { deploy_prod: permit },
      preparer: durablePreparer(),
      executor: completedExecutor(),
      completer: async () => {
        throw new Error('synthetic completion persistence failure');
      }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_COMPLETION_UNCOMMITTED'
      && error.details?.state === 'prepared'
      && error.details?.preparation_digest === PREPARATION_DIGEST
  );
});

test('Praxis returns a receipt only after prepare, execute, and durable completion', async () => {
  const permit = createHostPermit({
    id: 'permit:success',
    action: 'Deploy',
    scope: 'Production'
  });
  const order = [];

  const result = await run(minimal, {
    authorities: { deploy_prod: permit },
    preparer: durablePreparer(order),
    executor: completedExecutor(order),
    completer: durableCompleter(order)
  });

  assert.deepEqual(order, ['prepare', 'execute', 'complete']);
  assert.equal(result.values.release.kind, 'Operation');
  assert.equal(result.values.armed_release.kind, 'AuthorizedOperation');
  assert.equal(result.values.prepared_release.kind, 'PreparedOperation');
  assert.equal(result.values.release_receipt.kind, 'Receipt');
  assert.equal(
    result.values.release_receipt.operation_digest,
    result.values.release.operation_digest
  );
  assert.equal(result.values.release_receipt.preparation_digest, PREPARATION_DIGEST);
  assert.equal(result.values.release_receipt.authority_id, 'permit:success');
  assert.equal(result.values.release_receipt.completion_evidence.durable, true);
});

test('Praxis compiles explicit threshold quorum authority', () => {
  const ir = compile(`
requires quorum release_gate: Deploy @ Production threshold 2 of Operator, Security, Provider;
op release = Deploy("artifact") @ Production;
authorize release using release_gate as armed;
prepare armed as prepared;
`);

  assert.deepEqual(
    ir.instructions.map(instruction => instruction.op),
    ['REQUIRE_QUORUM', 'PLAN', 'AUTHORIZE', 'PREPARE']
  );
  assert.deepEqual(ir.required_permits, [{
    name: 'release_gate',
    authority_kind: 'Quorum',
    action: 'Deploy',
    scope: 'Production',
    threshold: 2,
    members: ['Operator', 'Provider', 'Security']
  }]);
  assert.equal(ir.bindings.release_gate.kind, 'Quorum');
});

test('Praxis rejects invalid or duplicate quorum declarations', () => {
  assert.throws(
    () => compile(`
requires quorum release_gate: Deploy @ Production threshold 0 of Operator, Security;
`),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_INVALID_QUORUM'
  );

  assert.throws(
    () => compile(`
requires quorum release_gate: Deploy @ Production threshold 2 of Operator, Operator;
`),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_INVALID_QUORUM'
  );
});

test('Praxis quorum authority requires the exact declared membership and threshold', async () => {
  const source = `
requires quorum release_gate: Deploy @ Production threshold 2 of Operator, Security, Provider;
op release = Deploy("artifact") @ Production;
authorize release using release_gate as armed;
prepare armed as prepared;
`;

  const sufficient = createHostQuorum({
    id: 'quorum:release',
    action: 'Deploy',
    scope: 'Production',
    members: ['Security', 'Provider', 'Operator'],
    approvedBy: ['Operator', 'Security']
  });

  const result = await run(source, {
    authorities: { release_gate: sufficient },
    preparer: durablePreparer()
  });
  assert.equal(result.values.release_gate.kind, 'Quorum');
  assert.deepEqual(result.values.release_gate.approved_by, ['Operator', 'Security']);
  assert.equal(result.values.prepared.kind, 'PreparedOperation');

  const insufficient = createHostQuorum({
    id: 'quorum:insufficient',
    action: 'Deploy',
    scope: 'Production',
    members: ['Operator', 'Security', 'Provider'],
    approvedBy: ['Operator']
  });
  await assert.rejects(
    () => run(source, {
      authorities: { release_gate: insufficient },
      preparer: durablePreparer()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_QUORUM_INSUFFICIENT'
  );

  const wrongMembers = createHostQuorum({
    id: 'quorum:wrong-members',
    action: 'Deploy',
    scope: 'Production',
    members: ['Operator', 'Security', 'Auditor'],
    approvedBy: ['Operator', 'Security']
  });
  await assert.rejects(
    () => run(source, {
      authorities: { release_gate: wrongMembers },
      preparer: durablePreparer()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_QUORUM_MISMATCH'
  );
});

test('Praxis never pools ordinary permits into quorum authority', async () => {
  const source = `
requires quorum release_gate: Deploy @ Production threshold 2 of Operator, Security, Provider;
op release = Deploy("artifact") @ Production;
authorize release using release_gate as armed;
`;
  const ordinaryPermit = createHostPermit({
    id: 'permit:not-a-quorum',
    action: 'Deploy',
    scope: 'Production'
  });

  await assert.rejects(
    () => run(source, {
      authorities: { release_gate: ordinaryPermit }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_AUTHORITY_REQUIRED'
  );
});

test('Praxis compiles Lease as a distinct expiring authority requirement', () => {
  const ir = compile(`
requires lease deploy_window: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using deploy_window as armed;
prepare armed as prepared;
`);

  assert.deepEqual(
    ir.instructions.map(instruction => instruction.op),
    ['REQUIRE_LEASE', 'PLAN', 'AUTHORIZE', 'PREPARE']
  );
  assert.deepEqual(ir.required_permits, [{
    name: 'deploy_window',
    authority_kind: 'Lease',
    action: 'Deploy',
    scope: 'Production'
  }]);
  assert.equal(ir.bindings.deploy_window.kind, 'Lease');
});

test('Praxis rejects an expired authority lease before authorization', async () => {
  const source = `
requires lease deploy_window: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using deploy_window as armed;
`;
  const lease = createHostLease({
    id: 'lease:expired',
    action: 'Deploy',
    scope: 'Production',
    expiresAt: '2026-09-18T12:00:00.000Z'
  });

  await assert.rejects(
    () => run(source, {
      authorities: { deploy_window: lease },
      now: '2026-09-18T12:00:00.000Z'
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_AUTHORITY_EXPIRED'
  );
});

test('Praxis rejects explicitly revoked host authority', async () => {
  const source = `
requires permit deploy_prod: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using deploy_prod as armed;
`;
  const permit = createHostPermit({
    id: 'permit:revoked',
    action: 'Deploy',
    scope: 'Production'
  });

  await assert.rejects(
    () => run(source, {
      authorities: { deploy_prod: permit },
      revokedAuthorityIds: ['permit:revoked']
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_AUTHORITY_REVOKED'
  );
});

test('Praxis consumes an unexpired lease only after durable preparation', async () => {
  const source = `
requires lease deploy_window: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using deploy_window as armed;
prepare armed as prepared;
`;
  const lease = createHostLease({
    id: 'lease:valid',
    action: 'Deploy',
    scope: 'Production',
    expiresAt: '2026-09-18T13:00:00.000Z'
  });

  const result = await run(source, {
    authorities: { deploy_window: lease },
    now: '2026-09-18T12:00:00.000Z',
    preparer: durablePreparer()
  });
  assert.equal(result.values.deploy_window.kind, 'Lease');
  assert.equal(result.values.armed.kind, 'AuthorizedOperation');
  assert.equal(result.values.prepared.kind, 'PreparedOperation');

  await assert.rejects(
    () => run(source, {
      authorities: { deploy_window: lease },
      now: '2026-09-18T12:30:00.000Z',
      preparer: durablePreparer()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_AUTHORITY_CONSUMED'
  );
});

test('Praxis authority can be retried if preparation never became durable', async () => {
  const source = `
requires permit deploy_prod: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using deploy_prod as armed;
prepare armed as prepared;
`;
  const permit = createHostPermit({
    id: 'permit:retry-after-prepare-fail',
    action: 'Deploy',
    scope: 'Production'
  });

  await assert.rejects(
    () => run(source, {
      authorities: { deploy_prod: permit },
      preparer: async () => {
        throw new Error('not durable');
      }
    }),
    error => error.code === 'PRAXIS_PREPARATION_UNCOMMITTED'
  );

  const result = await run(source, {
    authorities: { deploy_prod: permit },
    preparer: durablePreparer()
  });
  assert.equal(result.values.prepared.kind, 'PreparedOperation');
});

test('Praxis verification and assessment fail closed when host policy functions are absent', async () => {
  const source = `
observe source = "sha256:abc" from "git:main";
verify verified = source with GitIntegrity;
assess candidate = verified with ReleasePolicy;
`;

  await assert.rejects(
    () => run(source),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_VERIFIER_REQUIRED'
  );

  await assert.rejects(
    () => run(source, {
      verifiers: {
        GitIntegrity: async () => ({ ok: true, evidence: 'fixture' })
      }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_ASSESSOR_REQUIRED'
  );
});


async function makePreparedReference(id = 'prepared:replay') {
  const permit = createHostPermit({
    id: `permit:${id}`,
    action: 'Deploy',
    scope: 'Production'
  });
  const source = `
requires permit p: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using p as armed;
prepare armed as prepared;
`;
  const result = await run(source, {
    authorities: { p: permit },
    preparer: durablePreparer()
  });
  const preparedValue = result.values.prepared;
  return createHostPreparedRef({
    id,
    action: 'Deploy',
    scope: 'Production',
    operation: preparedValue.operation,
    authority: preparedValue.authority,
    preparation: preparedValue.preparation
  });
}

test('Praxis can require an already-durable prepared effect for replay', () => {
  const ir = compile(`
requires prepared prior: Deploy @ Production;
commit prior as receipt;
`);

  assert.deepEqual(ir.required_prepared, [{
    name: 'prior',
    action: 'Deploy',
    scope: 'Production'
  }]);
  assert.deepEqual(
    ir.instructions.map(instruction => instruction.op),
    ['REQUIRE_PREPARED', 'COMMIT']
  );
  assert.equal(ir.bindings.prior.kind, 'PreparedOperation');
});

test('Praxis replay uses the preparation digest as the idempotency key', async () => {
  const ref = await makePreparedReference('prepared:idempotent');
  let observedKey = null;

  const result = await run(`
requires prepared prior: Deploy @ Production;
commit prior as receipt;
`, {
    prepared: { prior: ref },
    executor: async request => {
      observedKey = request.idempotency_key;
      return {
        status: 'completed',
        receipt: {
          operation_digest: request.operation.operation_digest,
          preparation_digest: request.preparation.preparation_digest
        }
      };
    },
    completer: durableCompleter()
  });

  assert.equal(observedKey, PREPARATION_DIGEST);
  assert.equal(result.values.receipt.kind, 'Receipt');

  await assert.rejects(
    () => run(`
requires prepared prior: Deploy @ Production;
commit prior as receipt;
`, {
      prepared: { prior: ref },
      executor: completedExecutor(),
      completer: durableCompleter()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_PREPARED_CONSUMED'
  );
});

test('Praxis uncertain replay preserves the prepared reference for another attempt', async () => {
  const ref = await makePreparedReference('prepared:uncertain-replay');
  const source = `
requires prepared prior: Deploy @ Production;
commit prior as receipt;
`;

  await assert.rejects(
    () => run(source, {
      prepared: { prior: ref },
      executor: async () => ({ status: 'uncertain' }),
      completer: durableCompleter()
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EXTERNAL_OUTCOME_UNCERTAIN'
  );

  const result = await run(source, {
    prepared: { prior: ref },
    executor: completedExecutor(),
    completer: durableCompleter()
  });
  assert.equal(result.values.receipt.kind, 'Receipt');
});

test('Praxis cancellation is a durable terminal transition for prepared effects', async () => {
  const ref = await makePreparedReference('prepared:cancel');
  const source = `
requires prepared prior: Deploy @ Production;
cancel prior as canceled;
`;

  const result = await run(source, {
    prepared: { prior: ref },
    canceler: async request => ({
      ok: true,
      evidence: {
        durable: true,
        operation_digest: request.operation_digest,
        preparation_digest: request.preparation_digest,
        cancellation_ref: 'synthetic:cancel'
      }
    })
  });

  assert.equal(result.values.canceled.kind, 'CancellationReceipt');
  assert.equal(result.values.canceled.preparation_digest, PREPARATION_DIGEST);

  await assert.rejects(
    () => run(source, {
      prepared: { prior: ref },
      canceler: async () => ({ ok: true, evidence: {} })
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_PREPARED_CONSUMED'
  );
});

test('Praxis statically prevents both cancellation and commit of one prepared binding', () => {
  assert.throws(
    () => compile(`
requires prepared prior: Deploy @ Production;
cancel prior as canceled;
commit prior as receipt;
`),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_LINEAR_OPERATION_REUSE'
  );
});

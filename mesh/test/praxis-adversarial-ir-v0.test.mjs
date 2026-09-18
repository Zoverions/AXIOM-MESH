import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PraxisRuntimeError,
  compile,
  createHostPermit,
  createHostQuorum,
  createHostSecretRef,
  irDigestPraxis,
  operationDigestPraxis,
  run
} from '../../labs/praxis/index.mjs';

const PREPARATION_DIGEST = `sha256:${'b'.repeat(64)}`;

function craft(source, mutate) {
  const ir = structuredClone(compile(source));
  mutate(ir);
  ir.digest = irDigestPraxis(ir);
  return ir;
}

function planDigest(action, scope, args = [], secretReferences = []) {
  return operationDigestPraxis({ action, scope, args, secretReferences });
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

function completedExecutor(counter = null) {
  return async request => {
    if (counter) counter.count += 1;
    return {
      status: 'completed',
      receipt: {
        operation_digest: request.operation.operation_digest,
        preparation_digest: request.preparation.preparation_digest,
        executor: 'synthetic-adversarial-test'
      }
    };
  };
}

function durableCompleter(counter = null) {
  return async request => {
    if (counter) counter.count += 1;
    return {
      ok: true,
      evidence: {
        durable: true,
        operation_digest: request.operation_digest,
        preparation_digest: request.preparation_digest,
        completion_ref: 'synthetic:adversarial'
      }
    };
  };
}

test('Praxis refuses IR modified without resealing', async () => {
  const ir = structuredClone(compile('op release = Deploy("artifact") @ Production;'));
  ir.instructions.find(instruction => instruction.op === 'PLAN').action = 'Restart';

  await assert.rejects(
    () => run(ir),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_IR_TAMPERED'
  );
});

test('compiler-bypass: one local prepared effect cannot reach two terminal commits', async () => {
  const source = `
requires permit p: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using p as armed;
prepare armed as prepared;
commit prepared as receipt;
`;

  const ir = craft(source, module => {
    const commit = module.instructions.find(instruction => instruction.op === 'COMMIT');
    module.instructions.push({
      ...commit,
      name: 'receipt_again'
    });
  });

  const permit = createHostPermit({
    id: 'permit:double-commit',
    action: 'Deploy',
    scope: 'Production',
    operationDigest: planDigest('Deploy', 'Production', ['artifact'])
  });
  const executor = { count: 0 };
  const completer = { count: 0 };

  await assert.rejects(
    () => run(ir, {
      authorities: { p: permit },
      preparer: durablePreparer(),
      executor: completedExecutor(executor),
      completer: durableCompleter(completer)
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_LINEAR_OPERATION_REUSE'
  );

  assert.equal(executor.count, 1);
  assert.equal(completer.count, 1);
});

test('compiler-bypass: SecretRef cannot enter an ordinary PLAN argument', async () => {
  const source = `
requires secret key: SigningCredential;
op sign = Sign("digest") @ Local using secrets key;
`;

  const ir = craft(source, module => {
    const plan = module.instructions.find(instruction => instruction.op === 'PLAN');
    plan.args = [{ kind: 'reference', name: 'key' }];
  });

  const key = createHostSecretRef({
    id: 'secret:signing',
    kind: 'SigningCredential'
  });

  await assert.rejects(
    () => run(ir, { secrets: { key } }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_SECRET_EXFILTRATION'
  );
});

test('compiler-bypass: authority cannot be re-observed as knowledge', async () => {
  const source = `
requires permit p: Deploy @ Production;
op release = Deploy("artifact") @ Production;
`;

  const ir = craft(source, module => {
    const requireIndex = module.instructions.findIndex(instruction => instruction.op === 'REQUIRE_PERMIT');
    module.instructions.splice(requireIndex + 1, 0, {
      op: 'OBSERVE',
      name: 'leaked',
      value: { kind: 'reference', name: 'p' },
      provenance: 'crafted-ir'
    });
  });

  const permit = createHostPermit({
    id: 'permit:observe',
    action: 'Deploy',
    scope: 'Production',
    operationDigest: planDigest('Deploy', 'Production', ['artifact'])
  });

  await assert.rejects(
    () => run(ir, { authorities: { p: permit } }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_AUTHORITY_EXFILTRATION'
  );
});

test('compiler-bypass: host quorum threshold cannot be weakened by edited IR', async () => {
  const source = `
requires quorum gate: Deploy @ Production threshold 2 of Operator, Security, Provider;
op release = Deploy("artifact") @ Production;
authorize release using gate as armed;
`;

  const ir = craft(source, module => {
    module.required_permits.find(item => item.name === 'gate').threshold = 1;
    module.instructions.find(instruction => instruction.op === 'REQUIRE_QUORUM').threshold = 1;
  });

  const gate = createHostQuorum({
    id: 'quorum:pinned-threshold',
    action: 'Deploy',
    scope: 'Production',
    threshold: 2,
    members: ['Operator', 'Security', 'Provider'],
    approvedBy: ['Operator', 'Security'],
    operationDigest: planDigest('Deploy', 'Production', ['artifact'])
  });

  await assert.rejects(
    () => run(ir, { authorities: { gate } }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_QUORUM_MISMATCH'
  );
});

test('host authority is bound to one exact plan digest', async () => {
  const source = `
requires permit p: Deploy @ Production;
op release = Deploy("release-b") @ Production;
authorize release using p as armed;
`;

  const permit = createHostPermit({
    id: 'permit:release-a',
    action: 'Deploy',
    scope: 'Production',
    operationDigest: planDigest('Deploy', 'Production', ['release-a'])
  });

  await assert.rejects(
    () => run(source, { authorities: { p: permit } }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_AUTHORITY_PLAN_MISMATCH'
  );
});

test('compiler-bypass: AUTHORIZE still requires a runtime Operation', async () => {
  const source = `
requires permit p: Deploy @ Production;
observe evidence = "safe" from "fixture";
op release = Deploy("artifact") @ Production;
authorize release using p as armed;
`;

  const ir = craft(source, module => {
    module.instructions.find(instruction => instruction.op === 'AUTHORIZE').operation = 'evidence';
  });

  const permit = createHostPermit({
    id: 'permit:kind-check',
    action: 'Deploy',
    scope: 'Production',
    operationDigest: planDigest('Deploy', 'Production', ['artifact'])
  });

  await assert.rejects(
    () => run(ir, { authorities: { p: permit } }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_AUTHORIZE_REQUIRES_OPERATION'
  );
});

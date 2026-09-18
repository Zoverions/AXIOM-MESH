import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PraxisRuntimeError,
  PraxisTypeError,
  compile,
  createHostPermit,
  run
} from '../../labs/praxis/index.mjs';

const minimal = `
requires permit deploy_prod: Deploy @ Production;
op release = Deploy("artifact:sha256:abc") @ Production;
authorize release using deploy_prod as armed_release;
commit armed_release as release_receipt;
`;

test('Praxis compiles explicit knowledge/operation/authority stages into inspectable IR', () => {
  const ir = compile(`
requires permit deploy_prod: Deploy @ Production;
observe source = "sha256:abc" from "git:main";
verify verified_source = source with GitIntegrity;
assess candidate = verified_source with ReleasePolicy;
op release = Deploy(verified_source) @ Production;
authorize release using deploy_prod as armed_release;
commit armed_release as receipt;
`);

  assert.equal(ir.schema, 'praxis-ir.v0');
  assert.deepEqual(
    ir.instructions.map(instruction => instruction.op),
    ['REQUIRE_PERMIT', 'OBSERVE', 'VERIFY', 'ASSESS', 'PLAN', 'AUTHORIZE', 'COMMIT']
  );
  assert.deepEqual(ir.required_permits, [{
    name: 'deploy_prod',
    action: 'Deploy',
    scope: 'Production'
  }]);
  assert.equal(ir.bindings.candidate.kind, 'Assessment');
  assert.equal(ir.bindings.release.kind, 'Operation');
  assert.equal(ir.bindings.armed_release.kind, 'AuthorizedOperation');
  assert.equal(ir.bindings.receipt.kind, 'Receipt');
});

test('Praxis rejects commit of an inert operation', () => {
  assert.throws(
    () => compile(`
op release = Deploy("artifact") @ Production;
commit release as receipt;
`),
    error => error instanceof PraxisTypeError
      && error.code === 'PRAXIS_COMMIT_REQUIRES_AUTHORITY'
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

test('Praxis commit fails closed without an injected host executor', async () => {
  const permit = createHostPermit({
    id: 'permit:no-executor',
    action: 'Deploy',
    scope: 'Production'
  });

  await assert.rejects(
    () => run(minimal, {
      authorities: { deploy_prod: permit }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EXECUTOR_REQUIRED'
  );
});

test('Praxis requires executor receipt binding to the exact operation digest', async () => {
  const permit = createHostPermit({
    id: 'permit:bad-receipt',
    action: 'Deploy',
    scope: 'Production'
  });

  await assert.rejects(
    () => run(minimal, {
      authorities: { deploy_prod: permit },
      executor: async () => ({
        ok: true,
        receipt: { operation_digest: 'sha256:not-the-operation' }
      })
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_EXECUTOR_RECEIPT_INVALID'
  );
});

test('Praxis returns a receipt only after exact host authority and executor receipt agree', async () => {
  const permit = createHostPermit({
    id: 'permit:success',
    action: 'Deploy',
    scope: 'Production'
  });
  let calls = 0;

  const result = await run(minimal, {
    authorities: { deploy_prod: permit },
    executor: async request => {
      calls += 1;
      return {
        ok: true,
        receipt: {
          operation_digest: request.operation.operation_digest,
          executor: 'synthetic-test-only'
        }
      };
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.values.release.kind, 'Operation');
  assert.equal(result.values.armed_release.kind, 'AuthorizedOperation');
  assert.equal(result.values.release_receipt.kind, 'Receipt');
  assert.equal(
    result.values.release_receipt.operation_digest,
    result.values.release.operation_digest
  );
  assert.equal(result.values.release_receipt.authority_id, 'permit:success');
});

test('Praxis host authority tokens are one-use across runs', async () => {
  const source = `
requires permit deploy_prod: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using deploy_prod as armed;
`;
  const permit = createHostPermit({
    id: 'permit:linear-runtime',
    action: 'Deploy',
    scope: 'Production'
  });

  await run(source, {
    authorities: { deploy_prod: permit }
  });

  await assert.rejects(
    () => run(source, {
      authorities: { deploy_prod: permit }
    }),
    error => error instanceof PraxisRuntimeError
      && error.code === 'PRAXIS_HOST_AUTHORITY_CONSUMED'
  );
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

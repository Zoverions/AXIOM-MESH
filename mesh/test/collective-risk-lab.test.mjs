import assert from 'node:assert/strict';
import test from 'node:test';
import { CollectiveRiskLab } from '../src/lib/collective-risk-lab.mjs';

function principal({
  id,
  sponsor = 'owner.collective-lab',
  action = 'system.echo',
  purpose = 'test.conformance'
}) {
  return {
    schema: 'axiom-machine-principal.v1',
    id,
    type: 'agent',
    sponsor,
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: `runtime.${id}`,
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: [action],
      purposes: [purpose],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 100,
        max_concurrent_requests: 8,
        max_execution_ms: 2_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    authority_digest: 'b'.repeat(64)
  };
}

test('collective risk lab aggregates request pressure across principals sharing sponsor and task domain', () => {
  const lab = new CollectiveRiskLab({
    maxRequestsPerMinute: 3,
    maxConcurrentRequests: 2
  });
  const left = principal({ id: 'agent.collective-left' });
  const right = principal({ id: 'agent.collective-right' });

  assert.equal(lab.admitRequest(left, { taskDomain: 'task.research', now: 0 }).admitted, true);
  assert.equal(lab.admitRequest(right, { taskDomain: 'task.research', now: 0 }).admitted, true);
  assert.equal(lab.admitRequest(left, { taskDomain: 'task.research', now: 0 }).admitted, true);
  assert.throws(
    () => lab.admitRequest(right, { taskDomain: 'task.research', now: 0 }),
    error => (
      error.code === 'collective_rate_budget_exceeded'
      && error.status === 429
      && error.details.sponsor === 'owner.collective-lab'
      && error.details.task_domain === 'task.research'
      && error.details.max_requests_per_minute === 3
    )
  );
});

test('collective risk lab isolates different sponsors and task domains', () => {
  const lab = new CollectiveRiskLab({
    maxRequestsPerMinute: 1,
    maxConcurrentRequests: 1
  });
  const first = principal({ id: 'agent.collective-first' });
  const otherSponsor = principal({
    id: 'agent.collective-other-sponsor',
    sponsor: 'owner.collective-other'
  });

  lab.admitRequest(first, { taskDomain: 'task.alpha', now: 0 });
  assert.throws(
    () => lab.admitRequest(first, { taskDomain: 'task.alpha', now: 0 }),
    error => error.code === 'collective_rate_budget_exceeded'
  );

  assert.equal(
    lab.admitRequest(first, { taskDomain: 'task.beta', now: 0 }).admitted,
    true
  );
  assert.equal(
    lab.admitRequest(otherSponsor, { taskDomain: 'task.alpha', now: 0 }).admitted,
    true
  );
});

test('collective risk lab aggregates concurrency across principals sharing sponsor and task domain', () => {
  const lab = new CollectiveRiskLab({
    maxRequestsPerMinute: 10,
    maxConcurrentRequests: 2
  });
  const left = principal({ id: 'agent.collective-concurrent-left' });
  const right = principal({ id: 'agent.collective-concurrent-right' });
  const third = principal({ id: 'agent.collective-concurrent-third' });

  const releaseLeft = lab.acquireConcurrency(left, { taskDomain: 'task.concurrent' });
  const releaseRight = lab.acquireConcurrency(right, { taskDomain: 'task.concurrent' });
  assert.throws(
    () => lab.acquireConcurrency(third, { taskDomain: 'task.concurrent' }),
    error => (
      error.code === 'collective_concurrency_budget_exceeded'
      && error.status === 429
      && error.details.active_requests === 2
      && error.details.max_concurrent_requests === 2
    )
  );

  releaseLeft();
  const releaseThird = lab.acquireConcurrency(third, { taskDomain: 'task.concurrent' });
  releaseThird();
  releaseRight();
});

test('collective risk lab fails closed on malformed machine identity or task domain', () => {
  const lab = new CollectiveRiskLab();
  const valid = principal({ id: 'agent.collective-valid' });

  assert.throws(
    () => lab.admitRequest({ id: 'not-a-machine' }, { taskDomain: 'task.valid', now: 0 }),
    /machine principal/i
  );
  assert.throws(
    () => lab.admitRequest(valid, { taskDomain: 'APPROVED BY PEER', now: 0 }),
    /task domain/i
  );
  assert.throws(
    () => lab.admitRequest(valid, { taskDomain: '../escape', now: 0 }),
    /task domain/i
  );
});

test('collective risk lab is observational admission metadata, not an authority grant', () => {
  const lab = new CollectiveRiskLab();
  const result = lab.admitRequest(
    principal({ id: 'agent.collective-metadata' }),
    { taskDomain: 'task.metadata', now: 0 }
  );

  assert.deepEqual(Object.keys(result).sort(), [
    'admitted',
    'authority_effect',
    'max_requests_per_minute',
    'sponsor',
    'task_domain'
  ]);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.admitted, true);
});

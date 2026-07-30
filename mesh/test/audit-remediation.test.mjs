import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { checkGridRuntimeLock } from '../src/doctor.mjs';
import { recoverStaleGridRuntimeLock } from '../src/grid/backup.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { Router } from '../src/lib/http.mjs';
import { PolicyEngine, mergeDenyDominantPolicy } from '../src/lib/policy.mjs';

function allowPolicy(overrides = {}) {
  return {
    version: overrides.version ?? 'test-policy',
    actions: {
      'system.echo': {
        decision: 'allow',
        risk: 'low',
        required_scopes: ['intent:execute'],
        tool: 'builtin.echo',
        ...overrides.rule
      }
    }
  };
}

test('prototype-chain action names are treated as unknown actions', () => {
  const engine = new PolicyEngine(allowPolicy());
  const decision = engine.evaluate({
    action: 'constructor',
    principal: { scopes: ['*'] },
    intent: {}
  });
  assert.equal(decision.allow, false);
  assert.equal(decision.code, 'unknown_action');
  assert.equal(decision.risk, 'critical');
});

test('allow policy overlays cannot rewrite evidence-facing fields', () => {
  assert.throws(
    () => mergeDenyDominantPolicy([
      allowPolicy({ version: 'base', rule: { effect: 'system.echo' } }),
      allowPolicy({ version: 'overlay', rule: { effect: 'system.relabelled' } })
    ]),
    /cannot replace the effect/
  );

  assert.throws(
    () => mergeDenyDominantPolicy([
      allowPolicy({ version: 'base' }),
      allowPolicy({ version: 'overlay', rule: { http_status: 451 } })
    ]),
    /unsupported allow fields/
  );
});

test('malformed percent-encoding is a validation error', () => {
  const router = new Router();
  router.add('GET', '/v1/intents/:id', async () => null);
  assert.throws(
    () => router.match('GET', '/v1/intents/%zz'),
    error => error?.code === 'validation_error' && error?.status === 400
  );
});

test('Grid chain verification streams event rows without materializing the table', () => {
  let iterateCalls = 0;
  let allCalls = 0;
  const genesis = '0'.repeat(64);
  const eventStatement = {
    *iterate() {
      iterateCalls += 1;
    },
    all() {
      allCalls += 1;
      throw new Error('event verification must not materialize the event table');
    }
  };
  const store = {
    db: {
      prepare(sql) {
        if (sql === 'SELECT * FROM events ORDER BY seq') return eventStatement;
        if (sql.includes("key = 'last_hash'")) {
          return { get: () => ({ value: genesis }) };
        }
        if (sql.includes("key = 'last_seq'")) {
          return { get: () => ({ value: '0' }) };
        }
        throw new Error(`Unexpected verification query: ${sql}`);
      }
    }
  };

  const result = GridStore.prototype.verifyChain.call(store);
  assert.deepEqual(result, { valid: true, events: 0, head: genesis });
  assert.equal(iterateCalls, 1);
  assert.equal(allCalls, 0);
});

test('stale Grid runtime locks are quarantined before restart', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-grid-lock-'));
  const child = spawn(process.execPath, ['-e', 'process.exit(0)']);
  await once(child, 'exit');
  const marker = {
    pid: child.pid,
    token: 'audit-regression-token',
    started_at: new Date().toISOString()
  };
  const lockPath = join(dataDir, 'grid-runtime.lock');
  await writeFile(lockPath, `${JSON.stringify(marker)}\n`, { mode: 0o600 });

  const recovery = await recoverStaleGridRuntimeLock(dataDir);
  assert.equal(recovery.recovered, true);
  assert.equal(recovery.stale_pid, child.pid);
  await assert.rejects(readFile(lockPath, 'utf8'), error => error?.code === 'ENOENT');
  assert.deepEqual(JSON.parse(await readFile(recovery.quarantine_path, 'utf8')), marker);
});

test('doctor reports a live Grid lock with an operator remedy', async () => {
  const result = await checkGridRuntimeLock({
    dataDir: '/unused',
    recoverLock: async () => {
      const error = new Error('Grid runtime lock belongs to a live process');
      error.code = 'grid_is_running';
      throw error;
    }
  });
  assert.equal(result.ready, false);
  assert.equal(result.state, 'live');
  assert.match(result.remedy, /Stop the running Grid process/);
});

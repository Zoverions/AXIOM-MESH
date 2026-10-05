import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  loadPolicy,
  loadPolicyStack,
  mergeDenyDominantPolicy
} from '../src/lib/policy.mjs';

function allowPolicy(constraints = {}, version = 'runtime-constraints-base') {
  return {
    version,
    actions: {
      'system.echo': {
        decision: 'allow',
        risk: 'low',
        required_scopes: ['intent:execute'],
        tool: 'builtin.echo',
        timeout_ms: 10_000,
        constraints
      }
    }
  };
}

async function policyFile(t, policy, name = 'policy.json') {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-policy-constraints-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(policy));
  return path;
}

test('active policy loading accepts the current empty runtime-constraint surface', async t => {
  const path = await policyFile(t, allowPolicy());
  const engine = await loadPolicy(path);
  const decision = engine.evaluate({
    action: 'system.echo',
    principal: { scopes: ['intent:execute'] },
    intent: { confirmations: [] }
  });
  assert.equal(decision.allow, true);
  assert.deepEqual(decision.constraints, {});
});

test('active policy loading fails closed on non-empty allow constraints without runtime enforcers', async t => {
  const path = await policyFile(t, allowPolicy({ maximum_items: 5 }));
  await assert.rejects(
    () => loadPolicy(path),
    /unenforced runtime constraints.*maximum_items/i
  );
});

test('stack loading checks the effective active decision rather than banning dormant deny constraints', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-policy-constraints-stack-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const basePath = join(directory, 'base.json');
  const denyPath = join(directory, 'deny.json');
  await writeFile(basePath, JSON.stringify(allowPolicy({ maximum_items: 5 }, 'base')));
  await writeFile(denyPath, JSON.stringify({
    version: 'deny',
    actions: {
      'system.echo': {
        decision: 'deny',
        risk: 'high',
        code: 'policy_denied',
        reason: 'disabled'
      }
    }
  }));

  const engine = await loadPolicyStack([basePath, denyPath]);
  const decision = engine.evaluate({
    action: 'system.echo',
    principal: { scopes: ['intent:execute'] },
    intent: { confirmations: [] }
  });
  assert.equal(decision.allow, false);
  assert.equal(decision.code, 'policy_denied');
});

test('generic deny-dominant constraint algebra remains available for future enforced constraints', () => {
  const merged = mergeDenyDominantPolicy([
    allowPolicy({ maximum_items: 10, minimum_assurance: 2 }, 'base'),
    allowPolicy({ maximum_items: 5, minimum_assurance: 4 }, 'overlay')
  ]);
  assert.deepEqual(merged.actions['system.echo'].constraints, {
    maximum_items: 5,
    minimum_assurance: 4
  });
});

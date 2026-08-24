import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY
} from '../src/lib/agent-read-system-facts-effect-admission.mjs';

const sourceUrl = new URL(
  '../src/lib/agent-read-system-facts-effect-admission.mjs',
  import.meta.url
);

test('read-system-facts admission remains pure evidence/policy logic with no target effects', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  for (const forbiddenModule of [
    'node:child_process',
    'node:fs',
    'node:fs/promises',
    'node:http',
    'node:https',
    'node:net',
    'node:dns',
    'node:tls'
  ]) {
    assert.equal(
      source.includes(`from '${forbiddenModule}'`) || source.includes(`from "${forbiddenModule}"`),
      false,
      `${forbiddenModule} must remain outside the admission module`
    );
  }
  for (const forbiddenPrimitive of [
    /\bspawn\s*\(/,
    /\bexecFile\s*\(/,
    /\bexec\s*\(/,
    /\bfetch\s*\(/,
    /\bwriteFile\s*\(/,
    /\bopen\s*\(/
  ]) {
    assert.equal(forbiddenPrimitive.test(source), false, `${forbiddenPrimitive} must remain absent`);
  }
  assert.match(source, /verifyAgentSignedHandoff/);
  assert.match(source, /verifyAgentEffectConsumptionRecord/);
  assert.match(source, /effect_boundary_currentness_recheck_required: true/);
  assert.match(source, /effect_already_executed: false/);
  assert.match(source, /general_executor_authority: false/);
});

test('fixed admission policy cannot smuggle shell, caller argv, bind mounts or network authority', () => {
  const policy = AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY;
  assert.equal(policy.image.caller_selectable, false);
  assert.equal(policy.network.mode, 'none');
  assert.equal(policy.network.caller_origins_allowed, false);
  assert.equal(policy.filesystem.bind_mounts_allowed, false);
  assert.equal(policy.filesystem.docker_socket_inside_workload, false);
  assert.equal(policy.claims.general_executor_authority, false);
  assert.equal(policy.templates.length, 2);
  for (const template of policy.templates) {
    assert.equal(Object.hasOwn(template, 'shell'), false);
    assert.equal(Object.hasOwn(template, 'executable'), false);
    assert.equal(Object.hasOwn(template, 'caller_argv'), false);
    assert.equal(template.argv.some(value => /(?:^|\s)(?:sh|bash|cmd|powershell)(?:\s|$)/i.test(value)), false);
  }
});

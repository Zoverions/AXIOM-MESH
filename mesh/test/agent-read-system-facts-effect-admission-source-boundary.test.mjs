import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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

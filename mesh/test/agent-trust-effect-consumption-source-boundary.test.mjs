import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL(
  '../src/lib/agent-trust-effect-consumption.mjs',
  import.meta.url
);

test('effect consumption stays a control-state gate rather than a target-effect executor', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  for (const forbiddenModule of [
    'node:child_process',
    'node:http',
    'node:https',
    'node:net',
    'node:dns',
    'node:tls'
  ]) {
    assert.equal(
      source.includes(`from '${forbiddenModule}'`) || source.includes(`from "${forbiddenModule}"`),
      false,
      `${forbiddenModule} must remain outside the consumption gate`
    );
  }

  for (const forbiddenPrimitive of [
    /\bspawn\s*\(/,
    /\bexecFile\s*\(/,
    /\bexec\s*\(/,
    /\bfetch\s*\(/
  ]) {
    assert.equal(forbiddenPrimitive.test(source), false, `${forbiddenPrimitive} must remain absent`);
  }

  assert.match(source, /evaluateAgentCurrentnessSetAtEffect/);
  assert.match(source, /open\(filePath, 'wx'/);
  assert.match(source, /handle\.sync\(\)/);
  assert.match(source, /effect_executed: false/);
  assert.match(source, /effect_admission_authorized: false/);
  assert.match(source, /resume_after_recovery_allowed: false/);
  assert.match(source, /global_currentness_claimed: false/);
});

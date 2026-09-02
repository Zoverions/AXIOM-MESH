import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const DRILL = new URL(
  '../src/linux-resource-enforcement-drill.mjs',
  import.meta.url
);
const RUNNER = new URL(
  '../src/run-linux-resource-enforcement-drill.mjs',
  import.meta.url
);

test('real G3 effect code uses fixed Linux binaries, no shell, and no caller command surface', async () => {
  const [drill, runner] = await Promise.all([
    readFile(DRILL, 'utf8'),
    readFile(RUNNER, 'utf8')
  ]);
  assert.match(drill, /const SYSTEMCTL = '\/usr\/bin\/systemctl'/);
  assert.match(drill, /const SLEEP = '\/usr\/bin\/sleep'/);
  assert.match(
    drill,
    /\[\.\.\.enforcement\.argv_prefix, SLEEP, '30'\]/
  );
  assert.doesNotMatch(drill, /shell:\s*true/);
  assert.doesNotMatch(drill, /\bexec\s*\(/);
  assert.doesNotMatch(drill, /\bspawn\s*\(/);
  assert.match(
    runner,
    /AXIOM_HOST_RESOURCE_ENFORCEMENT_LAB\s*===\s*'1'/
  );
  assert.doesNotMatch(runner, /process\.argv\.slice\(4/);
  assert.doesNotMatch(runner, /process\.argv\[[4-9]/);
  assert.doesNotMatch(runner, /\bcommand\b|\bexecutable\b/i);
});

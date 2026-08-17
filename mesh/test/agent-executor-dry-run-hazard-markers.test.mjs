import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE = new URL('../src/lib/agent-executor-dry-run.mjs', import.meta.url);

function templateBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing template marker: ${startMarker}`);
  assert.ok(end > start, `missing template boundary after: ${startMarker}`);
  return source.slice(start, end);
}

test('build and test templates cannot launder repository-code or shell-invocation hazards', async () => {
  const source = await readFile(SOURCE, 'utf8');

  const build = templateBlock(source, "'run-build:npm-script':", "'run-tests:npm-script':");
  const tests = templateBlock(source, "'run-tests:npm-script':", "'collect-sanitized-logs:builtin':");

  for (const [label, block] of [['run-build', build], ['run-tests', tests]]) {
    assert.match(block, /repository_code_execution:\s*true/,
      `${label} must remain classified as repository-code execution`);
    assert.match(block, /tool_may_invoke_repository_shell:\s*true/,
      `${label} must retain the repository-shell hazard marker`);
    assert.match(block, /network_mode:\s*'none'/,
      `${label} must not silently gain session network access`);
  }
});

test('validator binds hazard markers to the fixed template instead of trusting supplied plan claims', async () => {
  const source = await readFile(SOURCE, 'utf8');

  assert.match(source, /raw\.repository_code_execution\s*!==\s*template\.repository_code_execution/);
  assert.match(source, /raw\.tool_may_invoke_repository_shell\s*!==\s*template\.tool_may_invoke_repository_shell/);
  assert.match(source, /throw new ValidationError\('Agent executor dry-run step does not match the fixed template'\)/);
});

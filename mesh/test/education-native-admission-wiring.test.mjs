import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('live Sandbox service routes builtin execution through the education-aware seam', async () => {
  const text = await source('../src/sandbox/server.mjs');
  assert.match(
    text,
    /import \{ executeSandboxBuiltin \} from '\.\/education-executor\.mjs';/,
  );
  assert.match(
    text,
    /const result = executeSandboxBuiltin\(\{ tool: claims\.tool, intent \}\);/,
  );
  assert.doesNotMatch(text, /const result = executeBuiltin\(/);
});

test('live Grid commit route performs education authority preflight before append', async () => {
  const text = await source('../src/grid/server.mjs');
  assert.match(
    text,
    /import \{ preflightEducationLearnerGridEvent \} from '\.\.\/domain\/education-learner-grid-preflight\.mjs';/,
  );
  const preflight = text.indexOf(
    'preflightEducationLearnerGridEvent(store, event, actor);',
  );
  const append = text.indexOf(
    'const appended = store.appendEvents({ traceId, actor, events: input.events });',
  );
  assert.ok(preflight >= 0, 'education Grid preflight must be wired');
  assert.ok(append >= 0, 'Grid append seam must remain present');
  assert.ok(preflight < append, 'education Grid preflight must run before append');
});

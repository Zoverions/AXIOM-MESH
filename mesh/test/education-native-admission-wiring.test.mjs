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

  const executor = await source('../src/sandbox/education-executor.mjs');
  assert.match(
    executor,
    /tool === 'builtin\.education-learner-progress-read'/,
  );
  assert.match(
    executor,
    /createEducationLearnerProgressQuery\(intent\)/,
  );
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

test('native learner progress read remains Hypervisor mediated and Grid authorized', async () => {
  const grid = await source('../src/grid/server.mjs');
  assert.match(
    grid,
    /import \{ registerEducationGridRoutes \} from '\.\/education-routes\.mjs';/,
  );
  assert.match(grid, /registerEducationGridRoutes\(router, store\);/);

  const routes = await source('../src/grid/education-routes.mjs');
  assert.match(routes, /principal\.service !== 'hypervisor'/);
  assert.match(routes, /executeGridNativeEducationLearnerProgressRead/);

  const hypervisor = await source('../src/hypervisor/server.mjs');
  assert.match(
    hypervisor,
    /\/internal\/v1\/education\/learner-progress/,
  );
  assert.match(
    hypervisor,
    /signedFetch\(\s*identity,\s*'grid',\s*`\$\{config\.urls\.grid\}\/internal\/v1\/education\/learner-progress`/s,
  );
  const attestation = hypervisor.indexOf(
    "throw new AxiomError('sandbox_attestation_mismatch'",
  );
  const query = hypervisor.indexOf('queryResult = await executeGridQuery(');
  assert.ok(attestation >= 0, 'Sandbox attestation verification must remain present');
  assert.ok(query >= 0, 'native Grid query route must remain present');
  assert.ok(attestation < query, 'Grid read must occur only after Sandbox attestation verification');
});

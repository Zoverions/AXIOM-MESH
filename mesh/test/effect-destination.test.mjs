import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCAL_EFFECT_DESTINATION,
  effectDestinationForTool
} from '../src/lib/effect-destination.mjs';
import {
  REPOSITORY_DOCS_EFFECT_POLICY
} from '../src/lib/repository-docs-effect.mjs';
import {
  REPOSITORY_DOCS_EFFECT_DESTINATION,
  repositoryDocsEffectDestination
} from '../src/lib/repository-docs-destination.mjs';

test('current built-in tools resolve only to the local effect destination', () => {
  for (const tool of [
    'builtin.echo',
    'builtin.hash',
    'builtin.memory.put',
    'builtin.memory.edge',
    'builtin.memory.tombstone',
    'builtin.export.request',
    'builtin.backup.create',
    'builtin.import.stage',
    'builtin.import.apply'
  ]) {
    assert.equal(effectDestinationForTool(tool), LOCAL_EFFECT_DESTINATION);
  }
});

test('repository docs adapter resolves only to its exact code-owned GitHub repository', () => {
  const expected = `github:${REPOSITORY_DOCS_EFFECT_POLICY.repository}`;
  assert.equal(REPOSITORY_DOCS_EFFECT_DESTINATION.scheme, 'github');
  assert.equal(
    REPOSITORY_DOCS_EFFECT_DESTINATION.repository,
    REPOSITORY_DOCS_EFFECT_POLICY.repository
  );
  assert.equal(REPOSITORY_DOCS_EFFECT_DESTINATION.value, expected);
  assert.equal(repositoryDocsEffectDestination(), expected);
  assert.equal(effectDestinationForTool(REPOSITORY_DOCS_EFFECT_POLICY.tool), expected);
  assert.notEqual(expected, LOCAL_EFFECT_DESTINATION);
});

test('unknown provider, remote, MCP, and other adapter tools have no inferred destination', () => {
  for (const tool of [
    'provider.web.search',
    'remote.executor.run',
    'mcp.external.call',
    'adapter.repository-write',
    'adapter.repository-docs-merge',
    'adapter.github-generic'
  ]) {
    assert.throws(
      () => effectDestinationForTool(tool),
      /does not have a verified effect destination/
    );
  }
});

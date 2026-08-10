import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCAL_EFFECT_DESTINATION,
  effectDestinationForTool
} from '../src/lib/effect-destination.mjs';

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

test('unknown provider or remote tools have no inferred destination', () => {
  for (const tool of [
    'provider.web.search',
    'remote.executor.run',
    'mcp.external.call'
  ]) {
    assert.throws(
      () => effectDestinationForTool(tool),
      /does not have a verified effect destination/
    );
  }
});

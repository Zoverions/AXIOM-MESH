import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE = new URL('../src/lib/linux-resource-enforcement.mjs', import.meta.url);

test('G3A compiler remains effect-inert and cannot become a hidden process runner', async () => {
  const source = await readFile(SOURCE, 'utf8');
  assert.doesNotMatch(
    source,
    /node:child_process|from ['"]child_process['"]|\bspawn(?:Sync)?\s*\(|\bexec(?:File|FileSync|Sync)?\s*\(/
  );
  assert.doesNotMatch(source, /\bshell\s*:/);
  assert.match(source, /requires_effect_boundary_recheck:\s*true/);
  assert.match(source, /command_caller_supplied:\s*false/);
  assert.match(source, /mesh_authority_granted:\s*false/);
  assert.match(source, /remote_execution_authority_granted:\s*false/);
});

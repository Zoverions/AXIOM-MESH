import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const WORKFLOW_PATH = fileURLToPath(
  new URL('../../.github/workflows/windows.yml', import.meta.url)
);
const RELEASE_PATH = fileURLToPath(new URL('../src/release.mjs', import.meta.url));

test('macOS Apple Silicon and Intel lanes are pinned inside the release-governed host workflow', async () => {
  const [workflow, releaseSource] = await Promise.all([
    readFile(WORKFLOW_PATH, 'utf8'),
    readFile(RELEASE_PATH, 'utf8')
  ]);

  for (const required of [
    'runs-on: windows-2025',
    '- macos-15',
    '- macos-15-intel',
    'node-version: "24.18.0"',
    'persist-credentials: false',
    'sw_vers',
    'uname -a',
    '/private/tmp/axiom-mesh-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}',
    'chmod 700 "$socket_tmp"',
    'echo "TMPDIR=$socket_tmp" >> "$GITHUB_ENV"',
    'npm ci --ignore-scripts',
    'npm --prefix mesh ci --ignore-scripts',
    'Verify macOS-compatible kernel surface',
    'npm run check'
  ]) {
    assert.ok(workflow.includes(required), `host compatibility workflow is missing: ${required}`);
  }

  const actionReferences = [...workflow.matchAll(/^\s*-\s+uses:\s+([^\s#]+)/gm)]
    .map(match => match[1]);
  assert.ok(actionReferences.length >= 4);
  assert.equal(
    actionReferences.every(reference => /@[a-f0-9]{40}$/.test(reference)),
    true,
    'all host compatibility actions must be immutable 40-hex revisions'
  );
  assert.doesNotMatch(workflow, /runs-on:\s*(?:windows|macos)-latest/);

  for (const triggerPath of [
    '- "mesh/**"',
    '- "docs/**"',
    '- "AGENT-ENTRY.md"',
    '- "agent-readiness/**"',
    '- ".github/ISSUE_TEMPLATE/**"',
    '- ".github/workflows/**"'
  ]) {
    const count = workflow.split(triggerPath).length - 1;
    assert.equal(count, 2, `push and pull_request must both cover ${triggerPath}`);
  }

  assert.match(releaseSource, /windows_compatibility:\s*verifyWindowsWorkflow\(windowsWorkflow\)/);
  assert.match(releaseSource, /paths\.windowsWorkflow/);
  assert.match(releaseSource, /workflow_sha256:\s*sha256\(workflow\)/);
  assert.match(releaseSource, /'chain-verification-benchmark\.yml',[\s\S]*'kernel\.yml',[\s\S]*'windows\.yml'/);
  assert.doesNotMatch(releaseSource, /'macos\.yml'/);
});

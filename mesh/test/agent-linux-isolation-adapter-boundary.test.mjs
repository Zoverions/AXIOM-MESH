import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);
const DRILL = new URL('mesh/src/linux-isolation-adapter-drill.mjs', ROOT);
const WORKFLOW = new URL('.github/workflows/agent-linux-isolation.yml', ROOT);
const SRC_ROOT = new URL('mesh/src/', ROOT);
const RUNTIME_ENTRY_FILES = [
  new URL('mesh/package.json', ROOT),
  new URL('mesh/Dockerfile', ROOT),
  new URL('mesh/compose.production.yml', ROOT),
  new URL('mesh/compose.units.yml', ROOT)
];

async function collectMjs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) files.push(...await collectMjs(url));
    else if (entry.name.endsWith('.mjs')) files.push(url);
  }
  return files;
}

test('effect-capable Linux isolation drill has a fixed local-only source boundary', async () => {
  const source = await readFile(DRILL, 'utf8');

  assert.match(source, /AGENT_LINUX_ISOLATION_DOCKER_BINARY/);
  assert.match(source, /DOCKER_HOST: 'unix:\/\/\/var\/run\/docker\.sock'/);
  assert.match(source, /DOCKER_CONTEXT: 'default'/);
  assert.match(source, /'--network', 'none'/);
  assert.match(source, /'--read-only'/);
  assert.match(source, /'--cap-drop', 'ALL'/);
  assert.match(source, /'--security-opt', 'no-new-privileges=true'/);
  assert.match(source, /'--pids-limit'/);
  assert.match(source, /'--memory', '128m'/);
  assert.match(source, /'--cpus', String\(CPU_QUOTA\)/);
  assert.match(source, /'--user', '10001:10001'/);
  assert.match(source, /'--entrypoint', AGENT_LINUX_ISOLATION_ENTRYPOINT/);
  assert.match(source, /shell: false/);

  for (const forbidden of [
    'process.argv',
    '...process.env',
    "'--privileged'",
    "'--volume'",
    "'--mount'",
    "'--device'",
    "'--pid', 'host'",
    "'--network', 'host'",
    "'--network', 'bridge'",
    "'--env-file'",
    'docker login',
    'docker context use',
    'node:http',
    'node:https',
    'node:tls',
    'node:dgram',
    'ssh ',
    'tailscale',
    'wireguard'
  ]) {
    assert.ok(!source.includes(forbidden), `Linux isolation drill contains forbidden host-side surface: ${forbidden}`);
  }
});

test('Linux isolation workflow is read-only, credentialless and secret-free', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /AXIOM_AGENT_LINUX_ISOLATION_LAB: "1"/);
  assert.match(workflow, /node src\/linux-isolation-adapter-drill\.mjs/);
  assert.match(workflow, /verifyAgentLinuxIsolationConformanceReceipt/);
  assert.ok(!workflow.includes('secrets.'), 'Linux isolation workflow must not reference GitHub secrets');
  assert.ok(!workflow.includes('provision-production'), 'Linux isolation workflow must not provision production state');
  assert.ok(!workflow.includes('docker compose'), 'Linux isolation workflow must not start production compose surfaces');
});

test('production source does not import the effect-capable Linux isolation drill', async () => {
  const files = await collectMjs(SRC_ROOT);
  const drillHref = DRILL.href;
  const importPattern = /(?:from[ \t]+|import[ \t]*\([ \t]*|import[ \t]+)[`'"][^`'"]*linux-isolation-adapter-drill\.mjs/;
  for (const file of files) {
    if (file.href === drillHref) continue;
    const source = await readFile(file, 'utf8');
    assert.ok(
      !importPattern.test(source),
      `effect-capable Linux isolation drill imported by ${file.pathname}`
    );
  }
});

test('package, image and compose runtime entrypoints cannot expose the isolation drill', async () => {
  for (const file of RUNTIME_ENTRY_FILES) {
    const source = await readFile(file, 'utf8');
    assert.ok(
      !source.includes('linux-isolation-adapter-drill'),
      `effect-capable Linux isolation drill exposed by runtime entry file ${file.pathname}`
    );
  }
});

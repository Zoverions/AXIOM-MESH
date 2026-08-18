import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);
const DRILL = new URL('mesh/src/read-system-facts-effect-drill.mjs', ROOT);
const SRC_ROOT = new URL('mesh/src/', ROOT);
const WORKFLOW = new URL('.github/workflows/agent-linux-isolation.yml', ROOT);
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

test('read-system-facts effect drill is fixed, local, networkless and commandless', async () => {
  const source = await readFile(DRILL, 'utf8');
  for (const required of [
    "AXIOM_AGENT_READ_SYSTEM_FACTS_EFFECT_LAB",
    "AXIOM_AGENT_LINUX_ISOLATION_RECEIPT",
    "DOCKER_HOST: 'unix:///var/run/docker.sock'",
    "'--network', 'none'",
    "'--read-only'",
    "'--cap-drop', 'ALL'",
    "'--security-opt', 'no-new-privileges=true'",
    "'--user', '10001:10001'",
    "'--entrypoint', AGENT_LINUX_ISOLATION_ENTRYPOINT",
    'shell: false',
    "assert(store.status === 'consumed' && store.generation === 2",
    'controller.interrupt',
    'verifyAgentReadSystemFactsEffectReceipt',
    'verifyAgentExecutorDurableStateReceipt'
  ]) assert.ok(source.includes(required), `effect drill missing boundary ${required}`);

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
    'npm ',
    'run-build',
    'run-tests',
    'start-local-test-services',
    'install-test-dependencies',
    'ssh ',
    'scp ',
    'tailscale',
    'wireguard'
  ]) assert.ok(!source.includes(forbidden), `effect drill contains forbidden surface: ${forbidden}`);
});

test('read-system-facts effect drill is not imported by runtime source', async () => {
  const files = await collectMjs(SRC_ROOT);
  const drillHref = DRILL.href;
  const pattern = /(?:from[ \t]+|import[ \t]*\([ \t]*|import[ \t]+)[`'"][^`'"]*read-system-facts-effect-drill\.mjs/;
  for (const file of files) {
    if (file.href === drillHref) continue;
    const source = await readFile(file, 'utf8');
    assert.ok(!pattern.test(source), `read-system-facts effect drill imported by ${file.pathname}`);
  }
});

test('package, image and compose entrypoints cannot expose read-system-facts effect drill', async () => {
  for (const file of RUNTIME_ENTRY_FILES) {
    const source = await readFile(file, 'utf8');
    assert.ok(!source.includes('read-system-facts-effect-drill'), `effect drill exposed by runtime entry file ${file.pathname}`);
  }
});

test('effect workflow remains secret-free and does not expose broader executor operations', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /AXIOM_AGENT_READ_SYSTEM_FACTS_EFFECT_LAB: "1"/);
  assert.match(workflow, /node src\/read-system-facts-effect-drill\.mjs/);
  assert.match(workflow, /verifyAgentReadSystemFactsEffectReceipt/);
  for (const forbidden of ['secrets.', 'provision-production', 'docker compose', 'run-build', 'run-tests', 'start-local-test-services']) {
    assert.ok(!workflow.includes(forbidden), `effect workflow contains forbidden surface: ${forbidden}`);
  }
});

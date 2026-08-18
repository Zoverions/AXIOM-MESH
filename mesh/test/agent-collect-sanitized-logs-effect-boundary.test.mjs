import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);
const DRILL = new URL('mesh/src/collect-sanitized-logs-effect-drill.mjs', ROOT);
const EFFECT = new URL('mesh/src/lib/agent-collect-sanitized-logs-effect.mjs', ROOT);
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

function staticImportSpecifiers(source) {
  return [...source.matchAll(
    /^\s*import(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"];\s*$/gm
  )].map(match => match[1]);
}

test('sanitized-log effect control module has no host effect imports', async () => {
  const source = await readFile(EFFECT, 'utf8');
  const imports = staticImportSpecifiers(source);
  assert.ok(imports.includes('node:crypto'), 'sanitized-log control module import scan did not resolve actual declarations');
  for (const forbidden of [
    'node:child_process', 'node:fs', 'node:fs/promises', 'node:http', 'node:https',
    'node:net', 'node:tls', 'node:dns', 'node:dgram', 'node:worker_threads'
  ]) assert.ok(!imports.includes(forbidden), `sanitized-log control module contains effect import: ${forbidden}`);
  for (const required of [
    'signed_consumed_head_before_effect: true',
    'arbitrary_path_allowed: false',
    'host_or_repository_log_read_allowed: false',
    'symlink_following_allowed: false',
    "network_mode: 'none'",
    'AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256',
    'verifyAgentExecutorDurableStateReceipt(this.consumeHeadReceipt'
  ]) assert.ok(source.includes(required), `sanitized-log control module missing boundary: ${required}`);
});

test('sanitized-log effect drill is fixed, local, networkless and mountless', async () => {
  const source = await readFile(DRILL, 'utf8');
  for (const required of [
    'AXIOM_AGENT_COLLECT_SANITIZED_LOGS_EFFECT_LAB',
    'AXIOM_AGENT_LINUX_ISOLATION_RECEIPT',
    "DOCKER_HOST: 'unix:///var/run/docker.sock'",
    "'--network', 'none'",
    "'--read-only'",
    "'--cap-drop', 'ALL'",
    "'--security-opt', 'no-new-privileges=true'",
    "'--user', '10001:10001'",
    "'--entrypoint', AGENT_LINUX_ISOLATION_ENTRYPOINT",
    "'--input-type=module', '-e', AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT",
    'shell: false',
    "assert(store.status === 'consumed' && store.generation === 2",
    'verifyAgentCollectSanitizedLogsEffectReceipt',
    'verifyAgentExecutorDurableStateReceipt(descriptor.durable_consume_head_receipt',
    'controller.interrupt'
  ]) assert.ok(source.includes(required), `sanitized-log drill missing boundary ${required}`);

  for (const forbidden of [
    'process.argv', '...process.env', "'--privileged'", "'--volume'", "'--mount'", "'--device'",
    "'--pid', 'host'", "'--network', 'host'", "'--network', 'bridge'", "'--env-file'",
    'docker login', 'docker context use', 'node:http', 'node:https', 'node:tls', 'node:dgram',
    'npm ', 'run-build', 'run-tests', 'start-local-test-services', 'install-test-dependencies',
    'ssh ', 'scp ', 'tailscale', 'wireguard'
  ]) assert.ok(!source.includes(forbidden), `sanitized-log drill contains forbidden surface: ${forbidden}`);
});

test('sanitized-log effect drill cannot be imported by supported runtime source', async () => {
  const files = await collectMjs(SRC_ROOT);
  const drillHref = DRILL.href;
  const pattern = /(?:from[ \t]+|import[ \t]*\([ \t]*|import[ \t]+)[`'"][^`'"]*collect-sanitized-logs-effect-drill\.mjs/;
  for (const file of files) {
    if (file.href === drillHref) continue;
    const source = await readFile(file, 'utf8');
    assert.ok(!pattern.test(source), `sanitized-log effect drill imported by ${file.pathname}`);
  }
});

test('package, image and compose entrypoints cannot expose sanitized-log effect drill', async () => {
  for (const file of RUNTIME_ENTRY_FILES) {
    const source = await readFile(file, 'utf8');
    assert.ok(!source.includes('collect-sanitized-logs-effect-drill'), `sanitized-log effect drill exposed by runtime entry file ${file.pathname}`);
  }
});

test('effect workflow stays secret-free and explicitly governs the sanitized-log path', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /AXIOM_AGENT_COLLECT_SANITIZED_LOGS_EFFECT_LAB: "1"/);
  assert.match(workflow, /node src\/collect-sanitized-logs-effect-drill\.mjs/);
  assert.match(workflow, /verifyAgentCollectSanitizedLogsEffectAdmission/);
  assert.match(workflow, /verifyAgentCollectSanitizedLogsEffectReceipt/);
  assert.match(workflow, /axiom-agent-collect-sanitized-logs-effect\.json/);
  for (const forbidden of ['secrets.', 'provision-production', 'docker compose', 'run-build', 'run-tests', 'start-local-test-services']) {
    assert.ok(!workflow.includes(forbidden), `effect workflow contains forbidden surface: ${forbidden}`);
  }
});

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT,
  AGENT_COLLECT_BENCHMARK_METRICS_EXPECTED_CHECKSUM,
  AGENT_COLLECT_BENCHMARK_METRICS_ITERATIONS
} from '../src/lib/agent-collect-benchmark-metrics-effect.mjs';

const ROOT = new URL('../../', import.meta.url);
const DRILL = new URL('mesh/src/collect-benchmark-metrics-effect-drill.mjs', ROOT);
const EFFECT = new URL('mesh/src/lib/agent-collect-benchmark-metrics-effect.mjs', ROOT);
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
  return [...source.matchAll(/^\s*import(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"];\s*$/gm)].map(match => match[1]);
}

test('benchmark effect control module has no host effect imports', async () => {
  const source = await readFile(EFFECT, 'utf8');
  const imports = staticImportSpecifiers(source);
  assert.ok(imports.includes('node:crypto'), 'benchmark control module import scan did not resolve actual declarations');
  for (const forbidden of [
    'node:child_process','node:fs','node:fs/promises','node:http','node:https','node:net','node:tls','node:dns','node:dgram','node:os','node:worker_threads'
  ]) assert.ok(!imports.includes(forbidden), `benchmark control module contains effect import: ${forbidden}`);
  for (const required of [
    'signed_consumed_head_before_effect: true',
    'synthetic_workload_only: true',
    'host_telemetry_allowed: false',
    'arbitrary_benchmark_allowed: false',
    "network_mode: 'none'",
    'machine_comparison_score_claimed: false',
    'production_slo_claimed: false',
    'AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT_SHA256',
    'verifyAgentExecutorDurableStateReceipt(this.consumeHeadReceipt'
  ]) assert.ok(source.includes(required), `benchmark control module missing boundary: ${required}`);
});

test('fixed benchmark adapter cannot inspect ambient host state or change workload semantics', () => {
  assert.equal(AGENT_COLLECT_BENCHMARK_METRICS_ITERATIONS, 262144);
  assert.equal(AGENT_COLLECT_BENCHMARK_METRICS_EXPECTED_CHECKSUM, 1679840888);
  for (const required of [
    "const POLICY='synthetic-lcg-u32-262144-v1'",
    "const WORKLOAD='lcg-u32-262144-v1'",
    'const ITERATIONS=262144',
    'const EXPECTED=1679840888',
    'process.hrtime.bigint()',
    "timer_source:'process.hrtime.bigint'"
  ]) assert.ok(AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT.includes(required), `benchmark adapter missing fixed semantic: ${required}`);
  for (const forbidden of [
    'process.argv','process.env','Date.now','performance.now','eval(','Function(','import ','require(',
    'node:fs','node:os','node:child_process','node:http','node:https','node:net','node:dns','/proc/','/sys/','os.cpus','totalmem','freemem'
  ]) assert.ok(!AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT.includes(forbidden), `benchmark adapter contains ambient/effect surface: ${forbidden}`);
});

test('benchmark effect drill is fixed, local, networkless and repository-mountless', async () => {
  const source = await readFile(DRILL, 'utf8');
  for (const required of [
    'AXIOM_AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_LAB',
    'AXIOM_AGENT_LINUX_ISOLATION_RECEIPT',
    "DOCKER_HOST: 'unix:///var/run/docker.sock'",
    "'--network', 'none'",
    "'--read-only'",
    "'--cap-drop', 'ALL'",
    "'--security-opt', 'no-new-privileges=true'",
    "'--user', '10001:10001'",
    "'--entrypoint', AGENT_LINUX_ISOLATION_ENTRYPOINT",
    "'--input-type=module', '-e', AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT",
    'shell: false',
    "assert(store.status === 'consumed' && store.generation === 2",
    'verifyAgentCollectBenchmarkMetricsEffectReceipt',
    'verifyAgentExecutorDurableStateReceipt(descriptor.durable_consume_head_receipt',
    'host_telemetry_read: false',
    'machine_comparison_score_claimed: false',
    'controller.interrupt'
  ]) assert.ok(source.includes(required), `benchmark drill missing boundary ${required}`);
  for (const forbidden of [
    'process.argv','...process.env',"'--privileged'","'--volume'","'--mount'","'--device'","'--pid', 'host'","'--network', 'host'","'--network', 'bridge'","'--env-file'",
    'docker login','docker context use','node:http','node:https','node:tls','node:dgram','os.cpus','os.totalmem','os.freemem','/proc/cpuinfo','/proc/meminfo',
    'npm ','run-build','run-tests','start-local-test-services','install-test-dependencies','ssh ','scp ','tailscale','wireguard'
  ]) assert.ok(!source.includes(forbidden), `benchmark drill contains forbidden surface: ${forbidden}`);
});

test('benchmark effect drill cannot be imported by supported runtime source', async () => {
  const files = await collectMjs(SRC_ROOT);
  const drillHref = DRILL.href;
  const pattern = /(?:from[ \t]+|import[ \t]*\([ \t]*|import[ \t]+)[`'"][^`'"]*collect-benchmark-metrics-effect-drill\.mjs/;
  for (const file of files) {
    if (file.href === drillHref) continue;
    const source = await readFile(file, 'utf8');
    assert.ok(!pattern.test(source), `benchmark effect drill imported by ${file.pathname}`);
  }
});

test('package, image and compose entrypoints cannot expose benchmark effect drill', async () => {
  for (const file of RUNTIME_ENTRY_FILES) {
    const source = await readFile(file, 'utf8');
    assert.ok(!source.includes('collect-benchmark-metrics-effect-drill'), `benchmark effect drill exposed by runtime entry file ${file.pathname}`);
  }
});

test('effect workflow stays secret-free and explicitly governs the benchmark path', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /AXIOM_AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_LAB: "1"/);
  assert.match(workflow, /node src\/collect-benchmark-metrics-effect-drill\.mjs/);
  assert.match(workflow, /verifyAgentCollectBenchmarkMetricsEffectAdmission/);
  assert.match(workflow, /verifyAgentCollectBenchmarkMetricsEffectReceipt/);
  assert.match(workflow, /axiom-agent-collect-benchmark-metrics-effect\.json/);
  for (const forbidden of ['secrets.','provision-production','docker compose','run-build','run-tests','start-local-test-services']) {
    assert.ok(!workflow.includes(forbidden), `effect workflow contains forbidden surface: ${forbidden}`);
  }
});

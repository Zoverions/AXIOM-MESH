import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readlinkSync, realpathSync, statSync } from 'node:fs';
import { arch, release } from 'node:os';
import { canonicalJson, digestObject } from './lib/canonical.mjs';
import {
  AGENT_LINUX_ISOLATION_ADAPTER_ID,
  AGENT_LINUX_ISOLATION_DOCKER_BINARY,
  AGENT_LINUX_ISOLATION_ENTRYPOINT,
  AGENT_LINUX_ISOLATION_IMAGE_TAG,
  buildAgentLinuxIsolationConformanceReceipt
} from './lib/agent-linux-isolation-conformance.mjs';
import {
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA
} from './lib/agent-executor-isolation-profile.mjs';

const REVISION = process.env.GITHUB_SHA;
const PROBE_TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 65536;
const MEMORY_BYTES = 134217728;
const PID_LIMIT = 32;
const CPU_QUOTA = 0.5;
const HOST_SENTINEL_KEY = 'AXIOM_AGENT_HOST_ONLY_SENTINEL';
const DENIED_WRITE_CODES = new Set(['EROFS', 'EACCES', 'EPERM']);
const DENIED_NETWORK_CODES = new Set(['ENETUNREACH', 'EHOSTUNREACH', 'EACCES', 'EPERM']);

async function baselineProbeProgram() {
  const fs = require('node:fs');
  const net = require('node:net');
  const crypto = require('node:crypto');

  function statusValue(name) {
    const line = fs.readFileSync('/proc/self/status', 'utf8')
      .split('\n')
      .find(item => item.startsWith(`${name}:`));
    if (!line) throw new Error(`missing proc status field ${name}`);
    return line.slice(line.indexOf(':') + 1).trim();
  }

  function rootMountOptions() {
    const line = fs.readFileSync('/proc/mounts', 'utf8')
      .split('\n')
      .find(item => item.split(' ')[1] === '/');
    if (!line) throw new Error('missing root mount');
    return line.split(' ')[3].split(',');
  }

  function deniedWrite(path) {
    try {
      fs.writeFileSync(path, 'denied');
      return null;
    } catch (error) {
      return error.code || 'UNKNOWN';
    }
  }

  async function networkDenial() {
    return await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '1.1.1.1', port: 443 });
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(value);
      };
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('public network probe timed out without an explicit denial'));
      }, 1200);
      socket.once('connect', () => reject(new Error('public network connection unexpectedly succeeded')));
      socket.once('error', error => finish(error.code || 'UNKNOWN'));
    });
  }

  fs.writeFileSync('/work/probe-write', 'ok');
  fs.symlinkSync('/', '/work/root-link');
  const mountInfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
  const fdTargets = fs.readdirSync('/proc/self/fd').map(name => {
    try {
      return fs.readlinkSync(`/proc/self/fd/${name}`);
    } catch {
      return '';
    }
  });
  const cpuFields = fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (cpuFields.length !== 2) throw new Error('unexpected cpu.max field count');

  const observation = {
    container_pid_namespace: fs.readlinkSync('/proc/self/ns/pid'),
    container_mount_namespace: fs.readlinkSync('/proc/self/ns/mnt'),
    container_network_namespace: fs.readlinkSync('/proc/self/ns/net'),
    uid: process.getuid(),
    cap_eff: statusValue('CapEff'),
    no_new_privs: Number(statusValue('NoNewPrivs')),
    seccomp: Number(statusValue('Seccomp')),
    root_read_only: rootMountOptions().includes('ro'),
    workspace_write_succeeded: fs.readFileSync('/work/probe-write', 'utf8') === 'ok',
    root_write_error: deniedWrite('/axiom-root-write-probe'),
    symlink_write_error: deniedWrite('/work/root-link/etc/axiom-symlink-write-probe'),
    docker_socket_present: fs.existsSync('/var/run/docker.sock'),
    host_sentinel_present: Object.hasOwn(process.env, 'AXIOM_AGENT_HOST_ONLY_SENTINEL'),
    secret_mount_present: mountInfo.includes(' /run/secrets '),
    public_network_error: await networkDenial(),
    memory_max: Number(fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim()),
    pids_max: Number(fs.readFileSync('/sys/fs/cgroup/pids.max', 'utf8').trim()),
    cpu_quota: Number(cpuFields[0]),
    cpu_period: Number(cpuFields[1]),
    fd_count: fdTargets.length,
    unexpected_sensitive_fd: fdTargets.some(target =>
      target.includes('docker.sock')
      || target.includes('/run/secrets')
      || target.includes('/home/runner')
      || target.includes('/_work/')
    ),
    mount_digest: crypto.createHash('sha256').update(mountInfo).digest('hex')
  };
  process.stdout.write(JSON.stringify(observation));
}

async function pidCeilingProbeProgram() {
  const { spawn } = require('node:child_process');
  const requested = 64;
  const children = [];
  const outcomes = [];
  for (let index = 0; index < requested; index += 1) {
    const child = spawn('/bin/sleep', ['4'], { stdio: 'ignore' });
    children.push(child);
    outcomes.push(new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      child.once('spawn', () => finish('started'));
      child.once('error', () => finish('blocked'));
    }));
  }
  const results = await Promise.all(outcomes);
  for (const child of children) {
    if (!child.pid) continue;
    try {
      child.kill('SIGKILL');
    } catch {
      // A child already exiting still counts as a started process.
    }
  }
  const started = results.filter(value => value === 'started').length;
  const blocked = results.filter(value => value === 'blocked').length;
  process.stdout.write(JSON.stringify({ requested, started, blocked }));
}

function timeoutProbeProgram() {
  const { spawn } = require('node:child_process');
  spawn('/bin/sleep', ['30'], { stdio: 'ignore' });
  setInterval(() => {}, 1000);
}

function outputProbeProgram() {
  process.stdout.write('x'.repeat(1048576));
  setInterval(() => {}, 1000);
}

function asProbeSource(fn) {
  return `(${fn.toString()})().catch?.(error => { process.stderr.write(String(error?.message || error)); process.exit(1); })`;
}

const BASELINE_PROBE = asProbeSource(baselineProbeProgram);
const PID_CEILING_PROBE = asProbeSource(pidCeilingProbeProgram);
const TIMEOUT_PROBE = `(${timeoutProbeProgram.toString()})()`;
const OUTPUT_PROBE = `(${outputProbeProgram.toString()})()`;

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function safeDockerEnvironment() {
  return {
    PATH: '/usr/bin:/bin',
    HOME: '/nonexistent',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    DOCKER_HOST: 'unix:///var/run/docker.sock',
    DOCKER_CONTEXT: 'default'
  };
}

function runDocker(args, { timeout = PROBE_TIMEOUT_MS, maxBuffer = MAX_OUTPUT_BYTES } = {}) {
  return spawnSync(AGENT_LINUX_ISOLATION_DOCKER_BINARY, args, {
    encoding: 'utf8',
    env: safeDockerEnvironment(),
    timeout,
    maxBuffer,
    windowsHide: true,
    shell: false
  });
}

function dockerText(args, label) {
  const result = runDocker(args, { timeout: PROBE_TIMEOUT_MS, maxBuffer: 16384 });
  if (result.error || result.status !== 0) {
    const message = String(result.stderr || result.error?.message || '').slice(0, 2000);
    fail(`${label} failed: ${message}`);
  }
  const value = String(result.stdout || '').trim();
  if (!value) fail(`${label} returned empty output`);
  return value;
}

function containerAbsent(name) {
  const result = runDocker(['container', 'inspect', name], { timeout: 3000, maxBuffer: 4096 });
  return result.status !== 0;
}

function cleanupContainer(name) {
  runDocker(['rm', '-f', name], { timeout: 3000, maxBuffer: 4096 });
  return containerAbsent(name);
}

function fixedContainerArgs(name, script) {
  return [
    'run',
    '--name', name,
    '--rm',
    '--init',
    '--network', 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges=true',
    '--pids-limit', String(PID_LIMIT),
    '--memory', '128m',
    '--memory-swap', '128m',
    '--cpus', String(CPU_QUOTA),
    '--user', '10001:10001',
    '--tmpfs', '/work:rw,noexec,nosuid,nodev,size=16777216,mode=700,uid=10001,gid=10001',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=8388608,mode=700,uid=10001,gid=10001',
    '--tmpfs', '/var/lib/axiom-mesh:rw,noexec,nosuid,nodev,size=8388608,mode=700,uid=10001,gid=10001',
    '--workdir', '/work',
    '--env', 'AXIOM_LAB_CONTAINER_SENTINEL=1',
    '--entrypoint', AGENT_LINUX_ISOLATION_ENTRYPOINT,
    AGENT_LINUX_ISOLATION_IMAGE_TAG,
    '-e',
    script
  ];
}

function parseJsonOutput(result, label) {
  if (result.error || result.status !== 0) {
    const message = String(result.stderr || result.error?.message || '').slice(0, 2000);
    fail(`${label} failed: ${message}`);
  }
  try {
    return JSON.parse(String(result.stdout || ''));
  } catch {
    fail(`${label} did not return valid JSON`);
  }
}

function runJsonProbe(probeId, script) {
  const name = `axiom-linux-${probeId}-${randomBytes(6).toString('hex')}`;
  try {
    return parseJsonOutput(runDocker(fixedContainerArgs(name, script)), probeId);
  } finally {
    if (!cleanupContainer(name)) fail(`${probeId} container cleanup could not be verified`);
  }
}

function validateBaseline(observation, runnerNamespaces) {
  assert(observation.container_pid_namespace !== runnerNamespaces.pid, 'PID namespace was not separated');
  assert(observation.container_mount_namespace !== runnerNamespaces.mount, 'mount namespace was not separated');
  assert(observation.container_network_namespace !== runnerNamespaces.network, 'network namespace was not separated');
  assert(observation.uid === 10001, 'probe did not run as the reviewed non-root UID');
  assert(observation.cap_eff === '0000000000000000', 'effective capabilities were not zero');
  assert(observation.no_new_privs === 1, 'no-new-privileges was not active');
  assert(observation.seccomp === 2, 'seccomp filter mode was not active');
  assert(observation.root_read_only === true, 'container root was not observed read-only');
  assert(observation.workspace_write_succeeded === true, 'disposable workspace was not writable');
  assert(DENIED_WRITE_CODES.has(observation.root_write_error), 'container-root write was not explicitly denied');
  assert(DENIED_WRITE_CODES.has(observation.symlink_write_error), 'symlink write escape was not explicitly denied');
  assert(observation.docker_socket_present === false, 'Docker socket became visible inside the probe');
  assert(observation.host_sentinel_present === false, 'host-only environment sentinel leaked into the probe');
  assert(observation.secret_mount_present === false, 'secret mount became visible inside the probe');
  assert(DENIED_NETWORK_CODES.has(observation.public_network_error), 'public network attempt was not explicitly denied');
  assert(observation.memory_max === MEMORY_BYTES, 'memory cgroup limit did not match the reviewed ceiling');
  assert(observation.pids_max === PID_LIMIT, 'PID cgroup limit did not match the reviewed ceiling');
  assert(
    Number.isInteger(observation.cpu_quota) && Number.isInteger(observation.cpu_period),
    `CPU cgroup evidence was invalid: quota=${String(observation.cpu_quota)} period=${String(observation.cpu_period)}`
  );
  assert(Math.abs((observation.cpu_quota / observation.cpu_period) - CPU_QUOTA) <= 0.01, 'CPU cgroup limit did not match the reviewed ceiling');
  assert(Number.isInteger(observation.fd_count) && observation.fd_count >= 3 && observation.fd_count <= 64, 'file descriptor count exceeded the reviewed bound');
  assert(observation.unexpected_sensitive_fd === false, 'unexpected sensitive descriptor became visible');
  assert(typeof observation.mount_digest === 'string' && /^[a-f0-9]{64}$/.test(observation.mount_digest), 'mount evidence digest was invalid');
}

function runPidCeilingProbe() {
  const name = `axiom-linux-pid-ceiling-${randomBytes(6).toString('hex')}`;
  let observation;
  let cleanupVerified = false;
  try {
    observation = parseJsonOutput(runDocker(fixedContainerArgs(name, PID_CEILING_PROBE)), 'pid-ceiling');
  } finally {
    cleanupVerified = cleanupContainer(name);
  }
  assert(cleanupVerified, 'PID ceiling probe cleanup could not be verified');
  assert(observation.requested === 64, 'PID ceiling probe request count drifted');
  assert(Number.isInteger(observation.started) && observation.started >= 1 && observation.started < 64, 'PID ceiling did not bound process creation');
  assert(Number.isInteger(observation.blocked) && observation.blocked >= 1, 'PID ceiling produced no blocked process creation');
  assert(observation.started + observation.blocked === observation.requested, 'PID ceiling outcomes did not reconcile');
  return { ...observation, container_absent_after_cleanup: true };
}

function runTimeoutProbe() {
  const name = `axiom-linux-timeout-${randomBytes(6).toString('hex')}`;
  const result = runDocker(fixedContainerArgs(name, TIMEOUT_PROBE), { timeout: 750, maxBuffer: 4096 });
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const cleanupVerified = cleanupContainer(name);
  assert(timedOut, 'timeout probe did not fail closed on the reviewed deadline');
  assert(cleanupVerified, 'timeout probe left a live container');
  return { timed_out: true, container_absent_after_cleanup: true };
}

function runOutputProbe() {
  const name = `axiom-linux-output-${randomBytes(6).toString('hex')}`;
  const result = runDocker(fixedContainerArgs(name, OUTPUT_PROBE), {
    timeout: PROBE_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES
  });
  const overflowDetected = result.error?.code === 'ENOBUFS';
  const cleanupVerified = cleanupContainer(name);
  assert(overflowDetected, 'output ceiling probe did not fail closed on overflow');
  assert(cleanupVerified, 'output overflow probe left a live container');
  return {
    overflow_detected: true,
    output_limit_bytes: MAX_OUTPUT_BYTES,
    container_absent_after_cleanup: true
  };
}

function preflight() {
  assert(process.platform === 'linux', 'Linux isolation adapter laboratory requires Linux');
  assert(process.env.AXIOM_AGENT_LINUX_ISOLATION_LAB === '1', 'Linux isolation adapter laboratory requires explicit opt-in');
  assert(process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true', 'Linux isolation adapter v1 is restricted to protected hosted CI evidence');
  assert(typeof REVISION === 'string' && /^[a-f0-9]{40}$/.test(REVISION), 'GITHUB_SHA must bind one exact repository revision');
  assert(realpathSync(AGENT_LINUX_ISOLATION_DOCKER_BINARY) === AGENT_LINUX_ISOLATION_DOCKER_BINARY, 'Docker binary path is not the reviewed absolute path');
  assert((statSync(AGENT_LINUX_ISOLATION_DOCKER_BINARY).mode & 0o111) !== 0, 'Docker binary is not executable');
  process.env[HOST_SENTINEL_KEY] = randomBytes(16).toString('hex');
}

function main() {
  preflight();
  const runnerNamespaces = {
    pid: readlinkSync('/proc/self/ns/pid'),
    mount: readlinkSync('/proc/self/ns/mnt'),
    network: readlinkSync('/proc/self/ns/net')
  };
  const dockerServerVersion = dockerText(['version', '--format', '{{.Server.Version}}'], 'Docker server version');
  const imageId = dockerText(['image', 'inspect', '--format', '{{.Id}}', AGENT_LINUX_ISOLATION_IMAGE_TAG], 'probe image inspection');
  assert(/^sha256:[a-f0-9]{64}$/.test(imageId), 'probe image ID is not content-addressed');

  const baseline = runJsonProbe('baseline', BASELINE_PROBE);
  validateBaseline(baseline, runnerNamespaces);
  const pidCeiling = runPidCeilingProbe();
  const timeoutCleanup = runTimeoutProbe();
  const outputCeiling = runOutputProbe();
  const evidence = {
    baseline,
    pid_ceiling: pidCeiling,
    timeout_cleanup: timeoutCleanup,
    output_ceiling: outputCeiling
  };

  const receipt = buildAgentLinuxIsolationConformanceReceipt({
    revision: REVISION,
    platform: {
      operating_system: 'linux',
      architecture: arch(),
      kernel_release: release(),
      runner_pid_namespace: runnerNamespaces.pid,
      runner_mount_namespace: runnerNamespaces.mount,
      runner_network_namespace: runnerNamespaces.network
    },
    policy: {
      catalog_schema: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA,
      catalog_digest: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
      policy_id: 'linux-kernel-isolation-v1',
      revision: 1
    },
    adapter: {
      adapter_id: AGENT_LINUX_ISOLATION_ADAPTER_ID,
      docker_binary: AGENT_LINUX_ISOLATION_DOCKER_BINARY,
      docker_server_version: dockerServerVersion,
      image_tag: AGENT_LINUX_ISOLATION_IMAGE_TAG,
      image_id: imageId,
      entrypoint: AGENT_LINUX_ISOLATION_ENTRYPOINT
    },
    limits: {
      network_mode: 'none',
      read_only_root: true,
      capabilities_dropped: 'ALL',
      no_new_privileges: true,
      uid_gid: '10001:10001',
      pids: PID_LIMIT,
      memory_bytes: MEMORY_BYTES,
      cpu_quota: CPU_QUOTA,
      probe_timeout_ms: PROBE_TIMEOUT_MS,
      max_output_bytes: MAX_OUTPUT_BYTES
    },
    controls: {
      pid_namespace_separated: true,
      mount_namespace_separated: true,
      network_namespace_separated: true,
      effective_capabilities_zero: true,
      no_new_privileges_active: true,
      seccomp_filter_active: true,
      disposable_workspace_writable: true,
      container_root_write_denied: true,
      symlink_write_escape_denied: true,
      docker_socket_absent: true,
      host_sentinel_absent: true,
      secret_mount_absent: true,
      public_network_denied: true,
      memory_limit_observed: true,
      pid_limit_observed: true,
      cpu_limit_observed: true,
      pid_exhaustion_bounded: true,
      timeout_cleanup_verified: true,
      output_overflow_cleanup_verified: true
    },
    evidence,
    probes: [
      { probe_id: 'baseline', status: 'pass', observation_digest: digestObject(evidence.baseline) },
      { probe_id: 'pid-ceiling', status: 'pass', observation_digest: digestObject(evidence.pid_ceiling) },
      { probe_id: 'timeout-cleanup', status: 'pass', observation_digest: digestObject(evidence.timeout_cleanup) },
      { probe_id: 'output-ceiling', status: 'pass', observation_digest: digestObject(evidence.output_ceiling) }
    ],
    claims: {
      fixed_probe_real_process_effects_observed: true,
      fixed_probe_disposable_filesystem_effects_observed: true,
      tested_linux_kernel_controls_observed: true,
      tested_network_denial_observed: true,
      physical_device_proof: false,
      globally_verified_platform_isolation: false,
      arbitrary_repository_code_isolation_verified: false,
      compiled_plan_effect_admission: false,
      production_executor_ready: false,
      remote_execution_enabled: false,
      remote_administration_enabled: false,
      credentials_available: false,
      secrets_available: false,
      production_node_enrollment: false,
      deployment_authority: false,
      capability_promoted: false,
      authority_granted: false
    }
  });

  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Linux isolation adapter drill failed: ${String(error?.message || error).slice(0, 2000)}\n`);
  process.exit(1);
}

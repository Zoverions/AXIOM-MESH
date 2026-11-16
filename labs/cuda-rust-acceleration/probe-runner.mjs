import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const MAX_OUTPUT = 16_384;

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 15_000
  });
  return {
    command,
    args,
    available: !result.error,
    status: Number.isInteger(result.status) ? result.status : null,
    stdout: String(result.stdout ?? '').slice(0, MAX_OUTPUT),
    stderr: String(result.stderr ?? '').slice(0, MAX_OUTPUT),
    error_code: result.error?.code ?? null
  };
}

export function parseRustVersion(text) {
  const match = String(text).match(/rustc\s+(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function parseCudaToolkitVersion(text) {
  const match = String(text).match(/release\s+(\d+)\.(\d+)/i);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function parseNvidiaSmiRows(text) {
  const rows = [];
  for (const raw of String(text).trim().split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const parts = raw.split(',').map(part => part.trim());
    if (parts.length !== 4) continue;
    const [name, computeCapabilityText, driverVersion, memoryMiBText] = parts;
    const computeCapability = Number(computeCapabilityText);
    const memoryMiB = Number(memoryMiBText);
    rows.push({
      name,
      compute_capability: Number.isFinite(computeCapability) ? computeCapability : null,
      driver_version: driverVersion || null,
      memory_mib: Number.isFinite(memoryMiB) ? memoryMiB : null
    });
  }
  return rows;
}

function versionAtLeast(actual, minimum) {
  if (!actual) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    const a = actual[index] ?? 0;
    const b = minimum[index] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

export function evaluateCudaRustRunnerEvidence(evidence) {
  const rust = parseRustVersion(evidence.rustc.stdout);
  const cuda = parseCudaToolkitVersion(evidence.nvcc.stdout);
  const gpus = parseNvidiaSmiRows(evidence.nvidia_smi.stdout);
  const eligibleGpus = gpus.filter(gpu =>
    gpu.compute_capability !== null
    && gpu.compute_capability >= 8.0
    && typeof gpu.driver_version === 'string'
    && gpu.driver_version.length > 0
  );

  const checks = {
    linux: evidence.platform === 'linux',
    supported_arch: ['x64', 'arm64'].includes(evidence.arch),
    rust_1_89_plus: evidence.rustc.status === 0 && versionAtLeast(rust, [1, 89, 0]),
    cuda_13_2_plus: evidence.nvcc.status === 0 && versionAtLeast(cuda, [13, 2]),
    tileiras_present: evidence.tileiras.status === 0,
    nvidia_smi_present: evidence.nvidia_smi.status === 0,
    sm_80_plus: eligibleGpus.length > 0
  };

  return Object.freeze({
    schema: 'axiom-cuda-rust-runner-probe.v0',
    eligible: Object.values(checks).every(Boolean),
    checks: Object.freeze(checks),
    platform: evidence.platform,
    arch: evidence.arch,
    rust_version: rust ? rust.join('.') : null,
    cuda_toolkit_version: cuda ? cuda.join('.') : null,
    gpus: Object.freeze(gpus.map(gpu => Object.freeze({ ...gpu }))),
    eligible_gpus: Object.freeze(eligibleGpus.map(gpu => Object.freeze({ ...gpu }))),
    execution_effect: 'probe-only',
    authority_effect: 'none',
    runtime_activation: false,
    capability_promotion: false
  });
}

export function probeCudaRustRunner() {
  const evidence = {
    platform: process.platform,
    arch: process.arch,
    rustc: run('rustc', ['--version']),
    nvcc: run('nvcc', ['--version']),
    tileiras: run('tileiras', ['--help']),
    nvidia_smi: run('nvidia-smi', [
      '--query-gpu=name,compute_cap,driver_version,memory.total',
      '--format=csv,noheader,nounits'
    ])
  };
  return {
    evidence,
    result: evaluateCudaRustRunnerEvidence(evidence)
  };
}

function main() {
  const report = probeCudaRustRunner();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (process.argv.includes('--require-eligible') && !report.result.eligible) {
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

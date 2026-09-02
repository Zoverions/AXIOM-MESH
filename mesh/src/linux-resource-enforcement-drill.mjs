import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { ValidationError, sha256 } from './lib/canonical.mjs';
import { ensureMeshIdentity } from './lib/identity.mjs';
import {
  collectLinuxEnforcementCapability
} from './lib/linux-enforcement-capability.mjs';
import {
  compileLinuxResourceEnforcement
} from './lib/linux-resource-enforcement.mjs';
import {
  verifyLinuxResourceEnforcementEvidence
} from './lib/linux-resource-enforcement-evidence.mjs';

const execFileAsync = promisify(execFile);
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SYSTEMCTL = '/usr/bin/systemctl';
const SLEEP = '/usr/bin/sleep';
const CGROUP_ROOT = '/sys/fs/cgroup';
const SAFE_ENV = Object.freeze({
  PATH: '/usr/bin:/bin',
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  HOME: '/nonexistent'
});

export async function runLinuxResourceEnforcementDrill({
  workspaceDir,
  sourceRevision,
  generatedAt = new Date().toISOString(),
  allowEffects = false,
  effects = undefined,
  capabilityProvider = collectLinuxEnforcementCapability,
  identityProvider = async workspace => ensureMeshIdentity(
    workspace,
    'host-guardian-lab',
    { create: true }
  )
} = {}) {
  if (allowEffects !== true) {
    throw new ValidationError(
      'Linux resource enforcement effects must be explicitly enabled'
    );
  }
  const revision = normalizeRevision(sourceRevision);
  const generated = normalizeTimestamp(generatedAt);
  const workspace = await prepareWorkspace(workspaceDir);
  if (
    typeof capabilityProvider !== 'function'
    || typeof identityProvider !== 'function'
  ) {
    throw new ValidationError(
      'Linux resource enforcement providers are invalid'
    );
  }
  const platformEffects = effects ?? createDefaultEffects();
  validateEffects(platformEffects);
  const capability = validateCapability(await capabilityProvider());
  const identity = await identityProvider(workspace);
  const request = {
    role: 'verification',
    resources: {
      cpu_millis: 250,
      memory_bytes: 67_108_864,
      storage_bytes: 0,
      bandwidth_bytes_per_second: 0,
      transfer_bytes: 0
    }
  };
  const decision = {
    allowed: true,
    reason: 'synthetic_local_lab_allow',
    role: 'verification',
    guardian_state: 'NORMAL',
    policy_revision: 1,
    measurement: {
      bundle_digest: sha256(
        `synthetic-host-guardian-lab:${revision}`
      )
    }
  };
  const enforcement = compileLinuxResourceEnforcement({
    decision,
    request,
    lease_seconds: 30,
    pids_max: 16
  });
  let started = false;
  let stopped = false;
  try {
    const start = await platformEffects.start(enforcement);
    started = true;
    if (!start || typeof start.control_group !== 'string') {
      throw new ValidationError(
        'Linux resource enforcement control group observation is invalid'
      );
    }
    const observed = await platformEffects.observe(start.control_group);
    const stopState = await platformEffects.stop(enforcement.unit_name);
    stopped = true;
    const observations = normalizeObservations({
      ...observed,
      stop_state: stopState
    });
    const checks = {
      cpu_limit_matches: (
        observations.cpu_max_quota * 1000
        === request.resources.cpu_millis * observations.cpu_max_period
      ),
      memory_limit_matches: (
        observations.memory_max_bytes === request.resources.memory_bytes
      ),
      pids_limit_matches: observations.pids_max === 16,
      stop_confirmed: observations.stop_state === 'inactive_or_absent',
      no_unrequested_network_or_storage_resource: (
        request.resources.storage_bytes === 0
        && request.resources.bandwidth_bytes_per_second === 0
        && request.resources.transfer_bytes === 0
      )
    };
    const failed = Object.entries(checks)
      .filter(([, value]) => value !== true)
      .map(([name]) => name);
    if (failed.length) {
      throw new ValidationError(
        `Linux resource enforcement drill checks failed: ${failed.join(', ')}`
      );
    }
    const publicKeyPem = String(identity.publicKey.export({
      type: 'spki',
      format: 'pem'
    }));
    const unsigned = {
      schema: 'linux.resource-enforcement-drill-evidence.v1',
      status: 'passed',
      generated_at: generated,
      source: { revision },
      profile: {
        backend: 'systemd-cgroup-v2',
        guardian_fixture: 'synthetic-local-lab',
        remote_execution_authorized: false,
        arbitrary_command_executed: false,
        network_task_executed: false
      },
      capability: {
        observation_digest: capability.observation_digest,
        cgroup_version: capability.cgroup_version,
        controllers: [...capability.controllers]
      },
      enforcement: {
        unit_name: enforcement.unit_name,
        request_digest: enforcement.request_digest,
        guardian_binding_digest: enforcement.guardian_binding_digest,
        requested_cpu_millis: request.resources.cpu_millis,
        requested_memory_bytes: request.resources.memory_bytes,
        requested_pids_max: 16,
        lease_seconds: 30
      },
      observations,
      checks,
      signer: {
        service: 'host-guardian-lab',
        key_id: identity.keyId,
        public_key_pem: publicKeyPem
      },
      limitations: [
        'synthetic Guardian admission is not physical host resource-policy evidence',
        'this fixed probe proves only the observed CPU, memory, PID, and stop behavior of the tested transient service',
        'the drill does not authorize arbitrary commands, remote execution, network tasks, storage allocation, production admission, or capability promotion'
      ]
    };
    const evidence = {
      ...unsigned,
      attestation: identity.signObject(unsigned)
    };
    verifyLinuxResourceEnforcementEvidence(evidence);
    return evidence;
  } finally {
    if (started && !stopped) {
      try {
        await platformEffects.stop(enforcement.unit_name);
      } catch {
        // The original failure remains authoritative. A later operator-facing
        // drill wrapper must report cleanup uncertainty separately.
      }
    }
  }
}

function createDefaultEffects() {
  if (process.platform !== 'linux') {
    throw new ValidationError(
      'Linux resource enforcement effect lab requires Linux'
    );
  }
  return Object.freeze({
    async start(enforcement) {
      await runCommand(
        enforcement.executable,
        [...enforcement.argv_prefix, SLEEP, '30'],
        { timeout: 5_000 }
      );
      const controlGroup = await pollControlGroup(enforcement.unit_name);
      return { control_group: controlGroup };
    },
    async observe(controlGroup) {
      const root = cgroupPath(controlGroup);
      const [cpuText, memoryText, pidsText] = await Promise.all([
        boundedRead(`${root}/cpu.max`),
        boundedRead(`${root}/memory.max`),
        boundedRead(`${root}/pids.max`)
      ]);
      const [quotaRaw, periodRaw] = cpuText.trim().split(/\s+/);
      return {
        cpu_max_quota: decimalInteger(
          quotaRaw,
          'cpu.max quota'
        ),
        cpu_max_period: decimalInteger(
          periodRaw,
          'cpu.max period'
        ),
        memory_max_bytes: decimalInteger(
          memoryText.trim(),
          'memory.max'
        ),
        pids_max: decimalInteger(
          pidsText.trim(),
          'pids.max'
        )
      };
    },
    async stop(unitName) {
      validateUnitName(unitName);
      await runCommand(
        SYSTEMCTL,
        ['stop', unitName],
        { timeout: 5_000, allowFailure: true }
      );
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const state = await runCommand(
          SYSTEMCTL,
          ['is-active', unitName],
          { timeout: 2_000, allowFailure: true }
        );
        if (state.code !== 0 || state.stdout.trim() !== 'active') {
          return 'inactive_or_absent';
        }
        await delay(100);
      }
      return 'active';
    }
  });
}

async function pollControlGroup(unitName) {
  validateUnitName(unitName);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await runCommand(
      SYSTEMCTL,
      ['show', unitName, '--property=ControlGroup', '--value'],
      { timeout: 2_000, allowFailure: true }
    );
    const value = result.stdout.trim();
    if (result.code === 0 && value.startsWith('/')) {
      return value;
    }
    await delay(100);
  }
  throw new ValidationError(
    'Linux resource enforcement control group did not become observable'
  );
}

async function runCommand(
  executable,
  argv,
  { timeout, allowFailure = false }
) {
  let stdout = '';
  let stderr = '';
  let code = 0;
  try {
    const result = await execFileAsync(executable, argv, {
      cwd: '/',
      env: SAFE_ENV,
      encoding: 'utf8',
      maxBuffer: 16 * 1024,
      timeout,
      killSignal: 'SIGKILL',
      windowsHide: true
    });
    stdout = result.stdout ?? '';
    stderr = result.stderr ?? '';
  } catch (error) {
    code = Number.isInteger(error?.code) ? error.code : 1;
    stdout = String(error?.stdout ?? '');
    stderr = String(error?.stderr ?? '');
    if (!allowFailure) {
      throw new ValidationError(
        `fixed Linux resource command failed: ${executable}: ${
          stderr.slice(0, 512)
        }`
      );
    }
  }
  return { code, stdout, stderr };
}

async function boundedRead(path) {
  const value = await readFile(path, 'utf8');
  if (Buffer.byteLength(value, 'utf8') > 256) {
    throw new ValidationError(
      'Linux cgroup observation exceeded the bounded read size'
    );
  }
  return value;
}

function cgroupPath(controlGroup) {
  if (
    typeof controlGroup !== 'string'
    || controlGroup.length < 2
    || controlGroup.length > 512
    || !controlGroup.startsWith('/')
    || controlGroup.includes('..')
    || controlGroup.includes('\0')
  ) {
    throw new ValidationError('Linux cgroup path is invalid');
  }
  const path = resolve(CGROUP_ROOT, `.${controlGroup}`);
  if (!path.startsWith(`${CGROUP_ROOT}/`)) {
    throw new ValidationError(
      'Linux cgroup path escapes the unified hierarchy'
    );
  }
  return path;
}

function validateCapability(value) {
  if (
    !value
    || value.format !== 'linux.enforcement-capability-verification.v1'
    || value.available !== true
    || !DIGEST.test(value.observation_digest ?? '')
    || value.cgroup_version !== 2
    || !Array.isArray(value.controllers)
    || !['cpu', 'memory', 'pids'].every(
      item => value.controllers.includes(item)
    )
    || value.property_enforcement_proven !== false
    || value.authority_effect !== 'none'
  ) {
    throw new ValidationError(
      'Linux enforcement capability verification is invalid'
    );
  }
  return value;
}

function normalizeObservations(value) {
  const output = {
    cpu_max_quota: decimalInteger(
      value.cpu_max_quota,
      'cpu_max_quota'
    ),
    cpu_max_period: decimalInteger(
      value.cpu_max_period,
      'cpu_max_period'
    ),
    memory_max_bytes: decimalInteger(
      value.memory_max_bytes,
      'memory_max_bytes'
    ),
    pids_max: decimalInteger(value.pids_max, 'pids_max'),
    stop_state: value.stop_state
  };
  if (!['inactive_or_absent', 'active'].includes(output.stop_state)) {
    throw new ValidationError(
      'Linux resource enforcement stop state is invalid'
    );
  }
  return output;
}

function decimalInteger(value, name) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new ValidationError(
      `${name} must be a positive integer`
    );
  }
  return number;
}

async function prepareWorkspace(workspaceDir) {
  if (typeof workspaceDir !== 'string' || !workspaceDir.trim()) {
    throw new ValidationError(
      'Linux resource enforcement workspace is required'
    );
  }
  const root = resolve(workspaceDir);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const entries = await readdir(root);
  if (entries.length) {
    throw new ValidationError(
      'Linux resource enforcement workspace must be empty and disposable'
    );
  }
  return root;
}

function validateEffects(effects) {
  if (
    !effects
    || typeof effects.start !== 'function'
    || typeof effects.observe !== 'function'
    || typeof effects.stop !== 'function'
  ) {
    throw new ValidationError(
      'Linux resource enforcement effect adapter is invalid'
    );
  }
}

function validateUnitName(unitName) {
  if (!/^mesh-contribution-[a-f0-9]{24}\.service$/.test(unitName ?? '')) {
    throw new ValidationError(
      'Linux resource enforcement unit name is invalid'
    );
  }
}

function normalizeRevision(value) {
  if (typeof value !== 'string' || !REVISION.test(value)) {
    throw new ValidationError(
      'Linux resource enforcement source revision must be a 40-character lowercase hex SHA'
    );
  }
  return value;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError(
      'Linux resource enforcement generated_at must be an ISO timestamp'
    );
  }
  return new Date(value).toISOString();
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

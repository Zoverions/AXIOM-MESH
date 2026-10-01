import { readFile, stat } from 'node:fs/promises';
import {
  ValidationError,
  assertPlainObject,
  digestObject
} from './canonical.mjs';

const FORMAT = 'linux.enforcement-capability-observation.v1';
const VERIFIED_FORMAT = 'linux.enforcement-capability-verification.v1';
const SYSTEMD_RUN = '/usr/bin/systemd-run';
const CGROUP_CONTROLLERS = '/sys/fs/cgroup/cgroup.controllers';
const REQUIRED_CONTROLLERS = Object.freeze(['cpu', 'memory', 'pids']);
const OBSERVATION_KEYS = new Set([
  'format', 'source', 'observed_at', 'systemd', 'cgroup', 'kernel_release'
]);
const SYSTEMD_KEYS = new Set([
  'pid1_comm',
  'runtime_directory_present',
  'systemd_run_path',
  'systemd_run_regular_file',
  'systemd_run_executable'
]);
const CGROUP_KEYS = new Set(['version', 'controllers', 'controllers_path']);

const DEFAULT_IO = Object.freeze({ readFile, stat });

export function verifyLinuxEnforcementCapabilityObservation(input, {
  asOf = new Date().toISOString(),
  maxAgeMs = 5_000,
  maxFutureSkewMs = 1_000
} = {}) {
  const value = exactObject(
    input,
    OBSERVATION_KEYS,
    'Linux enforcement capability observation'
  );
  if (value.format !== FORMAT) {
    throw new ValidationError(
      `Linux enforcement capability format must be ${FORMAT}`
    );
  }
  if (value.source !== 'host-local') {
    throw new ValidationError(
      'Linux enforcement capability source must be host-local'
    );
  }
  const observedAt = timestamp(value.observed_at, 'observed_at');
  const reference = timestamp(asOf, 'asOf');
  const maxAge = boundedInteger(maxAgeMs, 'maxAgeMs', 0, 3_600_000);
  const maxFutureSkew = boundedInteger(
    maxFutureSkewMs,
    'maxFutureSkewMs',
    0,
    60_000
  );
  const age = Date.parse(reference) - Date.parse(observedAt);
  if (age > maxAge) {
    throw new ValidationError(
      'Linux enforcement capability observation is stale'
    );
  }
  if (age < -maxFutureSkew) {
    throw new ValidationError(
      'Linux enforcement capability observation is future-dated'
    );
  }

  const systemd = exactObject(
    value.systemd,
    SYSTEMD_KEYS,
    'Linux systemd observation'
  );
  if (systemd.pid1_comm !== 'systemd') {
    throw new ValidationError('PID 1 is not systemd');
  }
  if (systemd.runtime_directory_present !== true) {
    throw new ValidationError('systemd runtime directory is unavailable');
  }
  if (systemd.systemd_run_path !== SYSTEMD_RUN) {
    throw new ValidationError(`systemd-run path must be ${SYSTEMD_RUN}`);
  }
  if (systemd.systemd_run_regular_file !== true) {
    throw new ValidationError(
      'systemd-run is not a verified regular file'
    );
  }
  if (systemd.systemd_run_executable !== true) {
    throw new ValidationError('systemd-run is not executable');
  }

  const cgroup = exactObject(
    value.cgroup,
    CGROUP_KEYS,
    'Linux cgroup observation'
  );
  if (cgroup.version !== 2) {
    throw new ValidationError('unified cgroup v2 is required');
  }
  if (cgroup.controllers_path !== CGROUP_CONTROLLERS) {
    throw new ValidationError(
      `cgroup controller path must be ${CGROUP_CONTROLLERS}`
    );
  }
  if (!Array.isArray(cgroup.controllers) || cgroup.controllers.length > 32) {
    throw new ValidationError(
      'cgroup controllers must be a bounded array'
    );
  }
  const controllers = [...new Set(cgroup.controllers.map(
    (controller, index) => {
      if (
        typeof controller !== 'string'
        || !/^[a-z][a-z0-9_-]{0,31}$/.test(controller)
      ) {
        throw new ValidationError(
          `cgroup controller ${index} is invalid`
        );
      }
      return controller;
    }
  ))].sort();
  for (const required of REQUIRED_CONTROLLERS) {
    if (!controllers.includes(required)) {
      throw new ValidationError(
        `required cgroup controller ${required} is unavailable`
      );
    }
  }
  if (
    typeof value.kernel_release !== 'string'
    || value.kernel_release.length < 1
    || value.kernel_release.length > 256
    || value.kernel_release.includes('\0')
  ) {
    throw new ValidationError('kernel_release is invalid');
  }

  const normalizedObservation = {
    format: FORMAT,
    source: 'host-local',
    observed_at: observedAt,
    systemd: {
      pid1_comm: 'systemd',
      runtime_directory_present: true,
      systemd_run_path: SYSTEMD_RUN,
      systemd_run_regular_file: true,
      systemd_run_executable: true
    },
    cgroup: {
      version: 2,
      controllers,
      controllers_path: CGROUP_CONTROLLERS
    },
    kernel_release: value.kernel_release
  };
  return Object.freeze({
    format: VERIFIED_FORMAT,
    available: true,
    observed_at: observedAt,
    verified_at: reference,
    observation_digest: digestObject(normalizedObservation),
    systemd_run_path: SYSTEMD_RUN,
    cgroup_version: 2,
    controllers: Object.freeze(controllers),
    kernel_release: value.kernel_release,
    property_enforcement_proven: false,
    physical_host_verified: false,
    remote_attestation_verified: false,
    authority_effect: 'none'
  });
}

export async function collectLinuxEnforcementCapability({
  io = DEFAULT_IO,
  clock = () => new Date().toISOString(),
  asOf = undefined,
  maxAgeMs = 5_000,
  maxFutureSkewMs = 1_000
} = {}) {
  if (
    !io
    || typeof io.readFile !== 'function'
    || typeof io.stat !== 'function'
  ) {
    throw new ValidationError(
      'Linux enforcement capability io adapter is invalid'
    );
  }
  if (typeof clock !== 'function') {
    throw new ValidationError(
      'Linux enforcement capability clock must be a function'
    );
  }
  let pid1;
  let controllersText;
  let kernelRelease;
  let runtimeStat;
  let systemdRunStat;
  try {
    [
      pid1,
      controllersText,
      kernelRelease,
      runtimeStat,
      systemdRunStat
    ] = await Promise.all([
      io.readFile('/proc/1/comm', 'utf8'),
      io.readFile(CGROUP_CONTROLLERS, 'utf8'),
      io.readFile('/proc/sys/kernel/osrelease', 'utf8'),
      io.stat('/run/systemd/system'),
      io.stat(SYSTEMD_RUN)
    ]);
  } catch {
    throw new ValidationError(
      'Linux enforcement capability prerequisites are unavailable'
    );
  }
  const observedAt = timestamp(clock(), 'clock result');
  const reference = asOf === undefined ? observedAt : asOf;
  const controllers = String(controllersText)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  const observation = {
    format: FORMAT,
    source: 'host-local',
    observed_at: observedAt,
    systemd: {
      pid1_comm: String(pid1).trim(),
      runtime_directory_present: Boolean(runtimeStat?.isDirectory?.()),
      systemd_run_path: SYSTEMD_RUN,
      systemd_run_regular_file: Boolean(systemdRunStat?.isFile?.()),
      systemd_run_executable: Boolean((systemdRunStat?.mode ?? 0) & 0o111)
    },
    cgroup: {
      version: 2,
      controllers,
      controllers_path: CGROUP_CONTROLLERS
    },
    kernel_release: String(kernelRelease).trim()
  };
  return verifyLinuxEnforcementCapabilityObservation(observation, {
    asOf: reference,
    maxAgeMs,
    maxFutureSkewMs
  });
}

function exactObject(value, keys, label) {
  const object = assertPlainObject(value, label);
  const unknown = Object.keys(object).filter(key => !keys.has(key));
  const missing = [...keys].filter(key => !Object.hasOwn(object, key));
  if (unknown.length) {
    throw new ValidationError(
      `${label} contains unknown fields: ${unknown.sort().join(', ')}`
    );
  }
  if (missing.length) {
    throw new ValidationError(
      `${label} is missing required fields: ${missing.sort().join(', ')}`
    );
  }
  return object;
}

function boundedInteger(value, name, minimum, maximum) {
  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new ValidationError(
      `${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
  return value;
}

function timestamp(value, name) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError(`${name} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}

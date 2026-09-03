import {
  ValidationError,
  assertPlainObject,
  digestObject
} from './canonical.mjs';

const SYSTEMD_RUN = '/usr/bin/systemd-run';
const SHA256 = /^[a-f0-9]{64}$/;
const ROLE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const TOP_LEVEL_KEYS = new Set([
  'decision', 'request', 'lease_seconds', 'pids_max'
]);
const REQUEST_KEYS = new Set(['role', 'resources']);
const RESOURCE_KEYS = new Set([
  'cpu_millis',
  'memory_bytes',
  'storage_bytes',
  'bandwidth_bytes_per_second',
  'transfer_bytes'
]);

export function compileLinuxResourceEnforcement(input) {
  const value = exactObject(
    input,
    TOP_LEVEL_KEYS,
    'Linux resource enforcement input'
  );
  const decision = normalizeGuardianDecision(value.decision);
  const request = normalizeRequest(value.request);
  const leaseSeconds = boundedInteger(
    value.lease_seconds,
    'lease_seconds',
    1,
    300
  );
  const pidsMax = boundedInteger(value.pids_max, 'pids_max', 1, 128);

  if (!decision.allowed) {
    throw new ValidationError(
      'Linux resource enforcement requires an allowed Guardian decision'
    );
  }
  if (decision.guardian_state !== 'NORMAL') {
    throw new ValidationError(
      'Linux resource enforcement requires Guardian state NORMAL'
    );
  }
  if (decision.role !== request.role) {
    throw new ValidationError('Guardian decision role must match request role');
  }
  if (
    request.resources.storage_bytes > 0
    || request.resources.bandwidth_bytes_per_second > 0
    || request.resources.transfer_bytes > 0
  ) {
    throw new ValidationError(
      'Requested storage/network resources are not yet enforceable by the G3 systemd/cgroup-v2 adapter'
    );
  }

  const requestDigest = digestObject(request);
  const guardianBinding = {
    guardian_state: decision.guardian_state,
    policy_revision: decision.policy_revision,
    measurement_digest: decision.measurement_digest,
    role: decision.role,
    request_digest: requestDigest
  };
  const guardianBindingDigest = digestObject(guardianBinding);
  const unitName = `mesh-contribution-${guardianBindingDigest.slice(0, 24)}.service`;
  const cpuQuota = cpuQuotaPercent(request.resources.cpu_millis);
  const properties = [
    'CPUAccounting=yes',
    'MemoryAccounting=yes',
    'IOAccounting=yes',
    'TasksAccounting=yes',
    `CPUQuota=${cpuQuota}`,
    `MemoryMax=${request.resources.memory_bytes}`,
    `TasksMax=${pidsMax}`,
    `RuntimeMaxSec=${leaseSeconds}`
  ];
  const argvPrefix = [
    '--quiet',
    '--collect',
    `--unit=${unitName}`,
    ...properties.map(property => `--property=${property}`),
    '--'
  ];

  return Object.freeze({
    format: 'linux.resource-enforcement.v1',
    backend: 'systemd-cgroup-v2',
    executable: SYSTEMD_RUN,
    unit_name: unitName,
    request_digest: requestDigest,
    guardian_binding_digest: guardianBindingDigest,
    guardian: Object.freeze({
      guardian_state: decision.guardian_state,
      policy_revision: decision.policy_revision,
      measurement_digest: decision.measurement_digest,
      role: decision.role
    }),
    resources: Object.freeze({ ...request.resources }),
    lease_seconds: leaseSeconds,
    pids_max: pidsMax,
    argv_prefix: Object.freeze(argvPrefix),
    network_enforcement: 'none-required',
    storage_enforcement: 'none-required',
    requires_effect_boundary_recheck: true,
    command_caller_supplied: false,
    mesh_authority_granted: false,
    remote_execution_authority_granted: false
  });
}

export async function prepareLinuxResourceEnforcement({
  guardian,
  request,
  remoteConstraints = undefined,
  lease_seconds,
  pids_max
}) {
  if (!guardian || typeof guardian.evaluate !== 'function') {
    throw new ValidationError('guardian must expose evaluate(input)');
  }
  const evaluationInput = { request };
  if (remoteConstraints !== undefined) {
    evaluationInput.remoteConstraints = remoteConstraints;
  }
  const decision = await guardian.evaluate(evaluationInput);
  if (!decision?.allowed) {
    return Object.freeze({
      allowed: false,
      reason: decision?.reason ?? 'guardian_denied',
      guardian_state: decision?.guardian_state ?? 'UNKNOWN'
    });
  }
  return Object.freeze({
    allowed: true,
    enforcement: compileLinuxResourceEnforcement({
      decision,
      request,
      lease_seconds,
      pids_max
    })
  });
}

function normalizeGuardianDecision(input) {
  const value = assertPlainObject(input, 'Guardian decision');
  const allowedKeys = new Set([
    'allowed',
    'reason',
    'role',
    'guardian_state',
    'policy_revision',
    'measurement'
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new ValidationError(
        `Guardian decision contains unknown field: ${key}`
      );
    }
  }
  if (typeof value.allowed !== 'boolean') {
    throw new ValidationError('Guardian decision allowed must be boolean');
  }
  if (
    typeof value.reason !== 'string'
    || value.reason.length < 1
    || value.reason.length > 128
  ) {
    throw new ValidationError('Guardian decision reason is invalid');
  }
  if (typeof value.guardian_state !== 'string') {
    throw new ValidationError('Guardian decision guardian_state is invalid');
  }
  if (!Number.isSafeInteger(value.policy_revision) || value.policy_revision < 1) {
    throw new ValidationError('Guardian decision policy_revision is invalid');
  }
  if (typeof value.role !== 'string' || !ROLE.test(value.role)) {
    throw new ValidationError('Guardian decision role is invalid');
  }
  const measurement = assertPlainObject(
    value.measurement,
    'Guardian decision measurement'
  );
  if (
    typeof measurement.bundle_digest !== 'string'
    || !SHA256.test(measurement.bundle_digest)
  ) {
    throw new ValidationError('Guardian decision measurement digest is invalid');
  }
  return {
    allowed: value.allowed,
    reason: value.reason,
    role: value.role,
    guardian_state: value.guardian_state,
    policy_revision: value.policy_revision,
    measurement_digest: measurement.bundle_digest
  };
}

function normalizeRequest(input) {
  const value = exactObject(input, REQUEST_KEYS, 'contribution request');
  if (typeof value.role !== 'string' || !ROLE.test(value.role)) {
    throw new ValidationError('contribution request role is invalid');
  }
  const resources = exactObject(
    value.resources,
    RESOURCE_KEYS,
    'contribution request resources'
  );
  return {
    role: value.role,
    resources: {
      cpu_millis: boundedInteger(
        resources.cpu_millis,
        'resources.cpu_millis',
        1,
        1_000_000_000
      ),
      memory_bytes: boundedInteger(
        resources.memory_bytes,
        'resources.memory_bytes',
        1,
        Number.MAX_SAFE_INTEGER
      ),
      storage_bytes: boundedInteger(
        resources.storage_bytes,
        'resources.storage_bytes',
        0,
        Number.MAX_SAFE_INTEGER
      ),
      bandwidth_bytes_per_second: boundedInteger(
        resources.bandwidth_bytes_per_second,
        'resources.bandwidth_bytes_per_second',
        0,
        Number.MAX_SAFE_INTEGER
      ),
      transfer_bytes: boundedInteger(
        resources.transfer_bytes,
        'resources.transfer_bytes',
        0,
        Number.MAX_SAFE_INTEGER
      )
    }
  };
}

function cpuQuotaPercent(cpuMillis) {
  const percent = cpuMillis / 10;
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100_000_000) {
    throw new ValidationError('CPU quota is outside the supported range');
  }
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(3))}%`;
}

function exactObject(value, keys, label) {
  const object = assertPlainObject(value, label);
  const actual = Object.keys(object);
  const unknown = actual.filter(key => !keys.has(key));
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
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ValidationError(
      `${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
  return value;
}

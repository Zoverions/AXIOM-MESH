import {
  ValidationError,
  assertPlainObject
} from './canonical.mjs';

export const GUARDIAN_STATES = Object.freeze({
  NORMAL: 'NORMAL',
  DEGRADED: 'DEGRADED',
  QUARANTINED: 'QUARANTINED',
  RECOVERY: 'RECOVERY'
});

const HOST_CLASSES = new Set([
  'desktop', 'laptop', 'mobile', 'tablet', 'server', 'appliance', 'other'
]);
const POWER_CLASSES = new Set(['battery', 'mains', 'hybrid', 'unknown']);
const CONTRIBUTION_ROLES = new Set([
  'relay', 'encrypted_cache', 'verification', 'compute',
  'store_and_forward', 'discovery'
]);
const THERMAL_STATES = new Set(['normal', 'warm', 'hot', 'critical', 'unknown']);
const LOCAL_AUTHORITIES = new Set(['local_owner', 'local_guardian']);
const RESOURCE_FIELDS = [
  'cpu_millis',
  'memory_bytes',
  'storage_bytes',
  'bandwidth_bytes_per_second'
];
const TRANSITIONS = Object.freeze({
  NORMAL: new Set(['DEGRADED', 'QUARANTINED']),
  DEGRADED: new Set(['NORMAL', 'QUARANTINED', 'RECOVERY']),
  QUARANTINED: new Set(['DEGRADED', 'RECOVERY']),
  RECOVERY: new Set(['DEGRADED'])
});

export function normalizeHostProfile(input) {
  const value = assertPlainObject(input, 'host profile');
  assertExactKeys(
    value,
    ['format', 'host_class', 'power_class', 'capabilities'],
    'host profile'
  );
  assertFormat(value.format, 'host.profile.v1', 'host profile format');
  const hostClass = enumValue(value.host_class, 'host_class', HOST_CLASSES);
  const powerClass = enumValue(value.power_class, 'power_class', POWER_CLASSES);
  const capabilities = uniqueEnums(
    value.capabilities ?? [],
    'capabilities',
    CONTRIBUTION_ROLES,
    16
  );
  return {
    format: 'host.profile.v1',
    host_class: hostClass,
    power_class: powerClass,
    capabilities
  };
}

export function normalizeContributionPolicy(input) {
  const value = assertPlainObject(input, 'contribution policy');
  assertExactKeys(
    value,
    ['format', 'enabled', 'allowed_roles', 'only_when', 'maximum'],
    'contribution policy'
  );
  assertFormat(value.format, 'contribution.policy.v1', 'contribution policy format');
  const onlyWhen = assertPlainObject(value.only_when, 'only_when');
  assertExactKeys(
    onlyWhen,
    [
      'external_power',
      'unmetered_network',
      'user_idle',
      'minimum_battery_percent',
      'allowed_thermal_states'
    ],
    'only_when'
  );
  const maximum = assertPlainObject(value.maximum, 'maximum');
  assertExactKeys(
    maximum,
    [
      'cpu_millis',
      'memory_bytes',
      'storage_bytes',
      'bandwidth_bytes_per_second',
      'transfer_bytes_per_day'
    ],
    'maximum'
  );
  return {
    format: 'contribution.policy.v1',
    enabled: booleanValue(value.enabled, 'enabled'),
    allowed_roles: uniqueEnums(
      value.allowed_roles,
      'allowed_roles',
      CONTRIBUTION_ROLES,
      16
    ),
    only_when: {
      external_power: booleanValue(
        onlyWhen.external_power,
        'only_when.external_power'
      ),
      unmetered_network: booleanValue(
        onlyWhen.unmetered_network,
        'only_when.unmetered_network'
      ),
      user_idle: booleanValue(onlyWhen.user_idle, 'only_when.user_idle'),
      minimum_battery_percent: boundedInteger(
        onlyWhen.minimum_battery_percent,
        'only_when.minimum_battery_percent',
        0,
        100
      ),
      allowed_thermal_states: uniqueEnums(
        onlyWhen.allowed_thermal_states,
        'only_when.allowed_thermal_states',
        THERMAL_STATES,
        THERMAL_STATES.size,
        { nonEmpty: true }
      )
    },
    maximum: {
      cpu_millis: boundedInteger(
        maximum.cpu_millis,
        'maximum.cpu_millis',
        0,
        1_000_000_000
      ),
      memory_bytes: boundedInteger(
        maximum.memory_bytes,
        'maximum.memory_bytes',
        0,
        Number.MAX_SAFE_INTEGER
      ),
      storage_bytes: boundedInteger(
        maximum.storage_bytes,
        'maximum.storage_bytes',
        0,
        Number.MAX_SAFE_INTEGER
      ),
      bandwidth_bytes_per_second: boundedInteger(
        maximum.bandwidth_bytes_per_second,
        'maximum.bandwidth_bytes_per_second',
        0,
        Number.MAX_SAFE_INTEGER
      ),
      transfer_bytes_per_day: boundedInteger(
        maximum.transfer_bytes_per_day,
        'maximum.transfer_bytes_per_day',
        0,
        Number.MAX_SAFE_INTEGER
      )
    }
  };
}

export function normalizeSovereigntyReserve(input) {
  const value = assertPlainObject(input, 'resource sovereignty reserve');
  assertExactKeys(
    value,
    [
      'format',
      'battery_floor_percent',
      'free_storage_floor_bytes',
      'foreground_user_priority',
      'cpu_headroom_millis',
      'memory_headroom_bytes',
      'bandwidth_headroom_bytes_per_second',
      'allowed_thermal_states'
    ],
    'resource sovereignty reserve'
  );
  assertFormat(
    value.format,
    'resource.sovereignty-reserve.v1',
    'resource sovereignty reserve format'
  );
  return {
    format: 'resource.sovereignty-reserve.v1',
    battery_floor_percent: boundedInteger(
      value.battery_floor_percent,
      'battery_floor_percent',
      0,
      100
    ),
    free_storage_floor_bytes: boundedInteger(
      value.free_storage_floor_bytes,
      'free_storage_floor_bytes',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    foreground_user_priority: booleanValue(
      value.foreground_user_priority,
      'foreground_user_priority'
    ),
    cpu_headroom_millis: boundedInteger(
      value.cpu_headroom_millis,
      'cpu_headroom_millis',
      0,
      1_000_000_000
    ),
    memory_headroom_bytes: boundedInteger(
      value.memory_headroom_bytes,
      'memory_headroom_bytes',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    bandwidth_headroom_bytes_per_second: boundedInteger(
      value.bandwidth_headroom_bytes_per_second,
      'bandwidth_headroom_bytes_per_second',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    allowed_thermal_states: uniqueEnums(
      value.allowed_thermal_states,
      'allowed_thermal_states',
      THERMAL_STATES,
      THERMAL_STATES.size,
      { nonEmpty: true }
    )
  };
}

export function evaluateContribution({
  policy,
  reserve,
  runtime,
  request,
  guardianState,
  remoteConstraints = undefined
}) {
  const localPolicy = normalizeContributionPolicy(policy);
  const sovereignty = normalizeSovereigntyReserve(reserve);
  const state = guardianStateValue(guardianState);
  const current = normalizeRuntimeState(runtime);
  const requested = normalizeContributionRequest(request);

  if (state !== GUARDIAN_STATES.NORMAL) return denial('guardian_not_normal');
  if (!localPolicy.enabled) return denial('local_contribution_disabled');
  if (
    sovereignty.foreground_user_priority
    && current.foreground_user_active
  ) return denial('foreground_user_priority');
  if (current.battery_percent < sovereignty.battery_floor_percent) {
    return denial('battery_reserve');
  }
  if (
    current.free_storage_bytes - requested.resources.storage_bytes
    < sovereignty.free_storage_floor_bytes
  ) return denial('storage_reserve');
  if (
    current.available_cpu_millis - requested.resources.cpu_millis
    < sovereignty.cpu_headroom_millis
  ) return denial('cpu_reserve');
  if (
    current.available_memory_bytes - requested.resources.memory_bytes
    < sovereignty.memory_headroom_bytes
  ) return denial('memory_reserve');
  if (
    current.available_bandwidth_bytes_per_second
      - requested.resources.bandwidth_bytes_per_second
    < sovereignty.bandwidth_headroom_bytes_per_second
  ) return denial('bandwidth_reserve');
  if (!sovereignty.allowed_thermal_states.includes(current.thermal_state)) {
    return denial('thermal_reserve');
  }

  const conditions = localPolicy.only_when;
  if (conditions.external_power && !current.external_power) {
    return denial('external_power_required');
  }
  if (conditions.unmetered_network && !current.unmetered_network) {
    return denial('unmetered_network_required');
  }
  if (conditions.user_idle && !current.user_idle) {
    return denial('user_idle_required');
  }
  if (current.battery_percent < conditions.minimum_battery_percent) {
    return denial('battery_condition_unsatisfied');
  }
  if (!conditions.allowed_thermal_states.includes(current.thermal_state)) {
    return denial('thermal_state_not_allowed');
  }
  if (!localPolicy.allowed_roles.includes(requested.role)) {
    return denial('role_not_granted');
  }
  if (RESOURCE_FIELDS.some(field => (
    requested.resources[field] > localPolicy.maximum[field]
  ))) return denial('resource_limit_exceeded');
  if (
    current.transfer_bytes_today + requested.resources.transfer_bytes
    > localPolicy.maximum.transfer_bytes_per_day
  ) return denial('daily_transfer_limit_exceeded');

  if (remoteConstraints !== undefined) {
    let remote;
    try {
      remote = normalizeRemoteConstraints(remoteConstraints);
    } catch (error) {
      if (error instanceof ValidationError) {
        return denial('remote_constraint_invalid');
      }
      throw error;
    }
    if (!remoteAllows(remote, requested, current)) {
      return denial('remote_constraint_denied');
    }
  }

  return Object.freeze({
    allowed: true,
    reason: 'allowed',
    role: requested.role
  });
}

export function transitionGuardianState({ current, next, authority }) {
  const from = guardianStateValue(current);
  const to = guardianStateValue(next);
  if (!LOCAL_AUTHORITIES.has(authority)) {
    throw new ValidationError(
      'guardian state transitions require local authority'
    );
  }
  if (from === to) return { state: from, changed: false };
  if (!TRANSITIONS[from].has(to)) {
    throw new ValidationError(
      `guardian transition ${from} -> ${to} is not allowed`
    );
  }
  return { state: to, changed: true };
}

function normalizeContributionRequest(input) {
  const value = assertPlainObject(input, 'contribution request');
  assertExactKeys(value, ['role', 'resources'], 'contribution request');
  const resources = assertPlainObject(
    value.resources,
    'contribution request resources'
  );
  assertExactKeys(
    resources,
    [
      'cpu_millis',
      'memory_bytes',
      'storage_bytes',
      'bandwidth_bytes_per_second',
      'transfer_bytes'
    ],
    'contribution request resources'
  );
  return {
    role: enumValue(value.role, 'role', CONTRIBUTION_ROLES),
    resources: {
      cpu_millis: boundedInteger(
        resources.cpu_millis,
        'resources.cpu_millis',
        0,
        1_000_000_000
      ),
      memory_bytes: boundedInteger(
        resources.memory_bytes,
        'resources.memory_bytes',
        0,
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

function normalizeRuntimeState(input) {
  const value = assertPlainObject(input, 'runtime state');
  assertExactKeys(
    value,
    [
      'external_power',
      'unmetered_network',
      'user_idle',
      'foreground_user_active',
      'battery_percent',
      'free_storage_bytes',
      'thermal_state',
      'transfer_bytes_today',
      'available_cpu_millis',
      'available_memory_bytes',
      'available_bandwidth_bytes_per_second'
    ],
    'runtime state'
  );
  return {
    external_power: booleanValue(
      value.external_power,
      'runtime.external_power'
    ),
    unmetered_network: booleanValue(
      value.unmetered_network,
      'runtime.unmetered_network'
    ),
    user_idle: booleanValue(value.user_idle, 'runtime.user_idle'),
    foreground_user_active: booleanValue(
      value.foreground_user_active,
      'runtime.foreground_user_active'
    ),
    battery_percent: boundedInteger(
      value.battery_percent,
      'runtime.battery_percent',
      0,
      100
    ),
    free_storage_bytes: boundedInteger(
      value.free_storage_bytes,
      'runtime.free_storage_bytes',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    thermal_state: enumValue(
      value.thermal_state,
      'runtime.thermal_state',
      THERMAL_STATES
    ),
    transfer_bytes_today: boundedInteger(
      value.transfer_bytes_today,
      'runtime.transfer_bytes_today',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    available_cpu_millis: boundedInteger(
      value.available_cpu_millis,
      'runtime.available_cpu_millis',
      0,
      1_000_000_000
    ),
    available_memory_bytes: boundedInteger(
      value.available_memory_bytes,
      'runtime.available_memory_bytes',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    available_bandwidth_bytes_per_second: boundedInteger(
      value.available_bandwidth_bytes_per_second,
      'runtime.available_bandwidth_bytes_per_second',
      0,
      Number.MAX_SAFE_INTEGER
    )
  };
}

function normalizeRemoteConstraints(input) {
  const value = assertPlainObject(input, 'remote constraints');
  assertAllowedKeys(
    value,
    ['enabled', 'allowed_roles', 'maximum', 'only_when'],
    'remote constraints'
  );
  const output = {};
  if (Object.hasOwn(value, 'enabled')) {
    output.enabled = booleanValue(
      value.enabled,
      'remote_constraints.enabled'
    );
  }
  if (Object.hasOwn(value, 'allowed_roles')) {
    output.allowed_roles = uniqueEnums(
      value.allowed_roles,
      'remote_constraints.allowed_roles',
      CONTRIBUTION_ROLES,
      16
    );
  }
  if (Object.hasOwn(value, 'maximum')) {
    const maximum = assertPlainObject(
      value.maximum,
      'remote_constraints.maximum'
    );
    assertAllowedKeys(
      maximum,
      [...RESOURCE_FIELDS, 'transfer_bytes_per_day'],
      'remote_constraints.maximum'
    );
    output.maximum = {};
    for (const field of [...RESOURCE_FIELDS, 'transfer_bytes_per_day']) {
      if (Object.hasOwn(maximum, field)) {
        output.maximum[field] = boundedInteger(
          maximum[field],
          `remote_constraints.maximum.${field}`,
          0,
          Number.MAX_SAFE_INTEGER
        );
      }
    }
  }
  if (Object.hasOwn(value, 'only_when')) {
    const onlyWhen = assertPlainObject(
      value.only_when,
      'remote_constraints.only_when'
    );
    assertAllowedKeys(
      onlyWhen,
      [
        'external_power',
        'unmetered_network',
        'user_idle',
        'minimum_battery_percent',
        'allowed_thermal_states'
      ],
      'remote_constraints.only_when'
    );
    output.only_when = {};
    for (const field of ['external_power', 'unmetered_network', 'user_idle']) {
      if (Object.hasOwn(onlyWhen, field)) {
        output.only_when[field] = booleanValue(
          onlyWhen[field],
          `remote_constraints.only_when.${field}`
        );
      }
    }
    if (Object.hasOwn(onlyWhen, 'minimum_battery_percent')) {
      output.only_when.minimum_battery_percent = boundedInteger(
        onlyWhen.minimum_battery_percent,
        'remote_constraints.only_when.minimum_battery_percent',
        0,
        100
      );
    }
    if (Object.hasOwn(onlyWhen, 'allowed_thermal_states')) {
      output.only_when.allowed_thermal_states = uniqueEnums(
        onlyWhen.allowed_thermal_states,
        'remote_constraints.only_when.allowed_thermal_states',
        THERMAL_STATES,
        THERMAL_STATES.size,
        { nonEmpty: true }
      );
    }
  }
  return output;
}

function remoteAllows(remote, request, runtime) {
  if (remote.enabled === false) return false;
  if (
    remote.allowed_roles
    && !remote.allowed_roles.includes(request.role)
  ) return false;
  for (const field of RESOURCE_FIELDS) {
    if (
      remote.maximum?.[field] !== undefined
      && request.resources[field] > remote.maximum[field]
    ) return false;
  }
  if (
    remote.maximum?.transfer_bytes_per_day !== undefined
    && runtime.transfer_bytes_today + request.resources.transfer_bytes
      > remote.maximum.transfer_bytes_per_day
  ) return false;
  const conditions = remote.only_when ?? {};
  if (conditions.external_power && !runtime.external_power) return false;
  if (conditions.unmetered_network && !runtime.unmetered_network) return false;
  if (conditions.user_idle && !runtime.user_idle) return false;
  if (
    conditions.minimum_battery_percent !== undefined
    && runtime.battery_percent < conditions.minimum_battery_percent
  ) return false;
  if (
    conditions.allowed_thermal_states
    && !conditions.allowed_thermal_states.includes(runtime.thermal_state)
  ) return false;
  return true;
}

function guardianStateValue(value) {
  if (!Object.values(GUARDIAN_STATES).includes(value)) {
    throw new ValidationError('guardian state has an invalid value');
  }
  return value;
}

function assertFormat(value, expected, name) {
  if (value !== expected) {
    throw new ValidationError(`${name} must be ${expected}`);
  }
}

function enumValue(value, name, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError(`${name} has an invalid value`);
  }
  return value;
}

function uniqueEnums(value, name, allowed, maxItems, { nonEmpty = false } = {}) {
  if (
    !Array.isArray(value)
    || value.length > maxItems
    || (nonEmpty && value.length === 0)
  ) {
    throw new ValidationError(
      `${name} must be an array with ${nonEmpty ? '1-' : '0-'}${maxItems} items`
    );
  }
  const normalized = value.map(
    (item, index) => enumValue(item, `${name}[${index}]`, allowed)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationError(`${name} must not contain duplicates`);
  }
  return [...normalized].sort();
}

function assertExactKeys(value, expected, name) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    throw new ValidationError(
      `${name} must contain exactly: ${wanted.join(', ')}`
    );
  }
}

function assertAllowedKeys(value, allowed, name) {
  const accepted = new Set(allowed);
  const unknown = Object.keys(value).filter(key => !accepted.has(key));
  if (unknown.length) {
    throw new ValidationError(
      `${name} contains unknown fields: ${unknown.sort().join(', ')}`
    );
  }
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ValidationError(
      `${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
  return value;
}

function booleanValue(value, name) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${name} must be a boolean`);
  }
  return value;
}

function denial(reason) {
  return Object.freeze({ allowed: false, reason });
}

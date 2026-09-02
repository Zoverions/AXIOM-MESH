import { ValidationError, assertPlainObject } from './canonical.mjs';

const LEASE_ID = /^[a-f0-9]{24}$/;
const UNIT_NAME = /^mesh-contribution-([a-f0-9]{24})\.service$/;
const GUARDIAN_STATES = new Set([
  'NORMAL', 'DEGRADED', 'QUARANTINED', 'RECOVERY'
]);
const STOP_REASONS = new Set([
  'local_pause', 'guardian_state_change', 'lease_expired', 'shutdown'
]);

export class HostContributionLeaseController {
  #leases = new Map();

  register(input) {
    const value = assertPlainObject(input, 'contribution lease');
    assertExactKeys(
      value,
      ['lease_id', 'unit_name', 'expires_at', 'stop'],
      'contribution lease'
    );
    const leaseId = boundedLeaseId(value.lease_id);
    const unitName = boundedUnitName(value.unit_name, leaseId);
    const expiresAt = timestamp(value.expires_at, 'expires_at');
    if (typeof value.stop !== 'function') {
      throw new ValidationError(
        'contribution lease stop must be a function'
      );
    }
    if (this.#leases.has(leaseId)) {
      throw new ValidationError(
        `contribution lease ${leaseId} is already active`
      );
    }
    this.#leases.set(leaseId, {
      lease_id: leaseId,
      unit_name: unitName,
      expires_at: expiresAt,
      stop: value.stop,
      status: 'active',
      stop_reason: null,
      stop_guardian_state: null
    });
    return Object.freeze({
      registered: true,
      lease_id: leaseId,
      unit_name: unitName,
      expires_at: expiresAt
    });
  }

  requestStopAll(input) {
    const value = assertPlainObject(input, 'contribution stop event');
    assertExactKeys(
      value,
      ['reason', 'guardian_state'],
      'contribution stop event'
    );
    if (!STOP_REASONS.has(value.reason)) {
      throw new ValidationError('contribution stop reason is invalid');
    }
    if (!GUARDIAN_STATES.has(value.guardian_state)) {
      throw new ValidationError(
        'contribution stop guardian_state is invalid'
      );
    }
    const failures = [];
    let requested = 0;
    for (const lease of this.#leases.values()) {
      if (lease.status === 'stop_requested') continue;
      try {
        lease.stop(Object.freeze({
          lease_id: lease.lease_id,
          unit_name: lease.unit_name,
          reason: value.reason,
          guardian_state: value.guardian_state
        }));
        lease.status = 'stop_requested';
        lease.stop_reason = value.reason;
        lease.stop_guardian_state = value.guardian_state;
        requested += 1;
      } catch (error) {
        lease.status = 'stop_failed';
        lease.stop_reason = value.reason;
        lease.stop_guardian_state = value.guardian_state;
        failures.push({ lease_id: lease.lease_id, error });
      }
    }
    if (failures.length) {
      throw new AggregateError(
        failures.map(item => item.error),
        `failed to request stop for ${failures.length} contribution lease${
          failures.length === 1 ? '' : 's'
        }`
      );
    }
    return Object.freeze({ requested });
  }

  confirmStopped(leaseId) {
    const normalized = boundedLeaseId(leaseId);
    if (!this.#leases.has(normalized)) {
      throw new ValidationError(
        `contribution lease ${normalized} is not active`
      );
    }
    this.#leases.delete(normalized);
    return Object.freeze({ stopped: true, lease_id: normalized });
  }

  activeLeases() {
    return Object.freeze([...this.#leases.values()]
      .map(lease => Object.freeze({
        lease_id: lease.lease_id,
        unit_name: lease.unit_name,
        expires_at: lease.expires_at,
        status: lease.status,
        stop_reason: lease.stop_reason,
        stop_guardian_state: lease.stop_guardian_state
      }))
      .sort((left, right) => left.lease_id.localeCompare(right.lease_id)));
  }
}

function boundedLeaseId(value) {
  if (typeof value !== 'string' || !LEASE_ID.test(value)) {
    throw new ValidationError(
      'contribution lease_id must be 24 lowercase hex characters'
    );
  }
  return value;
}

function boundedUnitName(value, leaseId) {
  if (typeof value !== 'string' || value.length > 128) {
    throw new ValidationError(
      'contribution lease unit_name is invalid'
    );
  }
  const match = UNIT_NAME.exec(value);
  if (!match || match[1] !== leaseId) {
    throw new ValidationError(
      'contribution lease unit_name must bind the lease_id'
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

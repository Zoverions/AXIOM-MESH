import { ValidationError } from './canonical.mjs';
import { evaluateObservedContribution } from './host-metrics.mjs';
import { normalizeHostPolicySet } from './host-policy-store.mjs';
import {
  GUARDIAN_STATES,
  transitionGuardianState
} from './host-sovereignty.mjs';

const LOCAL_AUTHORITIES = new Set(['local_owner', 'local_guardian']);

export class HostGuardian {
  #policyProvider;
  #measurementProvider;
  #clock;
  #maxAgeMs;
  #maxFutureSkewMs;
  #paused = false;
  #state = GUARDIAN_STATES.NORMAL;

  constructor({
    policyProvider,
    measurementProvider,
    clock = () => new Date().toISOString(),
    maxAgeMs = 5_000,
    maxFutureSkewMs = 1_000
  }) {
    if (typeof policyProvider !== 'function') {
      throw new ValidationError('policyProvider must be a function');
    }
    if (typeof measurementProvider !== 'function') {
      throw new ValidationError('measurementProvider must be a function');
    }
    if (typeof clock !== 'function') {
      throw new ValidationError('clock must be a function');
    }
    this.#policyProvider = policyProvider;
    this.#measurementProvider = measurementProvider;
    this.#clock = clock;
    this.#maxAgeMs = maxAgeMs;
    this.#maxFutureSkewMs = maxFutureSkewMs;
  }

  get state() {
    return this.#state;
  }

  get paused() {
    return this.#paused;
  }

  pause(authority) {
    requireLocalAuthority(authority);
    this.#paused = true;
  }

  resume(authority) {
    requireLocalAuthority(authority);
    this.#paused = false;
  }

  transition(next, authority) {
    const result = transitionGuardianState({
      current: this.#state,
      next,
      authority
    });
    this.#state = result.state;
    return result;
  }

  async evaluate(input) {
    const value = validateEvaluationInput(input);
    if (this.#paused) return this.#denial('locally_paused');
    if (this.#state !== GUARDIAN_STATES.NORMAL) {
      return this.#denial('guardian_not_normal');
    }

    let policySet;
    try {
      const supplied = await this.#policyProvider();
      policySet = normalizeHostPolicySet(supplied?.policy_set ?? supplied);
    } catch {
      return this.#denial('policy_unavailable');
    }

    let measurementBundle;
    try {
      measurementBundle = await this.#measurementProvider();
    } catch {
      return this.#denial('measurement_unavailable', policySet.revision);
    }

    try {
      const decision = evaluateObservedContribution({
        bundle: measurementBundle,
        policy: policySet.contribution_policy,
        reserve: policySet.sovereignty_reserve,
        request: value.request,
        guardianState: this.#state,
        remoteConstraints: value.remoteConstraints,
        asOf: this.#clock(),
        maxAgeMs: this.#maxAgeMs,
        maxFutureSkewMs: this.#maxFutureSkewMs
      });
      return Object.freeze({
        ...decision,
        guardian_state: this.#state,
        policy_revision: policySet.revision
      });
    } catch {
      return this.#denial('measurement_unavailable', policySet.revision);
    }
  }

  #denial(reason, policyRevision = undefined) {
    const output = {
      allowed: false,
      reason,
      guardian_state: this.#state
    };
    if (policyRevision !== undefined) {
      output.policy_revision = policyRevision;
    }
    return Object.freeze(output);
  }
}

function validateEvaluationInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('guardian evaluation must be an object');
  }
  const allowed = new Set(['request', 'remoteConstraints']);
  const unknown = Object.keys(input).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(
      `guardian evaluation contains unknown fields: ${unknown.sort().join(', ')}`
    );
  }
  if (!Object.hasOwn(input, 'request')) {
    throw new ValidationError('guardian evaluation requires request');
  }
  return {
    request: input.request,
    remoteConstraints: input.remoteConstraints
  };
}

function requireLocalAuthority(authority) {
  if (!LOCAL_AUTHORITIES.has(authority)) {
    throw new ValidationError('guardian control requires local authority');
  }
}

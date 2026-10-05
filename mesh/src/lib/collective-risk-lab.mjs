import { AxiomError, ValidationError } from './canonical.mjs';
import { normalizeMachinePrincipalDefinition } from './machine-principal.mjs';

const TASK_DOMAIN = /^[a-z][a-z0-9_.:-]{1,159}$/;

export class CollectiveRiskLab {
  constructor({
    maxRequestsPerMinute = 60,
    maxConcurrentRequests = 4,
    maxDomains = 100_000
  } = {}) {
    this.maxRequestsPerMinute = boundedInteger(
      maxRequestsPerMinute,
      'maxRequestsPerMinute',
      1,
      100_000
    );
    this.maxConcurrentRequests = boundedInteger(
      maxConcurrentRequests,
      'maxConcurrentRequests',
      1,
      10_000
    );
    this.maxDomains = boundedInteger(maxDomains, 'maxDomains', 1, 1_000_000);
    this.rate = new Map();
    this.concurrency = new Map();
  }

  admitRequest(principal, { taskDomain, now = Date.now() } = {}) {
    if (!Number.isFinite(now) || now < 0) {
      throw new ValidationError('Collective risk lab now must be a non-negative finite number');
    }
    const identity = collectiveIdentity(principal, taskDomain, new Date(now));
    const key = identityKey(identity);
    if (!this.#takeRate(key, now)) {
      throw new AxiomError(
        'collective_rate_budget_exceeded',
        'Collective sponsor and task-domain request-rate budget is exceeded',
        429,
        {
          sponsor: identity.sponsor,
          task_domain: identity.task_domain,
          max_requests_per_minute: this.maxRequestsPerMinute
        }
      );
    }
    return Object.freeze({
      admitted: true,
      authority_effect: 'none',
      sponsor: identity.sponsor,
      task_domain: identity.task_domain,
      max_requests_per_minute: this.maxRequestsPerMinute
    });
  }

  acquireConcurrency(principal, { taskDomain } = {}) {
    const identity = collectiveIdentity(principal, taskDomain);
    const key = identityKey(identity);
    const active = this.concurrency.get(key) ?? 0;
    if (active >= this.maxConcurrentRequests) {
      throw new AxiomError(
        'collective_concurrency_budget_exceeded',
        'Collective sponsor and task-domain concurrency budget is exceeded',
        429,
        {
          sponsor: identity.sponsor,
          task_domain: identity.task_domain,
          active_requests: active,
          max_concurrent_requests: this.maxConcurrentRequests
        }
      );
    }
    if (!this.concurrency.has(key) && this.concurrency.size >= this.maxDomains) {
      throw new AxiomError(
        'collective_concurrency_state_unavailable',
        'Collective concurrency state is at its configured domain bound',
        503,
        {
          max_domains: this.maxDomains
        }
      );
    }

    this.concurrency.set(key, active + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.concurrency.get(key);
      if (current === undefined || current <= 1) {
        this.concurrency.delete(key);
        return;
      }
      this.concurrency.set(key, current - 1);
    };
  }

  #takeRate(key, now) {
    const capacity = this.maxRequestsPerMinute;
    const previous = this.rate.get(key) ?? {
      tokens: capacity,
      at: now
    };
    const elapsed = Math.max(0, now - previous.at);
    const available = Math.min(
      capacity,
      previous.tokens + (elapsed * capacity / 60_000)
    );
    const next = {
      tokens: available < 1 ? available : available - 1,
      at: now
    };
    this.#touchRate(key, next);
    return available >= 1;
  }

  #touchRate(key, value) {
    if (!this.rate.has(key) && this.rate.size >= this.maxDomains) {
      throw new AxiomError(
        'collective_rate_state_unavailable',
        'Collective rate state is at its configured domain bound',
        503,
        {
          max_domains: this.maxDomains
        }
      );
    }
    this.rate.delete(key);
    this.rate.set(key, value);
  }
}

function collectiveIdentity(principal, taskDomain, now = new Date()) {
  let normalized;
  try {
    normalized = normalizeMachinePrincipalDefinition(principal, { now });
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ValidationError(`Collective risk lab requires a valid machine principal identity: ${error.message}`);
    }
    throw error;
  }
  if (typeof taskDomain !== 'string' || !TASK_DOMAIN.test(taskDomain)) {
    throw new ValidationError('Collective risk lab task domain is invalid');
  }
  return {
    sponsor: normalized.sponsor,
    task_domain: taskDomain
  };
}

function identityKey({ sponsor, task_domain: taskDomain }) {
  return `${sponsor}\u0000${taskDomain}`;
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ValidationError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

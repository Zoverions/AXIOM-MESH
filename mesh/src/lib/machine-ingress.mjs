import { AxiomError, ValidationError } from './canonical.mjs';

export class MachineIngressGuard {
  constructor({ maxPrincipals = 100_000 } = {}) {
    if (!Number.isSafeInteger(maxPrincipals) || maxPrincipals < 1) {
      throw new ValidationError('maxPrincipals must be a positive safe integer');
    }
    this.maxPrincipals = maxPrincipals;
    this.rate = new Map();
    this.concurrency = new Map();
  }

  enforce(principal, { requestBytes = 0, now = Date.now() } = {}) {
    if (principal?.schema !== 'axiom-machine-principal.v1') {
      return { constrained: false };
    }
    if (!Number.isSafeInteger(requestBytes) || requestBytes < 0) {
      throw new ValidationError('requestBytes must be a non-negative safe integer');
    }
    const budgets = this.#budgets(principal);

    if (requestBytes > budgets.max_request_bytes) {
      throw new AxiomError(
        'machine_request_budget_exceeded',
        'Machine principal request-size budget is exceeded',
        413,
        {
          request_bytes: requestBytes,
          max_request_bytes: budgets.max_request_bytes
        }
      );
    }

    if (!this.#takeRate(principal.id, budgets.max_requests_per_minute, now)) {
      throw new AxiomError(
        'machine_rate_budget_exceeded',
        'Machine principal request-rate budget is exceeded',
        429,
        { max_requests_per_minute: budgets.max_requests_per_minute }
      );
    }

    return {
      constrained: true,
      request_bytes: requestBytes,
      max_request_bytes: budgets.max_request_bytes,
      max_requests_per_minute: budgets.max_requests_per_minute
    };
  }

  enforceResponse(principal, { responseBytes = 0 } = {}) {
    if (principal?.schema !== 'axiom-machine-principal.v1') {
      return { constrained: false };
    }
    if (!Number.isSafeInteger(responseBytes) || responseBytes < 0) {
      throw new ValidationError('responseBytes must be a non-negative safe integer');
    }
    const budgets = this.#budgets(principal);
    const maximum = budgets.max_response_bytes;
    if (
      !Number.isSafeInteger(maximum)
      || maximum < 1_024
      || maximum > 20_971_520
    ) {
      throw new AxiomError(
        'machine_authority_invalid',
        'Machine principal response-size budget is invalid',
        403
      );
    }
    if (responseBytes > maximum) {
      throw new AxiomError(
        'machine_response_budget_exceeded',
        'Machine principal response-size budget is exceeded',
        502,
        {
          response_bytes: responseBytes,
          max_response_bytes: maximum
        }
      );
    }
    return {
      constrained: true,
      response_bytes: responseBytes,
      max_response_bytes: maximum
    };
  }

  acquireConcurrency(principal) {
    if (principal?.schema !== 'axiom-machine-principal.v1') {
      return () => {};
    }
    const budgets = this.#budgets(principal);
    const maximum = budgets.max_concurrent_requests;
    if (
      !Number.isSafeInteger(maximum)
      || maximum < 1
      || maximum > 1_000
    ) {
      throw new AxiomError(
        'machine_authority_invalid',
        'Machine principal concurrency budget is invalid',
        403
      );
    }

    const active = this.concurrency.get(principal.id) ?? 0;
    if (active >= maximum) {
      throw new AxiomError(
        'machine_concurrency_budget_exceeded',
        'Machine principal concurrency budget is exceeded',
        429,
        {
          active_requests: active,
          max_concurrent_requests: maximum
        }
      );
    }
    if (!this.concurrency.has(principal.id) && this.concurrency.size >= this.maxPrincipals) {
      throw new AxiomError(
        'machine_concurrency_state_unavailable',
        'Machine concurrency admission state is at its configured principal bound',
        503
      );
    }

    this.concurrency.set(principal.id, active + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.concurrency.get(principal.id);
      if (current === undefined || current <= 1) {
        this.concurrency.delete(principal.id);
        return;
      }
      this.concurrency.set(principal.id, current - 1);
    };
  }

  #budgets(principal) {
    const budgets = principal.constraints?.budgets;
    if (!budgets || typeof budgets !== 'object') {
      throw new AxiomError(
        'machine_authority_invalid',
        'Machine principal budgets are unavailable',
        403
      );
    }
    return budgets;
  }

  #takeRate(principalId, maxRequestsPerMinute, now) {
    if (
      !Number.isSafeInteger(maxRequestsPerMinute)
      || maxRequestsPerMinute < 1
      || maxRequestsPerMinute > 10_000
    ) {
      throw new AxiomError(
        'machine_authority_invalid',
        'Machine principal request-rate budget is invalid',
        403
      );
    }
    const previous = this.rate.get(principalId) ?? {
      tokens: maxRequestsPerMinute,
      at: now,
      capacity: maxRequestsPerMinute
    };
    const capacity = maxRequestsPerMinute;
    const elapsed = Math.max(0, now - previous.at);
    const priorTokens = previous.capacity === capacity
      ? previous.tokens
      : Math.min(previous.tokens, capacity);
    const available = Math.min(
      capacity,
      priorTokens + (elapsed * capacity / 60_000)
    );
    if (available < 1) {
      this.#touchRate(principalId, {
        tokens: available,
        at: now,
        capacity
      });
      return false;
    }
    this.#touchRate(principalId, {
      tokens: available - 1,
      at: now,
      capacity
    });
    return true;
  }

  #touchRate(key, value) {
    this.rate.delete(key);
    this.rate.set(key, value);
    while (this.rate.size > this.maxPrincipals) {
      this.rate.delete(this.rate.keys().next().value);
    }
  }
}

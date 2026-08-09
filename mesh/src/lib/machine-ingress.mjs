import { AxiomError, ValidationError } from './canonical.mjs';

export class MachineIngressGuard {
  constructor({ maxPrincipals = 100_000 } = {}) {
    if (!Number.isSafeInteger(maxPrincipals) || maxPrincipals < 1) {
      throw new ValidationError('maxPrincipals must be a positive safe integer');
    }
    this.maxPrincipals = maxPrincipals;
    this.rate = new Map();
  }

  enforce(principal, { requestBytes = 0, now = Date.now() } = {}) {
    if (principal?.schema !== 'axiom-machine-principal.v1') {
      return { constrained: false };
    }
    if (!Number.isSafeInteger(requestBytes) || requestBytes < 0) {
      throw new ValidationError('requestBytes must be a non-negative safe integer');
    }
    const budgets = principal.constraints?.budgets;
    if (!budgets || typeof budgets !== 'object') {
      throw new AxiomError(
        'machine_authority_invalid',
        'Machine principal budgets are unavailable',
        403
      );
    }

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
      this.#touch(principalId, {
        tokens: available,
        at: now,
        capacity
      });
      return false;
    }
    this.#touch(principalId, {
      tokens: available - 1,
      at: now,
      capacity
    });
    return true;
  }

  #touch(key, value) {
    this.rate.delete(key);
    this.rate.set(key, value);
    while (this.rate.size > this.maxPrincipals) {
      this.rate.delete(this.rate.keys().next().value);
    }
  }
}

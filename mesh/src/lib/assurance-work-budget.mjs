import { AxiomError, ValidationError } from './canonical.mjs';

export class AssuranceWorkBudget {
  constructor({
    maxChecks = 8,
    maxComputeUnits = 100_000,
    maxExternalCostUnits = 100_000,
    maxElapsedMs = 120_000
  } = {}) {
    this.limits = Object.freeze({
      max_checks: bounded(maxChecks, 'maxChecks', 1, 256),
      max_compute_units: bounded(maxComputeUnits, 'maxComputeUnits', 1, 1_000_000_000),
      max_external_cost_units: bounded(
        maxExternalCostUnits,
        'maxExternalCostUnits',
        0,
        1_000_000_000
      ),
      max_elapsed_ms: bounded(maxElapsedMs, 'maxElapsedMs', 1, 86_400_000)
    });
    this.used = {
      checks: 0,
      compute_units: 0,
      external_cost_units: 0,
      elapsed_ms: 0
    };
  }

  consume({
    checks = 0,
    computeUnits = 0,
    externalCostUnits = 0,
    elapsedMs = 0
  } = {}) {
    const delta = {
      checks: bounded(checks, 'checks', 0, this.limits.max_checks),
      compute_units: bounded(
        computeUnits,
        'computeUnits',
        0,
        this.limits.max_compute_units
      ),
      external_cost_units: bounded(
        externalCostUnits,
        'externalCostUnits',
        0,
        this.limits.max_external_cost_units
      ),
      elapsed_ms: bounded(elapsedMs, 'elapsedMs', 0, this.limits.max_elapsed_ms)
    };

    const next = {
      checks: this.used.checks + delta.checks,
      compute_units: this.used.compute_units + delta.compute_units,
      external_cost_units: this.used.external_cost_units + delta.external_cost_units,
      elapsed_ms: this.used.elapsed_ms + delta.elapsed_ms
    };

    const violations = [];
    if (next.checks > this.limits.max_checks) violations.push('checks');
    if (next.compute_units > this.limits.max_compute_units) violations.push('compute_units');
    if (next.external_cost_units > this.limits.max_external_cost_units) {
      violations.push('external_cost_units');
    }
    if (next.elapsed_ms > this.limits.max_elapsed_ms) violations.push('elapsed_ms');

    if (violations.length) {
      throw new AxiomError(
        'assurance_work_budget_exceeded',
        'Assurance work exceeds its bounded resource envelope',
        429,
        {
          violations,
          limits: this.limits,
          used: Object.freeze({ ...this.used }),
          requested: Object.freeze(delta)
        }
      );
    }

    this.used = next;
    return Object.freeze({
      accepted: true,
      limits: this.limits,
      used: Object.freeze({ ...this.used }),
      authority_effect: 'none'
    });
  }

  snapshot() {
    return Object.freeze({
      limits: this.limits,
      used: Object.freeze({ ...this.used }),
      authority_effect: 'none'
    });
  }
}

function bounded(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ValidationError(
      `${label} must be an integer between ${minimum} and ${maximum}`
    );
  }
  return value;
}

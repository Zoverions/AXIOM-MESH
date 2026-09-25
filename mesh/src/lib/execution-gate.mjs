import { AxiomError } from './canonical.mjs';

/**
 * A bounded execution queue (scalability audit S-15).
 *
 * At most `maxConcurrent` tasks run at once, and at most `maxQueued` wait
 * for a slot, each for at most `queueTimeoutMs`. Beyond that a task is
 * refused at once with 503 `code` and a retry hint, so saturation produces
 * an explicit, bounded answer instead of requests piling up until they time
 * out. Waiting is first come, first served.
 *
 * A refused or timed-out task never started: the caller must place the gate
 * before anything durable happens, so every task that starts runs to its
 * own terminal state.
 */
export class ExecutionGate {
  constructor({
    maxConcurrent = 32,
    maxQueued = 64,
    queueTimeoutMs = 2_000,
    retryAfterSeconds = 1,
    code = 'overloaded',
    message = 'The service is at capacity; retry later',
    details = {}
  } = {}) {
    for (const [name, value, minimum] of [
      ['maxConcurrent', maxConcurrent, 1],
      ['maxQueued', maxQueued, 0],
      ['queueTimeoutMs', queueTimeoutMs, 1],
      ['retryAfterSeconds', retryAfterSeconds, 1]
    ]) {
      if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(`Execution gate ${name} is invalid`);
    }
    Object.assign(this, { maxConcurrent, maxQueued, queueTimeoutMs, retryAfterSeconds, code, message, details });
    this.active = 0;
    this.waiting = [];
    this.counters = { started_total: 0, queued_total: 0, rejected_full_total: 0, rejected_timeout_total: 0, high_water: 0 };
  }

  /** Runs `task` when a slot is free; resolves or rejects with its result. */
  async run(task) {
    if (this.active >= this.maxConcurrent) await this.wait();
    this.active += 1;
    this.counters.started_total += 1;
    this.counters.high_water = Math.max(this.counters.high_water, this.active);
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.next();
    }
  }

  wait() {
    if (this.waiting.length >= this.maxQueued) {
      this.counters.rejected_full_total += 1;
      return Promise.reject(this.overloaded('queue_full'));
    }
    this.counters.queued_total += 1;
    return new Promise((resolve, reject) => {
      const entry = { resolve, timer: null };
      entry.timer = setTimeout(() => {
        const index = this.waiting.indexOf(entry);
        if (index !== -1) this.waiting.splice(index, 1);
        this.counters.rejected_timeout_total += 1;
        reject(this.overloaded('queue_timeout'));
      }, this.queueTimeoutMs);
      this.waiting.push(entry);
    });
  }

  // Hands a freed slot to the longest-waiting task.
  next() {
    if (this.active >= this.maxConcurrent) return;
    const entry = this.waiting.shift();
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.resolve();
  }

  overloaded(reason) {
    return new AxiomError(this.code, this.message, 503, {
      ...this.details,
      reason,
      retry_after_seconds: this.retryAfterSeconds
    });
  }

  snapshot() {
    return {
      active: this.active,
      queued: this.waiting.length,
      max_concurrent: this.maxConcurrent,
      max_queued: this.maxQueued,
      ...this.counters
    };
  }
}

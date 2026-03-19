export interface CircuitBreakerConfig {
  failureThreshold: number;      // Open after N failures
  recoveryTimeout: number;       // Try half-open after Ms
  halfOpenMaxCalls: number;      // Test with N calls
  successThreshold: number;       // Close after N successes
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitOpenError extends Error {
  constructor(public service: string) {
    super(`Circuit is OPEN for service: ${service}`);
  }
}

export class ServiceMeshCircuitBreaker {
  private states: Map<string, CircuitState> = new Map();
  private halfOpenCalls: Map<string, number> = new Map();
  private failures: Map<string, number> = new Map();
  private successes: Map<string, number> = new Map();

  constructor(private config: CircuitBreakerConfig) {}

  getState(service: string): CircuitState {
    return this.states.get(service) || 'CLOSED';
  }

  async call<T>(service: string, operation: () => Promise<T>): Promise<T> {
    const state = this.getState(service);

    if (state === 'OPEN') {
      throw new CircuitOpenError(service);
    }

    if (state === 'HALF_OPEN') {
       const currentCalls = this.halfOpenCalls.get(service) || 0;
       if (currentCalls >= this.config.halfOpenMaxCalls) {
         throw new CircuitOpenError(service);
       }
       this.halfOpenCalls.set(service, currentCalls + 1);
    }

    try {
      const result = await operation();
      this.recordSuccess(service);
      return result;
    } catch (error) {
      this.recordFailure(service);
      throw error;
    }
  }

  private recordSuccess(service: string) {
     if (this.getState(service) === 'HALF_OPEN') {
        const s = (this.successes.get(service) || 0) + 1;
        this.successes.set(service, s);
        if (s >= this.config.successThreshold) {
           this.states.set(service, 'CLOSED');
           this.failures.set(service, 0);
           this.successes.set(service, 0);
           this.halfOpenCalls.set(service, 0);
        }
     } else {
        this.failures.set(service, 0);
     }
  }

  private recordFailure(service: string) {
     const f = (this.failures.get(service) || 0) + 1;
     this.failures.set(service, f);

     if (this.getState(service) === 'HALF_OPEN') {
        this.states.set(service, 'OPEN');
        this.scheduleHalfOpen(service);
     } else if (f >= this.config.failureThreshold) {
        this.states.set(service, 'OPEN');
        this.scheduleHalfOpen(service);
     }
  }

  private scheduleHalfOpen(service: string) {
    setTimeout(() => {
       if (this.states.get(service) === 'OPEN') {
          this.states.set(service, 'HALF_OPEN');
          this.halfOpenCalls.set(service, 0);
          this.successes.set(service, 0);
       }
    }, this.config.recoveryTimeout);
  }
}

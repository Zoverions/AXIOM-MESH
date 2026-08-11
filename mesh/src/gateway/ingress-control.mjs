import { AxiomError, ValidationError, sha256 } from '../lib/canonical.mjs';
import { TokenBucketLimiter } from '../lib/http.mjs';

const LOCAL_INVALID_AUTH_KEY = 'local-ingress-invalid-auth';

export class GatewayIngressControl {
  constructor({
    localIngress = false,
    capacity = 60,
    refillPerSecond = 1,
    probeCapacity = 10,
    probeRefillPerSecond = 1
  } = {}) {
    this.localIngress = Boolean(localIngress);
    this.addressLimiter = new TokenBucketLimiter({
      capacity,
      refillPerSecond,
      maxKeys: 10_000
    });
    this.principalLimiter = new TokenBucketLimiter({
      capacity,
      refillPerSecond,
      maxKeys: 100_000
    });
    this.invalidAuthLimiter = new TokenBucketLimiter({
      capacity,
      refillPerSecond,
      maxKeys: 1
    });
    this.probeLimiter = new TokenBucketLimiter({
      capacity: probeCapacity,
      refillPerSecond: probeRefillPerSecond,
      maxKeys: 10_000
    });
  }

  admitProbe(req) {
    if (this.localIngress) return;
    const key = sourceAddressKey(req);
    if (!this.probeLimiter.take(key)) {
      throw new AxiomError(
        'rate_limited',
        'Readiness probe rate limit exceeded',
        429
      );
    }
  }

  async authenticate(args, bearerAuth, enforceBoundary = () => {}) {
    if (typeof bearerAuth !== 'function') {
      throw new ValidationError('Gateway ingress control requires bearer authentication');
    }
    let principal;
    if (this.localIngress) {
      try {
        principal = await bearerAuth(args);
      } catch (error) {
        if (!this.invalidAuthLimiter.take(LOCAL_INVALID_AUTH_KEY)) {
          throw new AxiomError(
            'rate_limited',
            'Invalid-authentication request rate limit exceeded',
            429
          );
        }
        throw error;
      }
    } else {
      const key = sourceAddressKey(args.req);
      if (!this.addressLimiter.take(key)) {
        throw new AxiomError('rate_limited', 'IP request rate limit exceeded', 429);
      }
      principal = await bearerAuth(args);
    }

    enforceBoundary(args.req, principal);
    if (!this.principalLimiter.take(principal.id)) {
      throw new AxiomError('rate_limited', 'Principal request rate limit exceeded', 429);
    }
    return principal;
  }
}

export function createSingleFlightCache({
  load,
  cacheMs = 250,
  now = () => Date.now()
}) {
  if (typeof load !== 'function') {
    throw new ValidationError('Single-flight cache requires a load function');
  }
  if (!Number.isSafeInteger(cacheMs) || cacheMs < 0 || cacheMs > 60_000) {
    throw new ValidationError('Single-flight cache duration is invalid');
  }
  if (typeof now !== 'function') {
    throw new ValidationError('Single-flight cache requires a clock function');
  }

  let cached;
  let cachedAt = 0;
  let hasCached = false;
  let inFlight = null;

  return async input => {
    const observedAt = now();
    if (hasCached && observedAt - cachedAt <= cacheMs) return cached;
    if (inFlight) return inFlight;

    inFlight = Promise.resolve()
      .then(() => load(input))
      .then(value => {
        cached = value;
        cachedAt = now();
        hasCached = true;
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}

function sourceAddressKey(req) {
  return sha256(req?.socket?.remoteAddress ?? 'unknown');
}

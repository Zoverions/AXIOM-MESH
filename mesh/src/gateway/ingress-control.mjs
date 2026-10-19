import { isIP } from 'node:net';
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

// The address bucket is keyed by the connection's peer address only. Headers
// such as X-Forwarded-For are never consulted, so a client cannot choose its
// bucket; behind a proxy every client shares the proxy's bucket until a
// trusted-proxy contract exists (scalability audit S-08). An IPv6 host
// controls at least a /64, so IPv6 is keyed by that prefix; otherwise one
// host could hold a bucket per address and fill the table. IPv4-mapped IPv6
// is keyed as the IPv4 address it carries.
export function sourceAddressKey(req) {
  return sha256(clientAddressPrefix(req?.socket?.remoteAddress));
}

export function clientAddressPrefix(address) {
  if (typeof address !== 'string') return 'unknown';
  if (isIP(address) === 4) return address;
  if (isIP(address) !== 6) return 'unknown';
  const hextets = expandIpv6(address.split('%')[0]);
  if (!hextets) return 'unknown';
  if (hextets.slice(0, 5).every(part => part === '0') && hextets[5] === 'ffff') {
    const high = Number.parseInt(hextets[6], 16);
    const low = Number.parseInt(hextets[7], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  return `${hextets.slice(0, 4).join(':')}::/64`;
}

function expandIpv6(address) {
  let text = address.toLowerCase();
  // An embedded IPv4 tail occupies the last two hextets.
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    const octets = tail[1].split('.').map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, -tail[1].length)}${high}:${low}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const hextets = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  return hextets.map(part => Number.parseInt(part, 16).toString(16));
}

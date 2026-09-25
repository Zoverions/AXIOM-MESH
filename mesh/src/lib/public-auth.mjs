import { sha256, AxiomError } from './canonical.mjs';
import { MachineIngressGuard } from './machine-ingress.mjs';

export function createBearerAuthenticator(principals, {
  machineIngress = new MachineIngressGuard()
} = {}) {
  const resolvePrincipal = req => {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new AxiomError('authentication_required', 'A bearer token is required', 401);
    }
    // The registry is keyed by each token's SHA-256 digest, so one lookup
    // resolves a token whatever the number of principals (scalability audit
    // S-07). Hits and misses take the same path: one hash, one lookup. The
    // lookup compares the digest of the presented token, never the token,
    // and an attacker cannot steer a digest toward a stored one, so its
    // timing reveals nothing about any registered token.
    const principal = principals.get(sha256(header.slice('Bearer '.length)));
    if (principal === undefined) {
      throw new AxiomError('invalid_token', 'Bearer token is invalid', 401);
    }
    return principal;
  };

  const authenticate = async function authenticate({ req, body = Buffer.alloc(0) }) {
    const authenticated = structuredClone(resolvePrincipal(req));
    machineIngress.enforce(authenticated, {
      requestBytes: Buffer.isBuffer(body) ? body.length : Buffer.byteLength(String(body ?? ''))
    });
    return authenticated;
  };

  authenticate.resolveBodyLimit = ({ req, maxBodyBytes }) => {
    let principal;
    try {
      principal = resolvePrincipal(req);
    } catch (error) {
      if (error?.code === 'authentication_required' || error?.code === 'invalid_token') {
        return { maxBytes: maxBodyBytes };
      }
      throw error;
    }
    if (principal?.schema !== 'axiom-machine-principal.v1') {
      return { maxBytes: maxBodyBytes };
    }
    const maximum = principal.constraints?.budgets?.max_request_bytes;
    if (!Number.isSafeInteger(maximum) || maximum < 1_024 || maximum > 10_485_760) {
      throw new AxiomError(
        'machine_authority_invalid',
        'Machine principal request-size budget is invalid',
        403
      );
    }
    return {
      maxBytes: Math.min(maxBodyBytes, maximum),
      limitError: {
        code: 'machine_request_budget_exceeded',
        message: 'Machine principal request-size budget is exceeded',
        status: 413,
        details: { max_request_bytes: maximum }
      }
    };
  };

  authenticate.admitRequest = ({ principal }) => (
    machineIngress.acquireConcurrency(principal)
  );
  // Gateway wraps the authoritative authenticator for ingress rate controls,
  // but passes this admission hook through unchanged. Attaching the pure limit
  // resolver here lets the shared HTTP layer lower the allocation ceiling
  // before body buffering without treating preflight resolution as authority.
  authenticate.admitRequest.resolveBodyLimit = authenticate.resolveBodyLimit;
  authenticate.inspectResponse = ({ principal, responseBytes }) => (
    machineIngress.enforceResponse(principal, { responseBytes })
  );
  authenticate.inspectResponse.requiresPreflight = ({ principal }) => (
    principal?.schema === 'axiom-machine-principal.v1'
  );
  return authenticate;
}

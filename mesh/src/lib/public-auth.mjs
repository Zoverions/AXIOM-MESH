import { sha256, AxiomError } from './canonical.mjs';
import { safeTextEqual } from './identity.mjs';
import { MachineIngressGuard } from './machine-ingress.mjs';

export function createBearerAuthenticator(principals, {
  machineIngress = new MachineIngressGuard()
} = {}) {
  return async function authenticate({ req, body = Buffer.alloc(0) }) {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new AxiomError('authentication_required', 'A bearer token is required', 401);
    }
    const token = header.slice('Bearer '.length);
    const digest = sha256(token);
    let principal;
    for (const [knownDigest, candidate] of principals.entries()) {
      if (safeTextEqual(knownDigest, digest)) {
        principal = candidate;
        break;
      }
    }
    if (!principal) throw new AxiomError('invalid_token', 'Bearer token is invalid', 401);
    const authenticated = structuredClone(principal);
    machineIngress.enforce(authenticated, {
      requestBytes: Buffer.isBuffer(body) ? body.length : Buffer.byteLength(String(body ?? ''))
    });
    return authenticated;
  };
}

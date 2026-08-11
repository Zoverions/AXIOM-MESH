import { AxiomError, ValidationError } from '../lib/canonical.mjs';
import { normalizeContextProjectionRequest } from '../lib/context-projection-request.mjs';
import { compileAuthorizedGridContextView } from './context.mjs';

export function projectAuthenticatedContext(store, rawRequest, {
  callerService
} = {}) {
  if (callerService !== 'gateway') {
    throw new AxiomError(
      'forbidden',
      'Only the authenticated Gateway may request a public context projection',
      403
    );
  }
  if (!store) throw new ValidationError('Grid context store is required');
  const request = normalizeContextProjectionRequest(rawRequest);
  const view = compileAuthorizedGridContextView(store, {
    principal: request.principal,
    owner: request.owner,
    purpose: request.purpose,
    asOf: request.as_of,
    maxClaims: request.max_claims
  });
  return {
    schema: 'axiom-context-projection.v1',
    ...view,
    request: {
      schema: request.schema,
      owner: request.owner,
      purpose: request.purpose,
      as_of: request.as_of,
      max_claims: request.max_claims
    }
  };
}

import { AxiomError, ValidationError, assertString } from '../lib/canonical.mjs';
import { parseContextProjectionMemoryQuery } from '../lib/context-projection-target.mjs';
import { buildContextProjectionReceipt } from '../lib/context-task-binding.mjs';
import { compileGridContextViewFromAuthority } from './context.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function readMemoryOrContext(store, {
  owner,
  url,
  callerService,
  signer
}) {
  if (!store || typeof store.listMemory !== 'function') {
    throw new ValidationError('Grid memory store is invalid');
  }
  const normalizedOwner = assertString(owner, 'owner', {
    max: 160,
    pattern: PRINCIPAL_ID
  });
  if (!(url instanceof URL)) throw new ValidationError('Grid memory URL is invalid');

  if (url.searchParams.get('projection') !== 'context') {
    const requester = assertString(url.searchParams.get('requester'), 'requester', {
      max: 160,
      pattern: PRINCIPAL_ID
    });
    const allowed = new Set(['requester']);
    for (const key of url.searchParams.keys()) {
      if (!allowed.has(key)) {
        throw new ValidationError(`Unsupported memory query parameter: ${key}`);
      }
    }
    return store.listMemory(requester, normalizedOwner);
  }

  if (callerService !== 'gateway') {
    throw new AxiomError(
      'forbidden',
      'Only the authenticated Gateway may request context projection',
      403
    );
  }
  const request = parseContextProjectionMemoryQuery(url, {
    owner: normalizedOwner
  });
  const view = compileGridContextViewFromAuthority(store, {
    authority: request.authority,
    owner: request.owner,
    asOf: request.as_of,
    maxClaims: request.max_claims
  });
  const projection = {
    ...view,
    schema: 'axiom-context-projection.v1',
    request: {
      owner: request.owner,
      purpose: request.authority.purpose,
      as_of: request.as_of,
      max_claims: request.max_claims,
      authority_digest: request.authority.authority_digest
    }
  };
  return {
    ...projection,
    projection_receipt: buildContextProjectionReceipt(projection, signer)
  };
}

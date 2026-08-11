import { ValidationError, assertString } from './canonical.mjs';
import {
  CONTEXT_MEMORY_KIND,
  contextClaimMemoryPutPayload
} from './sovereign-context.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const MEMORY_ID = /^memory_[a-f0-9]{64}$/;

export function compileContextClaimMemoryIntent(rawClaim, { principalId } = {}) {
  const authenticatedPrincipal = assertString(principalId, 'principalId', {
    max: 160,
    pattern: PRINCIPAL_ID
  });
  const payload = contextClaimMemoryPutPayload(rawClaim);
  if (payload.owner !== authenticatedPrincipal) {
    throw new ValidationError('Context claim owner must match the authenticated principal');
  }
  return {
    action: 'memory.put',
    input: {
      kind: CONTEXT_MEMORY_KIND,
      content: payload.content,
      metadata: payload.metadata
    },
    expected: {
      object_id: payload.object_id,
      content_digest: payload.content_digest,
      owner: payload.owner,
      authority_effect: 'none'
    }
  };
}

export function compileContextClaimTombstoneIntent(objectId, { principalId, reason } = {}) {
  assertString(principalId, 'principalId', {
    max: 160,
    pattern: PRINCIPAL_ID
  });
  const id = assertString(objectId, 'objectId', {
    max: 71,
    pattern: MEMORY_ID
  });
  const normalizedReason = assertString(reason, 'reason', { max: 1000 });
  return {
    action: 'memory.tombstone',
    input: {
      object_id: id,
      reason: normalizedReason
    }
  };
}

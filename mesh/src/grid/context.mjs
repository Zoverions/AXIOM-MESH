import {
  AxiomError,
  ValidationError,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import {
  deriveContextProjectionAuthority,
  finiteContextScopesForClaims,
  normalizeContextProjectionAuthority
} from '../lib/context-authority.mjs';
import {
  CONTEXT_MEMORY_KIND,
  compileContextView,
  contextClaimMemoryPutPayload
} from '../lib/sovereign-context.mjs';

export function compileGridContextView(store, {
  requester,
  owner = requester,
  purpose,
  authorizedScopes,
  asOf = new Date().toISOString(),
  maxClaims = 64
}) {
  const state = verifiedGridContextState(store, requester, owner);
  return buildGridContextView(state, {
    requester,
    owner,
    purpose,
    authorizedScopes,
    asOf,
    maxClaims
  });
}

export function compileAuthorizedGridContextView(store, {
  principal,
  owner = principal?.id,
  purpose,
  asOf = new Date().toISOString(),
  maxClaims = 64
}) {
  const authority = deriveContextProjectionAuthority(principal, { purpose });
  return compileGridContextViewFromAuthority(store, {
    authority,
    owner,
    asOf,
    maxClaims
  });
}

export function compileGridContextViewFromAuthority(store, {
  authority: rawAuthority,
  owner,
  asOf = new Date().toISOString(),
  maxClaims = 64
}) {
  const authority = normalizeContextProjectionAuthority(rawAuthority);
  const state = verifiedGridContextState(store, authority.principal_id, owner);
  const finiteScopes = finiteContextScopesForClaims(authority, state.claims);
  const compileScopes = finiteScopes.length ? finiteScopes : ['context:none'];
  const view = buildGridContextView(state, {
    requester: authority.principal_id,
    owner,
    purpose: authority.purpose,
    authorizedScopes: compileScopes,
    asOf,
    maxClaims
  });
  const authorization = {
    ...authority,
    projected_context_scopes: finiteScopes
  };
  return {
    ...view,
    authorization,
    projection_digest: digestObject({
      view_digest: view.view_digest,
      authorization
    })
  };
}

function verifiedGridContextState(store, requester, owner) {
  requireGridContextInterface(store);
  const chain = store.verifyFullChain();
  if (!chain.valid) {
    throw new AxiomError(
      'integrity_verification_failed',
      `Grid evidence chain is invalid: ${chain.reason ?? 'unknown reason'}`,
      503
    );
  }

  const graph = store.listMemory(requester, owner);
  const claims = graph.objects
    .filter(object => object.kind === CONTEXT_MEMORY_KIND)
    .map(object => verifiedContextClaimFromMemoryObject(store, object));
  return { claims, status: store.getStatus() };
}

function buildGridContextView(state, {
  requester,
  owner,
  purpose,
  authorizedScopes,
  asOf,
  maxClaims
}) {
  const view = compileContextView({
    claims: state.claims,
    principal: requester,
    purpose,
    scopes: authorizedScopes,
    asOf,
    maxClaims
  });

  return {
    ...view,
    evidence: {
      schema: 'axiom-context-grid-evidence.v1',
      grid_chain: {
        valid: true,
        verification_mode: 'full',
        last_seq: state.status.last_seq,
        last_hash: state.status.last_hash
      },
      memory_owner: owner,
      visible_context_objects: state.claims.length
    }
  };
}

function verifiedContextClaimFromMemoryObject(store, object) {
  if (!object?.payload_json || typeof object.payload_json !== 'object' || Array.isArray(object.payload_json)) {
    throw new ValidationError('Context memory object payload is invalid');
  }
  const expected = contextClaimMemoryPutPayload(object.payload_json.content);
  if (
    object.object_id !== expected.object_id
    || object.owner !== expected.owner
    || object.kind !== expected.kind
    || object.content_digest !== expected.content_digest
    || canonicalJson(object.payload_json.metadata) !== canonicalJson(expected.metadata)
  ) {
    throw new ValidationError('Context memory object does not match its normalized content address');
  }

  const eventRows = store.db.prepare(`
    SELECT * FROM events
    WHERE kind = 'memory.put' AND subject = ?
    ORDER BY seq ASC
  `).all(object.object_id);
  if (eventRows.length !== 1) {
    throw new ValidationError('Context memory object must have exactly one memory.put evidence event');
  }
  const event = store.decodeEventRow(eventRows[0]);
  if (
    event.actor !== object.owner
    || event.subject !== object.object_id
    || canonicalJson(event.payload) !== canonicalJson(expected)
  ) {
    throw new ValidationError('Context memory object is not bound to owner-authenticated Grid evidence');
  }
  return expected.content;
}

function requireGridContextInterface(store) {
  if (
    !store
    || typeof store.verifyFullChain !== 'function'
    || typeof store.listMemory !== 'function'
    || typeof store.getStatus !== 'function'
    || typeof store.decodeEventRow !== 'function'
    || !store.db
    || typeof store.db.prepare !== 'function'
  ) {
    throw new ValidationError('Grid context compilation requires a compatible GridStore');
  }
}

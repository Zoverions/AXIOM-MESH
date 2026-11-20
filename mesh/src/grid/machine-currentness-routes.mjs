import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';
import { parseJsonBody } from '../lib/http.mjs';
import {
  COLLECTION_PAGE_MAX,
  collectionPage,
  decodeCollectionCursor
} from '../lib/collection-page.mjs';
import {
  normalizeMachineLifecycleTransition,
  normalizeMachineMutationAuthorization
} from '../lib/machine-principal-currentness.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const MACHINE_CURRENTNESS_COLLECTION = 'machine_currentness';
const REQUEST_FIELDS = Object.freeze([
  'actor',
  'authorization',
  'authorization_signature',
  'transition'
]);

export function registerMachineCurrentnessGridRoutes(router, {
  store,
  hypervisorPublicKey
}) {
  router.add(
    'GET',
    '/internal/v1/machine-currentness',
    async ({ principal, url }) => {
      requireHypervisor(principal);
      assertPageQuery(url);
      const limit = pageLimit(url.searchParams.get('limit'));
      const after = decodeCollectionCursor(
        MACHINE_CURRENTNESS_COLLECTION,
        url.searchParams.get('cursor')
      );
      return collectionPage(
        store.listMachineCurrentness({ limit: limit + 1, after }),
        {
          collection: MACHINE_CURRENTNESS_COLLECTION,
          limit,
          key: item => [item.principal_id, item.principal_id]
        }
      );
    }
  );

  router.add(
    'GET',
    '/internal/v1/machine-currentness/:principal_id',
    async ({ params, principal }) => {
      requireHypervisor(principal);
      const principalId = assertString(
        params.principal_id,
        'machine currentness principal id',
        { max: 160, pattern: PRINCIPAL_ID }
      );
      return store.getMachineCurrentness(principalId);
    }
  );

  router.add(
    'POST',
    '/internal/v1/machine-currentness/mutate',
    async ({ body, principal, traceId }) => {
      requireHypervisor(principal);
      const request = exactRequest(parseJsonBody(body));
      const actor = assertString(request.actor, 'machine currentness actor', {
        max: 160,
        pattern: PRINCIPAL_ID
      });
      const authorization = normalizeMachineMutationAuthorization(
        request.authorization
      );
      if (!safeVerifyAuthorization(
        authorization,
        request.authorization_signature,
        hypervisorPublicKey
      )) {
        throw new AxiomError(
          'invalid_machine_mutation_authorization_signature',
          'Machine lifecycle mutation authorization signature is invalid',
          403
        );
      }
      const transition = normalizeMachineLifecycleTransition(request.transition);
      verifyRouteBindings({ actor, authorization, transition });
      return store.commitMachineCurrentnessMutation({
        traceId,
        actor,
        authorization,
        transition
      });
    }
  );
}

function assertPageQuery(url) {
  const keys = [...url.searchParams.keys()];
  if (
    new Set(keys).size !== keys.length
    || keys.some(key => key !== 'limit' && key !== 'cursor')
  ) {
    throw new ValidationError('Machine currentness page query is invalid');
  }
}

function pageLimit(value) {
  if (value === null || value === '') return COLLECTION_PAGE_MAX;
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new ValidationError('Machine currentness page limit is invalid');
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit > COLLECTION_PAGE_MAX) {
    throw new ValidationError('Machine currentness page limit is invalid');
  }
  return limit;
}

function requireHypervisor(principal) {
  if (principal?.service !== 'hypervisor') {
    throw new AxiomError(
      'caller_not_allowed',
      'Only Hypervisor may access machine currentness routes',
      403
    );
  }
}

function exactRequest(value) {
  const request = assertPlainObject(value, 'machine currentness mutation request');
  if (Object.keys(request).sort().join(',') !== REQUEST_FIELDS.join(',')) {
    throw new ValidationError('Machine currentness mutation request fields are invalid');
  }
  return request;
}

function safeVerifyAuthorization(authorization, signature, publicKey) {
  try {
    return verifyObjectSignature(authorization, signature, publicKey);
  } catch {
    return false;
  }
}

function verifyRouteBindings({ actor, authorization, transition }) {
  const authorizationDigest = digestObject(authorization);
  if (actor !== authorization.actor_id || actor !== transition.actor_id) {
    throw new ValidationError('Machine lifecycle actor binding mismatch');
  }
  if (
    authorization.target_principal_id !== transition.principal_id
    || authorization.target_principal_type !== transition.principal_type
    || authorization.root_authority_digest !== transition.root_authority_digest
  ) {
    throw new ValidationError('Machine lifecycle target or root binding mismatch');
  }
  if (
    authorization.predecessor_lifecycle_seq !== transition.predecessor_lifecycle_seq
    || authorization.predecessor_lifecycle_head_digest
      !== transition.predecessor_lifecycle_head_digest
    || authorization.predecessor_authority_digest
      !== transition.predecessor_authority_digest
  ) {
    throw new ValidationError('Machine lifecycle predecessor binding mismatch');
  }
  if (
    authorization.command_id !== transition.command_id
    || authorizationDigest !== transition.command_digest
    || authorizationDigest !== transition.mutation_authorization_digest
  ) {
    throw new ValidationError('Machine lifecycle command digest binding mismatch');
  }
  if (
    authorization.policy_version !== transition.policy_version
    || authorization.policy_digest !== transition.policy_digest
    || authorization.reason !== transition.reason
    || authorization.effective_at !== transition.effective_at
    || authorization.successor_authority_digest
      !== transition.successor_authority_digest
  ) {
    throw new ValidationError('Machine lifecycle authorization binding mismatch');
  }
}

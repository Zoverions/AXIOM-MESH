import { readFileSync } from 'node:fs';

import { ValidationError } from '../lib/canonical.mjs';
import {
  LifecycleGuardedAcceptedSocialCircleGridStore
} from './accepted-social-circle-store.mjs';
import { CIRCLE_GRID_PERSISTENCE_EVENT_KIND } from './circle-persistence-state.mjs';
import {
  commitCirclePersistenceWithPossessionBoundAtomicAdmission as commitPossessionBoundCirclePersistence
} from './circle-possession-bound-atomic-admission.mjs';
import { getCircleLifecycleGridHeadPolicy } from '../../../packages/axiom-circle-lifecycle-grid-head/index.mjs';

export const SEALED_CIRCLE_STORE_ADMISSION_SCHEMA = 'axiom-circle-sealed-store-admission.v0';

const policyUrl = new URL('../../config/circle-sealed-store-admission.v0.json', import.meta.url);
const SEALED_CIRCLE_STORE_ADMISSION_POLICY = Object.freeze(
  JSON.parse(readFileSync(policyUrl, 'utf8'))
);
const CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND = getCircleLifecycleGridHeadPolicy().grid_event_kind;
const SEALED_CONTEXT = Symbol('axiom.circle.sealed-store-admission-context');
const POSSESSION_BOUND_PERSISTENCE = 'possession-bound-circle-persistence';
const AUTHORIZED_MEMBER_LIFECYCLE = 'authorized-member-lifecycle';

const REQUIRED_TRUE = Object.freeze([
  'accepted_social_circle_composition_required',
  'possession_bound_circle_persistence_commit_available'
]);
const REQUIRED_FALSE = Object.freeze([
  'generic_internal_commit_circle_events_allowed',
  'raw_circle_persistence_append_allowed',
  'direct_lifecycle_guarded_circle_append_allowed',
  'raw_member_lifecycle_append_allowed',
  'member_lifecycle_authorized_commit_available',
  'public_circle_route',
  'gateway_circle_route',
  'hypervisor_circle_runtime_route',
  'network_egress_changed'
]);

export function validateSealedCircleStoreAdmissionPolicy(
  policy = SEALED_CIRCLE_STORE_ADMISSION_POLICY
) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new ValidationError('Sealed Circle store admission policy must be an object');
  }
  if (policy.schema !== SEALED_CIRCLE_STORE_ADMISSION_SCHEMA || policy.version !== 0) {
    throw new ValidationError('Sealed Circle store admission policy identity is invalid');
  }
  if (policy.status !== 'inert-production-selection-prerequisite') {
    throw new ValidationError('Sealed Circle store admission must remain an inert production prerequisite');
  }
  if (
    policy.runtime_activation !== false
    || policy.production_store_selected !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
  ) {
    throw new ValidationError('Sealed Circle store admission may not claim runtime or authority effects');
  }
  const requirements = policy.requirements;
  if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) {
    throw new ValidationError('Sealed Circle store admission requirements are missing');
  }
  for (const key of REQUIRED_TRUE) {
    if (requirements[key] !== true) {
      throw new ValidationError(`Sealed Circle store admission requires ${key}`);
    }
  }
  for (const key of REQUIRED_FALSE) {
    if (requirements[key] !== false) {
      throw new ValidationError(`Sealed Circle store admission must keep ${key} false`);
    }
  }
  if (!Array.isArray(policy.promotion_blockers) || policy.promotion_blockers.length < 1) {
    throw new ValidationError('Sealed Circle store admission promotion blockers are required');
  }
  return true;
}

validateSealedCircleStoreAdmissionPolicy();

export function getSealedCircleStoreAdmissionPolicy() {
  return SEALED_CIRCLE_STORE_ADMISSION_POLICY;
}

export class SealedAcceptedSocialCircleGridStore extends LifecycleGuardedAcceptedSocialCircleGridStore {
  getStatus() {
    return {
      ...super.getStatus(),
      sealed_circle_store_admission: SEALED_CIRCLE_STORE_ADMISSION_POLICY
    };
  }

  appendEvents({ traceId, actor, events }) {
    const eventKinds = Array.isArray(events)
      ? new Set(events.map(event => event?.kind))
      : new Set();

    if (eventKinds.has(CIRCLE_GRID_PERSISTENCE_EVENT_KIND)) {
      if (this[SEALED_CONTEXT] !== POSSESSION_BOUND_PERSISTENCE) {
        throw new ValidationError(
          'Raw Circle persistence events are sealed; possession-bound atomic admission is required'
        );
      }
    }

    if (eventKinds.has(CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND)) {
      if (this[SEALED_CONTEXT] !== AUTHORIZED_MEMBER_LIFECYCLE) {
        throw new ValidationError(
          'Raw Circle member lifecycle events are sealed; an authorized lifecycle commit path is required'
        );
      }
    }

    return super.appendEvents({ traceId, actor, events });
  }

  appendCirclePersistenceWithLifecycleGuards(input) {
    if (this[SEALED_CONTEXT] !== POSSESSION_BOUND_PERSISTENCE) {
      throw new ValidationError(
        'Direct lifecycle-guarded Circle append is sealed; possession-bound atomic admission is required'
      );
    }
    return super.appendCirclePersistenceWithLifecycleGuards(input);
  }

  appendCircleMemberLifecycleEvent(input) {
    if (this[SEALED_CONTEXT] !== AUTHORIZED_MEMBER_LIFECYCLE) {
      throw new ValidationError(
        'Direct Circle member lifecycle append is sealed; an authorized lifecycle commit path is required'
      );
    }
    return super.appendCircleMemberLifecycleEvent(input);
  }

  commitCirclePersistenceWithPossessionBoundAtomicAdmission(input) {
    if (this[SEALED_CONTEXT] !== undefined) {
      throw new ValidationError('Nested sealed Circle admission context is forbidden');
    }
    this[SEALED_CONTEXT] = POSSESSION_BOUND_PERSISTENCE;
    try {
      return commitPossessionBoundCirclePersistence({
        store: this,
        ...input
      });
    } finally {
      delete this[SEALED_CONTEXT];
    }
  }
}

import { readFileSync } from 'node:fs';

import { ValidationError } from '../lib/canonical.mjs';
import { AcceptedSocialGridStore } from './accepted-social-store.mjs';
import { CircleGridStore } from './circle-store.mjs';
import { LifecycleGuardedCircleGridStore } from './circle-lifecycle-guarded-store.mjs';
import { runCirclePersistenceMigrations } from './circle-persistence-migrations.mjs';
import { CIRCLE_GRID_PERSISTENCE_EVENT_KIND } from './circle-persistence-state.mjs';
import { getCircleLifecycleGridHeadPolicy } from '../../../packages/axiom-circle-lifecycle-grid-head/index.mjs';

export const ACCEPTED_SOCIAL_CIRCLE_COMPOSITION_SCHEMA = 'axiom-circle-accepted-social-store-composition.v0';

const policyUrl = new URL('../../config/circle-accepted-social-store-composition.v0.json', import.meta.url);
const ACCEPTED_SOCIAL_CIRCLE_COMPOSITION_POLICY = Object.freeze(
  JSON.parse(readFileSync(policyUrl, 'utf8'))
);
const CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND = getCircleLifecycleGridHeadPolicy().grid_event_kind;

const REQUIRED_TRUE = Object.freeze([
  'single_grid_store_instance',
  'single_sqlite_database',
  'accepted_social_storage_preserved',
  'accepted_remote_review_preserved',
  'circle_persistence_projection_preserved',
  'circle_member_lifecycle_projection_preserved',
  'lifecycle_guarded_circle_append_available'
]);

const REQUIRED_FALSE = Object.freeze([
  'public_circle_route',
  'gateway_circle_route',
  'hypervisor_circle_action',
  'social_mutation_surface_changed',
  'network_egress_changed'
]);

export function validateAcceptedSocialCircleCompositionPolicy(
  policy = ACCEPTED_SOCIAL_CIRCLE_COMPOSITION_POLICY
) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new ValidationError('Accepted Social + Circle composition policy must be an object');
  }
  if (policy.schema !== ACCEPTED_SOCIAL_CIRCLE_COMPOSITION_SCHEMA || policy.version !== 0) {
    throw new ValidationError('Accepted Social + Circle composition policy identity is invalid');
  }
  if (policy.status !== 'inert-store-composition-candidate') {
    throw new ValidationError('Accepted Social + Circle composition must remain an inert candidate');
  }
  if (
    policy.runtime_activation !== false
    || policy.production_store_selected !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
  ) {
    throw new ValidationError('Accepted Social + Circle composition may not claim runtime or authority effects');
  }
  const requirements = policy.requirements;
  if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) {
    throw new ValidationError('Accepted Social + Circle composition requirements are missing');
  }
  for (const key of REQUIRED_TRUE) {
    if (requirements[key] !== true) {
      throw new ValidationError(`Accepted Social + Circle composition requires ${key}`);
    }
  }
  for (const key of REQUIRED_FALSE) {
    if (requirements[key] !== false) {
      throw new ValidationError(`Accepted Social + Circle composition must keep ${key} false`);
    }
  }
  if (!Array.isArray(policy.promotion_blockers) || policy.promotion_blockers.length < 1) {
    throw new ValidationError('Accepted Social + Circle composition promotion blockers are required');
  }
  return true;
}

validateAcceptedSocialCircleCompositionPolicy();

export function getAcceptedSocialCircleCompositionPolicy() {
  return ACCEPTED_SOCIAL_CIRCLE_COMPOSITION_POLICY;
}

const CIRCLE_DELEGATED_METHODS = Object.freeze([
  'rebuildCirclePersistenceMaterializedState',
  'rebuildCircleMemberLifecycleMaterializedState',
  'clearCirclePersistenceMaterializedState',
  'appendCircleMemberLifecycleEvent',
  'applyCirclePersistenceMaterializedEvent',
  'applyCircleMemberLifecycleMaterializedEvent',
  'priorCirclePersistenceEvent',
  'latestCirclePersistenceEvent',
  'latestCircleMemberLifecycleEvent',
  'circlePersistenceEventById',
  'resolveCirclePersistenceReplay',
  'resolveCircleMemberLifecycleReplay',
  'getCirclePersistenceHead',
  'getCircleMemberLifecycleHead',
  'assertCirclePersistenceProjection',
  'assertCircleMemberLifecycleProjection',
  'projectionMatchesEvent',
  'lifecycleProjectionMatchesEvent',
  'requireCirclePersistenceGridChain',
  'circleHeadConflict',
  'circleMemberLifecycleHeadConflict',
  'circleProjectionDrift',
  'circleLifecycleProjectionDrift'
]);

export class AcceptedSocialCircleGridStore extends AcceptedSocialGridStore {
  initialize() {
    this.circlePersistenceReady = false;
    super.initialize();
    this.circlePersistenceMigrations = runCirclePersistenceMigrations(this.db);
    this.circlePersistenceReady = true;
    this.rebuildCirclePersistenceMaterializedState();
    this.rebuildCircleMemberLifecycleMaterializedState();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      circle_persistence_schema_version: this.circlePersistenceMigrations?.version ?? 0,
      circle_persistence_internal_projection: this.circlePersistenceReady === true,
      circle_member_lifecycle_internal_projection: this.circlePersistenceReady === true,
      circle_persistence_public_route: false,
      circle_member_lifecycle_public_route: false,
      circle_persistence_runtime_authority: false,
      circle_member_lifecycle_runtime_authority: false,
      accepted_social_circle_composition: ACCEPTED_SOCIAL_CIRCLE_COMPOSITION_POLICY
    };
  }

  rebuildMaterializedState() {
    if (!this.circlePersistenceReady) return super.rebuildMaterializedState();
    this.transaction(() => this.clearCirclePersistenceMaterializedState());
    return super.rebuildMaterializedState();
  }

  appendEvents({ traceId, actor, events }) {
    const hasCircleEvent = Array.isArray(events) && events.some(event => (
      event?.kind === CIRCLE_GRID_PERSISTENCE_EVENT_KIND
      || event?.kind === CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND
    ));
    if (!hasCircleEvent) return super.appendEvents({ traceId, actor, events });
    return CircleGridStore.prototype.appendEvents.call(this, { traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (!this.circlePersistenceReady) return;
    if (event.kind === CIRCLE_GRID_PERSISTENCE_EVENT_KIND) {
      this.applyCirclePersistenceMaterializedEvent(event);
    } else if (event.kind === CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND) {
      this.applyCircleMemberLifecycleMaterializedEvent(event);
    }
  }
}

for (const methodName of CIRCLE_DELEGATED_METHODS) {
  const method = CircleGridStore.prototype[methodName];
  if (typeof method !== 'function') {
    throw new Error(`Circle store composition method is unavailable: ${methodName}`);
  }
  Object.defineProperty(AcceptedSocialCircleGridStore.prototype, methodName, {
    configurable: false,
    enumerable: false,
    writable: false,
    value(...args) {
      return method.apply(this, args);
    }
  });
}

export class LifecycleGuardedAcceptedSocialCircleGridStore extends AcceptedSocialCircleGridStore {
  appendCirclePersistenceWithLifecycleGuards(input) {
    return LifecycleGuardedCircleGridStore.prototype.appendCirclePersistenceWithLifecycleGuards.call(
      this,
      input
    );
  }

  applyCirclePersistenceMaterializedEvent(event) {
    return LifecycleGuardedCircleGridStore.prototype.applyCirclePersistenceMaterializedEvent.call(
      this,
      event
    );
  }

  assertCircleAdmissionLifecycleGuardsCurrent(guardSet) {
    return LifecycleGuardedCircleGridStore.prototype.assertCircleAdmissionLifecycleGuardsCurrent.call(
      this,
      guardSet
    );
  }
}

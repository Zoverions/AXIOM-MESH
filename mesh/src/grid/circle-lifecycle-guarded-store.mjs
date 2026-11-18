import { AxiomError, ValidationError } from '../lib/canonical.mjs';
import { CircleGridStore } from './circle-store.mjs';
import { reconstructCircleGridPersistenceCandidate } from './circle-persistence-state.mjs';
import {
  normalizeCircleAdmissionLifecycleGuardSet
} from './circle-admission-lifecycle-guards.mjs';

export class LifecycleGuardedCircleGridStore extends CircleGridStore {
  appendCirclePersistenceWithLifecycleGuards({ traceId, actor, event, lifecycleGuardSet }) {
    if (this.circleAdmissionLifecycleGuardContext !== undefined) {
      throw new ValidationError('Circle lifecycle-guarded append does not permit nested guard context');
    }
    const candidate = reconstructCircleGridPersistenceCandidate(event);
    const guardSet = normalizeCircleAdmissionLifecycleGuardSet(lifecycleGuardSet);
    if (guardSet.guards.some(guard => guard.circle_id !== candidate.circle_id)) {
      throw new ValidationError('Circle lifecycle CAS guard belongs to a different Circle');
    }

    this.circleAdmissionLifecycleGuardContext = guardSet;
    try {
      return this.appendEvents({ traceId, actor, events: [candidate.event] });
    } finally {
      delete this.circleAdmissionLifecycleGuardContext;
    }
  }

  applyCirclePersistenceMaterializedEvent(event) {
    if (this.circleAdmissionLifecycleGuardContext !== undefined) {
      this.assertCircleAdmissionLifecycleGuardsCurrent(this.circleAdmissionLifecycleGuardContext);
    }
    return super.applyCirclePersistenceMaterializedEvent(event);
  }

  assertCircleAdmissionLifecycleGuardsCurrent(guardSet) {
    const normalized = normalizeCircleAdmissionLifecycleGuardSet(guardSet);
    for (const guard of normalized.guards) {
      const row = this.db.prepare(`
        SELECT circle_id, membership_id, principal_id, lifecycle_head_digest,
               membership_lifecycle_digest, credential_lifecycle_digest,
               event_id, event_seq
        FROM circle_member_lifecycle_heads
        WHERE circle_id = ? AND membership_id = ?
      `).get(guard.circle_id, guard.membership_id);
      if (
        !row
        || row.circle_id !== guard.circle_id
        || row.membership_id !== guard.membership_id
        || row.principal_id !== guard.principal_id
        || row.lifecycle_head_digest !== guard.expected_lifecycle_head_digest
        || row.membership_lifecycle_digest !== guard.membership_lifecycle_digest
        || row.credential_lifecycle_digest !== guard.credential_lifecycle_digest
        || row.event_id !== guard.source_event_id
        || row.event_seq !== guard.source_event_seq
      ) {
        throw new AxiomError(
          'circle_admission_lifecycle_head_conflict',
          'Circle lifecycle head changed before the authorized record commit',
          409,
          {
            circle_id: guard.circle_id,
            membership_id: guard.membership_id,
            expected_lifecycle_head_digest: guard.expected_lifecycle_head_digest,
            observed_lifecycle_head_digest: row?.lifecycle_head_digest ?? null,
            expected_source_event_id: guard.source_event_id,
            observed_source_event_id: row?.event_id ?? null
          }
        );
      }
    }
    return true;
  }
}

import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from '../lib/canonical.mjs';
import { RemoteSocialRetentionGridStore } from './remote-social-retention-store.mjs';
import { runRemoteSocialAbuseMigrations } from './remote-social-abuse-migrations.mjs';

export const REMOTE_SOCIAL_ABUSE_PREFERENCE_SCHEMA =
  'axiom-remote-social-abuse-preference.v1';
export const REMOTE_SOCIAL_REPORT_SCHEMA = 'axiom-remote-social-report.v1';
export const REMOTE_SOCIAL_QUARANTINE_SCHEMA = 'axiom-remote-social-quarantine.v1';
export const REMOTE_SOCIAL_PREFERENCE_SET_EVENT = 'remote.social.preference.set';
export const REMOTE_SOCIAL_PREFERENCE_CLEARED_EVENT = 'remote.social.preference.cleared';
export const REMOTE_SOCIAL_REPORTED_EVENT = 'remote.social.reported';
export const REMOTE_SOCIAL_QUARANTINED_EVENT = 'remote.social.quarantined';
export const REMOTE_SOCIAL_QUARANTINE_RELEASED_EVENT =
  'remote.social.quarantine.released';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const MAX_ACTIVE_PREFERENCES = 1_000;
const MAX_REPORTS = 5_000;
const MAX_ACTIVE_QUARANTINES = 500;
const MAX_LIST = 200;
const MAX_FOLLOWS = 500;
const MAX_OBSERVATION_SCAN = 2_000;
const MAX_EVENT_REBUILD = 20_000;
const MAX_NOTE = 512;
const REASON_CODES = new Set([
  'owner-choice',
  'spam',
  'harassment',
  'impersonation',
  'unsafe-content',
  'suspicious-source',
  'key-compromise',
  'operator-review',
  'other'
]);

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function boundedInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function exactKeys(value, required, label) {
  if (Object.keys(value).length !== required.length || required.some(key => !(key in value))) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function normalizeReasonCode(value, label) {
  const reason = assertString(value, label, { min: 1, max: 64, pattern: REASON });
  if (!REASON_CODES.has(reason)) {
    throw new ValidationError(`${label} is not an allowed reason code`);
  }
  return reason;
}

function normalizeNote(value, label) {
  if (value === undefined || value === null || value === '') return null;
  return assertString(value, label, { min: 1, max: MAX_NOTE });
}

function normalizeDetail({ reasonCode, note }, label) {
  return Object.freeze({
    reason_code: normalizeReasonCode(reasonCode, `${label} reason_code`),
    note: normalizeNote(note, `${label} note`),
    private_local_record: true,
    content_truth_claimed: false,
    legal_identity_claimed: false,
    personal_authorship_claimed: false
  });
}

export function normalizeRemoteSocialSourceOrigin(value) {
  const input = assertString(value, 'remote social source origin', { min: 9, max: 512 });
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new ValidationError('remote social source origin must be a valid HTTPS origin');
  }
  if (
    parsed.protocol !== 'https:'
    || !parsed.hostname
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new ValidationError('remote social source origin must be an exact HTTPS origin');
  }
  return parsed.origin;
}

function sourceDigest(origin) {
  return sha256(normalizeRemoteSocialSourceOrigin(origin));
}

export class RemoteSocialAbuseGridStore extends RemoteSocialRetentionGridStore {
  initialize() {
    this.remoteSocialAbuseReady = false;
    super.initialize();
    this.remoteSocialAbuseMigrations = runRemoteSocialAbuseMigrations(this.db);
    this.remoteSocialAbuseReady = true;
    this.rebuildRemoteSocialAbuseState();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      remote_social_abuse_schema_version:
        this.remoteSocialAbuseMigrations?.version ?? 0,
      remote_social_abuse_runtime: 'owner-private-safety-controls-laboratory'
    };
  }

  appendEvents({ traceId, actor, events }) {
    if (Array.isArray(events)) {
      for (const event of events) {
        if (event?.kind === REMOTE_SOCIAL_PREFERENCE_SET_EVENT) {
          validatePreferenceSetEvent(event, actor);
        } else if (event?.kind === REMOTE_SOCIAL_PREFERENCE_CLEARED_EVENT) {
          validatePreferenceClearedEvent(event, actor);
        } else if (event?.kind === REMOTE_SOCIAL_REPORTED_EVENT) {
          validateReportEvent(event, actor);
        } else if (event?.kind === REMOTE_SOCIAL_QUARANTINED_EVENT) {
          validateQuarantineSetEvent(event, actor);
        } else if (event?.kind === REMOTE_SOCIAL_QUARANTINE_RELEASED_EVENT) {
          validateQuarantineReleasedEvent(event, actor);
        }
      }
    }
    return super.appendEvents({ traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (!this.remoteSocialAbuseReady) return;
    if (event.kind === REMOTE_SOCIAL_PREFERENCE_SET_EVENT) {
      this.materializePreferenceSet(event);
    } else if (event.kind === REMOTE_SOCIAL_PREFERENCE_CLEARED_EVENT) {
      this.materializePreferenceCleared(event);
    } else if (event.kind === REMOTE_SOCIAL_REPORTED_EVENT) {
      this.materializeReport(event);
    } else if (event.kind === REMOTE_SOCIAL_QUARANTINED_EVENT) {
      this.materializeQuarantineSet(event);
    } else if (event.kind === REMOTE_SOCIAL_QUARANTINE_RELEASED_EVENT) {
      this.materializeQuarantineReleased(event);
    }
  }

  rebuildRemoteSocialAbuseState() {
    const kinds = [
      REMOTE_SOCIAL_PREFERENCE_SET_EVENT,
      REMOTE_SOCIAL_PREFERENCE_CLEARED_EVENT,
      REMOTE_SOCIAL_REPORTED_EVENT,
      REMOTE_SOCIAL_QUARANTINED_EVENT,
      REMOTE_SOCIAL_QUARANTINE_RELEASED_EVENT
    ];
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE kind IN (?, ?, ?, ?, ?)
      ORDER BY seq LIMIT ?
    `).all(...kinds, MAX_EVENT_REBUILD + 1);
    if (rows.length > MAX_EVENT_REBUILD) {
      throw new AxiomError(
        'remote_social_abuse_history_limit_reached',
        'Remote social abuse-control history exceeds the current rebuild ceiling',
        409
      );
    }
    this.transaction(() => {
      this.db.exec(`
        DELETE FROM remote_social_abuse_preferences;
        DELETE FROM remote_social_reports;
        DELETE FROM remote_social_quarantines;
      `);
      for (const row of rows) {
        const event = this.decodeEventRow(row);
        if (event.kind === REMOTE_SOCIAL_PREFERENCE_SET_EVENT) {
          this.materializePreferenceSet(event);
        } else if (event.kind === REMOTE_SOCIAL_PREFERENCE_CLEARED_EVENT) {
          this.materializePreferenceCleared(event);
        } else if (event.kind === REMOTE_SOCIAL_REPORTED_EVENT) {
          this.materializeReport(event);
        } else if (event.kind === REMOTE_SOCIAL_QUARANTINED_EVENT) {
          this.materializeQuarantineSet(event);
        } else {
          this.materializeQuarantineReleased(event);
        }
      }
    });
  }

  muteRemotePersona(input) {
    return this.setRemotePersonaPreference({ ...input, action: 'mute' });
  }

  unmuteRemotePersona(input) {
    return this.clearRemotePersonaPreference({ ...input, action: 'mute' });
  }

  blockRemotePersona(input) {
    return this.setRemotePersonaPreference({ ...input, action: 'block' });
  }

  unblockRemotePersona(input) {
    return this.clearRemotePersonaPreference({ ...input, action: 'block' });
  }

  setRemotePersonaPreference({
    owner,
    personaObservationId,
    action,
    reasonCode = 'owner-choice',
    note,
    traceId
  }) {
    const recipient = id(owner, 'remote social abuse preference owner');
    id(traceId, 'remote social abuse preference trace_id');
    if (action !== 'mute' && action !== 'block') {
      throw new ValidationError('remote social abuse preference action must be mute or block');
    }
    const persona = this.requirePersonaObservation(recipient, personaObservationId);
    const detail = normalizeDetail({ reasonCode, note }, 'remote social abuse preference');
    const preferenceId = `remote_abuse_${digestObject({
      schema: REMOTE_SOCIAL_ABUSE_PREFERENCE_SCHEMA,
      owner: recipient,
      action,
      exporter_key_id: persona.exporter_key_id,
      persona_projection_digest: persona.object_digest
    })}`;
    const existing = this.db.prepare(`
      SELECT * FROM remote_social_abuse_preferences
      WHERE preference_id = ?
    `).get(preferenceId);
    if (existing?.status === 'active') {
      const decoded = this.decodePreference(existing);
      if (canonicalJson(decoded.detail_json) !== canonicalJson(detail)) {
        throw new AxiomError(
          'remote_social_abuse_preference_conflict',
          'The remote social preference is already active with different detail',
          409
        );
      }
      return decoded;
    }
    if (!existing) {
      this.assertOwnerCountBelow(
        'remote_social_abuse_preferences',
        recipient,
        MAX_ACTIVE_PREFERENCES,
        'remote_social_abuse_preference_limit_reached'
      );
    }
    this.appendEvents({
      traceId,
      actor: recipient,
      events: [{
        kind: REMOTE_SOCIAL_PREFERENCE_SET_EVENT,
        subject: preferenceId,
        payload: {
          schema: REMOTE_SOCIAL_ABUSE_PREFERENCE_SCHEMA,
          preference_id: preferenceId,
          owner: recipient,
          action,
          exporter_key_id: persona.exporter_key_id,
          persona_projection_digest: persona.object_digest,
          persona_observation_id: persona.observation_id,
          detail,
          network_effect: 'none',
          authority_effect: 'none',
          recommendation_effect: 'none'
        }
      }]
    });
    return this.getRemoteSocialAbusePreference(recipient, preferenceId);
  }

  clearRemotePersonaPreference({ owner, personaObservationId, action, traceId }) {
    const recipient = id(owner, 'remote social abuse preference owner');
    id(traceId, 'remote social abuse preference trace_id');
    if (action !== 'mute' && action !== 'block') {
      throw new ValidationError('remote social abuse preference action must be mute or block');
    }
    const persona = this.requirePersonaObservation(recipient, personaObservationId);
    const preferenceId = `remote_abuse_${digestObject({
      schema: REMOTE_SOCIAL_ABUSE_PREFERENCE_SCHEMA,
      owner: recipient,
      action,
      exporter_key_id: persona.exporter_key_id,
      persona_projection_digest: persona.object_digest
    })}`;
    const existing = this.db.prepare(`
      SELECT * FROM remote_social_abuse_preferences
      WHERE owner = ? AND preference_id = ?
    `).get(recipient, preferenceId);
    if (!existing) {
      throw new AxiomError(
        'remote_social_abuse_preference_not_found',
        'Remote social abuse preference was not found',
        404
      );
    }
    if (existing.status === 'cleared') return this.decodePreference(existing);
    this.appendEvents({
      traceId,
      actor: recipient,
      events: [{
        kind: REMOTE_SOCIAL_PREFERENCE_CLEARED_EVENT,
        subject: preferenceId,
        payload: {
          schema: REMOTE_SOCIAL_ABUSE_PREFERENCE_SCHEMA,
          preference_id: preferenceId,
          owner: recipient,
          action,
          network_effect: 'none',
          authority_effect: 'none',
          recommendation_effect: 'none'
        }
      }]
    });
    return this.getRemoteSocialAbusePreference(recipient, preferenceId);
  }

  reportRemoteObservation({
    owner,
    observationId,
    reasonCode,
    note,
    traceId
  }) {
    const recipient = id(owner, 'remote social report owner');
    id(traceId, 'remote social report trace_id');
    const observation = this.requireReportableObservation(recipient, observationId);
    const detail = normalizeDetail({ reasonCode, note }, 'remote social report');
    const report = Object.freeze({
      ...detail,
      adjudicated: false,
      visibility_effect: 'none'
    });
    const reportId = `remote_report_${digestObject({
      schema: REMOTE_SOCIAL_REPORT_SCHEMA,
      owner: recipient,
      target_observation_id: observation.observation_id,
      target_digest: observation.object_digest,
      report
    })}`;
    const existing = this.db.prepare(`
      SELECT * FROM remote_social_reports WHERE report_id = ?
    `).get(reportId);
    if (existing) return this.decodeReport(existing);
    this.assertOwnerCountBelow(
      'remote_social_reports',
      recipient,
      MAX_REPORTS,
      'remote_social_report_limit_reached'
    );
    this.appendEvents({
      traceId,
      actor: recipient,
      events: [{
        kind: REMOTE_SOCIAL_REPORTED_EVENT,
        subject: reportId,
        payload: {
          schema: REMOTE_SOCIAL_REPORT_SCHEMA,
          report_id: reportId,
          owner: recipient,
          target_kind: observation.object_kind,
          target_observation_id: observation.observation_id,
          exporter_key_id: observation.exporter_key_id,
          target_digest: observation.object_digest,
          report,
          network_effect: 'none',
          authority_effect: 'none',
          recommendation_effect: 'none',
          adjudication_effect: 'none'
        }
      }]
    });
    return this.getRemoteSocialReport(recipient, reportId);
  }

  quarantineRemoteExporter({
    owner,
    exporterKeyId,
    reasonCode,
    note,
    traceId
  }) {
    const recipient = id(owner, 'remote social quarantine owner');
    const exporter = digest(exporterKeyId, 'remote social quarantine exporter_key_id');
    id(traceId, 'remote social quarantine trace_id');
    if (!this.ownerKnowsExporter(recipient, exporter)) {
      throw new AxiomError(
        'remote_social_exporter_not_found',
        'Remote social exporter is not present in owner-scoped reviewed state',
        404
      );
    }
    return this.setRemoteSocialQuarantine({
      owner: recipient,
      targetKind: 'exporter',
      targetDigest: exporter,
      detail: normalizeDetail({ reasonCode, note }, 'remote social exporter quarantine'),
      traceId
    });
  }

  releaseRemoteExporterQuarantine({ owner, exporterKeyId, traceId }) {
    return this.releaseRemoteSocialQuarantine({
      owner,
      targetKind: 'exporter',
      targetDigest: digest(exporterKeyId, 'remote social quarantine exporter_key_id'),
      traceId
    });
  }

  quarantineRemoteSource({ owner, sourceOrigin, reasonCode, note, traceId }) {
    const recipient = id(owner, 'remote social quarantine owner');
    id(traceId, 'remote social quarantine trace_id');
    const normalizedOrigin = normalizeRemoteSocialSourceOrigin(sourceOrigin);
    return this.setRemoteSocialQuarantine({
      owner: recipient,
      targetKind: 'source',
      targetDigest: sha256(normalizedOrigin),
      detail: Object.freeze({
        ...normalizeDetail({ reasonCode, note }, 'remote social source quarantine'),
        source_origin: normalizedOrigin
      }),
      traceId
    });
  }

  releaseRemoteSourceQuarantine({ owner, sourceOrigin, traceId }) {
    return this.releaseRemoteSocialQuarantine({
      owner,
      targetKind: 'source',
      targetDigest: sourceDigest(sourceOrigin),
      traceId
    });
  }

  setRemoteSocialQuarantine({ owner, targetKind, targetDigest, detail, traceId }) {
    const recipient = id(owner, 'remote social quarantine owner');
    id(traceId, 'remote social quarantine trace_id');
    if (targetKind !== 'exporter' && targetKind !== 'source') {
      throw new ValidationError('remote social quarantine target_kind is invalid');
    }
    const target = digest(targetDigest, 'remote social quarantine target_digest');
    const normalizedDetail = normalizeQuarantineDetail(detail, targetKind);
    const quarantineId = `remote_quarantine_${digestObject({
      schema: REMOTE_SOCIAL_QUARANTINE_SCHEMA,
      owner: recipient,
      target_kind: targetKind,
      target_digest: target
    })}`;
    const existing = this.db.prepare(`
      SELECT * FROM remote_social_quarantines WHERE quarantine_id = ?
    `).get(quarantineId);
    if (existing?.status === 'active') {
      const decoded = this.decodeQuarantine(existing);
      if (canonicalJson(decoded.detail_json) !== canonicalJson(normalizedDetail)) {
        throw new AxiomError(
          'remote_social_quarantine_conflict',
          'Remote social quarantine is already active with different detail',
          409
        );
      }
      return decoded;
    }
    if (!existing) {
      this.assertOwnerCountBelow(
        'remote_social_quarantines',
        recipient,
        MAX_ACTIVE_QUARANTINES,
        'remote_social_quarantine_limit_reached'
      );
    }
    this.appendEvents({
      traceId,
      actor: recipient,
      events: [{
        kind: REMOTE_SOCIAL_QUARANTINED_EVENT,
        subject: quarantineId,
        payload: {
          schema: REMOTE_SOCIAL_QUARANTINE_SCHEMA,
          quarantine_id: quarantineId,
          owner: recipient,
          target_kind: targetKind,
          target_digest: target,
          detail: normalizedDetail,
          network_effect: 'none',
          authority_effect: 'none',
          recommendation_effect: 'none',
          adjudication_effect: 'none'
        }
      }]
    });
    return this.getRemoteSocialQuarantine(recipient, quarantineId);
  }

  releaseRemoteSocialQuarantine({ owner, targetKind, targetDigest, traceId }) {
    const recipient = id(owner, 'remote social quarantine owner');
    id(traceId, 'remote social quarantine trace_id');
    if (targetKind !== 'exporter' && targetKind !== 'source') {
      throw new ValidationError('remote social quarantine target_kind is invalid');
    }
    const target = digest(targetDigest, 'remote social quarantine target_digest');
    const quarantineId = `remote_quarantine_${digestObject({
      schema: REMOTE_SOCIAL_QUARANTINE_SCHEMA,
      owner: recipient,
      target_kind: targetKind,
      target_digest: target
    })}`;
    const existing = this.db.prepare(`
      SELECT * FROM remote_social_quarantines
      WHERE owner = ? AND quarantine_id = ?
    `).get(recipient, quarantineId);
    if (!existing) {
      throw new AxiomError(
        'remote_social_quarantine_not_found',
        'Remote social quarantine was not found',
        404
      );
    }
    if (existing.status === 'released') return this.decodeQuarantine(existing);
    this.appendEvents({
      traceId,
      actor: recipient,
      events: [{
        kind: REMOTE_SOCIAL_QUARANTINE_RELEASED_EVENT,
        subject: quarantineId,
        payload: {
          schema: REMOTE_SOCIAL_QUARANTINE_SCHEMA,
          quarantine_id: quarantineId,
          owner: recipient,
          target_kind: targetKind,
          target_digest: target,
          network_effect: 'none',
          authority_effect: 'none',
          recommendation_effect: 'none',
          adjudication_effect: 'none'
        }
      }]
    });
    return this.getRemoteSocialQuarantine(recipient, quarantineId);
  }

  followRemotePersona(input) {
    const value = assertPlainObject(input, 'remote social guarded follow input');
    const recipient = id(value.owner, 'remote social follow owner');
    const persona = this.requirePersonaObservation(recipient, value.personaObservationId);
    if (this.hasActivePersonaPreference(recipient, 'block', persona)) {
      throw new AxiomError(
        'remote_social_persona_blocked',
        'Blocked remote persona cannot be followed',
        409
      );
    }
    if (this.isExporterQuarantined(recipient, persona.exporter_key_id)) {
      throw new AxiomError(
        'remote_social_exporter_quarantined',
        'Quarantined remote exporter cannot be followed',
        409
      );
    }
    return super.followRemotePersona(input);
  }

  getChronologicalFollowing(owner, { limit = 100 } = {}) {
    const recipient = id(owner, 'remote social Following owner');
    const safeLimit = boundedInteger(limit, 'remote social Following limit', 1, 100);
    const followRows = this.db.prepare(`
      SELECT * FROM remote_social_follows
      WHERE owner = ? AND status = 'following'
      ORDER BY followed_at, follow_id LIMIT ?
    `).all(recipient, MAX_FOLLOWS + 1);
    if (followRows.length > MAX_FOLLOWS) {
      throw new AxiomError(
        'remote_social_follow_limit_reached',
        'Remote social Following exceeds the current local follow ceiling',
        409
      );
    }
    const follows = followRows.map(row => this.decodeFollow(row));
    if (!follows.length) return emptyGuardedFollowing(recipient);

    const observationRows = this.db.prepare(`
      SELECT * FROM remote_social_observations
      WHERE owner = ? ORDER BY observed_at, observation_id LIMIT ?
    `).all(recipient, MAX_OBSERVATION_SCAN + 1);
    if (observationRows.length > MAX_OBSERVATION_SCAN) {
      throw new AxiomError(
        'remote_social_following_history_limit_reached',
        'Remote social Following history exceeds the current reconstruction ceiling',
        409
      );
    }
    const observations = observationRows.map(row => this.decodeObservation(row));
    const followByKey = new Map(follows.map(follow => [
      followKey(follow.exporter_key_id, follow.persona_projection_digest),
      follow
    ]));
    const personaByKey = new Map();
    const publications = [];
    const transitions = [];
    for (const observation of observations) {
      if (observation.object_kind === 'persona') {
        const key = followKey(observation.exporter_key_id, observation.object_digest);
        if (followByKey.has(key)) personaByKey.set(key, observation);
      } else if (observation.object_kind === 'publication') {
        const key = followKey(
          observation.exporter_key_id,
          observation.object_json.persona_projection_digest
        );
        if (followByKey.has(key)) publications.push({ observation, key });
      } else if (observation.object_kind === 'transition') {
        const key = followKey(
          observation.exporter_key_id,
          observation.object_json.persona_projection_digest
        );
        if (followByKey.has(key)) transitions.push({ observation, key });
      }
    }
    const superseded = new Set(
      publications
        .map(item => item.observation.object_json.supersedes_digest)
        .filter(Boolean)
    );
    const retracted = new Set(
      transitions.map(item => item.observation.object_json.publication_digest)
    );
    const items = publications
      .filter(item => (
        !superseded.has(item.observation.object_digest)
        && !retracted.has(item.observation.object_digest)
      ))
      .map(item => {
        const follow = followByKey.get(item.key);
        const persona = personaByKey.get(item.key);
        if (!persona) {
          throw new ValidationError('Following publication is missing its admitted persona observation');
        }
        return { item, follow, persona };
      })
      .filter(({ persona }) => !this.isPersonaSuppressed(recipient, persona))
      .map(({ item, follow, persona }) => Object.freeze({
        publication: item.observation.object_json,
        persona: persona.object_json,
        exporter_grid_id: item.observation.exporter_grid_id,
        exporter_key_id: item.observation.exporter_key_id,
        source_trust: follow.trust_json,
        observed_at: item.observation.observed_at,
        remote_observation_only: true,
        local_authorship_claimed: false,
        network_effect: 'none',
        recommendation_effect: 'none'
      }))
      .sort((left, right) => (
        right.publication.created_at.localeCompare(left.publication.created_at)
        || right.publication.projection_digest.localeCompare(left.publication.projection_digest)
      ));
    const truncated = items.length > safeLimit;
    return Object.freeze({
      schema: 'axiom-remote-social-following.v1',
      owner: recipient,
      ordering: 'chronological-desc',
      ranking_effect: 'none',
      recommendation_effect: 'none',
      transport_effect: 'none',
      network_effect: 'none',
      remote_observation_only: true,
      abuse_controls_applied: true,
      items: Object.freeze(items.slice(0, safeLimit)),
      truncated
    });
  }

  getRemoteSocialAbusePreference(owner, preferenceId) {
    const recipient = id(owner, 'remote social abuse preference owner');
    const preference = id(preferenceId, 'remote social abuse preference_id');
    const row = this.db.prepare(`
      SELECT * FROM remote_social_abuse_preferences
      WHERE owner = ? AND preference_id = ?
    `).get(recipient, preference);
    if (!row) {
      throw new AxiomError(
        'remote_social_abuse_preference_not_found',
        'Remote social abuse preference was not found',
        404
      );
    }
    return this.decodePreference(row);
  }

  listRemoteSocialAbusePreferences(owner, { limit = 100 } = {}) {
    const recipient = id(owner, 'remote social abuse preference owner');
    const safeLimit = boundedInteger(limit, 'remote social abuse preference limit', 1, MAX_LIST);
    const rows = this.db.prepare(`
      SELECT * FROM remote_social_abuse_preferences
      WHERE owner = ? ORDER BY created_at DESC, preference_id DESC LIMIT ?
    `).all(recipient, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return Object.freeze({
      preferences: Object.freeze(rows.map(row => this.decodePreference(row))),
      truncated,
      private_local_preferences: true,
      network_effect: 'none',
      authority_effect: 'none'
    });
  }

  getRemoteSocialReport(owner, reportId) {
    const recipient = id(owner, 'remote social report owner');
    const report = id(reportId, 'remote social report_id');
    const row = this.db.prepare(`
      SELECT * FROM remote_social_reports
      WHERE owner = ? AND report_id = ?
    `).get(recipient, report);
    if (!row) {
      throw new AxiomError('remote_social_report_not_found', 'Remote social report was not found', 404);
    }
    return this.decodeReport(row);
  }

  listRemoteSocialReports(owner, { limit = 100 } = {}) {
    const recipient = id(owner, 'remote social report owner');
    const safeLimit = boundedInteger(limit, 'remote social report limit', 1, MAX_LIST);
    const rows = this.db.prepare(`
      SELECT * FROM remote_social_reports
      WHERE owner = ? ORDER BY reported_at DESC, report_id DESC LIMIT ?
    `).all(recipient, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return Object.freeze({
      reports: Object.freeze(rows.map(row => this.decodeReport(row))),
      truncated,
      reports_are_owner_assertions: true,
      adjudication_effect: 'none',
      network_effect: 'none',
      authority_effect: 'none'
    });
  }

  getRemoteSocialQuarantine(owner, quarantineId) {
    const recipient = id(owner, 'remote social quarantine owner');
    const quarantine = id(quarantineId, 'remote social quarantine_id');
    const row = this.db.prepare(`
      SELECT * FROM remote_social_quarantines
      WHERE owner = ? AND quarantine_id = ?
    `).get(recipient, quarantine);
    if (!row) {
      throw new AxiomError(
        'remote_social_quarantine_not_found',
        'Remote social quarantine was not found',
        404
      );
    }
    return this.decodeQuarantine(row);
  }

  listRemoteSocialQuarantines(owner, { limit = 100 } = {}) {
    const recipient = id(owner, 'remote social quarantine owner');
    const safeLimit = boundedInteger(limit, 'remote social quarantine limit', 1, MAX_LIST);
    const rows = this.db.prepare(`
      SELECT * FROM remote_social_quarantines
      WHERE owner = ? ORDER BY quarantined_at DESC, quarantine_id DESC LIMIT ?
    `).all(recipient, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return Object.freeze({
      quarantines: Object.freeze(rows.map(row => this.decodeQuarantine(row))),
      truncated,
      owner_local_only: true,
      adjudication_effect: 'none',
      network_effect: 'none',
      authority_effect: 'none'
    });
  }

  materializePreferenceSet(event) {
    const payload = validatePreferenceSetEvent(event, event.actor);
    const persona = this.requirePersonaObservation(payload.owner, payload.persona_observation_id);
    if (
      persona.exporter_key_id !== payload.exporter_key_id
      || persona.object_digest !== payload.persona_projection_digest
    ) {
      throw new ValidationError('remote social abuse preference does not match admitted persona');
    }
    const existing = this.db.prepare(`
      SELECT * FROM remote_social_abuse_preferences WHERE preference_id = ?
    `).get(payload.preference_id);
    if (existing?.status === 'active') {
      const decoded = this.decodePreference(existing);
      if (canonicalJson(decoded.detail_json) !== canonicalJson(payload.detail)) {
        throw new ValidationError('active remote social abuse preference changed without transition');
      }
      return;
    }
    const protectedDetail = this.protectJson(
      'remote_social_abuse_preferences',
      'detail_json',
      payload.preference_id,
      payload.detail
    );
    if (existing) {
      this.db.prepare(`
        UPDATE remote_social_abuse_preferences
        SET persona_observation_id = ?, detail_json = ?, status = 'active',
            created_at = ?, cleared_at = NULL
        WHERE preference_id = ?
      `).run(
        payload.persona_observation_id,
        protectedDetail,
        event.occurred_at,
        payload.preference_id
      );
      return;
    }
    this.db.prepare(`
      INSERT INTO remote_social_abuse_preferences(
        preference_id, owner, action, exporter_key_id,
        persona_projection_digest, persona_observation_id, detail_json,
        status, created_at, cleared_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL)
    `).run(
      payload.preference_id,
      payload.owner,
      payload.action,
      payload.exporter_key_id,
      payload.persona_projection_digest,
      payload.persona_observation_id,
      protectedDetail,
      event.occurred_at
    );
  }

  materializePreferenceCleared(event) {
    const payload = validatePreferenceClearedEvent(event, event.actor);
    const existing = this.db.prepare(`
      SELECT status, action FROM remote_social_abuse_preferences
      WHERE owner = ? AND preference_id = ?
    `).get(payload.owner, payload.preference_id);
    if (!existing || existing.action !== payload.action) {
      throw new ValidationError('remote social abuse preference clear target is invalid');
    }
    if (existing.status === 'cleared') return;
    this.db.prepare(`
      UPDATE remote_social_abuse_preferences
      SET status = 'cleared', cleared_at = ?
      WHERE owner = ? AND preference_id = ?
    `).run(event.occurred_at, payload.owner, payload.preference_id);
  }

  materializeReport(event) {
    const payload = validateReportEvent(event, event.actor);
    const observation = this.requireReportableObservation(
      payload.owner,
      payload.target_observation_id
    );
    if (
      observation.object_kind !== payload.target_kind
      || observation.exporter_key_id !== payload.exporter_key_id
      || observation.object_digest !== payload.target_digest
    ) {
      throw new ValidationError('remote social report does not match admitted observation');
    }
    const existing = this.db.prepare(`
      SELECT report_id FROM remote_social_reports WHERE report_id = ?
    `).get(payload.report_id);
    if (existing) return;
    this.db.prepare(`
      INSERT INTO remote_social_reports(
        report_id, owner, target_kind, target_observation_id,
        exporter_key_id, target_digest, report_json, reported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.report_id,
      payload.owner,
      payload.target_kind,
      payload.target_observation_id,
      payload.exporter_key_id,
      payload.target_digest,
      this.protectJson(
        'remote_social_reports',
        'report_json',
        payload.report_id,
        payload.report
      ),
      event.occurred_at
    );
  }

  materializeQuarantineSet(event) {
    const payload = validateQuarantineSetEvent(event, event.actor);
    if (payload.target_kind === 'exporter' && !this.ownerKnowsExporter(payload.owner, payload.target_digest)) {
      throw new ValidationError('remote social exporter quarantine target is not owner-visible');
    }
    const existing = this.db.prepare(`
      SELECT * FROM remote_social_quarantines WHERE quarantine_id = ?
    `).get(payload.quarantine_id);
    if (existing?.status === 'active') {
      const decoded = this.decodeQuarantine(existing);
      if (canonicalJson(decoded.detail_json) !== canonicalJson(payload.detail)) {
        throw new ValidationError('active remote social quarantine changed without transition');
      }
      return;
    }
    const protectedDetail = this.protectJson(
      'remote_social_quarantines',
      'detail_json',
      payload.quarantine_id,
      payload.detail
    );
    if (existing) {
      this.db.prepare(`
        UPDATE remote_social_quarantines
        SET detail_json = ?, status = 'active', quarantined_at = ?, released_at = NULL
        WHERE quarantine_id = ?
      `).run(protectedDetail, event.occurred_at, payload.quarantine_id);
      return;
    }
    this.db.prepare(`
      INSERT INTO remote_social_quarantines(
        quarantine_id, owner, target_kind, target_digest, detail_json,
        status, quarantined_at, released_at
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, NULL)
    `).run(
      payload.quarantine_id,
      payload.owner,
      payload.target_kind,
      payload.target_digest,
      protectedDetail,
      event.occurred_at
    );
  }

  materializeQuarantineReleased(event) {
    const payload = validateQuarantineReleasedEvent(event, event.actor);
    const existing = this.db.prepare(`
      SELECT status, target_kind, target_digest FROM remote_social_quarantines
      WHERE owner = ? AND quarantine_id = ?
    `).get(payload.owner, payload.quarantine_id);
    if (
      !existing
      || existing.target_kind !== payload.target_kind
      || existing.target_digest !== payload.target_digest
    ) {
      throw new ValidationError('remote social quarantine release target is invalid');
    }
    if (existing.status === 'released') return;
    this.db.prepare(`
      UPDATE remote_social_quarantines
      SET status = 'released', released_at = ?
      WHERE owner = ? AND quarantine_id = ?
    `).run(event.occurred_at, payload.owner, payload.quarantine_id);
  }

  decodePreference(row) {
    return Object.freeze({
      schema: REMOTE_SOCIAL_ABUSE_PREFERENCE_SCHEMA,
      preference_id: row.preference_id,
      owner: row.owner,
      action: row.action,
      exporter_key_id: row.exporter_key_id,
      persona_projection_digest: row.persona_projection_digest,
      persona_observation_id: row.persona_observation_id,
      detail_json: this.openJson(
        'remote_social_abuse_preferences',
        'detail_json',
        row.preference_id,
        row.detail_json
      ),
      status: row.status,
      created_at: row.created_at,
      cleared_at: row.cleared_at,
      private_local_preference: true,
      network_effect: 'none',
      authority_effect: 'none',
      recommendation_effect: 'none'
    });
  }

  decodeReport(row) {
    return Object.freeze({
      schema: REMOTE_SOCIAL_REPORT_SCHEMA,
      report_id: row.report_id,
      owner: row.owner,
      target_kind: row.target_kind,
      target_observation_id: row.target_observation_id,
      exporter_key_id: row.exporter_key_id,
      target_digest: row.target_digest,
      report_json: this.openJson(
        'remote_social_reports',
        'report_json',
        row.report_id,
        row.report_json
      ),
      reported_at: row.reported_at,
      owner_assertion_only: true,
      adjudicated: false,
      network_effect: 'none',
      authority_effect: 'none',
      recommendation_effect: 'none',
      adjudication_effect: 'none'
    });
  }

  decodeQuarantine(row) {
    return Object.freeze({
      schema: REMOTE_SOCIAL_QUARANTINE_SCHEMA,
      quarantine_id: row.quarantine_id,
      owner: row.owner,
      target_kind: row.target_kind,
      target_digest: row.target_digest,
      detail_json: this.openJson(
        'remote_social_quarantines',
        'detail_json',
        row.quarantine_id,
        row.detail_json
      ),
      status: row.status,
      quarantined_at: row.quarantined_at,
      released_at: row.released_at,
      owner_local_only: true,
      network_effect: 'none',
      authority_effect: 'none',
      recommendation_effect: 'none',
      adjudication_effect: 'none'
    });
  }

  requirePersonaObservation(owner, observationId) {
    const observation = id(observationId, 'remote social persona observation_id');
    const row = this.db.prepare(`
      SELECT * FROM remote_social_observations
      WHERE owner = ? AND observation_id = ?
    `).get(owner, observation);
    if (!row || row.object_kind !== 'persona') {
      throw new AxiomError(
        'remote_social_persona_observation_not_found',
        'An admitted remote persona observation is required',
        404
      );
    }
    return this.decodeObservation(row);
  }

  requireReportableObservation(owner, observationId) {
    const observation = id(observationId, 'remote social report observation_id');
    const row = this.db.prepare(`
      SELECT * FROM remote_social_observations
      WHERE owner = ? AND observation_id = ?
    `).get(owner, observation);
    if (!row || (row.object_kind !== 'persona' && row.object_kind !== 'publication')) {
      throw new AxiomError(
        'remote_social_report_target_not_found',
        'An owner-visible admitted persona or publication observation is required',
        404
      );
    }
    return this.decodeObservation(row);
  }

  ownerKnowsExporter(owner, exporterKeyId) {
    return Boolean(
      this.db.prepare(`
        SELECT 1 FROM remote_social_observations
        WHERE owner = ? AND exporter_key_id = ? LIMIT 1
      `).get(owner, exporterKeyId)
      || this.db.prepare(`
        SELECT 1 FROM remote_social_staging
        WHERE owner = ? AND exporter_key_id = ? LIMIT 1
      `).get(owner, exporterKeyId)
    );
  }

  assertOwnerCountBelow(table, owner, max, code) {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE owner = ?`).get(owner);
    if (row.count >= max) {
      throw new AxiomError(code, `Remote social owner-scoped ${table} ceiling reached`, 409);
    }
  }

  hasActivePersonaPreference(owner, action, persona) {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM remote_social_abuse_preferences
      WHERE owner = ? AND action = ? AND exporter_key_id = ?
        AND persona_projection_digest = ? AND status = 'active'
      LIMIT 1
    `).get(owner, action, persona.exporter_key_id, persona.object_digest));
  }

  isExporterQuarantined(owner, exporterKeyId) {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM remote_social_quarantines
      WHERE owner = ? AND target_kind = 'exporter' AND target_digest = ?
        AND status = 'active' LIMIT 1
    `).get(owner, exporterKeyId));
  }

  isPersonaSuppressed(owner, persona) {
    return (
      this.hasActivePersonaPreference(owner, 'mute', persona)
      || this.hasActivePersonaPreference(owner, 'block', persona)
      || this.isExporterQuarantined(owner, persona.exporter_key_id)
    );
  }
}

function normalizeQuarantineDetail(input, targetKind) {
  const value = assertPlainObject(input, 'remote social quarantine detail');
  const required = targetKind === 'source'
    ? [
        'reason_code', 'note', 'private_local_record', 'content_truth_claimed',
        'legal_identity_claimed', 'personal_authorship_claimed', 'source_origin'
      ]
    : [
        'reason_code', 'note', 'private_local_record', 'content_truth_claimed',
        'legal_identity_claimed', 'personal_authorship_claimed'
      ];
  exactKeys(value, required, 'remote social quarantine detail');
  const normalized = {
    ...normalizeDetail({ reasonCode: value.reason_code, note: value.note }, 'remote social quarantine'),
    ...(targetKind === 'source'
      ? { source_origin: normalizeRemoteSocialSourceOrigin(value.source_origin) }
      : {})
  };
  if (
    value.private_local_record !== true
    || value.content_truth_claimed !== false
    || value.legal_identity_claimed !== false
    || value.personal_authorship_claimed !== false
  ) {
    throw new ValidationError('remote social quarantine may not expand trust or authority claims');
  }
  return Object.freeze(normalized);
}

function validatePreferenceSetEvent(eventInput, actor) {
  const event = assertPlainObject(eventInput, 'remote social preference event');
  const payload = assertPlainObject(event.payload, 'remote social preference payload');
  const required = [
    'schema', 'preference_id', 'owner', 'action', 'exporter_key_id',
    'persona_projection_digest', 'persona_observation_id', 'detail',
    'network_effect', 'authority_effect', 'recommendation_effect'
  ];
  exactKeys(payload, required, 'remote social preference payload');
  if (payload.schema !== REMOTE_SOCIAL_ABUSE_PREFERENCE_SCHEMA) {
    throw new ValidationError('unsupported remote social abuse preference schema');
  }
  const normalized = {
    schema: REMOTE_SOCIAL_ABUSE_PREFERENCE_SCHEMA,
    preference_id: id(payload.preference_id, 'remote social abuse preference_id'),
    owner: id(payload.owner, 'remote social abuse preference owner'),
    action: payload.action,
    exporter_key_id: digest(payload.exporter_key_id, 'remote social abuse exporter_key_id'),
    persona_projection_digest: digest(
      payload.persona_projection_digest,
      'remote social abuse persona_projection_digest'
    ),
    persona_observation_id: id(
      payload.persona_observation_id,
      'remote social abuse persona_observation_id'
    ),
    detail: normalizeDetail(
      {
        reasonCode: payload.detail?.reason_code,
        note: payload.detail?.note
      },
      'remote social abuse preference'
    ),
    network_effect: payload.network_effect,
    authority_effect: payload.authority_effect,
    recommendation_effect: payload.recommendation_effect
  };
  if (
    normalized.action !== 'mute' && normalized.action !== 'block'
    || normalized.owner !== actor
    || normalized.network_effect !== 'none'
    || normalized.authority_effect !== 'none'
    || normalized.recommendation_effect !== 'none'
    || event.subject !== normalized.preference_id
    || canonicalJson(normalized.detail) !== canonicalJson(payload.detail)
  ) {
    throw new ValidationError('remote social abuse preference authority or effect boundary is invalid');
  }
  return Object.freeze(normalized);
}

function validatePreferenceClearedEvent(eventInput, actor) {
  const event = assertPlainObject(eventInput, 'remote social preference clear event');
  const payload = assertPlainObject(event.payload, 'remote social preference clear payload');
  const required = [
    'schema', 'preference_id', 'owner', 'action', 'network_effect',
    'authority_effect', 'recommendation_effect'
  ];
  exactKeys(payload, required, 'remote social preference clear payload');
  const normalized = {
    schema: payload.schema,
    preference_id: id(payload.preference_id, 'remote social abuse preference_id'),
    owner: id(payload.owner, 'remote social abuse preference owner'),
    action: payload.action,
    network_effect: payload.network_effect,
    authority_effect: payload.authority_effect,
    recommendation_effect: payload.recommendation_effect
  };
  if (
    normalized.schema !== REMOTE_SOCIAL_ABUSE_PREFERENCE_SCHEMA
    || (normalized.action !== 'mute' && normalized.action !== 'block')
    || normalized.owner !== actor
    || normalized.network_effect !== 'none'
    || normalized.authority_effect !== 'none'
    || normalized.recommendation_effect !== 'none'
    || event.subject !== normalized.preference_id
  ) {
    throw new ValidationError('remote social abuse preference clear boundary is invalid');
  }
  return Object.freeze(normalized);
}

function validateReportEvent(eventInput, actor) {
  const event = assertPlainObject(eventInput, 'remote social report event');
  const payload = assertPlainObject(event.payload, 'remote social report payload');
  const required = [
    'schema', 'report_id', 'owner', 'target_kind', 'target_observation_id',
    'exporter_key_id', 'target_digest', 'report', 'network_effect',
    'authority_effect', 'recommendation_effect', 'adjudication_effect'
  ];
  exactKeys(payload, required, 'remote social report payload');
  const report = assertPlainObject(payload.report, 'remote social report detail');
  const reportRequired = [
    'reason_code', 'note', 'private_local_record', 'content_truth_claimed',
    'legal_identity_claimed', 'personal_authorship_claimed', 'adjudicated',
    'visibility_effect'
  ];
  exactKeys(report, reportRequired, 'remote social report detail');
  const detail = normalizeDetail(
    { reasonCode: report.reason_code, note: report.note },
    'remote social report'
  );
  const normalizedReport = Object.freeze({
    ...detail,
    adjudicated: report.adjudicated,
    visibility_effect: report.visibility_effect
  });
  const normalized = {
    schema: payload.schema,
    report_id: id(payload.report_id, 'remote social report_id'),
    owner: id(payload.owner, 'remote social report owner'),
    target_kind: payload.target_kind,
    target_observation_id: id(
      payload.target_observation_id,
      'remote social report target_observation_id'
    ),
    exporter_key_id: digest(payload.exporter_key_id, 'remote social report exporter_key_id'),
    target_digest: digest(payload.target_digest, 'remote social report target_digest'),
    report: normalizedReport,
    network_effect: payload.network_effect,
    authority_effect: payload.authority_effect,
    recommendation_effect: payload.recommendation_effect,
    adjudication_effect: payload.adjudication_effect
  };
  if (
    normalized.schema !== REMOTE_SOCIAL_REPORT_SCHEMA
    || !['persona', 'publication'].includes(normalized.target_kind)
    || normalized.owner !== actor
    || normalized.report.adjudicated !== false
    || normalized.report.visibility_effect !== 'none'
    || normalized.network_effect !== 'none'
    || normalized.authority_effect !== 'none'
    || normalized.recommendation_effect !== 'none'
    || normalized.adjudication_effect !== 'none'
    || event.subject !== normalized.report_id
    || canonicalJson(normalized.report) !== canonicalJson(report)
  ) {
    throw new ValidationError('remote social report authority or adjudication boundary is invalid');
  }
  return Object.freeze(normalized);
}

function validateQuarantineSetEvent(eventInput, actor) {
  const event = assertPlainObject(eventInput, 'remote social quarantine event');
  const payload = assertPlainObject(event.payload, 'remote social quarantine payload');
  const required = [
    'schema', 'quarantine_id', 'owner', 'target_kind', 'target_digest', 'detail',
    'network_effect', 'authority_effect', 'recommendation_effect', 'adjudication_effect'
  ];
  exactKeys(payload, required, 'remote social quarantine payload');
  const normalized = {
    schema: payload.schema,
    quarantine_id: id(payload.quarantine_id, 'remote social quarantine_id'),
    owner: id(payload.owner, 'remote social quarantine owner'),
    target_kind: payload.target_kind,
    target_digest: digest(payload.target_digest, 'remote social quarantine target_digest'),
    detail: normalizeQuarantineDetail(payload.detail, payload.target_kind),
    network_effect: payload.network_effect,
    authority_effect: payload.authority_effect,
    recommendation_effect: payload.recommendation_effect,
    adjudication_effect: payload.adjudication_effect
  };
  if (
    normalized.schema !== REMOTE_SOCIAL_QUARANTINE_SCHEMA
    || !['exporter', 'source'].includes(normalized.target_kind)
    || normalized.owner !== actor
    || normalized.network_effect !== 'none'
    || normalized.authority_effect !== 'none'
    || normalized.recommendation_effect !== 'none'
    || normalized.adjudication_effect !== 'none'
    || event.subject !== normalized.quarantine_id
    || canonicalJson(normalized.detail) !== canonicalJson(payload.detail)
  ) {
    throw new ValidationError('remote social quarantine authority or effect boundary is invalid');
  }
  if (
    normalized.target_kind === 'source'
    && sha256(normalized.detail.source_origin) !== normalized.target_digest
  ) {
    throw new ValidationError('remote social source quarantine digest does not match source origin');
  }
  return Object.freeze(normalized);
}

function validateQuarantineReleasedEvent(eventInput, actor) {
  const event = assertPlainObject(eventInput, 'remote social quarantine release event');
  const payload = assertPlainObject(event.payload, 'remote social quarantine release payload');
  const required = [
    'schema', 'quarantine_id', 'owner', 'target_kind', 'target_digest',
    'network_effect', 'authority_effect', 'recommendation_effect', 'adjudication_effect'
  ];
  exactKeys(payload, required, 'remote social quarantine release payload');
  const normalized = {
    schema: payload.schema,
    quarantine_id: id(payload.quarantine_id, 'remote social quarantine_id'),
    owner: id(payload.owner, 'remote social quarantine owner'),
    target_kind: payload.target_kind,
    target_digest: digest(payload.target_digest, 'remote social quarantine target_digest'),
    network_effect: payload.network_effect,
    authority_effect: payload.authority_effect,
    recommendation_effect: payload.recommendation_effect,
    adjudication_effect: payload.adjudication_effect
  };
  if (
    normalized.schema !== REMOTE_SOCIAL_QUARANTINE_SCHEMA
    || !['exporter', 'source'].includes(normalized.target_kind)
    || normalized.owner !== actor
    || normalized.network_effect !== 'none'
    || normalized.authority_effect !== 'none'
    || normalized.recommendation_effect !== 'none'
    || normalized.adjudication_effect !== 'none'
    || event.subject !== normalized.quarantine_id
  ) {
    throw new ValidationError('remote social quarantine release boundary is invalid');
  }
  return Object.freeze(normalized);
}

function followKey(exporterKeyId, personaProjectionDigest) {
  return `${exporterKeyId}:${personaProjectionDigest}`;
}

function emptyGuardedFollowing(owner) {
  return Object.freeze({
    schema: 'axiom-remote-social-following.v1',
    owner,
    ordering: 'chronological-desc',
    ranking_effect: 'none',
    recommendation_effect: 'none',
    transport_effect: 'none',
    network_effect: 'none',
    remote_observation_only: true,
    abuse_controls_applied: true,
    items: Object.freeze([]),
    truncated: false
  });
}
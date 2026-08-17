import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import { RemoteSocialAdmissionGridStore } from './remote-social-admission-store.mjs';
import { runRemoteSocialFollowingMigrations } from './remote-social-following-migrations.mjs';

export const REMOTE_SOCIAL_FOLLOW_SCHEMA = 'axiom-remote-social-follow.v1';
export const REMOTE_SOCIAL_UNFOLLOW_SCHEMA = 'axiom-remote-social-unfollow.v1';
export const REMOTE_SOCIAL_FOLLOWING_SCHEMA = 'axiom-remote-social-following.v1';
export const REMOTE_SOCIAL_FOLLOWED_EVENT = 'remote.social.followed';
export const REMOTE_SOCIAL_UNFOLLOWED_EVENT = 'remote.social.unfollowed';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const TRUST_LABEL = /^[a-z][a-z0-9._-]{0,63}$/;
const MAX_FOLLOWS = 500;
const MAX_OBSERVATION_SCAN = 2_000;
const FOLLOWING_PROTECTED_COLUMN_MAPPINGS = Object.freeze([
  ['remote_social_follows', 'follow_id', ['trust_json']]
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

function tableExists(db, table) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

function migrateFollowingProtectedMapping(store) {
  for (const [table, keyExpression, columns] of FOLLOWING_PROTECTED_COLUMN_MAPPINGS) {
    if (!tableExists(store.db, table)) continue;
    store.transaction(() => {
      const rows = store.db.prepare(
        `SELECT ${keyExpression} AS protection_key, ${columns.join(', ')} FROM ${table}`
      ).all();
      for (const row of rows) {
        for (const column of columns) {
          const serialized = row[column];
          if (serialized === null || serialized === undefined) continue;
          if (store.protector.isProtected(serialized)) {
            store.openJson(table, column, row.protection_key, serialized);
            continue;
          }
          let value;
          try {
            value = JSON.parse(serialized);
          } catch {
            throw new ValidationError(`Legacy ${table}.${column} value is not valid JSON`);
          }
          store.db.prepare(
            `UPDATE ${table} SET ${column} = ? WHERE ${keyExpression} = ?`
          ).run(
            store.protectJson(table, column, row.protection_key, value),
            row.protection_key
          );
        }
      }
    });
  }
}

export class RemoteSocialFollowingGridStore extends RemoteSocialAdmissionGridStore {
  initialize() {
    this.remoteSocialFollowingReady = false;
    super.initialize();
    this.remoteSocialFollowingMigrations = runRemoteSocialFollowingMigrations(this.db);
    migrateFollowingProtectedMapping(this);
    this.remoteSocialFollowingReady = true;
    this.rebuildRemoteSocialFollowingState();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      remote_social_following_schema_version:
        this.remoteSocialFollowingMigrations?.version ?? 0,
      remote_social_following_runtime: 'private-chronological-projection-laboratory'
    };
  }

  migrateProtectedColumns() {
    super.migrateProtectedColumns();
    if (this.remoteSocialFollowingReady) migrateFollowingProtectedMapping(this);
  }

  appendEvents({ traceId, actor, events }) {
    if (Array.isArray(events)) {
      for (const event of events) {
        if (event?.kind === REMOTE_SOCIAL_FOLLOWED_EVENT) {
          validateFollowEvent(event, actor);
        } else if (event?.kind === REMOTE_SOCIAL_UNFOLLOWED_EVENT) {
          validateUnfollowEvent(event, actor);
        }
      }
    }
    return super.appendEvents({ traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (!this.remoteSocialFollowingReady) return;
    if (event.kind === REMOTE_SOCIAL_FOLLOWED_EVENT) {
      this.materializeFollowed(event);
    } else if (event.kind === REMOTE_SOCIAL_UNFOLLOWED_EVENT) {
      this.materializeUnfollowed(event);
    }
  }

  rebuildRemoteSocialFollowingState() {
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE kind IN (?, ?)
      ORDER BY seq
    `).all(REMOTE_SOCIAL_FOLLOWED_EVENT, REMOTE_SOCIAL_UNFOLLOWED_EVENT);
    this.transaction(() => {
      this.db.exec('DELETE FROM remote_social_follows');
      for (const row of rows) {
        const event = this.decodeEventRow(row);
        if (event.kind === REMOTE_SOCIAL_FOLLOWED_EVENT) {
          this.materializeFollowed(event);
        } else {
          this.materializeUnfollowed(event);
        }
      }
    });
  }

  followRemotePersona({
    owner,
    personaObservationId,
    trustLabel,
    traceId
  }) {
    const recipient = id(owner, 'remote social follow owner');
    id(traceId, 'remote social follow trace_id');
    const observationId = id(
      personaObservationId,
      'remote social follow persona_observation_id'
    );
    const observation = this.db.prepare(`
      SELECT * FROM remote_social_observations
      WHERE owner = ? AND observation_id = ?
    `).get(recipient, observationId);
    if (!observation || observation.object_kind !== 'persona') {
      throw new AxiomError(
        'remote_social_persona_observation_not_found',
        'An admitted remote persona observation is required before following',
        404
      );
    }
    const persona = this.decodeObservation(observation);
    const label = assertString(trustLabel, 'remote social follow trust_label', {
      min: 1,
      max: 64,
      pattern: TRUST_LABEL
    });
    const followId = `remote_follow_${digestObject({
      schema: REMOTE_SOCIAL_FOLLOW_SCHEMA,
      owner: recipient,
      exporter_key_id: persona.exporter_key_id,
      persona_projection_digest: persona.object_digest
    })}`;
    const trust = trustRecord(label);
    const existing = this.db.prepare(`
      SELECT * FROM remote_social_follows WHERE follow_id = ?
    `).get(followId);
    if (existing?.status === 'following') {
      const decoded = this.decodeFollow(existing);
      if (canonicalJson(decoded.trust_json) !== canonicalJson(trust)) {
        throw new AxiomError(
          'remote_social_follow_conflict',
          'The remote persona is already followed under a different trust label',
          409
        );
      }
      return decoded;
    }

    this.appendEvents({
      traceId,
      actor: recipient,
      events: [{
        kind: REMOTE_SOCIAL_FOLLOWED_EVENT,
        subject: followId,
        payload: {
          schema: REMOTE_SOCIAL_FOLLOW_SCHEMA,
          follow_id: followId,
          owner: recipient,
          exporter_grid_id: persona.exporter_grid_id,
          exporter_key_id: persona.exporter_key_id,
          persona_projection_digest: persona.object_digest,
          persona_observation_id: persona.observation_id,
          trust,
          network_effect: 'none',
          recommendation_effect: 'none',
          authority_effect: 'none'
        }
      }]
    });
    return this.getRemoteSocialFollow(recipient, followId);
  }

  unfollowRemotePersona({ owner, followId, traceId }) {
    const recipient = id(owner, 'remote social unfollow owner');
    const follow = id(followId, 'remote social unfollow follow_id');
    id(traceId, 'remote social unfollow trace_id');
    const existing = this.db.prepare(`
      SELECT * FROM remote_social_follows
      WHERE owner = ? AND follow_id = ?
    `).get(recipient, follow);
    if (!existing) {
      throw new AxiomError(
        'remote_social_follow_not_found',
        'Remote social follow record was not found',
        404
      );
    }
    if (existing.status === 'unfollowed') return this.decodeFollow(existing);
    this.appendEvents({
      traceId,
      actor: recipient,
      events: [{
        kind: REMOTE_SOCIAL_UNFOLLOWED_EVENT,
        subject: follow,
        payload: {
          schema: REMOTE_SOCIAL_UNFOLLOW_SCHEMA,
          follow_id: follow,
          owner: recipient,
          network_effect: 'none',
          recommendation_effect: 'none',
          authority_effect: 'none'
        }
      }]
    });
    return this.getRemoteSocialFollow(recipient, follow);
  }

  materializeFollowed(event) {
    const payload = validateFollowEvent(event, event.actor);
    const observation = this.db.prepare(`
      SELECT * FROM remote_social_observations
      WHERE owner = ? AND observation_id = ?
    `).get(payload.owner, payload.persona_observation_id);
    if (
      !observation
      || observation.object_kind !== 'persona'
      || observation.exporter_grid_id !== payload.exporter_grid_id
      || observation.exporter_key_id !== payload.exporter_key_id
      || observation.object_digest !== payload.persona_projection_digest
    ) {
      throw new ValidationError('remote social follow does not match an admitted persona observation');
    }
    const existing = this.db.prepare(`
      SELECT * FROM remote_social_follows WHERE follow_id = ?
    `).get(payload.follow_id);
    if (existing?.status === 'following') {
      const existingTrust = this.openJson(
        'remote_social_follows',
        'trust_json',
        existing.follow_id,
        existing.trust_json
      );
      if (canonicalJson(existingTrust) !== canonicalJson(payload.trust)) {
        throw new ValidationError('active remote social follow trust label changed without a transition');
      }
      return;
    }
    if (existing) {
      this.db.prepare(`
        UPDATE remote_social_follows
        SET persona_observation_id = ?, trust_json = ?, status = 'following',
            followed_at = ?, unfollowed_at = NULL
        WHERE follow_id = ?
      `).run(
        payload.persona_observation_id,
        this.protectJson(
          'remote_social_follows',
          'trust_json',
          payload.follow_id,
          payload.trust
        ),
        event.occurred_at,
        payload.follow_id
      );
      return;
    }
    this.db.prepare(`
      INSERT INTO remote_social_follows(
        follow_id, owner, exporter_grid_id, exporter_key_id,
        persona_projection_digest, persona_observation_id, trust_json,
        status, followed_at, unfollowed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'following', ?, NULL)
    `).run(
      payload.follow_id,
      payload.owner,
      payload.exporter_grid_id,
      payload.exporter_key_id,
      payload.persona_projection_digest,
      payload.persona_observation_id,
      this.protectJson(
        'remote_social_follows',
        'trust_json',
        payload.follow_id,
        payload.trust
      ),
      event.occurred_at
    );
  }

  materializeUnfollowed(event) {
    const payload = validateUnfollowEvent(event, event.actor);
    const existing = this.db.prepare(`
      SELECT status FROM remote_social_follows
      WHERE owner = ? AND follow_id = ?
    `).get(payload.owner, payload.follow_id);
    if (!existing) {
      throw new ValidationError('remote social unfollow target does not exist');
    }
    if (existing.status === 'unfollowed') return;
    this.db.prepare(`
      UPDATE remote_social_follows
      SET status = 'unfollowed', unfollowed_at = ?
      WHERE owner = ? AND follow_id = ?
    `).run(event.occurred_at, payload.owner, payload.follow_id);
  }

  getRemoteSocialFollow(owner, followId) {
    const recipient = id(owner, 'remote social follow owner');
    const follow = id(followId, 'remote social follow_id');
    const row = this.db.prepare(`
      SELECT * FROM remote_social_follows
      WHERE owner = ? AND follow_id = ?
    `).get(recipient, follow);
    if (!row) {
      throw new AxiomError('remote_social_follow_not_found', 'Remote social follow was not found', 404);
    }
    return this.decodeFollow(row);
  }

  listRemoteSocialFollows(owner, { limit = 100 } = {}) {
    const recipient = id(owner, 'remote social follow owner');
    const safeLimit = boundedInteger(limit, 'remote social follow limit', 1, 200);
    const rows = this.db.prepare(`
      SELECT * FROM remote_social_follows
      WHERE owner = ? ORDER BY followed_at DESC, follow_id DESC LIMIT ?
    `).all(recipient, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return {
      follows: rows.map(row => this.decodeFollow(row)),
      truncated
    };
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
    if (!follows.length) return emptyFollowing(recipient);

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
        return Object.freeze({
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
        });
      })
      .sort((left, right) => (
        right.publication.created_at.localeCompare(left.publication.created_at)
        || right.publication.projection_digest.localeCompare(left.publication.projection_digest)
      ));
    const truncated = items.length > safeLimit;
    return Object.freeze({
      schema: REMOTE_SOCIAL_FOLLOWING_SCHEMA,
      owner: recipient,
      ordering: 'chronological-desc',
      ranking_effect: 'none',
      recommendation_effect: 'none',
      transport_effect: 'none',
      network_effect: 'none',
      remote_observation_only: true,
      items: Object.freeze(items.slice(0, safeLimit)),
      truncated
    });
  }

  decodeFollow(row) {
    return Object.freeze({
      schema: REMOTE_SOCIAL_FOLLOW_SCHEMA,
      follow_id: row.follow_id,
      owner: row.owner,
      exporter_grid_id: row.exporter_grid_id,
      exporter_key_id: row.exporter_key_id,
      persona_projection_digest: row.persona_projection_digest,
      persona_observation_id: row.persona_observation_id,
      trust_json: this.openJson(
        'remote_social_follows',
        'trust_json',
        row.follow_id,
        row.trust_json
      ),
      status: row.status,
      followed_at: row.followed_at,
      unfollowed_at: row.unfollowed_at,
      private_local_preference: true,
      network_effect: 'none',
      recommendation_effect: 'none'
    });
  }
}

function trustRecord(label) {
  return Object.freeze({
    owner_trust_label: label,
    trust_scope: 'exporter-attestation-only',
    content_truth_claimed: false,
    legal_identity_claimed: false,
    actor_authorship_claimed: false
  });
}

function validateFollowEvent(eventInput, actor) {
  const event = assertPlainObject(eventInput, 'remote social follow event');
  const payload = assertPlainObject(event.payload, 'remote social follow payload');
  const required = [
    'schema', 'follow_id', 'owner', 'exporter_grid_id', 'exporter_key_id',
    'persona_projection_digest', 'persona_observation_id', 'trust',
    'network_effect', 'recommendation_effect', 'authority_effect'
  ];
  exactKeys(payload, required, 'remote social follow payload');
  if (payload.schema !== REMOTE_SOCIAL_FOLLOW_SCHEMA) {
    throw new ValidationError('unsupported remote social follow schema');
  }
  const trust = normalizeTrust(payload.trust);
  const normalized = {
    schema: REMOTE_SOCIAL_FOLLOW_SCHEMA,
    follow_id: id(payload.follow_id, 'remote social follow follow_id'),
    owner: id(payload.owner, 'remote social follow owner'),
    exporter_grid_id: id(payload.exporter_grid_id, 'remote social follow exporter_grid_id'),
    exporter_key_id: digest(payload.exporter_key_id, 'remote social follow exporter_key_id'),
    persona_projection_digest: digest(
      payload.persona_projection_digest,
      'remote social follow persona_projection_digest'
    ),
    persona_observation_id: id(
      payload.persona_observation_id,
      'remote social follow persona_observation_id'
    ),
    trust,
    network_effect: payload.network_effect,
    recommendation_effect: payload.recommendation_effect,
    authority_effect: payload.authority_effect
  };
  if (
    normalized.owner !== actor
    || normalized.network_effect !== 'none'
    || normalized.recommendation_effect !== 'none'
    || normalized.authority_effect !== 'none'
    || event.subject !== normalized.follow_id
  ) {
    throw new ValidationError('remote social follow authority or effect boundary is invalid');
  }
  return Object.freeze(normalized);
}

function validateUnfollowEvent(eventInput, actor) {
  const event = assertPlainObject(eventInput, 'remote social unfollow event');
  const payload = assertPlainObject(event.payload, 'remote social unfollow payload');
  const required = [
    'schema', 'follow_id', 'owner', 'network_effect',
    'recommendation_effect', 'authority_effect'
  ];
  exactKeys(payload, required, 'remote social unfollow payload');
  if (payload.schema !== REMOTE_SOCIAL_UNFOLLOW_SCHEMA) {
    throw new ValidationError('unsupported remote social unfollow schema');
  }
  const normalized = {
    schema: REMOTE_SOCIAL_UNFOLLOW_SCHEMA,
    follow_id: id(payload.follow_id, 'remote social unfollow follow_id'),
    owner: id(payload.owner, 'remote social unfollow owner'),
    network_effect: payload.network_effect,
    recommendation_effect: payload.recommendation_effect,
    authority_effect: payload.authority_effect
  };
  if (
    normalized.owner !== actor
    || normalized.network_effect !== 'none'
    || normalized.recommendation_effect !== 'none'
    || normalized.authority_effect !== 'none'
    || event.subject !== normalized.follow_id
  ) {
    throw new ValidationError('remote social unfollow authority or effect boundary is invalid');
  }
  return Object.freeze(normalized);
}

function normalizeTrust(input) {
  const value = assertPlainObject(input, 'remote social follow trust');
  const required = [
    'owner_trust_label', 'trust_scope', 'content_truth_claimed',
    'legal_identity_claimed', 'actor_authorship_claimed'
  ];
  exactKeys(value, required, 'remote social follow trust');
  const normalized = {
    owner_trust_label: assertString(value.owner_trust_label, 'remote social trust label', {
      min: 1,
      max: 64,
      pattern: TRUST_LABEL
    }),
    trust_scope: value.trust_scope,
    content_truth_claimed: value.content_truth_claimed,
    legal_identity_claimed: value.legal_identity_claimed,
    actor_authorship_claimed: value.actor_authorship_claimed
  };
  if (
    normalized.trust_scope !== 'exporter-attestation-only'
    || normalized.content_truth_claimed !== false
    || normalized.legal_identity_claimed !== false
    || normalized.actor_authorship_claimed !== false
  ) {
    throw new ValidationError('remote social trust cannot exceed exporter-attestation scope');
  }
  return Object.freeze(normalized);
}

function exactKeys(value, required, label) {
  if (Object.keys(value).length !== required.length || required.some(key => !(key in value))) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function followKey(exporterKeyId, personaProjectionDigest) {
  return `${exporterKeyId}:${personaProjectionDigest}`;
}

function emptyFollowing(owner) {
  return Object.freeze({
    schema: REMOTE_SOCIAL_FOLLOWING_SCHEMA,
    owner,
    ordering: 'chronological-desc',
    ranking_effect: 'none',
    recommendation_effect: 'none',
    transport_effect: 'none',
    network_effect: 'none',
    remote_observation_only: true,
    items: Object.freeze([]),
    truncated: false
  });
}

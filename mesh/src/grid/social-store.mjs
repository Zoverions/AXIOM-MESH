import {
  AxiomError,
  ValidationError,
  canonicalJson
} from '../lib/canonical.mjs';
import { GridStore } from './store.mjs';
import {
  SOCIAL_GRID_EVENT_KINDS,
  normalizeActorCreatedPayload,
  normalizePersonaSavedPayload,
  normalizePublicationRetractedPayload,
  normalizePublicationSavedPayload,
  validateSocialGridEvent
} from './social-state.mjs';
import { validateSocialPublicationPersonaBinding } from '../lib/social-publication.mjs';

const SOCIAL_PROTECTED_COLUMN_MAPPINGS = Object.freeze([
  ['actor_states', 'actor_id', ['state_json']],
  ['publication_personas', 'persona_id', ['protected_json', 'public_projection_json']],
  ['social_publications', 'projection_digest', [
    'projection_json',
    'access_envelope_json',
    'access_use_json'
  ]],
  ['social_transitions', 'transition_digest', ['transition_json']]
]);

function boundedInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function migrateProtectedMapping(store, mappings) {
  store.transaction(() => {
    for (const [table, keyExpression, columns] of mappings) {
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
    }
  });
}

export function reencryptSocialProtectedColumns({ db, sourceProtector, targetProtector }) {
  if (!db || !sourceProtector || !targetProtector) {
    throw new ValidationError('Social Grid re-encryption dependencies are missing');
  }
  let values = 0;
  const tables = {};
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [table, keyExpression, columns] of SOCIAL_PROTECTED_COLUMN_MAPPINGS) {
      let tableValues = 0;
      const rows = db.prepare(
        `SELECT ${keyExpression} AS protection_key, ${columns.join(', ')} FROM ${table}`
      ).all();
      for (const row of rows) {
        for (const column of columns) {
          const serialized = row[column];
          if (serialized === null || serialized === undefined) continue;
          const context = `axiom:${table}.${column}:${row.protection_key}`;
          const value = sourceProtector.open(serialized, context);
          const reencrypted = targetProtector.seal(value, context);
          targetProtector.open(reencrypted, context);
          db.prepare(
            `UPDATE ${table} SET ${column} = ? WHERE ${keyExpression} = ?`
          ).run(reencrypted, row.protection_key);
          values += 1;
          tableValues += 1;
        }
      }
      tables[table] = tableValues;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { protected_values: values, tables };
}

export class SocialGridStore extends GridStore {
  migrateProtectedColumns() {
    super.migrateProtectedColumns();
    migrateProtectedMapping(this, SOCIAL_PROTECTED_COLUMN_MAPPINGS);
  }

  rebuildMaterializedState() {
    this.transaction(() => {
      for (const table of [
        'social_transitions',
        'social_publications',
        'publication_personas',
        'actor_states'
      ]) {
        this.db.exec(`DELETE FROM ${table}`);
      }
    });
    return super.rebuildMaterializedState();
  }

  appendEvents({ traceId, actor, events }) {
    if (Array.isArray(events)) {
      const preflightNow = new Date().toISOString();
      for (const event of events) {
        validateSocialGridEvent(event, actor, { now: preflightNow });
      }
    }
    return super.appendEvents({ traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (!Object.values(SOCIAL_GRID_EVENT_KINDS).includes(event.kind)) return;
    const payload = validateSocialGridEvent(event, event.actor, { now: event.occurred_at });

    if (event.kind === SOCIAL_GRID_EVENT_KINDS.actorCreated) {
      this.materializeActorCreated(event, payload);
    } else if (event.kind === SOCIAL_GRID_EVENT_KINDS.personaSaved) {
      this.materializePersonaSaved(event, payload);
    } else if (event.kind === SOCIAL_GRID_EVENT_KINDS.publicationSaved) {
      this.materializePublicationSaved(event, payload);
    } else {
      this.materializePublicationRetracted(event, payload);
    }
  }

  materializeActorCreated(event, payloadRaw) {
    const payload = normalizeActorCreatedPayload(payloadRaw);
    this.db.prepare(`
      INSERT INTO actor_states(
        actor_id, owner, state_digest, state_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.actor_state.actor_id,
      payload.owner,
      payload.actor_state_digest,
      this.protectJson(
        'actor_states',
        'state_json',
        payload.actor_state.actor_id,
        payload.actor_state
      ),
      payload.actor_state.lifecycle_state,
      event.occurred_at,
      event.occurred_at
    );
  }

  materializePersonaSaved(event, payloadRaw) {
    const payload = normalizePersonaSavedPayload(payloadRaw);
    const actor = this.db.prepare(`
      SELECT actor_id, owner, status FROM actor_states
      WHERE actor_id = ? AND owner = ?
    `).get(payload.actor_id, payload.owner);
    if (!actor) {
      throw new AxiomError('actor_custody_not_found', 'Local actor custody was not found', 409);
    }
    if (actor.status !== 'active' && actor.status !== 'recovered') {
      throw new AxiomError('actor_custody_inactive', 'Local actor custody is not active', 409);
    }
    if (payload.protected_persona.status !== 'active') {
      throw new ValidationError('new local publication persona must be active');
    }
    this.db.prepare(`
      INSERT INTO publication_personas(
        persona_id, owner, actor_id, public_projection_digest,
        protected_json, public_projection_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.protected_persona.persona_id,
      payload.owner,
      payload.actor_id,
      payload.public_projection.projection_digest,
      this.protectJson(
        'publication_personas',
        'protected_json',
        payload.protected_persona.persona_id,
        payload.protected_persona
      ),
      this.protectJson(
        'publication_personas',
        'public_projection_json',
        payload.protected_persona.persona_id,
        payload.public_projection
      ),
      payload.protected_persona.status,
      event.occurred_at,
      event.occurred_at
    );
  }

  materializePublicationSaved(event, payloadRaw) {
    const payload = normalizePublicationSavedPayload(payloadRaw, { now: event.occurred_at });
    const actor = this.db.prepare(`
      SELECT actor_id, owner, status FROM actor_states
      WHERE actor_id = ? AND owner = ?
    `).get(payload.actor_id, payload.owner);
    if (!actor || !['active', 'recovered'].includes(actor.status)) {
      throw new AxiomError('actor_custody_unavailable', 'Active local actor custody was not found', 409);
    }
    const personaRow = this.db.prepare(`
      SELECT * FROM publication_personas
      WHERE persona_id = ? AND owner = ? AND actor_id = ? AND status = 'active'
    `).get(payload.publication.persona_id, payload.owner, payload.actor_id);
    if (!personaRow) {
      throw new AxiomError('publication_persona_not_found', 'Active local publication persona was not found', 409);
    }
    const protectedPersona = this.openJson(
      'publication_personas',
      'protected_json',
      personaRow.persona_id,
      personaRow.protected_json
    );
    validateSocialPublicationPersonaBinding(payload.publication, protectedPersona);
    if (personaRow.public_projection_digest !== payload.publication.persona_projection_digest) {
      throw new ValidationError('publication persona projection digest does not match persisted persona');
    }

    if (payload.publication.supersedes_digest !== null) {
      const previous = this.db.prepare(`
        SELECT * FROM social_publications
        WHERE projection_digest = ? AND owner = ? AND actor_id = ?
      `).get(
        payload.publication.supersedes_digest,
        payload.owner,
        payload.actor_id
      );
      if (!previous || previous.status !== 'active') {
        throw new AxiomError(
          'social_supersession_target_unavailable',
          'Superseded publication is not the active locally custodied projection',
          409
        );
      }
      if (
        previous.persona_id !== payload.publication.persona_id
        || previous.persona_projection_digest !== payload.publication.persona_projection_digest
      ) {
        throw new ValidationError('social supersession cannot change persona binding');
      }
      this.db.prepare(`
        UPDATE social_publications SET status = 'superseded'
        WHERE projection_digest = ?
      `).run(previous.projection_digest);
    }

    this.db.prepare(`
      INSERT INTO social_publications(
        projection_digest, owner, actor_id, publication_id, persona_id,
        persona_projection_digest, supersedes_digest, projection_json,
        access_envelope_json, access_use_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      payload.publication.projection_digest,
      payload.owner,
      payload.actor_id,
      payload.publication.publication_id,
      payload.publication.persona_id,
      payload.publication.persona_projection_digest,
      payload.publication.supersedes_digest,
      this.protectJson(
        'social_publications',
        'projection_json',
        payload.publication.projection_digest,
        payload.publication
      ),
      this.protectJson(
        'social_publications',
        'access_envelope_json',
        payload.publication.projection_digest,
        payload.state_access_envelope
      ),
      this.protectJson(
        'social_publications',
        'access_use_json',
        payload.publication.projection_digest,
        payload.state_access_use
      ),
      event.occurred_at
    );
  }

  materializePublicationRetracted(event, payloadRaw) {
    const payload = normalizePublicationRetractedPayload(payloadRaw);
    const publication = this.db.prepare(`
      SELECT * FROM social_publications
      WHERE projection_digest = ? AND owner = ? AND actor_id = ?
    `).get(
      payload.transition.publication_digest,
      payload.owner,
      payload.actor_id
    );
    if (!publication || publication.status !== 'active') {
      throw new AxiomError(
        'social_retraction_target_unavailable',
        'Retraction target is not an active locally custodied publication',
        409
      );
    }
    if (
      publication.persona_id !== payload.transition.persona_id
      || publication.persona_projection_digest !== payload.transition.persona_projection_digest
    ) {
      throw new ValidationError('social retraction does not match persisted persona binding');
    }
    this.db.prepare(`
      INSERT INTO social_transitions(
        transition_digest, owner, actor_id, publication_digest,
        persona_id, transition_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.transition.transition_digest,
      payload.owner,
      payload.actor_id,
      payload.transition.publication_digest,
      payload.transition.persona_id,
      this.protectJson(
        'social_transitions',
        'transition_json',
        payload.transition.transition_digest,
        payload.transition
      ),
      event.occurred_at
    );
    this.db.prepare(`
      UPDATE social_publications SET status = 'retracted'
      WHERE projection_digest = ?
    `).run(payload.transition.publication_digest);
  }

  getActorState(owner, actorId) {
    const row = this.db.prepare(`
      SELECT * FROM actor_states WHERE owner = ? AND actor_id = ?
    `).get(owner, actorId);
    if (!row) throw new AxiomError('actor_custody_not_found', 'Local actor custody was not found', 404);
    return this.decodeProtectedRow('actor_states', 'actor_id', row, ['state_json']);
  }

  listActorStates(owner, { limit = 20 } = {}) {
    const safeLimit = boundedInteger(limit, 'actor state limit', 1, 20);
    const rows = this.db.prepare(`
      SELECT * FROM actor_states
      WHERE owner = ? ORDER BY created_at, actor_id LIMIT ?
    `).all(owner, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return {
      actors: rows.map(row => this.decodeProtectedRow(
        'actor_states',
        'actor_id',
        row,
        ['state_json']
      )),
      truncated
    };
  }

  getPublicationPersona(owner, personaId) {
    const row = this.db.prepare(`
      SELECT * FROM publication_personas WHERE owner = ? AND persona_id = ?
    `).get(owner, personaId);
    if (!row) throw new AxiomError('publication_persona_not_found', 'Publication persona was not found', 404);
    return this.decodeProtectedRow(
      'publication_personas',
      'persona_id',
      row,
      ['protected_json', 'public_projection_json']
    );
  }

  listPublicationPersonas(owner, { actorId, limit = 50 } = {}) {
    const safeLimit = boundedInteger(limit, 'publication persona limit', 1, 50);
    const rows = actorId
      ? this.db.prepare(`
          SELECT * FROM publication_personas
          WHERE owner = ? AND actor_id = ?
          ORDER BY created_at, persona_id LIMIT ?
        `).all(owner, actorId, safeLimit + 1)
      : this.db.prepare(`
          SELECT * FROM publication_personas
          WHERE owner = ? ORDER BY created_at, persona_id LIMIT ?
        `).all(owner, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return {
      personas: rows.map(row => this.decodeProtectedRow(
        'publication_personas',
        'persona_id',
        row,
        ['protected_json', 'public_projection_json']
      )),
      truncated
    };
  }

  listSocialCorpus(owner, { actorId, limit = 100 } = {}) {
    const safeLimit = boundedInteger(limit, 'social corpus limit', 1, 100);
    const rows = actorId
      ? this.db.prepare(`
          SELECT * FROM social_publications
          WHERE owner = ? AND actor_id = ?
          ORDER BY created_at DESC, projection_digest DESC LIMIT ?
        `).all(owner, actorId, safeLimit + 1)
      : this.db.prepare(`
          SELECT * FROM social_publications
          WHERE owner = ?
          ORDER BY created_at DESC, projection_digest DESC LIMIT ?
        `).all(owner, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    const publications = rows.map(row => this.decodeProtectedRow(
      'social_publications',
      'projection_digest',
      row,
      ['projection_json', 'access_envelope_json', 'access_use_json']
    ));
    const projectionDigests = publications.map(row => row.projection_digest);
    const transitions = projectionDigests.length
      ? this.db.prepare(`
          SELECT * FROM social_transitions
          WHERE owner = ? AND publication_digest IN (${projectionDigests.map(() => '?').join(', ')})
          ORDER BY created_at, transition_digest
        `).all(owner, ...projectionDigests).map(row => this.decodeProtectedRow(
          'social_transitions',
          'transition_digest',
          row,
          ['transition_json']
        ))
      : [];
    return { publications, transitions, truncated };
  }
}

export { SOCIAL_PROTECTED_COLUMN_MAPPINGS };

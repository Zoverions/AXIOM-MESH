import { sha256 } from '../lib/canonical.mjs';

const SOCIAL_LOCAL_CORPUS_SQL = `
  CREATE TABLE IF NOT EXISTS actor_states (
    actor_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    state_digest TEXT NOT NULL,
    state_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS publication_personas (
    persona_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    actor_id TEXT NOT NULL REFERENCES actor_states(actor_id),
    public_projection_digest TEXT NOT NULL,
    protected_json TEXT NOT NULL,
    public_projection_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS social_publications (
    projection_digest TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    actor_id TEXT NOT NULL REFERENCES actor_states(actor_id),
    publication_id TEXT NOT NULL,
    persona_id TEXT NOT NULL REFERENCES publication_personas(persona_id),
    persona_projection_digest TEXT NOT NULL,
    supersedes_digest TEXT REFERENCES social_publications(projection_digest),
    projection_json TEXT NOT NULL,
    access_envelope_json TEXT NOT NULL,
    access_use_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS social_transitions (
    transition_digest TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    actor_id TEXT NOT NULL REFERENCES actor_states(actor_id),
    publication_digest TEXT NOT NULL REFERENCES social_publications(projection_digest),
    persona_id TEXT NOT NULL REFERENCES publication_personas(persona_id),
    transition_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS actor_states_owner_idx
  ON actor_states(owner, created_at, actor_id);

  CREATE INDEX IF NOT EXISTS publication_personas_owner_idx
  ON publication_personas(owner, actor_id, created_at, persona_id);

  CREATE INDEX IF NOT EXISTS social_publications_owner_idx
  ON social_publications(owner, created_at DESC, projection_digest);

  CREATE INDEX IF NOT EXISTS social_publications_lineage_idx
  ON social_publications(owner, publication_id, created_at, projection_digest);

  CREATE INDEX IF NOT EXISTS social_transitions_owner_idx
  ON social_transitions(owner, created_at, transition_digest);
`;

const SOCIAL_INITIAL_CUSTODY_LIMITS_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS actor_states_single_owner_idx
  ON actor_states(owner);

  CREATE UNIQUE INDEX IF NOT EXISTS publication_personas_single_active_actor_idx
  ON publication_personas(owner, actor_id)
  WHERE status = 'active';
`;

const SOCIAL_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'actor-custody-and-local-social-corpus',
    source: SOCIAL_LOCAL_CORPUS_SQL,
    up(db) {
      db.exec(SOCIAL_LOCAL_CORPUS_SQL);
    }
  },
  {
    version: 2,
    name: 'initial-single-actor-and-active-persona-custody',
    source: SOCIAL_INITIAL_CUSTODY_LIMITS_SQL,
    up(db) {
      db.exec(SOCIAL_INITIAL_CUSTODY_LIMITS_SQL);
    }
  }
]);

export function runSocialMigrations(db, { now = () => new Date().toISOString() } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
  const known = new Map(SOCIAL_MIGRATIONS.map(item => [item.version, item]));
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM social_schema_migrations ORDER BY version
  `).all();
  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Social schema version ${row.version} is newer than this runtime`);
    }
    if (row.name !== migration.name || row.checksum !== socialMigrationChecksum(migration)) {
      throw new Error(`Social migration ${row.version} does not match the runtime checksum`);
    }
  }
  for (const migration of SOCIAL_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO social_schema_migrations(version, name, checksum, applied_at)
        VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        socialMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    version: SOCIAL_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM social_schema_migrations ORDER BY version
    `).all()
  };
}

export function socialMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { SOCIAL_MIGRATIONS };
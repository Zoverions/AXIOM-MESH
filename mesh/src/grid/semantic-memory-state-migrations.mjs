import { sha256 } from '../lib/canonical.mjs';

const SEMANTIC_MEMORY_STATE_SQL = `
  CREATE TABLE IF NOT EXISTS semantic_memory_provenance_state (
    object_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    content_digest TEXT NOT NULL,
    provenance_digest TEXT NOT NULL,
    authority_tier TEXT NOT NULL,
    review_state TEXT NOT NULL,
    record_json TEXT NOT NULL,
    source_event_id TEXT NOT NULL UNIQUE,
    source_seq INTEGER NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS semantic_memory_provenance_owner_idx
  ON semantic_memory_provenance_state(owner, updated_at DESC, object_id);

  CREATE INDEX IF NOT EXISTS semantic_memory_provenance_digest_idx
  ON semantic_memory_provenance_state(owner, provenance_digest);
`;

const SEMANTIC_MEMORY_STATE_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'semantic-memory-current-provenance-state',
    source: SEMANTIC_MEMORY_STATE_SQL,
    up(db) {
      db.exec(SEMANTIC_MEMORY_STATE_SQL);
    }
  }
]);

export function runSemanticMemoryStateMigrations(
  db,
  { now = () => new Date().toISOString() } = {}
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_memory_state_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const known = new Map(
    SEMANTIC_MEMORY_STATE_MIGRATIONS.map(item => [item.version, item])
  );
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM semantic_memory_state_schema_migrations
    ORDER BY version
  `).all();

  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(
        `Semantic memory state schema version ${row.version} is newer than this runtime`
      );
    }
    if (
      row.name !== migration.name
      || row.checksum !== semanticMemoryStateMigrationChecksum(migration)
    ) {
      throw new Error(
        `Semantic memory state migration ${row.version} does not match the runtime checksum`
      );
    }
  }

  for (const migration of SEMANTIC_MEMORY_STATE_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO semantic_memory_state_schema_migrations(
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        semanticMemoryStateMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    version: SEMANTIC_MEMORY_STATE_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM semantic_memory_state_schema_migrations
      ORDER BY version
    `).all()
  };
}

export function semanticMemoryStateMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { SEMANTIC_MEMORY_STATE_MIGRATIONS };

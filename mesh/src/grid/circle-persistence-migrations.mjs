import { sha256 } from '../lib/canonical.mjs';

const CIRCLE_PERSISTENCE_PROJECTION_SQL = `
  CREATE TABLE IF NOT EXISTS circle_persistence_heads (
    circle_id TEXT PRIMARY KEY,
    head_binding_digest TEXT NOT NULL,
    head_binding_id TEXT NOT NULL,
    head_record_type TEXT NOT NULL,
    head_record_id TEXT NOT NULL,
    event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id),
    event_seq INTEGER NOT NULL UNIQUE REFERENCES events(seq),
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS circle_persistence_heads_event_idx
  ON circle_persistence_heads(event_seq, event_id);
`;

const CIRCLE_PERSISTENCE_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'durable-circle-head-projection',
    source: CIRCLE_PERSISTENCE_PROJECTION_SQL,
    up(db) {
      db.exec(CIRCLE_PERSISTENCE_PROJECTION_SQL);
    }
  }
]);

export function runCirclePersistenceMigrations(
  db,
  { now = () => new Date().toISOString() } = {}
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS circle_persistence_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const known = new Map(CIRCLE_PERSISTENCE_MIGRATIONS.map(item => [item.version, item]));
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM circle_persistence_schema_migrations
    ORDER BY version
  `).all();

  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Circle persistence schema version ${row.version} is newer than this runtime`);
    }
    if (
      row.name !== migration.name
      || row.checksum !== circlePersistenceMigrationChecksum(migration)
    ) {
      throw new Error(`Circle persistence migration ${row.version} does not match the runtime checksum`);
    }
  }

  for (const migration of CIRCLE_PERSISTENCE_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO circle_persistence_schema_migrations(
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        circlePersistenceMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    version: CIRCLE_PERSISTENCE_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM circle_persistence_schema_migrations
      ORDER BY version
    `).all()
  };
}

export function circlePersistenceMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export {
  CIRCLE_PERSISTENCE_MIGRATIONS,
  CIRCLE_PERSISTENCE_PROJECTION_SQL
};

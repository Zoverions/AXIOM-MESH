import { sha256 } from '../lib/canonical.mjs';

const SOVEREIGN_INFORMATION_SQL = `
  CREATE TABLE IF NOT EXISTS siea_objects (
    storage_id TEXT PRIMARY KEY,
    object_kind TEXT NOT NULL,
    object_json TEXT NOT NULL,
    object_digest TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS siea_objects_kind_status_idx
  ON siea_objects(object_kind, lifecycle_status, updated_at);
`;

const SOVEREIGN_INFORMATION_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'sovereign-information-materialized-state',
    source: SOVEREIGN_INFORMATION_SQL,
    up(db) {
      db.exec(SOVEREIGN_INFORMATION_SQL);
    }
  }
]);

export function runSovereignInformationMigrations(db, { now = () => new Date().toISOString() } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sovereign_information_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
  const known = new Map(SOVEREIGN_INFORMATION_MIGRATIONS.map(item => [item.version, item]));
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM sovereign_information_schema_migrations ORDER BY version
  `).all();
  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Sovereign information schema version ${row.version} is newer than this runtime`);
    }
    if (row.name !== migration.name || row.checksum !== sovereignInformationMigrationChecksum(migration)) {
      throw new Error(`Sovereign information migration ${row.version} does not match the runtime checksum`);
    }
  }
  for (const migration of SOVEREIGN_INFORMATION_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO sovereign_information_schema_migrations(version, name, checksum, applied_at)
        VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        sovereignInformationMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    version: SOVEREIGN_INFORMATION_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM sovereign_information_schema_migrations ORDER BY version
    `).all()
  };
}

export function sovereignInformationMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { SOVEREIGN_INFORMATION_MIGRATIONS };

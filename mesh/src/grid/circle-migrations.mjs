import { sha256 } from '../lib/canonical.mjs';

const CIRCLE_LOCAL_PACKAGE_SQL = `
  CREATE TABLE IF NOT EXISTS circle_packages (
    circle_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    package_digest TEXT NOT NULL UNIQUE,
    package_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS circle_packages_owner_idx
  ON circle_packages(owner, created_at, circle_id);
`;

const CIRCLE_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'local-circle-package-projection',
    source: CIRCLE_LOCAL_PACKAGE_SQL,
    up(db) {
      db.exec(CIRCLE_LOCAL_PACKAGE_SQL);
    }
  }
]);

export function runCircleMigrations(db, { now = () => new Date().toISOString() } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS circle_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
  const known = new Map(CIRCLE_MIGRATIONS.map(item => [item.version, item]));
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM circle_schema_migrations ORDER BY version
  `).all();
  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Circle schema version ${row.version} is newer than this runtime`);
    }
    if (row.name !== migration.name || row.checksum !== circleMigrationChecksum(migration)) {
      throw new Error(`Circle migration ${row.version} does not match the runtime checksum`);
    }
  }
  for (const migration of CIRCLE_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO circle_schema_migrations(version, name, checksum, applied_at)
        VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        circleMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    version: CIRCLE_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM circle_schema_migrations ORDER BY version
    `).all()
  };
}

export function circleMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { CIRCLE_MIGRATIONS };

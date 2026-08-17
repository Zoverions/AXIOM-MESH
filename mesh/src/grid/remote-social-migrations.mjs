import { sha256 } from '../lib/canonical.mjs';

const REMOTE_SOCIAL_STAGING_SQL = `
  CREATE TABLE IF NOT EXISTS remote_social_staging (
    stage_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    package_digest TEXT NOT NULL,
    exporter_grid_id TEXT NOT NULL,
    exporter_key_id TEXT NOT NULL,
    trust_label TEXT NOT NULL,
    package_json TEXT NOT NULL,
    import_plan_json TEXT NOT NULL,
    trusted_exporter_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status = 'staged'),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    UNIQUE(owner, package_digest, exporter_key_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS remote_social_staging_owner_idx
  ON remote_social_staging(owner, created_at DESC, stage_id);

  CREATE INDEX IF NOT EXISTS remote_social_staging_status_idx
  ON remote_social_staging(owner, status, expires_at, stage_id);
`;

const REMOTE_SOCIAL_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'encrypted-review-only-remote-social-staging',
    source: REMOTE_SOCIAL_STAGING_SQL,
    up(db) {
      db.exec(REMOTE_SOCIAL_STAGING_SQL);
    }
  }
]);

export function runRemoteSocialMigrations(db, {
  now = () => new Date().toISOString()
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS remote_social_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const known = new Map(REMOTE_SOCIAL_MIGRATIONS.map(item => [item.version, item]));
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM remote_social_schema_migrations ORDER BY version
  `).all();

  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Remote social schema version ${row.version} is newer than this runtime`);
    }
    if (
      row.name !== migration.name
      || row.checksum !== remoteSocialMigrationChecksum(migration)
    ) {
      throw new Error(`Remote social migration ${row.version} does not match the runtime checksum`);
    }
  }

  for (const migration of REMOTE_SOCIAL_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO remote_social_schema_migrations(version, name, checksum, applied_at)
        VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        remoteSocialMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    version: REMOTE_SOCIAL_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM remote_social_schema_migrations ORDER BY version
    `).all()
  };
}

export function remoteSocialMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { REMOTE_SOCIAL_MIGRATIONS };

import { sha256 } from '../lib/canonical.mjs';

const REMOTE_SOCIAL_TRANSPORT_SQL = `
  CREATE TABLE IF NOT EXISTS remote_social_transport_jobs (
    job_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    source_origin TEXT NOT NULL,
    package_digest TEXT NOT NULL,
    transport_key_id TEXT NOT NULL,
    exporter_grid_id TEXT NOT NULL,
    exporter_key_id TEXT NOT NULL,
    review_json TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    maximum_attempts INTEGER NOT NULL,
    retry_base_ms INTEGER NOT NULL,
    retry_maximum_ms INTEGER NOT NULL,
    next_attempt_at TEXT,
    lease_expires_at TEXT,
    last_error_code TEXT,
    stage_id TEXT,
    receipt_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS remote_social_transport_owner_idx
  ON remote_social_transport_jobs(owner, created_at DESC, job_id DESC);

  CREATE INDEX IF NOT EXISTS remote_social_transport_status_idx
  ON remote_social_transport_jobs(status, next_attempt_at, updated_at);
`;

const REMOTE_SOCIAL_TRANSPORT_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'bounded-pinned-social-package-transport',
    source: REMOTE_SOCIAL_TRANSPORT_SQL,
    up(db) {
      db.exec(REMOTE_SOCIAL_TRANSPORT_SQL);
    }
  }
]);

export function runRemoteSocialTransportMigrations(db, {
  now = () => new Date().toISOString()
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS remote_social_transport_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
  const known = new Map(
    REMOTE_SOCIAL_TRANSPORT_MIGRATIONS.map(item => [item.version, item])
  );
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM remote_social_transport_schema_migrations
    ORDER BY version
  `).all();
  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Remote social transport schema version ${row.version} is newer than this runtime`);
    }
    if (
      row.name !== migration.name
      || row.checksum !== remoteSocialTransportMigrationChecksum(migration)
    ) {
      throw new Error(`Remote social transport migration ${row.version} does not match the runtime checksum`);
    }
  }
  for (const migration of REMOTE_SOCIAL_TRANSPORT_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO remote_social_transport_schema_migrations(
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        remoteSocialTransportMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    version: REMOTE_SOCIAL_TRANSPORT_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM remote_social_transport_schema_migrations
      ORDER BY version
    `).all()
  };
}

export function remoteSocialTransportMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { REMOTE_SOCIAL_TRANSPORT_MIGRATIONS };

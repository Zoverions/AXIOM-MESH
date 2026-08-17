import { sha256 } from '../lib/canonical.mjs';

const REMOTE_SOCIAL_RETENTION_SQL = `
  CREATE TABLE IF NOT EXISTS remote_social_retention_receipts (
    receipt_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action = 'expire-unadmitted-stage'),
    stage_id TEXT NOT NULL UNIQUE,
    package_digest TEXT NOT NULL,
    exporter_grid_id TEXT NOT NULL,
    exporter_key_id TEXT NOT NULL,
    import_plan_digest TEXT NOT NULL,
    stage_created_at TEXT NOT NULL,
    stage_expires_at TEXT NOT NULL,
    logical_bytes_reclaimed INTEGER NOT NULL,
    protected_bytes_reclaimed INTEGER NOT NULL,
    reason_code TEXT NOT NULL,
    occurred_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS remote_social_retention_owner_idx
  ON remote_social_retention_receipts(owner, occurred_at DESC, receipt_id DESC);
`;

const REMOTE_SOCIAL_RETENTION_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'evidence-backed-expired-review-retention',
    source: REMOTE_SOCIAL_RETENTION_SQL,
    up(db) {
      db.exec(REMOTE_SOCIAL_RETENTION_SQL);
    }
  }
]);

export function runRemoteSocialRetentionMigrations(db, {
  now = () => new Date().toISOString()
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS remote_social_retention_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
  const known = new Map(
    REMOTE_SOCIAL_RETENTION_MIGRATIONS.map(item => [item.version, item])
  );
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM remote_social_retention_schema_migrations
    ORDER BY version
  `).all();
  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Remote social retention schema version ${row.version} is newer than this runtime`);
    }
    if (
      row.name !== migration.name
      || row.checksum !== remoteSocialRetentionMigrationChecksum(migration)
    ) {
      throw new Error(
        `Remote social retention migration ${row.version} does not match the runtime checksum`
      );
    }
  }
  for (const migration of REMOTE_SOCIAL_RETENTION_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO remote_social_retention_schema_migrations(
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        remoteSocialRetentionMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    version: REMOTE_SOCIAL_RETENTION_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM remote_social_retention_schema_migrations
      ORDER BY version
    `).all()
  };
}

export function remoteSocialRetentionMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { REMOTE_SOCIAL_RETENTION_MIGRATIONS };

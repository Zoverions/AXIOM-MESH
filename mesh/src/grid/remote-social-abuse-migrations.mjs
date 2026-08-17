import { sha256 } from '../lib/canonical.mjs';

const REMOTE_SOCIAL_ABUSE_SQL = `
  CREATE TABLE IF NOT EXISTS remote_social_abuse_preferences (
    preference_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('mute', 'block')),
    exporter_key_id TEXT NOT NULL,
    persona_projection_digest TEXT NOT NULL,
    persona_observation_id TEXT NOT NULL,
    detail_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'cleared')),
    created_at TEXT NOT NULL,
    cleared_at TEXT,
    UNIQUE(owner, action, exporter_key_id, persona_projection_digest)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS remote_social_abuse_preferences_owner_idx
  ON remote_social_abuse_preferences(owner, status, action, created_at DESC, preference_id);

  CREATE TABLE IF NOT EXISTS remote_social_reports (
    report_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    target_kind TEXT NOT NULL CHECK(target_kind IN ('persona', 'publication')),
    target_observation_id TEXT NOT NULL,
    exporter_key_id TEXT NOT NULL,
    target_digest TEXT NOT NULL,
    report_json TEXT NOT NULL,
    reported_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS remote_social_reports_owner_idx
  ON remote_social_reports(owner, reported_at DESC, report_id);

  CREATE TABLE IF NOT EXISTS remote_social_quarantines (
    quarantine_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    target_kind TEXT NOT NULL CHECK(target_kind IN ('exporter', 'source')),
    target_digest TEXT NOT NULL,
    detail_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'released')),
    quarantined_at TEXT NOT NULL,
    released_at TEXT,
    UNIQUE(owner, target_kind, target_digest)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS remote_social_quarantines_owner_idx
  ON remote_social_quarantines(owner, status, target_kind, quarantined_at DESC, quarantine_id);
`;

const REMOTE_SOCIAL_ABUSE_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'owner-private-abuse-controls-and-quarantine',
    source: REMOTE_SOCIAL_ABUSE_SQL,
    up(db) {
      db.exec(REMOTE_SOCIAL_ABUSE_SQL);
    }
  }
]);

export function runRemoteSocialAbuseMigrations(db, {
  now = () => new Date().toISOString()
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS remote_social_abuse_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const known = new Map(
    REMOTE_SOCIAL_ABUSE_MIGRATIONS.map(item => [item.version, item])
  );
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM remote_social_abuse_schema_migrations ORDER BY version
  `).all();

  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Remote social abuse schema version ${row.version} is newer than this runtime`);
    }
    if (
      row.name !== migration.name
      || row.checksum !== remoteSocialAbuseMigrationChecksum(migration)
    ) {
      throw new Error(
        `Remote social abuse migration ${row.version} does not match the runtime checksum`
      );
    }
  }

  for (const migration of REMOTE_SOCIAL_ABUSE_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO remote_social_abuse_schema_migrations(
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        remoteSocialAbuseMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    version: REMOTE_SOCIAL_ABUSE_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM remote_social_abuse_schema_migrations ORDER BY version
    `).all()
  };
}

export function remoteSocialAbuseMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { REMOTE_SOCIAL_ABUSE_MIGRATIONS };
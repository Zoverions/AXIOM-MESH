import { sha256 } from '../lib/canonical.mjs';

const REMOTE_SOCIAL_ADMISSION_SQL = `
  CREATE TABLE IF NOT EXISTS remote_social_admissions (
    admission_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    stage_id TEXT NOT NULL UNIQUE,
    package_digest TEXT NOT NULL,
    exporter_grid_id TEXT NOT NULL,
    exporter_key_id TEXT NOT NULL,
    intent_id TEXT NOT NULL,
    approval_id TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    import_plan_digest TEXT NOT NULL,
    trust_label TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status = 'admitted'),
    admitted_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS remote_social_observations (
    observation_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    exporter_grid_id TEXT NOT NULL,
    exporter_key_id TEXT NOT NULL,
    object_kind TEXT NOT NULL CHECK(object_kind IN ('persona', 'publication', 'transition')),
    object_digest TEXT NOT NULL,
    object_json TEXT NOT NULL,
    first_admission_id TEXT NOT NULL REFERENCES remote_social_admissions(admission_id),
    observed_at TEXT NOT NULL,
    UNIQUE(owner, exporter_key_id, object_kind, object_digest)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS remote_social_admission_objects (
    admission_id TEXT NOT NULL REFERENCES remote_social_admissions(admission_id),
    observation_id TEXT NOT NULL REFERENCES remote_social_observations(observation_id),
    PRIMARY KEY (admission_id, observation_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS remote_social_admissions_owner_idx
  ON remote_social_admissions(owner, admitted_at DESC, admission_id);

  CREATE INDEX IF NOT EXISTS remote_social_observations_owner_idx
  ON remote_social_observations(owner, observed_at DESC, observation_id);

  CREATE INDEX IF NOT EXISTS remote_social_observations_kind_idx
  ON remote_social_observations(owner, object_kind, observed_at DESC, observation_id);
`;

const REMOTE_SOCIAL_ADMISSION_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'approval-bound-remote-social-observations',
    source: REMOTE_SOCIAL_ADMISSION_SQL,
    up(db) {
      db.exec(REMOTE_SOCIAL_ADMISSION_SQL);
    }
  }
]);

export function runRemoteSocialAdmissionMigrations(db, {
  now = () => new Date().toISOString()
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS remote_social_admission_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const known = new Map(
    REMOTE_SOCIAL_ADMISSION_MIGRATIONS.map(item => [item.version, item])
  );
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM remote_social_admission_schema_migrations ORDER BY version
  `).all();

  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Remote social admission schema version ${row.version} is newer than this runtime`);
    }
    if (
      row.name !== migration.name
      || row.checksum !== remoteSocialAdmissionMigrationChecksum(migration)
    ) {
      throw new Error(
        `Remote social admission migration ${row.version} does not match the runtime checksum`
      );
    }
  }

  for (const migration of REMOTE_SOCIAL_ADMISSION_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO remote_social_admission_schema_migrations(
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        remoteSocialAdmissionMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    version: REMOTE_SOCIAL_ADMISSION_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM remote_social_admission_schema_migrations ORDER BY version
    `).all()
  };
}

export function remoteSocialAdmissionMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { REMOTE_SOCIAL_ADMISSION_MIGRATIONS };

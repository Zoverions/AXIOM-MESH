import { sha256 } from '../lib/canonical.mjs';

const CIRCLE_MEMBER_LIFECYCLE_HEAD_PROJECTION_SQL = `
  CREATE TABLE IF NOT EXISTS circle_member_lifecycle_heads (
    circle_id TEXT NOT NULL,
    membership_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    lifecycle_head_digest TEXT NOT NULL,
    membership_lifecycle_digest TEXT NOT NULL,
    credential_lifecycle_digest TEXT NOT NULL,
    event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id),
    event_seq INTEGER NOT NULL UNIQUE REFERENCES events(seq),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(circle_id, membership_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS circle_member_lifecycle_heads_event_idx
  ON circle_member_lifecycle_heads(event_seq, event_id);

  CREATE TRIGGER IF NOT EXISTS circle_member_lifecycle_heads_reject_noop
  BEFORE UPDATE ON circle_member_lifecycle_heads
  WHEN OLD.membership_lifecycle_digest = NEW.membership_lifecycle_digest
    AND OLD.credential_lifecycle_digest = NEW.credential_lifecycle_digest
  BEGIN
    SELECT RAISE(ABORT, 'Circle lifecycle head update must change lifecycle state');
  END;
`;

const CIRCLE_LIFECYCLE_HEAD_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'durable-circle-member-lifecycle-head-projection',
    source: CIRCLE_MEMBER_LIFECYCLE_HEAD_PROJECTION_SQL,
    up(db) {
      db.exec(CIRCLE_MEMBER_LIFECYCLE_HEAD_PROJECTION_SQL);
    }
  }
]);

export function runCircleLifecycleHeadMigrations(
  db,
  { now = () => new Date().toISOString() } = {}
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS circle_lifecycle_head_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const known = new Map(CIRCLE_LIFECYCLE_HEAD_MIGRATIONS.map(item => [item.version, item]));
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM circle_lifecycle_head_schema_migrations
    ORDER BY version
  `).all();

  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Circle lifecycle head schema version ${row.version} is newer than this runtime`);
    }
    if (
      row.name !== migration.name
      || row.checksum !== circleLifecycleHeadMigrationChecksum(migration)
    ) {
      throw new Error(`Circle lifecycle head migration ${row.version} does not match the runtime checksum`);
    }
  }

  for (const migration of CIRCLE_LIFECYCLE_HEAD_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO circle_lifecycle_head_schema_migrations(
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        circleLifecycleHeadMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    version: CIRCLE_LIFECYCLE_HEAD_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM circle_lifecycle_head_schema_migrations
      ORDER BY version
    `).all()
  };
}

export function circleLifecycleHeadMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export {
  CIRCLE_LIFECYCLE_HEAD_MIGRATIONS,
  CIRCLE_MEMBER_LIFECYCLE_HEAD_PROJECTION_SQL
};

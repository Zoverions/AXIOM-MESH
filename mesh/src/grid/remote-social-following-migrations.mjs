import { sha256 } from '../lib/canonical.mjs';

const REMOTE_SOCIAL_FOLLOWING_SQL = `
  CREATE TABLE IF NOT EXISTS remote_social_follows (
    follow_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    exporter_grid_id TEXT NOT NULL,
    exporter_key_id TEXT NOT NULL,
    persona_projection_digest TEXT NOT NULL,
    persona_observation_id TEXT NOT NULL,
    trust_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('following', 'unfollowed')),
    followed_at TEXT NOT NULL,
    unfollowed_at TEXT,
    UNIQUE(owner, exporter_key_id, persona_projection_digest)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS remote_social_follows_owner_idx
  ON remote_social_follows(owner, status, followed_at DESC, follow_id);
`;

const REMOTE_SOCIAL_FOLLOWING_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'owner-controlled-remote-social-following',
    source: REMOTE_SOCIAL_FOLLOWING_SQL,
    up(db) {
      db.exec(REMOTE_SOCIAL_FOLLOWING_SQL);
    }
  }
]);

export function runRemoteSocialFollowingMigrations(db, {
  now = () => new Date().toISOString()
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS remote_social_following_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const known = new Map(
    REMOTE_SOCIAL_FOLLOWING_MIGRATIONS.map(item => [item.version, item])
  );
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM remote_social_following_schema_migrations ORDER BY version
  `).all();

  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Remote social following schema version ${row.version} is newer than this runtime`);
    }
    if (
      row.name !== migration.name
      || row.checksum !== remoteSocialFollowingMigrationChecksum(migration)
    ) {
      throw new Error(
        `Remote social following migration ${row.version} does not match the runtime checksum`
      );
    }
  }

  for (const migration of REMOTE_SOCIAL_FOLLOWING_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO remote_social_following_schema_migrations(
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        remoteSocialFollowingMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    version: REMOTE_SOCIAL_FOLLOWING_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM remote_social_following_schema_migrations ORDER BY version
    `).all()
  };
}

export function remoteSocialFollowingMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { REMOTE_SOCIAL_FOLLOWING_MIGRATIONS };

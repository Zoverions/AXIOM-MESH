import { sha256 } from '../lib/canonical.mjs';

const CONTEXT_AUTHORITY_STATE_SQL = `
  CREATE TABLE IF NOT EXISTS context_authority_evidence_state_transitions (
    evidence_id TEXT PRIMARY KEY,
    action TEXT NOT NULL CHECK(action IN ('revoked', 'superseded')),
    replacement_evidence_id TEXT,
    reason_code TEXT NOT NULL,
    transition_event_id TEXT NOT NULL UNIQUE,
    transitioned_by TEXT NOT NULL,
    transitioned_at TEXT NOT NULL,
    CHECK(
      (action = 'revoked' AND replacement_evidence_id IS NULL)
      OR
      (action = 'superseded' AND replacement_evidence_id IS NOT NULL)
    )
  ) STRICT;

  CREATE INDEX IF NOT EXISTS context_authority_state_action_idx
  ON context_authority_evidence_state_transitions(
    action,
    transitioned_at DESC,
    evidence_id
  );

  CREATE INDEX IF NOT EXISTS context_authority_state_replacement_idx
  ON context_authority_evidence_state_transitions(
    replacement_evidence_id,
    transitioned_at DESC
  );
`;

const CONTEXT_AUTHORITY_STATE_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'append-only-context-authority-state-transitions',
    source: CONTEXT_AUTHORITY_STATE_SQL,
    up(db) {
      db.exec(CONTEXT_AUTHORITY_STATE_SQL);
    }
  }
]);

export function runContextAuthorityStateMigrations(db, {
  now = () => new Date().toISOString()
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_authority_state_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const known = new Map(
    CONTEXT_AUTHORITY_STATE_MIGRATIONS.map(item => [item.version, item])
  );
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM context_authority_state_schema_migrations
    ORDER BY version
  `).all();

  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(
        `Context authority state schema version ${row.version} is newer than this runtime`
      );
    }
    if (
      row.name !== migration.name
      || row.checksum !== contextAuthorityStateMigrationChecksum(migration)
    ) {
      throw new Error(
        `Context authority state migration ${row.version} does not match the runtime checksum`
      );
    }
  }

  for (const migration of CONTEXT_AUTHORITY_STATE_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO context_authority_state_schema_migrations(
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        contextAuthorityStateMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    version: CONTEXT_AUTHORITY_STATE_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM context_authority_state_schema_migrations
      ORDER BY version
    `).all()
  };
}

export function contextAuthorityStateMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { CONTEXT_AUTHORITY_STATE_MIGRATIONS };

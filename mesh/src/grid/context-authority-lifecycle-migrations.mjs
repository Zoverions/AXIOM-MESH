import { sha256 } from '../lib/canonical.mjs';

const CONTEXT_AUTHORITY_LIFECYCLE_SQL = `
  CREATE TABLE IF NOT EXISTS context_authority_evidence_lifecycle (
    evidence_id TEXT PRIMARY KEY
      REFERENCES context_authority_evidence_admissions(evidence_id),
    state TEXT NOT NULL CHECK(state IN ('revoked', 'superseded')),
    transition_event_id TEXT NOT NULL UNIQUE,
    changed_by TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    superseded_by_evidence_id TEXT
      REFERENCES context_authority_evidence_admissions(evidence_id),
    CHECK(
      (state = 'revoked' AND superseded_by_evidence_id IS NULL)
      OR
      (state = 'superseded' AND superseded_by_evidence_id IS NOT NULL)
    )
  ) STRICT;

  CREATE INDEX IF NOT EXISTS context_authority_evidence_lifecycle_state_idx
  ON context_authority_evidence_lifecycle(
    state,
    changed_at DESC,
    evidence_id
  );

  CREATE INDEX IF NOT EXISTS context_authority_evidence_lifecycle_replacement_idx
  ON context_authority_evidence_lifecycle(
    superseded_by_evidence_id,
    evidence_id
  )
  WHERE superseded_by_evidence_id IS NOT NULL;
`;

const CONTEXT_AUTHORITY_LIFECYCLE_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'append-only-context-authority-evidence-lifecycle',
    source: CONTEXT_AUTHORITY_LIFECYCLE_SQL,
    up(db) {
      db.exec(CONTEXT_AUTHORITY_LIFECYCLE_SQL);
    }
  }
]);

export function runContextAuthorityLifecycleMigrations(db, {
  now = () => new Date().toISOString()
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_authority_lifecycle_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const known = new Map(
    CONTEXT_AUTHORITY_LIFECYCLE_MIGRATIONS.map(item => [item.version, item])
  );
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM context_authority_lifecycle_schema_migrations
    ORDER BY version
  `).all();

  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(
        `Context authority lifecycle schema version ${row.version} is newer than this runtime`
      );
    }
    if (
      row.name !== migration.name
      || row.checksum !== contextAuthorityLifecycleMigrationChecksum(migration)
    ) {
      throw new Error(
        `Context authority lifecycle migration ${row.version} does not match the runtime checksum`
      );
    }
  }

  for (const migration of CONTEXT_AUTHORITY_LIFECYCLE_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO context_authority_lifecycle_schema_migrations(
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        contextAuthorityLifecycleMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    version: CONTEXT_AUTHORITY_LIFECYCLE_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM context_authority_lifecycle_schema_migrations
      ORDER BY version
    `).all()
  };
}

export function contextAuthorityLifecycleMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { CONTEXT_AUTHORITY_LIFECYCLE_MIGRATIONS };

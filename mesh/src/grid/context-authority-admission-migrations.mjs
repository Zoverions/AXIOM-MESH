import { sha256 } from '../lib/canonical.mjs';

const CONTEXT_AUTHORITY_ADMISSION_SQL = `
  CREATE TABLE IF NOT EXISTS context_authority_evidence_admissions (
    evidence_id TEXT PRIMARY KEY,
    evidence_type TEXT NOT NULL,
    issuer_principal_ref TEXT NOT NULL,
    issuer_nonce TEXT NOT NULL,
    key_id TEXT NOT NULL,
    payload_sha256 TEXT NOT NULL,
    envelope_sha256 TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    admitted_event_id TEXT NOT NULL UNIQUE,
    admitted_by TEXT NOT NULL,
    admitted_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status = 'admitted'),
    UNIQUE(issuer_principal_ref, issuer_nonce)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS context_authority_evidence_admissions_issuer_idx
  ON context_authority_evidence_admissions(
    issuer_principal_ref,
    admitted_at DESC,
    evidence_id
  );

  CREATE INDEX IF NOT EXISTS context_authority_evidence_admissions_type_idx
  ON context_authority_evidence_admissions(
    evidence_type,
    admitted_at DESC,
    evidence_id
  );
`;

const CONTEXT_AUTHORITY_ADMISSION_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'replay-resistant-context-authority-evidence-admission',
    source: CONTEXT_AUTHORITY_ADMISSION_SQL,
    up(db) {
      db.exec(CONTEXT_AUTHORITY_ADMISSION_SQL);
    }
  }
]);

export function runContextAuthorityAdmissionMigrations(db, {
  now = () => new Date().toISOString()
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_authority_admission_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const known = new Map(
    CONTEXT_AUTHORITY_ADMISSION_MIGRATIONS.map(item => [item.version, item])
  );
  const applied = db.prepare(`
    SELECT version, name, checksum, applied_at
    FROM context_authority_admission_schema_migrations
    ORDER BY version
  `).all();

  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(
        `Context authority admission schema version ${row.version} is newer than this runtime`
      );
    }
    if (
      row.name !== migration.name
      || row.checksum !== contextAuthorityAdmissionMigrationChecksum(migration)
    ) {
      throw new Error(
        `Context authority admission migration ${row.version} does not match the runtime checksum`
      );
    }
  }

  for (const migration of CONTEXT_AUTHORITY_ADMISSION_MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO context_authority_admission_schema_migrations(
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        contextAuthorityAdmissionMigrationChecksum(migration),
        now()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    version: CONTEXT_AUTHORITY_ADMISSION_MIGRATIONS.at(-1).version,
    applied: db.prepare(`
      SELECT version, name, checksum, applied_at
      FROM context_authority_admission_schema_migrations
      ORDER BY version
    `).all()
  };
}

export function contextAuthorityAdmissionMigrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

export { CONTEXT_AUTHORITY_ADMISSION_MIGRATIONS };

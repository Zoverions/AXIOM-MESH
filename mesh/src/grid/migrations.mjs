import { sha256 } from '../lib/canonical.mjs';

const APPROVALS_SQL = `
  CREATE TABLE IF NOT EXISTS approvals (
    approval_id TEXT PRIMARY KEY,
    approver TEXT NOT NULL,
    requester TEXT NOT NULL,
    action TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    consumed_at TEXT,
    consumed_by_intent TEXT
  ) STRICT;
`;

const MEMORY_ACCOUNTING_SQL = `
  CREATE TABLE IF NOT EXISTS memory_objects (
    object_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    kind TEXT NOT NULL,
    content_digest TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    tombstoned_at TEXT
  ) STRICT;

  CREATE TABLE IF NOT EXISTS memory_edges (
    edge_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    from_id TEXT NOT NULL REFERENCES memory_objects(object_id),
    to_id TEXT NOT NULL REFERENCES memory_objects(object_id),
    relation TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS accounting_accounts (
    account_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    unit TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS accounting_journals (
    journal_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    unit TEXT NOT NULL,
    reference TEXT NOT NULL,
    memo_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS accounting_entries (
    journal_id TEXT NOT NULL REFERENCES accounting_journals(journal_id),
    line_no INTEGER NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounting_accounts(account_id),
    amount INTEGER NOT NULL,
    metadata_json TEXT NOT NULL,
    PRIMARY KEY (journal_id, line_no)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS memory_objects_owner_idx
  ON memory_objects(owner, created_at);

  CREATE INDEX IF NOT EXISTS accounting_accounts_owner_idx
  ON accounting_accounts(owner, unit);

  CREATE INDEX IF NOT EXISTS accounting_journals_owner_idx
  ON accounting_journals(owner, created_at);
`;

const IMPORTS_SQL = `
  CREATE TABLE IF NOT EXISTS imports (
    import_id TEXT PRIMARY KEY,
    principal TEXT NOT NULL,
    source_principal TEXT NOT NULL,
    source_signer TEXT NOT NULL,
    bundle_digest TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    diff_json TEXT NOT NULL,
    status TEXT NOT NULL,
    staged_at TEXT NOT NULL,
    applied_at TEXT
  ) STRICT;

  CREATE TABLE IF NOT EXISTS import_records (
    import_id TEXT NOT NULL REFERENCES imports(import_id),
    record_key TEXT NOT NULL,
    record_type TEXT NOT NULL,
    record_digest TEXT NOT NULL,
    record_json TEXT NOT NULL,
    disposition TEXT NOT NULL,
    PRIMARY KEY (import_id, record_type, record_key)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS imports_principal_idx
  ON imports(principal, staged_at);

  CREATE INDEX IF NOT EXISTS import_records_lookup_idx
  ON import_records(record_type, record_key, disposition);
`;

const GOVERNANCE_LIFECYCLE_SQL = `
  CREATE TABLE IF NOT EXISTS policy_overlays (
    overlay_id TEXT PRIMARY KEY,
    proposal_id TEXT,
    source_type TEXT NOT NULL,
    policy_digest TEXT NOT NULL,
    policy_json TEXT NOT NULL,
    status TEXT NOT NULL,
    activated_at TEXT NOT NULL,
    expires_at TEXT,
    review_by TEXT,
    reviewed_at TEXT,
    rollback_reason_json TEXT
  ) STRICT;

  CREATE TABLE IF NOT EXISTS governance_appeals (
    appeal_id TEXT PRIMARY KEY,
    appellant TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    grounds_json TEXT NOT NULL,
    desired_resolution TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  ) STRICT;

  CREATE INDEX IF NOT EXISTS policy_overlays_status_idx
  ON policy_overlays(status, expires_at);

  CREATE INDEX IF NOT EXISTS governance_appeals_appellant_idx
  ON governance_appeals(appellant, created_at);
`;

const BACKUPS_SQL = `
  CREATE TABLE IF NOT EXISTS backups (
    backup_id TEXT PRIMARY KEY,
    principal TEXT NOT NULL,
    status TEXT NOT NULL,
    manifest_json TEXT,
    manifest_path TEXT,
    snapshot_path TEXT,
    database_digest TEXT,
    requested_at TEXT NOT NULL,
    completed_at TEXT,
    restored_at TEXT,
    recovery_id TEXT,
    rollback_path TEXT
  ) STRICT;

  CREATE INDEX IF NOT EXISTS backups_principal_idx
  ON backups(principal, requested_at);
`;

const CAUSAL_SYNC_SQL = `
  CREATE TABLE IF NOT EXISTS sync_bundles (
    bundle_digest TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    update_count INTEGER NOT NULL,
    result_json TEXT NOT NULL,
    received_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sync_updates (
    update_id TEXT PRIMARY KEY,
    bundle_digest TEXT NOT NULL REFERENCES sync_bundles(bundle_digest),
    owner TEXT NOT NULL,
    node_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    value_digest TEXT NOT NULL,
    value_json TEXT NOT NULL,
    vector_json TEXT NOT NULL,
    resolves_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    author_counter INTEGER NOT NULL,
    public_key_digest TEXT NOT NULL,
    signature_json TEXT NOT NULL,
    status TEXT NOT NULL,
    UNIQUE(node_id, author_counter)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sync_heads (
    owner TEXT NOT NULL,
    namespace TEXT NOT NULL,
    record_id TEXT NOT NULL,
    update_id TEXT NOT NULL REFERENCES sync_updates(update_id),
    PRIMARY KEY (owner, namespace, record_id, update_id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS sync_bundles_owner_idx
  ON sync_bundles(owner, received_at);

  CREATE INDEX IF NOT EXISTS sync_updates_record_idx
  ON sync_updates(owner, namespace, record_id, occurred_at);

  CREATE INDEX IF NOT EXISTS sync_heads_record_idx
  ON sync_heads(owner, namespace, record_id);
`;

const NODE_SCHEDULING_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS node_schedules (
    schedule_id TEXT PRIMARY KEY,
    requester TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    requirements_json TEXT NOT NULL,
    placements_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS node_schedules_requester_idx
  ON node_schedules(requester, created_at);

  CREATE INDEX IF NOT EXISTS node_schedules_active_idx
  ON node_schedules(status, expires_at);
`;

const NODE_SCHEDULING_SQL = `
  ALTER TABLE nodes ADD COLUMN discovery_json TEXT;
${NODE_SCHEDULING_TABLES_SQL}`;

const HUMAN_AUTHORITY_PROJECTIONS_SQL = `
  CREATE TABLE IF NOT EXISTS human_relationship_claims (
    claim_id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    holder_id TEXT NOT NULL,
    issuer_id TEXT NOT NULL,
    assurance TEXT NOT NULL,
    jurisdiction_context_digest TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    effective_until TEXT,
    status TEXT NOT NULL,
    source_event_id TEXT NOT NULL,
    status_event_id TEXT NOT NULL,
    status_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS human_authority_grants (
    grant_id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    holder_id TEXT NOT NULL,
    relationship_claim_id TEXT NOT NULL,
    issuer_id TEXT NOT NULL,
    authority_source TEXT NOT NULL,
    assurance TEXT NOT NULL,
    jurisdiction_context_digest TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    effective_until TEXT,
    revocable INTEGER NOT NULL,
    delegable INTEGER NOT NULL,
    status TEXT NOT NULL,
    source_event_id TEXT NOT NULL,
    status_event_id TEXT NOT NULL,
    status_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS human_authority_conflicts (
    conflict_id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    jurisdiction_context_digest TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    effective_until TEXT,
    status TEXT NOT NULL,
    source_event_id TEXT NOT NULL,
    status_event_id TEXT NOT NULL,
    status_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS human_relationship_subject_holder_idx
  ON human_relationship_claims(subject_id, holder_id, status);

  CREATE INDEX IF NOT EXISTS human_authority_subject_holder_idx
  ON human_authority_grants(subject_id, holder_id, status);

  CREATE INDEX IF NOT EXISTS human_authority_conflict_subject_idx
  ON human_authority_conflicts(subject_id, status);
`;

const MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'baseline-event-store',
    source: 'baseline-event-store:v1',
    up() {}
  },
  {
    version: 2,
    name: 'intent-request-digest',
    source: 'ALTER TABLE intents ADD COLUMN request_digest TEXT NOT NULL DEFAULT empty:v2',
    up(db) {
      const columns = db.prepare('PRAGMA table_info(intents)').all().map(column => column.name);
      if (!columns.includes('request_digest')) {
        db.exec("ALTER TABLE intents ADD COLUMN request_digest TEXT NOT NULL DEFAULT ''");
      }
    }
  },
  {
    version: 3,
    name: 'independent-approvals',
    source: APPROVALS_SQL,
    up(db) {
      db.exec(APPROVALS_SQL);
    }
  },
  {
    version: 4,
    name: 'memory-graph-and-accounting',
    source: MEMORY_ACCOUNTING_SQL,
    up(db) {
      db.exec(MEMORY_ACCOUNTING_SQL);
    }
  },
  {
    version: 5,
    name: 'staged-portability-imports',
    source: IMPORTS_SQL,
    up(db) {
      db.exec(IMPORTS_SQL);
    }
  },
  {
    version: 6,
    name: 'governance-policy-lifecycle',
    source: `${GOVERNANCE_LIFECYCLE_SQL}
ALTER proposals ADD lifecycle timestamps, verification digest, and rollback metadata`,
    up(db) {
      const columns = new Set(db.prepare('PRAGMA table_info(proposals)').all().map(column => column.name));
      for (const [name, definition] of [
        ['finalized_at', 'TEXT'],
        ['activated_at', 'TEXT'],
        ['verified_at', 'TEXT'],
        ['verification_digest', 'TEXT'],
        ['rolled_back_at', 'TEXT'],
        ['rollback_json', 'TEXT']
      ]) {
        if (!columns.has(name)) db.exec(`ALTER TABLE proposals ADD COLUMN ${name} ${definition}`);
      }
      db.exec(GOVERNANCE_LIFECYCLE_SQL);
    }
  },
  {
    version: 7,
    name: 'signed-node-and-storage-records',
    source: 'Add signed node admission, renewal, quarantine, ownership, and storage-offer attestations',
    up(db) {
      addColumns(db, 'nodes', [
        ['owner', "TEXT NOT NULL DEFAULT 'legacy:unknown'"],
        ['public_key_json', 'TEXT'],
        ['admission_digest', 'TEXT'],
        ['renewed_at', 'TEXT'],
        ['quarantined_at', 'TEXT'],
        ['quarantine_reason_json', 'TEXT']
      ]);
      addColumns(db, 'storage_offers', [
        ['owner', "TEXT NOT NULL DEFAULT 'legacy:unknown'"],
        ['public_key_digest', 'TEXT'],
        ['offer_digest', 'TEXT'],
        ['signature_json', 'TEXT']
      ]);
    }
  },
  {
    version: 8,
    name: 'encrypted-grid-backups',
    source: BACKUPS_SQL,
    up(db) {
      db.exec(BACKUPS_SQL);
    }
  },
  {
    version: 9,
    name: 'signed-causal-offline-sync',
    source: CAUSAL_SYNC_SQL,
    up(db) {
      db.exec(CAUSAL_SYNC_SQL);
    }
  },
  {
    version: 10,
    name: 'admitted-node-discovery-and-scheduling',
    source: NODE_SCHEDULING_SQL,
    up(db) {
      addColumns(db, 'nodes', [
        ['discovery_json', 'TEXT']
      ]);
      db.exec(NODE_SCHEDULING_TABLES_SQL);
    }
  },
  {
    version: 11,
    name: 'human-delegated-authority-projections',
    source: HUMAN_AUTHORITY_PROJECTIONS_SQL,
    up(db) {
      db.exec(HUMAN_AUTHORITY_PROJECTIONS_SQL);
    }
  }
]);

export function runMigrations(db, { now = () => new Date().toISOString() } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
  const declaredVersion = Number(db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()?.value ?? 0);
  if (declaredVersion > MIGRATIONS.at(-1).version) {
    throw new Error(`Database schema version ${declaredVersion} is newer than this runtime`);
  }
  const known = new Map(MIGRATIONS.map(item => [item.version, item]));
  const applied = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new Error(`Database schema version ${row.version} is newer than this runtime`);
    }
    if (row.name !== migration.name || row.checksum !== migrationChecksum(migration)) {
      throw new Error(`Database migration ${row.version} does not match the runtime checksum`);
    }
  }
  for (const migration of MIGRATIONS) {
    if (applied.some(row => row.version === migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(`
        INSERT INTO schema_migrations(version, name, checksum, applied_at)
        VALUES (?, ?, ?, ?)
      `).run(migration.version, migration.name, migrationChecksum(migration), now());
      db.prepare(`
        INSERT INTO meta(key, value) VALUES ('schema_version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(String(migration.version));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    version: MIGRATIONS.at(-1).version,
    applied: db.prepare('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version').all()
  };
}

export function migrationChecksum(migration) {
  return sha256(`${migration.version}\n${migration.name}\n${migration.source}`);
}

function addColumns(db, table, definitions) {
  const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
  for (const [name, definition] of definitions) {
    if (!columns.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

export { MIGRATIONS };

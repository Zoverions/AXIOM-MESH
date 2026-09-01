import { createHash } from 'node:crypto';
import { canonicalJson, ValidationError } from './lib/canonical.mjs';

const MATERIALIZED_TABLES = Object.freeze([
  'sync_heads','sync_updates','sync_bundles','governance_appeals','policy_overlays',
  'import_records','imports','accounting_entries','accounting_journals','accounting_accounts',
  'memory_edges','memory_objects','votes','proposals','storage_offers','node_schedules',
  'nodes','approvals','consents','capsules','backups','exports','intents'
]);
const PROTECTED = new Map([
  ['intents', ['intent_id', ['result_json','error_json']]],
  ['capsules', ['digest', ['manifest_json']]],
  ['consents', ['consent_id', ['scopes_json']]],
  ['proposals', ['proposal_id', ['action_json','rollback_json']]],
  ['nodes', ['node_id', ['capabilities_json','discovery_json','public_key_json','quarantine_reason_json']]],
  ['storage_offers', ['offer_id', ['regions_json','signature_json']]],
  ['exports', ['export_id', ['scope_json','manifest_json']]],
  ['backups', ['backup_id', ['manifest_json']]],
  ['memory_objects', ['object_id', ['payload_json']]],
  ['memory_edges', ['edge_id', ['metadata_json']]],
  ['accounting_journals', ['journal_id', ['memo_json']]],
  ['accounting_entries', ["journal_id || ':' || line_no", ['metadata_json']]],
  ['imports', ['import_id', ['manifest_json','diff_json']]],
  ['import_records', ["import_id || ':' || record_type || ':' || record_key", ['record_json']]],
  ['policy_overlays', ['overlay_id', ['policy_json','rollback_reason_json']]],
  ['governance_appeals', ['appeal_id', ['grounds_json']]],
  ['sync_bundles', ['bundle_digest', ['result_json']]],
  ['sync_updates', ['update_id', ['value_json','vector_json','resolves_json','signature_json']]],
  ['node_schedules', ['schedule_id', ['requirements_json','placements_json']]]
]);

export function logicalMaterializedStateDigest(store) {
  if (!store?.db || typeof store.openJson !== 'function') {
    throw new ValidationError('Logical materialized-state digest requires an open Grid store');
  }
  const hash = createHash('sha256');
  for (const table of MATERIALIZED_TABLES) {
    hash.update(`\u0000table:${table}\u0000`);
    const columns = store.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name).sort();
    hash.update(columns.join('\u0001'));
    const protectedSpec = PROTECTED.get(table);
    const protectedColumns = new Set(protectedSpec?.[1] ?? []);
    const keyExpr = protectedSpec?.[0];
    const select = keyExpr ? `${keyExpr} AS __protection_key, ${columns.join(', ')}` : columns.join(', ');
    for (const row of store.db.prepare(`SELECT ${select} FROM ${table} ORDER BY rowid`).iterate()) {
      for (const column of columns) {
        let value = row[column];
        if (protectedColumns.has(column) && value !== null && value !== undefined) {
          value = store.openJson(table, column, row.__protection_key, value);
          hash.update(`\u0007${canonicalJson(value)}`);
        } else if (value === null || value === undefined) hash.update('\u0002');
        else if (typeof value === 'bigint' || typeof value === 'number') hash.update(`\u0003${value}`);
        else if (value instanceof Uint8Array) { hash.update('\u0004'); hash.update(value); }
        else hash.update(`\u0005${String(value)}`);
        hash.update('\u0001');
      }
      hash.update('\u0006');
    }
  }
  return hash.digest('hex');
}

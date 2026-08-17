import { ValidationError } from '../lib/canonical.mjs';

export const REMOTE_SOCIAL_PROTECTED_COLUMN_MAPPINGS = Object.freeze([
  ['remote_social_staging', 'stage_id', [
    'package_json',
    'import_plan_json',
    'trusted_exporter_json'
  ]],
  ['remote_social_admissions', 'admission_id', ['summary_json']],
  ['remote_social_observations', 'observation_id', ['object_json']],
  ['remote_social_follows', 'follow_id', ['trust_json']],
  ['remote_social_abuse_preferences', 'preference_id', ['detail_json']],
  ['remote_social_reports', 'report_id', ['report_json']],
  ['remote_social_quarantines', 'quarantine_id', ['detail_json']],
  ['remote_social_transport_jobs', 'job_id', ['review_json', 'receipt_json']]
]);

export function reencryptRemoteSocialProtectedColumns({
  db,
  sourceProtector,
  targetProtector
}) {
  if (!db || !sourceProtector || !targetProtector) {
    throw new ValidationError('Remote social Grid re-encryption dependencies are missing');
  }
  const presentMappings = REMOTE_SOCIAL_PROTECTED_COLUMN_MAPPINGS
    .filter(([table]) => tableExists(db, table));
  if (!presentMappings.length) {
    return { protected_values: 0, tables: {} };
  }

  let values = 0;
  const tables = {};
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [table, keyExpression, columns] of presentMappings) {
      const availableColumns = new Set(
        db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name)
      );
      for (const column of columns) {
        if (!availableColumns.has(column)) {
          throw new ValidationError(
            `Remote social protected column is missing from ${table}: ${column}`
          );
        }
      }
      const rows = db.prepare(
        `SELECT ${keyExpression} AS protection_key, ${columns.join(', ')} FROM ${table}`
      ).all();
      let tableValues = 0;
      for (const row of rows) {
        for (const column of columns) {
          const serialized = row[column];
          if (serialized === null || serialized === undefined) continue;
          const context = `axiom:${table}.${column}:${row.protection_key}`;
          const value = sourceProtector.open(serialized, context);
          const reencrypted = targetProtector.seal(value, context);
          targetProtector.open(reencrypted, context);
          db.prepare(
            `UPDATE ${table} SET ${column} = ? WHERE ${keyExpression} = ?`
          ).run(reencrypted, row.protection_key);
          values += 1;
          tableValues += 1;
        }
      }
      tables[table] = tableValues;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { protected_values: values, tables };
}

function tableExists(db, table) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}
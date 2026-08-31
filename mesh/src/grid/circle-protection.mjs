import { ValidationError } from '../lib/canonical.mjs';

export const CIRCLE_PROTECTED_COLUMN_MAPPINGS = Object.freeze([
  ['circle_packages', 'circle_id', ['package_json']]
]);

function tableExists(db, table) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

/**
 * Re-encrypt the Circle materialized projection under a replacement Grid data
 * protector. The signed Grid event chain remains authoritative; this function
 * changes ciphertext only and grants no Circle, runtime, network, or portable
 * authority.
 */
export function reencryptCircleProtectedColumns({ db, sourceProtector, targetProtector }) {
  if (!db || !sourceProtector || !targetProtector) {
    throw new ValidationError('Circle Grid re-encryption dependencies are missing');
  }

  const presentMappings = CIRCLE_PROTECTED_COLUMN_MAPPINGS.filter(([table]) => tableExists(db, table));
  let values = 0;
  const tables = {};
  if (!presentMappings.length) {
    return { protected_values: 0, tables };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [table, keyExpression, columns] of presentMappings) {
      let tableValues = 0;
      const rows = db.prepare(
        `SELECT ${keyExpression} AS protection_key, ${columns.join(', ')} FROM ${table}`
      ).all();
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

  return {
    protected_values: values,
    tables
  };
}

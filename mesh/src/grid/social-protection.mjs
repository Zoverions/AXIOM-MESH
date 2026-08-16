import { ValidationError } from '../lib/canonical.mjs';

export const SOCIAL_PROTECTED_COLUMN_MAPPINGS = Object.freeze([
  ['actor_states', 'actor_id', ['state_json']],
  ['publication_personas', 'persona_id', ['protected_json', 'public_projection_json']],
  ['social_publications', 'projection_digest', [
    'projection_json',
    'access_envelope_json',
    'access_use_json'
  ]],
  ['social_transitions', 'transition_digest', ['transition_json']]
]);

function tableExists(db, table) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

export function reencryptSocialProtectedColumns({ db, sourceProtector, targetProtector }) {
  if (!db || !sourceProtector || !targetProtector) {
    throw new ValidationError('Social Grid re-encryption dependencies are missing');
  }
  const presentMappings = SOCIAL_PROTECTED_COLUMN_MAPPINGS.filter(([table]) => tableExists(db, table));
  if (!presentMappings.length) {
    return { protected_values: 0, tables: {} };
  }

  let values = 0;
  const tables = {};
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
  return { protected_values: values, tables };
}

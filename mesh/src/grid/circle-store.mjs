import {
  AxiomError,
  ValidationError,
  assertString
} from '../lib/canonical.mjs';
import { validateCircleCorePackage } from '../lib/circle-core.mjs';
import { AcceptedSocialGridStore } from './accepted-social-store.mjs';
import { runCircleMigrations } from './circle-migrations.mjs';
import {
  CIRCLE_GRID_EVENT_KINDS,
  validateCircleGridEvent
} from './circle-state.mjs';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const CIRCLE_PROTECTED_COLUMN_MAPPINGS = Object.freeze([
  ['circle_packages', 'circle_id', ['package_json']]
]);

function migrateProtectedMapping(store, mappings) {
  store.transaction(() => {
    for (const [table, keyExpression, columns] of mappings) {
      const rows = store.db.prepare(
        `SELECT ${keyExpression} AS protection_key, ${columns.join(', ')} FROM ${table}`
      ).all();
      for (const row of rows) {
        for (const column of columns) {
          const serialized = row[column];
          if (serialized === null || serialized === undefined) continue;
          if (store.protector.isProtected(serialized)) {
            store.openJson(table, column, row.protection_key, serialized);
            continue;
          }
          let value;
          try {
            value = JSON.parse(serialized);
          } catch {
            throw new ValidationError(`Legacy ${table}.${column} value is not valid JSON`);
          }
          store.db.prepare(
            `UPDATE ${table} SET ${column} = ? WHERE ${keyExpression} = ?`
          ).run(
            store.protectJson(table, column, row.protection_key, value),
            row.protection_key
          );
        }
      }
    }
  });
}

/**
 * Local Circle materialization above the accepted Social storage stack.
 *
 * The signed Grid event chain remains authoritative. circle_packages is an
 * encrypted, owner-scoped projection that can be discarded and rebuilt from
 * those events. Persisting a Circle Core package does not activate the package
 * or turn any Circle record into runtime, network, or portable authority.
 */
export class CircleGridStore extends AcceptedSocialGridStore {
  initialize() {
    this.circleReady = false;
    super.initialize();
    this.circleMigrations = runCircleMigrations(this.db);
    migrateProtectedMapping(this, CIRCLE_PROTECTED_COLUMN_MAPPINGS);
    this.circleReady = true;
    this.rebuildCircleMaterializedState();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      circle_schema_version: this.circleMigrations?.version ?? 0
    };
  }

  migrateProtectedColumns() {
    super.migrateProtectedColumns();
    if (this.circleReady) {
      migrateProtectedMapping(this, CIRCLE_PROTECTED_COLUMN_MAPPINGS);
    }
  }

  rebuildMaterializedState() {
    if (!this.circleReady) return super.rebuildMaterializedState();
    this.transaction(() => this.clearCircleMaterializedState());
    return super.rebuildMaterializedState();
  }

  rebuildCircleMaterializedState() {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY seq').all();
    this.transaction(() => {
      this.clearCircleMaterializedState();
      for (const row of rows) {
        const event = this.decodeEventRow(row);
        if (Object.values(CIRCLE_GRID_EVENT_KINDS).includes(event.kind)) {
          this.applyCircleMaterializedEvent(event);
        }
      }
    });
  }

  clearCircleMaterializedState() {
    this.db.exec('DELETE FROM circle_packages');
  }

  appendEvents({ traceId, actor, events }) {
    if (Array.isArray(events)) {
      for (const event of events) validateCircleGridEvent(event, actor);
    }
    return super.appendEvents({ traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (!this.circleReady || !Object.values(CIRCLE_GRID_EVENT_KINDS).includes(event.kind)) return;
    this.applyCircleMaterializedEvent(event);
  }

  applyCircleMaterializedEvent(event) {
    const payload = validateCircleGridEvent(event, event.actor);
    if (!payload) return;

    const existing = this.db.prepare(`
      SELECT package_digest FROM circle_packages WHERE circle_id = ?
    `).get(payload.circle_id);
    if (existing) {
      if (existing.package_digest === payload.package_digest) {
        throw new AxiomError(
          'circle_already_exists',
          'Circle creation is already retained in the signed Grid',
          409
        );
      }
      throw new AxiomError(
        'circle_identity_conflict',
        'Circle identity is already bound to different retained state',
        409
      );
    }

    this.db.prepare(`
      INSERT INTO circle_packages(
        circle_id, owner, package_digest, package_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      payload.circle_id,
      payload.owner,
      payload.package_digest,
      this.protectJson(
        'circle_packages',
        'package_json',
        payload.circle_id,
        payload.package
      ),
      event.occurred_at,
      event.occurred_at
    );
  }

  getCirclePackage(owner, circleId) {
    const safeOwner = identifier(owner, 'Circle owner');
    const safeCircleId = identifier(circleId, 'Circle id');
    const row = this.db.prepare(`
      SELECT * FROM circle_packages WHERE owner = ? AND circle_id = ?
    `).get(safeOwner, safeCircleId);
    if (!row) {
      throw new AxiomError('circle_not_found', 'Circle was not found for this owner', 404);
    }
    const document = this.openJson(
      'circle_packages',
      'package_json',
      row.circle_id,
      row.package_json
    );
    const validation = validateCircleCorePackage(document);
    if (
      validation.circle_id !== row.circle_id
      || validation.package_digest !== row.package_digest
    ) {
      throw new ValidationError('Persisted Circle projection does not match its retained digest');
    }
    return Object.freeze({
      circle_id: row.circle_id,
      owner: row.owner,
      package_digest: row.package_digest,
      package_json: document,
      created_at: row.created_at,
      updated_at: row.updated_at,
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    });
  }
}

function identifier(value, label) {
  return assertString(value, label, {
    min: 1,
    max: 160,
    pattern: IDENTIFIER
  });
}

// RETAINED LOWER LAYER: this file contains the baseline GridStore implementation.
// The supported GridStore exported by store.mjs subclasses this layer with signed checkpoint
// and streaming chain verification. The baseline verifyChain remains intentionally reachable
// only for compatibility/tests and benchmark comparison; it is not the current production
// verification path when store.mjs is used.

import { DatabaseSync } from 'node:sqlite';
import { createPublicKey } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  newId,
  sha256
} from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';
import { runMigrations } from './migrations.mjs';
import { validateImportBundle } from '../lib/importer.mjs';
import { validateAuthorityReducingPolicy } from '../lib/policy.mjs';
import {
  verifyNodeAdmission,
  verifyNodeRenewal,
  verifyStorageOffer
} from '../lib/nodes.mjs';
import { encryptForRecipient } from '../lib/recipient-encryption.mjs';
import {
  compareVersionVectors,
  verifyCausalBundle
} from '../lib/causal-sync.mjs';
import {
  discoverAdmittedNodes,
  effectiveScheduleStatus,
  normalizeNodeDiscoveryQuery,
  normalizeNodeScheduleRequest,
  selectNodePlacements
} from '../lib/node-scheduling.mjs';

const GENESIS_HASH = '0'.repeat(64);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const CAPSULE_ID = /^[a-z][a-z0-9.-]{2,127}$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/;
const PROTECTED_COLUMN_MAPPINGS = Object.freeze([
  ['events', 'event_id', ['payload_json']],
  ['intents', 'intent_id', ['result_json', 'error_json']],
  ['capsules', 'digest', ['manifest_json']],
  ['consents', 'consent_id', ['scopes_json']],
  ['proposals', 'proposal_id', ['action_json', 'rollback_json']],
  ['nodes', 'node_id', [
    'capabilities_json',
    'discovery_json',
    'public_key_json',
    'quarantine_reason_json'
  ]],
  ['storage_offers', 'offer_id', ['regions_json', 'signature_json']],
  ['exports', 'export_id', ['scope_json', 'manifest_json']],
  ['backups', 'backup_id', ['manifest_json']],
  ['memory_objects', 'object_id', ['payload_json']],
  ['memory_edges', 'edge_id', ['metadata_json']],
  ['accounting_journals', 'journal_id', ['memo_json']],
  ['accounting_entries', "journal_id || ':' || line_no", ['metadata_json']],
  ['imports', 'import_id', ['manifest_json', 'diff_json']],
  [
    'import_records',
    "import_id || ':' || record_type || ':' || record_key",
    ['record_json']
  ],
  ['policy_overlays', 'overlay_id', ['policy_json', 'rollback_reason_json']],
  ['governance_appeals', 'appeal_id', ['grounds_json']],
  ['sync_bundles', 'bundle_digest', ['result_json']],
  ['sync_updates', 'update_id', [
    'value_json',
    'vector_json',
    'resolves_json',
    'signature_json'
  ]],
  ['node_schedules', 'schedule_id', [
    'requirements_json',
    'placements_json'
  ]]
]);

export class GridStore {
  constructor({ path, dataDir, identity, protector }) {
    this.path = path;
    this.dataDir = dataDir;
    this.identity = identity;
    this.verificationKeys = loadGridVerificationKeys(dataDir, identity);
    if (!protector) throw new ValidationError('GridStore requires a data protector');
    this.protector = protector;
    this.db = new DatabaseSync(path);
    try {
      this.initialize();
    } catch (error) {
      try {
        this.db.close();
      } catch {
        // Preserve the initialization failure as the authoritative error.
      }
      throw error;
    }
  }

  initialize() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      PRAGMA trusted_schema = OFF;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        trace_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_digest TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        event_hash TEXT NOT NULL UNIQUE,
        signature_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS intents (
        intent_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        principal TEXT NOT NULL,
        action TEXT NOT NULL,
        risk TEXT NOT NULL,
        status TEXT NOT NULL,
        input_digest TEXT NOT NULL,
        request_digest TEXT NOT NULL DEFAULT '',
        result_json TEXT,
        error_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS capsules (
        capsule_id TEXT NOT NULL,
        version TEXT NOT NULL,
        digest TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        signer TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        revoked_at TEXT,
        PRIMARY KEY (capsule_id, version)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS consents (
        consent_id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        controller TEXT NOT NULL,
        purpose TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revocation_handle_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS proposals (
        proposal_id TEXT PRIMARY KEY,
        proposer TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        action_json TEXT NOT NULL,
        status TEXT NOT NULL,
        voting_ends_at TEXT NOT NULL,
        activate_after TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS votes (
        proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
        voter TEXT NOT NULL,
        chamber TEXT NOT NULL,
        choice TEXT NOT NULL,
        weight INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (proposal_id, voter)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS nodes (
        node_id TEXT PRIMARY KEY,
        public_key_digest TEXT NOT NULL,
        security_profile TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        software_digest TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL,
        registered_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS storage_offers (
        offer_id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        capacity_bytes INTEGER NOT NULL,
        available_bytes INTEGER NOT NULL,
        regions_json TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS exports (
        export_id TEXT PRIMARY KEY,
        principal TEXT NOT NULL,
        scope_json TEXT NOT NULL,
        status TEXT NOT NULL,
        bundle_path TEXT,
        manifest_json TEXT,
        requested_at TEXT NOT NULL,
        completed_at TEXT
      ) STRICT;
    `);
    this.db.prepare('INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)').run('last_seq', '0');
    this.db.prepare('INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)').run('last_hash', GENESIS_HASH);
    this.migrations = runMigrations(this.db);
    this.migrateProtectedColumns();
    const chain = this.verifyChain();
    if (!chain.valid) {
      throw new ValidationError(`Grid evidence chain failed startup verification: ${chain.reason}`);
    }
    this.rebuildMaterializedState();
  }

  close() {
    this.db.close();
  }

  transaction(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  protectionContext(table, column, key) {
    return `axiom:${table}.${column}:${key}`;
  }

  protectJson(table, column, key, value) {
    return this.protector.seal(value, this.protectionContext(table, column, key));
  }

  openJson(table, column, key, serialized, options) {
    if (serialized === null || serialized === undefined) return serialized;
    return this.protector.open(
      serialized,
      this.protectionContext(table, column, key),
      options
    );
  }

  decodeProtectedRow(table, keyColumn, row, jsonColumns) {
    const output = { ...row };
    for (const column of jsonColumns) {
      if (output[column] !== null && output[column] !== undefined) {
        output[column] = this.openJson(table, column, row[keyColumn], output[column]);
      }
    }
    return output;
  }

  decodeEventRow(row) {
    return {
      seq: row.seq,
      event_id: row.event_id,
      trace_id: row.trace_id,
      actor: row.actor,
      kind: row.kind,
      subject: row.subject,
      occurred_at: row.occurred_at,
      payload: this.openJson('events', 'payload_json', row.event_id, row.payload_json),
      payload_digest: row.payload_digest,
      prev_hash: row.prev_hash,
      event_hash: row.event_hash,
      signature: JSON.parse(row.signature_json)
    };
  }

  migrateProtectedColumns() {
    this.transaction(() => {
      for (const [table, keyExpression, columns] of PROTECTED_COLUMN_MAPPINGS) {
        const rows = this.db.prepare(
          `SELECT ${keyExpression} AS protection_key, ${columns.join(', ')} FROM ${table}`
        ).all();
        for (const row of rows) {
          for (const column of columns) {
            const serialized = row[column];
            if (serialized === null || serialized === undefined) continue;
            if (this.protector.isProtected(serialized)) {
              this.openJson(table, column, row.protection_key, serialized);
              continue;
            }
            let value;
            try {
              value = JSON.parse(serialized);
            } catch {
              throw new ValidationError(`Legacy ${table}.${column} value is not valid JSON`);
            }
            this.db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${keyExpression} = ?`).run(
              this.protectJson(table, column, row.protection_key, value),
              row.protection_key
            );
          }
        }
      }
    });
  }

  rebuildMaterializedState() {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY seq').all();
    this.transaction(() => {
      for (const table of [
        'sync_heads',
        'sync_updates',
        'sync_bundles',
        'governance_appeals',
        'policy_overlays',
        'import_records',
        'imports',
        'accounting_entries',
        'accounting_journals',
        'accounting_accounts',
        'memory_edges',
        'memory_objects',
        'votes',
        'proposals',
        'storage_offers',
        'node_schedules',
        'nodes',
        'approvals',
        'consents',
        'capsules',
        'backups',
        'exports',
        'intents'
      ]) {
        this.db.exec(`DELETE FROM ${table}`);
      }
      for (const row of rows) {
        const payload = this.openJson('events', 'payload_json', row.event_id, row.payload_json);
        validateMaterializedPayload(row.kind, payload);
        this.applyMaterializedEvent({
          seq: row.seq,
          event_id: row.event_id,
          trace_id: row.trace_id,
          actor: row.actor,
          kind: row.kind,
          subject: row.subject,
          occurred_at: row.occurred_at,
          payload_digest: row.payload_digest,
          prev_hash: row.prev_hash,
          event_hash: row.event_hash,
          payload
        });
      }
    });
  }

  appendEvents({ traceId, actor, events }) {
    assertString(traceId, 'trace_id', { max: 160, pattern: ID });
    assertString(actor, 'actor', { max: 160, pattern: ID });
    if (!Array.isArray(events) || events.length < 1 || events.length > 32) {
      throw new ValidationError('events must contain 1-32 items');
    }
    try {
      return this.transaction(() => {
      let seq = Number(this.db.prepare("SELECT value FROM meta WHERE key = 'last_seq'").get().value);
      let prevHash = this.db.prepare("SELECT value FROM meta WHERE key = 'last_hash'").get().value;
      const appended = [];
      for (const raw of events) {
        const event = normalizeEvent(raw);
        seq += 1;
        const occurredAt = new Date().toISOString();
        const eventId = raw.event_id ?? newId('evt');
        const payloadDigest = digestObject(event.payload);
        const payloadJson = this.protectJson('events', 'payload_json', eventId, event.payload);
        const envelope = {
          seq,
          event_id: eventId,
          trace_id: traceId,
          actor,
          kind: event.kind,
          subject: event.subject,
          occurred_at: occurredAt,
          payload_digest: payloadDigest,
          prev_hash: prevHash
        };
        const eventHash = digestObject(envelope);
        const signature = this.identity.signObject({ event_hash: eventHash });
        this.db.prepare(`
          INSERT INTO events(
            seq, event_id, trace_id, actor, kind, subject, occurred_at,
            payload_json, payload_digest, prev_hash, event_hash, signature_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          seq,
          eventId,
          traceId,
          actor,
          event.kind,
          event.subject,
          occurredAt,
          payloadJson,
          payloadDigest,
          prevHash,
          eventHash,
          canonicalJson(signature)
        );
        this.applyMaterializedEvent({
          ...envelope,
          event_hash: eventHash,
          payload: event.payload
        });
        appended.push({ ...envelope, event_hash: eventHash, signature });
        prevHash = eventHash;
      }
      this.db.prepare("UPDATE meta SET value = ? WHERE key = 'last_seq'").run(String(seq));
      this.db.prepare("UPDATE meta SET value = ? WHERE key = 'last_hash'").run(prevHash);
        return appended;
      });
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed: intents.intent_id')) {
        throw new AxiomError('intent_already_exists', 'This idempotent intent already exists', 409);
      }
      if (String(error.message).includes('UNIQUE constraint failed')) {
        throw new AxiomError('state_conflict', 'The requested state already exists', 409);
      }
      throw error;
    }
  }

  preflightExportRequest(actor, rawEvent) {
    assertString(actor, 'actor', { max: 160, pattern: ID });
    const event = normalizeEvent(rawEvent);
    if (event.kind !== 'export.requested') {
      throw new ValidationError('Export preflight requires an export.requested event');
    }
    if (event.payload.principal !== actor) {
      throw new ValidationError('Export principal must match the authenticated actor');
    }
    this.collectExportRecords(actor, event.payload.scope);
  }

  applyMaterializedEvent(event) {
    const p = event.payload;
    switch (event.kind) {
      case 'intent.accepted':
        this.db.prepare(`
          INSERT INTO intents(
            intent_id, trace_id, principal, action, risk, status, input_digest,
            request_digest, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?)
        `).run(
          p.intent_id,
          event.trace_id,
          p.principal,
          p.action,
          p.risk,
          p.input_digest,
          p.request_digest,
          event.occurred_at,
          event.occurred_at
        );
        break;
      case 'intent.denied':
      case 'intent.failed':
        this.db.prepare('UPDATE intents SET status = ?, error_json = ?, updated_at = ? WHERE intent_id = ?').run(
          event.kind.split('.')[1],
          this.protectJson('intents', 'error_json', p.intent_id, p.error),
          event.occurred_at,
          p.intent_id
        );
        break;
      case 'intent.completed':
        this.db.prepare('UPDATE intents SET status = ?, result_json = ?, updated_at = ? WHERE intent_id = ?').run(
          'completed',
          this.protectJson('intents', 'result_json', p.intent_id, p.result),
          event.occurred_at,
          p.intent_id
        );
        break;
      case 'capsule.registered':
        this.db.prepare(`
          INSERT INTO capsules(
            capsule_id, version, digest, status, manifest_json, signer, registered_at
          ) VALUES (?, ?, ?, 'active', ?, ?, ?)
        `).run(
          p.capsule_id,
          p.version,
          p.digest,
          this.protectJson('capsules', 'manifest_json', p.digest, p.manifest),
          p.signer,
          event.occurred_at
        );
        break;
      case 'capsule.revoked':
        if (this.db.prepare('UPDATE capsules SET status = ?, revoked_at = ? WHERE digest = ?').run(
          'revoked',
          event.occurred_at,
          p.digest
        ).changes !== 1) throw new ValidationError('Capsule digest was not found');
        break;
      case 'consent.granted':
        this.db.prepare(`
          INSERT INTO consents(
            consent_id, subject, controller, purpose, scopes_json, expires_at,
            revocation_handle_hash, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
        `).run(
          p.consent_id,
          p.subject,
          p.controller,
          p.purpose,
          this.protectJson('consents', 'scopes_json', p.consent_id, p.scopes),
          p.expires_at,
          p.revocation_handle_hash,
          event.occurred_at
        );
        break;
      case 'consent.revoked':
        if (this.db.prepare(`
          UPDATE consents
          SET status = ?, revoked_at = ?
          WHERE consent_id = ? AND revocation_handle_hash = ? AND status = 'active'
        `).run(
          'revoked',
          event.occurred_at,
          p.consent_id,
          p.revocation_handle_hash
        ).changes !== 1) throw new ValidationError('Consent receipt was not found');
        break;
      case 'approval.granted':
        this.db.prepare(`
          INSERT INTO approvals(
            approval_id, approver, requester, action, request_digest, expires_at,
            status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
        `).run(
          p.approval_id,
          p.approver,
          p.requester,
          p.action,
          p.request_digest,
          p.expires_at,
          event.occurred_at
        );
        break;
      case 'approval.consumed':
        if (this.db.prepare(`
          UPDATE approvals
          SET status = 'consumed', consumed_at = ?, consumed_by_intent = ?
          WHERE approval_id = ? AND status = 'active' AND expires_at > ?
        `).run(
          event.occurred_at,
          p.intent_id,
          p.approval_id,
          event.occurred_at
        ).changes !== 1) {
          throw new AxiomError('approval_unavailable', 'Approval is expired, consumed, or unavailable', 409);
        }
        break;
      case 'governance.proposed':
        {
          const action = normalizeStoredGovernanceAction(p.action);
        this.db.prepare(`
          INSERT INTO proposals(
            proposal_id, proposer, title, body, action_json, status,
            voting_ends_at, activate_after, created_at, rollback_json
          ) VALUES (?, ?, ?, ?, ?, 'voting', ?, ?, ?, ?)
        `).run(
          p.proposal_id,
          p.proposer,
          p.title,
          p.body,
          this.protectJson('proposals', 'action_json', p.proposal_id, action),
          p.voting_ends_at,
          p.activate_after,
          event.occurred_at,
          this.protectJson('proposals', 'rollback_json', p.proposal_id, action.rollback)
        );
        }
        break;
      case 'governance.voted':
        {
          const proposal = this.db.prepare(`
            SELECT status, voting_ends_at FROM proposals WHERE proposal_id = ?
          `).get(p.proposal_id);
          if (
            !proposal
            || proposal.status !== 'voting'
            || proposal.voting_ends_at <= event.occurred_at
          ) {
            throw new AxiomError('voting_closed', 'Proposal is not open for voting', 409);
          }
        }
        this.db.prepare(`
          INSERT INTO votes(proposal_id, voter, chamber, choice, weight, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(p.proposal_id, p.voter, p.chamber, p.choice, p.weight, event.occurred_at);
        break;
      case 'governance.finalized':
        this.finalizeGovernanceProposal(p.proposal_id, event.occurred_at);
        break;
      case 'governance.activated':
        this.activateGovernanceProposal(p.proposal_id, event.occurred_at);
        break;
      case 'governance.verified':
        if (this.db.prepare(`
          UPDATE proposals
          SET status = 'verified', verified_at = ?, verification_digest = ?
          WHERE proposal_id = ? AND status = 'active'
        `).run(event.occurred_at, p.verification_digest, p.proposal_id).changes !== 1) {
          throw new ValidationError('Active proposal was not found for verification');
        }
        break;
      case 'governance.rolled-back':
        if (this.db.prepare(`
          UPDATE proposals SET status = 'rolled_back', rolled_back_at = ?
          WHERE proposal_id = ? AND status IN ('active', 'verified')
        `).run(event.occurred_at, p.proposal_id).changes !== 1) {
          throw new ValidationError('Active or verified proposal was not found for rollback');
        }
        this.db.prepare(`
          UPDATE policy_overlays
          SET status = 'rolled_back', rollback_reason_json = ?
          WHERE proposal_id = ? AND status = 'active'
        `).run(
          this.protectJson('policy_overlays', 'rollback_reason_json', p.proposal_id, {
            reason: p.reason,
            rolled_back_by: p.rolled_back_by,
            rolled_back_at: event.occurred_at
          }),
          p.proposal_id
        );
        break;
      case 'governance.emergency.activated':
        if (
          p.expires_at <= event.occurred_at
          || new Date(p.expires_at).valueOf() - new Date(event.occurred_at).valueOf() > 86_400_000
        ) {
          throw new ValidationError('Emergency policy expiry is outside the allowed window');
        }
        this.db.prepare(`
          INSERT INTO policy_overlays(
            overlay_id, source_type, policy_digest, policy_json, status,
            activated_at, expires_at, review_by
          ) VALUES (?, 'emergency', ?, ?, 'active', ?, ?, ?)
        `).run(
          p.overlay_id,
          p.policy_digest,
          this.protectJson('policy_overlays', 'policy_json', p.overlay_id, p.policy),
          event.occurred_at,
          p.expires_at,
          p.review_by
        );
        break;
      case 'governance.emergency.reviewed':
        if (this.db.prepare(`
          UPDATE policy_overlays SET reviewed_at = ?, rollback_reason_json = ?
          WHERE overlay_id = ? AND source_type = 'emergency'
        `).run(
          event.occurred_at,
          this.protectJson('policy_overlays', 'rollback_reason_json', p.overlay_id, {
            findings: p.findings,
            reviewed_by: p.reviewed_by
          }),
          p.overlay_id
        ).changes !== 1) throw new ValidationError('Emergency policy was not found');
        break;
      case 'governance.appeal.filed':
        this.db.prepare(`
          INSERT INTO governance_appeals(
            appeal_id, appellant, target_type, target_id, grounds_json,
            desired_resolution, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
        `).run(
          p.appeal_id,
          p.appellant,
          p.target_type,
          p.target_id,
          this.protectJson('governance_appeals', 'grounds_json', p.appeal_id, p.grounds),
          p.desired_resolution,
          event.occurred_at
        );
        break;
      case 'node.registered':
        {
          const admission = p.admission
            ? verifyNodeAdmission({
              ...p.admission.statement,
              signature: p.admission.signature
            }, { requireFuture: false })
            : null;
          const statement = admission?.statement ?? p;
          const status = admission ? 'active' : 'legacy';
          if (admission && statement.expires_at <= event.occurred_at) {
            throw new ValidationError('Node admission expired before it was recorded');
          }
          if (admission) {
            const duplicateKey = this.db.prepare(`
              SELECT node_id FROM nodes
              WHERE public_key_digest = ? AND status = 'active'
                AND expires_at > ? AND node_id != ?
            `).get(
              admission.public_key_digest,
              event.occurred_at,
              statement.node_id
            );
            if (duplicateKey) {
              throw new AxiomError(
                'node_identity_conflict',
                'An active admitted node already uses this signing identity',
                409
              );
            }
            const ownerCount = this.db.prepare(`
              SELECT COUNT(*) AS count FROM nodes
              WHERE owner = ? AND status = 'active' AND expires_at > ?
            `).get(p.owner, event.occurred_at).count;
            if (ownerCount >= 64) {
              throw new AxiomError(
                'node_owner_limit',
                'The authenticated owner has reached the active-node limit',
                409
              );
            }
          }
        this.db.prepare(`
          INSERT INTO nodes(
            node_id, public_key_digest, security_profile, capabilities_json,
            software_digest, expires_at, status, registered_at, owner,
            public_key_json, admission_digest, discovery_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          statement.node_id,
          admission?.public_key_digest ?? p.public_key_digest,
          statement.security_profile,
          this.protectJson('nodes', 'capabilities_json', statement.node_id, statement.capabilities),
          statement.software_digest,
          statement.expires_at,
          status,
          event.occurred_at,
          p.owner ?? 'legacy:unknown',
          admission
            ? this.protectJson('nodes', 'public_key_json', statement.node_id, statement.public_key)
            : null,
          admission?.admission_digest ?? null,
          statement.discovery
            ? this.protectJson(
              'nodes',
              'discovery_json',
              statement.node_id,
              statement.discovery
            )
            : null
        );
        }
        break;
      case 'node.renewed':
        {
          const renewal = verifyNodeRenewal({
            ...p.renewal.statement,
            public_key: p.renewal.public_key,
            signature: p.renewal.signature
          }, { requireFuture: false });
          if (renewal.statement.expires_at <= event.occurred_at) {
            throw new ValidationError('Node renewal expired before it was recorded');
          }
          const renewable = this.db.prepare(`
            SELECT discovery_json, expires_at FROM nodes
            WHERE node_id = ? AND owner = ? AND public_key_digest = ?
              AND status != 'quarantined'
          `).get(
            renewal.statement.node_id,
            p.owner,
            renewal.public_key_digest
          );
          if (!renewable) {
            throw new ValidationError('Renewable node admission was not found');
          }
          if (renewable.discovery_json && !renewal.statement.discovery) {
            throw new ValidationError(
              'Discovery-capable node renewal cannot downgrade to v1'
            );
          }
          if (renewable.expires_at <= event.occurred_at) {
            this.degradeNodeSchedules(renewal.statement.node_id);
          }
          if (this.db.prepare(`
            UPDATE nodes
            SET capabilities_json = ?, software_digest = ?, expires_at = ?,
                status = 'active', renewed_at = ?, discovery_json = ?
            WHERE node_id = ? AND owner = ? AND public_key_digest = ?
              AND status != 'quarantined'
          `).run(
            this.protectJson(
              'nodes',
              'capabilities_json',
              renewal.statement.node_id,
              renewal.statement.capabilities
            ),
            renewal.statement.software_digest,
            renewal.statement.expires_at,
            event.occurred_at,
            renewal.statement.discovery
              ? this.protectJson(
                'nodes',
                'discovery_json',
                renewal.statement.node_id,
                renewal.statement.discovery
              )
              : null,
            renewal.statement.node_id,
            p.owner,
            renewal.public_key_digest
          ).changes !== 1) throw new ValidationError('Renewable node admission was not found');
          this.degradeIneligibleNodeSchedules(
            renewal.statement.node_id,
            event.occurred_at
          );
        }
        break;
      case 'node.quarantined':
        if (this.db.prepare(`
          UPDATE nodes
          SET status = 'quarantined', quarantined_at = ?, quarantine_reason_json = ?
          WHERE node_id = ? AND status IN ('active', 'legacy')
        `).run(
          event.occurred_at,
          this.protectJson('nodes', 'quarantine_reason_json', p.node_id, {
            reason: p.reason,
            quarantined_by: p.quarantined_by
          }),
          p.node_id
        ).changes !== 1) throw new ValidationError('Quarantinable node was not found');
        this.db.prepare(`
          UPDATE storage_offers SET status = 'quarantined'
          WHERE node_id = ? AND status = 'active'
        `).run(p.node_id);
        this.degradeNodeSchedules(p.node_id);
        break;
      case 'node.schedule.requested':
        {
          if (p.requester !== event.actor) {
            throw new ValidationError(
              'Node schedule requester must match the authenticated actor'
            );
          }
          const normalized = normalizeNodeScheduleRequest(
            p.request,
            p.requester
          );
          if (
            normalized.schedule_id !== p.schedule_id
            || normalized.request_digest !== p.request_digest
            || event.subject !== p.schedule_id
          ) {
            throw new ValidationError('Node schedule request binding is invalid');
          }
          const schedule = selectNodePlacements({
            nodes: this.decodedNodes(),
            schedules: this.decodedSchedules(),
            normalizedRequest: normalized,
            occurredAt: event.occurred_at
          });
          this.db.prepare(`
            INSERT INTO node_schedules(
              schedule_id, requester, request_digest, requirements_json,
              placements_json, status, created_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            schedule.schedule_id,
            schedule.requester,
            schedule.request_digest,
            this.protectJson(
              'node_schedules',
              'requirements_json',
              schedule.schedule_id,
              schedule.requirements
            ),
            this.protectJson(
              'node_schedules',
              'placements_json',
              schedule.schedule_id,
              schedule.placements
            ),
            schedule.status,
            schedule.created_at,
            schedule.expires_at
          );
        }
        break;
      case 'storage.offered':
        {
          const offer = p.offer
            ? verifyStorageOffer({
              ...p.offer.statement,
              public_key: p.offer.public_key,
              signature: p.offer.signature
            }, { requireFuture: false })
            : null;
          const statement = offer?.statement ?? p;
          if (offer && statement.expires_at <= event.occurred_at) {
            throw new ValidationError('Storage offer expired before it was recorded');
          }
          if (offer) {
            const node = this.db.prepare(`
              SELECT owner, status, expires_at, public_key_digest
              FROM nodes WHERE node_id = ?
            `).get(statement.node_id);
            if (
              !node
              || node.owner !== p.owner
              || node.status !== 'active'
              || node.expires_at <= event.occurred_at
              || node.public_key_digest !== offer.public_key_digest
            ) throw new ValidationError('Storage offer is not bound to an active admitted node');
          }
        this.db.prepare(`
          INSERT INTO storage_offers(
            offer_id, node_id, capacity_bytes, available_bytes, regions_json,
            expires_at, status, created_at, owner, public_key_digest,
            offer_digest, signature_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          offer?.offer_id ?? p.offer_id,
          statement.node_id,
          statement.capacity_bytes,
          statement.available_bytes,
          this.protectJson(
            'storage_offers',
            'regions_json',
            offer?.offer_id ?? p.offer_id,
            statement.regions
          ),
          statement.expires_at,
          offer ? 'active' : 'legacy',
          event.occurred_at,
          p.owner ?? 'legacy:unknown',
          offer?.public_key_digest ?? null,
          offer?.offer_digest ?? null,
          offer
            ? this.protectJson(
              'storage_offers',
              'signature_json',
              offer.offer_id,
              offer.signature
            )
            : null
        );
        }
        break;
      case 'sync.bundle.applied':
        if (p.owner !== event.actor) {
          throw new ValidationError('Causal sync owner must match the authenticated actor');
        }
        this.applyCausalSyncBundle(p, event.occurred_at);
        break;
      case 'memory.put':
        this.db.prepare(`
          INSERT OR IGNORE INTO memory_objects(
            object_id, owner, kind, content_digest, payload_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, 'active', ?)
        `).run(
          p.object_id,
          p.owner,
          p.kind,
          p.content_digest,
          this.protectJson('memory_objects', 'payload_json', p.object_id, {
            content: p.content,
            metadata: p.metadata
          }),
          event.occurred_at
        );
        break;
      case 'memory.linked':
        this.requireOwnedMemoryObject(p.from_id, p.owner);
        this.requireOwnedMemoryObject(p.to_id, p.owner);
        this.db.prepare(`
          INSERT OR IGNORE INTO memory_edges(
            edge_id, owner, from_id, to_id, relation, metadata_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
        `).run(
          p.edge_id,
          p.owner,
          p.from_id,
          p.to_id,
          p.relation,
          this.protectJson('memory_edges', 'metadata_json', p.edge_id, p.metadata),
          event.occurred_at
        );
        break;
      case 'memory.tombstoned':
        if (this.db.prepare(`
          UPDATE memory_objects
          SET status = 'tombstoned', tombstoned_at = ?
          WHERE object_id = ? AND owner = ? AND status = 'active'
        `).run(event.occurred_at, p.object_id, p.owner).changes !== 1) {
          throw new ValidationError('Active memory object was not found');
        }
        this.db.prepare(`
          UPDATE memory_edges SET status = 'tombstoned'
          WHERE owner = ? AND (from_id = ? OR to_id = ?)
        `).run(p.owner, p.object_id, p.object_id);
        break;
      case 'accounting.account.created':
        this.db.prepare(`
          INSERT INTO accounting_accounts(account_id, owner, unit, name, status, created_at)
          VALUES (?, ?, ?, ?, 'active', ?)
        `).run(p.account_id, p.owner, p.unit, p.name, event.occurred_at);
        break;
      case 'accounting.journal.posted':
        this.applyAccountingJournal(p, event.occurred_at);
        break;
      case 'import.staged':
        this.applyStagedImport(p, event.occurred_at);
        break;
      case 'import.applied':
        this.applyImportedRecords(p, event.occurred_at);
        break;
      case 'export.requested':
        if (p.principal !== event.actor) {
          throw new ValidationError('Export principal must match the authenticated actor');
        }
        this.db.prepare(`
          INSERT INTO exports(export_id, principal, scope_json, status, requested_at)
          VALUES (?, ?, ?, 'pending', ?)
        `).run(
          p.export_id,
          p.principal,
          this.protectJson('exports', 'scope_json', p.export_id, p.scope),
          event.occurred_at
        );
        break;
      case 'export.completed':
        this.db.prepare(`
          UPDATE exports
          SET status = 'completed', bundle_path = ?, manifest_json = ?, completed_at = ?
          WHERE export_id = ?
        `).run(
          p.bundle_path,
          this.protectJson('exports', 'manifest_json', p.export_id, p.manifest),
          event.occurred_at,
          p.export_id
        );
        break;
      case 'backup.requested':
        this.db.prepare(`
          INSERT INTO backups(backup_id, principal, status, requested_at)
          VALUES (?, ?, 'pending', ?)
        `).run(p.backup_id, p.principal, event.occurred_at);
        break;
      case 'backup.completed':
        if (this.db.prepare(`
          UPDATE backups
          SET status = 'completed', manifest_json = ?, manifest_path = ?,
              snapshot_path = ?, database_digest = ?, completed_at = ?
          WHERE backup_id = ? AND status = 'pending'
        `).run(
          this.protectJson('backups', 'manifest_json', p.backup_id, p.manifest),
          p.manifest_path,
          p.snapshot_path,
          p.manifest.database.sha256,
          event.occurred_at,
          p.backup_id
        ).changes !== 1) throw new ValidationError('Pending backup was not found');
        break;
      case 'backup.restored':
        this.db.prepare(`
          INSERT INTO backups(
            backup_id, principal, status, manifest_json, database_digest,
            requested_at, restored_at, recovery_id, rollback_path
          ) VALUES (?, ?, 'restored', ?, ?, ?, ?, ?, ?)
          ON CONFLICT(backup_id) DO UPDATE SET
            status = 'restored',
            manifest_json = excluded.manifest_json,
            database_digest = excluded.database_digest,
            restored_at = excluded.restored_at,
            recovery_id = excluded.recovery_id,
            rollback_path = excluded.rollback_path
        `).run(
          p.backup_id,
          p.manifest.principal,
          this.protectJson('backups', 'manifest_json', p.backup_id, p.manifest),
          p.database_digest,
          p.manifest.created_at,
          event.occurred_at,
          p.recovery_id,
          p.rollback_path
        );
        break;
      default:
        break;
    }
  }

  getStatus() {
    const lastSeq = Number(this.db.prepare("SELECT value FROM meta WHERE key = 'last_seq'").get().value);
    const lastHash = this.db.prepare("SELECT value FROM meta WHERE key = 'last_hash'").get().value;
    return {
      mode: 'single-node-transparency-log',
      consensus: false,
      schema_version: Number(this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get().value),
      last_seq: lastSeq,
      last_hash: lastHash,
      intents: this.db.prepare('SELECT COUNT(*) AS count FROM intents').get().count,
      capsules: this.db.prepare("SELECT COUNT(*) AS count FROM capsules WHERE status = 'active'").get().count,
      nodes: this.db.prepare(`
        SELECT COUNT(*) AS count FROM nodes WHERE status = 'active' AND expires_at > ?
      `).get(new Date().toISOString()).count,
      backups: this.db.prepare("SELECT COUNT(*) AS count FROM backups WHERE status IN ('completed', 'restored')").get().count,
      sync_records: this.db.prepare(`
        SELECT COUNT(*) AS count FROM (
          SELECT owner, namespace, record_id FROM sync_heads
          GROUP BY owner, namespace, record_id
        )
      `).get().count,
      sync_conflicts: this.db.prepare(`
        SELECT COUNT(*) AS count FROM (
          SELECT owner, namespace, record_id FROM sync_heads
          GROUP BY owner, namespace, record_id
          HAVING COUNT(*) > 1
        )
      `).get().count
    };
  }

  getIntent(intentId) {
    const row = this.db.prepare('SELECT * FROM intents WHERE intent_id = ?').get(intentId);
    if (!row) throw new AxiomError('intent_not_found', 'Intent was not found', 404);
    return this.decodeProtectedRow('intents', 'intent_id', row, ['result_json', 'error_json']);
  }

  listEvents({ after = 0, limit = 100, actor } = {}) {
    const safeAfter = boundedInteger(after, 'event after', 0, Number.MAX_SAFE_INTEGER);
    const safeLimit = boundedInteger(limit, 'event limit', 1, 500);
    const rows = actor
      ? this.db.prepare('SELECT * FROM events WHERE seq > ? AND actor = ? ORDER BY seq LIMIT ?').all(safeAfter, actor, safeLimit)
      : this.db.prepare('SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT ?').all(safeAfter, safeLimit);
    return rows.map(row => this.decodeEventRow(row));
  }

  listCapsules({ limit } = {}) {
    const rows = limit === undefined
      ? this.db.prepare('SELECT * FROM capsules ORDER BY registered_at DESC').all()
      : this.db.prepare('SELECT * FROM capsules ORDER BY registered_at DESC LIMIT ?').all(
          boundedInteger(limit, 'capsule list limit', 1, 100)
        );
    return rows.map(
      row => this.decodeProtectedRow('capsules', 'digest', row, ['manifest_json'])
    );
  }

  listProposals({ limit } = {}) {
    const safeLimit = limit === undefined
      ? null
      : boundedInteger(limit, 'proposal list limit', 1, 100);
    const sql = `
      SELECT
        p.*,
        COALESCE(SUM(CASE WHEN v.chamber = 'human' AND v.choice = 'for' THEN v.weight ELSE 0 END), 0) AS human_for,
        COALESCE(SUM(CASE WHEN v.chamber = 'human' AND v.choice = 'against' THEN v.weight ELSE 0 END), 0) AS human_against,
        COALESCE(SUM(CASE WHEN v.chamber = 'agent' AND v.choice = 'for' THEN v.weight ELSE 0 END), 0) AS agent_for,
        COALESCE(SUM(CASE WHEN v.chamber = 'agent' AND v.choice = 'against' THEN v.weight ELSE 0 END), 0) AS agent_against
      FROM proposals p
      LEFT JOIN votes v ON v.proposal_id = p.proposal_id
      GROUP BY p.proposal_id
      ORDER BY p.created_at DESC
      ${safeLimit === null ? '' : 'LIMIT ?'}
    `;
    const rows = safeLimit === null
      ? this.db.prepare(sql).all()
      : this.db.prepare(sql).all(safeLimit);
    return rows.map(row => this.decodeProtectedRow(
      'proposals',
      'proposal_id',
      row,
      ['action_json', 'rollback_json']
    ));
  }

  finalizeGovernanceProposal(proposalId, occurredAt) {
    const proposal = this.db.prepare(`
      SELECT status, voting_ends_at FROM proposals WHERE proposal_id = ?
    `).get(proposalId);
    if (!proposal || proposal.status !== 'voting') {
      throw new ValidationError('Voting proposal was not found');
    }
    if (proposal.voting_ends_at > occurredAt) {
      throw new AxiomError('voting_open', 'Proposal voting period has not ended', 409);
    }
    const votes = this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN chamber = 'human' AND choice = 'for' THEN weight ELSE 0 END), 0) AS human_for,
        COALESCE(SUM(CASE WHEN chamber = 'human' AND choice = 'against' THEN weight ELSE 0 END), 0) AS human_against
      FROM votes WHERE proposal_id = ?
    `).get(proposalId);
    const status = votes.human_for >= 1 && votes.human_for > votes.human_against
      ? 'approved'
      : 'rejected';
    this.db.prepare(`
      UPDATE proposals SET status = ?, finalized_at = ? WHERE proposal_id = ?
    `).run(status, occurredAt, proposalId);
  }

  activateGovernanceProposal(proposalId, occurredAt) {
    const row = this.db.prepare(`
      SELECT * FROM proposals WHERE proposal_id = ? AND status = 'approved'
    `).get(proposalId);
    if (!row) throw new ValidationError('Approved proposal was not found');
    if (row.activate_after > occurredAt) {
      throw new AxiomError('timelock_active', 'Proposal activation timelock has not elapsed', 409);
    }
    const action = this.openJson('proposals', 'action_json', proposalId, row.action_json);
    if (action.type === 'policy.overlay') {
      validateAuthorityReducingPolicy(action.policy);
      this.db.prepare(`
        INSERT INTO policy_overlays(
          overlay_id, proposal_id, source_type, policy_digest, policy_json,
          status, activated_at
        ) VALUES (?, ?, 'proposal', ?, ?, 'active', ?)
      `).run(
        proposalId,
        proposalId,
        digestObject(action.policy),
        this.protectJson('policy_overlays', 'policy_json', proposalId, action.policy),
        occurredAt
      );
    }
    this.db.prepare(`
      UPDATE proposals SET status = 'active', activated_at = ? WHERE proposal_id = ?
    `).run(occurredAt, proposalId);
  }

  listActivePolicyOverlays(now = new Date().toISOString()) {
    return this.db.prepare(`
      SELECT overlay_id, proposal_id, source_type, policy_digest, policy_json,
             activated_at, expires_at, review_by, reviewed_at
      FROM policy_overlays
      WHERE status = 'active' AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY activated_at, overlay_id
    `).all(now).map(row => this.decodeProtectedRow(
      'policy_overlays',
      'overlay_id',
      row,
      ['policy_json']
    ));
  }

  listGovernanceAppeals(principal) {
    return this.db.prepare(`
      SELECT * FROM governance_appeals
      WHERE appellant = ?
      ORDER BY created_at DESC
    `).all(principal).map(row => this.decodeProtectedRow(
      'governance_appeals',
      'appeal_id',
      row,
      ['grounds_json']
    ));
  }

  listConsents(principal) {
    return this.db.prepare(`
      SELECT consent_id, subject, controller, purpose, scopes_json, expires_at,
             status, created_at, revoked_at
      FROM consents
      WHERE subject = ? OR controller = ?
      ORDER BY created_at DESC
    `).all(principal, principal).map(
      row => this.decodeProtectedRow('consents', 'consent_id', row, ['scopes_json'])
    );
  }

  listApprovals(principal, { limit = 100 } = {}) {
    const safeLimit = boundedInteger(limit, 'approval limit', 1, 100);
    const rows = this.db.prepare(`
      SELECT * FROM approvals
      WHERE approver = ? OR requester = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(principal, principal, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return { approvals: rows, truncated };
  }

  getApproval(approvalId) {
    const row = this.db.prepare('SELECT * FROM approvals WHERE approval_id = ?').get(approvalId);
    if (!row) throw new AxiomError('approval_not_found', 'Approval was not found', 404);
    return row;
  }

  requireOwnedMemoryObject(objectId, owner) {
    const row = this.db.prepare(`
      SELECT object_id FROM memory_objects
      WHERE object_id = ? AND owner = ? AND status = 'active'
    `).get(objectId, owner);
    if (!row) throw new ValidationError('Owned active memory object was not found');
    return row;
  }

  listMemory(requester, owner = requester, { limit = 100 } = {}) {
    const safeLimit = boundedInteger(limit, 'memory limit', 1, 500);
    const objects = this.db.prepare(`
      SELECT * FROM memory_objects
      WHERE owner = ? AND status = 'active'
      ORDER BY created_at, object_id
      LIMIT ?
    `).all(owner, safeLimit + 1);
    const truncated = objects.length > safeLimit;
    if (truncated) objects.pop();
    const visible = owner === requester
      ? objects
      : objects.filter(row => this.hasMemoryConsent(owner, requester, row.object_id));
    const visibleIds = new Set(visible.map(row => row.object_id));
    const decodedObjects = visible.map(row => this.decodeProtectedRow(
      'memory_objects',
      'object_id',
      row,
      ['payload_json']
    ));
    const edges = !visibleIds.size ? [] : this.db.prepare(`
      SELECT * FROM memory_edges
      WHERE owner = ? AND status = 'active'
      ORDER BY created_at, edge_id
    `).all(owner)
      .filter(row => visibleIds.has(row.from_id) && visibleIds.has(row.to_id))
      .map(row => this.decodeProtectedRow('memory_edges', 'edge_id', row, ['metadata_json']));
    return { owner, objects: decodedObjects, edges, truncated };
  }

  hasMemoryConsent(owner, controller, objectId) {
    const rows = this.db.prepare(`
      SELECT consent_id, scopes_json FROM consents
      WHERE subject = ? AND controller = ? AND status = 'active' AND expires_at > ?
    `).all(owner, controller, new Date().toISOString());
    return rows.some(row => {
      const scopes = this.openJson('consents', 'scopes_json', row.consent_id, row.scopes_json);
      return scopes.includes('memory:read') || scopes.includes(`memory:${objectId}:read`);
    });
  }

  applyAccountingJournal(p, occurredAt) {
    if (p.entries.reduce((sum, entry) => sum + entry.amount, 0) !== 0) {
      throw new ValidationError('Accounting journal is not balanced');
    }
    for (const entry of p.entries) {
      const account = this.db.prepare(`
        SELECT owner, unit, status FROM accounting_accounts WHERE account_id = ?
      `).get(entry.account_id);
      if (!account || account.status !== 'active' || account.owner !== p.owner || account.unit !== p.unit) {
        throw new ValidationError('Accounting entry references an unavailable account or mismatched unit');
      }
    }
    this.db.prepare(`
      INSERT INTO accounting_journals(journal_id, owner, unit, reference, memo_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      p.journal_id,
      p.owner,
      p.unit,
      p.reference,
      this.protectJson('accounting_journals', 'memo_json', p.journal_id, p.memo),
      occurredAt
    );
    p.entries.forEach((entry, lineNo) => {
      const key = `${p.journal_id}:${lineNo}`;
      this.db.prepare(`
        INSERT INTO accounting_entries(journal_id, line_no, account_id, amount, metadata_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        p.journal_id,
        lineNo,
        entry.account_id,
        entry.amount,
        this.protectJson('accounting_entries', 'metadata_json', key, entry.metadata)
      );
    });
  }

  listAccounting(owner) {
    const accounts = this.db.prepare(`
      SELECT * FROM accounting_accounts WHERE owner = ? ORDER BY unit, account_id
    `).all(owner);
    const journals = this.db.prepare(`
      SELECT * FROM accounting_journals WHERE owner = ? ORDER BY created_at, journal_id
    `).all(owner).map(row => {
      const journal = this.decodeProtectedRow(
        'accounting_journals',
        'journal_id',
        row,
        ['memo_json']
      );
      journal.entries = this.db.prepare(`
        SELECT * FROM accounting_entries WHERE journal_id = ? ORDER BY line_no
      `).all(row.journal_id).map(entry => ({
        ...entry,
        metadata_json: this.openJson(
          'accounting_entries',
          'metadata_json',
          `${entry.journal_id}:${entry.line_no}`,
          entry.metadata_json
        )
      }));
      return journal;
    });
    const balances = this.db.prepare(`
      SELECT a.account_id, a.unit, COALESCE(SUM(e.amount), 0) AS balance
      FROM accounting_accounts a
      LEFT JOIN accounting_entries e ON e.account_id = a.account_id
      WHERE a.owner = ?
      GROUP BY a.account_id, a.unit
      ORDER BY a.account_id
    `).all(owner);
    return { accounts, journals, balances };
  }

  applyStagedImport(p, occurredAt) {
    const validated = validateImportBundle({
      manifest: p.manifest,
      bundle: p.bundle,
      gridPublicKey: p.grid_public_key
    });
    const summary = { new: 0, existing: 0, conflicts: 0, records: [] };
    const dispositions = [];
    for (const record of validated.records) {
      const prior = this.db.prepare(`
        SELECT record_digest FROM import_records
        WHERE record_type = ? AND record_key = ? AND disposition = 'applied'
        ORDER BY rowid DESC LIMIT 1
      `).get(record.record_type, record.record_key);
      const disposition = !prior
        ? 'new'
        : prior.record_digest === record.record_digest ? 'existing' : 'conflict';
      summary[disposition === 'conflict' ? 'conflicts' : disposition] += 1;
      summary.records.push({
        record_type: record.record_type,
        record_key: record.record_key,
        record_digest: record.record_digest,
        disposition
      });
      dispositions.push({ ...record, disposition });
    }
    this.db.prepare(`
      INSERT INTO imports(
        import_id, principal, source_principal, source_signer, bundle_digest,
        manifest_json, diff_json, status, staged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'staged', ?)
    `).run(
      p.import_id,
      p.principal,
      validated.verification.principal,
      validated.verification.signer,
      validated.bundle_digest,
      this.protectJson('imports', 'manifest_json', p.import_id, validated.manifest),
      this.protectJson('imports', 'diff_json', p.import_id, summary),
      occurredAt
    );
    for (const record of dispositions) {
      const key = `${p.import_id}:${record.record_type}:${record.record_key}`;
      this.db.prepare(`
        INSERT INTO import_records(
          import_id, record_key, record_type, record_digest, record_json, disposition
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        p.import_id,
        record.record_key,
        record.record_type,
        record.record_digest,
        this.protectJson('import_records', 'record_json', key, record.data),
        record.disposition
      );
    }
  }

  applyImportedRecords(p, occurredAt) {
    const row = this.db.prepare(`
      SELECT import_id, diff_json FROM imports
      WHERE import_id = ? AND principal = ? AND status = 'staged'
    `).get(p.import_id, p.principal);
    if (!row) throw new ValidationError('Staged import was not found');
    const diff = this.openJson('imports', 'diff_json', p.import_id, row.diff_json);
    if (diff.conflicts > 0) throw new AxiomError(
      'import_conflict',
      'Import contains conflicts and cannot be applied',
      409,
      { import_id: p.import_id, conflicts: diff.conflicts }
    );
    this.db.prepare(`
      UPDATE imports SET status = 'applied', applied_at = ? WHERE import_id = ?
    `).run(occurredAt, p.import_id);
    this.db.prepare(`
      UPDATE import_records SET disposition = 'applied'
      WHERE import_id = ? AND disposition = 'new'
    `).run(p.import_id);
  }

  listImports(principal) {
    return this.db.prepare(`
      SELECT * FROM imports WHERE principal = ? ORDER BY staged_at DESC
    `).all(principal).map(row => this.decodeProtectedRow(
      'imports',
      'import_id',
      row,
      ['manifest_json', 'diff_json']
    ));
  }

  getImport(importId, principal) {
    const row = this.db.prepare(`
      SELECT * FROM imports WHERE import_id = ? AND principal = ?
    `).get(importId, principal);
    if (!row) throw new AxiomError('import_not_found', 'Import was not found', 404);
    const output = this.decodeProtectedRow(
      'imports',
      'import_id',
      row,
      ['manifest_json', 'diff_json']
    );
    output.records = this.db.prepare(`
      SELECT * FROM import_records
      WHERE import_id = ?
      ORDER BY record_type, record_key
    `).all(importId).map(record => ({
      ...record,
      record_json: this.openJson(
        'import_records',
        'record_json',
        `${record.import_id}:${record.record_type}:${record.record_key}`,
        record.record_json
      )
    }));
    return output;
  }

  listNodes({ asOf = new Date().toISOString(), limit } = {}) {
    return this.decodedNodes({ limit }).map(node => {
      if (node.status === 'active' && node.expires_at <= asOf) {
        node.status = 'expired';
      }
      return node;
    });
  }

  discoverNodes(query, { asOf = new Date().toISOString() } = {}) {
    return discoverAdmittedNodes(
      this.listNodes({ asOf }),
      normalizeNodeDiscoveryQuery(query),
      { asOf }
    );
  }

  getNodeSchedule(scheduleId, requester, {
    asOf = new Date().toISOString()
  } = {}) {
    const schedules = this.decodedSchedules();
    const schedule = schedules.find(
      item => (
        item.schedule_id === scheduleId
        && item.requester === requester
      )
    );
    if (!schedule) {
      throw new AxiomError(
        'node_schedule_not_found',
        'Node schedule was not found',
        404
      );
    }
    schedule.status = effectiveScheduleStatus(
      schedule,
      this.listNodes({ asOf }),
      { asOf, schedules }
    );
    return schedule;
  }

  listNodeSchedules(requester, {
    asOf = new Date().toISOString()
  } = {}) {
    const nodes = this.listNodes({ asOf });
    const schedules = this.decodedSchedules();
    return schedules
      .filter(schedule => schedule.requester === requester)
      .map(schedule => ({
        ...schedule,
        status: effectiveScheduleStatus(schedule, nodes, { asOf, schedules })
      }))
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
  }

  listStorageOffers(owner) {
    const now = new Date().toISOString();
    return this.db.prepare(`
      SELECT * FROM storage_offers WHERE owner = ? ORDER BY created_at DESC
    `).all(owner).map(row => {
      const decoded = this.decodeProtectedRow(
        'storage_offers',
        'offer_id',
        row,
        ['regions_json', 'signature_json']
      );
      if (decoded.status === 'active' && decoded.expires_at <= now) decoded.status = 'expired';
      return decoded;
    });
  }

  decodedNodes({ limit } = {}) {
    const rows = limit === undefined
      ? this.db.prepare('SELECT * FROM nodes ORDER BY registered_at DESC').all()
      : this.db.prepare('SELECT * FROM nodes ORDER BY registered_at DESC LIMIT ?').all(
          boundedInteger(limit, 'node list limit', 1, 100)
        );
    return rows.map(row => {
      const decoded = this.decodeProtectedRow(
        'nodes',
        'node_id',
        row,
        [
          'capabilities_json',
          'discovery_json',
          'public_key_json',
          'quarantine_reason_json'
        ]
      );
      decoded.capabilities = decoded.capabilities_json;
      decoded.discovery = decoded.discovery_json;
      return decoded;
    });
  }

  decodedSchedules() {
    return this.db.prepare(
      'SELECT * FROM node_schedules ORDER BY created_at DESC'
    ).all().map(row => {
      const decoded = this.decodeProtectedRow(
        'node_schedules',
        'schedule_id',
        row,
        ['requirements_json', 'placements_json']
      );
      decoded.requirements = decoded.requirements_json;
      decoded.placements = decoded.placements_json;
      delete decoded.requirements_json;
      delete decoded.placements_json;
      return decoded;
    });
  }

  degradeNodeSchedules(nodeId) {
    for (const schedule of this.decodedSchedules()) {
      if (
        schedule.status !== 'active'
        || !schedule.placements.some(
          placement => placement.node_id === nodeId
        )
      ) continue;
      this.db.prepare(`
        UPDATE node_schedules SET status = 'degraded'
        WHERE schedule_id = ? AND status = 'active'
      `).run(schedule.schedule_id);
    }
  }

  degradeIneligibleNodeSchedules(nodeId, asOf) {
    const schedules = this.decodedSchedules();
    const nodes = this.listNodes({ asOf });
    for (const schedule of schedules) {
      if (
        schedule.status !== 'active'
        || !schedule.placements.some(
          placement => placement.node_id === nodeId
        )
        || effectiveScheduleStatus(
          schedule,
          nodes,
          { asOf, schedules }
        ) !== 'degraded'
      ) continue;
      this.db.prepare(`
        UPDATE node_schedules SET status = 'degraded'
        WHERE schedule_id = ? AND status = 'active'
      `).run(schedule.schedule_id);
    }
  }

  applyCausalSyncBundle(p, receivedAt) {
    const verified = verifyCausalBundle(p.bundle, {
      expectedOwner: p.owner,
      requireNotFuture: false
    });
    if (verified.bundle_digest !== p.bundle_digest) {
      throw new ValidationError('Causal sync bundle digest is invalid');
    }
    const node = this.db.prepare(`
      SELECT owner, status, expires_at, public_key_digest, capabilities_json
      FROM nodes WHERE node_id = ?
    `).get(verified.statement.source_node_id);
    if (
      !node
      || node.owner !== p.owner
      || node.status !== 'active'
      || node.expires_at <= receivedAt
      || node.public_key_digest !== verified.public_key_digest
    ) {
      throw new AxiomError(
        'sync_node_unavailable',
        'Causal sync source is not an active admitted node owned by the principal',
        403
      );
    }
    const capabilities = this.openJson(
      'nodes',
      'capabilities_json',
      verified.statement.source_node_id,
      node.capabilities_json
    );
    if (!capabilities.includes('offline.causal-sync')) {
      throw new AxiomError(
        'sync_capability_unavailable',
        'Admitted node is not authorized for offline causal sync',
        403
      );
    }
    if (this.db.prepare(`
      SELECT 1 FROM sync_bundles WHERE bundle_digest = ?
    `).get(verified.bundle_digest)) {
      throw new AxiomError('sync_bundle_replayed', 'Causal sync bundle was already applied', 409);
    }

    const summary = {
      accepted: 0,
      superseded: 0,
      conflicts: 0,
      resolved: 0,
      update_ids: []
    };
    this.db.prepare(`
      INSERT INTO sync_bundles(
        bundle_digest, owner, source_node_id, update_count, result_json, received_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      verified.bundle_digest,
      p.owner,
      verified.statement.source_node_id,
      verified.updates.length,
      this.protectJson('sync_bundles', 'result_json', verified.bundle_digest, summary),
      receivedAt
    );

    for (const update of verified.updates) {
      const statement = update.statement;
      const priorCounter = this.db.prepare(`
        SELECT update_id FROM sync_updates
        WHERE node_id = ? AND author_counter = ?
      `).get(statement.node_id, update.author_counter);
      if (priorCounter) {
        if (priorCounter.update_id === update.update_id) {
          throw new AxiomError('sync_update_replayed', 'Causal sync update was already applied', 409);
        }
        throw new AxiomError(
          'sync_node_equivocation',
          'Node signed more than one update for the same causal counter',
          409,
          {
            node_id: statement.node_id,
            counter: update.author_counter,
            prior_update_id: priorCounter.update_id
          }
        );
      }
      const sourceMaximum = Number(this.db.prepare(`
        SELECT COALESCE(MAX(author_counter), 0) AS counter
        FROM sync_updates WHERE node_id = ?
      `).get(statement.node_id).counter);
      if (update.author_counter !== sourceMaximum + 1) {
        throw new AxiomError(
          'sync_causal_sequence_gap',
          'Causal sync source counter is not contiguous with accepted history',
          409,
          {
            node_id: statement.node_id,
            expected_counter: sourceMaximum + 1,
            received_counter: update.author_counter
          }
        );
      }
      for (const [dependencyNodeId, dependencyCounter] of Object.entries(statement.vector)) {
        if (dependencyNodeId === statement.node_id) continue;
        const acceptedMaximum = Number(this.db.prepare(`
          SELECT COALESCE(MAX(author_counter), 0) AS counter
          FROM sync_updates WHERE node_id = ? AND owner = ?
        `).get(dependencyNodeId, p.owner).counter);
        if (dependencyCounter > acceptedMaximum) {
          throw new AxiomError(
            'sync_causal_dependency_missing',
            'Causal sync update references history that has not been accepted',
            409,
            {
              node_id: dependencyNodeId,
              required_counter: dependencyCounter,
              accepted_counter: acceptedMaximum
            }
          );
        }
      }
      const currentHeads = this.db.prepare(`
        SELECT u.update_id, u.vector_json
        FROM sync_heads h
        JOIN sync_updates u ON u.update_id = h.update_id
        WHERE h.owner = ? AND h.namespace = ? AND h.record_id = ?
        ORDER BY u.update_id
      `).all(p.owner, statement.namespace, statement.record_id).map(row => ({
        update_id: row.update_id,
        vector: this.openJson('sync_updates', 'vector_json', row.update_id, row.vector_json)
      }));
      const comparisons = currentHeads.map(head => ({
        ...head,
        relation: compareVersionVectors(statement.vector, head.vector)
      }));
      const equalHead = comparisons.find(head => head.relation === 'equal');
      if (equalHead) {
        throw new AxiomError(
          'sync_vector_equivocation',
          'Different causal updates declare the same version vector',
          409,
          { prior_update_id: equalHead.update_id }
        );
      }
      const dominatesAll = currentHeads.length > 1
        && comparisons.every(head => head.relation === 'dominates');
      const declaredResolutions = statement.resolves;
      if (dominatesAll) {
        const expected = currentHeads.map(head => head.update_id).sort();
        if (canonicalJson(declaredResolutions) !== canonicalJson(expected)) {
          throw new AxiomError(
            'sync_resolution_incomplete',
            'Conflict resolution must name every current causal head',
            409,
            { expected_heads: expected }
          );
        }
      } else if (declaredResolutions.length) {
        throw new ValidationError('Causal update may name resolutions only when resolving every conflict head');
      }

      const isSuperseded = comparisons.some(head => head.relation === 'dominated');
      const initialStatus = isSuperseded ? 'superseded' : 'head';
      this.db.prepare(`
        INSERT INTO sync_updates(
          update_id, bundle_digest, owner, node_id, namespace, record_id,
          operation, value_digest, value_json, vector_json, resolves_json,
          occurred_at, received_at, author_counter, public_key_digest,
          signature_json, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        update.update_id,
        verified.bundle_digest,
        p.owner,
        statement.node_id,
        statement.namespace,
        statement.record_id,
        statement.operation,
        statement.value_digest,
        this.protectJson('sync_updates', 'value_json', update.update_id, statement.value),
        this.protectJson('sync_updates', 'vector_json', update.update_id, statement.vector),
        this.protectJson('sync_updates', 'resolves_json', update.update_id, statement.resolves),
        statement.occurred_at,
        receivedAt,
        update.author_counter,
        update.public_key_digest,
        this.protectJson('sync_updates', 'signature_json', update.update_id, update.signature),
        initialStatus
      );
      summary.update_ids.push(update.update_id);
      if (isSuperseded) {
        summary.superseded += 1;
        continue;
      }

      const dominatedHeads = comparisons
        .filter(head => head.relation === 'dominates')
        .map(head => head.update_id);
      for (const updateId of dominatedHeads) {
        this.db.prepare('DELETE FROM sync_heads WHERE update_id = ?').run(updateId);
        this.db.prepare(`
          UPDATE sync_updates SET status = 'superseded' WHERE update_id = ?
        `).run(updateId);
      }
      this.db.prepare(`
        INSERT INTO sync_heads(owner, namespace, record_id, update_id)
        VALUES (?, ?, ?, ?)
      `).run(p.owner, statement.namespace, statement.record_id, update.update_id);
      const activeHeads = this.db.prepare(`
        SELECT update_id FROM sync_heads
        WHERE owner = ? AND namespace = ? AND record_id = ?
        ORDER BY update_id
      `).all(p.owner, statement.namespace, statement.record_id);
      if (activeHeads.length > 1) {
        for (const head of activeHeads) {
          this.db.prepare(`
            UPDATE sync_updates SET status = 'conflict' WHERE update_id = ?
          `).run(head.update_id);
        }
        summary.conflicts += 1;
      } else {
        this.db.prepare(`
          UPDATE sync_updates SET status = 'head' WHERE update_id = ?
        `).run(update.update_id);
        summary.accepted += 1;
        if (dominatesAll) summary.resolved += 1;
      }
    }
    this.db.prepare(`
      UPDATE sync_bundles SET result_json = ? WHERE bundle_digest = ?
    `).run(
      this.protectJson('sync_bundles', 'result_json', verified.bundle_digest, summary),
      verified.bundle_digest
    );
    return summary;
  }

  listCausalSync(owner, { namespace, recordId } = {}) {
    const clauses = ['h.owner = ?'];
    const parameters = [owner];
    if (namespace !== undefined) {
      clauses.push('h.namespace = ?');
      parameters.push(namespace);
    }
    if (recordId !== undefined) {
      clauses.push('h.record_id = ?');
      parameters.push(recordId);
    }
    const rows = this.db.prepare(`
      SELECT
        h.owner, h.namespace, h.record_id, u.update_id, u.node_id,
        u.operation, u.value_digest, u.value_json, u.vector_json,
        u.resolves_json, u.occurred_at, u.received_at, u.author_counter,
        u.public_key_digest, u.signature_json, u.status
      FROM sync_heads h
      JOIN sync_updates u ON u.update_id = h.update_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY h.namespace, h.record_id, u.update_id
      LIMIT 1000
    `).all(...parameters).map(row => this.decodeProtectedRow(
      'sync_updates',
      'update_id',
      row,
      ['value_json', 'vector_json', 'resolves_json', 'signature_json']
    ));
    const records = [];
    for (const row of rows) {
      let record = records.at(-1);
      if (
        !record
        || record.namespace !== row.namespace
        || record.record_id !== row.record_id
      ) {
        record = {
          owner,
          namespace: row.namespace,
          record_id: row.record_id,
          status: 'active',
          heads: []
        };
        records.push(record);
      }
      record.heads.push({
        update_id: row.update_id,
        node_id: row.node_id,
        operation: row.operation,
        value_digest: row.value_digest,
        value: row.value_json,
        vector: row.vector_json,
        resolves: row.resolves_json,
        occurred_at: row.occurred_at,
        received_at: row.received_at,
        author_counter: row.author_counter,
        public_key_digest: row.public_key_digest,
        signature: row.signature_json
      });
    }
    for (const record of records) {
      if (record.heads.length > 1) {
        record.status = 'conflict';
      } else if (record.heads[0].operation === 'delete') {
        record.status = 'tombstoned';
      }
    }
    const bundles = this.db.prepare(`
      SELECT * FROM sync_bundles
      WHERE owner = ?
      ORDER BY received_at DESC
      LIMIT 100
    `).all(owner).map(row => this.decodeProtectedRow(
      'sync_bundles',
      'bundle_digest',
      row,
      ['result_json']
    ));
    return {
      owner,
      records,
      bundles,
      conflicts: records.filter(record => record.status === 'conflict').length,
      truncated: rows.length === 1000 || bundles.length === 100
    };
  }

  getCausalSyncBundle(owner, bundleDigest) {
    const row = this.db.prepare(`
      SELECT * FROM sync_bundles
      WHERE owner = ? AND bundle_digest = ?
    `).get(owner, bundleDigest);
    if (!row) {
      throw new AxiomError(
        'sync_bundle_not_found',
        'Causal sync bundle was not found',
        404
      );
    }
    return this.decodeProtectedRow(
      'sync_bundles',
      'bundle_digest',
      row,
      ['result_json']
    );
  }

  listBackups(principal, { limit = 100 } = {}) {
    const safeLimit = boundedInteger(limit, 'backup limit', 1, 100);
    const rows = this.db.prepare(`
      SELECT * FROM backups WHERE principal = ? ORDER BY requested_at DESC
      LIMIT ?
    `).all(principal, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return {
      backups: rows.map(row => this.decodeProtectedRow(
      'backups',
      'backup_id',
      row,
      ['manifest_json']
      )),
      truncated
    };
  }

  getBackupRecord(backupId, principal) {
    const row = principal === undefined
      ? this.db.prepare('SELECT * FROM backups WHERE backup_id = ?').get(backupId)
      : this.db.prepare('SELECT * FROM backups WHERE backup_id = ? AND principal = ?').get(backupId, principal);
    if (!row) throw new AxiomError('backup_not_found', 'Backup was not found', 404);
    return this.decodeProtectedRow('backups', 'backup_id', row, ['manifest_json']);
  }

  verifyChain() {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY seq').all();
    let previous = GENESIS_HASH;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) return { valid: false, seq: row.seq, reason: 'sequence_gap' };
      if (row.prev_hash !== previous) return { valid: false, seq: row.seq, reason: 'previous_hash_mismatch' };
      let payload;
      try {
        payload = this.openJson('events', 'payload_json', row.event_id, row.payload_json);
      } catch {
        return { valid: false, seq: row.seq, reason: 'payload_decryption_failed' };
      }
      if (digestObject(payload) !== row.payload_digest) {
        return { valid: false, seq: row.seq, reason: 'payload_digest_mismatch' };
      }
      const envelope = {
        seq: row.seq,
        event_id: row.event_id,
        trace_id: row.trace_id,
        actor: row.actor,
        kind: row.kind,
        subject: row.subject,
        occurred_at: row.occurred_at,
        payload_digest: row.payload_digest,
        prev_hash: row.prev_hash
      };
      if (digestObject(envelope) !== row.event_hash) return { valid: false, seq: row.seq, reason: 'event_hash_mismatch' };
      const signature = JSON.parse(row.signature_json);
      const verificationKey = this.verificationKeys.get(signature.key_id);
      if (
        !verificationKey
        || !verifyObjectSignature(
          { event_hash: row.event_hash },
          signature,
          verificationKey
        )
      ) {
        return { valid: false, seq: row.seq, reason: 'signature_mismatch' };
      }
      previous = row.event_hash;
      expectedSeq += 1;
    }
    const metaHash = this.db.prepare("SELECT value FROM meta WHERE key = 'last_hash'").get().value;
    const metaSeq = Number(this.db.prepare("SELECT value FROM meta WHERE key = 'last_seq'").get().value);
    if (metaHash !== previous || metaSeq !== rows.length) return { valid: false, reason: 'metadata_mismatch' };
    return { valid: true, events: rows.length, head: previous };
  }

  async createExport(exportId, traceId) {
    const row = this.db.prepare('SELECT * FROM exports WHERE export_id = ?').get(exportId);
    if (!row) throw new AxiomError('export_not_found', 'Export request was not found', 404);
    if (row.status === 'completed') {
      return this.openJson('exports', 'manifest_json', row.export_id, row.manifest_json);
    }
    const principal = row.principal;
    const scope = this.openJson('exports', 'scope_json', row.export_id, row.scope_json);
    const records = this.collectExportRecords(principal, scope);
    const lines = records.map(record => canonicalJson(record));
    const plaintextBundle = Buffer.from(lines.length ? `${lines.join('\n')}\n` : '');
    const exportDir = join(this.dataDir, 'exports', exportId);
    const recipient = scope.recipient;
    const manifestScope = structuredClone(scope);
    if (manifestScope.recipient) {
      manifestScope.recipient = { key_id: manifestScope.recipient.key_id };
    }
    let storedBundle = plaintextBundle;
    let bundleName = 'bundle.jsonl';
    let bundleMediaType = 'application/x-ndjson';
    let encryption;
    if (recipient) {
      const context = `axiom:export:${exportId}:bundle.jsonl`;
      const envelope = encryptForRecipient(plaintextBundle, recipient.public_key, context);
      storedBundle = Buffer.from(canonicalJson(envelope));
      bundleName = 'bundle.encrypted.json';
      bundleMediaType = 'application/vnd.axiom.recipient-encrypted+json';
      encryption = {
        format: envelope.format,
        algorithm: envelope.algorithm,
        context,
        recipient_key_id: envelope.recipient_key_id,
        plaintext: {
          name: 'bundle.jsonl',
          media_type: 'application/x-ndjson'
        }
      };
    }
    const bundlePath = join(exportDir, bundleName);
    await atomicWrite(bundlePath, storedBundle, 0o600);
    const unsigned = {
      format: 'axiom-export.v1',
      schema_versions: {
        manifest: 1,
        records: 2,
        scope: 2,
        evidence: 1
      },
      export_id: exportId,
      principal,
      scope: manifestScope,
      created_at: new Date().toISOString(),
      record_count: records.length,
      files: [
        {
          name: bundleName,
          media_type: bundleMediaType,
          bytes: storedBundle.length,
          sha256: sha256(storedBundle)
        }
      ],
      ...(encryption ? { encryption } : {}),
      continuity: {
        mode: 'signed-transparency-log-head',
        evidence_head: this.getStatus().last_hash
      }
    };
    const manifest = { ...unsigned, attestation: this.identity.signObject(unsigned) };
    await atomicWrite(join(exportDir, 'manifest.json'), Buffer.from(canonicalJson(manifest)), 0o600);
    this.appendEvents({
      traceId,
      actor: 'grid',
      events: [{
        kind: 'export.completed',
        subject: exportId,
        payload: {
          export_id: exportId,
          bundle_path: bundlePath,
          manifest
        }
      }]
    });
    return manifest;
  }

  collectExportRecords(principal, scope) {
    const requestedTypes = new Set(Array.isArray(scope.types)
      ? scope.types
      : [
          'identity',
          'events',
          'intents',
          'consents',
          'approvals',
          'capsules',
          'governance',
          'votes',
          'memory',
          'accounting',
          'sync'
        ]);
    const since = validDate(scope.since) ?? '0000-01-01T00:00:00.000Z';
    const until = validDate(scope.until) ?? '9999-12-31T23:59:59.999Z';
    const objectIds = new Set(scope.object_ids ?? []);
    const capsuleIds = new Set(scope.capsule_ids ?? []);
    const records = [];
    if (requestedTypes.has('identity')) {
      records.push({
        type: 'identity_reference',
        data: {
          identity_id: principal,
          schema: 'axiom-identity-reference.v1',
          authority: 'local-authenticated-principal'
        }
      });
    }
    if (requestedTypes.has('events')) {
      for (const row of this.db.prepare(`
        SELECT * FROM events WHERE actor = ? AND occurred_at >= ? AND occurred_at <= ? ORDER BY seq
      `).all(principal, since, until)) {
        const event = this.decodeEventRow(row);
        if (
          (objectIds.size || capsuleIds.size)
          && !eventMatchesSelectors(event, objectIds, capsuleIds)
        ) continue;
        records.push({ type: 'event', data: event });
      }
    }
    if (requestedTypes.has('intents')) {
      for (const row of this.db.prepare(`
        SELECT * FROM intents WHERE principal = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at
      `).all(principal, since, until)) {
        records.push({
          type: 'intent',
          data: this.decodeProtectedRow('intents', 'intent_id', row, ['result_json', 'error_json'])
        });
      }
    }
    if (requestedTypes.has('consents')) {
      for (const row of this.db.prepare(`
        SELECT consent_id, subject, controller, purpose, scopes_json, expires_at,
               status, created_at, revoked_at
        FROM consents
        WHERE (subject = ? OR controller = ?) AND created_at >= ? AND created_at <= ?
        ORDER BY created_at
      `).all(principal, principal, since, until)) {
        records.push({
          type: 'consent',
          data: this.decodeProtectedRow('consents', 'consent_id', row, ['scopes_json'])
        });
      }
    }
    if (requestedTypes.has('approvals')) {
      for (const row of this.db.prepare(`
        SELECT * FROM approvals
        WHERE (approver = ? OR requester = ?) AND created_at >= ? AND created_at <= ?
        ORDER BY created_at, approval_id
      `).all(principal, principal, since, until)) {
        records.push({ type: 'approval', data: row });
      }
    }
    if (requestedTypes.has('capsules')) {
      const seen = new Set();
      for (const row of this.db.prepare(`
        SELECT * FROM events
        WHERE actor = ? AND kind = 'capsule.registered'
          AND occurred_at >= ? AND occurred_at <= ?
        ORDER BY seq
      `).all(principal, since, until)) {
        const event = this.decodeEventRow(row);
        if (capsuleIds.size && !capsuleIds.has(event.payload.capsule_id)) continue;
        const key = `${event.payload.capsule_id}:${event.payload.version}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const capsule = this.db.prepare(`
          SELECT * FROM capsules WHERE capsule_id = ? AND version = ?
        `).get(event.payload.capsule_id, event.payload.version);
        if (capsule) {
          records.push({
            type: 'capsule',
            data: this.decodeProtectedRow('capsules', 'digest', capsule, ['manifest_json'])
          });
        }
      }
      if (capsuleIds.size) {
        const exported = new Set(records
          .filter(record => record.type === 'capsule')
          .map(record => record.data.capsule_id));
        const missing = [...capsuleIds].filter(id => !exported.has(id));
        if (missing.length) throw new AxiomError(
          'export_scope_forbidden',
          'Capsule export scope includes an unknown or unowned capsule',
          403,
          { capsule_ids: missing }
        );
      }
    }
    if (requestedTypes.has('governance')) {
      for (const row of this.db.prepare(`
        SELECT * FROM proposals
        WHERE proposer = ? AND created_at >= ? AND created_at <= ?
        ORDER BY created_at, proposal_id
      `).all(principal, since, until)) {
        records.push({
          type: 'proposal',
          data: this.decodeProtectedRow(
            'proposals',
            'proposal_id',
            row,
            ['action_json', 'rollback_json']
          )
        });
      }
      for (const row of this.db.prepare(`
        SELECT * FROM votes WHERE voter = ? AND created_at >= ? AND created_at <= ?
        ORDER BY created_at, proposal_id
      `).all(principal, since, until)) records.push({ type: 'vote', data: row });
      for (const row of this.db.prepare(`
        SELECT * FROM governance_appeals
        WHERE appellant = ? AND created_at >= ? AND created_at <= ?
        ORDER BY created_at, appeal_id
      `).all(principal, since, until)) {
        records.push({
          type: 'appeal',
          data: this.decodeProtectedRow(
            'governance_appeals',
            'appeal_id',
            row,
            ['grounds_json']
          )
        });
      }
    }
    if (requestedTypes.has('votes') && !requestedTypes.has('governance')) {
      for (const row of this.db.prepare(`
        SELECT * FROM votes WHERE voter = ? AND created_at >= ? AND created_at <= ?
        ORDER BY created_at, proposal_id
      `).all(principal, since, until)) records.push({ type: 'vote', data: row });
    }
    if (requestedTypes.has('memory')) {
      const graph = this.listMemory(principal);
      const selectedObjects = objectIds.size
        ? graph.objects.filter(object => objectIds.has(object.object_id))
        : graph.objects;
      if (objectIds.size) {
        const visible = new Set(selectedObjects.map(object => object.object_id));
        const missing = [...objectIds].filter(id => !visible.has(id));
        if (missing.length) throw new AxiomError(
          'export_scope_forbidden',
          'Object export scope includes an unknown or unowned object',
          403,
          { object_ids: missing }
        );
      }
      const selectedIds = new Set(selectedObjects.map(object => object.object_id));
      for (const object of selectedObjects) {
        if (object.created_at >= since && object.created_at <= until) {
          records.push({ type: 'memory_object', data: object });
        }
      }
      for (const edge of graph.edges) {
        if (
          (!objectIds.size || (selectedIds.has(edge.from_id) && selectedIds.has(edge.to_id)))
          && edge.created_at >= since
          && edge.created_at <= until
        ) {
          records.push({ type: 'memory_edge', data: edge });
        }
      }
    }
    if (requestedTypes.has('accounting')) {
      const accounting = this.listAccounting(principal);
      for (const account of accounting.accounts) {
        if (account.created_at >= since && account.created_at <= until) {
          records.push({ type: 'account', data: account });
        }
      }
      for (const journal of accounting.journals) {
        if (journal.created_at >= since && journal.created_at <= until) {
          records.push({ type: 'journal', data: journal });
        }
      }
    }
    if (requestedTypes.has('sync')) {
      for (const row of this.db.prepare(`
        SELECT u.*, n.public_key_json
        FROM sync_updates u
        JOIN nodes n ON n.node_id = u.node_id
        WHERE u.owner = ? AND u.received_at >= ? AND u.received_at <= ?
        ORDER BY u.received_at, u.update_id
      `).all(principal, since, until)) {
        records.push({
          type: 'sync_update',
          data: {
            update_id: row.update_id,
            bundle_digest: row.bundle_digest,
            format: 'axiom-causal-update.v1',
            owner: row.owner,
            node_id: row.node_id,
            namespace: row.namespace,
            record_id: row.record_id,
            operation: row.operation,
            value: this.openJson('sync_updates', 'value_json', row.update_id, row.value_json),
            value_digest: row.value_digest,
            vector: this.openJson('sync_updates', 'vector_json', row.update_id, row.vector_json),
            resolves: this.openJson('sync_updates', 'resolves_json', row.update_id, row.resolves_json),
            occurred_at: row.occurred_at,
            received_at: row.received_at,
            author_counter: row.author_counter,
            public_key: this.openJson('nodes', 'public_key_json', row.node_id, row.public_key_json),
            public_key_digest: row.public_key_digest,
            signature: this.openJson(
              'sync_updates',
              'signature_json',
              row.update_id,
              row.signature_json
            ),
            status: row.status
          }
        });
      }
    }
    return records;
  }

  getExport(exportId, principal) {
    const row = this.db.prepare('SELECT * FROM exports WHERE export_id = ? AND principal = ?').get(exportId, principal);
    if (!row) throw new AxiomError('export_not_found', 'Export was not found', 404);
    return this.decodeProtectedRow('exports', 'export_id', row, ['scope_json', 'manifest_json']);
  }

  async getExportBundle(exportId, principal) {
    const record = this.getExport(exportId, principal);
    if (record.status !== 'completed') throw new AxiomError('export_not_ready', 'Export is not complete', 409);
    return {
      manifest: record.manifest_json,
      bundle: await readFile(record.bundle_path, 'utf8')
    };
  }
}

function normalizeEvent(raw) {
  assertPlainObject(raw, 'event');
  const kind = assertString(raw.kind, 'event.kind', { max: 128, pattern: /^[a-z][a-z0-9.-]+$/ });
  const subject = assertString(raw.subject, 'event.subject', { max: 160, pattern: ID });
  const payload = assertPlainObject(raw.payload, 'event.payload');
  validateMaterializedPayload(kind, payload);
  return { kind, subject, payload };
}

function validateMaterializedPayload(kind, p) {
  if (kind === 'intent.accepted') {
    assertString(p.intent_id, 'intent_id', { max: 160, pattern: ID });
    assertString(p.principal, 'principal', { max: 160, pattern: ID });
    assertString(p.action, 'action', { max: 128, pattern: /^[a-z][a-z0-9.-]+$/ });
    assertString(p.risk, 'risk', { max: 16, pattern: /^(low|medium|high|critical)$/ });
    assertString(p.input_digest, 'input_digest', { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ });
    assertString(p.request_digest, 'request_digest', { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ });
  } else if (['intent.denied', 'intent.failed', 'intent.completed'].includes(kind)) {
    assertString(p.intent_id, 'intent_id', { max: 160, pattern: ID });
  } else if (kind === 'capsule.registered') {
    assertString(p.capsule_id, 'capsule_id', { max: 128, pattern: CAPSULE_ID });
    assertString(p.version, 'version', { max: 64, pattern: VERSION });
    assertString(p.digest, 'digest', { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ });
    assertPlainObject(p.manifest, 'manifest');
    if (digestObject(p.manifest) !== p.digest) throw new ValidationError('Capsule digest does not match its manifest');
    assertString(p.signer, 'signer', { max: 160, pattern: ID });
  } else if (kind === 'capsule.revoked') {
    assertString(p.digest, 'digest', { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ });
  } else if (kind === 'consent.granted') {
    for (const field of ['consent_id', 'subject', 'controller']) {
      assertString(p[field], field, { max: 160, pattern: ID });
    }
    assertString(p.purpose, 'purpose', { max: 512 });
    if (!Array.isArray(p.scopes) || !p.scopes.length) throw new ValidationError('Consent scopes are required');
    if (!validDate(p.expires_at) || new Date(p.expires_at) <= new Date()) {
      throw new ValidationError('Consent expiry must be a future ISO timestamp');
    }
    assertString(p.revocation_handle_hash, 'revocation_handle_hash', { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ });
  } else if (kind === 'consent.revoked') {
    assertString(p.consent_id, 'consent_id', { max: 160, pattern: ID });
    assertString(p.revocation_handle_hash, 'revocation_handle_hash', {
      min: 64,
      max: 64,
      pattern: /^[a-f0-9]{64}$/
    });
  } else if (kind === 'approval.granted') {
    for (const field of ['approval_id', 'approver', 'requester']) {
      assertString(p[field], field, { max: 160, pattern: ID });
    }
    if (p.approver === p.requester) throw new ValidationError('Approval must be independent');
    assertString(p.action, 'action', { max: 128, pattern: /^[a-z][a-z0-9.-]+$/ });
    assertString(p.request_digest, 'request_digest', {
      min: 64,
      max: 64,
      pattern: /^[a-f0-9]{64}$/
    });
    if (!validDate(p.expires_at) || new Date(p.expires_at) <= new Date()) {
      throw new ValidationError('Approval expiry must be a future ISO timestamp');
    }
  } else if (kind === 'approval.consumed') {
    assertString(p.approval_id, 'approval_id', { max: 160, pattern: ID });
    assertString(p.intent_id, 'intent_id', { max: 160, pattern: ID });
  } else if (kind === 'governance.proposed') {
    for (const field of ['proposal_id', 'proposer']) assertString(p[field], field, { max: 160, pattern: ID });
    assertString(p.title, 'title', { max: 200 });
    assertString(p.body, 'body', { max: 20_000 });
    assertPlainObject(p.action, 'action');
    if (p.action.type !== undefined) {
      assertString(p.action.type, 'action.type', {
        max: 64,
        pattern: /^(policy\.overlay|record\.decision)$/
      });
      assertPlainObject(p.action.rollback, 'action.rollback');
      if (p.action.type === 'policy.overlay') {
        validateAuthorityReducingPolicy(assertPlainObject(p.action.policy, 'action.policy'));
      } else {
        assertPlainObject(p.action.payload, 'action.payload');
      }
    }
    if (!validDate(p.voting_ends_at) || !validDate(p.activate_after)) throw new ValidationError('Proposal dates are invalid');
  } else if (kind === 'governance.voted') {
    for (const field of ['proposal_id', 'voter']) assertString(p[field], field, { max: 160, pattern: ID });
    if (!['human', 'agent'].includes(p.chamber)) throw new ValidationError('Vote chamber must be human or agent');
    if (!['for', 'against', 'abstain'].includes(p.choice)) throw new ValidationError('Vote choice is invalid');
    if (!Number.isSafeInteger(p.weight) || p.weight !== 1) throw new ValidationError('Kernel voting weight is fixed at one');
  } else if (['governance.finalized', 'governance.activated'].includes(kind)) {
    assertString(p.proposal_id, 'proposal_id', { max: 160, pattern: ID });
  } else if (kind === 'governance.verified') {
    assertString(p.proposal_id, 'proposal_id', { max: 160, pattern: ID });
    assertString(p.verification_digest, 'verification_digest', {
      min: 64,
      max: 64,
      pattern: /^[a-f0-9]{64}$/
    });
  } else if (kind === 'governance.rolled-back') {
    assertString(p.proposal_id, 'proposal_id', { max: 160, pattern: ID });
    assertString(p.rolled_back_by, 'rolled_back_by', { max: 160, pattern: ID });
    assertString(p.reason, 'reason', { max: 2000 });
  } else if (kind === 'governance.emergency.activated') {
    for (const field of ['overlay_id', 'activated_by']) {
      assertString(p[field], field, { max: 160, pattern: ID });
    }
    assertString(p.reason, 'reason', { max: 2000 });
    validateAuthorityReducingPolicy(assertPlainObject(p.policy, 'policy'));
    assertString(p.policy_digest, 'policy_digest', {
      min: 64,
      max: 64,
      pattern: /^[a-f0-9]{64}$/
    });
    if (p.policy_digest !== digestObject(p.policy)) throw new ValidationError('Emergency policy digest is invalid');
    if (!validDate(p.expires_at) || !validDate(p.review_by)) {
      throw new ValidationError('Emergency policy dates are invalid');
    }
    if (new Date(p.review_by) < new Date(p.expires_at)) {
      throw new ValidationError('Emergency review date is invalid');
    }
  } else if (kind === 'governance.emergency.reviewed') {
    for (const field of ['overlay_id', 'reviewed_by']) {
      assertString(p[field], field, { max: 160, pattern: ID });
    }
    assertString(p.findings, 'findings', { max: 5000 });
  } else if (kind === 'governance.appeal.filed') {
    for (const field of ['appeal_id', 'appellant', 'target_id']) {
      assertString(p[field], field, { max: 160, pattern: ID });
    }
    assertString(p.target_type, 'target_type', {
      max: 64,
      pattern: /^(proposal|policy|emergency|decision)$/
    });
    assertPlainObject(p.grounds, 'grounds');
    assertString(p.desired_resolution, 'desired_resolution', { max: 2000 });
  } else if (kind === 'node.registered') {
    if (p.admission) {
      assertString(p.owner, 'owner', { max: 160, pattern: ID });
      assertPlainObject(p.admission, 'admission');
      verifyNodeAdmission({
        ...p.admission.statement,
        signature: p.admission.signature
      }, { requireFuture: false });
    } else {
      assertString(p.node_id, 'node_id', { max: 160, pattern: ID });
      for (const field of ['public_key_digest', 'software_digest']) {
        assertString(p[field], field, { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ });
      }
      if (!/^S[0-3]_[A-Z0-9_]+$/.test(p.security_profile)) throw new ValidationError('Node security profile is invalid');
      if (!Array.isArray(p.capabilities)) throw new ValidationError('Node capabilities must be an array');
      if (!validDate(p.expires_at)) throw new ValidationError('Node expiry is invalid');
    }
  } else if (kind === 'node.renewed') {
    assertString(p.owner, 'owner', { max: 160, pattern: ID });
    assertPlainObject(p.renewal, 'renewal');
    verifyNodeRenewal({
      ...p.renewal.statement,
      public_key: p.renewal.public_key,
      signature: p.renewal.signature
    }, { requireFuture: false });
  } else if (kind === 'node.quarantined') {
    for (const field of ['node_id', 'quarantined_by']) {
      assertString(p[field], field, { max: 160, pattern: ID });
    }
    assertString(p.reason, 'reason', { max: 2000 });
  } else if (kind === 'node.schedule.requested') {
    assertString(p.requester, 'requester', { max: 160, pattern: ID });
    assertString(p.schedule_id, 'schedule_id', { max: 160, pattern: ID });
    assertString(p.request_digest, 'request_digest', {
      min: 64,
      max: 64,
      pattern: /^[a-f0-9]{64}$/
    });
    const normalized = normalizeNodeScheduleRequest(p.request, p.requester);
    if (
      normalized.schedule_id !== p.schedule_id
      || normalized.request_digest !== p.request_digest
    ) {
      throw new ValidationError('Node schedule request digest is invalid');
    }
  } else if (kind === 'storage.offered') {
    if (p.offer) {
      assertString(p.owner, 'owner', { max: 160, pattern: ID });
      assertPlainObject(p.offer, 'offer');
      verifyStorageOffer({
        ...p.offer.statement,
        public_key: p.offer.public_key,
        signature: p.offer.signature
      }, { requireFuture: false });
    } else {
      for (const field of ['offer_id', 'node_id']) assertString(p[field], field, { max: 160, pattern: ID });
      for (const field of ['capacity_bytes', 'available_bytes']) {
        if (!Number.isSafeInteger(p[field]) || p[field] < 0) throw new ValidationError(`${field} must be a non-negative integer`);
      }
      if (p.available_bytes > p.capacity_bytes) throw new ValidationError('Available storage exceeds capacity');
      if (!Array.isArray(p.regions)) throw new ValidationError('Storage regions must be an array');
      if (!validDate(p.expires_at)) throw new ValidationError('Storage offer expiry is invalid');
    }
  } else if (kind === 'sync.bundle.applied') {
    assertString(p.owner, 'owner', { max: 160, pattern: ID });
    assertString(p.bundle_digest, 'bundle_digest', {
      min: 64,
      max: 64,
      pattern: /^[a-f0-9]{64}$/
    });
    const verified = verifyCausalBundle(p.bundle, {
      expectedOwner: p.owner,
      requireNotFuture: false
    });
    if (verified.bundle_digest !== p.bundle_digest) {
      throw new ValidationError('Causal sync bundle digest is invalid');
    }
  } else if (kind === 'memory.put') {
    for (const field of ['object_id', 'owner']) assertString(p[field], field, { max: 160, pattern: ID });
    assertString(p.kind, 'kind', { max: 128, pattern: /^[a-z][a-z0-9.-]+$/ });
    assertPlainObject(p.content, 'content');
    assertPlainObject(p.metadata, 'metadata');
    assertString(p.content_digest, 'content_digest', {
      min: 64,
      max: 64,
      pattern: /^[a-f0-9]{64}$/
    });
    const expected = digestObject({
      owner: p.owner,
      kind: p.kind,
      content: p.content,
      metadata: p.metadata
    });
    if (p.content_digest !== expected || p.object_id !== `memory_${expected}`) {
      throw new ValidationError('Memory object content address is invalid');
    }
  } else if (kind === 'memory.linked') {
    for (const field of ['edge_id', 'owner', 'from_id', 'to_id']) {
      assertString(p[field], field, { max: 160, pattern: ID });
    }
    assertString(p.relation, 'relation', { max: 128, pattern: /^[a-z][a-z0-9.-]+$/ });
    assertPlainObject(p.metadata, 'metadata');
    const expected = digestObject({
      owner: p.owner,
      from_id: p.from_id,
      to_id: p.to_id,
      relation: p.relation,
      metadata: p.metadata
    });
    if (p.edge_id !== `edge_${expected}`) throw new ValidationError('Memory edge content address is invalid');
  } else if (kind === 'memory.tombstoned') {
    for (const field of ['object_id', 'owner']) assertString(p[field], field, { max: 160, pattern: ID });
  } else if (kind === 'accounting.account.created') {
    for (const field of ['account_id', 'owner']) assertString(p[field], field, { max: 160, pattern: ID });
    assertString(p.unit, 'unit', { max: 16, pattern: /^[A-Z][A-Z0-9._-]{0,15}$/ });
    assertString(p.name, 'name', { max: 200 });
  } else if (kind === 'accounting.journal.posted') {
    for (const field of ['journal_id', 'owner']) assertString(p[field], field, { max: 160, pattern: ID });
    assertString(p.unit, 'unit', { max: 16, pattern: /^[A-Z][A-Z0-9._-]{0,15}$/ });
    assertString(p.reference, 'reference', { max: 200 });
    assertString(p.memo, 'memo', { min: 0, max: 2000 });
    if (!Array.isArray(p.entries) || p.entries.length < 2 || p.entries.length > 256) {
      throw new ValidationError('Accounting journal requires 2-256 entries');
    }
    let total = 0;
    for (const [index, entry] of p.entries.entries()) {
      assertPlainObject(entry, `entries[${index}]`);
      assertString(entry.account_id, `entries[${index}].account_id`, { max: 160, pattern: ID });
      if (!Number.isSafeInteger(entry.amount) || entry.amount === 0) {
        throw new ValidationError(`entries[${index}].amount must be a non-zero safe integer`);
      }
      assertPlainObject(entry.metadata, `entries[${index}].metadata`);
      total += entry.amount;
      if (!Number.isSafeInteger(total)) throw new ValidationError('Accounting journal total exceeds safe integer range');
    }
    if (total !== 0) throw new ValidationError('Accounting journal is not balanced');
  } else if (kind === 'import.staged') {
    for (const field of ['import_id', 'principal']) {
      assertString(p[field], field, { max: 160, pattern: ID });
    }
    assertPlainObject(p.manifest, 'manifest');
    assertString(p.bundle, 'bundle', { min: 0, max: 900_000 });
    assertString(p.grid_public_key, 'grid_public_key', { max: 8192 });
  } else if (kind === 'import.applied') {
    for (const field of ['import_id', 'principal']) {
      assertString(p[field], field, { max: 160, pattern: ID });
    }
  } else if (kind === 'export.requested') {
    for (const field of ['export_id', 'principal']) assertString(p[field], field, { max: 160, pattern: ID });
    assertPlainObject(p.scope, 'scope');
  } else if (kind === 'backup.requested') {
    for (const field of ['backup_id', 'principal']) {
      assertString(p[field], field, { max: 160, pattern: ID });
    }
  } else if (kind === 'backup.completed') {
    assertString(p.backup_id, 'backup_id', { max: 160, pattern: ID });
    assertPlainObject(p.manifest, 'manifest');
    assertString(p.manifest_path, 'manifest_path', { max: 1000 });
    assertString(p.snapshot_path, 'snapshot_path', { max: 1000 });
    assertString(p.manifest.database?.sha256, 'manifest.database.sha256', {
      min: 64,
      max: 64,
      pattern: /^[a-f0-9]{64}$/
    });
  } else if (kind === 'backup.restored') {
    for (const field of ['backup_id', 'recovery_id']) {
      assertString(p[field], field, { max: 160, pattern: ID });
    }
    assertPlainObject(p.manifest, 'manifest');
    assertString(p.database_digest, 'database_digest', {
      min: 64,
      max: 64,
      pattern: /^[a-f0-9]{64}$/
    });
    if (p.replaced_database_digest !== null) {
      assertString(p.replaced_database_digest, 'replaced_database_digest', {
        min: 64,
        max: 64,
        pattern: /^[a-f0-9]{64}$/
      });
    }
    assertString(p.rollback_path, 'rollback_path', { max: 1000 });
  }
}

function boundedInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function validDate(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function eventMatchesSelectors(event, objectIds, capsuleIds) {
  if (objectIds.has(event.subject) || capsuleIds.has(event.subject)) return true;
  const payload = event.payload ?? {};
  if (payload.from_id !== undefined || payload.to_id !== undefined) {
    return objectIds.has(payload.from_id) && objectIds.has(payload.to_id);
  }
  return objectIds.has(payload.object_id) || capsuleIds.has(payload.capsule_id);
}

function normalizeStoredGovernanceAction(action) {
  if (action.type === 'policy.overlay' || action.type === 'record.decision') return action;
  return {
    type: 'record.decision',
    payload: structuredClone(action),
    rollback: { description: 'Legacy non-executable proposal record' },
    legacy: true
  };
}

export function loadGridVerificationKeys(dataDir, identity) {
  const known = new Map([[identity.keyId, identity.publicKey]]);
  const rotationRoot = join(dataDir, 'credential-rotations');
  let entries;
  try {
    entries = readdirSync(rotationRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return known;
    throw error;
  }
  const transitions = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new ValidationError('Credential rotation history may not contain symbolic links');
    }
    if (!entry.isDirectory() || !ID.test(entry.name)) continue;
    const manifestPath = join(rotationRoot, entry.name, 'manifest.json');
    let metadata;
    try {
      metadata = lstatSync(manifestPath);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (
      metadata.isSymbolicLink()
      || !metadata.isFile()
      || metadata.size < 1
      || metadata.size > 1024 * 1024
    ) {
      throw new ValidationError('Credential rotation history manifest is invalid');
    }
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      throw new ValidationError('Credential rotation history manifest is invalid JSON');
    }
    transitions.push(parseGridKeyTransition(manifest));
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const transition of transitions) {
      if (known.has(transition.before.id)) {
        assertSamePublicKey(
          known.get(transition.before.id),
          transition.before.key,
          transition.before.id
        );
        changed = addVerificationKey(known, transition.after) || changed;
      }
      if (known.has(transition.after.id)) {
        assertSamePublicKey(
          known.get(transition.after.id),
          transition.after.key,
          transition.after.id
        );
        changed = addVerificationKey(known, transition.before) || changed;
      }
    }
  }
  return known;
}

export function reencryptGridProtectedColumns({
  db,
  sourceProtector,
  targetProtector
}) {
  if (!db || !sourceProtector || !targetProtector) {
    throw new ValidationError('Grid re-encryption dependencies are missing');
  }
  let values = 0;
  const tables = {};
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [table, keyExpression, columns] of PROTECTED_COLUMN_MAPPINGS) {
      let tableValues = 0;
      const rows = db.prepare(
        `SELECT ${keyExpression} AS protection_key, ${columns.join(', ')} FROM ${table}`
      ).all();
      for (const row of rows) {
        const protectionKey = row.protection_key;
        for (const column of columns) {
          const serialized = row[column];
          if (serialized === null || serialized === undefined) continue;
          const context = `axiom:${table}.${column}:${protectionKey}`;
          const value = sourceProtector.open(serialized, context);
          const reencrypted = targetProtector.seal(value, context);
          targetProtector.open(reencrypted, context);
          db.prepare(
            `UPDATE ${table} SET ${column} = ? WHERE ${keyExpression} = ?`
          ).run(reencrypted, protectionKey);
          tableValues += 1;
          values += 1;
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

function parseGridKeyTransition(manifest) {
  if (
    manifest?.format !== 'axiom-credential-rotation.v1'
    || manifest?.schema_version !== 1
    || manifest.scope?.data_protection_key !== false
    || manifest.scope?.requires_stopped_runtime !== true
    || typeof manifest.before?.public_keys?.grid !== 'string'
    || typeof manifest.after?.public_keys?.grid !== 'string'
  ) {
    throw new ValidationError('Credential rotation history scope is invalid');
  }
  let beforeKey;
  let afterKey;
  try {
    beforeKey = createPublicKey(manifest.before.public_keys.grid);
    afterKey = createPublicKey(manifest.after.public_keys.grid);
  } catch {
    throw new ValidationError('Credential rotation history Grid key is invalid');
  }
  const beforeId = `grid:${sha256(manifest.before.public_keys.grid).slice(0, 16)}`;
  const afterId = `grid:${sha256(manifest.after.public_keys.grid).slice(0, 16)}`;
  if (
    beforeKey.asymmetricKeyType !== 'ed25519'
    || afterKey.asymmetricKeyType !== 'ed25519'
    || beforeId !== manifest.before.key_ids?.grid
    || afterId !== manifest.after.key_ids?.grid
    || beforeId === afterId
    || manifest.attestation?.key_id !== beforeId
    || manifest.successor_attestation?.key_id !== afterId
  ) {
    throw new ValidationError('Credential rotation history key transition is invalid');
  }
  const unsigned = structuredClone(manifest);
  delete unsigned.attestation;
  delete unsigned.successor_attestation;
  if (
    !verifyObjectSignature(unsigned, manifest.attestation, beforeKey)
    || !verifyObjectSignature(
      unsigned,
      manifest.successor_attestation,
      afterKey
    )
  ) {
    throw new ValidationError('Credential rotation history transition attestation is invalid');
  }
  return {
    before: { id: beforeId, key: beforeKey },
    after: { id: afterId, key: afterKey }
  };
}

function addVerificationKey(known, candidate) {
  const existing = known.get(candidate.id);
  if (existing) {
    assertSamePublicKey(existing, candidate.key, candidate.id);
    return false;
  }
  known.set(candidate.id, candidate.key);
  return true;
}

function assertSamePublicKey(left, right, keyId) {
  const leftDer = left.export({ type: 'spki', format: 'der' });
  const rightDer = right.export({ type: 'spki', format: 'der' });
  if (!Buffer.from(leftDer).equals(Buffer.from(rightDer))) {
    throw new ValidationError(
      `Credential rotation history contains conflicting key ${keyId}`
    );
  }
}

async function atomicWrite(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, content, { mode, flag: 'wx' });
  await rename(temp, path);
}

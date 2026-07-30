import {
  ValidationError,
  canonicalJson,
  digestObject,
  sha256
} from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';
import {
  GridStore as CoreGridStore,
  loadGridVerificationKeys,
  reencryptGridProtectedColumns
} from './_store-core.mjs';

const GENESIS_HASH = '0'.repeat(64);
const CHECKPOINT_SCHEMA = 'axiom-grid-chain-checkpoint.v1';
const CHECKPOINT_META_KEY = 'chain_checkpoints_v1';
const DEFAULT_CHECKPOINT_INTERVAL = 10_000;
const DIGEST = /^[a-f0-9]{64}$/;
const CHECKPOINT_ID = /^gcp_[a-f0-9]{64}$/;

export {
  CHECKPOINT_SCHEMA,
  DEFAULT_CHECKPOINT_INTERVAL,
  loadGridVerificationKeys,
  reencryptGridProtectedColumns
};

export class GridStore extends CoreGridStore {
  constructor(options) {
    super(options);
    const interval = options?.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL;
    if (!Number.isSafeInteger(interval) || interval < 1 || interval > 1_000_000) {
      this.close();
      throw new ValidationError('Grid checkpoint interval must be an integer between 1 and 1000000');
    }
    this.checkpointInterval = interval;
    this.ensureChainCheckpoint({ minimumDistance: interval });
  }

  appendEvents(input) {
    const appended = super.appendEvents(input);
    this.ensureChainCheckpoint({ minimumDistance: this.checkpointInterval });
    return appended;
  }

  verifyChain({ mode = 'checkpoint' } = {}) {
    if (mode === 'full') return this.verifyFullChain();
    if (mode !== 'checkpoint') {
      return { valid: false, reason: 'verification_mode_invalid' };
    }
    let history;
    try {
      history = this.readCheckpointHistory();
    } catch {
      return { valid: false, reason: 'checkpoint_history_invalid' };
    }
    if (!history.length) return this.verifyFullChain();
    const checkpointVerification = this.verifyCheckpointHistory(history);
    if (!checkpointVerification.valid) return checkpointVerification;
    const latest = history.at(-1);
    return this.verifyEventRange({
      rows: this.db.prepare('SELECT * FROM events WHERE seq > ? ORDER BY seq').iterate(
        latest.statement.seq
      ),
      previous: latest.statement.head_hash,
      expectedSeq: latest.statement.seq + 1,
      initialCount: latest.statement.seq,
      verificationMode: 'checkpoint',
      checkpointCount: history.length,
      checkpointSeq: latest.statement.seq,
      prefixAssurance: 'signed_checkpoint'
    });
  }

  verifyFullChain() {
    let checkpointCount = 0;
    try {
      checkpointCount = this.readCheckpointHistory().length;
    } catch {
      // Full genesis verification is deliberately independent of checkpoint metadata.
    }
    return this.verifyEventRange({
      rows: this.db.prepare('SELECT * FROM events ORDER BY seq').iterate(),
      previous: GENESIS_HASH,
      expectedSeq: 1,
      initialCount: 0,
      verificationMode: 'full',
      checkpointCount,
      checkpointSeq: null,
      prefixAssurance: 'genesis_reverified'
    });
  }

  createChainCheckpoint({ force = false, createdAt = new Date().toISOString() } = {}) {
    const minimumDistance = force ? 1 : this.checkpointInterval;
    return this.ensureChainCheckpoint({ minimumDistance, createdAt });
  }

  listChainCheckpoints() {
    return structuredClone(this.readCheckpointHistory());
  }

  ensureChainCheckpoint({
    minimumDistance = DEFAULT_CHECKPOINT_INTERVAL,
    createdAt = new Date().toISOString()
  } = {}) {
    const seq = Number(
      this.db.prepare("SELECT value FROM meta WHERE key = 'last_seq'").get().value
    );
    if (seq === 0) return null;
    const headHash = this.db.prepare(
      "SELECT value FROM meta WHERE key = 'last_hash'"
    ).get().value;
    const history = this.readCheckpointHistory();
    const latest = history.at(-1);
    if (latest && seq - latest.statement.seq < minimumDistance) return latest;
    if (!Number.isFinite(Date.parse(createdAt))) {
      throw new ValidationError('Grid checkpoint timestamp is invalid');
    }
    const verificationKeys = this.verificationKeyInventory();
    const base = {
      schema: CHECKPOINT_SCHEMA,
      seq,
      head_hash: headHash,
      previous_checkpoint_digest: latest?.checkpoint_digest ?? null,
      verification_keys: verificationKeys,
      verification_keys_digest: digestObject(verificationKeys),
      created_at: new Date(createdAt).toISOString()
    };
    const statement = {
      ...base,
      checkpoint_id: `gcp_${digestObject(base)}`
    };
    const record = {
      statement,
      attestation: this.identity.signObject(statement)
    };
    record.checkpoint_digest = digestObject(record);
    const next = [...history, record];
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO meta(key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(CHECKPOINT_META_KEY, canonicalJson(next));
    });
    return structuredClone(record);
  }

  readCheckpointHistory() {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(
      CHECKPOINT_META_KEY
    );
    if (!row) return [];
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed) || parsed.length > 100_000) {
      throw new ValidationError('Grid checkpoint history is invalid');
    }
    return parsed;
  }

  verificationKeyInventory() {
    return [...this.verificationKeys.entries()]
      .map(([keyId, key]) => ({
        key_id: keyId,
        public_key_digest: sha256(key.export({ type: 'spki', format: 'der' }))
      }))
      .sort((left, right) => left.key_id.localeCompare(right.key_id));
  }

  verifyCheckpointHistory(history) {
    const activeKeys = new Map(
      this.verificationKeyInventory().map(item => [item.key_id, item.public_key_digest])
    );
    let previousDigest = null;
    let previousSeq = 0;
    for (const [index, record] of history.entries()) {
      if (!isPlainObject(record) || !isPlainObject(record.statement)) {
        return { valid: false, reason: 'checkpoint_record_invalid', checkpoint_index: index };
      }
      const statement = record.statement;
      if (
        statement.schema !== CHECKPOINT_SCHEMA
        || !CHECKPOINT_ID.test(statement.checkpoint_id ?? '')
        || !Number.isSafeInteger(statement.seq)
        || statement.seq < 1
        || statement.seq <= previousSeq
        || !DIGEST.test(statement.head_hash ?? '')
        || statement.previous_checkpoint_digest !== previousDigest
        || !Array.isArray(statement.verification_keys)
        || !DIGEST.test(statement.verification_keys_digest ?? '')
        || statement.verification_keys_digest !== digestObject(statement.verification_keys)
        || !Number.isFinite(Date.parse(statement.created_at))
      ) {
        return { valid: false, reason: 'checkpoint_statement_invalid', checkpoint_index: index };
      }
      const { checkpoint_id: _checkpointId, ...base } = statement;
      if (statement.checkpoint_id !== `gcp_${digestObject(base)}`) {
        return { valid: false, reason: 'checkpoint_id_mismatch', checkpoint_index: index };
      }
      if (
        !isPlainObject(record.attestation)
        || typeof record.attestation.key_id !== 'string'
        || !DIGEST.test(record.checkpoint_digest ?? '')
      ) {
        return { valid: false, reason: 'checkpoint_attestation_invalid', checkpoint_index: index };
      }
      const unsignedRecord = {
        statement,
        attestation: record.attestation
      };
      if (record.checkpoint_digest !== digestObject(unsignedRecord)) {
        return { valid: false, reason: 'checkpoint_digest_mismatch', checkpoint_index: index };
      }
      for (const item of statement.verification_keys) {
        if (
          !isPlainObject(item)
          || typeof item.key_id !== 'string'
          || !DIGEST.test(item.public_key_digest ?? '')
          || activeKeys.get(item.key_id) !== item.public_key_digest
        ) {
          return {
            valid: false,
            reason: 'checkpoint_verification_key_mismatch',
            checkpoint_index: index
          };
        }
      }
      if (!statement.verification_keys.some(
        item => item.key_id === record.attestation.key_id
      )) {
        return {
          valid: false,
          reason: 'checkpoint_signer_not_bound',
          checkpoint_index: index
        };
      }
      const checkpointKey = this.verificationKeys.get(record.attestation.key_id);
      if (
        !checkpointKey
        || !verifyObjectSignature(statement, record.attestation, checkpointKey)
      ) {
        return { valid: false, reason: 'checkpoint_signature_mismatch', checkpoint_index: index };
      }
      const event = this.db.prepare('SELECT * FROM events WHERE seq = ?').get(
        statement.seq
      );
      if (!event || event.event_hash !== statement.head_hash) {
        return { valid: false, reason: 'checkpoint_head_mismatch', checkpoint_index: index };
      }
      const eventVerification = this.verifyStoredEvent(event);
      if (!eventVerification.valid) {
        return {
          ...eventVerification,
          reason: `checkpoint_${eventVerification.reason}`,
          checkpoint_index: index
        };
      }
      previousDigest = record.checkpoint_digest;
      previousSeq = statement.seq;
    }
    return {
      valid: true,
      checkpoint_count: history.length,
      checkpoint_seq: previousSeq,
      checkpoint_digest: previousDigest
    };
  }

  verifyStoredEvent(row) {
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
    if (digestObject(envelope) !== row.event_hash) {
      return { valid: false, seq: row.seq, reason: 'event_hash_mismatch' };
    }
    let signature;
    try {
      signature = JSON.parse(row.signature_json);
    } catch {
      return { valid: false, seq: row.seq, reason: 'signature_encoding_invalid' };
    }
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
    return { valid: true };
  }

  verifyEventRange({
    rows,
    previous,
    expectedSeq,
    initialCount,
    verificationMode,
    checkpointCount,
    checkpointSeq,
    prefixAssurance
  }) {
    let eventCount = initialCount;
    let verifiedEvents = 0;
    for (const row of rows) {
      if (row.seq !== expectedSeq) {
        return { valid: false, seq: row.seq, reason: 'sequence_gap' };
      }
      if (row.prev_hash !== previous) {
        return { valid: false, seq: row.seq, reason: 'previous_hash_mismatch' };
      }
      const eventVerification = this.verifyStoredEvent(row);
      if (!eventVerification.valid) return eventVerification;
      previous = row.event_hash;
      expectedSeq += 1;
      eventCount += 1;
      verifiedEvents += 1;
    }
    const metaHash = this.db.prepare(
      "SELECT value FROM meta WHERE key = 'last_hash'"
    ).get().value;
    const metaSeq = Number(this.db.prepare(
      "SELECT value FROM meta WHERE key = 'last_seq'"
    ).get().value);
    if (metaHash !== previous || metaSeq !== eventCount) {
      return { valid: false, reason: 'metadata_mismatch' };
    }
    return {
      valid: true,
      events: eventCount,
      head: previous,
      verification_mode: verificationMode,
      prefix_assurance: prefixAssurance,
      verified_events: verifiedEvents,
      verified_from_seq: verifiedEvents ? eventCount - verifiedEvents + 1 : null,
      verified_through_seq: eventCount,
      checkpoint_count: checkpointCount,
      checkpoint_seq: checkpointSeq,
      full_verification_required_for_checkpointed_prefix_revalidation:
        verificationMode === 'checkpoint'
    };
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

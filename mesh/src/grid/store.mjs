import { digestObject } from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';
import {
  GridStore as CoreGridStore,
  loadGridVerificationKeys,
  reencryptGridProtectedColumns
} from './_store-core.mjs';

const GENESIS_HASH = '0'.repeat(64);

export { loadGridVerificationKeys, reencryptGridProtectedColumns };

// Keep the large materialization implementation separate from the public store
// surface. The override is intentionally dispatched during CoreGridStore's
// constructor, so startup verification also uses the streaming event scan.
export class GridStore extends CoreGridStore {
  verifyChain() {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY seq').iterate();
    let previous = GENESIS_HASH;
    let expectedSeq = 1;
    let eventCount = 0;
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
      if (digestObject(envelope) !== row.event_hash) {
        return { valid: false, seq: row.seq, reason: 'event_hash_mismatch' };
      }
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
      eventCount += 1;
    }
    const metaHash = this.db.prepare("SELECT value FROM meta WHERE key = 'last_hash'").get().value;
    const metaSeq = Number(this.db.prepare("SELECT value FROM meta WHERE key = 'last_seq'").get().value);
    if (metaHash !== previous || metaSeq !== eventCount) {
      return { valid: false, reason: 'metadata_mismatch' };
    }
    return { valid: true, events: eventCount, head: previous };
  }
}

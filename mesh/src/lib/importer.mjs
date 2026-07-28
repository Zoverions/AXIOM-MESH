import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';
import { verifyExportBundle } from '../verify-export.mjs';

const ALLOWED_TYPES = new Set([
  'identity_reference',
  'event',
  'intent',
  'consent',
  'approval',
  'capsule',
  'proposal',
  'vote',
  'appeal',
  'memory_object',
  'memory_edge',
  'account',
  'journal',
  'sync_update'
]);

export function validateImportBundle({ manifest, bundle, gridPublicKey }) {
  const verification = verifyExportBundle({ manifest, bundle, gridPublicKey });
  const parsedManifest = typeof manifest === 'string' ? JSON.parse(manifest) : structuredClone(manifest);
  const text = Buffer.isBuffer(bundle) ? bundle.toString('utf8') : String(bundle);
  const lines = text ? text.slice(0, -1).split('\n') : [];
  const seen = new Set();
  const records = lines.map((line, index) => {
    const record = JSON.parse(line);
    if (!ALLOWED_TYPES.has(record.type)) {
      throw new ValidationError(`Import record ${index + 1} has an unsupported type`);
    }
    if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) {
      throw new ValidationError(`Import record ${index + 1} data must be an object`);
    }
    const recordKey = keyForRecord(record);
    const scopedKey = `${record.type}:${recordKey}`;
    if (seen.has(scopedKey)) throw new ValidationError(`Import contains duplicate record ${scopedKey}`);
    seen.add(scopedKey);
    return {
      record_key: recordKey,
      record_type: record.type,
      record_digest: digestObject(record),
      data: structuredClone(record.data)
    };
  });
  return {
    verification,
    manifest: parsedManifest,
    bundle_digest: verification.bundle_sha256,
    records
  };
}

function keyForRecord(record) {
  const data = record.data;
  const candidates = {
    identity_reference: data.identity_id,
    event: data.event_id,
    intent: data.intent_id,
    consent: data.consent_id,
    approval: data.approval_id,
    capsule: data.capsule_id && data.version ? `${data.capsule_id}:${data.version}` : undefined,
    proposal: data.proposal_id,
    vote: data.proposal_id && data.voter ? `${data.proposal_id}:${data.voter}` : undefined,
    appeal: data.appeal_id,
    memory_object: data.object_id,
    memory_edge: data.edge_id,
    account: data.account_id,
    journal: data.journal_id,
    sync_update: data.update_id
  };
  const key = candidates[record.type];
  if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,319}$/.test(key)) {
    throw new ValidationError(`Import ${record.type} record has no valid stable identifier`);
  }
  if (canonicalJson(record) !== canonicalJson({ type: record.type, data: record.data })) {
    throw new ValidationError('Import record contains unsupported top-level fields');
  }
  return key;
}

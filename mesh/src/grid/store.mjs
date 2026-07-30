import {
  CHECKPOINT_SCHEMA,
  DEFAULT_CHECKPOINT_INTERVAL,
  GridStore as CheckpointGridStore,
  loadGridVerificationKeys,
  reencryptGridProtectedColumns
} from './_store-checkpoints.mjs';

const CHECKPOINT_BOUNDARY_REASONS = new Set([
  'payload_decryption_failed',
  'payload_digest_mismatch',
  'event_hash_mismatch',
  'signature_encoding_invalid',
  'signature_mismatch'
]);

export {
  CHECKPOINT_SCHEMA,
  DEFAULT_CHECKPOINT_INTERVAL,
  loadGridVerificationKeys,
  reencryptGridProtectedColumns
};

export class GridStore extends CheckpointGridStore {
  verifyCheckpointHistory(history) {
    const result = super.verifyCheckpointHistory(history);
    if (
      !result.valid
      && typeof result.reason === 'string'
      && result.reason.startsWith('checkpoint_')
    ) {
      const establishedReason = result.reason.slice('checkpoint_'.length);
      if (CHECKPOINT_BOUNDARY_REASONS.has(establishedReason)) {
        return {
          ...result,
          reason: establishedReason,
          verification_scope: 'checkpoint_boundary'
        };
      }
    }
    return result;
  }
}

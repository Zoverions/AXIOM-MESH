import { AxiomError, ValidationError, assertPlainObject } from '../lib/canonical.mjs';
import {
  assertExternalEffectCommitEvidence,
  buildExternalEffectCompletedEvent,
  buildExternalEffectPreparedEvent
} from '../lib/external-effect-outbox.mjs';

export async function runExternalEffectOutbox({
  prepared_effect,
  verify_prepared,
  commit,
  invoke_operator,
  verify_receipt
}) {
  if (typeof verify_prepared !== 'function') throw new ValidationError('verify_prepared callback is required');
  if (typeof commit !== 'function') throw new ValidationError('commit callback is required');
  if (typeof invoke_operator !== 'function') throw new ValidationError('invoke_operator callback is required');
  if (typeof verify_receipt !== 'function') throw new ValidationError('verify_receipt callback is required');

  const prepared = verify_prepared(prepared_effect);
  const preparedEvent = buildExternalEffectPreparedEvent(prepared);

  let preparedCommit;
  try {
    preparedCommit = await commit([preparedEvent]);
  } catch (error) {
    throw new AxiomError(
      'external_effect_prepare_uncommitted',
      'External effect was not invoked because durable Grid preparation failed',
      503,
      {
        effect_id: prepared.effect_id,
        effect_digest: prepared.effect_digest,
        operator_invoked: false
      }
    );
  }
  const preparedEvidence = assertExternalEffectCommitEvidence(preparedCommit, preparedEvent);

  let suppliedReceipt;
  try {
    suppliedReceipt = await invoke_operator(prepared);
  } catch {
    throw new AxiomError(
      'external_effect_outcome_unresolved',
      'External effect remains durably prepared because the repository operator outcome is unresolved',
      503,
      {
        effect_id: prepared.effect_id,
        effect_digest: prepared.effect_digest,
        prepared_event_id: preparedEvidence.event_id,
        prepared_event_hash: preparedEvidence.event_hash,
        prepared_event_seq: preparedEvidence.seq,
        completion_committed: false
      }
    );
  }

  let receipt;
  try {
    receipt = verify_receipt(suppliedReceipt, prepared);
  } catch {
    throw new AxiomError(
      'external_effect_receipt_unverified',
      'External effect remains durably prepared because the operator receipt could not be verified',
      503,
      {
        effect_id: prepared.effect_id,
        effect_digest: prepared.effect_digest,
        prepared_event_id: preparedEvidence.event_id,
        prepared_event_hash: preparedEvidence.event_hash,
        prepared_event_seq: preparedEvidence.seq,
        completion_committed: false
      }
    );
  }

  const completedEvent = buildExternalEffectCompletedEvent(prepared, receipt);
  let completedCommit;
  try {
    completedCommit = await commit([completedEvent]);
  } catch {
    throw new AxiomError(
      'external_effect_completion_uncommitted',
      'External effect receipt verified but completion could not be committed to Grid; replay must use the same prepared effect',
      503,
      {
        effect_id: prepared.effect_id,
        effect_digest: prepared.effect_digest,
        receipt_id: receipt.receipt_id,
        receipt_digest: receipt.receipt_digest,
        prepared_event_id: preparedEvidence.event_id,
        prepared_event_hash: preparedEvidence.event_hash,
        prepared_event_seq: preparedEvidence.seq,
        completion_committed: false
      }
    );
  }
  const completedEvidence = assertExternalEffectCommitEvidence(completedCommit, completedEvent);

  return {
    schema: 'axiom-external-effect-outbox-result.v1',
    effect_id: prepared.effect_id,
    effect_digest: prepared.effect_digest,
    status: 'completed',
    receipt: assertPlainObject(receipt, 'verified external effect receipt'),
    prepared_event: {
      event_id: preparedEvidence.event_id,
      event_hash: preparedEvidence.event_hash,
      seq: preparedEvidence.seq
    },
    completed_event: {
      event_id: completedEvidence.event_id,
      event_hash: completedEvidence.event_hash,
      seq: completedEvidence.seq
    },
    operator_invoked_after_durable_prepare: true,
    merge_performed: false,
    execution_authorized: false,
    remediation_converged: false
  };
}

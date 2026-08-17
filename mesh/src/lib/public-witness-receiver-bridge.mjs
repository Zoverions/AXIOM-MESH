import { readFile } from 'node:fs/promises';

import {
  ValidationError,
  assertString,
  canonicalJson
} from './canonical.mjs';
import {
  verifyPublicWitnessDurableRecord
} from './public-witness-durable-store.mjs';
import {
  validatePublicWitnessSourceAdmission,
  verifyPublicWitnessTransferPackage,
  verifyPublicWitnessTransferReceipt
} from './public-witness-transfer.mjs';

const DIGEST = /^[a-f0-9]{64}$/;

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function observationRequest(verifiedTransfer, trustedPersonaRootPublicKey, observedAt) {
  const base = {
    trusted_persona_root_public_key: trustedPersonaRootPublicKey,
    observed_at: observedAt
  };
  if (verifiedTransfer.statement.operation === 'observe-credential') {
    return Object.freeze({
      credential: verifiedTransfer.request.credential,
      ...base
    });
  }
  if (verifiedTransfer.statement.operation === 'observe-revocation') {
    return Object.freeze({
      revocation: verifiedTransfer.request.revocation,
      credential: verifiedTransfer.request.credential,
      ...base
    });
  }
  if (verifiedTransfer.statement.operation === 'observe-journal') {
    return Object.freeze({
      attestation: verifiedTransfer.request.attestation,
      persona_signing_credential: verifiedTransfer.request.persona_signing_credential,
      trusted_persona_root_public_key: trustedPersonaRootPublicKey,
      entry: verifiedTransfer.request.entry,
      publication: verifiedTransfer.request.publication,
      observed_at: observedAt
    });
  }
  throw new ValidationError('public witness receiver transfer operation cannot be bridged');
}

export async function findPublicWitnessDurableObservationRecord({
  statePath,
  trustedWitnessPublicKey,
  observationDigest,
  expectedDomainId,
  expectedWitnessId,
  maxStateBytes = 128 * 1024 * 1024
} = {}) {
  const path = assertString(statePath, 'public witness durable observation statePath', { min: 1, max: 4096 });
  const target = digest(observationDigest, 'public witness durable observationDigest');
  if (!Number.isSafeInteger(maxStateBytes) || maxStateBytes < 1 || maxStateBytes > 1024 * 1024 * 1024) {
    throw new ValidationError('public witness durable observation maxStateBytes is invalid');
  }
  const bytes = await readFile(path);
  if (bytes.length > maxStateBytes) {
    throw new ValidationError('public witness durable observation state exceeds configured byte limit');
  }
  if (bytes.length === 0) return null;
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) {
    throw new ValidationError('public witness durable observation state has an incomplete trailing record');
  }
  const lines = text.slice(0, -1).split('\n');
  let found = null;
  let priorDigest = null;
  for (let index = 0; index < lines.length; index += 1) {
    let raw;
    try {
      raw = JSON.parse(lines[index]);
    } catch {
      throw new ValidationError(`public witness durable observation record ${index + 1} is not valid JSON`);
    }
    if (canonicalJson(raw) !== lines[index]) {
      throw new ValidationError(`public witness durable observation record ${index + 1} must use canonical JSON`);
    }
    const record = verifyPublicWitnessDurableRecord(raw, {
      trustedWitnessPublicKey,
      expectedDomainId,
      expectedWitnessId
    });
    if (record.statement.sequence !== index + 1) {
      throw new ValidationError('public witness durable observation record sequence is not contiguous');
    }
    if (record.statement.previous_record_digest !== priorDigest) {
      throw new ValidationError('public witness durable observation predecessor chain is invalid');
    }
    priorDigest = record.record_digest;
    if (record.statement.observation_digest === target) {
      if (found) {
        throw new ValidationError('public witness durable observation digest appears in multiple durable records');
      }
      found = record;
    }
  }
  return found ? structuredClone(found) : null;
}

function verifyReceiverIntake(
  receiverStore,
  transferDigest,
  sourceAdmissionRaw,
  trustedPersonaRootPublicKey,
  now
) {
  const intake = receiverStore.getTransfer(transferDigest);
  const artifacts = receiverStore.getTransferArtifacts(transferDigest);
  if (!intake || !artifacts) {
    throw new ValidationError('public witness receiver bridge cannot find the durable transfer intake');
  }
  const durableAdmission = receiverStore.getSourceAdmission(intake.source_admission_digest);
  if (!durableAdmission) {
    throw new ValidationError('public witness receiver bridge cannot find the durable source admission');
  }
  const suppliedAdmission = validatePublicWitnessSourceAdmission(sourceAdmissionRaw);
  if (suppliedAdmission.admission_digest !== durableAdmission.admission_digest) {
    throw new ValidationError('public witness receiver bridge source admission does not match durable intake');
  }
  const receipt = verifyPublicWitnessTransferReceipt(artifacts.transfer_receipt, {
    trustedWitnessPublicKey: receiverStore.witnessPublicKey,
    transfer: artifacts.transfer,
    sourceAdmission: durableAdmission,
    trustedPersonaRootPublicKey,
    now
  });
  const transfer = verifyPublicWitnessTransferPackage(artifacts.transfer, {
    sourceAdmission: durableAdmission,
    trustedPersonaRootPublicKey,
    now: new Date(receipt.statement.received_at).valueOf()
  });
  return { intake, artifacts, receipt, transfer };
}

export async function commitReceiverTransferObservation({
  receiverStore,
  witnessStore,
  witnessStatePath,
  transferDigest,
  sourceAdmission,
  trustedPersonaRootPublicKey,
  observedAt,
  committedAt
} = {}) {
  const normalizedDigest = digest(transferDigest, 'public witness receiver bridge transferDigest');
  const observed = canonicalTimestamp(observedAt, 'public witness receiver bridge observedAt');
  const committed = canonicalTimestamp(committedAt, 'public witness receiver bridge committedAt');
  const verified = verifyReceiverIntake(
    receiverStore,
    normalizedDigest,
    sourceAdmission,
    trustedPersonaRootPublicKey,
    new Date(committed).valueOf()
  );
  if (verified.intake.observation_status === 'observation-committed') {
    return Object.freeze({ status: 'replay', transfer: verified.intake });
  }
  if (observed < verified.receipt.statement.received_at) {
    throw new ValidationError('public witness receiver observation cannot predate local transfer receipt');
  }
  if (committed < observed) {
    throw new ValidationError('public witness receiver observation commit cannot predate observation time');
  }
  if (receiverStore.witnessPublicKey !== witnessStore.witnessPublicKey) {
    throw new ValidationError('public witness receiver and durable witness stores must use the same witness key');
  }
  const result = await witnessStore.commit(
    verified.transfer.statement.operation,
    observationRequest(verified.transfer, trustedPersonaRootPublicKey, observed),
    { committedAt: committed }
  );
  const observationDigest = result.observation.observation_digest;
  let durableRecord = result.durable_record;
  if (!durableRecord) {
    durableRecord = await findPublicWitnessDurableObservationRecord({
      statePath: witnessStatePath,
      trustedWitnessPublicKey: witnessStore.witnessPublicKey,
      observationDigest,
      expectedDomainId: verified.transfer.statement.domain_id,
      expectedWitnessId: verified.receipt.statement.witness_id
    });
  }
  if (!durableRecord) {
    throw new ValidationError('public witness receiver bridge cannot locate durable observation record after witness commit');
  }
  const linked = await receiverStore.markObservationCommitted(normalizedDigest, {
    observationDigest,
    witnessDurableRecordDigest: durableRecord.record_digest,
    committedAt: durableRecord.statement.committed_at,
    reconciledAfterRestart: false
  });
  return Object.freeze({
    status: 'observation-committed',
    observation: structuredClone(result.observation),
    witness_durable_record: structuredClone(durableRecord),
    receiver_commit: linked
  });
}

export async function reconcileReceiverTransferObservation({
  receiverStore,
  witnessStore,
  witnessStatePath,
  transferDigest,
  sourceAdmission,
  trustedPersonaRootPublicKey,
  now = Date.now()
} = {}) {
  const normalizedDigest = digest(transferDigest, 'public witness receiver reconcile transferDigest');
  const verified = verifyReceiverIntake(
    receiverStore,
    normalizedDigest,
    sourceAdmission,
    trustedPersonaRootPublicKey,
    now
  );
  if (verified.intake.observation_status === 'observation-committed') {
    return Object.freeze({ status: 'already-linked', transfer: verified.intake });
  }
  if (receiverStore.witnessPublicKey !== witnessStore.witnessPublicKey) {
    throw new ValidationError('public witness receiver and durable witness stores must use the same witness key');
  }
  const observation = witnessStore.getObservation(verified.transfer.artifact.artifact_digest);
  if (!observation) {
    return Object.freeze({ status: 'pending-observation', transfer: verified.intake });
  }
  const durableRecord = await findPublicWitnessDurableObservationRecord({
    statePath: witnessStatePath,
    trustedWitnessPublicKey: witnessStore.witnessPublicKey,
    observationDigest: observation.observation_digest,
    expectedDomainId: verified.transfer.statement.domain_id,
    expectedWitnessId: verified.receipt.statement.witness_id
  });
  if (!durableRecord) {
    throw new ValidationError('public witness receiver reconcile found observation without durable witness record');
  }
  const linked = await receiverStore.markObservationCommitted(normalizedDigest, {
    observationDigest: observation.observation_digest,
    witnessDurableRecordDigest: durableRecord.record_digest,
    committedAt: durableRecord.statement.committed_at,
    reconciledAfterRestart: true
  });
  return Object.freeze({
    status: 'reconciled',
    observation: structuredClone(observation),
    witness_durable_record: structuredClone(durableRecord),
    receiver_commit: linked
  });
}
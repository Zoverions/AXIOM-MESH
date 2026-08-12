import { readFileSync } from 'node:fs';

import {
  ValidationError,
  assertPlainObject,
  digestObject,
} from '../lib/canonical.mjs';
import {
  EDUCATION_CONTRACT_PATH,
  validateEducationContract,
  validateEducationIntent,
} from './education-contract.mjs';

export const EDUCATION_LEARNER_PROGRESS_QUERY_KIND =
  'education.learner.progress.read';
export const EDUCATION_LEARNER_PROGRESS_QUERY_SCHEMA =
  'axiom.education.learner-progress-query.v1';

const EDUCATION_CONTRACT = loadPinnedEducationContractSync();

function loadPinnedEducationContractSync() {
  let raw;
  try {
    raw = readFileSync(EDUCATION_CONTRACT_PATH);
  } catch (error) {
    throw new ValidationError(
      `Pinned Axiom Education contract cannot be read: ${error.message}`,
    );
  }
  let contract;
  try {
    contract = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    throw new ValidationError(
      `Pinned Axiom Education contract is invalid JSON: ${error.message}`,
    );
  }
  validateEducationContract(contract, { rawBytes: raw });
  return Object.freeze(contract);
}

export function createEducationLearnerProgressQuery(intent) {
  const value = assertPlainObject(intent, 'intent');
  if (value.action !== EDUCATION_LEARNER_PROGRESS_QUERY_KIND) {
    throw new ValidationError('Education learner progress query action mismatch');
  }
  const input = assertPlainObject(value.input, 'intent.input');
  validateEducationIntent(
    EDUCATION_CONTRACT,
    EDUCATION_LEARNER_PROGRESS_QUERY_KIND,
    input,
  );
  const boundedInput = structuredClone(input);
  return Object.freeze({
    output: Object.freeze({}),
    query: Object.freeze({
      schema: EDUCATION_LEARNER_PROGRESS_QUERY_SCHEMA,
      kind: EDUCATION_LEARNER_PROGRESS_QUERY_KIND,
      input: Object.freeze(boundedInput),
      input_digest: digestObject(boundedInput),
    }),
  });
}

export function validateEducationLearnerProgressQuery(rawQuery) {
  const query = assertPlainObject(rawQuery, 'education learner progress query');
  if (query.schema !== EDUCATION_LEARNER_PROGRESS_QUERY_SCHEMA) {
    throw new ValidationError('Education learner progress query schema mismatch');
  }
  if (query.kind !== EDUCATION_LEARNER_PROGRESS_QUERY_KIND) {
    throw new ValidationError('Education learner progress query kind mismatch');
  }
  const input = assertPlainObject(query.input, 'education learner progress query input');
  validateEducationIntent(
    EDUCATION_CONTRACT,
    EDUCATION_LEARNER_PROGRESS_QUERY_KIND,
    input,
  );
  if (query.input_digest !== digestObject(input)) {
    throw new ValidationError('Education learner progress query input digest mismatch');
  }
  return Object.freeze({
    input: Object.freeze(structuredClone(input)),
    input_digest: query.input_digest,
  });
}

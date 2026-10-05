import {
  assertPlainObject,
  assertString
} from './canonical.mjs';

const EVENT_KIND = /^[a-z][a-z0-9.-]+$/;
const EVENT_SUBJECT = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function projectExecutionMutationEvent(rawMutation, rawEvidence) {
  const mutation = assertPlainObject(rawMutation, 'execution mutation');
  const payload = assertPlainObject(mutation.payload, 'execution mutation payload');
  const evidence = assertPlainObject(rawEvidence, 'execution mutation evidence');
  return {
    kind: assertString(mutation.kind, 'execution mutation kind', {
      max: 128,
      pattern: EVENT_KIND
    }),
    subject: assertString(mutation.subject, 'execution mutation subject', {
      max: 160,
      pattern: EVENT_SUBJECT
    }),
    payload: {
      ...structuredClone(payload),
      evidence: structuredClone(evidence)
    }
  };
}

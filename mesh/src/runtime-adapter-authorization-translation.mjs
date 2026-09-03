import {
  ValidationError,
  assertPlainObject
} from './lib/canonical.mjs';
import {
  createSyntheticReferenceRequest
} from './runtime-adapter-conformance.mjs';

const SUPPORTED_EXTERNAL_TRANSLATION_FIELDS = Object.freeze([
  'grantId',
  'idempotencyKey',
  'inputSha256',
  'principalId',
  'requestId'
]);
const SUPPORTED_EXTERNAL_TRANSLATION_FIELD_SET = new Set(
  SUPPORTED_EXTERNAL_TRANSLATION_FIELDS
);

export function translateSyntheticExternalAuthorizationRequest(input) {
  const source = assertPlainObject(
    input,
    'external authorization translation input'
  );
  const unsupported = Object.keys(source)
    .filter(field => !SUPPORTED_EXTERNAL_TRANSLATION_FIELD_SET.has(field))
    .sort();
  if (unsupported.length > 0) {
    throw new ValidationError(
      `unsupported authorization translation fields: ${unsupported.join(', ')}`
    );
  }
  return createSyntheticReferenceRequest(source);
}

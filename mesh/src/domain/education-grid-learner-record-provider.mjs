import { ValidationError } from '../lib/canonical.mjs';
import { createGridEducationConsentAssertion } from './education-grid-consent.mjs';
import { createGridEducationMemoryReferenceAssertion } from './education-grid-memory.mjs';
import {
  InMemoryEducationLearnerRecordIndex,
  createIndexedEducationLearnerRecordProvider,
} from './education-learner-record-index.mjs';

/**
 * Compose real Grid consent/memory-reference authority with the non-production
 * in-memory learner-record index.
 *
 * This is an integration/conformance provider only. It is intentionally not
 * configured by default and does not change domains.education from
 * adapter_required. Production persistence and Hypervisor/Gateway admission are
 * separate promotion gates.
 */
export function createGridEducationLearnerRecordReferenceProvider({
  store,
  allowedMemoryKinds,
  now = () => new Date().toISOString(),
  index = new InMemoryEducationLearnerRecordIndex(),
  provider_id = 'provider:grid-education-learner-record-reference',
  provider_version = '0.1.0',
} = {}) {
  if (!index || typeof index.appendEvent !== 'function' || typeof index.readProgress !== 'function') {
    throw new ValidationError('Grid education learner-record reference provider requires a learner index');
  }
  return createIndexedEducationLearnerRecordProvider({
    provider_id,
    provider_version,
    index,
    assertConsent: createGridEducationConsentAssertion({ store, now }),
    assertMemoryReference: createGridEducationMemoryReferenceAssertion({
      store,
      allowedKinds: allowedMemoryKinds,
    }),
  });
}

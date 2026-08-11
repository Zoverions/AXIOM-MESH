import { ValidationError } from '../lib/canonical.mjs';
import {
  educationUnavailableResult,
  validateEducationIntent,
} from './education-contract.mjs';
import { executeEducationLearnerRecordAction } from './education-learner-record-provider.mjs';

/**
 * Provider-aware education runtime seam.
 *
 * This function is intentionally not wired into Hypervisor admission yet. It proves
 * that reviewed provider injection can be expressed without changing the default
 * education-domain behavior. Unconfigured capabilities continue to return the exact
 * existing capability_unavailable result.
 */
export async function executeEducationAction(
  actionName,
  input,
  { learnerRecordProvider = null } = {},
) {
  const action = validateEducationIntent(actionName, input);
  if (action.provider_capability === 'education.learner-record') {
    return executeEducationLearnerRecordAction(actionName, input, {
      provider: learnerRecordProvider,
    });
  }
  return educationUnavailableResult(actionName);
}

export function describeEducationProviderRuntime({ learnerRecordProvider = null } = {}) {
  if (
    learnerRecordProvider !== null &&
    learnerRecordProvider.provider_capability !== 'education.learner-record'
  ) {
    throw new ValidationError('education runtime learner-record provider capability mismatch');
  }
  return Object.freeze({
    domain_status: 'adapter_required',
    configured_provider_capabilities: Object.freeze(
      learnerRecordProvider === null ? [] : ['education.learner-record'],
    ),
    unconfigured_provider_capabilities: Object.freeze([
      'education.curriculum',
      'education.tutor',
      ...(learnerRecordProvider === null ? ['education.learner-record'] : []),
    ]),
    claim_boundary:
      'Runtime provider injection does not promote domains.education, grant authority, or imply Hypervisor/Gateway admission. Unconfigured provider capabilities remain capability_unavailable.',
  });
}

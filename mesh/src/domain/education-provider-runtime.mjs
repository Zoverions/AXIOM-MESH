import { ValidationError } from '../lib/canonical.mjs';
import {
  loadEducationContract,
  validateEducationIntent,
} from './education-contract.mjs';
import { executeEducationLearnerRecordAction } from './education-learner-record-provider.mjs';

function educationUnavailableResult(actionName, action) {
  return {
    ok: false,
    http_status: 503,
    error: {
      code: 'capability_unavailable',
      message: `Education capability ${action.provider_capability} has no configured adapter`,
      details: {
        action: actionName,
        provider_capability: action.provider_capability,
        capability_status: 'adapter_required',
      },
    },
  };
}

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
  { learnerRecordProvider = null, actor = null } = {},
) {
  const contract = await loadEducationContract();
  validateEducationIntent(contract, actionName, input);
  const action = contract.actions[actionName];
  if (action.provider_capability === 'education.learner-record') {
    return executeEducationLearnerRecordAction(actionName, input, {
      provider: learnerRecordProvider,
      actor,
    });
  }
  return educationUnavailableResult(actionName, action);
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

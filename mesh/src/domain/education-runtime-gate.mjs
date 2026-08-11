import { ValidationError } from '../lib/canonical.mjs';
import { validateEducationIntent } from './education-contract.mjs';
import {
  EDUCATION_LEARNER_EVENT_ACTION,
  evaluateEducationLearnerEventConsent
} from './education-learner-record.mjs';

/**
 * Apply runtime education authorization facts after ordinary deny-dominant policy
 * evaluation and before a plan/capability is constructed.
 *
 * This gate never turns a denied policy decision into an allow. Its only powers
 * are validating an already policy-allowed education intent, narrowing it to a
 * supported action, attaching Grid-observed authorization facts, or denying it.
 */
export function applyEducationRuntimeGate({
  contract,
  intent,
  decision,
  consents = [],
  now = new Date().toISOString()
}) {
  if (!intent.action.startsWith('education.')) return structuredClone(decision);

  validateEducationIntent(contract, intent.action, intent.input);
  if (!decision.allow) return structuredClone(decision);

  if (intent.action !== EDUCATION_LEARNER_EVENT_ACTION) {
    return {
      ...decision,
      allow: false,
      pending: false,
      code: 'education_adapter_action_unavailable',
      http_status: 503,
      reason: `No executable education adapter is registered for ${intent.action}`
    };
  }

  const authorization = evaluateEducationLearnerEventConsent({
    contract,
    intent,
    consents,
    now
  });
  if (!authorization.allow) {
    return {
      ...decision,
      allow: false,
      pending: false,
      code: authorization.code,
      http_status: authorization.http_status,
      reason: authorization.reason
    };
  }

  const constraints = decision.constraints === undefined
    ? {}
    : structuredClone(decision.constraints);
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) {
    throw new ValidationError('Education policy constraints must be an object');
  }
  if (Object.hasOwn(constraints, 'education_consent')) {
    throw new ValidationError('Static policy may not pre-populate runtime education consent facts');
  }

  return {
    ...decision,
    constraints: {
      ...constraints,
      education_consent: {
        schema: 'axiom-education-consent-binding.v1',
        facts: authorization.facts,
        consent_digest: authorization.consent_digest
      }
    }
  };
}

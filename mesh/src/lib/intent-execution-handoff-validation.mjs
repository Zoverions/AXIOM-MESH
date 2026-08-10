import { ValidationError, assertPlainObject, digestObject } from './canonical.mjs';
import {
  INTENT_EXECUTION_ELIGIBILITY_SCHEMA,
  normalizeIntentExecutionHandoff
} from './intent-execution-eligibility.mjs';

export function validateIntentExecutionHandoffAgainstEligibility(rawHandoff, rawEligibility) {
  const handoff = normalizeIntentExecutionHandoff(rawHandoff);
  const eligibility = assertPlainObject(rawEligibility, 'current Intent execution eligibility');
  if (eligibility.schema !== INTENT_EXECUTION_ELIGIBILITY_SCHEMA) {
    throw new ValidationError(`current eligibility schema must be ${INTENT_EXECUTION_ELIGIBILITY_SCHEMA}`);
  }
  const suppliedDigest = eligibility.eligibility_digest;
  if (typeof suppliedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(suppliedDigest)) {
    throw new ValidationError('current eligibility digest is invalid');
  }
  const { eligibility_digest: ignoredDigest, ...body } = eligibility;
  if (digestObject(body) !== suppliedDigest) {
    throw new ValidationError('current eligibility digest does not match its content');
  }
  if (eligibility.decision !== 'eligible') {
    throw new ValidationError('execution handoff is no longer eligible');
  }
  if (eligibility.execution_authorized !== false) {
    throw new ValidationError('current eligibility must remain non-executing');
  }
  if (handoff.eligibility_digest !== suppliedDigest) {
    throw new ValidationError('execution handoff was built from a different eligibility result');
  }
  const exactBindings = [
    'remediation_proposal_id',
    'remediation_proposal_digest',
    'remediation_state_digest',
    'executor_registry_digest',
    'policy_digest',
    'capability_registry_digest',
    'semantic_action',
    'requester'
  ];
  for (const field of exactBindings) {
    if (handoff[field] !== eligibility[field]) {
      throw new ValidationError(`execution handoff binding changed: ${field}`);
    }
  }
  const mapped = assertPlainObject(eligibility.mapped_executor, 'current mapped executor');
  if (
    handoff.target.action !== mapped.target_action
    || handoff.target.tool !== mapped.tool
    || handoff.target.capability_id !== mapped.capability_id
    || handoff.target.mapping_digest !== mapped.mapping_digest
  ) {
    throw new ValidationError('execution handoff executor mapping is no longer current');
  }
  if (digestObject(handoff.target.input) !== mapped.fixed_input_digest) {
    throw new ValidationError('execution handoff input binding is no longer current');
  }
  return handoff;
}

import { createEducationLearnerAppendMutation } from '../domain/education-learner-append-mutation.mjs';
import { executeBuiltin } from './executor.mjs';

/**
 * Narrow extension over the mature Sandbox builtin executor.
 *
 * Only the existing mutation-validator tool plus the exact learner append
 * action are intercepted. All other tool/action combinations delegate without
 * modification to executeBuiltin().
 */
export function executeSandboxBuiltin({ tool, intent }) {
  if (
    tool === 'builtin.validate-mutation'
    && intent?.action === 'education.learner.event.append'
  ) {
    return createEducationLearnerAppendMutation(intent);
  }
  return executeBuiltin({ tool, intent });
}

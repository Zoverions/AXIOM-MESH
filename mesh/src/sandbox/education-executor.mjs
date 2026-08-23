import { createEducationLearnerAppendMutation } from '../domain/education-learner-append-mutation.mjs';
import { createEducationLearnerProgressQuery } from '../domain/education-learner-progress-query.mjs';
import { executeBuiltin } from './executor.mjs';

/**
 * Narrow extensions over the mature Sandbox builtin executor.
 *
 * Education learner writes reuse the existing mutation-validator tool. Native
 * learner self-reads use one exact domain-specific builtin that produces only an
 * attested Grid query descriptor. All other tool/action combinations delegate
 * without modification to executeBuiltin().
 */
export function executeSandboxBuiltin({ tool, intent }) {
  if (
    tool === 'builtin.validate-mutation'
    && intent?.action === 'education.learner.event.append'
  ) {
    return createEducationLearnerAppendMutation(intent);
  }
  if (
    tool === 'builtin.education-learner-progress-read'
    && intent?.action === 'education.learner.progress.read'
  ) {
    return createEducationLearnerProgressQuery(intent);
  }
  return executeBuiltin({ tool, intent });
}

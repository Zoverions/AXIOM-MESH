import {
  ValidationError,
  assertPlainObject,
  assertString,
} from '../lib/canonical.mjs';
import { parseJsonBody } from '../lib/http.mjs';
import { executeGridNativeEducationLearnerProgressRead } from '../domain/education-grid-progress-read.mjs';
import { validateEducationLearnerProgressQuery } from '../domain/education-learner-progress-query.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function registerEducationGridRoutes(router, store) {
  router.add(
    'POST',
    '/internal/v1/education/learner-progress',
    async ({ body, principal }) => {
      if (principal.service !== 'hypervisor') {
        throw new ValidationError('Only Hypervisor may execute native education reads');
      }
      const request = assertPlainObject(
        parseJsonBody(body),
        'native education read request',
      );
      const actor = assertString(request.actor, 'native education read actor', {
        max: 160,
        pattern: PRINCIPAL_ID,
      });
      const claimedPrincipal = assertString(
        request.principal,
        'native education read principal',
        { max: 160, pattern: PRINCIPAL_ID },
      );
      if (actor !== claimedPrincipal) {
        throw new ValidationError(
          'Native education read actor does not match the claimed principal',
        );
      }
      const { input, input_digest } = validateEducationLearnerProgressQuery(
        request.query,
      );
      const provider = await executeGridNativeEducationLearnerProgressRead({
        store,
        rawInput: input,
        actor,
      });
      return Object.freeze({
        query_input_digest: input_digest,
        ...provider,
      });
    },
  );
}

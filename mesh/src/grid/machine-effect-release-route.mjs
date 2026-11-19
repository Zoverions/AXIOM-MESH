import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString
} from '../lib/canonical.mjs';
import { verifyCapability } from '../lib/identity.mjs';
import { parseJsonBody } from '../lib/http.mjs';
import { signMachineEffectReleaseReceipt } from '../lib/machine-effect-release.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REQUEST_FIELDS = Object.freeze([
  'actor',
  'attempt_id',
  'capability',
  'consumption_receipt_digest',
  'sandbox_execution_epoch'
]);

export function registerMachineEffectReleaseGridRoute(router, {
  config,
  identity,
  store,
  hypervisorPublicKey
}) {
  router.add(
    'POST',
    '/internal/v1/machine-effect/release',
    async ({ body, principal, traceId }) => {
      if (principal?.service !== 'hypervisor') {
        throw new AxiomError(
          'caller_not_allowed',
          'Only Hypervisor may release a machine effect',
          403
        );
      }
      const input = exactRequest(parseJsonBody(body));
      const actor = assertString(input.actor, 'machine effect release actor', {
        max: 160,
        pattern: ID
      });
      const attemptId = assertString(input.attempt_id, 'machine effect release attempt id', {
        max: 160,
        pattern: ID
      });
      const executionEpoch = assertString(
        input.sandbox_execution_epoch,
        'Sandbox execution epoch',
        { max: 160, pattern: ID }
      );
      const consumptionReceiptDigest = assertString(
        input.consumption_receipt_digest,
        'capability consumption receipt digest',
        { min: 64, max: 64, pattern: DIGEST }
      );
      const capability = assertString(input.capability, 'capability token', {
        max: 16_384
      });
      const claims = verifyCapability(capability, hypervisorPublicKey, {
        audience: 'sandbox',
        issuer: 'hypervisor',
        maxTtlSeconds: config.capabilityTtlSeconds
      });
      if (
        !['agent', 'service'].includes(claims.principal_type)
        || claims.subject !== actor
        || claims.execution_attempt_id !== attemptId
      ) {
        throw new AxiomError(
          'machine_effect_release_mismatch',
          'Capability is not bound to this machine effect release',
          403
        );
      }
      const committed = store.commitMachineEffectRelease({
        traceId,
        actor,
        capabilityClaims: claims,
        attemptId,
        sandboxExecutionEpoch: executionEpoch,
        consumptionReceiptDigest
      });
      return signMachineEffectReleaseReceipt(identity, committed.release);
    }
  );
}

function exactRequest(value) {
  const input = assertPlainObject(value, 'machine effect release request');
  if (Object.keys(input).sort().join(',') !== REQUEST_FIELDS.join(',')) {
    throw new ValidationError('Machine effect release request fields are invalid');
  }
  return input;
}

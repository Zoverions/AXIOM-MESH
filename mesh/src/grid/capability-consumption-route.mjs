import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString
} from '../lib/canonical.mjs';
import {
  loadTrustedKey,
  verifyCapability
} from '../lib/identity.mjs';
import { parseJsonBody } from '../lib/http.mjs';
import {
  capabilityConsumptionEventId,
  signCapabilityConsumptionReceipt
} from '../lib/capability-consumption.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export async function createCapabilityConsumptionHandler({
  config,
  identity,
  store
}) {
  const hypervisorKey = await loadTrustedKey(config.dataDir, 'hypervisor');

  return async function consumeCapability({ body, traceId, principal }) {
    if (principal?.service !== 'hypervisor') {
      throw new ValidationError('Only Hypervisor may consume capabilities');
    }
    const input = assertPlainObject(parseJsonBody(body), 'capability consumption');
    const executionEpoch = assertString(
      input.execution_epoch,
      'Sandbox execution epoch',
      { max: 160, pattern: ID }
    );
    const capability = assertString(input.capability, 'capability token', {
      max: 16_384
    });
    const claims = verifyCapability(capability, hypervisorKey, {
      audience: 'sandbox',
      issuer: 'hypervisor',
      maxTtlSeconds: config.capabilityTtlSeconds
    });
    const eventId = capabilityConsumptionEventId(claims.jti);
    if (store.db.prepare('SELECT 1 FROM events WHERE event_id = ?').get(eventId)) {
      throw consumedError(claims.jti);
    }

    const signed = signCapabilityConsumptionReceipt(identity, {
      capability,
      claims,
      executionEpoch
    });
    try {
      const events = store.appendEvents({
        traceId,
        actor: claims.subject,
        events: [{
          event_id: eventId,
          kind: 'capability.consumed',
          subject: claims.jti,
          payload: {
            receipt: signed.receipt,
            receipt_digest: signed.receipt_digest
          }
        }]
      });
      return {
        httpStatus: 201,
        body: {
          receipt: signed.receipt,
          receipt_digest: signed.receipt_digest,
          event_id: events[0].event_id,
          event_hash: events[0].event_hash
        }
      };
    } catch (error) {
      if (
        error?.code === 'state_conflict'
        && store.db.prepare('SELECT 1 FROM events WHERE event_id = ?').get(eventId)
      ) {
        throw consumedError(claims.jti);
      }
      throw error;
    }
  };
}

function consumedError(jti) {
  return new AxiomError(
    'capability_consumed',
    'Capability has already been durably consumed',
    409,
    { jti }
  );
}

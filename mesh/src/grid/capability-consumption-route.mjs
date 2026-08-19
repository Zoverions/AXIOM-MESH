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
import {
  capabilityConsumptionEventId,
  signCapabilityConsumptionReceipt
} from '../lib/capability-consumption.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export async function createCapabilityConsumptionCommitter({
  config,
  identity,
  store
}) {
  const hypervisorKey = await loadTrustedKey(config.dataDir, 'hypervisor');

  return function consumeCapability({ traceId, actor, event }) {
    const request = assertPlainObject(event, 'capability consumption request');
    if (request.kind !== 'capability.consume.requested') {
      throw new ValidationError('Capability consumption request kind is invalid');
    }
    const input = assertPlainObject(request.payload, 'capability consumption payload');
    if (
      Object.keys(input).length !== 2
      || !Object.prototype.hasOwnProperty.call(input, 'capability')
      || !Object.prototype.hasOwnProperty.call(input, 'execution_epoch')
    ) {
      throw new ValidationError('Capability consumption payload fields are invalid');
    }
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
    if (actor !== claims.subject) {
      throw new ValidationError(
        'Capability consumption actor must equal the capability subject'
      );
    }
    if (request.subject !== claims.jti) {
      throw new ValidationError(
        'Capability consumption subject must equal the capability JTI'
      );
    }

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
        actor,
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
      return Object.freeze({
        receipt: signed.receipt,
        receipt_digest: signed.receipt_digest,
        event: events[0]
      });
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

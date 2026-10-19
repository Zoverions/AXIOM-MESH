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
  capabilitySemanticConsumptionDigest,
  capabilitySemanticConsumptionEventId,
  normalizeCapabilityConsumptionStatement,
  signCapabilityConsumptionReceipt
} from '../lib/capability-consumption.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export async function createCapabilityConsumptionCommitter({
  config,
  identity,
  store
}) {
  const hypervisorKey = await loadTrustedKey(config.dataDir, 'hypervisor');
  const chain = store.verifyChain();
  if (!chain.valid) {
    throw new ValidationError(
      `Cannot derive semantic capability consumption from invalid Grid history: ${chain.reason ?? 'unknown'}`
    );
  }
  const historicalSemanticDigests = loadHistoricalSemanticDigests(store);

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
    const semanticDigest = capabilitySemanticConsumptionDigest(claims);
    const semanticEventId = capabilitySemanticConsumptionEventId(claims);
    if (store.db.prepare('SELECT 1 FROM events WHERE event_id = ?').get(eventId)) {
      throw consumedError(claims.jti);
    }
    if (
      historicalSemanticDigests.has(semanticDigest)
      || store.db.prepare('SELECT 1 FROM events WHERE event_id = ?').get(semanticEventId)
    ) {
      throw semanticConsumedError(semanticDigest);
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
        events: [
          {
            event_id: semanticEventId,
            kind: 'capability.semantic-consumed',
            subject: claims.subject,
            payload: {
              semantic_consumption_digest: semanticDigest,
              capability_jti: claims.jti,
              capability_consumption_event_id: eventId
            }
          },
          {
            event_id: eventId,
            kind: 'capability.consumed',
            subject: claims.jti,
            payload: {
              receipt: signed.receipt,
              receipt_digest: signed.receipt_digest
            }
          }
        ]
      });
      historicalSemanticDigests.add(semanticDigest);
      return Object.freeze({
        receipt: signed.receipt,
        receipt_digest: signed.receipt_digest,
        event: events[1],
        semantic_event: events[0]
      });
    } catch (error) {
      if (error?.code === 'state_conflict') {
        if (store.db.prepare('SELECT 1 FROM events WHERE event_id = ?').get(eventId)) {
          throw consumedError(claims.jti);
        }
        if (store.db.prepare('SELECT 1 FROM events WHERE event_id = ?').get(semanticEventId)) {
          historicalSemanticDigests.add(semanticDigest);
          throw semanticConsumedError(semanticDigest);
        }
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


function loadHistoricalSemanticDigests(store) {
  const digests = new Set();
  const rows = store.db.prepare(
    "SELECT * FROM events WHERE kind = 'capability.consumed' ORDER BY seq"
  ).all();
  for (const row of rows) {
    const event = store.decodeEventRow(row);
    const statement = normalizeCapabilityConsumptionStatement(event.payload?.receipt?.statement);
    const digest = capabilitySemanticConsumptionDigest(statement);
    // A valid pre-fix history may already contain more than one JTI for the
    // same exact invocation. Preserve that append-only evidence, but collapse it
    // to one consumed semantic identity so the upgrade cannot replenish budget.
    digests.add(digest);
  }
  return digests;
}

function semanticConsumedError(semanticDigest) {
  return new AxiomError(
    'semantic_action_consumed',
    'This exact authorized semantic action has already been durably consumed',
    409,
    { semantic_consumption_digest: semanticDigest }
  );
}

import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import { signedFetch } from '../lib/client.mjs';
import {
  assertExternalEffectCommitEvidence,
  buildExternalEffectCompletedEvent
} from '../lib/external-effect-outbox.mjs';
import {
  verifyResolvedIntentPreparedRepositoryDocsEffect
} from '../lib/intent-resolver-prepared-effect.mjs';
import {
  verifyDurableGridPreparation
} from '../repository-operator/github-docs-operator.mjs';
import { invokeRepositoryOperator } from './repository-operator-client.mjs';

export const INTENT_RESOLVER_GRID_COMPLETION_SCHEMA =
  'axiom-intent-resolver-grid-completion.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

function id(value, name, max = 192) {
  return assertString(value, name, { min: 1, max, pattern: ID });
}

function requireHypervisor(identity) {
  if (!identity?.keyId?.startsWith('hypervisor:') || typeof identity.signObject !== 'function') {
    throw new ValidationError('resolver completion requires Hypervisor identity');
  }
  return identity;
}

function normalizedGridUrl(value) {
  const url = new URL(assertString(value, 'gridUrl', { min: 1, max: 2048 }));
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ValidationError('Grid URL must use http or https');
  }
  return url.toString().replace(/\/$/, '');
}

function normalizePreparation(raw) {
  const value = assertPlainObject(raw, 'resolver Grid preparation');
  if (value.schema !== 'axiom-intent-resolver-grid-preparation.v1') {
    throw new ValidationError('resolver completion requires axiom-intent-resolver-grid-preparation.v1');
  }
  if (
    value.durable_preparation_observed !== true
    || value.approval_consumed_observed !== true
    || value.external_effect_executed !== false
    || value.merge_performed !== false
  ) {
    throw new ValidationError('resolver Grid preparation status claims are invalid');
  }
  const binding = assertPlainObject(value.binding, 'resolver Grid preparation binding');
  const event = assertPlainObject(value.prepared_event, 'resolver Grid prepared event');
  if (
    value.effect_id !== binding.prepared_effect?.effect_id
    || value.effect_digest !== binding.prepared_effect?.effect_digest
    || event.subject !== value.effect_id
    || event.kind !== 'external.effect.prepared'
  ) {
    throw new ValidationError('resolver Grid preparation does not consistently identify one prepared effect');
  }
  return value;
}

/**
 * Executes only a resolver effect that is already durably prepared in Grid.
 *
 * The repository operator receives both the Hypervisor-signed prepared effect
 * and the Grid-signed durable preparation event. The operator independently
 * verifies that evidence before it can touch GitHub. The returned signed
 * receipt is then committed back to Grid as the sole completion transition.
 */
export async function executeGridPreparedResolvedRepositoryEffect({
  identity,
  gridUrl,
  traceId,
  socketPath,
  preparation,
  authorization,
  handoff,
  resolution,
  eligibility,
  operatorPublicKey,
  gridPublicKey,
  policy,
  principal,
  request,
  approval,
  now = new Date().toISOString(),
  timeoutMs
}) {
  const hypervisor = requireHypervisor(identity);
  const prepared = normalizePreparation(preparation);
  const binding = verifyResolvedIntentPreparedRepositoryDocsEffect(prepared.binding, {
    authorization,
    handoff,
    resolution,
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey,
    policy,
    principal,
    request,
    approval,
    now
  });
  if (
    binding.binding_digest !== prepared.binding.binding_digest
    || binding.prepared_effect.effect_id !== prepared.effect_id
    || binding.prepared_effect.effect_digest !== prepared.effect_digest
  ) {
    throw new ValidationError('resolver preparation binding does not match durable preparation package');
  }

  const durable = verifyDurableGridPreparation({
    prepared_effect: binding.prepared_effect,
    grid_prepared_event: prepared.prepared_event,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey,
    gridPublicKey,
    now
  });
  if (durable.grid_event.subject !== prepared.effect_id) {
    throw new ValidationError('Grid durable preparation subject does not match resolver effect');
  }

  const receipt = await invokeRepositoryOperator({
    socketPath,
    prepared_effect: durable.prepared_effect,
    grid_prepared_event: durable.grid_event,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey,
    now,
    ...(timeoutMs === undefined ? {} : { timeoutMs })
  });

  const completedEvent = buildExternalEffectCompletedEvent(
    durable.prepared_effect,
    receipt
  );
  const actor = id(principal?.id, 'principal.id', 160);
  if (actor !== durable.prepared_effect.source_bindings.principal) {
    throw new ValidationError('resolver completion actor does not match durable prepared effect');
  }
  const committed = await signedFetch(
    hypervisor,
    'grid',
    `${normalizedGridUrl(gridUrl)}/internal/v1/commit`,
    {
      method: 'POST',
      traceId,
      body: {
        actor,
        principal: actor,
        events: [completedEvent]
      }
    }
  );
  const completionEvidence = assertExternalEffectCommitEvidence(
    committed,
    completedEvent
  );

  return {
    schema: INTENT_RESOLVER_GRID_COMPLETION_SCHEMA,
    effect_id: durable.prepared_effect.effect_id,
    effect_digest: durable.prepared_effect.effect_digest,
    resolver_binding_digest: binding.binding_digest,
    target_authorization_digest: binding.target_authorization_digest,
    resolution_digest: binding.resolution_digest,
    handoff_digest: binding.handoff_digest,
    repository_plan_digest: binding.repository_plan_digest,
    prepared_event_id: durable.grid_event.event_id,
    prepared_event_hash: durable.grid_event.event_hash,
    receipt,
    receipt_digest: receipt.receipt_digest,
    completed_event: completionEvidence,
    completed_payload_digest: digestObject(completedEvent.payload),
    durable_completion_observed: true,
    external_effect_executed_observed: true,
    pull_request_created_observed: true,
    merge_performed: false,
    remediation_converged: false,
    execution_authorized: false,
    non_claim: 'The exact Grid-durable prepared repository effect executed once and its signed receipt was durably recorded. This does not install a production executor mapping, authorize merges, or establish remediation convergence.'
  };
}

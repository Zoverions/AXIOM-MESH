import { pathToFileURL } from 'node:url';
import { meshConfig } from '../lib/config.mjs';
import {
  ReplayGuard,
  ensureMeshIdentity,
  loadTrustedKey,
  verifyCapability,
  verifySignedRequest
} from '../lib/identity.mjs';
import { Router, createServiceServer, listen, parseJsonBody } from '../lib/http.mjs';
import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  digestObject,
  newId
} from '../lib/canonical.mjs';
import { operationsReport, readinessState, ServiceTelemetry } from '../lib/observability.mjs';
import { runServiceProcess } from '../lib/service-lifecycle.mjs';
import {
  loadTransportRuntime,
  transportServerOptions
} from '../lib/transport-credentials.mjs';
import {
  allowedInboundTransportPeers,
  authorizeInboundServiceRequest
} from '../lib/service-network-policy.mjs';
import { planDigest, validatePlan } from '../lib/plan.mjs';
import { effectDestinationForTool } from '../lib/effect-destination.mjs';
import { verifyCapabilityConsumptionReceipt } from '../lib/capability-consumption.mjs';
import { executeSandboxBuiltin } from './education-executor.mjs';
import {
  evaluateMachineEffectCurrentnessCheckpointPrerequisite
} from '../lib/machine-effect-currentness-checkpoint-adapter.mjs';

const DIGEST = /^[a-f0-9]{64}$/;

export async function createSandboxService(config = meshConfig(), {
  machineCurrentness = null,
  beforeMachineEffectAdmission = null,
  executeBuiltin = executeSandboxBuiltin
} = {}) {
  if (
    config.environment !== 'test'
    && (
      beforeMachineEffectAdmission !== null
      || executeBuiltin !== executeSandboxBuiltin
    )
  ) {
    throw new ValidationError(
      'Sandbox effect-admission test hooks are forbidden outside the test environment'
    );
  }
  if (
    beforeMachineEffectAdmission !== null
    && typeof beforeMachineEffectAdmission !== 'function'
  ) {
    throw new ValidationError(
      'Sandbox beforeMachineEffectAdmission hook must be a function when provided'
    );
  }
  if (typeof executeBuiltin !== 'function') {
    throw new ValidationError('Sandbox executeBuiltin dependency must be a function');
  }

  const identity = await ensureMeshIdentity(config.dataDir, 'sandbox', { create: config.autoBootstrap });
  identity.transport = config.transport.enabled
    ? await loadTransportRuntime({
        transportDir: config.transport.directory,
        service: 'sandbox'
      })
    : null;
  const hypervisorKey = await loadTrustedKey(config.dataDir, 'hypervisor');
  const gridKey = await loadTrustedKey(config.dataDir, 'grid');
  const executionEpoch = newId('sandbox_epoch');
  const requestReplay = new ReplayGuard();
  const capabilityReplay = new ReplayGuard();
  const router = new Router();
  const telemetry = new ServiceTelemetry('sandbox');

  function currentOperations() {
    return {
      ...operationsReport([telemetry.snapshot(readinessState('sandbox', [
        { name: 'identity', ok: true },
        { name: 'hypervisor-trust', ok: true },
        { name: 'grid-consumption-trust', ok: true },
        { name: 'execution-mode', ok: true }
      ]))]),
      execution_epoch: executionEpoch
    };
  }

  router.add('GET', '/health', async () => ({
    service: 'sandbox',
    status: 'live'
  }), { auth: false });

  router.add('GET', '/internal/v1/operations', async () => currentOperations());

  router.add('POST', '/internal/v1/execute', async ({ body, traceId }) => {
    const input = assertPlainObject(parseJsonBody(body), 'execution');
    const intent = assertPlainObject(input.intent, 'intent');
    const plan = validatePlan(input.plan);
    const claims = verifyCapability(input.capability, hypervisorKey, {
      audience: 'sandbox',
      issuer: 'hypervisor',
      maxTtlSeconds: config.capabilityTtlSeconds
    });
    if (
      claims.invocation_digest !== undefined
      && !DIGEST.test(claims.invocation_digest)
    ) {
      throw new AxiomError(
        'invalid_capability_claims',
        'Capability token invocation digest is invalid',
        401
      );
    }
    if (claims.effect_destination !== undefined) {
      let expectedDestination;
      try {
        expectedDestination = effectDestinationForTool(claims.tool);
      } catch {
        throw new AxiomError(
          'capability_destination_unresolved',
          'Capability tool has no verified effect destination',
          403
        );
      }
      if (claims.effect_destination !== expectedDestination) {
        throw new AxiomError(
          'capability_destination_mismatch',
          'Capability destination is not bound to the selected execution tool',
          403
        );
      }
    }
    const intentDigest = digestObject(intent);
    if (claims.intent_digest !== intentDigest) {
      throw new AxiomError('capability_intent_mismatch', 'Capability token is not bound to this intent', 403);
    }
    if (planDigest(plan) !== claims.plan_digest) {
      throw new AxiomError('capability_plan_mismatch', 'Capability token is not bound to this plan', 403);
    }
    if (
      plan.intent_id !== intent.intent_id
      || plan.principal !== intent.principal.id
      || plan.action !== intent.action
      || plan.policy.digest !== claims.policy_digest
    ) {
      throw new AxiomError('plan_intent_mismatch', 'Plan is not bound to the supplied intent and policy', 403);
    }
    if (!input.consumption_receipt) {
      throw new AxiomError(
        'capability_consumption_required',
        'A durable Grid capability consumption receipt is required',
        403
      );
    }
    const consumption = verifyCapabilityConsumptionReceipt(input.consumption_receipt, {
      gridPublicKey: gridKey,
      capability: input.capability,
      claims,
      executionEpoch
    });
    const replayAdmission = capabilityReplay.admit('capability', claims.jti, claims.exp * 1000);
    if (replayAdmission === 'replayed') {
      throw new AxiomError('capability_replayed', 'Capability token has already been used', 409);
    }
    if (replayAdmission === 'saturated') {
      throw new AxiomError(
        'capability_replay_guard_saturated',
        'Capability replay protection is temporarily saturated',
        503
      );
    }
    if (replayAdmission !== 'admitted') {
      throw new AxiomError(
        'capability_replay_guard_unavailable',
        'Capability replay protection is unavailable',
        503
      );
    }
    if (claims.subject !== intent.principal.id) {
      throw new AxiomError('capability_subject_mismatch', 'Capability subject does not match the intent principal', 403);
    }

    let machineCurrentnessPrerequisite = null;
    if (
      intent.principal.schema === 'axiom-machine-principal.v1'
      && machineCurrentness?.required === true
    ) {
      if (typeof beforeMachineEffectAdmission === 'function') {
        await beforeMachineEffectAdmission({
          traceId,
          intent,
          plan,
          capability: input.capability,
          claims,
          consumption_receipt: input.consumption_receipt,
          consumption_receipt_digest: consumption.receipt_digest,
          execution_epoch: executionEpoch
        });
      }
      let retained;
      const source = machineCurrentness.source;
      const store = machineCurrentness.store;
      try {
        if (source && typeof source.resolveRetainedHead === 'function') {
          const resolved = await source.resolveRetainedHead({
            principalId: intent.principal.id,
            principalType: intent.principal.type
          });
          retained = resolved?.retained_latest_checkpoint ?? null;
        } else if (
          store
          && typeof store.verifyState === 'function'
          && typeof store.retainedHead === 'function'
        ) {
          await store.verifyState();
          retained = store.retainedHead();
        } else {
          throw new ValidationError(
            'Required machine-principal currentness source is not configured'
          );
        }
      } catch (error) {
        throw new AxiomError(
          'machine_currentness_unavailable',
          'Required machine-principal currentness state could not be verified',
          503,
          { cause_code: error?.code ?? 'currentness_state_verification_failed' }
        );
      }
      if (!retained) {
        throw new AxiomError(
          'machine_currentness_unavailable',
          'Required machine-principal retained currentness head is unavailable',
          503
        );
      }
      if (
        typeof machineCurrentness.trustedControllerPublicKey === 'undefined'
        || !Number.isSafeInteger(machineCurrentness.maxEvidenceAgeMs)
        || machineCurrentness.maxEvidenceAgeMs < 0
        || typeof claims.authority_digest !== 'string'
        || !DIGEST.test(claims.authority_digest)
        || typeof claims.effect_destination !== 'string'
        || claims.effect_destination.length === 0
      ) {
        throw new AxiomError(
          'machine_currentness_configuration_invalid',
          'Machine-principal currentness admission configuration is invalid',
          503
        );
      }

      try {
        machineCurrentnessPrerequisite =
          evaluateMachineEffectCurrentnessCheckpointPrerequisite({
            currentnessCheckpoint: retained,
            retainedLatestCheckpoint: retained,
            trustedControllerPublicKey: machineCurrentness.trustedControllerPublicKey,
            expectedPrincipalId: intent.principal.id,
            expectedPrincipalType: intent.principal.type,
            expectedAuthorityDigest: claims.authority_digest,
            capabilityId: claims.jti,
            intentDigest,
            planDigest: claims.plan_digest,
            effectDestination: claims.effect_destination,
            effectAt: new Date().toISOString(),
            maxEvidenceAgeMs: machineCurrentness.maxEvidenceAgeMs
          });
      } catch (error) {
        throw new AxiomError(
          'machine_currentness_invalid',
          'Machine-principal currentness prerequisite could not be verified',
          403,
          { cause_code: error?.code ?? 'currentness_prerequisite_verification_failed' }
        );
      }
      if (!machineCurrentnessPrerequisite.allow) {
        throw new AxiomError(
          machineCurrentnessPrerequisite.code,
          'Machine-principal authority is not current enough for this effect',
          403,
          {
            currentness_prerequisite_decision_digest:
              machineCurrentnessPrerequisite.prerequisite_decision_digest,
            retained_checkpoint_digest:
              machineCurrentnessPrerequisite.currentness_checkpoint_digest
          }
        );
      }
    } else if (typeof beforeMachineEffectAdmission === 'function') {
      await beforeMachineEffectAdmission({
        traceId,
        intent,
        plan,
        capability: input.capability,
        claims,
        consumption_receipt: input.consumption_receipt,
        consumption_receipt_digest: consumption.receipt_digest,
        execution_epoch: executionEpoch
      });
    }

    const startedAt = new Date().toISOString();
    const builtinResult = executeBuiltin({
      tool: claims.tool,
      intent,
      assurance: plan.assurance
    });
    const result = {
      ...builtinResult,
      output: {
        ...assertPlainObject(builtinResult.output ?? {}, 'execution output'),
        assurance: structuredClone(plan.assurance)
      }
    };
    const completedAt = new Date().toISOString();
    const attested = {
      trace_id: traceId,
      intent_id: intent.intent_id,
      intent_digest: intentDigest,
      ...(claims.invocation_digest
        ? { invocation_digest: claims.invocation_digest }
        : {}),
      ...(claims.effect_destination
        ? { effect_destination: claims.effect_destination }
        : {}),
      capability_id: claims.jti,
      capability_consumption_receipt_digest: consumption.receipt_digest,
      ...(machineCurrentnessPrerequisite ? {
        machine_currentness_prerequisite_decision_digest:
          machineCurrentnessPrerequisite.prerequisite_decision_digest,
        machine_currentness_checkpoint_digest:
          machineCurrentnessPrerequisite.currentness_checkpoint_digest,
        machine_currentness_head_digest:
          machineCurrentnessPrerequisite.currentness_head_digest,
        machine_currentness_evaluation_digest:
          machineCurrentnessPrerequisite.effect_currentness_evaluation_digest
      } : {}),
      sandbox_execution_epoch: executionEpoch,
      tool: claims.tool,
      policy_digest: claims.policy_digest,
      assurance: structuredClone(plan.assurance),
      started_at: startedAt,
      completed_at: completedAt,
      result_digest: digestObject(result)
    };
    return {
      result,
      attestation: {
        statement: attested,
        signature: identity.signObject(attested)
      }
    };
  });

  const server = createServiceServer({
    name: 'sandbox',
    router,
    maxBodyBytes: config.maxBodyBytes,
    telemetry,
    tls: identity.transport
      ? transportServerOptions(identity.transport)
      : undefined,
    transportPeers: identity.transport?.peers,
    allowedTransportPeers: identity.transport
      ? allowedInboundTransportPeers('sandbox')
      : undefined,
    authorizeRequest: args => authorizeInboundServiceRequest({
      ...args,
      destination: 'sandbox'
    }),
    authenticate: ({ req, body }) => verifySignedRequest({
      req,
      body,
      audience: 'sandbox',
      dataDir: config.dataDir,
      allowedCallers: ['hypervisor'],
      transportPeers: identity.transport?.peers,
      replayGuard: requestReplay,
      clockSkewSeconds: config.clockSkewSeconds
    })
  });
  return {
    name: 'sandbox',
    server,
    identity,
    executionEpoch,
    telemetry,
    operations: currentOperations,
    async start() {
      return listen(server, { host: config.hosts.internal, port: config.ports.sandbox });
    },
    async stop() {
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runServiceProcess(createSandboxService);
}

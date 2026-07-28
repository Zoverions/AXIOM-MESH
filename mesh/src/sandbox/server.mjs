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
import { AxiomError, assertPlainObject, digestObject } from '../lib/canonical.mjs';
import { operationsReport, readinessState, ServiceTelemetry } from '../lib/observability.mjs';
import { runServiceProcess } from '../lib/service-lifecycle.mjs';
import { planDigest, validatePlan } from '../lib/plan.mjs';
import { executeBuiltin } from './executor.mjs';

export async function createSandboxService(config = meshConfig()) {
  const identity = await ensureMeshIdentity(config.dataDir, 'sandbox', { create: config.autoBootstrap });
  const hypervisorKey = await loadTrustedKey(config.dataDir, 'hypervisor');
  const requestReplay = new ReplayGuard();
  const capabilityReplay = new ReplayGuard();
  const router = new Router();
  const telemetry = new ServiceTelemetry('sandbox');

  function currentOperations() {
    return operationsReport([telemetry.snapshot(readinessState('sandbox', [
      { name: 'identity', ok: true },
      { name: 'hypervisor-trust', ok: true },
      { name: 'execution-mode', ok: true }
    ]))]);
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
    if (!capabilityReplay.use('capability', claims.jti, claims.exp * 1000)) {
      throw new AxiomError('capability_replayed', 'Capability token has already been used', 409);
    }
    if (claims.subject !== intent.principal.id) {
      throw new AxiomError('capability_subject_mismatch', 'Capability subject does not match the intent principal', 403);
    }
    const startedAt = new Date().toISOString();
    const result = executeBuiltin({ tool: claims.tool, intent });
    const completedAt = new Date().toISOString();
    const attested = {
      trace_id: traceId,
      intent_id: intent.intent_id,
      intent_digest: intentDigest,
      capability_id: claims.jti,
      tool: claims.tool,
      policy_digest: claims.policy_digest,
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
    authenticate: ({ req, body }) => verifySignedRequest({
      req,
      body,
      audience: 'sandbox',
      dataDir: config.dataDir,
      allowedCallers: ['hypervisor'],
      replayGuard: requestReplay,
      clockSkewSeconds: config.clockSkewSeconds
    })
  });
  return {
    name: 'sandbox',
    server,
    identity,
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

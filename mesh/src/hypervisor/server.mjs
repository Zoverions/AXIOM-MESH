import { pathToFileURL } from 'node:url';
import { meshConfig } from '../lib/config.mjs';
import {
  ReplayGuard,
  ensureMeshIdentity,
  issueCapability,
  loadTrustedKey,
  verifyObjectSignature,
  verifySignedRequest
} from '../lib/identity.mjs';
import { Router, createServiceServer, listen, parseJsonBody } from '../lib/http.mjs';
import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject,
  newId
} from '../lib/canonical.mjs';
import { signedFetch } from '../lib/client.mjs';
import { runServiceProcess } from '../lib/service-lifecycle.mjs';
import {
  dependencyFailure,
  operationsReport,
  readinessState,
  reportHasReadyServices,
  serviceSnapshotsFromReport,
  ServiceTelemetry
} from '../lib/observability.mjs';
import { loadPolicyStack, mergeDenyDominantPolicy, PolicyEngine } from '../lib/policy.mjs';
import { buildPlan, planDigest } from '../lib/plan.mjs';
import {
  loadTransportRuntime,
  transportServerOptions
} from '../lib/transport-credentials.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export async function createHypervisorService(config = meshConfig()) {
  const identity = await ensureMeshIdentity(config.dataDir, 'hypervisor', { create: config.autoBootstrap });
  identity.transport = config.transport.enabled
    ? await loadTransportRuntime({
        transportDir: config.transport.directory,
        service: 'hypervisor'
      })
    : null;
  const sandboxKey = await loadTrustedKey(config.dataDir, 'sandbox');
  const requestReplay = new ReplayGuard();
  const basePolicy = await loadPolicyStack(config.policyPaths);
  const router = new Router();
  const telemetry = new ServiceTelemetry('hypervisor');

  async function commit(traceId, principalId, events) {
    return signedFetch(identity, 'grid', `${config.urls.grid}/internal/v1/commit`, {
      method: 'POST',
      traceId,
      body: { actor: principalId, principal: principalId, events }
    });
  }

  async function gridGet(path, traceId) {
    return signedFetch(identity, 'grid', `${config.urls.grid}${path}`, { traceId });
  }

  async function activePolicy(traceId) {
    const response = await gridGet('/internal/v1/policy-overlays', traceId);
    if (!response.overlays?.length) return basePolicy;
    const merged = mergeDenyDominantPolicy([
      basePolicy.policy,
      ...response.overlays.map(overlay => overlay.policy_json)
    ]);
    return new PolicyEngine(merged, {
      layers: [
        ...basePolicy.layers,
        ...response.overlays.map((overlay, index) => ({
          order: basePolicy.layers.length + index,
          version: overlay.policy_json.version,
          digest: overlay.policy_digest
        }))
      ]
    });
  }

  async function currentOperations(traceId = newId('trace')) {
    const [grid, sandbox] = await Promise.allSettled([
      gridGet('/internal/v1/status', traceId),
      signedFetch(
        identity,
        'sandbox',
        `${config.urls.sandbox}/internal/v1/operations`,
        { traceId, timeoutMs: 2_000 }
      )
    ]);
    const gridCheck = grid.status === 'fulfilled'
      ? {
          ok: grid.value?.mode === 'single-node-transparency-log'
            && grid.value?.consensus === false
        }
      : dependencyFailure(grid.reason);
    const sandboxCheck = sandbox.status === 'fulfilled'
      ? { ok: reportHasReadyServices(sandbox.value, ['sandbox']) }
      : dependencyFailure(sandbox.reason);
    if (!gridCheck.ok) telemetry.recordDependencyFailure();
    if (!sandboxCheck.ok) telemetry.recordDependencyFailure();
    const own = telemetry.snapshot(readinessState('hypervisor', [
      { name: 'identity', ok: true },
      { name: 'policy', ok: true },
      { name: 'grid', ...gridCheck },
      { name: 'sandbox', ...sandboxCheck }
    ]));
    const services = [own];
    if (sandbox.status === 'fulfilled') {
      services.push(...serviceSnapshotsFromReport(sandbox.value));
    }
    return operationsReport(services);
  }

  router.add('GET', '/health', async () => ({
    service: 'hypervisor',
    status: 'live'
  }), { auth: false });

  router.add('GET', '/internal/v1/operations', async ({ traceId }) => currentOperations(traceId));

  router.add('POST', '/internal/v1/intents', async ({ body, traceId }) => {
    const intent = normalizeIntent(parseJsonBody(body));
    const policy = await activePolicy(traceId);
    const decision = policy.evaluate({
      action: intent.action,
      principal: intent.principal,
      intent
    });
    await commit(traceId, intent.principal.id, [{
      kind: 'intent.accepted',
      subject: intent.intent_id,
      payload: {
        intent_id: intent.intent_id,
        principal: intent.principal.id,
        action: intent.action,
        risk: decision.risk,
        input_digest: digestObject(intent.input),
        request_digest: requestDigest(intent),
        policy_version: decision.policy_version,
        policy_digest: decision.policy_digest
      }
    }]);
    if (!decision.allow) {
      const error = {
        code: decision.code,
        message: decision.reason,
        ...(decision.pending ? { pending: true } : {})
      };
      await commit(traceId, intent.principal.id, [{
        kind: 'intent.denied',
        subject: intent.intent_id,
        payload: { intent_id: intent.intent_id, error }
      }]);
      throw new AxiomError(decision.code, decision.reason, decision.http_status ?? (decision.pending ? 409 : 403), {
        intent_id: intent.intent_id,
        risk: decision.risk,
        ...(decision.required_confirmations
          ? { required_confirmations: decision.required_confirmations }
          : {}),
        ...(decision.required_confirmation_values?.length
          ? { required_confirmation_values: decision.required_confirmation_values }
          : {})
      });
    }
    let approval;
    if (decision.requires_independent_approval) {
      const expectedRequestDigest = requestDigest(intent);
      if (intent.approval_ids.length !== 1) {
        await denyIntent(commit, traceId, intent, {
          code: 'independent_approval_required',
          message: 'This action requires one active approval from a different principal.'
        });
        throw new AxiomError(
          'independent_approval_required',
          'This action requires one active approval from a different principal.',
          409,
          { intent_id: intent.intent_id, request_digest: expectedRequestDigest }
        );
      }
      try {
        approval = await gridGet(
          `/internal/v1/approval/${encodeURIComponent(intent.approval_ids[0])}`,
          traceId
        );
      } catch (error) {
        if (error.code !== 'approval_not_found') throw error;
      }
      if (
        !approval
        || approval.status !== 'active'
        || approval.approver === intent.principal.id
        || approval.requester !== intent.principal.id
        || approval.action !== intent.action
        || approval.request_digest !== expectedRequestDigest
        || new Date(approval.expires_at) <= new Date()
      ) {
        await denyIntent(commit, traceId, intent, {
          code: 'approval_mismatch',
          message: 'The supplied approval is not active and bound to this exact request.'
        });
        throw new AxiomError(
          'approval_mismatch',
          'The supplied approval is not active and bound to this exact request.',
          403,
          { intent_id: intent.intent_id }
        );
      }
      try {
        await commit(traceId, intent.principal.id, [{
          kind: 'approval.consumed',
          subject: approval.approval_id,
          payload: {
            approval_id: approval.approval_id,
            intent_id: intent.intent_id,
            approver: approval.approver
          }
        }]);
      } catch (error) {
        if (error.code !== 'approval_unavailable') throw error;
        await denyIntent(commit, traceId, intent, {
          code: 'approval_unavailable',
          message: 'The supplied approval was already consumed or expired.'
        });
        throw error;
      }
    }
    const plan = buildPlan(intent, decision, { approval });
    const boundPlanDigest = planDigest(plan);
    const now = Math.floor(Date.now() / 1000);
    const capability = issueCapability(identity, {
      iss: identity.service,
      aud: 'sandbox',
      subject: intent.principal.id,
      jti: newId('cap'),
      nbf: now - 1,
      exp: now + config.capabilityTtlSeconds,
      intent_digest: digestObject(intent),
      tool: decision.tool,
      constraints: decision.constraints,
      policy_digest: decision.policy_digest,
      plan_digest: boundPlanDigest
    });
    try {
      const execution = await signedFetch(identity, 'sandbox', `${config.urls.sandbox}/internal/v1/execute`, {
        method: 'POST',
        traceId,
        body: { intent, capability, plan }
      });
      const statement = execution.attestation?.statement;
      const signature = execution.attestation?.signature;
      if (!statement || !verifyObjectSignature(statement, signature, sandboxKey)) {
        throw new AxiomError('invalid_sandbox_attestation', 'Sandbox returned an invalid execution attestation', 502);
      }
      if (statement.intent_digest !== digestObject(intent) || statement.result_digest !== digestObject(execution.result)) {
        throw new AxiomError('sandbox_attestation_mismatch', 'Sandbox attestation does not match the execution result', 502);
      }
      const events = [];
      if (execution.result.mutation) {
        events.push({
          ...execution.result.mutation,
          payload: {
            ...execution.result.mutation.payload,
            evidence: {
              plan_digest: digestObject(plan),
              execution: execution.attestation
            }
          }
        });
      }
      const result = {
        ...execution.result.output,
        intent_id: intent.intent_id,
        trace_id: traceId,
        status: 'completed',
        evidence: {
          plan_digest: boundPlanDigest,
          execution_digest: statement.result_digest,
          policy_digest: decision.policy_digest
        }
      };
      events.push({
        kind: 'intent.completed',
        subject: intent.intent_id,
        payload: { intent_id: intent.intent_id, result }
      });
      const committed = await commit(traceId, intent.principal.id, events);
      if (committed.exports?.length) result.export_manifest = committed.exports[0];
      if (committed.backups?.length) result.backup_manifest = committed.backups[0];
      return { httpStatus: 201, body: result };
    } catch (error) {
      const failure = {
        code: error.code ?? 'execution_failed',
        message: error.message
      };
      try {
        await commit(traceId, intent.principal.id, [{
          kind: 'intent.failed',
          subject: intent.intent_id,
          payload: { intent_id: intent.intent_id, error: failure }
        }]);
      } catch {
        // The original error remains authoritative; a missing failure event is
        // visible through the accepted intent's unfinished state.
      }
      throw error;
    }
  });

  const server = createServiceServer({
    name: 'hypervisor',
    router,
    maxBodyBytes: config.maxBodyBytes,
    telemetry,
    tls: identity.transport
      ? transportServerOptions(identity.transport)
      : undefined,
    transportPeers: identity.transport?.peers,
    allowedTransportPeers: identity.transport
      ? ['gateway', 'supervisor']
      : undefined,
    authenticate: ({ req, body }) => verifySignedRequest({
      req,
      body,
      audience: 'hypervisor',
      dataDir: config.dataDir,
      allowedCallers: ['gateway'],
      transportPeers: identity.transport?.peers,
      replayGuard: requestReplay,
      clockSkewSeconds: config.clockSkewSeconds
    })
  });
  return {
    name: 'hypervisor',
    server,
    identity,
    policy: basePolicy,
    telemetry,
    operations: currentOperations,
    async start() {
      return listen(server, { host: config.hosts.internal, port: config.ports.hypervisor });
    },
    async stop() {
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
  };
}

function normalizeIntent(raw) {
  const value = assertPlainObject(raw, 'intent');
  const principal = assertPlainObject(value.principal, 'intent.principal');
  const normalized = {
    intent_id: assertString(value.intent_id, 'intent.intent_id', { max: 160, pattern: PRINCIPAL_ID }),
    principal: {
      id: assertString(principal.id, 'intent.principal.id', { max: 160, pattern: PRINCIPAL_ID }),
      type: assertString(principal.type ?? 'human', 'intent.principal.type', {
        max: 16,
        pattern: /^(human|agent|service)$/
      }),
      roles: [...new Set(assertStringArray(principal.roles ?? [], 'intent.principal.roles', {
        maxItems: 32,
        itemMax: 64
      }))].sort(),
      scopes: [...new Set(assertStringArray(principal.scopes ?? [], 'intent.principal.scopes', {
        maxItems: 128,
        itemMax: 160
      }))].sort()
    },
    action: assertString(value.action, 'intent.action', {
      max: 128,
      pattern: /^[a-z][a-z0-9.-]+$/
    }),
    input: assertPlainObject(value.input ?? {}, 'intent.input'),
    purpose: assertString(value.purpose ?? 'operator-request', 'intent.purpose', { max: 512 }),
    data_scopes: [...new Set(assertStringArray(value.data_scopes ?? [], 'intent.data_scopes', {
      maxItems: 64,
      itemMax: 160
    }))].sort(),
    confirmations: [...new Set(assertStringArray(value.confirmations ?? [], 'intent.confirmations', {
      maxItems: 8,
      itemMax: 160
    }))].sort(),
    approval_ids: [...new Set(assertStringArray(value.approval_ids ?? [], 'intent.approval_ids', {
      maxItems: 8,
      itemMax: 160
    }))].sort(),
    submitted_at: assertString(value.submitted_at, 'intent.submitted_at', { max: 64 })
  };
  if (Number.isNaN(new Date(normalized.submitted_at).valueOf())) {
    throw new ValidationError('intent.submitted_at must be an ISO timestamp');
  }
  return normalized;
}

function requestDigest(intent) {
  return digestObject({
    action: intent.action,
    input: intent.input,
    purpose: intent.purpose,
    data_scopes: intent.data_scopes
  });
}

async function denyIntent(commit, traceId, intent, error) {
  await commit(traceId, intent.principal.id, [{
    kind: 'intent.denied',
    subject: intent.intent_id,
    payload: { intent_id: intent.intent_id, error }
  }]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runServiceProcess(createHypervisorService);
}

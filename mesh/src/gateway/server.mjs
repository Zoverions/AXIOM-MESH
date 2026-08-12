import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { meshConfig, loadApiPrincipals } from '../lib/config.mjs';
import { ensureMeshIdentity } from '../lib/identity.mjs';
import { Router, createServiceServer, listen, parseJsonBody } from '../lib/http.mjs';
import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  newId,
  sha256
} from '../lib/canonical.mjs';
import { signedFetch } from '../lib/client.mjs';
import { runServiceProcess } from '../lib/service-lifecycle.mjs';
import {
  dependencyFailure,
  operationsReport,
  readinessState,
  reportHasReadyServices,
  renderOpenMetrics,
  serviceSnapshotsFromReport,
  ServiceTelemetry
} from '../lib/observability.mjs';
import { createBearerAuthenticator } from '../lib/public-auth.mjs';
import { intentRequestDigest } from '../lib/intent-binding.mjs';
import { loadTransportRuntime } from '../lib/transport-credentials.mjs';
import { GatewayIngressControl, createSingleFlightCache } from './ingress-control.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export async function createGatewayService(config = meshConfig()) {
  const identity = await ensureMeshIdentity(config.dataDir, 'gateway', { create: config.autoBootstrap });
  identity.transport = config.transport.enabled
    ? await loadTransportRuntime({
        transportDir: config.transport.directory,
        service: 'gateway'
      })
    : null;
  const principals = await loadApiPrincipals(config);
  const bearerAuth = createBearerAuthenticator(principals);
  const localIngress = Boolean(config.gatewaySocket);
  const ingressControl = new GatewayIngressControl({
    localIngress,
    capacity: config.rateLimitCapacity,
    refillPerSecond: config.rateLimitRefillPerSecond
  });
  const capabilities = JSON.parse(await readFile(config.capabilitiesPath, 'utf8'));
  const capabilitiesDigest = digestObject(capabilities);
  const router = new Router();
  const telemetry = new ServiceTelemetry('gateway');

  async function gridGet(path, traceId) {
    return signedFetch(identity, 'grid', `${config.urls.grid}${path}`, { traceId });
  }

  async function currentOperations(traceId = newId('trace')) {
    const [hypervisor, grid] = await Promise.allSettled([
      signedFetch(
        identity,
        'hypervisor',
        `${config.urls.hypervisor}/internal/v1/operations`,
        { traceId, timeoutMs: 5_000 }
      ),
      signedFetch(
        identity,
        'grid',
        `${config.urls.grid}/internal/v1/operations`,
        { traceId, timeoutMs: 3_000 }
      )
    ]);
    const hypervisorCheck = hypervisor.status === 'fulfilled'
      ? { ok: reportHasReadyServices(hypervisor.value, ['hypervisor', 'sandbox']) }
      : dependencyFailure(hypervisor.reason);
    const gridCheck = grid.status === 'fulfilled'
      ? { ok: reportHasReadyServices(grid.value, ['grid']) }
      : dependencyFailure(grid.reason);
    if (!hypervisorCheck.ok) telemetry.recordDependencyFailure();
    if (!gridCheck.ok) telemetry.recordDependencyFailure();
    const services = [telemetry.snapshot(readinessState('gateway', [
      { name: 'identity', ok: true },
      { name: 'capability-registry', ok: true },
      { name: 'hypervisor', ...hypervisorCheck },
      { name: 'grid', ...gridCheck }
    ]))];
    for (const result of [hypervisor, grid]) {
      if (result.status !== 'fulfilled') continue;
      for (const service of serviceSnapshotsFromReport(result.value)) {
        if (!services.some(existing => existing.service === service.service)) services.push(service);
      }
    }
    return operationsReport(services);
  }

  const currentReadiness = createSingleFlightCache({
    load: currentOperations,
    cacheMs: 250
  });

  router.add('GET', '/', async () => ({
    buffer: Buffer.from(renderIndex(capabilities)),
    contentType: 'text/html; charset=utf-8'
  }), { auth: false });

  router.add('GET', '/health', async () => ({
    service: 'gateway',
    status: 'live'
  }), { auth: false });

  router.add('GET', '/ready', async ({ req, traceId }) => {
    ingressControl.admitProbe(req);
    const report = localIngress
      ? await currentReadiness(traceId)
      : await currentOperations(traceId);
    return {
      httpStatus: report.status === 'ready' ? 200 : 503,
      body: {
        service: 'gateway',
        status: report.status,
        kernel_version: capabilities.kernel_version
      }
    };
  }, { auth: false });

  router.add('GET', '/v1/capabilities', async () => ({
    ...capabilities,
    digest: capabilitiesDigest
  }));

  router.add('GET', '/v1/machine-discovery', async ({ traceId, principal }) => {
    if (principal.schema !== 'axiom-machine-principal.v1') {
      throw new AxiomError(
        'forbidden',
        'Machine discovery requires a constrained machine principal',
        403
      );
    }
    return signedFetch(
      identity,
      'hypervisor',
      `${config.urls.hypervisor}/internal/v1/machine-discovery`,
      { method: 'POST', traceId, body: principal }
    );
  });

  router.add('GET', '/v1/machine-receipts/intents/:id/verify', async ({
    params,
    traceId,
    principal
  }) => {
    if (principal.schema !== 'axiom-machine-principal.v1') {
      throw new AxiomError(
        'forbidden',
        'Machine receipt verification requires a constrained machine principal',
        403
      );
    }
    const intentId = assertString(params.id, 'intent_id', {
      max: 160,
      pattern: /^intent_[a-f0-9]{64}$/
    });
    return gridGet(
      `/internal/v1/machine-receipts/intents/${encodeURIComponent(intentId)}`
        + `/verify?principal=${encodeURIComponent(principal.id)}`,
      traceId
    );
  });

  router.add('GET', '/v1/status', async ({ traceId }) => {
    const grid = await gridGet('/internal/v1/status', traceId);
    const capabilityCounts = Object.fromEntries(
      Object.entries(Object.groupBy(capabilities.capabilities, item => item.status))
        .map(([status, items]) => [status, items.length])
    );
    return {
      kernel_version: capabilities.kernel_version,
      claim_source_digest: capabilitiesDigest,
      runtime: { grid },
      capability_counts: capabilityCounts
    };
  });

  router.add('GET', '/v1/operations', async ({ traceId, principal }) => {
    if (
      !hasScope(principal, 'operations:read')
      && !hasScope(principal, 'telemetry:collect')
    ) {
      throw new AxiomError(
        'forbidden',
        'operations:read or telemetry:collect scope is required',
        403
      );
    }
    return currentOperations(traceId);
  });

  router.add('GET', '/v1/metrics', async ({ traceId, principal }) => {
    if (
      !hasScope(principal, 'operations:read')
      && !hasScope(principal, 'telemetry:collect')
    ) {
      throw new AxiomError(
        'forbidden',
        'operations:read or telemetry:collect scope is required',
        403
      );
    }
    return {
      buffer: Buffer.from(renderOpenMetrics(await currentOperations(traceId))),
      contentType: 'application/openmetrics-text; version=1.0.0; charset=utf-8'
    };
  });

  router.add('POST', '/v1/intents', async ({ body, req, traceId, principal }) => {
    const idempotencyKey = assertString(req.headers['idempotency-key'], 'Idempotency-Key', {
      min: 16,
      max: 160,
      pattern: /^[A-Za-z0-9_.:-]+$/
    });
    const request = assertPlainObject(parseJsonBody(body), 'intent');
    const intentId = `intent_${sha256(`${principal.id}\n${idempotencyKey}`)}`;
    const intent = {
      intent_id: intentId,
      principal,
      action: request.action,
      input: request.input ?? {},
      purpose: request.purpose ?? 'operator-request',
      data_scopes: request.data_scopes ?? [],
      confirmations: request.confirmations ?? [],
      approval_ids: request.approval_ids ?? [],
      submitted_at: new Date().toISOString()
    };
    try {
      return await signedFetch(identity, 'hypervisor', `${config.urls.hypervisor}/internal/v1/intents`, {
        method: 'POST',
        traceId,
        body: intent
      });
    } catch (error) {
      if (error.code !== 'intent_already_exists') throw error;
      const existing = await gridGet(`/internal/v1/intents/${encodeURIComponent(intentId)}`, traceId);
      if (existing.principal !== principal.id) throw new AxiomError('forbidden', 'Intent belongs to another principal', 403);
      const requestDigest = intentRequestDigest(intent);
      if (existing.request_digest !== requestDigest) {
        throw new AxiomError(
          'idempotency_conflict',
          'Idempotency-Key was already used for a different request',
          409
        );
      }
      return {
        ...existing,
        ...existing.result_json,
        idempotent_replay: true
      };
    }
  });

  router.add('GET', '/v1/intents/:id', async ({ params, traceId, principal }) => {
    const intent = await gridGet(`/internal/v1/intents/${encodeURIComponent(params.id)}`, traceId);
    if (intent.principal !== principal.id && !hasScope(principal, 'audit:read')) {
      throw new AxiomError('forbidden', 'Intent belongs to another principal', 403);
    }
    return intent;
  });

  router.add('GET', '/v1/events', async ({ url, traceId, principal }) => {
    const requestedActor = url.searchParams.get('actor');
    const actor = hasScope(principal, 'audit:read') && requestedActor ? requestedActor : principal.id;
    const after = boundedIntegerQuery(url.searchParams.get('after'), 0, {
      label: 'events after',
      min: 0,
      max: Number.MAX_SAFE_INTEGER
    });
    const limit = boundedIntegerQuery(url.searchParams.get('limit'), 100, {
      label: 'events limit',
      min: 1,
      max: 500
    });
    return gridGet(
      `/internal/v1/events?actor=${encodeURIComponent(actor)}&after=${after}&limit=${limit}`,
      traceId
    );
  });

  router.add('GET', '/v1/capsules', async ({ url, traceId, principal }) => {
    requireScope(principal, 'capsule:read');
    const limit = boundedIntegerQuery(url.searchParams.get('limit'), 100, {
      label: 'capsules limit',
      min: 1,
      max: 100
    });
    return gridGet(`/internal/v1/capsules?limit=${limit}`, traceId);
  });
  router.add('GET', '/v1/proposals', async ({ url, traceId, principal }) => {
    requireScope(principal, 'governance:read');
    const limit = boundedIntegerQuery(url.searchParams.get('limit'), 100, {
      label: 'proposals limit',
      min: 1,
      max: 100
    });
    return gridGet(`/internal/v1/proposals?limit=${limit}`, traceId);
  });
  router.add('GET', '/v1/nodes', async ({ url, traceId, principal }) => {
    requireScope(principal, 'node:read');
    const limit = boundedIntegerQuery(url.searchParams.get('limit'), 100, {
      label: 'nodes limit',
      min: 1,
      max: 100
    });
    return gridGet(`/internal/v1/nodes?limit=${limit}`, traceId);
  });
  router.add('GET', '/v1/node-discovery', async ({
    url,
    traceId,
    principal
  }) => {
    if (!hasScope(principal, 'node:read')) {
      throw new AxiomError(
        'forbidden',
        'node:read scope is required',
        403
      );
    }
    const query = new URLSearchParams();
    for (const capability of url.searchParams.getAll('capability')) {
      query.append('capability', assertString(
        capability,
        'capability',
        { max: 160, pattern: PRINCIPAL_ID }
      ));
    }
    for (const role of url.searchParams.getAll('role')) {
      query.append('role', assertString(
        role,
        'role',
        { max: 128, pattern: PRINCIPAL_ID }
      ));
    }
    for (const name of [
      'minimum_security_level',
      'minimum_lease_seconds',
      'limit'
    ]) {
      const value = url.searchParams.get(name);
      if (value !== null) query.set(name, value);
    }
    const suffix = query.size ? `?${query}` : '';
    return gridGet(`/internal/v1/node-discovery${suffix}`, traceId);
  });
  router.add('GET', '/v1/node-schedules', async ({
    traceId,
    principal
  }) => {
    if (!hasScope(principal, 'node:read')) {
      throw new AxiomError(
        'forbidden',
        'node:read scope is required',
        403
      );
    }
    return gridGet(
      `/internal/v1/node-schedules/${encodeURIComponent(principal.id)}`,
      traceId
    );
  });
  router.add('GET', '/v1/consents', async ({ traceId, principal }) => gridGet(
    `/internal/v1/consents/${encodeURIComponent(principal.id)}`,
    traceId
  ));
  router.add('GET', '/v1/approvals', async ({ traceId, principal }) => gridGet(
    `/internal/v1/approvals/${encodeURIComponent(principal.id)}`,
    traceId
  ));
  router.add('GET', '/v1/memory', async ({ url, traceId, principal }) => {
    const owner = url.searchParams.get('owner') ?? principal.id;
    if (!PRINCIPAL_ID.test(owner)) throw new ValidationError('Memory owner is invalid');
    const limit = url.searchParams.get('limit');
    if (limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 500)) {
      throw new ValidationError('Memory limit must be an integer between 1 and 500');
    }
    const query = new URLSearchParams({
      requester: principal.id,
      ...(limit === null ? {} : { limit })
    });
    return gridGet(
      `/internal/v1/memory/${encodeURIComponent(owner)}?${query}`,
      traceId
    );
  });
  router.add('GET', '/v1/accounting', async ({ traceId, principal }) => gridGet(
    `/internal/v1/accounting/${encodeURIComponent(principal.id)}`,
    traceId
  ));
  router.add('GET', '/v1/imports', async ({ traceId, principal }) => gridGet(
    `/internal/v1/imports/${encodeURIComponent(principal.id)}`,
    traceId
  ));
  router.add('GET', '/v1/imports/:id', async ({ params, traceId, principal }) => gridGet(
    `/internal/v1/import/${encodeURIComponent(params.id)}?principal=${encodeURIComponent(principal.id)}`,
    traceId
  ));
  router.add('GET', '/v1/appeals', async ({ traceId, principal }) => gridGet(
    `/internal/v1/appeals/${encodeURIComponent(principal.id)}`,
    traceId
  ));
  router.add('GET', '/v1/storage-offers', async ({ traceId, principal }) => gridGet(
    `/internal/v1/storage-offers/${encodeURIComponent(principal.id)}`,
    traceId
  ));
  router.add('GET', '/v1/sync', async ({ url, traceId, principal }) => {
    const query = new URLSearchParams();
    const namespace = url.searchParams.get('namespace');
    const recordId = url.searchParams.get('record_id');
    if (namespace !== null) {
      assertString(namespace, 'namespace', {
        max: 128,
        pattern: /^[a-z][a-z0-9.-]{0,127}$/
      });
      query.set('namespace', namespace);
    }
    if (recordId !== null) {
      assertString(recordId, 'record_id', { max: 160, pattern: PRINCIPAL_ID });
      query.set('record_id', recordId);
    }
    const suffix = query.size ? `?${query}` : '';
    return gridGet(
      `/internal/v1/sync/${encodeURIComponent(principal.id)}${suffix}`,
      traceId
    );
  });
  router.add('GET', '/v1/sync/bundles/:digest', async ({
    params,
    traceId,
    principal
  }) => {
      const bundleDigest = assertString(params.digest, 'bundle digest', {
        min: 64,
        max: 64,
        pattern: /^[a-f0-9]{64}$/
      });
      return gridGet(
        `/internal/v1/sync/${encodeURIComponent(principal.id)}`
          + `/bundles/${bundleDigest}`,
        traceId
      );
  });
  router.add('GET', '/v1/backups', async ({ url, traceId, principal }) => {
    const limit = url.searchParams.get('limit');
    if (limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) {
      throw new ValidationError('Backup limit must be an integer between 1 and 100');
    }
    const query = limit === null ? '' : `?limit=${encodeURIComponent(limit)}`;
    return gridGet(
      `/internal/v1/backups/${encodeURIComponent(principal.id)}${query}`,
      traceId
    );
  });
  router.add('GET', '/v1/backups/:id', async ({ params, traceId, principal }) => gridGet(
    `/internal/v1/backup/${encodeURIComponent(params.id)}?principal=${encodeURIComponent(principal.id)}`,
    traceId
  ));
  router.add('GET', '/v1/exports/:id', async ({ params, traceId, principal }) => gridGet(
    `/internal/v1/exports/${encodeURIComponent(params.id)}?principal=${encodeURIComponent(principal.id)}`,
    traceId
  ));
  router.add('GET', '/v1/exports/:id/bundle', async ({ params, traceId, principal }) => gridGet(
    `/internal/v1/exports/${encodeURIComponent(params.id)}/bundle?principal=${encodeURIComponent(principal.id)}`,
    traceId
  ));
  router.add('GET', '/v1/audit/verify', async ({ traceId, principal }) => {
    if (!hasScope(principal, 'audit:read')) throw new AxiomError('forbidden', 'audit:read scope is required', 403);
    return gridGet('/internal/v1/verify-chain', traceId);
  });

  const server = createServiceServer({
    name: 'gateway',
    router,
    maxBodyBytes: config.maxBodyBytes,
    telemetry,
    admitRequest: bearerAuth.admitRequest,
    inspectResponse: bearerAuth.inspectResponse,
    authenticate: args => ingressControl.authenticate(
      args,
      bearerAuth,
      enforceTelemetryCollectionBoundary
    )
  });
  return {
    name: 'gateway',
    server,
    identity,
    capabilities,
    telemetry,
    operations: currentOperations,
    async start() {
      return listen(server, { host: config.hosts.gateway, port: config.ports.gateway });
    },
    async stop() {
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
  };
}

function hasScope(principal, scope) {
  return principal.scopes?.includes('*') || principal.scopes?.includes(scope);
}

function requireScope(principal, scope) {
  if (!hasScope(principal, scope)) {
    throw new AxiomError('forbidden', `${scope} scope is required`, 403);
  }
}

function boundedIntegerQuery(value, fallback, { label, min, max }) {
  if (value === null || value === '') return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function enforceTelemetryCollectionBoundary(req, principal) {
  if (
    !principal.scopes?.includes('telemetry:collect')
    || principal.scopes.includes('*')
  ) return;
  const url = new URL(req.url, 'http://127.0.0.1');
  if (
    req.method !== 'GET'
    || url.search
    || !['/v1/metrics', '/v1/operations'].includes(url.pathname)
  ) {
    throw new AxiomError(
      'forbidden',
      'telemetry:collect is limited to the telemetry endpoints',
      403
    );
  }
}

function renderIndex(registry) {
  const rows = registry.capabilities.map(item => `
    <tr>
      <td>${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.family)}</td>
      <td>${escapeHtml(item.status)}</td>
      <td>${escapeHtml(item.summary)}</td>
    </tr>
  `).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AXIOM-MESH Kernel</title>
</head>
<body>
  <main>
    <h1>AXIOM-MESH Kernel ${escapeHtml(registry.kernel_version)}</h1>
    <p>Four-pillar local-first capability fabric. Authenticated API: <code>/v1</code>.</p>
    <p>This page is generated from the machine-readable capability registry. Only
    <strong>implemented</strong> entries are runnable claims.</p>
    <table>
      <thead><tr><th>Capability</th><th>Family</th><th>Status</th><th>Summary</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runServiceProcess(createGatewayService);
}
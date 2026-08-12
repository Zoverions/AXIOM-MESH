import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { meshConfig } from '../lib/config.mjs';
import { ensureMeshIdentity, ReplayGuard, verifySignedRequest } from '../lib/identity.mjs';
import { Router, createServiceServer, listen, parseJsonBody } from '../lib/http.mjs';
import { AxiomError, ValidationError, assertPlainObject, assertString } from '../lib/canonical.mjs';
import { operationsReport, readinessState, ServiceTelemetry } from '../lib/observability.mjs';
import { GridStore } from './store.mjs';
import { loadDataProtector } from '../lib/protector.mjs';
import { runServiceProcess } from '../lib/service-lifecycle.mjs';
import { buildMachineIntentReceipt } from '../lib/machine-receipt.mjs';
import {
  acquireGridRuntimeLock,
  createGridBackup,
  recordPendingRecovery,
  releaseGridRuntimeLock
} from './backup.mjs';
import {
  loadTransportRuntime,
  transportServerOptions
} from '../lib/transport-credentials.mjs';
import {
  allowedInboundTransportPeers,
  authorizeInboundServiceRequest
} from '../lib/service-network-policy.mjs';

export async function createGridService(config = meshConfig()) {
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  const runtimeLock = await acquireGridRuntimeLock(config.dataDir);
  let identity;
  let protector;
  let store;
  try {
    identity = await ensureMeshIdentity(config.dataDir, 'grid', { create: config.autoBootstrap });
    identity.transport = config.transport.enabled
      ? await loadTransportRuntime({
          transportDir: config.transport.directory,
          service: 'grid'
        })
      : null;
    protector = await loadDataProtector(config);
    store = new GridStore({
      path: join(config.dataDir, 'grid.sqlite'),
      dataDir: config.dataDir,
      identity,
      protector
    });
    await recordPendingRecovery({ store, dataDir: config.dataDir, identity });
  } catch (error) {
    if (store) store.close();
    await releaseGridRuntimeLock(runtimeLock);
    throw error;
  }
  const replayGuard = new ReplayGuard();
  const router = new Router();
  const telemetry = new ServiceTelemetry('grid');
  let cachedChain = { valid: true };
  let nextIntegrityProbeAt = 0;

  function currentOperations() {
    if (Date.now() >= nextIntegrityProbeAt) {
      try {
        cachedChain = store.verifyChain();
      } catch {
        cachedChain = { valid: false, reason: 'verification_error' };
      }
      nextIntegrityProbeAt = Date.now() + config.integrityProbeIntervalSeconds * 1_000;
    }
    if (!cachedChain.valid) telemetry.markIntegrityFailure(cachedChain.reason);
    const readiness = readinessState('grid', [
      {
        name: 'evidence-chain',
        ok: cachedChain.valid,
        code: cachedChain.valid ? undefined : 'integrity_verification_failed'
      },
      { name: 'database', ok: true }
    ]);
    return operationsReport([telemetry.snapshot(readiness)]);
  }

  router.add('GET', '/health', async () => ({
    httpStatus: 200,
    body: { service: 'grid', status: 'live' }
  }), { auth: false });

  router.add('GET', '/internal/v1/operations', async () => currentOperations());

  router.add('POST', '/internal/v1/commit', async ({ body, traceId, principal }) => {
    if (principal.service !== 'hypervisor') {
      throw new ValidationError('Only Hypervisor may commit state transitions');
    }
    const input = assertPlainObject(parseJsonBody(body), 'commit');
    const actor = assertString(input.actor, 'actor', { max: 160, pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/ });
    const claimedPrincipal = assertString(input.principal, 'principal', {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
    });
    if (actor !== claimedPrincipal) throw new ValidationError('Commit actor does not match the claimed principal');
    const exports = Array.isArray(input.events)
      ? input.events.filter(event => event?.kind === 'export.requested')
      : [];
    const backups = Array.isArray(input.events)
      ? input.events.filter(event => event?.kind === 'backup.requested')
      : [];
    const schedules = Array.isArray(input.events)
      ? input.events.filter(
        event => event?.kind === 'node.schedule.requested'
      )
      : [];
    for (const event of exports) store.preflightExportRequest(actor, event);
    const appended = store.appendEvents({ traceId, actor, events: input.events });
    const completedExports = [];
    const completedBackups = [];
    const completedSchedules = [];
    for (const event of exports) {
      completedExports.push(await store.createExport(event.payload.export_id, traceId));
    }
    for (const event of backups) {
      completedBackups.push(await createGridBackup({
        store,
        dataDir: config.dataDir,
        identity,
        protector,
        backupId: event.payload.backup_id,
        traceId
      }));
    }
    for (const event of schedules) {
      completedSchedules.push(store.getNodeSchedule(
        event.payload.schedule_id,
        actor
      ));
    }
    return {
      httpStatus: 201,
      body: {
        events: appended,
        exports: completedExports,
        backups: completedBackups,
        schedules: completedSchedules
      }
    };
  });

  router.add('GET', '/internal/v1/status', async () => store.getStatus());
  router.add('GET', '/internal/v1/verify-chain', async () => store.verifyChain());
  router.add('GET', '/internal/v1/events', async ({ url }) => ({
    events: store.listEvents({
      after: integerQuery(url.searchParams.get('after'), 0, {
        label: 'events after',
        min: 0,
        max: Number.MAX_SAFE_INTEGER
      }),
      limit: integerQuery(url.searchParams.get('limit'), 100, {
        label: 'events limit',
        min: 1,
        max: 500
      }),
      actor: url.searchParams.get('actor') ?? undefined
    })
  }));
  router.add('GET', '/internal/v1/intents/:id', async ({ params }) => store.getIntent(params.id));
  router.add('GET', '/internal/v1/machine-receipts/intents/:id/verify', async ({ params, url }) => {
    const intentId = assertString(params.id, 'intent_id', {
      max: 160,
      pattern: /^intent_[a-f0-9]{64}$/
    });
    const requester = assertString(url.searchParams.get('principal'), 'principal', {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
    });
    let intent;
    try {
      intent = store.getIntent(intentId);
    } catch (error) {
      if (error?.code === 'intent_not_found') {
        throw new AxiomError('not_found', 'Machine intent receipt was not found', 404);
      }
      throw error;
    }
    if (intent.principal !== requester) {
      throw new AxiomError('not_found', 'Machine intent receipt was not found', 404);
    }
    const events = store.db.prepare(`
      SELECT * FROM events
      WHERE subject = ?
        AND kind IN ('intent.accepted', 'intent.completed', 'intent.denied', 'intent.failed')
      ORDER BY seq
    `).all(intentId).map(row => store.decodeEventRow(row));
    return buildMachineIntentReceipt({
      intent,
      events,
      chain: store.verifyChain(),
      identity,
      kernelVersion: '0.12.0-dev.3'
    });
  });
  router.add('GET', '/internal/v1/capsules', async ({ url }) => ({
    capsules: store.listCapsules({
      limit: integerQuery(url.searchParams.get('limit'), 100, {
        label: 'capsules limit',
        min: 1,
        max: 100
      })
    })
  }));
  router.add('GET', '/internal/v1/proposals', async ({ url }) => ({
    proposals: store.listProposals({
      limit: integerQuery(url.searchParams.get('limit'), 100, {
        label: 'proposals limit',
        min: 1,
        max: 100
      })
    })
  }));
  router.add('GET', '/internal/v1/nodes', async ({ url }) => ({
    nodes: store.listNodes({
      limit: integerQuery(url.searchParams.get('limit'), 100, {
        label: 'nodes limit',
        min: 1,
        max: 100
      })
    })
  }));
  router.add('GET', '/internal/v1/node-discovery', async ({ url }) => {
    const discovery = store.discoverNodes({
      required_capabilities: url.searchParams.getAll('capability'),
      required_roles: url.searchParams.getAll('role'),
      minimum_security_level: integerQuery(
        url.searchParams.get('minimum_security_level'),
        0
      ),
      minimum_lease_seconds: integerQuery(
        url.searchParams.get('minimum_lease_seconds'),
        0
      ),
      limit: integerQuery(url.searchParams.get('limit'), 100)
    });
    return {
      ...discovery,
      attestation: identity.signObject(discovery)
    };
  });
  router.add(
    'GET',
    '/internal/v1/node-schedules/:principal',
    async ({ params }) => ({
      schedules: store.listNodeSchedules(params.principal)
    })
  );
  router.add('GET', '/internal/v1/consents/:principal', async ({ params }) => ({
    consents: store.listConsents(params.principal)
  }));
  router.add('GET', '/internal/v1/approvals/:principal', async ({ params }) => ({
    approvals: store.listApprovals(params.principal)
  }));
  router.add('GET', '/internal/v1/approval/:id', async ({ params }) => store.getApproval(params.id));
  router.add('GET', '/internal/v1/memory/:owner', async ({ params, url }) => {
    const owner = assertString(params.owner, 'owner', {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
    });
    const requester = assertString(url.searchParams.get('requester'), 'requester', {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
    });
    return store.listMemory(requester, owner, {
      limit: integerQuery(url.searchParams.get('limit'), 100, {
        label: 'memory limit',
        min: 1,
        max: 500
      })
    });
  });
  router.add('GET', '/internal/v1/accounting/:owner', async ({ params }) => {
    const owner = assertString(params.owner, 'owner', {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
    });
    return store.listAccounting(owner);
  });
  router.add('GET', '/internal/v1/imports/:principal', async ({ params }) => ({
    imports: store.listImports(params.principal)
  }));
  router.add('GET', '/internal/v1/import/:id', async ({ params, url }) => {
    const principal = assertString(url.searchParams.get('principal'), 'principal', {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
    });
    return store.getImport(params.id, principal);
  });
  router.add('GET', '/internal/v1/policy-overlays', async () => ({
    overlays: store.listActivePolicyOverlays()
  }));
  router.add('GET', '/internal/v1/appeals/:principal', async ({ params }) => ({
    appeals: store.listGovernanceAppeals(params.principal)
  }));
  router.add('GET', '/internal/v1/storage-offers/:owner', async ({ params }) => ({
    offers: store.listStorageOffers(params.owner)
  }));
  router.add('GET', '/internal/v1/sync/:owner', async ({ params, url }) => {
    const owner = assertString(params.owner, 'owner', {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
    });
    const namespace = url.searchParams.get('namespace') ?? undefined;
    const recordId = url.searchParams.get('record_id') ?? undefined;
    if (namespace !== undefined) {
      assertString(namespace, 'namespace', {
        max: 128,
        pattern: /^[a-z][a-z0-9.-]{0,127}$/
      });
    }
    if (recordId !== undefined) {
      assertString(recordId, 'record_id', {
        max: 160,
        pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
      });
    }
    return store.listCausalSync(owner, { namespace, recordId });
  });
  router.add(
    'GET',
    '/internal/v1/sync/:owner/bundles/:digest',
    async ({ params }) => {
      const owner = assertString(params.owner, 'owner', {
        max: 160,
        pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
      });
      const bundleDigest = assertString(params.digest, 'bundle digest', {
        min: 64,
        max: 64,
        pattern: /^[a-f0-9]{64}$/
      });
      return store.getCausalSyncBundle(owner, bundleDigest);
    }
  );
  router.add('GET', '/internal/v1/backups/:principal', async ({ params, url }) => (
    store.listBackups(params.principal, {
      limit: integerQuery(url.searchParams.get('limit'), 100, {
        label: 'backup limit',
        min: 1,
        max: 100
      })
    })
  ));
  router.add('GET', '/internal/v1/backup/:id', async ({ params, url }) => {
    const principal = assertString(url.searchParams.get('principal'), 'principal', {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
    });
    return store.getBackupRecord(params.id, principal);
  });
  router.add('GET', '/internal/v1/exports/:id', async ({ params, url }) => {
    const principal = assertString(url.searchParams.get('principal'), 'principal', {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
    });
    return store.getExport(params.id, principal);
  });
  router.add('GET', '/internal/v1/exports/:id/bundle', async ({ params, url }) => {
    const principal = assertString(url.searchParams.get('principal'), 'principal', {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
    });
    return store.getExportBundle(params.id, principal);
  });

  const server = createServiceServer({
    name: 'grid',
    router,
    maxBodyBytes: config.maxBodyBytes,
    telemetry,
    tls: identity.transport
      ? transportServerOptions(identity.transport)
      : undefined,
    transportPeers: identity.transport?.peers,
    allowedTransportPeers: identity.transport
      ? allowedInboundTransportPeers('grid')
      : undefined,
    authorizeRequest: args => authorizeInboundServiceRequest({
      ...args,
      destination: 'grid'
    }),
    authenticate: ({ req, body }) => verifySignedRequest({
      req,
      body,
      audience: 'grid',
      dataDir: config.dataDir,
      allowedCallers: ['gateway', 'hypervisor'],
      transportPeers: identity.transport?.peers,
      replayGuard,
      clockSkewSeconds: config.clockSkewSeconds
    })
  });
  return {
    name: 'grid',
    server,
    store,
    identity,
    telemetry,
    operations: currentOperations,
    async start() {
      return listen(server, { host: config.hosts.internal, port: config.ports.grid });
    },
    async stop() {
      if (server.listening) await new Promise(resolve => server.close(resolve));
      store.close();
      await releaseGridRuntimeLock(runtimeLock);
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runServiceProcess(createGridService);
}

function integerQuery(value, fallback, {
  label = 'integer query',
  min = 0,
  max = Number.MAX_SAFE_INTEGER
} = {}) {
  if (value === null || value === '') return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${label} is invalid`);
  }
  return parsed;
}

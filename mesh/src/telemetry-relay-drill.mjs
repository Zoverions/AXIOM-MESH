import { createPublicKey, randomBytes } from 'node:crypto';
import http from 'node:http';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './lib/canonical.mjs';
import {
  ensureMeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';
import {
  findProductionPortBlock,
  productionHostEnvironment,
  startProductionHost,
  stopProductionHost
} from './lib/production-host.mjs';
import { provisionProduction } from './provision-production.mjs';
import {
  createTelemetryRelayState,
  deliverTelemetryItem,
  enqueueTelemetryDelivery,
  loadTelemetryRoutingPolicy,
  processTelemetryDeliveries,
  runTelemetryRelayCycle,
  validateTelemetryDestinations,
  validateTelemetryRelayState
} from './telemetry-relay.mjs';

const EVIDENCE_SCHEMA = 'axiom-telemetry-relay-drill-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REQUEST_TIMEOUT_MS = 5_000;
const STARTUP_TIMEOUT_MS = 20_000;

export async function runTelemetryRelayDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString(),
  policy
} = {}) {
  policy ??= await loadTelemetryRoutingPolicy();
  if (process.platform === 'win32') {
    throw new ValidationError(
      'Telemetry relay drill requires the production Unix-domain ingress boundary'
    );
  }
  const workspace = await prepareDisposableWorkspace(workspaceDir);
  const revision = normalizeRevision(sourceRevision);
  const overallStartedAt = performance.now();
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const relayToken = (
    await readFile(provisioned.telemetry_relay_token_file, 'utf8')
  ).trim();
  const operatorToken = (
    await readFile(provisioned.operator_token_file, 'utf8')
  ).trim();
  const socketPath = join(workspace, 'gateway.sock');
  const basePort = await findProductionPortBlock('telemetry relay drill');
  const gateway = `http://127.0.0.1:${basePort}`;
  const environment = {
    ...productionHostEnvironment(provisioned, basePort, {
      rateLimitCapacity: 120,
      rateLimitRefillPerSecond: 120
    }),
    AXIOM_GATEWAY_SOCKET: socketPath
  };
  const receiver = await startReceiver();
  const deliveryCredential = randomBytes(32).toString('base64url');
  receiver.setCredential(deliveryCredential);
  const origin = `http://127.0.0.1:${receiver.port}`;
  const destinations = {
    schema: 'axiom-telemetry-destinations.v1',
    version: 1,
    allowed_origins: [origin],
    metrics: {
      url: `${origin}/v1/metrics`,
      credential_file: join(workspace, 'metrics-delivery.token'),
      credential: deliveryCredential
    },
    alerts: {
      url: `${origin}/api/v2/alerts`,
      credential_file: join(workspace, 'alerts-delivery.token'),
      credential: deliveryCredential
    },
    test_only_allow_loopback_http: true
  };
  validateTelemetryDestinations(destinations, policy, {
    allowLoopbackHttp: true
  });
  let runtime;
  try {
    const started = await startProductionHost({
      environment,
      gateway,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      drill: 'telemetry relay drill'
    });
    runtime = started;

    const unauthenticatedMetricsStatus = await socketStatus(
      socketPath,
      '/v1/metrics'
    );
    const telemetryScopeBoundaryStatus = await socketStatus(
      socketPath,
      '/v1/status',
      relayToken
    );
    for (let index = 0; index < 5; index += 1) {
      await socketStatus(socketPath, '/v1/operations', `invalid-${index}-${'x'.repeat(32)}`);
    }
    const authorizedMetricsStatus = await socketStatus(
      socketPath,
      '/v1/metrics',
      relayToken
    );

    const observedAt = new Date().toISOString();
    let state = createTelemetryRelayState(policy);
    const firstCycle = await runTelemetryRelayCycle({
      state,
      policy,
      destinations,
      socketPath,
      scrapeToken: relayToken,
      observedAt
    });
    state = firstCycle.state;
    const queuedAfterTransientFailure = state.queue.length;
    const retryAt = new Date(
      Date.parse(observedAt) + policy.delivery.initial_retry_delay_ms
    ).toISOString();
    state = await processTelemetryDeliveries(state, {
      policy,
      destinations,
      now: retryAt,
      deliver: deliverTelemetryItem
    });
    const stopped = await stopProductionHost(runtime.child);
    runtime = null;

    const restrictedDestinationRejected = destinationRejected(policy);
    const tamperedQueueRejected = queueTamperRejected(state, policy, observedAt);
    const metricsDelivery = receiver.accepted.find(item => item.kind === 'metrics');
    const alertDelivery = receiver.accepted.find(item => item.kind === 'alerts');
    const checks = {
      production_runtime_started: started.startup_duration_ms <= STARTUP_TIMEOUT_MS,
      unauthenticated_metrics_rejected: unauthenticatedMetricsStatus === 401,
      telemetry_scope_route_limited: telemetryScopeBoundaryStatus === 403,
      least_privilege_metrics_accepted: authorizedMetricsStatus === 200,
      exact_four_service_collection: firstCycle.result.metric_points === 68,
      openmetrics_was_bounded: (
        firstCycle.result.openmetrics_bytes > 0
        && firstCycle.result.openmetrics_bytes <= policy.scrape.max_response_bytes
      ),
      authentication_alert_was_routed: firstCycle.result.alerts >= 1,
      transient_delivery_failures_retried: (
        firstCycle.result.retries_total === 2
        && queuedAfterTransientFailure === 2
      ),
      otlp_delivery_receipt_recorded: Boolean(metricsDelivery),
      alertmanager_delivery_receipt_recorded: Boolean(alertDelivery),
      queue_drained_after_receipts: state.queue.length === 0,
      no_dead_letters: state.counters.dead_letters_total === 0,
      unlisted_or_insecure_destination_rejected: restrictedDestinationRejected,
      queue_tampering_rejected: tamperedQueueRejected,
      runtime_stopped_cleanly: stopped.code === 0 && stopped.signal === null
    };
    const failed = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failed.length) {
      throw new ValidationError(
        `Telemetry relay drill checks failed: ${failed.join(', ')}`
      );
    }

    const signer = await ensureMeshIdentity(
      provisioned.data_dir,
      'grid',
      { create: false }
    );
    const publicKeyPem = String(signer.publicKey.export({
      type: 'spki',
      format: 'pem'
    }));
    const unsigned = {
      schema: EVIDENCE_SCHEMA,
      status: 'passed',
      generated_at: generatedAt,
      source: {
        kernel_version: '0.11.0',
        revision
      },
      policy: {
        schema: policy.schema,
        digest: digestObject(policy)
      },
      topology: {
        candidate_kernel_policy: 'deny-egress',
        drill_runtime: 'host-mode-production-supervisor',
        deny_egress_proof: 'separate-same-revision-container-artifact',
        relay_location: 'host-side',
        scrape_transport: 'permission-restricted-unix-domain-http',
        delivery_transport: 'loopback simulation of production HTTPS',
        production_destinations_require_https: true
      },
      collection: {
        services: 4,
        metric_points: firstCycle.result.metric_points,
        openmetrics_bytes: firstCycle.result.openmetrics_bytes,
        openmetrics_sha256: firstCycle.result.openmetrics_sha256,
        unauthenticated_status: unauthenticatedMetricsStatus,
        least_privilege_status: authorizedMetricsStatus,
        scope_boundary_status: telemetryScopeBoundaryStatus
      },
      delivery: {
        metrics_protocol: 'otlp-http-json',
        alerts_protocol: 'alertmanager-v2',
        queue_limit: policy.delivery.max_queue_items,
        alert_reserve: policy.delivery.alert_reserve_items,
        queue_byte_limit: policy.delivery.max_queue_bytes,
        retry_limit: policy.delivery.max_attempts,
        transient_retries: state.counters.retries_total,
        successful_deliveries: state.counters.deliveries_total,
        dead_letters: state.counters.dead_letters_total,
        receipts: receiver.accepted.map(item => ({
          kind: item.kind,
          delivery_id: item.delivery_id,
          content_sha256: item.content_sha256,
          receipt_id: item.receipt_id,
          body_bytes: item.body_bytes
        })).sort((left, right) => left.kind.localeCompare(right.kind))
      },
      privacy: {
        fixed_service_vocabulary: [...policy.privacy.services],
        metric_attribute_keys: [...policy.privacy.allowed_metric_attribute_keys],
        alert_label_keys: [...policy.privacy.allowed_alert_label_keys],
        forbidden_terms: [...policy.privacy.forbidden_terms],
        credential_material_embedded: false
      },
      execution: {
        disposable_workspace: true,
        host_mode: true,
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        runtime_start_ms: started.startup_duration_ms,
        runtime_stop_ms: stopped.duration_ms,
        total_duration_ms: elapsedMilliseconds(overallStartedAt)
      },
      signer: {
        service: 'grid',
        key_id: signer.keyId,
        public_key_pem: publicKeyPem
      },
      checks,
      limitations: [
        'disposable single-host proof, not a live external collector deployment',
        'loopback receivers exercise transport behavior without third-party credentials',
        'pilot destinations still require operator-owned HTTPS endpoints and trust configuration'
      ]
    };
    const evidence = {
      ...unsigned,
      attestation: signer.signObject(unsigned)
    };
    verifyTelemetryRelayEvidence(evidence, policy);
    const serialized = canonicalJson(evidence);
    for (const secret of [relayToken, operatorToken, deliveryCredential]) {
      if (serialized.includes(secret)) {
        throw new ValidationError('Telemetry relay evidence contains credential material');
      }
    }
    return evidence;
  } finally {
    if (runtime) await stopProductionHost(runtime.child);
    await receiver.close();
  }
}

export function verifyTelemetryRelayEvidence(evidence, policy) {
  const policyDigest = digestObject(policy);
  if (
    !evidence
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || evidence.policy?.schema !== policy.schema
    || evidence.policy?.digest !== policyDigest
    || Object.values(evidence.checks ?? {}).some(value => value !== true)
  ) {
    throw new ValidationError('Telemetry relay drill evidence format or checks are invalid');
  }
  if (
    evidence.topology?.candidate_kernel_policy !== 'deny-egress'
    || evidence.topology?.drill_runtime !== 'host-mode-production-supervisor'
    || evidence.topology?.deny_egress_proof !== (
      'separate-same-revision-container-artifact'
    )
    || evidence.topology?.relay_location !== 'host-side'
    || evidence.topology?.production_destinations_require_https !== true
    || evidence.collection?.services !== 4
    || evidence.collection?.metric_points !== 68
    || !DIGEST.test(evidence.collection?.openmetrics_sha256 ?? '')
    || evidence.collection?.unauthenticated_status !== 401
    || evidence.collection?.least_privilege_status !== 200
    || evidence.collection?.scope_boundary_status !== 403
  ) {
    throw new ValidationError('Telemetry relay collection boundary evidence is invalid');
  }
  if (
    evidence.delivery?.metrics_protocol !== 'otlp-http-json'
    || evidence.delivery?.alerts_protocol !== 'alertmanager-v2'
    || evidence.delivery?.queue_limit !== policy.delivery.max_queue_items
    || evidence.delivery?.alert_reserve !== policy.delivery.alert_reserve_items
    || evidence.delivery?.queue_byte_limit !== policy.delivery.max_queue_bytes
    || evidence.delivery?.retry_limit !== policy.delivery.max_attempts
    || evidence.delivery?.transient_retries !== 2
    || evidence.delivery?.successful_deliveries !== 2
    || evidence.delivery?.dead_letters !== 0
    || !Array.isArray(evidence.delivery?.receipts)
    || evidence.delivery.receipts.length !== 2
    || evidence.delivery.receipts.some(receipt => (
      !['alerts', 'metrics'].includes(receipt.kind)
      || !/^delivery_[a-f0-9]{32}$/.test(receipt.delivery_id ?? '')
      || !DIGEST.test(receipt.content_sha256 ?? '')
      || !/^receipt:(alerts|metrics):[a-f0-9]{12}$/.test(receipt.receipt_id ?? '')
      || !Number.isSafeInteger(receipt.body_bytes)
      || receipt.body_bytes < 2
      || receipt.body_bytes > policy.delivery.max_item_bytes
    ))
  ) {
    throw new ValidationError('Telemetry relay delivery evidence is invalid');
  }
  if (
    canonicalJson(evidence.privacy?.fixed_service_vocabulary) !== (
      canonicalJson(policy.privacy.services)
    )
    || canonicalJson(evidence.privacy?.metric_attribute_keys) !== (
      canonicalJson(policy.privacy.allowed_metric_attribute_keys)
    )
    || canonicalJson(evidence.privacy?.alert_label_keys) !== (
      canonicalJson(policy.privacy.allowed_alert_label_keys)
    )
    || evidence.privacy?.credential_material_embedded !== false
  ) {
    throw new ValidationError('Telemetry relay privacy evidence is invalid');
  }
  if (
    typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.signer?.service !== 'grid'
    || evidence.attestation?.key_id !== evidence.signer.key_id
  ) {
    throw new ValidationError('Telemetry relay evidence signer metadata is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Telemetry relay evidence public key is invalid');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Telemetry relay evidence attestation is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    source_revision: evidence.source?.revision,
    policy_digest: policyDigest,
    receipts: evidence.delivery.receipts.length
  };
}

async function startReceiver() {
  let credential;
  const attempts = new Map();
  const accepted = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 131_072) {
        response.writeHead(413);
        response.end();
        return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const kind = request.url === '/v1/metrics'
      ? 'metrics'
      : request.url === '/api/v2/alerts'
        ? 'alerts'
        : null;
    const deliveryId = request.headers['idempotency-key'];
    const contentDigest = request.headers['x-axiom-payload-sha256'];
    if (
      request.method !== 'POST'
      || !kind
      || request.headers.authorization !== `Bearer ${credential}`
      || !/^delivery_[a-f0-9]{32}$/.test(deliveryId ?? '')
      || contentDigest !== sha256(body)
      || request.headers['content-type'] !== 'application/json'
    ) {
      response.writeHead(400);
      response.end();
      return;
    }
    try {
      JSON.parse(body);
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    const count = (attempts.get(kind) ?? 0) + 1;
    attempts.set(kind, count);
    if (count === 1) {
      response.writeHead(kind === 'metrics' ? 503 : 429, {
        'retry-after': '1'
      });
      response.end();
      return;
    }
    const receiptId = `receipt:${kind}:${sha256(deliveryId).slice(0, 12)}`;
    accepted.push({
      kind,
      delivery_id: deliveryId,
      content_sha256: contentDigest,
      receipt_id: receiptId,
      body_bytes: body.length
    });
    response.writeHead(200, {
      'content-type': 'application/json',
      'x-axiom-receipt-id': receiptId
    });
    response.end(kind === 'metrics' ? '{}' : '');
  });
  await new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveServer);
  });
  return {
    port: server.address().port,
    accepted,
    setCredential(value) {
      credential = value;
    },
    async close() {
      if (!server.listening) return;
      await new Promise(resolveServer => server.close(resolveServer));
    }
  };
}

async function socketStatus(socketPath, path, token) {
  return new Promise(resolveStatus => {
    const request = http.request({
      socketPath,
      path,
      method: 'GET',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      timeout: REQUEST_TIMEOUT_MS
    }, response => {
      response.resume();
      response.once('end', () => resolveStatus(response.statusCode));
    });
    request.once('timeout', () => {
      request.destroy();
      resolveStatus(0);
    });
    request.once('error', () => resolveStatus(0));
    request.end();
  });
}

function destinationRejected(policy) {
  const unsafe = {
    schema: 'axiom-telemetry-destinations.v1',
    version: 1,
    allowed_origins: ['http://collector.example.test'],
    metrics: {
      url: 'http://collector.example.test/v1/metrics',
      credential_file: resolve('metrics.token')
    },
    alerts: {
      url: 'https://unlisted.example.test/api/v2/alerts',
      credential_file: resolve('alerts.token')
    }
  };
  try {
    validateTelemetryDestinations(unsafe, policy);
    return false;
  } catch {
    return true;
  }
}

function queueTamperRejected(state, policy, generatedAt) {
  let pending = enqueueTelemetryDelivery(state, {
    kind: 'metrics',
    payload: { resourceMetrics: [] },
    createdAt: new Date(Date.parse(generatedAt) + 10_000).toISOString()
  }, policy);
  pending = structuredClone(pending);
  pending.queue[0].content.resourceMetrics.push({ tampered: true });
  try {
    validateTelemetryRelayState(pending, policy);
    return false;
  } catch {
    return true;
  }
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(
      'Telemetry relay drill requires an explicit disposable workspace'
    );
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError('Telemetry relay drill workspace must be empty');
  }
  return workspace;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!REVISION.test(value)) {
    throw new ValidationError(
      'Telemetry relay source revision must be a 40-character SHA'
    );
  }
  return value;
}

function elapsedMilliseconds(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 3) {
    throw new ValidationError(
      'Usage: node src/telemetry-relay-drill.mjs <empty-disposable-workspace>'
    );
  }
  const evidence = await runTelemetryRelayDrill({
    workspaceDir: process.argv[2]
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

export { EVIDENCE_SCHEMA };

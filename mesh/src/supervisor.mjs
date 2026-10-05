import { spawn } from 'node:child_process';
import { once } from 'node:events';
import https from 'node:https';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import { meshConfig } from './lib/config.mjs';
import { recoverStaleGridRuntimeLock } from './grid/backup.mjs';
import { startLocalIngressBridge } from './local-ingress.mjs';
import { assertDenyEgressBoundary } from './network-boundary.mjs';
import { assertProductionRuntime } from './setup.mjs';
import {
  loadTransportRuntime,
  serviceDnsName,
  verifyTransportServerIdentity
} from './lib/transport-credentials.mjs';
import { authorizeServiceRequest } from './lib/service-network-policy.mjs';

const STARTUP_ORDER = Object.freeze([
  { service: 'grid', module: 'src/grid/server.mjs', port: 'grid', probe: '/health', expected: 'live' },
  { service: 'sandbox', module: 'src/sandbox/server.mjs', port: 'sandbox', probe: '/health', expected: 'live' },
  {
    service: 'hypervisor',
    module: 'src/hypervisor/server.mjs',
    port: 'hypervisor',
    probe: '/health',
    expected: 'live'
  },
  { service: 'gateway', module: 'src/gateway/server.mjs', port: 'gateway', probe: '/ready', expected: 'ready' }
]);
const FORCED_EXIT_TIMEOUT_MS = 3_000;

export async function runProductionSupervisor({
  config = meshConfig(),
  spawnImpl = spawn,
  fetchImpl = fetch,
  denyEgressCheck = assertDenyEgressBoundary,
  ingressBridgeStart = startLocalIngressBridge,
  recoverGridLock = recoverStaleGridRuntimeLock,
  startupTimeoutMs = 20_000,
  stdout = value => process.stdout.write(value),
  stderr = value => process.stderr.write(value)
} = {}) {
  if (config.environment !== 'production' || config.autoBootstrap) {
    throw new ValidationError('The production supervisor requires NODE_ENV=production and disabled auto-bootstrap');
  }
  assertProductionRuntime();
  if (config.requireDenyEgress) await denyEgressCheck();
  const supervisorTransport = config.transport?.enabled
    ? await loadTransportRuntime({
        transportDir: config.transport.directory,
        service: 'supervisor'
      })
    : null;
  const children = [];
  let ingressBridge;
  let stopping = false;
  let resolveStop;
  let requestedExitCode = 0;
  const stopRequested = new Promise(resolve => {
    resolveStop = resolve;
  });

  function requestStop(exitCode) {
    if (stopping) return;
    stopping = true;
    requestedExitCode = exitCode;
    resolveStop();
  }

  const signalHandlers = new Map([
    ['SIGINT', () => requestStop(0)],
    ['SIGTERM', () => requestStop(0)]
  ]);
  const messageHandler = message => {
    if (message?.type === 'axiom.supervisor.stop') requestStop(0);
  };
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);
  if (process.connected) process.once('message', messageHandler);

  try {
    const lockRecovery = config.dataDir
      ? await recoverGridLock(config.dataDir)
      : null;
    if (lockRecovery) {
      stdout(`${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'supervisor',
        event: 'grid.runtime_lock.recovered',
        stale_pid: lockRecovery.stale_pid,
        quarantine_path: lockRecovery.quarantine_path
      })}\n`);
    }
    for (const spec of STARTUP_ORDER) {
      const child = spawnImpl(process.execPath, [spec.module], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: process.env,
        stdio: ['ignore', 'inherit', 'inherit', 'ipc']
      });
      const record = { ...spec, child };
      children.push(record);
      child.once('exit', (code, signal) => {
        if (!stopping) {
          stderr(`${JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            service: 'supervisor',
            event: 'child.exited',
            child_service: spec.service,
            exit_code: code,
            signal
          })}\n`);
          requestStop(code === 0 ? 1 : code ?? 1);
        }
      });
      await waitForHealthy({
        child,
        service: spec.service,
        url: serviceHealthUrl(config, spec),
        expected: spec.expected,
        fetchImpl,
        transport: spec.service === 'gateway'
          ? null
          : supervisorTransport,
        timeoutMs: startupTimeoutMs
      });
    }
    if (config.gatewaySocket) {
      ingressBridge = await ingressBridgeStart({
        socketPath: config.gatewaySocket,
        targetHost: '127.0.0.1',
        targetPort: config.ports.gateway
      });
    }
    stdout(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'supervisor',
      event: 'runtime.ready',
      processes: STARTUP_ORDER.map(item => item.service)
    })}\n`);
    if (process.connected && typeof process.send === 'function') {
      try {
        process.send({
          type: 'axiom.supervisor.ready',
          processes: children.map(item => ({
            service: item.service,
            pid: item.child.pid
          }))
        });
      } catch {
        // The runtime does not depend on an optional parent observation channel.
      }
    }
    await stopRequested;
  } catch (error) {
    requestedExitCode = 1;
    stderr(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'supervisor',
      event: 'startup.failed',
      error: {
        name: error?.name ?? 'Error',
        code: error?.code
      }
    })}\n`);
  } finally {
    stopping = true;
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    process.removeListener('message', messageHandler);
    try {
      await ingressBridge?.close();
    } finally {
      await stopChildren(children);
    }
  }
  return requestedExitCode;
}

async function waitForHealthy({
  child,
  service,
  url,
  expected,
  fetchImpl,
  transport,
  timeoutMs
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${service} exited before becoming healthy`);
    }
    try {
      const response = transport
        ? await secureHealthProbe({ url, service, transport })
        : await fetchImpl(url, {
            redirect: 'error',
            signal: AbortSignal.timeout(1_000)
          });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.service === service && payload?.status === expected) return;
      }
    } catch {
      // Startup polling is bounded by the shared deadline.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${service} did not become healthy before the startup deadline`);
}

function serviceHealthUrl(config, spec) {
  if (spec.service === 'gateway') {
    return `http://127.0.0.1:${config.ports.gateway}${spec.probe}`;
  }
  const configured = config.urls?.[spec.service];
  if (configured) return `${configured}${spec.probe}`;
  return `http://127.0.0.1:${config.ports[spec.port]}${spec.probe}`;
}

async function secureHealthProbe({ url, service, transport }) {
  authorizeServiceRequest({
    source: 'supervisor',
    destination: service,
    method: 'GET',
    url
  });
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      key: transport.key,
      cert: transport.cert,
      ca: transport.ca,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
      servername: serviceDnsName(service),
      checkServerIdentity: (_hostname, peer) => (
        verifyTransportServerIdentity(transport, service, peer)
      ),
      agent: false
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 65_536) {
          request.destroy(new Error('Health response exceeds the byte limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => {
        const serialized = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: (
            Number.isInteger(response.statusCode)
            && response.statusCode >= 200
            && response.statusCode < 300
          ),
          async json() {
            return JSON.parse(serialized);
          }
        });
      });
    });
    request.setTimeout(1_000, () => {
      request.destroy(new Error(`${service} health probe timed out`));
    });
    request.once('error', reject);
    request.end();
  });
}

async function stopChildren(children) {
  const pending = [];
  for (const { child } of [...children].reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (child.connected && typeof child.send === 'function') {
      try {
        child.send({ type: 'axiom.service.stop' }, error => {
          if (
            error
            && child.exitCode === null
            && child.signalCode === null
          ) child.kill('SIGTERM');
        });
      } catch {
        child.kill('SIGTERM');
      }
    } else {
      child.kill('SIGTERM');
    }
    pending.push(waitForSupervisorChildExit(child, 5_000));
  }
  await Promise.all(pending);
}

export async function waitForSupervisorChildExit(
  child,
  timeoutMs,
  { forcedExitTimeoutMs = FORCED_EXIT_TIMEOUT_MS } = {}
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new ValidationError('Supervisor child graceful-exit timeout is invalid');
  }
  if (
    !Number.isSafeInteger(forcedExitTimeoutMs)
    || forcedExitTimeoutMs < 1
    || forcedExitTimeoutMs > 60_000
  ) {
    throw new ValidationError('Supervisor child forced-exit timeout is invalid');
  }
  if (child.exitCode !== null || child.signalCode !== null) return;

  const exited = once(child, 'exit').then(() => true);
  if (await settleWithin(exited, timeoutMs)) return;

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
  if (await settleWithin(exited, forcedExitTimeoutMs)) return;

  throw new ValidationError(
    'Supervisor child did not exit after forced termination'
  );
}

async function settleWithin(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(resolve => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runProductionSupervisor();
}

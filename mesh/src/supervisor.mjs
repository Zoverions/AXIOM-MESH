import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import { meshConfig } from './lib/config.mjs';

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

export async function runProductionSupervisor({
  config = meshConfig(),
  spawnImpl = spawn,
  fetchImpl = fetch,
  startupTimeoutMs = 20_000,
  stdout = value => process.stdout.write(value),
  stderr = value => process.stderr.write(value)
} = {}) {
  if (config.environment !== 'production' || config.autoBootstrap) {
    throw new ValidationError('The production supervisor requires NODE_ENV=production and disabled auto-bootstrap');
  }
  const children = [];
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
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);

  try {
    for (const spec of STARTUP_ORDER) {
      const child = spawnImpl(process.execPath, [spec.module], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: process.env,
        stdio: ['ignore', 'inherit', 'inherit']
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
        url: `http://127.0.0.1:${config.ports[spec.port]}${spec.probe}`,
        expected: spec.expected,
        fetchImpl,
        timeoutMs: startupTimeoutMs
      });
    }
    stdout(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'supervisor',
      event: 'runtime.ready',
      processes: STARTUP_ORDER.map(item => item.service)
    })}\n`);
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
    await stopChildren(children);
  }
  return requestedExitCode;
}

async function waitForHealthy({ child, service, url, expected, fetchImpl, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${service} exited before becoming healthy`);
    }
    try {
      const response = await fetchImpl(url, {
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

async function stopChildren(children) {
  const pending = [];
  for (const { child } of [...children].reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    child.kill('SIGTERM');
    pending.push(waitForExit(child, 5_000));
  }
  await Promise.all(pending);
}

async function waitForExit(child, timeoutMs) {
  const timeout = new Promise(resolve => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      resolve();
    }, timeoutMs);
    timer.unref();
  });
  await Promise.race([once(child, 'exit'), timeout]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runProductionSupervisor();
}

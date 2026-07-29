import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ValidationError } from './canonical.mjs';
import { MESH_ROOT } from './config.mjs';

export function productionHostEnvironment(provisioned, basePort, {
  maxBodyBytes = 1_048_576,
  rateLimitCapacity = 60,
  rateLimitRefillPerSecond = 1
} = {}) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    AXIOM_AUTO_BOOTSTRAP: 'false',
    AXIOM_DATA_DIR: provisioned.data_dir,
    AXIOM_DATA_KEY: '',
    AXIOM_DATA_KEY_FILE: provisioned.data_key_file,
    AXIOM_API_TOKENS: '',
    AXIOM_API_TOKENS_FILE: provisioned.api_tokens_file,
    AXIOM_GATEWAY_HOST: '127.0.0.1',
    AXIOM_INTERNAL_HOST: '127.0.0.1',
    AXIOM_GATEWAY_PORT: String(basePort),
    AXIOM_HYPERVISOR_PORT: String(basePort + 1),
    AXIOM_SANDBOX_PORT: String(basePort + 2),
    AXIOM_GRID_PORT: String(basePort + 3),
    AXIOM_HYPERVISOR_URL: `http://127.0.0.1:${basePort + 1}`,
    AXIOM_SANDBOX_URL: `http://127.0.0.1:${basePort + 2}`,
    AXIOM_GRID_URL: `http://127.0.0.1:${basePort + 3}`,
    AXIOM_POLICY_PATH: join(MESH_ROOT, 'config', 'policy.json'),
    AXIOM_POLICY_PATHS: '',
    AXIOM_CAPABILITIES_PATH: join(MESH_ROOT, 'config', 'capabilities.json'),
    AXIOM_MAX_BODY_BYTES: String(maxBodyBytes),
    AXIOM_RATE_LIMIT_CAPACITY: String(rateLimitCapacity),
    AXIOM_RATE_LIMIT_REFILL_PER_SECOND: String(rateLimitRefillPerSecond),
    AXIOM_LOG_REQUESTS: 'false'
  };
}

export async function startProductionHost({
  environment,
  gateway,
  startupTimeoutMs = 20_000,
  drill = 'production'
}) {
  const startedAt = performance.now();
  const child = spawn(process.execPath, ['src/supervisor.mjs'], {
    cwd: MESH_ROOT,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: environment
  });
  let diagnostics = '';
  let supervisorProcesses = null;
  const collect = chunk => {
    if (diagnostics.length < 32_768) diagnostics += chunk;
  };
  const collectMessage = message => {
    if (message?.type === 'axiom.supervisor.ready') {
      supervisorProcesses = normalizeSupervisorProcesses(message.processes);
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('message', collectMessage);
  try {
    await waitForReady(`${gateway}/ready`, child, startupTimeoutMs);
    const processDeadline = Date.now() + 1_000;
    while (!supervisorProcesses && Date.now() < processDeadline) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
    }
    if (!supervisorProcesses) {
      throw Object.assign(
        new Error('Supervisor did not publish its process inventory'),
        { code: 'process_inventory_unavailable' }
      );
    }
  } catch (error) {
    await stopProductionHost(child);
    throw new ValidationError(
      `Production supervisor failed the ${drill} startup check: `
      + `${error.code ?? error.name}; ${startupDiagnosticSummary(diagnostics)}`
    );
  } finally {
    child.removeListener('message', collectMessage);
  }
  return {
    child,
    processes: supervisorProcesses,
    startup_duration_ms: elapsedMilliseconds(startedAt)
  };
}

export async function stopProductionHost(child, timeoutMs = 10_000) {
  const startedAt = performance.now();
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      code: child.exitCode,
      signal: child.signalCode,
      duration_ms: elapsedMilliseconds(startedAt)
    };
  }
  const exited = once(child, 'exit');
  if (child.connected) child.send({ type: 'axiom.supervisor.stop' });
  else child.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, timeoutMs);
  timer.unref();
  const [code, signal] = await exited;
  clearTimeout(timer);
  return {
    code,
    signal,
    duration_ms: elapsedMilliseconds(startedAt)
  };
}

export async function findProductionPortBlock(label = 'production drill') {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const base = 20_000 + Math.floor(Math.random() * 20_000);
    const servers = [];
    try {
      for (let port = base; port < base + 4; port += 1) {
        const server = net.createServer();
        await new Promise((resolvePromise, reject) => {
          server.once('error', reject);
          server.listen(port, '127.0.0.1', resolvePromise);
        });
        servers.push(server);
      }
      await Promise.all(
        servers.map(server => new Promise(resolvePromise => server.close(resolvePromise)))
      );
      return base;
    } catch {
      await Promise.all(
        servers.map(server => new Promise(resolvePromise => server.close(resolvePromise)))
      );
    }
  }
  throw new ValidationError(`Unable to reserve a local port block for ${label}`);
}

export function operationsReportIsReady(report) {
  return (
    report?.format === 'axiom-operations.v1'
    && report.status === 'ready'
    && Array.isArray(report.services)
    && report.services.length === 4
    && report.services.every(service => service.readiness?.status === 'ready')
  );
}

async function waitForReady(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      const error = new Error('Supervisor exited before readiness');
      error.code = 'supervisor_exited';
      throw error;
    }
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(1_000)
      });
      if (response.ok && (await response.json()).status === 'ready') return;
    } catch {
      // Bounded polling retains child exit and the shared deadline as authority.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  const error = new Error('Supervisor readiness timed out');
  error.code = 'startup_timeout';
  throw error;
}

function startupDiagnosticSummary(value) {
  const summaries = [];
  for (const line of value.split(/\r?\n/).filter(Boolean).slice(-20)) {
    try {
      const parsed = JSON.parse(line);
      summaries.push([
        parsed.service,
        parsed.event,
        parsed.error?.code,
        parsed.status
      ].filter(Boolean).join(':'));
    } catch {
      const message = line.match(
        /^([A-Za-z]*Error): ([A-Za-z0-9 .,;:_-]{1,200})$/
      );
      if (message) summaries.push(`${message[1]}:${message[2]}`);
      for (const code of [
        'EADDRINUSE',
        'grid_already_running',
        'SQLITE_BUSY',
        'authentication failed'
      ]) {
        if (line.includes(code)) summaries.push(code);
      }
    }
  }
  return summaries.filter(Boolean).slice(-6).join(',') || 'no-structured-diagnostic';
}

function normalizeSupervisorProcesses(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const expected = ['gateway', 'grid', 'hypervisor', 'sandbox'];
  const normalized = value.map(item => ({
    service: item?.service,
    pid: item?.pid
  })).sort((left, right) => left.service?.localeCompare(right.service));
  if (
    normalized.some((item, index) => (
      item.service !== expected[index]
      || !Number.isSafeInteger(item.pid)
      || item.pid < 1
    ))
    || new Set(normalized.map(item => item.pid)).size !== normalized.length
  ) return null;
  return normalized;
}

function elapsedMilliseconds(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

#!/usr/bin/env node

import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { meshConfig } from './lib/config.mjs';
import { recoverStaleGridRuntimeLock } from './grid/backup.mjs';
import { verifyRepositorySetup } from './setup.mjs';

const SERVICES = Object.freeze(['gateway', 'hypervisor', 'sandbox', 'grid']);

export async function checkPortAvailable({ host, port }) {
  return new Promise(resolve => {
    const server = createServer();
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    server.unref();
    server.once('error', error => {
      finish({
        available: false,
        code: error?.code ?? 'listen_failed'
      });
    });
    server.listen({ host, port, exclusive: true }, () => {
      server.close(error => {
        if (error) {
          finish({ available: false, code: error.code ?? 'close_failed' });
          return;
        }
        finish({ available: true, code: null });
      });
    });
  });
}

export async function checkGridRuntimeLock({
  dataDir,
  recoverLock = recoverStaleGridRuntimeLock
}) {
  try {
    const recovery = await recoverLock(dataDir);
    if (!recovery) {
      return {
        ready: true,
        state: 'absent',
        error_code: null,
        stale_pid: null,
        quarantine_path: null,
        remedy: null
      };
    }
    return {
      ready: true,
      state: 'stale_recovered',
      error_code: null,
      stale_pid: recovery.stale_pid,
      quarantine_path: recovery.quarantine_path,
      remedy: null
    };
  } catch (error) {
    if (error?.code === 'grid_is_running') {
      return {
        ready: false,
        state: 'live',
        error_code: error.code,
        stale_pid: null,
        quarantine_path: null,
        remedy: 'Stop the running Grid process before starting another stack.'
      };
    }
    throw error;
  }
}

export async function runDoctor({
  config = meshConfig(),
  verifySetup = verifyRepositorySetup,
  checkPort = checkPortAvailable,
  checkGridLock = checkGridRuntimeLock
} = {}) {
  const setup = await verifySetup();
  const gridRuntimeLock = await checkGridLock({ dataDir: config.dataDir });
  const ports = await Promise.all(SERVICES.map(async service => {
    // Gateway is the only externally bindable host; Hypervisor, Sandbox, and Grid
    // all listen on the internal host, so probe the address they will actually bind.
    const host = config.hosts[service] ?? config.hosts.internal;
    const port = config.ports[service];
    const result = await checkPort({ host, port, service });
    return {
      service,
      host,
      port,
      available: result.available === true,
      error_code: result.code ?? null
    };
  }));
  return {
    schema: 'axiom-doctor.v1',
    ready: (
      setup.valid === true
      && gridRuntimeLock.ready === true
      && ports.every(item => item.available)
    ),
    setup,
    grid_runtime_lock: gridRuntimeLock,
    ports,
    production_credentials_created: false
  };
}

export function formatDoctorResult(result, { json = false } = {}) {
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  const lock = result.grid_runtime_lock;
  const lockDescription = lock.state === 'stale_recovered'
    ? `stale lock recovered (PID ${lock.stale_pid}; quarantined at ${lock.quarantine_path})`
    : lock.state === 'live'
      ? `blocked (${lock.error_code}): ${lock.remedy}`
      : 'clear';
  const lines = [
    'AXIOM-MESH doctor',
    `Toolchain: ${result.setup.valid ? 'ready' : 'blocked'} (Node ${result.setup.runtime.node}, npm ${result.setup.runtime.npm})`,
    `Locks: verified (${result.setup.dependency_packages} dependency packages)`,
    `Grid runtime lock: ${lockDescription}`
  ];
  for (const item of result.ports) {
    lines.push(
      `${item.service}: ${item.host}:${item.port} ${item.available ? 'available' : `blocked (${item.error_code})`}`
    );
  }
  lines.push(result.ready
    ? 'Ready. Next: npm run dev'
    : 'Not ready. Resolve the blocked checks, then rerun: npm run doctor');
  return `${lines.join('\n')}\n`;
}

export function doctorFailureMessage(error) {
  const detail = error instanceof Error ? error.message : String(error);
  const nodeMatch = detail.match(/Node\.js ([0-9.]+) is outside/);
  if (nodeMatch) {
    return [
      `AXIOM-MESH requires Node.js >=22.23.2 <23 || >=24.14.0 <25 (you have ${nodeMatch[1]}).`,
      'Production supports pinned Node 22.23.2 and Node 24; all existing security controls remain mandatory.',
      'Recommended: nvm install 24.18.0 && nvm use 24.18.0'
    ].join('\n');
  }
  const npmMatch = detail.match(/npm ([0-9.]+) is outside ([0-9.]+) <= version < ([0-9.]+)/);
  if (npmMatch) {
    return [
      `AXIOM-MESH requires npm >=11.0.0 <12, or npm >=10.9.8 <11 with Node 22 (you have ${npmMatch[1]}).`,
      'Recommended after selecting Node 24.18.0: npm install --global npm@11'
    ].join('\n');
  }
  return `AXIOM-MESH doctor failed: ${detail}`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(argument => !['--json'].includes(argument))) {
    throw new Error('Usage: npm run doctor -- [--json]');
  }
  const result = await runDoctor();
  process.stdout.write(formatDoctorResult(result, { json: args.includes('--json') }));
  if (!result.ready) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${doctorFailureMessage(error)}\n`);
    process.exitCode = 1;
  }
}

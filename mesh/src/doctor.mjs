#!/usr/bin/env node

import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { meshConfig } from './lib/config.mjs';
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

export async function runDoctor({
  config = meshConfig(),
  verifySetup = verifyRepositorySetup,
  checkPort = checkPortAvailable
} = {}) {
  const setup = await verifySetup();
  const ports = await Promise.all(SERVICES.map(async service => {
    const host = config.hosts[service];
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
    ready: setup.valid === true && ports.every(item => item.available),
    setup,
    ports,
    production_credentials_created: false
  };
}

export function formatDoctorResult(result, { json = false } = {}) {
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  const lines = [
    'AXIOM-MESH doctor',
    `Toolchain: ${result.setup.valid ? 'ready' : 'blocked'} (Node ${result.setup.runtime.node}, npm ${result.setup.runtime.npm})`,
    `Locks: verified (${result.setup.dependency_packages} dependency packages)`
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
  const nodeMatch = detail.match(/Node\.js ([0-9.]+) is outside ([0-9.]+) <= version < ([0-9.]+)/);
  if (nodeMatch) {
    return [
      `AXIOM-MESH requires Node.js >=24.14.0 <25 (you have ${nodeMatch[1]}).`,
      'Recommended: nvm install 24.18.0 && nvm use 24.18.0'
    ].join('\n');
  }
  const npmMatch = detail.match(/npm ([0-9.]+) is outside ([0-9.]+) <= version < ([0-9.]+)/);
  if (npmMatch) {
    return [
      `AXIOM-MESH requires npm >=11.0.0 <12 (you have ${npmMatch[1]}).`,
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

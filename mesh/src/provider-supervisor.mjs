import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import {
  assertProviderStartupEnvironment,
  prepareProviderRuntime
} from './lib/provider-runtime.mjs';

export async function runProviderSupervisor({
  environment = process.env,
  spawnImpl = spawn,
  stdout = value => process.stdout.write(value),
  stderr = value => process.stderr.write(value)
} = {}) {
  let runtime;
  let child;
  const signalHandlers = new Map();
  let messageHandler;
  try {
    const configPath = assertProviderStartupEnvironment(environment);
    runtime = await prepareProviderRuntime(configPath, { environment });
    const childEnvironment = {
      ...environment,
      ...runtime.environment
    };
    stdout(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'provider-supervisor',
      event: 'provider.runtime.prepared',
      deployment_id: runtime.receipt.deployment_id,
      session_id: runtime.session_id,
      config_digest: runtime.receipt.config_digest,
      providers: Object.fromEntries(
        Object.entries(runtime.receipt.providers).map(([providerClass, provider]) => [
          providerClass,
          {
            provider_id: provider.provider_id,
            response_digest: provider.response_digest,
            signing_key_digest: provider.signing_key_digest
          }
        ])
      ),
      resources: runtime.receipt.resources.map(resource => ({
        alias: resource.alias,
        version: resource.version,
        bytes: resource.bytes,
        sha256: resource.sha256
      }))
    })}\n`);
    if (process.connected && typeof process.send === 'function') {
      try {
        process.send({
          type: 'axiom.provider.prepared',
          receipt: runtime.receipt
        });
      } catch {
        // Provider startup does not depend on an optional observation channel.
      }
    }
    child = spawnImpl(process.execPath, ['src/supervisor.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: childEnvironment,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      windowsHide: true
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handler = () => {
        if (
          child.exitCode === null
          && child.signalCode === null
        ) {
          child.kill(signal);
        }
      };
      signalHandlers.set(signal, handler);
      process.once(signal, handler);
    }
    messageHandler = message => {
      if (
        message?.type === 'axiom.supervisor.stop'
        && child.connected
      ) {
        child.send(message);
      }
    };
    if (process.connected) process.on('message', messageHandler);
    child.on('message', message => {
      if (process.connected && typeof process.send === 'function') {
        try {
          process.send(message);
        } catch {
          // Readiness forwarding is optional for external process managers.
        }
      }
    });
    const [code, signal] = await once(child, 'exit');
    if (signal) return 1;
    return Number.isInteger(code) ? code : 1;
  } catch (error) {
    stderr(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'provider-supervisor',
      event: 'provider.startup.failed',
      error: {
        code: safeErrorCode(error)
      }
    })}\n`);
    if (
      child
      && child.exitCode === null
      && child.signalCode === null
    ) {
      child.kill('SIGTERM');
      await once(child, 'exit').catch(() => {});
    }
    return 1;
  } finally {
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
    if (messageHandler) process.removeListener('message', messageHandler);
    await runtime?.cleanup();
  }
}

function safeErrorCode(error) {
  if (
    typeof error?.code === 'string'
    && /^[a-z0-9_]{1,80}$/.test(error.code)
  ) return error.code;
  return 'provider_startup_failed';
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runProviderSupervisor();
}

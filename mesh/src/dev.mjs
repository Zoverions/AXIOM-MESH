import { pathToFileURL } from 'node:url';
import { bootstrap } from './bootstrap.mjs';
import { meshConfig } from './lib/config.mjs';
import { createGridService } from './grid/server.mjs';
import { createSandboxService } from './sandbox/server.mjs';
import { createHypervisorService } from './hypervisor/server.mjs';
import { createGatewayService } from './gateway/server.mjs';

export async function startDevelopmentStack(overrides = {}) {
  const config = meshConfig(overrides);
  const credentials = await bootstrap(config);
  const services = [
    await createGridService(config),
    await createSandboxService(config),
    await createHypervisorService(config),
    await createGatewayService(config)
  ];
  const addresses = {};
  try {
    for (const service of services) addresses[service.name] = await service.start();
  } catch (error) {
    for (const service of services.reverse()) await service.stop().catch(() => {});
    throw error;
  }
  return {
    config,
    credentials,
    services,
    addresses,
    async stop() {
      for (const service of [...services].reverse()) await service.stop();
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stack = await startDevelopmentStack();
  process.stdout.write(`${JSON.stringify({
    status: 'ready',
    gateway: `http://${stack.config.hosts.gateway}:${stack.config.ports.gateway}`,
    token_path: stack.credentials.token_path
  }, null, 2)}\n`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      await stack.stop();
      process.exit(0);
    });
  }
}

import { pathToFileURL } from 'node:url';
import { createGatewayService } from './gateway/server.mjs';
import { meshConfig } from './lib/config.mjs';
import { startLocalIngressBridge } from './local-ingress.mjs';

export async function runGatewayUnit({
  config = meshConfig(),
  createService = createGatewayService,
  startIngress = startLocalIngressBridge
} = {}) {
  const service = await createService(config);
  let bridge;
  let stopping = false;
  let resolveStop;
  const stopped = new Promise(resolve => {
    resolveStop = resolve;
  });
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    resolveStop();
  };
  const signals = ['SIGINT', 'SIGTERM'];
  const messageHandler = message => {
    if (message?.type === 'axiom.service.stop') shutdown();
  };
  for (const signal of signals) process.once(signal, shutdown);
  if (process.connected) process.on('message', messageHandler);
  try {
    const address = await service.start();
    if (config.gatewaySocket) {
      bridge = await startIngress({
        socketPath: config.gatewaySocket,
        targetHost: '127.0.0.1',
        targetPort: config.ports.gateway
      });
    }
    process.stdout.write(`${JSON.stringify({
      service: 'gateway',
      status: 'listening',
      address,
      local_ingress: Boolean(bridge)
    })}\n`);
    await stopped;
    return 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'gateway',
      event: 'unit.failed',
      error: {
        name: error?.name ?? 'Error',
        code: error?.code
      }
    })}\n`);
    return 1;
  } finally {
    for (const signal of signals) process.removeListener(signal, shutdown);
    process.removeListener('message', messageHandler);
    await bridge?.close();
    await service.stop();
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runGatewayUnit();
}
